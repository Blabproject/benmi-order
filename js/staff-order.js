/* Staff Counter POS adapter for the shared LIFF menu. */
window.StaffOrder = (() => {
  if (!window.isStaffOrderMode) return null;
  let capabilities = null, tables = [], busy = false, initialized = false, activeTabId = '', noteOpen = false;
  let lastComputedTotal = 0, cashierModalOpen = false, catalogSections = [];
  const language = () => document.documentElement.lang;
  const text = (zh, vi) => language() === 'vi' ? vi : zh;
  const tenant = () => getTenantIdFromUrl();
  const storageKey = suffix => `staff_liff_${suffix}:${tenant()}`;
  const select = () => document.getElementById('dinein-table-number');
  const ready = () => initialized && !busy;
  const escapeHtmlStr = val => String(val ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const roundMoney = val => Math.round((Number(val) || 0) * 100) / 100;
  const CASHIER_REGISTER_ICON_SVG = `<svg class="staff-btn-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="3" width="10" height="5" rx="1"></rect><path d="M12 8v2"></path><path d="M5 10h14l2 5H3l2-5Z"></path><rect x="3" y="15" width="18" height="6" rx="1.5"></rect><line x1="10" y1="18" x2="14" y2="18"></line></svg>`;

  let toastTimer = null;
  function showStaffToast(textMsg, type = 'info') {
    if (!textMsg) return;
    window.StaffOrderView.toast(textMsg, type, true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => window.StaffOrderView.toast(textMsg, type, false), 3200);
  }

  function message(value, options = {}) {
    window.StaffOrderView.message(value);
    if (options.toast || options.type) showStaffToast(value, options.type || 'info');
  }

  function replaceNodeChildren(node, child) {
    if (!node) return;
    node.textContent = '';
    if (child) node.appendChild(child);
  }

  function createStaffUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `staff_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function createTimeoutSignal(ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return { signal: AbortSignal.timeout(ms), clear: () => {} };
    }
    if (typeof AbortController === 'undefined') return { signal: undefined, clear: () => {} };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, clear: () => clearTimeout(timer) };
  }

  async function api(path, options) {
    const timeout = createTimeoutSignal(20000);
    try {
      const response = await fetch(`${WORKER_BASE}${path}${path.includes('?') ? '&' : '?'}tenant_id=${encodeURIComponent(tenant())}`, {
        ...options, signal: timeout.signal
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) throw Object.assign(new Error(data.error || 'REQUEST_FAILED'), { status: response.status });
      return data;
    } finally {
      timeout.clear();
    }
  }

  function dineInAllowed() {
    if (capabilities?.allowDineIn === false) return false;
    if (storeConfig && storeConfig.allowDineIn === false) return false;
    if (storeConfig && Array.isArray(storeConfig.features) && !storeConfig.features.includes('dine_in') && !storeConfig.features.includes('table_qr_ordering')) return false;
    return true;
  }

  function scheduledPickupAllowed() {
    if (capabilities?.allowScheduledPickup === false) return false;
    if (storeConfig && storeConfig.allowScheduledPickup === false) return false;
    return true;
  }

  function tableContext() {
    const table = tables.find(row => row.id === select()?.value);
    return table?.active_order_key ? `${table.id}:${table.active_order_key}:${table.active_revision}` : `${table?.id || ''}:new`;
  }

  function syncCartHeader() {
    if (!dineInAllowed() || window.currentDiningOption === 'takeaway') {
      window.StaffOrderView.cartHeader(text('外帶自取', 'Mang đi'), '');
      return;
    }
    const table = tables.find(row => row.id === select()?.value);
    const label = table?.label || '';
    const hasPrefix = /^(table|bàn|桌|桌號)\b/i.test(label);
    const target = !table ? text('店內用餐（請選桌）', 'Tại bàn (Chọn bàn)')
      : hasPrefix ? label : `${text('桌號', 'Bàn')} ${label}`;
    const round = table?.active_order_key
      ? `${OrderCode.format(table.active_display_key || table.active_order_id)} · ${text('加點', 'Gọi thêm')}` : '';
    window.StaffOrderView.cartHeader(target, round);
  }

  function selectTable(tableId) {
    const picker = select();
    if (picker) picker.value = tableId;
    setCustomerDiningOption(tableId ? 'dine_in' : 'takeaway');
    updateTotal();
    saveDraft();
  }

  function renderTableBar() {
    const allowDine = dineInAllowed();
    const tableGroup = document.getElementById('dinein-table-input-group');
    const legend = document.getElementById('staff-bar-legend');
    if (tableGroup) tableGroup.style.display = allowDine ? 'inline-flex' : 'none';
    if (legend) legend.style.display = allowDine && tables.length ? 'inline-flex' : 'none';
    window.StaffOrderView.tables({
      tables, allowDine, selected: select()?.value || '',
      takeaway: !allowDine || window.currentDiningOption === 'takeaway'
    }, selectTable);
    syncCartHeader();
  }

  function describeSelection() {
    renderTableBar();
    if (!dineInAllowed() || window.currentDiningOption === 'takeaway') {
      return message(scheduledPickupAllowed()
        ? text('外帶點餐將建立新訂單。', 'Đơn mang đi sẽ tạo đơn mới.')
        : text('外帶現場排單將建立新訂單。', 'Đơn mang đi lấy ngay sẽ tạo đơn mới.'));
    }
    if (!tables.length) return message(text('尚未設定桌號，請先在設定中新增桌號。', 'Chưa cấu hình bàn. Hãy thêm bàn trong Cài đặt.'));
    const table = tables.find(row => row.id === select()?.value);
    message(table?.active_order_key
      ? text(`將加點至 ${OrderCode.format(table.active_display_key || table.active_order_id)}`, `Gọi thêm vào đơn ${OrderCode.format(table.active_display_key || table.active_order_id)}`)
      : text('空桌將建立新訂單。', 'Bàn trống sẽ tạo đơn mới.'));
  }

  async function refreshTables() {
    if (!dineInAllowed() || !capabilities?.capabilities?.tables_read) {
      tables = [];
      replaceNodeChildren(select(), new Option(text('請選擇桌號', 'Chọn bàn'), ''));
      select().value = '';
      describeSelection();
      return;
    }
    const data = await api('/api/staff/tables');
    const selected = select().value;
    tables = data.tables || [];
    replaceNodeChildren(select(), new Option(text('請選擇桌號', 'Chọn bàn'), ''));
    for (const row of tables) select().add(new Option(`${row.label} — ${row.active_order_key ? text('使用中', 'Đang phục vụ') : text('空桌', 'Trống')}`, row.id));
    select().value = tables.some(row => row.id === selected) ? selected : '';
    if (!tables.length) message(text('尚未設定桌號，請先在設定中新增桌號。', 'Chưa cấu hình bàn. Hãy thêm bàn trong Cài đặt.'));
    else describeSelection();
  }

  function itemHasRequiredOptions(catSlug, itemName) {
    const key = `${catSlug}_${itemName}`;
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (() => null));
    const itemInfo = resolveFn(key);
    const bundleRule = itemInfo?.bundleRule || itemInfo?.targetItem?.bundleRule;
    if (bundleRule && typeof shouldAutoOpenItemOptions === 'function' && shouldAutoOpenItemOptions(bundleRule)) {
      return true;
    }
    const getItemModsFn = typeof getItemModifiers === 'function' ? getItemModifiers : (window.getItemModifiers || (() => []));
    const mods = getItemModsFn(catSlug, itemName);
    return Array.isArray(mods) && mods.some(m => m.isRequired || Number(m.minSelection || 0) > 0);
  }

  function itemHasAnyOptions(catSlug, itemName) {
    const key = `${catSlug}_${itemName}`;
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (() => null));
    const itemInfo = resolveFn(key);
    const bundleRule = itemInfo?.bundleRule || itemInfo?.targetItem?.bundleRule;
    if (bundleRule?.groups?.length) return true;
    const getItemModsFn = typeof getItemModifiers === 'function' ? getItemModifiers : (window.getItemModifiers || (() => []));
    const mods = getItemModsFn(catSlug, itemName);
    return Array.isArray(mods) && mods.length > 0;
  }

  function openItemCustomizeFromTile(catSlug, itemName) {
    const key = `${catSlug}_${itemName}`;
    if (typeof isItemOutOfStock === 'function' && isItemOutOfStock(key)) return;
    if (typeof checkDesktopAuthGuard === 'function' && !checkDesktopAuthGuard()) return;
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (() => null));
    const itemInfo = resolveFn(key);
    const bundleRule = itemInfo?.bundleRule || itemInfo?.targetItem?.bundleRule;
    const cartObj = window.cart || (typeof cart !== 'undefined' ? cart : {}) || {};
    const qty = Number(cartObj[key] || 0);
    const targetIndex = qty > 0 ? qty - 1 : 0;
    if (bundleRule?.groups?.length && typeof window.openBundleBuilderModal === 'function') {
      window.openBundleBuilderModal(catSlug, itemName, targetIndex);
    } else if (typeof window.openItemCustomizeModal === 'function') {
      window.openItemCustomizeModal(catSlug, itemName, targetIndex);
    }
  }

  function itemView(category, item) {
    const availability = getItemScheduleState(category, item);
    const isUnavailable = item.isOutOfStock || !availability.available;
    const required = !isUnavailable && itemHasRequiredOptions(category.slug, item.name);
    const image = item.imageUrl
      ? /^https?:\/\//i.test(item.imageUrl) ? item.imageUrl : `${WORKER_BASE}${item.imageUrl}`
      : '';
    return {
      name: item.name,
      displayName: locText(item, 'name', item.name),
      price: item.price,
      quantity: Number(window.cart?.[`${category.slug}_${item.name}`] || 0),
      badge: String(locText(item, 'badgeText', item.badgeText || item.badge || '') || '').trim(),
      limit: item.maxPerOrder > 0 ? _cmT('item_limit_badge', { max: item.maxPerOrder }, `限購${item.maxPerOrder}份`, `Tối đa ${item.maxPerOrder} phần`) : '',
      image: image ? `${image}${image.includes('?') ? '&' : '?'}v=2` : '',
      soldOut: Boolean(item.isOutOfStock),
      outsideSchedule: !availability.available,
      unavailableLabel: item.isOutOfStock
        ? _cmT('sold_out_today', null, '今日已售完', 'Hôm nay đã hết')
        : _cmT('outside_schedule_badge', null, '非供應時段', 'Ngoài khung giờ'),
      schedule: availability.scheduleLabel || '',
      required,
      optional: !isUnavailable && !required && itemHasAnyOptions(category.slug, item.name)
    };
  }

  function refreshCatalog() {
    const models = catalogSections.map(section => {
      if (section.type === 'customizations') {
        const label = text('口味選擇', 'Tùy chọn chung');
        return { id: section.sectionId, label, title: label };
      }
      const category = section.category;
      const title = locText(category, 'name', category.name);
      const locale = window.currentClientLocale || 'zh-TW';
      const label = category.i18n?.[locale]?.shortName
        || (category.shortName && title.includes(category.shortName) ? category.shortName : title);
      const promo = category.pricingRules?.promo_label_i18n?.[locale]
        || locText(category, 'promo_label', '') || category.pricingRules?.promo_label || '';
      const availability = section.availability;
      const items = section.visibleItems.map(item => itemView(category, item));
      let schedule = '';
      if (availability.mode === 'selected_shifts' && (availability.available || !items.some(item => !item.outsideSchedule))) {
        schedule = availability.available
          ? (availability.scheduleLabel ? _cmT('schedule_window_badge', { label: availability.scheduleLabel },
            `${availability.scheduleLabel} 限定`, `Chỉ bán ${availability.scheduleLabel}`) : '')
          : _cmT('outside_schedule_badge', null, '非供應時段', 'Ngoài khung giờ');
      }
      return { id: `sec-${category.slug}`, slug: category.slug, label, title, promo, schedule, outsideSchedule: !availability.available, items };
    });
    if (!models.some(section => section.id === activeTabId)) {
      activeTabId = models.find(section => section.slug)?.id || models[0]?.id || '';
    }
    window.StaffOrderView.catalog(models, activeTabId, id => {
      activeTabId = id;
      refreshCatalog();
    }, openItemCustomizeFromTile);
  }

  function renderCatalog(sections, resetOrderOptions, stockOnly) {
    const globalOptions = sections.find(section => section.type === 'customizations');
    catalogSections = globalOptions
      ? [globalOptions, ...sections.filter(section => section !== globalOptions)]
      : sections;
    refreshCatalog();
    if (globalOptions) {
      const optionsHost = document.getElementById(globalOptions.sectionId);
      if (optionsHost && (!stockOnly || !optionsHost.firstElementChild)) {
        if (resetOrderOptions) replaceNodeChildren(optionsHost);
        renderCustomizationsPanel(optionsHost, globalOptions.groups, globalOptions.title);
      }
    }
    if (!stockOnly && typeof updateDesktopAuthUI === 'function') updateDesktopAuthUI();
  }

  function renderStaffCart(computedTotal) {
    const bData = window.bootstrapData || (typeof bootstrapData !== 'undefined' ? bootstrapData : null);
    const cartObj = window.cart || (typeof cart !== 'undefined' ? cart : {}) || {};
    const cData = window.customizeData || (typeof customizeData !== 'undefined' ? customizeData : {}) || {};
    const getPrice = window.getModifierPrice || (typeof getModifierPrice === 'function' ? getModifierPrice : (() => 0));
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (k => ({ origName: k, displayName: k })));

    let totalQty = 0;
    const rows = [];
    const priceMap = {};
    const categoryMetaMap = {};
    if (bData?.catalog) {
      bData.catalog.forEach(cat => {
        categoryMetaMap[cat.slug] = cat;
        (cat.items || []).forEach(it => { priceMap[`${cat.slug}_${it.name}`] = it.price; });
      });
    }

    const itemsByCategory = {};
    for (const key of Object.keys(cartObj)) {
      const qty = Number(cartObj[key] || 0);
      if (qty <= 0) continue;
      const itemInfo = resolveFn(key);
      const { catSlug, itemName } = parseCartKey(key);
      const isOos = typeof isItemOutOfStock === 'function' && isItemOutOfStock(key);
      if (!isOos) totalQty += qty;
      if (!itemsByCategory[catSlug]) itemsByCategory[catSlug] = [];
      itemsByCategory[catSlug].push({
        key,
        itemInfo,
        catSlug,
        itemName,
        displayName: itemInfo?.displayName || itemName,
        qty,
        price: itemInfo?.basePrice || priceMap[key] || 0,
        isOutOfStock: isOos
      });
    }

    for (const slug of Object.keys(itemsByCategory)) {
      const catItems = itemsByCategory[slug];
      if (!catItems?.length) continue;

      catItems.forEach(it => {
        const { key, catSlug, itemName, displayName, qty, price, isOutOfStock } = it;
        if (isOutOfStock) return;
        const bundleRule = it.itemInfo?.bundleRule || it.itemInfo?.targetItem?.bundleRule;
        const hasBundleGroups = Boolean(bundleRule?.groups?.length);
        let itemModifiersTotal = 0;

        if (cData[key]) {
          cData[key].slice(0, qty).forEach(c => {
            if (!c) return;
            if (typeof calculatePortionExtra === 'function') {
              itemModifiersTotal += calculatePortionExtra(key, c);
            } else {
              Object.values(c.single || {}).forEach(v => { if (v) itemModifiersTotal += getPrice(v); });
              Object.entries(c.multiple || {}).forEach(([v, sel]) => { if (sel) itemModifiersTotal += getPrice(v); });
              Object.values(c.subOptions || {}).forEach(sub => { itemModifiersTotal += Number(sub?.price || 0); });
            }
          });
        }
        if (hasBundleGroups && window.bundleCartData?.[key] && window.bundlePortionExtra) {
          itemModifiersTotal += window.bundleCartData[key].slice(0, qty).reduce((sum, p) => sum + (window.bundlePortionExtra(p) || 0), 0);
        }

        const lineTotal = (qty * price) + itemModifiersTotal;
        const hasOpts = itemHasAnyOptions(catSlug, itemName);
        rows.push({ type: 'item', key, catSlug, itemName, displayName, qty, lineTotal, hasOptions: hasOpts });
      });

      const catMeta = categoryMetaMap[slug] || {};
      const bundleRes = typeof calculateCategoryBundleSubtotal === 'function'
        ? calculateCategoryBundleSubtotal(catMeta.pricingRules, catItems.filter(i => !i.isOutOfStock))
        : { discountAmount: 0 };
      if (bundleRes.discountAmount > 0) {
        rows.push({ type: 'discount', key: `discount:${slug}`,
          label: (catMeta.name || '').split(' ')[0] || text('組合優惠', 'Ưu đãi combo'), amount: bundleRes.discountAmount });
      }
    }

    const options = [];
    if (totalQty > 0) {
      for (const group of bData?.customizations || []) {
        const controls = Array.from(document.getElementsByName(`opt-${group.key}`)).filter(input => input.checked);
        if (!controls.length) continue;
        const choices = controls.map(input => {
          const subs = Array.from(input.closest('.flavor-option-container')?.querySelectorAll('.sub-opt-chk:checked') || []);
          const label = input.value + (subs.length ? ` (${subs.map(sub => sub.value).join(language() === 'vi' ? ', ' : '、')})` : '');
          const extra = [input, ...subs].reduce((sum, control) => sum + (Number(control.dataset.price) || 0), 0);
          return { label, extra };
        });
        options.push({ key: group.key, title: group.title, choices });
      }
    }
    window.StaffOrderView.cart({ rows, options, quantity: totalQty });

    renderNote();
    syncSubmitLabel(totalQty, computedTotal);
  }

  function renderNote() {
    const noteInput = document.getElementById('note');
    const noteWrap = document.getElementById('staff-note-wrap');
    if (!noteInput || !noteWrap) return;
    const open = noteOpen || Boolean(noteInput.value.trim());
    noteWrap.classList.toggle('staff-note-open', open);
    noteInput.placeholder = text('備註（少冰、切半、先上...）', 'Ghi chú cho bếp...');
    window.StaffOrderView.note(open, () => {
      noteOpen = !noteOpen;
      renderNote();
      if (noteOpen) noteInput.focus();
    });
  }

  function syncCashierButton(totalQty, computedTotal) {
    const total = roundMoney(computedTotal);
    if (cashierModalOpen && total !== lastComputedTotal) {
      window.StaffOrderView.renderCashier(total, closeCashierModal, confirmCashierModal);
    }
    lastComputedTotal = total;
    window.StaffOrderView.cashierButton(!initialized || busy || totalQty <= 0 || lastComputedTotal <= 0, openCashierModal);
  }

  function closeCashierModal(options = {}) {
    if (!cashierModalOpen) return;
    cashierModalOpen = false;
    window.StaffOrderView.closeCashier();
    if (options.restoreFocus !== false) document.getElementById('staff-cashier-btn')?.focus();
  }

  function openCashierModal() {
    if (!ready() || cashierModalOpen) return;
    const total = lastComputedTotal > 0 ? lastComputedTotal : roundMoney(window.updateTotal());
    if (total <= 0) return;
    lastComputedTotal = total;
    cashierModalOpen = true;
    window.StaffOrderView.renderCashier(total, closeCashierModal, confirmCashierModal);
  }

  function confirmCashierModal(tendered) {
    if (lastComputedTotal <= 0 || tendered < lastComputedTotal) return;
    closeCashierModal({ restoreFocus: false });
    void submit();
  }

  function syncSubmitLabel(totalQty, computedTotal) {
    const deskBtn = document.getElementById('btn-desktop-submit');
    if (deskBtn) {
      let label = '';
      if (deskBtn.disabled && !deskBtn.dataset.emptyCart) {
        label = (deskBtn.querySelector('span')?.textContent || deskBtn.textContent || '').trim();
      } else if (totalQty <= 0) {
        label = text('選擇餐點', 'Chọn món');
      } else {
        const dining = dineInAllowed() && window.currentDiningOption === 'dine_in' ? 'dine_in' : 'takeaway';
        const hasTable = dining === 'takeaway' || Boolean(select()?.value);
        label = !hasTable
          ? `${text('選擇桌號', 'Chọn bàn')} · $${computedTotal}`
          : `${text('送出訂單', 'Gửi bếp')} · $${computedTotal}`;
      }
      deskBtn.innerHTML = `${CASHIER_REGISTER_ICON_SVG}<span>${escapeHtmlStr(label)}</span>`;
    }
    syncCashierButton(totalQty, computedTotal);
  }

  function mountCounterLayout() {
    const leftCol = document.querySelector('.menu-catalog-col');
    const catalogWrapper = document.getElementById('catalog-sections-wrapper');
    const nav = document.getElementById('main-nav');
    const checkoutSec = document.getElementById('sec-checkout');
    const cartSummary = document.getElementById('cart-summary');
    const tableGroup = document.getElementById('dinein-table-input-group');
    const noteInput = document.getElementById('note');
    const submitWrap = document.querySelector('.desktop-sidebar-submit-wrap');
    const totalRow = document.querySelector('.desktop-sidebar-total-row');
    const deskSubmitBtn = document.getElementById('btn-desktop-submit');

    if (leftCol && !document.getElementById('staff-table-bar')) {
      const bar = document.createElement('div');
      bar.id = 'staff-table-bar';
      const chips = document.createElement('div');
      chips.id = 'staff-table-chips';
      chips.className = 'staff-table-chips';
      const legend = document.createElement('div');
      legend.id = 'staff-bar-legend';
      legend.className = 'staff-bar-legend';
      bar.appendChild(chips);
      if (tableGroup) bar.appendChild(tableGroup);
      bar.appendChild(legend);
      leftCol.prepend(bar);
    }

    if (leftCol && nav && catalogWrapper && nav.parentElement !== leftCol) {
      leftCol.insertBefore(nav, catalogWrapper);
    }

    if (checkoutSec && cartSummary && !document.getElementById('staff-cart-header')) {
      const header = document.createElement('div');
      header.id = 'staff-cart-header';
      checkoutSec.insertBefore(header, cartSummary);

      const info = document.getElementById('staff-order-status') || document.createElement('p');
      info.id = 'staff-order-status';
      info.setAttribute('aria-live', 'polite');
      header.after(info);
    }

    if (noteInput && submitWrap && !document.getElementById('staff-note-wrap')) {
      const noteGroup = noteInput.closest('.input-group') || noteInput;
      const wrap = document.createElement('div');
      wrap.id = 'staff-note-wrap';
      const control = document.createElement('span');
      control.id = 'staff-note-control';
      control.style.display = 'contents';
      wrap.appendChild(control);
      wrap.appendChild(noteInput);
      noteGroup.replaceWith(wrap);
    }

    if (totalRow && !document.getElementById('staff-cart-count')) {
      const countSpan = document.createElement('span');
      countSpan.id = 'staff-cart-count';
      totalRow.prepend(countSpan);
    }

    if (submitWrap && deskSubmitBtn && !document.getElementById('staff-cashier-control')) {
      const control = document.createElement('div');
      control.id = 'staff-cashier-control';
      deskSubmitBtn.after(control);
    }
  }

  function saveDraft() {
    if (!initialized || busy) return;
    try {
      sessionStorage.setItem(storageKey('draft'), JSON.stringify({
        cart, customizeData, bundleCartData: window.bundleCartData,
        orderSelections: DetailCheckout.selections(), dining: window.currentDiningOption,
        table: select().value, note: document.getElementById('note').value
      }));
    } catch (_) {}
  }

  function translate() {
    const dictionary = {
      '結帳': 'Thanh toán', '購物車清單': 'Giỏ hàng', '(目前沒有已選商品)': 'Chưa chọn món',
      '即時排隊製作模式': 'Chế biến theo thứ tự đơn', '現場排單': 'Nhận tại quầy', '預計下單時間：': 'Giờ đặt món:',
      '※ 訂單送出後將以當前時間排單，門市人員會依序儘速為您新鮮現做。': 'Đơn được chế biến theo thứ tự tiếp nhận.',
      '現場內用・即時製作': 'Dùng tại bàn · Chế biến ngay', '現點現做': 'Chế biến khi đặt', '點餐時間：': 'Giờ đặt món:',
      '※ 訂單送出後廚房將立即依照排單順序為您製作，出餐時請留意叫號或您的取餐號碼。': 'Bếp chế biến theo thứ tự tiếp nhận. Vui lòng theo dõi số đơn.',
      '預計取餐時間': 'Giờ nhận món dự kiến', '點擊修改': 'Đổi giờ', '最快取餐 (店家即刻製作)': 'Nhận sớm nhất',
      '今日取餐 · 點擊更改時間': 'Nhận hôm nay · Chạm để đổi giờ', '最快取餐': 'Nhận sớm nhất', '店家即刻備餐': 'Cửa hàng chuẩn bị ngay',
      '預計約 15-20 分鐘後可取餐': 'Dự kiến nhận sau 15–20 phút', '或選擇指定時間': 'Hoặc chọn giờ nhận',
      '每 15 分鐘為一時段': 'Mỗi khung giờ cách nhau 15 phút', '本日營業時間已結束，請選擇明日或其他日期': 'Đã hết giờ hôm nay. Hãy chọn ngày khác.',
      '店家目前暫停接單中': 'Cửa hàng tạm ngừng nhận đơn', '目前門市暫不接受新訂單，敬請見諒！': 'Cửa hàng hiện chưa nhận đơn mới.',
      '確定': 'Đồng ý', '載入中...': 'Đang tải...',
      '用餐方式': 'Hình thức dùng bữa', '外帶自取': 'Mang đi', '店內用餐': 'Tại bàn', '用餐桌號': 'Bàn phục vụ',
      '必填\n                                    (送餐依據)': 'Bắt buộc', '取餐時間': 'Giờ nhận món', '點餐時間': 'Giờ đặt món',
      '其他要求': 'Ghi chú đơn hàng', '購物車': 'Giỏ hàng', '總計': 'Tổng cộng', '確認下單': 'Xác nhận đặt món',
      '請先選擇餐點': 'Hãy chọn món', '前往結帳': 'Đến thanh toán', '客製化': 'Tùy chọn', '加入購物車': 'Thêm vào giỏ',
      '取消': 'Hủy', '確認': 'Xác nhận', '確認時間': 'Xác nhận giờ', '立即取餐': 'Nhận sớm nhất', '預約取餐': 'Hẹn giờ nhận',
      '選擇取餐時間': 'Chọn giờ nhận món', '請選擇取餐時間': 'Chọn giờ nhận món', '備註': 'Ghi chú', '售完': 'Hết món',
      '口味選擇': 'Tùy chọn chung', '客製化設定': 'Tùy chọn đã chọn', '編輯': 'Sửa', '刪除': 'Xóa', '關閉': 'Đóng', '小計': 'Tạm tính', '提醒': 'Thông báo'
    };
    if (language() !== 'vi') return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement.closest('script,style,.item-name,.choice-name,.custom-label,#unified-option-modal,#cart-summary,#staff-table-bar,#staff-cart-header,#staff-cashier-btn,#staff-cashier-modal')) continue;
      if (node.parentElement.closest('#catalog-sections .section-title') && !node.parentElement.closest('#sec-order-option')) continue;
      const value = node.textContent.trim();
      if (dictionary[value]) node.textContent = dictionary[value];
    }
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

      mountCounterLayout();

      picker.addEventListener('change', () => {
        if (picker.value && dineInAllowed() && window.currentDiningOption !== 'dine_in') {
          setCustomerDiningOption('dine_in');
        }
        describeSelection();
        saveDraft();
      });

      const baseUpdateTotal = window.updateTotal;
      if (typeof baseUpdateTotal === 'function') {
        window.updateTotal = function () {
          const total = baseUpdateTotal.apply(this, arguments);
          refreshCatalog();
          renderStaffCart(total);
          return total;
        };
      }

      const baseFooterState = window.updateFooterButtonState;
      window.updateFooterButtonState = function () {
        baseFooterState?.apply(this, arguments);
        const quantity = Object.values(window.cart || {}).reduce((sum, q) => sum + Number(q || 0), 0);
        syncSubmitLabel(quantity, Number(document.getElementById('desktop-total-price')?.textContent) || 0);
      };

      const baseSetDining = window.setCustomerDiningOption;
      if (typeof baseSetDining === 'function') {
        window.setCustomerDiningOption = opt => {
          const targetOpt = dineInAllowed() ? opt : 'takeaway';
          baseSetDining(targetOpt);
          const tableGroup = document.getElementById('dinein-table-input-group');
          if (tableGroup) tableGroup.style.display = dineInAllowed() ? 'inline-flex' : 'none';
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
              control.dispatchEvent(new Event('change', { bubbles: true }));
              const container = control.closest('.flavor-option-container');
              for (const sub of container?.querySelectorAll('.sub-opt-chk') || []) sub.checked = !!choice?.subOptions?.some(item => item.id === (sub.dataset.subId || sub.value));
            }
          }
          reconcileCartOptions();
          for (const key of Object.keys(cart)) { const { catSlug, origName } = parseCartKey(key); updateQty(catSlug, origName, 0); }
        }
      } catch (_) {}

      initialized = true;
      updateTotal();
      describeSelection();
      translate();

      let queued = false;
      new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; translate(); saveDraft(); });
      }).observe(document.getElementById('page-body-content'), { childList: true, subtree: true });
      document.addEventListener('input', saveDraft);
      window.addEventListener('pagehide', saveDraft);
    } catch (error) {
      const panel = document.createElement('p'); panel.id = 'staff-access-error'; panel.setAttribute('role', 'alert');
      panel.textContent = text('無法開啟員工點餐。請確認店家已啟用此功能，再重新開啟。', 'Không mở được Staff Order. Kiểm tra tính năng đã bật và mở lại.');
      replaceNodeChildren(document.body, panel);
      console.warn('[StaffOrder]', error);
    }
  }

  async function submit() {
    if (!ready()) return;
    if (!Object.values(cart).some(q => q > 0)) {
      return message(text('請先選擇餐點。', 'Hãy chọn món.'), { toast: true, type: 'warning' });
    }
    const dining = dineInAllowed() && window.currentDiningOption === 'dine_in' ? 'dine_in' : 'takeaway';
    const chosen = dining === 'dine_in' ? tables.find(row => row.id === select().value) : null;
    if (dining === 'dine_in' && !chosen) {
      const bar = document.getElementById('staff-table-bar');
      if (bar) {
        bar.classList.remove('staff-attention-pulse');
        void bar.offsetWidth;
        bar.classList.add('staff-attention-pulse');
        bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      document.querySelector('[data-staff-table]')?.focus();
      return message(text('請選擇桌號。', 'Hãy chọn bàn.'), { toast: true, type: 'warning' });
    }
    const before = tableContext();
    closeCashierModal();
    saveDraft(); busy = true; window.isSubmitting = true;
    const cashierBtn = document.getElementById('staff-cashier-btn');
    if (cashierBtn) cashierBtn.disabled = true;
    const buttons = getAllSubmitButtons();
    buttons.forEach(button => {
      button.disabled = true;
      const span = button.querySelector('span') || button;
      span.textContent = text('送出中...', 'Đang gửi...');
    });
    select().disabled = true;
    document.getElementById('page-body-content').inert = true;
    try {
      const retry = JSON.parse(sessionStorage.getItem(storageKey('pending')) || 'null');
      const useScheduled = dining === 'takeaway' && scheduledPickupAllowed();
      if (useScheduled && typeof window.refreshPickupTimeIfStale === 'function') {
        window.refreshPickupTimeIfStale();
      }
      const draftSignature = JSON.stringify({
        dining, table: dining === 'dine_in' ? chosen?.id : undefined,
        items: DetailCheckout.items(), groups: DetailCheckout.selections(),
        note: document.getElementById('note').value.trim(), total: updateTotal(),
        date: useScheduled ? document.getElementById('pickup-date')?.value : undefined,
        time: useScheduled ? document.getElementById('pickup-time')?.value : undefined
      });
      const replay = retry?.draftSignature === draftSignature;
      if (!replay && dining === 'dine_in') await refreshTables();
      if (!replay && dining === 'dine_in' && before !== tableContext()) {
        sessionStorage.removeItem(storageKey('pending'));
        return message(text('桌位訂單已變更，請確認後再次送出。', 'Đơn tại bàn đã thay đổi. Kiểm tra lại rồi gửi.'), { toast: true, type: 'warning' });
      }
      const table = dining === 'dine_in' ? tables.find(row => row.id === chosen?.id) : null;
      const append = dining === 'dine_in' && !!table?.active_order_key;
      if (!capabilities.capabilities[append ? 'append' : 'create']) throw new Error('FEATURE_DISABLED');
      const payload = {
        detailVersion: 1, diningOption: dining, tableId: dining === 'dine_in' ? table.id : undefined,
        expectedRevision: append ? table.active_revision : undefined,
        items: DetailCheckout.items(), orderSelections: DetailCheckout.selections(), total: updateTotal(),
        note: document.getElementById('note').value.trim()
      };
      if (useScheduled) {
        const date = document.getElementById('pickup-date')?.value;
        const time = document.getElementById('pickup-time')?.value;
        if (!date || !time) return message(text('請選擇取餐時間。', 'Hãy chọn giờ nhận món.'), { toast: true, type: 'warning' });
        payload.pickupTime = `${date} ${time}`;
      }
      const endpoint = append ? `/api/staff/orders/${encodeURIComponent(table.active_order_key)}/rounds` : '/api/staff/orders';
      payload.requestId = createStaffUuid();
      const operation = replay ? retry : { endpoint, payload, draftSignature };
      sessionStorage.setItem(storageKey('pending'), JSON.stringify(operation));
      const result = await api(operation.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation.payload) });
      sessionStorage.removeItem(storageKey('pending')); sessionStorage.removeItem(storageKey('draft'));
      cart = {}; window.cart = cart; customizeData = {}; window.customizeData = customizeData;
      window.bundleCartData = {}; comboDrinkData = {}; window.comboDrinkData = comboDrinkData;
      document.getElementById('note').value = '';
      noteOpen = false;
      if (typeof window.resetPickupTimeToDefault === 'function') {
        window.resetPickupTimeToDefault();
      }
      renderDynamicCatalog({ resetOrderOptions: true }); updateTotal();
      await refreshTables().catch(() => {}); select().value = '';
      renderTableBar();
      message(text(`已送出 ${OrderCode.format(result.displayKey || result.orderId)}。`, `Đã gửi đơn ${OrderCode.format(result.displayKey || result.orderId)}.`), { toast: true, type: 'success' });
      if (parent !== window) parent.postMessage({
        type: 'STAFF_ORDER_SUBMITTED', orderKey: result.orderKey || result.key,
        displayKey: result.displayKey, diningOption: dining, roundCount: result.roundCount
      }, location.origin);
    } catch (error) {
      if (error.status && error.status < 500) sessionStorage.removeItem(storageKey('pending'));
      if (error.status === 409) {
        await refreshTables().catch(() => {});
        await fetchMenu().catch(() => {});
        message(text('訂單或價格已變更，請檢查購物車後重試。', 'Đơn hoặc giá đã thay đổi. Kiểm tra giỏ hàng rồi gửi lại.'), { toast: true, type: 'error' });
      } else message(text('未能確認送出結果。購物車已保留，請重試。', 'Chưa xác nhận được kết quả gửi. Giỏ hàng được giữ lại, hãy thử lại.'), { toast: true, type: 'error' });
    } finally {
      busy = false; window.isSubmitting = false; select().disabled = false;
      document.getElementById('page-body-content').inert = false;
      buttons.forEach(button => button.disabled = false); updateFooterButtonState(); renderStaffCart(updateTotal()); saveDraft();
    }
  }

  // Keep table occupancy fresh: Live Order may settle/close a table while this
  // view stays mounted (embedded iframe or a long-lived standalone tab).
  let tableSync = null;
  function syncTables() {
    if (!ready() || tableSync) return tableSync;
    tableSync = refreshTables()
      .catch(error => console.warn('[StaffOrder] table sync failed', error))
      .finally(() => { tableSync = null; });
    return tableSync;
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'STAFF_TABLES_REFRESH') syncTables();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncTables();
      if (typeof window.refreshPickupTimeIfStale === 'function') window.refreshPickupTimeIfStale();
    }
  });
  window.addEventListener('focus', () => {
    syncTables();
    if (typeof window.refreshPickupTimeIfStale === 'function') window.refreshPickupTimeIfStale();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') syncTables();
  }, 15000);

  return { start, submit, ready, syncTables, renderCatalog, openCashierModal, closeCashierModal };
})();
