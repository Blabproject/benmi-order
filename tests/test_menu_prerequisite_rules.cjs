const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../benmi-worker-official/node_modules/typescript');

require.extensions['.ts'] = (module, file) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText,
    file
  );
};

const { schemaTrueFixture } = require('./helpers/option-groups.cjs');
const { updateMenu } = require('../benmi-worker-official/src/modules/menu.ts');
const { getTenantBootstrap } = require('../benmi-worker-official/src/modules/bootstrap.ts');
const { writeDetailedOrder } = require('../benmi-worker-official/src/modules/order-detail-write.ts');

function createQiaqiaFixture() {
  const f = schemaTrueFixture();
  const kvStore = new Map();
  f.env.ORDER_STATE = {
    get: async (key) => (kvStore.has(key) ? kvStore.get(key) : null),
    put: async (key, val) => {
      kvStore.set(key, String(val));
    },
    delete: async (key) => {
      kvStore.delete(key);
      f.deleted.push(key);
    },
  };
  f.env.ORDER_DETAIL_READS = 'true';
  f.env.ORDER_DETAIL_WRITES = 'true';
  f.env.UNIFIED_MENU_ENABLED = 'true';

  f.db.exec(`
    INSERT INTO tenants (id, name) VALUES ('qiaqia_test', '恰恰罵丸測試店');
    INSERT INTO tenant_config (
      tenant_id, brand_name, brand_color, is_active, store_status, allow_dine_in, allow_scheduled_pickup, features
    ) VALUES (
      'qiaqia_test', '恰恰罵丸測試店', '#00b900', 1, 'open', 1, 1, '["unified_option_groups"]'
    );
    INSERT INTO tenant_lifecycle (tenant_id, state) VALUES ('qiaqia_test', 'active')
      ON CONFLICT(tenant_id) DO UPDATE SET state = 'active';
    INSERT INTO menu_categories (id, tenant_id, slug, name, short_name, sort_order, category_type, allow_customization, prerequisite_mode)
    VALUES
      ('cat_main', 'qiaqia_test', 'main', '經典主餐', '主餐', 1, 'catalog', 1, 'none'),
      ('cat_addons', 'qiaqia_test', 'addons', '加點', '加點', 2, 'catalog', 0, 'require_any');
    INSERT INTO menu_items (id, tenant_id, category_id, name, price, sort_order, prerequisite_mode)
    VALUES
      ('item_meatball', 'qiaqia_test', 'cat_main', '原味肉圓', 50, 1, 'inherit'),
      ('item_duckblood', 'qiaqia_test', 'cat_main', '麻辣鴨血', 75, 2, 'inherit'),
      ('item_tofu', 'qiaqia_test', 'cat_addons', '滷豆腐', 20, 1, 'inherit'),
      ('item_enoki', 'qiaqia_test', 'cat_addons', '金針菇', 30, 2, 'inherit'),
      ('item_free_egg', 'qiaqia_test', 'cat_addons', '滷蛋（可單點）', 15, 3, 'none');
    INSERT INTO menu_prerequisite_links (tenant_id, source_type, source_id, required_type, required_id, min_quantity, sort_order)
    VALUES
      ('qiaqia_test', 'category', 'cat_addons', 'item', 'item_duckblood', 1, 0);
  `);

  return f;
}

