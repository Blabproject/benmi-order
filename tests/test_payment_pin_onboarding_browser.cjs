const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('playwright');
const {fixture,tenant}=require('./helpers/payments.cjs');
const {handlePaymentRoute}=require('../benmi-worker-official/src/modules/payments.ts');
const {handleAuthChange}=require('../benmi-worker-official/src/modules/auth.ts');
const {sha256Hex}=require('../benmi-worker-official/src/modules/staff.ts');
const root=path.resolve(__dirname,'..');

async function setup(t,engine,{saved,lang}){
 const f=await fixture();t.after(()=>f.db.close());
 const original=f.env.ORDER_STATE,values=new Map([['tenant:a:password','12345678']]);
 f.env.ORDER_STATE={get:async(key,type)=>values.has(key)?values.get(key):original.get(key,type),put:async(key,value)=>values.set(key,value),delete:async key=>values.delete(key)};
 const oldToken='d'.repeat(64),oldHash=await sha256Hex(oldToken);
 await f.env.DB.prepare(`INSERT INTO staff_sessions(token_hash,tenant_id,pin_hash,expires_at,created_at)
  VALUES(?,'a',?,datetime('now','+1 hour'),datetime('now'))`).bind(oldHash,await sha256Hex('12345678')).run();
 const browser=await engine.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:saved?{width:390,height:844}:{width:1024,height:768},hasTouch:true});
 page.setDefaultTimeout(7000);const errors=[],requests=[];let loseNextChange=false;
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.dismiss());
 await page.addInitScript(({saved,oldToken})=>{window.setInterval=()=>0;window.confirm=()=>true;if(saved)sessionStorage.setItem('staff_session_token_a',oldToken);},{saved,oldToken});
 await page.route('**/*',async route=>{
  const r=route.request(),url=new URL(r.url());
  if(url.pathname==='/orders.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'orders.html'),'utf8').replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi,'')});
  if(/^\/(js|css)\/[\w.-]+$/.test(url.pathname))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(path.join(root,url.pathname.slice(1)),'utf8')});
  if(url.pathname.startsWith('/api/payments/')||url.pathname==='/api/auth/change'){
   if(r.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
   requests.push({path:url.pathname,method:r.method(),url:r.url()});
   if(url.pathname==='/api/auth/change'&&loseNextChange){loseNextChange=false;return route.abort();}
   assert(!/\/(refunds|reconcile|confirm)$/.test(url.pathname),'Changing credentials must not resume financial actions');
   const request=new Request(url,{method:r.method(),headers:r.headers(),...(['GET','HEAD'].includes(r.method())?{}:{body:r.postData()})});
   const response=url.pathname==='/api/auth/change'?await handleAuthChange(request,f.env,tenant):await handlePaymentRoute(request,f.env,tenant,url.pathname);
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  }
  return route.fulfill({json:{}});
 });
 await page.goto('https://pos.test/orders.html?tenant=a&env=dev#payments');
 await page.evaluate(lang=>{initSidebarState();setLanguage(lang);switchTab('payments');},lang);
 return {f,page,values,oldHash,errors,requests,loseChange:()=>{loseNextChange=true;}};
}

async function feedback(page,key){await page.waitForFunction(key=>document.querySelector('#store-pin-feedback').textContent===t(key),key);}
async function screenshot(page,name){
 const folder=process.env.PAYMENT_PIN_SCREENSHOT_DIR||process.env.POS_DISPLAY_SCREENSHOT_DIR;if(!folder)return;
 fs.mkdirSync(folder,{recursive:true});await page.screenshot({path:path.join(folder,name+'.png'),fullPage:true});
}

