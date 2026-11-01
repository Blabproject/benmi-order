/* ============================================================
   BLAB STAFF ORDERING - IN-STORE TABLE ORDERING CLIENT
   ============================================================ */

(function () {
  'use strict';

  // --- 1. ENVIRONMENT & BASE URL RESOLUTION ---
  function resolveWorkerBase() {
    try {
      const hostname = window.location.hostname || "";
      const searchParams = new URLSearchParams(window.location.search);
      const forcedEnv = searchParams.get("env") || (typeof localStorage !== "undefined" && localStorage.getItem("pos_env_override"));

      if (forcedEnv === "dev" || hostname.startsWith("dev.") || hostname.includes(".dev.") || hostname.includes("-dev.")) {
        return "https://platform-worker-dev.thuanmnc.workers.dev";
      }
      if (forcedEnv === "staging" || forcedEnv === "test" || hostname.startsWith("staging.") || hostname.includes(".staging.")) {
        return "https://platform-worker-staging.thuanmnc.workers.dev";
      }
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.pages.dev') && hostname !== 'benmi-order.pages.dev') {
        return "https://platform-worker-dev.thuanmnc.workers.dev";
      }
      return "https://benmi-worker-official.thuanmnc.workers.dev";
    } catch (e) {
      return "https://benmi-worker-official.thuanmnc.workers.dev";
    }
  }

  const WORKER_BASE = resolveWorkerBase();

  // --- 2. I18N DICTIONARY ---
  const I18N = {
    "vi": {
      backPos: "Quay lại POS",
      customerPlaceholder:"Ví dụ: Anh Nam, Chị Linh", notePlaceholder:"Ví dụ: Làm nhanh, ít hành",
      invalidSelections:"Vui lòng kiểm tra món hết hàng và chọn đủ tùy chọn trước khi gửi.",
      configureOptions:"Chọn tùy chọn", networkError:"Không thể kết nối. Vui lòng thử lại.", submitFailed:"Gửi đơn thất bại. Vui lòng kiểm tra lại.",
      staffBadge: "Nhận đơn tại bàn",
      loginTitle: "Đăng nhập nhân viên",
      loginDesc: "Nhập mã PIN POS để bắt đầu nhận đơn tại bàn",
      labelPin: "Mã PIN cửa hàng",
      btnLogin: "Đăng nhập",
      logout: "Đăng xuất",
      tablesTitle: "Chọn bàn phục vụ",
      tablesDesc: "Chọn bàn trống để mở đơn hoặc bàn đang phục vụ để gọi thêm món",
      btnRefresh: "Làm mới",
      searchPlaceholder: "Tìm kiếm bàn...",
      filterAll: "Tất cả",
      filterEmpty: "Bàn trống",
      filterOccupied: "Đang phục vụ",
      emptyStatus: "Trống",
      occupiedStatus: "Đang phục vụ",
      btnOpenOrder: "Mở đơn",
      btnAppendRound: "Gọi thêm",
      modeNew: "Mở đơn mới",
      modeAppend: "Gọi thêm món",
      bannerNewSub: "Chưa có đơn nào. Chọn món để bắt đầu lượt gọi món đầu tiên.",
      bannerAppendSub: "Đơn hiện tại: #{displayKey} • {total} • Lượt {round}",
      btnChangeTable: "Đổi bàn",
      btnBackTables: "Đổi bàn",
      cartViewBtn: "Xem giỏ hàng",
      cartItemsPreviewEmpty: "Chưa có món nào",
      cartTitle: "Giỏ hàng nhận đơn",
      labelCustomer: "Tên khách (không bắt buộc)",
      labelNote: "Ghi chú đơn (không bắt buộc)",
      summarySubtotal: "Tạm tính:",
      summaryTotal: "Tổng tiền:",
      btnContinueOrdering: "Tiếp tục chọn món",
      btnConfirmOrder: "Xác nhận gửi đơn",
      btnSending: "Đang gửi đơn...",
      btnAddItem: "Thêm vào đơn",
      successTitle: "Gửi đơn thành công!",
      successDesc: "Đơn hàng đã được gửi tới POS.",
      successOrderKey: "Mã đơn:",
      successTable: "Bàn:",
      successRound: "Lượt gửi:",
      successTotal: "Tổng tiền:",
      btnSuccessBack: "Trở về danh sách bàn",
      conflictTitle: "Xung đột dữ liệu (409)",
      conflictDesc: "Bàn đã có đơn mới hoặc đơn vừa được cập nhật lượt mới. Giỏ hàng của bạn vẫn được giữ nguyên an toàn.",
      btnResolveConflict: "Tải lại bàn & Kiểm tra lại giỏ hàng",
      pinError: "Mã PIN không đúng hoặc cửa hàng chưa kích hoạt tính năng.",
      featureDisabled: "Cửa hàng chưa kích hoạt tính năng nhận đơn tại bàn.",
      soldOut: "Hết hàng",
      soldOutToday: "Hết hàng",
      allItems: "Tất cả món",
      emptyTablesList: "Không tìm thấy bàn nào.",
      noItemsInCat: "Không có món trong danh mục này.",
      btnQuickAdd: "Thêm",
      btnCustomize: "Tùy biến",
      optSingleChoice: "Chọn 1",
      optMultiChoice: "Tùy chọn",
      optItemNote: "Ghi chú riêng món này",
      optItemNotePlaceholder: "Ví dụ: ít đường, không đá, ít cay...",
      flavorNavTitle: "Chọn vị",
      flavorSectionTitle: "Chọn vị & Tùy chọn chung",
      flavorCartHeader: "Vị chung cho bàn:"
    },
    "zh-TW": {
      backPos: "返回訂單",
      customerPlaceholder:"例如：王先生、林小姐", notePlaceholder:"例如：少蔥、儘快出餐",
      invalidSelections:"請檢查售完餐點並完成必選選項後再送出。",
      configureOptions:"設定選項", networkError:"無法連線，請稍後重試。", submitFailed:"訂單送出失敗，請重新確認。",
      staffBadge: "桌邊點餐",
      loginTitle: "門市點餐登入",
      loginDesc: "請輸入門市管理 PIN 碼開始桌邊點餐",
      labelPin: "門市管理 PIN 碼",
      btnLogin: "登入",
      logout: "登出",
      tablesTitle: "選擇服務桌號",
      tablesDesc: "選擇空桌開啟新訂單，或選擇使用中桌號進行加點",
      btnRefresh: "重新整理",
      searchPlaceholder: "搜尋桌號...",
      filterAll: "全部",
      filterEmpty: "空桌",
      filterOccupied: "使用中",
      emptyStatus: "空桌",
      occupiedStatus: "使用中",
      btnOpenOrder: "開啟訂單",
      btnAppendRound: "加點餐點",
      modeNew: "開啟新訂單",
      modeAppend: "加點餐點",
      bannerNewSub: "尚未有點餐紀錄。請選取餐點進行首輪點餐。",
      bannerAppendSub: "目前訂單：#{displayKey} • {total} • 第 {round} 輪",
      btnChangeTable: "更換桌號",
      btnBackTables: "更換桌號",
      cartViewBtn: "查看購物車",
      cartItemsPreviewEmpty: "尚未選取餐點",
      cartTitle: "點餐購物車",
      labelCustomer: "顧客姓名 (選填)",
      labelNote: "整單備註 (選填)",
      summarySubtotal: "小計：",
      summaryTotal: "總金額：",
      btnContinueOrdering: "繼續選購",
      btnConfirmOrder: "確認送出訂單",
      btnSending: "送出處理中...",
      btnAddItem: "加入清單",
      successTitle: "點餐送出成功！",
      successDesc: "訂單已送達 POS。",
      successOrderKey: "訂單編號：",
      successTable: "桌號：",
      successRound: "點餐輪次：",
      successTotal: "總金額：",
      btnSuccessBack: "返回桌號清單",
      conflictTitle: "訂單狀態更新衝突 (409)",
      conflictDesc: "該桌已有新訂單或已更新輪次。您的購物車內容已完整保留，請重新整理確認。",
      btnResolveConflict: "重新整理並檢查購物車",
      pinError: "PIN 碼錯誤或門市尚未啟用桌邊點餐功能。",
      featureDisabled: "店家尚未啟用桌邊點餐功能。",
      soldOut: "已售完",
      soldOutToday: "今日已售完",
      allItems: "全部餐點",
      emptyTablesList: "找不到符合條件的桌號。",
      noItemsInCat: "此分類目前尚無餐點。",
      btnQuickAdd: "點餐",
      btnCustomize: "客製化",
      optSingleChoice: "單選",
      optMultiChoice: "可複選",
      optItemNote: "餐點專屬備註",
      optItemNotePlaceholder: "例如：微糖、去冰、少辣...",
      flavorNavTitle: "口味選擇",
      flavorSectionTitle: "口味與客製化選擇",
      flavorCartHeader: "整單口味："
    }
  };

  // --- 3. APPLICATION STATE ---
  const state = {
    tenantId: "",
    token: "",
    brandName: "",
    storeStatus: "open",
    allowDineIn: true,
    tables: [],
    tableFilter: "all",
    tableSearchQuery: "",
    currentTable: null,
    catalog: [],                  // Flattened list of all items across categories with cat metadata
    categories: [],               // List of category objects from bootstrap: { id, slug, name, shortName, items: [...], appliedModifiers, ... }
    modifiers: [],                // Per-category modifier groups from bootstrap
    customizations: [],           // Global customization groups (chọn vị chung) from bootstrap
    customizationSortOrder: 0,    // Position of global customizations panel among catalog sections
    selectedGlobalCustomizations: {}, // Table's selected flavor options: { [groupKey]: string[] }
    translations: {},             // Translations mapping from bootstrap
    activeCategory: "all",
    cart: [],
    selectedItem: null,
    modalQty: 1,
    modalSelectedOptions: [],
    currentLang: (typeof localStorage !== "undefined" && localStorage.getItem("staff_order_lang")) || "vi",
    pollTimer: null
  };

  function t(key, vars = {}) {
    let str = (I18N[state.currentLang] && I18N[state.currentLang][key]) || (I18N["vi"] && I18N["vi"][key]) || key;
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return str;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- 4. INITIALIZATION ---
  async function initApp() {
    const params = new URLSearchParams(window.location.search);
    state.tenantId = params.get("tenant_id") || params.get("tenant") || (typeof localStorage !== "undefined" && localStorage.getItem("pos_device_tenant_id")) || "";
    const isEmbedded = params.get("embedded") === "1" || window.self !== window.top;

    if (isEmbedded) {
      document.body.classList.add("is-embedded-pos");
      const btnBack = document.getElementById("btn-back-pos");
      if (btnBack) btnBack.style.display = "inline-flex";
    }

    applyI18nLabels();

    // Check capability first
    try {
      const capRes = await fetch(`${WORKER_BASE}/api/staff/capabilities?tenant_id=${encodeURIComponent(state.tenantId)}&_t=${Date.now()}`);
      if (capRes.ok) {
        const capData = await capRes.json();
        state.capabilities = capData.capabilities || {};
        state.brandName = capData.brandName || "";
        state.storeStatus = capData.storeStatus || "open";
        state.allowDineIn = capData.allowDineIn !== false;
        const brandEl = document.getElementById("display-brand-name");
        if (brandEl && state.brandName) {
          brandEl.innerText = state.brandName;
        }

        if (!capData.staff_ordering_enabled || !state.capabilities.session) {
          showLoginError(t("featureDisabled"));
        }
      }
    } catch (e) {
      console.warn("[StaffOrder] Capability check error:", e);
    }

    // Check existing session in sessionStorage
    const savedToken = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(`staff_session_token_${state.tenantId}`) : null;
    if (savedToken) {
      state.token = savedToken;
      await showTablesView();
    } else {
      showLoginView();
    }
  }

  function handleBackToPos() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "SWITCH_POS_TAB", tab: "live" }, "*");
    } else {
      const tenantId = state.tenantId || "";
      window.location.href = `orders.html?tenant=${encodeURIComponent(tenantId)}`;
    }
  }

  // --- 5. I18N & LANGUAGE TOGGLE ---
  function applyI18nLabels() {
    document.documentElement.lang = state.currentLang;
    const langBtn = document.getElementById("current-lang-text");
    if (langBtn) {
      langBtn.innerText = state.currentLang === "vi" ? "VI / 中文" : "中文 / VI";
    }

    const mapping = {
      "i18n-staff-badge": "staffBadge",
      "i18n-back-pos": "backPos",
      "i18n-login-title": "loginTitle",
      "i18n-login-desc": "loginDesc",
      "i18n-label-pin": "labelPin",
      "i18n-btn-login": "btnLogin",
      "i18n-logout": "logout",
      "i18n-tables-title": "tablesTitle",
      "i18n-tables-desc": "tablesDesc",
      "i18n-btn-refresh": "btnRefresh",
      "i18n-filter-all": "filterAll",
      "i18n-filter-empty": "filterEmpty",
      "i18n-filter-occupied": "filterOccupied",
      "i18n-btn-change-table": "btnChangeTable",
      "i18n-btn-back-tables": "btnBackTables",
      "i18n-btn-view-cart": "cartViewBtn",
      "i18n-cart-title": "cartTitle",
      "i18n-label-customer": "labelCustomer",
      "i18n-label-note": "labelNote",
      "i18n-summary-subtotal": "summarySubtotal",
      "i18n-summary-total": "summaryTotal",
      "i18n-btn-continue-ordering": "btnContinueOrdering",
      "i18n-btn-confirm-order": "btnConfirmOrder",
      "i18n-btn-add-item": "btnAddItem",
      "i18n-success-title": "successTitle",
      "success-desc-text":"successDesc",
      "i18n-success-order-key": "successOrderKey",
      "i18n-success-table": "successTable",
      "i18n-success-round": "successRound",
      "i18n-success-total": "successTotal",
      "i18n-btn-success-back": "btnSuccessBack",
      "i18n-btn-resolve-conflict": "btnResolveConflict"
    };

    for (const [domId, key] of Object.entries(mapping)) {
      const el = document.getElementById(domId);
      if (el) el.innerText = t(key);
    }

    document.getElementById("cart-customer-name").placeholder=t("customerPlaceholder");
    document.getElementById("cart-order-note").placeholder=t("notePlaceholder");
    const searchInp = document.getElementById("inp-table-search");
    if (searchInp) searchInp.placeholder = t("searchPlaceholder");
  }

  function toggleLanguage() {
    state.currentLang = state.currentLang === "vi" ? "zh-TW" : "vi";
    try {
      localStorage.setItem("staff_order_lang", state.currentLang);
    } catch (e) {}
    applyI18nLabels();

    if (state.currentTable) {
      updateOrderBanner();
    }
    renderTablesGrid();
    renderCategories();
    renderMenuItems();
    renderCartDrawer();
  }

  // --- 6. AUTHENTICATION (PIN LOGIN & LOGOUT) ---
  function showLoginView() {
    document.body.dataset.staffView = "login";
    stopTablePolling();
    document.getElementById("view-login").style.display = "block";
    document.getElementById("view-tables").style.display = "none";
    document.getElementById("view-menu").style.display = "none";
    document.getElementById("btn-logout").style.display = "none";
    document.getElementById("header-table-badge").style.display = "none";
    document.getElementById("sticky-cart-bar").style.display = "none";

    const pinInp = document.getElementById("inp-pin");
    if (pinInp) {
      pinInp.value = "";
      pinInp.focus();
    }
  }

  function showLoginError(msg) {
    const errEl = document.getElementById("login-error-msg");
    if (errEl) {
      errEl.innerText = msg;
      errEl.style.display = "block";
    }
  }

  async function handleStaffLogin(e) {
    if (e) e.preventDefault();
    const pinInp = document.getElementById("inp-pin");
    const pin = pinInp ? pinInp.value.trim() : "";
    if (!pin) return;

    const btn = document.getElementById("btn-submit-login");
    if (btn) btn.disabled = true;

    try {
      const res = await fetch(`${WORKER_BASE}/api/staff/session?tenant_id=${encodeURIComponent(state.tenantId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.ok && data.token) {
        state.token = data.token;
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(`staff_session_token_${state.tenantId}`, data.token);
        }
        if (data.brand_name) {
          state.brandName = data.brand_name;
          const bEl = document.getElementById("display-brand-name");
          if (bEl) bEl.innerText = data.brand_name;
        }
        await showTablesView();
      } else {
        showLoginError((data && data.message) || t("pinError"));
      }
    } catch (err) {
      showLoginError("Lỗi kết nối / 連線失敗: " + (err.message || err));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handleStaffLogout() {
    if (state.token) {
      try {
        await fetch(`${WORKER_BASE}/api/staff/session?tenant_id=${encodeURIComponent(state.tenantId)}`, {
          method: "DELETE",
          headers: { "Authorization": "Bearer " + state.token }
        });
      } catch (e) {}
    }
    state.token = "";
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(`staff_session_token_${state.tenantId}`);
    }
    showLoginView();
  }

  // --- 7. TABLE SELECTION VIEW ---
  async function showTablesView() {
    document.body.dataset.staffView = "tables";
    document.getElementById("view-login").style.display = "none";
    document.getElementById("view-tables").style.display = "block";
    document.getElementById("view-menu").style.display = "none";
    document.getElementById("btn-logout").style.display = "inline-flex";
    document.getElementById("header-table-badge").style.display = "none";
    document.getElementById("sticky-cart-bar").style.display = "none";

    await loadTablesData();
    startTablePolling();
  }

  function startTablePolling() {
    stopTablePolling();
    state.pollTimer = setInterval(loadTablesData, 10000);
  }

  function stopTablePolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  async function loadTablesData() {
    if (!state.token) return;

    try {
      const res = await fetch(`${WORKER_BASE}/api/staff/tables?tenant_id=${encodeURIComponent(state.tenantId)}&_t=${Date.now()}`, {
        headers: { "Authorization": "Bearer " + state.token }
      });

      if (res.status === 401) {
        showLoginView();
        showLoginError(t("pinError"));
        return;
      }

      if (res.ok) {
        const data = await res.json();
        state.tables = data.tables || [];
        renderTablesGrid();
      }
    } catch (e) {
      console.warn("[StaffOrder] Error loading tables:", e);
    }
  }

  function setTableFilter(filter, el) {
    state.tableFilter = filter;
    document.querySelectorAll(".filter-chip").forEach(chip => chip.classList.remove("active"));
    if (el) el.classList.add("active");
    renderTablesGrid();
  }

  function handleTableSearch(query) {
    state.tableSearchQuery = (query || "").trim().toLowerCase();
    renderTablesGrid();
  }

  function renderTablesGrid() {
    const grid = document.getElementById("tables-grid");
    if (!grid) return;

    let filtered = state.tables.filter(t => {
      if (state.tableSearchQuery) {
        const lbl = (t.label || "").toLowerCase();
        if (!lbl.includes(state.tableSearchQuery)) return false;
      }
      const isOccupied = !!t.active_order_key;
      if (state.tableFilter === "empty" && isOccupied) return false;
      if (state.tableFilter === "occupied" && !isOccupied) return false;
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 48px 16px; color: #94a3b8; font-size: 15px;">${t("emptyTablesList")}</div>`;
      return;
    }

    grid.innerHTML = filtered.map(tbl => {
      const isOccupied = !!tbl.active_order_key;
      const statusPill = isOccupied
        ? `<span class="table-card-status-pill">${t("occupiedStatus")}</span>`
        : `<span class="table-card-status-pill">${t("emptyStatus")}</span>`;

      const actionText = isOccupied ? t("btnAppendRound") : t("btnOpenOrder");

      let detailHtml = "";
      if (isOccupied) {
        const roundText = state.currentLang === "vi" ? `Lượt ${tbl.active_round_count || 1}` : `第 ${tbl.active_round_count || 1} 輪`;
        detailHtml = `
          <div class="table-card-occupied-info">
            <div class="order-id">#${escapeHtml(tbl.active_display_key || tbl.active_order_id || '')}</div>
            <div class="order-summary">$${tbl.active_total_amount || 0} • ${roundText}</div>
          </div>
        `;
      } else {
        detailHtml = `<div class="table-card-empty-info" style="color: #94a3b8; font-size: 13px;">${state.currentLang === "vi" ? "Sẵn sàng đón khách" : "隨時可開桌"}</div>`;
      }

      return `
        <div role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();handleSelectTable('${tbl.id}')}" class="table-card ${isOccupied ? 'occupied' : 'empty'}" onclick="handleSelectTable('${tbl.id}')">
          <div class="table-card-top">
            <div class="table-card-label">${escapeHtml(tbl.label)}</div>
            ${statusPill}
          </div>
          <div class="table-card-body">
            ${detailHtml}
          </div>
          <div class="table-card-bottom">
            <span></span>
            <span class="btn-card-action">${actionText}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  // --- 8. SELECT TABLE & ENTER MENU ORDERING ---
  async function handleSelectTable(tableId) {
    const table = state.tables.find(t => t.id === tableId);
    if (!table) return;

    state.currentTable = table;

    // Load draft cart and draft global flavor for this table
    loadDraftCart(table.id);

    stopTablePolling();
    await showMenuView();
  }

  function goToTableSelection() {
    if (state.currentTable) {
      saveDraftCart(state.currentTable.id);
    }
    state.currentTable = null;
    showTablesView();
  }

  async function showMenuView() {
    document.body.dataset.staffView = "menu";
    document.getElementById("view-login").style.display = "none";
    document.getElementById("view-tables").style.display = "none";
    document.getElementById("view-menu").style.display = "block";
    document.getElementById("btn-logout").style.display = "inline-flex";

    // Header table badge
    const headBadge = document.getElementById("header-table-badge");
    const headLabel = document.getElementById("header-table-label");
    if (headBadge && headLabel && state.currentTable) {
      headLabel.innerText = `${state.currentLang === "vi" ? "Bàn" : "桌號"}: ${state.currentTable.label}`;
      headBadge.style.display = "inline-flex";
    }

    updateOrderBanner();
    updateStickyCartBar();

    // Load catalog if not yet loaded
    if (state.catalog.length === 0) {
      await loadBootstrapMenu();
    } else {
      renderCategories();
      renderMenuItems();
    }
    renderCartDrawer();
  }

  function updateOrderBanner() {
    if (!state.currentTable) return;
    const isAppend = !!state.currentTable.active_order_key;
    const nameEl = document.getElementById("banner-table-name");
    const pillEl = document.getElementById("banner-mode-pill");
    const subEl = document.getElementById("banner-subtext");

    if (nameEl) nameEl.innerText = `${state.currentLang === "vi" ? "Bàn" : "桌號"} ${state.currentTable.label}`;

    if (pillEl) {
      pillEl.className = `order-mode-pill ${isAppend ? 'append' : 'new'}`;
      pillEl.innerText = isAppend ? t("modeAppend") : t("modeNew");
    }

    if (subEl) {
      if (isAppend) {
        subEl.innerText = t("bannerAppendSub", {
          displayKey: state.currentTable.active_display_key || state.currentTable.active_order_id || "",
          total: `$${state.currentTable.active_total_amount || 0}`,
          round: state.currentTable.active_round_count || 1
        });
      } else {
        subEl.innerText = t("bannerNewSub");
      }
    }
  }

  // --- 9. CATALOG & BOOTSTRAP LOADING (GROUPED BY CATEGORIES LIKE INDEX.HTML) ---
  async function loadBootstrapMenu(force = false) {
    try {
      const res = await fetch(`${WORKER_BASE}/api/tenant/bootstrap?tenant_id=${encodeURIComponent(state.tenantId)}&nocache=${force ? 1 : 0}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        
        const rawCatalog = Array.isArray(data.catalog) ? data.catalog : (data.catalog?.categories || []);
        state.categories = rawCatalog.map(cat => ({
          id: cat.id || cat.slug,
          slug: cat.slug || cat.id,
          name: cat.name || "",
          shortName: cat.shortName || "",
          sortOrder: cat.sortOrder || 0,
          allowCustomization: cat.allowCustomization !== false,
          appliedModifiers: cat.appliedModifiers || ['*'],
          pricingRules: cat.pricingRules || null,
          items: Array.isArray(cat.items) ? cat.items : []
        }));

        // Flatten all items across categories with category metadata
        const allItems = [];
        state.categories.forEach(cat => {
          (cat.items || []).forEach(item => {
            allItems.push({
              ...item,
              categoryId: cat.id,
              categorySlug: cat.slug,
              categoryName: cat.name
            });
          });
        });
        state.catalog = allItems;
        const optionsResponse = await fetch(`${WORKER_BASE}/api/menu/options?tenant_id=${encodeURIComponent(state.tenantId)}`);
        if (!optionsResponse.ok) throw new Error('MENU_UNAVAILABLE');
        const optionsCatalog = await optionsResponse.json();
        state.orderRule = {version:3, groups:optionsCatalog.groups.filter(g => g.scope === 'order').map(g => ({...g,
          type:g.included?'fixed':'choice', minQuantity:g.minSelection,maxQuantity:g.maxSelection,
          eligibleItems:g.options.map(o => ({...o,optionGroups:state.catalog.find(i=>i.id===o.productId)?.bundleRule?.groups || []}))}))};
        state.orderSelections = window.UnifiedOptions.restore(state.orderRule,state.orderSelections || []);

        state.modifiers = data.modifiers || [];
        state.customizations = data.customizations || [];
        state.customizationSortOrder = data.customizationSortOrder ?? 0;
        state.translations = data.translations || {};
        if (force) {
          state.cart.forEach(line => {
            const product = state.catalog.find(item=>item.id===line.itemId);
            if (!product) return;
            line.groups = window.UnifiedOptions.restore(product.bundleRule || {groups:[]},line.groups || []);
            line.price = Number(product.price) + line.groups.reduce((n,g)=>n+g.items.reduce((sum,c)=>sum+window.OrderDetailView.extra(c),0),0);
            line.name = product.name;
            line.options = window.OrderDetailView.choices(line.groups).map(c=>({name:c.value,price:c.price}));
          });
          saveDraftCart(state.currentTable?.id);
        }

        // Initialize default global flavor selections if not set from draft
        if (Object.keys(state.selectedGlobalCustomizations).length === 0) {
          state.selectedGlobalCustomizations = initDefaultGlobalCustomizations();
        }

        renderCategories();
        renderMenuItems();
        setupScrollSpy();
      }
    } catch (e) {
      console.warn("[StaffOrder] Error loading catalog:", e);
      showLoginError(t("networkError"));
    }
  }

  function initDefaultGlobalCustomizations() {
    const defaults = {};
    (state.customizations || []).forEach(group => {
      if (group.type === 'radio') {
        const firstOpt = (group.options || []).find(o => {
          const isOos = Boolean(o && typeof o === 'object' && (o.is_out_of_stock || o.isOutOfStock));
          return !isOos;
        });
        const optName = firstOpt ? (typeof firstOpt === 'string' ? firstOpt : firstOpt.name) : "";
        defaults[group.key] = optName ? [optName] : [];
      } else {
        defaults[group.key] = [];
      }
    });
    return defaults;
  }

  function getCatalogSections() {
    const sections = state.categories.map(cat => ({
      type: 'catalog',
      sortOrder: cat.sortOrder || 0,
      category: cat
    }));

    if (state.customizations && state.customizations.length > 0) {
      sections.push({
        type: 'customizations',
        sortOrder: state.customizationSortOrder ?? 0
      });
    }
    sections.sort((a, b) => a.sortOrder - b.sortOrder);
    return sections;
  }

  function renderCategories() {
    const nav = document.getElementById("category-tabs-nav");
    if (!nav) return;

    const sections = getCatalogSections();
    if (sections.length === 0) {
      nav.innerHTML = "";
      return;
    }

    nav.innerHTML = sections.map((sec, idx) => {
      if (sec.type === 'customizations') {
        const isActive = (state.activeCategory === 'flavor' || (state.activeCategory === 'all' && idx === 0));
        return `
          <button type="button" class="cat-tab-btn ${isActive ? 'active' : ''}" data-cat-slug="flavor" onclick="scrollToCategory('flavor', this)">
            ${escapeHtml(t("flavorNavTitle"))}
          </button>
        `;
      }
      const cat = sec.category;
      const navTitle = (cat.shortName && cat.name && cat.name.includes(cat.shortName)) ? cat.shortName : cat.name;
      const isActive = (state.activeCategory === cat.slug || (state.activeCategory === 'all' && idx === 0));
      return `
        <button type="button" class="cat-tab-btn ${isActive ? 'active' : ''}" data-cat-slug="${escapeHtml(cat.slug)}" onclick="scrollToCategory('${escapeHtml(cat.slug)}', this)">
          ${escapeHtml(navTitle)}
        </button>
      `;
    }).join("");
  }

  function scrollToCategory(slug, el) {
    state.activeCategory = slug;
    document.querySelectorAll("#category-tabs-nav .cat-tab-btn").forEach(btn => btn.classList.remove("active"));
    if (el) el.classList.add("active");

    const targetSec = document.getElementById(`sec-${slug}`);
    if (targetSec) {
      targetSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  let isScrollSpyActive = false;
  function setupScrollSpy() {
    if (isScrollSpyActive) return;
    isScrollSpyActive = true;

    let scrollTimeout = null;
    window.addEventListener("scroll", () => {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        scrollTimeout = null;
        updateActiveNavOnScroll();
      }, 80);
    }, { passive: true });
  }

  function updateActiveNavOnScroll() {
    const menuView = document.getElementById("view-menu");
    if (!menuView || menuView.style.display === "none") return;

    const sections = document.querySelectorAll(".section-container");
    if (sections.length === 0) return;

    let currentSlug = "";
    const offset = 140;

    sections.forEach(sec => {
      const rect = sec.getBoundingClientRect();
      if (rect.top <= offset && rect.bottom > offset) {
        currentSlug = sec.id.replace(/^sec-/, '');
      }
    });

    if (!currentSlug && sections.length > 0) {
      const firstRect = sections[0].getBoundingClientRect();
      if (firstRect.top > offset) {
        currentSlug = sections[0].id.replace(/^sec-/, '');
      }
    }

    if (currentSlug && currentSlug !== state.activeCategory) {
      state.activeCategory = currentSlug;
      const btns = document.querySelectorAll("#category-tabs-nav .cat-tab-btn");
      btns.forEach(btn => {
        const match = btn.getAttribute("data-cat-slug") === currentSlug;
        btn.classList.toggle("active", match);
        if (match) {
          btn.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
        }
      });
    }
  }

  function getItemTotalCartQty(itemId) {
    return state.cart
      .filter(c => c.itemId === itemId)
      .reduce((sum, c) => sum + c.quantity, 0);
  }

  function getCategoryModifiers(cat) {
    if (!cat || cat.allowCustomization === false) return [];
    const applied = cat.appliedModifiers || ['*'];
    if (applied.length === 0) return [];
    const allMods = state.modifiers || [];
    if (applied.includes('*')) return allMods;
    return allMods.filter(m => applied.includes(m.slug) || applied.includes(m.id));
  }

  // Dishes only have per-item customization if their category has applied modifiers or combo bundle rule!
  // Global customizations (chọn vị chung) are NOT per-item!
  function hasCustomizations(cat, item) {
    if (item && item.bundleRule) return true;
    const mods = getCategoryModifiers(cat);
    return mods.length > 0;
  }

  function getItemActionControlInner(itemId, qty) {
    if (qty <= 0) {
      return `<button type="button" class="btn-quick-add" onclick="handleItemAddClick('${itemId}', event)">+ ${t("btnQuickAdd")}</button>`;
    }
    return `
      <div class="qty-control">
        <button type="button" class="btn-qty" onclick="handleQuickQty('${itemId}', -1, event)">-</button>
        <span class="qty-text" id="card-qty-${itemId}">${qty}</span>
        <button type="button" class="btn-qty" onclick="handleQuickQty('${itemId}', 1, event)">+</button>
      </div>
    `;
  }

  function updateCardActionUI(itemId) {
    const wrap = document.getElementById(`card-action-${itemId}`);
    if (!wrap) return;
    const qty = getItemTotalCartQty(itemId);
    wrap.innerHTML = getItemActionControlInner(itemId, qty);
  }

  function refreshAllCardActionUIs() {
    state.catalog.forEach(item => {
      updateCardActionUI(item.id);
    });
  }

  function handleItemAddClick(itemId, e) {
    if (e) e.stopPropagation();
    const item = state.catalog.find(i => i.id === itemId);
    if (!item) return;
    if (item.bundleRule?.groups?.length) return openCanonicalOptions(item);

    state.cart.push({
      uid: crypto.randomUUID(),
      itemId: item.id,
      name: item.name,
      price: Number(item.price) || 0,
      quantity: 1,
      options: [],
      note: ""
    });

    if (state.currentTable) {
      saveDraftCart(state.currentTable.id);
    }

    updateCardActionUI(itemId);
    renderCartDrawer();
    updateStickyCartBar();
  }

  function handleQuickQty(itemId, delta, e) {
    if (e) e.stopPropagation();
    if (delta > 0) {
      const product = state.catalog.find(i=>i.id===itemId);
      if (product?.bundleRule?.groups?.length) return openCanonicalOptions(product);
      const existing = [...state.cart].reverse().find(c => c.itemId === itemId);
      if (existing) {
        existing.quantity += 1;
      } else {
        const item = state.catalog.find(i => i.id === itemId);
        if (!item) return;
        state.cart.push({
          uid: crypto.randomUUID(),
          itemId: item.id,
          name: item.name,
          price: Number(item.price) || 0,
          quantity: 1,
          options: [],
          note: ""
        });
      }
    } else if (delta < 0) {
      const idx = state.cart.map(c => c.itemId).lastIndexOf(itemId);
      if (idx >= 0) {
        state.cart[idx].quantity -= 1;
        if (state.cart[idx].quantity <= 0) {
          state.cart.splice(idx, 1);
        }
      }
    }

    if (state.currentTable) {
      saveDraftCart(state.currentTable.id);
    }

    updateCardActionUI(itemId);
    renderCartDrawer();
    updateStickyCartBar();
  }

  function createItemCardHtml(cat, item) {
    const isOos = Boolean(item.isOutOfStock || (item.out_of_stock_until && new Date(item.out_of_stock_until) > new Date()));
    const priceStr = `$${item.price || 0}`;

    const badgeText = item.badge || item.badgeText || (item.isRecommended ? (state.currentLang === 'vi' ? 'Đặc trưng' : '推薦') : '');
    const badgeHtml = badgeText ? `<span class="badge">${escapeHtml(badgeText)}</span>` : '';

    const canCustomize = hasCustomizations(cat, item);
    const cardClickAction = canCustomize ? `openItemModal('${item.id}')` : `handleItemAddClick('${item.id}', event)`;

    let imgHtml = '';
    if (item.imageUrl) {
      const fullImg = item.imageUrl.startsWith('http') ? item.imageUrl : `${WORKER_BASE}${item.imageUrl}`;
      imgHtml = `<img src="${escapeHtml(fullImg)}" class="item-img" loading="lazy" alt="${escapeHtml(item.name)}" onclick="${cardClickAction}" onerror="this.style.display='none'">`;
    }

    const trans = (state.translations && state.translations[item.name]) || item.description || '';
    const transHtml = trans ? `<div class="card-trans">${escapeHtml(trans)}</div>` : '';

    const currentQty = getItemTotalCartQty(item.id);

    let actionControlsHtml = "";
    if (isOos) {
      actionControlsHtml = `<div class="sold-out-tag">${t("soldOutToday")}</div>`;
    } else {
      actionControlsHtml = `
        <div class="card-action-wrap" id="card-action-${item.id}">
          ${getItemActionControlInner(item.id, currentQty)}
        </div>
      `;
    }

    const customizeBtnHtml = (!isOos && canCustomize) ? `
      <button type="button" class="btn-customize-item" onclick="openItemModal('${item.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="21" x2="4" y2="14"></line>
          <line x1="4" y1="10" x2="4" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12" y2="3"></line>
          <line x1="20" y1="21" x2="20" y2="16"></line>
          <line x1="20" y1="12" x2="20" y2="3"></line>
          <line x1="1" y1="14" x2="7" y2="14"></line>
          <line x1="9" y1="8" x2="15" y2="8"></line>
          <line x1="17" y1="16" x2="23" y2="16"></line>
        </svg>
        <span>${t("btnCustomize")}</span>
      </button>
    ` : '';

    return `
      <div class="card ${isOos ? 'sold-out' : ''}" id="card-item-${item.id}">
        <div class="card-main">
          ${imgHtml}
          <div class="card-info">
            <div onclick="${cardClickAction}" style="cursor: pointer;">
              <div class="card-title">
                <span>${escapeHtml(item.name)}</span>
                ${badgeHtml}
              </div>
              ${transHtml}
            </div>
            <div class="card-footer">
              <div class="card-price">${priceStr}</div>
              ${actionControlsHtml}
            </div>
          </div>
        </div>
        ${customizeBtnHtml}
      </div>
    `;
  }

  // Render Global Customizations Section (#sec-flavor like index.html)
  function renderFlavorSectionHtml() {
    if (!state.orderRule?.groups?.length) return '';
    const summary = window.OrderDetailView.choices(state.orderSelections || []).map(c=>`${c.label}: ${c.value}`).join(' · ');
    return `<section class="section-container" id="sec-flavor"><h3>${t('flavorSectionTitle')}</h3>
      <p>${escapeHtml(summary)}</p><button type="button" class="btn btn-ghost" onclick="openStaffOrderOptions()">${t('configureOptions')}</button></section>`;
  }

  function handleGlobalFlavorChange(groupKey, optName, isRadio, isChecked) {
    if (isRadio) {
      state.selectedGlobalCustomizations[groupKey] = [optName];
      document.querySelectorAll(`input[name="global-flavor-${groupKey}"]`).forEach(inp => {
        const label = inp.closest('.flavor-chip-label');
        if (label) label.classList.toggle('checked', inp.value === optName);
      });
    } else {
      let current = state.selectedGlobalCustomizations[groupKey] || [];
      if (isChecked) {
        if (!current.includes(optName)) current.push(optName);
      } else {
        current = current.filter(v => v !== optName);
      }
      state.selectedGlobalCustomizations[groupKey] = current;
      const inp = document.querySelector(`input[name="global-flavor-${groupKey}"][value="${optName}"]`);
      if (inp) {
        const label = inp.closest('.flavor-chip-label');
        if (label) label.classList.toggle('checked', isChecked);
      }
    }

    if (state.currentTable) {
      saveDraftCart(state.currentTable.id);
    }
  }

  function getSelectedGlobalCustomizations() {
    const result = [];
    if (!state.customizations || state.customizations.length === 0) return result;

    state.customizations.forEach(group => {
      const selectedVals = state.selectedGlobalCustomizations[group.key] || [];
      selectedVals.forEach(val => {
        const optObj = (group.options || []).find(o => (typeof o === 'string' ? o : o.name) === val);
        const optPrice = (optObj && typeof optObj === 'object' && Number(optObj.price)) || 0;
        const cleanTitle = (group.title || '').replace(/^✦\s*/, '').replace(/選擇|調整/g, '').trim();
        result.push({
          key: group.key,
          label: cleanTitle || group.title || 'Vị',
          value: val + (optPrice > 0 ? ` (+$${optPrice})` : ''),
          price: optPrice
        });
      });
    });

    return result;
  }

  function formatGlobalCustomizationsSummary() {
    return window.OrderDetailView.choices(state.orderSelections || []).map(c=>`${c.label}: ${c.value}`).join(' · ');
  }

  function renderMenuItems() {
    const container = document.getElementById("catalog-sections");
    if (!container) return;

    const sections = getCatalogSections();
    if (sections.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 48px 16px; color: #94a3b8; font-size: 15px;">${t("noItemsInCat")}</div>`;
      return;
    }

    container.innerHTML = sections.map(sec => {
      if (sec.type === 'customizations') {
        return renderFlavorSectionHtml();
      }
      const cat = sec.category;
      const items = cat.items || [];
      if (items.length === 0) return "";

      const promoBadge = cat.pricingRules?.promo_label 
        ? `<span class="cat-promo-badge">${escapeHtml(cat.pricingRules.promo_label)}</span>` 
        : '';

      const cardsHtml = items.map(item => createItemCardHtml(cat, item)).join("");

      return `
        <div class="section-container" id="sec-${escapeHtml(cat.slug)}">
          <div class="section-title">
            <span>${escapeHtml(cat.name)}</span>
            ${promoBadge}
          </div>
          <div class="items-grid" id="grid-${escapeHtml(cat.slug)}">
            ${cardsHtml}
          </div>
        </div>
      `;
    }).join("");
  }

  // --- 10. PER-ITEM CUSTOMIZATION MODAL (MODIFIERS ONLY, NO GLOBAL FLAVOR) ---
  function getItemCustomizationGroups(item) {
    const groups = [];
    const cat = state.categories.find(c => c.id === item.categoryId || c.slug === item.categorySlug);
    const catMods = getCategoryModifiers(cat);

    catMods.forEach(m => {
      groups.push({
        key: m.slug || m.id,
        title: m.name || m.title || (state.currentLang === 'vi' ? 'Tùy chọn' : '客製化'),
        type: m.type || (m.max_selection === 1 || m.single_choice ? "radio" : "checkbox"),
        options: (m.options || []).map(opt => ({
          name: typeof opt === 'string' ? opt : (opt.name || opt.label),
          price: typeof opt === 'object' ? (Number(opt.price) || 0) : 0
        }))
      });
    });

    return groups;
  }

  function openItemModal(itemId) {
    const canonicalItem = state.catalog.find(i=>i.id===itemId);
    if (canonicalItem?.bundleRule?.groups?.length) return openCanonicalOptions(canonicalItem);
    const item = state.catalog.find(i => i.id === itemId);
    if (!item) return;

    state.selectedItem = item;
    state.modalQty = 1;
    state.modalSelectedOptions = [];

    document.getElementById("modal-item-name").innerText = item.name;
    document.getElementById("modal-item-base-price").innerText = `$${item.price || 0}`;
    document.getElementById("modal-item-qty").innerText = "1";

    renderModalOptions(item);
    updateModalCalculatedPrice();

    document.getElementById("itemModal").style.display = "flex";
  }

  function closeItemModal() {
    document.getElementById("itemModal").style.display = "none";
    state.selectedItem = null;
  }

  function changeModalQty(delta) {
    state.modalQty = Math.max(1, state.modalQty + delta);
    document.getElementById("modal-item-qty").innerText = state.modalQty;
    updateModalCalculatedPrice();
  }

  function renderModalOptions(item) {
    const container = document.getElementById("modal-item-options-body");
    if (!container) return;

    const groups = getItemCustomizationGroups(item);

    if (groups.length === 0) {
      container.innerHTML = `
        <div class="form-group" style="margin-top: 10px;">
          <label style="font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 6px;">${t("optItemNote")}</label>
          <input type="text" id="modal-item-single-note" placeholder="${t("optItemNotePlaceholder")}" style="width: 100%; min-height: 44px; padding: 8px 12px; border: 1.5px solid var(--border); border-radius: 8px;">
        </div>
      `;
      return;
    }

    let html = "";
    groups.forEach((grp, gIdx) => {
      const isRadio = grp.type === "radio";
      const grpTitle = escapeHtml(grp.title || `Tùy chọn ${gIdx + 1}`);

      html += `
        <div class="option-group">
          <div class="option-group-title">
            <span>${grpTitle}</span>
            <span class="option-group-badge">${isRadio ? t("optSingleChoice") : t("optMultiChoice")}</span>
          </div>
          <div class="option-choices-list">
      `;

      const options = grp.options || [];
      options.forEach((opt, oIdx) => {
        const optName = typeof opt === "string" ? opt : opt.name;
        const optPrice = typeof opt === "object" ? Number(opt.price) || 0 : 0;
        const priceLabel = optPrice > 0 ? ` +$${optPrice}` : "";
        const inputName = `modal-opt-${grp.key || gIdx}`;
        const inputType = isRadio ? "radio" : "checkbox";
        const isChecked = isRadio && oIdx === 0;

        html += `
          <label class="option-chip-label">
            <input type="${inputType}" name="${inputName}" value="${escapeHtml(optName)}" data-price="${optPrice}" ${isChecked ? 'checked' : ''} onchange="updateModalCalculatedPrice()">
            <span>${escapeHtml(optName)}</span>
            ${optPrice > 0 ? `<span style="font-size: 12px; color: var(--primary-hover);">${priceLabel}</span>` : ''}
          </label>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    html += `
      <div class="form-group" style="margin-top: 16px;">
        <label style="font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 6px;">${t("optItemNote")}</label>
        <input type="text" id="modal-item-single-note" placeholder="${t("optItemNotePlaceholder")}" style="width: 100%; min-height: 44px; padding: 8px 12px; border: 1.5px solid var(--border); border-radius: 8px;">
      </div>
    `;

    container.innerHTML = html;
  }

  function getModalSelectedOptions() {
    const selected = [];
    const container = document.getElementById("modal-item-options-body");
    if (!container) return selected;

    container.querySelectorAll("input:checked").forEach(inp => {
      const price = Number(inp.getAttribute("data-price")) || 0;
      selected.push({
        name: inp.value,
        choice: inp.value,
        price: price
      });
    });

    return selected;
  }

  function updateModalCalculatedPrice() {
    if (!state.selectedItem) return;
    let unitPrice = Number(state.selectedItem.price) || 0;
    const opts = getModalSelectedOptions();
    opts.forEach(o => { unitPrice += o.price; });

    const total = unitPrice * state.modalQty;
    const priceEl = document.getElementById("modal-item-calculated-price");
    if (priceEl) priceEl.innerText = `$${total}`;
  }

  function confirmAddItemToCart() {
    if (!state.selectedItem) return;

    const options = getModalSelectedOptions();
    let unitPrice = Number(state.selectedItem.price) || 0;
    options.forEach(o => { unitPrice += o.price; });

    const noteInp = document.getElementById("modal-item-single-note");
    const note = noteInp ? noteInp.value.trim() : "";

    const cartItem = {
      uid: crypto.randomUUID(),
      itemId: state.selectedItem.id,
      name: state.selectedItem.name,
      price: unitPrice,
      quantity: state.modalQty,
      options: options,
      note: note
    };

    state.cart.push(cartItem);
    if (state.currentTable) {
      saveDraftCart(state.currentTable.id);
    }

    updateCardActionUI(state.selectedItem.id);
    closeItemModal();
    renderCartDrawer();
    updateStickyCartBar();
  }

  // --- 11. CART MANAGEMENT & STICKY BAR ---
  function updateStickyCartBar() {
    const bar = document.getElementById("sticky-cart-bar");
    if (!bar) return;

    const totalCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = staffTotal();

    if (totalCount > 0 && state.currentTable) {
      bar.style.display = "block";
      document.getElementById("cart-total-count").innerText = totalCount;
      document.getElementById("cart-total-price").innerText = `$${totalPrice}`;

      const previewText = state.cart.map(i => `${i.name} x${i.quantity}`).join(", ");
      document.getElementById("cart-items-preview").innerText = previewText;
    } else {
      bar.style.display = "none";
    }
  }

  function openCartModal() {
    renderCartDrawer();
    document.getElementById("cartModal").style.display = "flex";
  }

  function closeCartModal() {
    document.getElementById("cartModal").style.display = "none";
  }

  function renderCartDrawer() {
    const contextEl = document.getElementById("cart-order-context-desc");
    if (contextEl && state.currentTable) {
      const isAppend = !!state.currentTable.active_order_key;
      contextEl.innerText = `${state.currentLang === "vi" ? "Bàn" : "桌號"} ${state.currentTable.label} • ${isAppend ? t("modeAppend") : t("modeNew")}`;
    }

    // Render flavor summary in cart
    const flavorSummaryText = formatGlobalCustomizationsSummary();
    let flavorBox = document.getElementById("cart-flavor-summary-box");
    if (!flavorBox && contextEl && contextEl.parentNode) {
      flavorBox = document.createElement("div");
      flavorBox.id = "cart-flavor-summary-box";
      flavorBox.className = "cart-flavor-summary";
      contextEl.parentNode.insertBefore(flavorBox, contextEl.nextSibling);
    }
    if (flavorBox) {
      flavorBox.innerHTML = `
        <div class="cart-flavor-title">${t("flavorCartHeader")}</div>
        <div class="cart-flavor-content">${escapeHtml(flavorSummaryText) || (state.currentLang === "vi" ? "Tiêu chuẩn / Mặc định" : "標準口味")}</div>
      `;
    }

    const submit = document.getElementById("btn-submit-order");
    if (submit) submit.disabled = state.submitting || !state.capabilities?.[state.currentTable?.active_order_key ? "append" : "create"];
    const listEl = document.getElementById("cart-items-list");
    if (!listEl) return;

    if (state.cart.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 32px 0; color: #94a3b8;">${t("cartItemsPreviewEmpty")}</div>`;
      document.getElementById("cart-summary-subtotal").innerText = "$0";
      document.getElementById("cart-summary-total").innerText = "$0";
      return;
    }

    let grandTotal = 0;
    listEl.innerHTML = state.cart.map((item, idx) => {
      const lineTotal = item.price * item.quantity;
      grandTotal += lineTotal;
      const optsText = (item.options || []).map(o => o.name + (o.price > 0 ? `(+$${o.price})` : '')).join(", ");

      return `
        <div class="cart-item-row">
          <div class="cart-item-info">
            <div class="cart-item-name">${escapeHtml(item.name)}</div>
            ${optsText ? `<div class="cart-item-options">${escapeHtml(optsText)}</div>` : ''}
            ${item.note ? `<div class="cart-item-note">↳ ${escapeHtml(item.note)}</div>` : ''}
            <div class="cart-item-price">$${lineTotal}</div>
          </div>
          <div class="cart-item-actions">
            <div class="qty-stepper">
              <button type="button" class="btn-qty" onclick="changeCartItemQty(${idx}, -1)">-</button>
              <span class="qty-val">${item.quantity}</span>
              <button type="button" class="btn-qty" onclick="changeCartItemQty(${idx}, 1)">+</button>
            </div>
            <button type="button" class="btn-remove-cart-item" onclick="removeCartItem(${idx})" title="Xóa món">✕</button>
          </div>
        </div>
      `;
    }).join("");

    document.getElementById("cart-summary-subtotal").innerText = `$${grandTotal}`;
    document.getElementById("cart-summary-total").innerText = `$${staffTotal()}`;
  }

  function changeCartItemQty(index, delta) {
    if (!state.cart[index]) return;
    const itemId = state.cart[index].itemId;
    state.cart[index].quantity += delta;
    if (state.cart[index].quantity <= 0) {
      state.cart.splice(index, 1);
    }
    if (state.currentTable) {
      saveDraftCart(state.currentTable.id);
    }
    renderCartDrawer();
    updateCardActionUI(itemId);
    renderCartDrawer();
    updateStickyCartBar();
  }

  function removeCartItem(index) {
    if (!state.cart[index]) return;
    const itemId = state.cart[index].itemId;
    state.cart.splice(index, 1);
    if (state.currentTable) {
      saveDraftCart(state.currentTable.id);
    }
    renderCartDrawer();
    updateCardActionUI(itemId);
    renderCartDrawer();
    updateStickyCartBar();
  }

  function saveDraftCart(tableId) {
    if (!tableId || typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(`staff_cart_${state.tenantId}_${tableId}`, JSON.stringify(state.cart));
    sessionStorage.setItem(`staff_flavor_${state.tenantId}_${tableId}`, JSON.stringify(state.orderSelections || []));
  }

  function loadDraftCart(tableId) {
    if (!tableId || typeof sessionStorage === "undefined") {
      state.cart = [];
      state.selectedGlobalCustomizations = initDefaultGlobalCustomizations();
      refreshAllCardActionUIs();
      return;
    }
    try {
      const raw = sessionStorage.getItem(`staff_cart_${state.tenantId}_${tableId}`);
      state.cart = raw ? JSON.parse(raw) : [];

      const rawFlavor = sessionStorage.getItem(`staff_flavor_${state.tenantId}_${tableId}`);
      state.orderSelections = rawFlavor ? JSON.parse(rawFlavor) : window.UnifiedOptions.restore(state.orderRule || {groups:[]});
    } catch (e) {
      state.cart = [];
      state.selectedGlobalCustomizations = initDefaultGlobalCustomizations();
    }
    refreshAllCardActionUIs();
  }

  function clearDraftCart(tableId) {
    if (!tableId || typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(`staff_cart_${state.tenantId}_${tableId}`);
    sessionStorage.removeItem(`staff_flavor_${state.tenantId}_${tableId}`);
    state.cart = [];
    state.orderSelections = window.UnifiedOptions.restore(state.orderRule || {groups:[]});
    refreshAllCardActionUIs();
  }

  // --- 12. SUBMIT STAFF ORDER (NEW OR APPEND ROUND) ---
  async function submitStaffOrder() {
    if (!state.currentTable || state.cart.length === 0 || state.submitting || !state.capabilities?.[state.currentTable.active_order_key ? "append" : "create"]) return;

    const invalid = state.cart.some(line=> {
      const product=state.catalog.find(item=>item.id===line.itemId);
      return !product || product.isOutOfStock || !window.UnifiedOptions.valid(product.bundleRule || {groups:[]},{groups:line.groups || []});
    }) || !window.UnifiedOptions.valid(state.orderRule || {groups:[]},{groups:state.orderSelections || []});
    if (invalid) return alert(t('invalidSelections'));
    const btnSubmit = document.getElementById("btn-submit-order");
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerText = t("btnSending");
    }

    const customerInp = document.getElementById("cart-customer-name");
    const noteInp = document.getElementById("cart-order-note");
    const customer = customerInp ? customerInp.value.trim() : "";
    const note = noteInp ? noteInp.value.trim() : "";

    if (state.submitting) return;
    state.submitting = true;
    const isAppend = !!state.currentTable.active_order_key;

    const payload = {
      detailVersion: 1,
      total: staffTotal(),
      orderSelections: state.orderSelections || [],
      tableId: state.currentTable.id,
      customer,
      note,
      items: state.cart.map(c => ({
        itemId: c.itemId,
        name: c.name,
        quantity: c.quantity,
        price: c.price,
        note: c.note || '',
        bundleSelections: {portions:Array.from({length:c.quantity}, (_,i)=>({portionIndex:i,groups:c.groups || []}))}
      }))
    };

    try {
      let endpoint = `${WORKER_BASE}/api/staff/orders?tenant_id=${encodeURIComponent(state.tenantId)}`;
      if (isAppend) {
        endpoint = `${WORKER_BASE}/api/staff/orders/${encodeURIComponent(state.currentTable.active_order_key)}/rounds?tenant_id=${encodeURIComponent(state.tenantId)}`;
        payload.expectedRevision = state.currentTable.active_revision || 0;
      }

      const pendingKey = `staff_pending_${state.tenantId}_${state.currentTable.id}`;
      const signature = JSON.stringify({endpoint,payload});
      const pending = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
      payload.requestId = pending?.signature === signature ? pending.requestId : crypto.randomUUID();
      sessionStorage.setItem(pendingKey,JSON.stringify({signature,requestId:payload.requestId}));
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + state.token
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        sessionStorage.removeItem(pendingKey);
        closeCartModal();
        showConflictModal(t("conflictDesc"));
        return;
      }

      if (res.ok && data && data.ok) {
        sessionStorage.removeItem(pendingKey);
        clearDraftCart(state.currentTable.id);
        closeCartModal();
        updateStickyCartBar();

        showSuccessModal({
          displayKey: data.displayKey || data.orderId || "---",
          tableName: state.currentTable.label,
          roundCount: data.roundCount || 1,
          total: data.total || data.grandTotal || 0
        });

        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: "STAFF_ORDER_SUBMITTED",
            orderKey: data.orderKey || data.key || data.orderId,
            displayKey: data.displayKey,
            roundCount: data.roundCount || 1
          }, "*");
        }
      } else {
        if (res.status < 500) sessionStorage.removeItem(pendingKey);
        alert(t("submitFailed"));
      }
    } catch (err) {
      alert(t("networkError"));
    } finally {
      state.submitting = false;
      if (btnSubmit) {
        btnSubmit.disabled = !state.capabilities?.[state.currentTable?.active_order_key ? "append" : "create"];
        btnSubmit.innerText = t("btnConfirmOrder");
      }
    }
  }

  // --- 13. SUCCESS & CONFLICT MODALS ---
  function showSuccessModal({ displayKey, tableName, roundCount, total }) {
    document.getElementById("success-display-key").innerText = `#${displayKey}`;
    document.getElementById("success-table-name").innerText = tableName;
    document.getElementById("success-round-count").innerText = state.currentLang === "vi" ? `Lượt ${roundCount}` : `第 ${roundCount} 輪`;
    document.getElementById("success-total-amount").innerText = `$${total}`;

    document.getElementById("successModal").style.display = "flex";
  }

  function handleSuccessBackToTables() {
    document.getElementById("successModal").style.display = "none";
    goToTableSelection();
  }

  function showConflictModal(msg) {
    const desc = document.getElementById("conflict-desc-text");
    if (desc && msg) desc.innerText = msg;
    document.getElementById("conflictModal").style.display = "flex";
  }

  async function handleResolveConflict() {
    document.getElementById('conflictModal').style.display = 'none';
    state.submitting = true;
    const submit = document.getElementById('btn-submit-order');
    if (submit) submit.disabled = true;
    try {
      if (state.currentTable) {
        await loadTablesData();
        await loadBootstrapMenu(true);
        const updatedTable = state.tables.find(table=>table.id===state.currentTable.id);
        if (updatedTable) { state.currentTable=updatedTable; updateOrderBanner(); }
      }
    } finally {
      state.submitting = false;
      openCartModal();
    }
  }

  let optionItem = null;
  const optionKey = 'staff_selection';
  window.cart = {};
  window.WORKER_BASE = WORKER_BASE;
  window.resolveCatalogItem = () => ({targetItem:optionItem,bundleRule:optionItem?.bundleRule});
  window.calculateCurrentFoodSubtotal = () => merchandiseTotal();
  function merchandiseTotal() {
    let total = state.cart.reduce((n,c)=>n+c.price*c.quantity,0);
    for (const cat of state.categories) {
      const rule = cat.pricingRules;
      if (!rule?.bundle_qty || !rule?.bundle_price) continue;
      const prices = state.cart.filter(c=>state.catalog.find(i=>i.id===c.itemId)?.categoryId===cat.id)
        .flatMap(c=>Array(c.quantity).fill(Number(state.catalog.find(i=>i.id===c.itemId)?.price || 0))).sort((a,b)=>b-a);
      const count = Math.floor(prices.length/rule.bundle_qty);
      total -= Math.max(0,prices.slice(0,count*rule.bundle_qty).reduce((a,b)=>a+b,0)-count*rule.bundle_price);
    }
    return Math.round(total*100)/100;
  }
  function staffTotal() {
    return Math.round((merchandiseTotal()+(state.orderSelections || []).reduce((n,g)=>n+g.items.reduce((sum,c)=>sum+window.OrderDetailView.extra(c),0),0))*100)/100;
  }
  function openCanonicalOptions(item) {
    optionItem = item;
    window.cart[optionKey] = 0;
    window.bundleCartData = {};
    window.customizeData = {};
    window.UnifiedOptions.open('staff','selection');
  }
  window.openStaffOrderOptions = () => {
    optionItem = {id:'order-options',name:t('flavorSectionTitle'),price:0,bundleRule:state.orderRule};
    window.cart[optionKey] = 0;
    window.bundleCartData = {[optionKey]:[{groups:state.orderSelections || []}]};
    window.customizeData = {};
    window.UnifiedOptions.open('staff','selection',0);
  };
  window.updateTotal = () => {
    const groups = window.bundleCartData?.[optionKey]?.[0]?.groups || [];
    if (optionItem?.id === 'order-options') {
      state.orderSelections = groups;
      renderMenuItems();
    } else if (optionItem) {
      const extra = groups.reduce((n,g)=>n+g.items.reduce((sum,c)=>sum+window.OrderDetailView.extra(c),0),0);
      state.cart.push({uid:crypto.randomUUID(),itemId:optionItem.id,name:optionItem.name,
        price:Number(optionItem.price)+extra,quantity:1,groups,note:window.customizeData?.[optionKey]?.[0]?.note || '',
        options:window.OrderDetailView.choices(groups).map(c=>({name:c.value,price:c.price}))});
      updateCardActionUI(optionItem.id);
    }
    saveDraftCart(state.currentTable?.id);
    renderCartDrawer();
    updateStickyCartBar();
  };

  // --- 14. EXPOSE GLOBAL FUNCTIONS ---
  window.toggleLanguage = toggleLanguage;
  window.handleStaffLogin = handleStaffLogin;
  window.handleStaffLogout = handleStaffLogout;
  window.loadTablesData = loadTablesData;
  window.setTableFilter = setTableFilter;
  window.handleTableSearch = handleTableSearch;
  window.handleSelectTable = handleSelectTable;
  window.goToTableSelection = goToTableSelection;
  window.selectCategory = scrollToCategory;
  window.scrollToCategory = scrollToCategory;
  window.handleGlobalFlavorChange = handleGlobalFlavorChange;
  window.handleItemAddClick = handleItemAddClick;
  window.handleQuickQty = handleQuickQty;
  window.openItemModal = openItemModal;
  window.closeItemModal = closeItemModal;
  window.changeModalQty = changeModalQty;
  window.updateModalCalculatedPrice = updateModalCalculatedPrice;
  window.confirmAddItemToCart = confirmAddItemToCart;
  window.openCartModal = openCartModal;
  window.closeCartModal = closeCartModal;
  window.changeCartItemQty = changeCartItemQty;
  window.removeCartItem = removeCartItem;
  window.submitStaffOrder = submitStaffOrder;
  window.handleBackToPos = handleBackToPos;
  window.handleSuccessBackToTables = handleSuccessBackToTables;
  window.handleResolveConflict = handleResolveConflict;

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})();
