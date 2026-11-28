const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { loadMenuEditor } = require('./helpers/menu-editor-loader.cjs');

function readPosMenuSources() {
  const dir = path.resolve(__dirname, '../frontend/apps/pos/menu');
  return ['state.ts', 'workspace.ts', 'catalog-editor.ts', 'index.ts']
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf-8'))
    .join('\n');
}

test('Sidebar Sections: TS POS menu defines accordion sections and classification helpers', () => {
  const code = readPosMenuSources();
  const css = fs.readFileSync(path.resolve(__dirname, '../css/orders.css'), 'utf-8');
  assert.ok(code.includes('collapsedMenuSections'), 'Must define collapsedMenuSections');
  assert.ok(code.includes('toggleMenuSectionCollapse'), 'Must define toggleMenuSectionCollapse');
  assert.ok(code.includes('isComboCategory'), 'Must define isComboCategory');
  assert.ok(code.includes('isCustomizationCategory'), 'Must define isCustomizationCategory');
  assert.ok(code.includes('handleCreateComboFromSidebar'), 'Must define handleCreateComboFromSidebar');
  assert.ok(code.includes('handleCreateCustomFromSidebar'), 'Must define handleCreateCustomFromSidebar');
  assert.ok(code.includes('menu-sidebar-section'), 'Must render menu-sidebar-section in DOM');
  assert.ok(css.includes('menu-sidebar-action-btn'), 'Must define menu-sidebar-action-btn in CSS');
});

test('Sidebar Sections: Classification logic partitions categories accurately', () => {
  const sandbox = {
    window: {},
    currentTenantFeatures: [],
    POS_SVG: {},
    localStorage: { getItem: () => null, setItem: () => {} }
  };
  vm.createContext(sandbox);
  loadMenuEditor(sandbox);

  // Test combo category classification
  assert.equal(sandbox.isComboCategory({ type: 'catalog', slug: 'combo', title: 'Combo' }), true);
  assert.equal(sandbox.isComboCategory({ type: 'catalog', slug: 'set-meal', title: '特惠套餐' }), true);
  assert.equal(sandbox.isComboCategory({ type: 'catalog', slug: 'drinks', title: 'Đồ uống' }), false);

  // Test customization category classification
  assert.equal(sandbox.isCustomizationCategory({ type: 'order_customization', id: 'sec-flavor' }), true);
  assert.equal(sandbox.isCustomizationCategory({ type: 'modifier', id: 'mod-ice' }), true);
  assert.equal(sandbox.isCustomizationCategory({ type: 'catalog', slug: 'food' }), false);
});

test('Sidebar Sections: orders-i18n.js has bilingual section titles and button labels', () => {
  const i18nJs = fs.readFileSync(path.resolve(__dirname, '../js/orders-i18n.js'), 'utf-8');
  assert.ok(i18nJs.includes('menuSectionCatalogTitle: "單品與特惠套餐"'), 'zh-TW has menuSectionCatalogTitle');
  assert.ok(i18nJs.includes('menuSectionCatalogTitle: "Thực đơn món & Combo"'), 'vi has menuSectionCatalogTitle');


  assert.ok(i18nJs.includes('menuSectionCustomTitle: "口味與客製化"'), 'zh-TW has menuSectionCustomTitle');
  assert.ok(i18nJs.includes('menuSectionCustomTitle: "Khẩu vị & Tùy chọn"'), 'vi has menuSectionCustomTitle');

  assert.ok(i18nJs.includes('btnAddCatalogCategory: "新增餐點分類"'), 'zh-TW has btnAddCatalogCategory');
  assert.ok(i18nJs.includes('btnAddCatalogCategory: "Thêm phân loại món"'), 'vi has btnAddCatalogCategory');

  assert.ok(i18nJs.includes('btnCreateComboWizard: "建立特惠套餐"'), 'zh-TW has btnCreateComboWizard');
  assert.ok(i18nJs.includes('btnCreateComboWizard: "Tạo Combo mới"'), 'vi has btnCreateComboWizard');

  assert.ok(i18nJs.includes('btnCreateCustomGroup: "新增客製化分組"'), 'zh-TW has btnCreateCustomGroup');
  assert.ok(i18nJs.includes('btnCreateCustomGroup: "Thêm nhóm tùy chọn"'), 'vi has btnCreateCustomGroup');

  assert.ok(i18nJs.includes('noComboCategoriesPrompt: "尚無套餐分類 (點擊下方立即建立)"'), 'zh-TW has noComboCategoriesPrompt');
  assert.ok(i18nJs.includes('noComboCategoriesPrompt: "Chưa có phân loại Combo (bấm bên dưới để tạo)"'), 'vi has noComboCategoriesPrompt');
});

