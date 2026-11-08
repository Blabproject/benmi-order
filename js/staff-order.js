/* Staff Counter POS adapter for the shared LIFF menu. */
window.StaffOrder = (() => {
  if (!window.isStaffOrderMode) return null;
  let capabilities = null, tables = [], busy = false, initialized = false, activeTabId = '', noteOpen = false;
  const language = () => document.documentElement.lang;
  const text = (zh, vi) => language() === 'vi' ? vi : zh;
  const tenant = () => getTenantIdFromUrl();
  const storageKey = suffix => `staff_liff_${suffix}:${tenant()}`;
  const select = () => document.getElementById('dinein-table-number');
  const status = () => document.getElementById('staff-order-status');
  const ready = () => initialized && !busy;
  const escapeHtmlStr = val => String(val ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const escapeJsArg = val => String(val ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  function message(value) {
    const el = status();
    if (el) el.textContent = value;
  }

  async function api(path, options) {
    const response = await fetch(`${WORKER_BASE}${path}${path.includes('?') ? '&' : '?'}tenant_id=${encodeURIComponent(tenant())}`, {
      ...options, signal: AbortSignal.timeout(20000)
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw Object.assign(new Error(data.error || 'REQUEST_FAILED'), { status: response.status });
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
    const table = tables.find(row => row.id === select()?.value);
    return table?.active_order_key ? `${table.id}:${table.active_order_key}:${table.active_revision}` : `${table?.id || ''}:new`;
  }

  function syncCartHeader() {
    const targetEl = document.getElementById('staff-cart-target');
    const roundEl = document.getElementById('staff-cart-round');
    if (!targetEl || !roundEl) return;
    const isTakeaway = !dineInAllowed() || window.currentDiningOption === 'takeaway';
    if (isTakeaway) {
      targetEl.textContent = text('外帶自取', 'Mang đi');
      roundEl.hidden = true;
      roundEl.textContent = '';
      return;
    }
    const table = tables.find(row => row.id === select()?.value);
    if (!table) {
      targetEl.textContent = text('店內用餐（請選桌）', 'Tại bàn (Chọn bàn)');
    } else {
      const label = table.label || '';
      const hasPrefix = /^(table|bàn|桌|桌號)\b/i.test(label);
      targetEl.textContent = hasPrefix ? label : `${text('桌號', 'Bàn')} ${label}`;
    }
    if (table?.active_order_key) {
      roundEl.hidden = false;
      roundEl.textContent = `#${table.active_display_key || table.active_order_id} · ${text('加點', 'Gọi thêm')}`;
    } else {
      roundEl.hidden = true;
      roundEl.textContent = '';
    }
  }

  function renderTableBar() {
    const bar = document.getElementById('staff-table-bar');
    const chipsWrap = document.getElementById('staff-table-chips');
    const legendEl = document.getElementById('staff-bar-legend');
    const tableGroup = document.getElementById('dinein-table-input-group');
    if (!bar || !chipsWrap) return;

    const allowDine = dineInAllowed();
    const isTakeaway = !allowDine || window.currentDiningOption === 'takeaway';
    const selectedTableId = select()?.value || '';

    let html = `<button type="button" class="staff-chip ${isTakeaway ? 'on' : ''}" aria-pressed="${isTakeaway}" data-staff-chip="takeaway">${text('外帶', 'Mang đi')}</button>`;
    if (allowDine) {
      for (const row of tables) {
        const isOn = !isTakeaway && selectedTableId === row.id;
        const dot = row.active_order_key ? `<span class="staff-dot-occupied" title="${text('使用中', 'Đang phục vụ')}"></span>` : '';
        html += `<button type="button" class="staff-chip ${isOn ? 'on' : ''}" aria-pressed="${isOn}" data-staff-table="${escapeHtmlStr(row.id)}">${escapeHtmlStr(row.label)}${dot}</button>`;
      }
    }
    chipsWrap.innerHTML = html;

    chipsWrap.querySelector('[data-staff-chip="takeaway"]')?.addEventListener('click', () => {
      if (select()) select().value = '';
      setCustomerDiningOption('takeaway');
      renderTableBar();
      describeSelection();
      saveDraft();
    });

    chipsWrap.querySelectorAll('[data-staff-table]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tblId = btn.getAttribute('data-staff-table') || '';
        if (select()) select().value = tblId;
        setCustomerDiningOption('dine_in');
        renderTableBar();
        describeSelection();
        saveDraft();
      });
    });

    if (tableGroup) {
      tableGroup.style.display = allowDine ? 'inline-flex' : 'none';
    }
    if (legendEl) {
      legendEl.style.display = allowDine && tables.length > 0 ? 'inline-flex' : 'none';
      legendEl.innerHTML = `<span class="staff-dot-occupied"></span><span>${text('用餐中', 'Đang có khách')}</span>`;
    }
    syncCartHeader();
  }

  function describeSelection() {
    syncCartHeader();
    renderTableBar();
    if (!dineInAllowed() || window.currentDiningOption === 'takeaway') {
      return message(scheduledPickupAllowed()
        ? text('外帶點餐將建立新訂單。', 'Đơn mang đi sẽ tạo đơn mới.')
        : text('外帶現場排單將建立新訂單。', 'Đơn mang đi lấy ngay sẽ tạo đơn mới.'));
    }
    if (!tables.length) return message(text('尚未設定桌號，請先在設定中新增桌號。', 'Chưa cấu hình bàn. Hãy thêm bàn trong Cài đặt.'));
    const table = tables.find(row => row.id === select()?.value);
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

  function setStaffTab(sectionId) {
    const container = document.getElementById('catalog-sections');
    const nav = document.getElementById('main-nav');
    if (!container || !nav) return;
    const sections = Array.from(container.querySelectorAll(':scope > .section-container'));
    if (!sections.length) return;
    const targetSec = sections.find(sec => sec.id === sectionId) || sections[0];
    activeTabId = targetSec.id;
    sections.forEach(sec => {
      sec.classList.toggle('staff-tab-hidden', sec.id !== activeTabId);
    });
    nav.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-staff-sec') === activeTabId);
    });
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

  function syncTileBadges() {
    const bData = window.bootstrapData || (typeof bootstrapData !== 'undefined' ? bootstrapData : null);
    const cartObj = window.cart || (typeof cart !== 'undefined' ? cart : {}) || {};
    if (!bData?.catalog) return;

    bData.catalog.forEach(cat => {
      (cat.items || []).forEach(item => {
        const card = document.getElementById(`item-${cat.slug}-${item.name}`);
        if (!card) return;
        const key = `${cat.slug}_${item.name}`;
        const qty = Number(cartObj[key] || 0);
        card.classList.toggle('staff-tile-has', qty > 0);

        const title = card.querySelector('.card-title');
        const badges = title?.querySelectorAll('.badge');
        if (badges?.length) {
          const row = document.createElement('div');
          row.className = 'staff-tile-badges';
          for (const badge of badges) { badge.title = badge.textContent.trim(); row.appendChild(badge); }
          title.parentElement.after(row);
        }

        let qtyBadge = card.querySelector('.staff-tile-qty');
        if (qty > 0) {
          if (!qtyBadge) {
            qtyBadge = document.createElement('span');
            qtyBadge.className = 'staff-tile-qty';
            card.appendChild(qtyBadge);
          }
          qtyBadge.textContent = `×${qty}`;
        } else if (qtyBadge) {
          qtyBadge.remove();
        }

        const footer = card.querySelector('.card-footer');
        if (footer && !item.isOutOfStock) {
          let reqBadge = footer.querySelector('.staff-tile-req');
          if (itemHasRequiredOptions(cat.slug, item.name)) {
            if (!reqBadge) {
              reqBadge = document.createElement('span');
              reqBadge.className = 'staff-tile-req';
              footer.appendChild(reqBadge);
            }
            reqBadge.textContent = text('必選', 'Bắt buộc');
          } else if (reqBadge) {
            reqBadge.remove();
          }
        }
      });
    });
  }

  function syncCatalogTabs() {
    const container = document.getElementById('catalog-sections');
    const nav = document.getElementById('main-nav');
    const bData = window.bootstrapData || (typeof bootstrapData !== 'undefined' ? bootstrapData : null);
    if (!container || !nav || !bData?.catalog) return;

    const orderOptSec = document.getElementById('sec-order-option');
    if (orderOptSec && orderOptSec.parentElement === container && container.firstElementChild !== orderOptSec) {
      container.prepend(orderOptSec);
    }

    const tabs = [];
    if (orderOptSec) {
      tabs.push({ id: 'sec-order-option', label: text('口味選擇', 'Tùy chọn chung') });
    }
    bData.catalog.forEach(cat => {
      const secId = `sec-${cat.slug}`;
      if (document.getElementById(secId)) {
        const navTitle = (cat.shortName && cat.name && cat.name.includes(cat.shortName)) ? cat.shortName : cat.name;
        tabs.push({ id: secId, label: navTitle });
      }
    });

    nav.innerHTML = tabs.map(t =>
      `<div class="nav-btn" data-staff-sec="${escapeHtmlStr(t.id)}">${escapeHtmlStr(t.label)}</div>`
    ).join('');

    nav.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setStaffTab(btn.getAttribute('data-staff-sec'));
      });
    });

    const firstFoodTab = tabs.find(t => t.id !== 'sec-order-option') || tabs[0];
    const defaultTabId = (activeTabId && tabs.some(t => t.id === activeTabId)) ? activeTabId : (firstFoodTab?.id || '');
    if (defaultTabId) setStaffTab(defaultTabId);
    syncTileBadges();
  }

  function summarizePortion(key, portionIdx, hasBundleGroups) {
    const cData = window.customizeData || (typeof customizeData !== 'undefined' ? customizeData : {}) || {};
    const getPrice = window.getModifierPrice || (typeof getModifierPrice === 'function' ? getModifierPrice : (() => 0));
    const parts = [];

    if (hasBundleGroups && window.bundleCartData?.[key]?.[portionIdx]) {
      const p = window.bundleCartData[key][portionIdx];
      (p.groups || []).forEach(g => {
        const itemsStr = (g.items || []).map(item =>
          `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}${(item.modifiers || []).length ? ` (${item.modifiers.map(m => m.name).join('、')})` : ''}`
        ).join('、');
        if (itemsStr) parts.push(itemsStr);
      });
    }

    const c = cData[key]?.[portionIdx];
    if (c) {
      if (c.selectedDetails && Object.keys(c.selectedDetails).length > 0) {
        Object.values(c.selectedDetails).forEach(detail => {
          if (!detail) return;
          const sub = detail.subOption || c.subOptions?.[detail.id] || c.subOptions?.[detail.name];
          const price = Number(detail.price || 0) + Number(sub?.price || 0);
          const label = `${detail.name || detail.id}${sub ? ` (${sub.name})` : ''}`;
          parts.push(price > 0 ? `${label} +$${price}` : label);
        });
      } else if (c.single) {
        for (const s in c.single) {
          const rawVal = c.single[s];
          const val = (typeof resolveOptionDisplayName === 'function') ? resolveOptionDisplayName(rawVal) : rawVal;
          if (val && val !== '不辣' && val !== '不需要') {
            const addP = getPrice(val) || getPrice(rawVal);
            const label = addP > 0 ? `${val} +$${addP}` : val;
            if (!parts.includes(label)) parts.push(label);
          }
        }
      }
      if ((!c.selectedDetails || Object.keys(c.selectedDetails).length === 0) && c.multiple) {
        for (const topName in c.multiple) {
          if (c.multiple[topName]) {
            const topPrice = getPrice(topName);
            parts.push(topPrice > 0 ? `${topName} +$${topPrice}` : topName);
          }
        }
      }
      if (c.note && c.note.trim()) parts.push(c.note.trim());
    }

    return parts.join(' · ');
  }

  function renderStaffCart(computedTotal) {
    const summaryContainer = document.getElementById('cart-summary');
    const bData = window.bootstrapData || (typeof bootstrapData !== 'undefined' ? bootstrapData : null);
    const cartObj = window.cart || (typeof cart !== 'undefined' ? cart : {}) || {};
    const cData = window.customizeData || (typeof customizeData !== 'undefined' ? customizeData : {}) || {};
    const getPrice = window.getModifierPrice || (typeof getModifierPrice === 'function' ? getModifierPrice : (() => 0));
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (k => ({ origName: k, displayName: k })));

    let totalQty = 0;
    const linesHTML = [];
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
        const safeCat = escapeJsArg(catSlug);
        const safeName = escapeJsArg(itemName);

        let portionsHTML = '';
        if (hasOpts) {
          portionsHTML = `<div class="staff-cart-portions"><span class="staff-cart-opt-link">${text('修改選項', 'Sửa tùy chọn')}</span></div>`;
        }

        const lineClick = hasOpts ? ` onclick="editCartPortion('${safeCat}','${safeName}',${qty - 1})"` : '';
        const lineClass = hasOpts ? 'staff-cart-line staff-cart-has-opts' : 'staff-cart-line';

        linesHTML.push(`
          <div class="${lineClass}"${lineClick}>
            <div class="staff-cart-line-top">
              <div class="staff-cart-line-info">
                <div class="staff-cart-name">${escapeHtmlStr(displayName)}</div>
                <div class="staff-cart-price">$${lineTotal}</div>
                ${portionsHTML}
              </div>
              <div class="staff-cart-stepper" onclick="event.stopPropagation()">
                <button type="button" class="staff-step-btn" onclick="event.stopPropagation();updateQty('${safeCat}','${safeName}',-1)">−</button>
                <span class="staff-step-qty">${qty}</span>
                <button type="button" class="staff-step-btn" onclick="event.stopPropagation();updateQty('${safeCat}','${safeName}',1)">+</button>
              </div>
            </div>
          </div>
        `);
      });

      const catMeta = categoryMetaMap[slug] || {};
      const bundleRes = typeof calculateCategoryBundleSubtotal === 'function'
        ? calculateCategoryBundleSubtotal(catMeta.pricingRules, catItems.filter(i => !i.isOutOfStock))
        : { discountAmount: 0 };
      if (bundleRes.discountAmount > 0) {
        linesHTML.push(`
          <div class="staff-cart-line" style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#059669;">
            <span>${escapeHtmlStr((catMeta.name || '').split(' ')[0] || text('組合優惠', 'Ưu đãi combo'))}</span>
            <span>-$${bundleRes.discountAmount}</span>
          </div>
        `);
      }
    }

    if (totalQty > 0) {
      const optionRows = [];
      for (const group of bData?.customizations || []) {
        const choices = Array.from(document.getElementsByName(`opt-${group.key}`)).filter(input => input.checked);
        if (!choices.length) continue;
        const values = choices.map(input => {
          const subs = Array.from(input.closest('.flavor-option-container')?.querySelectorAll('.sub-opt-chk:checked') || []);
          const label = input.value + (subs.length ? ` (${subs.map(sub => sub.value).join(language() === 'vi' ? ', ' : '、')})` : '');
          const extra = [input, ...subs].reduce((sum, control) => sum + (Number(control.dataset.price) || 0), 0);
          return `<div class="staff-cart-order-choice"><span>${escapeHtmlStr(label)}</span>${extra ? `<span class="staff-cart-order-extra">+$${extra}</span>` : ''}</div>`;
        });
        optionRows.push(`<div class="staff-cart-order-group"><div class="staff-cart-order-label">${escapeHtmlStr(group.title)}</div>${values.join('')}</div>`);
      }
      if (optionRows.length) linesHTML.push(`<div class="staff-cart-order-options">${optionRows.join('')}</div>`);
    }

    if (summaryContainer) {
      if (linesHTML.length === 0) {
        summaryContainer.innerHTML = `<div class="staff-cart-empty">${text('點擊左側餐點加入購物車', 'Chạm món bên trái để thêm')}</div>`;
      } else {
        summaryContainer.innerHTML = linesHTML.join('');
      }
    }

    const countEl = document.getElementById('staff-cart-count');
    if (countEl) countEl.textContent = `${totalQty} ${text('份', 'phần')}`;

    const noteWrap = document.getElementById('staff-note-wrap');
    const noteToggle = document.getElementById('staff-note-toggle');
    const noteInput = document.getElementById('note');
    if (noteWrap && noteToggle && noteInput) {
      const hasNote = Boolean(noteInput.value && noteInput.value.trim());
      noteWrap.classList.toggle('staff-note-open', noteOpen || hasNote);
      noteToggle.textContent = (noteOpen || hasNote) ? text('備註', 'Ghi chú') : text('+ 備註', '+ Ghi chú');
      noteInput.placeholder = text('備註（少冰、切半、先上...）', 'Ghi chú cho bếp...');
    }

    syncSubmitLabel(totalQty, computedTotal);
  }

  function syncSubmitLabel(totalQty, computedTotal) {
    const deskBtn = document.getElementById('btn-desktop-submit');
    if (deskBtn) {
      const span = deskBtn.querySelector('span') || deskBtn;
      span.textContent = totalQty > 0
        ? `${text('送出訂單', 'Gửi bếp')} · $${computedTotal}`
        : text('選擇餐點', 'Chọn món');
    }
  }

  function mountCounterLayout() {
    const pageBody = document.getElementById('page-body-content');
    const mainLayout = document.querySelector('.container.main-order-layout');
    const leftCol = document.querySelector('.menu-catalog-col');
    const catalogWrapper = document.getElementById('catalog-sections-wrapper');
    const nav = document.getElementById('main-nav');
    const checkoutSec = document.getElementById('sec-checkout');
    const cartSummary = document.getElementById('cart-summary');
    const tableGroup = document.getElementById('dinein-table-input-group');
    const noteInput = document.getElementById('note');
    const submitWrap = document.querySelector('.desktop-sidebar-submit-wrap');
    const totalRow = document.querySelector('.desktop-sidebar-total-row');

    let bar = document.getElementById('staff-table-bar');
    if (!bar && pageBody && mainLayout) {
      bar = document.createElement('div');
      bar.id = 'staff-table-bar';
      bar.innerHTML = `<div class="staff-table-chips" id="staff-table-chips"></div><div class="staff-bar-legend" id="staff-bar-legend"></div>`;
      if (tableGroup) {
        bar.insertBefore(tableGroup, bar.querySelector('#staff-bar-legend'));
      }
    }
    if (bar && leftCol && bar.parentElement !== leftCol) {
      leftCol.insertBefore(bar, leftCol.firstChild);
    }

    if (leftCol && nav && catalogWrapper && nav.parentElement !== leftCol) {
      leftCol.insertBefore(nav, catalogWrapper);
    }

    if (checkoutSec && cartSummary && !document.getElementById('staff-cart-header')) {
      const header = document.createElement('div');
      header.id = 'staff-cart-header';
      header.innerHTML = `<span id="staff-cart-target"></span><span id="staff-cart-round" hidden></span>`;
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
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.id = 'staff-note-toggle';
      toggle.textContent = text('+ 備註', '+ Ghi chú');
      toggle.addEventListener('click', () => {
        noteOpen = !noteOpen;
        wrap.classList.toggle('staff-note-open', noteOpen || Boolean(noteInput.value.trim()));
        if (noteOpen) noteInput.focus();
      });
      wrap.appendChild(toggle);
      wrap.appendChild(noteInput);
      noteGroup.replaceWith(wrap);
    }

    if (totalRow && !document.getElementById('staff-cart-count')) {
      const countSpan = document.createElement('span');
      countSpan.id = 'staff-cart-count';
      countSpan.textContent = `0 ${text('份', 'phần')}`;
      totalRow.prepend(countSpan);
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
      if (node.parentElement.closest('script,style,.item-name,.choice-name,.custom-label,#unified-option-modal,#cart-summary,#staff-table-bar,#staff-cart-header')) continue;
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

      const baseRenderCatalog = window.renderDynamicCatalog;
      if (typeof baseRenderCatalog === 'function') {
        window.renderDynamicCatalog = function () {
          const res = baseRenderCatalog.apply(this, arguments);
          syncCatalogTabs();
          return res;
        };
      }

      const baseUpdateTotal = window.updateTotal;
      if (typeof baseUpdateTotal === 'function') {
        window.updateTotal = function () {
          const total = baseUpdateTotal.apply(this, arguments);
          syncTileBadges();
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

      window.handleItemCardClick = function (catSlug, itemName, event) {
        if (event && (event.target.closest('.qty-control') || event.target.closest('.btn-qty'))) return;
        const key = `${catSlug}_${itemName}`;
        if (typeof isItemOutOfStock === 'function' && isItemOutOfStock(key)) return;
        updateQty(catSlug, itemName, 1);
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
      syncCatalogTabs();
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
      document.body.replaceChildren(panel);
      console.warn('[StaffOrder]', error);
    }
  }

  async function submit() {
    if (!ready()) return;
    if (!Object.values(cart).some(q => q > 0)) return message(text('請先選擇餐點。', 'Hãy chọn món.'));
    const dining = dineInAllowed() && window.currentDiningOption === 'dine_in' ? 'dine_in' : 'takeaway';
    const chosen = dining === 'dine_in' ? tables.find(row => row.id === select().value) : null;
    if (dining === 'dine_in' && !chosen) { document.querySelector('[data-staff-table]')?.focus(); return message(text('請選擇桌號。', 'Hãy chọn bàn.')); }
    const before = tableContext();
    saveDraft(); busy = true; window.isSubmitting = true;
    const buttons = getAllSubmitButtons(); buttons.forEach(button => button.disabled = true);
    select().disabled = true;
    document.getElementById('page-body-content').inert = true;
    try {
      const retry = JSON.parse(sessionStorage.getItem(storageKey('pending')) || 'null');
      const useScheduled = dining === 'takeaway' && scheduledPickupAllowed();
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
        return message(text('桌位訂單已變更，請確認後再次送出。', 'Đơn tại bàn đã thay đổi. Kiểm tra lại rồi gửi.'));
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
        if (!date || !time) return message(text('請選擇取餐時間。', 'Hãy chọn giờ nhận món.'));
        payload.pickupTime = `${date} ${time}`;
      }
      const endpoint = append ? `/api/staff/orders/${encodeURIComponent(table.active_order_key)}/rounds` : '/api/staff/orders';
      payload.requestId = crypto.randomUUID();
      const operation = replay ? retry : { endpoint, payload, draftSignature };
      sessionStorage.setItem(storageKey('pending'), JSON.stringify(operation));
      const result = await api(operation.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation.payload) });
      sessionStorage.removeItem(storageKey('pending')); sessionStorage.removeItem(storageKey('draft'));
      cart = {}; window.cart = cart; customizeData = {}; window.customizeData = customizeData;
      window.bundleCartData = {}; comboDrinkData = {}; window.comboDrinkData = comboDrinkData;
      document.getElementById('note').value = '';
      noteOpen = false;
      renderDynamicCatalog(); updateTotal();
      await refreshTables().catch(() => {}); select().value = '';
      renderTableBar();
      message(text(`已送出 #${result.displayKey || result.orderId}。`, `Đã gửi đơn #${result.displayKey || result.orderId}.`));
      if (parent !== window) parent.postMessage({
        type: 'STAFF_ORDER_SUBMITTED', orderKey: result.orderKey || result.key,
        displayKey: result.displayKey, diningOption: dining, roundCount: result.roundCount
      }, location.origin);
    } catch (error) {
      if (error.status && error.status < 500) sessionStorage.removeItem(storageKey('pending'));
      if (error.status === 409) {
        await refreshTables().catch(() => {});
        await fetchMenu().catch(() => {});
        message(text('訂單或價格已變更，請檢查購物車後重試。', 'Đơn hoặc giá đã thay đổi. Kiểm tra giỏ hàng rồi gửi lại.'));
      } else message(text('未能確認送出結果。購物車已保留，請重試。', 'Chưa xác nhận được kết quả gửi. Giỏ hàng được giữ lại, hãy thử lại.'));
    } finally {
      busy = false; window.isSubmitting = false; select().disabled = false;
      document.getElementById('page-body-content').inert = false;
      buttons.forEach(button => button.disabled = false); updateFooterButtonState(); renderStaffCart(updateTotal()); saveDraft();
    }
  }

  return { start, submit, ready };
})();
