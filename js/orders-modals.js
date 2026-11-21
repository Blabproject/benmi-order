// ==========================================
// Benmi POS - Module: Modals & Change/Reject
// ==========================================

// Reset after display: hidden elements have no scrollable layout to reset.
function showModalFromTop(modal) {
  if (!modal) return;
  modal.style.display = "flex";
  modal.scrollTop = 0;
  modal.scrollLeft = 0;
  modal.querySelectorAll(".modal-body, .modal-content").forEach(region => {
    region.scrollTop = 0;
    region.scrollLeft = 0;
  });
}
window.showModalFromTop = showModalFromTop;

if (typeof window !== "undefined" && !window.__orderModalEscRegistered) {
  window.__orderModalEscRegistered = true;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Esc") {
      const alertEl = document.getElementById("new-alert");
      if (alertEl && alertEl.style.display === "flex") {
        dismissNewAlert();
        return;
      }
      const revModal = document.getElementById("reviewModal");
      if (revModal && revModal.style.display !== "none") {
        if (typeof dismissReviewModal === "function") {
          dismissReviewModal();
        } else {
          closeModal();
        }
        return;
      }
      const bundleGuideModal = document.getElementById("bundleGuideModal");
      if (bundleGuideModal && bundleGuideModal.style.display !== "none") {
        if (typeof closeBundleGuideModal === "function") {
          closeBundleGuideModal();
          return;
        }
      }
      const bundleModal = document.getElementById("modal-bundle-editor");
      if (bundleModal && bundleModal.style.display !== "none") {
        if (typeof closeBundleEditorModal === "function") {
          closeBundleEditorModal();
          return;
        }
      }
    }
  });
}

function initOrderDetailHeaderScroll() {
  const reviewModal = document.getElementById("reviewModal");
  if (reviewModal && !reviewModal.dataset.headerScrollInit) {
    const detailTopbar = reviewModal.querySelector(".order-detail-topbar");
    if (detailTopbar) {
      reviewModal.dataset.headerScrollInit = "true";
      detailTopbar.classList.remove("topbar-hidden");
      reviewModal.addEventListener("scroll", () => {
        detailTopbar.classList.toggle("is-scrolled", reviewModal.scrollTop > 20);
      }, { passive: true });
    }
  }

  const bundleModal = document.getElementById("modal-bundle-editor");
  if (bundleModal && !bundleModal.dataset.headerScrollInit) {
    const bundleTopbar = bundleModal.querySelector(".bundle-modal-topbar");
    if (bundleTopbar) {
      bundleModal.dataset.headerScrollInit = "true";
      bundleModal.addEventListener("scroll", () => {
        bundleTopbar.classList.toggle("is-scrolled", bundleModal.scrollTop > 20);
      }, { passive: true });
    }
  }
}
window.initOrderDetailHeaderScroll = initOrderDetailHeaderScroll;

function openReview(orderKey) {
  const order = (latestOrders || []).find(o => o && o.key === orderKey) || (typeof lastHistoryOrders !== "undefined" ? (lastHistoryOrders || []).find(o => o && o.key === orderKey) : null);
  if (!order) return;
  reviewingOrder = order;
  if (typeof unacknowledgedAppends !== "undefined") {
    unacknowledgedAppends.delete(orderKey);
  }

  if (order.status === "NEW") {
    if (typeof captureReturnContext === "function") {
      captureReturnContext();
    }
    dismissNewAlert();
  } else if (typeof updateNewAlert === "function") {
    updateNewAlert();
  }

  window.PosOrderDetail?.render(order);
  window.PaymentPOS?.mount(order);
  if (typeof updatePrintActionAvailability === "function") updatePrintActionAvailability();

  const modal = document.getElementById("reviewModal");
  if (modal) {
    modal.querySelector(".order-detail-topbar")?.classList.remove("topbar-hidden", "is-scrolled");
    initOrderDetailHeaderScroll();
    showModalFromTop(modal);
    modal.focus?.({ preventScroll: true });
  }

  if (typeof ensureTenantCustomizations === "function") {
    ensureTenantCustomizations().then(custs => {
      if (Array.isArray(custs) && custs.length > 0 && reviewingOrder?.key === order.key) {
        refreshOrderDetail();
      }
    });
  }
}

