const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('../benmi-worker-official/node_modules/typescript');

if (!require.extensions['.ts']) {
  require.extensions['.ts'] = (module, file) => {
    const source = fs.readFileSync(file, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true
      }
    }).outputText;
    return module._compile(compiled, file);
  };
}

const MenuSchedule = require('../js/menu-schedule.js');
const MenuEditorModel = require('../js/orders-menu-model.js');
const { validateCatalogScheduleForItems, loadTenantOperatingShifts } = require('../benmi-worker-official/src/modules/operating-shifts.ts');
const { loadOptionCatalog } = require('../benmi-worker-official/src/modules/option-groups.ts');
const { getTenantBootstrap } = require('../benmi-worker-official/src/modules/bootstrap.ts');
const { updateMenuSchedule } = require('../benmi-worker-official/src/modules/menu-schedule-settings.ts');
const { menuShifts } = require('../benmi-worker-official/src/modules/menu-shifts.ts');
const { getConfig, updateConfig } = require('../benmi-worker-official/src/modules/config.ts');
const { syncMenuToD1, updateMenu } = (() => {
  const mod = require('../benmi-worker-official/src/modules/menu.ts');
  return mod;
})();
const { createOrder } = require('../benmi-worker-official/src/modules/orders.ts');
const { writeDetailedOrder } = require('../benmi-worker-official/src/modules/order-detail-write.ts');

let cachedMigrationSqls = null;
function createFullMigratedDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  if (!cachedMigrationSqls) {
    const migDir = path.resolve(__dirname, '../benmi-worker-official/migrations');
    cachedMigrationSqls = fs.readdirSync(migDir)
      .filter(f => f.endsWith('.sql'))
      .sort()
      .map(f => fs.readFileSync(path.join(migDir, f), 'utf8'));
  }
  for (const sql of cachedMigrationSqls) {
    db.exec(sql);
  }
  return db;
}

function createEnvForDb(db) {
  const kvStore = new Map();
  const makeStmt = (sql, boundArgs = []) => ({
    sql,
    args: boundArgs,
    bind(...values) {
      return makeStmt(sql, values);
    },
    async first() {
      return db.prepare(sql).get(...boundArgs) || null;
    },
    async all() {
      return { success: true, results: db.prepare(sql).all(...boundArgs) };
    },
    async run() {
      const info = db.prepare(sql).run(...boundArgs);
      return { success: true, meta: { changes: info?.changes ?? 0 } };
    }
  });

  return {
    DB: {
      prepare(sql) {
        return makeStmt(sql, []);
      },
      async batch(statements) {
        db.exec('BEGIN');
        try {
          const results = statements.map(stmt => {
            const prepared = db.prepare(stmt.sql);
            const args = Array.isArray(stmt.args) ? stmt.args : [];
            if (/^\s*SELECT/i.test(stmt.sql)) {
              return { success: true, results: prepared.all(...args) };
            }
            const info = prepared.run(...args);
            return { success: true, results: [], meta: { changes: info?.changes ?? 0 } };
          });
          db.exec('COMMIT');
          return results;
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      }
    },
    ORDER_STATE: {
      async get(key, opts) {
        const val = kvStore.get(key) ?? null;
        if (val && opts && opts.type === 'json') return JSON.parse(val);
        return val;
      },
      async put(key, val) {
        kvStore.set(key, typeof val === 'string' ? val : JSON.stringify(val));
      },
      async delete(key) {
        kvStore.delete(key);
      }
    }
  };
}

function seedZhenbaochufang(db) {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../benmi-worker-official/seeds/tenants/zhenbaochufang.sql'),
    'utf8'
  );
  db.exec(sql);
  const hours = { '0': [], '6': [] };
  for (let d = 1; d <= 5; d++) hours[d] = [{ start: '09:00', end: '23:00' }];
  db.prepare('UPDATE tenant_config SET operating_hours=? WHERE tenant_id=?').run(JSON.stringify(hours), 'zhenbaochufang');
}

