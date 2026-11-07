const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('playwright');
const {fixture,tenant}=require('./helpers/payments.cjs');
const {handlePaymentRoute}=require('../benmi-worker-official/src/modules/payments.ts');
const root=path.resolve(__dirname,'..');

async function until(page,expression){await page.waitForFunction(expression);}
async function login(page){
 await page.click('#payment-workspace-login');
 await page.locator('.payment-dialog input').fill('87654321');
 await page.locator('.payment-dialog button[type=submit]').click();
 await page.locator('.payment-dialog').waitFor({state:'detached'});
 await page.locator('#payment-private-workspace').waitFor({state:'visible'});
 await until(page,()=>document.querySelector('#payment-list-panel').getAttribute('aria-busy')==='false'&&document.querySelector('#payment-transaction-rows').children.length>0);
}

async function setup(t,engine){
 const f=await fixture();t.after(()=>f.db.close());
 const originalFetch=global.fetch;let refunds=0;
 global.fetch=async(url)=>{
  const u=new URL(url);if(u.pathname.endsWith('/refund')){refunds++;return new Response(JSON.stringify({returnCode:'0000',info:{refundTransactionId:'2023042201206549999'}}));}
  if(u.pathname.endsWith('/check'))return new Response(JSON.stringify({returnCode:'0000'}));
  const p=f.db.prepare('SELECT * FROM payments WHERE provider_order_id=?').get(u.searchParams.get('orderId'));
  return new Response(JSON.stringify({returnCode:'0000',info:p?.paid_at?[{orderId:p.provider_order_id,transactionId:p.transaction_id,currency:'TWD',transactionType:'PAYMENT',payInfo:[{amount:p.amount}],refundList:[]}]:[]}));
 };
 t.after(()=>{global.fetch=originalFetch;});
 const now=Date.now();
 const paid=f.seed({displayKey:'PAID-100',orderStatus:'REJECTED',transactionId:'2023042201206549310'});
 const failed=f.seed({status:'REFUND_FAILED',displayKey:'OLD-REFUND',createdAt:now-70*86400000,paidAt:now-70*86400000,refundAt:now-60000});
 const unknown=f.seed({status:'UNKNOWN',displayKey:'UNKNOWN-100',createdAt:now-600000});
 f.seed({status:'PENDING',displayKey:'WAITING-100'});
 const browser=await engine.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true});page.setDefaultTimeout(8000);
 const requests=[],errors=[];let countOffline=false,configured=true;
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.dismiss());
 await page.addInitScript(()=>{
  window.setInterval=(callback,delay)=>{if(delay===30000&&callback.name==='tick')window.paymentTestTick=callback;return 0;};
  window.confirm=()=>true;
 });
 await page.route('**/*',async route=>{
  const r=route.request(),url=new URL(r.url());
  if(url.pathname==='/orders.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'orders.html'),'utf8').replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi,'')});
  if(/^\/(js|css)\/[\w.-]+$/.test(url.pathname))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(path.join(root,url.pathname.slice(1)),'utf8')});
  if(url.pathname.startsWith('/api/payments/')){
   if(r.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
   requests.push({path:url.pathname,query:url.search,method:r.method(),body:r.postData()});
   if(url.pathname.endsWith('/attention/count')&&countOffline)return route.abort();
   if(url.pathname.endsWith('/config')&&!configured)return route.fulfill({json:{linePay:{configured:false,enabled:false}}});
   try{
    const response=await handlePaymentRoute(new Request(url,{method:r.method(),headers:r.headers(),...(['GET','HEAD'].includes(r.method())?{}:{body:r.postData()})}),f.env,{...tenant,tenantId:url.searchParams.get('tenant_id')||'a'},url.pathname);
    return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
   }catch(error){errors.push(String(error));return route.fulfill({status:500,json:{}});}
  }
  return route.fulfill({json:{}});
 });
 await page.goto('https://pos.test/orders.html?tenant=a&env=dev');
 await page.evaluate(()=>{initSidebarState();setLanguage('vi');switchTab('live');});
 await until(page,()=>!document.querySelector('#payment-live-alert').hidden);
 return {f,page,paid,failed,unknown,requests,errors,refunds:()=>refunds,offline:value=>{countOffline=value;},configured:value=>{configured=value;}};
}

