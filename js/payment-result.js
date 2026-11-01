/* Dedicated result page: no menu bootstrap, LIFF login, or capability in the URL. */
(function () {
  const params=new URL(location.href).searchParams;
  const tenant=params.get('tenant_id')||params.get('tenant')||'';
  const id=params.get('payment_id')||'';
  const hostname=location.hostname;
  window.WORKER_BASE=/^(localhost|127\.0\.0\.1)$/.test(hostname)||hostname.startsWith('dev.')||hostname.includes('.dev.')||hostname.includes('-dev.')||hostname.startsWith('dev-')
    ?'https://platform-worker-dev.thuanmnc.workers.dev'
    :hostname.startsWith('staging.')||hostname.includes('.staging.')||hostname.includes('-staging.')||hostname.startsWith('test.')||hostname.includes('.test.')||hostname.includes('-test.')
      ?'https://platform-worker-staging.thuanmnc.workers.dev':'https://benmi-worker-official.thuanmnc.workers.dev';
  window.getTenantIdFromUrl=()=>tenant;
  let locale=params.get('lang')==='vi'?'vi':'zh-TW',busy=false,timer=null,latest=null;
  const text=(zh,vi)=>locale==='vi'?vi:zh;
  const S=PaymentSession,V=PaymentView;
  function menuUrl(){
    let url=new URL('/',location.origin);
    try{const candidate=new URL(latest?.menuUrl||'',location.origin);if(candidate.origin===location.origin&&!candidate.username&&!candidate.password)url=candidate;}catch{}
    for(const key of ['payment_id','transactionId','orderId'])url.searchParams.delete(key);
    url.searchParams.set('tenant_id',tenant);url.searchParams.set('lang',locale);return url;
  }
  function button(title,action,primary=false){const b=V.element('button','payment-button '+(primary?'payment-primary':'payment-secondary'),title);b.type='button';b.onclick=action;return b;}
  function navigateMenu(session,restore=false){clearTimeout(timer);if(restore)S.restore(session);else S.detach(session);location.assign(menuUrl());}
  function render(data,session,missing=false){
    const el=document.getElementById('payment-result');el.replaceChildren();
    const paid=!!data?.paidAt,terminal=['CANCELLED','FAILED'].includes(data?.status);
    const refunded=data?.status==='REFUNDED',refunding=data?.status==='REFUND_PENDING';
    let title,description;
    if(missing){title=text('無法讀取付款結果','Chưa thể xem kết quả thanh toán');description=text('請使用原本下單的瀏覽器或視窗查看付款結果，暫時無需重新付款。','Hãy mở lại trình duyệt hoặc cửa sổ đã đặt món để kiểm tra. Vui lòng chưa thanh toán lại.');}
    else if(refunded){title=text('已退款','Đã hoàn tiền');description=text('本筆付款已全額退款。','Khoản thanh toán này đã được hoàn toàn bộ.');}
    else if(data?.status==='REFUND_FAILED'){title=text('退款尚未完成','Chưa hoàn tiền xong');description=text('請聯絡門市確認退款進度。','Vui lòng liên hệ quán để kiểm tra việc hoàn tiền.');}
    else if(refunding){title=text('退款處理中','Đang xử lý hoàn tiền');description=text('門市正在處理退款，請稍後重新查詢。','Quán đang xử lý hoàn tiền. Vui lòng kiểm tra lại sau.');}
    else if(paid){title=text('付款成功','Thanh toán thành công');description=['REJECTED','FORCE_REJECT','EXPIRED'].includes(data.orderStatus)
      ?text('門市已取消訂單，請確認退款進度。','Quán đã hủy đơn. Vui lòng kiểm tra tình trạng hoàn tiền với quán.')
      :data.orderStatus==='NEW'?text('訂單已送出，等待門市確認。','Đơn đã gửi, đang chờ quán xác nhận.')
        :text('請依約定時間取餐。','Vui lòng lấy món theo giờ đã hẹn.');}
    else if(terminal){title=text('尚未付款','Chưa thanh toán');description=data?.status==='CANCELLED'
      ?text('付款已取消或逾時。您可以返回購物車繼續下單。','Thanh toán đã hủy hoặc hết hạn. Bạn có thể quay lại giỏ hàng để tiếp tục.')
      :text('付款未完成。請返回購物車確認後再試。','Thanh toán chưa hoàn tất. Hãy quay lại giỏ hàng để kiểm tra và thử lại.');}
    else if(data?.cancelRequestedAt){title=text('正在確認取消結果','Đang kiểm tra trước khi hủy');description=PaymentActions.message(data);}
    else {title=text('正在確認付款','Đang xác minh thanh toán');description=text('請稍候。確認完成前，請勿重複下單或付款。','Vui lòng chờ. Chưa đặt lại đơn hoặc thanh toán lại khi chưa có kết quả.');}
    document.documentElement.lang=locale;document.title=title;
    el.dataset.state=paid?'paid':terminal?'cancelled':'pending';
    const heading=V.element('div','payment-result-heading'),mark=V.element('span','payment-result-mark');mark.append(V.icon(paid?'check':terminal?'cancel':'clock'));
    const copy=V.element('div','payment-result-titles');copy.append(V.element('h1','payment-result-title',title),V.element('p','payment-result-description',description));heading.append(mark,copy);el.append(heading);
    if(data?.displayKey){
      const meta=V.element('div','payment-receipt-meta'),identity=V.element('div','payment-receipt-identity'),amount=V.element('div','payment-receipt-amount');
      identity.append(V.element('span','payment-receipt-label',text('訂單編號','Mã đơn')),V.element('strong','payment-receipt-key','#'+data.displayKey));
      amount.append(V.element('span','payment-receipt-label',paid?text('已付金額','Đã thanh toán'):text('訂單金額','Giá trị đơn')),V.element('strong','payment-receipt-total','TWD '+data.amount));meta.append(identity,amount);
      if(data.pickupTime){const pickup=V.element('div','payment-pickup');pickup.append(V.element('span','',text('取餐時間','Giờ lấy món')),V.element('span','',data.pickupTime));meta.append(pickup);}el.append(meta);
    }
    if(data?.receipt){const detail=V.receiptDetails(data.receipt);detail.open=true;el.append(detail);}
    const actions=V.element('div','payment-page-actions');
    if(paid){if(refunding)actions.append(button(text('重新查詢','Kiểm tra lại'),()=>refresh()));actions.append(button(text('再訂一筆','Đặt đơn mới'),()=>navigateMenu(session),true));}
    else if(terminal){actions.append(button(text('返回購物車','Quay lại giỏ hàng'),()=>navigateMenu(session,true),true));}
    else if(missing){actions.append(button(text('返回菜單','Quay lại menu'),()=>location.assign(menuUrl())));}
    else {
      if(data?.canCancel)actions.append(button(text('取消舊付款流程','Hủy phiên cũ'),async()=>{
        clearTimeout(timer);const result=await PaymentActions.cancel(session,data);
        if(result){latest=result;render(result,session);if(!result.paidAt&&!['CANCELLED','FAILED'].includes(result.status))refresh();}
        else refresh();
      }));
      if(data?.paymentUrl)actions.append(button(text('繼續 LINE Pay 付款','Tiếp tục LINE Pay'),()=>{const inLine=typeof liff!=='undefined'&&liff.isInClient();location.assign(inLine&&data.appUrl?data.appUrl:data.paymentUrl);},true));
      actions.append(button(text('重新查詢','Kiểm tra lại'),()=>refresh(),!data?.paymentUrl));
      actions.append(button(text('返回菜單','Quay lại menu'),()=>location.assign(menuUrl())));
    }
    el.append(actions);
  }
  async function refresh(){
    if(busy)return;const session=S.forResult(id);if(!session){render(null,null,true);return;}busy=true;clearTimeout(timer);
    try{
      const data=await S.api('/api/payments/'+encodeURIComponent(id)+(session.completed||session.terminal?'':'/confirm'),session,session.completed||session.terminal?undefined:{});
      if(!S.same(S.forResult(id),session))return;
      latest=data;if(!params.has('lang')&&data.merchant?.locale==='vi')locale='vi';
      const brand=document.getElementById('payment-brand-name');brand.textContent=data.merchant?.brandName||text('訂單付款','Thanh toán đơn hàng');
      const logo=document.getElementById('payment-brand-logo');if(data.merchant?.logoUrl){try{const url=new URL(data.merchant.logoUrl,location.origin);if(url.protocol==='https:'){logo.src=url.href;logo.hidden=false;logo.onerror=()=>{logo.hidden=true;};}}catch{}}
      if(data.paidAt)S.paid(session);
      else if(['CANCELLED','FAILED'].includes(data.status))S.terminal({...session,terminal:true});
      render(data,session);S.cleanUrl(true);
      if(!data.paidAt&&!['CANCELLED','FAILED'].includes(data.status))timer=setTimeout(()=>{if(!document.hidden)refresh();},5000);
    }catch(error){render(null,session,error.status===403||error.status===404);if(![403,404].includes(error.status))timer=setTimeout(()=>{if(!document.hidden)refresh();},10000);}
    finally{busy=false;}
  }
  function init(){
    document.documentElement.lang=locale;
    if(!/^[a-zA-Z0-9_-]+$/.test(tenant)||! /^[a-f0-9-]{36}$/i.test(id)){render(null,null,true);return;}
    S.cleanUrl(true);refresh();
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('pagehide',()=>clearTimeout(timer));
  window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