for(const [name,engine]of Object.entries({chromium,webkit}))for(const saved of [false,true])test(`${name}: default PIN onboarding, ${saved?'saved session/mobile/zh-TW':'new login/tablet/vi'}`,async t=>{
 const {f,page,values,oldHash,errors,requests,loseChange}=await setup(t,engine,{saved,lang:saved?'zh-TW':'vi'});
 if(!saved){
  await page.click('#payment-workspace-login');
  await page.locator('.payment-dialog input').fill('0000');await page.locator('.payment-dialog button[type=submit]').click();
  await page.getByRole('alert').filter({hasText:'PIN'}).waitFor();
  assert.equal(await page.locator('.payment-dialog [data-payment-i18n="paymentChangePinContinue"]').isVisible(),false,'Wrong credentials do not claim the store uses a default PIN');
  await page.locator('.payment-dialog input').fill('12345678');await page.locator('.payment-dialog button[type=submit]').click();
  await page.locator('.payment-dialog [data-payment-i18n="paymentChangePinContinue"]').waitFor({state:'visible'});
  assert.equal(await page.locator('.payment-dialog input').isEnabled(),false);
  await screenshot(page,name+'-default-pin-blocked');
  await page.locator('.payment-dialog [data-payment-i18n="paymentChangePinContinue"]').click();
 }else{
  await page.locator('#payment-workspace-change-pin').waitFor({state:'visible'});
  assert.equal(await page.locator('.payment-dialog').count(),0,'Restoring a default-PIN session does not force a popup');
  assert.equal((await page.locator('#payment-access-description').innerText()).includes('預設 PIN'),true);
  await page.click('#payment-workspace-change-pin');
 }
 await page.locator('#store-pin-new').waitFor({state:'visible'});
 assert.equal(new URL(page.url()).hash,'#settings');
 assert.equal(await page.locator('#setting-card-store-pairing').isVisible(),true);
 assert.equal(await page.inputValue('#store-pin-current'),'12345678');
 assert.equal(await page.locator('#store-pin-current').getAttribute('type'),'password');
 assert.equal(await page.locator(':focus').getAttribute('id'),'store-pin-new');
 assert.equal(await page.locator('#store-pin-payment-context').isVisible(),true);
 await screenshot(page,name+(saved?'-mobile-pin-form-zh':'-tablet-pin-form-vi'));
 if(!saved){
  await page.click('#store-pin-back-to-payments');
  await page.locator('#payment-workspace-change-pin').waitFor({state:'visible'});
  assert.equal(await page.inputValue('#store-pin-current'),'');
  assert.equal(await page.inputValue('#store-pin-new'),'');
  await page.click('#payment-workspace-change-pin');
  await page.evaluate(()=>switchSettingTab('status'));
  assert.equal(await page.inputValue('#store-pin-current'),'');
  await page.evaluate(()=>switchSettingTab('store-pairing'));
  assert.equal(await page.locator('#store-pin-back-to-payments').isVisible(),false,'Leaving the PIN section cancels its return context');
  await page.evaluate(()=>switchTab('payments'));await page.click('#payment-workspace-change-pin');
  await page.fill('#store-pin-new','12345678');await page.fill('#store-pin-confirm','12345678');
  await page.click('#store-pin-submit');await feedback(page,'pinPaymentDefaultNotAllowed');
  assert.equal(requests.filter(r=>r.path==='/api/auth/change').length,0);
  await page.click('[data-store-pin-i18n="pinClear"]');
  assert.equal(await page.inputValue('#store-pin-current'),'');
  assert.equal(await page.locator('#store-pin-back-to-payments').isVisible(),true,'Clear retains the guided return path');
  await page.fill('#store-pin-current','12345678');
 }
 const next=saved?'00123456':'012345';
 await page.fill('#store-pin-new',next);await page.fill('#store-pin-confirm',next);
 if(!saved){
  loseChange();await page.click('#store-pin-submit');await feedback(page,'pinNetworkError');
  assert.equal(new URL(page.url()).hash,'#settings');assert.equal(await page.locator('#store-pin-back-to-payments').isVisible(),true);
 }
 await page.click('#store-pin-submit');
 await page.locator('#payment-workspace-login').waitFor({state:'visible'});
 assert.equal(new URL(page.url()).hash,'#payments');
 assert.equal(await page.locator('#payment-workspace-status').innerText(),await page.evaluate(()=>t('paymentPinChangedLogin')));
 assert.equal(await page.locator('#payment-workspace-login').innerText(),await page.evaluate(()=>t('paymentLoginNewPin')));
 assert.equal(await page.locator(':focus').getAttribute('id'),'payment-workspace-login');
 assert.equal(await page.inputValue('#store-pin-current'),'');assert.equal(await page.inputValue('#store-pin-new'),'');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('staff_session_token_a')),null);
 assert.equal(values.get('tenant:a:password'),next);
 assert((await f.env.DB.prepare('SELECT revoked_at FROM staff_sessions WHERE token_hash=?').bind(oldHash).first()).revoked_at);
 await page.click('#payment-workspace-login');await page.locator('.payment-dialog input').fill(next);await page.locator('.payment-dialog button[type=submit]').click();
 await page.locator('.payment-dialog').waitFor({state:'detached'});
 await page.locator('#payment-private-workspace').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('#payment-list-panel').getAttribute('aria-busy')==='false');
 const browserValues=await page.evaluate(()=>JSON.stringify([...Object.values(localStorage),...Object.values(sessionStorage)]));
 assert.equal(browserValues.includes(next),false);assert.equal(browserValues.includes('12345678'),false);
 assert(requests.every(r=>!r.url.includes(next)&&!r.url.includes('12345678')));
 assert.equal(requests.some(r=>/\/(refunds|reconcile|confirm)$/.test(r.path)),false);
 if(!saved){
  await page.evaluate(()=>{switchTab('settings');switchSettingTab('store-pairing');});
  assert.equal(await page.locator('#store-pin-payment-context').isVisible(),false);
  await page.fill('#store-pin-current',next);await page.fill('#store-pin-new','9876');await page.fill('#store-pin-confirm','9876');
  await page.click('#store-pin-submit');await feedback(page,'pinChangeSuccess');
  assert.equal(new URL(page.url()).hash,'#settings','An ordinary PIN change does not redirect to Payments');
 }
 assert.deepEqual(errors,[]);
});

