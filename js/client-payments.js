/* Online payment boundary: errors never fall through to cash/LINE text ordering. */
window.LinePayCheckout = (function () {
  const key = () => 'linepay_checkout:' + getTenantIdFromUrl();
  const vi = () => (typeof currentLocale !== 'undefined' ? currentLocale : document.documentElement.lang) === 'vi';
  const text = (zh, vn) => vi() ? vn : zh;
  let pending = null, busy = false, pollTimer = null;
  function read() { try { return JSON.parse(localStorage.getItem(key()) || 'null'); } catch (_) { return null; } }
  function save(value) { pending = value; localStorage.setItem(key(), JSON.stringify(value)); }
  function selected() { return document.getElementById('payment-method')?.value === 'line_pay'; }
  function hasCartItems() { return Object.values(window.cart || {}).some(qty => Number(qty) > 0); }
  function cartSignature() {
    return JSON.stringify({cart:window.cart || {},customizeData:window.customizeData || {},
      comboDrinkData:window.comboDrinkData || {},bundleCartData:window.bundleCartData || {}},
      (_,value) => value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.keys(value).sort().map(name => [name,value[name]])) : value);
  }
  function sameSession(session) { return !!session && read()?.token === session.token; }
  function cleanCallbackUrl() {
    const url = new URL(location.href);
    for (const name of ['payment_id','transactionId','orderId']) url.searchParams.delete(name);
    history.replaceState(history.state,'',url.pathname + url.search + url.hash);
  }
  function discard(session) {
    if (!sameSession(session)) return;
    clearTimeout(pollTimer); pollTimer=null;
    localStorage.removeItem(key()); pending=null;
    document.getElementById('payment-result')?.remove();
    cleanCallbackUrl();
    if (typeof DetailCheckout !== 'undefined') DetailCheckout.completed();
  }
  function onCartChange() {
    const saved=read();
    if (saved?.completed && hasCartItems()) discard(saved);
  }
  function blocked() { onCartChange(); return !!read() && !read()?.completed; }
  async function api(path, body, session) {
    const res = await fetch(WORKER_BASE + path + '?tenant_id=' + encodeURIComponent(getTenantIdFromUrl()), {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Payment-Token': session.token },
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
  function element(tag, className, value) {
    const el = document.createElement(tag); el.className = className;
    if (value !== undefined) el.textContent = value;
    return el;
  }
  // Lucide check / clock / credit-card geometry, MIT license; no decorative emoji.
  function icon(kind) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({viewBox:'0 0 24 24',width:'20',height:'20',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) svg.setAttribute(key, value);
    const paths = kind === 'check' ? ['M20 6 9 17l-5-5'] : kind === 'clock'
      ? ['M12 8v4l3 2', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0']
      : ['M2 8h20', 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2'];
    for (const d of paths) { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path); }
    return svg;
  }
  function receiptDetails(snapshot) {
    const details = element('details', 'payment-receipt-details');
    const summary = element('summary', 'payment-receipt-toggle', text('查看訂單明細', 'Xem chi tiết đơn'));
    details.append(summary);
    const body = element('div', 'payment-receipt-body');
    if (OrderDetailView.isSnapshot?.(snapshot)) {
      const choices = OrderDetailView.globalChoices(snapshot);
      if (choices.length) {
        const list = element('dl', 'payment-receipt-choices');
        for (const choice of choices) {
          const row = element('div', 'payment-receipt-choice');
          row.append(element('dt', '', choice.label), element('dd', '', choice.value)); list.append(row);
        }
        body.append(list);
      }
      const items = element('ul', 'payment-receipt-items');
      for (const line of OrderDetailView.lines(snapshot)) {
        const item = element('li', 'payment-receipt-item');
        const heading = element('div', 'payment-receipt-line');
        heading.append(element('span', 'payment-receipt-name', line.quantity + ' × ' + line.name),
          element('span', 'payment-receipt-price', '$' + line.subtotal)); item.append(heading);
        for (const option of line.options) item.append(element('p', 'payment-receipt-note', option.choice));
        if (line.note) item.append(element('p', 'payment-receipt-note', line.note));
        items.append(item);
      }
      body.append(items);
      const note = OrderDetailView.notes(snapshot);
      if (note) body.append(element('p', 'payment-receipt-note', note));
    } else body.append(element('p', 'payment-receipt-note', OrderDetailView.text(snapshot)));
    details.append(body); return details;
  }
  function render(data, session) {
    if (!sameSession(session)) return;
    const el = panel(); el.replaceChildren();
    const paid = data?.paidAt, terminal = ['CANCELLED','FAILED'].includes(data?.status);
    el.classList.add('payment-result-card');
    el.dataset.state = paid ? 'paid' : terminal ? 'cancelled' : 'pending';
    const heading = element('div', 'payment-result-heading');
    const mark = element('span', 'payment-result-mark'); mark.append(icon(paid ? 'check' : 'clock'));
    const titles = element('div', 'payment-result-titles');
    titles.append(element('h3', 'payment-result-title', paid ? text('付款成功', 'Thanh toán thành công')
      : terminal ? text('尚未付款', 'Chưa thanh toán') : text('正在確認付款', 'Đang xác minh thanh toán')));
    titles.append(element('p', 'payment-result-description', paid ? text('門市已收到您的訂單。', 'Quán đã nhận đơn của bạn.')
      : terminal ? text('您可以返回購物車重新選擇。', 'Bạn có thể quay lại giỏ hàng.')
      : text('請稍候，暫時無需重新下單。', 'Vui lòng chờ, chưa cần đặt lại đơn.')));
    heading.append(mark, titles); el.append(heading);
    if (data?.displayKey) {
      const meta = element('div', 'payment-receipt-meta');
      const identity = element('div', 'payment-receipt-identity');
      identity.append(element('span', 'payment-receipt-label', text('訂單編號', 'Mã đơn')),
        element('strong', 'payment-receipt-key', '#' + data.displayKey));
      const amount = element('div', 'payment-receipt-amount');
      amount.append(element('span', 'payment-receipt-label', paid ? text('已付金額', 'Đã thanh toán') : text('訂單金額', 'Giá trị đơn')),
        element('strong', 'payment-receipt-total', 'TWD ' + data.amount));
      meta.append(identity, amount); el.append(meta);
    }
    if (data?.receipt && window.OrderDetailView) el.append(receiptDetails(data.receipt));
    const button = element('button', 'payment-button payment-result-button'); button.type='button';
    button.textContent = paid || terminal ? text('返回菜單', 'Quay lại menu') : data?.paymentUrl
      ? text('開啟 LINE Pay', 'Mở LINE Pay') : text('重新確認付款', 'Kiểm tra lại thanh toán');
    button.onclick = () => {
      if (paid || terminal) discard(session);
      else if(data?.paymentUrl) launch(data);
      else resume();
    };
    el.append(button); el.scrollIntoView({block:'center',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    if (paid || terminal) cleanCallbackUrl();
    if (paid && !session.completed) {
      // Only clear the purchased cart once; a refreshed receipt must not clear a new cart.
      save({...session, completed:true});
      // The customer may have edited the cart while the provider was processing.
      // Retire the paid session without erasing a different draft.
      if (session.cartSignature && hasCartItems() && cartSignature() !== session.cartSignature) {
        discard(read()); return;
      }
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
    if(busy)return;
    const session=read();
    if(!session)return;
    if(session.completed){discard(session);return;}
    pending=session;busy=true;
    try {
      let data;
      if(!session.id) {
        const lineAccessToken=typeof liff!=='undefined' && liff.isLoggedIn() ? liff.getAccessToken() : undefined;
        data=await api('/api/payments/linepay/request',{...session.payload,lineAccessToken},session);
        if(!sameSession(session))return;
        session.id=data.id;save(session);
      } else data=await api('/api/payments/'+session.id+'/confirm',{},session);
      if(!sameSession(session))return;
      render(data,session);
      clearTimeout(pollTimer);
      if(!sameSession(session))return;
      if(openPayment && data.paymentUrl) {launch(data);return;}
      if(!data.paidAt && !['CANCELLED','FAILED'].includes(data.status))pollTimer=setTimeout(()=>{if(!document.hidden)resume();},5000);
    }catch(_){if(sameSession(session))render(null,session);}finally{busy=false;}
  }
  async function start(payload) {
    const saved=read();if(saved?.completed)discard(saved);
    if(read()) {await resume();return;}
    if(payload.dining_option!=='takeaway'||payload.detailVersion!==1)throw new Error(text('LINE Pay 僅支援新的外帶訂單。','LINE Pay chỉ hỗ trợ đơn mang đi mới.'));
    const token=Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('');
    // Persist before POST, so a lost response reuses the exact operation and payload.
    save({token,payload,cartSignature:cartSignature()});await resume(true);
  }
  async function init() {
    const sec=document.getElementById('sec-checkout');if(!sec)return;
    pending=read(); if(pending?.completed)discard(pending);
    else if(pending)await resume();
    else if(new URLSearchParams(location.search).has('payment_id')) {
      panel().textContent=text('請返回原本的點餐視窗查詢付款，請勿重複下單。','Vui lòng quay lại cửa sổ đặt món ban đầu để kiểm tra thanh toán, chưa đặt lại đơn.');
    }
    try {
      const res=await fetch(WORKER_BASE+'/api/payments/config?tenant_id='+encodeURIComponent(getTenantIdFromUrl()));
      const config=await res.json();if(!config.linePay?.enabled)return;
      const group=document.createElement('div');group.className='payment-method-section';
      const label=document.createElement('label');label.htmlFor='payment-method';label.className='payment-method-label';label.append(icon('card'));label.append(document.createTextNode(text('付款方式','Phương thức thanh toán')));
      const select=document.createElement('select');select.id='payment-method';select.className='payment-method-select';
      for(const [value,title] of [['cash',text('取餐時付款','Trả tại quầy')],['line_pay','LINE Pay']]) {
        const option=document.createElement('option');option.value=value;option.textContent=title;select.append(option);
      }
      group.append(label,select);sec.prepend(group);
    }catch(_){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
  return {selected,blocked,start,resume,onCartChange};
})();
