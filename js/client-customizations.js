// ==========================================
// Benmi Client Menu - Module: Customizations & Modifiers
// ==========================================

var bootstrapData = window.bootstrapData;
var cart = window.cart;
var customizeData = window.customizeData;
var comboDrinkData = window.comboDrinkData;
var currentPopup = window.currentPopup;

// --- UNIQUE MODIFIER OPTION IDENTITY & SCOPING HELPERS ---
function getUniqueModifierOptionId(mod, opt, optIdx) {
    if (!opt) return '';
    if (opt.id) return String(opt.id);
    const groupKey = (mod && (mod.id || mod.slug)) ? (mod.id || mod.slug) : 'grp';
    const optName = opt.name || 'opt';
    const idx = (typeof optIdx === 'number' && optIdx >= 0) ? optIdx : 0;
    return `${groupKey}:${optName}:${idx}`;
}
window.getUniqueModifierOptionId = getUniqueModifierOptionId;

function isOptionSelectedInSingle(draft, mod, opt, optIdx) {
    if (!draft || !draft.single) return false;
    const optId = getUniqueModifierOptionId(mod, opt, optIdx);
    const selVal = draft.single[mod.slug] || draft.single[mod.id];
    if (!selVal) return false;

    // 1. Direct ID match
    if (selVal === optId || (opt.id && selVal === opt.id)) return true;

    // 2. Check draft.selectedDetails
    if (draft.selectedDetails && draft.selectedDetails[optId]) return true;

    // 3. Fallback for legacy state where selVal is plain name:
    // Match only the first option in mod.options with this name to avoid selecting multiple siblings
    if (selVal === opt.name) {
        const firstMatchingIdx = (mod.options || []).findIndex(o => o.name === selVal);
        return firstMatchingIdx === optIdx;
    }
    return false;
}
window.isOptionSelectedInSingle = isOptionSelectedInSingle;

function isOptionSelectedInMultiple(draft, mod, opt, optIdx) {
    if (!draft || !draft.multiple) return false;
    const optId = getUniqueModifierOptionId(mod, opt, optIdx);
    const modKey = mod.slug || mod.id;

    // 1. Scoped group map: draft.multiple[modKey][optId]
    if (draft.multiple[modKey] && typeof draft.multiple[modKey] === 'object' && !Array.isArray(draft.multiple[modKey])) {
        if (draft.multiple[modKey][optId] || (opt.id && draft.multiple[modKey][opt.id])) return true;
    }

    // 2. Array in group: draft.multiple[modKey] = [optId, ...]
    if (Array.isArray(draft.multiple[modKey])) {
        if (draft.multiple[modKey].includes(optId) || (opt.id && draft.multiple[modKey].includes(opt.id))) return true;
        if (draft.multiple[modKey].includes(opt.name)) {
            const firstIdx = (mod.options || []).findIndex(o => o.name === opt.name);
            if (firstIdx === optIdx) return true;
        }
    }

    // 3. Direct optId in draft.multiple
    if (draft.multiple[optId] || (opt.id && draft.multiple[opt.id])) return true;

    // 4. Check selectedDetails
    if (draft.selectedDetails && draft.selectedDetails[optId]) return true;

    // 5. Legacy flat map fallback: draft.multiple[opt.name] === true
    if (draft.multiple[opt.name] && !draft.selectedDetails) {
        const firstIdx = (mod.options || []).findIndex(o => o.name === opt.name);
        if (firstIdx === optIdx) return true;
    }

    return false;
}
window.isOptionSelectedInMultiple = isOptionSelectedInMultiple;

// --- MODIFIER SELECTION VALIDATOR (B2 Standard) ---
function validateModifierDraft(modifiers, draft) {
    if (!Array.isArray(modifiers) || modifiers.length === 0) {
        return { valid: true };
    }
    if (!draft) {
        return { valid: false, message: '請完成客製選項設定' };
    }

    for (const mod of modifiers) {
        const effectiveMin = Math.max(mod.isRequired ? 1 : 0, Number(mod.minSelection || 0));
        const effectiveMax = mod.selectionType === 'single' ? 1 : Number(mod.maxSelection || 0);

        // Collect selected options for this group
        const selectedOpts = [];

        // 1. Check C1 structured selections if present
        if (draft.selectedByGroup && typeof draft.selectedByGroup === 'object') {
            const groupSelections = draft.selectedByGroup[mod.id] ||
                                    draft.selectedByGroup[mod.slug] ||
                                    draft.selectedByGroup[`item:${mod.id}`] ||
                                    draft.selectedByGroup[`category:${mod.slug}`] ||
                                    [];
            if (Array.isArray(groupSelections)) {
                groupSelections.forEach(sel => {
                    const match = (mod.options || []).find((o, idx) => {
                        const optId = getUniqueModifierOptionId(mod, o, idx);
                        return optId === sel || o.id === sel || o.name === sel;
                    });
                    if (match && !match.isOutOfStock) selectedOpts.push(match);
                });
            }
        }

        // 2. Check draft.selectedDetails if present
        if (selectedOpts.length === 0 && draft.selectedDetails && typeof draft.selectedDetails === 'object') {
            (mod.options || []).forEach((opt, optIdx) => {
                const optId = getUniqueModifierOptionId(mod, opt, optIdx);
                const detail = draft.selectedDetails[optId];
                if (detail && !opt.isOutOfStock) {
                    selectedOpts.push(opt);
                }
            });
        }

        // 3. Check single selections
        if (selectedOpts.length === 0 && mod.selectionType === 'single' && draft.single) {
            (mod.options || []).forEach((opt, optIdx) => {
                if (isOptionSelectedInSingle(draft, mod, opt, optIdx) && !opt.isOutOfStock) {
                    selectedOpts.push(opt);
                }
            });
        }

        // 4. Check multiple selections
        if (selectedOpts.length === 0 && mod.selectionType === 'multiple' && draft.multiple) {
            (mod.options || []).forEach((opt, optIdx) => {
                if (isOptionSelectedInMultiple(draft, mod, opt, optIdx) && !opt.isOutOfStock) {
                    selectedOpts.push(opt);
                }
            });
        }

        const count = selectedOpts.length;

        // Check if all options in a required group are out of stock
        const availableOptions = (mod.options || []).filter(o => !o.isOutOfStock);
        if (effectiveMin > 0 && availableOptions.length === 0) {
            return {
                valid: false,
                group: mod,
                message: `「${mod.name}」選項已全數售完，暫時無法點選`,
                reason: 'ALL_OOS'
            };
        }

        // Check min selection
        if (count < effectiveMin) {
            const msg = (effectiveMin === 1)
                ? `請選擇「${mod.name}」`
                : `「${mod.name}」至少需選擇 ${effectiveMin} 項`;
            return {
                valid: false,
                group: mod,
                message: msg,
                reason: 'UNDER_MIN',
                missingCount: effectiveMin - count
            };
        }

        // Check max selection
        if (effectiveMax > 0 && count > effectiveMax) {
            return {
                valid: false,
                group: mod,
                message: `「${mod.name}」最多只能選擇 ${effectiveMax} 項`,
                reason: 'EXCEEDED_MAX'
            };
        }
    }

    return { valid: true };
}
window.validateModifierDraft = validateModifierDraft;

