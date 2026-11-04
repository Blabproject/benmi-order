const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { loadMenuEditor } = require('./helpers/menu-editor-loader.cjs');

function setup() {
  const elements = {};
  const cards = ['Độ cay', 'Thêm thịt', 'Rau ăn kèm'].map((name, i) => {
    const cb = { checked: i === 0, getAttribute: () => ['spice', 'extra', 'veg'][i] };
    const card = { style: {}, classList: { toggle() {} }, getAttribute: () => name,
      querySelector: () => cb };
    cb.closest = () => card;
    elements[`item-mod-grp-cb-${i}`] = cb;
    return card;
  });
  elements['item-modifiers-cards-grid'] = { querySelectorAll: () => cards };
  elements['item-modifiers-modal-body'] = { querySelectorAll: () => cards.map(c => c.querySelector()) };
  elements['item-modifiers-search'] = { value: '' };
  elements['item-modifiers-filter-empty'] = { hidden: true };
  ['all', 'selected'].forEach(mode => elements[`item-mod-filter-${mode}`] = { setAttribute() {} });
  const ctx = { window: { addEventListener() {} }, document: { addEventListener() {}, getElementById: id => elements[id] || null,
    querySelectorAll: () => [] }, t: key => key, escapeHtml: s => s, currentLang: 'vi' };
  vm.createContext(ctx);
  loadMenuEditor(ctx);
  vm.runInContext(`currentMenuData = [
    {id:'cat',type:'catalog',appliedModifiers:['legacy'],items:[{id:'p1',name:'Món',modifierGroups:[]}]},
    {id:'legacy',type:'modifier',title:'Thêm thịt',items:[{id:'meat',name:'Thịt',price:20}]},
    {id:'lib1',type:'order_customization',groups:[{id:'spice',title:'Độ cay',scope:'item',appliedCategories:[],options:[]}]},
    {id:'lib2',type:'order_customization',groups:[{id:'sauce',title:'Sốt',scope:'category',appliedCategories:['cat'],options:[]},
      {id:'utensils',scope:'order',appliedCategories:['cat'],options:[]},
      {id:'veg',title:'Rau',scope:'item',appliedCategories:[],options:[]}]}
    ]; currentItemModifiersCidx=0; currentItemModifiersIidx=0; isMenuLoadedCompletely=true; clearMenuDirty();`, ctx);
  return {ctx, cards, elements};
}

test('inherited summary reads all library sections and legacy modifiers, excludes order scope', () => {
  const { ctx } = setup();
  assert.deepEqual(Array.from(vm.runInContext('getInheritedItemModifierGroups(currentMenuData[0])', ctx), g => g.id), ['legacy', 'sauce']);
});

test('search and selected-only filter preserve hidden drafts; bulk selection acts on visible results', () => {
  const { ctx, cards, elements } = setup();
  ctx.toggleItemModifierCardSelection(2, true);
  ctx.setItemModifierFilter('selected');
  elements['item-modifiers-search'].value = 'DO CAY';
  ctx.filterItemModifierCards();
  assert.equal(cards[0].style.display, '');
  assert.equal(cards[1].style.display, 'none');
  assert.equal(cards[2].style.display, 'none');
  ctx.selectAllItemModifiers(false);
  assert.equal(cards[0].querySelector().checked, false);
  assert.equal(cards[2].querySelector().checked, true);
  assert.equal(elements['item-modifiers-filter-empty'].hidden, false);
  elements['item-modifiers-search'].value = '';
  ctx.setItemModifierFilter('all');
  assert.ok(cards.every(c => c.style.display === ''));
});

test('saving while filtered includes hidden checked groups and synchronizes item assignments', () => {
  const { ctx, cards, elements } = setup();
  ctx.renderMenuCategoryEditor = () => {};
  ctx.closeItemModifiersModal = () => {};
  cards[2].querySelector().checked = true;
  elements['item-modifiers-search'].value = 'DO CAY';
  ctx.filterItemModifierCards();
  ctx.saveItemModifiersModal();
  assert.deepEqual(Array.from(vm.runInContext('currentMenuData[0].items[0].modifierGroups', ctx), g => g.id), ['spice', 'veg']);
  assert.deepEqual(Array.from(vm.runInContext('currentMenuData[3].groups[2].appliedItems', ctx)), ['p1']);
});

test('new option workspace copy is localized in both POS languages', () => {
  const ctx = { window: {}, document: {addEventListener() {}}, localStorage: { getItem() {return null;} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/orders-i18n.js', 'utf8'), ctx);
  const dictionaries = vm.runInContext('I18N', ctx);
  const keys = Object.keys(dictionaries.vi).filter(k => k.startsWith('itemMod'));
  for (const key of keys) {
    assert.ok(dictionaries['zh-TW'][key], key);
    assert.ok(dictionaries.vi[key], key);
    assert.notEqual(dictionaries['zh-TW'][key], dictionaries.vi[key], key);
  }
});

test('cancel restores shared library requirements across sections without matching missing database IDs', () => {
  const { ctx, elements } = setup();
  elements.itemModifiersModal = { style: {} };
  ctx.renderItemModifiersEditor = () => {};
  ctx.openItemModifiersModal(0, 0);
  ctx.toggleItemModifierGroupRequired(0);
  assert.equal(vm.runInContext('currentMenuData[2].groups[0].isRequired', ctx), true);
  ctx.setItemModifierFilter('selected');
  ctx.closeItemModifiersModal();
  assert.equal(vm.runInContext('currentMenuData[2].groups[0].isRequired', ctx), undefined);
  assert.equal(vm.runInContext('currentMenuData[0].groups', ctx), undefined);
  assert.equal(vm.runInContext('isMenuDirty', ctx), false);
  ctx.openItemModifiersModal(0, 0);
  assert.equal(vm.runInContext('itemModifierFilterMode', ctx), 'all');
});
