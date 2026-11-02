window.PaymentPOS = (function () {
  const tenant=()=>getTenantIdFromUrl();
  const sessionKey=()=> 'staff_session_token_'+tenant();
  const label=p=>t('payment'+p.status);
  let dialogSequence=0;
  const statuses=['REQUESTING','PENDING','CONFIRMING','UNKNOWN','PAID','CANCELLED','FAILED','REFUND_PENDING','REFUNDED','REFUND_FAILED'];
  const byId=id=>document.getElementById(id);
  const contextKey=()=>WORKER_BASE+'|'+tenant();
  const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  function initialState() {
    let view='attention';try{view=sessionStorage.getItem('payment_view_'+contextKey())||view;}catch(_){}
    return {scope:contextKey(),configured:null,configError:false,configBusy:false,count:null,countError:false,checkedAt:null,
      view:view==='history'?'history':'attention',filters:{from:today(),to:today(),status:'',q:''},
      items:[],summary:null,nextCursor:null,loaded:false,auth:null,error:null,listBusy:false,loginBusy:false,
      generation:0,listController:null,countController:null,detailController:null,detail:null,detailBusy:false,detailMessage:null,actionBusy:false};
  }
  let state=initialState(),sessionPromise=null,returnFocus=null;
  function errorText(error) {
    const keys={INVALID_PASSWORD:'paymentInvalidPIN',PAYMENT_PIN_CHANGE_REQUIRED:'paymentDefaultPIN',
      SESSION_REQUIRED:'paymentSessionExpired',PAYMENT_RATE_LIMIT:'paymentRateLimited'};
    return t(error?.code==='INVALID_DATE_RANGE'?'paymentInvalidRange':keys[error?.code]||'paymentError');
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
  async function api(path,body,token,signal) {
    const scope=contextKey(),key=sessionKey();
    const response=await fetch(WORKER_BASE+path+(path.includes('?')?'&':'?')+'tenant_id='+encodeURIComponent(tenant()),{
      method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
      body:body===undefined?undefined:JSON.stringify(body),signal:signal||AbortSignal.timeout(body===undefined?8000:95000)
    });
    if(response.status===401&&scope===contextKey()) {sessionStorage.removeItem(key);lockWorkspace();}
    const data=await response.json();if(!response.ok){const error=new Error(data.code);error.code=data.code;error.status=response.status;throw error;}return data;
  }
  async function token(forcePrompt=false) {
    ensureContext();const current=state,key=sessionKey();
    const old=forcePrompt?null:sessionStorage.getItem(sessionKey());
    if(old){try{await api('/api/payments/session',undefined,old);if(state!==current)throw cancelledAuth();state.auth=old;return old;}
      catch(error){if(error.status!==401)throw error;}}

    return dialog(t('paymentLogin'),[{key:'password',label:t('paymentPIN'),type:'password'}],async values=>{
      if(state!==current)throw cancelledAuth();
      const data=await api('/api/payments/session',values);if(state!==current)throw cancelledAuth();
      sessionStorage.setItem(key,data.token);state.auth=data.token;return data.token;
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
    const warning=['CANCELLED','REJECTED','FORCE_REJECT','EXPIRED'].includes(order.status)&&order.payment.status==='PAID';
    return '<span class="tile-meta-tag">LINE Pay · '+escapeHtml(warning?t('paymentUnrefunded'):label(order.payment))+'</span>';
  }
  async function refundPayment(order,after) {
    if(!await token())return;
    const scope=contextKey(),operationId=crypto.randomUUID();
    await dialog(t('paymentRefund')+' #'+(order.displayKey||order.key)+' · TWD '+order.payment.amount,
      [{key:'reason',label:t('paymentReason'),type:'textarea'}],async values=>{
        if(scope!==contextKey())throw cancelledAuth();
        const payment=await authorized('/api/payments/'+order.payment.id+'/refunds',{...values,operationId});
        if(scope===contextKey())await after(payment);return true;
      });
  }
  function mount(order) {
    let el=document.getElementById('review-payment');
    if(!el){el=document.createElement('section');el.id='review-payment';el.className='payment-panel';document.getElementById('review-total')?.parentElement?.insertAdjacentElement('afterend',el);}
    el.replaceChildren();el.hidden=!order.payment;if(!order.payment)return;
    const p=order.payment,summary=document.createElement('p');summary.textContent='LINE Pay · '+label(p)+' · TWD '+p.amount;el.append(summary);
    if(['CANCELLED','REJECTED','FORCE_REJECT','EXPIRED'].includes(order.status)&&p.status==='PAID') {
      const warning=document.createElement('p');warning.textContent=t('paymentUnrefunded');el.append(warning);
    }
    if(p.status==='PAID') {
      const button=document.createElement('button');button.type='button';button.className='payment-button';button.textContent=t('paymentRefund');
      button.onclick=async()=>{
        try {
          await refundPayment(order,async payment=>{order.payment=payment;mount(order);await fetchOrders();await refreshAll();});
        }catch(error){if(error.code!=='PAYMENT_AUTH_CANCELLED')alert(errorText(error));}
      };el.append(button);
    }
    if(['UNKNOWN','REFUND_PENDING','REFUND_FAILED'].includes(p.status)) {
      const info=document.createElement('p');info.textContent=t('paymentReviewHint');el.append(info);
    }
  }
  function isOpen(){return typeof activeTab!=='undefined'&&activeTab==='payments';}
  function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
  function money(amount){return 'TWD '+new Intl.NumberFormat(window.currentLang==='vi'?'vi-VN':'zh-TW').format(amount);}
  function stamp(value){return value?new Intl.DateTimeFormat(window.currentLang==='vi'?'vi-VN':'zh-TW',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'short'}).format(value):'—';}
  function period(){return state.view==='history'?{from:state.filters.from,to:state.filters.to}:{from:today(),to:today()};}
  function ensureContext(){
    if(state.scope===contextKey())return;
    state.listController?.abort();state.countController?.abort();state.detailController?.abort();
    closeDetail();document.querySelectorAll('.payment-dialog').forEach(el=>el.close());
    state=initialState();sessionPromise=null;fillFilters();render();
  }
  function lockWorkspace(){
    state.auth=null;state.generation++;state.listController?.abort();state.items=[];state.summary=null;
    state.nextCursor=null;state.loaded=false;state.listBusy=false;state.error=null;closeDetail();render();
  }
  function fillFilters(){
    for(const [key,id] of [['from','payment-filter-from'],['to','payment-filter-to'],['q','payment-filter-search']]){
      const el=byId(id);if(el)el.value=state.filters[key];
    }
    const select=byId('payment-filter-status');if(select)select.value=state.filters.status;
  }
  function translate(){
    document.querySelectorAll('[data-payment-i18n]').forEach(el=>{el.textContent=t(el.dataset.paymentI18n);});
    document.querySelectorAll('[data-payment-label]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.paymentLabel)));
    const nav=byId('tab-payments');if(nav)nav.setAttribute('aria-label',t('paymentWorkspace'));
    const select=byId('payment-filter-status');
    if(select){const value=select.value;select.replaceChildren();for(const status of ['',...statuses]){const opt=node('option','',t(status?'payment'+status:'paymentAllStatuses'));opt.value=status;select.append(opt);}select.value=value;}
    render();
    if(isOpen()&&typeof updatePageMainTitle==='function')updatePageMainTitle('payments');
  }
  function renderRows(){
    const body=byId('payment-transaction-rows');if(!body)return;
    const focused=document.activeElement?.dataset?.paymentId;
    body.replaceChildren();
    const labels=['paymentOrder','paymentCreated','paymentAmount','paymentStatus','paymentAttentionReason','paymentActions'];
    for(const payment of state.items){
      const row=node('tr');const values=[payment.displayKey||payment.orderKey,stamp(payment.createdAt),money(payment.amount),label(payment),payment.attentionReason?t('paymentReason'+payment.attentionReason):'—'];
      values.forEach((value,index)=>{const cell=node('td','',value);cell.dataset.label=t(labels[index]);row.append(cell);});
      const action=node('td');action.dataset.label=t('paymentActions');
      const actionKey=state.view==='attention'?(payment.status==='REFUND_FAILED'?'paymentViewRefundFailure':payment.canRefund?'paymentViewRefund':payment.canReconcile?'paymentViewCheck':'paymentViewDetail'):'paymentViewDetail';
      const button=node('button','btn btn-ghost',t(actionKey));button.type='button';button.dataset.paymentId=payment.id;button.onclick=()=>openDetail(payment.id);action.append(button);row.append(action);body.append(row);
    }
    if(focused)body.querySelector(`[data-payment-id="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
  }
  function render(){
    const nav=byId('tab-payments');if(nav)nav.hidden=state.configured!==true;
    const badgeEl=byId('sidebar-payment-count');if(badgeEl){badgeEl.hidden=!(state.count>0);badgeEl.textContent=String(state.count||0);badgeEl.setAttribute('aria-label',t('paymentAlertCount',{count:state.count||0}));}
    const live=byId('payment-live-alert');if(live){
      live.hidden=state.configured!==true||(!(state.count>0)&&!state.countError);
      const text=state.countError?(state.count>0?t('paymentAlertCount',{count:state.count})+' · ':'')+t('paymentCountStale'):t('paymentAlertCount',{count:state.count});
      if(live.textContent!==text)live.textContent=text;live.classList.toggle('is-stale',state.countError);
    }
    const status=byId('payment-workspace-status');if(status)status.textContent=state.error?t(state.error):state.countError?t('paymentWorkspaceStale'):'';
    const privateView=byId('payment-private-workspace'),access=byId('payment-access-panel');
    const unlocked=state.configured===true&&!!state.auth;
    if(privateView)privateView.hidden=!unlocked;if(access)access.hidden=unlocked;
    const description=byId('payment-access-description');if(description)description.textContent=t(state.configError?'paymentWorkspaceStale':state.configured===null?'paymentConfigLoading':state.configured===false?'paymentNotConfigured':'paymentWorkspaceLocked');
    const loginButton=byId('payment-workspace-login');if(loginButton){loginButton.hidden=state.configured!==true;loginButton.disabled=state.loginBusy;}
    for(const view of ['attention','history']){const tab=byId('payment-tab-'+view);if(tab){tab.classList.toggle('active',state.view===view);tab.setAttribute('aria-selected',String(state.view===view));}}
    const filters=byId('payment-history-filters');if(filters)filters.hidden=state.view!=='history';
    const panel=byId('payment-list-panel');if(panel){panel.setAttribute('aria-labelledby','payment-tab-'+state.view);panel.setAttribute('aria-busy',String(state.listBusy));}
    const range=period(),periodLabel=byId('payment-summary-period');if(periodLabel)periodLabel.textContent=t('paymentSummaryPeriod',range);
    for(const field of ['collected','refunded','net']){const el=byId('payment-summary-'+field);if(el)el.textContent=state.summary?money(state.summary[field]):'—';}
    renderRows();
    const table=byId('payment-transactions-table');if(table)table.hidden=!state.items.length;
    const empty=byId('payment-list-empty');if(empty){empty.hidden=!!state.items.length;empty.textContent=t(state.listBusy?'paymentLoading':state.error?'paymentWorkspaceStale':state.loaded?(state.view==='history'?'paymentHistoryEmpty':'paymentAttentionEmpty'):'paymentLoading');}
    const more=byId('payment-load-more');if(more){more.hidden=!state.nextCursor;more.disabled=state.listBusy;}
    renderDetail();
  }
  async function refreshCount(){
    ensureContext();const current=state;if(!current.configured||current.countController||document.hidden)return;
    const controller=new AbortController();current.countController=controller;const timeout=setTimeout(()=>controller.abort(),8000);
    try{const data=await api('/api/payments/attention/count',undefined,undefined,controller.signal);
      if(state!==current)return;if(!Number.isSafeInteger(data.count)||data.count<0)throw new Error();
      current.count=data.count;current.checkedAt=data.checkedAt;current.countError=false;
    }catch(_){if(state===current)current.countError=true;}
    finally{clearTimeout(timeout);current.countController=null;if(state===current)render();}
  }
  async function restoreSession(){
    if(sessionPromise)return sessionPromise;
    const current=state;let saved=null;try{saved=sessionStorage.getItem(sessionKey());}catch(_){}
    if(!saved)return;
    const pending=(async()=>{try{await api('/api/payments/session',undefined,saved);if(state===current){state.auth=saved;await refreshData();}}
      catch(error){if(state===current&&error.status!==401){lockWorkspace();state.error=error.code==='PAYMENT_PIN_CHANGE_REQUIRED'?'paymentDefaultPIN':'paymentWorkspaceStale';render();}}})();
    sessionPromise=pending;try{await pending;}finally{if(sessionPromise===pending)sessionPromise=null;}
  }
  async function login(){
    ensureContext();if(state.loginBusy)return;const current=state;current.loginBusy=true;render();
    try{const value=await token();if(value&&state===current){current.error=null;await refreshData();}}
    catch(error){if(state===current&&error.code!=='PAYMENT_AUTH_CANCELLED')current.error='paymentWorkspaceStale';}
    finally{current.loginBusy=false;if(state===current)render();}
  }
  async function refreshData(append=false){
    const current=state;if(!current.auth||!current.configured||!isOpen()||document.hidden||current.actionBusy)return;
    if(current.listBusy)return;
    const generation=current.generation,controller=new AbortController();current.listController=controller;current.listBusy=true;current.error=null;render();
    const timeout=setTimeout(()=>controller.abort(),8000),range=period();
    const params=new URLSearchParams({view:current.view,limit:'50'});
    if(current.view==='history'){params.set('from',range.from);params.set('to',range.to);if(current.filters.status)params.set('status',current.filters.status);if(current.filters.q)params.set('q',current.filters.q);}
    if(append&&current.nextCursor)params.set('cursor',current.nextCursor);
    const listPath='/api/payments/transactions',summaryPath='/api/payments/summary';
    try{
      const [page,summary]=await Promise.all([
        workspaceRead(listPath,params,current.auth,controller.signal),
        workspaceRead(summaryPath,new URLSearchParams(range),current.auth,controller.signal)
      ]);
      if(state!==current||generation!==current.generation)return;
      if(!Array.isArray(page.items))throw new Error();
      current.items=append?[...new Map([...current.items,...page.items].map(item=>[item.id,item])).values()]:page.items;
      current.nextCursor=page.nextCursor;current.summary=summary;current.loaded=true;
    }catch(error){if(state===current&&generation===current.generation&&current.auth)current.error=error.code==='INVALID_DATE_RANGE'?'paymentInvalidRange':'paymentWorkspaceStale';}
    finally{clearTimeout(timeout);if(current.listController===controller){current.listController=null;current.listBusy=false;}if(state===current)render();}
  }
  async function workspaceRead(path,params,bearer,signal){
    // Reuse authentication/error handling while preserving the single tenant parameter.
    return api(path+'?'+params.toString(),undefined,bearer,signal);
  }
  function resetList(){state.generation++;state.listController?.abort();state.listController=null;state.listBusy=false;state.items=[];state.summary=null;state.loaded=false;state.nextCursor=null;state.error=null;}
  function setView(view){
    ensureContext();if(!['attention','history'].includes(view))return;
    if(state.view!==view){state.view=view;resetList();try{sessionStorage.setItem('payment_view_'+state.scope,view);}catch(_){}}
    render();if(state.auth)void refreshData();
  }
  function applyFilters(event){
    event?.preventDefault();const from=byId('payment-filter-from')?.value,to=byId('payment-filter-to')?.value;
    const start=Date.parse(from+'T00:00:00+08:00'),end=Date.parse(to+'T00:00:00+08:00');
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>30*86400000){state.error='paymentInvalidRange';render();byId('payment-filter-from')?.focus();return;}
    state.filters={from,to,status:byId('payment-filter-status')?.value||'',q:byId('payment-filter-search')?.value.trim()||''};
    resetList();void refreshData();render();
  }
  function setRange(days){const end=today(),start=new Date(Date.parse(end+'T00:00:00+08:00')-(days-1)*86400000+8*3600000).toISOString().slice(0,10);byId('payment-filter-from').value=start;byId('payment-filter-to').value=end;applyFilters();}
  function closeDetail(){
    state.detailController?.abort();state.detailController=null;state.detail=null;state.detailBusy=false;state.detailMessage=null;
    const dialogEl=byId('payment-detail-dialog');if(dialogEl?.open)dialogEl.close();
    byId('payment-detail-body')?.replaceChildren();byId('payment-detail-actions')?.replaceChildren();
    const message=byId('payment-detail-message');if(message)message.textContent='';
    if(returnFocus){
      const target=returnFocus.isConnected?returnFocus:document.querySelector(`[data-payment-id="${CSS.escape(returnFocus.dataset?.paymentId||'')}"]`)||byId('payment-tab-'+state.view);
      target?.focus({preventScroll:true});
    }
    returnFocus=null;
  }
  async function openDetail(id){
    ensureContext();if(!state.auth)return;closeDetail();const current=state,controller=new AbortController();current.detailController=controller;current.detailBusy=true;
    returnFocus=document.activeElement;const dialogEl=byId('payment-detail-dialog');if(!dialogEl)return;
    dialogEl.showModal();byId('payment-detail-title')?.focus();renderDetail();
    const timeout=setTimeout(()=>controller.abort(),8000);
    try{const payment=await api('/api/payments/'+id,undefined,current.auth,controller.signal);if(state===current&&current.detailController===controller)current.detail=payment;}
    catch(error){if(state===current&&current.detailController===controller&&current.auth)current.detailMessage='paymentWorkspaceStale';}
    finally{clearTimeout(timeout);if(current.detailController===controller){current.detailController=null;current.detailBusy=false;}if(state===current)renderDetail();}
  }
  function renderDetail(){
    const body=byId('payment-detail-body'),actions=byId('payment-detail-actions'),message=byId('payment-detail-message');if(!body||!actions)return;
    const focused=document.activeElement?.id;body.replaceChildren();actions.replaceChildren();
    if(message)message.textContent=state.detailMessage?t(state.detailMessage,state.detail?{status:label(state.detail)}:{}):'';
    if(state.detailBusy){body.append(node('p','',t('paymentLoading')));return;}
    const p=state.detail;if(!p)return;
    const data=node('dl','payment-detail-data');
    const fields=[['paymentOrder',p.displayKey||p.orderKey],['paymentStatus',label(p)],['paymentAmount',money(p.amount)],['paymentTransactionId',p.transactionId||'—'],['paymentProviderOrderId',p.providerOrderId],['paymentCreated',stamp(p.createdAt)],['paymentPaidAt',stamp(p.paidAt)],['paymentRefundedAt',stamp(p.refundedAt)]];
    if(p.attentionReason)fields.push(['paymentAttentionReason',t('paymentReason'+p.attentionReason)]);
    if(p.refund){fields.push(['paymentReason',p.refund.reason||'—'],['paymentRefundRequestedAt',stamp(p.refund.requestedAt)],['paymentRefundStatus',t('paymentRefundState'+p.refund.status)],['paymentRefundTransactionId',p.refund.transactionId||'—']);}
    if(p.resultCode||p.refund?.resultCode)fields.push(['paymentResultCode',p.refund?.resultCode||p.resultCode]);
    for(const [key,value] of fields){const row=node('div');row.append(node('dt','',t(key)),node('dd','',value));data.append(row);}body.append(data);
    function action(id,key,callback){const button=node('button','btn btn-ghost',t(key));button.type='button';button.id=id;button.disabled=state.actionBusy;button.onclick=callback;actions.append(button);}
    if(p.canReconcile)action('payment-detail-reconcile',state.actionBusy?'paymentChecking':'paymentCheck',()=>reconcileDetail(p.id));
    if(p.canRefund)action('payment-detail-refund','paymentRefund',()=>refundDetail(p));
    if(p.status==='REFUND_FAILED'){
      body.append(node('p','payment-workspace-hint',t('paymentRefundFailedHelp')));
      action('payment-detail-support','paymentContactSupport',()=>{closeDetail();if(typeof openBlabContactModal==='function')openBlabContactModal('support');});
    }
    if(focused&&actions.querySelector('#'+CSS.escape(focused)))byId(focused)?.focus({preventScroll:true});
  }
  async function reconcileDetail(id){
    if(state.actionBusy)return;const current=state;current.actionBusy=true;renderDetail();
    try{const payment=await authorized('/api/payments/'+id+'/reconcile',{});if(state===current&&current.detail?.id===id){current.detail=payment;current.detailMessage='paymentCheckedStatus';}}
    catch(error){if(state===current&&current.auth&&error.code!=='PAYMENT_AUTH_CANCELLED')current.detailMessage='paymentWorkspaceStale';}
    finally{current.actionBusy=false;if(state===current){renderDetail();await refreshAll();}}
  }
  async function refundDetail(payment){
    if(state.actionBusy)return;const current=state;current.actionBusy=true;renderDetail();
    try{await refundPayment({key:payment.orderKey,displayKey:payment.displayKey,payment},async result=>{
      if(state===current&&current.detail?.id===payment.id){current.detail=result;current.detailMessage=null;}
      if(typeof fetchOrders==='function')await fetchOrders();
    });}catch(error){if(state===current&&current.auth&&error.code!=='PAYMENT_AUTH_CANCELLED')current.detailMessage='paymentWorkspaceStale';}
    finally{current.actionBusy=false;if(state===current){renderDetail();await refreshAll();}}
  }
  async function refreshAll(){ensureContext();if(state.configured===null||state.configError)return init();await Promise.allSettled([refreshCount(),refreshData()]);}
  function onTabChange(tab){ensureContext();if(tab!=='payments')closeDetail();render();if(tab==='payments'&&state.configured){if(state.auth)void refreshData();else void restoreSession();}}
  async function init(){
    ensureContext();const current=state;if(current.configBusy)return;current.configBusy=true;current.configError=false;translate();fillFilters();
    try{const data=await api('/api/payments/config');if(state!==current)return;current.configured=data.linePay?.configured===true;
      if(current.configured){await refreshCount();if(isOpen())await restoreSession();}
    }catch(_){if(state===current){current.configError=true;current.configured=null;}}
    finally{current.configBusy=false;if(state===current)render();}
  }
  function tick(){if(document.hidden)return;ensureContext();if(state.configured===null){void init();return;}if(state.auth){let saved=null;try{saved=sessionStorage.getItem(sessionKey());}catch(_){}if(saved!==state.auth)lockWorkspace();}void refreshAll();}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
  window.addEventListener('pagehide',()=>{state.listController?.abort();state.countController?.abort();closeDetail();document.querySelectorAll('.payment-dialog').forEach(el=>el.close());});
  const detailDialog=byId('payment-detail-dialog');if(detailDialog){detailDialog.addEventListener('close',()=>{if(!detailDialog.open)closeDetail();});detailDialog.addEventListener('click',event=>{if(event.target===detailDialog){const rect=detailDialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDetail();}});}
  setInterval(tick,30000);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
  return {token,mount,badge,translate,onTabChange,login,setView,setRange,applyFilters,openDetail,closeDetail,refresh:refreshAll,loadMore:()=>refreshData(true)};
})();