test('bootstrap v9 projects 3-tier prerequisite inheritance (category -> item inherit vs none override)', async (t) => {
  const f = createQiaqiaFixture();
  t.after(() => f.db.close());

  const res = await getTenantBootstrap(
    new Request('https://test.local/api/tenant/bootstrap?tenant_id=qiaqia_test&nocache=1'),
    f.env
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.bootstrapVersion, 9);

  const mainCat = body.catalog.find((c) => c.id === 'cat_main');
  const addonsCat = body.catalog.find((c) => c.id === 'cat_addons');
  assert.equal(mainCat.prerequisiteMode, 'none');
  assert.equal(mainCat.prerequisiteRule ?? null, null);

  assert.equal(addonsCat.prerequisiteMode, 'require_any');
  assert.deepEqual(addonsCat.prerequisiteItemIds, ['item_duckblood']);
  assert.deepEqual(addonsCat.prerequisiteRule, {
    mode: 'require_any',
    minParentQty: 1,
    requiredItemIds: ['item_duckblood'],
    requiredCategoryIds: [],
  });

  const tofu = addonsCat.items.find((i) => i.id === 'item_tofu');
  const freeEgg = addonsCat.items.find((i) => i.id === 'item_free_egg');
  assert.equal(tofu.prerequisiteMode, 'inherit');
  assert.deepEqual(tofu.prerequisiteRule.requiredItemIds, ['item_duckblood']);

  // Item explicitly set to 'none' overrides category 'require_any'
  assert.equal(freeEgg.prerequisiteMode, 'none');
  assert.equal(freeEgg.prerequisiteRule ?? null, null);
});

test('authoritative order validation enforces prerequisites across create, append rounds, and modify', async (t) => {
  const f = createQiaqiaFixture();
  t.after(() => f.db.close());

  // 1. Reject standalone add-on item without 麻辣鴨血
  const standaloneAddonRes = await writeDetailedOrder(
    f.env,
    'qiaqia_test',
    {
      detailVersion: 1,
      operationId: crypto.randomUUID(),
      total: 20,
      dining_option: 'dine_in',
      table_number: 'A1',
      items: [{ itemId: 'item_tofu', quantity: 1 }],
      orderSelections: [],
    },
    'create'
  );
  assert.equal(standaloneAddonRes.status, 400);
  const standaloneErr = await standaloneAddonRes.json();
  assert.equal(standaloneErr.code, 'PREREQUISITE_ITEM_REQUIRED');
  assert.equal(standaloneErr.itemId, 'item_tofu');
  assert.ok(standaloneErr.requiredNames.includes('麻辣鴨血'));

  // 2. Allow item with 'none' override even inside locked category
  const freeEggRes = await writeDetailedOrder(
    f.env,
    'qiaqia_test',
    {
      detailVersion: 1,
      operationId: crypto.randomUUID(),
      total: 15,
      dining_option: 'takeaway',
      items: [{ itemId: 'item_free_egg', quantity: 1 }],
      orderSelections: [],
    },
    'create'
  );
  assert.equal(freeEggRes.status, 200);

  // 3. Create dine-in Round 1 with ONLY 原味肉圓 (does NOT satisfy 麻辣鴨血)
  const meatballOrderRes = await writeDetailedOrder(
    f.env,
    'qiaqia_test',
    {
      detailVersion: 1,
      operationId: crypto.randomUUID(),
      total: 50,
      dining_option: 'dine_in',
      table_number: 'A2',
      items: [{ itemId: 'item_meatball', quantity: 1 }],
      orderSelections: [],
    },
    'create'
  );
  assert.equal(meatballOrderRes.status, 200);
  const meatballOrder = await meatballOrderRes.json();

  // Appending 滷豆腐 to Round 1 that only had 原味肉圓 MUST be rejected
  const invalidAppendRes = await writeDetailedOrder(
    f.env,
    'qiaqia_test',
    {
      detailVersion: 1,
      expectedDetailRevision: meatballOrder.detailRevision,
      operationId: crypto.randomUUID(),
      parent_order_key: meatballOrder.key,
      total: 20,
      items: [{ itemId: 'item_tofu', quantity: 1 }],
      orderSelections: [],
    },
    'append'
  );
  assert.equal(invalidAppendRes.status, 400);
  assert.equal((await invalidAppendRes.json()).code, 'PREREQUISITE_ITEM_REQUIRED');

  // 4. Create dine-in Round 1 with 麻辣鴨血 (1 bowl unlocks unlimited add-ons!)
  const duckOrderRes = await writeDetailedOrder(
    f.env,
    'qiaqia_test',
    {
      detailVersion: 1,
      operationId: crypto.randomUUID(),
      total: 125,
      dining_option: 'dine_in',
      table_number: 'A3',
      items: [
        { itemId: 'item_duckblood', quantity: 1 },
        { itemId: 'item_tofu', quantity: 1 },
        { itemId: 'item_enoki', quantity: 1 },
      ],
      orderSelections: [],
    },
    'create'
  );
  assert.equal(duckOrderRes.status, 200);
  const duckOrder = await duckOrderRes.json();

  // 5. Appending Round 2 with ONLY 滷豆腐 succeeds because Round 1 already contains 麻辣鴨血!
  const validAppendRes = await writeDetailedOrder(
    f.env,
    'qiaqia_test',
    {
      detailVersion: 1,
      expectedDetailRevision: duckOrder.detailRevision,
      operationId: crypto.randomUUID(),
      parent_order_key: duckOrder.key,
      total: 20,
      items: [{ itemId: 'item_tofu', quantity: 1 }],
      orderSelections: [],
    },
    'append'
  );
  assert.equal(validAppendRes.status, 200);

  // 6. Modifying Round 1 to remove 麻辣鴨血 while keeping 滷豆腐 MUST be rejected
  const takeawayDuckRes = await writeDetailedOrder(
    f.env,
    'qiaqia_test',
    {
      detailVersion: 1,
      operationId: crypto.randomUUID(),
      total: 95,
      dining_option: 'takeaway',
      items: [
        { itemId: 'item_duckblood', quantity: 1 },
        { itemId: 'item_tofu', quantity: 1 },
      ],
      orderSelections: [],
    },
    'create'
  );
  assert.equal(takeawayDuckRes.status, 200);
  const takeawayDuck = await takeawayDuckRes.json();
  f.db.prepare("UPDATE orders SET status = 'WAITING_CUSTOMER_CHANGE' WHERE key = ?").run(takeawayDuck.key);

  const invalidModifyRes = await writeDetailedOrder(
    f.env,
    'qiaqia_test',
    {
      detailVersion: 1,
      expectedDetailRevision: takeawayDuck.detailRevision,
      targetRound: 1,
      operationId: crypto.randomUUID(),
      order_key: takeawayDuck.key,
      total: 20,
      items: [{ itemId: 'item_tofu', quantity: 1 }],
      orderSelections: [],
    },
    'modify'
  );
  assert.equal(invalidModifyRes.status, 400);
  assert.equal((await invalidModifyRes.json()).code, 'PREREQUISITE_ITEM_REQUIRED');
});

