const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');

async function workspace(t) {
  const dom = new JSDOM('<div id="menu-schedule-workspace-root"></div>', {
    url: 'https://pos.test/orders?tenant_id=store', runScripts: 'dangerously'
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.currentMenuData = [
    { id: 'rice', title: 'Rice', type: 'catalog', availabilityMode: 'all_shifts', hideWhenUnavailable: false, shiftIds: [], items: [{ id: 'one', name: 'Curry', price: 80, availabilityMode: 'selected_shifts', shiftIds: ['lunch'] }] },
    { id: 'tofu', title: 'Tofu', type: 'catalog', availabilityMode: 'selected_shifts', shiftIds: ['dinner'], hideWhenUnavailable: true, items: [{ id: 'two', name: 'Tofu soup', price: 90 }] },
    { id: 'options', type: 'modifier', title: 'Options', items: [] }
  ];
  w.storeOperatingShifts = ['lunch', 'dinner'].map(id => ({ id, name: id, shiftType: 'operating', windows: [{ dayOfWeek: 1, startTime: '11:00', endTime: '13:00' }] }));
  w.activeTab = 'menu-schedule';
  w.isMenuLoadedCompletely = true;
  w.WORKER_BASE = 'https://worker.test';
  w.getTenantIdFromUrl = () => 'store';
  w.confirm = () => true;
  w.alert = () => {};
  w.eval(readFileSync('js/orders-i18n.js', 'utf8'));
  w.eval(readFileSync('js/orders-menu-schedule.js', 'utf8'));
  await w.initMenuScheduleWorkspace();
  return { w, d: w.document, data: () => JSON.stringify(w.currentMenuData) };
}

test('schedule search and filters preserve all menu data, dirty state, search focus and caret', async t => {
  const { w, d, data } = await workspace(t);
  const before = data();
  w.msSetFilter('selected_shifts');
  assert.deepEqual([...d.querySelectorAll('[data-cat-card]')].map(el => el.dataset.catCard), ['tofu']);
  w.msSetFilter('all');
  const input = d.querySelector('#ms-search');
  input.focus();
  input.value = 'Curry'; // Also finds the category through an item name.
  input.setSelectionRange(3, 3);
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(d.querySelectorAll('[data-cat-card]').length, 1);
  assert.equal(d.querySelector('[data-cat-card]').dataset.catCard, 'rice');
  assert.equal(d.activeElement.id, 'ms-search');
  assert.equal(d.activeElement.selectionStart, 3);
  w.msSetSearch('no matching category');
  assert.equal(d.querySelectorAll('[data-cat-card]').length, 0);
  assert.ok(d.querySelector('.ms-empty'));
  w.msToggleHelp();
  assert.equal(w.hasUnsavedMenuScheduleChanges(), false);
  assert.equal(data(), before);
});

test('keyboard activation connects a category, deduplicates links, and unlinks without changing item overrides', async t => {
  const { w, d } = await workspace(t);
  const itemBefore = JSON.stringify(w.currentMenuData[0].items);
  const pick = () => d.querySelector('[data-cat-port="rice"]').click();
  pick();
  assert.equal(d.querySelector('[data-cat-port="rice"]').getAttribute('aria-pressed'), 'true');
  assert.equal(d.querySelector('[data-shift-port="lunch"]').disabled, false);
  d.querySelector('[data-shift-port="lunch"]').click();
  assert.equal(w.currentMenuData[0].availabilityMode, 'selected_shifts');
  assert.equal(JSON.stringify(w.currentMenuData[0].shiftIds), '["lunch"]');
  pick();
  d.querySelector('[data-shift-port="lunch"]').click();
  assert.equal(w.currentMenuData[0].shiftIds.length, 1);
  w.msUnlinkCategoryFromShift('rice', 'lunch');
  assert.equal(w.currentMenuData[0].availabilityMode, 'all_shifts');
  assert.equal(JSON.stringify(w.currentMenuData[0].items), itemBefore);
  assert.equal(w.hasUnsavedMenuScheduleChanges(), false);
  pick();
  d.querySelector('[data-cat-port="rice"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(d.querySelector('[data-cat-port="rice"]').getAttribute('aria-pressed'), 'false');
});

test('cancelled touch gestures do not select or connect a category', async t => {
  const { w, d, data } = await workspace(t);
  const before = data();
  const down = new w.Event('pointerdown', { bubbles: true, cancelable: true });
  Object.assign(down, { clientX: 10, clientY: 10, pointerType: 'touch' });
  d.querySelector('[data-cat-port="rice"]').dispatchEvent(down);
  d.dispatchEvent(new w.Event('pointercancel', { bubbles: true }));
  assert.equal(data(), before);
  assert.equal(d.querySelector('[data-cat-port="rice"]').getAttribute('aria-pressed'), 'false');
});

test('cached tenant capabilities survive settings startup without enabling unsubscribed tenants', async t => {
  const { w } = await workspace(t);
  w.currentTenantFeatures = ['menu_schedule', 'reports'];
  w.__posFeaturesResolved = true;
  w.eval(readFileSync('js/orders-settings.js', 'utf8'));
  assert.equal(w.isMenuScheduleFeatureEnabled(), true);
  assert.equal(JSON.stringify(w.currentTenantFeatures), '["menu_schedule","reports"]');
  w.currentTenantFeatures = ['reports'];
  assert.equal(w.isMenuScheduleFeatureEnabled(), false);
});

test('reset confirms before changing category links and retains item settings, prices and modifiers', async t => {
  const { w, data } = await workspace(t);
  const before = data();
  w.confirm = () => false;
  w.msResetAllCategories();
  assert.equal(data(), before);
  w.confirm = () => true;
  const items = JSON.stringify(w.currentMenuData.map(c => c.items));
  w.msSetFilter('all_shifts'); // Reset applies to all categories, including filtered-out ones.
  w.msResetAllCategories();
  assert.equal(w.currentMenuData[1].availabilityMode, 'all_shifts');
  assert.equal(w.currentMenuData[1].shiftIds.length, 0);
  assert.equal(JSON.stringify(w.currentMenuData.map(c => c.items)), items);
  assert.equal(w.hasUnsavedMenuScheduleChanges(), true);
});

test('language changes update schedule controls and failed saves retain the full draft despite active filtering', async t => {
  const { w, d, data } = await workspace(t);
  w.setLanguage('vi');
  assert.equal(d.querySelector('.ms-title').textContent, 'Phân ca thực đơn');
  assert.match(d.querySelector('[data-cat-port="rice"]').getAttribute('aria-label'), /Rice/);
  w.setLanguage('zh-TW');
  assert.equal(d.querySelector('.ms-title').textContent, '菜單時段分配');
  assert.match(d.querySelector('.ms-linked-unlink').getAttribute('aria-label'), /解除/);
  w.msToggleCategoryHide('tofu', false);
  w.msSetFilter('all_shifts');
  const before = data();
  let sent;
  w.serializeMenuData = cats => { sent = JSON.stringify(cats); return { menu: cats }; };
  w.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: 'Offline' }) });
  await w.saveMenuScheduleWorkspace();
  assert.equal(sent, before);
  assert.equal(data(), before);
  assert.equal(w.hasUnsavedMenuScheduleChanges(), true);
  assert.equal(d.querySelector('#btn-save-menu-schedule').disabled, false);
});
