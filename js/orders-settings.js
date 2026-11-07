// ==========================================
// Benmi POS - Module: Store Settings & Hours
// ==========================================

let currentStoreStatus = 'open';
let storeOperatingHours = null;
let allowScheduledPickup = true;
let allowDineIn = true;
let currentTenantFeatures = [];
window.currentTenantFeatures = currentTenantFeatures;
let currentStoreLogoUrl = null;
let pendingLogoDataUri = null;

const DAY_NAMES = {
  "zh-TW": ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
  "vi": ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"]
};

function toggleStoreStatusMenu(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById("store-status-dropdown");
  if (dd) dd.classList.toggle("open");
}

// Click outside to close store status menu
document.addEventListener("click", (e) => {
  const dd = document.getElementById("store-status-dropdown");
  if (dd && !dd.contains(e.target)) {
    dd.classList.remove("open");
  }
});

function renderStoreStatusUI(status) {
  currentStoreStatus = status || 'open';
  const btn = document.getElementById("store-status-btn");
  const label = document.getElementById("store-status-label");
  
  if (btn) {
    btn.className = `store-status-pill ${currentStoreStatus}`;
  }
  if (label) {
    if (currentStoreStatus === 'open') label.innerText = t('statusOpen');
    else if (currentStoreStatus === 'busy') label.innerText = t('statusBusy');
    else if (currentStoreStatus === 'paused') label.innerText = t('statusPaused');
    else if (currentStoreStatus === 'closed') label.innerText = t('statusClosed');
  }

  const mobileSub = document.getElementById("sidebar-mobile-sub");
  if (mobileSub) {
    if (currentStoreStatus === 'open') mobileSub.innerText = t('statusOpen');
    else if (currentStoreStatus === 'busy') mobileSub.innerText = t('statusBusy');
    else if (currentStoreStatus === 'paused') mobileSub.innerText = t('statusPaused');
    else if (currentStoreStatus === 'closed') mobileSub.innerText = t('statusClosed');
  }

  // Update options in dropdown menu
  document.querySelectorAll(".status-option").forEach(opt => {
    opt.classList.toggle("active", opt.dataset.status === currentStoreStatus);
  });

  // Update boxes in Settings panel
  document.querySelectorAll(".status-select-box").forEach(box => {
    box.classList.toggle("active", box.id === `status-box-${currentStoreStatus}`);
  });
}

var currentPrepTimeMinutes = 5;

function renderStorePrepTimeUI(mins) {
  if (typeof mins === 'number') currentPrepTimeMinutes = mins;
  const label = t('prepTimeMin', { n: currentPrepTimeMinutes }) || `${currentPrepTimeMinutes} 分鐘`;
  const badge1 = document.getElementById('store-preptime-current-badge');
  const badge2 = document.getElementById('setting-preptime-badge');
  if (badge1) badge1.textContent = label;
  if (badge2) badge2.textContent = label;

  document.querySelectorAll('.preptime-chip, .setting-preptime-btn').forEach(btn => {
    const val = btn.dataset.minutes;
    if (val === 'custom') {
      const isPreset = [5, 10, 15, 20, 30, 45, 60].includes(currentPrepTimeMinutes);
      btn.classList.toggle('active', !isPreset);
    } else {
      btn.classList.toggle('active', Number(val) === currentPrepTimeMinutes);
    }
  });
}

async function setStorePrepTime(mins, e) {
  if (e) e.stopPropagation();
  mins = parseInt(mins, 10);
  if (isNaN(mins) || mins < 0) mins = 5;
  if (mins > 180) mins = 180;

  const prev = currentPrepTimeMinutes;
  renderStorePrepTimeUI(mins);

  try {
    const tenantId = typeof getTenantIdFromUrl === 'function' ? getTenantIdFromUrl() : '';
    const res = await fetch(`${WORKER_BASE}/api/config?tenant_id=${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prepTimeMinutes: mins })
    });
    if (!res.ok) throw new Error("API returned " + res.status);
    if (typeof showToast === 'function') {
      showToast(t('prepTimeSaved', { n: mins }) || `已更新備餐時間為 ${mins} 分鐘`);
    }
  } catch (err) {
    alert((t("saveFail") || "儲存失敗: ") + err.message);
    renderStorePrepTimeUI(prev);
  }
}

function openCustomPrepTimePrompt(e) {
  if (e) e.stopPropagation();
  const input = prompt(t('prepTimePrompt') || '請輸入預估出餐時間（分鐘，0-180）:', currentPrepTimeMinutes);
  if (input !== null) {
    const parsed = parseInt(input.trim(), 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 180) {
      setStorePrepTime(parsed);
    } else {
      alert(t('prepTimeInvalid') || '請輸入 0 至 180 之間的有效分鐘數');
    }
  }
}

async function setStoreStatus(newStatus) {
  if (!['open', 'busy', 'paused', 'closed'].includes(newStatus)) return;
  const dd = document.getElementById("store-status-dropdown");
  if (dd) dd.classList.remove("open");
  if (newStatus === currentStoreStatus) return;

  const prevStatus = currentStoreStatus;
  renderStoreStatusUI(newStatus);

  try {
    const res = await fetch(`${WORKER_BASE}/api/config?tenant_id=${getTenantIdFromUrl()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeStatus: newStatus })
    });
    if (!res.ok) throw new Error("API returned " + res.status);
  } catch (e) {
    alert(t("saveFail") + e.message);
    renderStoreStatusUI(prevStatus);
  }
}

function ensureParsedOperatingHours(raw) {
  if (!raw) return createDefaultOperatingHours();
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      const match = raw.match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/);
      const start = match ? match[1].padStart(5, '0') : "11:00";
      const end = match ? match[2].padStart(5, '0') : "21:00";
      const res = {};
      for (let i = 0; i < 7; i++) res[i] = [{ start, end }];
      return res;
    }
  }
  if (typeof raw === 'object' && raw !== null) {
    const res = {};
    for (let i = 0; i < 7; i++) {
      const s = raw[i] || raw[String(i)] || [];
      res[i] = Array.isArray(s) ? s : [];
    }
    return res;
  }
  return createDefaultOperatingHours();
}

async function loadStoreStatus() {
  try {
    const res = await fetch(`${WORKER_BASE}/api/config?tenant_id=${getTenantIdFromUrl()}&_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.storeStatus) {
        currentStoreStatus = data.storeStatus;
      }
      if (data.allowScheduledPickup !== undefined) {
        allowScheduledPickup = data.allowScheduledPickup;
      }
      if (data.allowDineIn !== undefined) {
        allowDineIn = Boolean(data.allowDineIn);
        window.allowDineIn = allowDineIn;
      }
      if (data.features) {
        currentTenantFeatures = Array.isArray(data.features) ? data.features : (typeof data.features === 'string' ? JSON.parse(data.features) : []);
        window.currentTenantFeatures = currentTenantFeatures;
      }
      if (data.prepTimeMinutes !== undefined) {
        currentPrepTimeMinutes = Number(data.prepTimeMinutes);
      }
      if (data.paymentMethods && Array.isArray(data.paymentMethods)) {
        currentPaymentMethods = data.paymentMethods;
      }
      storeOperatingHours = ensureParsedOperatingHours(data.operatingHours);
    }
  } catch (e) {
    console.error("loadStoreStatus error:", e);
  }
  renderStoreStatusUI(currentStoreStatus);
  renderStorePrepTimeUI(currentPrepTimeMinutes);
  renderPaymentMethodsSetting(currentPaymentMethods, isLinePayConfigured);
  try {
    const tenantId = typeof getTenantIdFromUrl === 'function' ? getTenantIdFromUrl() : '';
    if (tenantId) {
      fetch(`${WORKER_BASE}/api/payments/config?tenant_id=${encodeURIComponent(tenantId)}`)
        .then(r => r.ok ? r.json() : null)
        .then(payCfg => {
          if (payCfg) {
            isLinePayConfigured = payCfg.linePay?.configured === true;
            if (payCfg.paymentMethods && Array.isArray(payCfg.paymentMethods)) {
              currentPaymentMethods = payCfg.paymentMethods;
            }
            renderPaymentMethodsSetting(currentPaymentMethods, isLinePayConfigured);
          }
        })
        .catch(() => {});
    }
  } catch (_) {}
  if (typeof updateDiningFilterStats === "function" && typeof orders !== "undefined") {
    updateDiningFilterStats(orders);
  }
  if (typeof updateHistoryFilterVisibility === "function") {
    updateHistoryFilterVisibility();
  }
  renderLanguageSetting();
  renderDineInSetting();
  renderReportsSetting();
}

function openSettings() {
  if (activeTab === "menu" && !confirmLeaveMenu()) return;
  resetStorePinChangeForm();
  activeTab = "settings";
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".mini-btn").forEach(t => t.classList.remove("active"));
  const tabSettings = document.getElementById("tab-settings");
  if (tabSettings) tabSettings.classList.add("active");
  if (typeof updateSidebarActive === "function") {
    updateSidebarActive("settings");
  }
  document.querySelectorAll(".content").forEach(c => c.style.display = "none");
  const viewSettings = document.getElementById("view-settings");
  if (viewSettings) viewSettings.style.display = "block";
  loadOperatingHours();
  renderLanguageSetting();
  renderDineInSetting();
  loadRestaurantTablesSetting();
  renderReportsSetting();
  renderStorePairingSection();
  loadPOSPrinterSettings();
  initSettingsScrollSpy();
  let lastTab = "setting-card-status";
  try { lastTab = sessionStorage.getItem("last_settings_tab") || lastTab; } catch (e) {}
  switchSettingTab(lastTab);
}

async function loadOperatingHours() {
  const tenantId = getTenantIdFromUrl();

  // Instant render from local cache if available
  try {
    const cachedStr = localStorage.getItem("tenant_branding_" + tenantId) || localStorage.getItem("tenant_theme_" + tenantId);
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      if (cached.storeAddress !== undefined && cached.storeAddress !== null) {
        const addrInput = document.getElementById("setting-store-address-input");
        if (addrInput && !addrInput.value) addrInput.value = cached.storeAddress || "";
      }
      if (cached.announcement !== undefined && cached.announcement !== null) {
        const annInput = document.getElementById("setting-store-announcement-input");
        if (annInput && !annInput.value) annInput.value = cached.announcement || "";
      }
      if (cached.logoUrl && !currentStoreLogoUrl) {
        currentStoreLogoUrl = cached.logoUrl;
        renderStoreLogoUI(cached.logoUrl);
      }
    }
  } catch(e) {}

  if (!currentStoreLogoUrl) {
    const bLogo = document.getElementById("brand-logo");
    if (bLogo && bLogo.src && bLogo.style.display !== "none" && !bLogo.src.endsWith("#")) {
      currentStoreLogoUrl = bLogo.src;
      renderStoreLogoUI(bLogo.src);
    }
  }

  try {
    const res = await fetch(`${WORKER_BASE}/api/config?tenant_id=${tenantId}&_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      storeOperatingHours = ensureParsedOperatingHours(data.operatingHours);
      allowScheduledPickup = data.allowScheduledPickup !== undefined ? data.allowScheduledPickup : true;
      allowDineIn = data.allowDineIn !== undefined ? Boolean(data.allowDineIn) : true;
      window.allowDineIn = allowDineIn;
      if (data.features) {
        currentTenantFeatures = Array.isArray(data.features) ? data.features : (typeof data.features === 'string' ? JSON.parse(data.features) : []);
        window.currentTenantFeatures = currentTenantFeatures;
      }
      if (data.storeStatus) currentStoreStatus = data.storeStatus;
      if (data.storeAddress !== undefined && data.storeAddress !== null) {
        const addrInput = document.getElementById("setting-store-address-input");
        if (addrInput) addrInput.value = data.storeAddress || "";
      }
      if (data.announcement !== undefined && data.announcement !== null) {
        const annInput = document.getElementById("setting-store-announcement-input");
        if (annInput) annInput.value = data.announcement || "";
      }
      if (data.logoUrl) {
        currentStoreLogoUrl = data.logoUrl;
        renderStoreLogoUI(data.logoUrl);
      } else if (!currentStoreLogoUrl) {
        currentStoreLogoUrl = null;
        renderStoreLogoUI(null);
      }
    } else {
      storeOperatingHours = createDefaultOperatingHours();
      allowScheduledPickup = true;
      allowDineIn = true;
      window.allowDineIn = allowDineIn;
      if (!currentStoreLogoUrl) renderStoreLogoUI(null);
    }
  } catch (e) {
    storeOperatingHours = createDefaultOperatingHours();
    allowScheduledPickup = true;
    allowDineIn = true;
    window.allowDineIn = allowDineIn;
    if (!currentStoreLogoUrl) renderStoreLogoUI(null);
  }
  renderStoreStatusUI(currentStoreStatus);
  renderOperatingHours();
  renderScheduledPickupSetting();
  renderPaymentMethodsSetting();
  renderDineInSetting();
  if (typeof updateHistoryFilterVisibility === "function") {
    updateHistoryFilterVisibility();
  }
}

