const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const fs=require('node:fs');
const client=fs.readFileSync('js/client-payments.js','utf8'),pos=fs.readFileSync('js/orders-payments.js','utf8');
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]])test('LINE Pay '+name+': checkout recovery and keyboard refund confirmation',async()=>{
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('https://fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<main><div id="sec-checkout"></div><div><span id="review-total"></span></div></main>'}));
  await page.goto('https://fixture.test/');
  await page.addStyleTag({content:fs.readFileSync('css/payments.css','utf8')});
  await page.evaluate(()=>{
   window.WORKER_BASE='https://api.test';window.getTenantIdFromUrl=()=> 'a';window.currentLocale='vi';window.cart={meal:1};window.updateTotal=()=>{};
   window.calls=[];window.fetch=async(url,opts)=>{
    calls.push({url,method:opts?.method});
    if(url.includes('/config'))return new Response(JSON.stringify({linePay:{enabled:true,configured:true}}));
    if(url.includes('/request'))return new Response(JSON.stringify({id:'11111111-1111-4111-8111-111111111111',status:'UNKNOWN'}));
    return new Response(JSON.stringify({id:'11111111-1111-4111-8111-111111111111',status:'PAID',paidAt:Date.now(),amount:100,displayKey:'A001',receipt:{schemaVersion:1,total:100,rounds:[{roundNumber:1,groups:[],note:'',items:[{lineId:'meal',itemId:'meal',name:'Meal',quantity:1,unitPrice:100,subtotal:100,portions:[{portionIndex:0,groups:[],note:''}],note:''}]}]}}));
   };
  });
  await page.addScriptTag({content:fs.readFileSync('js/order-detail-view.js','utf8')});
  await page.addScriptTag({content:client});
  await page.waitForSelector('#payment-method');
  await page.selectOption('#payment-method','line_pay');
  await page.evaluate(()=>LinePayCheckout.start({detailVersion:1,dining_option:'takeaway',operationId:'test-operation-id'}));
  assert.match(await page.locator('#payment-result').innerText(),/Đang xác minh/);
  assert.equal(await page.evaluate(()=>LinePayCheckout.blocked()),true);
  await page.evaluate(()=>LinePayCheckout.resume());
  assert.match(await page.locator('#payment-result').innerText(),/Thanh toán thành công/);
  assert.deepEqual(await page.evaluate(()=>window.cart),{});
  assert.equal(await page.locator('.payment-receipt-details').evaluate(el=>el.open),false);
  await page.locator('.payment-receipt-toggle').click();
  assert.equal(await page.locator('.payment-receipt-details').evaluate(el=>el.open),true);
  assert.match(await page.locator('.payment-receipt-items').innerText(),/1 × Meal/);
  assert.equal(await page.locator('#payment-result pre').count(),0);
  const methodBox=await page.locator('#payment-method').boundingBox();assert.ok(methodBox.height>=48);
  const resultBox=await page.locator('#payment-result').boundingBox();assert.ok(resultBox.width<=390);

  assert.equal(await page.evaluate(()=>calls.filter(x=>x.url.includes('/request')).length),1);
  await page.locator('#payment-result button').click();
  assert.equal(await page.evaluate(()=>LinePayCheckout.blocked()),false);
  await page.setViewportSize({width:1024,height:768});
  await page.evaluate(()=>{
   window.t=k=>({paymentRefund:'Hoàn toàn bộ tiền LINE Pay',paymentReason:'Lý do hoàn tiền',paymentConfirm:'Xác nhận',paymentCancel:'Hủy',paymentPAID:'Đã thanh toán'}[k]||k);
   window.escapeHtml=s=>s;window.fetchOrders=async()=>{};
   sessionStorage.setItem('staff_session_token_a','valid-token');
   window.fetch=async(url,opts)=>{
    calls.push({url,body:opts?.body});
    if(url.includes('/config'))return new Response(JSON.stringify({linePay:{configured:true}}));
    return new Response(JSON.stringify({id:'11111111-1111-4111-8111-111111111111',status:'REFUNDED',amount:100}));
   };
  });
  await page.addScriptTag({content:pos});
  await page.evaluate(()=>PaymentPOS.mount({key:'a1',status:'REJECTED',payment:{id:'11111111-1111-4111-8111-111111111111',status:'PAID',amount:100}}));
  const refund=page.locator('#review-payment button');
  const box=await refund.boundingBox();assert.ok(box.height>=48);
  await refund.click();
  await page.waitForSelector('dialog[open]');
  assert.equal(await page.locator('dialog textarea').evaluate(el=>document.activeElement===el),true);
  await page.locator('dialog textarea').fill('Hết món');
  await page.getByRole('button',{name:'Xác nhận',exact:true}).click();
  await page.waitForSelector('dialog',{state:'detached'});
  const calls=await page.evaluate(()=>window.calls.filter(x=>x.url.includes('/refunds')));assert.equal(calls.length,1);
  assert.equal(JSON.parse(calls[0].body).reason,'Hết món');
 }finally{await browser.close();}
});
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]])test('LINE Pay '+name+': expired owner session reauthenticates with clear PIN errors and safe refund replay',async()=>{
 const browser=await engine.launch({headless:true});try{
  const page=await browser.newPage();
  await page.route('https://fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<main></main><div><span id="review-total"></span></div>'}));
  await page.goto('https://fixture.test/');await page.addStyleTag({content:fs.readFileSync('css/payments.css','utf8')});
  await page.evaluate(()=>{
   window.WORKER_BASE='https://api.test';window.getTenantIdFromUrl=()=> 'a';
   window.t=k=>({paymentInvalidPIN:'PIN không đúng',paymentDefaultPIN:'Hãy đổi PIN mặc định',paymentConfirm:'Xác nhận',paymentCancel:'Hủy',paymentRefund:'Hoàn tiền',paymentReason:'Lý do'}[k]||k);
   window.escapeHtml=s=>s;window.fetchOrders=async()=>{};
   sessionStorage.setItem('staff_session_token_a','expired-token');
   window.requests=[];window.currentToken='valid-one';window.expireRefund=true;window.loginMode='normal';window.refunds=0;
   window.fetch=async(url,opts)=>{
    const method=opts?.method||'GET',body=opts?.body?JSON.parse(opts.body):null;
    requests.push({url,method,body,authorization:opts?.headers?.Authorization});
    const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
    if(url.includes('/config'))return reply({linePay:{configured:true}});
    if(url.includes('/session')){
     if(method==='GET')return opts.headers.Authorization==='Bearer '+currentToken?reply({ok:true}):reply({code:'SESSION_REQUIRED'},401);
     if(loginMode==='default')return reply({code:'PAYMENT_PIN_CHANGE_REQUIRED'},409);
     return body.password==='87654321'?reply({token:currentToken}):reply({code:'INVALID_PASSWORD'},401);
    }
    if(url.includes('/refunds')){
     refunds++;if(expireRefund){expireRefund=false;currentToken='valid-two';return reply({code:'SESSION_REQUIRED'},401);}
     return reply({id:'11111111-1111-4111-8111-111111111111',status:'REFUNDED',amount:100});
    }
    return reply([]);
   };
  });
  await page.addScriptTag({content:pos});
  await page.evaluate(()=>{window.ownerAuth=PaymentPOS.token();});
  await page.waitForSelector('dialog[open] input');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('staff_session_token_a')),null);
  await page.locator('dialog input').fill('wrong');await page.getByRole('button',{name:'Xác nhận',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'PIN không đúng'}).waitFor();
  await page.evaluate(()=>{loginMode='default';});
  await page.locator('dialog input').fill('12345678');await page.getByRole('button',{name:'Xác nhận',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Hãy đổi PIN mặc định'}).waitFor();
  await page.evaluate(()=>{loginMode='normal';});
  await page.locator('dialog input').fill('87654321');await page.getByRole('button',{name:'Xác nhận',exact:true}).click();
  await page.waitForSelector('dialog',{state:'detached'});assert.equal(await page.evaluate(()=>ownerAuth),'valid-one');
  await page.evaluate(()=>PaymentPOS.mount({key:'one',status:'NEW',payment:{id:'11111111-1111-4111-8111-111111111111',status:'PAID',amount:100}}));
  await page.locator('#review-payment button').click();await page.locator('dialog textarea').fill('Hết món');
  await page.getByRole('button',{name:'Xác nhận',exact:true}).click();
  await page.waitForSelector('dialog input[type=password]');
  assert.equal(await page.locator('dialog[open]').count(),2);
  await page.locator('dialog input').fill('87654321');await page.locator('dialog').last().getByRole('button',{name:'Xác nhận',exact:true}).click();
  await page.waitForSelector('dialog',{state:'detached'});
  const refunded=await page.evaluate(()=>requests.filter(r=>r.url.includes('/refunds')));
  assert.equal(refunded.length,2);assert.equal(refunded[0].body.operationId,refunded[1].body.operationId);
  assert.equal(refunded[0].authorization,'Bearer valid-one');assert.equal(refunded[1].authorization,'Bearer valid-two');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('staff_session_token_a')),'valid-two');
 }finally{await browser.close();}
});
async function cartPaymentFixture(browser,{completed=false,restoreQty=1,defer=false}={}) {
 const page=await browser.newPage();
 await page.route('https://fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<main><section id="sec-checkout"><div id="cart-summary"></div></section><button id="add-meal" onclick="updateQty(\'food\',\'Meal\',1)">Add meal</button></main>'}));
 await page.goto('https://fixture.test/?tenant_id=a&lang=vi&payment_id=old-payment&transactionId=old-transaction&orderId=old-order#menu');
 await page.evaluate(({completed,restoreQty,defer})=>{
  window.WORKER_BASE='https://api.test';window.getTenantIdFromUrl=()=> 'a';window.currentLocale='vi';
  window.cart=restoreQty?{food_Meal:restoreQty}:{};window.customizeData={};window.comboDrinkData={};window.bundleCartData={};
  window.bootstrapData={catalog:[{slug:'food',items:[{id:'meal',name:'Meal',price:100}]}],customizations:[]};
  window.resolveCatalogItem=()=>({origName:'Meal',displayName:'Meal',basePrice:100});window.shouldAutoOpenItemOptions=()=>false;
  window.escapeHtml=value=>String(value);window.detailCompleted=0;window.DetailCheckout={completed:()=>detailCompleted++};
  window.payCalls=[];window.deferConfirm=defer;window.confirmStarted=false;
  if(completed||defer)localStorage.setItem('linepay_checkout:a',JSON.stringify({id:'old-payment',token:'b'.repeat(64),completed}));
  window.fetch=async(url,opts)=>{
   payCalls.push({url,token:opts?.headers?.['X-Payment-Token'],body:opts?.body?JSON.parse(opts.body):null});
   if(url.includes('/config'))return new Response(JSON.stringify({linePay:{enabled:true}}));
   if(url.includes('/request'))return new Response(JSON.stringify({id:'payment-'+payCalls.filter(c=>c.url.includes('/request')).length,status:'PENDING'}));
   const paid={id:'old-payment',status:'PAID',paidAt:Date.now(),amount:100,displayKey:'OLD-001'};
   if(deferConfirm){confirmStarted=true;return new Promise(resolve=>{window.resolveConfirm=()=>resolve(new Response(JSON.stringify(paid)));});}
   return new Response(JSON.stringify(paid));
  };
 },{completed,restoreQty,defer});
 await page.addScriptTag({content:fs.readFileSync('js/client-cart.js','utf8')});
 await page.addScriptTag({content:client});
 return page;
}
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]])test('LINE Pay '+name+': new carts retire paid receipts and stale callbacks cannot erase or relabel them',async()=>{
 const browser=await engine.launch({headless:true});try{
  const page=await cartPaymentFixture(browser);await page.waitForSelector('#payment-method');
  await page.evaluate(()=>LinePayCheckout.start({detailVersion:1,dining_option:'takeaway',operationId:'first-operation-id'}));
  const firstToken=await page.evaluate(()=>JSON.parse(localStorage.getItem('linepay_checkout:a')).token);
  await page.evaluate(()=>LinePayCheckout.resume());await page.locator('.payment-receipt-key').filter({hasText:'OLD-001'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>cart),{});
  await page.locator('#add-meal').click();
  assert.equal(await page.locator('#payment-result').count(),0);assert.equal(await page.evaluate(()=>LinePayCheckout.blocked()),false);
  assert.equal(await page.evaluate(()=>cart.food_Meal),1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('linepay_checkout:a')),null);
  await page.evaluate(()=>LinePayCheckout.start({detailVersion:1,dining_option:'takeaway',operationId:'second-operation-id'}));
  const requests=await page.evaluate(()=>payCalls.filter(c=>c.url.includes('/request')));
  assert.equal(requests.length,2);assert.notEqual(requests[1].token,firstToken);
  assert.equal(requests[1].body.operationId,'second-operation-id');
  assert.doesNotMatch(await page.locator('#payment-result').innerText(),/OLD-001|Thanh toán thành công/);
  await page.close();

  // Migrate sessions already marked completed by older deployed clients on reload.
  const restored=await cartPaymentFixture(browser,{completed:true,restoreQty:3});await restored.waitForSelector('#payment-method');
  assert.equal(await restored.locator('#payment-result').count(),0);
  assert.equal(await restored.evaluate(()=>cart.food_Meal),3);
  assert.equal(await restored.evaluate(()=>payCalls.filter(c=>!c.url.includes('/config')).length),0);
  const url=new URL(restored.url());assert.equal(url.searchParams.get('lang'),'vi');assert.equal(url.hash,'#menu');
  for(const param of ['payment_id','transactionId','orderId'])assert.equal(url.searchParams.has(param),false);
  await restored.close();

  // A response for a replaced checkout must not recreate an old receipt or clear a new cart.
  const stale=await cartPaymentFixture(browser,{restoreQty:3,defer:true});await stale.waitForFunction(()=>confirmStarted);
  await stale.evaluate(()=>{localStorage.setItem('linepay_checkout:a',JSON.stringify({id:'new-payment',token:'c'.repeat(64)}));resolveConfirm();});
  await stale.waitForSelector('#payment-method');
  assert.equal(await stale.locator('#payment-result').count(),0);assert.equal(await stale.evaluate(()=>cart.food_Meal),3);
  assert.equal(await stale.evaluate(()=>JSON.parse(localStorage.getItem('linepay_checkout:a')).id),'new-payment');
  await stale.close();

  // Preserve a changed draft even when the late paid response belongs to this same session.
  const late=await cartPaymentFixture(browser);await late.waitForSelector('#payment-method');
  await late.evaluate(()=>LinePayCheckout.start({detailVersion:1,dining_option:'takeaway',operationId:'late-operation-id'}));
  await late.evaluate(()=>{deferConfirm=true;window.lateResume=LinePayCheckout.resume();});await late.waitForFunction(()=>confirmStarted);
  await late.locator('#add-meal').click();
  assert.equal(await late.evaluate(()=>LinePayCheckout.blocked()),true);
  await late.evaluate(()=>resolveConfirm());await late.evaluate(()=>lateResume);
  assert.equal(await late.evaluate(()=>cart.food_Meal),2);assert.equal(await late.locator('#payment-result').count(),0);
  assert.equal(await late.evaluate(()=>LinePayCheckout.blocked()),false);await late.close();
 }finally{await browser.close();}
});
