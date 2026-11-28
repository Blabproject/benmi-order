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
    if (window.PricingWasm?.isReady && typeof window.PricingWasm.calculateCart === 'function') {
        const wasmCart = window.PricingWasm.calculateCart();
        if (wasmCart && typeof wasmCart.total === 'number') {
            return Math.max(0, wasmCart.subtotal - wasmCart.discount);
        }
    }

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

            // Auto-promote: If this free ($0) option with threshold is now eligible, and user currently has a paid fallback option (no threshold) checked in this same group
            if (input.type === 'radio' && !input.checked && (Number(input.getAttribute('data-price')) || 0) === 0) {
                const groupRadios = document.querySelectorAll(`input[name="${input.name}"]`);
                const currentChecked = Array.from(groupRadios).find(r => r.checked);
                const currentMinSub = Number(currentChecked?.getAttribute('data-min-subtotal')) || 0;
                if (currentChecked && (Number(currentChecked.getAttribute('data-price')) || 0) > 0 && currentMinSub === 0) {
                    input.checked = true;
                    hasStateChanged = true;
                }
            }
        }
    });

    // An eligible free threshold option replaces only paid fallback choices (without threshold) in its group.
    // Paid upgrade options with their own threshold (e.g. '多 +$20' with min-subtotal $100) must remain enabled.
    radioGroups.forEach(radios => {
        const hasFreeReplacement = radios.some(radio =>
            Number(radio.getAttribute('data-min-subtotal')) > 0 &&
            (Number(radio.getAttribute('data-price')) || 0) === 0 &&
            !radio.disabled && !isOutOfStock(radio)
        );
        if (!hasFreeReplacement) return;
        radios.forEach(radio => {
            const radioMinSub = Number(radio.getAttribute('data-min-subtotal')) || 0;
            if (radioMinSub === 0 && Number(radio.getAttribute('data-price')) > 0 && !radio.disabled && !isOutOfStock(radio)) {
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
            const optName = input.getAttribute('data-option-display-name') || input.getAttribute('data-option-name') || input.value;
            const diff = Math.max(0, minSub - currentSub);
            const fallbackMsg = typeof ct === 'function'
                ? ct('threshold_opt_alert', { name: optName, min: minSub, current: currentSub, diff })
                : `此選項「${optName}」需全單消費滿 $${minSub} 元方可選擇（目前金額 $${currentSub} 元，還差 $${diff} 元）`;
            const customMsg = input.getAttribute('data-error-msg') || fallbackMsg;
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
                displayName: radio.getAttribute('data-option-display-name') || radio.getAttribute('data-option-name') || radio.value,
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
                displayName: chk.getAttribute('data-option-display-name') || chk.getAttribute('data-option-name') || chk.value,
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

// --- PURCHASE PREREQUISITE RULES & GUIDED SHEET ---
var _prereqGuideState = {
    catSlug: '',
    itemName: '',
    anchors: [],
    selectedAnchorIdx: 0
};

function _prLoc(entity, field, fallback) {
    if (typeof locText === 'function' && entity) return locText(entity, field, fallback);
    return fallback ?? (entity ? entity[field] : '') ?? '';
}

function _prT(key, vars, zhFallback, viFallback) {
    if (typeof ct === 'function') {
        const res = ct(key, vars);
        if (res && res !== key) return res;
    }
    const lang = (typeof window !== 'undefined' && (window.currentClientLocale || window.currentLocale))
        || (typeof document !== 'undefined' && document.documentElement ? document.documentElement.lang : 'zh-TW');
    let tpl = (lang === 'vi' && viFallback !== undefined) ? viFallback : zhFallback;
    if (vars && tpl) {
        for (const [k, v] of Object.entries(vars)) {
            tpl = tpl.split(`{${k}}`).join(String(v ?? ''));
        }
    }
    return tpl;
}

function _prEsc(val) {
    return String(val ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function resolveEffectiveItemPrerequisiteRule(catObj, itemObj) {
    if (!itemObj && !catObj) return null;
    if (itemObj && itemObj.prerequisiteMode === 'none') return null;
    if (itemObj && itemObj.prerequisiteRule && itemObj.prerequisiteRule.mode === 'require_any') {
        return itemObj.prerequisiteRule;
    }
    if (catObj && catObj.prerequisiteRule && catObj.prerequisiteRule.mode === 'require_any') {
        return catObj.prerequisiteRule;
    }
    return null;
}

function evaluatePrerequisiteRule(rule, excludeItemId, cartOverride) {
    if (!rule || rule.mode !== 'require_any') {
        return { required: false, unlocked: true, qualifyingQty: 0, minParentQty: 0, requiredLabel: '', qualifyingItems: [], availableAnchors: [] };
    }
    const bData = window.bootstrapData || bootstrapData;
    const cartObj = cartOverride || window.cart || cart || {};
    const reqItemIds = Array.isArray(rule.requiredItemIds) ? rule.requiredItemIds.map(String) : [];
    const reqCatIds = Array.isArray(rule.requiredCategoryIds) ? rule.requiredCategoryIds.map(String) : [];
    const reqItemSet = new Set(reqItemIds);
    const reqCatSet = new Set(reqCatIds);
    const minParentQty = Math.max(1, Number(rule.minParentQty || 1));

    const qualifyingItems = [];
    const availableAnchors = [];
    const requiredNames = [];
    const itemById = new Map();

    if (bData && Array.isArray(bData.catalog)) {
        for (const cat of bData.catalog) {
            const catIdStr = String(cat.id || '');
            const isReqCat = reqCatSet.has(catIdStr) || reqCatSet.has(String(cat.slug || ''));
            if (isReqCat) {
                const cName = _prLoc(cat, 'name', cat.name || cat.slug);
                if (cName && !requiredNames.includes(cName)) requiredNames.push(cName);
            }
            for (const it of (cat.items || [])) {
                const itId = String(it.id || '');
                if (itId) itemById.set(itId, { cat, item: it });
                if (excludeItemId && itId === String(excludeItemId)) continue;
                const isReqItem = itId && reqItemSet.has(itId);
                if (isReqItem) {
                    const iName = _prLoc(it, 'name', it.name);
                    if (iName && !requiredNames.includes(iName)) requiredNames.push(iName);
                }
                if (isReqItem || isReqCat) {
                    if (!window.isStaffOrderMode && (it.staffOnly || it.staff_only)) continue;
                    const schedAvail = (typeof getItemScheduleState === 'function')
                        ? getItemScheduleState(cat, it).available
                        : true;
                    const isUnavailable = Boolean(it.isOutOfStock || !schedAvail);
                    const entry = {
                        catSlug: cat.slug,
                        catId: catIdStr,
                        catName: _prLoc(cat, 'name', cat.name || ''),
                        item: it,
                        itemId: itId,
                        name: it.name,
                        displayName: _prLoc(it, 'name', it.name),
                        price: Number(it.price || 0),
                        isUnavailable
                    };
                    qualifyingItems.push(entry);
                    if (!isUnavailable) availableAnchors.push(entry);
                }
            }
        }
    }

    let qualifyingQty = 0;
    const countedProdQty = new Map();
    const addProdQty = (prodId, catId, qty) => {
        if (!qty || qty <= 0) return;
        if (excludeItemId && prodId && String(prodId) === String(excludeItemId)) return;
        if ((prodId && reqItemSet.has(String(prodId))) || (catId && reqCatSet.has(String(catId)))) {
            const k = String(prodId || `${catId}:${Math.random()}`);
            countedProdQty.set(k, (countedProdQty.get(k) || 0) + qty);
        }
    };

    // 1. Current cart items
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : window.resolveCatalogItem;
    for (const [k, rawQ] of Object.entries(cartObj)) {
        const q = Number(rawQ || 0);
        if (q <= 0) continue;
        if (typeof isItemOutOfStock === 'function' && isItemOutOfStock(k)) continue;
        const info = resolveFn ? resolveFn(k) : null;
        const tItem = info?.targetItem;
        const tCat = info?.targetCat;
        if (!tItem) continue;
        if (window.isEditOrderMode && Array.isArray(window.editOrderSoldOutNames)) {
            const dName = info.displayName || tItem.name;
            if (window.editOrderSoldOutNames.includes(dName) || window.editOrderSoldOutNames.includes(tItem.name)) continue;
        }
        addProdQty(tItem.id, tCat?.id, q);
    }

    // 2. Existing parent order items in Append Mode or Staff Table Append Mode
    const isAppendActive = Boolean(
        (window.isAppendMode && window.parentOrderKey) ||
        (window.isStaffOrderMode && Array.isArray(window.appendParentOrderItems) && window.appendParentOrderItems.length > 0)
    );
    if (isAppendActive) {
        const priorItems = Array.isArray(window.appendParentOrderItems) ? window.appendParentOrderItems : [];
        for (const pLine of priorItems) {
            const pq = Number(pLine?.quantity || 0);
            if (pq <= 0) continue;
            const pid = String(pLine.itemId || pLine.item_id || '');
            if (pid && itemById.has(pid)) {
                const matched = itemById.get(pid);
                addProdQty(matched.item.id, matched.cat.id, pq);
            } else if (pLine?.name && bData?.catalog) {
                const cleanName = String(pLine.name).replace(/\s+(L|S|M)$/i, '').replace(/^\[[^\]]+\]\s*/, '').trim();
                for (const c of bData.catalog) {
                    const found = (c.items || []).find(it => it.name === cleanName);
                    if (found) {
                        addProdQty(found.id, c.id, pq);
                        break;
                    }
                }
            }
        }
        if (typeof window.appendParentLegacyText === 'string' && window.appendParentLegacyText.trim()) {
            const rawTxt = window.appendParentLegacyText;
            for (const qItem of qualifyingItems) {
                if (qItem.name && rawTxt.includes(qItem.name) && !countedProdQty.has(qItem.itemId)) {
                    countedProdQty.set(qItem.itemId, 1);
                }
            }
        }
    }

    for (const v of countedProdQty.values()) qualifyingQty += v;
    const requiredLabel = requiredNames.join(' / ');

    return {
        required: true,
        unlocked: qualifyingQty >= minParentQty,
        qualifyingQty,
        minParentQty,
        rule,
        requiredLabel,
        qualifyingItems,
        availableAnchors
    };
}

function evaluateCategoryPrerequisite(catObj, cartOverride) {
    if (!catObj || !catObj.prerequisiteRule || catObj.prerequisiteRule.mode !== 'require_any') {
        return { required: false, unlocked: true, requiredLabel: '' };
    }
    return evaluatePrerequisiteRule(catObj.prerequisiteRule, null, cartOverride);
}

function evaluateItemPrerequisite(catSlug, itemName, cartOverride) {
    const bData = window.bootstrapData || bootstrapData;
    if (!bData || !Array.isArray(bData.catalog)) {
        return { required: false, unlocked: true };
    }
    const catObj = bData.catalog.find(c => c.slug === catSlug || c.id === catSlug) || null;
    const itemObj = catObj?.items?.find(it => it.name === itemName || it.id === itemName) || null;
    const rule = resolveEffectiveItemPrerequisiteRule(catObj, itemObj);
    if (!rule) return { required: false, unlocked: true };
    return evaluatePrerequisiteRule(rule, itemObj?.id || null, cartOverride);
}

function findDependentCategoriesForItem(itemId) {
    const bData = window.bootstrapData || bootstrapData;
    if (!itemId || !bData || !Array.isArray(bData.catalog)) return [];
    return bData.catalog.filter(cat =>
        cat?.prerequisiteRule?.mode === 'require_any' &&
        Array.isArray(cat.prerequisiteRule.requiredItemIds) &&
        cat.prerequisiteRule.requiredItemIds.includes(String(itemId))
    );
}

function updatePrerequisiteUI() {
    const bData = window.bootstrapData || bootstrapData;
    const cartObj = window.cart || cart || {};
    if (!bData || !Array.isArray(bData.catalog)) return;

    for (const cat of bData.catalog) {
        const badgeEl = typeof document !== 'undefined' ? document.getElementById(`prereq-cat-badge-${cat.slug}`) : null;
        if (badgeEl && cat.prerequisiteRule?.mode === 'require_any') {
            const catState = evaluateCategoryPrerequisite(cat, cartObj);
            badgeEl.classList.toggle('is-locked', !catState.unlocked);
            badgeEl.classList.toggle('is-unlocked', catState.unlocked);
            badgeEl.textContent = catState.unlocked
                ? _prT('prereq_cat_unlocked', null, '已可加點', 'Đã mở gọi kèm')
                : _prT('prereq_cat_locked', { target: catState.requiredLabel }, `需搭配：${catState.requiredLabel}`, `Cần gọi kèm: ${catState.requiredLabel}`);
        }

        for (const item of (cat.items || [])) {
            const itemState = evaluateItemPrerequisite(cat.slug, item.name, cartObj);
            const plusBtn = typeof document !== 'undefined' ? document.getElementById(`btn-plus-${cat.slug}-${item.name}`) : null;
            if (plusBtn) {
                plusBtn.classList.toggle('prereq-locked', Boolean(itemState.required && !itemState.unlocked));
            }
            const itemHint = typeof document !== 'undefined' ? document.getElementById(`prereq-item-hint-${cat.slug}-${item.name}`) : null;
            if (itemHint && itemState.required) {
                itemHint.classList.toggle('is-unlocked', itemState.unlocked);
                itemHint.textContent = itemState.unlocked
                    ? _prT('prereq_cat_unlocked', null, '已可加點', 'Đã mở gọi kèm')
                    : _prT('prereq_cat_locked', { target: itemState.requiredLabel }, `需搭配：${itemState.requiredLabel}`, `Cần gọi kèm: ${itemState.requiredLabel}`);
            }
            const jumpBtn = typeof document !== 'undefined' ? document.getElementById(`prereq-jump-btn-${cat.slug}-${item.name}`) : null;
            if (jumpBtn) {
                const qty = Number(cartObj[`${cat.slug}_${item.name}`] || 0);
                jumpBtn.style.display = qty > 0 ? 'flex' : 'none';
            }
        }
    }

    if (window.isStaffOrderMode && window.StaffOrder && typeof window.StaffOrder.refreshPrerequisiteState === 'function') {
        window.StaffOrder.refreshPrerequisiteState();
    }
}

function flushPendingPrerequisiteAddon() {
    const pending = window.__pendingPrerequisiteAddon;
    if (!pending || window.__flushingPrerequisiteAddon) return;
    const state = evaluateItemPrerequisite(pending.catSlug, pending.itemName);
    if (!state.unlocked) return;
    window.__pendingPrerequisiteAddon = null;
    window.__flushingPrerequisiteAddon = true;
    try {
        updateQty(pending.catSlug, pending.itemName, 1);
    } finally {
        window.__flushingPrerequisiteAddon = false;
    }
}

function _anchorNeedsAutoPopup(anchor) {
    if (!anchor || !anchor.item) return false;
    const rule = anchor.item.bundleRule;
    if (rule && typeof shouldAutoOpenItemOptions === 'function' && shouldAutoOpenItemOptions(rule)) return true;
    const getItemModsFn = typeof getItemModifiers === 'function' ? getItemModifiers : window.getItemModifiers;
    if (typeof getItemModsFn === 'function') {
        const mods = getItemModsFn(anchor.catSlug, anchor.name);
        if (Array.isArray(mods) && mods.some(m => m.isRequired || Number(m.minSelection || 0) > 0)) return true;
    }
    return false;
}

function renderPrerequisiteSheetAnchors() {
    const listEl = typeof document !== 'undefined' ? document.getElementById('prereq-anchor-list') : null;
    const addBothBtn = typeof document !== 'undefined' ? document.getElementById('prereq-sheet-add-both-btn') : null;
    if (!listEl || !addBothBtn) return;

    const anchors = _prereqGuideState.anchors || [];
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : window.resolveCatalogItem;
    const addonInfo = resolveFn ? resolveFn(`${_prereqGuideState.catSlug}_${_prereqGuideState.itemName}`) : null;
    const addonItem = addonInfo?.targetItem;
    const addonDisplay = addonItem ? _prLoc(addonItem, 'name', addonItem.name) : _prereqGuideState.itemName;
    const addonPrice = Number(addonItem?.price || addonInfo?.basePrice || 0);

    if (anchors.length === 0) {
        listEl.innerHTML = `<div style="padding:12px 14px; border-radius:12px; background:#fef2f2; color:#b91c1c; font-size:13.5px; font-weight:700;">${_prEsc(_prT('prereq_sheet_parent_oos', null, '所需搭配的主餐目前皆已售完，暫無法加購此品項', 'Món chính đi kèm hiện đã hết hàng, tạm thời chưa thể gọi thêm'))}</div>`;
        addBothBtn.disabled = true;
        addBothBtn.textContent = _prT('sold_out_today', null, '今日已售完', 'Hôm nay đã hết');
        return;
    }

    if (_prereqGuideState.selectedAnchorIdx >= anchors.length) _prereqGuideState.selectedAnchorIdx = 0;
    const chosen = anchors[_prereqGuideState.selectedAnchorIdx];

    listEl.innerHTML = anchors.map((a, idx) => {
        const isSel = idx === _prereqGuideState.selectedAnchorIdx;
        const desc = a.item?.description ? _prLoc(a.item, 'description', a.item.description) : '';
        return `<button type="button" class="prereq-anchor-option${isSel ? ' is-selected' : ''}" onclick="selectPrerequisiteGuideAnchor(${idx})">
            <div>
                <div class="prereq-anchor-name">${_prEsc(a.displayName)}</div>
                ${desc ? `<div class="prereq-anchor-sub">${_prEsc(desc)}</div>` : ''}
            </div>
            <div class="prereq-anchor-price">$${a.price}</div>
        </button>`;
    }).join('');

    addBothBtn.disabled = false;
    if (_anchorNeedsAutoPopup(chosen)) {
        addBothBtn.textContent = _prT(
            'prereq_sheet_add_parent_first',
            { parent: chosen.displayName },
            `先選擇「${chosen.displayName}」並加購`,
            `Chọn "${chosen.displayName}" và thêm món`
        );
    } else {
        const combinedTotal = Math.round((chosen.price + addonPrice) * 100) / 100;
        addBothBtn.textContent = _prT(
            'prereq_sheet_add_both',
            { parent: chosen.displayName, addon: addonDisplay, total: combinedTotal },
            `一併加入 ${chosen.displayName} + ${addonDisplay} ($${combinedTotal})`,
            `Thêm cả ${chosen.displayName} + ${addonDisplay} ($${combinedTotal})`
        );
    }
}

function selectPrerequisiteGuideAnchor(idx) {
    _prereqGuideState.selectedAnchorIdx = Number(idx) || 0;
    renderPrerequisiteSheetAnchors();
}

function openPrerequisiteGuideSheet(catSlug, itemName, prereqState) {
    const state = prereqState || evaluateItemPrerequisite(catSlug, itemName);
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : window.resolveCatalogItem;
    const addonInfo = resolveFn ? resolveFn(`${catSlug}_${itemName}`) : null;
    const addonItem = addonInfo?.targetItem;
    const addonDisplay = addonItem ? _prLoc(addonItem, 'name', addonItem.name) : itemName;

    _prereqGuideState = {
        catSlug,
        itemName,
        anchors: state.availableAnchors || [],
        selectedAnchorIdx: 0,
        allQualifying: state.qualifyingItems || []
    };

    const modal = typeof document !== 'undefined' ? document.getElementById('prereq-guide-modal') : null;
    if (!modal) {
        const fallbackMsg = _prT(
            'err_prerequisite_required',
            { addon: addonDisplay, parent: state.requiredLabel || '主餐' },
            `選購「${addonDisplay}」需先點購「${state.requiredLabel || '主餐'}」`,
            `Món "${addonDisplay}" cần gọi kèm "${state.requiredLabel || 'món chính'}".`
        );
        if (typeof customAlert === 'function') customAlert(fallbackMsg);
        else if (typeof alert === 'function') alert(fallbackMsg);
        return;
    }

    const titleEl = document.getElementById('prereq-sheet-title');
    if (titleEl) titleEl.textContent = _prT('prereq_sheet_title', null, '加點品項需搭配主餐', 'Món gọi thêm cần gọi kèm món chính');
    const descEl = document.getElementById('prereq-sheet-desc');
    if (descEl) {
        descEl.textContent = _prT(
            'prereq_sheet_desc',
            { addon: addonDisplay, parent: state.requiredLabel || '' },
            `選購「${addonDisplay}」前，需先點購「${state.requiredLabel || ''}」`,
            `Cần chọn "${state.requiredLabel || ''}" trước khi gọi thêm "${addonDisplay}"`
        );
    }
    const scrollBtn = document.getElementById('prereq-sheet-scroll-btn');
    if (scrollBtn) {
        scrollBtn.textContent = _prT('prereq_sheet_view_main', null, '前往查看主餐', 'Xem món chính');
    }
    renderPrerequisiteSheetAnchors();
    modal.style.display = 'flex';
}

function closePrerequisiteGuideSheet() {
    const modal = typeof document !== 'undefined' ? document.getElementById('prereq-guide-modal') : null;
    if (modal) modal.style.display = 'none';
}

function confirmPrerequisiteGuideAddBoth() {
    const chosen = (_prereqGuideState.anchors || [])[_prereqGuideState.selectedAnchorIdx];
    const targetCatSlug = _prereqGuideState.catSlug;
    const targetItemName = _prereqGuideState.itemName;
    closePrerequisiteGuideSheet();
    if (!chosen || !targetCatSlug || !targetItemName) return;

    if (_anchorNeedsAutoPopup(chosen)) {
        window.__pendingPrerequisiteAddon = { catSlug: targetCatSlug, itemName: targetItemName };
        updateQty(chosen.catSlug, chosen.name, 1);
        return;
    }
    updateQty(chosen.catSlug, chosen.name, 1);
    const unlockedNow = evaluateItemPrerequisite(targetCatSlug, targetItemName).unlocked;
    if (unlockedNow) {
        updateQty(targetCatSlug, targetItemName, 1);
    }
}

function scrollToPrerequisiteAnchor() {
    const candidate = (_prereqGuideState.anchors || [])[_prereqGuideState.selectedAnchorIdx]
        || (_prereqGuideState.allQualifying || [])[0];
    closePrerequisiteGuideSheet();
    if (!candidate) return;
    if (window.isStaffOrderMode && window.StaffOrder && typeof window.StaffOrder.focusCategorySlug === 'function') {
        window.StaffOrder.focusCategorySlug(candidate.catSlug);
        return;
    }
    const card = typeof document !== 'undefined' ? document.getElementById(`item-${candidate.catSlug}-${candidate.name}`) : null;
    if (card && typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('attention-pulse');
        setTimeout(() => card.classList.remove('attention-pulse'), 1500);
    } else if (typeof scrollToSec === 'function') {
        scrollToSec(`sec-${candidate.catSlug}`);
    }
}

function getOrphanedDependentCartItems(simulatedCart) {
    const cartObj = window.cart || cart || {};
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : window.resolveCatalogItem;
    const orphans = [];
    for (const [k, rawQ] of Object.entries(simulatedCart)) {
        const q = Number(rawQ || 0);
        if (q <= 0 || Number(cartObj[k] || 0) <= 0) continue;
        const { catSlug, origName } = parseCartKey(k);
        const beforeState = evaluateItemPrerequisite(catSlug, origName, cartObj);
        if (!beforeState.required || !beforeState.unlocked) continue;
        const afterState = evaluateItemPrerequisite(catSlug, origName, simulatedCart);
        if (!afterState.unlocked) {
            const info = resolveFn ? resolveFn(k) : null;
            const tItem = info?.targetItem;
            orphans.push({
                key: k,
                catSlug,
                origName,
                qty: q,
                displayName: tItem ? _prLoc(tItem, 'name', origName) : origName
            });
        }
    }
    return orphans;
}

function clearCartItemCompletely(key) {
    const cartObj = window.cart || cart || {};
    const { catSlug, origName } = parseCartKey(key);
    delete cartObj[key];
    if (window.customizeData) delete window.customizeData[key];
    if (typeof customizeData !== 'undefined' && customizeData) delete customizeData[key];
    if (window.bundleCartData) delete window.bundleCartData[key];
    if (window.comboDrinkData && origName) delete window.comboDrinkData[origName];
    if (typeof document !== 'undefined') {
        const qtySpan = document.getElementById(`qty-${catSlug}-${origName}`);
        if (qtySpan && !(window.isStaffOrderMode && window.StaffOrderView)) {
            qtySpan.innerText = '0';
            qtySpan.style.color = 'inherit';
        }
        for (const prefix of ['customize-btn-', 'bundle-edit-btn-', 'prereq-jump-btn-']) {
            const btn = document.getElementById(`${prefix}${catSlug}-${origName}`);
            if (btn) btn.style.display = 'none';
        }
    }
}

function confirmAndRemoveWithOrphans(parentDisplayName, orphans, executeParentDecrement) {
    const listHtml = orphans.map(o => `<div style="font-weight:800; color:#0f172a; margin-top:4px;">• ${_prEsc(o.displayName)} ×${o.qty}</div>`).join('');
    const htmlMsg =
        `<div style="font-size:16px; font-weight:900; color:#0f172a; margin-bottom:8px;">${_prEsc(_prT('prereq_remove_confirm_title', null, '一併移除加點品項？', 'Xóa kèm các món gọi thêm?'))}</div>` +
        `<div style="font-size:14px; color:#475569; line-height:1.5;">${_prEsc(_prT('prereq_remove_confirm_body', { parent: parentDisplayName }, `移除「${parentDisplayName}」後，以下需搭配的加點品項將一併移除：`, `Khi bỏ "${parentDisplayName}", các món gọi thêm đi kèm sau sẽ được xóa cùng:`))}` +
        `<div style="margin-top:8px; padding:10px 12px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0;">${listHtml}</div></div>`;

    const runConfirmed = () => {
        window.__bypassPrereqRemoveGuard = true;
        try {
            for (const o of orphans) clearCartItemCompletely(o.key);
            executeParentDecrement();
        } finally {
            window.__bypassPrereqRemoveGuard = false;
        }
    };

    if (typeof customConfirm === 'function') {
        customConfirm(htmlMsg, runConfirmed);
    } else if (typeof confirm === 'function') {
        const plain = _prT('prereq_remove_confirm_body', { parent: parentDisplayName }, `移除「${parentDisplayName}」後，需搭配的加點品項將一併移除`, `Xóa "${parentDisplayName}" sẽ xóa kèm các món gọi thêm`);
        if (confirm(plain)) runConfirmed();
    } else {
        runConfirmed();
    }
}

function getActivePrerequisiteViolations() {
    const cartObj = window.cart || cart || {};
    const violations = [];
    for (const [k, rawQ] of Object.entries(cartObj)) {
        if (Number(rawQ || 0) <= 0) continue;
        const { catSlug, origName } = parseCartKey(k);
        const st = evaluateItemPrerequisite(catSlug, origName, cartObj);
        if (st.required && !st.unlocked) {
            violations.push({ key: k, catSlug, origName, state: st });
        }
    }
    return violations;
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

    if (change > 0) {
        const prereqState = evaluateItemPrerequisite(category, origName, cartObj);
        if (prereqState.required && !prereqState.unlocked) {
            openPrerequisiteGuideSheet(category, origName, prereqState);
            return;
        }
    } else if (change < 0 && currentQty > 0 && !window.__bypassPrereqRemoveGuard) {
        const nextQty = Math.max(0, currentQty + change);
        const simulated = { ...cartObj, [key]: nextQty };
        const orphans = getOrphanedDependentCartItems(simulated);
        if (orphans.length > 0) {
            const parentDisplay = _prLoc(targetItem, 'name', targetItem?.name || origName);
            confirmAndRemoveWithOrphans(parentDisplay, orphans, () => updateQty(category, origName, change));
            return;
        }
    }

    if (change > 0 && maxPerOrder && currentQty >= maxPerOrder) {
        const itemLabel = (typeof locText === 'function' ? locText(targetItem, 'name', targetItem.name || origName) : (targetItem.name || origName));
        const limitMsg = typeof ct === 'function'
            ? ct('cart_max_limit_short', { item: itemLabel, max: maxPerOrder })
            : `【${itemLabel}】每單限購 ${maxPerOrder} 份`;
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
    if (qtySpan && !(window.isStaffOrderMode && window.StaffOrderView)) {
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
    if (!window.__bypassPrereqRemoveGuard) {
        const simulated = { ...cartObj, [key]: Math.max(0, quantity - 1) };
        const orphans = getOrphanedDependentCartItems(simulated);
        if (orphans.length > 0) {
            const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : window.resolveCatalogItem;
            const info = resolveFn ? resolveFn(key) : null;
            const parentDisplay = _prLoc(info?.targetItem, 'name', origName);
            confirmAndRemoveWithOrphans(parentDisplay, orphans, () => removeCartPortion(category, origName, index));
            return;
        }
    }
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
    if (qty && !(window.isStaffOrderMode && window.StaffOrderView)) {
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
    if (window.PricingWasm?.isReady && typeof window.PricingWasm.calculateCategoryBundle === 'function') {
        try {
            const wasmRes = window.PricingWasm.calculateCategoryBundle(rule, items);
            if (wasmRes && typeof wasmRes.categoryTotal === 'number') {
                return wasmRes;
            }
        } catch (wasmErr) {
            console.warn('[PricingWasm] Category bundle calculation error, fallback to JS:', wasmErr);
        }
    }

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
    if (typeof updatePrerequisiteUI === 'function') {
        updatePrerequisiteUI();
    }
    if (typeof flushPendingPrerequisiteAddon === 'function') {
        flushPendingPrerequisiteAddon();
    }
    const wasmCart = (window.PricingWasm?.isReady && typeof window.PricingWasm.calculateCart === 'function')
        ? window.PricingWasm.calculateCart()
        : null;
    let total = 0;
    let totalQty = 0;
    let summaryHTML = '';
    const t = (key, vars, fallback) => (typeof ct === 'function' ? ct(key, vars) : fallback);
    const loc = (entity, field, fallback) => (typeof locText === 'function' ? locText(entity, field, fallback) : (fallback ?? entity?.[field] ?? ''));
    const escapeCartText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

    const bData = window.bootstrapData || bootstrapData;
    const cartObj = window.cart || cart || {};
    const cData = window.customizeData || customizeData || {};
    const cDrinkData = window.comboDrinkData || comboDrinkData || {};

    const resolveGlobalOptObj = (group, rawOptName) =>
        (group?.options || []).find(o => typeof o === 'object' && o && (o.name === rawOptName || String(o.id) === rawOptName)) || null;
    const resolveGlobalOptName = (group, rawOptName) => {
        const obj = resolveGlobalOptObj(group, rawOptName);
        return obj ? loc(obj, 'name', rawOptName) : rawOptName;
    };
    const resolveItemModLabel = (modsList, detailIdOrName, rawVal) => {
        const resolved = (typeof resolveOptionDisplayName === 'function') ? resolveOptionDisplayName(rawVal) : rawVal;
        for (const m of (modsList || [])) {
            for (const o of (m.options || [])) {
                if ((detailIdOrName && (o.id === detailIdOrName)) || o.name === rawVal || o.name === resolved) {
                    return { optObj: o, displayName: loc(o, 'name', o.name || resolved) };
                }
            }
        }
        return { optObj: null, displayName: resolved };
    };

    // 1. Order-level customization summary
    let customSummaries = [];
    if (bData?.customizations && bData.customizations.length > 0) {
        bData.customizations.forEach(group => {
            const inputName = `opt-${group.key}`;
            const rawGroupTitle = loc(group, 'title', loc(group, 'name', group.title || ''));
            const cleanGroupTitle = String(rawGroupTitle || '').replace(/^✦\s*/, '').replace(/選擇|調整/g, '').trim();
            if (group.type === 'radio') {
                const checkedRadio = document.querySelector(`input[name="${inputName}"]:checked`);
                if (checkedRadio) {
                    const val = checkedRadio.value;
                    const optObj = resolveGlobalOptObj(group, val);
                    const optDisplay = optObj ? loc(optObj, 'name', val) : val;
                    let subDetails = '';
                    const activeSubContainer = document.querySelector(`.sub-option-container[data-parent-flavor="${val}"]`);
                    if (activeSubContainer) {
                        let subOpts = [];
                        activeSubContainer.querySelectorAll('input.sub-opt-chk:checked').forEach(chk => {
                            const subDisplay = (typeof locSubOptionText === 'function' && optObj)
                                ? locSubOptionText(optObj, chk.value)
                                : chk.value;
                            subOpts.push(escapeCartText(subDisplay));
                        });
                        if (subOpts.length > 0) {
                            subDetails = ` (${subOpts.join('、')})`;
                        }
                    }
                    const p = Number(checkedRadio.getAttribute('data-price')) || 0;
                    const priceSuffix = p > 0 ? ` (+$${p})` : '';
                    const labelTitle = cleanGroupTitle || t('customize_group_fallback', null, '口味');
                    customSummaries.push(`<div><b style="color:#1e293b;">${escapeCartText(labelTitle)}：</b>${escapeCartText(optDisplay)}${priceSuffix}${subDetails}</div>`);
                }
            } else if (group.type === 'checkbox') {
                let selectedChecks = [];
                document.querySelectorAll(`input[name="${inputName}"]:checked`).forEach(chk => {
                    const p = Number(chk.getAttribute('data-price')) || 0;
                    if (p === 0) {
                        selectedChecks.push(escapeCartText(resolveGlobalOptName(group, chk.value)));
                    }
                });
                if (selectedChecks.length > 0) {
                    const labelTitle = cleanGroupTitle || t('cart_topping_fallback', null, '配料');
                    customSummaries.push(`<div><b style="color:#1e293b;">${escapeCartText(labelTitle)}：</b>${selectedChecks.join('、')}</div>`);
                }
            }
        });
    }

    if (customSummaries.length > 0) {
        summaryHTML += `
            <div style="margin-bottom: 8px; padding: 8px 12px; background: #f8fafc; border-radius: 10px; border: 1px dashed #cbd5e1; font-size: 13px; color: #475569; line-height: 1.5;">
                <div style="font-weight: 800; color: #0f172a; margin-bottom: 2px; font-size: 13.5px; display: flex; align-items: center; gap: 6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                    <span>${escapeCartText(t('cart_custom_settings', null, '客製化設定'))}</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px;">${customSummaries.join('')}</div>
            </div>
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
    const isSchedUnavailFn = typeof isCartItemScheduleUnavailable === 'function'
        ? isCartItemScheduleUnavailable
        : (typeof window !== 'undefined' && typeof window.isCartItemScheduleUnavailable === 'function' ? window.isCartItemScheduleUnavailable : () => false);

    for (let key in cartObj) {
        if (cartObj[key] > 0) {
            const itemInfo = resolveFn(key);
            const { catSlug, itemName } = parseCartKey(key);
            const qty = cartObj[key];
            const dName = itemInfo.displayName || itemName;
            const localizedDName = itemInfo.localizedDisplayName || (itemInfo.targetItem ? loc(itemInfo.targetItem, 'name', dName) : dName);

            const isOutOfStock = (
                (typeof isItemOutOfStock === 'function' && isItemOutOfStock(key)) ||
                (window.isEditOrderMode && Array.isArray(window.editOrderSoldOutNames) && (
                    window.editOrderSoldOutNames.includes(dName) ||
                    window.editOrderSoldOutNames.includes(itemName) ||
                    window.editOrderSoldOutNames.some(s => s && s.trim() && (dName.includes(s.trim()) || (itemName && itemName.includes(s.trim()))))
                ))
            );
            const isScheduleUnavailable = !isOutOfStock && Boolean(isSchedUnavailFn(key));
            const isUnavailable = Boolean(isOutOfStock || isScheduleUnavailable);

            if (!isUnavailable) {
                totalQty += qty;
            }

            const itemBasePrice = itemInfo.basePrice || priceMap[key] || 0;
            if (!itemsByCategory[catSlug]) itemsByCategory[catSlug] = [];
            itemsByCategory[catSlug].push({
                key,
                itemInfo,
                catSlug,
                itemName,
                displayName: localizedDName,
                qty,
                price: itemBasePrice,
                isOutOfStock,
                isScheduleUnavailable,
                isUnavailable
            });
        }
    }

    let totalCategoryDiscounts = 0;

    for (let slug in itemsByCategory) {
        const catItems = itemsByCategory[slug];
        if (catItems.length === 0) continue;

        const catMeta = categoryMetaMap[slug] || {};
        const catRule = catMeta.pricingRules;
        const activeCatItems = catItems.filter(it => !it.isUnavailable);
        const bundleRes = calculateCategoryBundleSubtotal(catRule, activeCatItems);

        catItems.forEach(it => {
            const { key, catSlug, itemName, displayName, qty, price, isOutOfStock, isScheduleUnavailable, isUnavailable } = it;
            let itemModifiersTotal = 0;
            let portionsHTML = '';
            const portionDetails = [];
            const bundleRule = it.itemInfo?.bundleRule || it.itemInfo?.targetItem?.bundleRule;
            const hasBundleGroups = Boolean(bundleRule?.groups?.length);

            const getItemModsFn = typeof getItemModifiers === 'function' ? getItemModifiers : (window.getItemModifiers || (() => []));
            const itemMods = getItemModsFn(catSlug, itemName);

            if (cData[key]) {
                cData[key].slice(0, qty).forEach((c, i) => {
                    if (!c) return;
                    const parts = [];
                    if (c.selectedDetails && Object.keys(c.selectedDetails).length > 0) {
                        Object.values(c.selectedDetails).forEach(detail => {
                            if (!detail) return;
                            const { optObj, displayName: optLabel } = resolveItemModLabel(itemMods, detail.id, detail.name || detail.id);
                            const sub = detail.subOption || c.subOptions?.[detail.id] || c.subOptions?.[detail.name];
                            const subDisplay = sub ? (typeof locSubOptionText === 'function' ? locSubOptionText(optObj, sub) : (sub.name || sub)) : '';
                            const price = Number(detail.price || 0) + Number(sub?.price || 0);
                            const label = `${optLabel}${subDisplay ? ` (${subDisplay})` : ''}`;
                            parts.push(price > 0 ? `${label} (+$${price})` : label);
                        });
                    } else if (c.single) {
                        for (let s in c.single) {
                            const rawVal = c.single[s];
                            const val = (typeof resolveOptionDisplayName === 'function') ? resolveOptionDisplayName(rawVal) : rawVal;
                            if (val && val !== '不辣' && val !== '不需要') {
                                const { displayName: optLabel } = resolveItemModLabel(itemMods, null, rawVal);
                                const addP = getPrice(val) || getPrice(rawVal);
                                const label = addP > 0 ? `${optLabel} (+$${addP})` : optLabel;
                                if (!parts.includes(label)) parts.push(label);
                            }
                        }
                    }
                    if ((!c.selectedDetails || Object.keys(c.selectedDetails).length === 0) && c.multiple) {
                        for (let topName in c.multiple) {
                            if (c.multiple[topName]) {
                                const { displayName: optLabel } = resolveItemModLabel(itemMods, topName, topName);
                                const topPrice = getPrice(topName);
                                if (topPrice > 0) {
                                    parts.push(`${optLabel} (+$${topPrice})`);
                                } else {
                                    parts.push(optLabel);
                                }
                            }
                        }
                    }
                    if (c.note && c.note.trim() !== '') parts.push(c.note.trim());
                    if (!isUnavailable && typeof calculatePortionExtra === 'function') {
                        itemModifiersTotal += calculatePortionExtra(key, c);
                    } else if (!isUnavailable) {
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
            if (!isUnavailable) itemModifiersTotal += bundleExtra;

            let lineTotal = (!isUnavailable && wasmCart?.lineTotals?.[key] !== undefined)
                ? wasmCart.lineTotals[key]
                : ((qty * price) + itemModifiersTotal);

            if (isUnavailable) {
                const unavailTag = isScheduleUnavailable && !isOutOfStock
                    ? escapeCartText(t('cart_outside_schedule', null, '非所選時段供應'))
                    : escapeCartText(t('cart_item_removed', null, '已移除'));
                const tagColors = (isScheduleUnavailable && !isOutOfStock)
                    ? 'background:#fef3c7; color:#b45309;'
                    : 'background:#fee2e2; color:#dc2626;';
                summaryHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; opacity:0.65; text-decoration:line-through; color:#94a3b8;">
                        <div style="font-weight:700;">
                            <span>${qty}x ${escapeCartText(displayName)}</span>
                            <span style="display:inline-block; margin-left:6px; font-size:11px; font-weight:700; ${tagColors} padding:1px 6px; border-radius:4px; text-decoration:none; vertical-align:middle;">${unavailTag}</span>
                        </div>
                        <div style="font-weight:700; color:#94a3b8;">$${lineTotal}</div>
                    </div>
                `;
            } else {
                if (hasBundleGroups && window.bundleCartData && window.bundleCartData[key]) {
                    const portions = window.bundleCartData[key].slice(0, qty);
                    portions.forEach((p, pIdx) => {
                        const bundleParts = [];
                        (p.groups || []).forEach(g => {
                            const bGroupDef = (bundleRule?.groups || []).find(bg => bg.id === g.groupId);
                            const gDisplayTitle = bGroupDef ? loc(bGroupDef, 'name', g.groupName) : (g.groupName || t('bundle_fallback_label', null, '配菜'));
                            const bOpts = bGroupDef ? (bGroupDef.eligibleItems || bGroupDef.options || []) : [];
                            const itemsStr = (g.items || []).map(item => {
                                const srcDef = bOpts.find(opt => opt.id === (item.optionId || item.itemId));
                                const itemLabel = srcDef ? loc(srcDef, 'name', item.name) : item.name;
                                const modsList = (item.modifiers || []).map(mod => {
                                    const mGroup = (srcDef?.optionGroups || []).find(mg => mg.id === mod.groupId);
                                    const mOpt = (mGroup?.eligibleItems || mGroup?.options || []).find(o => o.id === mod.optionId || o.name === mod.name);
                                    return mOpt ? loc(mOpt, 'name', mod.name) : mod.name;
                                });
                                const subList = (item.subOptions || []).map(sub => {
                                    return (typeof locSubOptionText === 'function' && srcDef) ? locSubOptionText(srcDef, sub) : (sub.name || sub);
                                });
                                const detailsJoin = [...modsList, ...subList].filter(Boolean).join('、');
                                return `${itemLabel} x${item.quantity}${detailsJoin ? ` (${detailsJoin})` : ''}`;
                            }).join('、');
                            if (itemsStr) bundleParts.push(`${gDisplayTitle}：${itemsStr}`);
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
                                        const { displayName: optLabel } = resolveItemModLabel(itemMods, null, rawVal);
                                        const addP = getPrice(val) || getPrice(rawVal);
                                        const label = addP > 0 ? `${optLabel} (+$${addP})` : optLabel;
                                        if (!customParts.includes(label)) customParts.push(label);
                                    }
                                }
                            }
                            if (c.multiple) {
                                for (let topName in c.multiple) {
                                    if (c.multiple[topName]) {
                                        const { displayName: optLabel } = resolveItemModLabel(itemMods, topName, topName);
                                        const topPrice = getPrice(topName);
                                        customParts.push(topPrice > 0 ? `${optLabel} (+$${topPrice})` : optLabel);
                                    }
                                }
                            }
                            if (c.note && c.note.trim() !== '') {
                                customParts.push(t('cart_note_prefix', { note: c.note.trim() }, `備註: ${c.note.trim()}`));
                            }
                        }

                        const detailItems = [];
                        if (bundleParts.length > 0) detailItems.push(bundleParts.join('、'));
                        if (customParts.length > 0) detailItems.push(customParts.join('、'));
                        portionDetails[pIdx] = detailItems.join(' ｜ ');
                    });
                }

                let drinkStr = '';
                if (!bootstrapData?.unifiedMenu && catSlug === 'combo') {
                    let drinks = cDrinkData[itemName] || [];
                    let drinkCounts = {};
                    drinks.slice(0, qty).forEach(d => { drinkCounts[d] = (drinkCounts[d] || 0) + 1; });
                    drinkStr = Object.entries(drinkCounts).map(([n, c]) => `${n} x${c}`).join('、');
                }

                const portionGroups = [];
                const portionGroupMap = new Map();
                for (let index = 0; index < qty; index++) {
                    const detailText = (portionDetails[index] || '').trim();
                    if (!portionGroupMap.has(detailText)) {
                        const group = { detail: detailText, indices: [] };
                        portionGroupMap.set(detailText, group);
                        portionGroups.push(group);
                    }
                    portionGroupMap.get(detailText).indices.push(index);
                }

                const pencilIconSvg = `<svg class="cart-portion-edit-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`;
                const removeIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                const safeCatSlug = escapeCartText(catSlug);
                const safeItemName = escapeCartText(itemName);
                const safeDisplayName = escapeCartText(displayName);

                if (qty === 1 && portionGroups.length === 1 && !portionGroups[0].detail && !drinkStr) {
                    const editLabel = escapeCartText(t('cart_edit_item_aria', { name: displayName }, `調整 ${displayName}`));
                    const removeLabel = escapeCartText(t('cart_remove_item_aria', { name: displayName }, `移除 ${displayName}`));
                    summaryHTML += `
                        <div class="cart-item-block">
                            <div class="cart-item-header">
                                <div class="cart-item-title">
                                    <span>${qty}x ${safeDisplayName}</span>
                                </div>
                                <div class="cart-item-right" data-category="${safeCatSlug}" data-item="${safeItemName}" data-portion="0">
                                    <span class="cart-portion-actions">
                                        <button type="button" class="cart-portion-action cart-portion-action--icon" aria-label="${editLabel}" onclick="const d=this.closest('[data-portion]').dataset;editCartPortion(d.category,d.item,Number(d.portion))">${pencilIconSvg}</button>
                                        <button type="button" class="cart-portion-action cart-portion-action--icon cart-portion-action--remove" aria-label="${removeLabel}" onclick="const d=this.closest('[data-portion]').dataset;removeCartPortion(d.category,d.item,Number(d.portion))">${removeIconSvg}</button>
                                    </span>
                                    <span class="cart-item-price">$${lineTotal}</span>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    portionGroups.forEach(group => {
                        const firstIndex = group.indices[0];
                        let groupLabel = '';
                        if (qty > 1) {
                            if (group.indices.length === qty) {
                                groupLabel = t('cart_all_portions', { qty }, `共 ${qty} 份`);
                            } else if (group.indices.length === 1) {
                                groupLabel = t('portion_n', { n: firstIndex + 1 }, `第 ${firstIndex + 1} 份`);
                            } else {
                                groupLabel = t('cart_portions_join', { list: group.indices.map(idx => idx + 1).join(', ') }, `第 ${group.indices.map(idx => idx + 1).join('、')} 份`);
                            }
                        }

                        const detailHtml = groupLabel && group.detail
                            ? `${escapeCartText(groupLabel)}：${escapeCartText(group.detail)}`
                            : (group.detail ? escapeCartText(group.detail) : escapeCartText(groupLabel));
                        const contextLabel = groupLabel ? `${displayName}, ${groupLabel}` : displayName;
                        const editLabel = escapeCartText(t('cart_edit_item_aria', { name: contextLabel }, `調整 ${contextLabel}`));
                        const removeLabel = group.indices.length > 1
                            ? escapeCartText(t('cart_remove_one_aria', { name: displayName }, `移除 1 份 ${displayName}`))
                            : escapeCartText(t('cart_remove_item_aria', { name: contextLabel }, `移除 ${contextLabel}`));

                        portionsHTML += `<div class="cart-portion-row" data-category="${safeCatSlug}" data-item="${safeItemName}" data-portion="${firstIndex}">
                            <button type="button" class="cart-portion-edit-btn" aria-label="${editLabel}" onclick="const d=this.closest('[data-portion]').dataset;editCartPortion(d.category,d.item,Number(d.portion))">
                                <span class="cart-portion-edit-text">${detailHtml}</span>
                                ${pencilIconSvg}
                            </button>
                            <span class="cart-portion-actions">
                                <button type="button" class="cart-portion-action cart-portion-action--icon cart-portion-action--remove" aria-label="${removeLabel}" onclick="const d=this.closest('[data-portion]').dataset;removeCartPortion(d.category,d.item,Number(d.portion))">${removeIconSvg}</button>
                            </span>
                        </div>`;
                    });

                    summaryHTML += `
                        <div class="cart-item-block">
                            <div class="cart-item-header">
                                <div class="cart-item-title">
                                    <span>${qty}x ${safeDisplayName}</span>
                                </div>
                                <div class="cart-item-price">$${lineTotal}</div>
                            </div>
                            ${drinkStr ? `<div style="font-size:13px; color:#6b7280; margin-left:8px; margin-top:3px;">${escapeCartText(t('cart_drink_prefix', { drinks: drinkStr }, `↳ 飲料：${drinkStr}`))}</div>` : ''}
                            ${portionsHTML}
                        </div>
                    `;
                }
                total += lineTotal;
            }
        });

        if (bundleRes.discountAmount > 0) {
            totalCategoryDiscounts += bundleRes.discountAmount;
            const localizedCat = loc(catMeta, 'name', catMeta.name) || '';
            const cleanCatName = localizedCat.split(' ')[0] || t('cart_combo_discount', null, '組合特惠');
            const bundlePromoLine = t('cart_bundle_promo_line', {
                cat: cleanCatName,
                count: bundleRes.bundleCount,
                saved: bundleRes.discountAmount
            }, `${cleanCatName} 組合特惠 (${bundleRes.bundleCount}組，已省 $${bundleRes.discountAmount})`);
            summaryHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin: 2px 0 10px 0; color:#059669; font-size:13px; font-weight:700; background:#ecfdf5; padding:6px 10px; border-radius:8px; border:1px dashed #a7f3d0;">
                    <div style="display:flex; align-items:center; gap:5px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                        <span>${escapeCartText(bundlePromoLine)}</span>
                    </div>
                    <div>-$${bundleRes.discountAmount}</div>
                </div>
            `;
        }

        summaryHTML += `<div style="border-bottom: 1px dashed #eee; margin-bottom: 8px;"></div>`;
    }

    // Render removed sold-out items from previous order with line-through and localized removed tag
    if (window.isEditOrderMode && Array.isArray(window.editOrderRemovedItems) && window.editOrderRemovedItems.length > 0) {
        const removedTag = escapeCartText(t('cart_item_removed', null, '已移除'));
        window.editOrderRemovedItems.forEach(rem => {
            const rQty = Number(rem.quantity) || 1;
            const rPrice = Number(rem.subtotal) || ((Number(rem.price) || 0) * rQty);
            const rResolved = rem.name ? resolveFn(`${rem.category || ''}_${rem.name}`) : null;
            const rName = rResolved?.localizedDisplayName || rem.displayName || rem.name || '';
            summaryHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; opacity:0.6; text-decoration:line-through; color:#94a3b8;">
                    <div style="font-weight:700;">
                        <span>${rQty}x ${escapeCartText(rName)}</span>
                        <span style="display:inline-block; margin-left:6px; font-size:11px; font-weight:700; background:#fee2e2; color:#dc2626; padding:1px 6px; border-radius:4px; text-decoration:none; vertical-align:middle;">${removedTag}</span>
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
            const matchingGroup = (bData?.customizations || []).find(g => `opt-${g.key}` === chk.name || g.title === rawGroupTitle);
            const locGroupTitle = matchingGroup ? loc(matchingGroup, 'title', loc(matchingGroup, 'name', rawGroupTitle)) : rawGroupTitle;
            const cleanGroup = String(locGroupTitle || '').replace(/^✦\s*/, '').replace(/選擇|調整/g, '').trim();
            const locOptName = matchingGroup ? resolveGlobalOptName(matchingGroup, chk.value) : chk.value;
            const labelText = cleanGroup ? `${cleanGroup} (${locOptName})` : locOptName;
            const addonLine = t('cart_addon_prefix', { label: labelText }, `+ 加購：${labelText}`);
            summaryHTML += `
                <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#059669; font-size:13.5px; font-weight:700;">
                    <div>${escapeCartText(addonLine)}</div>
                    <div>+$${p}</div>
                </div>
            `;
        }
    });
    total += addonsTotal;
    if (wasmCart && typeof wasmCart.total === 'number') {
        total = wasmCart.total;
    }

    // Sold out items are automatically crossed out, tagged removed, and deducted from total
    window.editOrderHasSoldOutRemaining = false;

    const totalEl = document.getElementById('total-price');
    if (totalEl) totalEl.innerText = total;

    const desktopTotalEl = document.getElementById('desktop-total-price');
    if (desktopTotalEl) desktopTotalEl.innerText = total;

    const summaryContainer = document.getElementById('cart-summary');
    if (summaryContainer && !(window.isStaffOrderMode && window.StaffOrderView)) {
        const hasRemovedItems = window.isEditOrderMode && Array.isArray(window.editOrderRemovedItems) && window.editOrderRemovedItems.length > 0;
        if (totalQty === 0 && addonsTotal === 0 && !hasRemovedItems) {
            summaryContainer.innerHTML = `<div style="text-align:center; color:#9ca3af;">${escapeCartText(t('cart_empty', null, '(目前沒有已選商品)'))}</div>`;
        } else {
            const violations = (typeof getActiveThresholdViolations === 'function') ? getActiveThresholdViolations() : [];
            if (violations.length > 0) {
                const vList = violations.map(v => `「${v.displayName || v.name}」`).join('、');
                const bannerText = t('cart_threshold_banner', {
                    list: vList,
                    current: violations[0].currentSubtotal
                }, `口味條件未達門檻：${vList}，目前餐點金額 $${violations[0].currentSubtotal} 元，下單前請補足金額或修改口味。`);
                const warningHTML = `
                    <div class="threshold-warning-banner">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        <div>${escapeCartText(bannerText)}</div>
                    </div>
                `;
                summaryHTML = warningHTML + summaryHTML;
            }

            // Render Price Delta Box in Edit Order Mode
            if (window.isEditOrderMode) {
                const origTot = window.editOrderOriginalTotal || 0;
                const diff = total - origTot;
                let diffText = t('alert_edit_no_delta', null, '無差額 ($0)');
                let diffColor = '#64748b';
                if (diff > 0) {
                    diffText = t('alert_edit_delta_add', { delta: diff }, `需補差額 +$${diff}`);
                    diffColor = '#dc2626';
                } else if (diff < 0) {
                    diffText = t('alert_edit_delta_refund', { delta: Math.abs(diff) }, `退還差額 -$${Math.abs(diff)}`);
                    diffColor = '#059669';
                }
                const deltaLineText = t('cart_edit_delta_line', { orig: origTot, total }, `原金額 $${origTot} → 新總計 $${total}`);
                const deltaHTML = `
                    <div class="edit-order-delta-box">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-weight:800;">
                            <span>${escapeCartText(deltaLineText)}</span>
                            <span style="color:${diffColor}; font-weight:900;">${escapeCartText(diffText)}</span>
                        </div>
                    </div>
                `;
                summaryHTML = deltaHTML + summaryHTML;
            }

            if (totalQty === 0 && addonsTotal === 0 && hasRemovedItems) {
                summaryHTML += `<div style="text-align:center; color:#dc2626; font-weight:700; font-size:13px; margin:8px 0;">${escapeCartText(t('cart_edit_all_oos_note', null, '(購物車內餐點已全數售完，請由上方菜單挑選更換餐點)'))}</div>`;
            }

            summaryHTML += `<div style="display:flex; justify-content:space-between; font-weight:900; margin-top:12px; font-size:16px;">
                <div>${escapeCartText(t('cart_total_label', null, '總計'))}</div><div style="color:var(--primary);">$${total}</div>
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

function isCartItemScheduleUnavailable(key) {
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || null);
    if (!resolveFn) return false;
    const itemInfo = resolveFn(key);
    if (!itemInfo || !itemInfo.targetItem) return false;
    if (typeof getItemScheduleState === 'function') {
        return !getItemScheduleState(itemInfo.targetCat, itemInfo.targetItem).available;
    }
    if (typeof window !== 'undefined' && typeof window.getItemScheduleState === 'function') {
        return !window.getItemScheduleState(itemInfo.targetCat, itemInfo.targetItem).available;
    }
    return false;
}

// Window Public Bindings
window.parseCartKey = parseCartKey;
window.isCartItemScheduleUnavailable = isCartItemScheduleUnavailable;
window.calculateCurrentFoodSubtotal = calculateCurrentFoodSubtotal;
window.updateCustomizationThresholdUI = updateCustomizationThresholdUI;
window.validateCustomizationThresholds = validateCustomizationThresholds;
window.getActiveThresholdViolations = getActiveThresholdViolations;
window.evaluateCategoryPrerequisite = evaluateCategoryPrerequisite;
window.evaluateItemPrerequisite = evaluateItemPrerequisite;
window.findDependentCategoriesForItem = findDependentCategoriesForItem;
window.updatePrerequisiteUI = updatePrerequisiteUI;
window.openPrerequisiteGuideSheet = openPrerequisiteGuideSheet;
window.closePrerequisiteGuideSheet = closePrerequisiteGuideSheet;
window.selectPrerequisiteGuideAnchor = selectPrerequisiteGuideAnchor;
window.confirmPrerequisiteGuideAddBoth = confirmPrerequisiteGuideAddBoth;
window.scrollToPrerequisiteAnchor = scrollToPrerequisiteAnchor;
window.getActivePrerequisiteViolations = getActivePrerequisiteViolations;
window.updateQty = updateQty;
window.calculateCategoryBundleSubtotal = calculateCategoryBundleSubtotal;
window.updateTotal = updateTotal;
