const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {fixture}=require('./helpers/staff-ordering.cjs');
const {handleStaffRoute}=require('../benmi-worker-official/src/modules/staff.ts');
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
   const r=route.request(),p=new URL(r.url()).pathname;
   const request=new Request(r.url(),{method:r.method(),headers:r.headers(),...(['GET','HEAD'].includes(r.method())?{}:{body:r.postData()})});
   let response;
   if(p.startsWith('/api/staff'))response=await handleStaffRoute(request,f.env,p,f.context('a'));
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
 await page.goto(`http://127.0.0.1:${server.address().port}/staff-order.html?tenant_id=b&env=dev`);
 await page.locator('#staff-access-error').waitFor();
 assert.equal(await page.locator('#dinein-table-number').count(),0);
 assert.deepEqual(errors,[]);
});