test('MenuSchedule evaluates shifts, overnight windows, menu_window, inclusiveEnd, and 3-tier inheritance', () => {
  const shifts = [
    {
      id: 'shift_lunch',
      name: '午餐',
      i18n: { vi: { name: 'Ca trưa' } },
      shiftType: 'operating',
      sortOrder: 1,
      isActive: true,
      windows: [1, 2, 3, 4, 5].map(d => ({ dayOfWeek: d, startTime: '11:00', endTime: '13:30' }))
    },
    {
      id: 'shift_dinner',
      name: '晚餐',
      i18n: { vi: { name: 'Ca tối' } },
      shiftType: 'operating',
      sortOrder: 2,
      isActive: true,
      windows: [1, 2, 3, 4, 5].map(d => ({ dayOfWeek: d, startTime: '16:30', endTime: '19:00' }))
    },
    {
      id: 'shift_late',
      name: '宵夜',
      shiftType: 'operating',
      sortOrder: 3,
      isActive: true,
      windows: [1, 2, 3, 4].map(d => ({ dayOfWeek: d, startTime: '21:00', endTime: '22:30' }))
    },
    {
      id: 'shift_happy_hour',
      name: 'Happy Hour',
      shiftType: 'menu_window',
      sortOrder: 4,
      isActive: true,
      windows: [{ dayOfWeek: 5, startTime: '18:30', endTime: '21:30' }] // extends past Friday 19:00 close
    },
    {
      id: 'shift_overnight',
      name: '深夜食堂',
      shiftType: 'operating',
      sortOrder: 5,
      isActive: false,
      windows: [{ dayOfWeek: 6, startTime: '22:00', endTime: '02:00' }]
    }
  ];

  const hours = MenuSchedule.projectOperatingHoursMap(shifts);

  // Store open/closed across Mon-Sun
  assert.equal(MenuSchedule.isStoreOpenAt(shifts, hours, '2026-11-16 12:00'), true);  // Mon lunch
  assert.equal(MenuSchedule.isStoreOpenAt(shifts, hours, '2026-11-16 15:00'), false); // Mon afternoon break
  assert.equal(MenuSchedule.isStoreOpenAt(shifts, hours, '2026-11-20 21:30'), false); // Fri late closed
  assert.equal(MenuSchedule.isStoreOpenAt(shifts, hours, '2026-11-21 12:00'), false); // Sat closed

  // Boundary inclusiveEnd check (19:00 slot vs 19:00 live ASAP)
  assert.equal(MenuSchedule.isStoreOpenAt(shifts, hours, '2026-11-16 19:00', { inclusiveEnd: false }), false);
  assert.equal(MenuSchedule.isStoreOpenAt(shifts, hours, '2026-11-16 19:00', { inclusiveEnd: true }), true);

  // Category D: selected dinner + late, hidden when unavailable
  const catD = {
    availabilityMode: 'selected_shifts',
    hideWhenUnavailable: true,
    shiftIds: ['shift_dinner', 'shift_late']
  };
  const lunchEval = MenuSchedule.resolveCategoryAvailability(catD, shifts, hours, '2026-11-16 12:00', { locale: 'zh-TW' });
  assert.equal(lunchEval.available, false);
  assert.equal(lunchEval.hidden, true);

  const dinnerEval = MenuSchedule.resolveCategoryAvailability(catD, shifts, hours, '2026-11-16 17:30', { locale: 'zh-TW' });
  assert.equal(dinnerEval.available, true);
  assert.equal(dinnerEval.hidden, false);
  assert.deepEqual(dinnerEval.activeShiftIds, ['shift_dinner']);

  const thuLateEval = MenuSchedule.resolveCategoryAvailability(catD, shifts, hours, '2026-11-19 21:30', { locale: 'vi' });
  assert.equal(thuLateEval.available, true);
  assert.equal(thuLateEval.activeShiftNames[0], '宵夜');

  const friLateEval = MenuSchedule.resolveCategoryAvailability(catD, shifts, hours, '2026-11-20 21:30');
  assert.equal(friLateEval.available, false);
  assert.equal(friLateEval.hidden, true);

  // menu_window intersection with store operating hours (Fri 20:00 is inside menu_window 18:30-21:30, but Fri store closes at 19:00)
  const hhCat = { availabilityMode: 'selected_shifts', hideWhenUnavailable: false, shiftIds: ['shift_happy_hour'] };
  assert.equal(MenuSchedule.resolveCategoryAvailability(hhCat, shifts, hours, '2026-11-20 18:45').available, true);
  assert.equal(MenuSchedule.resolveCategoryAvailability(hhCat, shifts, hours, '2026-11-20 20:00').available, false);

  // 3-tier item override: 'all_shifts' item inside 'selected_shifts' category
  const alwaysAvailableItem = { availabilityMode: 'all_shifts' };
  assert.equal(MenuSchedule.resolveItemAvailability(catD, alwaysAvailableItem, shifts, hours, '2026-11-16 12:00').available, true);

  // Overnight shift crossing midnight
  const nightShifts = shifts.map(s => s.id === 'shift_overnight' ? { ...s, isActive: true } : s);
  const nightHours = MenuSchedule.projectOperatingHoursMap(nightShifts);
  assert.equal(MenuSchedule.isStoreOpenAt(nightShifts, nightHours, '2026-11-21 23:15'), true); // Sat night
  assert.equal(MenuSchedule.isStoreOpenAt(nightShifts, nightHours, '2026-11-22 01:30'), true); // Sun 01:30 AM from Sat shift
});

