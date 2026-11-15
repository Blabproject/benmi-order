const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers/menu-drawer-dom.cjs');

async function workspace({ lang = 'vi', empty = false } = {}) {
  const app = await setup({ lang });
  const group = (id, name, scope) => ({ id, name, scope, revision: 1, minSelection: 0, maxSelection: 1, options: [{ id: `${id}_opt`, name: 'Mặc định', price: 0, quantity: 1, subOptions: [], eligibilityRules: [] }], sources: [], labels: {} });
  const catalog = app.catalog();
  catalog.groups = empty ? [] : [
    group('notes', 'Ghi chú chung', 'order'),
    { ...catalog.groups[0], scope: 'item' },
    group('utensils', 'Dụng cụ ăn', 'order'),
    group('spice', 'Độ cay 辣度', 'category'),
  ];
  if (!empty) {
    catalog.links.push({ groupId: 'spice', itemId: catalog.products[0].id, disabled: false, optionIds: null });
  } else {
    catalog.links = [];
  }
  await app.context.UnifiedMenu.load();
  for (const [id, tag] of [['menu-categories', 'div'], ['menu-editor-body', 'div'], ['menu-editor-title', 'div'], ['btn-option-group-edit', 'button'], ['btn-option-add', 'button']]) {
    const el = app.doc.createElement(tag); el.id = id; app.doc.body.appendChild(el);
    if (id === 'btn-option-add') el.appendChild(app.doc.createElement('span'));
  }
  app.context.menuSidebarTab = 'options';
  app.context.UnifiedMenu.sidebar();
  const root = app.doc.getElementById('menu-categories');
  const section = (scope) => root.querySelector(`[data-group-scope="${scope}"]`);
  const toggle = (scope) => section(scope).querySelector('summary').onclick({ preventDefault() {} });
  const search = (value) => { const input = root.querySelector('#ug-group-search'); input.value = value; input.oninput(); };
  const clear = () => root.querySelector('[data-action="clear-search"]').onclick();
  const choose = (id) => root.querySelector(`[data-group="${id}"]`).onclick();
  return { ...app, root, section, toggle, search, clear, choose };
}

test('sections partition by scope, preserve order and include category inheritance once', async () => {
  const app = await workspace();
  const ids = (scope) => app.section(scope).querySelectorAll('[data-group]').map((el) => el.dataset.group);
  assert.deepEqual(ids('order'), ['notes', 'utensils']);
  assert.deepEqual(ids('item'), ['drinks', 'spice']);
  for (const scope of ['order', 'item']) {
    assert.equal(app.section(scope).open, true);
    assert.equal(app.section(scope).querySelector('.ug-group-section-count').textContent, '2');
  }
  assert.equal(app.section('order').querySelector('summary').textContent.includes('Tùy chọn toàn đơn'), true);
  assert.equal(app.section('item').querySelector('summary').textContent.includes('Tùy chọn theo món'), true);
  assert.equal(app.root.querySelector('[data-group="notes"]').textContent.includes('Tùy chọn cho cả đơn'), false);
  app.choose('spice');
  assert.equal(app.doc.getElementById('menu-editor-body').textContent.includes('Món áp dụng (1)'), true);
});

test('search temporarily expands matching sections, restores manual state and preserves the draft and selection', async () => {
  const app = await workspace();
  const before = JSON.stringify(app.context.currentMenuData), saved = app.context.savedMenuSnapshot;
  app.toggle('order'); app.toggle('item');
  const title = app.doc.getElementById('menu-editor-title').textContent;
  app.search('DUNG CU AN');
  assert.equal(app.section('order').open, true); assert.equal(app.section('order').hidden, false);
  assert.equal(app.section('item').hidden, true);
  assert.equal(app.root.querySelector('[data-group="utensils"]').hidden, false);
  assert.equal(app.root.querySelector('[data-group="notes"]').hidden, true);
  assert.equal(app.doc.getElementById('menu-editor-title').textContent, title);
  // Even a manual collapse during search must not overwrite pre-search state.
  app.toggle('order'); app.context.UnifiedMenu.sidebar();
  assert.equal(app.root.querySelector('#ug-group-search').value, 'DUNG CU AN');
  assert.equal(app.section('order').open, true);
  app.clear();
  assert.equal(app.section('order').open, false); assert.equal(app.section('item').open, false);
  assert.equal(app.section('order').hidden, false); assert.equal(app.section('item').hidden, false);
  assert.equal(app.doc.activeElement.id, 'ug-group-search');
  assert.equal(JSON.stringify(app.context.currentMenuData), before);
  assert.equal(app.context.savedMenuSnapshot, saved); assert.equal(app.posts.length, 0);
});

