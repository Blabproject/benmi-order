/* Menu owns the draft; all payment results live on the dedicated result page. */
window.LinePayCheckout = (function () {
  if (window.isStaffOrderMode) return null;
  const S=PaymentSession;
  const text=(zh,vi)=>(typeof currentLocale!=='undefined'?currentLocale:document.documentElement.lang)==='vi'?vi:zh;
  let busy=false,lastSession=null,latest=null,pollTimer=null;
  function selected(){return document.querySelector('input[name="payment-method"]:checked')?.value==='line_pay';}
  function buttonLabel(){return selected()?text('前往 LINE Pay 付款','Đến LINE Pay thanh toán'):text('確認下單','Xác nhận đặt món');}
  function removeBanner(){document.getElementById('payment-result')?.remove();}
  function retireCompleted(){const saved=S.active();if(saved?.completed){S.detach(saved);S.completeDetail();removeBanner();S.cleanUrl();}}
  function onCartChange(){if(Object.values(window.cart||{}).some(qty=>Number(qty)>0))retireCompleted();syncButtons();}
  function blocked(){return !!S.active()&&!S.active()?.completed;}
  function syncButtons(){
    for(const id of ['btn-submit','submit-btn','btn-desktop-submit']){
      const button=document.getElementById(id);if(!button)continue;
      if(blocked()){
        if(button.dataset.emptyCart){button.disabled=false;delete button.dataset.emptyCart;button.removeAttribute('aria-describedby');}
        if(!button.dataset.paymentLabel)button.dataset.paymentLabel=button.textContent;
        button.textContent=text('處理待確認付款','Xử lý thanh toán đang chờ');
      }
      else if(button.dataset.paymentLabel){button.textContent=button.dataset.paymentLabel;delete button.dataset.paymentLabel;}
    }
    const group=document.getElementById('payment-method');if(group)group.disabled=blocked();
    if(blocked()){const emptyHint=document.getElementById('checkout-empty-cart-hint');if(emptyHint)emptyHint.hidden=true;}
    if(!blocked()&&typeof updateFooterButtonState==='function')updateFooterButtonState();
  }
  function notice(message,session){
    removeBanner();const panel=PaymentView.element('section','payment-panel',message);panel.id='payment-result';panel.setAttribute('role','status');
    if(session?.id)panel.append(PaymentActions.button(text('查看訂單','Xem đơn'),()=>{location.assign(S.resultUrl(session.id));}));
    document.getElementById('sec-checkout')?.prepend(panel);syncButtons();
  }
  async function cancelCurrent(){
    const session=S.active();if(!session)return;S.preserveDraft(session);
    const data=await PaymentActions.cancel(session,latest);
    if(!data)return;
    if(S.active()&&!S.matches(session)){latest=null;showResume();inspect();return;}
    if(data.paidAt){notice(PaymentActions.message(data),session);return;}
    if(['CANCELLED','FAILED'].includes(data.status)){latest=null;notice(text('已取消舊付款流程，餐點已保留。','Đã hủy phiên cũ. Các món đang chọn được giữ lại.'));}
    else {latest=data;showResume();}
  }
  async function inspect(){
    clearTimeout(pollTimer);const session=S.active();if(!session)return;
    try{
      const data=await S.resolve(session);if(!S.matches(session))return;latest=data;
      if(data.paidAt){S.paid(session);notice(PaymentActions.message(data),session);return;}
      if(['CANCELLED','FAILED'].includes(data.status)){S.terminal({...S.active(),terminal:true});latest=null;notice(text('舊付款已結束，您可以繼續下單。','Phiên cũ đã kết thúc. Bạn có thể tiếp tục đặt đơn.'));return;}
      showResume();
    }catch{if(S.matches(session))showResume();}
    if(S.matches(session))pollTimer=setTimeout(()=>{if(!document.hidden)inspect();},8000);
  }
  function manage(){
    const session=S.active();if(!session)return;S.preserveDraft(session);showResume();
    if(document.getElementById('payment-choice-dialog'))return;
    const dialog=PaymentView.element('dialog','payment-cancel-dialog');dialog.id='payment-choice-dialog';dialog.setAttribute('aria-label',text('待確認付款','Thanh toán đang chờ'));
    dialog.append(PaymentView.element('h2','',text('處理待確認付款','Xử lý thanh toán đang chờ')),PaymentView.element('p','',PaymentActions.message(latest)));
    const actions=PaymentView.element('div','payment-dialog-actions');
    actions.append(PaymentActions.button(text('繼續舊訂單','Tiếp tục đơn cũ'),()=>{dialog.close();resume();}),PaymentActions.button(text('取消舊付款流程','Hủy phiên cũ'),()=>{dialog.close();cancelCurrent();}),PaymentActions.button(text('返回菜單','Quay lại menu'),()=>dialog.close()));
    dialog.append(actions);dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
  }
  function showResume(){
    const session=S.active();if(!session)return;
    removeBanner();const panel=PaymentView.element('section','payment-panel');panel.id='payment-result';panel.setAttribute('aria-live','polite');
    panel.append(PaymentView.element('p','',PaymentActions.message(latest)));
    if(latest?.displayKey)panel.append(PaymentView.element('p','payment-pending-meta','#'+latest.displayKey+' · TWD '+latest.amount));
    panel.append(PaymentActions.button(text('繼續舊訂單','Tiếp tục đơn cũ'),()=>resume()));
    if(!latest?.cancelRequestedAt)panel.append(PaymentActions.button(text('取消舊付款流程','Hủy phiên cũ'),()=>cancelCurrent()));
    else panel.append(PaymentActions.button(text('重新查詢','Kiểm tra lại'),()=>inspect()));
    document.getElementById('sec-checkout')?.prepend(panel);syncButtons();
  }
  function launch(data){
    if(S.providerTarget(data).usesApp){
      removeBanner();
      const panel=PaymentView.element('section','payment-panel');panel.id='payment-result';panel.setAttribute('role','status');
      panel.append(PaymentView.element('p','',text('正在開啟 LINE Pay。若未開啟，請點選「開啟 LINE Pay」或改用瀏覽器付款。','Đang mở LINE Pay. Nếu ứng dụng chưa mở, hãy bấm “Mở LINE Pay” hoặc thanh toán trong trình duyệt.')));
      const actions=PaymentView.element('div','payment-dialog-actions'),session=S.active();
      actions.append(PaymentActions.button(text('開啟 LINE Pay','Mở LINE Pay'),()=>S.openProvider(data)),
        PaymentActions.button(text('改用瀏覽器付款','Thanh toán trong trình duyệt'),()=>S.openProvider(data,true)),
        PaymentActions.button(text('查看訂單','Xem đơn'),()=>location.assign(S.resultUrl(session.id))));
      panel.append(actions);document.getElementById('sec-checkout')?.prepend(panel);syncButtons();
    }
    S.openProvider(data);
  }
  async function resume(openPayment){
    if(busy)return;const session=S.active();if(!session)return;if(session.completed){retireCompleted();return;}
    lastSession=session;
    if(session.id){S.preserveDraft(session);location.assign(S.resultUrl(session.id));return;}
    if(!openPayment){
      S.preserveDraft(session);
      try{const data=await S.resolve(session);if(S.matches(session))location.assign(S.resultUrl(data.id));}catch{notice(text('付款仍在確認中。請稍後查詢，勿重新付款。','Thanh toán vẫn đang được xác minh. Hãy kiểm tra lại sau, chưa thanh toán lại.'));}
      return;
    }
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
    retireCompleted();if(S.active()){manage();return;}
    if(payload.dining_option!=='takeaway'||payload.detailVersion!==1)throw new Error(text('LINE Pay 僅支援新的外帶訂單。','LINE Pay chỉ hỗ trợ đơn mang đi mới.'));
    const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    const draft=S.draft();S.save({token,payload,draft,cartSignature:S.signature(draft)});await resume(true);
  }
  function onPageShow(){
    const current=S.active(),receipt=lastSession?.id?S.archive(lastSession.id):null;
    if(receipt?.completed&&(!current||S.same(current,lastSession))){
      if(lastSession.cartSignature===S.signature(S.draft())){
        window.cart={};window.customizeData={};window.comboDrinkData={};window.bundleCartData={};
        S.completeDetail(lastSession);if(typeof updateTotal==='function')updateTotal();
      }
      S.detach(lastSession);removeBanner();
    }
    else if(receipt?.terminal&&(!current||S.same(current,lastSession))){S.completeDetail(lastSession);S.detach(lastSession);removeBanner();syncButtons();}
    else if(current&&!current.completed)showResume();
    else {removeBanner();syncButtons();}
  }
  async function init(){
    if(!document.getElementById('sec-checkout'))return;
    const params=new URL(location.href).searchParams;
    if(params.has('payment_id')){location.replace(S.resultUrl(params.get('payment_id'),params));return;}
    retireCompleted();lastSession=S.active();if(lastSession){showResume();inspect();}
    try{
      const config=await(await fetch(WORKER_BASE+'/api/payments/config?tenant_id='+encodeURIComponent(getTenantIdFromUrl()))).json();
      const allowedMethods=Array.isArray(config.paymentMethods)&&config.paymentMethods.length>0?config.paymentMethods:['line_pay'];
      if(!config.linePay?.enabled&&!allowedMethods.includes('cash'))return;
      const isDineIn = window.currentDiningOption === 'dine_in' || window.isAppendMode || !!window.currentTableNumber;
      const allDefinitions = isDineIn ? [
        ['cash', text('現場結帳', 'Thanh toán tại quầy'), text('用餐完畢後至櫃台結帳', 'Thanh toán tại quầy sau khi dùng bữa')]
      ] : [
        ['line_pay', 'LINE Pay', text('線上付款', 'Thanh toán trực tuyến')],
        ['cash', text('取餐時付款', 'Đặt rồi trả sau'), text('領取餐點時再付款', 'Thanh toán tại quầy khi nhận món')]
      ];
      const choicesList = allDefinitions.filter(([val]) => {
        if (isDineIn) return true;
        if (val === 'line_pay') return config.linePay?.enabled && allowedMethods.includes('line_pay');
        if (val === 'cash') return allowedMethods.includes('cash');
        return false;
      });
      if (choicesList.length === 0) return;

      const group = PaymentView.element('fieldset', 'payment-method-section'); group.id = 'payment-method';
      const legend = PaymentView.element('legend', 'payment-method-label');
      const heading = PaymentView.element('span', 'payment-method-heading');
      heading.append(PaymentView.icon('card'), PaymentView.element('span', '', text('付款方式', 'Phương thức thanh toán'))); legend.append(heading);
      const choices = PaymentView.element('div', 'payment-method-choices');
      const defaultChecked = isDineIn ? 'cash' : (choicesList.some(([v]) => v === 'line_pay') ? 'line_pay' : choicesList[0][0]);
      for (const [value, title, description] of choicesList) {
        const option = PaymentView.element('label', 'payment-method-option');
        const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'payment-method'; radio.value = value; radio.checked = value === defaultChecked;
        const copy = PaymentView.element('span', 'payment-method-copy');
        copy.append(PaymentView.element('span', 'payment-method-title', title), PaymentView.element('span', 'payment-method-description', description));
        option.append(radio, copy);
        if (value === 'line_pay') {
          const logo = document.createElement('img'); logo.className = 'payment-method-logo'; logo.src = '/line-pay-logo.png'; logo.alt = ''; logo.width = 238; logo.height = 69;
          option.append(logo);
        }
        choices.append(option);
      }
      group.append(legend,choices);group.addEventListener('change',syncButtons);
      (document.getElementById('checkout-payment-method')||document.getElementById('sec-checkout')).append(group);
    }catch{}finally{syncButtons();}
  }
  window.addEventListener('pageshow',event=>{onPageShow();if(event.persisted)inspect();});
  window.addEventListener('storage',event=>{if(event.key?.startsWith('linepay_receipt:')||event.key?.startsWith('linepay_checkout:')){onPageShow();inspect();}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)inspect();});
  window.addEventListener('pagehide',()=>clearTimeout(pollTimer));
  return {selected,buttonLabel,blocked,start,resume,manage,syncButtons,onCartChange};
})();
