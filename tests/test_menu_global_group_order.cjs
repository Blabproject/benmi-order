const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../benmi-worker-official/node_modules/typescript');
const { fixture, getOperatingShiftsExports } = require('./helpers/option-groups.cjs');
const { Element } = require('./helpers/menu-drawer-dom.cjs');

async function setup() {
  const f = fixture();
  f.db.exec('ALTER TABLE menu_categories ADD COLUMN short_name TEXT;');
  const definitions = [];
  for (const [id, scope, tenant] of [['a_utensils', 'order', 'a'], ['a_notes', 'order', 'a'], ['a_item', 'item', 'a'], ['b_notes', 'order', 'b']]) {
    const definition = { id, name: id, revision: 0, minSelection: 0, maxSelection: 2,
      allowRepeats: true, included: false, sources: [], itemIds: [],
      options: [{ id: id + '_option', name: 'Option', price: 3, quantity: 1 }] };
    const response = await f.save('group', definition, tenant);
    assert.equal(response.status, 200, await response.clone().text());
    f.db.prepare('UPDATE modifier_groups SET scope=?,source_metadata_json=? WHERE id=?')
      .run(scope, JSON.stringify({ keep: 'migration metadata', displaySortOrder: 99 }), id);
    definitions.push(definition);
  }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('benmi-worker-official/src/modules/menu.ts', 'utf8') + '\nexport {syncMenuToD1};', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, Date, JSON, Map, Set, Response, Request, URL,
    crypto: require('node:crypto').webcrypto,
    require: name => name.includes('option-groups') ? f.api : name.includes('operating-shifts') ? getOperatingShiftsExports() : name.includes('http') ? {
      json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
    } : name.includes('bootstrap') ? {
      invalidateBootstrapCache: async tenant => f.deleted.push('bootstrap:' + tenant),
    } : { getTenantId: request => new URL(request.url).searchParams.get('tenant_id') },
  });
  const groupPayload = (id, position) => ({ id, key: id, scope: 'order', sortOrder: position, options: [] });
  return { ...f, definitions, groupPayload,
    sync: data => exports.syncMenuToD1('a', data, f.env),
    update: data => exports.updateMenu(new Request('https://test.invalid/api/menu?tenant_id=a', {
      method: 'POST', body: JSON.stringify(data),
    }), f.env),
  };
}

test('one aggregate position and inner group order persist without changing configuration or other tenants', async () => {
  const f = await setup(), before = await f.api.loadOptionCatalog(f.env, 'a');
  const foreign = f.db.prepare('SELECT * FROM modifier_groups WHERE id=?').get('b_notes');
  const response = await f.update({ a_food: { __sort_order: 2 }, __customizations: { id: 'a_sec-flavor', sortOrder: 3, groups: [
    f.groupPayload('a_utensils', 4), f.groupPayload('a_notes', 1),
    { ...f.groupPayload('a_item', 7), scope: 'item' },
  ] } });
  assert.equal(response.status, 200, await response.clone().text());
  const after = await f.api.loadOptionCatalog(f.env, 'a');
  for (const [id, position] of [['a_utensils', 4], ['a_notes', 1]]) {
    const old = before.groups.find(g => g.id === id), current = after.groups.find(g => g.id === id);
    const { revision, sortOrder, ...unchanged } = current;
    const { revision: oldRevision, sortOrder: oldOrder, ...original } = old;
    assert.deepEqual(unchanged, original);
    assert.equal(revision, oldRevision + 1);
    assert.equal(sortOrder, position);
    assert.equal(current.metadata.displaySortOrder, 99);
    assert.equal(current.displaySortOrder, undefined);
  }
  assert.deepEqual(after.products, before.products);
  assert.deepEqual(after.links, before.links);
  assert.deepEqual(after.categoryLinks, before.categoryLinks);
  assert.deepEqual(after.groups.find(g => g.id === 'a_item'), before.groups.find(g => g.id === 'a_item'));
  assert.deepEqual(f.db.prepare('SELECT * FROM modifier_groups WHERE id=?').get('b_notes'), foreign);
  assert.equal(after.categories.find(c => c.id === 'a_food').sort_order, 2);
  assert.equal(after.categories.some(c => c.category_type === 'order_customization'), false);
  const aggregate = f.db.prepare("SELECT * FROM menu_categories WHERE tenant_id='a' AND category_type='order_customization'").get();
  assert.equal(aggregate.id, 'a_sec-flavor');
  assert.equal(aggregate.sort_order, 3);
  assert.ok(f.deleted.includes('bootstrap:a'));
  assert.ok(f.deleted.includes('tenant:a:menu'));

  // Execute the exact order-group query used by bootstrap, rather than recreating its ordering.
  const source = fs.readFileSync('benmi-worker-official/src/modules/bootstrap.ts', 'utf8');
  const query = source.match(/`(SELECT g\.id AS group_id,[\s\S]+?WHERE g\.tenant_id = \? AND g\.scope = 'order'[\s\S]+?)`/)[1];
  const rows = f.db.prepare(query).all('a');
  assert.deepEqual(rows.map(row => row.group_id), ['a_notes', 'a_utensils']);
  assert.equal(rows.some(row => row.display_sort_order !== undefined), false);
});