test('POS menu endpoints persist prerequisite rules and block deleting linked anchor product', async (t) => {
  const f = createQiaqiaFixture();
  t.after(() => f.db.close());

  // Attempting to delete 麻辣鴨血 while 加點 links to it must fail with PRODUCT_IS_LINKED
  const catalogBefore = await f.api.loadOptionCatalog(f.env, 'qiaqia_test');
  const duckProd = catalogBefore.products.find((p) => p.id === 'item_duckblood');
  const delBlocked = await f.save(
    'product',
    { id: 'item_duckblood', revision: duckProd.menu_revision || 0, delete: true },
    'qiaqia_test'
  );
  assert.equal(delBlocked.status, 400);
  assert.equal((await delBlocked.json()).error, 'PRODUCT_IS_LINKED');

  // Update item-level prerequisite via saveOptionEntity ('product')
  const meatballProd = catalogBefore.products.find((p) => p.id === 'item_meatball');
  const saveProdRes = await f.save(
    'product',
    {
      id: 'item_meatball',
      name: '原味肉圓',
      price: 50,
      categoryId: 'cat_main',
      revision: meatballProd.menu_revision || 0,
      prerequisiteMode: 'require_any',
      prerequisiteItemIds: ['item_duckblood'],
      prerequisiteCategoryIds: [],
      links: [],
    },
    'qiaqia_test'
  );
  assert.equal(saveProdRes.status, 200);
  const savedCatalog = (await saveProdRes.json()).catalog;
  const updatedMeatball = savedCatalog.products.find((p) => p.id === 'item_meatball');
  assert.equal(updatedMeatball.prerequisiteMode, 'require_any');
  assert.deepEqual(updatedMeatball.prerequisiteItemIds, ['item_duckblood']);

  // Update category-level prerequisite via POST /api/menu (updateMenu)
  const menuRes = await updateMenu(
    new Request('https://test.local/api/menu?tenant_id=qiaqia_test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        main: {
          __title: '經典主餐',
          __short_name: '主餐',
          __type: 'catalog',
          __allow_customization: 1,
          __applied_modifiers: ['*'],
          __prerequisite_mode: 'none',
          __prerequisite_item_ids: [],
          __prerequisite_category_ids: [],
          __sort_order: 1,
          原味肉圓: {
            id: 'item_meatball',
            price: 50,
            badge_text: null,
            is_recommended: 0,
            item_type: 'standard',
            prerequisite_mode: 'inherit',
            prerequisite_item_ids: [],
            prerequisite_category_ids: [],
            sort_order: 1,
          },
          麻辣鴨血: {
            id: 'item_duckblood',
            price: 75,
            badge_text: null,
            is_recommended: 0,
            item_type: 'standard',
            prerequisite_mode: 'inherit',
            prerequisite_item_ids: [],
            prerequisite_category_ids: [],
            sort_order: 2,
          },
        },
        addons: {
          __title: '加點',
          __short_name: '加點',
          __type: 'catalog',
          __allow_customization: 0,
          __applied_modifiers: [],
          __prerequisite_mode: 'require_any',
          __prerequisite_item_ids: ['item_duckblood', 'item_meatball'],
          __prerequisite_category_ids: [],
          __sort_order: 2,
          滷豆腐: {
            id: 'item_tofu',
            price: 20,
            badge_text: null,
            is_recommended: 0,
            item_type: 'standard',
            prerequisite_mode: 'inherit',
            prerequisite_item_ids: [],
            prerequisite_category_ids: [],
            sort_order: 1,
          },
        },
      }),
    }),
    f.env
  );
  assert.equal(menuRes.status, 200);
  const catalogAfterMenu = await f.api.loadOptionCatalog(f.env, 'qiaqia_test');
  const addonsAfter = catalogAfterMenu.categories.find((c) => c.id === 'cat_addons');
  assert.equal(addonsAfter.prerequisiteMode, 'require_any');
  assert.deepEqual(Array.from(addonsAfter.prerequisiteItemIds).sort(), ['item_duckblood', 'item_meatball']);
});

