const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {fixture}=require('./helpers/staff-ordering.cjs');
const {handleStaffRoute}=require('../benmi-worker-official/src/modules/staff.ts');
const {getConfig,updateConfig}=require('../benmi-worker-official/src/modules/config.ts');
const {createTenantRepository}=require('../benmi-worker-official/src/repositories/tenant.repository.ts');
const {invalidateBootstrapCache}=require('../benmi-worker-official/src/modules/bootstrap.ts');
const {getTenantBootstrap}=require('../benmi-worker-official/src/modules/bootstrap.ts');
const {getOptionCatalog}=require('../benmi-worker-official/src/modules/option-groups.ts');
const {chromium,webkit}=require('playwright');
for(const [name,engine] of Object.entries({chromium,webkit})) test(`${name}: shared LIFF staff creates, retries, appends and takes away`,async t=>{
 const f=await fixture(t);
 await f.apply("UPDATE tenant_config SET features='[\"dine_in\"]',allow_dine_in=1,allow_scheduled_pickup=0 WHERE tenant_id='a';");
 await f.apply(`INSERT INTO modifier_groups(id,tenant_id,name,selection_type,is_required,min_selection,max_selection,scope)
 VALUES('sauce-a','a','Sauce','single',1,1,1,'item');
 INSERT INTO modifier_options(id,tenant_id,group_id,name,price,is_default) VALUES('sauce-choice','a','sauce-a','Sauce choice',10,0);
 INSERT INTO item_modifier_links(tenant_id,item_id,group_id) VALUES('a','meal-a','sauce-a');`);
 const server=http.createServer((req,res)=>{
  const file=path.resolve(new URL(req.url,'http://local').pathname.slice(1));
  if(!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const browser=await engine.launch();t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1024,height:768}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(!localStorage.getItem('staff_order_lang'))localStorage.setItem('staff_order_lang','vi');});
 let loseResponse=true;const writes=[];
 await page.route('**/api/**',async route=>{
  try{
   const r=route.request(),url=new URL(r.url()),p=url.pathname;
   const request=new Request(r.url(),{method:r.method(),headers:r.headers(),...(['GET','HEAD'].includes(r.method())?{}:{body:r.postData()})});
   let response;
   if(p==='/api/config'){const ctx=await createTenantRepository(f.env.DB,f.env.ORDER_STATE,f.env).getTenantContext(url.searchParams.get('tenant_id'));response=await (r.method()==='POST'?updateConfig:getConfig)(request,f.env,ctx);}
   else if(p.startsWith('/api/staff'))response=await handleStaffRoute(request,f.env,p,f.context('a'));
   else if(p==='/api/tenant/bootstrap')response=await getTenantBootstrap(request,f.env);
   else if(p==='/api/menu/options')response=await getOptionCatalog(request,f.env);
   else response=new Response('{}');
   if(p==='/api/staff/orders'&&r.method()==='POST'){
    writes.push(JSON.parse(r.postData()));
    if(loseResponse){loseResponse=false;await route.abort();return;}
   }
   await route.fulfill({status:response.status,body:await response.text(),headers:{'Content-Type':'application/json'}});
  }catch(e){errors.push(String(e));await route.fulfill({status:500,body:'{}'});}
 });
 await page.addInitScript(()=>localStorage.setItem('cart_save_a',JSON.stringify({cart:{food_Meal:8}})));
 await page.route('https://static.line-scdn.net/**',r=>r.fulfill({body:''}));
 await page.goto(`http://127.0.0.1:${server.address().port}/staff-order.html?tenant_id=a&env=dev`);
 await page.waitForFunction(()=>window.StaffOrder?.ready());
 assert.equal(await page.locator('#store-header-box').isVisible(),false);
 assert.equal(await page.locator('.powered-by-blab-wrap').isVisible(),false);
 assert.equal(await page.locator('#view-tables,#view-review').count(),0);
 assert.equal(await page.locator('select#dinein-table-number').count(),1);
 assert.equal(await page.locator('#dinein-table-number').inputValue(),'');
 assert.equal(await page.locator('#desktop-center-auth-overlay').isVisible(),false);
 assert.equal(await page.evaluate(()=>Object.values(cart).reduce((n,q)=>n+q,0)),0);
 assert(await page.evaluate(()=>!!localStorage.getItem('cart_save_a')));
 const add=async()=>{
  await page.evaluate(()=>updateQty('food','Meal',1));
  await page.locator('#unified-option-modal [data-choose],#unified-option-modal [data-add]').first().click();
  await page.locator('#unified-option-modal [data-confirm]').click();
 };
 const submit=()=>page.evaluate(()=>submitOrder());
 await add();await page.selectOption('#dinein-table-number','table-a');
 await submit();assert.match(await page.locator('#staff-order-status').innerText(),/Chưa xác nhận/);
 await submit();assert.match(await page.locator('#staff-order-status').innerText(),/Đã gửi/);
 assert.equal(writes.length,2);assert.equal(writes[0].requestId,writes[1].requestId);
 let orders=await f.DB.prepare("SELECT * FROM orders WHERE tenant_id='a'").all();
 assert.equal(orders.results.length,1);assert.equal(orders.results[0].total_amount,110);
 await add();await page.selectOption('#dinein-table-number','table-a');await submit();
 let order=await f.DB.prepare('SELECT * FROM orders WHERE key=?').bind(orders.results[0].key).first();
 assert.equal(order.round_count,2);assert.equal(order.total_amount,220);
 await add();await page.evaluate(()=>setCustomerDiningOption('takeaway'));await submit();
 assert.match(await page.locator('#staff-order-status').innerText(),/Đã gửi/);
 orders=await f.DB.prepare("SELECT * FROM orders WHERE tenant_id='a'").all();assert.equal(orders.results.length,2);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 fs.mkdirSync('artifacts/staff-liff-local',{recursive:true});
 await page.screenshot({path:`artifacts/staff-liff-local/${name}-mobile.png`,fullPage:true});
 await page.evaluate(()=>{localStorage.setItem('staff_order_lang','zh-TW');setCustomerDiningOption('dine_in');});
 await add();await page.selectOption('#dinein-table-number','table-a');await page.reload();
 await page.waitForFunction(()=>window.StaffOrder?.ready());
 assert.equal(await page.locator('html').getAttribute('lang'),'zh-TW');
 assert.equal(await page.locator('#dinein-table-number').inputValue(),'table-a');
 assert.equal(await page.evaluate(()=>cart.food_Meal),1);
 // Another tablet closes the order after this device selected the table.
 await f.DB.prepare("UPDATE orders SET status='PAID',revision=revision+1 WHERE table_id='table-a'").run();
 await submit();assert.match(await page.locator('#staff-order-status').innerText(),/桌位訂單已變更/);
 assert.equal((await f.DB.prepare("SELECT count(*) n FROM orders WHERE tenant_id='a'").first()).n,2);
 await f.DB.prepare("UPDATE restaurant_tables SET is_active=0 WHERE tenant_id='a'").run();
 await page.reload();await page.waitForFunction(()=>window.StaffOrder?.ready());
 assert.match(await page.locator('#staff-order-status').innerText(),/尚未設定桌號/);
 await submit();assert.match(await page.locator('#staff-order-status').innerText(),/請選擇桌號/);
 // POS status updates must open the real customer checkout on a scheduled holiday.
 await f.apply("UPDATE tenant_config SET operating_hours='{}',allow_scheduled_pickup=1,store_status='paused' WHERE tenant_id='a';");
 await invalidateBootstrapCache('a',f.env);
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html?tenant_id=a&guest=1`);
 await page.waitForFunction(()=>window.bootstrapData?.tenant?.id==='a'&&window.bootstrapData?.tenant?.storeStatus==='paused');
 await page.evaluate(()=>{cart={food_Meal:1};window.cart=cart;updateTotal();checkStoreStatus();});
 assert.equal(await page.locator('#btn-submit').isDisabled(),true);
 assert.equal(await page.locator('#btn-desktop-submit').isDisabled(),true);
 async function setPOSStatus(status){
  assert.equal(await page.evaluate(async status=>{const res=await fetch(WORKER_BASE+'/api/config?tenant_id=a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storeStatus:status})});await fetchMenu();return res.status;},status),200);
 }
 await setPOSStatus('open');
 assert.equal(await page.evaluate(()=>isStoreOpen(getTaiwanDate())),true);
 assert.equal(await page.locator('#store-status').innerText(),'營業中');
 assert.equal(await page.locator('#btn-submit').isDisabled(),false);
 assert.equal(await page.locator('#btn-desktop-submit').isDisabled(),false);
 assert.equal(await page.locator('#pickup-date').inputValue(),await page.evaluate(()=>formatTaiwanDateTime(getTaiwanDate()).dateStr));
 assert(await page.locator('#pickup-time').inputValue());
 assert.equal(await page.evaluate(()=>generatePickupSlots(formatTaiwanDateTime(new Date(getTaiwanDate().getTime()+86400000)).dateStr).length),0);
 await setPOSStatus('busy');
 assert.equal(await page.evaluate(()=>isStoreOpen(getTaiwanDate())),true);
 assert.equal(await page.locator('#store-status').getAttribute('class'),'store-status busy');
 await setPOSStatus('paused');
 assert.equal(await page.locator('#btn-submit').isDisabled(),true);
 assert.equal(await page.locator('#btn-desktop-submit').isDisabled(),true);
 await page.goto(`http://127.0.0.1:${server.address().port}/staff-order.html?tenant_id=b&env=dev`);
 await page.locator('#staff-access-error').waitFor();
 assert.equal(await page.locator('#dinein-table-number').count(),0);

 // Non-dine-in + no-scheduled-pickup tenant (like bsc) in staff order mode
 await f.apply(`UPDATE tenant_config SET allow_dine_in=0,allow_scheduled_pickup=0,features='["reports","flex_notifications"]',store_status='open' WHERE tenant_id='a';`);
 await f.env.ORDER_STATE.delete('tenant:a:config_cache');
 await invalidateBootstrapCache('a',f.env);
 await page.unroute('**/api/**');
 await page.route('**/api/**',async route=>{
  try{
   const r=route.request(),url=new URL(r.url()),p=url.pathname;
   const request=new Request(r.url(),{method:r.method(),headers:r.headers(),...(['GET','HEAD'].includes(r.method())?{}:{body:r.postData()})});
   let response;
   if(p==='/api/config'){const ctx=await createTenantRepository(f.env.DB,f.env.ORDER_STATE,f.env).getTenantContext(url.searchParams.get('tenant_id'));response=await (r.method()==='POST'?updateConfig:getConfig)(request,f.env,ctx);}
   else if(p.startsWith('/api/staff'))response=await handleStaffRoute(request,f.env,p);
   else if(p==='/api/tenant/bootstrap')response=await getTenantBootstrap(request,f.env);
   else if(p==='/api/menu/options')response=await getOptionCatalog(request,f.env);
   else response=new Response('{}');
   await route.fulfill({status:response.status,body:await response.text(),headers:{'Content-Type':'application/json'}});
  }catch(e){errors.push(String(e));await route.fulfill({status:500,body:'{}'});}
 });
 await page.evaluate(()=>localStorage.setItem('staff_order_lang','vi'));
 await page.goto(`http://127.0.0.1:${server.address().port}/staff-order.html?tenant_id=a&env=dev`);
 await page.waitForFunction(()=>window.StaffOrder?.ready());
 assert.equal(await page.evaluate(()=>window.currentDiningOption),'takeaway');
 assert.equal(await page.locator('#dinein-table-input-group').isVisible(),false);
 assert.equal(await page.locator('#dining-option-wrapper').isVisible(),false);
 assert.equal(await page.locator('#checkout-dining-option-group').isVisible(),false);
 assert.equal(await page.locator('#pickup-time-picker-group').isVisible(),false);
 assert.equal(await page.locator('#pickup-time-asap-notice').isVisible(),true);
 assert.match(await page.locator('#staff-order-status').innerText(),/Đơn mang đi lấy ngay sẽ tạo đơn mới/);
 await add();
 await submit();
 assert.match(await page.locator('#staff-order-status').innerText(),/Đã gửi .*?-T00/);
 assert.deepEqual(errors,[]);
});
