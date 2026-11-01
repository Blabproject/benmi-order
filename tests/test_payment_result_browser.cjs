const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const id='11111111-1111-4111-8111-111111111111';
const root=path.resolve(__dirname,'..');
const draft={cart:{meal:1},customizeData:{},comboDrinkData:{},bundleCartData:{}};
const receipt={schemaVersion:1,total:100,rounds:[{roundNumber:1,groups:[],note:'',items:[{lineId:'meal',itemId:'meal',name:'Meal',quantity:1,unitPrice:100,subtotal:100,portions:[{portionIndex:0,groups:[],note:''}],note:''}]}]};
const paid={id,status:'PAID',paidAt:123,amount:100,displayKey:'A001',orderStatus:'NEW',pickupTime:'2026-11-01 12:00',receipt,merchant:{brandName:'Store <safe>',locale:'vi'},menuUrl:'https://fixture.test/?tenant_id=a'};
const menu=`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/payments.css"></head><body><main><div id="sec-checkout"></div><button id="add">Add meal</button><button id="btn-submit" onclick="handleFooterAction()">確認下單</button></main><script>
window.WORKER_BASE='https://api.test';window.getTenantIdFromUrl=()=> 'a';window.currentLocale='vi';
const saved=JSON.parse(localStorage.getItem('cart_save_a')||'null');
window.cart=saved?.cart||{};window.customizeData=saved?.customizeData||{};window.comboDrinkData=saved?.comboDrinkData||{};window.bundleCartData=saved?.bundleCartData||{};
window.isSubmitting=false;window.updateTotal=()=>{};window.DetailCheckout={completed:()=>sessionStorage.removeItem('order_detail_pending:a')};
document.getElementById('add').onclick=()=>{cart.meal=(cart.meal||0)+1;LinePayCheckout.onCartChange();};
</script><script src="/js/client-checkout.js"></script><script src="/js/payment-session.js"></script><script src="/js/payment-view.js"></script><script src="/js/payment-actions.js"></script><script src="/js/client-payments.js"></script></body></html>`;
async function fixture(browser,options={}){
 const context=await browser.newContext({viewport:{width:390,height:844}}),calls=[],errors=[];
 const model={data:paid,...options};
 await context.addInitScript(({id,draft,options})=>{
  if(!sessionStorage.getItem('seeded')){
   sessionStorage.setItem('seeded','1');sessionStorage.setItem('order_detail_pending:a','old-operation');
   const signature=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
   if(!options.missing){
    const checkout={id,token:'a'.repeat(64),payload:{detailVersion:1,dining_option:'takeaway',operationId:'original-operation'},draft,cartSignature:signature(draft),...options.session};
    localStorage.setItem('linepay_checkout:a',JSON.stringify(checkout));
   }
   if(!options.noSavedDraft)localStorage.setItem('cart_save_a',JSON.stringify(options.savedDraft||draft));
  }
 },{id,draft,options:{missing:options.missing,session:options.session,savedDraft:options.savedDraft,noSavedDraft:options.noSavedDraft}});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.startsWith('/api/payments/')){
   calls.push({url:url.href,path:url.pathname,method:req.method(),headers:req.headers(),body:req.postData()});
   if(model.delay&&url.pathname.endsWith('/confirm'))await model.delay;
   if(url.pathname.endsWith('/cancel')&&model.cancelReply&&!model.offline)model.data=model.cancelReply;
   const data=url.pathname.endsWith('/config')?{linePay:{enabled:true}}:url.pathname.endsWith('/request')?{id,status:'PENDING',paymentUrl:'https://sandbox-web-pay.line.me/web/payment/test'}:model.data;
   const offline=model.offline&&!url.pathname.endsWith('/config');
   return route.fulfill({status:offline?503:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(offline?{code:'UNAVAILABLE'}:data)});
  }
  if(url.hostname==='sandbox-web-pay.line.me')return route.fulfill({contentType:'text/html',body:'<h1>Provider sandbox</h1>'});
  if(url.hostname!=='fixture.test')return route.abort();
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:menu});
  const file=url.pathname==='/payment-result'?'payment-result.html':url.pathname.slice(1);
  if(!/^(?:js\/[^/]+\.js|css\/[^/]+\.css|payment-result\.html)$/.test(file))return route.abort();
  return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(root,file),'utf8')});
 });
 const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));
 return {context,page,calls,model,errors,close:async()=>{assert.deepEqual(errors,[]);await context.close();}};
}
const resultUrl='https://fixture.test/payment-result?tenant_id=a&payment_id='+id+'&lang=vi&transactionId=123&orderId=provider-order';
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 test('LINE Pay '+name+': separate paid receipt survives refresh and starts a clean new order',async()=>{
  const browser=await engine.launch({headless:true});try{
   const f=await fixture(browser);const {page,calls}=f;
   await page.goto(resultUrl);await page.getByRole('heading',{name:'Thanh toán thành công',exact:true}).waitFor();
   assert.match(await page.locator('#payment-result').innerText(),/Đơn đã gửi, đang chờ quán xác nhận/);
   assert.equal(await page.locator('#payment-method').count(),0);assert.equal(await page.locator('#payment-brand-name').innerText(),'Store <safe>');
   assert.match(await page.locator('.payment-receipt-meta').innerText(),/A001[\s\S]*TWD 100[\s\S]*2026-11-01 12:00/);
   assert.match(await page.locator('.payment-receipt-items').innerText(),/1 × Meal/);
   assert.equal(await page.evaluate(()=>localStorage.getItem('linepay_checkout:a')),null);
   assert.equal(await page.evaluate(()=>localStorage.getItem('cart_save_a')),null);
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('order_detail_pending:a')),null);
   assert.equal(new URL(page.url()).searchParams.has('transactionId'),false);assert.equal(new URL(page.url()).searchParams.has('orderId'),false);
   const confirm=calls.filter(c=>c.path.endsWith('/confirm'));assert.equal(confirm.length,1);assert.equal(confirm[0].headers['x-payment-token'],'a'.repeat(64));
   assert.equal(new URL(page.url()).searchParams.has('token'),false);
   const button=page.getByRole('button',{name:'Đặt đơn mới'});assert.ok((await button.boundingBox()).height>=48);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.reload();await page.getByRole('heading',{name:'Thanh toán thành công',exact:true}).waitFor();
   assert.equal(calls.filter(c=>c.path.endsWith('/confirm')).length,1);assert.ok(calls.some(c=>c.method==='GET'&&c.path.endsWith(id)));
   if(process.env.PAYMENT_RESULT_SCREENSHOT_DIR){fs.mkdirSync(process.env.PAYMENT_RESULT_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PAYMENT_RESULT_SCREENSHOT_DIR,'paid-'+name+'.png'),fullPage:true});}
   await button.click();await page.waitForURL(url=>url.pathname==='/');await page.waitForSelector('#payment-method');
   assert.equal(await page.locator('#payment-result').count(),0);assert.equal(await page.evaluate(()=>LinePayCheckout.blocked()),false);
   await page.locator('#add').click();assert.equal(await page.evaluate(()=>cart.meal),1);
   await page.evaluate(()=>LinePayCheckout.start({detailVersion:1,dining_option:'takeaway',operationId:'new-operation'}));
   await page.waitForURL('https://sandbox-web-pay.line.me/**');
   const requests=calls.filter(c=>c.path.endsWith('/request'));assert.equal(requests.length,1);assert.notEqual(requests[0].headers['x-payment-token'],'a'.repeat(64));assert.equal(JSON.parse(requests[0].body).operationId,'new-operation');
   await f.close();
  }finally{await browser.close();}
 });
 test('LINE Pay '+name+': cancellation restores draft; unknown or missing capability cannot imply paid',async()=>{
  const browser=await engine.launch({headless:true});try{
   for(const status of ['CANCELLED','FAILED']){
    const cancelled=await fixture(browser,{noSavedDraft:true,session:status==='FAILED'?{draft:null}:{},data:{...paid,status,paidAt:null,receipt:null}});
    await cancelled.page.goto(resultUrl);await cancelled.page.getByRole('button',{name:'Quay lại giỏ hàng'}).click();await cancelled.page.waitForURL(url=>url.pathname==='/');await cancelled.page.waitForSelector('#payment-method');
    assert.equal(await cancelled.page.evaluate(()=>cart.meal),1);assert.equal(await cancelled.page.evaluate(()=>LinePayCheckout.blocked()),false);assert.equal(await cancelled.page.evaluate(()=>sessionStorage.getItem('order_detail_pending:a')),null);
    await cancelled.close();
   }
   const pending=await fixture(browser,{data:{id,status:'UNKNOWN',amount:100,displayKey:'A001'}});
   await pending.page.goto(resultUrl);await pending.page.getByRole('heading',{name:'Đang xác minh thanh toán'}).waitFor();
   assert.equal(await pending.page.getByRole('button',{name:'Đặt đơn mới'}).count(),0);assert.ok(await pending.page.evaluate(()=>localStorage.getItem('linepay_checkout:a')));
   pending.model.offline=true;await pending.page.getByRole('button',{name:'Kiểm tra lại'}).click();
   await pending.page.getByRole('button',{name:'Quay lại menu'}).click();await pending.page.waitForSelector('#payment-method');
   assert.equal(await pending.page.evaluate(()=>LinePayCheckout.blocked()),true);assert.doesNotMatch(await pending.page.locator('#payment-result').innerText(),/thành công/);
   assert.equal(pending.calls.filter(c=>c.path.endsWith('/request')).length,0);await pending.close();
   const missing=await fixture(browser,{missing:true});await missing.page.goto(resultUrl);await missing.page.getByRole('heading',{name:'Chưa thể xem kết quả thanh toán'}).waitFor();
   assert.equal(missing.calls.length,0);assert.equal(await missing.page.locator('.payment-receipt-meta').count(),0);await missing.close();
  }finally{await browser.close();}
 });
 test('LINE Pay '+name+': legacy callbacks migrate; late receipts preserve a different checkout and changed drafts',async()=>{
  const browser=await engine.launch({headless:true});try{
   let release;const delay=new Promise(resolve=>release=resolve);
   const f=await fixture(browser,{delay});
   await f.page.goto('https://fixture.test/?tenant_id=a&payment_id='+id+'&transactionId=123&orderId=old');
   await f.page.waitForURL(url=>url.pathname==='/payment-result');
   await f.page.waitForFunction(()=>!!window.PaymentSession);
   await f.page.evaluate(()=>{
    localStorage.setItem('linepay_checkout:a',JSON.stringify({id:'22222222-2222-4222-8222-222222222222',token:'b'.repeat(64)}));
    localStorage.setItem('cart_save_a',JSON.stringify({cart:{meal:3},customizeData:{},comboDrinkData:{},bundleCartData:{}}));
    sessionStorage.setItem('order_detail_pending:a','new-operation');
   });
   // Old callback still has its own capability archived by the prior menu flow.
   await f.page.evaluate(({id,draft})=>PaymentSession.remember({id,token:'a'.repeat(64),draft}),{id,draft});release();
   await f.page.getByRole('heading',{name:'Thanh toán thành công',exact:true}).waitFor();
   assert.equal(await f.page.evaluate(()=>JSON.parse(localStorage.getItem('linepay_checkout:a')).token),'b'.repeat(64));
   assert.equal(await f.page.evaluate(()=>JSON.parse(localStorage.getItem('cart_save_a')).cart.meal),3);
   assert.equal(await f.page.evaluate(()=>sessionStorage.getItem('order_detail_pending:a')),'new-operation');
   await f.page.getByRole('button',{name:'Đặt đơn mới'}).click();await f.page.waitForSelector('#payment-method');assert.equal(await f.page.evaluate(()=>LinePayCheckout.blocked()),true);
   await f.close();
   const changed=await fixture(browser,{savedDraft:{...draft,cart:{meal:3}}});await changed.page.goto(resultUrl);await changed.page.getByRole('heading',{name:'Thanh toán thành công',exact:true}).waitFor();
   await changed.page.evaluate(()=>sessionStorage.setItem('order_detail_pending:a',JSON.stringify({payload:{operationId:'new-operation'}})));
   await changed.page.reload();await changed.page.getByRole('heading',{name:'Thanh toán thành công',exact:true}).waitFor();
   assert.equal(await changed.page.evaluate(()=>JSON.parse(sessionStorage.getItem('order_detail_pending:a')).payload.operationId),'new-operation');
   await changed.page.getByRole('button',{name:'Đặt đơn mới'}).click();await changed.page.waitForSelector('#payment-method');
   assert.equal(await changed.page.evaluate(()=>cart.meal),3);assert.equal(await changed.page.locator('#payment-result').count(),0);await changed.close();
   const legacy=await fixture(browser,{session:{completed:true}});await legacy.page.goto('https://fixture.test/?tenant_id=a');await legacy.page.waitForSelector('#payment-method');
   assert.equal(await legacy.page.evaluate(()=>LinePayCheckout.blocked()),false);assert.equal(await legacy.page.evaluate(()=>cart.meal),1);assert.equal(await legacy.page.locator('#payment-result').count(),0);await legacy.close();
  }finally{await browser.close();}
 });
}