for(const [name,engine]of Object.entries({chromium,webkit}))test(`${name}: payment workspace access, responsive history, detail and safe full refund`,async t=>{
 const {f,page,paid,failed,unknown,requests,errors,refunds,offline,configured}=await setup(t,engine);
 assert.equal(await page.locator('#sidebar-payment-count').innerText(),'3');
 assert.equal(await page.locator('#payment-attention').count(),0);
 assert.equal(requests.filter(r=>r.path.endsWith('/transactions')||r.path.endsWith('/summary')).length,0,'Private data is not loaded before authentication');
 await page.click('#payment-live-alert');
 assert.equal(new URL(page.url()).hash,'#payments');
 assert.equal(await page.locator('.payment-dialog').count(),0,'Navigation does not force an authentication prompt');
 assert.equal(await page.locator('#payment-private-workspace').isVisible(),false);
 await login(page);
 assert.equal(await page.locator('#payment-transaction-rows tr').count(),3);
 for(const viewport of [{width:1024,height:768},{width:768,height:1024},{width:390,height:844},{width:320,height:600}]){
  await page.setViewportSize(viewport);
  for(const lang of ['vi','zh-TW']){
   await page.evaluate(lang=>setLanguage(lang),lang);
   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
   const layout=await page.locator('#view-payments').evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,
    controls:[...el.querySelectorAll('button,input,select')].filter(el=>el.getBoundingClientRect().width).map(el=>({id:el.id,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),
    untranslated:[...el.querySelectorAll('[data-payment-i18n]')].filter(el=>el.textContent!==t(el.dataset.paymentI18n)).map(el=>el.dataset.paymentI18n)}));
   assert.equal(layout.overflow,false,`${name}/${viewport.width}/${lang}: overflow`);
   assert(layout.controls.every(el=>el.width>=47.9&&el.height>=47.9),JSON.stringify(layout.controls));
   assert.deepEqual(layout.untranslated,[]);
   if(process.env.PAYMENT_WORKSPACE_SCREENSHOT_DIR){fs.mkdirSync(process.env.PAYMENT_WORKSPACE_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PAYMENT_WORKSPACE_SCREENSHOT_DIR,`${name}-${viewport.width}-${lang}.png`),fullPage:true});}
  }
 }
 await page.setViewportSize({width:1024,height:768});await page.evaluate(()=>setLanguage('vi'));
 await page.locator(`[data-payment-id="${failed}"]`).click();
 await until(page,()=>document.querySelector('#payment-detail-body').textContent.includes('1163'));
 assert.equal(await page.locator('#payment-detail-reconcile').count(),0);
 assert.equal(await page.locator('#payment-detail-refund').count(),0);
 assert.equal(await page.locator('#payment-detail-support').isVisible(),true);
 await page.keyboard.press('Escape');
 await page.locator('#payment-detail-dialog').waitFor({state:'hidden'});

 await page.click('#payment-tab-history');
 await until(page,()=>document.querySelector('#payment-list-panel').getAttribute('aria-busy')==='false'&&document.querySelector('#payment-transaction-rows').textContent.includes('WAITING-100'));
 assert.equal(await page.locator(`[data-payment-id="${failed}"]`).count(),0,'Old payments remain available in attention, outside today history');
 await page.fill('#payment-filter-search','PAID-100');
 await page.locator('#payment-history-filters button[type=submit]').click();
 await until(page,()=>document.querySelector('#payment-transaction-rows').children.length===1);
 const totalBefore=await page.locator('#payment-summary-collected').innerText();
 assert.equal(totalBefore,'TWD 100');
 await page.locator(`[data-payment-id="${paid}"]`).click();
 await page.locator('#payment-detail-refund').waitFor({state:'visible'});
 assert((await page.locator('#payment-detail-body').innerText()).includes('2023042201206549310'));
 await page.click('#payment-detail-refund');
 await page.locator('.payment-dialog textarea').fill('Hết món');
 await page.locator('.payment-dialog button[type=submit]').click();
 await page.locator('.payment-dialog').waitFor({state:'detached'});
 await until(page,()=>document.querySelector('#payment-detail-body').textContent.includes('Đã hoàn tiền'));
 assert.equal(refunds(),1);
 await until(page,()=>document.querySelector('#sidebar-payment-count').textContent==='2');
 await page.keyboard.press('Escape');

 await page.click('#payment-tab-attention');
 await until(page,()=>document.querySelector('#payment-transaction-rows').textContent.includes('UNKNOWN-100'));
 await page.locator(`[data-payment-id="${unknown}"]`).click();
 await page.locator('#payment-detail-reconcile').click();
 await until(page,()=>document.querySelector('#payment-detail-message').textContent.includes('Đã kiểm tra'));
 await page.keyboard.press('Escape');
 await until(page,()=>document.querySelector('#sidebar-payment-count').textContent==='1');

 offline(true);await page.evaluate(()=>PaymentPOS.refresh());
 await until(page,()=>document.querySelector('#payment-workspace-status').textContent.includes('chưa'));
 assert.equal(await page.locator('#sidebar-payment-count').innerText(),'1','Network failure preserves last count');
 offline(false);
 f.db.exec("UPDATE staff_sessions SET revoked_at=datetime('now')");
 await page.evaluate(()=>PaymentPOS.refresh());
 await until(page,()=>document.querySelector('#payment-private-workspace').hidden);
 assert.equal(await page.locator('#payment-transaction-rows tr').count(),0);
 assert.equal(await page.locator('#payment-summary-collected').innerText(),'—');
 assert.equal(await page.locator('.payment-dialog').count(),0,'Background refresh never asks for a PIN');
 await login(page);
 f.db.prepare("UPDATE payments SET status='REFUNDED' WHERE id=?").run(failed);
 await page.evaluate(()=>PaymentPOS.refresh());
 await until(page,()=>document.querySelector('#sidebar-payment-count').hidden);
 await page.evaluate(()=>switchTab('live'));
 assert.equal(await page.locator('#payment-live-alert').isVisible(),false);
 f.db.exec('UPDATE tenant_payment_connections SET enabled=0');
 await page.reload();await page.evaluate(()=>{switchTab('payments');});
 await until(page,()=>!document.querySelector('#tab-payments').hidden);
 configured(false);await page.reload();await page.evaluate(()=>switchTab('payments'));
 await until(page,()=>document.querySelector('#payment-access-description').textContent===t('paymentNotConfigured'));
 assert.equal(await page.locator('#tab-payments').isVisible(),false);
 assert.deepEqual(errors,[]);
});

