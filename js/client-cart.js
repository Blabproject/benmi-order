// ==========================================
// Benmi Client Menu - Module: Cart State, Pricing Math & Threshold Rules
// ==========================================

var bootstrapData = window.bootstrapData;
var storeConfig = window.storeConfig;
var cart = window.cart;
var customizeData = window.customizeData;
var comboDrinkData = window.comboDrinkData;

// --- CART LOGIC ---
function parseCartKey(key) {
    if (!key) return { catSlug: '', origName: '', itemName: '' };
    const bData = window.bootstrapData || bootstrapData;
    if (typeof bData !== 'undefined' && bData && bData.catalog) {
        for (const cat of bData.catalog) {
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

function calculateCurrentFoodSubtotal() {
    let subtotal = 0;
    const cartObj = window.cart || cart;
    const bData = window.bootstrapData || bootstrapData;
    if (typeof cartObj === 'undefined' || !bData?.catalog) return 0;
    const priceMap = {};
    const categoryMetaMap = {};
    bData.catalog.forEach(cat => {
        categoryMetaMap[cat.slug] = cat;
        cat.items.forEach(it => { priceMap[`${cat.slug}_${it.name}`] = it.price; });
    });
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (k => ({ origName: k, displayName: k })));
    const cData = window.customizeData || customizeData;
    const getPrice = window.getModifierPrice || (typeof getModifierPrice === 'function' ? getModifierPrice : () => 0);

    const itemsByCategory = {};

    for (let key in cartObj) {
        if (cartObj[key] > 0) {
            if (typeof isItemOutOfStock === 'function' && isItemOutOfStock(key)) continue;
            const itemInfo = resolveFn(key);
            const dName = itemInfo.displayName || itemInfo.origName;
            if (window.isEditOrderMode && Array.isArray(window.editOrderSoldOutNames) && (
                window.editOrderSoldOutNames.includes(dName) ||
                window.editOrderSoldOutNames.includes(itemInfo.origName) ||
                window.editOrderSoldOutNames.some(s => s && s.trim() && (dName.includes(s.trim()) || (itemInfo.origName && itemInfo.origName.includes(s.trim()))))
            )) continue;
            const basePrice = itemInfo.basePrice || priceMap[key] || 0;
            const qty = cartObj[key];
            subtotal += (basePrice * qty);

            const { catSlug } = parseCartKey(key);
            if (!itemsByCategory[catSlug]) itemsByCategory[catSlug] = [];
            itemsByCategory[catSlug].push({ price: basePrice, qty });

            const portions = cData ? cData[key] : null;
            if (Array.isArray(portions)) {
                portions.slice(0, qty).forEach(p => {
                    if (p) {
                        if (typeof calculatePortionExtra === 'function') {
                            subtotal += calculatePortionExtra(key, p);
                        } else {
                            if (p.single) {
                                Object.values(p.single).forEach(optName => {
                                    subtotal += getPrice(optName);
                                });
                            }
                            if (p.multiple) {
                                Object.keys(p.multiple).forEach(optName => {
                                    if (p.multiple[optName]) {
                                        subtotal += getPrice(optName);
                                    }
                                });
                            }
                        }
                    }
                });
            }

            if ((itemInfo?.bundleRule || itemInfo?.targetItem?.bundleRule || window.bundleCartData?.[key]?.length) && window.bundleCartData && window.bundleCartData[key] && window.bundlePortionExtra) {
                subtotal += window.bundleCartData[key].slice(0, qty).reduce((sum, portion) => sum + (window.bundlePortionExtra(portion) || 0), 0);
            }
        }
    }

    if (typeof calculateCategoryBundleSubtotal === 'function') {
        for (let slug in itemsByCategory) {
            const catMeta = categoryMetaMap[slug];
            const rule = catMeta?.pricingRules || catMeta?.pricing_rules;
            if (rule) {
                const bundleRes = calculateCategoryBundleSubtotal(rule, itemsByCategory[slug]);
                if (bundleRes?.discountAmount > 0) {
                    subtotal -= bundleRes.discountAmount;
                }
            }
        }
    }

    return Math.max(0, subtotal);
}

function updateCustomizationThresholdUI() {
    const currentSubtotal = typeof calculateCurrentFoodSubtotal === 'function' ? calculateCurrentFoodSubtotal() : 0;
    const thresholdInputs = document.querySelectorAll('.custom-panel input[data-min-subtotal]');
    if (!thresholdInputs || thresholdInputs.length === 0) return;

    let hasStateChanged = false;
    const radioGroups = new Map();
    const isOutOfStock = input => {
        const label = input.closest('label');
        return input.hasAttribute('data-oos') || Boolean(label && (
            label.classList.contains('oos') || label.style.textDecoration?.includes('line-through')
        ));
    };

    // Restore only radios disabled by a free replacement before finding fallbacks.
    // Paid options need not have data-min-subtotal, so collect their whole group.
    thresholdInputs.forEach(input => {
        if (input.type !== 'radio' || radioGroups.has(input.name)) return;
        const radios = Array.from(document.querySelectorAll(`input[name="${input.name}"]`));
        radioGroups.set(input.name, radios);
        radios.forEach(radio => {
            if (!radio.hasAttribute('data-free-replacement')) return;
            radio.removeAttribute('data-free-replacement');
            radio.disabled = isOutOfStock(radio);
        });
    });

    thresholdInputs.forEach(input => {
        const minSub = Number(input.getAttribute('data-min-subtotal')) || 0;
        if (minSub <= 0) return;

        const labelEl = input.closest('label');
        const isEligible = currentSubtotal >= minSub;
        const isOos = isOutOfStock(input);

        if (!isEligible || isOos) {
            input.disabled = true;
            if (labelEl) {
                labelEl.classList.add('threshold-disabled');
                labelEl.setAttribute('data-threshold-disabled', 'true');
                labelEl.style.opacity = '0.42';
                labelEl.style.backgroundColor = '#f1f5f9';
                labelEl.style.borderColor = '#e2e8f0';
                labelEl.style.color = '#94a3b8';
                labelEl.style.cursor = 'not-allowed';
            }

            // If currently checked, revert to a valid default option (usually the first option or opt with min_subtotal === 0)
            if (input.checked) {
                hasStateChanged = true;
                if (input.type === 'radio') {
                    const groupRadios = document.querySelectorAll(`input[name="${input.name}"]`);
                    let fallbackRadio = null;
                    groupRadios.forEach(r => {
                        const rMin = Number(r.getAttribute('data-min-subtotal')) || 0;
                        if (rMin === 0 && !r.disabled && !fallbackRadio) {
                            fallbackRadio = r;
                        }
                    });
                    if (fallbackRadio) {
                        fallbackRadio.checked = true;
                    } else if (groupRadios.length > 0 && !groupRadios[0].disabled) {
                        groupRadios[0].checked = true;
                    }
                } else {
                    input.checked = false;
                }
            }
        } else {
            // Eligible and not OOS -> Enable!
            input.disabled = false;
            if (labelEl) {
                labelEl.classList.remove('threshold-disabled');
                labelEl.removeAttribute('data-threshold-disabled');
                labelEl.style.opacity = '';
                labelEl.style.backgroundColor = '';
                labelEl.style.borderColor = '';
                labelEl.style.color = '';
                labelEl.style.cursor = '';
            }

            // Auto-promote: If this free ($0) option with threshold is now eligible, and user currently has a paid option (>0) checked in this same group
            if (input.type === 'radio' && !input.checked && (Number(input.getAttribute('data-price')) || 0) === 0) {
                const groupRadios = document.querySelectorAll(`input[name="${input.name}"]`);
                const currentChecked = Array.from(groupRadios).find(r => r.checked);
                if (currentChecked && (Number(currentChecked.getAttribute('data-price')) || 0) > 0) {
                    input.checked = true;
                    hasStateChanged = true;
                }
            }
        }
    });

    // An eligible free threshold option replaces the paid choices in its group.
    // Native disabled semantics also apply the existing muted label CSS.
    radioGroups.forEach(radios => {
        const hasFreeReplacement = radios.some(radio =>
            Number(radio.getAttribute('data-min-subtotal')) > 0 &&
            (Number(radio.getAttribute('data-price')) || 0) === 0 &&
            !radio.disabled && !isOutOfStock(radio)
        );
        if (!hasFreeReplacement) return;
        radios.forEach(radio => {
            if (Number(radio.getAttribute('data-price')) > 0 && !radio.disabled && !isOutOfStock(radio)) {
                radio.disabled = true;
                radio.setAttribute('data-free-replacement', 'true');
            }
        });
    });

    if (hasStateChanged && typeof toggleFlavorSubOptions === 'function') {
        toggleFlavorSubOptions();
    }
}

// Global capturing click interceptor for threshold-disabled options to give friendly notice
document.addEventListener('click', function(e) {
    const disabledLabel = e.target.closest('.threshold-disabled');
    if (disabledLabel) {
        e.preventDefault();
        e.stopPropagation();
        const input = disabledLabel.querySelector('input');
        if (input) {
            const minSub = Number(input.getAttribute('data-min-subtotal')) || 0;
            const currentSub = typeof calculateCurrentFoodSubtotal === 'function' ? calculateCurrentFoodSubtotal() : 0;
            const optName = input.getAttribute('data-option-name') || input.value;
            const diff = Math.max(0, minSub - currentSub);
            const customMsg = input.getAttribute('data-error-msg') || `此選項「${optName}」需全單消費滿 $${minSub} 元方可選擇（目前金額 $${currentSub} 元，還差 $${diff} 元）`;
            if (typeof customAlert === 'function') {
                customAlert(customMsg);
            } else {
                alert(customMsg);
            }
        }
    }
}, true);

function validateCustomizationThresholds() {
    const currentSubtotal = calculateCurrentFoodSubtotal();
    const violations = [];

    // 1. Radio check
    const checkedRadios = document.querySelectorAll('.custom-panel input[type="radio"]:checked');
    checkedRadios.forEach(radio => {
        const minSub = Number(radio.getAttribute('data-min-subtotal')) || 0;
        if (minSub > 0 && currentSubtotal < minSub) {
            violations.push({
                name: radio.getAttribute('data-option-name') || radio.value,
                minSubtotal: minSub,
                currentSubtotal: currentSubtotal,
                errorMsg: radio.getAttribute('data-error-msg')
            });
        }
    });

    // 2. Checkbox check
    const checkedCheckboxes = document.querySelectorAll('.custom-panel input[type="checkbox"]:checked');
    checkedCheckboxes.forEach(chk => {
        const minSub = Number(chk.getAttribute('data-min-subtotal')) || 0;
        if (minSub > 0 && currentSubtotal < minSub) {
            violations.push({
                name: chk.getAttribute('data-option-name') || chk.value,
                minSubtotal: minSub,
                currentSubtotal: currentSubtotal,
                errorMsg: chk.getAttribute('data-error-msg')
            });
        }
    });

    return violations;
}

function getActiveThresholdViolations() {
    return validateCustomizationThresholds();
}

function updateQty(category, origName, change) {
    if (change > 0 && typeof checkDesktopAuthGuard === 'function' && !checkDesktopAuthGuard()) {
        return;
    }
    const key = category + '_' + origName;
    if (change > 0 && typeof isItemOutOfStock === 'function' && isItemOutOfStock(key)) {
        return;
    }
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (k => ({ origName, displayName: origName })));
    const itemInfo = resolveFn(key);
    if (change > 0 && window.isEditOrderMode && Array.isArray(window.editOrderSoldOutNames)) {
        const dName = itemInfo?.displayName || origName;
        if (window.editOrderSoldOutNames.includes(dName) || window.editOrderSoldOutNames.includes(origName) || window.editOrderSoldOutNames.some(s => s && s.trim() && (dName.includes(s.trim()) || (origName && origName.includes(s.trim()))))) {
            return;
        }
    }
    const targetItem = itemInfo?.targetItem || itemInfo;
    const maxPerOrder = targetItem?.maxPerOrder || targetItem?.max_per_order;
    const cartObj = window.cart || cart;
    const currentQty = cartObj[key] || 0;

    if (change > 0 && maxPerOrder && currentQty >= maxPerOrder) {
        const limitMsg = `【${targetItem.name || origName}】每單限購 ${maxPerOrder} 份`;
        if (typeof customAlert === 'function') {
            customAlert(limitMsg);
        } else {
            alert(limitMsg);
        }
        return;
    }

    const bundleRule = itemInfo?.bundleRule || (itemInfo?.targetItem && itemInfo.targetItem.bundleRule);

    const getItemModsFn = typeof getItemModifiers === 'function' ? getItemModifiers : (window.getItemModifiers || (typeof getCategoryModifiers === 'function' ? getCategoryModifiers : (window.getCategoryModifiers || (() => []))));
    const itemModifiers = getItemModsFn(category, origName);
    const hasModifiers = Array.isArray(itemModifiers) && itemModifiers.length > 0;
    const hasRequiredModifiers = hasModifiers && itemModifiers.some(m => m.isRequired || Number(m.minSelection || 0) > 0);

    const shouldBundleAutoPopup = shouldAutoOpenItemOptions(bundleRule);

    // Intercept bundle item increment: open builder modal only if bundle requires auto-popup
    if (bundleRule && shouldBundleAutoPopup && change > 0) {
        const currentQty = cartObj[key] || 0;
        if (typeof openBundleBuilderModal === 'function') {
            openBundleBuilderModal(category, origName, currentQty);
        }
        return;
    }

    // If adding a portion for a bundle item that does NOT auto-popup, initialize default bundle portion data
    if (bundleRule && !shouldBundleAutoPopup) {
        window.bundleCartData = window.bundleCartData || {};
        window.bundleCartData[key] = window.bundleCartData[key] || [];
        const currentQty = cartObj[key] || 0;
        const targetQty = Math.max(0, currentQty + change);
        if (change > 0 && window.bundleCartData[key].length < targetQty) {
            while (window.bundleCartData[key].length < targetQty) {
                const groups = window.UnifiedOptions && typeof window.UnifiedOptions.restore === 'function'
                    ? window.UnifiedOptions.restore(bundleRule)
                    : [];
                window.bundleCartData[key].push({ portionIndex: window.bundleCartData[key].length, groups });
            }
        }
    }

    // Intercept customize item increment: ONLY open modal automatically if item has REQUIRED modifiers
    if (!bundleRule && hasRequiredModifiers && change > 0) {
        const currentQty = cartObj[key] || 0;
        const openCustFn = typeof openItemCustomizeModal === 'function' ? openItemCustomizeModal : window.openItemCustomizeModal;
        if (typeof openCustFn === 'function') {
            openCustFn(category, origName, currentQty);
            return;
        }
    }

    // If adding a portion for an item with optional-only modifiers, initialize its customization entry
    if (!bundleRule && hasModifiers && !hasRequiredModifiers && change > 0) {
        const cData = window.customizeData || customizeData;
        if (cData) {
            if (!cData[key]) cData[key] = [];
            const defaultSingle = {};
            const defaultMulti = {};
            const defaultDetails = {};
            itemModifiers.forEach(m => {
                const groupKey = m.slug || m.id;
                if (m.selectionType === 'single') {
                    const def = (m.options || []).find(o => o.isDefault && !o.isOutOfStock);
                    if (def) {
                        defaultSingle[groupKey] = def.name;
                        const optIdx = (m.options || []).indexOf(def);
                        const optId = (typeof getUniqueModifierOptionId === 'function') ? getUniqueModifierOptionId(m, def, optIdx) : (def.id || def.name);
                        defaultDetails[optId] = {
                            id: optId,
                            name: def.name,
                            price: Number(def.price || 0),
                            groupId: groupKey,
                            groupName: m.name
                        };
                    }
                } else if (m.selectionType === 'multiple') {
                    (m.options || []).filter(o => o.isDefault && !o.isOutOfStock).forEach((o, optIdx) => {
                        const optId = (typeof getUniqueModifierOptionId === 'function') ? getUniqueModifierOptionId(m, o, optIdx) : (o.id || o.name);
                        defaultMulti[o.name] = true;
                        defaultDetails[optId] = {
                            id: optId,
                            name: o.name,
                            price: Number(o.price || 0),
                            groupId: groupKey,
                            groupName: m.name
                        };
                    });
                }
            });
            cData[key].push({ single: defaultSingle, multiple: defaultMulti, subOptions: {}, selectedDetails: defaultDetails, note: '' });
        }
    }

    // Decrement bundle item: remove the last portion selection
    if (bundleRule && change < 0) {
        const currentQty = cartObj[key] || 0;
        const targetQty = Math.max(0, currentQty + change);
        if (window.bundleCartData && window.bundleCartData[key]) {
            if (targetQty === 0) {
                delete window.bundleCartData[key];
            } else if (window.bundleCartData[key].length > targetQty) {
                window.bundleCartData[key].length = targetQty;
            }
        }
        const cData = window.customizeData || customizeData;
        if (cData && cData[key] && cData[key].length > 0) {
            cData[key].pop();
            if (cData[key].length === 0) {
                delete cData[key];
            }
        }
    }

    // Notes also belong to plain items; keep their portion indices aligned.
    if (!bundleRule && change < 0) {
        const cData = window.customizeData || customizeData;
        if (cData && cData[key] && cData[key].length > 0) {
            cData[key].pop();
            if (cData[key].length === 0) {
                delete cData[key];
            }
        }
    }

    cartObj[key] = (cartObj[key] || 0) + change;
    if (cartObj[key] < 0) cartObj[key] = 0;

    const qtySpan = document.getElementById('qty-' + category + '-' + origName);
    if (qtySpan) {
        qtySpan.innerText = cartObj[key];
        qtySpan.style.color = cartObj[key] > 0 ? 'var(--primary)' : 'inherit';
    }

    const btn = document.getElementById('customize-btn-' + category + '-' + origName);
    if (btn) {
        btn.style.display = (cartObj[key] > 0 && hasModifiers && !bundleRule) ? 'flex' : 'none';
    }

    const bundleBtn = document.getElementById('bundle-edit-btn-' + category + '-' + origName);
    if (bundleBtn) {
        bundleBtn.style.display = (cartObj[key] > 0 && bundleRule) ? 'flex' : 'none';
    }

    if (category === 'combo' && typeof renderComboDrinksInline === 'function') {
        renderComboDrinksInline(origName, cartObj[key]);
    }

    updateTotal();
}

function editCartPortion(category, origName, index) {
    const key = category + '_' + origName;
    const cartObj = window.cart || cart || {};
    if (!Number.isInteger(index) || index < 0 || index >= Number(cartObj[key] || 0)) return;
    if (typeof isItemOutOfStock === 'function' && isItemOutOfStock(key)) return;
    if (typeof checkDesktopAuthGuard === 'function' && !checkDesktopAuthGuard()) return;
    const info = resolveCatalogItem(key);
    const rule = info?.bundleRule || info?.targetItem?.bundleRule;
    if (rule?.groups?.length) {
        window.openBundleBuilderModal(category, origName, index);
    } else {
        window.openItemCustomizeModal(category, origName, index);
    }
}

function removeCartPortion(category, origName, index) {
    const key = category + '_' + origName;
    const cartObj = window.cart || cart || {};
    const quantity = Number(cartObj[key] || 0);
    if (!Number.isInteger(index) || index < 0 || index >= quantity) return;
    for (const state of [window.customizeData, window.bundleCartData]) {
        if (!Array.isArray(state?.[key])) continue;
        state[key].splice(index, 1);
        if (quantity === 1 || state[key].length === 0) delete state[key];
    }
    window.bundleCartData?.[key]?.forEach((portion, portionIndex) => {
        if (portion) portion.portionIndex = portionIndex;
    });
    const drinks = window.comboDrinkData;
    if (Array.isArray(drinks?.[origName])) {
        drinks[origName].splice(index, 1);
        if (quantity === 1 || drinks[origName].length === 0) delete drinks[origName];
        if (typeof renderComboDrinksInline === 'function') renderComboDrinksInline(origName);
    }
    cartObj[key] = quantity - 1;
    const qty = document.getElementById('qty-' + category + '-' + origName);
    if (qty) {
        qty.textContent = String(cartObj[key]);
        qty.style.color = cartObj[key] > 0 ? 'var(--primary)' : 'inherit';
    }
    if (cartObj[key] === 0) {
        for (const prefix of ['customize-btn-', 'bundle-edit-btn-']) {
            const button = document.getElementById(prefix + category + '-' + origName);
            if (button) button.style.display = 'none';
        }
    }
    updateTotal();
}

function calculateCategoryBundleSubtotal(rule, items) {
    const regularTotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

    if (!rule || !rule.bundle_qty || rule.bundle_qty <= 0 || !rule.bundle_price || totalQty < rule.bundle_qty) {
        return {
            categoryTotal: regularTotal,
            regularTotal: regularTotal,
            discountAmount: 0,
            bundleCount: 0,
            remainderCount: totalQty
        };
    }

    const bundleCount = Math.floor(totalQty / rule.bundle_qty);
    const remainderCount = totalQty % rule.bundle_qty;

    const flattenedPrices = [];
    items.forEach(item => {
        for (let i = 0; i < item.qty; i++) {
            flattenedPrices.push(item.price);
        }
    });
    flattenedPrices.sort((a, b) => b - a);

    let categoryTotal = bundleCount * rule.bundle_price;
    const remainderPrices = flattenedPrices.slice(bundleCount * rule.bundle_qty);
    categoryTotal += remainderPrices.reduce((sum, p) => sum + p, 0);

    const discountAmount = Math.max(0, regularTotal - categoryTotal);

    return {
        categoryTotal,
        regularTotal,
        discountAmount,
        bundleCount,
        remainderCount
    };
}

function updateTotal() {
    window.LinePayCheckout?.onCartChange?.();
    if (typeof updateCustomizationThresholdUI === 'function') {
        updateCustomizationThresholdUI();
    }
    let total = 0;
    let totalQty = 0;
    let summaryHTML = '';
    const zhNumbers = ['第一份', '第二份', '第三份', '第四份', '第五份', '第六份', '第七份', '第八份', '第九份', '第十份'];
    const cartIsVietnamese = (typeof currentLocale !== 'undefined' ? currentLocale : document.documentElement?.lang) === 'vi';
    const escapeCartText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

    const bData = window.bootstrapData || bootstrapData;
    const cartObj = window.cart || cart || {};
    const cData = window.customizeData || customizeData || {};
    const cDrinkData = window.comboDrinkData || comboDrinkData || {};

    // 1. Tóm tắt 口味與客製化設定
    let customSummaries = [];
    if (bData?.customizations && bData.customizations.length > 0) {
        bData.customizations.forEach(group => {
            const inputName = `opt-${group.key}`;
            if (group.type === 'radio') {
                const checkedRadio = document.querySelector(`input[name="${inputName}"]:checked`);
                if (checkedRadio) {
                    const val = checkedRadio.value;
                    let subDetails = '';
                    const activeSubContainer = document.querySelector(`.sub-option-container[data-parent-flavor="${val}"]`);
                    if (activeSubContainer) {
                        let subOpts = [];
                        activeSubContainer.querySelectorAll('input.sub-opt-chk:checked').forEach(chk => {
                            subOpts.push(chk.value);
                        });
                        if (subOpts.length > 0) {
                            subDetails = ` (${subOpts.join('、')})`;
                        }
                    }
                    const p = Number(checkedRadio.getAttribute('data-price')) || 0;
                    const priceSuffix = p > 0 ? ` (+$${p})` : '';
                    const groupTitle = (group.title || '').replace(/^✦\s*/, '').replace(/選擇|調整/g, '').trim();
                    customSummaries.push(`<div><b style="color:#1e293b;">${groupTitle || '口味'}：</b>${val}${priceSuffix}${subDetails}</div>`);
                }
            } else if (group.type === 'checkbox') {
                let selectedChecks = [];
                document.querySelectorAll(`input[name="${inputName}"]:checked`).forEach(chk => {
                    const p = Number(chk.getAttribute('data-price')) || 0;
                    if (p === 0) {
                        selectedChecks.push(chk.value);
                    }
                });
                if (selectedChecks.length > 0) {
                    const groupTitle = (group.title || '').replace(/^✦\s*/, '').replace(/選擇|調整/g, '').trim();
                    customSummaries.push(`<div><b style="color:#1e293b;">${groupTitle || '配料'}：</b>${selectedChecks.join('、')}</div>`);
                }
            }
        });
    }

    if (customSummaries.length > 0) {
        summaryHTML += `
            <div style="margin-bottom: 14px; padding: 10px 14px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; font-size: 13.5px; color: #475569; line-height: 1.6;">
                <div style="font-weight: 800; color: #0f172a; margin-bottom: 4px; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                    <span>客製化設定</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px;">${customSummaries.join('')}</div>
            </div>
            <div style="border-bottom: 1px dashed #e2e8f0; margin-bottom: 12px;"></div>
        `;
    }

    const priceMap = {};
    const categoryMetaMap = {};
    if (bData?.catalog) {
        bData.catalog.forEach(cat => {
            categoryMetaMap[cat.slug] = cat;
            cat.items.forEach(it => { priceMap[`${cat.slug}_${it.name}`] = it.price; });
        });
    }
    if (typeof buildModifierPriceMap === 'function' && (!window.modPriceMap || Object.keys(window.modPriceMap).length === 0)) {
        buildModifierPriceMap(bData);
    }
    const getPrice = window.getModifierPrice || (typeof getModifierPrice === 'function' ? getModifierPrice : (opt => {
        if (!opt) return 0;
        const m = window.modPriceMap || {};
        return m[opt] || 0;
    }));

    // Group active cart items by category
    const itemsByCategory = {};
    if (bData?.catalog) {
        bData.catalog.forEach(cat => {
            itemsByCategory[cat.slug] = [];
        });
    }

    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (k => ({ origName: k, displayName: k })));

    for (let key in cartObj) {
        if (cartObj[key] > 0) {
            const itemInfo = resolveFn(key);
            const { catSlug, itemName } = parseCartKey(key);
            const qty = cartObj[key];
            const dName = itemInfo.displayName || itemName;

            const isOutOfStock = (
                (typeof isItemOutOfStock === 'function' && isItemOutOfStock(key)) ||
                (window.isEditOrderMode && Array.isArray(window.editOrderSoldOutNames) && (
                    window.editOrderSoldOutNames.includes(dName) ||
                    window.editOrderSoldOutNames.includes(itemName) ||
                    window.editOrderSoldOutNames.some(s => s && s.trim() && (dName.includes(s.trim()) || (itemName && itemName.includes(s.trim()))))
                ))
            );

            if (!isOutOfStock) {
                totalQty += qty;
            }

            const itemBasePrice = itemInfo.basePrice || priceMap[key] || 0;
            if (!itemsByCategory[catSlug]) itemsByCategory[catSlug] = [];
            itemsByCategory[catSlug].push({
                key,
                itemInfo,
                catSlug,
                itemName,
                displayName: dName,
                qty,
                price: itemBasePrice,
                isOutOfStock
            });
        }
    }

    let totalCategoryDiscounts = 0;

    for (let slug in itemsByCategory) {
        const catItems = itemsByCategory[slug];
        if (catItems.length === 0) continue;

        const catMeta = categoryMetaMap[slug] || {};
        const catRule = catMeta.pricingRules;
        const activeCatItems = catItems.filter(it => !it.isOutOfStock);
        const bundleRes = calculateCategoryBundleSubtotal(catRule, activeCatItems);

        catItems.forEach(it => {
            const { key, catSlug, itemName, displayName, qty, price, isOutOfStock } = it;
            let itemModifiersTotal = 0;
            let portionsHTML = '';
            const portionDetails = [];
            const bundleRule = it.itemInfo?.bundleRule || it.itemInfo?.targetItem?.bundleRule;
            const hasBundleGroups = Boolean(bundleRule?.groups?.length);

            if (cData[key]) {
                cData[key].slice(0, qty).forEach((c, i) => {
                    if (!c) return;
                    const parts = [];
                    if (c.selectedDetails && Object.keys(c.selectedDetails).length > 0) {
                        Object.values(c.selectedDetails).forEach(detail => {
                            if (!detail) return;
                            const sub = detail.subOption || c.subOptions?.[detail.id] || c.subOptions?.[detail.name];
                            const price = Number(detail.price || 0) + Number(sub?.price || 0);
                            const label = `${detail.name || detail.id}${sub ? ` (${sub.name})` : ''}`;
                            parts.push(price > 0 ? `${label} (+$${price})` : label);
                        });
                    } else if (c.single) {
                        for (let s in c.single) {
                            const rawVal = c.single[s];
                            const val = (typeof resolveOptionDisplayName === 'function') ? resolveOptionDisplayName(rawVal) : rawVal;
                            if (val && val !== '不辣' && val !== '不需要') {
                                const addP = getPrice(val) || getPrice(rawVal);
                                const label = addP > 0 ? `${val} (+$${addP})` : val;
                                if (!parts.includes(label)) parts.push(label);
                            }
                        }
                    }
                    if ((!c.selectedDetails || Object.keys(c.selectedDetails).length === 0) && c.multiple) {
                        for (let topName in c.multiple) {
                            if (c.multiple[topName]) {
                                const topPrice = getPrice(topName);
                                if (topPrice > 0) {
                                    parts.push(`${topName} (+$${topPrice})`);
                                } else {
                                    parts.push(topName);
                                }
                            }
                        }
                    }
                    if (c.note && c.note.trim() !== '') parts.push(c.note.trim());
                    if (!isOutOfStock && typeof calculatePortionExtra === 'function') {
                        itemModifiersTotal += calculatePortionExtra(key, c);
                    } else if (!isOutOfStock) {
                        Object.values(c.single || {}).forEach(value => { if (value) itemModifiersTotal += getPrice(value); });
                        Object.entries(c.multiple || {}).forEach(([value, selected]) => { if (selected) itemModifiersTotal += getPrice(value); });
                        Object.values(c.subOptions || {}).forEach(sub => { itemModifiersTotal += Number(sub?.price || 0); });
                    }

                    if (!hasBundleGroups) portionDetails[i] = parts.join(', ');
                });
            }

            let bundleExtra = 0;
            if (hasBundleGroups && window.bundleCartData && window.bundleCartData[key] && window.bundlePortionExtra) {
                bundleExtra = window.bundleCartData[key].slice(0, qty).reduce((sum, portion) => sum + (window.bundlePortionExtra(portion) || 0), 0);
            }
            if (!isOutOfStock) itemModifiersTotal += bundleExtra;

            let lineTotal = (qty * price) + itemModifiersTotal;

            if (isOutOfStock) {
                summaryHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; opacity:0.6; text-decoration:line-through; color:#94a3b8;">
                        <div style="font-weight:700;">
                            <span>${qty}x ${displayName}</span>
                            <span style="display:inline-block; margin-left:6px; font-size:11px; font-weight:700; background:#fee2e2; color:#dc2626; padding:1px 6px; border-radius:4px; text-decoration:none; vertical-align:middle;">已移除</span>
                        </div>
                        <div style="font-weight:700; color:#94a3b8;">$${lineTotal}</div>
                    </div>
                `;
            } else {
                summaryHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div style="font-weight:800; color: #111; display:flex; align-items:center; flex-wrap:wrap;">
                            <span>${qty}x ${displayName}</span>
                        </div>
                        <div style="font-weight:700;">$${lineTotal}</div>
                    </div>
                `;

                if (hasBundleGroups && window.bundleCartData && window.bundleCartData[key]) {
                    const portions = window.bundleCartData[key].slice(0, qty);
                    portions.forEach((p, pIdx) => {
                        const bundleParts = [];
                        (p.groups || []).forEach(g => {
                            const itemsStr = (g.items || []).map(item => `${item.name} x${item.quantity}${(item.modifiers || []).length ? ` (${item.modifiers.map(mod => mod.name).join('、')})` : ''}`).join('、');
                            if (itemsStr) bundleParts.push(`${g.groupName || '配菜'}：${itemsStr}`);
                        });

                        // Check customize selections for this portion
                        const customParts = [];
                        if (cData[key] && cData[key][pIdx]) {
                            const c = cData[key][pIdx];
                            if (c.single) {
                                for (let s in c.single) {
                                    const rawVal = c.single[s];
                                    const val = (typeof resolveOptionDisplayName === 'function') ? resolveOptionDisplayName(rawVal) : rawVal;
                                    if (val && val !== '不辣' && val !== '不需要') {
                                        const addP = getPrice(val) || getPrice(rawVal);
                                        const label = addP > 0 ? `${val} (+$${addP})` : val;
                                        if (!customParts.includes(label)) customParts.push(label);
                                    }
                                }
                            }
                            if (c.multiple) {
                                for (let topName in c.multiple) {
                                    if (c.multiple[topName]) {
                                        const topPrice = getPrice(topName);
                                        customParts.push(topPrice > 0 ? `${topName} (+$${topPrice})` : topName);
                                    }
                                }
                            }
                            if (c.note && c.note.trim() !== '') {
                                customParts.push(`備註: ${c.note.trim()}`);
                            }
                        }

                        const detailItems = [];
                        if (bundleParts.length > 0) detailItems.push(bundleParts.join('、'));
                        if (customParts.length > 0) detailItems.push(customParts.join('、'));
                        portionDetails[pIdx] = detailItems.join(' ｜ ');
                    });
                }

                if (!bootstrapData?.unifiedMenu && catSlug === 'combo') {
                    let drinks = cDrinkData[itemName] || [];
                    let drinkCounts = {};
                    drinks.slice(0, qty).forEach(d => { drinkCounts[d] = (drinkCounts[d] || 0) + 1; });
                    let drinkStr = Object.entries(drinkCounts).map(([n, c]) => `${n} x${c}`).join('、');
                    if (drinkStr) summaryHTML += `<div style="font-size:13px; color:#6b7280; margin-left:10px; margin-bottom:6px;">↳ 飲料：${drinkStr}</div>`;
                }

                for (let index = 0; index < qty; index++) {
                    const label = cartIsVietnamese ? `Phần ${index + 1}` : (zhNumbers[index] || `第 ${index + 1} 份`);
                    const detail = portionDetails[index];
                    const contextLabel = escapeCartText(`${displayName}, ${label}`);
                    portionsHTML += `<div class="cart-portion-row">
                        <span class="cart-portion-detail">${label}${detail ? ': ' + escapeCartText(detail) : ''}</span>
                        <span class="cart-portion-actions" data-category="${escapeCartText(catSlug)}" data-item="${escapeCartText(itemName)}" data-portion="${index}">
                            <button type="button" class="cart-portion-action" aria-label="${cartIsVietnamese ? 'Điều chỉnh' : '調整'} ${contextLabel}" onclick="editCartPortion(this.parentElement.dataset.category, this.parentElement.dataset.item, Number(this.parentElement.dataset.portion))">${cartIsVietnamese ? 'Điều chỉnh' : '調整'}</button>
                            <button type="button" class="cart-portion-action cart-portion-action--remove" aria-label="${cartIsVietnamese ? 'Xóa' : '移除'} ${contextLabel}" onclick="removeCartPortion(this.parentElement.dataset.category, this.parentElement.dataset.item, Number(this.parentElement.dataset.portion))">${cartIsVietnamese ? 'Xóa' : '移除'}</button>
                        </span>
                    </div>`;
                }
                summaryHTML += portionsHTML;
                total += lineTotal;
            }
        });

        if (bundleRes.discountAmount > 0) {
            totalCategoryDiscounts += bundleRes.discountAmount;
            const cleanCatName = (catMeta.name || '').split(' ')[0] || '組合';
            summaryHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin: 2px 0 10px 0; color:#059669; font-size:13px; font-weight:700; background:#ecfdf5; padding:6px 10px; border-radius:8px; border:1px dashed #a7f3d0;">
                    <div style="display:flex; align-items:center; gap:5px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                        <span>${cleanCatName} 組合特惠 (${bundleRes.bundleCount}組，已省 $${bundleRes.discountAmount})</span>
                    </div>
                    <div>-$${bundleRes.discountAmount}</div>
                </div>
            `;
        }

        summaryHTML += `<div style="border-bottom: 1px dashed #eee; margin-bottom: 8px;"></div>`;
    }

    // Render removed sold-out items from previous order with line-through and '已移除' tag
    if (window.isEditOrderMode && Array.isArray(window.editOrderRemovedItems) && window.editOrderRemovedItems.length > 0) {
        window.editOrderRemovedItems.forEach(rem => {
            const rQty = Number(rem.quantity) || 1;
            const rPrice = Number(rem.subtotal) || ((Number(rem.price) || 0) * rQty);
            const rName = rem.displayName || rem.name || '';
            summaryHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; opacity:0.6; text-decoration:line-through; color:#94a3b8;">
                    <div style="font-weight:700;">
                        <span>${rQty}x ${(typeof escapeHtml === 'function' ? escapeHtml(rName) : rName)}</span>
                        <span style="display:inline-block; margin-left:6px; font-size:11px; font-weight:700; background:#fee2e2; color:#dc2626; padding:1px 6px; border-radius:4px; text-decoration:none; vertical-align:middle;">已移除</span>
                    </div>
                    <div style="font-weight:700; color:#94a3b8;">$${rPrice}</div>
                </div>
            `;
        });
        summaryHTML += `<div style="border-bottom: 1px dashed #eee; margin-bottom: 8px;"></div>`;
    }

    total -= totalCategoryDiscounts;

    // Add Global Customization Addons if selected (radio & checkbox)
    let addonsTotal = 0;
    const checkedAddons = document.querySelectorAll('.custom-panel input[data-price]:checked');
    checkedAddons.forEach(chk => {
        const p = Number(chk.getAttribute('data-price')) || 0;
        if (p > 0) {
            addonsTotal += p;
            const rawGroupTitle = chk.getAttribute('data-group-title') || '';
            const cleanGroup = rawGroupTitle.replace(/^✦\s*/, '').replace(/選擇|調整/g, '').trim();
            const labelText = cleanGroup ? `${cleanGroup} (${chk.value})` : chk.value;
            summaryHTML += `
                <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#059669; font-size:13.5px; font-weight:700;">
                    <div>+ 加購：${labelText}</div>
                    <div>+$${p}</div>
                </div>
            `;
        }
    });
    total += addonsTotal;

    // Sold out items are automatically crossed out, tagged 已移除, and deducted from total
    window.editOrderHasSoldOutRemaining = false;

    const totalEl = document.getElementById('total-price');
    if (totalEl) totalEl.innerText = total;

    const desktopTotalEl = document.getElementById('desktop-total-price');
    if (desktopTotalEl) desktopTotalEl.innerText = total;

    const summaryContainer = document.getElementById('cart-summary');
    if (summaryContainer) {
        const hasRemovedItems = window.isEditOrderMode && Array.isArray(window.editOrderRemovedItems) && window.editOrderRemovedItems.length > 0;
        if (totalQty === 0 && addonsTotal === 0 && !hasRemovedItems) {
            summaryContainer.innerHTML = '<div style="text-align:center; color:#9ca3af;">(目前沒有已選商品)</div>';
        } else {
            const violations = (typeof getActiveThresholdViolations === 'function') ? getActiveThresholdViolations() : [];
            if (violations.length > 0) {
                const vList = violations.map(v => `「${v.name}」(需滿$${v.minSubtotal})`).join('、');
                const warningHTML = `
                    <div class="threshold-warning-banner">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        <div>口味條件未達門檻：${vList}，目前餐點金額 $${violations[0].currentSubtotal} 元，下單前請補足金額或修改口味。</div>
                    </div>
                `;
                summaryHTML = warningHTML + summaryHTML;
            }

            // Render Price Delta Box in Edit Order Mode
            if (window.isEditOrderMode) {
                const origTot = window.editOrderOriginalTotal || 0;
                const diff = total - origTot;
                let diffText = '無差額 ($0)';
                let diffColor = '#64748b';
                if (diff > 0) {
                    diffText = `需補差額 +$${diff}`;
                    diffColor = '#dc2626';
                } else if (diff < 0) {
                    diffText = `退還差額 -$${Math.abs(diff)}`;
                    diffColor = '#059669';
                }
                const deltaHTML = `
                    <div class="edit-order-delta-box">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-weight:800;">
                            <span>原金額 $${origTot} → 新總計 $${total}</span>
                            <span style="color:${diffColor}; font-weight:900;">${diffText}</span>
                        </div>
                    </div>
                `;
                summaryHTML = deltaHTML + summaryHTML;
            }

            if (totalQty === 0 && addonsTotal === 0 && hasRemovedItems) {
                summaryHTML += '<div style="text-align:center; color:#dc2626; font-weight:700; font-size:13px; margin:8px 0;">(購物車內餐點已全數售完，請由上方菜單挑選更換餐點)</div>';
            }

            summaryHTML += `<div style="display:flex; justify-content:space-between; font-weight:900; margin-top:12px; font-size:16px;">
                <div>總計</div><div style="color:var(--primary);">$${total}</div>
            </div>`;
            summaryContainer.innerHTML = summaryHTML;
        }
    }

    const badge = document.getElementById('cart-badge');
    if (badge) {
        badge.innerText = totalQty;
        badge.style.display = totalQty > 0 ? 'block' : 'none';
    }

    if (typeof updateFooterButtonState === 'function') updateFooterButtonState();
    return total;
}

// Window Public Bindings
window.parseCartKey = parseCartKey;
window.calculateCurrentFoodSubtotal = calculateCurrentFoodSubtotal;
window.updateCustomizationThresholdUI = updateCustomizationThresholdUI;
window.validateCustomizationThresholds = validateCustomizationThresholds;
window.getActiveThresholdViolations = getActiveThresholdViolations;
window.updateQty = updateQty;
window.calculateCategoryBundleSubtotal = calculateCategoryBundleSubtotal;
window.updateTotal = updateTotal;