function renderScheduledPickupSetting() {
  const radioTrue = document.getElementById("setting-allow-scheduled-true");
  const radioFalse = document.getElementById("setting-allow-scheduled-false");
  if (radioTrue && radioFalse) {
    radioTrue.checked = (allowScheduledPickup === true);
    radioFalse.checked = (allowScheduledPickup === false);
  }
  updateModeCardStyles(allowScheduledPickup);
  renderStorePrepTimeUI(currentPrepTimeMinutes);
}

function updateModeCardStyles(isScheduled) {
  const cardScheduled = document.getElementById("mode-card-scheduled");
  const cardAsap = document.getElementById("mode-card-asap");
  if (cardScheduled && cardAsap) {
    if (isScheduled) {
      cardScheduled.style.borderColor = "var(--primary)";
      cardScheduled.style.background = "rgba(0, 185, 0, 0.05)";
      cardAsap.style.borderColor = "var(--border)";
      cardAsap.style.background = "#fff";
    } else {
      cardAsap.style.borderColor = "var(--primary)";
      cardAsap.style.background = "rgba(0, 185, 0, 0.05)";
      cardScheduled.style.borderColor = "var(--border)";
      cardScheduled.style.background = "#fff";
    }
  }
}

function onPickupModeChange(isScheduled) {
  allowScheduledPickup = isScheduled;
  updateModeCardStyles(isScheduled);
}

async function saveScheduledPickupSetting() {
  const btn = document.getElementById("btn-save-pickup-setting");
  const oldText = btn ? btn.innerText : "";
  if (btn) { btn.innerText = t("saving"); btn.disabled = true; }
  try {
    const res = await fetch(`${WORKER_BASE}/api/config?tenant_id=${getTenantIdFromUrl()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allowScheduledPickup: allowScheduledPickup,
        prepTimeMinutes: currentPrepTimeMinutes
      })
    });
    if (!res.ok) throw new Error("API returned " + res.status);
    alert(t("saveSuccess"));
  } catch (e) {
    alert(t("saveFail") + e.message);
  } finally {
    if (btn) { btn.innerText = oldText; btn.disabled = false; }
  }
}

var currentPaymentMethods = ['line_pay'];
var isLinePayConfigured = false;

function togglePaymentCardStyle(opt) {
  const isLinePay = opt === 'line_pay';
  const card = document.getElementById(isLinePay ? 'payment-card-linepay' : 'payment-card-cash');
  const input = document.getElementById(isLinePay ? 'setting-payment-opt-linepay' : 'setting-payment-opt-cash');
  if (card && input) {
    if (input.checked) {
      card.style.borderColor = 'var(--primary)';
      card.style.background = 'rgba(0, 185, 0, 0.04)';
    } else {
      card.style.borderColor = 'var(--border)';
      card.style.background = '#fff';
    }
  }
}
window.togglePaymentCardStyle = togglePaymentCardStyle;

function renderPaymentMethodsSetting(methods, linePayConfigured) {
  if (Array.isArray(methods) && methods.length > 0) {
    currentPaymentMethods = methods;
  }
  if (linePayConfigured !== undefined) {
    isLinePayConfigured = Boolean(linePayConfigured);
  }

  if (!isLinePayConfigured) currentPaymentMethods = ['cash'];

  const linepayInput = document.getElementById('setting-payment-opt-linepay');
  const cashInput = document.getElementById('setting-payment-opt-cash');
  if (linepayInput) {
    linepayInput.checked = currentPaymentMethods.includes('line_pay');
    linepayInput.disabled = !isLinePayConfigured;
  }
  if (cashInput) {
    cashInput.checked = currentPaymentMethods.includes('cash');
    cashInput.disabled = !isLinePayConfigured;
  }

  togglePaymentCardStyle('line_pay');
  togglePaymentCardStyle('cash');

  const linepayCard = document.getElementById('payment-card-linepay');
  if (linepayCard) {
    linepayCard.setAttribute('aria-disabled', String(!isLinePayConfigured));
    linepayCard.style.opacity = isLinePayConfigured ? '1' : '0.55';
    linepayCard.style.cursor = isLinePayConfigured ? 'pointer' : 'not-allowed';
    if (!isLinePayConfigured) linepayCard.style.background = '#f3f4f6';
  }
  const cashCard = document.getElementById('payment-card-cash');
  if (cashCard) cashCard.style.cursor = isLinePayConfigured ? 'pointer' : 'default';
  const hint = document.getElementById('i18n-payment-settings-hint');
  if (hint) hint.textContent = t(isLinePayConfigured ? 'paymentSettingsHint' : 'paymentSettingsUnavailableHint');

  const badge = document.getElementById('setting-payment-linepay-badge');
  if (badge) {
    if (isLinePayConfigured) {
      badge.textContent = t('paymentBadgeActive') || '已啟用';
      badge.style.background = '#ecfdf5';
      badge.style.color = '#047857';
    } else {
      badge.textContent = t('paymentBadgeInactive') || '未啟用';
      badge.style.background = '#f3f4f6';
      badge.style.color = '#6b7280';
    }
  }
}
window.renderPaymentMethodsSetting = renderPaymentMethodsSetting;

async function savePaymentMethodsSetting() {
  const linepay = isLinePayConfigured && document.getElementById('setting-payment-opt-linepay')?.checked;
  const cash = !isLinePayConfigured || document.getElementById('setting-payment-opt-cash')?.checked;

  if (!linepay && !cash) {
    alert(t('paymentMinOneRequired') || '請至少選擇一種付款方式！');
    return;
  }

  const newMethods = [];
  if (linepay) newMethods.push('line_pay');
  if (cash) newMethods.push('cash');

  const btn = document.getElementById('btn-save-payment-setting');
  const oldText = btn ? btn.innerText : '';
  if (btn) { btn.innerText = t('saving') || '儲存中...'; btn.disabled = true; }

  try {
    const tenantId = typeof getTenantIdFromUrl === 'function' ? getTenantIdFromUrl() : '';
    const res = await fetch(`${WORKER_BASE}/api/config?tenant_id=${tenantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethods: newMethods })
    });
    if (!res.ok) throw new Error('API returned ' + res.status);

    currentPaymentMethods = newMethods;
    renderPaymentMethodsSetting(newMethods);
    if (typeof showToast === 'function') {
      showToast(t('paymentSettingsSaved') || '已成功儲存付款方式設定！');
    } else {
      alert(t('paymentSettingsSaved') || '已成功儲存付款方式設定！');
    }
  } catch (err) {
    alert((t('saveFail') || '儲存失敗: ') + err.message);
  } finally {
    if (btn) { btn.innerText = oldText || t('btnSaveSetting') || '儲存設定'; btn.disabled = false; }
  }
}
window.savePaymentMethodsSetting = savePaymentMethodsSetting;

function openPaymentSettingsFromWorkspace() {
  if (typeof switchTab === 'function') switchTab('settings');
  if (typeof switchSettingTab === 'function') switchSettingTab('setting-card-payment');
}
window.openPaymentSettingsFromWorkspace = openPaymentSettingsFromWorkspace;

function updateTocFeatureItem(tocId, labelId, i18nKey, unlockedSvg, isFeatureEnabled) {
  const tocItem = document.getElementById(tocId);
  if (!tocItem) return;
  const lockSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
  const targetSvg = isFeatureEnabled ? unlockedSvg : lockSvg;
  
  const iconBox = tocItem.querySelector(".toc-icon-box");
  const label = document.getElementById(labelId);
  const chevron = tocItem.querySelector(".toc-chevron");

  if (!iconBox || !label || !chevron) {
    tocItem.innerHTML = `
      <div class="toc-icon-box">${targetSvg}</div>
      <span class="toc-item-label" id="${labelId}">${typeof t === 'function' ? t(i18nKey) : ''}</span>
      <svg class="toc-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    `;
  } else {
    iconBox.innerHTML = targetSvg;
    if (typeof t === 'function') label.innerText = t(i18nKey);
  }
}

function renderDineInSetting() {
  const isFeatureEnabled = Array.isArray(window.currentTenantFeatures)
    ? window.currentTenantFeatures.includes('dine_in')
    : (Array.isArray(currentTenantFeatures) ? currentTenantFeatures.includes('dine_in') : false);

  const unlockedBody = document.getElementById("setting-dinein-unlocked-body");
  const lockedBody = document.getElementById("setting-dinein-locked-body");
  const saveBtn = document.getElementById("btn-save-dinein-setting");

  const DINEIN_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2"></path><path d="M15 2v10"></path><path d="M15 14v8"></path><path d="M6 2v20"></path><path d="M6 2a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3"></path></svg>`;
  updateTocFeatureItem("toc-item-dinein", "i18n-toc-dinein", "tocDineIn", DINEIN_SVG, isFeatureEnabled);

  if (!isFeatureEnabled) {
    if (unlockedBody) unlockedBody.style.display = "none";
    if (lockedBody) lockedBody.style.display = "flex";
    if (saveBtn) saveBtn.style.display = "none";
    return;
  }

  if (unlockedBody) unlockedBody.style.display = "flex";
  if (lockedBody) lockedBody.style.display = "none";
  if (saveBtn) saveBtn.style.display = "block";

  const radioTrue = document.getElementById("setting-allow-dinein-true");
  const radioFalse = document.getElementById("setting-allow-dinein-false");
  if (radioTrue && radioFalse) {
    radioTrue.checked = (allowDineIn === true);
    radioFalse.checked = (allowDineIn === false);
  }
  updateDineInCardStyles(allowDineIn);
}

function updateDineInCardStyles(isAllowed) {
  const cardTrue = document.getElementById("mode-card-dinein-true");
  const cardFalse = document.getElementById("mode-card-dinein-false");
  if (cardTrue && cardFalse) {
    if (isAllowed) {
      cardTrue.style.borderColor = "var(--primary)";
      cardTrue.style.background = "rgba(0, 185, 0, 0.05)";
      cardFalse.style.borderColor = "var(--border)";
      cardFalse.style.background = "#fff";
    } else {
      cardFalse.style.borderColor = "var(--primary)";
      cardFalse.style.background = "rgba(0, 185, 0, 0.05)";
      cardTrue.style.borderColor = "var(--border)";
      cardTrue.style.background = "#fff";
    }
  }
}

function onDineInModeChange(isAllowed) {
  allowDineIn = isAllowed;
  updateDineInCardStyles(isAllowed);
}

