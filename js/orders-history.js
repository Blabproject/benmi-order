// ==========================================
// Benmi POS - Module: Order History (30 Days)
// ==========================================

let lastHistoryOrders = [];
let lastHistoryTenantId = null;
let expandedHistoryDates = new Set();
let isHistoryStateInitialized = false;
let isHistoryLoading = false;
let historyLastFetchedAt = 0;
let historySearchQuery = "";
let historyFilterType = "all"; // 'all' | 'dine_in' | 'takeaway'
let currentRenderedDates = [];

function removeVietnameseDiacritics(str) {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function matchesHistorySearch(order, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  const qClean = removeVietnameseDiacritics(q);
  const qNoHash = q.replace(/^#/, "");

  // 1. Order Key / Number (e.g. B0906-T005, T005, #005, 005)
  const key = String(order.key || "").toLowerCase();
  const keyClean = key.replace(/^#/, "");
  if (key.includes(q) || keyClean.includes(qNoHash) || key.includes(qNoHash)) return true;

  // 2. Customer Name (Supports Vietnamese accented & unaccented)
  const cust = String(order.customer || order.customer_name || "").toLowerCase();
  if (cust.includes(q) || removeVietnameseDiacritics(cust).includes(qClean)) return true;

  // 3. Table Number (via helper or direct property)
  const table = (typeof getOrderTableNumber === "function" ? getOrderTableNumber(order) : String(order.tableNumber || order.table_number || "")).toLowerCase().trim();
  if (table && (table === q || table === qNoHash || table.includes(q))) return true;

  // 4. Phone Number
  const phone = String(order.phone || order.phoneNumber || "").toLowerCase();
  if (phone && phone.includes(q)) return true;

  // 5. Order Content / Dish Items (e.g. Bánh mì, Cà phê, Set 11)
  const content = String(order.content || "").toLowerCase();
  const summary = (typeof shortItems === "function" ? String(shortItems(order) || "") : "").toLowerCase();
  if (content.includes(q) || summary.includes(q) || removeVietnameseDiacritics(content).includes(qClean) || removeVietnameseDiacritics(summary).includes(qClean)) return true;

  // 6. Note
  const note = String(order.note || "").toLowerCase();
  if (note.includes(q) || removeVietnameseDiacritics(note).includes(qClean)) return true;

  return false;
}

function isOrderDineIn(order) {
  if (!order) return false;
  // 1. Explicit dining option field
  const opt = String(order.diningOption || order.dining_option || "").toLowerCase().trim();
  if (opt === "dine_in" || opt === "dinein" || opt === "in") return true;
  if (opt === "takeaway" || opt === "take_out" || opt === "out") return false;

  // 2. Table number presence strongly implies dine-in
  const table = (typeof getOrderTableNumber === "function" ? getOrderTableNumber(order) : String(order.tableNumber || order.table_number || "")).trim();
  if (table) return true;

  // 3. Order key prefix: D for dine-in, T for takeaway (e.g. B0906-D001 vs B0906-T005)
  const key = String(order.key || "").trim();
  if (/(?:^|-)D\d+/i.test(key)) return true;
  if (/(?:^|-)T\d+/i.test(key)) return false;

  // 4. Content indicators (Chinese & Vietnamese)
  const content = String(order.content || "");
  if (content.includes("內用") || content.includes("Tại chỗ") || content.includes("Ăn tại chỗ")) return true;
  if (content.includes("外帶") || content.includes("Mang đi") || content.includes("Mang về")) return false;

  // 5. Pickup time string indicators
  const time = String(order.time || "");
  if (time.includes("現場內用") || time.includes("內用") || time.includes("Tại chỗ")) return true;
  if (time.includes("外帶") || time.includes("Mang đi")) return false;

  return false;
}

function onHistorySearchInput(val) {
  historySearchQuery = (val || "").trim().toLowerCase();
  const clearBtn = document.getElementById("btn-history-search-clear");
  if (clearBtn) clearBtn.style.display = historySearchQuery ? "inline-flex" : "none";
  renderHistory(lastHistoryOrders);
}

function clearHistorySearch() {
  const input = document.getElementById("history-search-input");
  if (input) {
    input.value = "";
    input.focus();
  }
  onHistorySearchInput("");
}

function setHistoryFilter(type) {
  // Toggle off if already active (except if switching to all)
  if (historyFilterType === type && type !== "all") {
    historyFilterType = "all";
  } else {
    historyFilterType = type || "all";
  }
  document.querySelectorAll("#history-filter-group .history-filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-filter") === historyFilterType);
  });
  renderHistory(lastHistoryOrders);
}

