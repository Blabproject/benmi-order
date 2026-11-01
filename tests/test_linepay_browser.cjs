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
    return new Response(JSON.stringify({id:'11111111-1111-4111-8111-111111111111',status:'PAID',paidAt:Date.now(),amount:100,displayKey:'A001'}));
   };
  });
  await page.addScriptTag({content:client});
  await page.waitForSelector('#payment-method');
  await page.selectOption('#payment-method','line_pay');
  await page.evaluate(()=>LinePayCheckout.start({detailVersion:1,dining_option:'takeaway',operationId:'test-operation-id'}));
  assert.match(await page.locator('#payment-result').innerText(),/Đang xác minh/);
  assert.equal(await page.evaluate(()=>LinePayCheckout.blocked()),true);
  await page.evaluate(()=>LinePayCheckout.resume());
  assert.match(await page.locator('#payment-result').innerText(),/Thanh toán thành công/);
  assert.deepEqual(await page.evaluate(()=>window.cart),{});
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
