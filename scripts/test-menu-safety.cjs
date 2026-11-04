const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { loadMenuEditor } = require('../tests/helpers/menu-editor-loader.cjs');
const { DatabaseSync } = require('node:sqlite');
const ts = require('../benmi-worker-official/node_modules/typescript');
const source = fs.readFileSync('benmi-worker-official/src/modules/menu.ts', 'utf8');
const compiled = ts.transpileModule(source.slice(source.indexOf('function validateMenuUpdate'), source.indexOf('export async function updateMenu')), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const backend = vm.createContext({ unifiedMenuEnabled: env => env.UNIFIED_MENU_ENABLED === 'true' });
vm.runInContext(compiled, backend);
const migration0061Sql = fs.readFileSync('benmi-worker-official/migrations/0061_unified_bundle_and_customization_schema.sql', 'utf8');
const migration0063Sql = fs.readFileSync('benmi-worker-official/migrations/0063_clean_customizations_and_category_links.sql', 'utf8');
const migration0064Sql = fs.readFileSync('benmi-worker-official/migrations/0064_add_modifier_migration_metadata.sql', 'utf8');
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE menu_categories(id TEXT PRIMARY KEY, tenant_id TEXT, slug TEXT, name TEXT, short_name TEXT, category_type TEXT, allow_customization INTEGER, applied_modifiers TEXT, sort_order INTEGER, UNIQUE(tenant_id,slug));
    CREATE TABLE menu_items(id TEXT PRIMARY KEY, tenant_id TEXT, category_id TEXT REFERENCES menu_categories(id) ON DELETE RESTRICT, name TEXT, price REAL, badge_text TEXT, is_recommended INTEGER, sort_order INTEGER);
    CREATE TABLE menu_customizations(id TEXT PRIMARY KEY, tenant_id TEXT, key TEXT, title TEXT, type TEXT, sort_order INTEGER, options_json TEXT, updated_at TEXT, UNIQUE(tenant_id,key));`);
  db.exec(migration0061Sql);
  db.exec(migration0063Sql);
  db.exec(migration0064Sql);
  for (const tenant of ['a', 'b']) {
    db.prepare('INSERT INTO menu_categories(id,tenant_id,slug,category_type) VALUES(?,?,?,?)').run(`${tenant}_food`,tenant,'food','catalog');
    db.prepare('INSERT INTO menu_categories(id,tenant_id,slug,category_type) VALUES(?,?,?,?)').run(`${tenant}_custom`,tenant,'sec-flavor','order_customization');
    db.prepare('INSERT INTO menu_items(id,tenant_id,category_id,name,price) VALUES(?,?,?,?,?)').run(`${tenant}_one`,tenant,`${tenant}_food`,'One',10);
    for (const key of ['flavor','salt']) db.prepare('INSERT INTO menu_customizations(id,tenant_id,key,options_json) VALUES(?,?,?,?)').run(`custom_${tenant}_${key}`,tenant,key,'[{"name":"Normal"}]');
  }
  const adapter = {
    prepare(sql) { return { bind(...args) { return { sql, args, async all() { return { results: db.prepare(sql).all(...args) }; } }; } }; },
    async batch(statements) { db.exec('BEGIN'); try { for (const {sql,args} of statements) db.prepare(sql).run(...args); db.exec('COMMIT'); } catch(e) { db.exec('ROLLBACK'); throw e; } }
  };
  return {
    db,
    save: data => backend.syncMenuToD1('a',data,{DB:adapter}),
    dump: () => JSON.stringify(['menu_categories','menu_items','menu_customizations','modifier_groups','modifier_options','item_modifier_links'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY ${table === 'item_modifier_links' ? 'tenant_id, item_id, group_id' : 'id'}`).all())),
    dumpTenant: (t) => JSON.stringify(['menu_categories','menu_items','menu_customizations','modifier_groups','modifier_options','item_modifier_links'].map(table => db.prepare(`SELECT * FROM ${table} WHERE tenant_id = ? ORDER BY ${table === 'item_modifier_links' ? 'tenant_id, item_id, group_id' : 'id'}`).all(t)))
  };
}
test('price-only update and empty payload preserve omitted rows and customization category', async () => {
  const f=fixture(); await f.save({food:{One:{id:'a_one',price:20}}}); await f.save({});
  assert.equal(f.db.prepare('SELECT price FROM menu_items WHERE id=?').get('a_one').price,20);
  assert.equal(f.db.prepare('SELECT count(*) n FROM menu_customizations').get().n,4);
  assert.equal(f.db.prepare('SELECT count(*) n FROM menu_categories').get().n,4);
});
test('empty customization list is not a deletion instruction', async () => {
  const f=fixture(); const before=f.dump(); await f.save({__customizations:{groups:[]}}); assert.equal(f.dump(),before);
});
test('malformed customization requests cannot write even valid price changes', async () => {
  for (const value of [null,{},'bad',{groups:null},{groups:[{}]},{groups:[{key:'flavor',options:null}]},{groups:[{key:'flavor',options:[{name:'Normal',price:'bad'}]}]}]) {
    const f=fixture(); const before=f.dump(); await assert.rejects(f.save({food:{One:99},__customizations:value})); assert.equal(f.dump(),before);
  }
});
test('explicit deletion removes only the specified group', async () => {
  const f=fixture(); await f.save({__delete:{customizations:['custom_a_flavor']}});
  assert.equal(f.db.prepare('SELECT count(*) n FROM menu_customizations').get().n,3);
  assert.ok(f.db.prepare('SELECT id FROM menu_customizations WHERE id=?').get('custom_b_flavor'));
});
test('category deletion removes its children, preserves other tenant and customization', async () => {
  const f=fixture(); await f.save({__delete:{categories:['a_food']}});
  assert.equal(f.db.prepare('SELECT count(*) n FROM menu_items').get().n,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM menu_customizations').get().n,4);
});
test('foreign IDs and conflicting deletions fail before writing', async () => {
  for (const data of [{__delete:{items:['b_one']}},{__delete:{categories:['b_food']}},{__delete:{customizations:['custom_b_salt']}},{food:{One:{id:'b_one',price:1}}},{food:{One:1},__delete:{categories:['a_food']}}]) {
    const f=fixture(); const before=f.dump(); await assert.rejects(f.save(data)); assert.equal(f.dump(),before);
  }
});
test('renaming an item keeps its ID and does not duplicate it', async () => {
  const f=fixture(); await f.save({food:{Renamed:{id:'a_one',price:15}}});
  assert.equal(f.db.prepare('SELECT count(*) n FROM menu_items').get().n,2);
  assert.equal(f.db.prepare('SELECT name FROM menu_items WHERE id=?').get('a_one').name,'Renamed');
});
test('database error rolls back the entire batch', async () => {
  const f=fixture(); const before=f.dump();
  f.db.exec("CREATE TRIGGER reject_delete BEFORE DELETE ON menu_customizations BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  await assert.rejects(f.save({food:{One:99},__delete:{customizations:['custom_a_salt']}})); assert.equal(f.dump(),before);
});
function editor() {
  const requests=[]; const alerts=[]; const body={textContent:'',appendChild(){},classList:{add(){},remove(){}}};
  const context=vm.createContext({console,Date,Set,JSON,crypto:require('node:crypto').webcrypto,alert:m=>alerts.push(m),confirm:()=>true,t:k=>k,WORKER_BASE:'https://example.test',getTenantIdFromUrl:()=> 'a',
    window:{addEventListener(){}},document:{addEventListener(){},getElementById:id=>id==='menu-editor-body'?body:null,querySelectorAll:()=>[],createElement:()=>({style:{},addEventListener(){}})},
    fetch:async(url,options)=>{requests.push({url,...options});return {ok:true,json:async()=>({})}},localStorage:{removeItem(){}}});
  loadMenuEditor(context);
  vm.runInContext('renderMenuCategories=()=>{}; renderMenuCategoryEditor=()=>{};',context);
  return {context,requests,alerts,run:code=>vm.runInContext(code,context)};
}
test('incomplete bootstrap cannot save or delete, no legacy fallback', async()=>{
  const e=editor(); await e.run('loadMenuData()');
  await e.run('saveMenuData(true)'); await e.run('deleteCategoryAtIndex(0)');
  assert.equal(e.requests.length,3); assert.ok(e.requests.every(r=>!r.method)); assert.match(e.requests[0].url,/bootstrap/);
  assert.equal(e.run('isMenuLoadedCompletely'),false);
});
test('category delete sends one deletion-only request and preserves unsaved edits',async()=>{
  const e=editor(); e.run(`isMenuLoadedCompletely=true; currentMenuData=[{id:'food',databaseId:'a_food',items:[{id:'a_one',name:'One',price:10}]},{id:'other',items:[]}]; clearMenuDirty(); currentMenuData[1].title='Unsaved';`);
  await e.run('deleteCategoryAtIndex(0)'); assert.equal(e.requests.length,1);
  assert.deepEqual(JSON.parse(e.requests[0].body),{__delete:{categories:['a_food'],items:[],customizations:[]}});
  assert.equal(e.run('currentMenuData[0].title'),'Unsaved'); assert.equal(e.run('isMenuDirty'),true);
});
test('group/item removal produces explicit IDs, rename does not delete',()=>{
  const e=editor(); const result=e.run(`getMenuDeletions([{id:'food',items:[{id:'a_one',name:'One'}]},{id:'sec',groups:[{id:'custom_a_salt'}]}],[{id:'food',items:[{id:'a_one',name:'Renamed'}]},{id:'sec',groups:[]}])`);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{categories:[],items:[],customizations:['custom_a_salt']});
});
test('new item with an old name gets a distinct stable ID',()=>{
  const e=editor(); e.run(`currentMenuData=[{id:'food',items:[{id:'a_food_One',name:'Renamed',price:10},{name:'One',price:20}]}]; serializeMenuData(currentMenuData);`);
  const id=e.run('currentMenuData[0].items[1].id'); assert.notEqual(id,'a_food_One');
  e.run('serializeMenuData(currentMenuData)'); assert.equal(e.run('currentMenuData[0].items[1].id'),id);
});
test('customization-only data can be saved then its new section explicitly deleted',async()=>{
  const f=fixture(); f.db.prepare('DELETE FROM menu_categories WHERE id=?').run('a_custom');
  const e=editor(); e.run(`currentMenuData=[{id:'sec-flavor',databaseId:null,type:'order_customization',groups:[{id:'custom_a_flavor',key:'flavor',options:[{name:'Normal',price:0}]}]}]`);
  const payload=JSON.parse(JSON.stringify(e.run('serializeMenuData(currentMenuData)'))); await f.save(payload);
  const deletions=JSON.parse(JSON.stringify(e.run('getMenuDeletions(currentMenuData,[])')));
  assert.deepEqual(deletions.categories,[]);
  assert.deepEqual(deletions.customizations,['custom_a_flavor']);
  await f.save({__delete:deletions});
  assert.equal(f.db.prepare('SELECT id FROM menu_customizations WHERE id=?').get('custom_a_flavor'),undefined);
});
test('successful empty complete bootstrap permits creating a menu',async()=>{
  const e=editor(); e.context.fetch=async()=>({ok:true,json:async()=>({menuComplete:true,catalog:[],modifiers:[],complete:true,groups:[]})});
  await e.run('loadMenuData()'); assert.equal(e.run('isMenuLoadedCompletely'),true); assert.equal(e.run('currentMenuData.length'),0);
});
test('updating one customization group preserves omitted groups',async()=>{
  const f=fixture(); await f.save({__customizations:{groups:[{id:'custom_a_flavor',key:'flavor',options:[{name:'New',price:0}]}]}});
  assert.equal(f.db.prepare('SELECT count(*) n FROM menu_customizations').get().n,4);
  assert.equal(f.db.prepare('SELECT options_json FROM menu_customizations WHERE id=?').get('custom_a_salt').options_json,'[{"name":"Normal"}]');
});
test('explicit item removal preserves its category and other tenant',async()=>{
  const f=fixture(); await f.save({__delete:{items:['a_one']}});
  assert.equal(f.db.prepare('SELECT count(*) n FROM menu_items').get().n,1);
  assert.ok(f.db.prepare('SELECT id FROM menu_categories WHERE id=?').get('a_food'));
});

// ============================================================================
// T1: Ownership & Atomic Menu Write Tests
// ============================================================================

test('T1: Tenant A sending Tenant B modifier group ID is rejected and B is untouched', async () => {
  const f = fixture();
  f.db.prepare('INSERT INTO modifier_groups(id,tenant_id,name) VALUES(?,?,?)').run('mg_b_sec', 'b', 'Secret B');
  f.db.prepare('INSERT INTO modifier_options(id,tenant_id,group_id,name,price) VALUES(?,?,?,?,?)').run('mo_b_sec', 'b', 'mg_b_sec', 'Opt B', 10);
  const beforeB = f.dumpTenant('b');

  await assert.rejects(
    f.save({ food: { One: { id: 'a_one', price: 10, modifier_groups: [{ id: 'mg_b_sec', name: 'Hijacked' }] } } }),
    /FORBIDDEN_MODIFIER_GROUP_ID/
  );
  assert.equal(f.dumpTenant('b'), beforeB);
});

test('T1: Tenant A sending Tenant B modifier option ID is rejected and B is untouched', async () => {
  const f = fixture();
  f.db.prepare('INSERT INTO modifier_groups(id,tenant_id,name) VALUES(?,?,?)').run('mg_b_sec', 'b', 'Secret B');
  f.db.prepare('INSERT INTO modifier_options(id,tenant_id,group_id,name,price) VALUES(?,?,?,?,?)').run('mo_b_sec', 'b', 'mg_b_sec', 'Opt B', 10);
  const beforeB = f.dumpTenant('b');

  await assert.rejects(
    f.save({ food: { One: { id: 'a_one', price: 10, modifier_groups: [{ id: 'mg_a_new', name: 'Group A', options: [{ id: 'mo_b_sec', name: 'Hijacked Opt' }] }] } } }),
    /FORBIDDEN_MODIFIER_OPTION_ID/
  );
  assert.equal(f.dumpTenant('b'), beforeB);
});

test('T1: Option belonging to tenant but wrong group is rejected', async () => {
  const f = fixture();
  f.db.prepare('INSERT INTO modifier_groups(id,tenant_id,name) VALUES(?,?,?)').run('mg_a_1', 'a', 'Group 1');
  f.db.prepare('INSERT INTO modifier_groups(id,tenant_id,name) VALUES(?,?,?)').run('mg_a_2', 'a', 'Group 2');
  f.db.prepare('INSERT INTO modifier_options(id,tenant_id,group_id,name,price) VALUES(?,?,?,?,?)').run('mo_a_opt1', 'a', 'mg_a_1', 'Option 1', 5);

  await assert.rejects(
    f.save({ food: { One: { id: 'a_one', price: 10, modifier_groups: [{ id: 'mg_a_2', name: 'Group 2', options: [{ id: 'mo_a_opt1', name: 'Option 1' }] }] } } }),
    /INVALID_MODIFIER_OPTION_GROUP/
  );
});

test('T1: Duplicate option ID within group and conflicting group configs in payload are rejected', async () => {
  const f = fixture();
  // Duplicate option ID inside same group
  await assert.rejects(
    f.save({ food: { One: { id: 'a_one', price: 10, modifier_groups: [{ name: 'G1', options: [{ id: 'mo_dup', name: 'O1' }, { id: 'mo_dup', name: 'O2' }] }] } } }),
    /DUPLICATE_MODIFIER_OPTION_ID/
  );
  // Conflicting group config for same group ID
  await assert.rejects(
    f.save({ food: {
      One: { id: 'a_one', price: 10, modifier_groups: [{ id: 'mg_conflict', name: 'Config A', selection_type: 'single' }] },
      Two: { price: 20, modifier_groups: [{ id: 'mg_conflict', name: 'Config B', selection_type: 'multiple' }] }
    } }),
    /CONFLICTING_MODIFIER_GROUP_CONFIG/
  );
});

test('T1: Omitted modifier_groups preserves links while [] explicitly removes them', async () => {
  const f = fixture();
  // First save: add a group
  await f.save({ food: { One: { id: 'a_one', price: 10, modifier_groups: [{ id: 'mg_a_keep', name: 'Keep Me', options: [{ id: 'mo_a_keep', name: 'Opt 1', price: 5 }] }] } } });
  assert.equal(f.db.prepare('SELECT count(*) n FROM item_modifier_links WHERE tenant_id=?').get('a').n, 1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM modifier_groups WHERE tenant_id=?').get('a').n, 1);

  // Second save: omit modifier_groups (e.g. price update only)
  await f.save({ food: { One: { id: 'a_one', price: 25 } } });
  assert.equal(f.db.prepare('SELECT price FROM menu_items WHERE id=?').get('a_one').price, 25);
  assert.equal(f.db.prepare('SELECT count(*) n FROM item_modifier_links WHERE tenant_id=?').get('a').n, 1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM modifier_groups WHERE tenant_id=?').get('a').n, 1);

  // Third save: explicit [] clears the link but keeps the group available in the library.
  await f.save({ food: { One: { id: 'a_one', price: 25, modifier_groups: [] } } });
  assert.equal(f.db.prepare('SELECT count(*) n FROM item_modifier_links WHERE tenant_id=?').get('a').n, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM modifier_groups WHERE tenant_id=?').get('a').n, 1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM modifier_options WHERE tenant_id=?').get('a').n, 1);
});

test('T1: Options in two distinct groups with identical name are stored with respective prices', async () => {
  const f = fixture();
  await f.save({
    food: {
      One: {
        id: 'a_one',
        price: 50,
        modifier_groups: [
          { id: 'mg_g1', name: 'Group 1', options: [{ id: 'mo_opt_g1', name: 'Thêm', price: 15 }] },
          { id: 'mg_g2', name: 'Group 2', options: [{ id: 'mo_opt_g2', name: 'Thêm', price: 25 }] }
        ]
      }
    }
  });
  const opt1 = f.db.prepare('SELECT price FROM modifier_options WHERE id=?').get('mo_opt_g1');
  const opt2 = f.db.prepare('SELECT price FROM modifier_options WHERE id=?').get('mo_opt_g2');
  assert.equal(opt1.price, 15);
  assert.equal(opt2.price, 25);
});

test('T1: Database error during modifier persistence rolls back the entire batch atomically', async () => {
  const f = fixture();
  const before = f.dump();
  f.db.exec("CREATE TRIGGER reject_mod BEFORE INSERT ON modifier_groups BEGIN SELECT RAISE(ABORT,'simulated modifier failure'); END;");
  await assert.rejects(
    f.save({ food: { One: { id: 'a_one', price: 99, modifier_groups: [{ name: 'Failing Group' }] } } })
  );
  assert.equal(f.dump(), before);
});

// ============================================================================
// T2: Bootstrap Completeness, Cache & Draft Preservation Tests
// ============================================================================

test('T2: POS dirty draft is preserved when menu reload fails', async () => {
  const e = editor();
  // Simulate an initialized editor with dirty draft edits
  e.run(`
    isMenuLoadedCompletely = true;
    currentMenuData = [{ id: 'food', databaseId: 'a_food', items: [{ id: 'a_one', name: 'One', price: 50 }] }];
    clearMenuDirty();
    currentMenuData[0].items[0].price = 99;
    markMenuDirty();
  `);
  assert.equal(e.run('isMenuDirty'), true);
  assert.equal(e.run('currentMenuData[0].items[0].price'), 99);

  // Background reload fails (e.g. network outage or incomplete menu from server)
  e.context.fetch = async () => ({ ok: false, status: 500 });
  await e.run('loadMenuData()');

  // Assert: draft is NOT wiped out, dirty state is kept, but save is blocked
  assert.notEqual(e.run('currentMenuData'), null);
  assert.equal(e.run('currentMenuData[0].items[0].price'), 99);
  assert.equal(e.run('isMenuDirty'), true);
  assert.equal(e.run('isMenuLoadedCompletely'), false);

  // Attempting to save while incomplete must be blocked
  await e.run('saveMenuData(true)');
  assert.equal(e.alerts.length, 1);
  assert.equal(e.alerts[0], 'menuIncompleteReload');
});

test('T2: Item with undefined modifierGroups does not serialize modifier_groups: []', () => {
  const e = editor();
  e.run(`
    currentMenuData = [{
      id: 'food',
      items: [
        { id: 'a_one', name: 'Untouched Modifiers', price: 10 },
        { id: 'a_two', name: 'Explicitly Cleared', price: 20, modifierGroups: [] },
        { id: 'a_three', name: 'Explicitly Has Modifiers', price: 30, modifierGroups: [{ id: 'mg_1', name: 'G1' }] }
      ]
    }];
  `);
  const serialized = e.run('serializeMenuData(currentMenuData)');
  const item1 = serialized.food['Untouched Modifiers'];
  const item2 = serialized.food['Explicitly Cleared'];
  const item3 = serialized.food['Explicitly Has Modifiers'];

  // Untouched item MUST NOT have modifier_groups field
  assert.equal(Object.prototype.hasOwnProperty.call(item1, 'modifier_groups'), false);
  // Explicitly cleared item MUST have modifier_groups: []
  assert.deepEqual(JSON.parse(JSON.stringify(item2.modifier_groups)), []);
  // Explicitly configured item MUST have modifier_groups array
  assert.deepEqual(JSON.parse(JSON.stringify(item3.modifier_groups)), [{ id: 'mg_1', name: 'G1' }]);
});

test('T2: Incomplete bootstrap (menuComplete=false) blocks saving and notifies user', async () => {
  const e = editor();
  e.context.fetch = async () => ({
    ok: true,
    json: async () => ({
      menuComplete: false,
      catalog: [{ id: 'c1', slug: 'food', name: 'Food', items: [] }],
      modifiers: []
    })
  });
  await e.run('loadMenuData()');
  assert.equal(e.run('isMenuLoadedCompletely'), false);
  assert.equal(e.run('currentMenuData'), null);

  await e.run('saveMenuData(true)');
  assert.equal(e.alerts.length, 1);
  assert.equal(e.alerts[0], 'menuIncompleteReload');
});

test('T5: POS surfaces a machine-readable menu validation code from HTTP 400', async () => {
  const e = editor();
  e.run(`isMenuLoadedCompletely = true; currentMenuData = [{id:'food',items:[{id:'a_one',name:'One',price:10}]}]; clearMenuDirty();`);
  e.context.fetch = async () => ({ ok:false, status:400, json:async()=>({code:'CONFLICTING_MODIFIER_OPTION_CONFIG'}) });
  await e.run('saveMenuData(true)');
  assert.equal(e.alerts.at(-1), 'menuSaveFailAPI returned 400 (CONFLICTING_MODIFIER_OPTION_CONFIG)');
});

test('T2: Complete bootstrap (menuComplete=true) enables saving and preserves modifierGroups', async () => {
  const e = editor();
  e.context.fetch = async () => ({
    ok: true,
    json: async () => ({
      bootstrapVersion: 2,
      complete: true, groups: [],
      menuComplete: true,
      catalog: [{
        id: 'c1',
        slug: 'food',
        name: 'Food',
        items: [{
          id: 'i1',
          name: 'Burger',
          price: 100,
          modifierGroups: [{ id: 'mg_spice', name: 'Spiciness' }]
        }]
      }],
      modifiers: []
    })
  });
  await e.run('loadMenuData()');
  assert.equal(e.run('isMenuLoadedCompletely'), true);
  assert.notEqual(e.run('currentMenuData'), null);
  assert.equal(e.run('currentMenuData[0].items[0].name'), 'Burger');
  assert.deepEqual(e.run('currentMenuData[0].items[0].modifierGroups'), [{ id: 'mg_spice', name: 'Spiciness' }]);
});

test('T4: POS preserves minSelection and maxSelection when renaming multiple group without resetting to 1/99', async () => {
  const e = editor();
  e.run(`
    isMenuLoadedCompletely = true;
    currentMenuData = [{
      id: 'food',
      slug: 'food',
      name: 'Food',
      items: [{
        id: 'i1',
        name: 'Burger',
        price: 100,
        modifierGroups: [{
          id: 'mg_multi',
          name: 'Toppings',
          selectionType: 'multiple',
          isRequired: true,
          minSelection: 2,
          maxSelection: 4,
          options: [{ id: 'opt_1', name: 'Cheese', price: 10, isDefault: false }]
        }]
      }]
    }];
    openItemModifiersModal(0, 0);
    tempItemModifierGroups[0].name = "Extra Toppings";
    saveItemModifiersModal();
  `);

  const updatedGroup = e.run('currentMenuData[0].items[0].modifierGroups[0]');
  assert.equal(updatedGroup.name, 'Extra Toppings');
  assert.equal(updatedGroup.minSelection, 2, 'minSelection must be preserved as 2, not reset to 1');
  assert.equal(updatedGroup.maxSelection, 4, 'maxSelection must be preserved as 4, not reset to 99');
  assert.equal(updatedGroup.isRequired, true);
});

test('T4: validateModifierDraft enforces bounds: allows valid multiple selection, blocks under min, blocks over max', () => {
  const domSandbox = vm.createContext({
    window: {},
    document: {
      createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
      body: { style: {}, appendChild: () => {} }
    }
  });
  domSandbox.window.window = domSandbox.window;
  const custJs = fs.readFileSync('js/client-customizations.js', 'utf8');
  vm.runInContext(custJs, domSandbox);

  const validateFn = domSandbox.window.validateModifierDraft;
  assert.equal(typeof validateFn, 'function');

  const testGroup = {
    id: 'grp_sides',
    slug: 'sides',
    name: 'Sides',
    selectionType: 'multiple',
    isRequired: true,
    minSelection: 2,
    maxSelection: 3,
    options: [
      { id: 'opt_1', name: 'Fries', price: 15, isOutOfStock: false },
      { id: 'opt_2', name: 'Salad', price: 15, isOutOfStock: false },
      { id: 'opt_3', name: 'Soup', price: 20, isOutOfStock: false },
      { id: 'opt_4', name: 'Pie', price: 25, isOutOfStock: false }
    ]
  };

  // Case 1: 0 selected (under min=2) -> Invalid
  const res0 = validateFn([testGroup], { single: {}, multiple: {}, note: '' });
  assert.equal(res0.valid, false);
  assert.equal(res0.reason, 'UNDER_MIN');

  // Case 2: 1 selected (under min=2) -> Invalid
  const res1 = validateFn([testGroup], { single: {}, multiple: { 'Fries': true }, note: '' });
  assert.equal(res1.valid, false);
  assert.equal(res1.reason, 'UNDER_MIN');

  // Case 3: 2 selected (satisfies min=2, max=3) -> Valid!
  const res2 = validateFn([testGroup], { single: {}, multiple: { 'Fries': true, 'Salad': true }, note: '' });
  assert.equal(res2.valid, true);

  // Case 4: 4 selected (exceeds max=3) -> Invalid
  const res4 = validateFn([testGroup], { single: {}, multiple: { 'Fries': true, 'Salad': true, 'Soup': true, 'Pie': true }, note: '' });
  assert.equal(res4.valid, false);
  assert.equal(res4.reason, 'EXCEEDED_MAX');
});

test('T4: POS I18N dictionary has all required modifier keys in both vi and zh-TW', () => {
  const i18nJs = fs.readFileSync('js/orders-i18n.js', 'utf8');
  const sandbox = vm.createContext({
    window: {},
    document: { addEventListener: () => {} }
  });
  sandbox.window.window = sandbox.window;
  vm.runInContext(i18nJs, sandbox);

  const I18N = sandbox.window.I18N;
  assert.ok(I18N['zh-TW']);
  assert.ok(I18N['vi']);

  const requiredKeys = [
    'labelMinSelection',
    'labelMaxSelection',
    'labelMultipleBoundsHint',
    'labelItemCustomizationNotice',
    'labelModifierDefault'
  ];

  requiredKeys.forEach(k => {
    assert.ok(I18N['zh-TW'][k], `zh-TW missing key: ${k}`);
    assert.ok(I18N['vi'][k], `vi missing key: ${k}`);
  });
});

test('T5: legacy customization can be assigned to a newly created item and survive a round trip', async () => {
  const f = fixture();
  const e = editor();
  e.run(`currentMenuData = [
    { id:'sec-flavor', type:'order_customization', title:'Customizations', groups:[{
      id:'custom_a_flavor', key:'flavor', title:'Flavor', type:'radio', scope:'item',
      appliedCategories:[], appliedItems:['food:New item'],
      options:[{id:'Normal',name:'Normal',price:0,isDefault:true,isOos:false}]
    }] },
    { id:'food', type:'catalog', title:'Food', items:[{name:'New item',price:20}] }
  ];`);
  const payload = JSON.parse(JSON.stringify(e.run('serializeMenuData(currentMenuData)')));
  await f.save(payload);
  const itemId = payload.food['New item'].id;
  assert.ok(itemId.startsWith('a_item_'));
  assert.equal(f.db.prepare('SELECT group_id FROM item_modifier_links WHERE tenant_id=? AND item_id=?').get('a', itemId).group_id, 'custom_a_flavor');
  assert.equal(f.db.prepare('SELECT is_default FROM modifier_options WHERE tenant_id=? AND id=?').get('a', 'Normal').is_default, 1);
});

test('T5: canonical modifier can be assigned to a newly created item without changing stable IDs', async () => {
  const f = fixture();
  f.db.prepare('INSERT INTO modifier_groups(id,tenant_id,name,selection_type,min_selection,max_selection,scope) VALUES(?,?,?,?,?,?,?)')
    .run('mg_a_size', 'a', 'Size', 'single', 0, 1, 'item');
  f.db.prepare('INSERT INTO modifier_options(id,tenant_id,group_id,name,price,is_default,sort_order) VALUES(?,?,?,?,?,?,?)')
    .run('mo_a_small', 'a', 'mg_a_size', 'Small', 0, 1, 1);
  const e = editor();
  e.run(`currentMenuData = [
    { id:'sec-flavor', type:'order_customization', title:'Customizations', groups:[{
      id:'mg_a_size', source:'canonical', sourceId:'mg_a_size', canonicalId:'mg_a_size', key:'canonical_mg_a_size', title:'Size', type:'radio', scope:'item',
      minSelection:0, maxSelection:1, appliedCategories:[], appliedItems:['food:New item'],
      options:[{id:'mo_a_small',name:'Small',price:0,isDefault:true,isOos:false}]
    }] },
    { id:'food', type:'catalog', title:'Food', items:[{name:'New item',price:20}] }
  ];`);
  const payload = JSON.parse(JSON.stringify(e.run('serializeMenuData(currentMenuData)')));
  await f.save(payload);
  const itemId = payload.food['New item'].id;
  assert.ok(itemId.startsWith('a_item_'));
  assert.equal(f.db.prepare('SELECT group_id FROM item_modifier_links WHERE tenant_id=? AND item_id=?').get('a', itemId).group_id, 'mg_a_size');
  assert.equal(f.db.prepare('SELECT count(*) n FROM modifier_groups WHERE tenant_id=? AND id=?').get('a', 'mg_a_size').n, 1);
  assert.equal(f.db.prepare('SELECT is_default FROM modifier_options WHERE tenant_id=? AND id=?').get('a', 'mo_a_small').is_default, 1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM menu_customizations WHERE tenant_id=?').get('a').n, 2, 'canonical groups must not create additional legacy rows');
});

test('T5: item assignments load checked for legacy groups and pre-resolve IDs before serialization', async () => {
  const e = editor();
  e.context.fetch = async url => url.includes('modifier-library')
    ? ({ ok: true, json: async () => ({ complete: true, groups: [{
        id:'custom_a_flavor', source:'customization', sourceId:'custom_a_flavor', canonicalId:'mg_a_flavor', itemIds:['a_one'], categoryIds:[]
      }] }) })
    : ({ ok: true, json: async () => ({
        menuComplete:true, catalog:[{ id:'a_food', slug:'food', name:'Food', items:[{ id:'a_one', name:'One', price:10 }] }],
        modifiers:[], customizations:[{ id:'custom_a_flavor', key:'flavor', title:'Flavor', type:'radio', options:[{ id:'Normal', name:'Normal', price:0 }] }]
      }) });
  await e.run('loadMenuData()');
  const loaded = e.run("currentMenuData.find(c => c.id === 'sec-flavor').groups[0]");
  assert.deepEqual(Array.from(loaded.appliedItems), ['a_one']);
  e.run("currentMenuData[1].items.push({name:'New item', price:20}); currentMenuData[0].groups[0].appliedItems.push('food:New item');");
  const payload = JSON.parse(JSON.stringify(e.run('serializeMenuData(currentMenuData)')));
  const newItemId = payload.food['New item'].id;
  assert.ok(newItemId.startsWith('a_item_'));
  assert.deepEqual(payload.__customizations.groups[0].appliedItems, ['a_one', newItemId]);
  assert.equal(payload.food['New item'].modifier_groups[0].id, 'mg_a_flavor');
});

test('T5: category header reports mixed selection when only some category items are assigned', () => {
  const e = editor();
  const partial = e.run(`getModifierCategorySelectionState(
    { appliedCategories: [], appliedItems: ['item_1'] },
    { id: 'food', items: [{ id: 'item_1' }, { id: 'item_2' }] }
  )`);
  assert.equal(partial.checked, false);
  assert.equal(partial.indeterminate, true);

  const input = { indeterminate: false, getAttribute: () => 'mixed' };
  e.context.testCategoryCheckbox = input;
  e.run(`syncCategoryCheckboxIndeterminateState({ querySelectorAll: () => [testCategoryCheckbox] })`);
  assert.equal(input.indeterminate, true);
});

test('T5: legacy modifier category can be assigned to a new item and represented by a tenant group', async () => {
  const f = fixture();
  f.db.prepare('INSERT INTO menu_categories(id,tenant_id,slug,name,category_type,allow_customization,applied_modifiers) VALUES(?,?,?,?,?,?,?)')
    .run('a_topping', 'a', 'topping', 'Topping', 'modifier', 0, '[]');
  f.db.prepare('INSERT INTO menu_items(id,tenant_id,category_id,name,price) VALUES(?,?,?,?,?)')
    .run('a_topping_egg', 'a', 'a_topping', 'Egg', 10);
  const e = editor();
  e.run(`currentMenuData = [
    { id:'topping', databaseId:'a_topping', type:'modifier', title:'Topping', items:[{id:'a_topping_egg',name:'Egg',price:10}], groups:[{
      id:'a_topping', key:'topping', title:'Topping', type:'checkbox', scope:'item', appliedCategories:[], appliedItems:['food:New item'],
      source:'modifier_category', sourceId:'a_topping', options:[{id:'a_topping_egg',name:'Egg',price:10,isDefault:false,isOos:false}]
    }] },
    { id:'food', type:'catalog', title:'Food', items:[{name:'New item',price:20}] }
  ];`);
  const payload = JSON.parse(JSON.stringify(e.run('serializeMenuData(currentMenuData)')));
  await f.save(payload);
  const itemId = payload.food['New item'].id;
  assert.equal(f.db.prepare('SELECT group_id FROM item_modifier_links WHERE tenant_id=? AND item_id=?').get('a', itemId).group_id, 'a_topping');
  assert.equal(f.db.prepare('SELECT name FROM modifier_options WHERE tenant_id=? AND group_id=?').get('a', 'a_topping').name, 'Egg');
  assert.equal(f.db.prepare('SELECT count(*) n FROM menu_items WHERE tenant_id=? AND category_id=?').get('a', 'a_topping').n, 1);
});

test('T5: alias identity keeps the legacy record ID and canonical link ID, and repeated saves are idempotent', async () => {
  const f = fixture();
  f.db.prepare('INSERT INTO modifier_groups(id,tenant_id,name,selection_type,min_selection,max_selection,scope) VALUES(?,?,?,?,?,?,?)')
    .run('mg_a_flavor', 'a', 'Flavor', 'single', 0, 1, 'item');
  f.db.prepare('INSERT INTO modifier_options(id,tenant_id,group_id,name,price,is_default,sort_order) VALUES(?,?,?,?,?,?,?)')
    .run('mo_a_normal', 'a', 'mg_a_flavor', 'Normal', 0, 1, 0);
  const e = editor();
  e.run(`currentMenuData = [
    {id:'sec-flavor',type:'order_customization',title:'Options',groups:[{
      id:'custom_a_flavor',key:'flavor',title:'Flavor',type:'radio',scope:'item',source:'customization',sourceId:'custom_a_flavor',canonicalId:'mg_a_flavor',
      minSelection:0,maxSelection:1,appliedCategories:[],appliedItems:['food:New item'],options:[{id:'mo_a_normal',name:'Normal',price:0,isDefault:true}]
    }]},
    {id:'food',type:'catalog',title:'Food',items:[{name:'New item',price:20}]}
  ];`);
  const payload = JSON.parse(JSON.stringify(e.run('serializeMenuData(currentMenuData)')));
  await f.save(payload);
  await f.save(payload);
  const itemId = payload.food['New item'].id;
  assert.ok(f.db.prepare('SELECT id FROM menu_customizations WHERE tenant_id=? AND id=?').get('a', 'custom_a_flavor'));
  assert.equal(f.db.prepare('SELECT count(*) n FROM menu_customizations WHERE tenant_id=?').get('a').n, 2);
  assert.equal(f.db.prepare('SELECT group_id FROM item_modifier_links WHERE tenant_id=? AND item_id=?').get('a', itemId).group_id, 'mg_a_flavor');
  assert.equal(f.db.prepare('SELECT count(*) n FROM modifier_options WHERE tenant_id=? AND group_id=?').get('a', 'mg_a_flavor').n, 1);
  assert.equal(f.db.prepare('SELECT is_default FROM modifier_options WHERE tenant_id=? AND id=?').get('a', 'mo_a_normal').is_default, 1);
});

test('T5: an unassigned canonical group remains in the library after an unrelated menu save', async () => {
  const f = fixture();
  f.db.prepare('INSERT INTO modifier_groups(id,tenant_id,name,scope) VALUES(?,?,?,?)').run('mg_a_unused', 'a', 'Unused', 'item');
  f.db.prepare('INSERT INTO modifier_options(id,tenant_id,group_id,name,price) VALUES(?,?,?,?,?)').run('mo_a_unused', 'a', 'mg_a_unused', 'Choice', 0);
  await f.save({ food: { One: { id: 'a_one', price: 11 } } });
  assert.equal(f.db.prepare('SELECT count(*) n FROM modifier_groups WHERE tenant_id=? AND id=?').get('a', 'mg_a_unused').n, 1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM modifier_options WHERE tenant_id=? AND group_id=?').get('a', 'mg_a_unused').n, 1);
});

test('T5: cross-group duplicate option names are disambiguated and save without CONFLICTING_MODIFIER_OPTION_CONFIG', async () => {
  const f = fixture();
  const e = editor();
  e.context.fetch = async (url) => {
    if (url.includes('modifier-library')) {
      return { ok: true, json: async () => ({ complete: true, groups: [] }) };
    }
    return {
      ok: true,
      json: async () => ({
        menuComplete: true,
        catalog: [{ id: 'a_food', slug: 'food', name: 'Food', items: [{ id: 'a_one', name: 'One', price: 10 }] }],
        modifiers: [],
        customizations: [
          { id: 'custom_a_onion', key: 'onion-pref', title: '洋蔥', type: 'radio', options: [{ name: '不要', price: 0 }, { name: '多', price: 20 }] },
          { id: 'custom_a_garlic', key: 'garlic-pref', title: '蒜泥', type: 'radio', options: [{ name: '不要', price: 0 }, { name: '多', price: 0 }] }
        ]
      })
    };
  };

  await e.run('loadMenuData()');
  e.run('renderOrderCustomizationEditor=()=>{};');
  // User adds a new option to garlic group
  e.run('addCustomizationOption(0, 1)');

  const payload = JSON.parse(JSON.stringify(e.run('serializeMenuData(currentMenuData)')));
  // Verify backend accepts it without throwing CONFLICTING_MODIFIER_OPTION_CONFIG
  await f.save(payload);

  const onionOpts = f.db.prepare('SELECT name, price FROM modifier_options WHERE tenant_id=? AND group_id=? ORDER BY sort_order').all('a', 'custom_a_onion');
  const garlicOpts = f.db.prepare('SELECT name, price FROM modifier_options WHERE tenant_id=? AND group_id=? ORDER BY sort_order').all('a', 'custom_a_garlic');

  assert.equal(onionOpts.length, 2);
  assert.equal(onionOpts[0].name, '不要');
  assert.equal(onionOpts[1].name, '多');
  assert.equal(onionOpts[1].price, 20);

  assert.equal(garlicOpts.length, 3);
  assert.equal(garlicOpts[0].name, '不要');
  assert.equal(garlicOpts[1].name, '多');
  assert.equal(garlicOpts[1].price, 0);
});

test('T5: customization group with category scope and empty options renders editor and accepts new options without catItemIds error', () => {
  const e = editor();
  e.context.currentLang = 'vi';
  e.context.escapeHtml = (s) => s || '';
  e.context.document.createElement = (tag) => ({
    tagName: tag,
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    appendChild(child) { (this.children = this.children || []).push(child); },
    querySelectorAll() { return []; },
    addEventListener() {}
  });
  e.run(`
    currentMenuData = [
      {
        id: 'sec-flavor',
        type: 'order_customization',
        title: 'Flavor',
        groups: [{
          id: 'custom_a_notes',
          key: 'group_notes',
          title: 'Ghi chú dặn dò',
          type: 'radio',
          isRequired: false,
          scope: 'category',
          appliedCategories: ['food'],
          options: []
        }]
      },
      {
        id: 'food',
        type: 'catalog',
        title: 'Món ăn',
        items: [{ id: 'item_1', name: 'Phở bò', price: 50 }]
      }
    ];
    activeCategoryIndex = 0;
    activeOptionGroupIndex = 0;
  `);

  // Render customization editor with DOM mocks
  const appendedElements = [];
  const fakeContainer = {
    classList: { add() {}, remove() {}, toggle() {} },
    innerHTML: '',
    appendChild: (el) => appendedElements.push(el)
  };
  e.context.fakeContainer = fakeContainer;
  // Should NOT throw ReferenceError: catItemIds is not defined
  e.run('renderOrderCustomizationEditor(fakeContainer, currentMenuData[0], 0)');

  // Verify group card is created and rendered
  assert.ok(appendedElements.length >= 2, 'Banner and group card must be appended');
  const card = appendedElements.find(el => el.className === 'cust-group-card');
  assert.ok(card, 'Group card must be rendered in DOM');
  assert.ok(card.innerHTML.includes('cust-empty-options-hint'), 'Empty options hint should be displayed');
  assert.ok(card.innerHTML.includes('cat-mgr-add-btn'), 'Add option button must be present in card');

  // Now call addCustomizationOption
  e.run('addCustomizationOption(0, 0)');
  const group = e.run('currentMenuData[0].groups[0]');
  assert.equal(group.options.length, 1);
  assert.ok(group.options[0].id.startsWith('opt_custom_a_notes_'));
});


