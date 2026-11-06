/**
 * client-checkout.js
 * Quản lý quy trình đặt hàng, kiểm tra hợp lệ, hẹn giờ lấy món và gửi đơn hàng.
 */

var cart = window.cart;
var customizeData = window.customizeData;

async function reportLiffSendFailure(details) {
    try {
        const response = await fetch(`${WORKER_BASE}/api/line/client-error?tenant_id=${encodeURIComponent(details.tenantId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': details.tenantId },
            body: JSON.stringify(details),
            keepalive: true
        });
        if (!response.ok) throw new Error(`Telemetry returned HTTP ${response.status}`);
    } catch (error) {
        console.error('[LIFF] Failed to record send error in Cloudflare', {
            orderKey: details.orderKey,
            attempt: details.attempt,
            message: String(error?.message || error)
        });
    }
}

async function getLiffDeliveryDiagnostic() {
    let context = null, permissionState = 'unknown', isInClient = false;
    try {
        if (typeof liff !== 'undefined') {
            isInClient = Boolean(liff.isInClient?.());
            context = liff.getContext?.() || null;
            if (isInClient && typeof liff.permission?.query === 'function') {
                // A stalled diagnostic must not block order submission.
                let timer;
                try {
                    const permission = await Promise.race([
                        liff.permission.query('chat_message.write'),
                        new Promise(resolve => { timer = setTimeout(() => resolve(null), 1500); })
                    ]);
                    permissionState = permission?.state || 'unknown';
                } finally { clearTimeout(timer); }
            }
        }
    } catch (_) { }
    const contextType = context?.type || null;
    return {
        permissionState, isInClient, contextType,
        deliveryMode: !isInClient || ['prompt', 'unavailable'].includes(permissionState)
            || ['none', 'external'].includes(contextType) ? 'push' : 'reply'
    };
}

async function requestOrderConfirmationPush(notification, tenantId) {
    if (!notification?.id || !notification?.token) return;
    try {
        const timeoutSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(6000)
            : undefined;
        const response = await fetch(`${WORKER_BASE}/api/line/order-receipt/push?tenant_id=${encodeURIComponent(tenantId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': tenantId },
            body: JSON.stringify({ id: notification.id, token: notification.token }),
            keepalive: true,
            signal: timeoutSignal
        });
        if (!response.ok) throw new Error(`Receipt fallback HTTP ${response.status}`);
    } catch (error) {
        // The committed backend receipt remains pending for scheduled delivery.
        console.error('[LINE] Receipt fallback request failed', { receiptId: notification.id, message: String(error?.message || error) });
    }
}

async function sendOrderConfirmation(messages, context, notification, diagnostic) {
    if (diagnostic.deliveryMode === 'push') {
        await requestOrderConfirmationPush(notification, context.tenantId);
        return;
    }
    const trackedMessages = notification?.id ? messages.map(message => message.type === 'text'
        ? { ...message, text: `${message.text}\n確認參考：${notification.id}` } : message) : messages;
    if (notification?.id && trackedMessages.some(message => message.type === 'text' && message.text.length > 5000)) {
        await requestOrderConfirmationPush(notification, context.tenantId);
        return;
    }
    try {
        await sendLiffMessagesWithRetry(trackedMessages, { ...context, diagnostic });
    } catch (_) {
        await requestOrderConfirmationPush(notification, context.tenantId);
    }
}

async function sendLiffMessagesWithRetry(messages, context) {
    const correlationId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID() : String(Date.now());
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            await liff.sendMessages(messages);
            return;
        } catch (error) {
            let liffContext = null;
            try { liffContext = liff.getContext?.() || null; } catch (_) { }
            const details = {
                tenantId: context.tenantId,
                orderKey: context.orderKey,
                flow: context.flow,
                correlationId,
                attempt,
                maxAttempts: 2,
                errorCode: String(error?.code || 'UNKNOWN').slice(0, 64),
                errorMessage: String(error?.message || error).slice(0, 500),
                contextType: liffContext?.type || null,
                liffId: typeof liff.id === 'string' ? liff.id : null,
                chatMessageWriteScope: Array.isArray(liffContext?.scope)
                    ? liffContext.scope.includes('chat_message.write') : null,
                permissionState: context.diagnostic?.permissionState || 'unknown',
                isInClient: context.diagnostic?.isInClient ?? null,
                clientTimestamp: Date.now()
            };
            console.error('[LIFF] sendMessages failed', details);
            // Keep telemetry alive if the customer closes LINE; it must not block retry.
            void reportLiffSendFailure(details);
            if (attempt === 2) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// Append Mode Global State
window.isAppendMode = false;
window.parentOrderKey = null;
window.parentOrderDisplayKey = null;
window.appendTableNumber = null;

// Sold Out Edit Order Mode Global State
window.isEditOrderMode = false;
window.editOrderKey = null;
window.editOrderDisplayKey = null;
window.editOrderOriginalTotal = 0;
window.editOrderSoldOutNames = [];
window.editOrderContextLoaded = false;
window.editOrderContextFailed = false;

function hasAvailableCartItems() {
    if (typeof cart === 'undefined') return false;
    for (const key in cart) {
        if (cart[key] > 0) {
            if (typeof isItemOutOfStock === 'function' && isItemOutOfStock(key)) continue;
            let dName = key;
            try {
                const itemInfo = resolveCatalogItem(key);
                dName = itemInfo?.displayName || itemInfo?.origName || key;
            } catch(e) {}
            const origName = (typeof parseCartKey === 'function') ? parseCartKey(key).itemName : key;
            if (window.isEditOrderMode && Array.isArray(window.editOrderSoldOutNames)) {
                if (window.editOrderSoldOutNames.includes(dName) || window.editOrderSoldOutNames.includes(origName) || window.editOrderSoldOutNames.some(s => s && s.trim() && (dName.includes(s.trim()) || origName.includes(s.trim())))) {
                    continue;
                }
            }
            return true;
        }
    }
    return false;
}

function getUrlParamsWithLiffState() {
    const merged = new URLSearchParams();

    // 1. Kiểm tra direct query search params
    const directParams = new URLSearchParams(window.location.search);
    for (const [k, v] of directParams.entries()) {
        if (k !== 'liff.state') merged.set(k, v);
    }
    
    // 2. Kiểm tra liff.state nếu LINE mã hóa tham số vào liff.state
    const liffState = directParams.get('liff.state');
    if (liffState) {
        try {
            const decoded = decodeURIComponent(liffState);
            const queryPart = decoded.includes('?') ? decoded.split('?')[1] : decoded;
            const stateParams = new URLSearchParams(queryPart);
            for (const [k, v] of stateParams.entries()) {
                merged.set(k, v);
            }
        } catch (e) {
            console.warn("Failed to parse liff.state:", e);
        }
    }

    // 3. Kiểm tra hash nếu tham số được truyền sau dấu #
    if (window.location.hash) {
        try {
            const hashRaw = window.location.hash.substring(1);
            const hashDecoded = decodeURIComponent(hashRaw);
            const hashQuery = hashDecoded.includes('?') ? hashDecoded.split('?')[1] : hashDecoded;
            const hashParams = new URLSearchParams(hashQuery);
            for (const [k, v] of hashParams.entries()) {
                merged.set(k, v);
            }
        } catch (e) {}
    }

    return merged;
}

function initAppendModeIfPresent() {
    const urlParams = getUrlParamsWithLiffState();
    let parentOrderKey = urlParams.get('parent_order_key');
    let paramTableNumber = urlParams.get('table_number');
    let mode = urlParams.get('mode');

    // Check sessionStorage fallback if page reloaded
    if (!parentOrderKey) {
        try {
            parentOrderKey = sessionStorage.getItem('benmi_append_parent');
            paramTableNumber = sessionStorage.getItem('benmi_append_table') || paramTableNumber;
            if (parentOrderKey) mode = 'append';
        } catch (e) {}
    }

    if (parentOrderKey && (mode === 'append' || mode === 'add')) {
        window.isAppendMode = true;
        window.parentOrderKey = parentOrderKey;
        window.parentOrderDisplayKey = urlParams.get('parent_display_key') || (parentOrderKey.length === 36 ? '' : parentOrderKey);
        window.appendTableNumber = paramTableNumber || '';
        try {
            if (!urlParams.get('parent_display_key') && sessionStorage.getItem('benmi_append_parent') === parentOrderKey) {
                window.parentOrderDisplayKey = sessionStorage.getItem('benmi_append_display') || window.parentOrderDisplayKey;
            }
            sessionStorage.setItem('benmi_append_parent', parentOrderKey);
            sessionStorage.setItem('benmi_append_display', window.parentOrderDisplayKey);
            if (paramTableNumber) sessionStorage.setItem('benmi_append_table', paramTableNumber);
        } catch (e) {}

        // Show Banner
        const bannerEl = document.getElementById('append-mode-banner');
        if (bannerEl) {
            bannerEl.style.display = 'flex';
            const tableEl = document.getElementById('append-mode-table');
            if (tableEl) tableEl.innerText = paramTableNumber ? `桌號 ${paramTableNumber}` : '現場內用';
            const keyEl = document.getElementById('append-mode-key');
            if (keyEl) keyEl.innerText = `#${window.parentOrderDisplayKey}`;
        }

        // Lock Dining Option to Dine-In
        if (typeof setCustomerDiningOption === 'function') {
            setCustomerDiningOption('dine_in');
        }
        const toggleWrapper = document.getElementById('dining-option-wrapper');
        if (toggleWrapper) toggleWrapper.style.display = 'none';
        const checkoutToggleGroup = document.getElementById('checkout-dining-option-group');
        if (checkoutToggleGroup) checkoutToggleGroup.style.display = 'none';

        // Hide table number input in append mode (table is already bound to parent order)
        const tableGroup = document.getElementById('dinein-table-input-group');
        if (tableGroup) tableGroup.style.display = 'none';

        const tableInput = document.getElementById('dinein-table-number');
        if (tableInput && paramTableNumber) {
            tableInput.value = paramTableNumber;
        }

        // Update submit button text
        const submitBtn = document.getElementById('btn-submit');
        if (submitBtn) {
            submitBtn.innerText = '確認加點';
        }
    }
}

function cancelAppendMode() {
    window.isAppendMode = false;
    window.parentOrderKey = null;
    window.parentOrderDisplayKey = null;
    window.appendTableNumber = null;
    try {
        sessionStorage.removeItem('benmi_append_parent');
        sessionStorage.removeItem('benmi_append_display');
        sessionStorage.removeItem('benmi_append_table');
    } catch(e) {}

    const bannerEl = document.getElementById('append-mode-banner');
    if (bannerEl) bannerEl.style.display = 'none';

    // Khôi phục ô nhập số bàn
    const tableGroup = document.getElementById('dinein-table-input-group');
    if (tableGroup && window.currentDiningOption === 'dine_in') {
        tableGroup.style.display = 'block';
    }
    const tableInput = document.getElementById('dinein-table-number');
    if (tableInput) {
        tableInput.value = '';
        tableInput.readOnly = false;
        tableInput.style.backgroundColor = '#fff';
        tableInput.style.color = '#1e1b4b';
        tableInput.style.cursor = 'text';
    }

    // Khôi phục bộ chuyển đổi Dine-In / Takeaway
    if (typeof applyPickupConfig === 'function') applyPickupConfig();
    if (typeof updateFooterButtonState === 'function') updateFooterButtonState();
}

function dismissEditOrderLoadingOverlay() {
    try {
        const overlay = document.getElementById('edit-order-loading-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.pointerEvents = 'none';
            setTimeout(() => {
                overlay.style.display = 'none';
                document.documentElement.classList.remove('is-edit-order-loading');
            }, 240);
        } else {
            document.documentElement.classList.remove('is-edit-order-loading');
        }
    } catch (e) {
        document.documentElement.classList.remove('is-edit-order-loading');
    }
}

let editOrderInitPromise = null;

async function initEditOrderModeIfPresent() {
    if (editOrderInitPromise) return editOrderInitPromise;

    const urlParams = getUrlParamsWithLiffState();
    let orderKey = urlParams.get('order_key') || urlParams.get('key');
    let mode = urlParams.get('mode');

    // Check sessionStorage fallback if page reloaded
    if (!orderKey) {
        try {
            orderKey = sessionStorage.getItem('benmi_edit_order_key');
            if (orderKey) mode = 'edit_order';
        } catch (e) {}
    }

    if (!orderKey || (mode !== 'edit_order' && mode !== 'edit')) {
        dismissEditOrderLoadingOverlay();
        return;
    }

    editOrderInitPromise = (async () => {
        // Safety timeout so user is never trapped even if network drops
        const safetyTimer = setTimeout(() => {
            dismissEditOrderLoadingOverlay();
        }, 8000);

        try {
            window.isEditOrderMode = true;
            window.editOrderKey = orderKey;
            window.editOrderContextFailed = false;
            updateFooterButtonState();
            try {
                sessionStorage.setItem('benmi_edit_order_key', orderKey);
            } catch (e) {}

            const tenantId = (typeof getTenantIdFromUrl === 'function' ? getTenantIdFromUrl() : null) || 'benmi';
            console.log(`[EditOrder] Fetching edit context for order ${orderKey} (tenant: ${tenantId})...`);

            // Ensure fresh catalog & bootstrap data are fully loaded first
            if (typeof window.menuPromise !== 'undefined' && window.menuPromise) {
                await window.menuPromise.catch(() => {});
            }
            if (typeof fetchMenu === 'function' && (!bootstrapData || !bootstrapData.catalog)) {
                await fetchMenu().catch(() => {});
            }

            const res = await fetch(`${WORKER_BASE}/api/order/edit-context?key=${encodeURIComponent(orderKey)}&tenant_id=${tenantId}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                console.warn('[EditOrder] Failed to load edit context:', errData);
                window.editOrderContextFailed = true;
                return;
            }

            const data = await res.json();
            if (!data.success || !data.order) {
                console.warn('[EditOrder] Invalid response:', data);
                window.editOrderContextFailed = true;
                return;
            }

            if (data.order.detailSnapshot?.schemaVersion === 1) {
                if (typeof DetailCheckout !== 'undefined') DetailCheckout.setContext(data.order);
                const rounds = data.order.detailSnapshot.rounds.filter(r => r.legacyContent === undefined);
                const requestedRound = Number(urlParams.get('round'));
                const selectedRound = rounds.find(r => r.roundNumber === requestedRound) || rounds[rounds.length - 1];
                if (!selectedRound) throw new Error('Đơn cũ cần đối chiếu / 舊訂單需確認');
                window.detailTargetRound = selectedRound.roundNumber;
                window.editOrderOriginalTotal = selectedRound.total;
                data.items = selectedRound.items.map(i => ({ ...i, unitPrice: i.unitPrice,
                    bundleSelections: { portions: i.portions }, roundNumber: selectedRound.roundNumber }));
                const noteField = document.getElementById('note');
                if (noteField) noteField.value = selectedRound.note;
                const banner = document.getElementById('edit-order-mode-banner');
                if (banner && rounds.length > 1) {
                    const select = document.createElement('select');
                    select.style.minHeight = '48px';
                    select.setAttribute('aria-label', document.documentElement.lang === 'vi' ? 'Đợt cần sửa' : '選擇修改輪次');
                    rounds.forEach(r => {
                        const option = document.createElement('option'); option.value = String(r.roundNumber);
                        option.textContent = document.documentElement.lang === 'vi' ? `Đợt ${r.roundNumber}` : `第 ${r.roundNumber} 輪`;
                        option.selected = r === selectedRound; select.appendChild(option);
                    });
                    select.addEventListener('change', () => {
                        if (!confirm(document.documentElement.lang === 'vi' ? 'Chuyển đợt và bỏ bản nháp đang chỉnh?' : '切換輪次並放棄目前修改？')) { select.value = String(selectedRound.roundNumber); return; }
                        const url = new URL(location.href); url.searchParams.set('round', select.value); location.href = url.href;
                    });
                    banner.appendChild(select);
                }
                for (const group of selectedRound.groups) {
                    for (const el of document.getElementsByName(`opt-${group.groupId}`)) {
                        const choice = group.items.find(c => c.optionId === el.dataset.optionId);
                        el.checked = Boolean(choice);
                        const container = el.closest('.flavor-option-container');
                        if (container) for (const sub of container.querySelectorAll('.sub-opt-chk'))
                            sub.checked = Boolean(choice?.subOptions?.some(s => (s.id || s.name) === (sub.dataset.subId || sub.value)));
                    }
                }
            }
            window.editOrderDisplayKey = data.order.displayKey || orderKey;
            window.editOrderOriginalTotal = window.detailTargetRound ? data.order.detailSnapshot.rounds.find(r => r.roundNumber === window.detailTargetRound).total : Number(data.order.total) || 0;
            window.editOrderSoldOutNames = Array.isArray(data.soldOutItemNames) ? data.soldOutItemNames.filter(s => s && s.trim()) : [];
            window.editOrderContextLoaded = true;

            // Automatically mark sold-out items as isOutOfStock in catalog so customer cannot pick them
            if (window.editOrderSoldOutNames.length > 0) {
                try {
                    if (typeof bootstrapData !== 'undefined' && bootstrapData && bootstrapData.catalog) {
                        bootstrapData.catalog.forEach(cat => {
                            (cat.items || []).forEach(it => {
                                if (window.editOrderSoldOutNames.includes(it.name) || window.editOrderSoldOutNames.some(s => s && s.trim() && it.name.includes(s.trim()))) {
                                    it.isOutOfStock = true;
                                }
                            });
                        });
                    }
                    if (typeof updateDynamicStockAndPrices === 'function') updateDynamicStockAndPrices();
                } catch (e) {
                    console.warn('[EditOrder] Stock update notice:', e);
                }
            }

            // 1. Show Edit Order Mode Banner
            const bannerEl = document.getElementById('edit-order-mode-banner');
            if (bannerEl) {
                bannerEl.style.display = 'flex';
                const keyEl = document.getElementById('edit-order-mode-key');
                if (keyEl) keyEl.innerText = `#${window.editOrderDisplayKey}`;
            }

            // 2. Hide dining option switchers & table input (order details are fixed)
            const toggleWrapper = document.getElementById('dining-option-wrapper');
            if (toggleWrapper) toggleWrapper.style.display = 'none';
            const checkoutToggleGroup = document.getElementById('checkout-dining-option-group');
            if (checkoutToggleGroup) checkoutToggleGroup.style.display = 'none';
            const tableGroup = document.getElementById('dinein-table-input-group');
            if (tableGroup) tableGroup.style.display = 'none';
            const pickupSection = document.getElementById('pickup-time-section');
            if (pickupSection) pickupSection.style.display = 'none';

            // 3. Pre-fill cart, customizeData, comboDrinkData, bundleCartData
            if (Array.isArray(data.items) && data.items.length > 0) {
                // Clear existing cart
                for (let k in cart) delete cart[k];
                for (let k in customizeData) delete customizeData[k];
                for (let k in comboDrinkData) delete comboDrinkData[k];
                if (window.bundleCartData) {
                    for (let k in window.bundleCartData) delete window.bundleCartData[k];
                } else {
                    window.bundleCartData = {};
                }
                window.editOrderRemovedItems = [];

                data.items.forEach(item => {
                    let matchedKey = null;
                    let catalogItem = null;
                    if (typeof bootstrapData !== 'undefined' && bootstrapData && bootstrapData.catalog) {
                        for (const cat of bootstrapData.catalog) {
                            if (cat.items) {
                                const found = cat.items.find(i => i.name === item.name || i.id === item.itemId);
                                if (found) {
                                    matchedKey = `${cat.slug}_${found.name}`;
                                    catalogItem = found;
                                    break;
                                }
                            }
                        }
                    }
                    if (!matchedKey) {
                        const slug = (item.category || 'other').toLowerCase();
                        matchedKey = `${slug}_${item.name}`;
                    }

                    const qty = Number(item.quantity) || 1;
                    const itemName = item.name || '';
                    const isSoldOut = (
                        (catalogItem && catalogItem.isOutOfStock) ||
                        (Array.isArray(window.editOrderSoldOutNames) && (
                            window.editOrderSoldOutNames.includes(itemName) ||
                            window.editOrderSoldOutNames.includes(catalogItem?.name || '') ||
                            window.editOrderSoldOutNames.some(s => s && s.trim() && (itemName.includes(s.trim()) || (catalogItem?.name && catalogItem.name.includes(s.trim()))))
                        ))
                    );

                    if (isSoldOut) {
                        // Tự động bỏ món đã hết ra khỏi giỏ hàng khi đổi món
                        window.editOrderRemovedItems.push({
                            name: itemName,
                            displayName: itemName,
                            quantity: qty,
                            price: Number(item.unitPrice || item.price) || 0,
                            subtotal: Number(item.subtotal) || ((Number(item.unitPrice || item.price) || 0) * qty)
                        });
                    } else {
                        if (item.lineId) {
                            if (typeof DetailCheckout !== 'undefined') DetailCheckout.register(matchedKey, item);
                            customizeData[matchedKey] = (customizeData[matchedKey] || []).concat(item.portions.map(p => ({ note: p.note })));
                        }
                        cart[matchedKey] = (cart[matchedKey] || 0) + qty;
                        if (item.bundleSelections && item.bundleSelections.portions) {
                            window.bundleCartData[matchedKey] = (window.bundleCartData[matchedKey] || []).concat(item.bundleSelections.portions);
                        }
                    }
                });

                // Re-render dynamic catalog and stock so cards display the exact initial cart quantity and sold-out states
                try {
                    if (typeof updateDynamicStockAndPrices === 'function') updateDynamicStockAndPrices();
                    if (typeof renderDynamicCatalog === 'function') renderDynamicCatalog();
                } catch(e) {}

                // Update UI quantity labels on cards
                for (let k in cart) {
                    if (typeof parseCartKey === 'function') {
                        const { catSlug, origName } = parseCartKey(k);
                        const qtySpan = document.getElementById('qty-' + catSlug + '-' + origName);
                        if (qtySpan) {
                            qtySpan.innerText = cart[k];
                            qtySpan.style.color = cart[k] > 0 ? 'var(--primary)' : 'inherit';
                        }
                        const bundleBtn = document.getElementById('bundle-edit-btn-' + catSlug + '-' + origName);
                        if (bundleBtn) {
                            bundleBtn.style.display = (cart[k] > 0 && window.bundleCartData && window.bundleCartData[k]) ? 'flex' : 'none';
                        }
                    }
                }

                if (typeof updateTotal === 'function') updateTotal();
                if (typeof updateFooterButtonState === 'function') updateFooterButtonState();
            } else {
                if (typeof updateTotal === 'function') updateTotal();
                if (typeof updateFooterButtonState === 'function') updateFooterButtonState();
            }
        } catch (err) {
            console.error('[EditOrder] Error initializing edit order mode:', err);
            window.editOrderContextFailed = true;
        } finally {
            clearTimeout(safetyTimer);
            updateFooterButtonState();
            dismissEditOrderLoadingOverlay();
        }
    })();

    return editOrderInitPromise;
}

// ============================================================
// PICKUP TIME PICKER (BOTTOM SHEET / TIME SLOTS - MOBILE FIRST)
// ============================================================
var pickupTimePickerState = {
    selectedDate: '',        // 'YYYY-MM-DD'
    selectedTime: '',        // 'HH:mm'
    selectedType: 'asap',    // 'asap' | 'slot'
    activeTabDate: '',       // Date currently being viewed in modal
    tempDate: '',
    tempTime: '',            // Tentative time selected in modal
    tempType: 'asap',        // Tentative type selected in modal
    asapTime: ''             // Calculated ASAP time string
};

function getActiveStoreConfig() {
    return (typeof storeConfig !== 'undefined' && storeConfig) ? storeConfig : (typeof window !== 'undefined' && window.storeConfig ? window.storeConfig : null);
}

function getStoreOperatingShifts(dateObj) {
    const cfg = getActiveStoreConfig();
    if (!cfg || !cfg.operatingHours) {
        const day = dateObj.getDay();
        if (day >= 1 && day <= 5) {
            return [{ start: '11:00', end: '21:00' }];
        } else {
            return [{ start: '09:00', end: '21:00' }];
        }
    }
    const day = dateObj.getDay();
    const rawShifts = cfg.operatingHours[day] || cfg.operatingHours[String(day)] || [];
    return Array.isArray(rawShifts) ? rawShifts.filter(s => s && s.start && s.end) : [];
}

function calcAsapPickupTime(twNow) {
    const cfg = getActiveStoreConfig();
    const isBusy = (cfg && cfg.storeStatus === 'busy');
    const bufferMin = isBusy ? 60 : 15;
    const nowMin = twNow.getHours() * 60 + twNow.getMinutes();
    const shifts = getStoreOperatingShifts(twNow);
    if (!shifts || shifts.length === 0) return null;

    let targetMin = nowMin + bufferMin;
    const remainder = targetMin % 5;
    if (remainder !== 0) {
        targetMin += (5 - remainder);
    }

    for (const shift of shifts) {
        const [sH, sM] = shift.start.split(':').map(Number);
        const [eH, eM] = shift.end.split(':').map(Number);
        const sMin = sH * 60 + sM;
        let eMin = eH * 60 + eM;
        if (shift.end === '00:00' || shift.end === '24:00' || (eH === 0 && eM === 0) || (sMin >= 720 && eH === 12 && eM === 0)) {
            eMin = 1440;
        }

        // Before this shift starts today
        if (nowMin < sMin) {
            const h = Math.floor(sMin / 60) % 24;
            const m = sMin % 60;
            const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            return {
                timeStr,
                desc: `開店首批取餐 (約 ${timeStr})`,
                isBusy
            };
        }

        // Inside this shift
        if (targetMin >= sMin && targetMin <= eMin) {
            const h = Math.floor(targetMin / 60) % 24;
            const m = targetMin % 60;
            const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            return {
                timeStr,
                desc: isBusy ? `門市繁忙：最快約 60 分鐘後可取餐 (${timeStr})` : `預計約 15-20 分鐘後可取餐 (${timeStr})`,
                isBusy
            };
        }
    }

    return null;
}

function generatePickupSlots(dateStr) {
    const twNow = (typeof getTaiwanDate === 'function') ? getTaiwanDate() : new Date();
    const todayStr = (typeof formatTaiwanDateTime === 'function') ? formatTaiwanDateTime(twNow).dateStr : twNow.toISOString().slice(0, 10);
    const isToday = (dateStr === todayStr);

    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0);
    const shifts = getStoreOperatingShifts(dateObj);

    const cfg = getActiveStoreConfig();
    const isBusy = (cfg && cfg.storeStatus === 'busy');
    const bufferMin = isBusy ? 60 : 15;
    const nowMin = twNow.getHours() * 60 + twNow.getMinutes();
    const minAllowedMin = nowMin + bufferMin;

    const slots = [];
    const seen = new Set();

    for (const shift of shifts) {
        const [sH, sM] = shift.start.split(':').map(Number);
        const [eH, eM] = shift.end.split(':').map(Number);
        const sMin = sH * 60 + sM;
        let eMin = eH * 60 + eM;
        if (shift.end === '00:00' || shift.end === '24:00' || (eH === 0 && eM === 0) || (sMin >= 720 && eH === 12 && eM === 0)) {
            eMin = 1440;
        }

        for (let minVal = sMin; minVal <= eMin; minVal += 15) {
            if (isToday && minVal < minAllowedMin) {
                continue;
            }
            const h = Math.floor(minVal / 60) % 24;
            const min = minVal % 60;
            const slotStr = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
            if (!seen.has(slotStr)) {
                seen.add(slotStr);
                slots.push(slotStr);
            }
        }
    }

    return slots;
}

function syncPickupTimeDisplay() {
    const dateEl = document.getElementById('pickup-date');
    const timeEl = document.getElementById('pickup-time');
    const primaryLabel = document.getElementById('pickup-trigger-display-time');
    const secondaryLabel = document.getElementById('pickup-trigger-display-date');
    if (!primaryLabel || !secondaryLabel) return;

    const dateVal = dateEl ? dateEl.value : '';
    const timeVal = timeEl ? timeEl.value : '';

    if (!dateVal || !timeVal) {
        primaryLabel.textContent = '請選擇預計取餐時間';
        secondaryLabel.textContent = '點擊選擇取餐日期與時段';
        return;
    }

    const twNow = (typeof getTaiwanDate === 'function') ? getTaiwanDate() : new Date();
    const todayStr = (typeof formatTaiwanDateTime === 'function') ? formatTaiwanDateTime(twNow).dateStr : twNow.toISOString().slice(0, 10);
    const tomorrowObj = new Date(twNow.getTime() + 86400000);
    const tomorrowStr = (typeof formatTaiwanDateTime === 'function') ? formatTaiwanDateTime(tomorrowObj).dateStr : tomorrowObj.toISOString().slice(0, 10);

    let dayLabel = '';
    const [y, m, d] = dateVal.split('-').map(Number);
    const dateFormatted = `${m}/${d}`;

    if (dateVal === todayStr) {
        dayLabel = `今日 (${dateFormatted})`;
    } else if (dateVal === tomorrowStr) {
        dayLabel = `明日 (${dateFormatted})`;
    } else {
        const daysName = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
        const dObj = new Date(y, m - 1, d, 12, 0, 0);
        dayLabel = `${daysName[dObj.getDay()]} (${dateFormatted})`;
    }

    if (pickupTimePickerState.selectedType === 'asap' && dateVal === todayStr) {
        primaryLabel.textContent = `最快取餐 (約 ${timeVal})`;
        secondaryLabel.textContent = `${dayLabel} · 店家即刻備餐`;
    } else {
        primaryLabel.textContent = `${timeVal} 取餐`;
        secondaryLabel.textContent = `${dayLabel} · 預約時段`;
    }
}

function initPickupTimePicker() {
    const twNow = (typeof getTaiwanDate === 'function') ? getTaiwanDate() : new Date();
    const todayStr = (typeof formatTaiwanDateTime === 'function') ? formatTaiwanDateTime(twNow).dateStr : twNow.toISOString().slice(0, 10);
    const dateEl = document.getElementById('pickup-date');
    const timeEl = document.getElementById('pickup-time');

    if (dateEl && !dateEl.value) {
        dateEl.value = todayStr;
        dateEl.min = todayStr;
    }

    const asap = calcAsapPickupTime(twNow);
    if (timeEl && !timeEl.value) {
        if (asap) {
            timeEl.value = asap.timeStr;
            pickupTimePickerState.selectedType = 'asap';
            pickupTimePickerState.selectedTime = asap.timeStr;
            pickupTimePickerState.selectedDate = todayStr;
        } else {
            const todaySlots = generatePickupSlots(todayStr);
            if (todaySlots.length > 0) {
                timeEl.value = todaySlots[0];
                pickupTimePickerState.selectedType = 'slot';
                pickupTimePickerState.selectedTime = todaySlots[0];
                pickupTimePickerState.selectedDate = todayStr;
            } else {
                const tomorrowObj = new Date(twNow.getTime() + 86400000);
                const tomorrowStr = (typeof formatTaiwanDateTime === 'function') ? formatTaiwanDateTime(tomorrowObj).dateStr : tomorrowObj.toISOString().slice(0, 10);
                if (dateEl) dateEl.value = tomorrowStr;
                const tomorrowSlots = generatePickupSlots(tomorrowStr);
                const firstSlot = tomorrowSlots[0] || '11:00';
                timeEl.value = firstSlot;
                pickupTimePickerState.selectedType = 'slot';
                pickupTimePickerState.selectedTime = firstSlot;
                pickupTimePickerState.selectedDate = tomorrowStr;
            }
        }
    }

    if (timeEl && typeof timeEl.addEventListener === 'function' && !timeEl.__pickupListenerAttached) {
        timeEl.__pickupListenerAttached = true;
        timeEl.addEventListener('change', () => {
            pickupTimePickerState.selectedType = 'slot';
            pickupTimePickerState.selectedTime = timeEl.value;
            syncPickupTimeDisplay();
        });
    }
    if (dateEl && typeof dateEl.addEventListener === 'function' && !dateEl.__pickupListenerAttached) {
        dateEl.__pickupListenerAttached = true;
        dateEl.addEventListener('change', () => {
            pickupTimePickerState.selectedDate = dateEl.value;
            syncPickupTimeDisplay();
        });
    }

    syncPickupTimeDisplay();
}

function openPickupTimeModal() {
    const modal = document.getElementById('pickup-time-modal');
    if (!modal) return;

    const twNow = (typeof getTaiwanDate === 'function') ? getTaiwanDate() : new Date();
    const todayStr = (typeof formatTaiwanDateTime === 'function') ? formatTaiwanDateTime(twNow).dateStr : twNow.toISOString().slice(0, 10);

    const dateEl = document.getElementById('pickup-date');
    const timeEl = document.getElementById('pickup-time');

    const curDate = (dateEl && dateEl.value) ? dateEl.value : todayStr;
    const curTime = (timeEl && timeEl.value) ? timeEl.value : '';

    pickupTimePickerState.activeTabDate = curDate;
    pickupTimePickerState.tempDate = curDate;
    pickupTimePickerState.tempTime = curTime;
    pickupTimePickerState.tempType = pickupTimePickerState.selectedType || 'asap';

    renderPickupDateTabs();
    renderPickupModalBodyForDate(curDate);

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closePickupTimeModal() {
    const modal = document.getElementById('pickup-time-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

function renderPickupDateTabs() {
    const container = document.getElementById('pickup-date-tabs');
    if (!container) return;

    const twNow = (typeof getTaiwanDate === 'function') ? getTaiwanDate() : new Date();
    const daysName = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

    const dates = [];
    for (let offset = 0; offset <= 2; offset++) {
        const dObj = new Date(twNow.getTime() + offset * 86400000);
        const dStr = (typeof formatTaiwanDateTime === 'function') ? formatTaiwanDateTime(dObj).dateStr : dObj.toISOString().slice(0, 10);
        const dayLabel = offset === 0 ? '今天' : offset === 1 ? '明天' : daysName[dObj.getDay()];
        const subLabel = `${dObj.getMonth() + 1}/${dObj.getDate()}`;
        dates.push({ dateStr: dStr, dayLabel, subLabel });
    }

    container.innerHTML = dates.map(d => {
        const isActive = (d.dateStr === pickupTimePickerState.activeTabDate);
        return `
            <div class="pickup-date-tab ${isActive ? 'active' : ''}" onclick="switchPickupDateTab('${d.dateStr}')">
                <div class="pickup-date-tab-main">${d.dayLabel}</div>
                <div class="pickup-date-tab-sub">${d.subLabel}</div>
            </div>
        `;
    }).join('');
}

function switchPickupDateTab(dateStr) {
    pickupTimePickerState.activeTabDate = dateStr;
    pickupTimePickerState.tempDate = dateStr;
    renderPickupDateTabs();
    renderPickupModalBodyForDate(dateStr);
}

function renderPickupModalBodyForDate(dateStr) {
    const twNow = (typeof getTaiwanDate === 'function') ? getTaiwanDate() : new Date();
    const todayStr = (typeof formatTaiwanDateTime === 'function') ? formatTaiwanDateTime(twNow).dateStr : twNow.toISOString().slice(0, 10);
    const isToday = (dateStr === todayStr);

    const asapCard = document.getElementById('pickup-asap-card');
    const asapTimeVal = document.getElementById('pickup-asap-time-val');
    const asapEtaDesc = document.getElementById('pickup-asap-eta-desc');
    const slotsGrid = document.getElementById('pickup-slots-grid');
    const slotsEmpty = document.getElementById('pickup-slots-empty');
    const confirmBtn = document.getElementById('pickup-sheet-confirm-btn');

    const slots = generatePickupSlots(dateStr);
    const asap = isToday ? calcAsapPickupTime(twNow) : null;

    if (asapCard) {
        if (isToday && asap) {
            asapCard.style.display = 'flex';
            if (asapTimeVal) asapTimeVal.textContent = asap.timeStr;
            if (asapEtaDesc) asapEtaDesc.textContent = asap.desc;
            pickupTimePickerState.asapTime = asap.timeStr;

            const isAsapSelected = (pickupTimePickerState.tempType === 'asap');
            if (isAsapSelected) {
                asapCard.classList.add('selected');
                pickupTimePickerState.tempTime = asap.timeStr;
            } else {
                asapCard.classList.remove('selected');
            }
        } else {
            asapCard.style.display = 'none';
        }
    }

    if (slotsGrid && slotsEmpty) {
        if (slots.length === 0) {
            slotsGrid.style.display = 'none';
            slotsEmpty.style.display = 'block';
            slotsEmpty.textContent = isToday ? '本日營業時間已結束，請選擇明日或其他日期' : '此日期暫無營業時段';
        } else {
            slotsGrid.style.display = 'grid';
            slotsEmpty.style.display = 'none';

            slotsGrid.innerHTML = slots.map(timeStr => {
                const isSelected = (pickupTimePickerState.tempType === 'slot' && pickupTimePickerState.tempTime === timeStr);
                return `
                    <div class="pickup-slot-chip ${isSelected ? 'selected' : ''}"
                         role="button"
                         tabindex="0"
                         onclick="selectPickupSlot('${timeStr}')">
                        ${timeStr}
                    </div>
                `;
            }).join('');
        }
    }

    if (confirmBtn) {
        confirmBtn.textContent = pickupTimePickerState.tempTime ? `確認時間 (${pickupTimePickerState.tempTime})` : '確認時間';
    }
}

function selectPickupAsap() {
    if (!pickupTimePickerState.asapTime) return;
    pickupTimePickerState.tempType = 'asap';
    pickupTimePickerState.tempTime = pickupTimePickerState.asapTime;
    renderPickupModalBodyForDate(pickupTimePickerState.activeTabDate);
}

function selectPickupSlot(timeStr) {
    pickupTimePickerState.tempType = 'slot';
    pickupTimePickerState.tempTime = timeStr;
    renderPickupModalBodyForDate(pickupTimePickerState.activeTabDate);
}

function confirmPickupTimeSelection() {
    if (!pickupTimePickerState.tempTime) {
        return customAlert('請先選擇一個取餐時間');
    }

    pickupTimePickerState.selectedDate = pickupTimePickerState.tempDate;
    pickupTimePickerState.selectedTime = pickupTimePickerState.tempTime;
    pickupTimePickerState.selectedType = pickupTimePickerState.tempType;

    const dateEl = document.getElementById('pickup-date');
    const timeEl = document.getElementById('pickup-time');
    if (dateEl) dateEl.value = pickupTimePickerState.selectedDate;
    if (timeEl) timeEl.value = pickupTimePickerState.selectedTime;

    window.isPickupTimeManuallyChanged = true;

    syncPickupTimeDisplay();
    closePickupTimeModal();
}

if (typeof window !== 'undefined') {
    window.initPickupTimePicker = initPickupTimePicker;
    window.openPickupTimeModal = openPickupTimeModal;
    window.closePickupTimeModal = closePickupTimeModal;
    window.selectPickupAsap = selectPickupAsap;
    window.selectPickupSlot = selectPickupSlot;
    window.switchPickupDateTab = switchPickupDateTab;
    window.confirmPickupTimeSelection = confirmPickupTimeSelection;
    window.syncPickupTimeDisplay = syncPickupTimeDisplay;
    window.pickupTimePickerState = pickupTimePickerState;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initAppendModeIfPresent();
        initEditOrderModeIfPresent();
        if (typeof initPickupTimePicker === 'function') {
            initPickupTimePicker();
        }
    });
} else {
    initAppendModeIfPresent();
    initEditOrderModeIfPresent();
    if (typeof initPickupTimePicker === 'function') {
        initPickupTimePicker();
    }
}

// 1. Kiểm tra vị trí hiển thị của khu vực thanh toán
function isCheckoutSectionVisible() {
    const el = document.getElementById('sec-checkout');
    if (!el) return true;
    const rect = el.getBoundingClientRect();
    const windowHeight = (window.innerHeight || document.documentElement.clientHeight);
    return (rect.top <= windowHeight * 0.85);
}

// 2. Cập nhật trạng thái chữ trên nút cố định ở chân trang
function updateFooterButtonState() {
    const btn = document.getElementById('btn-submit');
    if (!btn || isSubmitting || (btn.disabled && !window.isEditOrderMode && !btn.dataset.emptyCart)) return;

    if(window.LinePayCheckout?.blocked()){LinePayCheckout.syncButtons();return;}
    // Edit/append keep their own availability rules when entered from an empty cart.
    if (window.isAppendMode || window.isEditOrderMode) {
        for (const button of getAllSubmitButtons()) {
            if (button.dataset.emptyCart) {
                button.disabled = false;
                delete button.dataset.emptyCart;
                button.removeAttribute('aria-describedby');
            }
        }
        const hint = document.getElementById('checkout-empty-cart-hint');
        if (hint) hint.hidden = true;
    }
    if (window.isAppendMode) {
        const vi = (typeof currentLocale !== 'undefined' ? currentLocale : document.documentElement.lang) === 'vi';
        for (const button of getAllSubmitButtons()) button.textContent = vi ? 'Xác nhận gọi thêm' : '確認加點';
        return;
    }

    if (window.isEditOrderMode) {
        const hasItems = window.editOrderContextLoaded && hasAvailableCartItems();
        const isPaused = typeof storeConfig !== 'undefined' && storeConfig?.storeStatus === 'paused';
        const deskBtn = document.getElementById('btn-desktop-submit');
        if (!hasItems || isPaused) {
            const label = isPaused ? '店家目前暫停接單' : window.editOrderContextFailed ? '訂單載入失敗，請重新整理' : window.editOrderContextLoaded ? '餐點已售完' : '載入訂單中...';
            btn.innerHTML = `<span>${label}</span>`;
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
            if (deskBtn) {
                deskBtn.innerText = label;
                deskBtn.disabled = true;
                deskBtn.style.opacity = '0.6';
                deskBtn.style.cursor = 'not-allowed';
            }
            return;
        } else {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            if (deskBtn) {
                deskBtn.disabled = false;
                deskBtn.style.opacity = '1';
                deskBtn.style.cursor = 'pointer';
            }
            const btnText = '確認下單';
            btn.innerHTML = `<span>${btnText}</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            if (deskBtn) deskBtn.innerText = btnText;
            return;
        }
    }

    const vi = (typeof currentLocale !== 'undefined' ? currentLocale : document.documentElement.lang) === 'vi';
    const hasItems = Object.values(window.cart || cart || {}).some(qty => Number(qty) > 0);
    const emptyHint = document.getElementById('checkout-empty-cart-hint');
    if (emptyHint) {
        emptyHint.hidden = hasItems;
        emptyHint.textContent = vi ? 'Hãy thêm món vào giỏ hàng để tiếp tục.' : '請先將餐點加入購物車。';
    }
    const checkoutLabel = window.LinePayCheckout?.buttonLabel?.() || (vi ? 'Xác nhận đặt món' : '確認下單');
    for (const button of getAllSubmitButtons()) {
        if (!hasItems) {
            button.dataset.emptyCart = 'true';
            button.disabled = true;
            button.textContent = vi ? 'Hãy chọn món' : '請先選擇餐點';
            button.setAttribute('aria-describedby', 'checkout-empty-cart-hint');
        } else {
            if (button.dataset.emptyCart) {
                button.disabled = false;
                delete button.dataset.emptyCart;
                button.removeAttribute('aria-describedby');
            }
            if (!button.disabled) button.textContent = button.id === 'btn-submit' && !isCheckoutSectionVisible()
                ? (vi ? 'Đến thanh toán' : '前往結帳') : checkoutLabel;
        }
    }
}

// 3. Xử lý hành vi bấm nút chân trang 2 bước
function handleFooterAction() {
    if(window.LinePayCheckout?.blocked()){LinePayCheckout.manage();return;}
    if (typeof checkDesktopAuthGuard === 'function' && !checkDesktopAuthGuard()) {
        return;
    }
    const hasItem = Object.values(cart || {}).some(q => q > 0);
    if (!hasItem) return customAlert('請先選擇餐點品項加入購物車');
    if (!hasAvailableCartItems()) return customAlert('購物車內餐點已全數售完，請重新挑選其他餐點');

    // Bước 1: Nếu chưa ở khu vực thanh toán -> cuộn mượt xuống
    if (!isCheckoutSectionVisible()) {
        scrollToSec('sec-checkout');
        const checkoutSec = document.getElementById('sec-checkout');
        if (checkoutSec) {
            checkoutSec.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
            checkoutSec.style.boxShadow = '0 0 0 3px var(--primary), 0 10px 25px rgba(0,0,0,0.1)';
            setTimeout(() => { checkoutSec.style.boxShadow = ''; }, 1500);
        }
        updateFooterButtonState();
        return;
    }

    // Bước 2: Khi đã ở khu vực thanh toán -> Gửi đơn
    submitOrder();
}

// 4. Hiệu ứng làm nổi bật ô nhập giờ khi khách quên chọn
function highlightMissingPickupTime() {
    const pickupSec = document.getElementById('pickup-time-section') || document.getElementById('sec-checkout');
    if (pickupSec) {
        pickupSec.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const triggerCard = document.getElementById('pickup-time-trigger');
    if (triggerCard) {
        triggerCard.classList.add('attention-pulse');
        setTimeout(() => triggerCard.classList.remove('attention-pulse'), 1500);
    }
    const timeEl = document.getElementById('pickup-time');
    if (timeEl) {
        timeEl.classList.add('attention-pulse');
        const removePulse = () => {
            timeEl.classList.remove('attention-pulse');
            timeEl.removeEventListener('focus', removePulse);
            timeEl.removeEventListener('change', removePulse);
            timeEl.removeEventListener('click', removePulse);
        };
        timeEl.addEventListener('focus', removePulse);
        timeEl.addEventListener('change', removePulse);
        timeEl.addEventListener('click', removePulse);
        setTimeout(() => {
            try { timeEl.focus(); } catch (e) { }
        }, 400);
    }
    if (typeof openPickupTimeModal === 'function') {
        openPickupTimeModal();
    } else {
        customAlert('請選擇預計取餐時間');
    }
}

// 5. Xác định ca mở cửa tiếp theo khi quán đang đóng cửa
function getNextOpeningInfo(twNow) {
    if (!storeConfig || !storeConfig.operatingHours) {
        return { timeStr: '11:00', dayText: '今日' };
    }
    const currentDay = twNow.getDay();
    const currentHours = twNow.getHours() + twNow.getMinutes() / 60;
    const daysName = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

    // 1. Kiểm tra các ca sau trong cùng ngày
    const todayShifts = storeConfig.operatingHours[currentDay] || [];
    for (const shift of todayShifts) {
        if (!shift || !shift.start) continue;
        const [sH, sM] = shift.start.split(':').map(Number);
        if (sH + sM / 60 > currentHours) {
            return { timeStr: shift.start, dayText: '今日' };
        }
    }

    // 2. Tìm ngày mở cửa gần nhất tiếp theo
    for (let offset = 1; offset <= 7; offset++) {
        const nextDay = (currentDay + offset) % 7;
        const shifts = storeConfig.operatingHours[nextDay] || [];
        if (shifts.length > 0 && shifts[0] && shifts[0].start) {
            const dayLabel = offset === 1 ? '明日' : `${daysName[nextDay]}`;
            return { timeStr: shifts[0].start, dayText: dayLabel };
        }
    }
    return { timeStr: '11:00', dayText: '開店' };
}

// 6. Hộp thoại xác nhận tùy biến
function customConfirm(htmlMsg, onConfirm, onCancel = null) {
    const alertBox = document.getElementById('custom-alert');
    const msgEl = document.getElementById('custom-alert-message');
    if (!alertBox || !msgEl) {
        if (confirm(htmlMsg.replace(/<[^>]*>/g, ' '))) {
            if (onConfirm) onConfirm();
        } else {
            if (onCancel) onCancel();
        }
        return;
    }

    msgEl.innerHTML = `
        <div>${htmlMsg}</div>
        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button id="custom-confirm-cancel" style="flex: 1; padding: 12px; border-radius: 12px; border: 1.5px solid #e5e7eb; background: #fff; color: #4b5563; font-weight: 800; cursor: pointer;">
                取消
            </button>
            <button id="custom-confirm-ok" style="flex: 1; padding: 12px; border-radius: 12px; border: none; background: var(--primary); color: #fff; font-weight: 900; cursor: pointer;">
                確認送出
            </button>
        </div>
    `;

    alertBox.style.display = 'flex';

    // Ẩn nút OK mặc định của alert
    const defaultOkBtn = alertBox.querySelector('.btn-alert-close');
    if (defaultOkBtn) defaultOkBtn.style.display = 'none';

    document.getElementById('custom-confirm-ok').onclick = () => {
        alertBox.style.display = 'none';
        if (defaultOkBtn) defaultOkBtn.style.display = 'block';
        if (onConfirm) onConfirm();
    };

    document.getElementById('custom-confirm-cancel').onclick = () => {
        alertBox.style.display = 'none';
        if (defaultOkBtn) defaultOkBtn.style.display = 'block';
        if (onCancel) onCancel();
    };
}

// 7. Sinh mã đơn hàng chuẩn gọn (10 ký tự: {PREFIX}{MMDD}-{SUFFIX}, ví dụ: B0822-7K9M)
const ORDER_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateBase32Suffix(length = 4) {
    let suffix = "";
    for (let i = 0; i < length; i++) {
        const idx = Math.floor(Math.random() * ORDER_ID_ALPHABET.length);
        suffix += ORDER_ID_ALPHABET[idx];
    }
    return suffix;
}

function generateOrderNumber(diningOption = 'takeaway') {
    const now = getTaiwanDate();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const tenantId = getTenantIdFromUrl();

    let prefix = 'B';
    if (typeof storeConfig !== 'undefined' && storeConfig && storeConfig.orderPrefix) {
        prefix = storeConfig.orderPrefix.toUpperCase();
    } else {
        prefix = tenantId ? tenantId.charAt(0).toUpperCase() : 'B';
    }

    const typePrefix = diningOption === 'dine_in' ? 'D' : 'T';
    const randSeq = Math.floor(Math.random() * 900) + 100;
    return `${prefix}${month}${day}-${typePrefix}${randSeq}`;
}

// 8. Hàm phân giải khóa giỏ hàng chính xác theo danh mục và tên món
function parseCartKey(key) {
    if (!key) return { catSlug: '', origName: '', itemName: '' };
    if (typeof bootstrapData !== 'undefined' && bootstrapData && bootstrapData.catalog) {
        for (const cat of bootstrapData.catalog) {
            const prefix = `${cat.slug}_`;
            if (key.startsWith(prefix)) {
                const name = key.substring(prefix.length);
                return { catSlug: cat.slug, origName: name, itemName: name };
            }
        }
    }
    const idx = key.indexOf('_');
    if (idx === -1) {
        return { catSlug: '', origName: key, itemName: key };
    }
    const name = key.substring(idx + 1);
    return {
        catSlug: key.substring(0, idx),
        origName: name,
        itemName: name
    };
}

function resolveCatalogItem(key) {
    const { catSlug, origName } = parseCartKey(key);
    let targetCat = null;
    let targetItem = null;

    if (typeof bootstrapData !== 'undefined' && bootstrapData?.catalog) {
        if (catSlug) {
            targetCat = bootstrapData.catalog.find(c => c.slug === catSlug);
            if (targetCat?.items) {
                targetItem = targetCat.items.find(it => it.name === origName || it.id === key);
            }
        }
        if (!targetItem) {
            for (const cat of bootstrapData.catalog) {
                if (cat.items) {
                    const it = cat.items.find(i => i.name === origName || i.id === key);
                    if (it) {
                        targetItem = it;
                        targetCat = cat;
                        break;
                    }
                }
            }
        }
    }

    let displayName = origName;
    if (targetCat) {
        // Strip emoji icons from category name
        const rawCatName = targetCat.name || '';
        const catNameClean = rawCatName.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '').trim();
        const slug = (targetCat.slug || '').toLowerCase();

        let sizeTag = '';
        if (slug === 'large' || slug === 'big' || slug === 'l' || /(^|\s|[\(\[\{（【])(大|大份|大碗|大麵包|large|big)($|\s|[\)\]\}）】])/i.test(catNameClean) || catNameClean.startsWith('大')) {
            sizeTag = ' L';
        } else if (slug === 'small' || slug === 's' || slug === 'mini' || /(^|\s|[\(\[\{（【])(小|小份|小碗|小麵包|small|mini)($|\s|[\)\]\}）】])/i.test(catNameClean) || catNameClean.startsWith('小')) {
            sizeTag = ' S';
        } else if (slug === 'medium' || slug === 'm' || /(^|\s|[\(\[\{（【])(中|中份|中碗|medium)($|\s|[\)\]\}）】])/i.test(catNameClean) || catNameClean.startsWith('中')) {
            sizeTag = ' M';
        }

        let nameCount = 0;
        if (bootstrapData?.catalog) {
            for (const cat of bootstrapData.catalog) {
                if (cat.items?.some(it => it.name === origName)) nameCount++;
            }
        }

        if (sizeTag && !origName.includes(' L') && !origName.includes(' S') && !origName.includes(' M') && !origName.startsWith('大') && !origName.startsWith('小')) {
            displayName = `${origName}${sizeTag}`;
        } else if (nameCount > 1 && catNameClean && !origName.includes(catNameClean)) {
            const shortClean = catNameClean.split(/[\s\(\[\{（【]/)[0].trim();
            displayName = `[${shortClean}] ${origName}`;
        }
    }

    return {
        catSlug,
        origName,
        displayName,
        targetCat,
        targetItem,
        basePrice: Number(targetItem?.price) || 0,
        categoryName: targetCat?.name || catSlug || "Món",
        itemId: targetItem?.id || key,
        bundleRule: targetItem?.bundleRule || null
    };
}

function formatGlobalCustomizationsText() {
    if (typeof bootstrapData === 'undefined' || !bootstrapData || !bootstrapData.customizations || bootstrapData.customizations.length === 0) return "";
    const mainFlavors = [];
    const extraIngredients = [];

    bootstrapData.customizations.forEach(group => {
        const cleanTitle = (group.title || '')
            .replace(/^✦\s*/, '')
            .replace(/選擇|調整/g, '')
            .replace(/\(朝天椒\)/g, '')
            .replace(/（朝天椒）/g, '')
            .trim();

        if (group.type === 'radio') {
            const checkedRadio = document.querySelector(`input[name="opt-${group.key}"]:checked`);
            if (checkedRadio) {
                let val = checkedRadio.value
                    .replace(/（\s*[^）]*缺貨[^）]*）/g, '')
                    .replace(/\(\s*[^)]*缺貨[^)]*\)/g, '')
                    .trim();
                const subOpts = [];
                const subContainer = document.querySelector(`.sub-option-container[data-parent-flavor="${checkedRadio.value}"]`);
                if (subContainer) {
                    subContainer.querySelectorAll('input.sub-opt-chk:checked').forEach(chk => {
                        subOpts.push(chk.value);
                    });
                }
                const subPart = subOpts.length > 0 ? ` (${subOpts.join('、')})` : '';
                const p = Number(checkedRadio.getAttribute('data-price')) || 0;
                const pricePart = p > 0 ? `(+$${p})` : '';
                mainFlavors.push(`  • ${cleanTitle || '口味'}：${val}${pricePart}${subPart}`);
            }
        } else if (group.type === 'checkbox') {
            const checkedBoxes = Array.from(document.querySelectorAll(`input[name="opt-${group.key}"]:checked`));
            if (checkedBoxes.length > 0) {
                const boxVals = checkedBoxes.map(chk => {
                    const p = Number(chk.getAttribute('data-price')) || 0;
                    return p > 0 ? `${chk.value}(+$${p})` : chk.value;
                });
                extraIngredients.push(`  • ${cleanTitle || '配料'}：${boxVals.join('、')}`);
            }
        }
    });

    if (mainFlavors.length === 0 && extraIngredients.length === 0) return "";
    let result = `🧂 客製化設定：\n`;
    if (mainFlavors.length > 0) {
        result += `${mainFlavors.join('\n')}\n`;
    }
    if (extraIngredients.length > 0) {
        result += `${extraIngredients.join('\n')}\n`;
    }
    return result + '\n';
}

function getStructuredGlobalCustomizations() {
    if (typeof bootstrapData === 'undefined' || !bootstrapData || !bootstrapData.customizations || bootstrapData.customizations.length === 0) return [];
    const result = [];

    bootstrapData.customizations.forEach(group => {
        const cleanTitle = (group.title || '')
            .replace(/^✦\s*/, '')
            .replace(/選擇|調整/g, '')
            .replace(/\(朝天椒\)/g, '')
            .replace(/（朝天椒）/g, '')
            .trim();

        if (group.type === 'radio') {
            const checkedRadio = document.querySelector(`input[name="opt-${group.key}"]:checked`);
            if (checkedRadio) {
                let val = checkedRadio.value
                    .replace(/（\s*[^）]*缺貨[^）]*）/g, '')
                    .replace(/\(\s*[^)]*缺貨[^)]*\)/g, '')
                    .trim();
                const subOpts = [];
                const subContainer = document.querySelector(`.sub-option-container[data-parent-flavor="${checkedRadio.value}"]`);
                if (subContainer) {
                    subContainer.querySelectorAll('input.sub-opt-chk:checked').forEach(chk => {
                        subOpts.push(chk.value);
                    });
                }
                const subPart = subOpts.length > 0 ? ` (${subOpts.join('、')})` : '';
                const optionId = checkedRadio.getAttribute('data-option-id') || val;
                const p = Number(checkedRadio.getAttribute('data-price')) || 0;
                result.push({
                    key: group.key,
                    label: cleanTitle || '口味',
                    value: `${val}${p > 0 ? `(+$${p})` : ''}${subPart}`,
                    optionId: optionId,
                    price: p
                });
            }
        } else if (group.type === 'checkbox') {
            const checkedBoxes = Array.from(document.querySelectorAll(`input[name="opt-${group.key}"]:checked`));
            if (checkedBoxes.length > 0) {
                const boxVals = checkedBoxes.map(chk => {
                    const p = Number(chk.getAttribute('data-price')) || 0;
                    return p > 0 ? `${chk.value}(+$${p})` : chk.value;
                });
                result.push({
                    key: group.key,
                    label: cleanTitle || '配料',
                    value: boxVals.join('、')
                });
            }
        }
    });

    return result;
}

function resolveOptionDisplayName(val) {
    if (!val || typeof val !== 'string') return val;
    const trimmed = val.trim();
    const bData = window.bootstrapData || (typeof bootstrapData !== 'undefined' ? bootstrapData : null);
    if (!bData) return trimmed;
    if (Object.prototype.hasOwnProperty.call(bData.optionDisplayNames || {}, trimmed)) {
        return bData.optionDisplayNames[trimmed];
    }
    if (Array.isArray(bData.modifiers)) {
        for (const mod of bData.modifiers) {
            const found = (mod.options || []).find(o => o.id === trimmed || String(o.id) === trimmed);
            if (found && found.name) return found.name;
        }
    }
    if (Array.isArray(bData.catalog)) {
        for (const cat of bData.catalog) {
            for (const it of (cat.items || [])) {
                if ((it.id === trimmed || String(it.id) === trimmed) && it.name) return it.name;
                if (Array.isArray(it.modifierGroups)) {
                    for (const mg of it.modifierGroups) {
                        const found = (mg.options || []).find(o => o.id === trimmed || String(o.id) === trimmed);
                        if (found && found.name) return found.name;
                    }
                }
            }
        }
    }
    if (Array.isArray(bData.customizations)) {
        for (const c of bData.customizations) {
            const found = (c.options || []).find(o => o.id === trimmed || String(o.id) === trimmed);
            if (found && found.name) return found.name;
        }
    }
    return trimmed;
}

// 8.1 Định dạng nội dung tin nhắn đơn hàng
function formatOrderTextMessage(orderNum, dateInput, timeInput, currentTotal, mainNote, canonical = false) {
    const zhNumbers = ['第一份', '第二份', '第三份', '第四份', '第五份', '第六份', '第七份', '第八份', '第九份', '第十份'];
    let msg = `訂單編號：${orderNum}\n\n`;

    const globalFlavor = formatGlobalCustomizationsText();
    if (globalFlavor) {
        msg += globalFlavor;
    }

    msg += `📦 訂單內容：\n`;

    const presentation = !canonical && typeof LineOrderPresentation !== 'undefined' ? LineOrderPresentation : null;
    const itemLines = presentation ? buildStructuredCartItems().map(it => presentation.text(presentation.item(it), 'zh-TW')) : [];
    if (!presentation) for (let key in cart) {
        if (cart[key] > 0) {
            if (typeof isItemOutOfStock === 'function' && isItemOutOfStock(key)) continue;
            const itemInfo = resolveCatalogItem(key);
            const { catSlug, origName, displayName, basePrice } = itemInfo;
            if (window.isEditOrderMode && Array.isArray(window.editOrderSoldOutNames)) {
                if (window.editOrderSoldOutNames.includes(displayName) || window.editOrderSoldOutNames.includes(origName) || window.editOrderSoldOutNames.some(s => s && s.trim() && (displayName.includes(s.trim()) || origName.includes(s.trim())))) {
                    continue;
                }
            }
            const pricePart = (typeof basePrice === 'number' && basePrice > 0) ? ` $${basePrice}` : '';
            let itemStr = `${cart[key]}份 x ${displayName}${pricePart}`;

            // Format Universal Bundle Selections
            if (typeof window !== 'undefined' && window.bundleCartData && window.bundleCartData[key]) {
                const portions = window.bundleCartData[key].slice(0, cart[key]);
                portions.forEach((p, pIdx) => {
                    const pPrefix = portions.length > 1 ? `第${pIdx + 1}份 ` : '';
                    (p.groups || []).forEach(g => {
                        const itemsStr = (g.items || []).map(it => `${it.name} x${it.quantity}${(it.modifiers || []).length ? ` (${it.modifiers.map(mod => mod.name).join('、')})` : ''}`).join('、');
                        if (itemsStr) {
                            itemStr += `\n   ↳ ${pPrefix}${g.groupName || '配菜'}：${itemsStr}`;
                        }
                    });
                });
            }

            if (!bootstrapData?.unifiedMenu && catSlug === 'combo') {
                let drinks = comboDrinkData[origName] || [];
                let drinkCounts = {};
                drinks.slice(0, cart[key]).forEach(d => { drinkCounts[d] = (drinkCounts[d] || 0) + 1; });
                let drinkStr = Object.entries(drinkCounts).map(([n, c]) => `${n} x${c}`).join('、');
                if (drinkStr) itemStr += `\n   ↳ 飲料：${drinkStr}`;
            }

            if (customizeData[key]) {
                customizeData[key].slice(0, cart[key]).forEach((c, i) => {
                    const parts = [];
                    const getPrice = window.getModifierPrice || (typeof getModifierPrice === 'function' ? getModifierPrice : () => 0);
                    if (c.selectedDetails && typeof c.selectedDetails === 'object' && Object.keys(c.selectedDetails).length > 0) {
                        for (const detail of Object.values(c.selectedDetails)) {
                            if (!detail) continue;
                            const val = resolveOptionDisplayName(detail.name || detail.id);
                            if (val && val !== '不辣' && val !== '不需要') {
                                let addP = Number(detail.price || 0);
                                const sub = detail.subOption || (c.subOptions && (c.subOptions[detail.id] || c.subOptions[detail.name]));
                                let subText = '';
                                if (sub) {
                                    const subP = Number(sub.price || 0);
                                    addP += subP;
                                    subText = ` (${sub.name})`;
                                }
                                if (addP > 0) {
                                    parts.push(`${val}${subText} (+$${addP})`);
                                } else {
                                    parts.push(`${val}${subText}`);
                                }
                            }
                        }
                    } else {
                        if (c.single) {
                            for (let s in c.single) {
                                const val = resolveOptionDisplayName(c.single[s]);
                                if (val && val !== '不辣' && val !== '不需要') {
                                    const addP = getPrice(val);
                                    if (addP > 0) {
                                        parts.push(`${val} (+$${addP})`);
                                    } else {
                                        parts.push(val);
                                    }
                                }
                            }
                        }
                        if (c.multiple) {
                            for (let t in c.multiple) {
                                if (c.multiple[t]) {
                                    const val = resolveOptionDisplayName(t);
                                    const addP = getPrice(t);
                                    if (addP > 0) {
                                        parts.push(`${val} (+$${addP})`);
                                    } else {
                                        parts.push(val);
                                    }
                                }
                            }
                        }
                    }
                    if (c.topping && c.topping !== '') parts.push(c.topping);
                    if (c.spicy && c.spicy !== '不辣') parts.push(c.spicy);
                    const itemNoteText = (c.note || c.customText || '').trim();
                    if (itemNoteText) {
                        const formattedNote = (itemNoteText.startsWith('備註:') || itemNoteText.startsWith('備註：') || itemNoteText.startsWith('Ghi chú:') || itemNoteText.startsWith('Ghi chú：'))
                            ? itemNoteText
                            : `備註: ${itemNoteText}`;
                        parts.push(formattedNote);
                    }

                    const uniqueParts = [...new Set(parts)];
                    if (uniqueParts.length > 0) {
                        let zhIdx = zhNumbers[i] || `第 ${i + 1} 份`;
                        itemStr += `\n   ↳ ${zhIdx}: ${uniqueParts.join(', ')}`;
                    }
                });
            }
            itemLines.push(itemStr);
        }
    }
    msg += itemLines.join(presentation ? '\n\n' : '\n') + '\n\n';

    const isDineIn = (window.currentDiningOption === 'dine_in');
    const tableInput = document.getElementById('dinein-table-number');
    const tableNumber = (isDineIn && tableInput) ? tableInput.value.trim() : '';

    const diningLabel = isDineIn ? (tableNumber ? `內用 (桌號：${tableNumber})` : '內用') : '外帶';
    msg += `📍 用餐方式：${diningLabel}\n\n`;

    if (isDineIn) {
        msg += `🕒 點餐時間：${dateInput} ${timeInput}`;
        if (tableNumber) {
            msg += `\n🪑 用餐桌號：${tableNumber}`;
        }
    } else {
        const isScheduledEnabled = !(storeConfig && storeConfig.allowScheduledPickup === false);
        const timeLabel = isScheduledEnabled ? '取餐時間' : '訂餐時間';
        msg += `🕒 ${timeLabel}：${dateInput} ${timeInput}`;
    }
    if (mainNote) msg += `\n📝 總備註：${mainNote}`;

    msg += `\n💰 總金額：$${currentTotal}`;

    return msg;
}

// 8.2 Định dạng danh sách món cho luồng Gọi thêm (không kèm tiền tổng hoặc mã đơn ảo)
function formatAppendItemsOnlyText(canonical = false) {
    const lines = [];
    const globalFlavor = formatGlobalCustomizationsText();
    if (globalFlavor) {
        lines.push(globalFlavor.trim());
    }
    if (!canonical && typeof LineOrderPresentation !== 'undefined') {
        return lines.concat(buildStructuredCartItems().map(it => LineOrderPresentation.text(LineOrderPresentation.item(it), 'zh-TW'))).join('\n\n');
    }
    for (let key in cart) {
        if (cart[key] > 0) {
            if (typeof isItemOutOfStock === 'function' && isItemOutOfStock(key)) continue;
            const itemInfo = resolveCatalogItem(key);
            const { catSlug, origName, displayName, basePrice } = itemInfo;
            if (window.isEditOrderMode && Array.isArray(window.editOrderSoldOutNames)) {
                if (window.editOrderSoldOutNames.includes(displayName) || window.editOrderSoldOutNames.includes(origName) || window.editOrderSoldOutNames.some(s => s && s.trim() && (displayName.includes(s.trim()) || origName.includes(s.trim())))) {
                    continue;
                }
            }
            const pricePart = (typeof basePrice === 'number' && basePrice > 0) ? ` $${basePrice}` : '';
            lines.push(`${cart[key]}份 x ${displayName}${pricePart}`);

            // Format Universal Bundle Selections
            if (typeof window !== 'undefined' && window.bundleCartData && window.bundleCartData[key]) {
                const portions = window.bundleCartData[key].slice(0, cart[key]);
                portions.forEach((p, pIdx) => {
                    const pPrefix = portions.length > 1 ? `第${pIdx + 1}份 ` : '';
                    (p.groups || []).forEach(g => {
                        const itemsStr = (g.items || []).map(it => `${it.name} x${it.quantity}${(it.modifiers || []).length ? ` (${it.modifiers.map(mod => mod.name).join('、')})` : ''}`).join('、');
                        if (itemsStr) {
                            lines.push(`   ↳ ${pPrefix}${g.groupName || '配菜'}：${itemsStr}`);
                        }
                    });
                });
            }

            if (!bootstrapData?.unifiedMenu && catSlug === 'combo') {
                let drinks = comboDrinkData[origName] || [];
                let drinkCounts = {};
                drinks.slice(0, cart[key]).forEach(d => { drinkCounts[d] = (drinkCounts[d] || 0) + 1; });
                let drinkStr = Object.entries(drinkCounts).map(([n, c]) => `${n} x${c}`).join('、');
                if (drinkStr) lines.push(`   ↳ 飲料：${drinkStr}`);
            }

            if (customizeData[key]) {
                customizeData[key].slice(0, cart[key]).forEach((c, i) => {
                    const parts = [];
                    const getPrice = window.getModifierPrice || (typeof getModifierPrice === 'function' ? getModifierPrice : () => 0);
                    if (c.selectedDetails && typeof c.selectedDetails === 'object' && Object.keys(c.selectedDetails).length > 0) {
                        for (const detail of Object.values(c.selectedDetails)) {
                            if (!detail) continue;
                            const val = resolveOptionDisplayName(detail.name || detail.id);
                            if (val && val !== '不辣' && val !== '不需要') {
                                let addP = Number(detail.price || 0);
                                const sub = detail.subOption || (c.subOptions && (c.subOptions[detail.id] || c.subOptions[detail.name]));
                                let subText = '';
                                if (sub) {
                                    const subP = Number(sub.price || 0);
                                    addP += subP;
                                    subText = ` (${sub.name})`;
                                }
                                if (addP > 0) {
                                    parts.push(`${val}${subText} (+$${addP})`);
                                } else {
                                    parts.push(`${val}${subText}`);
                                }
                            }
                        }
                    } else {
                        if (c.single) {
                            for (let s in c.single) {
                                const val = resolveOptionDisplayName(c.single[s]);
                                if (val && val !== '不辣' && val !== '不需要') {
                                    const addP = getPrice(val);
                                    if (addP > 0) {
                                        parts.push(`${val} (+$${addP})`);
                                    } else {
                                        parts.push(val);
                                    }
                                }
                            }
                        }
                        if (c.multiple) {
                            for (let t in c.multiple) {
                                if (c.multiple[t]) {
                                    const val = resolveOptionDisplayName(t);
                                    const addP = getPrice(t);
                                    if (addP > 0) {
                                        parts.push(`${val} (+$${addP})`);
                                    } else {
                                        parts.push(val);
                                    }
                                }
                            }
                        }
                    }
                    if (c.topping && c.topping !== '') parts.push(c.topping);
                    if (c.spicy && c.spicy !== '不辣') parts.push(c.spicy);
                    const appendNoteText = (c.note || c.customText || '').trim();
                    if (appendNoteText) {
                        const formattedNote = (appendNoteText.startsWith('備註:') || appendNoteText.startsWith('備註：') || appendNoteText.startsWith('Ghi chú:') || appendNoteText.startsWith('Ghi chú：'))
                            ? appendNoteText
                            : `備註: ${appendNoteText}`;
                        parts.push(formattedNote);
                    }

                    const uniqueParts = [...new Set(parts)];
                    if (uniqueParts.length > 0) {
                        const prefixLabel = cart[key] > 1 ? `第${i + 1}份: ` : '';
                        lines.push(`   ↳ ${prefixLabel}${uniqueParts.join('、')}`);
                    }
                });
            }
        }
    }
    return lines.join('\n');
}

// 8.3 Xây dựng mảng items có cấu trúc để phục vụ lưu trữ CSDL & Báo cáo
function buildStructuredCartItems() {
    const items = [];
    for (let key in cart) {
        if (cart[key] > 0) {
            if (typeof isItemOutOfStock === 'function' && isItemOutOfStock(key)) continue;
            const itemInfo = resolveCatalogItem(key);
            const { catSlug, origName, displayName, basePrice, categoryName, itemId } = itemInfo;
            if (window.isEditOrderMode && Array.isArray(window.editOrderSoldOutNames)) {
                if (window.editOrderSoldOutNames.includes(displayName) || window.editOrderSoldOutNames.includes(origName) || window.editOrderSoldOutNames.some(s => s && s.trim() && (displayName.includes(s.trim()) || origName.includes(s.trim())))) {
                    continue;
                }
            }
            const qty = cart[key];

            let itemModifiersTotal = 0;
            const options = [];
            let itemModifiersExtra = 0;
            const cust = bootstrapData?.unifiedMenu
                ? (customizeData[key] || []).map(p => p && ({ note: p.note, customText: p.customText }))
                : customizeData[key];
            const getPrice = window.getModifierPrice || (typeof getModifierPrice === 'function' ? getModifierPrice : () => 0);
            if (cust && Array.isArray(cust)) {
                cust.slice(0, qty).forEach((c, idx) => {
                    if (!c) return;
                    const portionPrefix = qty > 1 ? `第${idx + 1}份: ` : '';
                    const seenOptionKeys = new Set();
                    if (c.selectedDetails && typeof c.selectedDetails === 'object' && Object.keys(c.selectedDetails).length > 0) {
                        for (const detail of Object.values(c.selectedDetails)) {
                            if (!detail) continue;
                            const val = resolveOptionDisplayName(detail.name || detail.id);
                            if (val && val !== '不辣' && val !== '不需要') {
                                let addP = Number(detail.price || 0);
                                const sub = detail.subOption || (c.subOptions && (c.subOptions[detail.id] || c.subOptions[detail.name]));
                                let choiceLabel = `${portionPrefix}${val}`;
                                let subPayload = undefined;
                                if (sub) {
                                    choiceLabel += ` (${sub.name})`;
                                    const subP = Number(sub.price || 0);
                                    addP += subP;
                                    subPayload = { id: sub.id, name: sub.name, price: subP };
                                }
                                const optKey = `${detail.id || detail.name}::${choiceLabel}::${addP}`;
                                if (!seenOptionKeys.has(optKey)) {
                                    seenOptionKeys.add(optKey);
                                    itemModifiersTotal += addP;
                                    options.push({
                                        group: detail.groupName || detail.groupId || '客製化',
                                        choice: choiceLabel,
                                        price: addP,
                                        subOption: subPayload
                                    });
                                }
                            }
                        }
                    } else {
                        if (c.single) {
                            for (let s in c.single) {
                                const val = resolveOptionDisplayName(c.single[s]);
                                if (val && val !== '不辣' && val !== '不需要') {
                                    let addP = getPrice(val, s, key);
                                    const sub = c.subOptions && c.subOptions[val];
                                    let choiceLabel = `${portionPrefix}${val}`;
                                    let subPayload = undefined;
                                    if (sub) {
                                        choiceLabel += ` (${sub.name})`;
                                        const subP = Number(sub.price || 0);
                                        addP += subP;
                                        subPayload = { id: sub.id, name: sub.name, price: subP };
                                    }
                                    const optKey = `single::${choiceLabel}::${addP}`;
                                    if (!seenOptionKeys.has(optKey)) {
                                        seenOptionKeys.add(optKey);
                                        itemModifiersTotal += addP;
                                        options.push({ 
                                            group: s, 
                                            choice: choiceLabel, 
                                            price: addP,
                                            subOption: subPayload
                                        });
                                    }
                                }
                            }
                        }
                        if (c.multiple) {
                            for (let t in c.multiple) {
                                if (c.multiple[t]) {
                                    const val = resolveOptionDisplayName(t);
                                    let addP = getPrice(t, null, key);
                                    const sub = c.subOptions && c.subOptions[t];
                                    let choiceLabel = `${portionPrefix}${val}`;
                                    let subPayload = undefined;
                                    if (sub) {
                                        choiceLabel += ` (${sub.name})`;
                                        const subP = Number(sub.price || 0);
                                        addP += subP;
                                        subPayload = { id: sub.id, name: sub.name, price: subP };
                                    }
                                    const optKey = `multiple::${choiceLabel}::${addP}`;
                                    if (!seenOptionKeys.has(optKey)) {
                                        seenOptionKeys.add(optKey);
                                        itemModifiersTotal += addP;
                                        options.push({ 
                                            group: '客製化', 
                                            choice: choiceLabel, 
                                            price: addP,
                                            subOption: subPayload
                                        });
                                    }
                                }
                            }
                        }
                    }
                    if (c.topping && c.topping !== '') {
                        options.push({ group: '客製化', choice: `${portionPrefix}${c.topping}`, price: 0 });
                    }
                    if (c.spicy && c.spicy !== '不辣') {
                        options.push({ group: '辣度', choice: `${portionPrefix}${c.spicy}`, price: 0 });
                    }
                    const noteVal = (c.note || c.customText || '').trim();
                    if (noteVal) {
                        const formattedNote = (noteVal.startsWith('備註:') || noteVal.startsWith('備註：') || noteVal.startsWith('Ghi chú:') || noteVal.startsWith('Ghi chú：'))
                            ? noteVal
                            : `備註: ${noteVal}`;
                        options.push({ group: '備註', choice: `${portionPrefix}${formattedNote}`, price: 0 });
                    }
                });
            }

            let itemNotesSummary = '';
            if (cust && Array.isArray(cust)) {
                const validNotes = cust.slice(0, qty)
                    .map((c, idx) => {
                        const n = (c && (c.note || c.customText || '')).trim();
                        if (!n) return '';
                        return qty > 1 ? `第${idx + 1}份: ${n}` : n;
                    })
                    .filter(Boolean);
                if (validNotes.length > 0) {
                    itemNotesSummary = validNotes.join(' | ');
                }
            }

            if (!bootstrapData?.unifiedMenu && catSlug === 'combo' && comboDrinkData[origName]) {
                const drinks = comboDrinkData[origName].slice(0, qty);
                drinks.forEach(d => {
                    options.push({ group: '飲料', choice: d, price: 0 });
                });
            }

            // Universal Bundle Selections attachment
            let bundleSelections = null;
            let bundleExtra = 0;
            if (typeof window !== 'undefined' && window.bundleCartData && window.bundleCartData[key]) {
                const portions = window.bundleCartData[key].slice(0, qty);
                bundleExtra = portions.reduce((sum, portion) => sum + (window.bundlePortionExtra ? window.bundlePortionExtra(portion) : 0), 0);
                bundleSelections = {
                    bundleRuleId: itemInfo?.bundleRule?.id || undefined,
                    portions: portions
                };
            }

            const lineSubtotal = (basePrice * qty) + bundleExtra + itemModifiersTotal;

            items.push({
                itemId: itemId,
                name: displayName,
                category: categoryName,
                quantity: qty,
                price: basePrice,
                subtotal: lineSubtotal,
                options: options,
                notes: itemNotesSummary,
                note: itemNotesSummary,
                bundleSelections: bundleSelections,
                bundle_snapshot_json: bundleSelections ? JSON.stringify(bundleSelections) : null
            });
        }
    }
    return items;
}

function isStoreOpen(twTime) {
    if (!storeConfig || !storeConfig.operatingHours) {
        const day = twTime.getDay();
        const hours = twTime.getHours();
        const minutes = twTime.getMinutes();
        const timeValue = hours + minutes / 60;
        if (day >= 1 && day <= 5) {
            return (timeValue >= 11 && timeValue < 21);
        } else {
            return (timeValue >= 9 && timeValue < 21);
        }
    }
    
    const day = twTime.getDay();
    const hours = twTime.getHours();
    const minutes = twTime.getMinutes();
    const timeValue = hours + minutes / 60;
    
    // 1. Kiểm tra các ca mở cửa trong ngày hôm nay
    const shifts = storeConfig.operatingHours[day] || storeConfig.operatingHours[String(day)] || [];
    for (let shift of shifts) {
        if (!shift || !shift.start || !shift.end) continue;
        const [sH, sM] = shift.start.split(':').map(Number);
        const [eH, eM] = shift.end.split(':').map(Number);
        const startVal = sH + sM / 60;
        let endVal = eH + eM / 60;
        
        // Chuẩn hóa giờ đóng cửa nửa đêm: 00:00, 24:00 hoặc 12:00 đêm khi bắt đầu vào buổi chiều/tối
        if (shift.end === '00:00' || shift.end === '24:00' || (eH === 0 && eM === 0) || (startVal >= 12 && eH === 12 && eM === 0)) {
            endVal = 24.0;
        }
        
        if (endVal > startVal) {
            if (timeValue >= startVal && timeValue < endVal) {
                return true;
            }
        } else {
            if (timeValue >= startVal) {
                return true;
            }
        }
    }
    
    // 2. Kiểm tra nếu ngày hôm qua có ca qua đêm vẫn đang mở vào rạng sáng hôm nay
    const yesterday = (day + 6) % 7;
    const yesterdayShifts = storeConfig.operatingHours[yesterday] || storeConfig.operatingHours[String(yesterday)] || [];
    for (let shift of yesterdayShifts) {
        if (!shift || !shift.start || !shift.end) continue;
        const [sH, sM] = shift.start.split(':').map(Number);
        const [eH, eM] = shift.end.split(':').map(Number);
        const startVal = sH + sM / 60;
        let endVal = eH + eM / 60;
        if (shift.end === '00:00' || shift.end === '24:00' || (eH === 0 && eM === 0) || (startVal >= 12 && eH === 12 && eM === 0)) {
            endVal = 24.0;
        }
        if (endVal < startVal && timeValue < endVal) {
            return true;
        }
    }
    
    return false;
}
if (typeof window !== 'undefined') {
    window.isStoreOpen = isStoreOpen;
}

function isPickupTimeValid(dateTime) {
    return isStoreOpen(dateTime);
}

// 9. Thực thi gửi đơn hàng với Timeout 8s & Bảo vệ nút bấm
async function submitOrder() {
    if(window.LinePayCheckout?.blocked()){LinePayCheckout.manage();return;}
    if (isSubmitting) return;
    if (typeof checkDesktopAuthGuard === 'function' && !checkDesktopAuthGuard()) {
        return;
    }

    if (storeConfig && storeConfig.storeStatus === 'paused') {
        return customAlert('店家目前暫停接單中，暫時無法下單，敬請見諒！');
    }

    const hasItem = Object.values(cart || {}).some(q => q > 0);
    if (!hasItem) return customAlert('請先選擇餐點品項加入購物車');
    if (!hasAvailableCartItems()) return customAlert('購物車內餐點已全數售完，請重新挑選其他餐點');

    // Validate Required Global Customizations (Type 3)
    if (typeof bootstrapData !== 'undefined' && bootstrapData && Array.isArray(bootstrapData.customizations)) {
        for (const group of bootstrapData.customizations) {
            if (group.isRequired) {
                const checked = document.querySelectorAll(`input[name="opt-${group.key}"]:checked`);
                if (!checked || checked.length === 0) {
                    const panel = document.querySelector(`.custom-group[data-group-key="${group.key}"]`) || document.querySelector(`input[name="opt-${group.key}"]`)?.closest('.custom-panel');
                    if (panel) {
                        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        panel.classList.add('attention-pulse');
                        setTimeout(() => panel.classList.remove('attention-pulse'), 1500);
                    }
                    const groupTitle = group.title || group.name || '客製選項';
                    return customAlert(`請選擇【${groupTitle}】（此項為必填）`);
                }
            }
        }
    }

    // Validate Required Item Modifiers (Type 2)
    if (typeof getItemModifiers === 'function' && typeof bootstrapData !== 'undefined' && bootstrapData) {
        for (const [key, q] of Object.entries(cart || {})) {
            if (q <= 0) continue;
            const sepIdx = key.indexOf('_');
            if (sepIdx < 0) continue;
            const catSlug = key.slice(0, sepIdx);
            const itemName = key.slice(sepIdx + 1);
            const itemMods = getItemModifiers(catSlug, itemName);
            const reqMods = itemMods.filter(m => m.isRequired);
            if (reqMods.length > 0) {
                const itemPortions = (typeof customizeData !== 'undefined' && customizeData && customizeData[key]) ? customizeData[key] : [];
                for (let i = 0; i < q; i++) {
                    const portion = itemPortions[i];
                    for (const reqM of reqMods) {
                        let hasSelection = false;
                        if (reqM.selectionType === 'multiple') {
                            const reqOptNames = (reqM.options || []).map(o => o.name);
                            const reqOptIds = (reqM.options || []).map((o, idx) => (typeof getUniqueModifierOptionId === 'function') ? getUniqueModifierOptionId(reqM, o, idx) : (o.id || o.name));
                            hasSelection = reqOptNames.some(name => portion?.multiple && portion.multiple[name]) ||
                                           reqOptIds.some(id => portion?.multiple && portion.multiple[id]) ||
                                           Boolean(portion?.multiple?.[reqM.slug]) ||
                                           Boolean(portion?.multiple?.[reqM.id]) ||
                                           (portion?.selectedDetails && Object.values(portion.selectedDetails).some(d => d.groupId === reqM.id || d.groupId === reqM.slug));
                        } else {
                            hasSelection = Boolean(portion?.single && (portion.single[reqM.slug] || portion.single[reqM.id])) ||
                                           (portion?.selectedDetails && Object.values(portion.selectedDetails).some(d => d.groupId === reqM.id || d.groupId === reqM.slug));
                        }
                        if (!hasSelection) {
                            if (typeof toggleCustomize === 'function') {
                                toggleCustomize(catSlug, itemName);
                            }
                            return customAlert(`請為【${itemName}】第 ${i + 1} 份選擇【${reqM.name}】（此項為必選）`);
                        }
                    }
                }
            }
        }
    }

    // Minimum spend excludes order-wide add-on charges themselves.
    updateTotal();
    const selectedOrderOptions = Array.from(document.querySelectorAll('.custom-panel input[data-price]:checked'));
    const orderAddons = selectedOrderOptions.reduce((sum, input) => sum + (Number(input.getAttribute('data-price')) || 0), 0);
    const foodSubtotal = (Number(document.getElementById('total-price')?.innerText) || 0) - orderAddons;
    const unavailableOption = selectedOrderOptions.find(input => foodSubtotal < (Number(input.getAttribute('data-min-order-amount')) || 0));
    if (unavailableOption) {
        return customAlert(`${unavailableOption.getAttribute('data-group-title')}：餐點金額需滿 ${unavailableOption.getAttribute('data-min-order-amount')} 元，請調整餐點或選項。`);
    }

    // Verify item-level purchase limits (maxPerOrder)
    const cartObj = window.cart || cart || {};
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (k => ({ origName: k, displayName: k })));
    for (const [key, qty] of Object.entries(cartObj)) {
        if (qty > 0) {
            const itemInfo = resolveFn(key);
            const targetItem = itemInfo?.targetItem || itemInfo;
            const maxPerOrder = targetItem?.maxPerOrder || targetItem?.max_per_order;
            if (maxPerOrder && qty > maxPerOrder) {
                return customAlert(`【${targetItem.name || itemInfo?.displayName || key}】每單限購 ${maxPerOrder} 份，目前已選擇 ${qty} 份，請調整數量後再下單。`);
            }
        }
    }

    // In Edit Order Mode, direct execution for order modification
    if (window.isEditOrderMode) {
        if (!hasAvailableCartItems()) {
            return customAlert('購物車內餐點已全數售完，請重新挑選其他餐點');
        }
        return doSubmitOrderExecution('', '');
    }

    const twNow = getTaiwanDate();
    const isDineIn = (window.currentDiningOption === 'dine_in');
    const isScheduledEnabled = !(storeConfig && storeConfig.allowScheduledPickup === false);
    let dateInput = "";
    let timeInput = "";

    if (isDineIn) {
        if (!window.isAppendMode) {
            const tableInput = document.getElementById('dinein-table-number');
            const tableNumber = tableInput ? tableInput.value.trim() : '';
            if (!tableNumber) {
                if (tableInput) {
                    tableInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    tableInput.focus();
                    tableInput.classList.add('attention-pulse');
                    setTimeout(() => tableInput.classList.remove('attention-pulse'), 1500);
                }
                return customAlert('請填寫您的用餐桌號，方便門市人員為您送餐！');
            }
        }

        const { dateStr, timeStr } = formatTaiwanDateTime(twNow);
        dateInput = dateStr;
        timeInput = timeStr;

        if (!isStoreOpen(twNow)) {
            const nextInfo = getNextOpeningInfo(twNow);
            customConfirm(
                `<div style="font-size: 16px; font-weight: 900; margin-bottom: 8px;">🌙 店家目前休息中</div>` +
                `<div style="font-size: 14px; color: #4b5563; line-height: 1.5;">` +
                `店家預計於 <b>${nextInfo.dayText} ${nextInfo.timeStr}</b> 開始接單製作。<br>` +
                `您確定要現在預先送出內用訂單嗎？` +
                `</div>`,
                () => { doSubmitOrderExecution(dateInput, timeInput); }
            );
            return;
        }
    } else if (!isScheduledEnabled) {
        const { dateStr, timeStr } = formatTaiwanDateTime(twNow);
        dateInput = dateStr;
        timeInput = timeStr;

        if (!isStoreOpen(twNow)) {
            const nextInfo = getNextOpeningInfo(twNow);
            customConfirm(
                `<div style="font-size: 16px; font-weight: 900; margin-bottom: 8px;">🌙 店家目前休息中</div>` +
                `<div style="font-size: 14px; color: #4b5563; line-height: 1.5;">` +
                `店家預計於 <b>${nextInfo.dayText} ${nextInfo.timeStr}</b> 開始接單製作。<br>` +
                `您確定要現在預先送出訂單嗎？` +
                `</div>`,
                () => { doSubmitOrderExecution(dateInput, timeInput); }
            );
            return;
        }
    } else {
        dateInput = document.getElementById('pickup-date') ? document.getElementById('pickup-date').value : '';
        timeInput = document.getElementById('pickup-time') ? document.getElementById('pickup-time').value : '';

        if (!dateInput || !timeInput) {
            highlightMissingPickupTime();
            return;
        }

        const [pYear, pMonth, pDay] = dateInput.split('-').map(Number);
        const [pHour, pMin] = timeInput.split(':').map(Number);
        const selectedDateTime = new Date(pYear, pMonth - 1, pDay, pHour, pMin, 0);

        const diffMinutes = (selectedDateTime.getTime() - twNow.getTime()) / (1000 * 60);

        if (diffMinutes < -5) {
            return customAlert('取餐時間不能早於當前時間');
        }

        if (!isPickupTimeValid(selectedDateTime)) {
            return customAlert('所選的取餐時間非營業時間，請重新選擇！');
        }

        if (storeConfig && storeConfig.storeStatus === 'busy') {
            const { dateStr: todayStr } = formatTaiwanDateTime(twNow);
            if (dateInput === todayStr) {
                const minAllowedTime = new Date(twNow.getTime() + 60 * 60000);
                if (selectedDateTime < minAllowedTime) {
                    const { timeStr: minTimeStr } = formatTaiwanDateTime(minAllowedTime);
                    return customAlert(`目前門市繁忙，最快可取餐時間為 ${minTimeStr}（需至少 1 小時後）`);
                }
            }
        }
    }

    doSubmitOrderExecution(dateInput, timeInput);
}

function getAllSubmitButtons() {
    return [
        document.getElementById('btn-submit'),
        document.getElementById('submit-btn'),
        document.getElementById('btn-desktop-submit')
    ].filter(Boolean);
}

function setAllSubmitButtonsState(disabled, text, options = {}) {
    const btns = getAllSubmitButtons();
    btns.forEach(btn => {
        btn.disabled = disabled;
        if (text) btn.innerText = text;
        if(window.LinePayCheckout?.blocked())btn.innerText=typeof currentLocale!=='undefined'&&currentLocale==='vi'?'Xử lý thanh toán đang chờ':'處理待確認付款';
        if (options.cursor) btn.style.cursor = options.cursor;
        if (options.opacity) btn.style.opacity = options.opacity;
    });
    if (!disabled) window.LinePayCheckout?.syncButtons();
}

// 9.4 Hàm tìm kiếm món ăn chính xác trong danh mục thực đơn
function findItemInCatalog(catalog, key) {
    if (!catalog || !Array.isArray(catalog)) return null;
    const { catSlug, origName } = parseCartKey(key);

    // 1. Tìm theo slug danh mục trước
    if (catSlug) {
        const cat = catalog.find(c => c.slug === catSlug || c.id === catSlug);
        if (cat && Array.isArray(cat.items)) {
            const item = cat.items.find(i => 
                i.name === origName || 
                i.name === key ||
                i.id === key || 
                i.id === origName ||
                (key.endsWith(`_${i.name}`) || key.endsWith(`_${i.id}`))
            );
            if (item) return { item, cat };
        }
    }

    // 2. Tìm kiếm toàn cục trên tất cả danh mục
    for (const cat of catalog) {
        if (Array.isArray(cat.items)) {
            const item = cat.items.find(i => 
                i.name === origName || 
                i.name === key || 
                i.id === key || 
                i.id === origName ||
                (key.endsWith(`_${i.name}`) || key.endsWith(`_${i.id}`))
            );
            if (item) return { item, cat };
        }
    }

    return null;
}

// 9.5 Tiền kiểm tra món ăn theo thời gian thực (Pre-Submit Stock Validation)
async function validateCartStockBeforeSubmit() {
    const tenantId = getTenantIdFromUrl();
    try {
        console.log(`[Validation] Fetching fresh bootstrap data for tenant: ${tenantId}...`);
        const fetchSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(5000)
            : undefined;
        const res = await fetch(`${WORKER_BASE}/api/tenant/bootstrap?tenant_id=${tenantId}`, {
            cache: 'no-cache',
            signal: fetchSignal
        });
        if (!res.ok) {
            console.warn(`[Validation] Bootstrap fetch returned status ${res.status}`);
            return { valid: false, unavailable: true, outOfStockItems: [], paused: false };
        }

        const freshData = await res.json();
        if (freshData?.tenant?.id !== tenantId || freshData.menuComplete !== true ||
            !Array.isArray(freshData.catalog) || freshData.catalog.some(c => !c || !Array.isArray(c.items))) {
            return { valid: false, unavailable: true, outOfStockItems: [], paused: false };
        }
        bootstrapData = freshData;
        window.bootstrapData = freshData;
        if (typeof buildModifierPriceMap === 'function') buildModifierPriceMap(freshData);
        if (typeof reconcileCartOptions === 'function') reconcileCartOptions(freshData);
        try {
            localStorage.setItem(`tenant_bootstrap_${tenantId}`, JSON.stringify(freshData));
        } catch(e) {}

        // 1. Kiểm tra trạng thái tạm ngưng nhận đơn của quán
        if (freshData.tenant && freshData.tenant.storeStatus === 'paused') {
            try { if (typeof checkStoreStatus === 'function') checkStoreStatus(); } catch(e) {}
            return { valid: false, outOfStockItems: [], paused: true };
        }

        // 2. Rà soát từng món trong giỏ hàng so với thực đơn mới nhất
        const outOfStockItems = [];
        if (freshData.catalog && Array.isArray(freshData.catalog)) {
            for (let key in cart) {
                if (cart[key] > 0) {
                    const match = findItemInCatalog(freshData.catalog, key);
                    const targetItem = match ? match.item : null;

                    console.log(`[Validation] Cart key "${key}" matched:`, targetItem ? `${targetItem.name} (isOutOfStock: ${targetItem.isOutOfStock})` : "NOT FOUND");

                    if (!targetItem || targetItem.isOutOfStock) {
                        let displayName = targetItem ? targetItem.name : null;
                        if (!displayName) {
                            try {
                                const itemInfo = resolveCatalogItem(key);
                                displayName = itemInfo?.displayName || key;
                            } catch(e) {
                                displayName = key;
                            }
                        }
                        if (displayName && !outOfStockItems.includes(displayName)) {
                            outOfStockItems.push(displayName);
                        }

                        // Tự động loại bỏ món đã hết khỏi giỏ hàng
                        delete cart[key];
                        if (customizeData && customizeData[key]) delete customizeData[key];
                        if (comboDrinkData && comboDrinkData[key]) delete comboDrinkData[key];
                        if (window.bundleCartData && window.bundleCartData[key]) delete window.bundleCartData[key];
                    }
                }
            }
        }

        console.log("[Validation] Out of stock items detected:", outOfStockItems);

        if (outOfStockItems.length > 0) {
            try {
                if (typeof updateDynamicStockAndPrices === 'function') updateDynamicStockAndPrices();
                if (typeof renderDynamicCatalog === 'function') renderDynamicCatalog();
                if (typeof updateTotal === 'function') updateTotal();
            } catch(renderErr) {
                console.warn("[Validation] UI re-render notice:", renderErr);
            }
            return { valid: false, outOfStockItems, paused: false };
        }

        if (typeof updateTotal === 'function') updateTotal();
        if (window.cartOptionsNeedReview) {
            window.cartOptionsNeedReview = false;
            return { valid: false, optionsChanged: true, outOfStockItems: [], paused: false };
        }
        return { valid: true, outOfStockItems: [], paused: false };
    } catch (e) {
        console.error("[Validation] Pre-submit stock validation error:", e);
        return { valid: false, unavailable: true, outOfStockItems: [], paused: false };
    }
}

// 10. Hàm nội bộ thực thi POST dữ liệu
async function doSubmitOrderExecution(dateInput, timeInput) {
    if (window.LinePayCheckout && LinePayCheckout.blocked()) { LinePayCheckout.manage(); return; }
    if (window.LinePayCheckout && LinePayCheckout.selected() && (window.isEditOrderMode || window.isAppendOrderMode)) {
        customAlert('LINE Pay 僅支援新的外帶訂單。'); return;
    }
    let orderSubmittedSuccessfully = false;
    isSubmitting = true;
    setAllSubmitButtonsState(true, '驗證餐點中...', { cursor: 'not-allowed', opacity: '0.7' });

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 12000);

    try {
        const tenantId = getTenantIdFromUrl();

        // Bước kiểm tra món hết hàng theo thời gian thực
        const validation = await validateCartStockBeforeSubmit();
        if (!validation.valid) {
            clearTimeout(timeoutId);
            isSubmitting = false;
            setAllSubmitButtonsState(false, '確認下單', { cursor: 'pointer', opacity: '1' });

            const vi = (typeof currentLocale !== 'undefined' ? currentLocale : document.documentElement.lang) === 'vi';
            if (validation.unavailable) {
                return customAlert(vi ? 'Chưa tải được thực đơn đầy đủ. Giỏ hàng đã được giữ lại; vui lòng thử lại.'
                    : '尚未取得完整菜單，購物車已保留，請重試。');
            }
            if (validation.optionsChanged) {
                return customAlert(vi ? 'Tùy chọn trong giỏ hàng đã được cập nhật theo thực đơn. Vui lòng kiểm tra và gửi lại đơn.'
                    : '購物車選項已依最新菜單更新，請確認後再次送出。');
            }
            if (validation.paused) {
                return customAlert('店家目前已暫停接單，暫時無法送出訂單，敬請見諒！');
            }

            if (validation.outOfStockItems && validation.outOfStockItems.length > 0) {
                const itemListHtml = validation.outOfStockItems.map(name => `• 【${name}】`).join('<br>');
                const hasRemaining = typeof hasAvailableCartItems === 'function' ? hasAvailableCartItems() : false;

                if (hasRemaining) {
                    setAllSubmitButtonsState(false, '確認下單', { cursor: 'pointer', opacity: '1' });
                    return customAlert(
                        `<div style="font-size: 16px; font-weight: 900; color: #dc2626; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">` +
                        `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>` +
                        `<span>售完品項</span>` +
                        `</div>` +
                        `<div style="font-size: 14px; color: #374151; line-height: 1.6; text-align: left; margin: 12px 0;">` +
                        `抱歉，以下餐點目前已售完，已自動自購物車移除：<br>` +
                        `<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; margin-top: 8px; color: #b91c1c; font-weight: 700;">` +
                        `${itemListHtml}` +
                        `</div>` +
                        `</div>` +
                        `<div style="font-size: 13px; color: #6b7280;">金額已重新計算，請確認後再次點擊送出訂單。</div>`
                    );
                } else {
                    setAllSubmitButtonsState(true, '餐點已售完', { cursor: 'not-allowed', opacity: '0.6' });
                    return customAlert(
                        `<div style="font-size: 16px; font-weight: 900; color: #dc2626; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">` +
                        `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>` +
                        `<span>售完品項</span>` +
                        `</div>` +
                        `<div style="font-size: 14px; color: #374151; line-height: 1.6; text-align: left; margin: 12px 0;">` +
                        `抱歉，您選購的餐點目前已全數售完：<br>` +
                        `<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; margin-top: 8px; color: #b91c1c; font-weight: 700;">` +
                        `${itemListHtml}` +
                        `</div>` +
                        `</div>` +
                        `<div style="font-size: 13px; color: #6b7280;">請回到菜單選擇其他餐點，敬請見諒！</div>`
                    );
                }
            }
            return;
        }

        // Bước kiểm tra tuỳ chọn bắt buộc/min/max theo B2
        const valFn = window.validateModifierDraft || (typeof validateModifierDraft === 'function' ? validateModifierDraft : null);
        const getModsFn = window.getEffectiveItemModifierGroups || (typeof getEffectiveItemModifierGroups === 'function' ? getEffectiveItemModifierGroups : null);
        if (valFn && getModsFn) {
            for (let key in cart) {
                const qty = cart[key];
                if (qty > 0) {
                    const itemMods = getModsFn(key);
                    if (Array.isArray(itemMods) && itemMods.length > 0) {
                        const itemCust = (customizeData && customizeData[key]) ? customizeData[key] : [];
                        for (let pIdx = 0; pIdx < qty; pIdx++) {
                            const draft = itemCust[pIdx] || null;
                            const valRes = valFn(itemMods, draft);
                            if (!valRes.valid) {
                                clearTimeout(timeoutId);
                                isSubmitting = false;
                                setAllSubmitButtonsState(false, '確認下單', { cursor: 'pointer', opacity: '1' });

                                const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (k => ({ origName: k, displayName: k })));
                                const itemInfo = resolveFn(key);
                                const itemName = itemInfo?.displayName || itemInfo?.origName || key;
                                const portionMsg = qty > 1 ? `（第 ${pIdx + 1} 份）` : '';
                                const alertMsg = `【${itemName}】${portionMsg}：${valRes.message}`;

                                if (typeof customAlert === 'function') customAlert(alertMsg);
                                else alert(alertMsg);

                                // Mở đúng modal và đúng portion cần sửa
                                if (typeof openItemCustomizeModal === 'function') {
                                    openItemCustomizeModal(itemInfo?.catSlug || itemInfo?.category, itemInfo?.origName, pIdx);
                                }
                                return;
                            }
                        }
                    }
                }
            }
        }

        setAllSubmitButtonsState(true, '處理中...', { cursor: 'not-allowed', opacity: '0.7' });
        if (typeof window.ensureLiffReady === 'function') {
            let liffReadyTimer;
            try {
                await Promise.race([
                    window.ensureLiffReady(),
                    new Promise((_, reject) => {
                        liffReadyTimer = setTimeout(() => reject(new Error('ensureLiffReady timeout')), 4500);
                    })
                ]);
            } catch(e) {
                console.warn("[Checkout] LIFF initialization timed out or failed:", e);
            } finally {
                clearTimeout(liffReadyTimer);
            }
            if (window.__ORDER_DOMAIN_HANDOFF) return;
        }

        if (typeof liff !== 'undefined') {
            try {
                if (liff.isLoggedIn && !liff.isLoggedIn()) {
                    if (storeConfig && Array.isArray(storeConfig.features) && storeConfig.features.includes('mobile_only') && liff.isInClient && !liff.isInClient()) {
                        if (typeof openDesktopQrModal === 'function') {
                            openDesktopQrModal();
                        } else {
                            customAlert('請使用手機 LINE 掃碼點餐');
                        }
                        isSubmitting = false;
                        setAllSubmitButtonsState(false, '確認下單', { cursor: 'pointer', opacity: '1' });
                        return;
                    }

                    const storageKey = `cart_save_${tenantId}`;
                    try {
                        sessionStorage.setItem('current_tenant_id', tenantId);
                        sessionStorage.setItem('pending_line_login_tenant_id', tenantId);
                        localStorage.setItem(storageKey, JSON.stringify({ cart, customizeData, comboDrinkData, bundleCartData: window.bundleCartData || {} }));
                    } catch(e) {}
                    const cleanRedirectUri = window.getLiffLoginRedirectUri();
                    try {
                        liff.login({ redirectUri: cleanRedirectUri });
                    } catch (loginErr) {
                        console.error('[LIFF] Checkout login failed:', loginErr);
                        try { sessionStorage.removeItem('pending_line_login_tenant_id'); } catch (e) {}
                        customAlert('LINE 登入失敗，請重試');
                        isSubmitting = false;
                        setAllSubmitButtonsState(false, '確認下單', { cursor: 'pointer', opacity: '1' });
                    }
                    return;
                }
            } catch (liffAuthErr) {
                console.warn("LIFF Auth check ignored:", liffAuthErr);
            }
        }

        // Pre-flight check 1: Threshold-Gated Customizations validation
        if (typeof getActiveThresholdViolations === 'function') {
            const violations = getActiveThresholdViolations();
            if (violations.length > 0) {
                isSubmitting = false;
                setAllSubmitButtonsState(false, '確認下單', { cursor: 'pointer', opacity: '1' });
                const v = violations[0];
                customAlert(v.errorMsg || `您選擇的口味「${v.name}」需全單消費滿 $${v.minSubtotal} 元方可送出（目前金額 $${v.currentSubtotal} 元，還差 $${v.minSubtotal - v.currentSubtotal} 元）`);
                return;
            }
        }

        // Pre-flight check 2: Bundle Selections completeness validation
        if (typeof checkAllBundlesComplete === 'function') {
            const bundleCheck = checkAllBundlesComplete();
            if (!bundleCheck.valid) {
                isSubmitting = false;
                setAllSubmitButtonsState(false, '確認下單', { cursor: 'pointer', opacity: '1' });
                customAlert(bundleCheck.error || '請為套餐選擇內容搭配');
                return;
            }
        }

        let customerName = "顧客";
        let userId = "guest_" + Date.now();

        if (typeof liff !== 'undefined' && typeof liff.isLoggedIn === 'function' && liff.isLoggedIn() && typeof liff.getProfile === 'function') {
            let profileTimer;
            try {
                const profile = await Promise.race([
                    liff.getProfile(),
                    new Promise((_, reject) => {
                        profileTimer = setTimeout(() => reject(new Error('Profile timeout')), 2500);
                    })
                ]);
                if (profile) {
                    customerName = profile.displayName || customerName;
                    userId = profile.userId || userId;
                }
            } catch (e) {
                console.warn("[Checkout] LIFF profile fetch failed or timed out:", e);
            } finally {
                clearTimeout(profileTimer);
            }
        }

        const currentTotal = typeof updateTotal === 'function' ? updateTotal() : 0;
        const isDineIn = (window.currentDiningOption === 'dine_in');
        const diningOption = isDineIn ? 'dine_in' : 'takeaway';
        const tableInput = document.getElementById('dinein-table-number');
        const tableNumber = (isDineIn && tableInput) ? tableInput.value.trim() : '';
        const structuredItems = buildStructuredCartItems();
        const mainNote = document.getElementById('note') ? document.getElementById('note').value : '';
        const orderUuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9));
        let orderNum = generateOrderNumber(diningOption);
        let msg = formatOrderTextMessage(orderNum, dateInput, timeInput, currentTotal, mainNote);

        const deliveryDiagnostic = await getLiffDeliveryDiagnostic();
        const isDesktop = !deliveryDiagnostic.isInClient;

        // 10.1 Xử lý riêng cho luồng 加點餐點 (Append Mode)
        if (window.isAppendMode && window.parentOrderKey) {
            const rawItemsText = formatAppendItemsOnlyText(true);
            const displayItemsText = formatAppendItemsOnlyText();
            const currentTable = (tableInput && tableInput.value.trim()) || window.appendTableNumber || window.currentTableNumber || '';
            const appendPayload = {
                parent_order_key: window.parentOrderKey,
                user_id: userId,
                customer_name: customerName,
                appended_content: rawItemsText,
                appended_total: currentTotal,
                table_number: currentTable || undefined,
                note: mainNote,
                tenant_id: tenantId,
                items: structuredItems,
                customizations: getStructuredGlobalCustomizations(),
                is_desktop: isDesktop,
                isDesktop: isDesktop,
                line_delivery_mode: deliveryDiagnostic.deliveryMode
            };

            const res = await fetch(`${WORKER_BASE}/api/orders/append?tenant_id=${tenantId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Tenant-ID": tenantId
                },
                body: JSON.stringify(typeof DetailCheckout !== 'undefined' ? await DetailCheckout.prepare(appendPayload) : appendPayload),
                signal: abortController.signal
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                if (errData && errData.code === 'ITEMS_OUT_OF_STOCK') {
                    const outOfStockNames = errData.outOfStockItems || [];
                    const itemListHtml = outOfStockNames.map(name => `• 【${name}】`).join('<br>');
                    try {
                        if (typeof bootstrapData !== 'undefined' && bootstrapData && bootstrapData.catalog && Array.isArray(outOfStockNames)) {
                            bootstrapData.catalog.forEach(c => (c.items || []).forEach(it => {
                                if (outOfStockNames.includes(it.name)) it.isOutOfStock = true;
                            }));
                        }
                    } catch(e) {}
                    try {
                        if (typeof updateDynamicStockAndPrices === 'function') updateDynamicStockAndPrices();
                        if (typeof renderDynamicCatalog === 'function') renderDynamicCatalog();
                        if (typeof updateTotal === 'function') updateTotal();
                    } catch(e) {}
                    const hasRemaining = typeof hasAvailableCartItems === 'function' ? hasAvailableCartItems() : false;
                    if (hasRemaining) {
                        setAllSubmitButtonsState(false, '確認加點', { cursor: 'pointer', opacity: '1' });
                        return customAlert(
                            `<div style="font-size: 16px; font-weight: 900; color: #dc2626; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">` +
                            `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>` +
                            `<span>售完品項</span>` +
                            `</div>` +
                            `<div style="font-size: 14px; color: #374151; line-height: 1.6; text-align: left; margin: 12px 0;">` +
                            `抱歉，以下加點餐點目前已售完，已自動自購物車移除：<br>` +
                            `<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; margin-top: 8px; color: #b91c1c; font-weight: 700;">` +
                            `${itemListHtml}` +
                            `</div>` +
                            `</div>` +
                            `<div style="font-size: 13px; color: #6b7280;">金額已重新計算，請確認後再次點擊送出加點。</div>`
                        );
                    } else {
                        setAllSubmitButtonsState(true, '餐點已售完', { cursor: 'not-allowed', opacity: '0.6' });
                        return customAlert(
                            `<div style="font-size: 16px; font-weight: 900; color: #dc2626; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">` +
                            `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>` +
                            `<span>售完品項</span>` +
                            `</div>` +
                            `<div style="font-size: 14px; color: #374151; line-height: 1.6; text-align: left; margin: 12px 0;">` +
                            `抱歉，您加點的餐點目前已全數售完：<br>` +
                            `<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; margin-top: 8px; color: #b91c1c; font-weight: 700;">` +
                            `${itemListHtml}` +
                            `</div>` +
                            `</div>` +
                            `<div style="font-size: 13px; color: #6b7280;">請回到菜單選擇其他餐點，敬請見諒！</div>`
                        );
                    }
                }
                const serverError = new Error(errData.error || `API returned status ${res.status}`);
                serverError.serverRejected = true;
                serverError.details = errData;
                throw serverError;
            }

            const appendResult = await res.json();
            orderSubmittedSuccessfully = true;
            if (appendResult.success && typeof DetailCheckout !== 'undefined') DetailCheckout.completed();
            window.parentOrderKey = appendResult.key;
            window.parentOrderDisplayKey = appendResult.displayKey || window.parentOrderDisplayKey;

            setAllSubmitButtonsState(true, '加點已送出', { cursor: 'not-allowed', opacity: '0.6' });

            const tablePart = currentTable ? `\n桌號：${currentTable}` : '';
            const notePart = mainNote ? `\n📝 備註：${mainNote}` : '';
            const appendChatMsg = `[加點 #${window.parentOrderDisplayKey || ""}]\n訂單參考：${window.parentOrderKey}${tablePart}\n現場加點品項：\n${displayItemsText}${notePart}\n\n💰 加點金額：+$${currentTotal}`;

            cart = {};
            window.cart = cart;
            customizeData = {};
            window.customizeData = customizeData;
            comboDrinkData = {};
            window.comboDrinkData = comboDrinkData;
            if (window.bundleCartData) window.bundleCartData = {};
            try {
                sessionStorage.removeItem('benmi_append_parent');
                sessionStorage.removeItem('benmi_append_display');
                sessionStorage.removeItem('benmi_append_table');
            } catch(e) {}
            if (typeof updateTotal === 'function') updateTotal();

            const appendSuccessMsg = `您的現場加點已成功送達廚房製作！\n總共加點 $${currentTotal}`;
            customAlert(`
                <div style="margin-bottom: 16px;">
                    <div style="width: 60px; height: 60px; margin: 0 auto; background: #ecfdf5; border: 2px solid #a7f3d0; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                </div>
                <div style="font-size: 19px; font-weight: 900; color: #111827; margin-bottom: 6px;">現場加點已送出！</div>
                <div style="font-size: 14.5px; line-height: 1.5; color: #4b5563;">${appendSuccessMsg}</div>
            `, () => {
                if (typeof closeAndExitLiff === 'function') closeAndExitLiff();
            });

            sendOrderConfirmation([{ type: 'text', text: appendChatMsg }], {
                tenantId, orderKey: window.parentOrderKey, flow: 'append'
            }, appendResult.notification, deliveryDiagnostic).catch(confErr => {
                console.warn('[Checkout] Background append confirmation notice:', confErr);
            });

            return;
        }

        // 10.2 Xử lý riêng cho luồng 更換品項 (Sold Out Edit Order Mode)
        if (window.isEditOrderMode && window.editOrderKey) {
            const modifyPayload = {
                order_key: window.editOrderKey,
                items: structuredItems,
                total: currentTotal,
                new_total: currentTotal,
                note: mainNote,
                tenant_id: tenantId,
                is_desktop: isDesktop,
                isDesktop: isDesktop,
                line_delivery_mode: deliveryDiagnostic.deliveryMode
            };

            const res = await fetch(`${WORKER_BASE}/api/orders/modify?tenant_id=${tenantId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Tenant-ID": tenantId
                },
                body: JSON.stringify(typeof DetailCheckout !== 'undefined' ? await DetailCheckout.prepare(modifyPayload) : modifyPayload),
                signal: abortController.signal
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                if (errData && errData.code === 'ITEMS_OUT_OF_STOCK') {
                    const outOfStockNames = errData.outOfStockItems || [];
                    const itemListHtml = outOfStockNames.map(name => `• 【${name}】`).join('<br>');
                    try {
                        if (typeof bootstrapData !== 'undefined' && bootstrapData && bootstrapData.catalog && Array.isArray(outOfStockNames)) {
                            bootstrapData.catalog.forEach(c => (c.items || []).forEach(it => {
                                if (outOfStockNames.includes(it.name)) it.isOutOfStock = true;
                            }));
                        }
                    } catch(e) {}
                    try {
                        if (typeof updateDynamicStockAndPrices === 'function') updateDynamicStockAndPrices();
                        if (typeof renderDynamicCatalog === 'function') renderDynamicCatalog();
                        if (typeof updateTotal === 'function') updateTotal();
                    } catch(e) {}
                    const hasRemaining = typeof hasAvailableCartItems === 'function' ? hasAvailableCartItems() : false;
                    if (hasRemaining) {
                        setAllSubmitButtonsState(false, '確認下單', { cursor: 'pointer', opacity: '1' });
                        return customAlert(
                            `<div style="font-size: 16px; font-weight: 900; color: #dc2626; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">` +
                            `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>` +
                            `<span>售完品項</span>` +
                            `</div>` +
                            `<div style="font-size: 14px; color: #374151; line-height: 1.6; text-align: left; margin: 12px 0;">` +
                            `抱歉，以下餐點目前已售完，已自動自購物車移除：<br>` +
                            `<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; margin-top: 8px; color: #b91c1c; font-weight: 700;">` +
                            `${itemListHtml}` +
                            `</div>` +
                            `</div>` +
                            `<div style="font-size: 13px; color: #6b7280;">金額已重新計算，請確認後再次點擊送出。</div>`
                        );
                    } else {
                        setAllSubmitButtonsState(true, '餐點已售完', { cursor: 'not-allowed', opacity: '0.6' });
                        return customAlert(
                            `<div style="font-size: 16px; font-weight: 900; color: #dc2626; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">` +
                            `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>` +
                            `<span>售完品項</span>` +
                            `</div>` +
                            `<div style="font-size: 14px; color: #374151; line-height: 1.6; text-align: left; margin: 12px 0;">` +
                            `抱歉，您選購的更換餐點目前已全數售完：<br>` +
                            `<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; margin-top: 8px; color: #b91c1c; font-weight: 700;">` +
                            `${itemListHtml}` +
                            `</div>` +
                            `</div>` +
                            `<div style="font-size: 13px; color: #6b7280;">請回到菜單選擇其他餐點，敬請見諒！</div>`
                        );
                    }
                }
                const serverError = new Error(errData.error || `API returned status ${res.status}`);
                serverError.serverRejected = true;
                serverError.details = errData;
                throw serverError;
            }

            const modifyResult = await res.json();
            orderSubmittedSuccessfully = true;
            if (modifyResult.success && typeof DetailCheckout !== 'undefined') DetailCheckout.completed();
            setAllSubmitButtonsState(true, '品項已更新', { cursor: 'not-allowed', opacity: '0.6' });

            const rawItemsText = typeof formatAppendItemsOnlyText === 'function' ? formatAppendItemsOnlyText() : '';
            const notePart = mainNote ? `\n📝 備註：${mainNote}` : '';
            const editChatMsg = `[更換品項 #${window.editOrderDisplayKey || window.editOrderKey || ""}]\n訂單參考：${window.editOrderKey || ""}\n\n📦 更新後餐點內容：\n${rawItemsText}${notePart}\n\n💰 更新後金額：$${currentTotal}`;

            cart = {};
            window.cart = cart;
            customizeData = {};
            window.customizeData = customizeData;
            comboDrinkData = {};
            window.comboDrinkData = comboDrinkData;
            if (window.bundleCartData) window.bundleCartData = {};
            try {
                sessionStorage.removeItem('benmi_edit_order_key');
            } catch(e) {}
            if (typeof updateTotal === 'function') updateTotal();

            const delta = modifyResult.deltaAmount || (currentTotal - (window.editOrderOriginalTotal || 0));
            let deltaMsg = '無差額 ($0)';
            if (delta > 0) deltaMsg = `需補差額 $${delta}`;
            else if (delta < 0) deltaMsg = `店家退還差額 $${Math.abs(delta)}`;

            customAlert(`
                <div style="margin-bottom: 16px;">
                    <div style="width: 60px; height: 60px; margin: 0 auto; background: #ecfdf5; border: 2px solid #a7f3d0; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                </div>
                <div style="font-size: 19px; font-weight: 900; color: #111827; margin-bottom: 6px;">品項更換成功！</div>
                <div style="font-size: 14.5px; line-height: 1.5; color: #4b5563;">
                    門市已收到您的更新訂單！<br>
                    <strong>新總計：$${currentTotal}</strong> (${deltaMsg})<br>
                    品項已更新，請在 LINE 查看確認與訂單進度。
                </div>
            `, () => {
                if (typeof closeAndExitLiff === 'function') closeAndExitLiff();
            });

            sendOrderConfirmation([{ type: 'text', text: editChatMsg }], {
                tenantId, orderKey: window.editOrderKey, flow: 'modify'
            }, modifyResult.notification, deliveryDiagnostic).catch(confErr => {
                console.warn('[Checkout] Background modify confirmation notice:', confErr);
            });

            return;
        }

        const orderPayload = {
            key: orderNum,
            uuid: orderUuid,
            userId: userId,
            customer: customerName,
            time: `${dateInput} ${timeInput}`,
            dining_option: diningOption,
            table_number: tableNumber || undefined,
            content: formatOrderTextMessage(orderNum, dateInput, timeInput, currentTotal, mainNote, true).split('\n\n🕒')[0].replace(/\[.*?點餐\]\n/g, '').replace('[Benmi 點餐]\n', ''),
            total: currentTotal,
            note: mainNote,
            tenant_id: tenantId,
            items: structuredItems,
            customizations: getStructuredGlobalCustomizations(),
            liffFallback: false,
            is_desktop: isDesktop,
            isDesktop: isDesktop,
            line_delivery_mode: deliveryDiagnostic.deliveryMode
        };

        if (window.LinePayCheckout && (LinePayCheckout.selected() || LinePayCheckout.blocked())) {
            clearTimeout(timeoutId);
            const preparedPayment = await DetailCheckout.prepare(orderPayload);
            await LinePayCheckout.start(preparedPayment);
            return;
        }

        const res = await fetch(`${WORKER_BASE}/api/create?tenant_id=${tenantId}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Tenant-ID": tenantId
            },
            body: JSON.stringify(typeof DetailCheckout !== 'undefined' ? await DetailCheckout.prepare(orderPayload) : orderPayload),
            signal: abortController.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            if (errData && errData.code === 'ITEMS_OUT_OF_STOCK') {
                const outOfStockNames = errData.outOfStockItems || [];
                const itemListHtml = outOfStockNames.map(name => `• 【${name}】`).join('<br>');
                try {
                    if (typeof bootstrapData !== 'undefined' && bootstrapData && bootstrapData.catalog && Array.isArray(outOfStockNames)) {
                        bootstrapData.catalog.forEach(c => (c.items || []).forEach(it => {
                            if (outOfStockNames.includes(it.name)) it.isOutOfStock = true;
                        }));
                    }
                } catch(e) {}
                try {
                    if (typeof updateDynamicStockAndPrices === 'function') updateDynamicStockAndPrices();
                    if (typeof renderDynamicCatalog === 'function') renderDynamicCatalog();
                    if (typeof updateTotal === 'function') updateTotal();
                } catch(e) {}
                const hasRemaining = typeof hasAvailableCartItems === 'function' ? hasAvailableCartItems() : false;
                if (hasRemaining) {
                    setAllSubmitButtonsState(false, '確認下單', { cursor: 'pointer', opacity: '1' });
                    return customAlert(
                        `<div style="font-size: 16px; font-weight: 900; color: #dc2626; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">` +
                        `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>` +
                        `<span>售完品項</span>` +
                        `</div>` +
                        `<div style="font-size: 14px; color: #374151; line-height: 1.6; text-align: left; margin: 12px 0;">` +
                        `抱歉，以下餐點目前已售完，已自動自購物車移除：<br>` +
                        `<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; margin-top: 8px; color: #b91c1c; font-weight: 700;">` +
                        `${itemListHtml}` +
                        `</div>` +
                        `</div>` +
                        `<div style="font-size: 13px; color: #6b7280;">金額已重新計算，請確認後再次點擊送出訂單。</div>`
                    );
                } else {
                    setAllSubmitButtonsState(true, '餐點已售完', { cursor: 'not-allowed', opacity: '0.6' });
                    return customAlert(
                        `<div style="font-size: 16px; font-weight: 900; color: #dc2626; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">` +
                        `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>` +
                        `<span>售完品項</span>` +
                        `</div>` +
                        `<div style="font-size: 14px; color: #374151; line-height: 1.6; text-align: left; margin: 12px 0;">` +
                        `抱歉，您選購的餐點目前已全數售完：<br>` +
                        `<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; margin-top: 8px; color: #b91c1c; font-weight: 700;">` +
                        `${itemListHtml}` +
                        `</div>` +
                        `</div>` +
                        `<div style="font-size: 13px; color: #6b7280;">請回到菜單選擇其他餐點，敬請見諒！</div>`
                    );
                }
            }
            const serverError = new Error(errData.error || `API returned status ${res.status}`);
            serverError.serverRejected = true;
            serverError.details = errData;
            throw serverError;
        }

        const resData = await res.json().catch(() => ({}));
        if (resData && resData.key) {
            orderNum = resData.displayKey || resData.key;
            // Older LINE Workers read 訂單編號 as a lookup key. Keep that reference
            // stable during rolling deployment; show the receipt separately on collision.
            msg = formatOrderTextMessage(resData.key, dateInput, timeInput, currentTotal, mainNote);
            if (orderNum !== resData.key) msg = `取餐號碼：${orderNum}\n` + msg;
            msg += `\n訂單參考：${resData.key}`;
        }

        orderSubmittedSuccessfully = true;
        setAllSubmitButtonsState(true, '訂單已送出', { cursor: 'not-allowed', opacity: '0.6' });

        // Xóa sạch giỏ hàng khi thành công ngay lập tức để giao diện phản hồi nhanh chóng
        cart = {};
        window.cart = cart;
        customizeData = {};
        window.customizeData = customizeData;
        comboDrinkData = {};
        window.comboDrinkData = comboDrinkData;
        if (window.bundleCartData) window.bundleCartData = {};
        if (typeof updateTotal === 'function') updateTotal();

        const orderSuccessMsg = '店家已收到您的訂單，請在 LINE 查看訂單確認與進度。';

        customAlert(`
            <div style="margin-bottom: 16px;">
                <div style="width: 60px; height: 60px; margin: 0 auto; background: #ecfdf5; border: 2px solid #a7f3d0; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
            </div>
            <div style="font-size: 19px; font-weight: 900; color: #111827; margin-bottom: 6px;">訂單已送出成功！</div>
            <div style="font-size: 14.5px; line-height: 1.5; color: #4b5563;">${orderSuccessMsg}</div>
        `, () => {
            if (typeof closeAndExitLiff === 'function') closeAndExitLiff();
        });

        // Gửi xác nhận LINE chạy ngầm, không chặn thông báo thành công của người dùng
        sendOrderConfirmation([{ type: 'text', text: msg }], {
            tenantId, orderKey: resData.key || orderNum, flow: 'create'
        }, resData.notification, deliveryDiagnostic).catch(confErr => {
            console.warn('[Checkout] Background order confirmation notice:', confErr);
        });

    } catch (err) {
        clearTimeout(timeoutId);
        if (window.LinePayCheckout && (LinePayCheckout.selected() || LinePayCheckout.blocked())) {
            customAlert('LINE Pay: ' + String(err.message || '請重新確認付款 / Vui lòng kiểm tra lại thanh toán').replace(/[<>&]/g, ''));
            return;
        }
        if (err.serverRejected) {
            const details = err.details || {};
            const code = String(details.code || '');
            const optionError = code.startsWith('OPTION_') || code === 'ORDER_PRICE_CHANGED' || code === 'PRODUCT_UNAVAILABLE' || code === 'MIN_ORDER_SUBTOTAL_NOT_MET';
            if (code.startsWith('BUNDLE_') || optionError) {
                const affected = buildStructuredCartItems()[Number(details.itemIndex || 0)];
                let key = affected && Object.keys(cart).find(candidate => resolveCatalogItem(candidate)?.itemId === affected.itemId);
                let location = key ? parseCartKey(key) : null;
                try {
                    const fresh = await fetch(`${WORKER_BASE}/api/tenant/bootstrap?tenant_id=${encodeURIComponent(getTenantIdFromUrl())}&_t=${Date.now()}`, {
                        cache: 'no-store',
                        signal: AbortSignal.timeout(8000)
                    });
                    if (fresh.ok) {
                        const data = await fresh.json();
                        if (data?.tenant?.id === getTenantIdFromUrl() && data.menuComplete === true &&
                            Array.isArray(data.catalog) && data.catalog.every(c => c && Array.isArray(c.items))) {
                            bootstrapData = data;
                            window.bootstrapData = data;
                            if (typeof buildModifierPriceMap === 'function') buildModifierPriceMap(data);
                        }
                    }
                } catch (refreshError) { console.warn('[Bundle] Refresh failed', refreshError); }
                // Cart keys include names: retain selections when the same product was renamed.
                const category = bootstrapData?.catalog?.find(cat => cat.items?.some(item => item.id === affected?.itemId));
                const product = category?.items?.find(item => item.id === affected?.itemId);
                const freshKey = product && `${category.slug}_${product.name}`;
                if (key && freshKey && key !== freshKey && !cart[freshKey]) {
                    cart[freshKey] = cart[key];
                    delete cart[key];
                    for (const data of [window.customizeData, window.comboDrinkData, window.bundleCartData]) {
                        if (data && Object.prototype.hasOwnProperty.call(data, key)) {
                            data[freshKey] = data[key];
                            delete data[key];
                        }
                    }
                    key = freshKey;
                    location = { catSlug: category.slug, origName: product.name };
                }
                if (typeof reconcileCartOptions === 'function') reconcileCartOptions();
                // This rejection already asks the customer to review and explicitly retry.
                window.cartOptionsNeedReview = false;
                const vi = (typeof currentLocale !== 'undefined' ? currentLocale : document.documentElement.lang) === 'vi';
                const message = optionError
                    ? code === 'OPTION_PRICE_CHANGED' || code === 'ORDER_PRICE_CHANGED'
                        ? (vi ? 'Giá món đã thay đổi. Vui lòng xác nhận lại tùy chọn.' : '餐點價格已更新，請重新確認選項。')
                        : code === 'PRODUCT_UNAVAILABLE' || code === 'OPTION_UNAVAILABLE' || code === 'OPTION_SUB_INVALID'
                            ? (vi ? 'Một món hoặc tùy chọn đã hết hàng. Vui lòng chọn lại.' : '餐點或選項已售完，請重新選擇。')
                            : code === 'MIN_ORDER_SUBTOTAL_NOT_MET'
                                ? (vi ? 'Giỏ hàng chưa đạt giá trị tối thiểu cho tùy chọn này. Vui lòng chọn lại.' : '訂單金額未達此選項的最低金額，請重新選擇。')
                                : (vi ? 'Tùy chọn của món đã thay đổi. Vui lòng xác nhận lại.' : '餐點選項已更新，請重新確認。')
                    : details.error || '套餐內容已變更，請重新確認';
                const safeMessage = String(message).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
                const expected = details.expectedTotal ?? details.expectedSubtotal;
                if (typeof updateTotal === 'function') updateTotal();
                customAlert(`${safeMessage}${expected !== undefined ? `<br>${vi ? 'Số tiền cập nhật' : '更新後金額'}：$${Number(expected)}` : ''}`, () => {
                    if (location && (!optionError || (product?.bundleRule && !product.isOutOfStock))) {
                        if (typeof openBundleBuilderModal === 'function') {
                            openBundleBuilderModal(location.catSlug, location.origName, Number(details.portionIndex || 0));
                        }
                        if (details.groupId && typeof window.bundleFocusGroup === 'function') window.bundleFocusGroup(details.groupId);
                    }
                });
            } else {
                const safeMessage = String(err.message || '訂單送出失敗').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
                customAlert(safeMessage);
            }
            return;
        }
        if (typeof DetailCheckout !== 'undefined' && DetailCheckout.enabled()) {
            customAlert(document.documentElement.lang === 'vi'
                ? 'Chưa xác nhận được kết quả. Giỏ hàng được giữ lại; vui lòng thử gửi lại.'
                : '尚未確認送出結果，購物車已保留，請重試。');
            return;
        }
        console.warn("Primary API flow failed, falling back to LINE message flow:", err);

        try {
            const currentTotal = typeof updateTotal === 'function' ? updateTotal() : 0;
            const mainNote = document.getElementById('note') ? document.getElementById('note').value : '';

            if (typeof liff !== 'undefined' && liff.isInClient && liff.isInClient() && typeof liff.sendMessages === 'function') {
                if (window.isEditOrderMode && window.editOrderKey) {
                    const rawItemsText = typeof formatAppendItemsOnlyText === 'function' ? formatAppendItemsOnlyText(true) : '';
                    const notePart = mainNote ? `\n📝 備註：${mainNote}` : '';
                    const editChatMsg = `[更換品項 #${window.editOrderDisplayKey || window.editOrderKey || ""}]\n訂單參考：${window.editOrderKey || ""}\n\n📦 更新後餐點內容：\n${rawItemsText}${notePart}\n\n💰 更新後金額：$${currentTotal}`;
                    await sendLiffMessagesWithRetry([{ type: 'text', text: editChatMsg }], {
                        tenantId, orderKey: window.editOrderKey, flow: 'modify_fallback'
                    });
                } else if (window.isAppendMode && window.parentOrderKey) {
                    const rawItemsText = formatAppendItemsOnlyText(true);
                    const tableInput = document.getElementById('dinein-table-number');
                    const currentTable = (tableInput && tableInput.value.trim()) || window.appendTableNumber || window.currentTableNumber || '';
                    const tablePart = currentTable ? `\n桌號：${currentTable}` : '';
                    const notePart = mainNote ? `\n📝 備註：${mainNote}` : '';
                    const appendChatMsg = `[加點 #${window.parentOrderDisplayKey || ""}]\n訂單參考：${window.parentOrderKey}${tablePart}\n現場加點品項：\n${rawItemsText}${notePart}\n\n💰 加點金額：+$${currentTotal}`;
                    await sendLiffMessagesWithRetry([{ type: 'text', text: appendChatMsg }], {
                        tenantId, orderKey: window.parentOrderKey, flow: 'append_fallback'
                    });
                } else {
                    const isDineIn = (window.currentDiningOption === 'dine_in');
                    const diningOption = isDineIn ? 'dine_in' : 'takeaway';
                    const orderNum = generateOrderNumber(diningOption);
                    const msg = formatOrderTextMessage(orderNum, dateInput, timeInput, currentTotal, mainNote, true);
                    await sendLiffMessagesWithRetry([{ type: 'text', text: msg }], {
                        tenantId, orderKey: orderNum, flow: 'create_fallback'
                    });
                }
                orderSubmittedSuccessfully = true;
                setAllSubmitButtonsState(true, window.isAppendMode ? '加點已送出' : '訂單已送出', { cursor: 'not-allowed', opacity: '0.6' });

                cart = {};
                window.cart = cart;
                customizeData = {};
                window.customizeData = customizeData;
                comboDrinkData = {};
                window.comboDrinkData = comboDrinkData;
                if (window.bundleCartData) window.bundleCartData = {};
                try {
                    sessionStorage.removeItem('benmi_append_parent');
                    sessionStorage.removeItem('benmi_append_display');
                    sessionStorage.removeItem('benmi_append_table');
                } catch(e) {}
                if (typeof updateTotal === 'function') updateTotal();

                customAlert(`
                    <div style="margin-bottom: 16px;">
                        <div style="width: 60px; height: 60px; margin: 0 auto; background: #ecfdf5; border: 2px solid #a7f3d0; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                    </div>
                    <div style="font-size: 19px; font-weight: 900; color: #111827; margin-bottom: 6px;">訂單已送出成功！</div>
                    <div style="font-size: 14.5px; line-height: 1.5; color: #4b5563;">店家已收到您的訂單，您可以直接在LINE查看訂單狀態 🙏</div>
                `, () => {
                    if (typeof closeAndExitLiff === 'function') closeAndExitLiff();
                });
            } else {
                throw err;
            }
        } catch (liffErr) {
            const errorMsg = (err.name === 'AbortError') ? '連線逾時（網路較慢），請重新點擊送出' : (err.message || '連線逾時');
            customAlert(`訂單送出失敗：<br><br><span style="color:#ef4444; font-weight:700;">${errorMsg}</span><br><br>請檢查網路後再次點擊確認下單。`);
        }
    } finally {
        clearTimeout(timeoutId);
        // Luôn giải phóng khóa nút bấm nếu đơn hàng chưa hoàn tất
        if (!orderSubmittedSuccessfully) {
            isSubmitting = false;
            setAllSubmitButtonsState(false, '確認下單', { cursor: 'pointer', opacity: '1' });
        }
    }
}