function updateHistoryFilterVisibility() {
  const isSupported = typeof window.isDineInSupported === "function"
    ? window.isDineInSupported()
    : ((Array.isArray(window.currentTenantFeatures) && window.currentTenantFeatures.includes('dine_in')) && (window.allowDineIn !== false));
  
  const filterGroup = document.getElementById("history-filter-group");
  if (filterGroup) {
    filterGroup.style.display = isSupported ? "" : "none";
  }
  if (!isSupported && historyFilterType !== "all") {
    historyFilterType = "all";
  }
}

async function fetchHistoryOrders(force = false) {
  updateHistoryFilterVisibility();
  const tenantId = getTenantIdFromUrl();
  const now = Date.now();
  if (!force && lastHistoryTenantId === tenantId && lastHistoryOrders.length > 0 && (now - historyLastFetchedAt < 15000)) {
    renderHistory(lastHistoryOrders);
    return;
  }

  const container = document.getElementById("list-history");
  if (container && (lastHistoryOrders.length === 0 || lastHistoryTenantId !== tenantId)) {
    container.innerHTML = `<div style="text-align:center; padding: 22px; color:#999;" id="list-history-loading">${t('loading')}</div>`;
  }

  isHistoryLoading = true;
  try {
    const res = await fetch(`${WORKER_BASE}/api/orders/history-all?tenant_id=${tenantId}&_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        lastHistoryOrders = data;
        lastHistoryTenantId = tenantId;
        historyLastFetchedAt = Date.now();
      }
    }
  } catch (e) {
    console.error("[fetchHistoryOrders] Error:", e);
  } finally {
    isHistoryLoading = false;
  }

  // Fallback: If remote history-all is empty, merge finished orders from active session
  if ((!lastHistoryOrders || lastHistoryOrders.length === 0) && typeof currentOrders !== "undefined" && Array.isArray(currentOrders)) {
    const finished = currentOrders.filter(o => o && (o.status === "PICKED_UP" || o.status === "REJECTED" || o.status === "PAID"));
    if (finished.length > 0) {
      lastHistoryOrders = finished;
    }
  }

  renderHistory(lastHistoryOrders);
}

function getTaiwanTodayStr() {
  const nowTw = new Date(Date.now() + 8 * 3600000);
  const yyyy = nowTw.getUTCFullYear();
  const mm = String(nowTw.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nowTw.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function groupByDate(orders) {
  const map = new Map();
  orders.forEach(o => {
    let d = "Unknown";
    if (o.time && typeof o.time === "string" && o.time.match(/\d{4}-\d{2}-\d{2}/)) {
      const m = o.time.match(/\d{4}-\d{2}-\d{2}/);
      d = m[0];
    } else if (o.createdAt) {
      const dt = new Date(o.createdAt);
      const nowTaiwan = new Date(dt.getTime() + 8 * 3600000);
      const yyyy = nowTaiwan.getUTCFullYear();
      const mm = String(nowTaiwan.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(nowTaiwan.getUTCDate()).padStart(2, "0");
      d = `${yyyy}-${mm}-${dd}`;
    }
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(o);
  });
  return map;
}

function renderHistory(orders) {
  updateHistoryFilterVisibility();
  if (Array.isArray(orders)) {
    lastHistoryOrders = orders;
  }
  const allOrders = Array.isArray(lastHistoryOrders) ? lastHistoryOrders : [];
  const container = document.getElementById("list-history");
  if (!container) return;
  container.innerHTML = "";

  const todayStr = getTaiwanTodayStr();

  if (!allOrders || allOrders.length === 0) {
    container.innerHTML = `
      <div class="history-empty-state">
        <div class="history-empty-icon">${(typeof POS_SVG !== "undefined" && POS_SVG.inbox) || ""}</div>
        <div class="history-empty-title">${t('emptyHistory')}</div>
      </div>
    `;
    const summaryBadge = document.getElementById("history-total-summary-badge");
    if (summaryBadge) summaryBadge.innerText = `0 ${t('orderUnit')}`;
    return;
  }

  // Filter orders by dining option & search query
  let filteredOrders = allOrders;
  if (historyFilterType === "dine_in") {
    filteredOrders = filteredOrders.filter(o => isOrderDineIn(o));
  } else if (historyFilterType === "takeaway") {
    filteredOrders = filteredOrders.filter(o => !isOrderDineIn(o));
  }

  if (historySearchQuery) {
    filteredOrders = filteredOrders.filter(o => matchesHistorySearch(o, historySearchQuery));
  }

  const summaryBadge = document.getElementById("history-total-summary-badge");
  if (summaryBadge) {
    if (filteredOrders.length !== allOrders.length) {
      summaryBadge.innerText = `${filteredOrders.length} / ${allOrders.length} ${t('orderUnit')}`;
    } else {
      summaryBadge.innerText = `${allOrders.length} ${t('orderUnit')}`;
    }
  }

  if (filteredOrders.length === 0) {
    container.innerHTML = `
      <div class="history-empty-state">
        <div class="history-empty-icon">${(typeof POS_SVG !== "undefined" && POS_SVG.search) || ""}</div>
        <div class="history-empty-title">${t('historyNoSearchResults')}</div>
        <div class="history-empty-sub">${t('historyNoSearchResultsSub')}</div>
        <button type="button" class="btn btn-ghost history-clear-filter-btn" onclick="clearHistorySearch(); setHistoryFilter('all');">
          ${t('btnClearFilter')}
        </button>
      </div>
    `;
    return;
  }

  const grouped = groupByDate(filteredOrders);
  // Sort groups by date descending
  const sortedDates = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));
  currentRenderedDates = sortedDates;

  // Active filter or search automatically reveals results across all matching dates
  const isFilterActive = !!historySearchQuery || historyFilterType !== "all";

  // Default initialization: auto-expand the latest date group if neither filter nor search is active
  if (!isHistoryStateInitialized) {
    if (sortedDates.length > 0) {
      expandedHistoryDates = new Set([sortedDates[0]]);
    }
    isHistoryStateInitialized = true;
  }

  // Update "Expand All / Collapse All" toggle button state
  const isAllExpanded = sortedDates.length > 0 && sortedDates.every(d => isFilterActive || expandedHistoryDates.has(d));
  const toggleAllText = document.getElementById("btn-toggle-all-text");
  const toggleAllIcon = document.getElementById("btn-toggle-all-icon");
  if (toggleAllText) toggleAllText.innerText = isAllExpanded ? t('btnCollapseAll') : t('btnExpandAll');
  if (toggleAllIcon) {
    const folderIconSvg = (typeof POS_SVG !== "undefined")
      ? (isAllExpanded ? POS_SVG.folder : POS_SVG.folderOpen)
      : "";
    toggleAllIcon.innerHTML = folderIconSvg;
  }

  for (const date of sortedDates) {
    let items = grouped.get(date) || [];
    // Sort items: newest picked up at top (descending), fallback to newest created at top
    items.sort((a, b) => {
      const timeA = a.pickedUpAt || a.createdAt || 0;
      const timeB = b.pickedUpAt || b.createdAt || 0;
      return timeB - timeA;
    });

    const isToday = (date === todayStr);
    // Expand if searching/filtering OR explicitly expanded
    const isExpanded = isFilterActive ? (!expandedHistoryDates.has('collapsed_' + date)) : expandedHistoryDates.has(date);
    const dayTotal = items.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

    const groupEl = document.createElement("div");
    groupEl.className = "history-date-group";
    groupEl.id = `history-group-${date}`;

    const calendarSvg = (typeof POS_SVG !== "undefined" && POS_SVG.calendar) || "";

    // Header (Accordion Toggle)
    const header = document.createElement("div");
    header.className = `history-date-header ${isExpanded ? 'expanded' : ''}`;
    header.onclick = () => toggleHistoryDateGroup(date);
    header.innerHTML = `
      <div class="history-date-left">
        <div class="history-date-icon-box">${calendarSvg}</div>
        <span class="history-date-text">${escapeHtml(date)}</span>
        ${isToday ? `<span class="history-today-tag">${t('todayTag')}</span>` : ''}
      </div>
      <div class="history-date-right">
        <span class="badge" style="background:#f3f4f6; color:#374151; font-weight:800; font-size:var(--pos-text-meta);">${items.length} ${t('orderUnit')}</span>
        <span class="badge" style="background:rgba(0,185,0,0.1); color:var(--primary); font-weight:1000; font-size:var(--pos-text-meta);">$${dayTotal.toLocaleString()}</span>
        <svg class="history-chevron ${isExpanded ? 'open' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    `;
    groupEl.appendChild(header);

    // Body (Order Tiles)
    const body = document.createElement("div");
    body.className = "history-date-body";
    body.id = `history-body-${date}`;
    body.style.display = isExpanded ? "flex" : "none";

    items.forEach(order => {
      const tile = document.createElement("div");
      tile.className = "history-tile";
      tile.onclick = () => openReview(order.key);
      const isPickedUp = order.status === "PICKED_UP";
      const isPaid = order.status === "PAID";
      const isRejected = order.status === "REJECTED" || order.status === "FORCE_REJECT";
      let badge = "";
      if (isPaid) {
        badge = `<span class="badge done" style="background:#ede9fe; color:#6d28d9; border:1px solid #ddd6fe;">${t('badgePaid')}</span>`;
      } else if (isPickedUp) {
        badge = `<span class="badge done">${t('badgePicked')}</span>`;
      } else if (isRejected) {
        badge = `<span class="badge new" style="background:#fee2e2; color:#b91c1c;">${t('badgeRejected')}</span>`;
      } else {
        badge = `<span class="badge">${escapeHtml(order.status)}</span>`;
      }
      const totalFormatted = formatOrderTotal(order);
      const itemsSummary = (typeof shortItems === "function") ? shortItems(order) : (order.content || "");
      const isDineIn = typeof isOrderDineIn === "function" ? isOrderDineIn(order) : order.diningOption === "dine_in";
      const isElapsed = typeof isOrderElapsedMode === "function" ? isOrderElapsedMode(order) : isDineIn;

      const tableNum = typeof getOrderTableNumber === "function" ? getOrderTableNumber(order) : (order.tableNumber || "");
      const tableLabel = tableNum ? (currentLang === 'vi' ? ` · Bàn ${tableNum}` : ` · 桌號 ${tableNum}`) : "";

      const svgTakeaway = (typeof POS_SVG !== "undefined" && POS_SVG.takeaway) || "";
      const svgDineIn = (typeof POS_SVG !== "undefined" && POS_SVG.dineIn) || "";
      const svgClock = (typeof POS_SVG !== "undefined" && POS_SVG.clock) || "";
      const svgReceipt = (typeof POS_SVG !== "undefined" && POS_SVG.receipt) || "";

      const diningBadge = isDineIn
        ? `<span class="badge badge-dine-in" style="font-size:var(--pos-text-meta); padding:2px 6px; margin-left:4px;">${svgDineIn}${t('badgeDineIn')}${escapeHtml(tableLabel)}</span>`
        : `<span class="badge badge-takeaway" style="font-size:var(--pos-text-meta); padding:2px 6px; margin-left:4px;">${svgTakeaway}${t('badgeTakeaway')}</span>`;

      const roundCount = Number(order.round_count || order.roundCount) || 1;
      const appendBadge = (isDineIn && roundCount > 1)
        ? `<span class="badge badge-append" style="font-size:var(--pos-text-meta); padding:2px 6px; border-radius:4px; font-weight:800; white-space:nowrap; flex-shrink:0;">${t('badgeAppendRound', { n: roundCount })}</span>`
        : "";

      const isModified = (order.is_modified === 1 || order.isModified === true);
      const modifiedBadge = isModified
        ? `<span class="badge badge-modified" style="font-size:var(--pos-text-meta); padding:2px 6px; margin-left:4px;">${POS_SVG.modify || ''}${t('badgeModifiedOrder')}</span>`
        : "";

      const formattedTime = isElapsed
        ? (typeof formatOrderSubmissionTime === "function" ? formatOrderSubmissionTime(order) : formatPickupTimeDisplay(order.time))
        : formatPickupTimeDisplay(order.time, order.createdAt, order.content);

      const pickupDisplay = isDineIn
        ? `${t('dineInTimeLabel')}: ${formattedTime}`
        : `${t('pickupLabel')} ${formattedTime}`;

      tile.innerHTML = `
        <div class="history-tile-info">
          <div class="history-tile-top">
            <span class="history-tile-customer" title="${escapeHtml(order.customer || t('defaultCustomer'))}">${escapeHtml(order.customer || t('defaultCustomer'))}</span>
            <span class="history-tile-key">#${escapeHtml(order.displayKey || order.key)}</span>
            ${diningBadge}
            ${appendBadge}
            ${window.PaymentPOS ? PaymentPOS.badge(order) : ''}
            ${modifiedBadge}
            ${badge}
          </div>
          <div class="history-tile-meta-row">
            <span class="history-tile-meta">${svgClock}${escapeHtml(pickupDisplay)}</span>
            ${totalFormatted !== '-' ? `<span class="history-tile-price">${escapeHtml(totalFormatted)}</span>` : ''}
          </div>
          ${itemsSummary ? `<div class="history-tile-items">${svgReceipt}${escapeHtml(itemsSummary)}</div>` : ''}
        </div>
        <div class="history-tile-actions">
          <button type="button" class="btn btn-ghost history-tile-btn" onclick="event.stopPropagation(); openReview('${escapeHtml(order.key)}')">
            ${(typeof POS_SVG !== "undefined" && POS_SVG.eye) || ""}
            <span>${t('btnView')}</span>
          </button>
        </div>
      `;
      body.appendChild(tile);
    });

    groupEl.appendChild(body);
    container.appendChild(groupEl);
  }

  // Footer Banner: Older Data / Contact BLAB
  const olderCard = document.createElement("div");
  olderCard.className = "history-older-card";
  olderCard.onclick = () => openBlabContactModal('history');
  olderCard.innerHTML = `
    <div class="history-older-left">
      <div class="history-older-icon" style="width: 40px; height: 40px; border-radius: 10px; background: #f1f5f9; border: 1px solid #e2e8f0; color: #475569; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path></svg>
      </div>
      <div>
        <div class="history-older-title">
          <span>${t('historyOlderTitle')}</span>
        </div>
        <div class="history-older-sub">${t('historyOlderSub')}</div>
      </div>
    </div>
    <button class="btn btn-primary history-older-btn" onclick="event.stopPropagation(); openBlabContactModal('history')" style="min-height: 44px; display: inline-flex; align-items: center; gap: 8px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      <span>${t('btnContactBlab')}</span>
    </button>
  `;
  container.appendChild(olderCard);
}

function toggleHistoryDateGroup(date) {
  const isFilterActive = !!historySearchQuery || historyFilterType !== "all";
  if (isFilterActive) {
    if (expandedHistoryDates.has('collapsed_' + date)) {
      expandedHistoryDates.delete('collapsed_' + date);
    } else {
      expandedHistoryDates.add('collapsed_' + date);
    }
  } else {
    if (expandedHistoryDates.has(date)) {
      expandedHistoryDates.delete(date);
    } else {
      expandedHistoryDates.add(date);
    }
  }
  renderHistory(lastHistoryOrders);
}

function toggleAllHistoryGroups() {
  const dates = currentRenderedDates.length > 0 ? currentRenderedDates : Array.from(groupByDate(lastHistoryOrders).keys());
  const isFilterActive = !!historySearchQuery || historyFilterType !== "all";

  if (isFilterActive) {
    const isAnyCollapsed = dates.some(d => expandedHistoryDates.has('collapsed_' + d));
    if (isAnyCollapsed) {
      dates.forEach(d => expandedHistoryDates.delete('collapsed_' + d));
    } else {
      dates.forEach(d => expandedHistoryDates.add('collapsed_' + d));
    }
  } else {
    const isAllExpanded = dates.length > 0 && dates.every(d => expandedHistoryDates.has(d));
    if (isAllExpanded) {
      expandedHistoryDates.clear();
    } else {
      expandedHistoryDates = new Set(dates);
    }
  }
  renderHistory(lastHistoryOrders);
}

// Expose functions on window for global access
window.onHistorySearchInput = onHistorySearchInput;
window.clearHistorySearch = clearHistorySearch;
window.setHistoryFilter = setHistoryFilter;
window.toggleHistoryDateGroup = toggleHistoryDateGroup;
window.toggleAllHistoryGroups = toggleAllHistoryGroups;
window.fetchHistoryOrders = fetchHistoryOrders;
window.renderHistory = renderHistory;
window.updateHistoryFilterVisibility = updateHistoryFilterVisibility;

// Safe DOM initialization for keyboard shortcuts and direct event listeners
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("history-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => onHistorySearchInput(e.target.value));
      searchInput.addEventListener("keyup", (e) => {
        if (e.key === "Escape") clearHistorySearch();
      });
    }
    const clearBtn = document.getElementById("btn-history-search-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => clearHistorySearch());
    }
    // Filter clicks are wired once by the inline handlers in orders.html.

  });
}
