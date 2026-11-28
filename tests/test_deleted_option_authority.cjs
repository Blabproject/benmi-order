const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../benmi-worker-official/node_modules/typescript');
const { schemaTrueFixture } = require('./helpers/option-groups.cjs');
const { Element } = require('./helpers/menu-drawer-dom.cjs');

function customer(data) {
  const document = { readyState: 'loading', addEventListener() {}, documentElement: { lang: 'zh-TW', style: { setProperty() {} } } };
  document.createElement = tag => {
    const e = new Element(tag, document); e.style = {};
    const html = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(e, 'innerHTML', { get() { return html.get?.call(this) || this._html; }, set(value) {
      html.set.call(this, value);
      const styleChildren = node => { node.style ||= {}; node.children.forEach(styleChildren); };
      styleChildren(this);
    } });
    return e;
  };
  document.body = document.createElement('body');
  document.getElementById = id => document.body.querySelector('#' + id);
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  document.querySelector = selector => document.body.querySelector(selector);
  const context = {
    document, console, URLSearchParams, AbortSignal, crypto: require('node:crypto').webcrypto,
    location: { hostname: 'localhost', search: '' },
    bootstrapData: data, addEventListener() {}, removeEventListener() {},
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  };
  context.window = context;
  vm.createContext(context);
  // Match the real page's script order, including the checkout resolver override.
  for (const file of ['core', 'menu', 'customizations', 'cart'])
    vm.runInContext(fs.readFileSync(`js/client-${file}.js`, 'utf8'), context);
  for (const file of ['bundle-builder-v2', 'client-option-groups', 'order-detail-checkout', 'client-checkout'])
    vm.runInContext(fs.readFileSync(`js/${file}.js`, 'utf8'), context);
  context.checkDesktopAuthGuard = () => true;
  context.updateTotal = () => {};
  return context;
}

function mixedBootstrap(unifiedMenu = true) {
  return {
    unifiedMenu,
    tenant: { id: 'a' },
    catalog: [{ id: 'a_food', slug: 'food', name: 'Food', allowCustomization: true,
      appliedModifiers: ['old_flavor'], modifierGroups: [],
      items: [{ id: 'a_main', name: 'Meal', price: 35 }] }],
    modifiers: [{ id: 'old_flavor', slug: 'flavor', name: 'Old flavor', isRequired: true,
      selectionType: 'single', options: [{ id: 'old_hot', name: 'Deleted flavor', price: 0 }] }],
  };
}

test('unified menu never falls back to legacy choices, even without an item marker or a matching item', () => {
  const app = customer(mixedBootstrap());
  for (const name of ['Meal', 'Renamed meal']) {
    assert.equal(app.getItemModifiers('food', name).length, 0);
    assert.equal(app.getEffectiveItemModifierGroups('food_' + name).length, 0);
  }
  assert.equal(app.getCategoryModifiers('food').length, 0);
  app.handleItemCardClick('food', 'Meal');
  assert.equal(app.document.getElementById('item-customize-overlay'), null);
  assert.equal(app.cart.food_Meal, 1);
});

test('legacy menu still opens its required options and displays the actual base price', () => {
  const app = customer(mixedBootstrap(false));
  assert.equal(app.getItemModifiers('food', 'Meal')[0].options[0].name, 'Deleted flavor');
  app.openItemCustomizeModal('food', 'Meal');
  const modal = app.document.getElementById('item-customize-overlay');
  assert.ok(modal);
  assert.match(modal.textContent, /基本售價 \$35/);
});

test('pre-cutover or incomplete browser snapshots are not used to hydrate the menu', async () => {
  for (const [version, complete, shouldHydrate] of [[8, true, false], [9, false, false], [9, true, true]]) {
    const app = customer(null);
    const data = { ...mixedBootstrap(false), bootstrapVersion: version, menuComplete: complete };
    app.localStorage.getItem = () => JSON.stringify(data);
    app.getTenantIdFromUrl = () => 'a';
    for (const name of ['setTodayDate', 'updateAsapTimeDisplay', 'renderStoreOperatingHours', 'applyTenantTheme', 'applyPickupConfig'])
      app[name] = () => {};
    app.ensureLiffReady = app.fetchMenu = () => new Promise(() => {});
    app.renderDynamicCatalog = () => {};
    // initApp hydrates synchronously before awaiting the pending network request.
    void app.initApp();
    assert.equal(Boolean(app.bootstrapData), shouldHydrate, `version=${version}, complete=${complete}`);
  }
});