// --- COMBO DRINKS (OPTIONAL INLINE DRINK SELECTOR) ---
function renderComboDrinksInline(origName, qty) {
    const containerId = 'combo-container-combo-' + origName;
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (qty === 0) return;

    const cDrinkData = window.comboDrinkData || comboDrinkData;
    if (!cDrinkData[origName]) cDrinkData[origName] = [];

    const bData = window.bootstrapData || bootstrapData;
    if (bData?.unifiedMenu) return;
    const drinksCategory = bData?.catalog?.find(c => c.slug === 'drinks');
    const drinkItems = drinksCategory ? drinksCategory.items : [];
    if (drinkItems.length === 0) return;

    const box = document.createElement('div');
    box.className = 'combo-drinks';
    box.innerHTML = '<div style="display:flex; align-items:center; gap:6px; font-weight:800; font-size:14px; margin-bottom:6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg><span>選擇附贈飲料</span></div>';

    for (let i = 1; i <= qty; i++) {
        let firstDrink = drinkItems.find(d => !d.isOutOfStock) || drinkItems[0];
        const firstDrinkName = firstDrink ? firstDrink.name : '';
        if (!cDrinkData[origName][i - 1]) cDrinkData[origName][i - 1] = firstDrinkName;

        let sel = document.createElement('select');
        for (let d of drinkItems) {
            let opt = document.createElement('option');
            opt.value = d.name;
            opt.text = `第 ${i} 份：${d.name}${d.isOutOfStock ? ' (已售完)' : ''}`;
            if (d.isOutOfStock && cDrinkData[origName][i - 1] !== d.name) {
                opt.disabled = true;
            }
            if (cDrinkData[origName][i - 1] === d.name) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.onchange = () => {
            cDrinkData[origName][i - 1] = sel.value;
            if (typeof updateTotal === 'function') updateTotal();
        };
        box.appendChild(sel);
    }
    container.appendChild(box);
}

function getCategoryModifiers(catSlug) {
    const bData = window.bootstrapData || bootstrapData;
    if (bData?.unifiedMenu) return [];
    const catObj = bData?.catalog?.find(c => c.slug === catSlug);
    if (!catObj) return [];
    if (catObj.allowCustomization === false) return [];
    // New schema: read catObj.modifierGroups directly
    if (Array.isArray(catObj.modifierGroups) && catObj.modifierGroups.length > 0) {
        return catObj.modifierGroups.map((mg, idx) => ({
            id: mg.id || `mg_cat_${idx}`,
            slug: mg.id || `mg_cat_${idx}`,
            name: mg.name,
            source: 'category',
            selectionType: mg.selectionType || mg.selection_type || 'single',
            isRequired: Boolean(mg.isRequired || mg.is_required),
            minSelection: mg.minSelection ?? mg.min_selection,
            maxSelection: mg.maxSelection ?? mg.max_selection,
            options: (mg.options || []).map(opt => ({
                id: opt.id,
                name: opt.name,
                price: Number(opt.price || 0),
                isDefault: Boolean(opt.isDefault || opt.is_default),
                isOutOfStock: Boolean(opt.isOutOfStock || opt.is_out_of_stock)
            }))
        }));
    }

    const applied = catObj.appliedModifiers || ['*'];
    if (applied.length === 0) return [];
    const allMods = bData?.modifiers || [];
    if (applied.includes('*')) return allMods;
    return allMods.filter(m => applied.includes(m.slug) || applied.includes(m.id));
}

function getItemModifiers(catSlug, itemName) {
    const bData = window.bootstrapData || bootstrapData;
    if (bData?.unifiedMenu) return [];
    if (typeof getEffectiveItemModifierGroups === 'function') {
        return getEffectiveItemModifierGroups(`${catSlug}_${itemName}`, catSlug);
    }
    const catObj = bData?.catalog?.find(c => c.slug === catSlug);
    const itemObj = catObj?.items?.find(it => it.name === itemName);
    const itemMods = [];
    if (itemObj && Array.isArray(itemObj.modifierGroups) && itemObj.modifierGroups.length > 0) {
        itemObj.modifierGroups.forEach((mg, idx) => {
            itemMods.push({
                id: mg.id || `mg_${idx}`,
                slug: mg.id || `mg_${idx}`,
                name: mg.name,
                selectionType: mg.selectionType || 'single',
                isRequired: Boolean(mg.isRequired),
                minSelection: mg.minSelection,
                maxSelection: mg.maxSelection,
                options: (mg.options || []).map(opt => ({
                    id: opt.id,
                    name: opt.name,
                    price: opt.price || 0,
                    isDefault: Boolean(opt.isDefault),
                    isOutOfStock: Boolean(opt.isOutOfStock)
                }))
            });
        });
    }
    const catMods = getCategoryModifiers(catSlug);
    return [...itemMods, ...catMods];
}

function initPortionDefaults(category, origName, portionIndex) {
    const key = category + '_' + origName;
    const cData = window.customizeData || customizeData;
    if (!cData[key]) cData[key] = [];
    if (!cData[key][portionIndex]) {
        const modifiers = getItemModifiers(category, origName);
        const defaultSingle = {};
        const defaultMulti = {};
        const defaultSubOpts = {};
        const selectedDetails = {};
        const getPrice = window.getModifierPrice || (typeof getModifierPrice === 'function' ? getModifierPrice : () => 0);

        modifiers.filter(m => m.selectionType === 'single').forEach(m => {
            const defOpt = (m.options || []).find(o => o.isDefault && !o.isOutOfStock) || (m.isRequired ? ((m.options || []).find(o => !o.isOutOfStock) || m.options[0]) : null);
            if (defOpt) {
                const optIdx = (m.options || []).indexOf(defOpt);
                const optId = getUniqueModifierOptionId(m, defOpt, optIdx);
                const targetKey = m.slug || m.id;
                defaultSingle[targetKey] = defOpt.name;
                if (m.id && m.slug && m.id !== m.slug) {
                    delete defaultSingle[m.id === targetKey ? m.slug : m.id];
                }
                selectedDetails[optId] = {
                    id: optId,
                    name: defOpt.name,
                    price: Number(defOpt.price !== undefined ? defOpt.price : getPrice(defOpt.name)),
                    groupId: m.id || m.slug,
                    groupName: m.name
                };
                const subs = defOpt.subOptions || defOpt.sub_options || [];
                if (subs.length > 0) {
                    const defSub = subs.find(s => s.isDefault || s.is_default) || subs[0];
                    defaultSubOpts[optId] = defSub;
                    defaultSubOpts[defOpt.name] = defSub;
                    selectedDetails[optId].subOption = defSub;
                }
            }
        });
        modifiers.filter(m => m.selectionType === 'multiple').forEach(m => {
            (m.options || []).forEach((o, optIdx) => {
                if (o.isDefault && !o.isOutOfStock) {
                    const optId = getUniqueModifierOptionId(m, o, optIdx);
                    defaultMulti[o.name] = true;
                    defaultMulti[optId] = true;
                    selectedDetails[optId] = {
                        id: optId,
                        name: o.name,
                        price: Number(o.price !== undefined ? o.price : getPrice(o.name)),
                        groupId: m.id || m.slug,
                        groupName: m.name
                    };
                    const subs = o.subOptions || o.sub_options || [];
                    if (subs.length > 0) {
                        const defSub = subs.find(s => s.isDefault || s.is_default) || subs[0];
                        defaultSubOpts[optId] = defSub;
                        defaultSubOpts[o.name] = defSub;
                        selectedDetails[optId].subOption = defSub;
                    }
                }
            });
        });
        cData[key][portionIndex] = { single: defaultSingle, multiple: defaultMulti, subOptions: defaultSubOpts, selectedDetails, note: '' };
    }
    return cData[key][portionIndex];
}

// --- CUSTOMIZE POPUP (SCHEMA-DRIVEN MODIFIERS POPUP) ---
function openItemCustomizeModal(category, origName, targetPortionIndex) {
    if (typeof checkDesktopAuthGuard === 'function' && !checkDesktopAuthGuard()) return;
    const key = category + '_' + origName;
    const cartObj = window.cart || cart || {};
    const currentQty = cartObj[key] || 0;
    const portionIdx = (typeof targetPortionIndex === 'number') ? targetPortionIndex : currentQty;
    const isAddingNew = portionIdx >= currentQty;

    const modifiers = getItemModifiers(category, origName);
    if (!modifiers || modifiers.length === 0) {
        if (isAddingNew && typeof updateQty === 'function') {
            cartObj[key] = (cartObj[key] || 0) + 1;
            const qtySpan = document.getElementById('qty-' + category + '-' + origName);
            if (qtySpan) {
                qtySpan.innerText = cartObj[key];
                qtySpan.style.color = 'var(--primary)';
            }
            if (typeof updateTotal === 'function') updateTotal();
        }
        return;
    }

    const cData = window.customizeData || customizeData || {};
    window.customizeData = cData;
    if (!cData[key]) cData[key] = [];

    // Draft portion data (deep clone existing or init defaults)
    const existing = cData[key][portionIdx];
    let draft = null;
    if (existing) {
        draft = JSON.parse(JSON.stringify(existing));
        if (!draft.subOptions) draft.subOptions = {};
        if (!draft.selectedDetails) draft.selectedDetails = {};
    } else {
        const defaultSingle = {};
        const defaultSubOpts = {};
        const defaultMulti = {};
        const defaultDetails = {};
        const getPrice = window.getModifierPrice || (typeof getModifierPrice === 'function' ? getModifierPrice : () => 0);

        modifiers.filter(m => m.selectionType === 'single').forEach(m => {
            const defOpt = (m.options || []).find(o => o.isDefault && !o.isOutOfStock);
            if (defOpt) {
                const optIdx = (m.options || []).indexOf(defOpt);
                const optId = getUniqueModifierOptionId(m, defOpt, optIdx);
                const targetKey = m.slug || m.id;
                defaultSingle[targetKey] = defOpt.name;
                if (m.id && m.slug && m.id !== m.slug) {
                    delete defaultSingle[m.id === targetKey ? m.slug : m.id];
                }
                defaultDetails[optId] = {
                    id: optId,
                    name: defOpt.name,
                    price: Number(defOpt.price !== undefined ? defOpt.price : getPrice(defOpt.name)),
                    groupId: m.id || m.slug,
                    groupName: m.name
                };
                const subs = defOpt.subOptions || defOpt.sub_options || [];
                if (subs.length > 0) {
                    const defSub = subs.find(s => s.isDefault || s.is_default) || subs[0];
                    defaultSubOpts[optId] = defSub;
                    defaultSubOpts[defOpt.name] = defSub;
                    defaultDetails[optId].subOption = defSub;
                }
            }
        });
        modifiers.filter(m => m.selectionType === 'multiple').forEach(m => {
            const maxAllowed = Number(m.maxSelection || 0) || 999;
            let selectedInGroup = 0;
            (m.options || []).forEach((o, optIdx) => {
                if (o.isDefault && !o.isOutOfStock && selectedInGroup < maxAllowed) {
                    const optId = getUniqueModifierOptionId(m, o, optIdx);
                    defaultMulti[optId] = true;
                    defaultDetails[optId] = {
                        id: optId,
                        name: o.name,
                        price: Number(o.price !== undefined ? o.price : getPrice(o.name)),
                        groupId: m.id || m.slug,
                        groupName: m.name
                    };
                    const subs = o.subOptions || o.sub_options || [];
                    if (subs.length > 0) {
                        const defSub = subs.find(s => s.isDefault || s.is_default) || subs[0];
                        defaultSubOpts[optId] = defSub;
                        defaultSubOpts[o.name] = defSub;
                        defaultDetails[optId].subOption = defSub;
                    }
                    selectedInGroup++;
                }
            });
        });
        draft = { single: defaultSingle, multiple: defaultMulti, subOptions: defaultSubOpts, selectedDetails: defaultDetails, note: '' };
    }

    // Resolve item info and price
    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (k => ({ origName, displayName: origName, price: 0 })));
    const itemInfo = resolveFn(key);
    const basePrice = Number(itemInfo?.basePrice ?? itemInfo?.targetItem?.price ?? itemInfo?.price ?? 0);

    // Close any previous open popup
    if (typeof closePopup === 'function') closePopup();

    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    overlay.id = 'item-customize-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) closePopup(); };

    const box = document.createElement('div');
    box.className = 'popup-box';

    const portionLabel = isAddingNew
        ? (currentQty > 0 ? `加點第 ${portionIdx + 1} 份` : `基本售價 $${basePrice}`)
        : `編輯第 ${portionIdx + 1} 份`;

    let portionTabsHTML = '';
    if (currentQty > 0) {
        portionTabsHTML = `
            <div class="portion-tabs-row" style="display: flex; gap: 8px; overflow-x: auto; margin: 4px 0 12px 0; padding-bottom: 4px;">
                ${Array.from({ length: currentQty }).map((_, i) => `
                    <button type="button" class="portion-tab-btn" data-portion="${i}" 
                            style="padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 700; border: 1.5px solid ${i === portionIdx ? 'var(--primary)' : '#e2e8f0'}; background: ${i === portionIdx ? '#f0fdf4' : '#fff'}; color: ${i === portionIdx ? 'var(--primary)' : '#475569'}; cursor: pointer; white-space: nowrap;">
                        第 ${i + 1} 份
                    </button>
                `).join('')}
                <button type="button" class="portion-tab-btn" data-portion="${currentQty}" 
                        style="padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 700; border: 1.5px dashed ${portionIdx >= currentQty ? 'var(--primary)' : '#cbd5e1'}; background: ${portionIdx >= currentQty ? '#f0fdf4' : '#f8fafc'}; color: ${portionIdx >= currentQty ? 'var(--primary)' : '#64748b'}; cursor: pointer; white-space: nowrap;">
                    + 加點第 ${currentQty + 1} 份
                </button>
            </div>
        `;
    }

    const copyPrevBtnHTML = (portionIdx > 0 && isAddingNew && cData[key] && cData[key][portionIdx - 1]) ? `
        <button type="button" class="btn-copy-prev-custom" style="width: 100%; border: 1px dashed #cbd5e1; background: #f8fafc; color: #475569; font-size: 13px; font-weight: 700; border-radius: 10px; padding: 8px 12px; margin-bottom: 10px; cursor: pointer;">
            與上一份相同
        </button>
    ` : '';

    box.innerHTML = `
        <div class="popup-header">
            <div>
                <div style="font-size: 18px; font-weight: 900; color: #0f172a;">${origName}</div>
                <div style="font-size: 13px; font-weight: 600; color: #64748b; margin-top: 2px;">${portionLabel}</div>
            </div>
            <div class="close-btn" onclick="closePopup()">✕</div>
        </div>
        ${portionTabsHTML}
        ${copyPrevBtnHTML}
        <div class="customize-modal-body" style="display: flex; flex-direction: column; gap: 14px; max-height: 55vh; overflow-y: auto; padding-right: 4px;">
        </div>
        <div class="customize-modal-footer" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #f1f5f9;">
            <button type="button" class="btn-send btn-customize-confirm" style="width: 100%; min-height: 48px; font-size: 16px; font-weight: 800; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                <span>${isAddingNew ? '加入購物車' : '確認修改'}</span>
            </button>
        </div>
    `;

    box.querySelectorAll('.portion-tab-btn').forEach(btn => {
        btn.onclick = () => {
            const target = Number(btn.getAttribute('data-portion'));
            openItemCustomizeModal(category, origName, target);
        };
    });

    const copyBtn = box.querySelector('.btn-copy-prev-custom');
    if (copyBtn) {
        copyBtn.onclick = () => {
            const prev = cData[key] && cData[key][portionIdx - 1];
            if (prev) {
                draft = JSON.parse(JSON.stringify(prev));
                renderModalOptions();
            }
        };
    }

    const bodyEl = box.querySelector('.customize-modal-body');
    const confirmBtn = box.querySelector('.btn-customize-confirm');

    function renderModalOptions() {
        bodyEl.innerHTML = '';
        const getPrice = window.getModifierPrice || (typeof getModifierPrice === 'function' ? getModifierPrice : () => 0);

        modifiers.forEach(mod => {
            const section = document.createElement('div');
            section.className = 'modifier-section';
            section.style.marginBottom = '8px';

            const effectiveMin = Math.max(mod.isRequired ? 1 : 0, Number(mod.minSelection || 0));
            const effectiveMax = mod.selectionType === 'single' ? 1 : Number(mod.maxSelection || 0);

            let reqBadge = '';
            if (effectiveMin > 0) {
                reqBadge = effectiveMin === 1 
                    ? `<span class="modifier-required-badge">必選</span>` 
                    : `<span class="modifier-required-badge">必選 (至少 ${effectiveMin} 項)</span>`;
            } else {
                reqBadge = effectiveMax > 0 
                    ? `<span class="modifier-optional-badge">可選 (最多 ${effectiveMax} 項)</span>` 
                    : `<span class="modifier-optional-badge">可選</span>`;
            }

            let sectionInner = `
                <div class="modifier-group-title" style="margin-bottom: 8px;">
                    <span style="font-size: 14px; font-weight: 800; color: #1e293b;">${mod.name}</span>
                    ${reqBadge}
                </div>
            `;

            if (mod.selectionType === 'single') {
                sectionInner += `<div class="modifier-pills-row">`;
                (mod.options || []).forEach((opt, optIdx) => {
                    const isOos = Boolean(opt.isOutOfStock);
                    const optId = getUniqueModifierOptionId(mod, opt, optIdx);
                    const isSelected = isOptionSelectedInSingle(draft, mod, opt, optIdx);
                    const price = Number(opt.price !== undefined ? opt.price : getPrice(opt.name));
                    const priceText = price > 0 ? ` (+$${price})` : '';
                    const oosBadge = isOos ? `<span class="modifier-oos-tag">已售完</span>` : '';
                    const minSpend = Number(opt.minOrderSubtotal || opt.min_order_amount || 0);
                    const minSpendBadge = minSpend > 0 ? `<span style="font-size: 10px; color: #ea580c; background: #fff7ed; border: 1px solid #fed7aa; padding: 1px 4px; border-radius: 4px; margin-left: 4px;">滿$${minSpend}可選</span>` : '';
                    sectionInner += `
                        <div class="modifier-pill ${isSelected ? 'active' : ''} ${isOos ? 'disabled' : ''}" 
                             data-mod-slug="${mod.slug}" data-mod-id="${mod.id || mod.slug}" data-opt-id="${optId}" data-opt-name="${opt.name}" data-opt-idx="${optIdx}">
                            <span>${opt.name}${priceText}</span>${oosBadge}${minSpendBadge}
                        </div>
                    `;
                });
                sectionInner += `</div>`;

                // Render Sub-options for selected single option if available
                (mod.options || []).forEach((opt, optIdx) => {
                    const optId = getUniqueModifierOptionId(mod, opt, optIdx);
                    const isSelected = isOptionSelectedInSingle(draft, mod, opt, optIdx);
                    const subList = opt.subOptions || opt.sub_options || [];
                    if (isSelected && Array.isArray(subList) && subList.length > 0) {
                        if (!draft.subOptions) draft.subOptions = {};
                        if (!draft.subOptions[optId] && !draft.subOptions[opt.name]) {
                            const defSub = subList.find(s => s.isDefault || s.is_default) || subList[0];
                            draft.subOptions[optId] = defSub;
                            draft.subOptions[opt.name] = defSub;
                        }
                        const currentSub = draft.subOptions[optId] || draft.subOptions[opt.name];
                        const activeSubId = String(currentSub?.id);
                        sectionInner += `
                            <div class="sub-options-container" style="display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; padding: 8px 12px; background: #f8fafc; border-left: 3px solid var(--primary, #0ea5e9); border-radius: 8px; width: 100%; box-sizing: border-box;">
                                <div style="font-size: 11px; font-weight: 700; color: #64748b; width: 100%; margin-bottom: 2px;">↳ ${opt.name} - 規格 / 配料:</div>
                                ${subList.map(sub => {
                                    const isSubActive = String(sub.id) === activeSubId;
                                    const subP = Number(sub.price || 0);
                                    const subPText = subP > 0 ? ` (+$${subP})` : '';
                                    return `
                                        <button type="button" class="sub-option-chip" data-parent-opt-id="${optId}" data-parent-opt="${opt.name}" data-sub-id="${sub.id}"
                                                style="padding: 4px 10px; font-size: 12px; border-radius: 6px; border: 1.5px solid ${isSubActive ? 'var(--primary, #0ea5e9)' : '#cbd5e1'}; background: ${isSubActive ? 'rgba(14, 165, 233, 0.1)' : '#fff'}; color: ${isSubActive ? 'var(--primary, #0ea5e9)' : '#334155'}; font-weight: ${isSubActive ? '700' : '500'}; cursor: pointer;">
                                            ${sub.name}${subPText}
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        `;
                    }
                });
            } else if (mod.selectionType === 'multiple') {
                sectionInner += `<div class="modifier-checkbox-grid">`;
                (mod.options || []).forEach((opt, optIdx) => {
                    const isOos = Boolean(opt.isOutOfStock);
                    const optId = getUniqueModifierOptionId(mod, opt, optIdx);
                    const isChecked = isOptionSelectedInMultiple(draft, mod, opt, optIdx);
                    const price = Number(opt.price !== undefined ? opt.price : getPrice(opt.name));
                    const priceText = isOos ? `<span class="modifier-oos-tag">已售完</span>` : (price > 0 ? `+$${price}` : '$0');
                    const minSpend = Number(opt.minOrderSubtotal || opt.min_order_amount || 0);
                    const minSpendBadge = minSpend > 0 ? `<span style="font-size: 10px; color: #ea580c; background: #fff7ed; border: 1px solid #fed7aa; padding: 1px 4px; border-radius: 4px; margin-left: 4px;">滿$${minSpend}可選</span>` : '';
                    sectionInner += `
                        <div class="modifier-checkbox-chip ${isChecked ? 'active' : ''} ${isOos ? 'disabled' : ''}" 
                             data-mod-slug="${mod.slug}" data-mod-id="${mod.id || mod.slug}" data-opt-id="${optId}" data-opt-name="${opt.name}" data-opt-idx="${optIdx}">
                            <span>${opt.name}${minSpendBadge}</span>
                            <span style="font-size: 12px; opacity: 0.85;">${priceText}</span>
                        </div>
                    `;
                });
                sectionInner += `</div>`;

                // Render Sub-options for selected multiple options if available
                (mod.options || []).forEach((opt, optIdx) => {
                    const optId = getUniqueModifierOptionId(mod, opt, optIdx);
                    const isChecked = isOptionSelectedInMultiple(draft, mod, opt, optIdx);
                    const subList = opt.subOptions || opt.sub_options || [];
                    if (isChecked && Array.isArray(subList) && subList.length > 0) {
                        if (!draft.subOptions) draft.subOptions = {};
                        if (!draft.subOptions[optId] && !draft.subOptions[opt.name]) {
                            const defSub = subList.find(s => s.isDefault || s.is_default) || subList[0];
                            draft.subOptions[optId] = defSub;
                            draft.subOptions[opt.name] = defSub;
                        }
                        const currentSub = draft.subOptions[optId] || draft.subOptions[opt.name];
                        const activeSubId = String(currentSub?.id);
                        sectionInner += `
                            <div class="sub-options-container" style="display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; padding: 8px 12px; background: #f8fafc; border-left: 3px solid var(--primary, #0ea5e9); border-radius: 8px; width: 100%; box-sizing: border-box;">
                                <div style="font-size: 11px; font-weight: 700; color: #64748b; width: 100%; margin-bottom: 2px;">↳ ${opt.name} - 規格 / 配料:</div>
                                ${subList.map(sub => {
                                    const isSubActive = String(sub.id) === activeSubId;
                                    const subP = Number(sub.price || 0);
                                    const subPText = subP > 0 ? ` (+$${subP})` : '';
                                    return `
                                        <button type="button" class="sub-option-chip" data-parent-opt-id="${optId}" data-parent-opt="${opt.name}" data-sub-id="${sub.id}"
                                                style="padding: 4px 10px; font-size: 12px; border-radius: 6px; border: 1.5px solid ${isSubActive ? 'var(--primary, #0ea5e9)' : '#cbd5e1'}; background: ${isSubActive ? 'rgba(14, 165, 233, 0.1)' : '#fff'}; color: ${isSubActive ? 'var(--primary, #0ea5e9)' : '#334155'}; font-weight: ${isSubActive ? '700' : '500'}; cursor: pointer;">
                                            ${sub.name}${subPText}
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        `;
                    }
                });
            }

            section.innerHTML = sectionInner;

            section.querySelectorAll('.modifier-pill').forEach(pill => {
                pill.onclick = () => {
                    if (pill.classList.contains('disabled')) return;
                    const modSlug = pill.getAttribute('data-mod-slug');
                    const modId = pill.getAttribute('data-mod-id') || modSlug;
                    const optId = pill.getAttribute('data-opt-id');
                    const optName = pill.getAttribute('data-opt-name');
                    const optIdx = Number(pill.getAttribute('data-opt-idx') || 0);
                    const opt = (mod.options || [])[optIdx] || (mod.options || []).find(o => o.name === optName);

                    if (!draft.single) draft.single = {};
                    if (!draft.selectedDetails) draft.selectedDetails = {};

                    const isReq = Boolean(mod.isRequired || Number(mod.minSelection || 0) > 0);
                    const wasSelected = isOptionSelectedInSingle(draft, mod, opt, optIdx);

                    // Remove previous selection for this modifier group from selectedDetails & subOptions
                    (mod.options || []).forEach((o, idx) => {
                        const oId = getUniqueModifierOptionId(mod, o, idx);
                        delete draft.selectedDetails[oId];
                        if (draft.subOptions) {
                            delete draft.subOptions[oId];
                            delete draft.subOptions[o.name];
                        }
                    });

                    // Optional single can be toggled/deselected
                    if (!isReq && wasSelected) {
                        delete draft.single[modSlug];
                        delete draft.single[modId];
                    } else {
                        delete draft.single[modSlug];
                        delete draft.single[modId];
                        const targetKey = modSlug || modId;
                        draft.single[targetKey] = optName;

                        const optPrice = Number(opt?.price !== undefined ? opt.price : getPrice(optName));
                        draft.selectedDetails[optId] = {
                            id: optId,
                            name: optName,
                            price: optPrice,
                            groupId: modId,
                            groupName: mod.name
                        };

                        const subs = opt?.subOptions || opt?.sub_options || [];
                        if (subs.length > 0) {
                            const defSub = subs.find(s => s.isDefault || s.is_default) || subs[0];
                            if (!draft.subOptions) draft.subOptions = {};
                            draft.subOptions[optId] = defSub;
                            draft.subOptions[optName] = defSub;
                            draft.selectedDetails[optId].subOption = defSub;
                        }
                    }
                    renderModalOptions();
                };
            });

            section.querySelectorAll('.modifier-checkbox-chip').forEach(chip => {
                chip.onclick = () => {
                    if (chip.classList.contains('disabled')) return;
                    const modSlug = chip.getAttribute('data-mod-slug');
                    const modId = chip.getAttribute('data-mod-id') || modSlug;
                    const optId = chip.getAttribute('data-opt-id');
                    const optName = chip.getAttribute('data-opt-name');
                    const optIdx = Number(chip.getAttribute('data-opt-idx') || 0);
                    const opt = (mod.options || [])[optIdx] || (mod.options || []).find(o => o.name === optName);

                    if (!draft.multiple) draft.multiple = {};
                    if (!draft.selectedDetails) draft.selectedDetails = {};

                    const isCurrentlySelected = isOptionSelectedInMultiple(draft, mod, opt, optIdx);

                    if (isCurrentlySelected) {
                        if (draft.subOptions) {
                            delete draft.subOptions[optId];
                            delete draft.subOptions[optName];
                        }
                        delete draft.selectedDetails[optId];
                        delete draft.multiple[optId];
                        delete draft.multiple[optName];
                        if (Array.isArray(draft.multiple[modSlug])) {
                            draft.multiple[modSlug] = draft.multiple[modSlug].filter(x => x !== optId && x !== optName);
                        }
                        if (Array.isArray(draft.multiple[modId])) {
                            draft.multiple[modId] = draft.multiple[modId].filter(x => x !== optId && x !== optName);
                        }
                    } else {
                        // Check maxSelection before adding
                        const max = Number(mod.maxSelection || 0);
                        if (max > 0) {
                            let currentCount = 0;
                            (mod.options || []).forEach((o, idx) => {
                                if (isOptionSelectedInMultiple(draft, mod, o, idx)) currentCount++;
                            });
                            if (currentCount >= max) {
                                const limitMsg = `「${mod.name}」最多只能選擇 ${max} 項`;
                                if (typeof customAlert === 'function') customAlert(limitMsg);
                                else alert(limitMsg);
                                return;
                            }
                        }
                        draft.multiple[optId] = true;
                        const optPrice = Number(opt?.price !== undefined ? opt.price : getPrice(optName));
                        draft.selectedDetails[optId] = {
                            id: optId,
                            name: optName,
                            price: optPrice,
                            groupId: modId,
                            groupName: mod.name
                        };
                        const subs = opt?.subOptions || opt?.sub_options || [];
                        if (subs.length > 0) {
                            const defSub = subs.find(s => s.isDefault || s.is_default) || subs[0];
                            if (!draft.subOptions) draft.subOptions = {};
                            draft.subOptions[optId] = defSub;
                            draft.subOptions[optName] = defSub;
                            draft.selectedDetails[optId].subOption = defSub;
                        }
                    }
                    renderModalOptions();
                };
            });

            // Bind Sub-options click handler
            section.querySelectorAll('.sub-option-chip').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const parentOptId = btn.getAttribute('data-parent-opt-id');
                    const parentOptName = btn.getAttribute('data-parent-opt');
                    const subId = btn.getAttribute('data-sub-id');
                    let parentOpt = null;
                    for (let i = 0; i < (mod.options || []).length; i++) {
                        const o = mod.options[i];
                        const uId = getUniqueModifierOptionId(mod, o, i);
                        if (uId === parentOptId || o.name === parentOptName) {
                            parentOpt = o;
                            break;
                        }
                    }
                    if (parentOpt) {
                        const subList = parentOpt.subOptions || parentOpt.sub_options || [];
                        const sub = subList.find(s => String(s.id) === String(subId));
                        if (sub) {
                            if (!draft.subOptions) draft.subOptions = {};
                            if (parentOptId) draft.subOptions[parentOptId] = sub;
                            if (parentOptName) draft.subOptions[parentOptName] = sub;
                            if (draft.selectedDetails && parentOptId && draft.selectedDetails[parentOptId]) {
                                draft.selectedDetails[parentOptId].subOption = sub;
                            }
                            renderModalOptions();
                        }
                    }
                };
            });

            bodyEl.appendChild(section);
        });

        // Note input
        const noteDiv = document.createElement('div');
        noteDiv.innerHTML = `
            <label style="font-size: 13px; font-weight: 800; color: #475569; display: block; margin: 12px 0 6px 0;">個別備註</label>
            <input type="text" maxlength="50" value="${(draft.note || '').replace(/"/g, '&quot;')}"
                   class="customize-note-input"
                   style="width: 100%; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 10px 14px; font-size: 14px; color: #1e293b; background: #fff; outline: none; box-sizing: border-box;">
        `;
        const noteInput = noteDiv.querySelector('.customize-note-input');
        noteInput.oninput = (e) => { draft.note = e.target.value; };
        bodyEl.appendChild(noteDiv);

        // Calculate dynamic total
        let extra = 0;
        if (draft.selectedDetails && Object.keys(draft.selectedDetails).length > 0) {
            for (const detail of Object.values(draft.selectedDetails)) {
                if (!detail) continue;
                extra += Number(detail.price || 0);
                if (detail.subOption && detail.subOption.price) {
                    extra += Number(detail.subOption.price || 0);
                }
            }
        } else {
            if (typeof calculatePortionExtra === 'function') {
                extra = calculatePortionExtra(key, draft);
            } else {
                if (draft.single) {
                    Object.values(draft.single).forEach(opt => { 
                        extra += getPrice(opt); 
                        if (draft.subOptions && draft.subOptions[opt]) {
                            extra += Number(draft.subOptions[opt].price || 0);
                        }
                    });
                }
                if (draft.multiple) {
                    Object.keys(draft.multiple).forEach(opt => {
                        if (Array.isArray(draft.multiple[opt])) {
                            draft.multiple[opt].forEach(subOpt => { 
                                extra += getPrice(subOpt); 
                                if (draft.subOptions && draft.subOptions[subOpt]) {
                                    extra += Number(draft.subOptions[subOpt].price || 0);
                                }
                            });
                        } else if (draft.multiple[opt]) {
                            extra += getPrice(opt);
                            if (draft.subOptions && draft.subOptions[opt]) {
                                extra += Number(draft.subOptions[opt].price || 0);
                            }
                        }
                    });
                }
            }
        }
        const totalPrice = basePrice + extra;

        const actionText = isAddingNew ? '加入購物車' : '確認修改';
        const valRes = validateModifierDraft(modifiers, draft);
        if (!valRes.valid) {
            confirmBtn.style.opacity = '0.75';
            confirmBtn.style.background = '#64748b';
            confirmBtn.innerHTML = `
                <span>${valRes.message || actionText}</span>
                <span style="opacity: 0.85;">·</span>
                <span>$${totalPrice}</span>
            `;
        } else {
            confirmBtn.style.opacity = '1';
            confirmBtn.style.background = 'var(--primary)';
            confirmBtn.innerHTML = `
                <span>${actionText}</span>
                <span style="opacity: 0.85;">·</span>
                <span>$${totalPrice}</span>
            `;
        }
    }

    confirmBtn.onclick = () => {
        // Validate required/min/max modifier groups
        const valRes = validateModifierDraft(modifiers, draft);
        if (!valRes.valid) {
            if (typeof customAlert === 'function') customAlert(valRes.message);
            else alert(valRes.message);
            return;
        }

        // Save portion
        cData[key][portionIdx] = JSON.parse(JSON.stringify(draft));

        if (isAddingNew) {
            cartObj[key] = (cartObj[key] || 0) + 1;
        }

        // Update card UI
        const qtySpan = document.getElementById('qty-' + category + '-' + origName);
        if (qtySpan) {
            qtySpan.innerText = cartObj[key];
            qtySpan.style.color = cartObj[key] > 0 ? 'var(--primary)' : 'inherit';
        }

        const btn = document.getElementById('customize-btn-' + category + '-' + origName);
        if (btn) {
            btn.style.display = cartObj[key] > 0 ? 'flex' : 'none';
        }

        if (typeof updateTotal === 'function') updateTotal();
        closePopup();
    };

    renderModalOptions();

    overlay.appendChild(box);
    overlay._savedScrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${overlay._savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';

    document.body.appendChild(overlay);
    currentPopup = overlay;
    window.currentPopup = overlay;
}

function toggleCustomize(category, origName) {
    if (typeof checkDesktopAuthGuard === 'function' && !checkDesktopAuthGuard()) return;
    openItemCustomizeModal(category, origName, 0);
}

function updateCustomizeOkBtn(key) {
    const popup = window.currentPopup || currentPopup;
    if (!popup) return;
    const okBtn = popup.querySelector('.btn-customize-ok');
    if (!okBtn) return;
    const cData = window.customizeData || customizeData;
    const portions = cData ? cData[key] : null;
    let extra = 0;
    const getPrice = window.getModifierPrice || (typeof getModifierPrice === 'function' ? getModifierPrice : () => 0);
    if (Array.isArray(portions)) {
        portions.forEach(p => {
            if (p) {
                if (typeof calculatePortionExtra === 'function') {
                    extra += calculatePortionExtra(key, p);
                } else {
                    if (p.single) {
                        Object.values(p.single).forEach(optName => {
                            extra += getPrice(optName);
                        });
                    }
                    if (p.multiple) {
                        Object.keys(p.multiple).forEach(optName => {
                            if (p.multiple[optName]) {
                                extra += getPrice(optName);
                            }
                        });
                    }
                }
            }
        });
    }
    okBtn.innerText = extra > 0 ? `完成設定 (+$${extra})` : '完成設定';
}

// Dynamic tenant modifier helpers
function selectSingleModifier(key, portionIdx, modSlug, optName, el) {
    if (el && el.classList.contains('disabled')) return;
    const cData = window.customizeData || customizeData;
    if (!cData[key]) cData[key] = [];
    if (!cData[key][portionIdx]) cData[key][portionIdx] = { single: {}, multiple: {}, note: '' };
    if (!cData[key][portionIdx].single) cData[key][portionIdx].single = {};
    cData[key][portionIdx].single[modSlug] = optName;

    const parentRow = el.parentElement;
    if (parentRow) parentRow.querySelectorAll('.modifier-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    updateCustomizeOkBtn(key);
    if (typeof updateTotal === 'function') updateTotal();
    else if (typeof window.updateTotal === 'function') window.updateTotal();
}

function toggleMultipleModifier(key, portionIdx, optName, el) {
    if (el && el.classList.contains('disabled')) return;
    const cData = window.customizeData || customizeData;
    if (!cData[key]) cData[key] = [];
    if (!cData[key][portionIdx]) cData[key][portionIdx] = { single: {}, multiple: {}, note: '' };
    if (!cData[key][portionIdx].multiple) cData[key][portionIdx].multiple = {};

    const isCurrentlyChecked = Boolean(cData[key][portionIdx].multiple[optName]);
    if (isCurrentlyChecked) {
        delete cData[key][portionIdx].multiple[optName];
        el.classList.remove('active');
    } else {
        cData[key][portionIdx].multiple[optName] = true;
        el.classList.add('active');
    }
    updateCustomizeOkBtn(key);
    if (typeof updateTotal === 'function') updateTotal();
    else if (typeof window.updateTotal === 'function') window.updateTotal();
}

function saveCustomNote(key, portionIdx, val) {
    const cData = window.customizeData || customizeData;
    if (!cData) return;
    if (!cData[key]) cData[key] = [];
    if (!cData[key][portionIdx]) cData[key][portionIdx] = { single: {}, multiple: {}, note: '' };
    cData[key][portionIdx].note = String(val || '').slice(0, 50);
}

function closePopup() {
    const popup = window.currentPopup || currentPopup;
    if (popup) {
        const savedY = popup._savedScrollY || 0;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';

        popup.remove();
        currentPopup = null;
        window.currentPopup = null;

        setTimeout(() => {
            const origScroll = document.documentElement.style.scrollBehavior;
            document.documentElement.style.scrollBehavior = 'auto';
            window.scrollTo(0, savedY);
            document.documentElement.style.scrollBehavior = origScroll;
        }, 10);
    }
    if (typeof updateTotal === 'function') {
        updateTotal();
    } else if (typeof window.updateTotal === 'function') {
        window.updateTotal();
    }
}

// Window Public Bindings
window.renderComboDrinksInline = renderComboDrinksInline;
window.getCategoryModifiers = getCategoryModifiers;
window.getItemModifiers = getItemModifiers;
window.initPortionDefaults = initPortionDefaults;
window.openItemCustomizeModal = openItemCustomizeModal;
window.toggleCustomize = toggleCustomize;
window.selectSingleModifier = selectSingleModifier;
window.toggleMultipleModifier = toggleMultipleModifier;
window.saveCustomNote = saveCustomNote;
window.closePopup = closePopup;
window.getUniqueModifierOptionId = getUniqueModifierOptionId;
window.isOptionSelectedInSingle = isOptionSelectedInSingle;
window.isOptionSelectedInMultiple = isOptionSelectedInMultiple;