function refreshOrderDetail(refreshItems = true) {
  const modal = document.getElementById("reviewModal");
  if (!reviewingOrder || modal?.style.display !== "flex") return;
  const etaOrder = latestOrders.find(order => order?.key === reviewingOrder.key) || reviewingOrder;
  window.PosOrderDetail?.render(reviewingOrder, etaOrder, refreshItems);
}

function completeOrderFromReview(btn) {
  if (!reviewingOrder) return;
  const targetStatus = isOrderDineIn(reviewingOrder) ? "PAID" : "PICKED_UP";
  return updateStatus(reviewingOrder.key, targetStatus, {}, btn).then(saved => { if (saved) closeModal(); });
}
window.completeOrderFromReview = completeOrderFromReview;

function cancelOrderFromReview() {
  if (!reviewingOrder?.key || !confirm(t("confirmCancelOrder"))) return;
  return updateStatus(reviewingOrder.key, "REJECTED", { reason: "取消並不回復客戶" }).then(saved => { if (saved) closeModal(); });
}

function selectChangeReason(val) {
  const sel = document.getElementById("change-reason");
  if (sel) {
    sel.value = val;
    onChangeReasonChange();
  }
  const noteEl = document.getElementById("change-note");
  updateChangeSubmitButton(noteEl ? noteEl.value : "");
}

function selectRejectReason(val) {
  const sel = document.getElementById("reject-reason");
  if (sel) {
    sel.value = val;
  }
  document.querySelectorAll(".reject-card").forEach(card => {
    if (card.dataset.val === val || (card.dataset.val === "訂單過多" && val.startsWith("訂單過多"))) {
      card.classList.add("active");
    } else {
      card.classList.remove("active");
    }
  });
}

function getOrderBaseTime() {
  const now = new Date();
  if (reviewingOrder?.time) {
    const timeStr = String(reviewingOrder.time);
    const dateMatch = timeStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      const orderDate = new Date();
      if (dateMatch) {
        orderDate.setFullYear(parseInt(dateMatch[1], 10), parseInt(dateMatch[2], 10) - 1, parseInt(dateMatch[3], 10));
      }
      orderDate.setHours(h, m, 0, 0);
      return orderDate;
    }
  }
  return now;
}

