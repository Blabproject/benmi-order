const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../benmi-worker-official/node_modules/typescript');
const { fixture, getMenuPrerequisitesExports } = require('./helpers/option-groups.cjs');

const menuScript = new vm.Script(ts.transpileModule(
  fs.readFileSync('benmi-worker-official/src/modules/menu.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText);

async function setup(t, group = {}) {
  const f = fixture();
  t.after(() => f.db.close());
  f.db.exec(`ALTER TABLE menu_categories ADD COLUMN short_name TEXT;
    INSERT INTO menu_categories(id,tenant_id,slug,name,category_type) VALUES ('a_sides','a','sides','Sides','catalog');
    UPDATE menu_items SET category_id='a_sides' WHERE id IN ('a_coffee','a_tea');`);
  const exports = {};
  menuScript.runInContext(vm.createContext({
    exports, console: { log() {}, error() {} }, Request, Response, URL,
    crypto: require('node:crypto').webcrypto,
    require(name) {
      if (name.includes('option-groups')) return f.api;
      if (name.includes('menu-prerequisites')) return getMenuPrerequisitesExports();
      if (name.includes('operating-shifts')) return {
        hasDbTable: async () => false,
        loadCategoryAndItemShiftLinks: async () => ({ categoryShiftIds: new Map(), itemShiftIds: new Map() }),
        loadTenantOperatingShifts: async () => [],
        hasTenantMenuScheduleFeature: async () => false,
      };
      if (name.includes('bootstrap')) return { invalidateBootstrapCache: async tenant => f.deleted.push(`bootstrap:${tenant}`) };
      if (name.includes('http')) return { json: (body, status = 200) => new Response(JSON.stringify(body), { status }) };
      return {};
    },
  }));
  f.saveMenu = body => exports.updateMenu(new Request('https://test/api/menu?tenant_id=a', {
    method: 'POST', body: JSON.stringify(body),
  }), f.env);
  const saved = await f.save('group', {
    id: 'a_choices', revision: 0, name: 'Side choices', scope: 'item',
    minSelection: 1, maxSelection: 1, itemIds: ['a_main'], options: [],
    sources: [{ type: 'category', categoryId: 'a_sides' }], ...group,
  });
  assert.equal(saved.status, 200, await saved.clone().text());
  f.deleted.length = 0;
  return f;
}

async function deleteProduct(f, endpoint, id = 'a_coffee') {
  if (endpoint === 'menu') return f.saveMenu({ __delete: { items: [id] } });
  const catalog = await f.api.loadOptionCatalog(f.env, 'a');
  const product = catalog.products.find(p => p.id === id);
  return f.save('product', { id, revision: product.menu_revision || 0, deleted: true });
}

for (const endpoint of ['menu', 'product']) {
  test(`${endpoint}: deleting a category-sourced product updates combo choices and invalidates caches`, async t => {
    const f = await setup(t);
    const response = await deleteProduct(f, endpoint);
    assert.equal(response.status, 200, await response.clone().text());
    const catalog = await f.api.loadOptionCatalog(f.env, 'a');
    assert.equal(catalog.products.some(p => p.id === 'a_coffee'), false);
    const choices = f.api.groupOptions(catalog, catalog.groups.find(g => g.id === 'a_choices'));
    assert.deepEqual(Array.from(choices, o => o.productId), ['a_tea']);
    assert.ok(f.api.projectOptionRule(catalog, 'a_main').groups[0].eligibleItems.every(o => o.itemId !== 'a_coffee'));
    assert.ok(f.db.prepare("SELECT id FROM menu_items WHERE id='b_coffee'").get());
    assert.equal(f.db.prepare("SELECT count(*) n FROM modifier_options WHERE group_id='a_choices'").get().n, 0);
    assert.ok(f.deleted.includes('tenant:a:menu'));
    assert.ok(f.deleted.includes('bootstrap:a'));
  });

  test(`${endpoint}: deleting the last required category choice fails atomically`, async t => {
    const f = await setup(t);
    assert.equal((await deleteProduct(f, endpoint)).status, 200);
    f.deleted.length = 0;
    const response = await deleteProduct(f, endpoint, 'a_tea');
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /INSUFFICIENT_OPTIONS/);
    assert.ok(f.db.prepare("SELECT id FROM menu_items WHERE id='a_tea'").get());
    assert.equal(f.deleted.length, 0);
  });

  for (const [kind, group] of [
    ['explicit option', { options: [{ id: 'a_ref', productId: 'a_coffee', name: 'Coffee', price: 0 }] }],
    ['sub-option', { options: [{ id: 'a_ref', name: 'Choose a drink', price: 0, subOptions: [{ productId: 'a_coffee', name: 'Coffee', price: 0 }] }] }],
    ['item list', { sources: [{ type: 'item_list', itemIds: ['a_coffee', 'a_tea'] }] }],
  ]) {
    test(`${endpoint}: ${kind} references still block product deletion`, async t => {
      const f = await setup(t, group);
      const response = await deleteProduct(f, endpoint);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'PRODUCT_IS_LINKED');
      assert.ok(f.db.prepare("SELECT id FROM menu_items WHERE id='a_coffee'").get());
      assert.equal(f.deleted.length, 0);
    });
  }
}

test('menu: deleting a category recalculates choices from remaining source categories', async t => {
  const f = await setup(t, { sources: [
    { type: 'category', categoryId: 'a_sides' },
    { type: 'category', categoryId: 'a_food' },
  ], itemIds: [] });
  const response = await f.saveMenu({ __delete: { categories: ['a_sides'] } });
  assert.equal(response.status, 200, await response.clone().text());
  const catalog = await f.api.loadOptionCatalog(f.env, 'a');
  const choices = f.api.groupOptions(catalog, catalog.groups.find(g => g.id === 'a_choices'));
  assert.deepEqual(Array.from(choices, o => o.productId), ['a_main']);
  assert.equal(catalog.categories.some(c => c.id === 'a_sides'), false);
});

test('menu: a referencing group and product can be removed in the same atomic request', async t => {
  const f = await setup(t, { sources: [], options: [{ id: 'a_ref', productId: 'a_coffee', name: 'Coffee', price: 0 }] });
  const response = await f.saveMenu({ __delete: { items: ['a_coffee'], customizations: ['a_choices'] } });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(f.db.prepare("SELECT id FROM menu_items WHERE id='a_coffee'").get(), undefined);
  assert.equal(f.db.prepare("SELECT id FROM modifier_groups WHERE id='a_choices'").get(), undefined);
});