async function saveDineInSetting() {
  const btn = document.getElementById("btn-save-dinein-setting");
  const oldText = btn ? btn.innerText : "";
  if (btn) { btn.innerText = t("saving"); btn.disabled = true; }
  try {
    const res = await fetch(`${WORKER_BASE}/api/config?tenant_id=${getTenantIdFromUrl()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowDineIn: allowDineIn })
    });
    if (!res.ok) throw new Error("API returned " + res.status);
    window.allowDineIn = allowDineIn;
    if (typeof updateHistoryFilterVisibility === "function") {
      updateHistoryFilterVisibility();
    }
    if (typeof updateDiningFilterStats === "function" && typeof orders !== "undefined") {
      updateDiningFilterStats(orders);
    }
    alert(t("dineInSaveSuccess") || t("saveSuccess"));
  } catch (e) {
    alert((t("dineInSaveFail") || t("saveFail")) + e.message);
  } finally {
    if (btn) { btn.innerText = oldText; btn.disabled = false; }
  }
}

function createDefaultOperatingHours() {
  let hrs = {};
  for (let i = 0; i < 7; i++) hrs[i] = [{ start: "08:00", end: "21:00" }];
  return hrs;
}

function renderOperatingHours() {
  const container = document.getElementById("hours-settings-list") || document.getElementById("settings-hours-container");
  if (!container) return;
  container.innerHTML = "";
  const dayNamesList = DAY_NAMES[currentLang] || DAY_NAMES["zh-TW"];
  for (let i = 1; i <= 7; i++) {
    const dayIdx = i === 7 ? 0 : i;
    const shifts = (storeOperatingHours && storeOperatingHours[dayIdx]) || [];
    const isOpen = shifts.length > 0;
    const row = document.createElement("div");
    row.style.cssText = "background: #fff; border: 1.5px solid var(--border, #e2e8f0); border-radius: 12px; padding: 14px 16px; transition: all 0.15s ease;";
    let shiftsHtml = "";
    shifts.forEach((shift, sIdx) => {
      shiftsHtml += `
        <div style="display:flex; gap:10px; align-items:center; margin-top:10px;">
          <input type="time" id="sh-start-${dayIdx}-${sIdx}" value="${shift.start}" style="flex:1; padding:8px 12px; font-family:inherit; border:1.5px solid var(--border, #cbd5e1); border-radius:8px; font-size:var(--pos-text-body); font-weight:600; outline:none;">
          <span style="font-weight:900; color:#64748b;">-</span>
          <input type="time" id="sh-end-${dayIdx}-${sIdx}" value="${shift.end}" style="flex:1; padding:8px 12px; font-family:inherit; border:1.5px solid var(--border, #cbd5e1); border-radius:8px; font-size:var(--pos-text-body); font-weight:600; outline:none;">
          <button type="button" onclick="removeShift(${dayIdx}, ${sIdx})" style="background:#fee2e2; border:1px solid #fca5a5; color:#dc2626; cursor:pointer; font-size:var(--pos-text-body); width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">✕</button>
        </div>`;
    });
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:var(--pos-text-body); font-weight:800; color:#1e293b;">
          <input type="checkbox" ${isOpen ? 'checked' : ''} onchange="toggleDayStatus(${dayIdx}, this.checked)" style="width:20px; height:20px; accent-color:var(--primary, #00b900);">
          <span style="color:${isOpen ? '#0f172a' : '#94a3b8'};">${dayNamesList[dayIdx]}</span>
        </label>
        ${isOpen ? `<button type="button" onclick="addShift(${dayIdx})" style="font-size:var(--pos-text-meta); background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:800;">${t('btnAddShift')}</button>` : `<span style="font-size:var(--pos-text-meta); color:#ef4444; font-weight:800; background:#fef2f2; padding:4px 8px; border-radius:6px; border:1px solid #fee2e2;">${t('closedDay')}</span>`}
      </div>
      ${isOpen ? `<div id="shifts-box-${dayIdx}">${shiftsHtml}</div>` : ''}`;
    container.appendChild(row);
  }
}

function syncOperatingHoursFromDOM() {
  if (!storeOperatingHours) return;
  for (let i = 0; i < 7; i++) {
    const shifts = storeOperatingHours[i];
    if (shifts && shifts.length > 0) {
      shifts.forEach((shift, sIdx) => {
        const elStart = document.getElementById(`sh-start-${i}-${sIdx}`);
        const elEnd = document.getElementById(`sh-end-${i}-${sIdx}`);
        if (elStart && elEnd) { shift.start = elStart.value; shift.end = elEnd.value; }
      });
    }
  }
}

function toggleDayStatus(dayIdx, isChecked) {
  if (!storeOperatingHours) storeOperatingHours = createDefaultOperatingHours();
  storeOperatingHours[dayIdx] = isChecked ? [{ start: "08:00", end: "21:00" }] : [];
  renderOperatingHours();
}

function addShift(dayIdx) {
  if (!storeOperatingHours) storeOperatingHours = createDefaultOperatingHours();
  syncOperatingHoursFromDOM();
  if (!storeOperatingHours[dayIdx]) storeOperatingHours[dayIdx] = [];
  storeOperatingHours[dayIdx].push({ start: "12:00", end: "13:00" });
  renderOperatingHours();
}

function removeShift(dayIdx, sIdx) {
  if (!storeOperatingHours) return;
  syncOperatingHoursFromDOM();
  if (storeOperatingHours[dayIdx]) {
    storeOperatingHours[dayIdx].splice(sIdx, 1);
  }
  renderOperatingHours();
}

async function saveOperatingHours() {
  syncOperatingHoursFromDOM();
  const btn = document.getElementById("btn-save-hours");
  const oldText = btn ? btn.innerText : "";
  if (btn) { btn.innerText = t("saving"); btn.disabled = true; }
  try {
    const res = await fetch(`${WORKER_BASE}/api/config?tenant_id=${getTenantIdFromUrl()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operatingHours: storeOperatingHours })
    });
    if (!res.ok) throw new Error("API returned " + res.status);
    alert(t("saveSuccess"));
  } catch (e) {
    alert(t("saveFail") + e.message);
  } finally {
    if (btn) { btn.innerText = oldText; btn.disabled = false; }
  }
}

function updateLocalTenantBranding(patch) {
  try {
    const tenantId = getTenantIdFromUrl();
    const key = "tenant_branding_" + tenantId;
    const raw = localStorage.getItem(key) || localStorage.getItem("tenant_theme_" + tenantId);
    const obj = raw ? JSON.parse(raw) : {};
    Object.assign(obj, patch);
    localStorage.setItem(key, JSON.stringify(obj));
    localStorage.setItem("tenant_theme_" + tenantId, JSON.stringify(obj));
  } catch(e) {}
}

async function saveStoreAddressSetting() {
  const addrInput = document.getElementById("setting-store-address-input");
  const newAddress = addrInput ? addrInput.value.trim() : "";
  const btn = document.getElementById("btn-save-address-setting");
  const oldText = btn ? btn.innerText : "";
  if (btn) { btn.innerText = t("saving"); btn.disabled = true; }
  try {
    const res = await fetch(`${WORKER_BASE}/api/config?tenant_id=${getTenantIdFromUrl()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeAddress: newAddress })
    });
    if (!res.ok) throw new Error("API returned " + res.status);
    updateLocalTenantBranding({ storeAddress: newAddress });
    alert(t("saveSuccess"));
  } catch (e) {
    alert(t("saveFail") + e.message);
  } finally {
    if (btn) { btn.innerText = oldText; btn.disabled = false; }
  }
}

async function saveStoreAnnouncementSetting() {
  const annInput = document.getElementById("setting-store-announcement-input");
  const newAnnouncement = annInput ? annInput.value.trim() : "";
  const btn = document.getElementById("btn-save-announcement-setting");
  const oldText = btn ? btn.innerText : "";
  if (btn) { btn.innerText = t("saving"); btn.disabled = true; }
  try {
    const res = await fetch(`${WORKER_BASE}/api/config?tenant_id=${getTenantIdFromUrl()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcement: newAnnouncement })
    });
    if (!res.ok) throw new Error("API returned " + res.status);
    updateLocalTenantBranding({ announcement: newAnnouncement });
    alert(t("saveSuccess"));
  } catch (e) {
    alert(t("saveFail") + e.message);
  } finally {
    if (btn) { btn.innerText = oldText; btn.disabled = false; }
  }
}

// --- Logo Management ---
function renderStoreLogoUI(url) {
  const preview = document.getElementById("setting-logo-preview");
  const placeholder = document.getElementById("setting-logo-placeholder");
  const delBtn = document.getElementById("btn-delete-logo-setting");
  if (url) {
    if (preview) { preview.src = url; preview.style.display = "block"; }
    if (placeholder) placeholder.style.display = "none";
    if (delBtn) delBtn.style.display = "inline-block";
  } else {
    if (preview) { preview.src = ""; preview.style.display = "none"; }
    if (placeholder) placeholder.style.display = "block";
    if (delBtn) delBtn.style.display = "none";
  }
}

function handleSettingLogoSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const rawDataUri = e.target.result;
    // Compress image client-side if needed using Canvas (max 512px)
    const img = new Image();
    img.onload = () => {
      const maxDim = 512;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      pendingLogoDataUri = canvas.toDataURL("image/png");
      renderStoreLogoUI(pendingLogoDataUri);
    };
    img.src = rawDataUri;
  };
  reader.readAsDataURL(file);
}

async function saveStoreLogoSetting() {
  if (!pendingLogoDataUri && !currentStoreLogoUrl) {
    alert(t("logoUploadPrompt"));
    return;
  }

  const btn = document.getElementById("btn-save-logo-setting");
  const oldText = btn ? btn.innerText : "";
  if (btn) { btn.innerText = t("saving"); btn.disabled = true; }

  const tenantId = getTenantIdFromUrl();

  try {
    let finalLogoUrl = currentStoreLogoUrl;

    // If there is a new image selected, upload it via /api/image
    if (pendingLogoDataUri) {
      const imgRes = await fetch(`${WORKER_BASE}/api/image?tenant_id=${tenantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "store_logo",
          dataUri: pendingLogoDataUri
        })
      });
      if (!imgRes.ok) throw new Error("Upload logo image failed: " + imgRes.status);
      finalLogoUrl = `${WORKER_BASE}/api/image?tenant_id=${tenantId}&name=store_logo&_t=${Date.now()}`;
    }

    // Update config with logoUrl
    const res = await fetch(`${WORKER_BASE}/api/config?tenant_id=${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: finalLogoUrl })
    });
    if (!res.ok) throw new Error("API returned " + res.status);

    currentStoreLogoUrl = finalLogoUrl;
    pendingLogoDataUri = null;
    renderStoreLogoUI(finalLogoUrl);

    // Update topbar brand-logo immediately
    const bLogo = document.getElementById("brand-logo");
    if (bLogo && finalLogoUrl) {
      bLogo.src = finalLogoUrl;
      bLogo.style.display = "block";
    }

    updateLocalTenantBranding({ logoUrl: finalLogoUrl });
    alert(t("saveSuccess"));
  } catch (e) {
    alert(t("saveFail") + e.message);
  } finally {
    if (btn) { btn.innerText = oldText; btn.disabled = false; }
  }
}

async function deleteStoreLogoSetting() {
  if (!confirm(t("confirmDeleteLogo"))) return;

  const btn = document.getElementById("btn-delete-logo-setting");
  const oldText = btn ? btn.innerText : "";
  if (btn) { btn.innerText = t("saving"); btn.disabled = true; }

  const tenantId = getTenantIdFromUrl();

  try {
    const res = await fetch(`${WORKER_BASE}/api/config?tenant_id=${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: "" })
    });
    if (!res.ok) throw new Error("API returned " + res.status);

    currentStoreLogoUrl = null;
    pendingLogoDataUri = null;
    renderStoreLogoUI(null);

    const bLogo = document.getElementById("brand-logo");
    if (bLogo) {
      bLogo.src = "";
      bLogo.style.display = "none";
    }

    updateLocalTenantBranding({ logoUrl: null });
    alert(t("logoDeleteSuccess"));
  } catch (e) {
    alert(t("saveFail") + e.message);
  } finally {
    if (btn) { btn.innerText = oldText; btn.disabled = false; }
  }
}

