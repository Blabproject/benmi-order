/* Checkout capability stays on this origin; provider IDs never grant access. */
window.PaymentSession = (function () {
  const tenant=()=>getTenantIdFromUrl();
  const activeKey=()=> 'linepay_checkout:'+tenant();
  const archiveKey=id=>'linepay_receipt:'+tenant()+':'+id;
  function parse(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
  const active=()=>parse(activeKey());
  const archive=id=>id?parse(archiveKey(id)):null;
  function same(a,b){return !!a&&!!b&&a.token===b.token;}
  function remember(session){if(session.id)localStorage.setItem(archiveKey(session.id),JSON.stringify(session));}
  function save(session){localStorage.setItem(activeKey(),JSON.stringify(session));remember(session);}
  function forResult(id){const current=active();return current?.id===id?current:archive(id);}
  function matches(session){return same(active(),session);}
  function signature(draft){return JSON.stringify(draft,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);}
  function draft(){return JSON.parse(JSON.stringify({cart:window.cart||{},customizeData:window.customizeData||{},comboDrinkData:window.comboDrinkData||{},bundleCartData:window.bundleCartData||{}}));}
  function cleanUrl(result=false){const url=new URL(location.href);for(const key of ['transactionId','orderId',...(result?[]:['payment_id'])])url.searchParams.delete(key);history.replaceState(history.state,'',url.pathname+url.search+url.hash);}
  function detach(session){if(matches(session))localStorage.removeItem(activeKey());}
  function completeDetail(session){
    if(session?.payload?.operationId){
      try{const pending=JSON.parse(sessionStorage.getItem('order_detail_pending:'+tenant())||'null');if(pending?.payload?.operationId&&pending.payload.operationId!==session.payload.operationId)return;}catch{}
    }
    if(typeof DetailCheckout!=='undefined')DetailCheckout.completed();else sessionStorage.removeItem('order_detail_pending:'+tenant());
  }
  function clearPurchasedDraft(session){
    if(active()&&!matches(session))return;
    const saved=parse('cart_save_'+tenant());
    if(saved&&session.cartSignature===signature(saved))localStorage.removeItem('cart_save_'+tenant());
    if(matches(session)||!active())completeDetail(session);
  }
  function paid(session){
    if(!session.completed)clearPurchasedDraft(session);
    localStorage.setItem(archiveKey(session.id),JSON.stringify({id:session.id,token:session.token,completed:true}));
    detach(session);
  }
  function restore(session){
    if(active()&&!matches(session))return;
    let savedDraft=session.returnDraft||session.draft;
    if(!savedDraft&&session.cartSignature){try{savedDraft=JSON.parse(session.cartSignature);}catch{}}
    if(savedDraft?.cart&&!parse('cart_save_'+tenant()))localStorage.setItem('cart_save_'+tenant(),JSON.stringify(savedDraft));
    detach(session);completeDetail(session);
    if(session.id)localStorage.setItem(archiveKey(session.id),JSON.stringify({id:session.id,token:session.token,terminal:true}));
  }
  function preserveDraft(session){
    if(!matches(session))return;
    const current=draft();save({...active(),returnDraft:current});
    localStorage.setItem('cart_save_'+tenant(),JSON.stringify(current));
  }
  function terminal(session){
    if(matches(session)){completeDetail(session);detach(session);}
    remember({...session,terminal:true});
  }
  async function resolve(session){
    const data=await api(session.id?'/api/payments/'+encodeURIComponent(session.id):'/api/payments/checkout?operationId='+encodeURIComponent(session.payload?.operationId||''),session);
    if(session.id&&data.id!==session.id)throw new Error('PAYMENT_RESPONSE_MISMATCH');
    if(!session.id&&matches(session)){session.id=data.id;save({...active(),id:data.id});}
    return data;
  }
  function resultUrl(id,callback){const url=new URL('/payment-result',location.origin);url.searchParams.set('tenant_id',tenant());if(id)url.searchParams.set('payment_id',id);const lang=new URL(location.href).searchParams.get('lang');if(lang)url.searchParams.set('lang',lang);if(callback)for(const key of ['transactionId','orderId']){const value=callback.get(key);if(value)url.searchParams.set(key,value);}return url;}
  async function api(path,session,body){
    const response=await fetch(WORKER_BASE+path+(path.includes('?')?'&':'?')+'tenant_id='+encodeURIComponent(tenant()),{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Payment-Token':session.token},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(65000)});
    const data=await response.json();if(!response.ok){const error=new Error(data.code||'PAYMENT_FAILED');error.status=response.status;throw error;}return data;
  }
  return {preserveDraft,terminal,resolve,active,archive,save,remember,forResult,matches,same,draft,signature,cleanUrl,detach,paid,restore,resultUrl,api,completeDetail};
})();