test('Client LIFF guided bottom sheet adds parent + add-on in 1 tap and cleans up orphans on parent removal', async (t) => {
  const { JSDOM } = require('jsdom');
  const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  const sheetMarkupMatch = indexHtml.match(
    /<!-- Purchase Prerequisite Guided Bottom Sheet -->([\s\S]*?)<script src="https:\/\/static\.line-scdn\.net/
  );
  assert.ok(sheetMarkupMatch, 'index.html should contain #prereq-guide-modal markup');

  const dom = new JSDOM(
    `<!doctype html><html><body>
      <div id="catalog-sections"></div>
      <div id="category-tabs"></div>
      <div id="cart-summary"></div>
      <span id="total-price">$0</span>
      <button id="submit-btn"></button>
      ${sheetMarkupMatch[1]}
    </body></html>`,
    { url: 'https://order.test/?tenant_id=qiaqiamawan1', runScripts: 'dangerously' }
  );
  const { window } = dom;
  t.after(() => window.close());

  const bootstrap = {
    bootstrapVersion: 9,
    menuComplete: true,
    orderDetailVersion: 1,
    tenant: { id: 'qiaqiamawan1', brandName: '恰恰罵丸-頭份店', allowScheduledPickup: false },
    catalog: [
      {
        id: 'cat_qqm_main',
        slug: 'main',
        name: '主餐',
        prerequisiteMode: 'none',
        prerequisiteRule: null,
        items: [
          { id: 'qqm_mn_01', name: '肉圓', price: 50 },
          { id: 'qqm_mn_09', name: '麻辣鴨血', price: 75 },
        ],
      },
      {
        id: 'cat_qqm_addons',
        slug: 'addons',
        name: '加點',
        prerequisiteMode: 'require_any',
        prerequisiteItemIds: ['qqm_mn_09'],
        prerequisiteRule: {
          mode: 'require_any',
          minParentQty: 1,
          requiredItemIds: ['qqm_mn_09'],
          requiredCategoryIds: [],
        },
        items: [{ id: 'qqm_ad_01', name: '豆腐', price: 20 }],
      },
    ],
    modifiers: [],
    customizations: [],
  };

  Object.assign(window, {
    bootstrapData: bootstrap,
    cart: {},
    customizeData: {},
    confirm: () => true,
    alert: () => {},
  });

  for (const file of ['client-i18n', 'client-core', 'client-menu', 'client-cart']) {
    window.eval(fs.readFileSync(path.resolve(__dirname, `../js/${file}.js`), 'utf8'));
  }
  window.checkDesktopAuthGuard = () => true;
  window.renderDynamicCatalog();

  // Initially 加點 badge is locked
  const catBadge = window.document.getElementById('prereq-cat-badge-addons');
  assert.ok(catBadge);
  assert.equal(catBadge.classList.contains('is-locked'), true);
  assert.match(catBadge.textContent, /麻辣鴨血/);

  // Tapping + on 豆腐 opens the guided bottom sheet instead of adding 豆腐 alone
  window.updateQty('addons', '豆腐', 1);
  assert.equal(window.cart['addons_豆腐'] || 0, 0);
  const modal = window.document.getElementById('prereq-guide-modal');
  assert.equal(modal.style.display, 'flex');

  // 1-tap primary action adds BOTH 麻辣鴨血 and 豆腐 and unlocks 加點
  window.confirmPrerequisiteGuideAddBoth();
  assert.equal(modal.style.display, 'none');
  assert.equal(window.cart['main_麻辣鴨血'], 1);
  assert.equal(window.cart['addons_豆腐'], 1);
  assert.equal(catBadge.classList.contains('is-unlocked'), true);

  // Now customer can freely add more add-ons with 1 bowl of 麻辣鴨血
  window.updateQty('addons', '豆腐', 2);
  assert.equal(window.cart['addons_豆腐'], 3);

  // Decrementing 麻辣鴨血 to 0 confirms and removes dependent 加點 items automatically
  window.updateQty('main', '麻辣鴨血', -1);
  assert.equal(window.cart['main_麻辣鴨血'] || 0, 0);
  assert.equal(window.cart['addons_豆腐'] || 0, 0);
  assert.equal(catBadge.classList.contains('is-locked'), true);
});

test('orders.html exposes category advanced settings button beside Add Item and sub-page container', () => {
  const ordersHtml = fs.readFileSync(path.resolve(__dirname, '../orders.html'), 'utf8');
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(ordersHtml);
  const { document } = dom.window;
  const advBtn = document.getElementById('btn-category-advanced-settings');
  const addBtn = document.getElementById('btn-menu-create-unified');
  const advScreen = document.getElementById('menu-category-advanced-screen');
  assert.ok(advBtn, 'orders.html should have #btn-category-advanced-settings');
  assert.ok(addBtn, 'orders.html should have #btn-menu-create-unified');
  assert.equal(advBtn.nextElementSibling?.id, addBtn.id, 'advanced button must sit next to + Add Item');
  assert.ok(advScreen, 'orders.html should have #menu-category-advanced-screen sub-page');
  dom.window.close();
});
