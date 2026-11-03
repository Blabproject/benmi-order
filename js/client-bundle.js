// ==========================================
// Benmi Client Menu - Module: Universal Bundle Builder Engine
// ==========================================

var bootstrapData = window.bootstrapData;
var cart = window.cart;
var customizeData = window.customizeData;
window.bundleCartData = window.bundleCartData || {};

var currentBundleModalContext = null;
var activeBundleCatTab = 'all';

// Note: getModifierPrice is authoritatively implemented in client-core.js


function openBundleBuilderModal(catSlug, origName, portionIndex) {
    const key = catSlug + '_' + origName;
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (k => ({ catSlug, origName, displayName: origName })));
    const itemInfo = resolveFn(key);
    const bundleRule = itemInfo?.bundleRule || (itemInfo?.targetItem && itemInfo.targetItem.bundleRule);
    if (!bundleRule || !bundleRule.groups || bundleRule.groups.length === 0) return;

    const group = bundleRule.groups[0]; // Primary selection group
    const cartObj = window.cart || cart || {};
    const currentQty = cartObj[key] || 0;
    const targetPortionIndex = (typeof portionIndex === 'number' && portionIndex >= 0) ? portionIndex : currentQty;

    // Clone existing selections for this portion if already selected
    const existingPortion = (window.bundleCartData && window.bundleCartData[key] && window.bundleCartData[key][targetPortionIndex]) ? window.bundleCartData[key][targetPortionIndex] : null;
    const initialSelections = {};
    if (existingPortion && existingPortion.groups) {
        existingPortion.groups.forEach(g => {
            initialSelections[g.groupId] = {};
            (g.items || []).forEach(it => {
                initialSelections[g.groupId][it.itemId] = it.quantity || 0;
            });
        });
    }
    if (!initialSelections[group.id]) {
        initialSelections[group.id] = {};
    }

    // Unified category modifiers (Addons / Flavors / Notes)
    const getModsFn = typeof getCategoryModifiers === 'function' ? getCategoryModifiers : (window.getCategoryModifiers || (() => []));
    const catModifiers = getModsFn(catSlug) || [];
    const cData = window.customizeData || customizeData;
    const existingCustom = (cData[key] && cData[key][targetPortionIndex]) 
        ? JSON.parse(JSON.stringify(cData[key][targetPortionIndex])) 
        : null;
    let initialAddons = null;
    if (catModifiers.length > 0) {
        if (existingCustom) {
            initialAddons = existingCustom;
        } else {
            const initialSingle = {};
            catModifiers.filter(m => m.selectionType === 'single').forEach(m => {
                const defOpt = m.options.find(o => o.isDefault && !o.isOutOfStock) || m.options.find(o => !o.isOutOfStock) || m.options[0];
                if (defOpt) initialSingle[m.slug] = defOpt.name;
            });
            initialAddons = { single: initialSingle, multiple: {}, note: '' };
        }
    }

    currentBundleModalContext = {
        catSlug,
        origName,
        key,
        itemInfo,
        bundleRule,
        group,
        portionIndex: targetPortionIndex,
        selections: initialSelections,
        catModifiers,
        addonSelections: initialAddons
    };

    const modal = document.getElementById('bundle-builder-modal');
    const titleEl = document.getElementById('bundle-modal-item-name');
    const maxCountEl = document.getElementById('bundle-modal-max-count');

    const portionLabel = (currentQty > 1 || targetPortionIndex > 0) ? ` (第 ${targetPortionIndex + 1} 份)` : '';
    if (titleEl) titleEl.innerText = (itemInfo.displayName || origName) + portionLabel;

    const maxRequired = group.maxQuantity ?? group.maxSelections ?? group.requiredCount ?? 6;
    if (maxCountEl) maxCountEl.innerText = maxRequired;

    const cleanGroupLabel = (group.name || '').replace(/^請選擇\s*(\d+\s*樣)?/g, '').trim() || '配菜';
    const promptEl = document.getElementById('bundle-modal-prompt-text');
    if (promptEl) {
        const userLang = (typeof currentLocale !== 'undefined' && currentLocale) ? currentLocale : ((typeof currentLang !== 'undefined' && currentLang) ? currentLang : 'zh-TW');
        const promptText = (typeof group.label === 'object' && group.label ? (group.label[userLang] || group.label['zh-TW'] || group.label['vi']) : group.label) || (group.name ? `請選擇${cleanGroupLabel}` : '請選擇配菜');
        promptEl.innerText = promptText;
    }

    // Render category tabs & items
    activeBundleCatTab = 'all';
    renderBundleCategoryTabs(group);
    renderBundleItemsList();
    renderBundleAddonsSection();
    updateBundleModalState();

    if (modal) modal.style.display = 'flex';
}

