/* Online payment boundary: errors never fall through to cash/LINE text ordering. */
window.LinePayCheckout = (function () {
  const key = () => 'linepay_checkout:' + getTenantIdFromUrl();
  const vi = () => (typeof currentLocale !== 'undefined' ? currentLocale : document.documentElement.lang) === 'vi';
  const text = (zh, vn) => vi() ? vn : zh;
  let pending = null, busy = false, pollTimer = null;
  function read() { try { return JSON.parse(localStorage.getItem(key()) || 'null'); } catch (_) { return null; } }
  function save(value) { pending = value; localStorage.setItem(key(), JSON.stringify(value)); }
  function selected() { return document.getElementById('payment-method')?.value === 'line_pay'; }
  function blocked() { return !!read(); }
  async function api(path, body) {
    const res = await fetch(WORKER_BASE + path + '?tenant_id=' + encodeURIComponent(getTenantIdFromUrl()), {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Payment-Token': pending.token },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(65000)
    });
    const data = await res.json(); if (!res.ok) throw new Error(data.code || 'PAYMENT_FAILED'); return data;
  }
  function panel() {
    let el = document.getElementById('payment-result');
    if (!el) { el = document.createElement('section'); el.id = 'payment-result'; el.className = 'payment-panel';
      el.setAttribute('aria-live', 'polite'); document.getElementById('sec-checkout')?.prepend(el); }
    return el;
  }
  function render(data) {
    const el = panel(); el.replaceChildren();
    const title = document.createElement('p');
    const paid = data?.paidAt, terminal = ['CANCELLED','FAILED'].includes(data?.status);
    title.textContent = paid ? text('付款成功，門市已收到訂單。', 'Thanh toán thành công, quán đã nhận đơn.') : terminal
      ? text('尚未付款，請返回購物車。', 'Chưa thanh toán. Bạn có thể quay lại giỏ hàng.')
      : text('正在確認付款，請勿重複下單。', 'Đang xác minh thanh toán. Vui lòng chưa đặt lại đơn.');
    el.append(title);
    if (data?.displayKey) { const receipt = document.createElement('p'); receipt.textContent = '#'+data.displayKey+' · TWD '+data.amount; el.append(receipt); }
    if (data?.receipt && window.OrderDetailView) {
      const details = document.createElement('pre'); details.style.whiteSpace = 'pre-wrap'; details.textContent = OrderDetailView.text(data.receipt); el.append(details);
    }
    const button = document.createElement('button'); button.type='button';button.className='payment-button';
    button.textContent = paid || terminal ? text('返回菜單', 'Quay lại menu') : data?.paymentUrl
      ? text('開啟 LINE Pay', 'Mở LINE Pay') : text('重新確認付款', 'Kiểm tra lại thanh toán');
    button.onclick = () => {
      if (paid || terminal) { localStorage.removeItem(key()); pending=null; el.remove(); history.replaceState(null,'',location.pathname+'?tenant_id='+encodeURIComponent(getTenantIdFromUrl())); }
      else if(data?.paymentUrl) launch(data);
      else resume();
    };
    el.append(button); el.scrollIntoView({block:'center',behavior:'smooth'});
    if (paid && !pending?.completed) {
      // Only clear the purchased cart once; a refreshed receipt must not clear a new cart.
      save({...pending, completed:true});
      if(typeof cart!=='undefined') {cart={};window.cart=cart;}
      if(typeof customizeData!=='undefined') {customizeData={};window.customizeData=customizeData;}
      if(typeof comboDrinkData!=='undefined') {comboDrinkData={};window.comboDrinkData=comboDrinkData;}
      window.bundleCartData={};
      if(typeof DetailCheckout!=='undefined')DetailCheckout.completed();
      if(typeof updateTotal==='function')updateTotal();
    }
  }
  function launch(data) {
    const inLine=typeof liff!=='undefined' && liff.isInClient();
    location.assign(inLine && data.appUrl ? data.appUrl : data.paymentUrl);
  }
  async function resume(openPayment) {
    if(busy)return; pending=read();if(!pending)return;busy=true;
    try {
      let data;
      if(!pending.id) {
        const lineAccessToken=typeof liff!=='undefined' && liff.isLoggedIn() ? liff.getAccessToken() : undefined;
        data=await api('/api/payments/linepay/request',{...pending.payload,lineAccessToken});save({...pending,id:data.id});}
      else data=await api('/api/payments/'+pending.id+'/confirm',{});
      render(data);
      clearTimeout(pollTimer);
      if(openPayment && data.paymentUrl) {launch(data);return;}
      if(!data.paidAt && !['CANCELLED','FAILED'].includes(data.status))pollTimer=setTimeout(()=>{if(!document.hidden)resume();},5000);
    }catch(_){render(null);}finally{busy=false;}
  }
  async function start(payload) {
    if(read()) {await resume();return;}
    if(payload.dining_option!=='takeaway'||payload.detailVersion!==1)throw new Error(text('LINE Pay 僅支援新的外帶訂單。','LINE Pay chỉ hỗ trợ đơn mang đi mới.'));
    const token=Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('');
    // Persist before POST, so a lost response reuses the exact operation and payload.
    save({token,payload});await resume(true);
  }
  async function init() {
    const sec=document.getElementById('sec-checkout');if(!sec)return;
    pending=read(); if(pending)await resume();
    else if(new URLSearchParams(location.search).has('payment_id')) {
      panel().textContent=text('請返回原本的點餐視窗查詢付款，請勿重複下單。','Vui lòng quay lại cửa sổ đặt món ban đầu để kiểm tra thanh toán, chưa đặt lại đơn.');
    }
    try {
      const res=await fetch(WORKER_BASE+'/api/payments/config?tenant_id='+encodeURIComponent(getTenantIdFromUrl()));
      const config=await res.json();if(!config.linePay?.enabled)return;
      const group=document.createElement('div');group.className='payment-panel';
      const label=document.createElement('label');label.htmlFor='payment-method';label.textContent=text('付款方式','Phương thức thanh toán');
      const select=document.createElement('select');select.id='payment-method';select.className='payment-button';
      for(const [value,title] of [['cash',text('取餐時付款','Trả tại quầy')],['line_pay','LINE Pay']]) {
        const option=document.createElement('option');option.value=value;option.textContent=title;select.append(option);
      }
      group.append(label,select);sec.prepend(group);
    }catch(_){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
  return {selected,blocked,start,resume};
})();
