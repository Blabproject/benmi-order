window.PaymentPOS = (function () {
  const tenant=()=>getTenantIdFromUrl();
  const sessionKey=()=> 'staff_session_token_'+tenant();
  const label=p=>t('payment'+p.status);
  let dialogSequence=0;
  function errorText(error) {
    const keys={INVALID_PASSWORD:'paymentInvalidPIN',PAYMENT_PIN_CHANGE_REQUIRED:'paymentDefaultPIN',
      SESSION_REQUIRED:'paymentSessionExpired',PAYMENT_RATE_LIMIT:'paymentRateLimited'};
    return t(keys[error?.code]||'paymentError');
  }
  function cancelledAuth() {const error=new Error('PAYMENT_AUTH_CANCELLED');error.code='PAYMENT_AUTH_CANCELLED';return error;}

  function dialog(title, fields, action, hint) {
    return new Promise(resolve=>{
      const d=document.createElement('dialog');d.className='payment-dialog';
      const h=document.createElement('h2');h.id='payment-dialog-title-'+(++dialogSequence);h.textContent=title;d.setAttribute('aria-labelledby',h.id);d.append(h);
      if(hint){const description=document.createElement('p');description.textContent=hint;d.append(description);}
      const form=document.createElement('form');form.method='dialog';
      const inputs={};
      for(const field of fields) {
        const l=document.createElement('label');l.textContent=field.label;
        const input=document.createElement(field.type==='textarea'?'textarea':'input');input.type=field.type||'text';
        input.required=true;input.maxLength=1000;if(field.type==='password')input.autocomplete='current-password';
        l.append(input);form.append(l);inputs[field.key]=input;
      }
      const error=document.createElement('p');error.setAttribute('role','alert');form.append(error);
      const cancel=document.createElement('button');cancel.type='button';cancel.className='payment-button';cancel.textContent=t('paymentCancel');cancel.onclick=()=>d.close();
      const submit=document.createElement('button');submit.type='submit';submit.className='payment-button';submit.textContent=t('paymentConfirm');
      const actions=document.createElement('div');actions.className='payment-actions';actions.append(cancel,submit);form.append(actions);
      form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;
        try {const value=await action(Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value])));resolve(value);d.close();}
        catch(err){if(err.code!=='PAYMENT_AUTH_CANCELLED')error.textContent=errorText(err);}finally{submit.disabled=false;}
      };
      d.addEventListener('close',()=>{resolve(null);d.remove();});d.append(form);document.body.append(d);d.showModal();
    });
  }
  async function api(path,body,token) {
    const response=await fetch(WORKER_BASE+path+'?tenant_id='+encodeURIComponent(tenant()),{
      method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
      body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(95000)
    });
    if(response.status===401)sessionStorage.removeItem(sessionKey());
    const data=await response.json();if(!response.ok){const error=new Error(data.code);error.code=data.code;error.status=response.status;throw error;}return data;
  }
  async function token(forcePrompt=false) {
    const old=forcePrompt?null:sessionStorage.getItem(sessionKey());
    if(old){try{await api('/api/payments/session',undefined,old);return old;}
      catch(error){if(error.status!==401)throw error;}}

    return dialog(t('paymentLogin'),[{key:'password',label:t('paymentPIN'),type:'password'}],async values=>{
      const data=await api('/api/payments/session',values);sessionStorage.setItem(sessionKey(),data.token);return data.token;
    },t('paymentLoginHint'));
  }
  async function authorized(path,body) {
    let bearer=await token();if(!bearer)throw cancelledAuth();
    try{return await api(path,body,bearer);}
    catch(error){
      // Retry only an explicit authentication rejection, before any money mutation.
      // Retain the same refund operation ID; never retry network/timeout failures here.
      if(error.status!==401)throw error;
      bearer=await token(true);if(!bearer)throw cancelledAuth();
      return api(path,body,bearer);
    }
  }
  function badge(order) {
    if(!order.payment)return '';
    const warning=['REJECTED','FORCE_REJECT','EXPIRED'].includes(order.status)&&order.payment.status==='PAID';
    return '<span class="tile-meta-tag">LINE Pay · '+escapeHtml(warning?t('paymentUnrefunded'):label(order.payment))+'</span>';
  }
  function mount(order) {
    let el=document.getElementById('review-payment');
    if(!el){el=document.createElement('section');el.id='review-payment';el.className='payment-panel';document.getElementById('review-total')?.parentElement?.insertAdjacentElement('afterend',el);}
    el.replaceChildren();el.hidden=!order.payment;if(!order.payment)return;
    const p=order.payment,summary=document.createElement('p');summary.textContent='LINE Pay · '+label(p)+' · TWD '+p.amount;el.append(summary);
    if(['REJECTED','FORCE_REJECT','EXPIRED'].includes(order.status)&&p.status==='PAID') {
      const warning=document.createElement('p');warning.textContent=t('paymentUnrefunded');el.append(warning);
    }
    if(p.status==='PAID') {
      const button=document.createElement('button');button.type='button';button.className='payment-button';button.textContent=t('paymentRefund');
      button.onclick=async()=>{
        try {
          if(!await token())return;
          await dialog(t('paymentRefund')+' #'+(order.displayKey||order.key)+' · TWD '+p.amount,
          [{key:'reason',label:t('paymentReason'),type:'textarea'}],async values=>{
            order.payment=await authorized('/api/payments/'+p.id+'/refunds',{...values,operationId:crypto.randomUUID()});mount(order);await fetchOrders();return true;
          });
        }catch(error){if(error.code!=='PAYMENT_AUTH_CANCELLED')alert(errorText(error));}
      };el.append(button);
    }
    if(['UNKNOWN','REFUND_PENDING','REFUND_FAILED'].includes(p.status)) {
      const info=document.createElement('p');info.textContent=t('paymentReviewHint');el.append(info);
    }
  }
  async function attention() {
    try{
      const rows=await authorized('/api/payments/attention');
      let panel=document.getElementById('payment-attention');if(!panel){panel=document.createElement('section');panel.id='payment-attention';panel.className='payment-panel';document.querySelector('main')?.prepend(panel);}
      panel.replaceChildren();
      const totals=await authorized('/api/payments/summary');
      const money=document.createElement('p');money.textContent=t('paymentCollected')+': TWD '+totals.collected+' · '+t('paymentRefundedTotal')+': TWD '+totals.refunded+' · '+t('paymentNet')+': TWD '+totals.net;panel.append(money);
      const title=document.createElement('h2');title.textContent=t('paymentAttention');panel.append(title);
      if(!rows.length){const empty=document.createElement('p');empty.textContent=t('paymentNone');panel.append(empty);}
      for(const p of rows){const row=document.createElement('p');row.textContent=p.orderKey+' · TWD '+p.amount+' · '+label(p)+' ';
        const check=document.createElement('button');check.className='payment-button';check.textContent=t('paymentCheck');check.onclick=async()=>{check.disabled=true;try{await authorized('/api/payments/'+p.id+'/reconcile',{});await attention();}catch(error){if(error.code!=='PAYMENT_AUTH_CANCELLED')alert(errorText(error));}finally{check.disabled=false;}};row.append(check);panel.append(row);}
    }catch(error){if(error.code!=='PAYMENT_AUTH_CANCELLED')alert(errorText(error));}
  }
  async function init(){try{
    const res=await fetch(WORKER_BASE+'/api/payments/config?tenant_id='+encodeURIComponent(tenant()));const data=await res.json();
    // Once configured, expose operations even when new payments are switched off.
    if(!data.linePay?.configured)return;
    const b=document.createElement('button');b.className='payment-button';b.textContent=t('paymentAttention');b.onclick=attention;
    document.querySelector('main')?.prepend(b);
  }catch(_){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
  return {token,mount,badge};
})();