test('Full SQLite migrations + zhenbaochufang seed + bootstrap + config shifts + menu preserve + order validation', async () => {
  const db = createFullMigratedDb();
  seedZhenbaochufang(db);
  const env = createEnvForDb(db);

  // 1. Verify exact seeded schema counts & optional modifier flags
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM tenant_operating_shifts WHERE tenant_id='zhenbaochufang'").get().c, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM tenant_operating_hours WHERE tenant_id='zhenbaochufang'").get().c, 14);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM menu_categories WHERE tenant_id='zhenbaochufang'").get().c, 6);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM menu_items WHERE tenant_id='zhenbaochufang'").get().c, 34);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM modifier_groups WHERE tenant_id='zhenbaochufang' AND is_required = 0 AND min_selection = 0").get().c, 6);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM menu_category_shifts WHERE tenant_id='zhenbaochufang' AND category_id='cat_zb_fried_rice'").get().c, 2);

  // 2. Verify bootstrap exposes operatingShifts and Category D schedule metadata
  const bsRes = await getTenantBootstrap(new Request('https://example.test/api/tenant/bootstrap?tenant_id=zhenbaochufang'), env);
  assert.equal(bsRes.status, 200);
  const bsData = await bsRes.json();
  assert.equal(bsData.bootstrapVersion, 8);
  assert.equal(bsData.tenant.operatingShifts.length, 3);
  const friedRiceCat = bsData.catalog.find(c => c.id === 'cat_zb_fried_rice');
  assert.ok(friedRiceCat, 'Category D present in catalog');
  assert.equal(friedRiceCat.availabilityMode, 'selected_shifts');
  assert.equal(friedRiceCat.hideWhenUnavailable, true);
  assert.deepEqual(friedRiceCat.shiftIds.sort(), ['shift_zb_dinner', 'shift_zb_late']);

  // 3. Saving shifts keeps IDs intact without changing customer hours.
  const cfgGetRes = await getConfig(new Request('https://example.test/api/config?tenant_id=zhenbaochufang'), env);
  const cfgData = await cfgGetRes.json();
  assert.equal(cfgData.operatingShifts.length, 3);
  const dinnerShift = cfgData.operatingShifts.find(s => s.id === 'shift_zb_dinner');
  dinnerShift.windows.forEach(w => { w.endTime = '19:30'; });
  const cfgUpdateRes = await updateConfig(new Request('https://example.test/api/config?tenant_id=zhenbaochufang', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operatingShifts: cfgData.operatingShifts })
  }), env);
  assert.equal(cfgUpdateRes.status, 200);
  const cfgAfter = await cfgUpdateRes.json();
  assert.equal(cfgAfter.operatingHours, undefined);
  assert.equal(cfgAfter.operatingShifts.find(s => s.id === dinnerShift.id).windows[0].endTime, '19:30');
  assert.deepEqual((await (await getConfig(new Request('https://example.test/api/config?tenant_id=zhenbaochufang'), env)).json()).operatingHours, cfgData.operatingHours);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM menu_category_shifts WHERE tenant_id='zhenbaochufang' AND shift_id='shift_zb_dinner'").get().c,
    1,
    'Category D junction link preserved after updating shift times'
  );
  // Restore Dinner end time back to 19:00 for rest of tests
  dinnerShift.windows.forEach(w => { w.endTime = '19:00'; });
  await updateConfig(new Request('https://example.test/api/config?tenant_id=zhenbaochufang', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operatingShifts: cfgData.operatingShifts })
  }), env);

  // 4. Verify POS MenuEditorModel + syncMenuToD1 preserves schedule fields on save
  const draftCats = bsData.catalog.map((c, idx) => ({
    id: c.slug,
    databaseId: c.id,
    catId: c.id,
    title: c.name,
    shortName: c.shortName,
    type: 'catalog',
    allowCustomization: c.allowCustomization,
    appliedModifiers: c.appliedModifiers,
    availabilityMode: c.availabilityMode,
    hideWhenUnavailable: c.hideWhenUnavailable,
    shiftIds: c.shiftIds,
    sortOrder: idx + 1,
    items: c.items.map(it => ({
      id: it.id,
      name: it.name,
      price: it.price,
      sortOrder: it.sortOrder,
      itemType: it.itemType || 'standard',
      availabilityMode: it.availabilityMode || 'inherit',
      shiftIds: it.shiftIds || [],
      modifierGroups: it.modifierGroups || []
    }))
  }));
  const serialized = MenuEditorModel.serializeMenuData(draftCats, {
    getTenantId: () => 'zhenbaochufang',
    createUuid: () => 'test-uuid',
    getDuplicateItemMessage: () => 'duplicate'
  });
  const menuSaveRes = await updateMenu(new Request('https://example.test/api/menu?tenant_id=zhenbaochufang', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serialized)
  }), env);
  assert.equal(menuSaveRes.status, 200);
  const catDAfterSync = db.prepare("SELECT availability_mode, hide_when_unavailable FROM menu_categories WHERE id='cat_zb_fried_rice'").get();
  assert.equal(catDAfterSync.availability_mode, 'selected_shifts');
  assert.equal(catDAfterSync.hide_when_unavailable, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM menu_category_shifts WHERE category_id='cat_zb_fried_rice'").get().c, 2);

  // 4b. Verify per-item shift link, uncheck all shifts, and revert back to 'inherit'
  const testItemDraft = draftCats.find(c => c.databaseId === 'cat_zb_fried_rice').items.find(it => it.id === 'zb_d_01');
  testItemDraft.availabilityMode = 'selected_shifts';
  testItemDraft.shiftIds = ['shift_zb_lunch'];
  await updateMenu(new Request('https://example.test/api/menu?tenant_id=zhenbaochufang', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(MenuEditorModel.serializeMenuData(draftCats, {
      getTenantId: () => 'zhenbaochufang',
      createUuid: () => 'test-uuid',
      getDuplicateItemMessage: () => 'duplicate'
    }))
  }), env);
  assert.equal(db.prepare("SELECT availability_mode FROM menu_items WHERE id='zb_d_01'").get().availability_mode, 'selected_shifts');
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM menu_item_shifts WHERE item_id='zb_d_01'").get().c, 1);

  // Uncheck the item's shift -> must delete row in menu_item_shifts
  testItemDraft.shiftIds = [];
  await updateMenu(new Request('https://example.test/api/menu?tenant_id=zhenbaochufang', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(MenuEditorModel.serializeMenuData(draftCats, {
      getTenantId: () => 'zhenbaochufang',
      createUuid: () => 'test-uuid',
      getDuplicateItemMessage: () => 'duplicate'
    }))
  }), env);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM menu_item_shifts WHERE item_id='zb_d_01'").get().c, 0);

  // Revert item back to inherit -> must update availability_mode back to 'inherit'
  testItemDraft.availabilityMode = 'inherit';
  await updateMenu(new Request('https://example.test/api/menu?tenant_id=zhenbaochufang', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(MenuEditorModel.serializeMenuData(draftCats, {
      getTenantId: () => 'zhenbaochufang',
      createUuid: () => 'test-uuid',
      getDuplicateItemMessage: () => 'duplicate'
    }))
  }), env);
  assert.equal(db.prepare("SELECT availability_mode FROM menu_items WHERE id='zb_d_01'").get().availability_mode, 'inherit');

  // 5. Verify direct backend validation rejects Category D at Lunch & Fri Late, accepts at Dinner & Mon-Thu Late
  const optionCatalog = await loadOptionCatalog(env, 'zhenbaochufang');
  const lunchInvalid = validateCatalogScheduleForItems(
    optionCatalog,
    [{ itemId: 'zb_d_01', category: 'fried-rice', itemName: '肉絲蛋炒飯 230g' }],
    '2026-11-16 12:00'
  );
  assert.equal(lunchInvalid.valid, false);
  assert.deepEqual(lunchInvalid.unavailableItemNames, ['肉絲蛋炒飯 230g']);

  const friLateInvalid = validateCatalogScheduleForItems(
    optionCatalog,
    [{ itemId: 'zb_d_01', category: 'fried-rice', itemName: '肉絲蛋炒飯 230g' }],
    '2026-11-20 21:30'
  );
  assert.equal(friLateInvalid.valid, false);

  const dinnerValid = validateCatalogScheduleForItems(
    optionCatalog,
    [{ itemId: 'zb_d_01', category: 'fried-rice', itemName: '肉絲蛋炒飯 230g' }],
    '2026-11-16 19:00'
  );
  assert.equal(dinnerValid.valid, true);

  // 6. Verify legacy createOrder rejects Category D at Mon 12:00 Lunch and accepts Mon 17:30 Dinner
  const blockedOrderRes = await createOrder(new Request('https://example.test/api/create?tenant_id=zhenbaochufang', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lineUserId: 'U_test_user',
      customerName: 'Test Guest',
      orderType: 'takeaway',
      pickupTime: '2026-11-16 12:00',
      totalPrice: 75,
      items: [{
        itemId: 'zb_d_01',
        category: 'fried-rice',
        itemName: '肉絲蛋炒飯 230g',
        quantity: 1,
        price: 75,
        subtotal: 75,
        bundleSelections: { portions: [{ groups: [{ groupId: 'mg_zb_addon_items', items: [] }] }] }
      }]
    })
  }), env);
  assert.equal(blockedOrderRes.status, 400);
  const blockedBody = await blockedOrderRes.json();
  assert.equal(blockedBody.code, 'ITEM_OUTSIDE_AVAILABILITY_WINDOW');

  const allowedOrderRes = await createOrder(new Request('https://example.test/api/create?tenant_id=zhenbaochufang', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'U_test_user',
      customer: 'Test Guest',
      dining_option: 'takeaway',
      time: '2026-11-16 17:30',
      total: 75,
      items: [{
        itemId: 'zb_d_01',
        category: 'fried-rice',
        itemName: '肉絲蛋炒飯 230g',
        quantity: 1,
        price: 75,
        subtotal: 75,
        bundleSelections: { portions: [{ groups: [{ groupId: 'mg_zb_addon_items', items: [] }] }] }
      }]
    })
  }), env);
  assert.equal(allowedOrderRes.status, 200);
  const allowedOrderBody = await allowedOrderRes.json();
  const createdOrderKey = allowedOrderBody.key;

  // 7. Verify writeDetailedOrder (v1) accepts Dinner create and modify rejects adding Category D when order pickup_time is 12:00 Lunch
  const detailEnv = { ...env, ORDER_DETAIL_WRITES: 'true' };
  const detailCreateRes = await writeDetailedOrder(
    detailEnv,
    'zhenbaochufang',
    {
      detailVersion: 1,
      operationId: 'op_schedule_create_test_0001',
      customer: 'Detail Guest',
      userId: 'U_detail_user',
      dining_option: 'takeaway',
      time: '2026-11-16 17:30',
      total: 75,
      orderSelections: [],
      items: [{
        itemId: 'zb_d_01',
        quantity: 1,
        bundleSelections: { portions: [{ groups: [{ groupId: 'mg_zb_addon_items', items: [] }] }] }
      }]
    },
    'create'
  );
  assert.equal(detailCreateRes.status, 200);
  const detailCreateBody = await detailCreateRes.json();
  const detailKey = detailCreateBody.key;

  db.prepare("UPDATE orders SET status = 'WAITING_CUSTOMER_CHANGE', pickup_time = ? WHERE key = ?").run('2026-11-16 12:00', detailKey);
  const modifyRes = await writeDetailedOrder(
    detailEnv,
    'zhenbaochufang',
    {
      detailVersion: 1,
      operationId: 'op_schedule_modify_test_0001',
      order_key: detailKey,
      expectedDetailRevision: 1,
      targetRound: 1,
      orderSelections: [],
      items: [{
        itemId: 'zb_d_02',
        quantity: 1,
        bundleSelections: { portions: [{ groups: [{ groupId: 'mg_zb_addon_items', items: [] }] }] }
      }]
    },
    'modify'
  );
  assert.equal(modifyRes.status, 400);
  const modifyBody = await modifyRes.json();
  assert.equal(modifyBody.code, 'PRODUCT_UNAVAILABLE');

  // Loaded shifts helper sanity check
  const persistedShifts = await loadTenantOperatingShifts(env.DB, 'zhenbaochufang');
  assert.equal(persistedShifts.length, 3);
  assert.equal(bsData.tenant.features.includes('menu_schedule'), true);
  db.close();
});