test('workspace discards superseded filter/tenant responses and pauses polling while hidden',async t=>{
 const {page,errors}=await setup(t,chromium);await page.click('#payment-live-alert');await login(page);
 await page.click('#payment-tab-history');
 await until(page,()=>document.querySelector('#payment-list-panel').getAttribute('aria-busy')==='false');
 let firstStarted,releaseFirst,secondStarted;
 const firstReady=new Promise(resolve=>{firstStarted=resolve;}),secondReady=new Promise(resolve=>{secondStarted=resolve;});
 const row={id:crypto.randomUUID(),orderKey:'second',displayKey:'SECOND-RESULT',createdAt:Date.now(),amount:100,currency:'TWD',status:'PAID'};
 await page.route('**/api/payments/transactions?**',async route=>{
  const query=new URL(route.request().url()).searchParams.get('q');
  if(query==='first'){
   firstStarted();await new Promise(resolve=>{releaseFirst=async()=>{try{await route.fulfill({json:{items:[{...row,displayKey:'STALE-FIRST'}],nextCursor:null}});}catch(_){}resolve();};});return;
  }
  secondStarted();await route.fulfill({json:{items:[row],nextCursor:null}});
 });
 await page.fill('#payment-filter-search','first');await page.locator('#payment-history-filters button[type=submit]').click();await firstReady;
 await page.fill('#payment-filter-search','second');await page.locator('#payment-history-filters button[type=submit]').click();await secondReady;
 await until(page,()=>document.querySelector('#payment-transaction-rows').textContent.includes('SECOND-RESULT'));
 await releaseFirst();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal((await page.locator('#payment-transaction-rows').innerText()).includes('STALE-FIRST'),false);
 let calls=0;page.on('request',request=>{if(request.url().includes('/api/payments/'))calls++;});
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});window.paymentTestTick();});
 assert.equal(calls,0,'Hidden documents do not poll');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});const url=new URL(location.href);url.searchParams.set('tenant','b');history.replaceState(null,'',url);PaymentPOS.refresh();});
 await until(page,()=>document.querySelector('#payment-private-workspace').hidden);
 assert.equal(await page.locator('#payment-transaction-rows tr').count(),0);
 assert.equal(await page.locator('#payment-summary-collected').innerText(),'—');
 assert.deepEqual(errors,[]);
});