test('Sidebar Sections: orders.css has section styles, balanced braces, and touch target >= 44px', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../css/orders.css'), 'utf-8');
  assert.ok(css.includes('.menu-sidebar-section'), 'Must style .menu-sidebar-section');
  assert.ok(css.includes('.menu-sidebar-section-header'), 'Must style .menu-sidebar-section-header');
  assert.ok(css.includes('.menu-sidebar-section-title'), 'Must style .menu-sidebar-section-title');
  assert.ok(css.includes('.menu-sidebar-action-btn'), 'Must style .menu-sidebar-action-btn');
  assert.ok(css.includes('.menu-section-empty-hint'), 'Must style .menu-section-empty-hint');
  assert.ok(css.includes('.menu-sidebar-segmented-toggle'), 'Must style .menu-sidebar-segmented-toggle');
  assert.ok(css.includes('.menu-seg-btn'), 'Must style .menu-seg-btn');
  assert.ok(css.includes('.menu-option-card'), 'Must style .menu-option-card');
  assert.ok(css.includes('.menu-add-option-group-btn'), 'Must style .menu-add-option-group-btn');

  // Verify balanced braces across entire CSS file
  let depth = 0;
  for (let c of css) {
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      assert.ok(depth >= 0, 'Excess closing brace in orders.css');
    }
  }
  assert.equal(depth, 0, 'Unclosed brace in orders.css');
});

test('Sidebar Toggle: TS POS menu defines menuSidebarTab and setMenuSidebarTab', () => {
  const code = readPosMenuSources();
  assert.ok(code.includes('menuSidebarTab'), 'Must define menuSidebarTab');
  assert.ok(code.includes('setMenuSidebarTab'), 'Must define setMenuSidebarTab');
  assert.ok(code.includes('menu-option-card'), 'Must render menu-option-card in options mode');
  assert.ok(code.includes('menu-add-option-group-btn'), 'Must render menu-add-option-group-btn');
});

test('Sidebar Toggle: orders-i18n.js has bilingual labels for products and options tabs', () => {
  const i18nJs = fs.readFileSync(path.resolve(__dirname, '../js/orders-i18n.js'), 'utf-8');
  assert.ok(i18nJs.includes('segProducts: "餐點"'), 'zh-TW has segProducts');
  assert.ok(i18nJs.includes('segProducts: "Món ăn"'), 'vi has segProducts');
  assert.ok(i18nJs.includes('segOptions: "客製選項"'), 'zh-TW has segOptions');
  assert.ok(i18nJs.includes('segOptions: "Tùy chọn"'), 'vi has segOptions');
  assert.ok(i18nJs.includes('btnAddOptionGroupTop: "新增客製化分組"'), 'zh-TW has btnAddOptionGroupTop');
  assert.ok(i18nJs.includes('btnAddOptionGroupTop: "Thêm nhóm tùy chọn"'), 'vi has btnAddOptionGroupTop');
});

test('Sidebar Sections: orders.html loads TS POS menu module and has cache busters', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../orders.html'), 'utf-8');
  assert.ok(/css\/orders\.css\?v=2026\d{4}_[a-z0-9_]+/.test(html), 'orders.css cache buster bumped');
  assert.ok(html.includes('<script type="module" src="/frontend/apps/pos/menu/index.ts"></script>'), 'orders.html loads TS POS menu module');
  assert.ok(/js\/orders-i18n\.js\?v=2026\d{4}_[a-z0-9_]+/.test(html), 'orders-i18n.js cache buster bumped');
  assert.ok(html.includes('menu-sidebar-segmented-toggle'), 'orders.html contains segmented toggle pill');
});