test('Feature package menu_schedule strictly isolates non-subscribed tenants across config, bootstrap, menu, and orders', async () => {
  const db = createFullMigratedDb();
  const env = createEnvForDb(db);
  db.exec(`
    INSERT INTO tenants (id, name) VALUES ('standard_store', 'Standard Store');
    INSERT INTO tenant_config (tenant_id, brand_name, features, operating_hours)
      VALUES ('standard_store', 'Standard Store', '[]', '{"1":[{"start":"09:00","end":"21:00"}]}');
    INSERT INTO tenant_operating_shifts (id, tenant_id, name, shift_type, sort_order, is_active)
      VALUES ('shift_std_dinner', 'standard_store', 'Dinner', 'operating', 1, 1);
    INSERT INTO tenant_operating_hours (id, tenant_id, shift_id, day_of_week, start_time, end_time, is_active)
      VALUES ('oh_std_1', 'standard_store', 'shift_std_dinner', 1, '17:00', '20:00', 1);
    INSERT INTO menu_categories (id, tenant_id, name, slug, category_type, sort_order, availability_mode, hide_when_unavailable)
      VALUES ('cat_std_main', 'standard_store', 'Main', 'main', 'catalog', 1, 'selected_shifts', 1);
    INSERT INTO menu_category_shifts (tenant_id, category_id, shift_id)
      VALUES ('standard_store', 'cat_std_main', 'shift_std_dinner');
    INSERT INTO menu_items (id, tenant_id, category_id, name, price, sort_order, item_type, availability_mode)
      VALUES ('std_item_1', 'standard_store', 'cat_std_main', 'Bento', 100, 1, 'standard', 'inherit');
  `);

  // 1. /api/config hides shifts and rejects shift mutations with 403 FEATURE_LOCKED
  const cfgRes = await getConfig(new Request('https://example.test/api/config?tenant_id=standard_store'), env);
  assert.equal(cfgRes.status, 200);
  const cfgData = await cfgRes.json();
  assert.deepEqual(cfgData.operatingShifts, []);
  assert.equal(cfgData.operatingHours['1'][0].start, '09:00');

  const lockedRes = await updateConfig(new Request('https://example.test/api/config?tenant_id=standard_store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operatingShifts: [{ id: 's1', name: 'Dinner', windows: [] }] })
  }), env);
  assert.equal(lockedRes.status, 403);
  const lockedBody = await lockedRes.json();
  assert.equal(lockedBody.feature, 'menu_schedule');

  // Legacy operatingHours save continues to work cleanly for standard tenants
  const legacyHoursRes = await updateConfig(new Request('https://example.test/api/config?tenant_id=standard_store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operatingHours: { '1': [{ start: '10:00', end: '20:00' }] } })
  }), env);
  assert.equal(legacyHoursRes.status, 200);

  // 2. /api/tenant/bootstrap strips shifts and resets availabilityMode to all_shifts
  const bsRes = await getTenantBootstrap(new Request('https://example.test/api/tenant/bootstrap?tenant_id=standard_store&nocache=1'), env);
  assert.equal(bsRes.status, 200);
  const bsData = await bsRes.json();
  assert.deepEqual(bsData.tenant.operatingShifts, []);
  assert.equal(bsData.catalog[0].availabilityMode, 'all_shifts');
  assert.equal(bsData.catalog[0].hideWhenUnavailable, false);
  assert.deepEqual(bsData.catalog[0].shiftIds, []);

  // 3. createOrder does not enforce shift restrictions when menu_schedule package is absent
  const orderRes = await createOrder(new Request('https://example.test/api/create?tenant_id=standard_store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'U_std',
      customer: 'Standard Customer',
      dining_option: 'takeaway',
      time: '2026-11-16 12:00',
      total: 100,
      items: [{
        itemId: 'std_item_1',
        category: 'main',
        itemName: 'Bento',
        quantity: 1,
        price: 100,
        subtotal: 100
      }]
    })
  }), env);
  assert.equal(orderRes.status, 200);
  db.close();
});

