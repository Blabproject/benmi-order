// Real local D1 (Miniflare) + VM frontend tests for per-item `staff_only` visibility.
const { test, suite } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../benmi-worker-official/node_modules/typescript');

require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, file);

const { fixture } = require('./helpers/staff-ordering.cjs');
const { getTenantBootstrap } = require('../benmi-worker-official/src/modules/bootstrap.ts');
const { saveOptionEntity, loadOptionCatalog } = require('../benmi-worker-official/src/modules/option-groups.ts');
const { updateMenu, getMenu } = require('../benmi-worker-official/src/modules/menu.ts');
const { createOrder } = require('../benmi-worker-official/src/modules/orders.ts');
const { writeDetailedOrder } = require('../benmi-worker-official/src/modules/order-detail-write.ts');
const { JSDOM } = require('jsdom');

suite('menu item staff_only end-to-end', () => {
  test('persists staff_only via saveOptionEntity & updateMenu, exposes in bootstrap, hides in getMenu, blocks customer orders, allows staff orders', async (t) => {
    const f = await fixture(t);

    // 1. Verify schema default = 0 from migration 0098
    const initialRow = await f.DB.prepare('SELECT staff_only FROM menu_items WHERE id = ?').bind('meal-a').first();
    assert.equal(initialRow.staff_only, 0);

    // 2. Create a staff-only product via saveOptionEntity('product')
    const saveRes = await saveOptionEntity(
      new Request('https://local.test/api/menu/product?tenant_id=a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'staff-secret-a',
          categoryId: 'food-a',
          name: 'Staff Secret Bowl',
          price: 120,
          staffOnly: true,
          links: [],
        }),
      }),
      f.env,
      'product'
    );
    assert.equal(saveRes.status, 200, JSON.stringify(await saveRes.clone().json()));
    const savedRow = await f.DB.prepare('SELECT staff_only FROM menu_items WHERE id = ?').bind('staff-secret-a').first();
    assert.equal(savedRow.staff_only, 1);

    // 3. Also link a staff-only product inside an option group attached to normal meal-a
    const groupRes = await saveOptionEntity(
      new Request('https://local.test/api/menu/option-group?tenant_id=a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'grp-side-a',
          name: 'Side',
          scope: 'item',
          minSelection: 0,
          maxSelection: 1,
          itemIds: ['meal-a'],
          options: [
            { id: 'opt-secret-side', name: 'Staff Secret Bowl', productId: 'staff-secret-a', price: 20, quantity: 1 },
          ],
        }),
      }),
      f.env,
      'group'
    );
    assert.equal(groupRes.status, 200, JSON.stringify(await groupRes.clone().json()));

    // 4. Verify bootstrap returns staffOnly: true on item and option, while keeping item in catalog
    const bsRes = await getTenantBootstrap(new Request('https://local.test/api/tenant/bootstrap?tenant_id=a'), f.env);
    assert.equal(bsRes.status, 200);
    const bsJson = await bsRes.json();
    const foodCat = bsJson.catalog.find((c) => c.id === 'food-a');
    assert.ok(foodCat, 'food-a category should exist in bootstrap');
    const bsNormal = foodCat.items.find((i) => i.id === 'meal-a');
    const bsSecret = foodCat.items.find((i) => i.id === 'staff-secret-a');
    assert.equal(bsNormal.staffOnly, false);
    assert.equal(bsSecret.staffOnly, true);
    assert.equal(bsNormal.bundleRule.groups[0].eligibleItems[0].staffOnly, true);

    // 5. Verify legacy getMenu() skips staff_only items
    const legacyMenuRes = await getMenu(new Request('https://local.test/api/menu?tenant_id=a'), f.env);
    assert.equal(legacyMenuRes.status, 200);
    const legacyMenu = await legacyMenuRes.json();
    assert.equal(legacyMenu.food['Meal'], 100);
    assert.equal(legacyMenu.food['Staff Secret Bowl'], undefined);

    // 6. Verify customer writeDetailedOrder rejects direct staff_only item with PRODUCT_UNAVAILABLE
    const custDirectRes = await writeDetailedOrder(
      f.env,
      'a',
      {
        detailVersion: 1,
        operationId: crypto.randomUUID(),
        diningOption: 'takeaway',
        items: [{ itemId: 'staff-secret-a', quantity: 1 }],
        orderSelections: [],
        total: 120,
      },
      'create',
      undefined,
      f.context('a')
    );
    assert.equal(custDirectRes.status, 400);
    const custDirectBody = await custDirectRes.json();
    assert.equal(custDirectBody.code, 'PRODUCT_UNAVAILABLE');

    // 7. Verify customer writeDetailedOrder rejects staff_only item chosen as a linked option
    const custOptRes = await writeDetailedOrder(
      f.env,
      'a',
      {
        detailVersion: 1,
        operationId: crypto.randomUUID(),
        diningOption: 'takeaway',
        items: [{
          itemId: 'meal-a',
          quantity: 1,
          bundleSelections: {
            portions: [{
              groups: [{
                groupId: 'grp-side-a',
                items: [{ optionId: 'opt-secret-side', itemId: 'staff-secret-a', quantity: 1 }],
              }],
            }],
          },
        }],
        orderSelections: [],
        total: 120,
      },
      'create',
      undefined,
      f.context('a')
    );
    assert.equal(custOptRes.status, 400);
    assert.equal((await custOptRes.json()).code, 'PRODUCT_UNAVAILABLE');

    // 8. Verify legacy createOrder rejects staff_only item
    const legacyCustRes = await createOrder(
      new Request('https://local.test/api/orders?tenant_id=a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dining_option: 'takeaway',
          items: [{ itemId: 'staff-secret-a', name: 'Staff Secret Bowl', quantity: 1, price: 120 }],
          total: 120,
        }),
      }),
      f.env,
      undefined,
      f.context('a')
    );
    assert.equal(legacyCustRes.status, 400);
    const legacyCustBody = await legacyCustRes.json();
    assert.equal(legacyCustBody.code, 'ITEMS_OUT_OF_STOCK');

    // 9. Verify Staff Order succeeds when ordering the staff_only item
    const staffOrder = await f.call(
      '/api/staff/orders',
      {
        requestId: crypto.randomUUID(),
        diningOption: 'takeaway',
        total: 120,
        orderSelections: [],
        items: [{ itemId: 'staff-secret-a', quantity: 1 }],
      },
      f.token
    );
    assert.equal(staffOrder.http, 201, JSON.stringify(staffOrder));

    // 10. Verify syncMenuToD1 (updateMenu) preserves/updates staff_only
    const updateRes = await updateMenu(
      new Request('https://local.test/api/menu?tenant_id=a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          food: {
            __title: 'Meals',
            __short_name: 'Meals',
            __type: 'catalog',
            __sort_order: 1,
            'Meal': { id: 'meal-a', price: 100, staff_only: 1 },
            'Staff Secret Bowl': { id: 'staff-secret-a', price: 120, staff_only: 0 },
          },
        }),
      }),
      f.env
    );
    assert.equal(updateRes.status, 200, JSON.stringify(await updateRes.clone().json()));
    const catAfter = await loadOptionCatalog(f.env, 'a');
    assert.equal(catAfter.products.find((p) => p.id === 'meal-a').staffOnly, true);
    assert.equal(catAfter.products.find((p) => p.id === 'staff-secret-a').staffOnly, false);
  });

  test('LIFF renderDynamicCatalog & client-option-groups hide staffOnly items while StaffOrder keeps them', () => {
    const dom = new JSDOM('<!doctype html><html lang="zh-TW"><body><div id="main-nav"></div><div id="catalog-sections"></div></body></html>');
    const doc = dom.window.document;

    const bootstrapData = {
      tenant: { locale: 'zh-TW', features: [] },
      customizations: [],
      catalog: [
        {
          id: 'cat-mixed',
          slug: 'mixed',
          name: 'Mixed',
          sortOrder: 1,
          items: [
            {
              id: 'i-pub',
              name: 'Public Dish',
              price: 80,
              staffOnly: false,
              bundleRule: {
                version: 3,
                groups: [
                  {
                    id: 'g-opt',
                    name: 'Addons',
                    minSelection: 0,
                    maxSelection: 2,
                    eligibleItems: [
                      { id: 'opt-pub', name: 'Egg', price: 15, staffOnly: false },
                      { id: 'opt-priv', name: 'Staff Meal Addon', price: 0, staffOnly: true },
                    ],
                  },
                ],
              },
            },
            { id: 'i-priv', name: 'Staff Dish', price: 50, staffOnly: true },
          ],
        },
        {
          id: 'cat-staff-only',
          slug: 'staff-sec',
          name: 'Staff Category',
          sortOrder: 2,
          items: [
            { id: 'i-priv-only', name: 'Hidden Bowl', price: 90, staffOnly: true },
          ],
        },
      ],
    };

    let staffRenderedSections = null;
    const context = {
      console,
      document: doc,
      bootstrapData,
      storeConfig: { features: [] },
      cart: {},
      bundleCartData: {},
      customizeData: {},
      isStaffOrderMode: false,
      StaffOrderView: {},
      StaffOrder: {
        renderCatalog(sections) {
          staffRenderedSections = sections;
        },
      },
      locText: (_entity, _field, fallback) => fallback || '',
      ct: (_k) => '',
      parseCartKey: (k) => {
        const idx = k.indexOf('_');
        return { catSlug: k.slice(0, idx), origName: k.slice(idx + 1), itemName: k.slice(idx + 1) };
      },
      updateTotal() {},
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('js/client-menu.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('js/client-option-groups.js', 'utf8'), context);

    // 1. Customer LIFF mode: hides staffOnly item and hides all-staffOnly category
    context.renderDynamicCatalog();
    assert.ok(doc.getElementById('item-mixed-Public Dish'), 'Public item must render on LIFF');
    assert.equal(doc.getElementById('item-mixed-Staff Dish'), null, 'Staff-only item must be hidden on LIFF');
    assert.equal(doc.getElementById('sec-staff-sec'), null, 'Category with only staff-only items must be hidden on LIFF');

    // Open UnifiedOptions popup in LIFF mode and confirm staffOnly option is omitted
    context.UnifiedOptions.open('mixed', 'Public Dish', 0);
    const liffModalHtml = doc.getElementById('unified-option-modal')?.innerHTML || '';
    assert.ok(liffModalHtml.includes('Egg'), 'Public option must appear in LIFF modal');
    assert.ok(!liffModalHtml.includes('Staff Meal Addon'), 'Staff-only option must be hidden in LIFF modal');
    doc.querySelector('#unified-option-modal [data-close]')?.click();

    // 2. Staff Order mode: keeps staffOnly items and staffOnly category
    context.isStaffOrderMode = true;
    context.renderDynamicCatalog();
    assert.equal(staffRenderedSections.length, 2, 'Staff Order must receive both categories');
    assert.equal(staffRenderedSections[0].visibleItems.length, 2, 'Staff Order mixed category keeps both items');
    assert.equal(staffRenderedSections[1].visibleItems.length, 1, 'Staff Order keeps staff-only category item');

    context.UnifiedOptions.open('mixed', 'Public Dish', 0);
    const staffModalHtml = doc.getElementById('unified-option-modal')?.innerHTML || '';
    assert.ok(staffModalHtml.includes('Staff Meal Addon'), 'Staff Order modal must include staff-only option');
  });
});