function formatTimeHHMM(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function renderTimePresets() {
  const baseTime = getOrderBaseTime();
  const origTimeEl = document.getElementById("change-orig-time-val");
  if (origTimeEl) {
    origTimeEl.innerText = formatTimeHHMM(baseTime);
  }

  const presetMinutes = [5, 10, 15, 20, 30, 45];
  presetMinutes.forEach(mins => {
    const target = new Date(baseTime.getTime() + mins * 60000);
    const el = document.getElementById(`preset-target-${mins}`);
    if (el) el.innerText = formatTimeHHMM(target);
  });
}

function applyTimePreset(minutes) {
  const baseTime = getOrderBaseTime();
  const target = new Date(baseTime.getTime() + minutes * 60000);
  const targetStr = formatTimeHHMM(target);
  
  const noteEl = document.getElementById("change-note");
  if (noteEl) noteEl.value = targetStr;

  document.querySelectorAll(".preset-card").forEach(card => {
    card.classList.toggle("active", parseInt(card.dataset.mins, 10) === minutes);
  });

  updateChangeSubmitButton(targetStr);
}

function adjustTimeMinutes(deltaMinutes) {
  const noteEl = document.getElementById("change-note");
  if (!noteEl) return;
  const baseTime = getOrderBaseTime();
  let curr = new Date(baseTime.getTime());
  const match = String(noteEl.value).match(/(\d{1,2}):(\d{2})/);
  if (match) {
    curr.setHours(parseInt(match[1], 10), parseInt(match[2], 10), 0, 0);
  }
  const target = new Date(curr.getTime() + deltaMinutes * 60000);
  const targetStr = formatTimeHHMM(target);
  noteEl.value = targetStr;

  // Check if targetStr matches any preset card
  const diffMins = Math.round((target.getTime() - baseTime.getTime()) / 60000);
  document.querySelectorAll(".preset-card").forEach(card => {
    card.classList.toggle("active", parseInt(card.dataset.mins, 10) === diffMins);
  });

  updateChangeSubmitButton(targetStr);
}

function updateChangeSubmitButton(timeStr) {
  const btn = document.getElementById("btn-change-send");
  if (!btn) return;
  const reason = document.getElementById("change-reason").value;
  if (reason === "時間需調整" && timeStr) {
    btn.innerText = `${t('btnSendSuggest')} (${timeStr})`;
  } else {
    btn.innerText = t('btnSendSuggest');
  }
}

let tenantMenuItemsCache = null;

async function fetchTenantMenuItems() {
  if (tenantMenuItemsCache && tenantMenuItemsCache.length > 0) {
    return tenantMenuItemsCache;
  }
  const tenantId = getTenantIdFromUrl();
  if (!tenantId) return [];
  try {
    const res = await fetch(`${WORKER_BASE}/api/tenant/bootstrap?tenant_id=${tenantId}&_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      const itemsMap = new Map();

      const catalogList = Array.isArray(data.catalog) ? data.catalog : (Array.isArray(data.categories) ? data.categories : []);
      catalogList.forEach(cat => {
        if (Array.isArray(cat.items)) {
          cat.items.forEach(item => {
            if (item && item.name && !itemsMap.has(item.name)) {
              itemsMap.set(item.name, {
                name: item.name,
                category: cat.name || cat.title || ""
              });
            }
          });
        }
      });

      if (Array.isArray(data.items)) {
        data.items.forEach(item => {
          if (item && item.name && !itemsMap.has(item.name)) {
            itemsMap.set(item.name, {
              name: item.name,
              category: ""
            });
          }
        });
      }

      if (itemsMap.size > 0) {
        tenantMenuItemsCache = Array.from(itemsMap.values());
        return tenantMenuItemsCache;
      }
    }
  } catch (e) {
    console.warn("[SoldOutGrid] fetchTenantMenuItems error:", e);
  }

  return [];
}

async function renderSoldOutItemsGrid(order = null) {
  const grid = document.getElementById("change-soldout-grid");
  if (!grid) return;

  const menuItems = await fetchTenantMenuItems();
  if (!menuItems || menuItems.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #9ca3af; padding: 16px;">(尚無菜單品項)</div>`;
    return;
  }

  // Detect ordered items from reviewingOrder if available
  const orderItemNames = new Set();
  if (order && order.content) {
    menuItems.forEach(item => {
      if (order.content.includes(item.name)) {
        orderItemNames.add(item.name);
      }
    });
  }

  // Sort items: items appearing in current order come first
  const sortedItems = [...menuItems].sort((a, b) => {
    const aInOrder = orderItemNames.has(a.name) ? 1 : 0;
    const bInOrder = orderItemNames.has(b.name) ? 1 : 0;
    return bInOrder - aInOrder;
  });

  grid.innerHTML = sortedItems.map(item => {
    const isInOrder = orderItemNames.has(item.name);
    const badgeHtml = isInOrder ? `<span style="font-size: var(--pos-text-meta); background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-weight: 800; margin-left: 4px;">本單</span>` : '';
    return `
      <label class="checkbox-card" style="${isInOrder ? 'border-color: #f59e0b; background: #fffdf5;' : ''}">
        <input type="checkbox" value="${escapeHtml(item.name)}" class="sold-item">
        <span>${escapeHtml(item.name)}</span>${badgeHtml}
      </label>
    `;
  }).join("");
}

function clearSoldOutItems() {
  const checkboxes = document.querySelectorAll(".sold-item");
  if (checkboxes) checkboxes.forEach(cb => cb.checked = false);
}

function reviewOpenChange() {
  if (!reviewingOrder?.key) return;
  const savedKey = reviewingOrder.key;  // Save key BEFORE closeModal wipes it
  const savedOrder = reviewingOrder;
  closeModal();
  reviewingOrder = savedOrder;
  currentOrderKey = savedKey;           // Restore after closeModal
  document.getElementById("change-reason").value = "時間需調整";
  renderSoldOutItemsGrid(savedOrder);
  clearSoldOutItems();
  onChangeReasonChange();
  renderTimePresets();
  applyTimePreset(10);
  showModalFromTop(document.getElementById("changeModal"));
}

function reviewOpenReject() {
  if (!reviewingOrder?.key) return;
  const savedKey = reviewingOrder.key;  // Save key BEFORE closeModal wipes it
  const savedOrder = reviewingOrder;
  closeModal();
  reviewingOrder = savedOrder;
  currentOrderKey = savedKey;           // Restore after closeModal
  document.getElementById("reject-reason").selectedIndex = 0;
  selectRejectReason("今日已售完");
  showModalFromTop(document.getElementById("rejectModal"));
}

function onChangeReasonChange() {
  const reason = document.getElementById("change-reason").value;
  const timeDiv = document.getElementById("change-time-div");
  const itemsDiv = document.getElementById("change-items-div");
  const tabTime = document.getElementById("tab-reason-time");
  const tabSold = document.getElementById("tab-reason-soldout");

  if (reason === "時間需調整") {
    if (timeDiv) timeDiv.style.display = "block";
    if (itemsDiv) itemsDiv.style.display = "none";
    if (tabTime) tabTime.classList.add("active");
    if (tabSold) tabSold.classList.remove("active");
  } else {
    if (timeDiv) timeDiv.style.display = "none";
    if (itemsDiv) itemsDiv.style.display = "block";
    if (tabTime) tabTime.classList.remove("active");
    if (tabSold) tabSold.classList.add("active");
    renderSoldOutItemsGrid(reviewingOrder);
  }
}

// Pre-fetch menu items for instant modal responsiveness
fetchTenantMenuItems();

async function confirmAction(type, btn) {
  const key = currentOrderKey;
  const isChange = type === "CHANGE";
  const status = isChange ? "CHANGED" : "REJECTED";
  const reason = isChange ? document.getElementById("change-reason").value : document.getElementById("reject-reason").value;
  let note = isChange ? document.getElementById("change-note").value.trim() : undefined;

  if (isChange && reason === "時間需調整" && !note) {
    alert(t("alertInputTime"));
    return;
  }

  if (isChange && reason === "口味售完") {
    const checked = Array.from(document.querySelectorAll(".sold-item:checked")).map(cb => cb.value);
    if (checked.length === 0) {
      alert(t("alertSelectSoldout"));
      return;
    }
    note = checked.join(",");
  }

  if (!await updateStatus(key, status, { reason, note }, btn)) return;

  const nextKey = typeof getRemainingNewOrderKey === "function" ? getRemainingNewOrderKey(key) : null;
  if (nextKey && typeof openReview === "function") {
    closeModal();
    openReview(nextKey);
  } else if (typeof finishReviewFlow === "function") {
    finishReviewFlow();
  } else {
    closeModal();
  }
}

function openBlabContactModal(topic = 'general') {
  const modal = document.getElementById("blabContactModal");
  if (!modal) return;

  const lang = typeof currentLang !== 'undefined' ? currentLang : 'zh-TW';
  const dict = typeof I18N !== 'undefined' ? (I18N[lang] || I18N['zh-TW']) : {};
  const bannerEl = document.getElementById("blab-contact-context-banner");
  const titleEl = document.getElementById("blab-context-banner-title");
  const descEl = document.getElementById("blab-context-banner-desc");
  const iconEl = document.getElementById("blab-context-banner-icon");

  // The support card already explains general help; show a banner only for a specific request.
  if (bannerEl && titleEl && descEl) {
    bannerEl.style.display = topic === 'history' || topic === 'upgrade' ? "flex" : "none";
    if (topic === 'history') {
      bannerEl.style.background = "#f0fdf4";
      bannerEl.style.borderColor = "#86efac";
      if (iconEl) {
        iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5M3 8a9 9 0 1 1-1 4"/><path d="M12 7v5l4 2"/></svg>`;
      }
      titleEl.textContent = dict.blabContextHistoryTitle;
      descEl.textContent = dict.blabContextHistoryDesc;
    } else if (topic === 'upgrade') {
      bannerEl.style.background = "#faf5ff";
      bannerEl.style.borderColor = "#d8b4fe";
      if (iconEl) {
        iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9333ea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 2-3 8H3l8 12 3-8h7L13 2z"/></svg>`;
      }
      titleEl.textContent = dict.blabContextUpgradeTitle;
      descEl.textContent = dict.blabContextUpgradeDesc;
    }
  }

  if (modal.style.display !== "flex") modal.blabReturnFocus = document.activeElement;
  modal.onclick = (event) => {
    if (event.target === modal) closeBlabContactModal();
  };
  modal.onkeydown = (event) => {
    if (event.key === "Escape" || event.key === "Esc") {
      event.preventDefault();
      event.stopPropagation();
      closeBlabContactModal();
    } else if (event.key === "Tab") {
      const controls = modal.querySelectorAll('button, a[href]');
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  showModalFromTop(modal);
  document.getElementById("blab-support-close")?.focus({ preventScroll: true });
}

function closeBlabContactModal() {
  const modal = document.getElementById("blabContactModal");
  if (!modal) return;
  modal.style.display = "none";
  if (modal.blabReturnFocus?.isConnected) modal.blabReturnFocus.focus({ preventScroll: true });
  modal.blabReturnFocus = null;
}

function openPrinterGuideModal() {
  const modal = document.getElementById("printerGuideModal");
  if (modal) showModalFromTop(modal);
}

function closePrinterGuideModal() {
  const modal = document.getElementById("printerGuideModal");
  if (modal) modal.style.display = "none";
}

function openBundleGuideModal() {
  const modal = document.getElementById("bundleGuideModal");
  if (modal) showModalFromTop(modal);
}
window.openBundleGuideModal = openBundleGuideModal;

function closeBundleGuideModal() {
  const modal = document.getElementById("bundleGuideModal");
  if (modal) modal.style.display = "none";
}
window.closeBundleGuideModal = closeBundleGuideModal;

function showStoreActivationModal(force = false) {
  // Hotfix: Never display login/store activation modal when running in a standard web browser (not app)
  if (!force && typeof isNativeAppPlatform === "function" && !isNativeAppPlatform()) {
    return;
  }
  const modal = document.getElementById("storeActivationModal");
  if (!modal) return;
  if (force) {
    modal.classList.add("force-show");
  }
  // If already displayed, do not re-initialize or steal focus from active inputs
  if (modal.style.display === "flex") return;
  showModalFromTop(modal);

  const inpTenant = document.getElementById("activation-tenant-id");
  const inpPin = document.getElementById("activation-pin");
  const errDiv = document.getElementById("activation-error-msg");

  if (inpTenant) {
    let saved = "";
    try { saved = localStorage.getItem("pos_device_tenant_id") || ""; } catch (e) {}
    if (saved) {
      inpTenant.value = saved;
      if (inpPin) inpPin.focus();
    } else {
      inpTenant.focus();
    }
  }
  if (inpPin && (!inpTenant || !inpTenant.value)) inpPin.value = "";
  if (errDiv) {
    errDiv.style.display = "none";
    errDiv.innerText = "";
  }
}

function closeStoreActivationModal() {
  const modal = document.getElementById("storeActivationModal");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("force-show");
  }
}

async function submitStoreActivation(e) {
  if (e && e.preventDefault) e.preventDefault();

  const inpTenant = document.getElementById("activation-tenant-id");
  const inpPin = document.getElementById("activation-pin");
  const btnSubmit = document.getElementById("btn-submit-activation");
  const btnText = document.getElementById("i18n-btn-submit-activation-text");
  const errDiv = document.getElementById("activation-error-msg");

  const tenantId = inpTenant ? inpTenant.value.trim().toLowerCase() : "";
  const pin = inpPin ? inpPin.value.trim() : "";

  if (!tenantId || !pin) {
    if (errDiv) {
      errDiv.innerText = (typeof t === "function" && t("activationErrorRequired")) || "請完整填寫門市代碼與管理 PIN 碼。";
      errDiv.style.display = "block";
    }
    return;
  }

  // Loading state
  if (btnSubmit) btnSubmit.disabled = true;
  if (btnText) btnText.innerText = (typeof t === "function" && t("btnVerifying")) || "正在驗證中...";
  if (errDiv) {
    errDiv.style.display = "none";
    errDiv.innerText = "";
  }

  try {
    const workerUrl = typeof WORKER_BASE !== "undefined" ? WORKER_BASE : "https://benmi-worker-official.thuanmnc.workers.dev";
    const res = await fetch(`${workerUrl}/api/auth?pw=${encodeURIComponent(pin)}&tenant_id=${encodeURIComponent(tenantId)}`);
    const data = await res.json().catch(() => ({ ok: false }));

    if (res.ok && data && data.ok) {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("pos_device_tenant_id", tenantId);
        try {
          const bootRes = await fetch(`${workerUrl}/api/tenant/bootstrap?tenant_id=${tenantId}&_t=${Date.now()}`);
          if (bootRes.ok) {
            const bootData = await bootRes.json();
            if (bootData.tenant) {
              localStorage.setItem("tenant_branding_" + tenantId, JSON.stringify(bootData.tenant));
              localStorage.setItem("tenant_theme_" + tenantId, JSON.stringify(bootData.tenant));
            }
          }
        } catch (err) {}
      }

      closeStoreActivationModal();

      // Reload with query param to ensure clean bootstrap
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("tenant", tenantId);
      window.location.href = currentUrl.toString();
    } else {
      if (errDiv) {
        if (data && data.error === "invalid_tenant") {
          errDiv.innerText = (typeof t === "function" && t("activationErrorTenantNotFound")) || "門市代碼不存在或已停用，請重新確認。";
        } else if (data && data.error === "invalid_password") {
          errDiv.innerText = (typeof t === "function" && t("activationErrorWrongPin")) || "管理 PIN 碼錯誤，請重新確認。";
        } else {
          errDiv.innerText = (data && data.message) || (typeof t === "function" && t("activationErrorInvalid")) || "門市代碼或管理 PIN 碼錯誤，請重新確認。";
        }
        errDiv.style.display = "block";
      }
    }
  } catch (err) {
    if (errDiv) {
      errDiv.innerText = (typeof t === "function" && t("activationErrorNetwork")) || "連線驗證失敗，請檢查網路連線後重試。";
      errDiv.style.display = "block";
    }
  } finally {
    if (btnSubmit) btnSubmit.disabled = false;
    if (btnText) btnText.innerText = (typeof t === "function" && t("btnSubmitActivation")) || "啟用終端並開始接單";
  }
}

window.showStoreActivationModal = showStoreActivationModal;
window.closeStoreActivationModal = closeStoreActivationModal;
window.submitStoreActivation = submitStoreActivation;

// ==========================================
// Quick Sticker / Emergency Note Sticker Modal
// ==========================================
var quickStickerOrderKey = null;

function openQuickStickerModal(orderKey) {
  quickStickerOrderKey = orderKey || (typeof reviewingOrder !== "undefined" && reviewingOrder ? reviewingOrder.key : null);
  const modal = document.getElementById("quickStickerModal");
  if (modal) showModalFromTop(modal);
  const customInput = document.getElementById("quick-sticker-custom-input");
  if (customInput) {
    customInput.value = "";
    setTimeout(() => customInput.focus(), 100);
  }
  renderQuickStickerOptions();
}

function closeQuickStickerModal() {
  const modal = document.getElementById("quickStickerModal");
  if (modal) modal.style.display = "none";
  quickStickerOrderKey = null;
}

function renderQuickStickerOptions() {
  const container = document.getElementById("quick-sticker-chips-container");
  if (!container) return;

  const currentLanguage = (typeof currentLang !== "undefined" && currentLang) || (typeof window !== "undefined" && window.currentLang) || "zh-TW";
  const isVi = currentLanguage === "vi";

  const groups = [];

  // If menu data has modifier categories
  if (typeof currentMenuData !== "undefined" && Array.isArray(currentMenuData) && currentMenuData.length > 0) {
    const modCats = currentMenuData.filter(c => c && (c.type === 'modifier' || (c.name && (c.name.includes('辣') || c.name.includes('客製') || c.name.includes('加料') || c.name.includes('甜度') || c.name.includes('冰量') || c.name.toLowerCase().includes('topping') || c.name.toLowerCase().includes('cay') || c.name.toLowerCase().includes('đường')))));
    modCats.forEach(cat => {
      if (Array.isArray(cat.items) && cat.items.length > 0) {
        groups.push({
          title: cat.name || (isVi ? "Tùy chọn món" : "客製選項"),
          options: cat.items.map(it => typeof it === 'string' ? it : (it.name || '')).filter(Boolean)
        });
      }
    });
  }

  // Fallback / Standard F&B Fast-Tap groups if empty or supplementary
  if (groups.length === 0) {
    if (isVi) {
      groups.push({
        title: (typeof t === "function" && t("quickStickerGroupSpice")) || "Gia vị cay",
        options: ["Không cay", "Cay nhẹ", "Cay vừa", "Cay nhiều", "Ớt hiểm tươi"]
      });
      groups.push({
        title: (typeof t === "function" && t("quickStickerGroupVeggie")) || "Rau gia vị",
        options: ["Không ngò / rau mùi", "Không hành tây", "Không đồ chua", "Không hành lá", "Thêm ngò", "Thêm hành"]
      });
      groups.push({
        title: (typeof t === "function" && t("quickStickerGroupIceSugar")) || "Đá & Đường",
        options: ["Không đá", "Ít đá", "Đá vừa", "Uống nóng", "Không đường", "Ít đường", "50% đường"]
      });
      groups.push({
        title: (typeof t === "function" && t("quickStickerGroupKitchen")) || "Ghi chú bếp",
        options: ["Để riêng từng món", "Kèm muỗng nĩa", "Nước sốt để riêng", "Làm gấp đơn này", "In lại tem"]
      });
    } else {
      groups.push({
        title: (typeof t === "function" && t("quickStickerGroupSpice")) || "辣度選項",
        options: ["不辣", "微辣", "小辣", "中辣", "大辣", "生辣椒"]
      });
      groups.push({
        title: (typeof t === "function" && t("quickStickerGroupVeggie")) || "蔥花與香菜",
        options: ["不要香菜", "不要洋蔥", "不要酸菜", "不要蔥花", "加量香菜", "加量洋蔥"]
      });
      groups.push({
        title: (typeof t === "function" && t("quickStickerGroupIceSugar")) || "甜度與冰量",
        options: ["去冰", "微冰", "少冰", "熱飲", "無糖", "微糖", "半糖"]
      });
      groups.push({
        title: (typeof t === "function" && t("quickStickerGroupKitchen")) || "出餐與分裝",
        options: ["外帶分裝", "餐具另外放", "醬汁另外裝", "先做此單", "補印單品"]
      });
    }
  }

  let html = "";
  groups.forEach(grp => {
    html += `
      <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 12px 14px;">
        <div style="font-size: var(--pos-text-meta); font-weight: 800; color: #64748b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(grp.title)}</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${grp.options.map(opt => `
            <button type="button" class="btn btn-ghost quick-sticker-chip" style="min-height: 44px; padding: 8px 14px; font-size: var(--pos-text-body); font-weight: 800; border-radius: 8px; background: #ffffff; border: 1.5px solid #cbd5e1; color: #1e293b; cursor: pointer; transition: all 0.15s ease;" onclick="printQuickModifierOption('${escapeHtml(opt)}')">
              ${escapeHtml(opt)}
            </button>
          `).join("")}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function printQuickModifierOption(text) {
  if (!text) return;
  const order = (typeof latestOrders !== "undefined" ? latestOrders.find(o => o && o.key === quickStickerOrderKey) : null) || (typeof reviewingOrder !== "undefined" ? reviewingOrder : null);
  if (typeof PrinterService !== "undefined" && typeof PrinterService.printQuickModifierSticker === "function") {
    await PrinterService.printQuickModifierSticker(text, order);
  }
}

async function printCustomQuickSticker() {
  const input = document.getElementById("quick-sticker-custom-input");
  const val = input ? input.value.trim() : "";
  if (!val) {
    if (input) input.focus();
    return;
  }
  await printQuickModifierOption(val);
  if (input) input.value = "";
}

window.openQuickStickerModal = openQuickStickerModal;
window.closeQuickStickerModal = closeQuickStickerModal;
window.renderQuickStickerOptions = renderQuickStickerOptions;
window.printQuickModifierOption = printQuickModifierOption;
window.printCustomQuickSticker = printCustomQuickSticker;