async function saveAllStoreInfoSettings() {
  const btn = document.getElementById("btn-save-all-store-info");
  const oldText = btn ? btn.innerText : "";
  if (btn) { btn.innerText = t("saving"); btn.disabled = true; }

  const tenantId = getTenantIdFromUrl();
  const addrInput = document.getElementById("setting-store-address-input");
  const annInput = document.getElementById("setting-store-announcement-input");
  const newAddress = addrInput ? addrInput.value.trim() : "";
  const newAnnouncement = annInput ? annInput.value.trim() : "";

  try {
    let finalLogoUrl = currentStoreLogoUrl;

    if (pendingLogoDataUri) {
      const imgRes = await fetch(`${WORKER_BASE}/api/image?tenant_id=${tenantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "store_logo",
          dataUri: pendingLogoDataUri
        })
      });
      if (!imgRes.ok) throw new Error("Upload logo image failed: " + imgRes.status);
      finalLogoUrl = `${WORKER_BASE}/api/image?tenant_id=${tenantId}&name=store_logo&_t=${Date.now()}`;
    }

    const payload = {
      storeAddress: newAddress,
      announcement: newAnnouncement
    };
    if (finalLogoUrl !== undefined && finalLogoUrl !== null) {
      payload.logoUrl = finalLogoUrl;
    }

    const res = await fetch(`${WORKER_BASE}/api/config?tenant_id=${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("API returned " + res.status);

    if (finalLogoUrl) {
      currentStoreLogoUrl = finalLogoUrl;
      pendingLogoDataUri = null;
      renderStoreLogoUI(finalLogoUrl);
      const bLogo = document.getElementById("brand-logo");
      if (bLogo) {
        bLogo.src = finalLogoUrl;
        bLogo.style.display = "block";
      }
    }

    updateLocalTenantBranding({
      storeAddress: newAddress,
      announcement: newAnnouncement,
      ...(finalLogoUrl ? { logoUrl: finalLogoUrl } : {})
    });

    alert(t("saveSuccess"));
  } catch (e) {
    alert(t("saveFail") + e.message);
  } finally {
    if (btn) { btn.innerText = oldText; btn.disabled = false; }
  }
}
window.saveAllStoreInfoSettings = saveAllStoreInfoSettings;

function renderLanguageSetting() {
  const radioZh = document.getElementById("setting-lang-zh");
  const radioVi = document.getElementById("setting-lang-vi");
  const cardZh = document.getElementById("lang-card-zh");
  const cardVi = document.getElementById("lang-card-vi");
  if (radioZh) radioZh.checked = (currentLang === "zh-TW");
  if (radioVi) radioVi.checked = (currentLang === "vi");
  if (cardZh && cardVi) {
    if (currentLang === "zh-TW") {
      cardZh.style.borderColor = "var(--primary)";
      cardZh.style.background = "rgba(0, 185, 0, 0.05)";
      cardVi.style.borderColor = "var(--border)";
      cardVi.style.background = "#fff";
    } else {
      cardVi.style.borderColor = "var(--primary)";
      cardVi.style.background = "rgba(0, 185, 0, 0.05)";
      cardZh.style.borderColor = "var(--border)";
      cardZh.style.background = "#fff";
    }
  }
}

function renderReportsSetting() {
  const isFeatureEnabled = Array.isArray(window.currentTenantFeatures)
    ? window.currentTenantFeatures.includes('reports')
    : (Array.isArray(currentTenantFeatures) ? currentTenantFeatures.includes('reports') : false);

  const REPORTS_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>`;
  updateTocFeatureItem("toc-item-reports", "i18n-toc-reports", "tocReports", REPORTS_SVG, isFeatureEnabled);

  const unlockedBody = document.getElementById("setting-reports-unlocked-body");
  const lockedBody = document.getElementById("setting-reports-locked-body");

  if (!isFeatureEnabled) {
    if (unlockedBody) unlockedBody.style.display = "none";
    if (lockedBody) lockedBody.style.display = "flex";
    return;
  }

  if (unlockedBody) unlockedBody.style.display = "flex";
  if (lockedBody) lockedBody.style.display = "none";
}

function openReportsFromSettings() {
  switchTab('reports');
}

// --- Thermal Printer Settings Logic ---
function onPrinterProtocolChange(station) {
  const isKitchen = station === 'kitchen';
  const protoSel = document.getElementById(isKitchen ? 'printer-kitchen-protocol' : 'printer-cashier-protocol');
  const escBox = document.getElementById(isKitchen ? 'printer-kitchen-escpos-box' : 'printer-cashier-escpos-box');
  const tsplBox = document.getElementById(isKitchen ? 'printer-kitchen-tspl-box' : 'printer-cashier-tspl-box');

  const protocol = isKitchen ? 'tspl' : 'esc_pos';
  if (protoSel) protoSel.value = protocol;
  if (protocol === 'tspl') {
    if (escBox) escBox.style.display = 'none';
    if (tsplBox) tsplBox.style.display = 'flex';
    onTsplSizeChange(station);
  } else {
    if (escBox) escBox.style.display = 'block';
    if (tsplBox) tsplBox.style.display = 'none';
  }
}

function onTsplSizeChange(station) {
  const isKitchen = station === 'kitchen';
  const sizeSel = document.getElementById(isKitchen ? 'printer-kitchen-tspl-size' : 'printer-cashier-tspl-size');
  const customBox = document.getElementById(isKitchen ? 'printer-kitchen-tspl-custom-size-box' : 'printer-cashier-tspl-custom-size-box');

  const size = sizeSel ? sizeSel.value : '100x150';
  if (size === 'custom') {
    if (customBox) customBox.style.display = 'grid';
  } else {
    if (customBox) customBox.style.display = 'none';
  }
}

function onPrinterInterfaceChange(station, shouldRefreshBt = true) {
  const isKitchen = station === 'kitchen';
  const sel = document.getElementById(isKitchen ? 'printer-kitchen-interface' : 'printer-cashier-interface');
  const netBox = document.getElementById(isKitchen ? 'printer-kitchen-network-box' : 'printer-cashier-network-box');
  const btBox = document.getElementById(isKitchen ? 'printer-kitchen-bt-box' : 'printer-cashier-bt-box');

  const iface = sel ? sel.value : 'network';
  if (iface === 'bluetooth') {
    if (netBox) netBox.style.display = 'none';
    if (btBox) btBox.style.display = 'flex';
    if (shouldRefreshBt !== false) {
      refreshPairedBluetoothDevices(station);
    }
  } else {
    if (netBox) netBox.style.display = 'flex';
    if (btBox) btBox.style.display = 'none';
  }
}

function onPrinterModeChange(mode) {
  const isAuto = mode === 'auto';
  updatePrintModeCardStyles(isAuto);
  savePOSPrinterSettings(true);
}

function updatePrintModeCardStyles(isAuto) {
  const cardAuto = document.getElementById("mode-card-print-auto");
  const cardManual = document.getElementById("mode-card-print-manual");
  if (cardAuto) {
    cardAuto.style.borderColor = isAuto ? "var(--primary, #00b900)" : "var(--border, #cbd5e1)";
    cardAuto.style.background = isAuto ? "rgba(0, 185, 0, 0.05)" : "#fff";
  }
  if (cardManual) {
    cardManual.style.borderColor = !isAuto ? "var(--primary, #00b900)" : "var(--border, #cbd5e1)";
    cardManual.style.background = !isAuto ? "rgba(0, 185, 0, 0.05)" : "#fff";
  }
}

function updatePrintActionAvailability() {
  if (typeof PrinterService === 'undefined') return;
  const capabilities = PrinterService.getPrintCapabilities();
  const disabledBillTitle = (typeof t === 'function' && t('printDisabledBill')) || '請先啟用並設定 Bill 印表機';
  const disabledStickersTitle = (typeof t === 'function' && t('printDisabledStickers')) || '請先啟用並設定貼紙印表機';
  const disabledFullTitle = (typeof t === 'function' && t('printDisabledFull')) || '整單列印需要同時啟用 Bill 與貼紙印表機';

  document.querySelectorAll('[data-print-action]').forEach((control) => {
    const action = control.dataset.printAction;
    const enabled = action === 'bill'
      ? capabilities.bill
      : action === 'stickers'
        ? capabilities.stickers
        : capabilities.bill && capabilities.stickers;
    const disabledTitle = action === 'bill'
      ? disabledBillTitle
      : action === 'stickers'
        ? disabledStickersTitle
        : disabledFullTitle;

    control.disabled = !enabled;
    control.setAttribute('aria-disabled', String(!enabled));
    control.classList.toggle('is-printer-disabled', !enabled);
    if (!enabled) control.setAttribute('title', disabledTitle);
    else if (control.dataset.printActionTitle) control.setAttribute('title', control.dataset.printActionTitle);
    else control.removeAttribute('title');
  });
}
window.updatePrintActionAvailability = updatePrintActionAvailability;

let printerAutoSaveDebounceTimer = null;
function attachPrinterAutoSave() {
  const card = document.getElementById("setting-card-printer");
  if (!card || card.dataset.autosaveAttached === "true") return;
  card.dataset.autosaveAttached = "true";

  card.addEventListener("input", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") {
      clearTimeout(printerAutoSaveDebounceTimer);
      printerAutoSaveDebounceTimer = setTimeout(() => {
        savePOSPrinterSettings(true);
      }, 400);
    }
  });

  card.addEventListener("change", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") {
      clearTimeout(printerAutoSaveDebounceTimer);
      savePOSPrinterSettings(true);
    }
  });
}

function ensureSavedBtOptionSelected(selectEl, mac, deviceName) {
  if (!selectEl) return;
  const cleanMac = String(mac || '').trim();
  if (!cleanMac) return;
  const cleanName = String(deviceName || '').trim();
  const existing = Array.from(selectEl.options || []).find(opt => opt.value === cleanMac);
  if (existing) {
    existing.selected = true;
    if (cleanName && !existing.dataset.name) existing.dataset.name = cleanName;
  } else {
    const opt = document.createElement('option');
    opt.value = cleanMac;
    opt.innerText = cleanName && cleanName !== cleanMac ? `${cleanName} (${cleanMac})` : cleanMac;
    opt.dataset.name = cleanName || cleanMac;
    opt.selected = true;
    selectEl.appendChild(opt);
  }
  selectEl.value = cleanMac;
}

async function refreshPairedBluetoothDevices(station = 'all', targetMacs = null) {
  if (typeof PrinterService === 'undefined') return;
  const stations = station === 'all' ? ['cashier', 'kitchen'] : [station];
  const savedSettings = PrinterService.getSettings() || {};

  for (const st of stations) {
    const statusEl = document.getElementById(st === 'kitchen' ? 'printer-kitchen-bt-status' : 'printer-cashier-bt-status');
    const selectEl = document.getElementById(st === 'kitchen' ? 'printer-kitchen-bt-device' : 'printer-cashier-bt-device');
    const savedSt = savedSettings[st] || {};
    const explicitMac = (targetMacs && targetMacs[st] !== undefined) ? targetMacs[st] : null;
    const preservedMac = (explicitMac !== null ? explicitMac : (selectEl?.value || savedSt.mac_address || '')).trim();
    const preservedName = (selectEl?.selectedOptions?.[0]?.dataset?.name || savedSt.device_name || '').trim();

    if (statusEl) statusEl.innerText = t('printerBtConnecting', '正在搜尋已配對裝置...');

    try {
      const res = await PrinterService.getPairedBluetoothDevices();
      const devices = res?.devices || [];

      if (selectEl) {
        const currentVal = preservedMac || selectEl.value || '';
        selectEl.innerHTML = `<option value="">${t('printerBtSelectPlaceholder', '-- 請選擇已配對的藍牙印表機 --')}</option>`;

        if (devices.length === 0) {
          if (currentVal) {
            ensureSavedBtOptionSelected(selectEl, currentVal, preservedName);
          }
          if (statusEl) statusEl.innerText = t('printerBtNoDevices', '未發現已配對裝置，請先至 Android 設定中完成配對');
        } else {
          let matched = false;
          devices.forEach(dev => {
            const opt = document.createElement('option');
            opt.value = dev.address;
            opt.innerText = `${dev.name} (${dev.address})`;
            opt.dataset.name = dev.name;
            if (dev.address === currentVal) {
              opt.selected = true;
              matched = true;
            }
            selectEl.appendChild(opt);
          });
          if (currentVal && !matched) {
            ensureSavedBtOptionSelected(selectEl, currentVal, preservedName);
          }
          if (statusEl) statusEl.innerText = `✅ ${devices.length} 個已配對藍牙裝置`;
        }
      }
    } catch (err) {
      console.warn('[PrinterSettings] BT scan error:', err);
      if (selectEl && preservedMac) {
        ensureSavedBtOptionSelected(selectEl, preservedMac, preservedName);
      }
      if (statusEl) statusEl.innerText = `⚠️ ${err.message || '無法取得藍牙裝置清單'}`;
    }
  }
}

function loadPOSPrinterSettings() {
  if (typeof PrinterService === 'undefined') return;
  const settings = PrinterService.getSettings();

  const isAuto = !!settings.autoPrintNewOrders;
  const radioAuto = document.getElementById("printer-mode-auto");
  const radioManual = document.getElementById("printer-mode-manual");
  if (radioAuto && radioManual) {
    radioAuto.checked = isAuto;
    radioManual.checked = !isAuto;
    updatePrintModeCardStyles(isAuto);
  }

  // Cashier
  const cashEnabled = document.getElementById("printer-cashier-enabled");
  if (cashEnabled) cashEnabled.checked = !!settings.cashier?.enabled;
  const cashProto = document.getElementById("printer-cashier-protocol");
  if (cashProto) cashProto.value = 'esc_pos';
  const cashInterface = document.getElementById("printer-cashier-interface");
  if (cashInterface) cashInterface.value = settings.cashier?.interface_type || 'network';
  const cashIp = document.getElementById("printer-cashier-ip");
  if (cashIp) cashIp.value = settings.cashier?.ip || "";
  const cashPort = document.getElementById("printer-cashier-port");
  if (cashPort) cashPort.value = settings.cashier?.port || 9100;
  const cashPaper = document.getElementById("printer-cashier-paper");
  const cashFeed = document.getElementById("printer-cashier-feed-before-cut");
  if (cashPaper) cashPaper.value = String(settings.cashier?.paperWidth || 80);
  if (cashFeed) cashFeed.value = settings.cashier?.feedBeforeCutMm ?? 80;
  const cashTsplSize = document.getElementById("printer-cashier-tspl-size");
  if (cashTsplSize) cashTsplSize.value = settings.cashier?.tspl_label_size || '100x150';
  const cashTsplW = document.getElementById("printer-cashier-tspl-width");
  if (cashTsplW) cashTsplW.value = settings.cashier?.tspl_custom_width_mm || 100;
  const cashTsplH = document.getElementById("printer-cashier-tspl-height");
  if (cashTsplH) cashTsplH.value = settings.cashier?.tspl_custom_height_mm || 150;
  const cashTsplMode = document.getElementById("printer-cashier-tspl-mode");
  if (cashTsplMode) cashTsplMode.value = settings.cashier?.tspl_mode || 'summary';
  const cashTsplDpi = document.getElementById("printer-cashier-tspl-dpi");
  if (cashTsplDpi) cashTsplDpi.value = String(settings.cashier?.tspl_dpi || 203);
  const cashTsplXOffset = document.getElementById("printer-cashier-tspl-x-offset");
  if (cashTsplXOffset) cashTsplXOffset.value = settings.cashier?.tspl_x_offset_mm ?? 0;
  const cashTsplYOffset = document.getElementById("printer-cashier-tspl-y-offset");
  if (cashTsplYOffset) cashTsplYOffset.value = settings.cashier?.tspl_y_offset_mm ?? 0;

  const cashBtSelect = document.getElementById("printer-cashier-bt-device");
  if (cashBtSelect && settings.cashier?.mac_address) {
    ensureSavedBtOptionSelected(cashBtSelect, settings.cashier.mac_address, settings.cashier.device_name);
  }

  onPrinterProtocolChange('cashier');
  onPrinterInterfaceChange('cashier', false);

  // Kitchen
  const kitEnabled = document.getElementById("printer-kitchen-enabled");
  if (kitEnabled) kitEnabled.checked = !!settings.kitchen?.enabled;
  const kitProto = document.getElementById("printer-kitchen-protocol");
  if (kitProto) kitProto.value = 'tspl';
  const kitInterface = document.getElementById("printer-kitchen-interface");
  if (kitInterface) kitInterface.value = settings.kitchen?.interface_type || 'network';
  const kitIp = document.getElementById("printer-kitchen-ip");
  if (kitIp) kitIp.value = settings.kitchen?.ip || "";
  const kitPort = document.getElementById("printer-kitchen-port");
  if (kitPort) kitPort.value = settings.kitchen?.port || 9100;
  const kitPaper = document.getElementById("printer-kitchen-paper");
  const kitFeed = document.getElementById("printer-kitchen-feed-before-cut");
  if (kitPaper) kitPaper.value = String(settings.kitchen?.paperWidth || 80);
  if (kitFeed) kitFeed.value = settings.kitchen?.feedBeforeCutMm ?? 80;
  const kitTsplSize = document.getElementById("printer-kitchen-tspl-size");
  if (kitTsplSize) kitTsplSize.value = settings.kitchen?.tspl_label_size || '40x30';
  const kitTsplW = document.getElementById("printer-kitchen-tspl-width");
  if (kitTsplW) kitTsplW.value = settings.kitchen?.tspl_custom_width_mm || 40;
  const kitTsplH = document.getElementById("printer-kitchen-tspl-height");
  if (kitTsplH) kitTsplH.value = settings.kitchen?.tspl_custom_height_mm || 30;
  const kitTsplMode = document.getElementById("printer-kitchen-tspl-mode");
  if (kitTsplMode) kitTsplMode.value = settings.kitchen?.tspl_mode || 'item_stickers';
  const kitTsplDpi = document.getElementById("printer-kitchen-tspl-dpi");
  if (kitTsplDpi) kitTsplDpi.value = String(settings.kitchen?.tspl_dpi || 203);
  const kitTsplXOffset = document.getElementById("printer-kitchen-tspl-x-offset");
  if (kitTsplXOffset) kitTsplXOffset.value = settings.kitchen?.tspl_x_offset_mm ?? 0;
  const kitTsplYOffset = document.getElementById("printer-kitchen-tspl-y-offset");
  if (kitTsplYOffset) kitTsplYOffset.value = settings.kitchen?.tspl_y_offset_mm ?? 0;

  const kitBtSelect = document.getElementById("printer-kitchen-bt-device");
  if (kitBtSelect && settings.kitchen?.mac_address) {
    ensureSavedBtOptionSelected(kitBtSelect, settings.kitchen.mac_address, settings.kitchen.device_name);
  }

  onPrinterProtocolChange('kitchen');
  onPrinterInterfaceChange('kitchen', false);

  // Load Bluetooth devices and select saved ones
  const targetMacs = {
    cashier: settings.cashier?.mac_address || "",
    kitchen: settings.kitchen?.mac_address || ""
  };
  refreshPairedBluetoothDevices('all', targetMacs);

  // Attach instant auto-save listener
  attachPrinterAutoSave();

  // Update header printer status pill
  updateSettingsPrinterStatusDisplay();
  updatePrintActionAvailability();
}

function savePOSPrinterSettings(silent = false) {
  if (typeof PrinterService === 'undefined') return;

  const radioAuto = document.getElementById("printer-mode-auto");
  const autoPrintEnabled = radioAuto ? radioAuto.checked : false;

  // Cashier
  const cashEnabled = document.getElementById("printer-cashier-enabled");
  const cashProto = document.getElementById("printer-cashier-protocol");
  const cashInterface = document.getElementById("printer-cashier-interface");
  const cashIp = document.getElementById("printer-cashier-ip");
  const cashPort = document.getElementById("printer-cashier-port");
  const cashBtSelect = document.getElementById("printer-cashier-bt-device");
  const cashPaper = document.getElementById("printer-cashier-paper");
  const cashFeed = document.getElementById("printer-cashier-feed-before-cut");
  const cashTsplSize = document.getElementById("printer-cashier-tspl-size");
  const cashTsplW = document.getElementById("printer-cashier-tspl-width");
  const cashTsplH = document.getElementById("printer-cashier-tspl-height");
  const cashTsplMode = document.getElementById("printer-cashier-tspl-mode");
  const cashTsplDpi = document.getElementById("printer-cashier-tspl-dpi");
  const cashTsplXOffset = document.getElementById("printer-cashier-tspl-x-offset");
  const cashTsplYOffset = document.getElementById("printer-cashier-tspl-y-offset");

  const cashBtOpt = cashBtSelect?.selectedOptions?.[0];
  const cashMac = cashBtSelect ? cashBtSelect.value : "";
  const cashDevName = cashBtOpt?.dataset?.name || "";

  // Kitchen
  const kitEnabled = document.getElementById("printer-kitchen-enabled");
  const kitProto = document.getElementById("printer-kitchen-protocol");
  const kitInterface = document.getElementById("printer-kitchen-interface");
  const kitIp = document.getElementById("printer-kitchen-ip");
  const kitPort = document.getElementById("printer-kitchen-port");
  const kitBtSelect = document.getElementById("printer-kitchen-bt-device");
  const kitPaper = document.getElementById("printer-kitchen-paper");
  const kitFeed = document.getElementById("printer-kitchen-feed-before-cut");
  const kitTsplSize = document.getElementById("printer-kitchen-tspl-size");
  const kitTsplW = document.getElementById("printer-kitchen-tspl-width");
  const kitTsplH = document.getElementById("printer-kitchen-tspl-height");
  const kitTsplMode = document.getElementById("printer-kitchen-tspl-mode");
  const kitTsplDpi = document.getElementById("printer-kitchen-tspl-dpi");
  const kitTsplXOffset = document.getElementById("printer-kitchen-tspl-x-offset");
  const kitTsplYOffset = document.getElementById("printer-kitchen-tspl-y-offset");

  const kitBtOpt = kitBtSelect?.selectedOptions?.[0];
  const kitMac = kitBtSelect ? kitBtSelect.value : "";
  const kitDevName = kitBtOpt?.dataset?.name || "";

  const newSettings = {
    autoPrintNewOrders: autoPrintEnabled,
    cashier: {
      enabled: cashEnabled ? cashEnabled.checked : true,
      protocol: 'esc_pos',
      interface_type: cashInterface ? cashInterface.value : 'network',
      tspl_label_size: cashTsplSize ? cashTsplSize.value : '100x150',
      tspl_custom_width_mm: cashTsplW ? Number(cashTsplW.value) || 100 : 100,
      tspl_custom_height_mm: cashTsplH ? Number(cashTsplH.value) || 150 : 150,
      tspl_mode: cashTsplMode ? cashTsplMode.value : 'summary',
      tspl_dpi: cashTsplDpi ? Number(cashTsplDpi.value) || 203 : 203,
      tspl_x_offset_mm: cashTsplXOffset ? Number(cashTsplXOffset.value) || 0 : 0,
      tspl_y_offset_mm: cashTsplYOffset ? Number(cashTsplYOffset.value) || 0 : 0,
      ip: cashIp ? cashIp.value.trim() : "192.168.1.100",
      port: cashPort ? Number(cashPort.value) || 9100 : 9100,
      mac_address: cashMac,
      device_name: cashDevName,
      paperWidth: cashPaper ? Number(cashPaper.value) || 80 : 80,
      feedBeforeCutMm: cashFeed ? Math.max(0, Math.min(150, Number(cashFeed.value) || 80)) : 80,
      autoCut: true
    },
    kitchen: {
      enabled: kitEnabled ? kitEnabled.checked : true,
      protocol: 'tspl',
      interface_type: kitInterface ? kitInterface.value : 'network',
      tspl_label_size: kitTsplSize ? kitTsplSize.value : '40x30',
      tspl_custom_width_mm: kitTsplW ? Number(kitTsplW.value) || 40 : 40,
      tspl_custom_height_mm: kitTsplH ? Number(kitTsplH.value) || 30 : 30,
      tspl_mode: kitTsplMode ? kitTsplMode.value : 'item_stickers',
      tspl_dpi: kitTsplDpi ? Number(kitTsplDpi.value) || 203 : 203,
      tspl_x_offset_mm: kitTsplXOffset ? Number(kitTsplXOffset.value) || 0 : 0,
      tspl_y_offset_mm: kitTsplYOffset ? Number(kitTsplYOffset.value) || 0 : 0,
      ip: kitIp ? kitIp.value.trim() : "192.168.1.101",
      port: kitPort ? Number(kitPort.value) || 9100 : 9100,
      mac_address: kitMac,
      device_name: kitDevName,
      paperWidth: kitPaper ? Number(kitPaper.value) || 80 : 80,
      feedBeforeCutMm: kitFeed ? Math.max(0, Math.min(150, Number(kitFeed.value) || 80)) : 80,
      autoCut: true
    }
  };

  const success = PrinterService.saveSettings(newSettings);
  updateSettingsPrinterStatusDisplay();
  updatePrintActionAvailability();
  const status = document.getElementById('printer-save-status');
  if (status) {
    status.textContent = t(success ? 'printerSavedLocally' : 'printerSaveFailed');
    status.dataset.state = success ? 'saved' : 'error';
  }
  if (!silent && !success) alert(t('printerSaveFailed'));
  return success;
}

async function testPOSPrinterStation(station) {
  if (typeof PrinterService === 'undefined') return;
  const isKitchen = station === 'kitchen';
  const protoSelect = document.getElementById(isKitchen ? "printer-kitchen-protocol" : "printer-cashier-protocol");
  const ifaceSelect = document.getElementById(isKitchen ? "printer-kitchen-interface" : "printer-cashier-interface");
  const ipInput = document.getElementById(isKitchen ? "printer-kitchen-ip" : "printer-cashier-ip");
  const portInput = document.getElementById(isKitchen ? "printer-kitchen-port" : "printer-cashier-port");
  const btSelect = document.getElementById(isKitchen ? "printer-kitchen-bt-device" : "printer-cashier-bt-device");
  const paperInput = document.getElementById(isKitchen ? "printer-kitchen-paper" : "printer-cashier-paper");
  const feedInput = document.getElementById(isKitchen ? "printer-kitchen-feed-before-cut" : "printer-cashier-feed-before-cut");
  const tsplSizeSelect = document.getElementById(isKitchen ? "printer-kitchen-tspl-size" : "printer-cashier-tspl-size");
  const tsplWInput = document.getElementById(isKitchen ? "printer-kitchen-tspl-width" : "printer-cashier-tspl-width");
  const tsplHInput = document.getElementById(isKitchen ? "printer-kitchen-tspl-height" : "printer-cashier-tspl-height");
  const tsplModeSelect = document.getElementById(isKitchen ? "printer-kitchen-tspl-mode" : "printer-cashier-tspl-mode");
  const tsplDpiSelect = document.getElementById(isKitchen ? "printer-kitchen-tspl-dpi" : "printer-cashier-tspl-dpi");
  const tsplXOffsetInput = document.getElementById(isKitchen ? "printer-kitchen-tspl-x-offset" : "printer-cashier-tspl-x-offset");
  const tsplYOffsetInput = document.getElementById(isKitchen ? "printer-kitchen-tspl-y-offset" : "printer-cashier-tspl-y-offset");

  const protocol = isKitchen ? 'tspl' : 'esc_pos';
  const iface = ifaceSelect ? ifaceSelect.value : 'network';
  const paperWidth = paperInput ? Number(paperInput.value) || 80 : 80;

  const targetConfig = {
    protocol: protocol,
    interface_type: iface,
    paperWidth: paperWidth,
    feedBeforeCutMm: feedInput ? Math.max(0, Math.min(150, Number(feedInput.value) || 80)) : 80,
    tspl_label_size: tsplSizeSelect ? tsplSizeSelect.value : (isKitchen ? '40x30' : '100x150'),
    tspl_custom_width_mm: tsplWInput ? Number(tsplWInput.value) || (isKitchen ? 40 : 100) : (isKitchen ? 40 : 100),
    tspl_custom_height_mm: tsplHInput ? Number(tsplHInput.value) || (isKitchen ? 30 : 150) : (isKitchen ? 30 : 150),
    tspl_mode: tsplModeSelect ? tsplModeSelect.value : (isKitchen ? 'item_stickers' : 'summary'),
    tspl_dpi: tsplDpiSelect ? Number(tsplDpiSelect.value) || 203 : 203,
    tspl_x_offset_mm: tsplXOffsetInput ? Number(tsplXOffsetInput.value) || 0 : 0,
    tspl_y_offset_mm: tsplYOffsetInput ? Number(tsplYOffsetInput.value) || 0 : 0,
    autoCut: true
  };

  if (iface === 'bluetooth') {
    const mac = btSelect ? btSelect.value : '';
    const name = btSelect?.selectedOptions?.[0]?.dataset?.name || mac;
    if (!mac) {
      alert("請先選擇已配對的藍牙印表機 (Please select a paired Bluetooth printer)");
      return;
    }
    targetConfig.mac_address = mac;
    targetConfig.device_name = name;
    savePOSPrinterSettings(true);

    if (typeof showToast === 'function') showToast(`📡 正在傳送測試列印 [${protocol.toUpperCase()}] 至藍牙印表機 [${name}]...`);
    try {
      await PrinterService.testPrint(station, targetConfig);
      if (typeof showToast === 'function') showToast(`✅ 藍牙測試列印成功 [${name}]`);
    } catch (err) {
      console.error("BT Test print error:", err);
      if (typeof showToast === 'function') showToast(`❌ 藍牙列印失敗: ${err.message || err}`);
    }
  } else {
    const ip = ipInput ? ipInput.value.trim() : "";
    const port = portInput ? Number(portInput.value) || 9100 : 9100;

    if (!ip) {
      alert("請先輸入印表機 IP 位址 (例如: 192.168.1.100)");
      return;
    }
    targetConfig.ip = ip;
    targetConfig.port = port;
    savePOSPrinterSettings(true);

    if (typeof showToast === 'function') showToast(`🖨️ 正在傳送測試列印 [${protocol.toUpperCase()}] 至 ${ip}:${port}...`);
    try {
      await PrinterService.testPrint(station, targetConfig);
      if (typeof showToast === 'function') showToast(`✅ 測試列印已送出至 ${ip}:${port}`);
    } catch (err) {
      console.error("Test print error:", err);
      if (typeof showToast === 'function') showToast(`❌ 測試列印失敗: ${err.message || err}`);
    }
  }
}

// --- Settings Table of Contents (TOC) & ScrollSpy ---
const SETTINGS_SECTIONS = [
  { id: "setting-card-status", tocId: "toc-item-status" },
  { id: "setting-card-ordermode", tocId: "toc-item-ordermode" },
  { id: "setting-card-payment", tocId: "toc-item-payment" },
  { id: "setting-card-hours", tocId: "toc-item-hours" },
  { id: "setting-card-store-info", tocId: "toc-item-store-info" },
  { id: "setting-card-language", tocId: "toc-item-language" },
  { id: "setting-card-display", tocId: "toc-item-display" },
  { id: "setting-card-dinein", tocId: "toc-item-dinein" },
  { id: "setting-card-tables", tocId: "toc-item-tables" },
  { id: "setting-card-printer", tocId: "toc-item-printer" },
  { id: "setting-card-reports", tocId: "toc-item-reports" },
  { id: "setting-card-store-pairing", tocId: "toc-item-store-pairing" }
];

let isManualSettingScroll = false;
let settingScrollTimeout = null;

function setActiveTocItem(activeTocId) {
  document.querySelectorAll(".settings-toc-item").forEach(item => {
    if (item.id === activeTocId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
}

function updateSettingsPanelHeaderTitle(matchedSec) {
  const titleEl = document.getElementById("i18n-settings-title");
  if (!titleEl) return;
  if (!matchedSec) {
    const activeCard = document.querySelector(".settings-card.active");
    if (activeCard) {
      matchedSec = SETTINGS_SECTIONS.find(s => s.id === activeCard.id);
    }
  }
  if (matchedSec) {
    const tocItem = document.getElementById(matchedSec.tocId);
    const labelEl = tocItem ? tocItem.querySelector(".toc-item-label") : null;
    if (labelEl && labelEl.innerText.trim()) {
      titleEl.innerText = labelEl.innerText.trim();
      return;
    }
  }
  const defaultToc = document.getElementById("toc-item-status");
  const defaultLabel = defaultToc ? defaultToc.querySelector(".toc-item-label") : null;
  if (defaultLabel && defaultLabel.innerText.trim()) {
    titleEl.innerText = defaultLabel.innerText.trim();
  }
}
window.updateSettingsPanelHeaderTitle = updateSettingsPanelHeaderTitle;

function switchSettingTab(cardId) {
  if (!cardId) cardId = "setting-card-status";

  // Map legacy/merged tab IDs to the unified store info card
  if (
    cardId === "setting-card-address" ||
    cardId === "setting-card-announcement" ||
    cardId === "setting-card-logo" ||
    cardId === "toc-item-address" ||
    cardId === "toc-item-announcement" ||
    cardId === "toc-item-logo" ||
    cardId === "address" ||
    cardId === "announcement" ||
    cardId === "logo" ||
    cardId === "store-info"
  ) {
    cardId = "setting-card-store-info";
  }

  // Normalize if passed an ID without prefix or TOC ID
  let targetId = cardId;
  let matchedSec = SETTINGS_SECTIONS.find(s => s.id === cardId || s.tocId === cardId || s.id === `setting-card-${cardId}`);
  if (matchedSec) {
    targetId = matchedSec.id;
  }

  let targetCard = document.getElementById(targetId);
  if (!targetCard) {
    targetId = "setting-card-status";
    targetCard = document.getElementById("setting-card-status");
    matchedSec = SETTINGS_SECTIONS.find(s => s.id === "setting-card-status");
  }
  if (!targetCard) return;

  // If target card is hidden by platform rules (e.g. printer on web-prod or reports on native app)
  const targetToc = matchedSec ? document.getElementById(matchedSec.tocId) : null;
  const isPlatformHidden = targetToc && window.getComputedStyle(targetToc).display === "none";
  if (isPlatformHidden) {
    // Pick the first section whose TOC item is visible
    for (const sec of SETTINGS_SECTIONS) {
      const toc = document.getElementById(sec.tocId);
      if (toc && window.getComputedStyle(toc).display !== "none") {
        const el = document.getElementById(sec.id);
        if (el) {
          targetCard = el;
          targetId = sec.id;
          matchedSec = sec;
          break;
        }
      }
    }
  }

  if (targetId !== "setting-card-store-pairing") resetStorePinChangeForm();

  // 1. Hide all cards and show target card
  document.querySelectorAll(".settings-card").forEach(card => {
    card.classList.remove("active");
  });
  targetCard.classList.add("active");

  // 2. Set active TOC item
  if (matchedSec) {
    setActiveTocItem(matchedSec.tocId);
  }

  // 3. Toggle printer status bar (Only show when on the printer settings tab)
  const printerStatusBar = document.getElementById("settings-printer-status-bar");
  if (printerStatusBar) {
    printerStatusBar.style.display = (targetId === "setting-card-printer") ? "inline-flex" : "none";
  }
  if (targetId === "setting-card-printer" && typeof updateSettingsPrinterStatusDisplay === "function") {
    updateSettingsPrinterStatusDisplay();
  }

  // 4. Update panel header title to match active sub-setting tab
  updateSettingsPanelHeaderTitle(matchedSec);

  // 5. Scroll container to top
  const container = document.getElementById("settings-scroll-container");
  if (container) {
    container.scrollTop = 0;
  }

  // 6. Save state for session reload
  try {
    sessionStorage.setItem("last_settings_tab", targetId);
  } catch (e) {}
}
window.switchSettingTab = switchSettingTab;

function scrollToSettingSection(sectionId) {
  switchSettingTab(sectionId);

  const container = document.getElementById("settings-scroll-container");
  const target = document.getElementById(sectionId);
  if (!container || !target) return;

  const found = SETTINGS_SECTIONS.find(s => s.id === sectionId);
  if (found) {
    setActiveTocItem(found.tocId);
  }

  isManualSettingScroll = true;
  if (settingScrollTimeout) clearTimeout(settingScrollTimeout);

  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const relativeTop = targetRect.top - containerRect.top + container.scrollTop;
  container.scrollTo({ top: Math.max(0, relativeTop - 12), behavior: "smooth" });

  settingScrollTimeout = setTimeout(() => {
    isManualSettingScroll = false;
  }, 800);
}
window.scrollToSettingSection = scrollToSettingSection;

function initSettingsScrollSpy() {
  const container = document.getElementById("settings-scroll-container");
  if (!container || container.dataset.scrollSpyInit) return;
  container.dataset.scrollSpyInit = "true";

  container.addEventListener("scroll", () => {
    if (isManualSettingScroll) return;
    const containerTop = container.getBoundingClientRect().top;

    let currentActive = null;
    for (const sec of SETTINGS_SECTIONS) {
      const el = document.getElementById(sec.id);
      if (el && el.offsetParent !== null) {
        if (!currentActive) currentActive = sec;
        const rect = el.getBoundingClientRect();
        // If element top is within upper portion of container
        if (rect.top - containerTop <= 120) {
          currentActive = sec;
        }
      }
    }

    if (currentActive) {
      setActiveTocItem(currentActive.tocId);
    }
  }, { passive: true });
}

function updateSettingsPrinterStatusDisplay() {
  const isVi = (typeof currentLang !== "undefined" && currentLang === "vi") || 
               (typeof window !== "undefined" && window.currentLang === "vi") ||
               (typeof currentLanguage !== "undefined" && currentLanguage === "vi");

  const lblCashier = (typeof t === "function" && t("printerStationCashierShort")) || (isVi ? "Thu ngân" : "櫃檯");
  const lblKitchen = (typeof t === "function" && t("printerStationKitchenShort")) || (isVi ? "Bếp" : "廚房");
  const lblBT = (typeof t === "function" && t("printerTypeBluetooth")) || (isVi ? "Bluetooth" : "藍牙");
  const lblLAN = (typeof t === "function" && t("printerTypeLAN")) || (isVi ? "Mạng LAN" : "區網");
  const lblDisabled = (typeof t === "function" && t("printerDisabled")) || (isVi ? "Đã tắt" : "已停用");
  const lblNone = (typeof t === "function" && t("printerStatusNone")) || (isVi ? "Chưa kết nối máy in" : "未連線印表機");
  const lblNotConfigured = (typeof t === "function" && t("printerNotConfigured")) || (isVi ? "Chưa thiết lập" : "未設定連線");

  let cashier = {};
  let kitchen = {};

  if (typeof PrinterService !== 'undefined') {
    const settings = PrinterService.getSettings() || {};
    cashier = settings.cashier || {};
    kitchen = settings.kitchen || {};
  } else {
    const cashEl = document.getElementById("printer-cashier-enabled");
    cashier.enabled = cashEl ? cashEl.checked : false;
    const kitEl = document.getElementById("printer-kitchen-enabled");
    kitchen.enabled = kitEl ? kitEl.checked : false;
  }

  // 1. Update Cashier Station Pill
  const cashPill = document.getElementById("printer-cashier-status-pill");
  const cashDot = document.getElementById("printer-cashier-status-dot");
  const cashText = document.getElementById("printer-cashier-status-text");
  if (cashPill && cashText) {
    if (!cashier.enabled) {
      if (cashDot) cashDot.className = "printer-status-dot offline";
      cashPill.className = "settings-printer-status-pill disconnected";
      cashText.innerText = lblDisabled;
    } else {
      let desc = "";
      if (cashier.interface_type === 'bluetooth') {
        const name = cashier.device_name || cashier.mac_address;
        if (name) desc = `${name} (${lblBT})`;
      } else {
        if (cashier.ip) desc = `${cashier.ip}:${cashier.port || 9100} (${lblLAN})`;
      }

      if (desc) {
        if (cashDot) cashDot.className = "printer-status-dot online";
        cashPill.className = "settings-printer-status-pill connected";
        cashText.innerText = desc;
      } else {
        if (cashDot) cashDot.className = "printer-status-dot offline";
        cashPill.className = "settings-printer-status-pill disconnected";
        cashText.innerText = lblNotConfigured;
      }
    }
  }

  // 2. Update Kitchen Station Pill
  const kitPill = document.getElementById("printer-kitchen-status-pill");
  const kitDot = document.getElementById("printer-kitchen-status-dot");
  const kitText = document.getElementById("printer-kitchen-status-text");
  if (kitPill && kitText) {
    if (!kitchen.enabled) {
      if (kitDot) kitDot.className = "printer-status-dot offline";
      kitPill.className = "settings-printer-status-pill disconnected";
      kitText.innerText = lblDisabled;
    } else {
      let desc = "";
      if (kitchen.interface_type === 'bluetooth') {
        const name = kitchen.device_name || kitchen.mac_address;
        if (name) desc = `${name} (${lblBT})`;
      } else {
        if (kitchen.ip) desc = `${kitchen.ip}:${kitchen.port || 9100} (${lblLAN})`;
      }

      if (desc) {
        if (kitDot) kitDot.className = "printer-status-dot online";
        kitPill.className = "settings-printer-status-pill connected";
        kitText.innerText = desc;
      } else {
        if (kitDot) kitDot.className = "printer-status-dot offline";
        kitPill.className = "settings-printer-status-pill disconnected";
        kitText.innerText = lblNotConfigured;
      }
    }
  }

  // 3. Update legacy/fallback header status bar if present
  const statusBar = document.getElementById("settings-printer-status-bar");
  const statusDot = document.getElementById("printer-status-dot");
  const statusText = document.getElementById("settings-printer-status-text");
  if (statusBar && statusText) {
    const activePrinters = [];

    if (cashier.enabled) {
      let name = "";
      if (cashier.interface_type === 'bluetooth') {
        name = cashier.device_name || cashier.mac_address || lblBT;
      } else {
        name = cashier.ip ? `${cashier.ip}:${cashier.port || 9100}` : lblLAN;
      }
      activePrinters.push(`${lblCashier}: ${name}`);
    }

    if (kitchen.enabled) {
      let name = "";
      if (kitchen.interface_type === 'bluetooth') {
        name = kitchen.device_name || kitchen.mac_address || lblBT;
      } else {
        name = kitchen.ip ? `${kitchen.ip}:${kitchen.port || 9100}` : lblLAN;
      }
      activePrinters.push(`${lblKitchen}: ${name}`);
    }

    if (activePrinters.length > 0) {
      if (statusDot) statusDot.className = "printer-status-dot online";
      statusBar.className = "settings-printer-status-pill connected";
      statusText.innerText = activePrinters.join(" | ");
    } else {
      if (statusDot) statusDot.className = "printer-status-dot offline";
      statusBar.className = "settings-printer-status-pill disconnected";
      statusText.innerText = lblNone;
    }
  }
}
window.updateSettingsPrinterStatusDisplay = updateSettingsPrinterStatusDisplay;

// PINs stay in the form/request only; never persist them in browser storage.
let storePinChangePending = false;
let storePinFormRevision = 0;
let storePinChangeOrigin = null;

function renderStorePinChangeState() {
  const form = document.getElementById("store-pin-form");
  if (!form) return;
  const paymentFlow = storePinChangeOrigin && storePinChangeOrigin.scope === `${WORKER_BASE}|${getTenantIdFromUrl()}`;
  const context = document.getElementById("store-pin-payment-context");
  if (context) context.hidden = !paymentFlow;
  const back = document.getElementById("store-pin-back-to-payments");
  if (back) back.hidden = !paymentFlow;
  form.querySelectorAll("input, button").forEach(el => { el.disabled = storePinChangePending; });
  form.setAttribute("aria-busy", String(storePinChangePending));
  form.querySelectorAll("[data-store-pin-toggle]").forEach(button => {
    const input = document.getElementById(button.dataset.storePinToggle);
    const visible = input && input.type === "text";
    const label = t(visible ? "pinHide" : "pinShow");
    button.textContent = label;
    button.setAttribute("aria-pressed", String(!!visible));
    button.setAttribute("aria-label", `${label} ${t(input.dataset.pinLabel)}`);
  });
  const submit = document.getElementById("store-pin-submit");
  if (submit) submit.textContent = t(storePinChangePending ? "pinSaving" : "pinChange");
  const feedback = document.getElementById("store-pin-feedback");
  if (feedback) {
    feedback.textContent = form.dataset.feedbackKey ? t(form.dataset.feedbackKey) : "";
    feedback.classList.toggle("is-error", form.dataset.feedbackKind === "error");
    feedback.classList.toggle("is-success", form.dataset.feedbackKind === "success");
  }
}

function setStorePinFeedback(key, fieldId = null, kind = "error") {
  const form = document.getElementById("store-pin-form");
  if (!form) return;
  form.querySelectorAll("input").forEach(input => input.removeAttribute("aria-invalid"));
  form.dataset.feedbackKey = key;
  form.dataset.feedbackKind = kind;
  renderStorePinChangeState();
  if (fieldId) {
    const input = document.getElementById(fieldId);
    if (input) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
    }
  }
}

function resetStorePinChangeForm(preserveOrigin = false) {
  const form = document.getElementById("store-pin-form");
  if (!form) return;
  storePinFormRevision++;
  if (preserveOrigin !== true) storePinChangeOrigin = null;
  form.reset();
  form.querySelectorAll("input").forEach(input => {
    input.type = "password";
    input.removeAttribute("aria-invalid");
  });
  delete form.dataset.feedbackKey;
  delete form.dataset.feedbackKind;
  renderStorePinChangeState();
}

function clearStorePinChangeForm() { resetStorePinChangeForm(true); }

function beginStorePinChangeForPayments(scope) {
  if (scope !== `${WORKER_BASE}|${getTenantIdFromUrl()}`) return;
  resetStorePinChangeForm();
  storePinChangeOrigin = { scope };
  // Only reached after the payment API has confirmed the shared default PIN.
  document.getElementById("store-pin-current").value = "12345678";
  renderStorePinChangeState();
  document.getElementById("store-pin-form").scrollIntoView({ block: "start" });
  document.getElementById("store-pin-new").focus({ preventScroll: true });
}

function cancelStorePinChangeReturn() {
  const origin = storePinChangeOrigin;
  resetStorePinChangeForm();
  if (origin && window.PaymentPOS) PaymentPOS.returnFromPinChange(origin);
}

function toggleStorePinVisibility(fieldId) {
  const input = document.getElementById(fieldId);
  if (!input || storePinChangePending) return;
  input.type = input.type === "password" ? "text" : "password";
  renderStorePinChangeState();
}

async function submitStorePinChange(event) {
  if (event) event.preventDefault();
  if (storePinChangePending) return;
  const form = document.getElementById("store-pin-form");
  if (!form) return;
  const currentInput = document.getElementById("store-pin-current");
  const newInput = document.getElementById("store-pin-new");
  const confirmInput = document.getElementById("store-pin-confirm");
  for (const input of [currentInput, newInput, confirmInput]) {
    if (!input.value) {
      setStorePinFeedback("pinRequired", input.id);
      return;
    }
  }
  if (newInput.value !== newInput.value.trim() || !/^[0-9]{4,8}$/.test(newInput.value)) {
    setStorePinFeedback("pinInvalidFormat", newInput.id);
    return;
  }
  if (storePinChangeOrigin && newInput.value === "12345678") {
    setStorePinFeedback("pinPaymentDefaultNotAllowed", newInput.id);
    return;
  }
  if (newInput.value !== confirmInput.value) {
    setStorePinFeedback("pinMismatch", confirmInput.id);
    return;
  }
  const tenantId = getTenantIdFromUrl();
  if (!tenantId) {
    setStorePinFeedback("pinTenantRequired");
    return;
  }

  const revision = storePinFormRevision;
  storePinChangePending = true;
  setStorePinFeedback("");
  // Leaving settings clears the form and invalidates feedback from this request.
  const isCurrentForm = () => revision === storePinFormRevision && tenantId === getTenantIdFromUrl();
  let resultKey = "pinSaveError";
  let resultField = null;
  let saved = false;
  try {
    const response = await fetch(`${WORKER_BASE}/api/auth/change?tenant_id=${encodeURIComponent(tenantId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: currentInput.value, newPassword: newInput.value, tenant_id: tenantId })
    });
    const data = await response.json().catch(() => ({}));
    saved = response.ok && data.ok === true;
    if (saved) {
      try { sessionStorage.removeItem("staff_session_token_" + tenantId); } catch (e) {}
    } else if (response.status === 401) {
      resultKey = "pinWrongCurrent";
      resultField = currentInput.id;
    } else if (data.error === "INVALID_NEW_PIN") {
      resultKey = "pinInvalidFormat";
      resultField = newInput.id;
    } else if (response.status === 404 || response.status === 410) {
      resultKey = "pinTenantRequired";
    }
  } catch (e) {
    resultKey = "pinNetworkError";
  } finally {
    storePinChangePending = false;
    renderStorePinChangeState();
  }
  if (!isCurrentForm()) return;
  if (saved) {
    const origin = storePinChangeOrigin;
    resetStorePinChangeForm();
    setStorePinFeedback("pinChangeSuccess", null, "success");
    if (origin && window.PaymentPOS) PaymentPOS.returnFromPinChange(origin, true);
  } else {
    setStorePinFeedback(resultKey, resultField);
  }
}

