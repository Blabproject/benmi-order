const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Element } = require('./helpers/menu-drawer-dom.cjs');
const { loadMenuEditor } = require('./helpers/menu-editor-loader.cjs');

function setup() {
  const doc = {createElement(tag){const el=new Element(tag,doc);el.style={};return el;}};
  doc.body=doc.createElement('body');doc.activeElement=doc.body;
  doc.getElementById=id=>doc.body.querySelector('#'+id);
  doc.querySelector=selector=>doc.body.querySelector(selector);
  doc.querySelectorAll=selector=>selector.startsWith('#menu-editor-body ')
    ? doc.getElementById('menu-editor-body').querySelectorAll(selector.slice(18)) : doc.body.querySelectorAll(selector);
  doc.addEventListener=()=>{};
  for(const id of ['menu-workspace-heading','menu-standard-workspace','menu-display-order-screen','menu-editor-body','menu-order-title','menu-order-description','menu-order-panels','btn-menu-order-back-text','btn-menu-save-text','btn-menu-order-save-text']){
    const el=doc.createElement('div');el.id=id;doc.body.appendChild(el);
  }
  for(const id of ['btn-menu-save','btn-menu-order-save','btn-menu-manage-cats','btn-menu-order-back']){
    const el=doc.createElement('button');el.id=id;doc.body.appendChild(el);
  }
  const alerts=[],posts=[],data=[
    {id:'notes',title:'Ghi chú',type:'order_customization',sortOrder:0,groups:[{id:'note',title:'Ghi chú',scope:'order',options:[]}],items:[]},
    {id:'food',title:'Món ăn',type:'catalog',sortOrder:10,items:[
      {id:'a',name:'Bánh mì',price:100,isOos:true,badgeText:'Nhãn',modifierGroups:[{id:'topping',optionIds:['x']}]},
      {id:'b',name:'Phở',price:80,isOos:false}, {id:'c',name:'Bún',price:90,isOos:false}]},
    {id:'topping',title:'Topping',type:'modifier',sortOrder:13,groups:[{id:'topping',scope:'item',options:[]}],items:[]},
    {id:'drinks',title:'飲料',type:'catalog',sortOrder:30,items:[]}
  ];
  const context={document:doc,console,addEventListener(){},escapeHtml:s=>String(s??''),
    t:(key,args)=>key==='menuOrderItems'?'Món trong '+args.name:key,confirm:()=>true,alert:message=>alerts.push(message),
    WORKER_BASE:'https://test.invalid',getTenantIdFromUrl:()=>'test',localStorage:{removeItem(){}},
    fetch:async(url,request)=>{posts.push(JSON.parse(request.body));return {ok:true};}};
  context.window=context;vm.createContext(context);
  loadMenuEditor(context);
  vm.runInContext('currentMenuData='+JSON.stringify(data)+';isMenuLoadedCompletely=true;activeCategoryIndex=1;clearMenuDirty();',context);
  const categories=context.renderMenuCategories;
  context.renderMenuCategories=()=>vm.runInContext('isCategoryManagerOpen',context)?categories():context.updateMenuWorkspace();
  context.renderMenuCategoryEditor=()=>{};
  const rows=kind=>doc.getElementById('menu-order-panels').querySelectorAll('[data-order-kind="'+kind+'"]');
  const move=(kind,index,delta)=>rows(kind)[index].querySelector('[data-order-delta="'+delta+'"]').onclick();
  return {context,doc,posts,alerts,rows,move,data:()=>vm.runInContext('currentMenuData',context),dirty:()=>vm.runInContext('isMenuDirty',context)};
}

test('display-order entry follows Save; menu tabs live above the replaceable rail list',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../orders.html'),'utf8');
  const heading=html.slice(html.indexOf('id="menu-workspace-heading"'),html.indexOf('id="menu-standard-workspace"'));
  assert.ok(heading.indexOf('id="btn-menu-save"')<heading.indexOf('id="btn-menu-manage-cats"'));
  assert.equal(heading.includes('id="menu-mode-tabs"'),false);
  const rail = html.slice(html.indexOf('class="panel menu-sidebar-panel"'), html.indexOf('id="menu-categories"'));
  assert.ok(rail.includes('id="menu-mode-tabs"'));
  assert.equal(html.match(/id="menu-mode-tabs"/g).length,1);
  assert.equal(html.match(/id="btn-menu-manage-cats"/g).length,1);
});

test('opening order screen is clean, hides the editor and returns to the previous mode and category',()=>{
  const app=setup();vm.runInContext("menuSidebarTab='options'",app.context);
  app.context.openCategoriesManager();
  assert.equal(app.doc.getElementById('menu-standard-workspace').hidden,true);
  assert.equal(app.doc.getElementById('menu-workspace-heading').hidden,true);
  assert.equal(app.doc.getElementById('menu-display-order-screen').hidden,false);
  assert.equal(app.rows('section').length,3);assert.equal(app.rows('item').length,3);
  assert.equal(app.dirty(),false);assert.equal(app.posts.length,0);
  app.context.closeCategoriesManager();
  assert.equal(app.doc.getElementById('menu-display-order-screen').hidden,true);
  assert.equal(vm.runInContext('activeCategoryIndex',app.context),1);
  assert.equal(vm.runInContext('menuSidebarTab',app.context),'options');
  assert.equal(app.doc.activeElement.id,'btn-menu-manage-cats');
});