function bootstrapFor(f) {
  const cache = new Map();
  f.env.ORDER_STATE = {
    get: async key => cache.get(key) || null,
    put: async (key, value) => cache.set(key, value),
    delete: async key => cache.delete(key),
  };
  const exports = {};
  const context = vm.createContext({ exports, console, Date, URL, Map, Set,
    require(name) {
      if (name.includes('option-groups')) return f.api;
      if (name.includes('operating-shifts')) return require('./helpers/option-groups.cjs').getOperatingShiftsExports();
      if (name.includes('menu-prerequisites')) return require('./helpers/option-groups.cjs').getMenuPrerequisitesExports();
      if (name.includes('qr-channels')) return { loadTenantQrChannels: async () => [] };
      if (name.includes('order-detail')) return { detailWrites: () => false };
      if (name.includes('tenant-lifecycle')) return { tenantIsDeleted: async () => false };
      if (name.endsWith('/tenant')) return { resolveTenantContext: async id => ({ tenantId: id, brandName: id }) };
      if (name.endsWith('/menu')) return { getTenantId: request => new URL(request.url).searchParams.get('tenant_id') };
      if (name.includes('http')) return { json: (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers }) };
      throw Error('Unexpected import ' + name);
    },
  });
  vm.runInContext(ts.transpileModule(fs.readFileSync('benmi-worker-official/src/modules/bootstrap.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return { cache, get: async (tenant = 'a', fresh = true) => {
    const response = await exports.getTenantBootstrap(new Request(`https://menu.test/api/tenant/bootstrap?tenant_id=${tenant}${fresh ? '&nocache=1' : ''}`), f.env);
    assert.equal(response.status, 200, await response.clone().text());
    return { data: await response.json(), cacheStatus: response.headers.get('X-Cache') };
  } };
}

test('save/delete round trip: canonical options are authoritative and legacy records remain usable on rollback', async () => {
  const f = schemaTrueFixture();
  try {
    f.db.exec(`INSERT INTO tenants(id, name) VALUES ('a', 'Test store');
      INSERT INTO menu_categories(id,tenant_id,slug,name,category_type,is_required,allow_customization,applied_modifiers)
      VALUES ('a_food','a','food','Food','catalog',0,1,'["old_flavor"]'),
             ('old_flavor','a','flavor-selection','Old flavor','modifier',1,1,'[]');
      INSERT INTO menu_items(id,tenant_id,category_id,name,price) VALUES
        ('a_main','a','a_food','Meal',35), ('old_hot','a','old_flavor','Deleted flavor',0);`);
    const group = { id: 'a_group', name: 'Current choices', scope: 'item', revision: 0,
      minSelection: 0, maxSelection: 1, options: [
        { id: 'a_option', name: 'Current option', price: 5 },
        { id: 'a_removed', name: 'Option to remove', price: 10 },
      ], itemIds: ['a_main'] };
    const saved = await f.save('group', group);
    assert.equal(saved.status, 200, await saved.clone().text());
    const bootstrap = bootstrapFor(f);
    const first = (await bootstrap.get()).data;
    const category = first.catalog.find(c => c.id === 'a_food');
    assert.equal(first.modifiers.length, 0);
    assert.equal(first.optionDisplayNames.old_hot, 'Deleted flavor');
    assert.equal(first.optionDisplayNames.a_option, 'Current option');
    assert.equal(customer(first).resolveOptionDisplayName('old_hot'), 'Deleted flavor');
    assert.deepEqual(category.appliedModifiers, []);
    assert.deepEqual(category.modifierGroups, []);
    assert.equal(category.allowCustomization, false);
    assert.equal(category.items[0].bundleRule.groups[0].eligibleItems[0].name, 'Current option');
    assert.equal(category.items[0].bundleRule.groups[0].eligibleItems[0].surcharge, 5);

    const edited = await f.save('group', { ...group, revision: 1, options: [group.options[0]] });
    assert.equal(edited.status, 200, await edited.clone().text());
    const afterEdit = (await bootstrap.get()).data.catalog.find(c => c.id === 'a_food').items[0];
    assert.deepEqual(afterEdit.bundleRule.groups[0].eligibleItems.map(o => o.id), ['a_option']);
    assert.equal(f.db.prepare("SELECT count(*) n FROM modifier_options WHERE id='a_removed'").get().n, 0);

    const deleted = await f.save('group', { id: 'a_group', revision: 2, deleted: true });
    assert.equal(deleted.status, 200, await deleted.clone().text());
    const fresh = (await bootstrap.get()).data;
    assert.equal(fresh.catalog.find(c => c.id === 'a_food').items[0].bundleRule, null);
    assert.equal(fresh.modifiers.length, 0);
    assert.equal((await bootstrap.get('a', false)).cacheStatus, 'HIT');

    // Old KV payloads must miss once after deploying the changed read contract.
    bootstrap.cache.set('tenant:a:bootstrap:v2', JSON.stringify({ ...mixedBootstrap(), bootstrapVersion: 2, menuComplete: true, orderDetailVersion: 0 }));
    const rebuilt = await bootstrap.get('a', false);
    assert.equal(rebuilt.cacheStatus, 'MISS');
    assert.equal(rebuilt.data.modifiers.length, 0);

    const orderGroup = await f.save('group', { ...group, id: 'a_order', scope: 'order', options: [group.options[0]], itemIds: [] });
    assert.equal(orderGroup.status, 200, await orderGroup.clone().text());
    const wholeOrder = (await bootstrap.get()).data;
    assert.equal(wholeOrder.customizations.find(g => g.id === 'a_order').options[0].name, 'Current option');
    assert.equal(wholeOrder.catalog.find(c => c.id === 'a_food').items[0].bundleRule, null);

    f.env.UNIFIED_MENU_ENABLED = 'false';
    const legacy = (await bootstrap.get()).data;
    assert.equal(legacy.modifiers.find(g => g.id === 'old_flavor').options[0].name, 'Deleted flavor');
    assert.deepEqual(legacy.catalog.find(c => c.id === 'a_food').appliedModifiers, ['old_flavor']);
  } finally { f.db.close(); }
});