test('default PIN discovered during a refund exits the order modal and never resumes the refund',async t=>{
 const {f,page,requests,errors}=await setup(t,chromium,{saved:false,lang:'vi'});
 const id=f.seed({orderStatus:'REJECTED'});
 await page.evaluate(id=>{
  switchTab('live');
  PaymentPOS.mount({key:'setup-order',displayKey:'SETUP',status:'REJECTED',payment:{id,status:'PAID',amount:100}});
  document.querySelector('#reviewModal').style.display='flex';
 },id);
 await page.locator('#review-payment button').click();
 await page.locator('.payment-dialog input').fill('12345678');await page.locator('.payment-dialog button[type=submit]').click();
 await page.locator('.payment-dialog [data-payment-i18n="paymentChangePinContinue"]').click();
 await page.locator('#store-pin-new').waitFor({state:'visible'});
 assert.equal(await page.locator('#reviewModal').isVisible(),false);
 assert.equal(await page.locator('.payment-dialog').count(),0);
 await page.fill('#store-pin-new','012345');await page.fill('#store-pin-confirm','012345');await page.click('#store-pin-submit');
 await page.locator('#payment-workspace-login').waitFor({state:'visible'});
 await page.click('#payment-workspace-login');await page.locator('.payment-dialog input').fill('012345');await page.locator('.payment-dialog button[type=submit]').click();
 await page.locator('#payment-private-workspace').waitFor({state:'visible'});
 assert.equal(requests.some(r=>/\/(refunds|reconcile|confirm)$/.test(r.path)),false);
 assert.equal(f.db.prepare('SELECT status FROM payments WHERE id=?').get(id).status,'PAID');
 // A later tenant change cannot retain the previous tenant's PIN form values.
 await page.evaluate(()=>{switchTab('settings');switchSettingTab('store-pairing');});
 await page.fill('#store-pin-current','012345');await page.fill('#store-pin-new','9876');
 await page.evaluate(()=>{const url=new URL(location.href);url.searchParams.set('tenant','b');history.replaceState(null,'',url);PaymentPOS.refresh();});
 assert.equal(await page.inputValue('#store-pin-current'),'');assert.equal(await page.inputValue('#store-pin-new'),'');
 assert.equal(await page.locator('#store-pin-back-to-payments').isVisible(),false);
 assert.deepEqual(errors,[]);
});
