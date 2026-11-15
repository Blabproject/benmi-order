/* Shared POS authority for browser and Capacitor. Never stores the PIN. */
window.PosSession = (() => {
  const labels = {
    'zh-TW': {posLoginTitle:'登入門市管理',posLoginHint:'輸入管理 PIN 碼以操作訂單。',posLoginPIN:'管理 PIN 碼',posLoginSubmit:'登入',posLoginCancel:'取消',posLoginFailed:'登入失敗，請確認 PIN 碼後重試。',posLoginLimited:'嘗試次數過多，請稍後再試。'},
    vi: {posLoginTitle:'Đăng nhập quản lý quán',posLoginHint:'Nhập PIN quản lý để thao tác đơn hàng.',posLoginPIN:'PIN quản lý',posLoginSubmit:'Đăng nhập',posLoginCancel:'Hủy',posLoginFailed:'Đăng nhập thất bại. Kiểm tra PIN và thử lại.',posLoginLimited:'Đã thử quá nhiều lần. Vui lòng thử lại sau.'}
  };
  const label = key => typeof t==='function' ? t(key) : (labels[document.documentElement.lang==='vi'?'vi':'zh-TW'][key]);
  const scope = () => WORKER_BASE+'|'+getTenantIdFromUrl();
  const key = () => 'pos_session_v2:'+scope();
  let login = null,loginScope = null;
  const expired = () => { const error=new Error('POS_SESSION_REQUIRED');error.code='POS_SESSION_REQUIRED';return error; };
  function invalidate(){try{sessionStorage.removeItem(key());}catch(_){} }
  async function token(){
    const activeScope=scope();
    try { const stored=JSON.parse(sessionStorage.getItem(key())||'null');if(stored?.token&&stored.expiresAt>Date.now()+30000)return stored.token; }catch(_){}
    if(login&&loginScope===activeScope)return login;
    loginScope=activeScope;
    const pending=new Promise((resolve,reject)=>{
      const previous=document.activeElement,d=document.createElement('dialog');d.className='pos-session-dialog';
      const title=document.createElement('h2');title.id='pos-session-title';title.textContent=label('posLoginTitle');d.setAttribute('aria-labelledby',title.id);
      const hint=document.createElement('p');hint.textContent=label('posLoginHint');
      const form=document.createElement('form'),field=document.createElement('label'),input=document.createElement('input');
      field.textContent=label('posLoginPIN');input.type='password';input.autocomplete='current-password';input.required=true;input.maxLength=128;field.append(input);
      const error=document.createElement('p');error.setAttribute('role','alert');
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent=label('posLoginCancel');cancel.onclick=()=>d.close();
      const submit=document.createElement('button');submit.type='submit';submit.textContent=label('posLoginSubmit');
      const actions=document.createElement('div');actions.className='pos-session-actions';actions.append(cancel,submit);form.append(field,error,actions);d.append(title,hint,form);
      let finished=false;
      d.addEventListener('close',()=>{input.value='';d.remove();previous?.focus?.();if(!finished)reject(expired());},{once:true});
      form.onsubmit=async event=>{
        event.preventDefault();submit.disabled=true;error.textContent='';
        try{
          if(scope()!==activeScope)throw expired();
          const response=await fetch(WORKER_BASE+'/api/pos/session?tenant_id='+encodeURIComponent(getTenantIdFromUrl()),{
            method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:input.value}),signal:AbortSignal.timeout(10000)
          });
          const data=await response.json();input.value='';
          if(!response.ok){error.textContent=label(response.status===429?'posLoginLimited':'posLoginFailed');input.focus();return;}
          if(scope()!==activeScope || !d.isConnected)throw expired();
          const expiresAt=Date.parse(data.expiresAt);if(!data.token||!Number.isFinite(expiresAt))throw expired();
          sessionStorage.setItem(key(),JSON.stringify({token:data.token,expiresAt}));
          finished=true;resolve(data.token);d.close();
        }catch(_){error.textContent=label('posLoginFailed');input.value='';input.focus();}
        finally{submit.disabled=false;}
      };
      document.body.append(d);d.showModal();input.focus();
    });
    login=pending;
    try{return await pending;}finally{if(login===pending){login=null;loginScope=null;}}
  }
  async function authFetch(url,options={}){
    const activeScope=scope(),bearer=await token();
    if(scope()!==activeScope)throw expired();
    const headers=new Headers(options.headers||{});headers.set('Authorization','Bearer '+bearer);
    const response=await fetch(url,{...options,headers});
    if(response.status===401&&scope()===activeScope)invalidate();
    return response;
  }
  return {token,invalidate,fetch:authFetch};
})();