test('checkout reconciles a saved legacy draft, preserves its note and requires review once', async () => {
  const data = { ...mixedBootstrap(), menuComplete: true, orderDetailVersion: 1 };
  const app = customer(data);
  app.cart.food_Meal = 1;
  app.customizeData.food_Meal = [{ single: { old_flavor: 'Deleted flavor' },
    selectedDetails: { old_hot: { id: 'old_hot', name: 'Deleted flavor', price: 7 } }, note: 'Keep note' }];
  app.getTenantIdFromUrl = () => 'a';
  app.fetch = async () => ({ ok: true, json: async () => structuredClone(data) });
  const validation = await app.validateCartStockBeforeSubmit();
  assert.equal(validation.valid, false);
  assert.equal(validation.optionsChanged, true);
  assert.equal(app.calculateCurrentFoodSubtotal(), 35);
  const line = app.buildStructuredCartItems()[0];
  assert.equal(line.subtotal, 35);
  assert.equal(line.options.some(o => o.choice.includes('Deleted flavor')), false);
  assert.equal(app.DetailCheckout.items()[0].portionNotes[0], 'Keep note');
  assert.equal((await app.validateCartStockBeforeSubmit()).valid, true);
});

test('deleted groups are removed from drafts including nested groups, without changing historical snapshot objects', async () => {
  const data = { ...mixedBootstrap(), menuComplete: true, orderDetailVersion: 1 };
  const app = customer(data);
  const original = { groups: [{ groupId: 'deleted', items: [{ optionId: 'old_hot', name: 'Deleted flavor', surcharge: 7, quantity: 1 }] }] };
  const originalJson = JSON.stringify(original);
  app.cart.food_Meal = 1;
  app.bundleCartData.food_Meal = [original];
  app.getTenantIdFromUrl = () => 'a';
  app.fetch = async () => ({ ok: true, json: async () => structuredClone(data) });
  assert.equal((await app.validateCartStockBeforeSubmit()).optionsChanged, true);
  assert.equal(app.bundleCartData.food_Meal, undefined);
  assert.equal(app.DetailCheckout.items()[0].bundleSelections, null);
  assert.equal(app.buildStructuredCartItems()[0].subtotal, 35);
  assert.equal((await app.validateCartStockBeforeSubmit()).valid, true);
  assert.equal(JSON.stringify(original), originalJson);

  data.catalog[0].items[0].bundleRule = { version: 3, groups: [{ id: 'current', eligibleItems: [{ id: 'kept' }] }] };
  app.bootstrapData = data;
  app.bundleCartData.food_Meal = [{ groups: [{ groupId: 'current', items: [{ optionId: 'kept', quantity: 1, surcharge: 2,
    modifiers: [{ name: 'Deleted child', price: 7 }],
    groups: [{ groupId: 'deleted_child', items: [] }] }] }, { groupId: 'deleted', items: [] }] }];
  assert.equal(app.reconcileCartOptions(), true);
  const groups = app.bundleCartData.food_Meal[0].groups;
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items[0].surcharge, 2);
  assert.equal(groups[0].items[0].groups.length, 0);
  assert.equal(groups[0].items[0].modifiers.length, 0);
  assert.equal(app.calculateCurrentFoodSubtotal(), 37);
  assert.equal(app.reconcileCartOptions(), false);
});