function schedulePatchFixture(t) {
  const db = createFullMigratedDb(); seedZhenbaochufang(db); t.after(() => db.close());
  const env = createEnvForDb(db), tenantId = 'zhenbaochufang';
  const cat = db.prepare("SELECT * FROM menu_categories WHERE tenant_id=? AND category_type='catalog' ORDER BY id LIMIT 1").get(tenantId);
  const item = db.prepare('SELECT * FROM menu_items WHERE tenant_id=? AND category_id=? LIMIT 1').get(tenantId, cat.id);
  const shiftIds = db.prepare('SELECT id FROM tenant_operating_shifts WHERE tenant_id=? ORDER BY id').all(tenantId).map(row => row.id);
  const categoryState = () => {
    const row = db.prepare('SELECT * FROM menu_categories WHERE id=?').get(cat.id);
    return { availabilityMode: row.availability_mode, shiftIds: db.prepare('SELECT shift_id FROM menu_category_shifts WHERE category_id=? ORDER BY shift_id').all(cat.id).map(r => r.shift_id), hideWhenUnavailable: Boolean(row.hide_when_unavailable) };
  };
  const itemState = () => {
    const row = db.prepare('SELECT * FROM menu_items WHERE id=?').get(item.id);
    return { availabilityMode: row.availability_mode, shiftIds: db.prepare('SELECT shift_id FROM menu_item_shifts WHERE item_id=? ORDER BY shift_id').all(item.id).map(r => r.shift_id) };
  };
  const save = (body, tenant = tenantId) => updateMenuSchedule(new Request(`https://test/api/menu/schedule?tenant_id=${tenant}`, { method: 'PATCH', body: JSON.stringify(body) }), env);
  return { db, env, cat, item, shiftIds, categoryState, itemState, save };
}

