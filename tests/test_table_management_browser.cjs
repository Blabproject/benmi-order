const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture}=require('./helpers/staff-ordering.cjs');
const {handleStaffRoute}=require('../benmi-worker-official/src/modules/staff.ts');
const {chromium,webkit}=require('playwright');
const root=process.cwd();

for(const [name,engine]of Object.entries({chromium,webkit}))test(`${name}: table settings responsive layout, permissions, QR and table editing`,async t=>{
 const f=await fixture(t);
 await f.apply(`INSERT INTO restaurant_tables(id,tenant_id,label,sort_order,is_active) VALUES
 ('empty-a','a','A2',2,1),('disabled-a','a','A3',3,0),('long-a','a','A very long table name with a terrace and a long reference 123456789012345678901234567890',4,1);`);
 const order=await f.call('/api/staff/orders',f.input());assert.equal(order.http,201,JSON.stringify(order));
 await f.DB.prepare("UPDATE orders SET display_key=? WHERE table_id='table-a'").bind('REFERENCE-1234567890123456789012345678901234567890').run();
 const browser=await engine.launch();t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true});page.setDefaultTimeout(8000);
 const errors=[],writes=[];let canWrite=true;
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
 await page.route('**/*',async route=>{
  const r=route.request(),url=new URL(r.url()),p=url.pathname;
  if(p==='/orders.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'orders.html'),'utf8').replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi,'')});
  if(/^\/(js|css)\/[\w.-]+$/.test(p))return route.fulfill({contentType:p.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(path.join(root,p.slice(1)),'utf8')});
  if(p.startsWith('/api/staff/')){
   if(r.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}});
   if(!['GET','HEAD'].includes(r.method()))writes.push({path:p,body:r.postDataJSON()});
   const request=new Request(url,{method:r.method(),headers:r.headers(),...(['GET','HEAD'].includes(r.method())?{}:{body:r.postData()})});
   const response=await handleStaffRoute(request,f.env,p,f.context('a'));const data=await response.json();
   if(p.endsWith('/capabilities'))data.capabilities.tables_write=canWrite;
   return route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},json:data});
  }
  return route.fulfill({json:{}});
 });
 await page.goto('https://pos.test/orders.html?tenant=a&env=dev');
 await page.evaluate(async()=>{initSidebarState();setLanguage('vi');switchTab('settings');switchSettingTab('setting-card-tables');await loadRestaurantTablesSetting();});
 await page.waitForFunction(()=>document.querySelectorAll('.restaurant-table-row').length===4);
 const row=id=>page.locator(`.restaurant-table-row[data-table-id="${id}"]`);
 assert.equal(await page.locator('#i18n-setting-tables-title,#i18n-setting-tables-sub').count(),0);
 assert.equal(await page.locator('#i18n-settings-title').innerText(),'Quản lý bàn');
 assert.equal(await row('table-a').locator('.table-action-btn-disable').isDisabled(),true);
 assert.equal(await row('table-a').locator('.table-action-btn-edit').isDisabled(),false);
 assert.match(await row('table-a').locator('.restaurant-table-action-reason').innerText(),/chưa thanh toán/);
 assert.equal(await row('empty-a').locator('.table-action-btn-disable').isEnabled(),true);
 assert.equal(await row('disabled-a').locator('.status-disabled').count(),1);
 const shots=process.env.TABLE_MANAGEMENT_SCREENSHOT_DIR||'artifacts/table-management-local-20261107';fs.mkdirSync(shots,{recursive:true});
 for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:768,height:1024},{width:390,height:844},{width:320,height:700}])for(const locale of ['vi','zh-TW']){
  await page.setViewportSize(viewport);await page.evaluate(lang=>setLanguage(lang),locale);
  const layout=await page.locator('#setting-card-tables').evaluate(el=>({
   width:el.getBoundingClientRect().width,overflow:el.scrollWidth>el.clientWidth+1,
   rowDisplay:getComputedStyle(el.querySelector('.restaurant-table-row')).display,
   controls:[...el.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width).map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,border:getComputedStyle(b).borderTopStyle})),
   order:[...el.querySelectorAll('.restaurant-table-order-code')].map(n=>({width:n.getBoundingClientRect().width,overflow:n.scrollWidth>n.clientWidth+1}))
  }));
  assert.equal(layout.overflow,false,`${name}/${viewport.width}/${locale}: panel overflow`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert(layout.controls.every(b=>b.width>=47.9&&b.height>=47.9),JSON.stringify({viewport,layout}));
  assert(layout.controls.every(b=>!['outset','inset'].includes(b.border)),'No native raised button borders');
  assert(layout.order.every(o=>!o.overflow));
  assert.equal(layout.rowDisplay,layout.width-2<720?'grid':'table-row',JSON.stringify(layout));
  assert.equal(await row('empty-a').locator('.status-empty').innerText(),locale==='vi'?'Bàn trống':'空桌');
  assert.equal(await row('empty-a').locator('.table-cell-sort').getAttribute('data-label'),locale==='vi'?'Thứ tự':'排序');
  await page.screenshot({path:path.join(shots,`${name}-${viewport.width}-${locale}.png`),animations:'disabled'});
 }
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>setLanguage('vi'));
 await row('table-a').locator('.table-action-btn-qr').click();
 assert.equal(await page.locator('#table-qr-label-display').innerText(),'A1');
 assert.equal(await page.locator('#table-qr-canvas-wrap img').count(),1);
 assert.match(await page.locator('#table-qr-url-input').inputValue(),/table=A1/);
 await page.evaluate(()=>closeTableQrModal());
 await row('empty-a').locator('.table-action-btn-edit').click();
 await page.locator('#table-editor-label').fill('A2 renamed');
 await page.evaluate(()=>submitTableEditor());
 await page.waitForFunction(()=>document.querySelector('[data-table-id="empty-a"] .restaurant-table-name-text').textContent==='A2 renamed');
 await row('disabled-a').locator('.table-action-btn-enable').click();
 await page.waitForFunction(()=>document.querySelector('[data-table-id="disabled-a"] .status-empty'));
 await row('empty-a').locator('.table-action-btn-disable').click();
 await page.waitForFunction(()=>document.querySelector('[data-table-id="empty-a"] .status-disabled'));
 assert(writes.some(w=>w.path.endsWith('/empty-a')&&w.body.label==='A2 renamed'));
 await page.locator('#i18n-table-add-btn').click();
 await page.locator('#table-editor-label').fill('New table');
 await page.evaluate(()=>submitTableEditor());
 await page.waitForFunction(()=>currentRestaurantTables.some(table=>table.label==='New table'));
 await page.locator('#i18n-table-batch-btn').click();
 await page.locator('#batch-table-prefix').fill('B');
 await page.locator('#batch-table-start').fill('1');
 await page.locator('#batch-table-end').fill('2');
 await page.evaluate(()=>submitBatchTable());
 await page.waitForFunction(()=>currentRestaurantTables.some(table=>table.label==='B2'));
 assert(writes.some(w=>w.path.endsWith('/tables/batch')&&w.body.prefix==='B'));
 const printed=await page.evaluate(()=>{
  let calls=0;window.print=()=>calls++;
  printAllTablesQrA4();
  return {calls,cards:document.querySelectorAll('#tables-qr-print-sheet .print-table-qr-card').length,
   images:document.querySelectorAll('#tables-qr-print-sheet img').length,
   active:currentRestaurantTables.filter(table=>table.is_active).length};
 });
 assert.equal(printed.calls,1);assert.equal(printed.cards,printed.active);assert.equal(printed.images,printed.active);
 canWrite=false;
 await page.evaluate(()=>loadRestaurantTablesSetting());
 assert.equal(await row('table-a').locator('.table-action-btn-qr').isEnabled(),true);
 assert.equal(await row('table-a').locator('.table-action-btn-edit').isDisabled(),true);
 assert.match(await row('table-a').locator('.restaurant-table-action-reason').innerText(),/không có quyền/);
 assert.equal(await page.locator('#i18n-table-add-btn').isVisible(),false);
 assert.equal(await page.locator('#i18n-table-batch-btn').isVisible(),false);
 assert.equal(await page.locator('#i18n-table-print-all-btn').isVisible(),true);
 await page.evaluate(()=>{currentRestaurantTables=[];renderRestaurantTablesList();});
 assert.equal(await page.locator('.restaurant-tables-empty-state').isVisible(),true);
 assert.deepEqual(errors,[]);
});