window.renderStorePinChangeState = renderStorePinChangeState;
window.resetStorePinChangeForm = resetStorePinChangeForm;
window.toggleStorePinVisibility = toggleStorePinVisibility;
window.submitStorePinChange = submitStorePinChange;
window.clearStorePinChangeForm = clearStorePinChangeForm;
window.beginStorePinChangeForPayments = beginStorePinChangeForPayments;
window.cancelStorePinChangeReturn = cancelStorePinChangeReturn;

function renderStorePairingSection() {
  const tenantId = (typeof getTenantIdFromUrl === "function" && getTenantIdFromUrl()) || "";
  const elTenant = document.getElementById("display-pairing-tenant-id");
  if (elTenant) {
    elTenant.innerText = tenantId || (typeof t === "function" && t("unpaired")) || "未綁定";
  }
}

async function promptUnlinkStoreDevice() {
  const currentTenant = (typeof getTenantIdFromUrl === "function" && getTenantIdFromUrl()) || "";
  if (!currentTenant) {
    if (typeof showStoreActivationModal === "function") {
      showStoreActivationModal();
    }
    return;
  }

  const promptMsg = (typeof t === "function" && t("promptUnlinkPin")) || "請輸入門市管理 PIN 碼以解除綁定：";
  const pin = prompt(promptMsg);
  if (!pin || !pin.trim()) return;

  try {
    const workerUrl = typeof WORKER_BASE !== "undefined" ? WORKER_BASE : "https://benmi-worker-official.thuanmnc.workers.dev";
    const res = await fetch(`${workerUrl}/api/auth?pw=${encodeURIComponent(pin.trim())}&tenant_id=${encodeURIComponent(currentTenant)}`);
    const data = await res.json().catch(() => ({ ok: false }));

    if (data && data.ok) {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("pos_device_tenant_id");
        localStorage.removeItem("tenant_branding_" + currentTenant);
        localStorage.removeItem("tenant_theme_" + currentTenant);
      }
      alert((typeof t === "function" && t("unlinkSuccess")) || "已成功解除設備綁定！即將返回門市啟用畫面。");

      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("tenant");
      currentUrl.searchParams.delete("tenant_id");
      window.location.href = currentUrl.toString();
    } else {
      alert((typeof t === "function" && t("unlinkWrongPin")) || "管理 PIN 碼錯誤，無法解除綁定。");
    }
  } catch (e) {
    alert((typeof t === "function" && t("activationErrorNetwork")) || "連線驗證失敗，請檢查網路連線。");
  }
}