test('narrow schedule PATCH preserves menu columns, row identities and modifiers, including a zero-shift item', async t => {
  const f = schedulePatchFixture(t);
  const before = f.db.prepare('SELECT rowid,* FROM menu_items WHERE id=?').get(f.item.id);
  const modifiers = JSON.stringify(f.db.prepare('SELECT * FROM modifier_options ORDER BY id').all());
  await getTenantBootstrap(new Request('https://test/api/tenant/bootstrap?tenant_id=zhenbaochufang'), f.env);
  const response = await f.save({ categories: [{ id: f.cat.id, availabilityMode: 'selected_shifts', shiftIds: [f.shiftIds[0]], hideWhenUnavailable: true, previous: f.categoryState() }], items: [{ id: f.item.id, categoryId: f.cat.id, availabilityMode: 'selected_shifts', shiftIds: [], previous: f.itemState() }] });
  assert.equal(response.status, 200, await response.text());
  const after = f.db.prepare('SELECT rowid,* FROM menu_items WHERE id=?').get(f.item.id);
  const { availability_mode: oldMode, menu_revision: oldRevision, ...oldFields } = before;
  const { availability_mode: newMode, menu_revision: newRevision, ...newFields } = after;
  assert.deepEqual(newFields, oldFields);
  assert.equal(after.availability_mode, 'selected_shifts');
  assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM modifier_options ORDER BY id').all()), modifiers);
  assert.deepEqual(f.itemState().shiftIds, []);
  assert.equal(await f.env.ORDER_STATE.get('tenant:zhenbaochufang:bootstrap:v2'), null);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM menu_write_guards').get().n, 0);
});

test('schedule PATCH rejects stale drafts and cross-tenant IDs before writing', async t => {
  const f = schedulePatchFixture(t);
  const patch = { categories: [{ id: f.cat.id, availabilityMode: 'selected_shifts', shiftIds: [], hideWhenUnavailable: true, previous: f.categoryState() }], items: [] };
  assert.equal((await f.save(patch)).status, 200);
  assert.equal((await f.save(patch)).status, 409);
  const state = f.categoryState();
  assert.equal((await f.save({ categories: [{ ...patch.categories[0], id: 'foreign-category', previous: state }], items: [] })).status, 404);
  assert.equal((await f.save({ categories: [{ ...patch.categories[0], previous: state, shiftIds: ['foreign-shift'] }], items: [] })).status, 400);
  assert.equal((await f.save({ categories: [], items: [{ id: f.item.id, categoryId: 'foreign-category', availabilityMode: 'inherit', shiftIds: [], previous: f.itemState() }] })).status, 404);
  assert.equal((await f.save({ categories: [], items: [{ id: f.item.id, categoryId: f.cat.id, price: 1, availabilityMode: 'inherit', shiftIds: [], previous: f.itemState() }] })).status, 400);
  assert.deepEqual(f.categoryState(), state);
  assert.equal((await f.save({ categories: [], items: [] }, 'no-menu-schedule-package')).status, 403);
});

