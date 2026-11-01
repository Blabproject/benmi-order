const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const fs=require('node:fs');
const pos=fs.readFileSync('js/orders-payments.js','utf8');
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]])test('LINE Pay '+name+': keyboard refund confirmation',async()=>{
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('https://fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<main><div id="sec-checkout"></div><div><span id="review-total"></span></div></main>'}));
  await page.goto('https://fixture.test/');
  await page.addStyleTag({content:fs.readFileSync('css/payments.css','utf8')});
  await page.setViewportSize({width:1024,height:768});
  await page.evaluate(()=>{
   window.WORKER_BASE='https://api.test';window.getTenantIdFromUrl=()=> 'a';window.calls=[];
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