function closeBundleBuilderModal() {
    const modal = document.getElementById('bundle-builder-modal');
    if (modal) modal.style.display = 'none';
    currentBundleModalContext = null;
}

function renderBundleAddonsSection() {
    const container = document.getElementById('bundle-addons-container');
    if (!container || !currentBundleModalContext) return;
    const { catModifiers, addonSelections } = currentBundleModalContext;
    if (!catModifiers || catModifiers.length === 0 || !addonSelections) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'block';
    let html = `
        <div style="font-size: 14.5px; font-weight: 800; color: #0f172a; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
            <span>加料加價購 / 客製備註</span>
            <span style="font-size: 11.5px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 6px;">選填</span>
        </div>
    `;

    catModifiers.forEach(mod => {
        const reqBadge = mod.isRequired ? `<span class="modifier-required-badge">必選</span>` : `<span class="modifier-optional-badge">可選</span>`;
        html += `
            <div class="modifier-group-title" style="margin-top: 10px; margin-bottom: 8px;">
                <span>${mod.name}</span>
                ${reqBadge}
            </div>
        `;
        const safeModSlug = String(mod.slug).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        if (mod.selectionType === 'single') {
            html += `<div class="modifier-pills-row">`;
            mod.options.forEach(opt => {
                const isOos = Boolean(opt.isOutOfStock);
                const isSelected = (addonSelections.single && addonSelections.single[mod.slug] === opt.name);
                const priceText = opt.price > 0 ? ` (+$${opt.price})` : '';
                const oosBadge = isOos ? `<span class="modifier-oos-tag">已售完</span>` : '';
                const safeOptName = String(opt.name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                html += `
                    <div class="modifier-pill ${isSelected ? 'active' : ''} ${isOos ? 'disabled' : ''}"
                         onclick="${isOos ? '' : `selectBundleAddonSingle('${safeModSlug}', '${safeOptName}', this)`}">
                        <span>${opt.name}${priceText}</span>${oosBadge}
                    </div>
                `;
            });
            html += `</div>`;
        } else if (mod.selectionType === 'multiple') {
            html += `<div class="modifier-checkbox-grid">`;
            mod.options.forEach(opt => {
                const isOos = Boolean(opt.isOutOfStock);
                const isChecked = Boolean(addonSelections.multiple && addonSelections.multiple[opt.name]);
                const priceText = isOos ? `<span class="modifier-oos-tag">已售完</span>` : (opt.price > 0 ? `+$${opt.price}` : '$0');
                const safeOptName = String(opt.name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                html += `
                    <div class="modifier-checkbox-chip ${isChecked ? 'active' : ''} ${isOos ? 'disabled' : ''}"
                         onclick="${isOos ? '' : `toggleBundleAddonMultiple('${safeOptName}', this)`}">
                        <span>${opt.name}</span>
                        <span style="font-size: 12px; opacity: 0.85;">${priceText}</span>
                    </div>
                `;
            });
            html += `</div>`;
        }
    });

    html += `
        <label style="font-size: 13px; font-weight: 700; color: #475569; display: block; margin: 12px 0 6px 0;">個別備註</label>
        <input type="text" maxlength="50" value="${(addonSelections.note || '').replace(/"/g, '&quot;')}"
               class="bundle-note-input"
               style="width: 100%; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 10px 14px; font-size: 14px; color: #1e293b; background: #fff; outline: none; box-sizing: border-box;"
               oninput="updateBundleAddonNote(this.value)">
    `;

    container.innerHTML = html;
}

function selectBundleAddonSingle(modSlug, optName, el) {
    if (!currentBundleModalContext || !currentBundleModalContext.addonSelections) return;
    if (el && el.classList.contains('disabled')) return;
    if (!currentBundleModalContext.addonSelections.single) {
        currentBundleModalContext.addonSelections.single = {};
    }
    currentBundleModalContext.addonSelections.single[modSlug] = optName;
    const parent = el.parentElement;
    if (parent) {
        parent.querySelectorAll('.modifier-pill').forEach(p => p.classList.remove('active'));
    }
    el.classList.add('active');
    updateBundleModalState();
}

function toggleBundleAddonMultiple(optName, el) {
    if (!currentBundleModalContext || !currentBundleModalContext.addonSelections) return;
    if (el && el.classList.contains('disabled')) return;
    if (!currentBundleModalContext.addonSelections.multiple) {
        currentBundleModalContext.addonSelections.multiple = {};
    }
    const isChecked = Boolean(currentBundleModalContext.addonSelections.multiple[optName]);
    if (isChecked) {
        delete currentBundleModalContext.addonSelections.multiple[optName];
        el.classList.remove('active');
    } else {
        currentBundleModalContext.addonSelections.multiple[optName] = true;
        el.classList.add('active');
    }
    updateBundleModalState();
}

function updateBundleAddonNote(val) {
    if (!currentBundleModalContext || !currentBundleModalContext.addonSelections) return;
    currentBundleModalContext.addonSelections.note = String(val || '').slice(0, 50);
}

function renderBundleCategoryTabs(group) {
    const container = document.getElementById('bundle-cat-tabs');
    if (!container) return;

    const bData = window.bootstrapData || bootstrapData;
    const catMap = new Map();
    catMap.set('all', { id: 'all', name: '全部' });

    (group.eligibleItems || []).forEach(it => {
        if (it.categoryId && bData?.catalog) {
            const cat = bData.catalog.find(c => c.id === it.categoryId || c.slug === it.categoryId);
            if (cat && !catMap.has(cat.id || cat.slug)) {
                let cleanCatName = (cat.shortName || cat.short_name) || (cat.name || '')
                    .replace(/\s*\(一律.*?\)/g, '')
                    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
                    .trim();
                if (cleanCatName === '海裡') cleanCatName = '海鮮';
                catMap.set(cat.id || cat.slug, { id: cat.id || cat.slug, name: cleanCatName || cat.name });
            }
        }
    });

    if (catMap.size <= 1) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    container.style.display = 'flex';

    let html = '';
    catMap.forEach((catObj) => {
        const isActive = catObj.id === activeBundleCatTab ? 'active' : '';
        html += `<button type="button" class="bundle-cat-tab-btn ${isActive}" onclick="setBundleCategoryFilter('${catObj.id}', this)">${catObj.name}</button>`;
    });
    container.innerHTML = html;
}

function setBundleCategoryFilter(catId, btnEl) {
    activeBundleCatTab = catId;
    document.querySelectorAll('.bundle-cat-tab-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderBundleItemsList();
}

function handleBundleCardClick(itemId) {
    if (!currentBundleModalContext) return;
    const group = currentBundleModalContext.group;
    if (!currentBundleModalContext.selections[group.id]) {
        currentBundleModalContext.selections[group.id] = {};
    }
    const selMap = currentBundleModalContext.selections[group.id];
    const currentQty = selMap[itemId] || 0;
    const totalCount = Object.values(selMap).reduce((s, q) => s + q, 0);
    const maxAllowed = group.maxQuantity ?? group.maxSelections ?? group.requiredCount ?? 6;

    // Single choice bundle (e.g. choose 1 noodle type):
    // Tapping another card switches selection directly instead of alerting
    if (maxAllowed === 1 && totalCount >= 1 && currentQty === 0) {
        for (let k in selMap) delete selMap[k];
        selMap[itemId] = 1;
        renderBundleItemsList();
        updateBundleModalState();
        return;
    }

    if (totalCount >= maxAllowed) {
        const cleanGroupLabel = (group.name || '').replace(/^請選擇\s*(\d+\s*樣)?/g, '').trim() || '配菜';
        if (typeof customAlert === 'function') customAlert(`已選滿 ${maxAllowed} 樣${cleanGroupLabel}`);
        return;
    }
    changeBundleItemQty(itemId, 1);
}

function renderBundleItemsList() {
    const container = document.getElementById('bundle-items-list');
    if (!container || !currentBundleModalContext) return;

    const bData = window.bootstrapData || bootstrapData;
    const group = currentBundleModalContext.group;
    const selMap = currentBundleModalContext.selections[group.id] || {};
    const totalCount = Object.values(selMap).reduce((s, q) => s + q, 0);
    const maxAllowed = group.maxQuantity ?? group.maxSelections ?? group.requiredCount ?? 6;

    let filteredItems = group.eligibleItems || [];
    if (activeBundleCatTab !== 'all') {
        filteredItems = filteredItems.filter(it => it.categoryId === activeBundleCatTab || (bData?.catalog?.find(c => (c.id === it.categoryId || c.slug === it.categoryId) && (c.id === activeBundleCatTab || c.slug === activeBundleCatTab))));
    }

    let html = '';
    filteredItems.forEach(it => {
        const isOos = Boolean(it.isOutOfStock);
        const currentQty = selMap[it.id] || 0;
        const priceLabel = it.surcharge > 0 ? ` (+<span style="color:#059669; font-weight:800;">$${it.surcharge}</span>)` : '';
        const cardClass = currentQty > 0 ? 'bundle-item-card selected' : 'bundle-item-card';
        const oosBadge = isOos ? `<span class="oos-badge" style="color:#dc2626; font-size:12px; font-weight:800; margin-left:6px;">(已售完)</span>` : '';
        const disabledPlus = isOos || (totalCount >= maxAllowed);

        // Clean name: remove "1. ", "A. " prefixes for clean culinary display
        const cleanName = (it.name || '').replace(/^(\d+|[A-Za-z])\.\s*/, '');
        const safeName = String(cleanName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        if (currentQty === 0) {
            html += `
                <div class="${cardClass}" onclick="handleBundleCardClick('${it.id}')" style="${isOos ? 'opacity: 0.5; pointer-events: none;' : ''}">
                    <div class="bundle-item-info">
                        <span class="bundle-item-title">${safeName}</span>${priceLabel}${oosBadge}
                    </div>
                    <div class="bundle-stepper" onclick="event.stopPropagation()">
                        <button type="button" class="bundle-btn-add ${disabledPlus ? 'disabled' : ''}" onclick="changeBundleItemQty('${it.id}', 1)" ${disabledPlus ? 'disabled' : ''} aria-label="Add ${safeName}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="${cardClass}" style="${isOos ? 'opacity: 0.5; pointer-events: none;' : ''}">
                    <div class="bundle-item-info">
                        <span class="bundle-item-title">${safeName}</span>${priceLabel}${oosBadge}
                    </div>
                    <div class="bundle-stepper" onclick="event.stopPropagation()">
                        <button type="button" class="bundle-btn-minus" onclick="changeBundleItemQty('${it.id}', -1)" aria-label="Decrease">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                        <span class="bundle-qty-val">${currentQty}</span>
                        <button type="button" class="bundle-btn-plus ${disabledPlus ? 'disabled' : ''}" onclick="changeBundleItemQty('${it.id}', 1)" ${disabledPlus ? 'disabled' : ''} aria-label="Increase">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                    </div>
                </div>
            `;
        }
    });

    container.innerHTML = html;
}

function changeBundleItemQty(itemId, delta) {
    if (!currentBundleModalContext) return;
    const group = currentBundleModalContext.group;
    if (!currentBundleModalContext.selections[group.id]) {
        currentBundleModalContext.selections[group.id] = {};
    }
    const selMap = currentBundleModalContext.selections[group.id];
    const currentQty = selMap[itemId] || 0;
    const totalCount = Object.values(selMap).reduce((s, q) => s + q, 0);
    const maxAllowed = group.maxQuantity ?? group.maxSelections ?? group.requiredCount ?? 6;

    if (delta > 0) {
        if (totalCount >= maxAllowed) return;
        selMap[itemId] = currentQty + 1;
    } else if (delta < 0) {
        if (currentQty <= 0) return;
        selMap[itemId] = currentQty - 1;
        if (selMap[itemId] === 0) delete selMap[itemId];
    }

    renderBundleItemsList();
    updateBundleModalState();
}

function updateBundleModalState() {
    if (!currentBundleModalContext) return;
    const group = currentBundleModalContext.group;
    const selMap = currentBundleModalContext.selections[group.id] || {};
    const totalCount = Object.values(selMap).reduce((s, q) => s + q, 0);
    const minRequired = group.minQuantity ?? group.minSelections ?? group.requiredCount ?? 6;
    const maxAllowed = group.maxQuantity ?? group.maxSelections ?? group.requiredCount ?? 6;

    const countSpan = document.getElementById('bundle-modal-current-count');
    if (countSpan) countSpan.innerText = totalCount;

    const badgeSpan = document.getElementById('bundle-quota-badge');
    if (badgeSpan) {
        badgeSpan.style.display = (totalCount >= maxAllowed) ? 'inline-flex' : 'none';
    }

    const fillEl = document.getElementById('bundle-progress-fill');
    if (fillEl) {
        const fillPct = maxAllowed > 0 ? Math.min(100, Math.round((totalCount / maxAllowed) * 100)) : 0;
        fillEl.style.width = `${fillPct}%`;
    }

    const confirmBtn = document.getElementById('bundle-confirm-btn');
    if (!confirmBtn) return;

    const cleanGroupLabel = (group.name || '').replace(/^請選擇\s*(\d+\s*樣)?/g, '').trim() || '配菜';
    const remain = Math.max(0, minRequired - totalCount);

    if (remain > 0) {
        confirmBtn.disabled = true;
        confirmBtn.className = 'bundle-confirm-btn pending';
        confirmBtn.innerHTML = `還需選擇 ${remain} 樣${cleanGroupLabel} <span style="font-size: 13px; font-weight: 600; opacity: 0.85; margin-left: 4px;">(已選 ${totalCount}/${maxAllowed})</span>`;
    } else {
        // Calculate portion price: base item price + bundle item surcharges + addon surcharges
        const basePrice = Number(currentBundleModalContext.itemInfo?.basePrice ?? currentBundleModalContext.itemInfo?.price) || 0;
        let bundleSurcharges = 0;
        (group.eligibleItems || []).forEach(it => {
            const q = selMap[it.id] || 0;
            if (q > 0 && it.surcharge > 0) {
                bundleSurcharges += q * it.surcharge;
            }
        });

        let addonTotal = 0;
        const addons = currentBundleModalContext.addonSelections;
        if (addons && currentBundleModalContext.catModifiers) {
            if (addons.single) {
                for (let s in addons.single) {
                    const optVal = addons.single[s];
                    const p = getModifierPrice(optVal);
                    if (p > 0) addonTotal += p;
                }
            }
            if (addons.multiple) {
                for (let topName in addons.multiple) {
                    if (addons.multiple[topName]) {
                        const p = getModifierPrice(topName);
                        if (p > 0) addonTotal += p;
                    }
                }
            }
        }

        const portionTotal = basePrice + bundleSurcharges + addonTotal;
        const priceLabel = portionTotal > 0 ? ` · $${portionTotal}` : '';

        confirmBtn.disabled = false;
        confirmBtn.className = 'bundle-confirm-btn ready';
        confirmBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><polyline points="20 6 9 17 4 12"></polyline></svg>確認${cleanGroupLabel}${priceLabel}`;
    }
}

function confirmBundleSelection() {
    if (!currentBundleModalContext) return;
    const { key, catSlug, origName, group, portionIndex, selections, catModifiers, addonSelections } = currentBundleModalContext;
    const selMap = selections[group.id] || {};
    const totalCount = Object.values(selMap).reduce((s, q) => s + q, 0);
    const minRequired = group.minQuantity ?? group.minSelections ?? group.requiredCount ?? 6;
    const cleanGroupLabel = (group.name || '').replace(/^請選擇\s*(\d+\s*樣)?/g, '').trim() || '配菜';

    if (totalCount < minRequired) {
        const msg = `請至少選擇 ${minRequired} 樣${cleanGroupLabel}`;
        if (typeof customAlert === 'function') customAlert(msg);
        else alert(msg);
        return;
    }

    const portionData = {
        portionIndex: portionIndex,
        groups: [
            {
                groupId: group.id,
                groupName: group.name || '配菜',
                items: Object.entries(selMap).map(([itId, q]) => {
                    const it = (group.eligibleItems || []).find(x => x.id === itId);
                    return {
                        itemId: itId,
                        name: it ? it.name : itId,
                        quantity: q,
                        price: it ? it.price || 0 : 0
                    };
                })
            }
        ]
    };

    if (!window.bundleCartData) window.bundleCartData = {};
    if (!window.bundleCartData[key]) window.bundleCartData[key] = [];
    window.bundleCartData[key][portionIndex] = portionData;

    // Save unified addons/modifiers if present
    const cData = window.customizeData || customizeData;
    if (catModifiers && catModifiers.length > 0 && addonSelections) {
        if (!cData[key]) cData[key] = [];
        cData[key][portionIndex] = JSON.parse(JSON.stringify(addonSelections));
    }

    // If this is adding a new portion beyond current cart qty, increment cart[key]
    const cartObj = window.cart || cart || {};
    const currentQty = cartObj[key] || 0;
    if (portionIndex >= currentQty) {
        cartObj[key] = currentQty + 1;
    }

    // Update UI card
    const qtySpan = document.getElementById('qty-' + catSlug + '-' + origName);
    if (qtySpan) {
        qtySpan.innerText = cartObj[key];
        qtySpan.style.color = cartObj[key] > 0 ? 'var(--primary)' : 'inherit';
    }

    const bundleBtn = document.getElementById('bundle-edit-btn-' + catSlug + '-' + origName);
    if (bundleBtn) {
        bundleBtn.style.display = cartObj[key] > 0 ? 'flex' : 'none';
    }

    // Hide standalone customize button if item is handled via unified bundle modal
    const customBtn = document.getElementById('customize-btn-' + catSlug + '-' + origName);
    if (customBtn) {
        customBtn.style.display = 'none';
    }

    closeBundleBuilderModal();
    if (typeof updateTotal === 'function') updateTotal();
}

function checkAllBundlesComplete() {
    const cartObj = window.cart || cart;
    const bData = window.bootstrapData || bootstrapData;
    if (typeof cartObj === 'undefined' || !bData?.catalog) return { valid: true };
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (k => ({ origName: k, displayName: k })));

    for (let key in cartObj) {
        const qty = cartObj[key];
        if (qty > 0) {
            const itemInfo = resolveFn(key);
            const bundleRule = itemInfo?.bundleRule || (itemInfo?.targetItem && itemInfo.targetItem.bundleRule);
            if (bundleRule && bundleRule.groups) {
                const portions = (window.bundleCartData && window.bundleCartData[key]) || [];
                const firstGroup = bundleRule.groups[0];
                const cleanLabel = (firstGroup?.name || '').replace(/^請選擇\s*(\d+\s*樣)?/g, '').trim() || '搭配';
                if (portions.length < qty) {
                    return {
                        valid: false,
                        error: `「${itemInfo.displayName || itemInfo.origName}」尚有第 ${portions.length + 1} 份未完成${cleanLabel}選擇，請點擊「+」或「調整」完成搭配`
                    };
                }
                for (let i = 0; i < qty; i++) {
                    const portion = portions[i];
                    if (!portion || !portion.groups) {
                        return {
                            valid: false,
                            error: `「${itemInfo.displayName || itemInfo.origName}」第 ${i + 1} 份尚未完成${cleanLabel}選擇`
                        };
                    }
                    for (const gRule of bundleRule.groups) {
                        const selGroup = portion.groups.find(g => g.groupId === gRule.id);
                        const selCount = (selGroup?.items || []).reduce((s, it) => s + (it.quantity || 0), 0);
                        const min = gRule.minSelections ?? gRule.requiredCount ?? gRule.minQuantity ?? 0;
                        const gLabel = (gRule.name || '').replace(/^請選擇\s*(\d+\s*樣)?/g, '').trim() || cleanLabel;
                        if (selCount < min) {
                            return {
                                valid: false,
                                error: `「${itemInfo.displayName || itemInfo.origName}」第 ${i + 1} 份的${gLabel}還需選擇 ${min - selCount} 樣`
                            };
                        }
                    }
                }
            }
        }
    }
    return { valid: true };
}

// Window Public Bindings
window.openBundleBuilderModal = openBundleBuilderModal;
window.closeBundleBuilderModal = closeBundleBuilderModal;
window.renderBundleAddonsSection = renderBundleAddonsSection;
window.selectBundleAddonSingle = selectBundleAddonSingle;
window.toggleBundleAddonMultiple = toggleBundleAddonMultiple;
window.updateBundleAddonNote = updateBundleAddonNote;
window.renderBundleCategoryTabs = renderBundleCategoryTabs;
window.setBundleCategoryFilter = setBundleCategoryFilter;
window.handleBundleCardClick = handleBundleCardClick;
window.renderBundleItemsList = renderBundleItemsList;
window.changeBundleItemQty = changeBundleItemQty;
window.updateBundleModalState = updateBundleModalState;
window.confirmBundleSelection = confirmBundleSelection;
window.checkAllBundlesComplete = checkAllBundlesComplete;