for(const [name,engine]of Object.entries({chromium,webkit}))test(`${name}: unconfigured tenant fixes payment to pay later and disables LINE Pay`,async t=>{
 const {page,configured,errors}=await setup(t,engine);
 configured(false);
 await page.evaluate(async()=>{openPaymentSettingsFromWorkspace();await loadStoreStatus();});
 await until(page,()=>document.querySelector('#setting-payment-opt-linepay').disabled);
 const linepay=page.locator('#setting-payment-opt-linepay'),cash=page.locator('#setting-payment-opt-cash');
 assert.equal(await linepay.isChecked(),false);
 assert.equal(await cash.isChecked(),true);
 assert.equal(await cash.isDisabled(),true);
 assert.equal(await page.locator('#payment-card-linepay').getAttribute('aria-disabled'),'true');
 assert.equal(await page.locator('#payment-card-linepay').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(243, 244, 246)');
 assert.match(await page.locator('#i18n-payment-settings-hint').innerText(),/Đặt rồi trả sau/);
 if(process.env.PAYMENT_SETTINGS_SCREENSHOT_DIR){
  fs.mkdirSync(process.env.PAYMENT_SETTINGS_SCREENSHOT_DIR,{recursive:true});
  await page.screenshot({path:path.join(process.env.PAYMENT_SETTINGS_SCREENSHOT_DIR,`${name}-unconfigured.png`),animations:'disabled'});
 }
 await page.evaluate(()=>setLanguage('zh-TW'));
 assert.match(await page.locator('#i18n-payment-settings-hint').innerText(),/固定為/);
 const writes=[];
 await page.route('**/api/config?**',async route=>{if(route.request().method()==='POST')writes.push(route.request().postDataJSON());await route.fulfill({json:{}});});
 await page.evaluate(async()=>{document.querySelector('#setting-payment-opt-linepay').checked=true;document.querySelector('#setting-payment-opt-cash').checked=false;await savePaymentMethodsSetting();});
 assert.deepEqual(writes,[{paymentMethods:['cash']}]);
 assert.equal(await linepay.isChecked(),false);assert.equal(await cash.isChecked(),true);
 configured(true);
 await page.evaluate(()=>loadStoreStatus());
 await until(page,()=>!document.querySelector('#setting-payment-opt-linepay').disabled);
 assert.equal(await linepay.isChecked(),true);assert.equal(await cash.isDisabled(),false);
 assert.equal(await page.locator('#payment-card-linepay').getAttribute('aria-disabled'),'false');
 await until(page,()=>getComputedStyle(document.getElementById('payment-card-linepay')).opacity==='1');
 assert.deepEqual(errors,[]);
});