test('valid legacy choices migrate into canonical drafts; actual legacy menus retain their customization data', () => {
  const data = { ...mixedBootstrap(), menuComplete: true };
  data.catalog[0].items[0].bundleRule = { version: 3, groups: [{ id: 'new_group', name: 'Flavor', metadata: { legacy_key: 'old_flavor' },
    minSelection: 0, maxSelection: 1, eligibleItems: [{ id: 'new_option', name: 'Deleted flavor', price: 5 }] }] };
  const app = customer(data);
  app.cart.food_Meal = 1;
  app.customizeData.food_Meal = [{ single: { old_flavor: 'Deleted flavor' }, note: 'Keep note' }];
  assert.equal(app.reconcileCartOptions(), true);
  const selected = app.bundleCartData.food_Meal[0].groups[0].items[0];
  assert.equal(selected.optionId, 'new_option');
  assert.equal(selected.surcharge, 5);
  assert.equal(app.buildStructuredCartItems()[0].subtotal, 40);
  data.unifiedMenu = false;
  app.customizeData.food_Meal = [{ single: { old_flavor: 'Deleted flavor' }, selectedDetails: { old: { price: 7 } } }];
  const before = JSON.stringify(app.customizeData);
  assert.equal(app.reconcileCartOptions(), false);
  assert.equal(JSON.stringify(app.customizeData), before);
});

test('pre-submit rejects incomplete, foreign or malformed menus without mutating cart, bootstrap or cache', async () => {
  const data = { ...mixedBootstrap(), menuComplete: true };
  for (const fresh of [
    { ...data, menuComplete: false, catalog: [] },
    { ...data, tenant: { id: 'foreign' }, catalog: [] },
    { ...data, catalog: [{}] },
    { tenant: { id: 'a' } },
  ]) {
    const app = customer(data);
    app.cart.food_Meal = 1;
    app.customizeData.food_Meal = [{ note: 'Keep note' }];
    app.getTenantIdFromUrl = () => 'a';
    let writes = 0;
    app.localStorage.setItem = () => writes++;
    app.fetch = async () => ({ ok: true, json: async () => fresh });
    const before = JSON.stringify([app.cart, app.customizeData, app.bootstrapData]);
    const result = await app.validateCartStockBeforeSubmit();
    assert.equal(result.valid, false);
    assert.equal(result.unavailable, true);
    assert.equal(JSON.stringify([app.cart, app.customizeData, app.bootstrapData]), before);
    assert.equal(writes, 0);
  }
});

test('a reconciled cart passes the actual typed server validator with the updated price and note', async () => {
  const f = schemaTrueFixture();
  try {
    f.db.exec(`INSERT INTO tenants(id,name) VALUES('a','Test store');
      INSERT INTO menu_categories(id,tenant_id,slug,name,category_type) VALUES ('a_food','a','food','Food','catalog');
      INSERT INTO menu_items(id,tenant_id,category_id,name,price) VALUES ('a_main','a','a_food','Meal',35);`);
    const data = (await bootstrapFor(f).get()).data;
    const app = customer(data);
    app.cart.food_Meal = 1;
    app.customizeData.food_Meal = [{ selectedDetails: { old_hot: { name: 'Pepper', price: 7 } }, note: 'Keep note' }];
    app.bundleCartData.food_Meal = [{ groups: [{ groupId: 'removed', items: [{ optionId: 'old_hot', quantity: 1, surcharge: 7 }] }] }];
    app.reconcileCartOptions();
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('benmi-worker-official/src/modules/order-detail.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, crypto: require('node:crypto').webcrypto,
      require: name => name.includes('option-groups')
        ? f.api
        : (name.includes('operating-shifts')
            ? require('./helpers/option-groups.cjs').getOperatingShiftsExports()
            : (name.includes('menu-prerequisites')
                ? require('./helpers/option-groups.cjs').getMenuPrerequisitesExports()
                : (name.includes('pricing-engine-client')
                    ? { pricingRustEnabled: () => false }
                    : require('../js/order-detail-view.js')))) });
    const result = await exports.buildDetailRound(f.env, 'a', {
      items: app.DetailCheckout.items(), orderSelections: [], total: app.calculateCurrentFoodSubtotal(),
    }, 1);
    assert.equal(result.total, 35);
    assert.equal(result.items[0].portions[0].note, 'Keep note');
    assert.equal(result.items[0].portions[0].groups.length, 0);
  } finally { f.db.close(); }
});