test('existing aggregate identity and settings are retained across repeated saves', async () => {
  const f = await setup();
  f.db.prepare("INSERT INTO menu_categories(id,tenant_id,slug,name,short_name,category_type,sort_order,allow_customization,applied_modifiers) VALUES (?,?,?,?,?,'order_customization',5,1,'[]')")
    .run('a_flavor_existing', 'a', 'sec-flavor', 'Existing title', 'Existing short');
  const payload = { __customizations: { id: 'a_flavor_existing', sortOrder: 0, groups: [f.groupPayload('a_notes', 4)] } };
  await f.sync(payload);
  const before = await f.api.loadOptionCatalog(f.env, 'a');
  await f.sync({ __customizations: { ...payload.__customizations, id: 'a_sec-flavor' } });
  const unchanged = await f.api.loadOptionCatalog(f.env, 'a');
  assert.equal(unchanged.revision, before.revision);
  assert.deepEqual(unchanged.categories, before.categories);
  assert.equal(unchanged.categories.some(c => c.category_type === 'order_customization'), false);
  const section = f.db.prepare("SELECT * FROM menu_categories WHERE tenant_id='a' AND category_type='order_customization'").get();
  assert.equal(section.name, 'Existing title');
  assert.equal(section.short_name, 'Existing short');
  assert.equal(section.allow_customization, 1);
  assert.equal(section.sort_order, 0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM menu_categories WHERE tenant_id='a' AND category_type='order_customization'").get().n, 1);
  const group = before.groups.find(g => g.id === 'a_notes');
  const stale = await f.save('group', f.definitions.find(g => g.id === group.id));
  assert.equal(stale.status, 409);
  const saved = await f.save('group', { ...group, itemIds: [], name: 'Updated notes' });
  assert.equal(saved.status, 200, await saved.clone().text());
  const after = await f.api.loadOptionCatalog(f.env, 'a');
  assert.equal(after.groups.find(g => g.id === group.id).sortOrder, 4);
  assert.equal(after.groups.find(g => g.id === group.id).metadata.displaySortOrder, 99);
});

test('invalid ranks, foreign IDs and per-item groups disguised as order groups reject the entire update', async () => {
  const f = await setup();
  const badGroups = [['a_notes', -1], ['a_notes', 1.5], ['a_notes', '2'], ['a_notes', null], ['a_item', 2], ['b_notes', 2]]
    .map(([id, rank]) => ({ sortOrder: 3, groups: [f.groupPayload('a_utensils', 1), f.groupPayload(id, rank)] }));
  const badSections = [-1, 1.5, '2', null].map(sortOrder => ({ sortOrder, groups: [f.groupPayload('a_notes', 1)] }));
  badSections.push({ id: 'b_sec-flavor', sortOrder: 1, groups: [f.groupPayload('a_notes', 1)] });
  for (const section of [...badGroups, ...badSections]) {
    const before = await f.api.loadOptionCatalog(f.env, 'a');
    await assert.rejects(() => f.sync({ a_food: { __sort_order: 9 }, __customizations: section }));
    assert.deepEqual(await f.api.loadOptionCatalog(f.env, 'a'), before);
  }
});

test('obsolete display metadata is ignored and per-item-only menus do not create an aggregate', async () => {
  const f = await setup(), before = await f.api.loadOptionCatalog(f.env, 'a');
  await f.sync({ __customizations: { sortOrder: 3, groups: [{ ...f.groupPayload('a_item', 9), scope: 'item' }] } });
  assert.deepEqual(await f.api.loadOptionCatalog(f.env, 'a'), before);
  await f.sync({ __customizations: { groups: [{ id: 'a_notes', key: 'a_notes', scope: 'order', displaySortOrder: -1, options: [] }] } });
  assert.deepEqual(await f.api.loadOptionCatalog(f.env, 'a'), before);
});

test('transaction failure rolls back aggregate creation, category positions and every inner rank', async () => {
  const f = await setup(), before = await f.api.loadOptionCatalog(f.env, 'a');
  f.db.exec("CREATE TRIGGER fail_position BEFORE UPDATE ON modifier_groups WHEN NEW.id='a_notes' BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END;");
  await assert.rejects(() => f.sync({ a_food: { __sort_order: 9 }, __customizations: { sortOrder: 3, groups: [f.groupPayload('a_utensils', 1), f.groupPayload('a_notes', 3)] } }), /TEST_FAILURE/);
  assert.deepEqual(await f.api.loadOptionCatalog(f.env, 'a'), before);
});

test('catalog version guard rejects concurrent writes before committing the draft order', async () => {
  const f = await setup(), batch = f.env.DB.batch.bind(f.env.DB);
  const initialUtensilsSort = f.db.prepare("SELECT sort_order FROM modifier_groups WHERE id='a_utensils'").get().sort_order;
  let raced = false;
  f.env.DB.batch = async statements => {
    if (!raced && statements[0].sql.startsWith('INSERT INTO menu_write_guards')) {
      raced = true;
      f.db.prepare("UPDATE modifier_groups SET name='Concurrent name',revision=revision+1 WHERE id='a_notes'").run();
    }
    return batch(statements);
  };
  const response = await f.update({ __customizations: { sortOrder: 3, groups: [f.groupPayload('a_utensils', 5), f.groupPayload('a_notes', 3)] } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'MENU_CONFLICT');
  assert.equal(f.db.prepare("SELECT count(*) n FROM menu_categories WHERE category_type='order_customization'").get().n, 0);
  assert.equal(f.db.prepare("SELECT sort_order FROM modifier_groups WHERE id='a_utensils'").get().sort_order, initialUtensilsSort);
  assert.equal(f.db.prepare("SELECT name FROM modifier_groups WHERE id='a_notes'").get().name, 'Concurrent name');
});

test('version guard also covers concurrent rank changes during the preflight reads', async () => {
  const f = await setup(), prepare = f.env.DB.prepare.bind(f.env.DB);
  let raced = false;
  f.env.DB.prepare = sql => {
    const statement = prepare(sql), all = statement.all.bind(statement);
    if (sql.startsWith('SELECT id,scope,sort_order FROM modifier_groups')) statement.all = async () => {
      const result = await all();
      if (!raced) {
        raced = true;
        f.db.prepare("UPDATE modifier_groups SET sort_order=8,revision=revision+1 WHERE id='a_notes'").run();
      }
      return result;
    };
    return statement;
  };
  await assert.rejects(() => f.sync({ __customizations: { sortOrder: 3, groups: [f.groupPayload('a_notes', 1)] } }), /CHECK constraint/);
  assert.equal(f.db.prepare("SELECT sort_order FROM modifier_groups WHERE id='a_notes'").get().sort_order, 8);
  assert.equal(f.db.prepare("SELECT count(*) n FROM menu_categories WHERE category_type='order_customization'").get().n, 0);
});

function customerMenu(customizations, overrides = {}, currentLocale) {
  const doc = { createElement(tag) { const el = new Element(tag, doc); el.style = {}; return el; } };
  doc.body = doc.createElement('body');
  doc.getElementById = id => doc.body.querySelector('#' + id);
  doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
  for (const id of ['main-nav', 'catalog-sections']) { const el = doc.createElement('div'); el.id = id; doc.body.appendChild(el); }
  const context = { document: doc, console,
    escapeHtml: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    bootstrapData: { customizationSortOrder: 0, customizationTitle: 'Global options', customizationShortName: 'Options',
      customizations, catalog: [{ slug: 'food', name: 'Food', sortOrder: 2, items: [] }, { slug: 'drinks', name: 'Drinks', sortOrder: 4, items: [] }], ...overrides },
    currentLocale,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/client-menu.js', 'utf8'), context);
  context.renderDynamicCatalog();
  return { doc, sections: doc.getElementById('catalog-sections').children, nav: doc.getElementById('main-nav') };
}
const customerGroup = (id, sortOrder) => ({ id, key: id, title: id, scope: 'order', type: 'radio',
  ...(sortOrder === undefined ? {} : { sortOrder }), displaySortOrder: 99,
  options: [{ id: id + '_option', name: 'Option', price: 3, is_default: true }],
});

test('customer has one flavor section and one nav tab with sorted groups, retaining option names and prices', () => {
  const app = customerMenu([customerGroup('餐具', 4), customerGroup('Ghi chú', 1), { ...customerGroup('Topping', 0), scope: 'item' }], { customizationSortOrder: 3 });
  assert.deepEqual(app.sections.map(s => s.id), ['sec-food', 'sec-order-option', 'sec-drinks']);
  assert.deepEqual(app.nav.children.map(el => el.textContent), ['Food', '口味選擇', 'Drinks', '結帳']);
  const group = app.sections[1];
  assert.equal(group.querySelector('.section-title').textContent, '口味選擇');
  assert.deepEqual(group.querySelectorAll('.custom-label').map(el => el.textContent), ['Ghi chú', '餐具']);
  const input = group.querySelector('input');
  assert.equal(input.getAttribute('name'), 'opt-Ghi chú');
  assert.equal(input.dataset.price, '3');
  assert.equal(input.checked, true);
});

test('legacy groups and obsolete display positions use the aggregate default rank and stable inner order', () => {
  const app = customerMenu([{ ...customerGroup('second', 2), scope: undefined }, customerGroup('first', 1), customerGroup('Last', 5)], { customizationSortOrder: undefined });
  assert.deepEqual(app.sections.map(s => s.id), ['sec-order-option', 'sec-food', 'sec-drinks']);
  assert.deepEqual(app.sections[0].querySelectorAll('.custom-label').map(el => el.textContent), ['first', 'second', 'Last']);
});

test('customer aggregate title supports Vietnamese and is absent when there are no order groups', () => {
  const vi = customerMenu([customerGroup('Ghi chú', 1)], { tenant: { locale: 'vi' } });
  assert.equal(vi.sections[0].querySelector('.section-title').textContent, 'Tùy chọn khẩu vị');
  assert.equal(vi.nav.children[0].textContent, 'Tùy chọn khẩu vị');
  const zh = customerMenu([customerGroup('餐具', 1)], { tenant: { locale: 'vi' } }, 'zh-TW');
  assert.equal(zh.sections[0].querySelector('.section-title').textContent, '口味選擇');
  for (const groups of [[], [{ ...customerGroup('Topping', 1), scope: 'item' }]]) {
    const app = customerMenu(groups);
    assert.deepEqual(app.sections.map(s => s.id), ['sec-food', 'sec-drinks']);
    assert.deepEqual(app.nav.children.map(el => el.textContent), ['Food', 'Drinks', '結帳']);
  }
});
