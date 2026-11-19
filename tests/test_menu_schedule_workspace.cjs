const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');

async function workspace(t) {
  const dom = new JSDOM('<div id="menu-schedule-workspace-root"></div>', { url: 'https://pos.test/orders?tenant_id=store', runScripts: 'dangerously' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.currentMenuData = [
    { id: 'rice', title: 'Rice', type: 'catalog', availabilityMode: 'all_shifts', hideWhenUnavailable: false, shiftIds: [], items: [
      { id: 'one', name: 'Curry', price: 80, availabilityMode: 'selected_shifts', shiftIds: ['lunch'] },
      { id: 'two', name: 'Rice bowl', price: 65, availabilityMode: 'inherit', shiftIds: [] }
    ] },
    { id: 'tofu', title: 'Tofu', type: 'catalog', availabilityMode: 'selected_shifts', shiftIds: ['dinner'], hideWhenUnavailable: true, items: [{ id: 'three', name: 'Soup', price: 90 }] },
    { id: 'options', type: 'modifier', title: 'Options', items: [] }
  ];
  w.storeOperatingShifts = ['lunch', 'dinner'].map(id => ({ id, name: id, shiftType: 'operating', windows: [1,2,3,4,5].map(dayOfWeek => ({ dayOfWeek, startTime: '11:00', endTime: '13:00' })) }));
  w.activeTab = 'menu-schedule'; w.isMenuLoadedCompletely = true;
  w.WORKER_BASE = 'https://worker.test'; w.getTenantIdFromUrl = () => 'store';
  w.confirm = () => true; w.alert = () => {};
  w.eval(readFileSync('js/orders-i18n.js', 'utf8'));
  w.eval(readFileSync('js/orders-menu-schedule.js', 'utf8'));
  await w.initMenuScheduleWorkspace();
  const cell = key => [...w.document.querySelectorAll('[data-ms-focus]')].find(el => el.getAttribute('data-ms-focus') === key);
  return { w, d: w.document, cell, data: () => JSON.stringify(w.currentMenuData) };
}

test('matrix computes effective counts and native mixed checkboxes; expanding does not change the draft', async t => {
  const { w, d, cell, data } = await workspace(t), before = data();
  assert.equal(cell('cat:rice:dinner').indeterminate, true);
  assert.equal(cell('cat:rice:dinner').getAttribute('aria-checked'), 'mixed');
  assert.deepEqual([...d.querySelectorAll('.ms-shift-count')].map(el => el.textContent), ['2/3 道餐點', '2/3 道餐點']);
  cell('expand:rice').click();
  assert.equal(d.querySelectorAll('.ms-item-row').length, 2);
  assert.equal(cell('item:rice:one:dinner').checked, false);
  assert.equal(data(), before);
  assert.equal(w.hasUnsavedMenuScheduleChanges(), false);
  assert.equal(d.querySelector('svg.ms-svg-layer'), null);
});

test('category bulk edits affect only the clicked shift and mixed activation selects all children', async t => {
  const { w, cell } = await workspace(t);
  cell('cat:rice:dinner').click();
  assert.equal(cell('cat:rice:dinner').indeterminate, false);
  assert.equal(cell('cat:rice:dinner').checked, true);
  assert.equal(cell('cat:rice:lunch').checked, true);
  cell('cat:rice:lunch').click();
  assert.equal(cell('cat:rice:lunch').checked, false);
  assert.equal(cell('cat:rice:dinner').checked, true);
  assert.equal(w.currentMenuData[0].items[0].price, 80);
});

test('item overrides recalculate parent mixed state and deselecting the last shift stays unavailable', async t => {
  const { w, cell } = await workspace(t);
  cell('expand:rice').click();
  cell('item:rice:one:lunch').click();
  const item = w.currentMenuData[0].items[0];
  assert.equal(item.availabilityMode, 'selected_shifts');
  assert.equal(JSON.stringify(item.shiftIds), '[]');
  assert.equal(cell('item:rice:one:lunch').checked, false);
  assert.equal(cell('cat:rice:lunch').indeterminate, true);
  w.msToggleCategory('tofu', 'dinner', false);
  assert.equal(w.currentMenuData[1].availabilityMode, 'selected_shifts');
  assert.equal(JSON.stringify(w.currentMenuData[1].shiftIds), '[]');
});

test('copy copies effective per-item choices to one target shift and preserves source and prices', async t => {
  const { w, cell } = await workspace(t);
  w.msCopyShift('dinner', 'lunch');
  assert.equal(cell('cat:rice:dinner').checked, true);
  assert.equal(cell('cat:tofu:dinner').checked, false);
  assert.equal(cell('cat:tofu:lunch').checked, false);
  assert.equal(w.currentMenuData[1].items[0].price, 90);
  assert.equal(w.currentMenuData[2].type, 'modifier');
  assert.equal(cell('copy:dinner'), undefined);
});

test('compact title row puts subtitle in help popover, omits filter bar, and keeps actions inline', async t => {
  const { w, d, cell } = await workspace(t);
  assert.equal(d.querySelector('.ms-sub'), null);
  assert.equal(d.querySelector('.ms-filter-bar'), null);
  assert.ok(d.querySelector('.ms-title-row .ms-actions'));
  assert.equal(d.getElementById('ms-title-help-popover'), null);
  cell('help').click();
  assert.equal(d.getElementById('ms-title-help-popover').textContent, w.t('menuSchedulePageSub'));
  cell('help').click();
  assert.equal(d.getElementById('ms-title-help-popover'), null);
});

test('outside policy preserves mixed initial data until explicitly selected; discard restores only schedules', async t => {
  const { w, d } = await workspace(t);
  assert.equal(d.querySelectorAll('.ms-outside button[aria-pressed="true"]').length, 0);
  w.msSetOutside(true);
  assert.equal(w.currentMenuData[0].hideWhenUnavailable, true);
  assert.equal(w.currentMenuData[1].hideWhenUnavailable, true);
  w.currentMenuData[0].items[0].price = 99;
  w.discardMenuScheduleChanges();
  assert.equal(w.currentMenuData[0].hideWhenUnavailable, false);
  assert.equal(w.currentMenuData[0].items[0].price, 99);
  assert.equal(w.hasUnsavedMenuScheduleChanges(), false);
});

test('save sends only changed schedules, retains unrelated menu edits and protects in-flight controls', async t => {
  const { w, d } = await workspace(t);
  w.msToggleItem('rice', 'one', 'dinner', true);
  w.currentMenuData[0].items[0].price = 123;
  let sent, finish, acknowledged;
  w.fetch = async (url, options) => { sent = { url, ...options, body: JSON.parse(options.body) }; return new Promise(resolve => { finish = resolve; }); };
  w.acknowledgeMenuScheduleSave = patch => { acknowledged = patch; };
  const saving = w.saveMenuScheduleWorkspace();
  assert.equal(sent.method, 'PATCH');
  assert.match(sent.url, /\/api\/menu\/schedule\?tenant_id=store/);
  assert.equal(sent.body.categories.length, 0);
  assert.equal(sent.body.items.length, 1);
  assert.equal(sent.body.items[0].id, 'one');
  assert.ok(sent.body.items[0].previous);
  assert.equal(JSON.stringify(sent.body).includes('price'), false);
  w.msSetOutside(true); // No mutation is accepted during persistence.
  assert.equal(w.currentMenuData[0].hideWhenUnavailable, false);
  assert.equal(d.querySelector('.ms-table-scroll').hasAttribute('inert'), true);
  finish({ ok: true }); await saving;
  assert.ok(acknowledged);
  assert.equal(w.currentMenuData[0].items[0].price, 123);
  assert.equal(w.hasUnsavedMenuScheduleChanges(), false);
});

test('conflicts retain the draft and both languages translate matrix controls', async t => {
  const { w, d, data } = await workspace(t);
  w.setLanguage('vi');
  assert.equal(d.querySelector('.ms-title').textContent, 'Menu theo ca');
  assert.match(d.querySelector('.ms-shift-times').textContent, /T2–T6/);
  w.msSetOutside(false); const before = data(); let message;
  w.alert = text => { message = text; };
  w.fetch = async () => ({ ok: false, status: 409 });
  await w.saveMenuScheduleWorkspace();
  assert.equal(data(), before);
  assert.match(message, /thiết bị khác/);
  assert.equal(w.hasUnsavedMenuScheduleChanges(), true);
  w.setLanguage('zh-TW');
  assert.equal(d.querySelector('.ms-title').textContent, '分時段菜單');
  assert.match(d.querySelector('.ms-outside').textContent, /完全隱藏/);
});

test('onMenuShiftsSaved prunes deleted shift IDs without wiping unsaved assignment edits', async t => {
  const { w } = await workspace(t);
  w.msToggleItem('rice', 'one', 'dinner', true);
  assert.equal(w.hasUnsavedMenuAssignments(), true);
  w.storeOperatingShifts = w.storeOperatingShifts.filter(s => s.id === 'lunch');
  w.onMenuShiftsSaved();
  assert.equal(w.hasUnsavedMenuAssignments(), true);
});

test('cached tenant capabilities survive settings startup without enabling unsubscribed tenants', async t => {
  const { w } = await workspace(t);
  w.currentTenantFeatures = ['menu_schedule', 'reports']; w.__posFeaturesResolved = true;
  w.eval(readFileSync('js/orders-settings.js', 'utf8'));
  assert.equal(w.isMenuScheduleFeatureEnabled(), true);
  w.currentTenantFeatures = ['reports']; assert.equal(w.isMenuScheduleFeatureEnabled(), false);
});

function customer(t) {
  const dom = new JSDOM('<nav id="main-nav"></nav><div id="catalog-sections"></div>', { url: 'https://order.test', runScripts: 'dangerously' });
  t.after(() => dom.window.close()); const w = dom.window;
  w.cart = {}; w.currentClientLocale = 'vi';
  w.getEffectiveMenuScheduleTime = () => ({ dateStr: '2026-11-16', timeStr: '12:00' });
  w.bootstrapData = { tenant: { features: ['menu_schedule'], operatingShifts: [
    { id: 'lunch', name: 'Lunch', shiftType: 'operating', windows: [{ dayOfWeek: 1, startTime: '11:00', endTime: '13:00' }] },
    { id: 'dinner', name: 'Dinner', shiftType: 'operating', windows: [{ dayOfWeek: 1, startTime: '17:00', endTime: '19:00' }] }
  ] }, catalog: [{ id: 'cat', slug: 'food', name: 'Food', availabilityMode: 'selected_shifts', shiftIds: ['dinner'], hideWhenUnavailable: true, items: [
    { id: 'inherited', name: 'Dinner item', price: 80, availabilityMode: 'inherit' },
    { id: 'override', name: 'Lunch item', price: 90, availabilityMode: 'selected_shifts', shiftIds: ['lunch'] }
  ] }] };
  w.eval(readFileSync('js/menu-schedule.js', 'utf8'));
  w.eval(readFileSync('js/client-menu.js', 'utf8'));
  return { w, d: w.document };
}

test('customer menu keeps an available item override visible when its category is outside its own shift', t => {
  const { w, d } = customer(t);
  w.renderDynamicCatalog();
  assert.ok(d.getElementById('sec-food'));
  assert.ok(d.getElementById('item-food-Lunch item'));
  assert.equal(d.getElementById('item-food-Dinner item'), null);
  assert.equal(d.querySelector('.section-title').textContent, 'Food');
  w.getEffectiveMenuScheduleTime = () => ({ dateStr: '2026-11-16', timeStr: '18:00' });
  w.updateDynamicStockAndPrices();
  assert.ok(d.getElementById('item-food-Dinner item'));
  assert.equal(d.getElementById('item-food-Lunch item'), null);
});

test('dimmed outside-shift items show serving hours and cannot be ordered', t => {
  const { w, d } = customer(t);
  w.bootstrapData.catalog[0].hideWhenUnavailable = false;
  w.renderDynamicCatalog();
  const card = d.getElementById('item-food-Dinner item');
  assert.equal(card.style.opacity, '0.65');
  assert.equal(card.style.pointerEvents, 'none');
  assert.match(card.querySelector('.card-footer').textContent, /17:00-19:00/);
  assert.equal(card.querySelector('.qty-control'), null);
});


test('hours stay in Settings; CRUD, validation and draft retention live in the menu shift workspace', async t => {
  const dom = new JSDOM('<div id="hours-settings-list"></div><button id="btn-save-hours">Save</button><div id="menu-schedule-workspace-root"><div id="menu-shifts-editor"></div></div>', { url:'https://pos.test',runScripts:'outside-only' });
  t.after(()=>dom.window.close()); const w=dom.window;
  w.currentTenantFeatures=['menu_schedule']; w.WORKER_BASE='https://worker.test'; w.getTenantIdFromUrl=()=> 'store'; w.alert=()=>{}; w.confirm=()=>true;
  w.eval(readFileSync('js/orders-i18n.js','utf8'));
  w.eval(readFileSync('js/menu-schedule.js','utf8'));
  w.eval(readFileSync('js/orders-settings.js','utf8')+`
storeOperatingHours={'1':[{start:'09:00',end:'23:00'}]};storeScheduleRevision=3;window.readHoursDraft=()=>JSON.stringify(storeOperatingHours);renderOperatingHours();` + readFileSync('js/orders-menu-shifts.js','utf8'));
  assert.equal(w.document.querySelector('#btn-save-menu-shifts'),null);
  const hoursBefore=w.readHoursDraft();
  w.renderMenuScheduleWorkspace=()=>{w.renderMenuShiftEditor();};
  const server={scheduleRevision:3,operatingHours:{'1':[{start:'09:00',end:'23:00'}]},operatingShifts:[{id:'dinner',name:'Dinner',shiftType:'operating',windows:[{id:'w',dayOfWeek:1,startTime:'17:00',endTime:'19:00'}]}]};
  const writes=[];let conflict=false;
  w.fetch=async (_url,options={})=>{
    if(options.method){const body=JSON.parse(options.body);writes.push(body);if(conflict)return{ok:false,json:async()=>({error:'MENU_SCHEDULE_CONFLICT'})};return{ok:true,json:async()=>({...server,...body,scheduleRevision:4})};}
    return{ok:true,json:async()=>server};
  };
  await w.openMenuShiftEditor();
  w.updateShiftBandTime(0,'17:00|19:00','endTime','23:30');
  await w.saveMenuShifts();assert.equal(writes.length,0);
  const errorText=w.document.getElementById('menu-shifts-error').textContent;
  assert(errorText.includes(w.t('shiftCoverageError')));
  assert(errorText.includes('09:00–23:00'));
  assert.ok(w.document.querySelector('.ms-shift-error-hours-btn'));
  w.updateShiftBandTime(0,'17:00|23:30','endTime','20:00');
  assert.equal(w.readHoursDraft(),hoursBefore);
  conflict=true;await w.saveMenuShifts();
  assert.equal(writes[0].scheduleRevision,3);
  assert.equal(writes[0].operatingShifts[0].windows[0].endTime,'20:00');
  assert.equal(w.hasUnsavedMenuShiftChanges(),true);
  assert(w.document.getElementById('menu-shifts-error').textContent.includes(w.t('menuScheduleConflict')));
  conflict=false;await w.saveMenuShifts();assert.equal(w.hasUnsavedMenuShiftChanges(),false);
  for(const lang of ['vi','zh-TW']){w.currentLang=lang;w.renderMenuShiftEditor();assert.notEqual(w.document.getElementById('btn-save-menu-shifts').textContent,'btnSaveMenuShifts');}
});
