/* Staff checkout adapter for the shared LIFF menu. */
window.StaffOrder = (() => {
  if (!window.isStaffOrderMode) return null;
  let capabilities = null, tables = [], busy = false, initialized = false;
  const language = () => document.documentElement.lang;
  const text = (zh, vi) => language() === 'vi' ? vi : zh;
  const tenant = () => getTenantIdFromUrl();
  const storageKey = suffix => `staff_liff_${suffix}:${tenant()}`;
  const select = () => document.getElementById('dinein-table-number');
  const status = () => document.getElementById('staff-order-status');
  const ready = () => initialized && !busy;
  function message(value) { status().textContent = value; }
  async function api(path, options) {
    const response = await fetch(`${WORKER_BASE}${path}${path.includes('?') ? '&' : '?'}tenant_id=${encodeURIComponent(tenant())}`, {
      ...options, signal: AbortSignal.timeout(20000)
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw Object.assign(new Error(data.error || 'REQUEST_FAILED'), {status: response.status});
    return data;
  }
  function dineInAllowed() {
    if (capabilities?.allowDineIn === false) return false;
    if (storeConfig && storeConfig.allowDineIn === false) return false;
    if (storeConfig && Array.isArray(storeConfig.features) && !storeConfig.features.includes('dine_in')) return false;
    return true;
  }
  function scheduledPickupAllowed() {
    if (capabilities?.allowScheduledPickup === false) return false;
    if (storeConfig && storeConfig.allowScheduledPickup === false) return false;
    return true;
  }
  function tableContext() {
    const table = tables.find(row => row.id === select().value);
    return table?.active_order_key ? `${table.id}:${table.active_order_key}:${table.active_revision}` : `${table?.id || ''}:new`;
  }
  function describeSelection() {
    if (!dineInAllowed() || window.currentDiningOption === 'takeaway') {
      return message(scheduledPickupAllowed()
        ? text('外帶點餐將建立新訂單。', 'Đơn mang đi sẽ tạo đơn mới.')
        : text('外帶現場排單將建立新訂單。', 'Đơn mang đi lấy ngay sẽ tạo đơn mới.'));
    }
    if (!tables.length) return message(text('尚未設定桌號，請先在設定中新增桌號。', 'Chưa cấu hình bàn. Hãy thêm bàn trong Cài đặt.'));
    const table = tables.find(row => row.id === select().value);
    message(table?.active_order_key
      ? text(`將加點至 #${table.active_display_key || table.active_order_id}`, `Gọi thêm vào đơn #${table.active_display_key || table.active_order_id}`)
      : text('空桌將建立新訂單。', 'Bàn trống sẽ tạo đơn mới.'));
  }
  async function refreshTables() {
    if (!dineInAllowed() || !capabilities?.capabilities?.tables_read) {
      tables = [];
      select().replaceChildren(new Option(text('請選擇桌號', 'Chọn bàn'), ''));
      select().value = '';
      describeSelection();
      return;
    }
    const selected = select().value;
    const data = await api('/api/staff/tables');
    tables = data.tables || [];
    select().replaceChildren(new Option(text('請選擇桌號', 'Chọn bàn'), ''));
    for (const row of tables) select().add(new Option(`${row.label} — ${row.active_order_key ? text('使用中', 'Đang phục vụ') : text('空桌', 'Trống')}`, row.id));
    select().value = tables.some(row => row.id === selected) ? selected : '';
    if (!tables.length) message(text('尚未設定桌號，請先在設定中新增桌號。', 'Chưa cấu hình bàn. Hãy thêm bàn trong Cài đặt.'));
    else describeSelection();
  }
  function saveDraft() {
    if (!initialized || busy) return;
    try {
      sessionStorage.setItem(storageKey('draft'), JSON.stringify({cart, customizeData, bundleCartData: window.bundleCartData,
        orderSelections: DetailCheckout.selections(), dining: window.currentDiningOption, table: select().value, note: document.getElementById('note').value}));
    } catch (_) {}
  }
  function translate() {
    // Translate interface copy only; tenant menu names are owned by the catalog.
    const dictionary = {
      '結帳':'Thanh toán','購物車清單':'Giỏ hàng','(目前沒有已選商品)':'Chưa chọn món',
      '即時排隊製作模式':'Chế biến theo thứ tự đơn','現場排單':'Nhận tại quầy','預計下單時間：':'Giờ đặt món:',
      '※ 訂單送出後將以當前時間排單，門市人員會依序儘速為您新鮮現做。':'Đơn được chế biến theo thứ tự tiếp nhận.',
      '現場內用・即時製作':'Dùng tại bàn · Chế biến ngay','現點現做':'Chế biến khi đặt','點餐時間：':'Giờ đặt món:',
      '※ 訂單送出後廚房將立即依照排單順序為您製作，出餐時請留意叫號或您的取餐號碼。':'Bếp chế biến theo thứ tự tiếp nhận. Vui lòng theo dõi số đơn.',
      '預計取餐時間':'Giờ nhận món dự kiến','點擊修改':'Đổi giờ','最快取餐 (店家即刻製作)':'Nhận sớm nhất',
      '今日取餐 · 點擊更改時間':'Nhận hôm nay · Chạm để đổi giờ','最快取餐':'Nhận sớm nhất','店家即刻備餐':'Cửa hàng chuẩn bị ngay',
      '預計約 15-20 分鐘後可取餐':'Dự kiến nhận sau 15–20 phút','或選擇指定時間':'Hoặc chọn giờ nhận',
      '每 15 分鐘為一時段':'Mỗi khung giờ cách nhau 15 phút','本日營業時間已結束，請選擇明日或其他日期':'Đã hết giờ hôm nay. Hãy chọn ngày khác.',
      '店家目前暫停接單中':'Cửa hàng tạm ngừng nhận đơn','目前門市暫不接受新訂單，敬請見諒！':'Cửa hàng hiện chưa nhận đơn mới.',
      '確定':'Đồng ý','載入中...':'Đang tải...',
      '用餐方式':'Hình thức dùng bữa','外帶自取':'Mang đi','店內用餐':'Tại bàn','用餐桌號':'Bàn phục vụ',
      '必填\n                                    (送餐依據)':'Bắt buộc', '取餐時間':'Giờ nhận món','點餐時間':'Giờ đặt món',
      '其他要求':'Ghi chú đơn hàng','購物車':'Giỏ hàng','總計':'Tổng cộng','確認下單':'Xác nhận đặt món',
      '請先選擇餐點':'Hãy chọn món','前往結帳':'Đến thanh toán','客製化':'Tùy chọn','加入購物車':'Thêm vào giỏ',
      '取消':'Hủy','確認':'Xác nhận','確認時間':'Xác nhận giờ','立即取餐':'Nhận sớm nhất','預約取餐':'Hẹn giờ nhận',
      '選擇取餐時間':'Chọn giờ nhận món','請選擇取餐時間':'Chọn giờ nhận món','備註':'Ghi chú','售完':'Hết món',
      '口味選擇':'Tùy chọn chung','客製化設定':'Tùy chọn đã chọn','編輯':'Sửa','刪除':'Xóa','關閉':'Đóng','小計':'Tạm tính','提醒':'Thông báo'
    };
    if (language() !== 'vi') return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement.closest('script,style,#catalog-sections .section-title,.item-name,.choice-name,.custom-label,#unified-option-modal')) continue;
      const value = node.textContent.trim();
      if (dictionary[value]) node.textContent = dictionary[value];
    }
    document.getElementById('note').placeholder = 'Ghi chú cho cửa hàng';
  }
  async function start() {
    try {
      const params = new URLSearchParams(location.search);
      if (!params.get('tenant_id') && !params.get('tenant')) throw new Error('TENANT_REQUIRED');
      document.documentElement.lang = localStorage.getItem(params.get('embedded') === '1' ? 'benmi_lang' : 'staff_order_lang') || 'zh-TW';
      capabilities = await api('/api/staff/capabilities');
      if (!capabilities.staff_ordering_enabled || (!capabilities.capabilities?.tables_read && !capabilities.capabilities?.create)) throw new Error('FEATURE_DISABLED');
      const input = select();
      const picker = document.createElement('select');
      picker.id = input.id;
      picker.setAttribute('aria-label', text('用餐桌號', 'Bàn phục vụ'));
      input.replaceWith(picker);
      const info = document.createElement('p');
      info.id = 'staff-order-status'; info.setAttribute('aria-live', 'polite');
      document.getElementById('dinein-table-input-group').after(info);
      picker.addEventListener('change', () => { describeSelection(); saveDraft(); });
      const baseSetDining = window.setCustomerDiningOption;
      if (typeof baseSetDining === 'function') {
        window.setCustomerDiningOption = opt => {
          baseSetDining(dineInAllowed() ? opt : 'takeaway');
          if (initialized && !busy) { describeSelection(); saveDraft(); }
        };
      }
      await initApp();
      setCustomerDiningOption(dineInAllowed() ? 'dine_in' : 'takeaway');
      await refreshTables();
      try {
        const draft = JSON.parse(sessionStorage.getItem(storageKey('draft')) || 'null');
        if (draft) {
          cart = draft.cart || {}; window.cart = cart;
          customizeData = draft.customizeData || {}; window.customizeData = customizeData;
          window.bundleCartData = draft.bundleCartData || {};
          document.getElementById('note').value = draft.note || '';
          picker.value = tables.some(row => row.id === draft.table) ? draft.table : '';
          setCustomerDiningOption(dineInAllowed() ? (draft.dining || 'dine_in') : 'takeaway');
          for (const group of draft.orderSelections || []) {
            const definition = (bootstrapData.customizations || []).find(row => (row.id || row.key) === group.groupId);
            if (!definition) continue;
            for (const control of document.getElementsByName(`opt-${definition.key}`)) {
              const choice = group.items.find(item => item.optionId === control.dataset.optionId);
              control.checked = !!choice;
              control.dispatchEvent(new Event('change', {bubbles:true}));
              const container = control.closest('.flavor-option-container');
              for (const sub of container?.querySelectorAll('.sub-opt-chk') || []) sub.checked = !!choice?.subOptions?.some(item => item.id === (sub.dataset.subId || sub.value));
            }
          }
          reconcileCartOptions();
          for (const key of Object.keys(cart)) { const {catSlug, origName} = parseCartKey(key); updateQty(catSlug, origName, 0); }
        }
      } catch (_) {}
      initialized = true;
      updateTotal(); describeSelection(); translate();
      let queued = false;
      new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; translate(); saveDraft(); });
      }).observe(document.getElementById('page-body-content'), {childList:true,subtree:true});
      document.addEventListener('input', saveDraft);
      window.addEventListener('pagehide', saveDraft);
    } catch (error) {
      const panel = document.createElement('p'); panel.id = 'staff-access-error'; panel.setAttribute('role', 'alert');
      panel.textContent = text('無法開啟員工點餐。請確認店家已啟用此功能，再重新開啟。','Không mở được Staff Order. Kiểm tra tính năng đã bật và mở lại.');
      document.body.replaceChildren(panel);
      console.warn('[StaffOrder]', error);
    }
  }
  async function submit() {
    if (!ready()) return;
    if (!Object.values(cart).some(q => q > 0)) return message(text('請先選擇餐點。','Hãy chọn món.'));
    const dining = dineInAllowed() && window.currentDiningOption === 'dine_in' ? 'dine_in' : 'takeaway';
    const chosen = dining === 'dine_in' ? tables.find(row => row.id === select().value) : null;
    if (dining === 'dine_in' && !chosen) { select().focus(); return message(text('請選擇桌號。','Hãy chọn bàn.')); }
    const before = tableContext();
    saveDraft(); busy = true; window.isSubmitting = true;
    const buttons = getAllSubmitButtons(); buttons.forEach(button => button.disabled = true);
    select().disabled = true;
    document.getElementById('page-body-content').inert = true;
    try {
      const retry = JSON.parse(sessionStorage.getItem(storageKey('pending')) || 'null');
      const useScheduled = dining === 'takeaway' && scheduledPickupAllowed();
      const draftSignature = JSON.stringify({dining,table:dining === 'dine_in' ? chosen?.id : undefined,items:DetailCheckout.items(),groups:DetailCheckout.selections(),note:document.getElementById('note').value.trim(),total:updateTotal(),date:useScheduled ? document.getElementById('pickup-date')?.value : undefined,time:useScheduled ? document.getElementById('pickup-time')?.value : undefined});
      const replay = retry?.draftSignature === draftSignature;
      if (!replay && dining === 'dine_in') await refreshTables();
      if (!replay && dining === 'dine_in' && before !== tableContext()) {
        sessionStorage.removeItem(storageKey('pending'));
        return message(text('桌位訂單已變更，請確認後再次送出。','Đơn tại bàn đã thay đổi. Kiểm tra lại rồi gửi.'));
      }
      const table = dining === 'dine_in' ? tables.find(row => row.id === chosen?.id) : null;
      const append = dining === 'dine_in' && !!table?.active_order_key;
      if (!capabilities.capabilities[append ? 'append' : 'create']) throw new Error('FEATURE_DISABLED');
      const payload = {detailVersion:1, diningOption:dining, tableId:dining === 'dine_in' ? table.id : undefined,
        expectedRevision:append ? table.active_revision : undefined,
        items:DetailCheckout.items(), orderSelections:DetailCheckout.selections(), total:updateTotal(),
        note:document.getElementById('note').value.trim()};
      if (useScheduled) {
        const date = document.getElementById('pickup-date')?.value;
        const time = document.getElementById('pickup-time')?.value;
        if (!date || !time) return message(text('請選擇取餐時間。','Hãy chọn giờ nhận món.'));
        payload.pickupTime = `${date} ${time}`;
      }
      const endpoint = append ? `/api/staff/orders/${encodeURIComponent(table.active_order_key)}/rounds` : '/api/staff/orders';
      payload.requestId = crypto.randomUUID();
      const operation = replay ? retry : {endpoint,payload,draftSignature};
      sessionStorage.setItem(storageKey('pending'), JSON.stringify(operation));
      const result = await api(operation.endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(operation.payload)});
      sessionStorage.removeItem(storageKey('pending')); sessionStorage.removeItem(storageKey('draft'));
      cart = {}; window.cart = cart; customizeData = {}; window.customizeData = customizeData;
      window.bundleCartData = {}; comboDrinkData = {}; window.comboDrinkData = comboDrinkData;
      document.getElementById('note').value = '';
      renderDynamicCatalog(); updateTotal();
      await refreshTables().catch(() => {}); select().value = '';
      message(text(`已送出 #${result.displayKey || result.orderId}。`, `Đã gửi đơn #${result.displayKey || result.orderId}.`));
      if (parent !== window) parent.postMessage({type:'STAFF_ORDER_SUBMITTED',orderKey:result.orderKey || result.key,
        displayKey:result.displayKey,diningOption:dining,roundCount:result.roundCount}, location.origin);
    } catch (error) {
      if (error.status && error.status < 500) sessionStorage.removeItem(storageKey('pending'));
      if (error.status === 409) {
        await refreshTables().catch(() => {});
        await fetchMenu().catch(() => {});
        message(text('訂單或價格已變更，請檢查購物車後重試。','Đơn hoặc giá đã thay đổi. Kiểm tra giỏ hàng rồi gửi lại.'));
      } else message(text('未能確認送出結果。購物車已保留，請重試。','Chưa xác nhận được kết quả gửi. Giỏ hàng được giữ lại, hãy thử lại.'));
    } finally {
      busy = false; window.isSubmitting = false; select().disabled = false;
      document.getElementById('page-body-content').inert = false;
      buttons.forEach(button => button.disabled = false); updateFooterButtonState(); saveDraft();
    }
  }
  return {start, submit, ready};
})();
