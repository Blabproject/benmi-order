/* Shared accessible cancellation dialog. Only a server decision releases a checkout. */
window.PaymentActions=(function(){
 const S=PaymentSession,V=PaymentView;
 const text=(zh,vi)=>(typeof currentLocale!=='undefined'?currentLocale:document.documentElement.lang)==='vi'?vi:zh;
 function button(label,action){const b=V.element('button','payment-button',label);b.type='button';b.onclick=action;return b;}
 function message(data){
  return data?.paidAt?text('此訂單已付款，取消訂單或退款請聯絡門市。','Đơn này đã thanh toán. Vui lòng liên hệ quán để hủy đơn hoặc hoàn tiền.'):
   data?.cancelRequestedAt?text('正在確認是否能取消付款。確認完成前，請勿重新付款。','Đang kiểm tra trước khi hủy. Vui lòng chưa thanh toán lại.'):
   text('您有一筆訂單尚未完成付款。','Bạn có một đơn chưa hoàn tất thanh toán.');
 }
 function cancel(session,data){
  if(document.getElementById('payment-cancel-dialog'))return Promise.resolve(null);
  return new Promise(resolve=>{
   const dialog=V.element('dialog','payment-cancel-dialog');dialog.id='payment-cancel-dialog';dialog.setAttribute('aria-labelledby','payment-cancel-title');
   const title=V.element('h2','',text('取消舊付款流程','Hủy phiên thanh toán cũ'));title.id='payment-cancel-title';
   const identity=data?.displayKey?' #'+data.displayKey:'';
   dialog.append(title,V.element('p','',text('取消訂單'+identity+'的付款流程？目前選擇的餐點將保留。','Hủy phiên thanh toán của đơn'+identity+'? Các món đang chọn sẽ được giữ lại.')));
   const error=V.element('p','payment-action-message');error.setAttribute('role','status');dialog.append(error);
   let busy=false,answer=null;
   const back=button(text('保留付款','Giữ phiên'),()=>dialog.close());
   const submit=button(text('確認取消','Xác nhận hủy'),async()=>{
    if(busy)return;busy=true;submit.disabled=true;back.disabled=true;
    error.textContent=text('正在處理…','Đang xử lý…');
    try{
     const current=await S.resolve(session);
     if(!S.matches(session)&&!S.same(S.archive(session.id),session))throw Error('REPLACED');
     answer=await S.api('/api/payments/'+encodeURIComponent(current.id)+'/cancel',session,{});
     if(answer.paidAt)S.paid(session);
     else if(['CANCELLED','FAILED'].includes(answer.status))S.terminal({...S.forResult(current.id),...session});
     dialog.close();
    }catch{error.textContent=text('尚未確認取消結果。請重試查詢，勿重新付款。','Chưa xác nhận được kết quả hủy. Hãy kiểm tra lại, chưa thanh toán lại.');}
    finally{busy=false;submit.disabled=false;back.disabled=false;}
   });
   const actions=V.element('div','payment-dialog-actions');actions.append(back,submit);dialog.append(actions);
   dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
   dialog.addEventListener('close',()=>{dialog.remove();resolve(answer);},{once:true});
   document.body.append(dialog);dialog.showModal();back.focus();
  });
 }
 return {button,cancel,message};
})();
