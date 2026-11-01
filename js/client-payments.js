/* Menu owns the draft; all payment results live on the dedicated result page. */
window.LinePayCheckout = (function () {
  const S=PaymentSession;
  const text=(zh,vi)=>(typeof currentLocale!=='undefined'?currentLocale:document.documentElement.lang)==='vi'?vi:zh;
  let busy=false,lastSession=null;
  function selected(){return document.getElementById('payment-method')?.value==='line_pay';}
  function removeBanner(){document.getElementById('payment-result')?.remove();}
  function retireCompleted(){const saved=S.active();if(saved?.completed){S.detach(saved);S.completeDetail();removeBanner();S.cleanUrl();}}
  function onCartChange(){if(Object.values(window.cart||{}).some(qty=>Number(qty)>0))retireCompleted();}
  function blocked(){onCartChange();return !!S.active()&&!S.active()?.completed;}
  function showResume(){
    const session=S.active();if(!session)return;
    removeBanner();const panel=PaymentView.element('section','payment-panel');panel.id='payment-result';panel.setAttribute('aria-live','polite');
    panel.append(PaymentView.element('p','',text('您有一筆付款尚待確認。','Bạn có một thanh toán chưa xác minh xong.')));
    const button=PaymentView.element('button','payment-button',text('查看付款結果','Kiểm tra thanh toán'));button.type='button';button.onclick=()=>resume();panel.append(button);document.getElementById('sec-checkout')?.prepend(panel);
  }
  function launch(data){const inLine=typeof liff!=='undefined'&&liff.isInClient();location.assign(inLine&&data.appUrl?data.appUrl:data.paymentUrl);}
  async function resume(openPayment){
    if(busy)return;const session=S.active();if(!session)return;if(session.completed){retireCompleted();return;}
    lastSession=session;
    if(session.id){location.assign(S.resultUrl(session.id));return;}
    busy=true;
    try{
      const lineAccessToken=typeof liff!=='undefined'&&liff.isLoggedIn()?liff.getAccessToken():undefined;
      const data=await S.api('/api/payments/linepay/request',session,{...session.payload,lineAccessToken});
      if(!S.matches(session))return;
      session.id=data.id;S.save(session);
      if(openPayment&&data.paymentUrl)launch(data);else location.assign(S.resultUrl(session.id));
    }catch{if(S.matches(session))showResume();}finally{busy=false;}
  }
  async function start(payload){
    retireCompleted();if(S.active()){await resume();return;}
    if(payload.dining_option!=='takeaway'||payload.detailVersion!==1)throw new Error(text('LINE Pay 僅支援新的外帶訂單。','LINE Pay chỉ hỗ trợ đơn mang đi mới.'));
    const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    const draft=S.draft();S.save({token,payload,draft,cartSignature:S.signature(draft)});await resume(true);
  }
  function onPageShow(){
    const current=S.active(),receipt=lastSession?.id?S.archive(lastSession.id):null;
    if(receipt?.completed&&(!current||S.same(current,lastSession))){
      if(lastSession.cartSignature===S.signature(S.draft())){
        window.cart={};window.customizeData={};window.comboDrinkData={};window.bundleCartData={};
        S.completeDetail();if(typeof updateTotal==='function')updateTotal();
      }
      S.detach(lastSession);removeBanner();
    }
    else if(current&&!current.completed)showResume();
  }
  async function init(){
    if(!document.getElementById('sec-checkout'))return;
    const params=new URL(location.href).searchParams;
    if(params.has('payment_id')){location.replace(S.resultUrl(params.get('payment_id'),params));return;}
    retireCompleted();lastSession=S.active();if(lastSession)showResume();
    try{
      const config=await(await fetch(WORKER_BASE+'/api/payments/config?tenant_id='+encodeURIComponent(getTenantIdFromUrl()))).json();if(!config.linePay?.enabled)return;
      const group=PaymentView.element('div','payment-method-section');
      const label=PaymentView.element('label','payment-method-label');label.htmlFor='payment-method';label.append(PaymentView.icon('card'),document.createTextNode(text('付款方式','Phương thức thanh toán')));
      const select=PaymentView.element('select','payment-method-select');select.id='payment-method';
      for(const [value,title] of [['cash',text('取餐時付款','Trả tại quầy')],['line_pay','LINE Pay']]){const option=document.createElement('option');option.value=value;option.textContent=title;select.append(option);}
      group.append(label,select);document.getElementById('sec-checkout').prepend(group);
    }catch{}
  }
  window.addEventListener('pageshow',onPageShow);
  window.addEventListener('storage',event=>{if(event.key?.startsWith('linepay_receipt:'))onPageShow();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
  return {selected,blocked,start,resume,onCartChange};
})();