for(const [name,engine] of [['chromium',chromium],['webkit',webkit]])test('LINE Pay '+name+': cancel from real checkout gate retains edited cart and permits fresh payment',async()=>{
 const browser=await engine.launch({headless:true});try{
  const pending={id,status:'PENDING',amount:100,displayKey:'A001',canCancel:true};
  const f=await fixture(browser,{data:pending,cancelReply:{...pending,status:'CANCELLED',canCancel:false,outcome:'cancelled',cancelRequestedAt:123}});
  await f.page.goto('https://fixture.test/?tenant_id=a&lang=vi');await f.page.waitForSelector('#payment-method');
  const other=await f.context.newPage();await other.goto('https://fixture.test/?tenant_id=a&lang=vi');await other.waitForSelector('#payment-method');
  await f.page.locator('#add').click();await f.page.locator('#add').click();
  const originalURL=f.page.url();assert.equal(await f.page.locator('#btn-submit').textContent(),'Xử lý thanh toán đang chờ');
  await f.page.locator('#btn-submit').click();await f.page.locator('#payment-choice-dialog').waitFor();assert.equal(f.page.url(),originalURL);
  await f.page.locator('#payment-choice-dialog').getByRole('button',{name:'Hủy phiên cũ',exact:true}).click();
  if(process.env.PAYMENT_RESULT_SCREENSHOT_DIR){fs.mkdirSync(process.env.PAYMENT_RESULT_SCREENSHOT_DIR,{recursive:true});await f.page.screenshot({path:path.join(process.env.PAYMENT_RESULT_SCREENSHOT_DIR,'cancel-'+name+'.png'),fullPage:true});}
  await f.page.getByRole('button',{name:'Xác nhận hủy',exact:true}).click();await f.page.waitForSelector('#payment-cancel-dialog',{state:'detached'});
  await other.waitForFunction(()=>!LinePayCheckout.blocked());assert.equal(await other.evaluate(()=>sessionStorage.getItem('order_detail_pending:a')),null);assert.equal(await other.evaluate(()=>cart.meal),1);await other.close();
  assert.equal(await f.page.evaluate(()=>cart.meal),3);assert.equal(await f.page.evaluate(()=>LinePayCheckout.blocked()),false);assert.equal(await f.page.evaluate(()=>LinePayCheckout.selected()),false);
  assert.equal(await f.page.evaluate(()=>JSON.parse(localStorage.getItem('cart_save_a')).cart.meal),3);
  assert.equal(await f.page.evaluate(()=>sessionStorage.getItem('order_detail_pending:a')),null);
  assert.equal(f.calls.filter(c=>c.path.endsWith('/request')).length,0);assert.equal(f.calls.filter(c=>c.path.endsWith('/cancel')).length,1);
  await f.page.selectOption('#payment-method','line_pay');await f.page.evaluate(()=>LinePayCheckout.start({detailVersion:1,dining_option:'takeaway',operationId:'new-operation-after-cancel'}));await f.page.waitForURL('https://sandbox-web-pay.line.me/**');
  assert.equal(f.calls.filter(c=>c.path.endsWith('/request')).length,1);assert.notEqual(f.calls.find(c=>c.path.endsWith('/request')).headers['x-payment-token'],'a'.repeat(64));await f.close();
  // A missing ID is resolved without reissuing Request. Network errors leave the checkout locked.
  const missing=await fixture(browser,{session:{id:null},data:pending,cancelReply:{...pending,status:'UNKNOWN',cancelRequestedAt:123,outcome:'verifying'}});
  await missing.page.goto('https://fixture.test/?tenant_id=a&lang=vi');await missing.page.waitForSelector('#payment-method');
  await missing.page.getByRole('button',{name:'Hủy phiên cũ',exact:true}).click();missing.model.offline=true;
  await missing.page.getByRole('button',{name:'Xác nhận hủy',exact:true}).click();await missing.page.locator('dialog [role=status]').filter({hasText:'Chưa xác nhận'}).waitFor();
  assert.equal(await missing.page.evaluate(()=>LinePayCheckout.blocked()),true);
  missing.model.offline=false;await missing.page.getByRole('button',{name:'Xác nhận hủy',exact:true}).click();await missing.page.waitForSelector('#payment-cancel-dialog',{state:'detached'});
  assert.equal(await missing.page.evaluate(()=>LinePayCheckout.blocked()),true);assert.match(await missing.page.locator('#payment-result').textContent(),/Đang kiểm tra trước khi hủy/);
  assert.ok(missing.calls.some(c=>c.path.endsWith('/checkout')&&c.method==='GET'));assert.equal(missing.calls.filter(c=>c.path.endsWith('/request')).length,0);await missing.close();
 }finally{await browser.close();}
});