test('Chinese search, no results and whitespace query retain the selected group', async () => {
  const app = await workspace(); app.choose('utensils');
  app.search('辣度');
  assert.equal(app.section('order').hidden, true); assert.equal(app.section('item').open, true);
  assert.equal(app.root.querySelector('[data-group="spice"]').hidden, false);
  app.search('không tồn tại');
  assert.equal(app.root.querySelector('.ug-group-empty').hidden, false);
  assert.equal(app.root.querySelector('.ug-group-empty').textContent, 'Không tìm thấy nhóm phù hợp');
  assert.equal(app.root.querySelectorAll('.ug-group-empty').length, 1);
  assert.equal(app.section('order').hidden, true); assert.equal(app.section('item').hidden, true);
  assert.equal(app.doc.getElementById('menu-editor-title').textContent, 'Dụng cụ ăn');
  app.search('   ');
  assert.equal(app.section('order').hidden, false); assert.equal(app.section('item').hidden, false);
  assert.equal(app.root.querySelector('.ug-group-empty').hidden, true);
  assert.equal(app.root.querySelector('[data-group="utensils"]').getAttribute('aria-pressed'), 'true');
});

test('rerendering after tab switches, reloads and group save retains collapse, query and selection', async () => {
  const app = await workspace(); app.choose('utensils'); app.toggle('order');
  app.context.menuSidebarTab = 'products'; assert.equal(app.context.UnifiedMenu.sidebar(), false);
  app.context.menuSidebarTab = 'options'; app.context.UnifiedMenu.sidebar();
  assert.equal(app.section('order').open, false);
  app.search('Dụng cụ'); await app.context.UnifiedMenu.load(); app.context.UnifiedMenu.sidebar();
  assert.equal(app.root.querySelector('#ug-group-search').value, 'Dụng cụ');
  assert.equal(app.doc.getElementById('menu-editor-title').textContent, 'Dụng cụ ăn');
  app.context.UnifiedMenu.group('utensils'); app.input('name', 'Dụng cụ ăn mới'); await app.click('save');
  app.context.UnifiedMenu.sidebar();
  assert.equal(app.root.querySelector('#ug-group-search').value, 'Dụng cụ');
  assert.equal(app.doc.getElementById('menu-editor-title').textContent, 'Dụng cụ ăn mới');
  app.clear(); assert.equal(app.section('order').open, true); assert.equal(app.section('item').open, true);
});

test('empty sections stay visible with zero counts, localized names and empty messages', async () => {
  for (const lang of ['vi', 'zh-TW']) {
    const app = await workspace({ empty: true, lang });
    for (const scope of ['order', 'item']) {
      assert.equal(app.section(scope).hidden, false); assert.equal(app.section(scope).open, true);
      assert.equal(app.section(scope).querySelector('.ug-group-section-count').textContent, '0');
      assert.equal(app.section(scope).querySelector('.ug-group-section-empty').textContent, lang === 'vi' ? 'Chưa có nhóm tùy chọn' : '尚無選項群組');
    }
    assert.equal(app.section('order').querySelector('summary').textContent.includes(lang === 'vi' ? 'Tùy chọn toàn đơn' : '整筆訂單選項'), true);
    assert.equal(app.section('item').querySelector('summary').textContent.includes(lang === 'vi' ? 'Tùy chọn theo món' : '餐點選項'), true);
    assert.equal(app.root.querySelector('.ug-group-empty').hidden, true);
  }
});