test('reordering items preserves identity and full configuration, and reverting becomes clean',()=>{
  const app=setup(),a=app.data()[1].items[0],original=JSON.stringify(a);app.context.openCategoriesManager();
  app.move('item',0,-1);assert.equal(app.dirty(),false);
  app.move('item',0,1);assert.equal(app.data()[1].items[1],a);assert.equal(JSON.stringify(a),original);
  assert.equal(app.dirty(),true);assert.equal(app.doc.getElementById('btn-menu-order-save').disabled,false);
  app.move('item',1,-1);assert.equal(app.dirty(),false);assert.equal(app.data()[1].items[0],a);
});

test('section reordering preserves rank slots and never includes per-item modifier libraries',()=>{
  const app=setup(),initial=JSON.stringify(app.data());app.context.openCategoriesManager();
  app.move('section',0,1);
  assert.deepEqual(Array.from(app.context.getMenuDisplayEntries(),e=>e.model.id),['food','notes','drinks']);
  assert.equal(app.data()[2].sortOrder,13);assert.equal(app.data()[1].sortOrder,0);
  app.move('section',1,-1);assert.equal(JSON.stringify(app.data()),initial);assert.equal(app.dirty(),false);
  app.context.closeCategoriesManager();app.context.openCategoriesManager();assert.equal(app.dirty(),false);
});

test('tied or absent section ranks become sortable; reversing restores their exact original representation',()=>{
  const app=setup();app.data()[1].sortOrder=0;delete app.data()[3].sortOrder;app.context.clearMenuDirty();
  const original=JSON.stringify(app.data());app.context.openCategoriesManager();app.move('section',0,1);
  assert.deepEqual(Array.from(app.context.getMenuDisplayEntries(),e=>e.model.id),['food','notes','drinks']);
  app.move('section',1,-1);assert.equal(JSON.stringify(app.data()),original);assert.equal(app.dirty(),false);
});

test('one flavor section contains sortable order groups; inherited groups and old display positions stay out',async()=>{
  const app=setup();
  app.data()[0].groups.push({id:'utensils',key:'utensils',title:'Dụng cụ',scope:'order',sortOrder:2,options:[]},
    {id:'hidden',key:'hidden',title:'Theo phân loại',scope:'category',options:[]});
  app.data()[0].groups[0].key='note';app.context.clearMenuDirty();
  app.data()[0].groups[0].displaySortOrder=99;app.context.clearMenuDirty();
  const original=JSON.stringify(app.data());app.context.openCategoriesManager();
  assert.deepEqual(Array.from(app.context.getMenuDisplayEntries(),e=>e.model.id),['notes','food','drinks']);
  app.rows('section')[0].querySelector('.menu-display-order-name').onclick();
  assert.equal(app.dirty(),false);assert.equal(app.rows('group').length,2);assert.equal(app.rows('item').length,0);
  app.move('group',0,1);
  assert.deepEqual(Array.from(app.context.getMenuOrderGroups(),g=>g.id),['utensils','note']);
  assert.equal(app.doc.activeElement.getAttribute('aria-label'),'moveDisplayUp: Ghi chú');
  app.move('group',1,-1);assert.equal(JSON.stringify(app.data()),original);assert.equal(app.dirty(),false);
  app.move('section',0,1);
  assert.deepEqual(Array.from(app.context.getMenuDisplayEntries(),e=>e.model.id),['food','notes','drinks']);
  assert.equal(app.data()[0].groups[1].sortOrder,2);
  app.move('section',1,-1);assert.equal(JSON.stringify(app.data()),original);assert.equal(app.dirty(),false);
  app.move('section',0,1);app.move('group',0,1);await app.context.saveMenuData(true);
  const groups=app.posts[0].__customizations.groups;
  assert.equal(app.posts[0].__customizations.sortOrder,10);
  assert.equal(groups.find(g=>g.id==='note').sortOrder,2);
  assert.equal(groups.find(g=>g.id==='utensils').sortOrder,0);
  assert.equal(groups.some(g=>g.displaySortOrder!==undefined),false);
  assert.equal(app.posts[0].food.__sort_order,0);
  assert.equal(app.data()[0].groups[0].displaySortOrder,99);
  assert.equal(groups.find(g=>g.id==='hidden').sortOrder,3);
});

test('desktop drag/drop uses the same ordering path as buttons and ignores cross-list drops',()=>{
  const app=setup();app.context.openCategoriesManager();const [a,,c]=app.rows('item');
  const event={preventDefault(){},dataTransfer:{setData(){}}};
  a.ondragstart(event);app.rows('section')[0].ondrop(event);assert.equal(app.dirty(),false);
  c.ondrop(event);assert.deepEqual(Array.from(app.data()[1].items,p=>p.id),['b','c','a']);
  a.ondragend();assert.equal(app.dirty(),true);
});