window.renderStorePairingSection = renderStorePairingSection;
window.promptUnlinkStoreDevice = promptUnlinkStoreDevice;

window.addEventListener("pagehide", resetStorePinChangeForm);

// =======================================================
// RESTAURANT TABLES & STAFF ORDERING MANAGEMENT
// =======================================================
let currentRestaurantTables = [];

async function checkStaffOrderingCapability() {
  window.staffOrderingCapabilities = {};
  const tenantId = (typeof getTenantIdFromUrl === "function" && getTenantIdFromUrl()) || "";
  if (!tenantId) return false;
  try {
    const workerUrl = typeof WORKER_BASE !== "undefined" ? WORKER_BASE : "https://benmi-worker-official.thuanmnc.workers.dev";
    const res = await fetch(`${workerUrl}/api/staff/capabilities?tenant_id=${encodeURIComponent(tenantId)}&_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      const enabled = data.capabilities?.tables_read === true;
      window.staffOrderingCapabilities = data.capabilities || {};
      window.isStaffOrderingEnabled = enabled;
      const btnPill = document.getElementById("btn-staff-order-pill");
      if (btnPill) {
        btnPill.style.display = data.capabilities?.pos_entry ? "inline-flex" : "none";
      }
      const sideStaffTab = document.getElementById("tab-staff-order");
      if (sideStaffTab) {
        sideStaffTab.hidden = !data.capabilities?.pos_entry;
        sideStaffTab.style.display = data.capabilities?.pos_entry ? "inline-flex" : "none";
      }
      const lockedBody = document.getElementById("setting-tables-locked-body");
      const unlockedBody = document.getElementById("setting-tables-unlocked-body");
      const addBtn = document.getElementById("i18n-table-add-btn");
      if (lockedBody && unlockedBody) {
        if (enabled) {
          lockedBody.style.display = "none";
          unlockedBody.style.display = "flex";
          if (addBtn) addBtn.style.display = data.capabilities?.tables_write ? "inline-flex" : "none";
        } else {
          lockedBody.style.display = "flex";
          unlockedBody.style.display = "none";
          if (addBtn) addBtn.style.display = "none";
        }
      }
      return enabled;
    }
  } catch (e) {
    console.warn("[Staff] Failed to check staff capabilities:", e);
  }
  return false;
}

async function loadRestaurantTablesSetting() {
  const enabled = await checkStaffOrderingCapability();
  if (enabled) {
    await loadRestaurantTables();
  }
}

async function loadRestaurantTables() {
  const tenantId = (typeof getTenantIdFromUrl === "function" && getTenantIdFromUrl()) || "";
  if (!tenantId) return;

  const tbody = document.getElementById("tables-list-tbody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 24px; color: #94a3b8;">${t("staffLoading")}</td></tr>`;
  }

  const workerUrl = typeof WORKER_BASE !== "undefined" ? WORKER_BASE : "https://benmi-worker-official.thuanmnc.workers.dev";
  const res = await fetch(`${workerUrl}/api/staff/tables?tenant_id=${encodeURIComponent(tenantId)}&include_inactive=1&_t=${Date.now()}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 24px; color: #ef4444;">${escapeHtml(t("tableSaveFail"))}</td></tr>`;
    }
    return;
  }

  const data = await res.json();
  currentRestaurantTables = data.tables || [];
  renderRestaurantTablesList();
}

