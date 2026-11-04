const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { loadMenuEditor } = require('./helpers/menu-editor-loader.cjs');

function setup() {
  const elements = {
    'btn-menu-save': { classList: { toggle() {} } },
    'btn-menu-save-text': {}
  };
  let rows = [];
  const context = {
    window: { addEventListener() {} },
    document: {
      addEventListener() {},
      getElementById: id => elements[id] || null,
      querySelector: () => null,
      querySelectorAll: selector => {
        if (selector === '#menu-editor-body .menu-catalog-row') return rows;
        if (selector === '#menu-editor-body input[data-name-cidx]') return rows.map(row => row.name);
        if (selector === '#menu-editor-body input[data-cidx]') return rows.map(row => row.price);
        return [];
      }
    },
    t: key => key
  };
  vm.createContext(context);
  loadMenuEditor(context);
  vm.runInContext(`currentMenuData = [{id:'cat',type:'catalog',items:[
    {id:'a',name:'Bánh mì đặc biệt',price:129,isOos:false,badgeText:'Bán chạy'},
    {id:'b',name:'Bánh mì chả lụa',price:125,isOos:true}
  ]}]; activeCategoryIndex=0; isMenuLoadedCompletely=true; clearMenuDirty();`, context);
  const data = () => vm.runInContext('currentMenuData', context);
  const render = () => {
    rows = data()[0].items.map((item, index) => {
      const input = (value, kind) => ({
        value: String(value),
        getAttribute: key => key === (kind === 'name' ? 'data-name-cidx' : 'data-cidx') ? '0' : String(index)
      });
      const row = {
        name: input(item.name, 'name'), price: input(item.price, 'price'),
        getAttribute: () => String(index), querySelector: () => row.name
      };
      return row;
    });
  };
  const renderMenuCategoryEditor = context.renderMenuCategoryEditor;
  context.renderMenuCategoryEditor = render;
  render();
  return { context, elements, rows: () => rows, data, renderMenuCategoryEditor };
}

test('touch reordering keeps item identity, inline name and price together and respects boundaries', () => {
  const app = setup();
  app.rows()[0].name.value = 'Tên mới';
  app.rows()[0].price.value = '149';
  app.context.moveMenuItem(0, 0, 1);
  assert.equal(app.data()[0].items[1].id, 'a');
  assert.equal(app.data()[0].items[1].name, 'Tên mới');
  assert.equal(app.data()[0].items[1].price, 149);
  assert.equal(app.data()[0].items[0].name, 'Bánh mì chả lụa');
  assert.equal(app.rows()[1].name.value, 'Tên mới');
  assert.equal(app.elements['btn-menu-save'].disabled, false);
  app.context.moveMenuItem(0, 0, -1);
  assert.equal(app.data()[0].items[0].id, 'b');
});

test('an options tab with no groups shows an empty state instead of stale product rows', () => {
  const app = setup();
  app.elements['menu-editor-body'] = { classList: { remove() {}, toggle() {} }, textContent: 'Old products' };
  app.elements['menu-editor-title'] = {};
  app.context.renderMenuCategories = () => {};
  app.context.renderMenuCategoryEditor = app.renderMenuCategoryEditor;
  app.context.setMenuSidebarTab('options');
  assert.equal(vm.runInContext('activeCategoryIndex', app.context), -1);
  assert.equal(app.elements['menu-editor-body'].textContent, 'optionSectionEmpty');
});

test('switching menu modes restores product header controls', () => {
  const app = setup();
  const classes = () => {
    const values = new Set();
    return {
      toggle(name, on) { if (on) values.add(name); else values.delete(name); },
      contains(name) { return values.has(name); }
    };
  };
  app.elements['menu-editor-body'] = { classList: classes() };
  app.elements['menu-editor-panel'] = { classList: classes() };
  app.elements['menu-categories'] = { classList: classes() };
  app.elements['menu-editor-help'] = {};
  app.elements['btn-option-group-edit'] = { hidden: false };
  app.elements['btn-option-add'] = { hidden: false };
  app.context.window.UnifiedMenu = { enabled: true };
  vm.runInContext("menuSidebarTab = 'options'; updateMenuWorkspace();", app.context);
  assert.equal(app.elements['menu-editor-body'].classList.contains('is-option-workspace'), true);
  assert.equal(app.elements['menu-editor-help'].hidden, true);
  vm.runInContext("menuSidebarTab = 'products'; updateMenuWorkspace();", app.context);
  assert.equal(app.elements['menu-editor-body'].classList.contains('is-option-workspace'), false);
  assert.equal(app.elements['menu-categories'].classList.contains('is-option-groups'), false);
  assert.equal(app.elements['menu-editor-help'].hidden, false);
  assert.equal(app.elements['btn-option-add'].hidden, true);
  assert.equal(app.elements['btn-option-group-edit'].hidden, true);
});

test('product card surface and keyboard open settings without intercepting nested controls', () => {
  const app = setup(), opens = [];
  app.context.openItemDetailModal = (...args) => opens.push(args);
  const card = {classList:{contains:()=>false}};
  const event = (target = card, props = {}) => ({type:'click',currentTarget:card,target,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...props});
  card.closest = () => null;
  app.context.openMenuItemFromCard(event(),0,1);
  for (const type of ['button','input','select','textarea','label','drag-handle']) {
    app.context.openMenuItemFromCard(event({closest:()=>({type})}),0,1);
  }
  const enter = event(card,{type:'keydown',key:'Enter'}); app.context.openMenuItemFromCard(enter,0,1);
  assert.equal(enter.defaultPrevented,true);
  app.context.openMenuItemFromCard(event(card,{type:'keydown',key:' '}),0,1);
  app.context.openMenuItemFromCard(event({},{type:'keydown',key:'Enter'}),0,1);
  app.context.openMenuItemFromCard(event(card,{type:'keydown',key:'ArrowDown'}),0,1);
  app.context.openMenuItemFromCard(event(card,{type:'keydown',key:'Enter',repeat:true}),0,1);
  card.classList.contains = () => true; app.context.openMenuItemFromCard(event(),0,1);
  assert.deepEqual(opens,[[0,1],[0,1],[0,1]]);
});

test('item options button and product settings route to distinct unified drawer entries', () => {
  const app = setup(), opens = [];
  app.context.window.UnifiedMenu = {enabled:true,product:(...args)=>opens.push(args)};
  app.context.openItemModifiersModal(0,1);
  app.context.openItemDetailModal(0,1);
  assert.deepEqual(opens,[[0,1,'options'],[0,1]]);
});