test('schedule PATCH catalog guard rolls back all schedule writes after an interleaved edit', async t => {
  const f = schedulePatchFixture(t), previous = f.categoryState(), batch = f.env.DB.batch;
  f.env.DB.batch = async statements => {
    if (statements.some(s => s.sql.includes('INSERT INTO menu_write_guards'))) {
      f.db.prepare('UPDATE menu_items SET price=price+1 WHERE id=?').run(f.item.id);
    }
    return batch(statements);
  };
  const response = await f.save({ categories: [{ id: f.cat.id, availabilityMode: 'selected_shifts', shiftIds: [], hideWhenUnavailable: true, previous }], items: [] });
  assert.equal(response.status, 409, await response.text());
  assert.deepEqual(f.categoryState(), previous);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM menu_write_guards').get().n, 0);
});


test('store hours and menu shifts remain independent through writes, persistence and cached bootstrap', async () => {
  const db = createFullMigratedDb();
  seedZhenbaochufang(db);
  const env = createEnvForDb(db), url = 'https://example.test/api/config?tenant_id=zhenbaochufang';
  const bootstrap = async () => (await getTenantBootstrap(new Request(url.replace('/api/config', '/api/tenant/bootstrap')), env)).json();
  const save = body => updateConfig(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);
  const readHours = () => db.prepare('SELECT operating_hours FROM tenant_config WHERE tenant_id=?').get('zhenbaochufang').operating_hours;
  const before = await bootstrap(), originalHours = readHours();
  const shifts = await loadTenantOperatingShifts(env.DB, 'zhenbaochufang');
  shifts[0].windows.forEach(w => { w.startTime = '14:00'; w.endTime = '15:00'; });
  assert.equal((await save({ operatingShifts: shifts })).status, 200);
  assert.equal(readHours(), originalHours);
  const afterShifts = await bootstrap();
  assert.deepEqual(afterShifts.tenant.parsedHours, before.tenant.parsedHours);
  assert.equal(afterShifts.tenant.formattedHours, before.tenant.formattedHours);
  assert.equal(afterShifts.tenant.operatingShifts[0].windows[0].startTime, '14:00');
  assert.equal(MenuSchedule.isStoreOpenAt(shifts, afterShifts.tenant.parsedHours, '2026-11-16 10:00'), true);
  assert.equal(MenuSchedule.isStoreOpenAt(shifts, { '1': [] }, '2026-11-16 14:30'), false);
  assert.equal(MenuSchedule.isStoreOpenAt(shifts, null, '2026-11-16 14:30'), false);

  const linksBefore = db.prepare('SELECT * FROM menu_category_shifts ORDER BY category_id, shift_id').all();
  const shiftsBefore = await loadTenantOperatingShifts(env.DB, 'zhenbaochufang');
  const invalidHours = { '1': [{ start: '08:00', end: '10:30' }] };
  assert.equal((await save({ operatingHours: invalidHours })).status, 409);
  const nextHours = JSON.parse(originalHours);
  nextHours['1'][0].start = '08:00';
  assert.equal((await save({ operatingHours: nextHours })).status, 200);
  assert.deepEqual(await loadTenantOperatingShifts(env.DB, 'zhenbaochufang'), shiftsBefore);
  assert.deepEqual(db.prepare('SELECT * FROM menu_category_shifts ORDER BY category_id, shift_id').all(), linksBefore);
  const afterHours = await bootstrap();
  assert.deepEqual(afterHours.tenant.parsedHours, nextHours);
  assert.match(afterHours.tenant.formattedHours, /08:00 - 23:00/);
  assert.equal((await save({ operatingShifts: [] })).status, 200);
  assert.deepEqual((await bootstrap()).tenant.parsedHours, nextHours);
  db.close();
});


test('coverage validates full intervals, breaks, midnight/week rollover, inactive shifts and adjacent windows', () => {
  const sh = (dayOfWeek, startTime, endTime) => [{ id: 's', name: 'Service', windows: [{ dayOfWeek, startTime, endTime }] }];
  const issues = (d, a, b, hours) => MenuSchedule.shiftCoverageIssues(sh(d, a, b), hours).length;
  assert.equal(issues(1,'11:00','19:00',{'1':[{start:'11:00',end:'19:00'}]}),0);
  assert.equal(issues(1,'10:59','19:00',{'1':[{start:'11:00',end:'19:00'}]}),1);
  assert.equal(issues(1,'11:00','19:01',{'1':[{start:'11:00',end:'19:00'}]}),1);
  assert.equal(issues(1,'11:00','19:00',{'1':[{start:'11:00',end:'13:00'},{start:'17:00',end:'19:00'}]}),1);
  assert.equal(issues(1,'11:00','19:00',{'1':[{start:'11:00',end:'13:00'},{start:'13:00',end:'19:00'}]}),0);
  assert.equal(issues(6,'23:00','02:00',{'6':[{start:'22:00',end:'01:00'}],'0':[{start:'01:00',end:'03:00'}]}),0);
  assert.equal(issues(0,'00:30','02:00',{'6':[{start:'22:00',end:'03:00'}]}),0);
  assert.equal(issues(6,'23:00','03:01',{'6':[{start:'22:00',end:'03:00'}]}),1);
  assert.equal(issues(1,'00:00','24:00',{'1':[{start:'00:00',end:'24:00'}]}),0);
  assert.equal(MenuSchedule.shiftCoverageIssues([{...sh(0,'12:00','13:00')[0],isActive:false}],{}).length,0);
  assert.throws(()=>MenuSchedule.normalizeBusinessHours({'1':[{start:'24:00',end:'12:00'}]}));
});

