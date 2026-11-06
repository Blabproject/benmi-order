// ========================================================
// Benmi Client Order History & Reorder Module
// Mobile-First Sheet (100dvh fallback), Desktop Centered Modal
// Strictly no-stored-XSS, full zh-TW & vi localization,
// atomic in-place cart mutation, duplicate line aggregation,
// fresh requote, focus trap & robust request lifecycle
// ========================================================

(function () {
  'use strict';

  // --- LOCALIZATION DICTIONARIES ---
  const I18N = {
    'zh-TW': {
      entryLabel: '歷史訂單',
      title: '歷史訂單',
      detailTitle: '訂單詳情',
      reorderTitle: '再點一次確認',
      loading: '載入歷史訂單中...',
      loadingDetail: '載入訂單內容中...',
      loadingReorder: '正在確認最新餐點與價格...',
      emptyTitle: '尚無歷史訂單',
      emptyDesc: '您在此店家的訂購紀錄將會顯示於此。',
      loginTitle: '請先登入 LINE',
      loginDesc: '登入 LINE 帳號後即可查看歷史訂單紀錄與一鍵再點一次。',
      btnLogin: 'LINE 帳號登入',
      errorTitle: '連線載入失敗',
      errorDesc: '請確認網路連線或稍後再試。',
      btnRetry: '重新載入',
      btnLoadMore: '載入更多訂單',
      btnReorder: '再點一次',
      btnConfirmReorder: '確認加入購物車',
      btnBack: '返回',
      btnClose: '關閉',
      btnBrowseMenu: '前往菜單自行挑選',
      orderNumPrefix: '單號',
      orderTimeLabel: '下單時間',
      orderStatusLabel: '訂單狀態',
      diningOptionLabel: '用餐方式',
      totalLabel: '總金額',
      tablePrefix: '桌號',
      portionsLabel: '餐點內容',
      orderChoicesLabel: '全單選項',
      discountLabel: '折扣',
      historyTruncatedLabel: '品項較多，部分明細未展開，請參閱原始訂單內容。',
      statusOther: '訂單狀態更新中',
      noteLabel: '備註',
      reasonLabel: '取消原因',
      noDetailContent: '無詳細餐點內容',
      legacyContentNotice: '歷史訂單明細記錄',
      roundLabel: (n) => `第 ${n} 輪`,
      portionLabel: (n) => `第 ${n} 份`,
      itemsCountSummary: (n) => `${n} 項餐點`,
      statusNew: '新訂單',
      statusAccepted: '製作中',
      statusDone: '已完成',
      statusPicked: '已取餐',
      statusPaid: '已結帳',
      statusRejected: '已取消',
      statusPending: '待付款',
      statusWaitingCustomerChange: '待確認變更',
      statusWaitingCustomerReject: '待確認取消',
      diningTakeaway: '外帶',
      diningDineIn: '內用',
      reorderBannerInfo: '將依目前菜單與最新價格重新加入購物車。',
      reorderBannerWarning: '部分餐點已售完或選項已變更，請確認品項。',
      badgePriceChanged: '價格已變動',
      badgeUnavailable: '已售完/已停售',
      badgeNeedsChoice: '需重新選擇選項',
      badgeClipped: '已達限購上限',
      cartConflictTitle: '購物車已有餐點，要如何處理？',
      conflictMergeTitle: '合併加入現有購物車 (建議)',
      conflictMergeDesc: '保留目前購物車內的餐點，並加入此訂單可再點的品項。',
      conflictReplaceTitle: '替換購物車 (清空目前內容)',
      conflictReplaceDesc: '清空目前購物車，僅保留此訂單可再點的餐點。',
      editModeBlocked: '目前處於修改訂單模式，無法直接套用再點一次。',
      appendModeBlocked: '目前處於加點餐點模式，無法直接套用再點一次。',
      paymentBlocked: '目前有進行中的付款，請先完成或取消付款。',
      mobileOnlyBlocked: '店家設定僅允許於手機 LINE 內開啟點餐。',
      tenantResolutionFailed: '無法解析店家資訊，請重新整理頁面。',
      reorderSuccessMsg: '已成功將餐點加入購物車！',
      reorderPartialMsg: '已將可用餐點加入購物車。部分已售完或需重新選擇選項的餐點未加入，請確認購物車內容。',
      reorderNoneAvailable: '此訂單的餐點目前皆已售完或需手動挑選選項，未變更購物車。',
      reorderChangedWarning: '購物車內容或菜單已更新，已為您重新計算清單。',
      cartNeedsReviewWarning: '現有購物車需手動確認，建議清空替換或返回購物車調整。',
      needsChoiceExpl: '以下餐點因客製選項變更或必填選項未滿足，無法自動放入購物車，請至菜單重新選購：',
      unavailableExpl: '以下餐點目前已售完或已下架，無法再次訂購：',
      estMerchandiseSubtotal: '餐點小計',
      estTotalQualified: '預估總金額：待確認全單選項',
      estTotalLabel: '預估總金額',
      readExistingCartFailed: '讀取現有購物車失敗，請重新整理或選擇替換購物車。',
      warnLegacyText: '此訂單包含舊版純文字點餐記錄，需至菜單重新選購。',
      warnHistoryTruncated: '歷史訂單品項過多，已僅載入前 200 項。',
      warnItemLimit: (name, req, allow) => allow > 0
        ? `【${name}】原選 ${req} 份，本次可再加入 ${allow} 份。`
        : `【${name}】購物車已達限購數量，本次不再加入。`,
      warnOrderOptions: '訂單全單選項需重新選擇。',
      warnExistingCart: '現有購物車內容與新加入餐點衝突，需重新確認。',
      pendingChoicePrice: '待選選項',
    },
    vi: {
      entryLabel: 'Lịch sử đơn',
      title: 'Lịch sử đơn hàng',
      detailTitle: 'Chi tiết đơn hàng',
      reorderTitle: 'Xác nhận đặt lại',
      loading: 'Đang tải lịch sử đơn hàng...',
      loadingDetail: 'Đang tải chi tiết đơn...',
      loadingReorder: 'Đang đối chiếu món và giá hiện tại...',
      emptyTitle: 'Chưa có đơn hàng nào',
      emptyDesc: 'Lịch sử đặt món của bạn tại quán sẽ xuất hiện ở đây.',
      loginTitle: 'Vui lòng đăng nhập LINE',
      loginDesc: 'Đăng nhập LINE để xem lại các đơn hàng cũ và đặt lại nhanh chóng.',
      btnLogin: 'Đăng nhập bằng LINE',
      errorTitle: 'Tải dữ liệu thất bại',
      errorDesc: 'Vui lòng kiểm tra kết nối mạng hoặc thử lại sau.',
      btnRetry: 'Tải lại',
      btnLoadMore: 'Tải thêm đơn hàng',
      btnReorder: 'Đặt lại',
      btnConfirmReorder: 'Xác nhận đưa vào giỏ',
      btnBack: 'Quay lại',
      btnClose: 'Đóng',
      btnBrowseMenu: 'Đến thực đơn chọn món',
      orderNumPrefix: 'Mã đơn',
      orderTimeLabel: 'Thời gian đặt',
      orderStatusLabel: 'Trạng thái đơn',
      diningOptionLabel: 'Hình thức',
      totalLabel: 'Tổng tiền',
      tablePrefix: 'Bàn',
      portionsLabel: 'Danh sách món',
      orderChoicesLabel: 'Tùy chọn chung',
      discountLabel: 'Giảm giá',
      historyTruncatedLabel: 'Đơn có nhiều dòng; xem nội dung gốc để đối chiếu phần chi tiết chưa hiển thị.',
      statusOther: 'Đang cập nhật trạng thái',
      noteLabel: 'Ghi chú',
      reasonLabel: 'Lý do hủy',
      noDetailContent: 'Không có chi tiết món',
      legacyContentNotice: 'Chi tiết đơn hàng cũ',
      roundLabel: (n) => `Đợt ${n}`,
      portionLabel: (n) => `Phần ${n}`,
      itemsCountSummary: (n) => `${n} món`,
      statusNew: 'Mới tạo',
      statusAccepted: 'Đang làm',
      statusDone: 'Đã xong',
      statusPicked: 'Đã nhận món',
      statusPaid: 'Đã thanh toán',
      statusRejected: 'Đã hủy',
      statusPending: 'Chờ thanh toán',
      statusWaitingCustomerChange: 'Chờ khách xác nhận đổi',
      statusWaitingCustomerReject: 'Chờ khách xác nhận hủy',
      diningTakeaway: 'Mang đi',
      diningDineIn: 'Dùng tại quán',
      reorderBannerInfo: 'Các món sẽ được thêm vào giỏ theo thực đơn và giá hiện tại.',
      reorderBannerWarning: 'Một số món đã hết hoặc tùy chọn thay đổi, vui lòng kiểm tra.',
      badgePriceChanged: 'Giá đã đổi',
      badgeUnavailable: 'Hết món / Ngừng bán',
      badgeNeedsChoice: 'Cần chọn lại tùy chọn',
      badgeClipped: 'Giới hạn số lượng',
      cartConflictTitle: 'Giỏ hàng đã có món, bạn muốn xử lý thế nào?',
      conflictMergeTitle: 'Thêm gộp vào giỏ hiện tại (Khuyên dùng)',
      conflictMergeDesc: 'Giữ nguyên các món đang có và thêm các món có thể đặt lại.',
      conflictReplaceTitle: 'Thay thế giỏ hàng (Xóa giỏ hiện tại)',
      conflictReplaceDesc: 'Xóa giỏ hàng hiện tại và chỉ lấy các món của đơn này.',
      editModeBlocked: 'Đang trong chế độ sửa đơn, không thể đặt lại trực tiếp.',
      appendModeBlocked: 'Đang trong chế độ thêm món, không thể đặt lại trực tiếp.',
      paymentBlocked: 'Đang có giao dịch thanh toán chưa hoàn tất.',
      mobileOnlyBlocked: 'Quán chỉ cho phép đặt hàng qua ứng dụng LINE trên điện thoại.',
      tenantResolutionFailed: 'Không thể xác định thông tin quán, vui lòng tải lại trang.',
      reorderSuccessMsg: 'Đã đưa món vào giỏ hàng thành công!',
      reorderPartialMsg: 'Đã thêm các món khả dụng vào giỏ. Các món hết hàng hoặc cần chọn lại tùy chọn không được thêm, vui lòng kiểm tra giỏ hàng.',
      reorderNoneAvailable: 'Các món trong đơn này hiện đã hết hoặc cần tự chọn tùy chọn, giỏ hàng không thay đổi.',
      reorderChangedWarning: 'Nội dung giỏ hàng hoặc thực đơn đã thay đổi, vui lòng xác nhận lại.',
      cartNeedsReviewWarning: 'Giỏ hàng hiện tại cần xem lại, nên chọn thay thế hoặc quay lại giỏ để chỉnh sửa.',
      needsChoiceExpl: 'Các món sau có tùy chọn đã thay đổi hoặc thiếu tùy chọn bắt buộc nên không thể tự động thêm vào giỏ, vui lòng chọn lại tại thực đơn:',
      unavailableExpl: 'Các món sau hiện đã hết hoặc ngừng bán, không thể đặt lại:',
      estMerchandiseSubtotal: 'Tạm tính món',
      estTotalQualified: 'Tổng ước tính: Chờ chọn tùy chọn chung',
      estTotalLabel: 'Tổng ước tính',
      readExistingCartFailed: 'Không thể đọc giỏ hàng hiện tại, vui lòng tải lại hoặc chọn thay thế giỏ hàng.',
      warnLegacyText: 'Đơn này chứa nội dung văn bản cũ, cần chọn lại trên thực đơn.',
      warnHistoryTruncated: 'Đơn hàng quá nhiều món, chỉ hiển thị 200 món đầu tiên.',
      warnItemLimit: (name, req, allow) => allow > 0
        ? `【${name}】Có thể thêm ${allow} trong ${req} phần đã chọn.`
        : `【${name}】Giỏ đã đủ giới hạn số lượng, phần này không được thêm.`,
      warnOrderOptions: 'Tùy chọn chung của đơn cần chọn lại.',
      warnExistingCart: 'Giỏ hàng hiện tại xung đột với món mới, cần kiểm tra lại.',
      pendingChoicePrice: 'Chờ chọn tùy chọn',
    },
  };

  function getAppLang() {
    if (typeof window.currentLocale === 'string' && window.currentLocale) {
      return window.currentLocale.startsWith('vi') ? 'vi' : 'zh-TW';
    }
    try {
      const sp = new URLSearchParams(window.location.search);
      const l = sp.get('lang') || document.documentElement.lang || 'zh-TW';
      return l.startsWith('vi') ? 'vi' : 'zh-TW';
    } catch {
      return 'zh-TW';
    }
  }

  function t(key, ...args) {
    const lang = getAppLang();
    const val = I18N[lang]?.[key] ?? I18N['zh-TW']?.[key] ?? key;
    if (typeof val === 'function') {
      return val(...args);
    }
    return val;
  }

  // --- DOM HELPERS (NO UNTRUSTED innerHTML) ---
  function el(tag, className, textContent) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (textContent !== undefined && textContent !== null) element.textContent = String(textContent);
    return element;
  }

  function svgIcon(markup) {
    const span = document.createElement('span');
    span.style.display = 'inline-flex';
    span.style.alignItems = 'center';
    span.style.justifyContent = 'center';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = markup;
    return span;
  }

  // --- TIME & STATUS FORMATTING ---
  function parseUtcTime(raw) {
    if (!raw) return null;
    const str = String(raw).trim();
    const iso = str.includes('T')
      ? (str.endsWith('Z') || str.includes('+') ? str : str + 'Z')
      : str.replace(' ', 'T') + 'Z';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDateTime(raw) {
    const d = parseUtcTime(raw);
    if (!d) return String(raw || '');
    try {
      const lang = getAppLang();
      return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    } catch {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }

  function formatStatus(status) {
    switch (status) {
      case 'NEW':
        return { text: t('statusNew'), cls: 'coh-status-new' };
      case 'ACCEPTED':
        return { text: t('statusAccepted'), cls: 'coh-status-accepted' };
      case 'DONE':
        return { text: t('statusDone'), cls: 'coh-status-done' };
      case 'PICKED_UP':
        return { text: t('statusPicked'), cls: 'coh-status-picked' };
      case 'PAID':
        return { text: t('statusPaid'), cls: 'coh-status-paid' };
      case 'REJECTED':
      case 'EXPIRED':
      case 'FORCE_REJECT':
        return { text: t('statusRejected'), cls: 'coh-status-rejected' };
      case 'PENDING_PAYMENT':
        return { text: t('statusPending'), cls: 'coh-status-pending' };
      case 'WAITING_CUSTOMER_CHANGE':
        return { text: t('statusWaitingCustomerChange'), cls: 'coh-status-waiting' };
      case 'WAITING_CUSTOMER_REJECT':
        return { text: t('statusWaitingCustomerReject'), cls: 'coh-status-waiting' };
      default:
        return { text: t('statusOther'), cls: 'coh-status-new' };
    }
  }

  // --- STATE VARIABLES ---
  let isOpen = false;
  let currentView = 'list'; // 'list' | 'detail' | 'reorder_preview'
  let ordersList = [];
  let seenOrderKeys = new Set();
  let nextCursor = null;
  let hasMore = false;
  let activeDetailOrder = null;
  let activeReorderPreview = null;
  let activeReorderMode = 'merge'; // 'merge' | 'replace'
  let activeOrderKeyForReorder = null;
  let previewDraftFingerprint = '';
  let lastFocusedElement = null;
  let originalBodyOverflow = '';
  let listScrollTop = 0;
  let fetchSequenceId = 0;
  let activeAbortController = null;
  let isApplyingReorder = false;

  // --- DOM REFERENCES ---
  let overlayEl = null;
  let sheetEl = null;
  let headerTitleEl = null;
  let backBtnEl = null;
  let bodyEl = null;
  let srStatusEl = null;
  let inlineBannerEl = null;

  // --- TENANT & AUTH UTILS ---
  function getTenantId() {
    if (window.__TENANT_RESOLUTION_FAILED) return null;
    if (typeof window.getTenantIdFromUrl === 'function') {
      const id = window.getTenantIdFromUrl();
      if (id) return id;
    }
    return null;
  }

  function getWorkerBase() {
    return window.WORKER_BASE || '';
  }

  async function getAccessToken() {
    if (typeof window.ensureLiffReady === 'function') {
      try {
        await window.ensureLiffReady();
      } catch (e) {
        console.warn('[CustomerHistory] LIFF ready notice:', e);
      }
    }
    if (typeof liff !== 'undefined' && typeof liff.isLoggedIn === 'function' && liff.isLoggedIn()) {
      try {
        return liff.getAccessToken() || null;
      } catch {
        return null;
      }
    }
    return null;
  }

  function checkMobileOnlyPolicy() {
    if (window.storeConfig && Array.isArray(window.storeConfig.features) && window.storeConfig.features.includes('mobile_only')) {
      if (typeof liff !== 'undefined' && typeof liff.isInClient === 'function' && !liff.isInClient()) {
        return false;
      }
    }
    return true;
  }

  function announceStatus(message) {
    if (srStatusEl) {
      srStatusEl.textContent = '';
      setTimeout(() => {
        if (srStatusEl) srStatusEl.textContent = message;
      }, 50);
    }
  }

  function showInlineBanner(type, message) {
    if (!inlineBannerEl) return;
    inlineBannerEl.className = `coh-inline-banner coh-inline-banner-${type}`;
    inlineBannerEl.textContent = message;
    inlineBannerEl.style.display = 'flex';
  }

  function hideInlineBanner() {
    if (inlineBannerEl) {
      inlineBannerEl.style.display = 'none';
      inlineBannerEl.textContent = '';
    }
  }

  // --- GENERIC REQUEST JSON HELPER WITH TIMEOUT & UNIFORM 401 HANDLING ---
  async function requestJson(url, options = {}, timeoutMs = 18000) {
    const controller = new AbortController();
    const callerSignal = options.signal;
    const requestGeneration = fetchSequenceId;
    let callerAbortHandler;

    if (callerSignal) {
      if (callerSignal.aborted) {
        const abErr = new Error('ABORTED');
        abErr.name = 'AbortError';
        throw abErr;
      }
      callerAbortHandler = () => controller.abort();
      callerSignal.addEventListener('abort', callerAbortHandler);
    }

    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        cache: 'no-store',
        ...options,
        signal: controller.signal,
      });

      if (callerSignal?.aborted) throw Object.assign(new Error('ABORTED'), { name: 'AbortError' });

      if (res.status === 401) {
        if (isOpen && requestGeneration === fetchSequenceId) {
          ordersList = [];
          seenOrderKeys.clear();
          nextCursor = null;
          hasMore = false;
          activeDetailOrder = null;
          activeReorderPreview = null;
          renderLoginPrompt();
        }
        const err = new Error('UNAUTHORIZED');
        err.status = 401;
        throw err;
      }

      if (!res.ok) {
        const err = new Error(`HTTP_${res.status}`);
        err.status = res.status;
        try {
          err.data = await res.json();
        } catch {}
        throw err;
      }

      return await res.json();
    } catch (error) {
      if (controller.signal.aborted && !callerSignal?.aborted) {
        throw Object.assign(new Error('REQUEST_TIMEOUT'), { name: 'TimeoutError' });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      if (callerSignal && callerAbortHandler) {
        callerSignal.removeEventListener('abort', callerAbortHandler);
      }
    }
  }

  // --- SIBLING INERT HELPERS FOR STRICT MODAL ACCESSIBILITY ---
  function setSiblingsInert(inert) {
    for (const child of document.body.children) {
      if (child !== overlayEl) {
        if (inert) {
          if (child.dataset.cohPrevInert === undefined) child.dataset.cohPrevInert = child.inert ? '1' : '0';
          child.inert = true;
        } else {
          if (child.dataset.cohPrevInert === '0') {
            child.inert = false;
          }
          delete child.dataset.cohPrevInert;
        }
      }
    }
  }

  // --- UI CREATION & FOCUS TRAP ---
  function buildUI() {
    if (overlayEl) return;

    overlayEl = el('div', 'customer-history-overlay');
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-modal', 'true');
    overlayEl.setAttribute('aria-labelledby', 'coh-modal-title');

    srStatusEl = el('div', 'coh-sr-status');
    srStatusEl.setAttribute('role', 'status');
    srStatusEl.setAttribute('aria-live', 'polite');
    overlayEl.appendChild(srStatusEl);

    sheetEl = el('div', 'customer-history-sheet');
    sheetEl.setAttribute('tabindex', '-1');

    // Header
    const headerEl = el('div', 'customer-history-header');
    const headerLeft = el('div', 'customer-history-header-left');

    backBtnEl = el('button', 'customer-history-btn-icon');
    backBtnEl.type = 'button';
    backBtnEl.setAttribute('aria-label', t('btnBack'));
    backBtnEl.style.display = 'none';
    backBtnEl.appendChild(
      svgIcon(
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>'
      )
    );
    backBtnEl.onclick = handleBackNav;

    headerTitleEl = el('h2', 'customer-history-title', t('title'));
    headerTitleEl.id = 'coh-modal-title';

    headerLeft.appendChild(backBtnEl);
    headerLeft.appendChild(headerTitleEl);

    const closeBtn = el('button', 'customer-history-btn-icon');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', t('btnClose'));
    closeBtn.appendChild(
      svgIcon(
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
      )
    );
    closeBtn.onclick = closeCustomerHistoryModal;

    headerEl.appendChild(headerLeft);
    headerEl.appendChild(closeBtn);

    inlineBannerEl = el('div', 'coh-inline-banner');
    inlineBannerEl.style.display = 'none';

    bodyEl = el('div', 'customer-history-body');

    sheetEl.appendChild(headerEl);
    sheetEl.appendChild(inlineBannerEl);
    sheetEl.appendChild(bodyEl);
    overlayEl.appendChild(sheetEl);

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) {
        closeCustomerHistoryModal();
      }
    });

    overlayEl.addEventListener('keydown', handleOverlayKeydown);

    document.addEventListener('focusin', (e) => {
      if (isOpen && sheetEl && !sheetEl.contains(e.target)) {
        sheetEl.focus();
      }
    });

    document.body.appendChild(overlayEl);
  }

  function handleOverlayKeydown(e) {
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      closeCustomerHistoryModal();
      return;
    }

    if (e.key === 'Tab' && isOpen && sheetEl) {
      const focusables = Array.from(
        sheetEl.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => node.offsetWidth > 0 || node.offsetHeight > 0);

      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === sheetEl) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  function handleBackNav() {
    cancelPendingRequest();
    hideInlineBanner();

    if (currentView === 'reorder_preview') {
      if (activeDetailOrder) {
        renderDetailView(activeDetailOrder);
      } else {
        renderListView();
      }
    } else if (currentView === 'detail') {
      renderListView();
    }
  }

  function cancelPendingRequest() {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    isApplyingReorder = false;
    fetchSequenceId++;
  }

  // --- MODAL LIFECYCLE ---
  async function openCustomerHistoryModal() {
    buildUI();
    if (isOpen) { sheetEl.focus(); return; }

    const tenantId = getTenantId();
    if (!tenantId || !getWorkerBase()) {
      showInlineBanner('error', t('tenantResolutionFailed'));
      renderError(t('tenantResolutionFailed'));
      return;
    }

    if (!checkMobileOnlyPolicy()) {
      if (typeof window.openDesktopQrModal === 'function') {
        window.openDesktopQrModal();
      } else {
        alert(t('mobileOnlyBlocked'));
      }
      return;
    }

    lastFocusedElement = document.activeElement;
    if (!isOpen) {
      originalBodyOverflow = document.body.style.overflow || '';
    }
    document.body.style.overflow = 'hidden';

    isOpen = true;
    overlayEl.classList.add('active');
    setSiblingsInert(true);

    ordersList = [];
    seenOrderKeys.clear();
    nextCursor = null;
    hasMore = false;
    activeDetailOrder = null;
    activeReorderPreview = null;
    activeOrderKeyForReorder = null;
    sheetEl.focus();

    await loadInitialOrders();
  }

  function closeCustomerHistoryModal() {
    if (!isOpen) return;

    cancelPendingRequest();
    hideInlineBanner();

    isOpen = false;
    overlayEl.classList.remove('active');
    setSiblingsInert(false);
    document.body.style.overflow = originalBodyOverflow;
    ordersList = [];
    seenOrderKeys.clear();
    nextCursor = null;
    hasMore = false;
    activeDetailOrder = null;
    activeReorderPreview = null;
    activeOrderKeyForReorder = null;

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  // --- DATA FETCHING & PARSING ---
  async function loadInitialOrders() {
    cancelPendingRequest();
    const reqSeq = ++fetchSequenceId;
    activeAbortController = new AbortController();

    currentView = 'list';
    headerTitleEl.textContent = t('title');
    backBtnEl.style.display = 'none';
    hideInlineBanner();

    renderLoading(t('loading'));

    const token = await getAccessToken();
    if (reqSeq !== fetchSequenceId || !isOpen) return;

    if (!token) {
      renderLoginPrompt();
      return;
    }

    const tenantId = getTenantId();
    const workerBase = getWorkerBase();

    try {
      const data = await requestJson(`${workerBase}/api/customer/orders?limit=10`, {
        signal: activeAbortController.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
        },
      });

      if (reqSeq !== fetchSequenceId || !isOpen) return;

      ordersList = [];
      seenOrderKeys.clear();

      const incoming = Array.isArray(data.orders) ? data.orders : [];
      incoming.forEach((ord) => {
        if (!seenOrderKeys.has(ord.key)) {
          seenOrderKeys.add(ord.key);
          ordersList.push(ord);
        }
      });

      nextCursor = data.nextCursor || null;
      hasMore = Boolean(data.hasMore);

      if (ordersList.length === 0) {
        renderEmpty();
      } else {
        renderListView();
      }
    } catch (err) {
      if (reqSeq !== fetchSequenceId || !isOpen) return;
      if (err.name === 'AbortError' || err.status === 401) return;
      console.error('[CustomerHistory] Load error:', err);
      renderError();
    }
  }

  async function loadMoreOrders() {
    if (!isOpen || currentView !== 'list' || !nextCursor || !hasMore) return;
    const startingGeneration = fetchSequenceId;
    const loadMoreBtn = document.getElementById('coh-btn-load-more');
    if (loadMoreBtn?.disabled) return;
    if (loadMoreBtn) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = t('loading');
    }
    listScrollTop = bodyEl.scrollTop;
    const token = await getAccessToken();
    if (!isOpen || currentView !== 'list' || startingGeneration !== fetchSequenceId) return;
    if (!token) { renderLoginPrompt(); return; }

    const tenantId = getTenantId();
    const workerBase = getWorkerBase();
    const reqSeq = ++fetchSequenceId;
    activeAbortController = new AbortController();

    try {
      const url = new URL(`${workerBase}/api/customer/orders`);
      url.searchParams.set('limit', '10');
      if (nextCursor.before_created_at) url.searchParams.set('before_created_at', nextCursor.before_created_at);
      if (nextCursor.before_key) url.searchParams.set('before_key', nextCursor.before_key);

      const data = await requestJson(url.toString(), {
        signal: activeAbortController.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
        },
      });

      if (reqSeq !== fetchSequenceId || !isOpen) return;

      const incoming = Array.isArray(data.orders) ? data.orders : [];
      incoming.forEach((ord) => {
        if (!seenOrderKeys.has(ord.key)) {
          seenOrderKeys.add(ord.key);
          ordersList.push(ord);
        }
      });

      nextCursor = data.nextCursor || null;
      hasMore = Boolean(data.hasMore);

      renderListView();
    } catch (err) {
      if (reqSeq !== fetchSequenceId || !isOpen) return;
      if (err.name === 'AbortError' || err.status === 401) return;
      console.error('[CustomerHistory] Load more error:', err);
      if (loadMoreBtn) {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = t('btnLoadMore');
      }
      showInlineBanner('error', t('errorDesc'));
    }
  }

  async function loadOrderDetail(orderKey) {
    cancelPendingRequest();
    const reqSeq = ++fetchSequenceId;
    activeAbortController = new AbortController();

    if (bodyEl) listScrollTop = bodyEl.scrollTop;

    currentView = 'detail';
    headerTitleEl.textContent = t('detailTitle');
    backBtnEl.style.display = 'inline-flex';
    hideInlineBanner();

    renderLoading(t('loadingDetail'));

    const token = await getAccessToken();
    if (reqSeq !== fetchSequenceId || !isOpen) return;

    if (!token) {
      renderLoginPrompt();
      return;
    }

    const tenantId = getTenantId();
    const workerBase = getWorkerBase();

    try {
      const data = await requestJson(`${workerBase}/api/customer/orders/detail?key=${encodeURIComponent(orderKey)}`, {
        signal: activeAbortController.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
        },
      });

      if (reqSeq !== fetchSequenceId || !isOpen) return;

      activeDetailOrder = data;
      renderDetailView(data);
    } catch (err) {
      if (reqSeq !== fetchSequenceId || !isOpen) return;
      if (err.name === 'AbortError' || err.status === 401) return;
      console.error('[CustomerHistory] Detail error:', err);
      renderError();
    }
  }

  // --- RENDER STATES ---
  function renderLoading(msg) {
    bodyEl.innerHTML = '';
    const box = el('div', 'coh-state-box');
    const spinner = el('div', 'coh-spinner');
    const text = el('p', 'coh-state-desc', msg || t('loading'));

    box.appendChild(spinner);
    box.appendChild(text);
    bodyEl.appendChild(box);

    if (sheetEl) sheetEl.focus();
    announceStatus(msg || t('loading'));
  }

  function renderLoginPrompt() {
    ordersList = [];
    seenOrderKeys.clear();
    nextCursor = null;
    hasMore = false;
    activeDetailOrder = null;
    activeReorderPreview = null;
    bodyEl.innerHTML = '';
    const box = el('div', 'coh-state-box');

    const iconCircle = el('div', 'coh-state-icon-circle');
    iconCircle.appendChild(
      svgIcon(
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
      )
    );

    const title = el('h3', 'coh-state-title', t('loginTitle'));
    const desc = el('p', 'coh-state-desc', t('loginDesc'));

    const btn = el('button', 'coh-btn-action coh-btn-line', t('btnLogin'));
    btn.type = 'button';
    btn.onclick = () => {
      closeCustomerHistoryModal();
      if (typeof window.triggerDesktopLineLogin === 'function') {
        window.triggerDesktopLineLogin();
      }
    };

    box.appendChild(iconCircle);
    box.appendChild(title);
    box.appendChild(desc);
    box.appendChild(btn);
    bodyEl.appendChild(box);

    announceStatus(t('loginTitle'));
  }

  function renderEmpty() {
    bodyEl.innerHTML = '';
    const box = el('div', 'coh-state-box');

    const iconCircle = el('div', 'coh-state-icon-circle');
    iconCircle.appendChild(
      svgIcon(
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
      )
    );

    const title = el('h3', 'coh-state-title', t('emptyTitle'));
    const desc = el('p', 'coh-state-desc', t('emptyDesc'));

    box.appendChild(iconCircle);
    box.appendChild(title);
    box.appendChild(desc);
    bodyEl.appendChild(box);

    announceStatus(t('emptyTitle'));
  }

  function renderError(customMsg) {
    bodyEl.innerHTML = '';
    const box = el('div', 'coh-state-box');

    const iconCircle = el('div', 'coh-state-icon-circle');
    iconCircle.style.color = '#ef4444';
    iconCircle.appendChild(
      svgIcon(
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
      )
    );

    const title = el('h3', 'coh-state-title', t('errorTitle'));
    const desc = el('p', 'coh-state-desc', customMsg || t('errorDesc'));

    const btn = el('button', 'coh-btn-action coh-btn-secondary', t('btnRetry'));
    btn.type = 'button';
    btn.onclick = loadInitialOrders;

    box.appendChild(iconCircle);
    box.appendChild(title);
    box.appendChild(desc);
    box.appendChild(btn);
    bodyEl.appendChild(box);

    announceStatus(customMsg || t('errorTitle'));
  }

  // --- RENDER ORDER LIST ---
  function renderListView() {
    currentView = 'list';
    headerTitleEl.textContent = t('title');
    backBtnEl.style.display = 'none';
    hideInlineBanner();
    bodyEl.innerHTML = '';

    const listContainer = el('div', 'coh-order-list');

    ordersList.forEach((ord) => {
      const card = el('div', 'coh-order-card');

      const mainBtn = el('button', 'coh-order-card-main');
      mainBtn.type = 'button';
      mainBtn.setAttribute('aria-label', `${t('orderNumPrefix')} ${ord.displayKey || ord.key}`);
      mainBtn.onclick = () => loadOrderDetail(ord.key);

      const cardHeader = el('div', 'coh-order-card-header');
      const metaLeft = el('div', 'coh-order-meta');
      const keyPill = el('span', 'coh-order-key-pill', `#${ord.displayKey || ord.key.slice(-4)}`);
      const diningBadge = el(
        'span',
        'coh-order-dining-badge',
        ord.diningOption === 'dine_in' ? t('diningDineIn') : t('diningTakeaway')
      );

      metaLeft.appendChild(keyPill);
      metaLeft.appendChild(diningBadge);

      const statusInfo = formatStatus(ord.status);
      const statusPill = el('span', `coh-order-status-pill ${statusInfo.cls}`, statusInfo.text);

      cardHeader.appendChild(metaLeft);
      cardHeader.appendChild(statusPill);

      const cardBody = el('div', 'coh-order-card-body');
      let summaryText = ord.itemSummary;
      if (!summaryText && ord.itemCount) {
        summaryText = t('itemsCountSummary', ord.itemCount);
      }
      const itemsSummary = el('div', 'coh-order-items-summary', summaryText || t('portionsLabel'));
      cardBody.appendChild(itemsSummary);

      mainBtn.appendChild(cardHeader);
      mainBtn.appendChild(cardBody);
      card.appendChild(mainBtn);

      const cardFooter = el('div', 'coh-order-card-footer');
      const timeSpan = el('span', 'coh-order-time', formatDateTime(ord.createdAt));

      const actionsRight = el('div', 'coh-order-card-actions');
      const totalSpan = el('span', 'coh-order-total', `$${Number(ord.total ?? 0)}`);

      const reorderBtn = el('button', 'coh-btn-quick-reorder');
      reorderBtn.type = 'button';
      reorderBtn.setAttribute('aria-label', `${t('btnReorder')} #${ord.displayKey || ord.key.slice(-4)}`);
      reorderBtn.appendChild(
        svgIcon(
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>'
        )
      );
      reorderBtn.appendChild(el('span', null, t('btnReorder')));

      reorderBtn.onclick = (e) => {
        e.stopPropagation();
        triggerReorderFlow(ord.key);
      };

      actionsRight.appendChild(totalSpan);
      actionsRight.appendChild(reorderBtn);

      cardFooter.appendChild(timeSpan);
      cardFooter.appendChild(actionsRight);
      card.appendChild(cardFooter);

      listContainer.appendChild(card);
    });

    bodyEl.appendChild(listContainer);

    if (hasMore) {
      const loadMoreWrap = el('div', 'coh-load-more-wrapper');
      const loadMoreBtn = el('button', 'coh-btn-load-more', t('btnLoadMore'));
      loadMoreBtn.type = 'button';
      loadMoreBtn.id = 'coh-btn-load-more';
      loadMoreBtn.onclick = loadMoreOrders;

      loadMoreWrap.appendChild(loadMoreBtn);
      bodyEl.appendChild(loadMoreWrap);
    }

    if (listScrollTop > 0) {
      bodyEl.scrollTop = listScrollTop;
    }
  }

  // --- RENDER DETAIL VIEW ---
  function appendHistoricalGroups(parent, groups, depth = 0) {
    if (depth > 12) return;
    for (const group of groups || []) for (const choice of group.items || []) {
      const quantity = Number(choice.quantity || 1);
      const text = `${group.groupName || group.name || ''}: ${choice.name || ''}${quantity > 1 ? ` ×${quantity}` : ''}` +
        (choice.surcharge ? ` (+$${choice.surcharge})` : '');
      const row = el('div', 'coh-detail-opt-entry', text);
      row.style.paddingInlineStart = `${depth * 12}px`;
      parent.appendChild(row);
      for (const sub of choice.subOptions || []) {
        const name = typeof sub === 'string' ? sub : sub.name || '';
        const price = typeof sub === 'object' && sub.price ? ` (+$${sub.price})` : '';
        const child = el('div', 'coh-detail-opt-entry', `${name}${price}`);
        child.style.paddingInlineStart = `${(depth + 1) * 12}px`;
        parent.appendChild(child);
      }
      appendHistoricalGroups(parent, choice.groups || [], depth + 1);
    }
  }

  function renderDetailView(order) {
    currentView = 'detail';
    headerTitleEl.textContent = `${t('orderNumPrefix')} #${order.displayKey || order.key.slice(-4)}`;
    backBtnEl.style.display = 'inline-flex';
    hideInlineBanner();
    bodyEl.innerHTML = '';

    const detailContainer = el('div', 'coh-detail-container');

    const summaryCard = el('div', 'coh-detail-summary-card');
    const statusInfo = formatStatus(order.status);

    function addRow(labelStr, valNode) {
      const row = el('div', 'coh-detail-row');
      row.appendChild(el('span', 'coh-detail-label', labelStr));
      row.appendChild(valNode);
      summaryCard.appendChild(row);
    }

    addRow(t('orderNumPrefix'), el('span', 'coh-detail-val', `#${order.displayKey || order.key.slice(-4)}`));
    addRow(t('orderTimeLabel'), el('span', 'coh-detail-val', formatDateTime(order.createdAt)));
    addRow(t('orderStatusLabel'), el('span', `coh-order-status-pill ${statusInfo.cls}`, statusInfo.text));
    addRow(
      t('diningOptionLabel'),
      el('span', 'coh-detail-val', order.diningOption === 'dine_in' ? t('diningDineIn') : t('diningTakeaway'))
    );

    const totalVal = el('span', 'coh-detail-val', `$${Number(order.total ?? 0)}`);
    totalVal.style.color = 'var(--coh-primary)';
    totalVal.style.fontSize = '16px';
    addRow(t('totalLabel'), totalVal);

    if (order.note) {
      const noteVal = el('span', 'coh-detail-val', order.note);
      noteVal.style.whiteSpace = 'pre-wrap';
      noteVal.style.textAlign = 'right';
      noteVal.style.maxWidth = '65%';
      noteVal.style.fontWeight = '500';
      addRow(t('noteLabel'), noteVal);
    }

    if (order.reason) {
      const reasonVal = el('span', 'coh-detail-val', order.reason);
      reasonVal.style.color = 'var(--coh-danger-text)';
      addRow(t('reasonLabel'), reasonVal);
    }

    detailContainer.appendChild(summaryCard);
    if (order.truncated) detailContainer.appendChild(el('p', 'coh-warning-item', t('historyTruncatedLabel')));

    // Items Section
    const itemsSection = el('div', 'coh-detail-items-section');
    itemsSection.appendChild(el('h3', 'coh-detail-section-title', t('portionsLabel')));

    if (order.isLegacy && order.legacyContent) {
      const original = el('details');
      original.appendChild(el('summary', null, t('legacyContentNotice')));
      original.appendChild(el('div', 'coh-detail-legacy-box', order.legacyContent));
      original.open = !(order.rounds || []).some(round => round.items?.length);
      itemsSection.appendChild(original);
    }
    if (Array.isArray(order.rounds) && order.rounds.length > 0) {
      order.rounds.forEach((round) => {
        if (round.legacyContent) {
          itemsSection.appendChild(el('div', 'coh-detail-legacy-box', round.legacyContent));
          return;
        }

        if (order.rounds.length > 1) {
          const roundTitle = el('div', null, t('roundLabel', round.roundNumber));
          roundTitle.style.fontSize = '13px';
          roundTitle.style.fontWeight = '800';
          roundTitle.style.color = 'var(--coh-text-muted)';
          roundTitle.style.margin = '8px 0 4px 0';
          itemsSection.appendChild(roundTitle);
        }

        if (round.note) itemsSection.appendChild(el('p', 'coh-state-desc', `${t('noteLabel')}: ${round.note}`));
        if ((round.groups || []).some(group => group.items?.length)) {
          const choices = el('div', 'coh-detail-portion-box');
          choices.appendChild(el('h4', 'coh-detail-section-title', t('orderChoicesLabel')));
          appendHistoricalGroups(choices, round.groups);
          itemsSection.appendChild(choices);
        }
        if (Number(round.discount) > 0) itemsSection.appendChild(el('p', 'coh-state-desc', `${t('discountLabel')}: -$${round.discount}`));

        (round.items || []).forEach((item) => {
          const itemRow = el('div', 'coh-detail-item-row');

          const itemHeader = el('div', 'coh-detail-item-header');
          itemHeader.appendChild(el('div', 'coh-detail-item-name', `${item.quantity} × ${item.name}`));

          const lineSubtotal = item.subtotal ?? (Number(item.unitPrice ?? 0) * Number(item.quantity ?? 1));
          itemHeader.appendChild(el('div', 'coh-detail-item-price', `$${lineSubtotal}`));
          itemRow.appendChild(itemHeader);

          if (item.note) {
            const lineNote = el('div', null, `${t('noteLabel')}: ${item.note}`);
            lineNote.style.fontSize = '12.5px';
            lineNote.style.color = 'var(--coh-text-muted)';
            itemRow.appendChild(lineNote);
          }

          if (Array.isArray(item.portions) && item.portions.length > 0) {
            item.portions.forEach((portion, pIdx) => {
              const portionBox = el('div', 'coh-detail-portion-box');

              if (item.quantity > 1 || portion.note || (portion.groups && portion.groups.length > 0)) {
                portionBox.appendChild(el('div', 'coh-detail-portion-num', t('portionLabel', pIdx + 1)));
              }

              if (portion.note) {
                const pNote = el('div', null, `↳ ${t('noteLabel')}: ${portion.note}`);
                pNote.style.fontStyle = 'italic';
                portionBox.appendChild(pNote);
              }

              if (Array.isArray(portion.groups) && portion.groups.length > 0) {
                const optList = el('div', 'coh-detail-options-list');

                appendHistoricalGroups(optList, portion.groups);
                portionBox.appendChild(optList);
              }

              if (portionBox.children.length > 0) {
                itemRow.appendChild(portionBox);
              }
            });
          } else if (Array.isArray(item.optionsText) && item.optionsText.length > 0) {
            const optList = el('div', 'coh-detail-options-list');
            optList.style.marginTop = '4px';
            item.optionsText.forEach((optStr) => {
              const optEntry = el('div', 'coh-detail-opt-entry', `↳ ${optStr}`);
              optEntry.style.fontSize = '13px';
              optEntry.style.color = 'var(--coh-text-muted)';
              optList.appendChild(optEntry);
            });
            itemRow.appendChild(optList);
          }

          itemsSection.appendChild(itemRow);
        });
      });
    } else if (!order.legacyContent) {
      itemsSection.appendChild(el('div', 'coh-state-desc', t('noDetailContent')));
    }

    detailContainer.appendChild(itemsSection);

    // Reorder Action Bar in Footer
    const footerBar = el('div', 'coh-detail-footer');
    const reorderBtn = el('button', 'coh-btn-action coh-btn-primary');
    reorderBtn.type = 'button';
    reorderBtn.style.flex = '1';
    reorderBtn.appendChild(
      svgIcon(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>'
      )
    );
    reorderBtn.appendChild(el('span', null, t('btnReorder')));
    reorderBtn.onclick = () => triggerReorderFlow(order.key);

    footerBar.appendChild(reorderBtn);
    detailContainer.appendChild(footerBar);

    bodyEl.appendChild(detailContainer);
  }

  // --- REORDER RECONCILIATION & APPLY LOGIC ---
  function computeDraftFingerprint() {
    const cartKeys = Object.keys(window.cart || {}).sort();
    const cartEntries = cartKeys.map((k) => `${k}:${window.cart[k]}`).join(',');
    const custStr = JSON.stringify(window.customizeData || {});
    const bundleStr = JSON.stringify(window.bundleCartData || {});
    const comboStr = JSON.stringify(window.comboDrinkData || {});
    const noteStr = document.getElementById('note')?.value || '';

    let selectionsStr = '';
    if (typeof window.DetailCheckout !== 'undefined' && typeof window.DetailCheckout.selections === 'function') {
      try {
        selectionsStr = JSON.stringify(window.DetailCheckout.selections());
      } catch {}
    }
    return `${cartEntries}|${custStr}|${bundleStr}|${comboStr}|${noteStr}|${selectionsStr}`;
  }

  function semanticPreviewSignature(p) {
    if (!p) return '';
    return JSON.stringify({ orderKey: p.orderKey, mode: p.mode, catalogRevision: p.catalogRevision,
      canReorder: p.canReorder, cartNeedsReview: p.cartNeedsReview, orderOptionsNeedReview: p.orderOptionsNeedReview,
      estimatedMerchandiseSubtotal: p.estimatedMerchandiseSubtotal, estimatedTotal: p.estimatedTotal,
      orderSelections: p.orderSelections || [], repricedCartItems: p.repricedCartItems || [],
      items: (p.items || []).map(item => ({ matchedItemId: item.matchedItemId, matchedName: item.matchedName,
        matchedCatSlug: item.matchedCatSlug, quantity: item.quantity, clippedQuantity: item.clippedQuantity,
        status: item.status, statusReason: item.statusReason, currentPrice: item.currentPrice,
        currentSubtotal: item.currentSubtotal, note: item.note, portions: item.portions || [] })) });
  }

  function orderChoicesNeedReview(preview) {
    return Boolean(preview.orderOptionsNeedReview || (preview.orderSelections || []).some(group =>
      (group.items || []).some(choice => Number(choice.quantity) !== 1 ||
        (choice.groups || []).some(child => (child.items || []).length > 0))));
  }

  function clearCartInPlace(target) {
    if (!target) return;
    for (const key of Object.keys(target)) {
      delete target[key];
    }
  }

  function clearOrderScopeInputs() {
    const panels = document.querySelectorAll('.custom-panel');
    panels.forEach((panel) => {
      panel.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((input) => {
        input.checked = false;
      });
    });
  }

  function applyOrderScopeSelections(selections) {
    if (!Array.isArray(selections)) throw new Error('ORDER_OPTIONS_NEED_REVIEW');
    const models = window.bootstrapData?.customizations || [];
    for (const group of selections) {
      const selected = group.items || [];
      if (!selected.length) continue;
      const model = models.find(value => value.id === group.groupId || value.key === group.groupId);
      if (!model) throw new Error('ORDER_OPTIONS_NEED_REVIEW');
      const inputs = Array.from(document.querySelectorAll('.custom-panel input'))
        .filter(input => input.name === `opt-${model.key}`);
      for (const choice of selected) {
        if (Number(choice.quantity) !== 1 || (choice.groups || []).some(child => child.items?.length))
          throw new Error('ORDER_OPTIONS_NEED_REVIEW');
        const id = choice.optionId || choice.id;
        const input = inputs.find(value => id ? value.dataset.optionId === String(id) : value.value === choice.name);
        if (!input || input.disabled) throw new Error('ORDER_OPTIONS_NEED_REVIEW');
        input.checked = true;
        const subChecks = Array.from(input.closest('.flavor-option-container')?.querySelectorAll('.sub-opt-chk') || []);
        for (const sub of choice.subOptions || []) {
          const key = typeof sub === 'string' ? sub : sub.id || sub.productId || sub.name;
          const target = subChecks.find(value => (value.dataset.subId || value.value) === String(key));
          if (!target || target.disabled) throw new Error('ORDER_OPTIONS_NEED_REVIEW');
          target.checked = true;
        }
      }
    }
    if (typeof window.toggleFlavorSubOptions === 'function') window.toggleFlavorSubOptions();
  }

  async function triggerReorderFlow(orderKey) {
    if (activeDetailOrder?.key !== orderKey) activeDetailOrder = null;
    if (window.isEditOrderMode) {
      showInlineBanner('warning', t('editModeBlocked'));
      return;
    }
    if (window.isAppendMode) {
      showInlineBanner('warning', t('appendModeBlocked'));
      return;
    }
    if (window.LinePayCheckout && typeof window.LinePayCheckout.blocked === 'function' && window.LinePayCheckout.blocked()) {
      showInlineBanner('warning', t('paymentBlocked'));
      return;
    }

    activeOrderKeyForReorder = orderKey;
    const cartHasItems = Object.values(window.cart || {}).some((q) => q > 0);
    activeReorderMode = cartHasItems ? 'merge' : 'replace';

    await fetchReorderPreview(orderKey, activeReorderMode);
  }

  async function fetchReorderPreview(orderKey, mode) {
    cancelPendingRequest();
    const reqSeq = ++fetchSequenceId;
    activeAbortController = new AbortController();

    currentView = 'reorder_preview';
    headerTitleEl.textContent = t('reorderTitle');
    backBtnEl.style.display = 'inline-flex';
    hideInlineBanner();

    renderLoading(t('loadingReorder'));

    const token = await getAccessToken();
    if (reqSeq !== fetchSequenceId || !isOpen) return;

    if (!token) {
      renderLoginPrompt();
      return;
    }

    const tenantId = getTenantId();
    const workerBase = getWorkerBase();

    let cartItems = [];
    let orderSelections = [];
    if (mode === 'merge' && (!window.DetailCheckout?.items || !window.DetailCheckout?.selections)) {
      renderError(t('readExistingCartFailed'));
      return;
    }
    if (mode === 'merge' && typeof window.DetailCheckout !== 'undefined') {
      try {
        if (typeof window.DetailCheckout.items === 'function') cartItems = window.DetailCheckout.items();
        if (typeof window.DetailCheckout.selections === 'function') orderSelections = window.DetailCheckout.selections();
      } catch (e) {
        console.error('[CustomerHistory] Checkout items fetch error:', e);
        showInlineBanner('error', t('readExistingCartFailed'));
        renderError(t('readExistingCartFailed'));
        return;
      }
    }

    previewDraftFingerprint = computeDraftFingerprint();

    try {
      const previewData = await requestJson(
        `${workerBase}/api/customer/orders/reorder-preview`,
        {
          method: 'POST',
          signal: activeAbortController.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Tenant-Id': tenantId,
          },
          body: JSON.stringify({
            orderKey,
            mode,
            cartItems,
            orderSelections,
          }),
        },
        8000
      );

      if (reqSeq !== fetchSequenceId || !isOpen) return;

      activeReorderPreview = previewData;
      renderReorderPreviewView(previewData);
    } catch (err) {
      if (reqSeq !== fetchSequenceId || !isOpen) return;
      if (err.name === 'AbortError' || err.status === 401) return;
      console.error('[CustomerHistory] Preview error:', err);
      renderError();
    }
  }

  function renderReorderPreviewView(preview) {
    currentView = 'reorder_preview';
    headerTitleEl.textContent = t('reorderTitle');
    backBtnEl.style.display = 'inline-flex';
    bodyEl.innerHTML = '';

    const container = el('div', 'coh-preview-container');

    // Warning Banner if items unavailable or needing choices
    const hasWarnings =
      (preview.unavailableCount || 0) > 0 ||
      (preview.needsChoiceCount || 0) > 0 ||
      preview.cartNeedsReview ||
      orderChoicesNeedReview(preview);

    const banner = el(
      'div',
      `coh-preview-banner ${hasWarnings ? 'coh-preview-banner-warning' : 'coh-preview-banner-info'}`
    );
    banner.appendChild(
      svgIcon(
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
      )
    );
    banner.appendChild(el('div', null, hasWarnings ? t('reorderBannerWarning') : t('reorderBannerInfo')));
    container.appendChild(banner);
    if (orderChoicesNeedReview(preview) && !(preview.warnings || []).some(w => w.code === 'ORDER_OPTIONS_NEED_REVIEW')) {
      container.appendChild(el('p', 'coh-warning-item', t('warnOrderOptions')));
    }

    // Specific Warnings Box
    if (Array.isArray(preview.warnings) && preview.warnings.length > 0) {
      const warnBox = el('div', 'coh-warning-box');
      preview.warnings.forEach((w) => {
        let msg = '';
        if (w.code === 'LEGACY_TEXT_REQUIRES_SELECTION') msg = t('warnLegacyText');
        else if (w.code === 'HISTORY_TRUNCATED') msg = t('warnHistoryTruncated');
        else if (w.code === 'ITEM_LIMIT_EXCEEDED') msg = t('warnItemLimit', w.name || '', w.requestedQty, w.allowedQty);
        else if (w.code === 'ORDER_OPTIONS_NEED_REVIEW') msg = t('warnOrderOptions');
        else if (w.code === 'EXISTING_CART_NEEDS_REVIEW') msg = t('warnExistingCart');

        if (msg) {
          const itemWrap = el('div', 'coh-warning-item');
          itemWrap.appendChild(
            svgIcon(
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
            )
          );
          itemWrap.appendChild(el('span', null, msg));
          warnBox.appendChild(itemWrap);
        }
      });
      if (warnBox.children.length > 0) container.appendChild(warnBox);
    }

    // Totals Box (Merchandise Subtotal + Total Qualification)
    const totalsBox = el('div', 'coh-preview-totals-box');
    const merchRow = el('div', 'coh-detail-row');
    merchRow.appendChild(el('span', 'coh-detail-label', t('estMerchandiseSubtotal')));
    merchRow.appendChild(el('span', 'coh-detail-val', `$${Number(preview.estimatedMerchandiseSubtotal ?? 0)}`));
    totalsBox.appendChild(merchRow);

    const estTotalRow = el('div', 'coh-detail-row');
    estTotalRow.style.fontSize = '14.5px';
    if (preview.estimatedTotal === null || orderChoicesNeedReview(preview)) {
      estTotalRow.appendChild(el('span', 'coh-detail-label', t('estTotalQualified')));
      const pendingVal = el('span', 'coh-detail-val', `$${Number(preview.estimatedMerchandiseSubtotal ?? 0)}*`);
      pendingVal.style.color = 'var(--coh-warning-text)';
      estTotalRow.appendChild(pendingVal);
    } else {
      estTotalRow.appendChild(el('span', 'coh-detail-label', t('estTotalLabel')));
      const fullTotalVal = el('span', 'coh-detail-val', `$${Number(preview.estimatedTotal ?? 0)}`);
      fullTotalVal.style.color = 'var(--coh-primary)';
      estTotalRow.appendChild(fullTotalVal);
    }
    totalsBox.appendChild(estTotalRow);
    container.appendChild(totalsBox);

    // Cart Conflict Choice (only rendered if cart currently has items)
    const cartHasItems = Object.values(window.cart || {}).some((q) => q > 0);
    if (cartHasItems) {
      const conflictBox = el('div', 'coh-cart-conflict-box');
      conflictBox.appendChild(el('h4', 'coh-cart-conflict-title', t('cartConflictTitle')));

      // Option 1: Merge (Default recommended)
      const optMerge = el('label', 'coh-conflict-option');
      const radioMerge = document.createElement('input');
      radioMerge.type = 'radio';
      radioMerge.name = 'coh-conflict-mode';
      radioMerge.value = 'merge';
      radioMerge.checked = activeReorderMode === 'merge';
      radioMerge.onchange = () => {
        if (radioMerge.checked && activeReorderMode !== 'merge') {
          activeReorderMode = 'merge';
          fetchReorderPreview(activeOrderKeyForReorder, 'merge');
        }
      };

      const mergeTextWrap = el('div', 'coh-conflict-option-text');
      mergeTextWrap.appendChild(el('span', 'coh-conflict-option-name', t('conflictMergeTitle')));
      mergeTextWrap.appendChild(el('span', 'coh-conflict-option-desc', t('conflictMergeDesc')));

      optMerge.appendChild(radioMerge);
      optMerge.appendChild(mergeTextWrap);
      conflictBox.appendChild(optMerge);

      // Option 2: Replace
      const optReplace = el('label', 'coh-conflict-option');
      const radioReplace = document.createElement('input');
      radioReplace.type = 'radio';
      radioReplace.name = 'coh-conflict-mode';
      radioReplace.value = 'replace';
      radioReplace.checked = activeReorderMode === 'replace';
      radioReplace.onchange = () => {
        if (radioReplace.checked && activeReorderMode !== 'replace') {
          activeReorderMode = 'replace';
          fetchReorderPreview(activeOrderKeyForReorder, 'replace');
        }
      };

      const replaceTextWrap = el('div', 'coh-conflict-option-text');
      replaceTextWrap.appendChild(el('span', 'coh-conflict-option-name', t('conflictReplaceTitle')));
      replaceTextWrap.appendChild(el('span', 'coh-conflict-option-desc', t('conflictReplaceDesc')));

      optReplace.appendChild(radioReplace);
      optReplace.appendChild(replaceTextWrap);
      conflictBox.appendChild(optReplace);

      container.appendChild(conflictBox);
    }

    // Items list
    const itemsList = el('div');
    itemsList.style.display = 'flex';
    itemsList.style.flexDirection = 'column';
    itemsList.style.gap = '8px';

    const items = Array.isArray(preview.items) ? preview.items : [];
    items.forEach((item) => {
      const itemEl = el('div', `coh-preview-item status-${item.status}`);

      const topRow = el('div');
      topRow.style.display = 'flex';
      topRow.style.justifyContent = 'space-between';
      topRow.style.alignItems = 'flex-start';
      topRow.style.gap = '8px';

      const nameBox = el('div');
      nameBox.style.display = 'flex';
      nameBox.style.flexDirection = 'column';
      nameBox.style.gap = '4px';

      const qty = item.status === 'unavailable' ? item.quantity : (item.clippedQuantity ?? item.quantity);
      const displayName = item.matchedName || item.historicalName || '';
      const nameEl = el('span', null, `${qty} × ${displayName}`);
      nameEl.style.fontWeight = '800';
      nameEl.style.fontSize = '14.5px';
      nameBox.appendChild(nameEl);

      const badgesBox = el('div');
      badgesBox.style.display = 'flex';
      badgesBox.style.flexWrap = 'wrap';
      badgesBox.style.gap = '4px';

      if (item.status === 'unavailable' && item.statusReason !== 'ITEM_LIMIT_REACHED') {
        badgesBox.appendChild(el('span', 'coh-badge coh-badge-unavailable', t('badgeUnavailable')));
      } else if (item.status === 'needs_choice') {
        badgesBox.appendChild(el('span', 'coh-badge coh-badge-needs-choice', t('badgeNeedsChoice')));
      }

      if (item.statusReason === 'ITEM_LIMIT_REACHED' || item.wasClipped) {
        badgesBox.appendChild(
          el('span', 'coh-badge coh-badge-clipped', `${t('badgeClipped')} (${item.quantity} → ${item.clippedQuantity})`)
        );
      }

      if (item.priceChanged) {
        const histSub = item.historicalSubtotal ?? (item.historicalUnitPrice || 0) * qty;
        const currSub = item.currentSubtotal ?? (item.currentPrice || 0) * qty;
        badgesBox.appendChild(
          el('span', 'coh-badge coh-badge-price-change', `${t('badgePriceChanged')} ($${histSub} → $${currSub})`)
        );
      }

      if (badgesBox.children.length > 0) {
        nameBox.appendChild(badgesBox);
      }

      const priceEl = el('span');
      priceEl.style.fontWeight = '700';
      priceEl.style.fontSize = '14px';

      if (item.status === 'unavailable') {
        priceEl.style.textDecoration = 'line-through';
        priceEl.style.color = 'var(--coh-text-light)';
        priceEl.textContent = `$${Number(item.historicalSubtotal ?? (item.historicalUnitPrice || 0) * item.quantity)}`;
      } else if (item.status === 'needs_choice') {
        priceEl.style.color = 'var(--coh-warning-text)';
        priceEl.style.fontSize = '12.5px';
        priceEl.textContent = t('pendingChoicePrice');
      } else {
        const lineTotal = item.currentSubtotal ?? (Number(item.currentPrice ?? item.historicalUnitPrice ?? 0) * qty);
        priceEl.textContent = `$${lineTotal}`;
      }

      topRow.appendChild(nameBox);
      topRow.appendChild(priceEl);
      itemEl.appendChild(topRow);

      itemsList.appendChild(itemEl);
    });

    container.appendChild(itemsList);

    // Explanations for needs_choice and unavailable
    const needsChoiceItems = items.filter((i) => i.status === 'needs_choice');
    if (needsChoiceItems.length > 0) {
      const explBox = el('div');
      explBox.style.fontSize = '13px';
      explBox.style.color = 'var(--coh-warning-text)';
      explBox.style.lineHeight = '1.45';
      explBox.textContent = t('needsChoiceExpl');

      const explList = el('ul');
      explList.style.margin = '4px 0 0 16px';
      explList.style.padding = '0';
      needsChoiceItems.forEach((it) => {
        explList.appendChild(el('li', null, it.matchedName || it.historicalName));
      });
      explBox.appendChild(explList);
      container.appendChild(explBox);
    }

    const availableItems = items.filter((i) => i.status === 'available');

    // Action buttons in Footer
    const footerBar = el('div', 'coh-detail-footer');

    const backBtn = el('button', 'coh-btn-action coh-btn-secondary', t('btnBack'));
    backBtn.type = 'button';
    backBtn.onclick = handleBackNav;
    footerBar.appendChild(backBtn);

    // Only enable confirm if canReorder is true and cart does not need review
    if (preview.canReorder && availableItems.length > 0 && !preview.cartNeedsReview) {
      const confirmBtn = el('button', 'coh-btn-action coh-btn-primary', t('btnConfirmReorder'));
      confirmBtn.type = 'button';
      confirmBtn.style.flex = '1';
      confirmBtn.onclick = () => executeReorderApply(preview, activeReorderMode);
      footerBar.appendChild(confirmBtn);
    } else {
      const menuBtn = el('button', 'coh-btn-action coh-btn-primary', t('btnBrowseMenu'));
      menuBtn.type = 'button';
      menuBtn.style.flex = '1';
      menuBtn.onclick = () => {
        closeCustomerHistoryModal();
        const menuEl = document.getElementById('catalog-container') || document.getElementById('menu-section');
        if (menuEl) menuEl.scrollIntoView({ behavior: 'smooth' });
      };
      footerBar.appendChild(menuBtn);
    }

    container.appendChild(footerBar);
    bodyEl.appendChild(container);
  }

  // --- ATOMIC REORDER COMMIT WITH FRESH REQUOTE & STATE ROLLBACK ---
  async function executeReorderApply(preview, mode) {
    if (isApplyingReorder || !isOpen || currentView !== 'reorder_preview') return;
    const blocked = () => window.isEditOrderMode || window.isAppendMode || window.isSubmitting ||
      Boolean(window.LinePayCheckout?.blocked?.());
    if (blocked()) { showInlineBanner('warning', t('reorderChangedWarning')); return; }
    const orderKey = activeOrderKeyForReorder, tenantId = getTenantId(), workerBase = getWorkerBase();
    if (!orderKey || !tenantId || !workerBase || preview.cartNeedsReview || !preview.canReorder) return;
    if (computeDraftFingerprint() !== previewDraftFingerprint) {
      await fetchReorderPreview(orderKey, mode);
      showInlineBanner('warning', t('reorderChangedWarning'));
      return;
    }
    cancelPendingRequest();
    const generation = ++fetchSequenceId, controller = new AbortController();
    activeAbortController = controller;
    isApplyingReorder = true;
    const fingerprint = computeDraftFingerprint();
    const ownsView = () => isOpen && !controller.signal.aborted && generation === fetchSequenceId &&
      currentView === 'reorder_preview' && activeOrderKeyForReorder === orderKey &&
      activeReorderMode === mode && getTenantId() === tenantId;
    const refreshPreview = async () => {
      await fetchReorderPreview(orderKey, mode);
      if (isOpen && activeOrderKeyForReorder === orderKey) showInlineBanner('warning', t('reorderChangedWarning'));
    };
    renderLoading(t('loadingReorder'));
    try {
      const token = await getAccessToken();
      if (!ownsView()) return;
      if (!token) { renderLoginPrompt(); return; }
      let cartItems = [], orderSelections = [];
      if (mode === 'merge') {
        if (!window.DetailCheckout?.items || !window.DetailCheckout?.selections) throw new Error('INVALID_CART');
        cartItems = window.DetailCheckout.items();
        orderSelections = window.DetailCheckout.selections();
      }
      const freshQuote = await requestJson(`${workerBase}/api/customer/orders/reorder-preview`, {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenantId },
        body: JSON.stringify({ orderKey, mode, cartItems, orderSelections }),
      });
      if (!ownsView()) return;
      if (blocked() || computeDraftFingerprint() !== fingerprint) { await refreshPreview(); return; }
      if (semanticPreviewSignature(freshQuote) !== semanticPreviewSignature(preview)) {
        activeReorderPreview = freshQuote;
        renderReorderPreviewView(freshQuote);
        showInlineBanner('warning', t('reorderChangedWarning'));
        return;
      }
      if (!freshQuote.canReorder || freshQuote.cartNeedsReview) {
        activeReorderPreview = freshQuote;
        renderReorderPreviewView(freshQuote);
        showInlineBanner('warning', t('cartNeedsReviewWarning'));
        return;
      }
      const fresh = await requestJson(`${workerBase}/api/tenant/bootstrap?nocache=1&tenant_id=${encodeURIComponent(tenantId)}`,
        { signal: controller.signal });
      if (!ownsView()) return;
      if (blocked() || computeDraftFingerprint() !== fingerprint) { await refreshPreview(); return; }
      if (fresh?.tenant?.id !== tenantId || fresh.menuComplete !== true || !Array.isArray(fresh.catalog) ||
        fresh.catalog.some(category => !Array.isArray(category?.items)) || fresh.orderDetailVersion !== 1 || !fresh.unifiedMenu)
        throw new Error('REORDER_CHANGED');
      if (Number(fresh.menuCatalogRevision) !== Number(freshQuote.catalogRevision)) throw new Error('REORDER_CHANGED');
      const products = new Map();
      for (const category of fresh.catalog) for (const item of category.items)
        products.set(item.id, { item, slug: category.slug });
      const stagedCart = {}, stagedBundle = {}, stagedCustomize = {}, owners = new Map();
      const append = (itemId, quantity, portions, notes, lineNote = '', expectedPrice) => {
        const product = products.get(itemId);
        if (!product || !Number.isInteger(quantity) || quantity <= 0 || !Array.isArray(portions) || portions.length !== quantity)
          throw new Error('REORDER_CHANGED');
        if (product.item.isOutOfStock || (expectedPrice !== undefined && Number(product.item.price) !== Number(expectedPrice)))
          throw new Error('REORDER_CHANGED');
        const key = `${product.slug}_${product.item.name}`;
        if (owners.has(key) && owners.get(key) !== itemId) throw new Error('REORDER_CHANGED');
        owners.set(key, itemId);
        const start = stagedCart[key] || 0;
        const maximum = Number(product.item.maxPerOrder || product.item.max_per_order) || 999;
        if (start + quantity > maximum) throw new Error('REORDER_CHANGED');
        stagedCart[key] = start + quantity;
        stagedBundle[key] ||= [];
        stagedCustomize[key] ||= [];
        for (let i = 0; i < quantity; i++) {
          const portion = portions[i];
          if (!portion || portion.valid === false || !Array.isArray(portion.groups)) throw new Error('REORDER_CHANGED');
          stagedBundle[key].push({ portionIndex: start + i, groups: portion.groups });
          const note = [...new Set([lineNote, notes?.[i] || portion.note || ''].filter(Boolean))].join('; ');
          stagedCustomize[key].push({ single: {}, multiple: {}, selectedDetails: {}, note });
        }
      };
      if (mode === 'merge') {
        const repriced = freshQuote.repricedCartItems;
        if (!Array.isArray(repriced) || repriced.length !== cartItems.length) throw new Error('REORDER_CHANGED');
        repriced.forEach((item, index) => {
          const original = cartItems[index];
          if (item.itemId !== original.itemId || item.quantity !== original.quantity) throw new Error('REORDER_CHANGED');
          append(item.itemId, item.quantity, item.portions, original.portionNotes, original.note);
        });
      }
      let added = 0;
      for (const item of freshQuote.items || []) {
        if (item.status !== 'available') continue;
        const quantity = item.clippedQuantity ?? item.quantity;
        append(item.matchedItemId, quantity, item.portions, item.portions.map(portion => portion.note || ''), item.note || '', item.currentPrice);
        added += quantity;
      }
      if (!added) { renderReorderPreviewView(freshQuote); showInlineBanner('warning', t('reorderNoneAvailable')); return; }
      if (!ownsView() || blocked()) return;
      if (computeDraftFingerprint() !== fingerprint) { await refreshPreview(); return; }
      const clone = value => JSON.parse(JSON.stringify(value || {}));
      const saved = { bootstrap: window.bootstrapData, cart: clone(window.cart), customize: clone(window.customizeData),
        bundle: clone(window.bundleCartData), combo: clone(window.comboDrinkData),
        selections: window.DetailCheckout?.selections?.() || [] };
      const manualOrderReview = orderChoicesNeedReview(freshQuote);
      const desiredSelections = mode === 'merge'
        ? (freshQuote.orderOptionsNeedReview ? orderSelections : freshQuote.orderSelections)
        : (manualOrderReview ? [] : freshQuote.orderSelections);
      try {
        window.bootstrapData = fresh;
        for (const [target, values] of [[window.cart, stagedCart], [window.customizeData, stagedCustomize],
          [window.bundleCartData, stagedBundle], [window.comboDrinkData, {}]]) {
          clearCartInPlace(target); Object.assign(target, values);
        }
        window.buildModifierPriceMap?.(fresh);
        window.updateDynamicStockAndPrices?.();
        window.renderDynamicCatalog?.();
        clearOrderScopeInputs();
        applyOrderScopeSelections(desiredSelections || []);
        window.updateTotal?.();
        window.updateFooterButtonState?.();
        // Reset only after every fallible render and selection mapping succeeded.
        window.DetailCheckout?.reset?.();
      } catch (error) {
        window.bootstrapData = saved.bootstrap;
        for (const [target, values] of [[window.cart, saved.cart], [window.customizeData, saved.customize],
          [window.bundleCartData, saved.bundle], [window.comboDrinkData, saved.combo]]) {
          clearCartInPlace(target); Object.assign(target, values);
        }
        try {
          window.buildModifierPriceMap?.(saved.bootstrap);
          window.updateDynamicStockAndPrices?.();
          window.renderDynamicCatalog?.();
          clearOrderScopeInputs(); applyOrderScopeSelections(saved.selections);
          window.updateTotal?.(); window.updateFooterButtonState?.();
        } catch { console.warn('[CustomerHistory] Draft restored; menu rendering needs refresh'); }
        throw error;
      }
      closeCustomerHistoryModal();
      const partial = freshQuote.unavailableCount > 0 || freshQuote.needsChoiceCount > 0 || manualOrderReview || freshQuote.truncated;
      const message = [t(partial ? 'reorderPartialMsg' : 'reorderSuccessMsg'), manualOrderReview ? t('warnOrderOptions') : ''].filter(Boolean).join('\n');
      if (typeof window.customAlert === 'function') window.customAlert(message); else alert(message);
      document.getElementById('cart-summary')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    } catch (error) {
      if (!ownsView() || error.name === 'AbortError' || error.status === 401) return;
      if (error.message === 'REORDER_CHANGED') { await refreshPreview(); return; }
      renderReorderPreviewView(activeReorderPreview || preview);
      showInlineBanner('error', error.message === 'ORDER_OPTIONS_NEED_REVIEW' ? t('warnOrderOptions') : t('errorDesc'));
    } finally {
      if (activeAbortController === controller) { activeAbortController = null; isApplyingReorder = false; }
    }
  }

  // --- INITIALIZATION ---
  function init() {
    buildUI();

    const entryBtn = document.getElementById('btn-customer-history-entry');
    if (entryBtn) {
      entryBtn.onclick = openCustomerHistoryModal;
      entryBtn.setAttribute('aria-label', t('entryLabel'));
      const textSpan = entryBtn.querySelector('.history-entry-text');
      if (textSpan) textSpan.textContent = t('entryLabel');
    }
  }

  window.CustomerOrderHistory = {
    open: openCustomerHistoryModal,
    close: closeCustomerHistoryModal,
    init,
  };

  window.openCustomerHistoryModal = openCustomerHistoryModal;
  window.closeCustomerHistoryModal = closeCustomerHistoryModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