function renderRestaurantTablesList() {
  const tbody = document.getElementById("tables-list-tbody");
  if (!tbody) return;

  if (currentRestaurantTables.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 32px 16px; color: #94a3b8;">${t("staffNoTables")}</td></tr>`;
    return;
  }

  tbody.innerHTML = currentRestaurantTables.map(table => {
    const isActive = table.is_active === 1 || table.is_active === true;
    const hasActiveOrder = !!table.active_order_key;
    let statusPill = "";
    if (isActive) {
      if (hasActiveOrder) {
        statusPill = `<span style="display:inline-flex; align-items:center; gap:6px; background:#fef3c7; color:#b45309; padding:4px 10px; border-radius:6px; font-weight:700; font-size:12.5px;">
          <span style="width:6px; height:6px; border-radius:50%; background:#f59e0b;"></span>
          <span>${t("tableOccupied")} #${escapeHtml(table.active_display_key || table.active_order_id || '')}</span>
        </span>`;
      } else {
        statusPill = `<span style="display:inline-flex; align-items:center; gap:6px; background:#dcfce7; color:#15803d; padding:4px 10px; border-radius:6px; font-weight:700; font-size:12.5px;">
          <span style="width:6px; height:6px; border-radius:50%; background:#22c55e;"></span>
          <span>${t("tableEmpty")}</span>
        </span>`;
      }
    } else {
      statusPill = `<span style="display:inline-flex; align-items:center; gap:6px; background:#f1f5f9; color:#64748b; padding:4px 10px; border-radius:6px; font-weight:700; font-size:12.5px;">
        <span style="width:6px; height:6px; border-radius:50%; background:#94a3b8;"></span>
        <span>${t("tableStatusDisabled")}</span>
      </span>`;
    }

    const disableAction = hasActiveOrder || !window.staffOrderingCapabilities?.tables_write ? `disabled title="${t("tableHasActiveOrder")}"` : '';

    return `
      <tr style="border-bottom: 1px solid var(--border); transition: background 0.15s ease;">
        <td style="padding: 14px 16px; font-weight: 800; color: #1e293b; font-size: 15px;">
          ${escapeHtml(table.label)}
        </td>
        <td style="padding: 14px 16px; color: #64748b; font-weight: 600;">
          ${table.sort_order || 0}
        </td>
        <td style="padding: 14px 16px;">
          ${statusPill}
        </td>
        <td style="padding: 14px 16px; text-align: right; white-space: nowrap;">
          <button type="button" class="btn btn-ghost btn-sm" style="margin-right: 6px; padding: 6px 12px; font-weight: 700; border-radius: 6px; min-height: 48px;" onclick="openEditTableModal('${table.id}')">
            ${t("tableEdit")}
          </button>
          <button type="button" class="btn ${isActive ? 'btn-ghost' : 'btn-primary'} btn-sm" style="padding: 6px 12px; font-weight: 700; border-radius: 6px; min-height: 48px; ${isActive ? 'color: #ef4444; border-color: #fee2e2;' : ''}" ${disableAction} onclick="toggleTableActive('${table.id}', ${isActive ? 0 : 1})">
            ${isActive ? t("tableDisable") : t("tableEnable")}
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function openAddTableModal() {
  const modal = document.getElementById("tableEditorModal");
  if (!modal) return;
  const title = document.getElementById("table-editor-modal-title");
  if (title) title.innerText = (typeof t === "function" && t("tableEditorAddTitle")) || "新增桌號";
  document.getElementById("table-editor-id").value = "";
  document.getElementById("table-editor-label").value = "";
  document.getElementById("table-editor-sort").value = "0";
  const activeGrp = document.getElementById("table-editor-active-group");
  if (activeGrp) activeGrp.style.display = "none";
  modal.style.display = "flex";
  setTimeout(() => {
    const inp = document.getElementById("table-editor-label");
    if (inp) inp.focus();
  }, 100);
}

function openEditTableModal(tableId) {
  const table = currentRestaurantTables.find(t => t.id === tableId);
  if (!table) return;
  const modal = document.getElementById("tableEditorModal");
  if (!modal) return;
  const title = document.getElementById("table-editor-modal-title");
  if (title) title.innerText = (typeof t === "function" && t("tableEditorEditTitle")) || "編輯桌號";
  document.getElementById("table-editor-id").value = table.id;
  document.getElementById("table-editor-label").value = table.label;
  document.getElementById("table-editor-sort").value = table.sort_order || 0;
  const activeGrp = document.getElementById("table-editor-active-group");
  if (activeGrp) {
    activeGrp.style.display = "block";
    const chk = document.getElementById("table-editor-active");
    if (chk) chk.checked = (table.is_active === 1 || table.is_active === true);
  }
  modal.style.display = "flex";
}

function closeTableEditorModal() {
  const modal = document.getElementById("tableEditorModal");
  if (modal) modal.style.display = "none";
}

async function submitTableEditor() {
  const tenantId = (typeof getTenantIdFromUrl === "function" && getTenantIdFromUrl()) || "";
  if (!tenantId) return;

  const id = document.getElementById("table-editor-id").value.trim();
  const label = document.getElementById("table-editor-label").value.trim();
  const sort = parseInt(document.getElementById("table-editor-sort").value, 10) || 0;
  const chkActive = document.getElementById("table-editor-active");
  const isActive = chkActive ? (chkActive.checked ? 1 : 0) : 1;

  if (!label) {
    alert(t("tableNamePlaceholder"));
    return;
  }

  const btnSave = document.getElementById("btn-save-table-editor");
  if (btnSave) btnSave.disabled = true;

  try {
    const workerUrl = typeof WORKER_BASE !== "undefined" ? WORKER_BASE : "https://benmi-worker-official.thuanmnc.workers.dev";
    let res;
    if (id) {
      res = await fetch(`${workerUrl}/api/staff/tables/${encodeURIComponent(id)}?tenant_id=${encodeURIComponent(tenantId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ label, sort_order: sort, is_active: isActive })
      });
    } else {
      res = await fetch(`${workerUrl}/api/staff/tables?tenant_id=${encodeURIComponent(tenantId)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ label, sort_order: sort })
      });
    }

    const data = await res.json().catch(() => ({}));
    if (res.ok && data && data.ok) {
      closeTableEditorModal();
      await loadRestaurantTables();
      if (typeof showToast === "function") {
        showToast(t("tableSaveSuccess"));
      }
    } else {
      alert(t(data?.error === "TABLE_HAS_ACTIVE_ORDER" ? "tableHasActiveOrder" : "tableSaveFail"));
    }
  } catch (e) {
    alert(t("staffNetworkError"));
  } finally {
    if (btnSave) btnSave.disabled = false;
  }
}

async function toggleTableActive(tableId, newActive) {
  const tenantId = (typeof getTenantIdFromUrl === "function" && getTenantIdFromUrl()) || "";
  if (!tenantId) return;

  try {
    const workerUrl = typeof WORKER_BASE !== "undefined" ? WORKER_BASE : "https://benmi-worker-official.thuanmnc.workers.dev";
    const res = await fetch(`${workerUrl}/api/staff/tables/${encodeURIComponent(tableId)}?tenant_id=${encodeURIComponent(tenantId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ is_active: newActive })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data && data.ok) {
      await loadRestaurantTables();
    } else {
      alert(t(data?.error === "TABLE_HAS_ACTIVE_ORDER" ? "tableHasActiveOrder" : "tableSaveFail"));
    }
  } catch (e) {
    alert(t("staffNetworkError"));
  }
}

function openStaffOrderWindow() {
  if (typeof switchTab === "function") {
    switchTab("staff-order");
    return;
  }
  const tenantId = (typeof getTenantIdFromUrl === "function" && getTenantIdFromUrl()) || "";
  if (!tenantId) return;
  const environment = WORKER_BASE.includes("-staging.") ? "staging" : WORKER_BASE.includes("-dev.") ? "dev" : "prod";
  const url = `staff-order.html?tenant_id=${encodeURIComponent(tenantId)}&env=${environment}`;
  window.location.href = url;
}

window.checkStaffOrderingCapability = checkStaffOrderingCapability;
window.loadRestaurantTablesSetting = loadRestaurantTablesSetting;
window.loadRestaurantTables = loadRestaurantTables;
window.renderRestaurantTablesList = renderRestaurantTablesList;
window.openAddTableModal = openAddTableModal;
window.openEditTableModal = openEditTableModal;
window.closeTableEditorModal = closeTableEditorModal;
window.submitTableEditor = submitTableEditor;
window.toggleTableActive = toggleTableActive;
window.openStaffOrderWindow = openStaffOrderWindow;