test('shift CRUD and hours writes enforce scope, expected revisions and transaction-level concurrency', async () => {
  const db = createFullMigratedDb(); seedZhenbaochufang(db); const env = createEnvForDb(db);
  const url = 'https://example.test/api/menu/shifts?tenant_id=zhenbaochufang';
  const get = async () => (await menuShifts(new Request(url),env)).json();
  const put = body => menuShifts(new Request(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
  let snapshot = await get(); const before = JSON.stringify(snapshot.operatingShifts);
  const invalid = structuredClone(snapshot.operatingShifts); invalid[0].windows[0].startTime='08:00';
  let response = await put({operatingShifts:invalid,scheduleRevision:snapshot.scheduleRevision});
  assert.equal(response.status,409); assert.equal((await response.json()).error,'SHIFTS_OUTSIDE_OPERATING_HOURS');
  assert.equal(JSON.stringify((await get()).operatingShifts),before);
  const firstWindow = snapshot.operatingShifts[0].windows[0];
  const windowBefore = db.prepare('SELECT rowid,created_at FROM tenant_operating_hours WHERE id=?').get(firstWindow.id);
  const valid=structuredClone(snapshot.operatingShifts); valid[0].name='Edited lunch'; valid[0].windows[0].endTime='14:00';
  assert.equal((await put({operatingShifts:valid,scheduleRevision:snapshot.scheduleRevision})).status,200);
  assert.deepEqual(db.prepare('SELECT rowid,created_at FROM tenant_operating_hours WHERE id=?').get(firstWindow.id),windowBefore);
  assert.equal((await put({operatingShifts:snapshot.operatingShifts,scheduleRevision:snapshot.scheduleRevision})).status,409);
  snapshot = await get();
  const hijack = structuredClone(snapshot.operatingShifts); hijack[0].windows[0].id=hijack[1].windows[0].id;
  assert.equal((await put({operatingShifts:hijack,scheduleRevision:snapshot.scheduleRevision})).status,400);
  const configUrl='https://example.test/api/config?tenant_id=zhenbaochufang';
  let res = await updateConfig(new Request(configUrl,{method:'POST',body:JSON.stringify({operatingHours:{'1':[]},scheduleRevision:snapshot.scheduleRevision})}),env);
  assert.equal(res.status,409);
  // Interleave an hours edit after validation but before the D1 transaction starts.
  const normalBatch=env.DB.batch; let injected=false;
  env.DB.batch=async statements=>{
    if(!injected && statements[0]?.sql.includes('INSERT INTO menu_write_guards')) {
      injected=true; db.prepare('UPDATE tenant_config SET operating_hours=? WHERE tenant_id=?').run(JSON.stringify({'1':[]}), 'zhenbaochufang');
    }
    return normalBatch(statements);
  };
  res=await put({operatingShifts:valid,scheduleRevision:snapshot.scheduleRevision});
  assert.equal(res.status,409); assert.equal((await res.json()).error,'MENU_SCHEDULE_CONFLICT');
  assert.equal((await loadTenantOperatingShifts(env.DB,'zhenbaochufang'))[0].name,'Edited lunch');
  // The inverse interleaving (a shift extends while hours are being shortened) also rolls back.
  env.DB.batch=normalBatch;
  const broad = {}; for(let d=1;d<=5;d++)broad[d]=[{start:'09:00',end:'23:00'}];
  db.prepare('UPDATE tenant_config SET operating_hours=? WHERE tenant_id=?').run(JSON.stringify(broad),'zhenbaochufang');
  const cfg=await (await getConfig(new Request(configUrl),env)).json();
  injected=false;
  env.DB.batch=async statements=>{
    if(!injected && statements[0]?.sql.includes('INSERT INTO menu_write_guards')) {
      injected=true; db.prepare("UPDATE tenant_operating_hours SET end_time='23:30' WHERE id='oh_zb_late_1'").run();
    }
    return normalBatch(statements);
  };
  const hoursBefore=db.prepare('SELECT operating_hours FROM tenant_config WHERE tenant_id=?').get('zhenbaochufang').operating_hours;
  res=await updateConfig(new Request(configUrl,{method:'POST',body:JSON.stringify({operatingHours:broad,scheduleRevision:cfg.scheduleRevision})}),env);
  assert.equal(res.status,409);
  assert.equal(db.prepare('SELECT operating_hours FROM tenant_config WHERE tenant_id=?').get('zhenbaochufang').operating_hours,hoursBefore);
  db.close();
});