test('saving establishes a new baseline so further moves and reversals retain persisted section positions',async()=>{
  const app=setup();app.data()[0].groups[0].key='note';app.context.clearMenuDirty();app.context.openCategoriesManager();
  app.move('section',0,1);await app.context.saveMenuData(true);
  assert.equal(app.posts[0].__customizations.sortOrder,10);
  app.move('section',1,-1);
  assert.equal(app.data()[0].sortOrder,0);
  assert.equal(app.dirty(),true);
  app.move('section',0,1);assert.equal(app.data()[0].sortOrder,10);assert.equal(app.dirty(),false);
  app.move('section',1,-1);await app.context.saveMenuData(true);
  assert.equal(app.posts[1].__customizations.sortOrder,0);
  assert.equal(app.dirty(),false);
});

test('inner group saves refresh entity versions and establish a new baseline without losing selection',async()=>{
  const app=setup();let reloads=0;
  app.context.UnifiedMenu={enabled:true,load:async()=>{reloads++;}};
  app.data()[0].groups.push({id:'utensils',key:'utensils',title:'Dụng cụ',scope:'order',sortOrder:2,options:[]});
  app.data()[0].groups[0].key='note';app.context.clearMenuDirty();app.context.openCategoriesManager();
  app.rows('section')[0].querySelector('.menu-display-order-name').onclick();
  app.move('group',0,1);await app.context.saveMenuData(true);
  assert.equal(reloads,1);assert.equal(app.dirty(),false);assert.equal(app.rows('group').length,2);
  app.move('group',1,-1);assert.equal(app.dirty(),true);
  app.move('group',0,1);assert.equal(app.dirty(),false);
  app.move('group',1,-1);
  app.context.fetch=async()=>({ok:false,status:409,json:async()=>({code:'MENU_REVISION_CONFLICT'})});
  const draft=JSON.stringify(app.data());await app.context.saveMenuData(true);
  assert.equal(JSON.stringify(app.data()),draft);assert.equal(app.dirty(),true);assert.equal(reloads,1);
  app.context.fetch=async()=>({ok:true});await app.context.saveMenuData(true);
  assert.equal(app.dirty(),false);assert.equal(reloads,2);
});

test('empty order scope hides the aggregate, while an order-only menu opens its inner group list',()=>{
  const empty=setup();empty.data()[0].groups=[];empty.context.clearMenuDirty();empty.context.openCategoriesManager();
  assert.deepEqual(Array.from(empty.context.getMenuDisplayEntries(),e=>e.model.id),['food','drinks']);
  const only=setup();only.data().splice(1);only.context.clearMenuDirty();only.context.openCategoriesManager();
  assert.equal(only.rows('section').length,1);assert.equal(only.rows('group').length,1);
  assert.equal(only.rows('item').length,0);assert.equal(only.dirty(),false);
});

test('inline edits are collected before ordering, with stale inputs removed before item indexes change',()=>{
  const app=setup(),body=app.doc.getElementById('menu-editor-body');
  body.innerHTML='<input data-name-cidx="1" data-name-iidx="0" value="Bản nháp"><input data-cidx="1" data-iidx="0" value="149">';
  app.context.openCategoriesManager();assert.equal(body.children.length,0);app.move('item',0,1);
  assert.equal(app.data()[1].items[1].name,'Bản nháp');assert.equal(app.data()[1].items[1].price,149);
  assert.equal(app.data()[1].items[0].name,'Phở');assert.equal(app.data()[1].items[0].price,80);
});

test('save serializes the changed item sequence and failed saves retain the order and protect in-flight navigation',async()=>{
  const app=setup();app.context.openCategoriesManager();app.move('item',0,1);
  let release;app.context.fetch=async(url,request)=>{app.posts.push(JSON.parse(request.body));return new Promise(resolve=>{release=resolve;});};
  const saving=app.context.saveMenuData();assert.equal(app.doc.getElementById('menu-order-panels').inert,true);
  const before=JSON.stringify(app.data());app.move('item',0,1);app.context.closeCategoriesManager();
  assert.equal(JSON.stringify(app.data()),before);assert.equal(vm.runInContext('isCategoryManagerOpen',app.context),true);
  release({ok:false,status:503,json:async()=>({error:'TEST_OFFLINE'})});await saving;
  assert.equal(app.dirty(),true);assert.equal(app.doc.getElementById('menu-order-panels').inert,false);assert.equal(app.alerts.length,1);
  assert.equal(app.posts[0].food['Phở'].id,'b');assert.equal(app.posts[0].food['Bánh mì'].id,'a');
  assert.ok(Object.keys(app.posts[0].food).indexOf('Phở')<Object.keys(app.posts[0].food).indexOf('Bánh mì'));
  app.context.fetch=async()=>({ok:true});await app.context.saveMenuData(true);assert.equal(app.dirty(),false);
});

test('ordering screen assets include the current cache busters', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../orders.html'), 'utf-8');
  for (const asset of ['css/orders-menu.css', 'js/orders-menu.js', 'js/orders-i18n.js']) {
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(html, new RegExp(`${escaped}\\?v=\\d{8}_[a-z0-9_]+`));
  }
});
