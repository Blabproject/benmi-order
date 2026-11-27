// ==========================================
// Benmi Client Menu - Module: Core, Environment & LIFF Auth
// ==========================================

// --- WORKER BASE & TENANT RESOLUTION ---
const WORKER_BASE = window.WORKER_BASE;

function getTenantIdFromUrl() {
    return typeof extractTenantId === 'function' ? extractTenantId() : (window.__INITIAL_TENANT_ID || "benmi");
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

// Shared State Declarations
window.storeConfig = window.storeConfig || null;
window.bootstrapData = window.bootstrapData || null;
window.cart = window.cart || {};
window.customizeData = window.customizeData || {};
window.comboDrinkData = window.comboDrinkData || {};
window.bundleCartData = window.bundleCartData || {};
window.modPriceMap = window.modPriceMap || {};
window.currentPopup = window.currentPopup || null;
window.alertCallback = window.alertCallback || null;
window.isSubmitting = false;
window.currentDiningOption = 'takeaway';
window.isPickupTimeManuallyChanged = false;
window.indexOrdersETag = "";

var storeConfig = window.storeConfig;
var bootstrapData = window.bootstrapData;
var cart = window.cart;
var customizeData = window.customizeData;
var comboDrinkData = window.comboDrinkData;
var currentPopup = window.currentPopup;
var alertCallback = window.alertCallback;
var isPickupTimeManuallyChanged = false;
var indexOrdersETag = "";

var itemTranslations = {
    "燒肉": "Braised Pork",
    "火腿": "Vietnamese Ham",
    "雞肉": "Shredded Chicken",
    "烤肉": "Grilled Meat",
    "雙層烤肉": "Double Cheese & Meat",
    "綜合": "Combination Special",
    "越南咖啡": "Vietnamese Milk Coffee",
    "豆漿": "Soy Milk",
    "紅茶": "Black Tea",
    "可樂": "Coca-Cola",
    "雪碧": "Sprite"
};
window.itemTranslations = itemTranslations;

// Dynamic Modifiers Price Resolution Helpers
function buildModifierPriceMap(bData) {
    const data = bData || window.bootstrapData || (typeof bootstrapData !== 'undefined' ? bootstrapData : null);
    const map = {};
    if (data?.modifiers && Array.isArray(data.modifiers)) {
        data.modifiers.forEach(mod => {
            (mod.options || []).forEach(opt => {
                const p = Number(opt.price) || 0;
                if (opt.name) {
                    const name = String(opt.name).trim();
                    map[name] = p;
                    // Provide dual mapping for option names with or without "加" prefix
                    if (name.startsWith('加')) {
                        const stripped = name.substring(1).trim();
                        if (map[stripped] === undefined) map[stripped] = p;
                    } else {
                        const added = '加' + name;
                        if (map[added] === undefined) map[added] = p;
                    }
                }
                if (opt.id) {
                    map[opt.id] = p;
                }
            });
        });
    }
    // Also index category and item-level modifier groups across all catalog categories
    if (data?.catalog && Array.isArray(data.catalog)) {
        data.catalog.forEach(cat => {
            const catGroups = cat.modifierGroups || cat.modifier_groups;
            if (Array.isArray(catGroups)) {
                catGroups.forEach(grp => {
                    (grp.options || []).forEach(opt => {
                        const p = Number(opt.price) || 0;
                        if (opt.name) {
                            const name = String(opt.name).trim();
                            if (map[name] === undefined) map[name] = p;
                            if (name.startsWith('加')) {
                                const stripped = name.substring(1).trim();
                                if (map[stripped] === undefined) map[stripped] = p;
                            } else {
                                const added = '加' + name;
                                if (map[added] === undefined) map[added] = p;
                            }
                        }
                        if (opt.id && map[opt.id] === undefined) {
                            map[opt.id] = p;
                        }
                    });
                });
            }
            const items = Array.isArray(cat.items) ? cat.items : [cat];
            items.forEach(it => {
                const groups = it.modifierGroups || it.modifier_groups;
                if (Array.isArray(groups)) {
                    groups.forEach(grp => {
                        (grp.options || []).forEach(opt => {
                            const p = Number(opt.price) || 0;
                            if (opt.name) {
                                const name = String(opt.name).trim();
                                if (map[name] === undefined) map[name] = p;
                                if (name.startsWith('加')) {
                                    const stripped = name.substring(1).trim();
                                    if (map[stripped] === undefined) map[stripped] = p;
                                } else {
                                    const added = '加' + name;
                                    if (map[added] === undefined) map[added] = p;
                                }
                            }
                            if (opt.id && map[opt.id] === undefined) {
                                map[opt.id] = p;
                            }
                        });
                    });
                }
            });
        });
    }
    window.modPriceMap = map;
    return map;
}

function getEffectiveItemModifierGroups(itemOrKey, catSlugOrNull) {
    const bData = window.bootstrapData || (typeof bootstrapData !== 'undefined' ? bootstrapData : null);
    // Unified choices come exclusively from the canonical bundleRule projection.
    // Cached/mixed payloads may lack the per-item marker or contain renamed items.
    if (bData?.unifiedMenu) return [];
    let targetItem = null;
    let targetCatSlug = catSlugOrNull || '';

    if (itemOrKey && typeof itemOrKey === 'object') {
        targetItem = itemOrKey;
        if (!targetCatSlug && targetItem.categoryId && bData?.catalog) {
            const c = bData.catalog.find(cat => cat.id === targetItem.categoryId);
            if (c) targetCatSlug = c.slug;
        }
    } else if (typeof itemOrKey === 'string') {
        const parseFn = typeof parseCartKey === 'function' ? parseCartKey : (window.parseCartKey || (k => {
            const parts = k.split('_');
            return { catSlug: parts[0] || '', origName: parts.slice(1).join('_') || k };
        }));
        const { catSlug, origName } = parseFn(itemOrKey);
        targetCatSlug = targetCatSlug || catSlug;
        if (bData?.catalog) {
            for (const cat of bData.catalog) {
                if (!targetCatSlug || cat.slug === targetCatSlug) {
                    const found = (cat.items || []).find(it => it.name === origName || it.id === origName || it.id === itemOrKey);
                    if (found) {
                        targetItem = found;
                        targetCatSlug = cat.slug;
                        break;
                    }
                }
            }
        }
    }

    if (targetItem?.unifiedOptions) return [];
    const itemMods = [];
    if (targetItem) {
        const groups = targetItem.modifierGroups || targetItem.modifier_groups;
        if (Array.isArray(groups) && groups.length > 0) {
            groups.forEach((mg, idx) => {
                itemMods.push({
                    id: mg.id || `mg_item_${idx}`,
                    slug: mg.id || `mg_item_${idx}`,
                    name: mg.name,
                    ...(mg.i18n ? { i18n: mg.i18n } : {}),
                    source: 'item',
                    selectionType: mg.selectionType || mg.selection_type || 'single',
                    isRequired: Boolean(mg.isRequired || mg.is_required),
                    minSelection: mg.minSelection ?? mg.min_selection,
                    maxSelection: mg.maxSelection ?? mg.max_selection,
                    options: (mg.options || []).map(opt => ({
                        id: opt.id,
                        name: opt.name,
                        ...(opt.i18n ? { i18n: opt.i18n } : {}),
                        price: Number(opt.price || 0),
                        isDefault: Boolean(opt.isDefault || opt.is_default),
                        isOutOfStock: Boolean(opt.isOutOfStock || opt.is_out_of_stock),
                        ...(opt.subOptions || opt.sub_options ? { subOptions: opt.subOptions || opt.sub_options } : {}),
                        ...(opt.minOrderSubtotal != null || opt.min_order_amount != null ? { minOrderSubtotal: opt.minOrderSubtotal ?? opt.min_order_amount } : {}),
                        ...(opt.ruleErrorMessage ? { ruleErrorMessage: opt.ruleErrorMessage } : {})
                    }))
                });
            });
        }
    }

    // Category modifiers
    const catMods = [];
    if (targetCatSlug && bData?.catalog) {
        const catObj = bData.catalog.find(c => c.slug === targetCatSlug);
        if (catObj && catObj.allowCustomization !== false) {
            // New schema: check catObj.modifierGroups first
            if (Array.isArray(catObj.modifierGroups) && catObj.modifierGroups.length > 0) {
                const existingGids = new Set(itemMods.map(m => m.id));
                catObj.modifierGroups.forEach((mg, idx) => {
                    const gid = mg.id || `mg_cat_${idx}`;
                    if (!existingGids.has(gid)) {
                        catMods.push({
                            id: gid,
                            slug: gid,
                            name: mg.name,
                            ...(mg.i18n ? { i18n: mg.i18n } : {}),
                            source: 'category',
                            selectionType: mg.selectionType || mg.selection_type || 'single',
                            isRequired: Boolean(mg.isRequired || mg.is_required),
                            minSelection: mg.minSelection ?? mg.min_selection,
                            maxSelection: mg.maxSelection ?? mg.max_selection,
                            options: (mg.options || []).map(opt => ({
                                id: opt.id,
                                name: opt.name,
                                ...(opt.i18n ? { i18n: opt.i18n } : {}),
                                price: Number(opt.price || 0),
                                isDefault: Boolean(opt.isDefault || opt.is_default),
                                isOutOfStock: Boolean(opt.isOutOfStock || opt.is_out_of_stock),
                                ...(opt.subOptions || opt.sub_options ? { subOptions: opt.subOptions || opt.sub_options } : {}),
                                ...(opt.minOrderSubtotal != null || opt.min_order_amount != null ? { minOrderSubtotal: opt.minOrderSubtotal ?? opt.min_order_amount } : {}),
                                ...(opt.ruleErrorMessage ? { ruleErrorMessage: opt.ruleErrorMessage } : {})
                            }))
                        });
                    }
                });
            } else {
                let applied = catObj.appliedModifiers;
                if (applied === undefined) applied = ['*'];
                else if (typeof applied === 'string') {
                    try { applied = JSON.parse(applied); } catch { applied = applied.split(',').map(s => s.trim()).filter(Boolean); }
                }
                if (Array.isArray(applied) && applied.length > 0) {
                    const allMods = bData.modifiers || [];
                    const matched = applied.includes('*') ? allMods : allMods.filter(m => applied.includes(m.slug) || applied.includes(m.id));
                    const existingNames = new Set(itemMods.map(m => (m.name || '').trim().toLowerCase()));
                    const existingGids = new Set(itemMods.map(m => m.id));
                    matched.forEach(m => {
                        const mId = m.id || m.slug;
                        const mName = (m.name || '').trim().toLowerCase();
                        if (existingGids.has(mId) || existingNames.has(mName)) return;
                        catMods.push({
                            id: mId,
                            slug: m.slug || m.id,
                            name: m.name,
                            ...(m.i18n ? { i18n: m.i18n } : {}),
                            source: 'category',
                            selectionType: m.selectionType || 'single',
                            isRequired: Boolean(m.isRequired),
                            minSelection: m.minSelection,
                            maxSelection: m.maxSelection,
                            options: (m.options || []).map(opt => ({
                                id: opt.id,
                                name: opt.name,
                                ...(opt.i18n ? { i18n: opt.i18n } : {}),
                                price: Number(opt.price || 0),
                                isDefault: Boolean(opt.isDefault),
                                isOutOfStock: Boolean(opt.isOutOfStock),
                                ...(opt.subOptions || opt.sub_options ? { subOptions: opt.subOptions || opt.sub_options } : {}),
                                ...(opt.minOrderSubtotal != null || opt.min_order_amount != null ? { minOrderSubtotal: opt.minOrderSubtotal ?? opt.min_order_amount } : {}),
                                ...(opt.ruleErrorMessage ? { ruleErrorMessage: opt.ruleErrorMessage } : {})
                            }))
                        });
                    });
                }
            }
        }
    }

    return [...itemMods, ...catMods];
}

// Reconcile editable drafts only; persisted order snapshots remain independent.
function reconcileCartOptions(data) {
    const bData = data || window.bootstrapData;
    if (!bData?.unifiedMenu || bData.menuComplete !== true || !Array.isArray(bData.catalog)) return false;
    const cartObj = window.cart || {};
    const cData = window.customizeData || {};
    const bundles = window.bundleCartData || (window.bundleCartData = {});
    let changed = false;
    function currentGroups(saved, groups) {
        return (saved || []).flatMap(selection => {
            const group = groups.find(g => g.id === selection.groupId || g.metadata?.legacyGroupId === selection.groupId);
            if (!group) return [];
            return [{ ...selection, items: (selection.items || []).map(choice => {
                const option = (group.eligibleItems || group.options || []).find(o =>
                    o.id === (choice.optionId || choice.itemId) || (o.productId && o.productId === choice.itemId));
                // Keep unavailable choices in existing groups for explicit removal in the editor.
                return option && Array.isArray(choice.groups)
                    ? { ...choice, groups: currentGroups(choice.groups, option.optionGroups || []) } : choice;
            }) }];
        });
    }
    for (const key of Object.keys(cartObj)) {
        if (!(cartObj[key] > 0)) continue;
        let product;
        for (const category of bData.catalog) {
            product = (category.items || []).find(item => `${category.slug}_${item.name}` === key || item.id === key);
            if (product) break;
        }
        if (!product) continue; // Stock validation handles missing products.
        const rule = product.bundleRule;
        const before = JSON.stringify([cData[key], bundles[key]]);
        if (Array.isArray(cData[key])) {
            cData[key] = cData[key].map((portion, index) => {
                if (!portion) return portion;
                const hasChoices = ['single', 'multiple', 'selectedByGroup', 'selectedDetails', 'subOptions']
                    .some(field => Object.keys(portion[field] || {}).length > 0) || portion.topping || portion.spicy;
                if (!hasChoices) return portion;
                // Carry still-configured legacy selections into the canonical selection tree.
                if (rule?.version === 3 && rule.groups?.length && window.UnifiedOptions?.restore) {
                    bundles[key] = bundles[key] || [];
                    const saved = bundles[key][index];
                    const groups = window.UnifiedOptions.restore(rule, saved?.groups || [], portion);
                    bundles[key][index] = { ...saved, portionIndex: index,
                        groups: window.UnifiedOptions.receipt ? window.UnifiedOptions.receipt(groups) : groups };
                }
                return { note: portion.note || '', customText: portion.customText || '', single: {}, multiple: {} };
            });
        }
        if (Array.isArray(bundles[key])) {
            if (!rule?.groups?.length) delete bundles[key];
            else if (Number(rule.version) === 3) {
                bundles[key] = bundles[key].map(portion => {
                    if (!portion) return portion;
                    const groups = currentGroups(portion.groups, rule.groups);
                    if (JSON.stringify(groups) === JSON.stringify(portion.groups)) return portion;
                    // Refresh display-only modifiers too, so deleted child groups cannot linger in cart text or prices.
                    return { ...portion, groups: window.UnifiedOptions?.receipt ? window.UnifiedOptions.receipt(groups) : groups };
                });
            }
        }
        if (JSON.stringify([cData[key], bundles[key]]) !== before) changed = true;
    }
    if (changed) window.cartOptionsNeedReview = true;
    return changed;
}
window.reconcileCartOptions = reconcileCartOptions;

function calculatePortionExtra(itemOrKey, portion) {
    if (!portion) return 0;
    if (typeof window !== 'undefined' && window.PricingWasm && window.PricingWasm.isReady && typeof window.PricingWasm.calculatePortionExtra === 'function') {
        const wasmExtra = window.PricingWasm.calculatePortionExtra(itemOrKey, portion);
        if (typeof wasmExtra === 'number') {
            return wasmExtra;
        }
    }
    const bData = window.bootstrapData || bootstrapData;
    if (bData?.unifiedMenu) return 0; // Unified surcharges live in bundleCartData.
    const effectiveGroups = getEffectiveItemModifierGroups(itemOrKey);
    let extra = 0;

    // 1. Direct evaluation from selectedDetails if available
    if (portion.selectedDetails && typeof portion.selectedDetails === 'object' && Object.keys(portion.selectedDetails).length > 0) {
        for (const detail of Object.values(portion.selectedDetails)) {
            if (!detail) continue;
            extra += Number(detail.price || 0);
            if (detail.subOption && detail.subOption.price) {
                extra += Number(detail.subOption.price || 0);
            }
        }
        if (portion.subOptions && typeof portion.subOptions === 'object') {
            for (const [optKey, sub] of Object.entries(portion.subOptions)) {
                const alreadyCounted = Object.values(portion.selectedDetails).some(d => d && (d.id === optKey || d.name === optKey) && d.subOption);
                if (!alreadyCounted && sub && sub.price) {
                    extra += Number(sub.price || 0);
                }
            }
        }
        return extra;
    }

    // 2. Structured selectedByGroup
    if (portion.selectedByGroup && typeof portion.selectedByGroup === 'object') {
        for (const [groupKey, optIds] of Object.entries(portion.selectedByGroup)) {
            if (!Array.isArray(optIds)) continue;
            const targetGroup = effectiveGroups.find(g =>
                g.id === groupKey ||
                g.slug === groupKey ||
                `item:${g.id}` === groupKey ||
                `category:${g.id}` === groupKey ||
                `category:${g.slug}` === groupKey
            );
            for (const optId of optIds) {
                let p = 0;
                if (targetGroup?.options) {
                    const opt = targetGroup.options.find((o, idx) => {
                        const uId = (typeof getUniqueModifierOptionId === 'function') ? getUniqueModifierOptionId(targetGroup, o, idx) : (o.id || o.name);
                        return uId === optId || o.id === optId || o.name === optId;
                    });
                    if (opt) p = Number(opt.price || 0);
                }
                if (!p) p = getModifierPrice(optId, targetGroup);
                extra += p;
            }
        }
        return extra;
    }

    // 3. Legacy portion.single & portion.multiple
    if (portion.single && typeof portion.single === 'object') {
        for (const [modSlug, optNameOrId] of Object.entries(portion.single)) {
            if (!optNameOrId) continue;
            const targetGroup = effectiveGroups.find(g => g.slug === modSlug || g.id === modSlug || g.name === modSlug);
            let p = 0;
            if (targetGroup?.options) {
                const opt = targetGroup.options.find((o, idx) => {
                    const uId = (typeof getUniqueModifierOptionId === 'function') ? getUniqueModifierOptionId(targetGroup, o, idx) : (o.id || o.name);
                    return uId === optNameOrId || o.id === optNameOrId || o.name === optNameOrId;
                });
                if (opt) p = Number(opt.price || 0);
            }
            if (!p) p = getModifierPrice(optNameOrId, targetGroup);
            extra += p;
        }
    }

    if (portion.multiple && typeof portion.multiple === 'object') {
        for (const [optKey, isSelected] of Object.entries(portion.multiple)) {
            if (!isSelected) continue;
            if (typeof isSelected === 'object') {
                const targetGroup = effectiveGroups.find(g => g.slug === optKey || g.id === optKey);
                for (const [subOptId, subIsSel] of Object.entries(isSelected)) {
                    if (!subIsSel) continue;
                    let p = 0;
                    if (targetGroup?.options) {
                        const opt = targetGroup.options.find((o, idx) => {
                            const uId = (typeof getUniqueModifierOptionId === 'function') ? getUniqueModifierOptionId(targetGroup, o, idx) : (o.id || o.name);
                            return uId === subOptId || o.id === subOptId || o.name === subOptId;
                        });
                        if (opt) p = Number(opt.price || 0);
                    }
                    if (!p) p = getModifierPrice(subOptId, targetGroup);
                    extra += p;
                }
                continue;
            }

            let p = 0;
            for (const grp of effectiveGroups) {
                const opt = (grp.options || []).find((o, idx) => {
                    const uId = (typeof getUniqueModifierOptionId === 'function') ? getUniqueModifierOptionId(grp, o, idx) : (o.id || o.name);
                    return uId === optKey || o.id === optKey || o.name === optKey;
                });
                if (opt) { p = Number(opt.price || 0); break; }
            }
            if (!p) p = getModifierPrice(optKey);
            extra += p;
        }
    }

    if (portion.subOptions && typeof portion.subOptions === 'object') {
        for (const sub of Object.values(portion.subOptions)) {
            if (sub && sub.price) {
                extra += Number(sub.price || 0);
            }
        }
    }

    return extra;
}

function getModifierPrice(optIdOrName, contextItemOrGroup) {
    if (!optIdOrName) return 0;
    const cleanKey = String(optIdOrName).trim();

    if (contextItemOrGroup) {
        if (Array.isArray(contextItemOrGroup.options)) {
            const found = contextItemOrGroup.options.find(o => o.id === cleanKey || o.name === cleanKey);
            if (found && typeof found.price === 'number') return found.price;
        }
        if (typeof getEffectiveItemModifierGroups === 'function') {
            const groups = getEffectiveItemModifierGroups(contextItemOrGroup);
            for (const grp of groups) {
                if (Array.isArray(grp.options)) {
                    const found = grp.options.find(o => o.id === cleanKey || o.name === cleanKey);
                    if (found && typeof found.price === 'number') return found.price;
                }
            }
        }
    }

    if (!window.modPriceMap || Object.keys(window.modPriceMap).length === 0) {
        buildModifierPriceMap(window.bootstrapData || (typeof bootstrapData !== 'undefined' ? bootstrapData : null));
    }
    if (window.modPriceMap && window.modPriceMap[cleanKey] !== undefined) {
        return window.modPriceMap[cleanKey];
    }

    // Dynamic catalog & modifiers search
    const bData = window.bootstrapData || (typeof bootstrapData !== 'undefined' ? bootstrapData : null);
    if (bData?.catalog) {
        for (const cat of bData.catalog) {
            const catGroups = cat.modifierGroups || cat.modifier_groups;
            if (Array.isArray(catGroups)) {
                for (const grp of catGroups) {
                    if (Array.isArray(grp.options)) {
                        const found = grp.options.find(o => o.id === cleanKey || o.name === cleanKey);
                        if (found && typeof found.price === 'number') {
                            if (window.modPriceMap) window.modPriceMap[cleanKey] = found.price;
                            return found.price;
                        }
                    }
                }
            }
            const items = Array.isArray(cat.items) ? cat.items : [cat];
            for (const it of items) {
                const groups = it.modifierGroups || it.modifier_groups;
                if (Array.isArray(groups)) {
                    for (const grp of groups) {
                        if (Array.isArray(grp.options)) {
                            const found = grp.options.find(o => o.id === cleanKey || o.name === cleanKey);
                            if (found && typeof found.price === 'number') {
                                if (window.modPriceMap) window.modPriceMap[cleanKey] = found.price;
                                return found.price;
                            }
                        }
                    }
                }
            }
        }
    }
    if (bData?.modifiers) {
        for (const mod of bData.modifiers) {
            if (Array.isArray(mod.options)) {
                const found = mod.options.find(o => o.id === cleanKey || o.name === cleanKey);
                if (found && typeof found.price === 'number') {
                    if (window.modPriceMap) window.modPriceMap[cleanKey] = found.price;
                    return found.price;
                }
            }
        }
    }

    if (cleanKey.startsWith('加')) {
        const stripped = cleanKey.substring(1).trim();
        if (window.modPriceMap && window.modPriceMap[stripped] !== undefined) {
            return window.modPriceMap[stripped];
        }
    } else {
        const added = '加' + cleanKey;
        if (window.modPriceMap && window.modPriceMap[added] !== undefined) {
            return window.modPriceMap[added];
        }
    }
    return 0;
}

// Dining Option State ('takeaway' | 'dine_in')
function getClientUrlParams() {
    if (typeof getUrlParamsWithLiffState === 'function') {
        return getUrlParamsWithLiffState();
    }
    const merged = new URLSearchParams();
    try {
        const direct = new URLSearchParams(window.location.search || '');
        for (const [k, v] of direct.entries()) {
            if (k !== 'liff.state') merged.set(k, v);
        }
        const liffState = direct.get('liff.state');
        if (liffState) {
            const decoded = decodeURIComponent(liffState);
            const qIdx = decoded.indexOf('?');
            const stateParams = new URLSearchParams(qIdx >= 0 ? decoded.slice(qIdx + 1) : decoded);
            for (const [k, v] of stateParams.entries()) merged.set(k, v);
        }
        if (window.location.hash) {
            const rawHash = decodeURIComponent(window.location.hash.substring(1));
            const hqIdx = rawHash.indexOf('?');
            const hashParams = new URLSearchParams(hqIdx >= 0 ? rawHash.slice(hqIdx + 1) : rawHash);
            for (const [k, v] of hashParams.entries()) merged.set(k, v);
        }
    } catch (e) {}
    return merged;
}
window.getClientUrlParams = getClientUrlParams;

function resolveQrChannelAndInitialCollection(tenant) {
    if (!tenant || window.isStaffOrderMode || window.isEditOrderMode) return;
    const params = getClientUrlParams();
    const rawCh = (params.get('ch') || params.get('channel') || '').trim();
    const rawTag = (params.get('tag') || '').trim();
    const rawCol = (params.get('collection') || params.get('shift') || '').trim();

    const channels = Array.isArray(tenant.qrChannels) ? tenant.qrChannels : [];
    let resolvedChannel = null;
    if (rawCh) {
        const matched = channels.find(c => c && c.isActive !== false && (c.code === rawCh || c.id === rawCh));
        resolvedChannel = matched || { id: null, code: rawCh, label: rawTag || rawCh, diningPolicy: 'customer_choice', defaultShiftId: null, defaultLocale: null };
    } else if (rawTag) {
        const matched = channels.find(c => c && c.isActive !== false && (c.label === rawTag || c.code === rawTag));
        resolvedChannel = matched || { id: null, code: null, label: rawTag, diningPolicy: 'customer_choice', defaultShiftId: null, defaultLocale: null };
    }
    if (resolvedChannel) {
        window.currentQrChannel = resolvedChannel;
    } else if (!window.__qrChannelResolvedOnce) {
        window.currentQrChannel = null;
    }

    const shifts = Array.isArray(tenant.operatingShifts) ? tenant.operatingShifts : [];
    const channelFixedShift = (resolvedChannel && resolvedChannel.defaultShiftId)
        ? shifts.find(s => s && s.isActive !== false && s.id === resolvedChannel.defaultShiftId) || null
        : null;
    if (channelFixedShift) {
        window.lockedMenuCollectionId = channelFixedShift.id;
        window.selectedMenuCollectionId = channelFixedShift.id;
        window.__collectionUrlResolvedOnce = true;
    } else if (!window.__collectionUrlResolvedOnce) {
        const targetColId = rawCol || '';
        if (targetColId) {
            const matchedShift = shifts.find(s => s && s.isActive !== false && s.id === targetColId);
            if (matchedShift) {
                window.selectedMenuCollectionId = matchedShift.id;
                window.lockedMenuCollectionId = (!resolvedChannel && matchedShift.displayMode === 'qr_only')
                    ? matchedShift.id
                    : null;
                window.__collectionUrlResolvedOnce = true;
            } else {
                window.lockedMenuCollectionId = null;
            }
        } else {
            window.lockedMenuCollectionId = null;
        }
    } else if (resolvedChannel && !resolvedChannel.defaultShiftId) {
        window.lockedMenuCollectionId = null;
    }
    window.__qrChannelResolvedOnce = true;
}
window.resolveQrChannelAndInitialCollection = resolveQrChannelAndInitialCollection;

function renderQrChannelBanner() {
    const banner = document.getElementById('qr-channel-banner');
    const labelEl = document.getElementById('qr-channel-banner-label');
    if (!banner || !labelEl) return;

    const ch = window.currentQrChannel;
    if (!ch || !ch.label || window.isStaffOrderMode || window.isAppendMode || window.currentTableNumber) {
        banner.style.display = 'none';
        banner.removeAttribute('title');
        return;
    }
    const localizedLabel = typeof locText === 'function' ? locText(ch, 'label', ch.label) : ch.label;
    const displayLabel = localizedLabel || ch.label;
    labelEl.textContent = displayLabel;
    banner.title = displayLabel;
    banner.style.display = 'flex';
}
window.renderQrChannelBanner = renderQrChannelBanner;

function formatCollectionWindowSummary(shift) {
    if (!shift || !Array.isArray(shift.windows) || shift.windows.length === 0) return '';
    const unique = [];
    for (const w of shift.windows) {
        if (!w || w.isActive === false) continue;
        const range = `${w.startTime}–${w.endTime}`;
        if (!unique.includes(range)) unique.push(range);
    }
    if (unique.length === 1) return unique[0];
    return unique.length > 1 ? unique[0] : '';
}

function findNextCollectionSlot(shift) {
    if (!shift || typeof MenuSchedule === 'undefined' || typeof MenuSchedule.isShiftActiveAt !== 'function') return null;
    const twNow = getTaiwanDate();
    const prepMinutes = Number(storeConfig?.prepTimeMinutes ?? 5) || 0;
    const isBusy = storeConfig?.storeStatus === 'busy';
    const minTodayMin = twNow.getHours() * 60 + twNow.getMinutes() + prepMinutes + (isBusy ? 60 : 0);

    for (let offset = 0; offset <= 7; offset++) {
        const dObj = new Date(twNow.getTime() + offset * 86400000);
        const { dateStr } = formatTaiwanDateTime(dObj);
        const slots = typeof generatePickupSlots === 'function'
            ? generatePickupSlots(dateStr)
            : (() => {
                const list = [];
                const startM = offset === 0 ? Math.ceil(minTodayMin / 15) * 15 : 0;
                for (let m = startM; m < 1440; m += 15) {
                    const hh = String(Math.floor(m / 60)).padStart(2, '0');
                    const mm = String(m % 60).padStart(2, '0');
                    list.push(`${hh}:${mm}`);
                }
                return list;
            })();
        for (const timeStr of slots) {
            if (MenuSchedule.isShiftActiveAt(shift, { dateStr, timeStr }, { inclusiveEnd: true })) {
                return { dateStr, timeStr };
            }
        }
    }
    return null;
}

function isScheduledCheckoutEnabled(orderType = window.currentDiningOption, config = storeConfig) {
    return orderType === 'delivery' || config?.allowScheduledPickup !== false;
}

function syncCollectionPickupSlotIfNeeded(shift) {
    if (!shift || window.isStaffOrderMode || window.isEditOrderMode || window.isAppendMode || window.currentTableNumber) return;
    if (window.isPickupTimeManuallyChanged) return;
    if (!isScheduledCheckoutEnabled()) return;
    if (typeof MenuSchedule === 'undefined' || typeof MenuSchedule.isShiftActiveAt !== 'function') return;

    const twNow = getTaiwanDate();
    const targetInfo = typeof getEffectiveMenuScheduleTime === 'function' ? getEffectiveMenuScheduleTime() : { dateStr: '', timeStr: '' };
    const evalTarget = targetInfo.dateStr && targetInfo.timeStr ? { dateStr: targetInfo.dateStr, timeStr: targetInfo.timeStr } : twNow;
    if (MenuSchedule.isShiftActiveAt(shift, evalTarget, { inclusiveEnd: Boolean(targetInfo.isScheduled) })) {
        return;
    }

    const nextSlot = findNextCollectionSlot(shift);
    if (!nextSlot) return;

    const dateEl = document.getElementById('pickup-date');
    const timeEl = document.getElementById('pickup-time');
    if (dateEl) dateEl.value = nextSlot.dateStr;
    if (timeEl) timeEl.value = nextSlot.timeStr;
    if (typeof pickupTimePickerState !== 'undefined' && pickupTimePickerState) {
        pickupTimePickerState.selectedDate = nextSlot.dateStr;
        pickupTimePickerState.selectedTime = nextSlot.timeStr;
        pickupTimePickerState.selectedType = 'slot';
    }
    window.__collectionAutoSnappedTime = true;
    if (typeof syncPickupTimeDisplay === 'function') syncPickupTimeDisplay();
}

function getSelectedMenuCollectionShift() {
    const selectedId = window.selectedMenuCollectionId;
    if (!selectedId) return null;
    const shifts = Array.isArray(storeConfig?.operatingShifts)
        ? storeConfig.operatingShifts
        : (Array.isArray(window.bootstrapData?.tenant?.operatingShifts) ? window.bootstrapData.tenant.operatingShifts : []);
    return shifts.find(s => s && s.id === selectedId) || null;
}
window.getSelectedMenuCollectionShift = getSelectedMenuCollectionShift;

function renderMenuCollectionSwitcher() {
    const wrapper = document.getElementById('collection-switcher-wrapper');
    const bar = document.getElementById('collection-switcher-bar');
    const banner = document.getElementById('collection-schedule-banner');
    if (!wrapper || !bar) return;

    const features = Array.isArray(storeConfig?.features)
        ? storeConfig.features
        : (Array.isArray(window.bootstrapData?.tenant?.features) ? window.bootstrapData.tenant.features : []);
    const hasMenuSchedule = features.includes('menu_schedule');
    const shifts = Array.isArray(storeConfig?.operatingShifts)
        ? storeConfig.operatingShifts
        : (Array.isArray(window.bootstrapData?.tenant?.operatingShifts) ? window.bootstrapData.tenant.operatingShifts : []);

    const ch = window.currentQrChannel || null;
    const lockedShift = (ch && ch.defaultShiftId
        ? shifts.find(s => s && s.isActive !== false && s.id === ch.defaultShiftId)
        : null) || (window.lockedMenuCollectionId
        ? shifts.find(s => s && s.isActive !== false && s.id === window.lockedMenuCollectionId)
        : null);
    const isCollectionLocked = Boolean(lockedShift);
    if (lockedShift) {
        window.selectedMenuCollectionId = lockedShift.id;
        window.lockedMenuCollectionId = lockedShift.id;
    }

    const activeId = window.selectedMenuCollectionId || '';
    const visibleShifts = isCollectionLocked
        ? [lockedShift]
        : shifts.filter(s =>
            s && s.isActive !== false &&
            ((s.displayMode !== 'schedule_only' && s.displayMode !== 'qr_only') || s.id === activeId)
        );

    if (!hasMenuSchedule || visibleShifts.length === 0 || window.isStaffOrderMode || window.isEditOrderMode) {
        wrapper.style.display = 'none';
        if (!hasMenuSchedule) window.selectedMenuCollectionId = null;
        return;
    }

    const locale = window.currentClientLocale || 'zh-TW';
    const tFn = (key, vars, fallback) => (typeof ct === 'function' ? ct(key, vars) : fallback);
    const allLabel = tFn('collection_all_label', null, '全部菜單');
    const allSub = tFn('collection_all_sub', null, '依目前時段');

    bar.className = isCollectionLocked ? 'collection-segmented-control is-locked' : 'collection-segmented-control';
    let html = isCollectionLocked
        ? ''
        : `<button type="button" class="collection-seg-btn ${!activeId ? 'active' : ''}" data-collection-id="" role="tab" aria-selected="${!activeId}" onclick="setCustomerMenuCollection('')">
        <span class="collection-seg-title">${escapeHtml(allLabel)}</span>
        <span class="collection-seg-time">${escapeHtml(allSub)}</span>
    </button>`;

    for (const shift of visibleShifts) {
        const isActive = isCollectionLocked || activeId === shift.id;
        const localizedName = (typeof MenuSchedule !== 'undefined' && typeof MenuSchedule.getLocalizedShiftName === 'function')
            ? MenuSchedule.getLocalizedShiftName(shift, locale)
            : shift.name;
        const winSummary = formatCollectionWindowSummary(shift);
        const lockedAttrs = isCollectionLocked
            ? ' aria-disabled="true"'
            : ` onclick="setCustomerMenuCollection('${escapeHtml(shift.id)}')"`;
        html += `<button type="button" class="collection-seg-btn ${isActive ? 'active' : ''} ${isCollectionLocked ? 'is-locked' : ''}" data-collection-id="${escapeHtml(shift.id)}" role="tab" aria-selected="${isActive}"${lockedAttrs}>
            <span class="collection-seg-title">${escapeHtml(localizedName)}</span>
            ${winSummary ? `<span class="collection-seg-time">${escapeHtml(winSummary)}</span>` : ''}
        </button>`;
    }

    bar.innerHTML = html;
    wrapper.style.display = 'block';

    if (banner) {
        const selectedShift = visibleShifts.find(s => s.id === activeId) || null;
        if (!selectedShift) {
            banner.style.display = 'none';
            banner.className = 'collection-schedule-banner';
        } else {
            const twNow = getTaiwanDate();
            const isOpenNow = (typeof MenuSchedule !== 'undefined' && typeof MenuSchedule.isShiftActiveAt === 'function')
                ? MenuSchedule.isShiftActiveAt(selectedShift, twNow)
                : true;
            const winLabel = formatCollectionWindowSummary(selectedShift);
            const allowScheduled = isScheduledCheckoutEnabled();
            if (!isOpenNow && winLabel) {
                banner.textContent = allowScheduled
                    ? tFn('collection_scheduled_hint', { window: winLabel }, `此時段供應時間為 ${winLabel}，已自動切換為預約時段`)
                    : tFn('collection_preview_hint', { window: winLabel }, `此時段供應時間為 ${winLabel}（目前僅供瀏覽）`);
                banner.className = 'collection-schedule-banner is-outside';
                banner.style.display = 'block';
            } else if (selectedShift.diningPolicy === 'takeaway_only') {
                banner.textContent = tFn('collection_takeaway_only_hint', null, '此時段僅供外帶自取');
                banner.className = 'collection-schedule-banner is-takeaway-only';
                banner.style.display = 'block';
            } else {
                banner.style.display = 'none';
                banner.className = 'collection-schedule-banner';
            }
        }
    }
}
window.renderMenuCollectionSwitcher = renderMenuCollectionSwitcher;

function setCustomerMenuCollection(shiftId) {
    const nextId = shiftId ? String(shiftId).trim() : '';
    const chLockedShiftId = window.currentQrChannel?.defaultShiftId ? String(window.currentQrChannel.defaultShiftId) : '';
    const lockedId = window.lockedMenuCollectionId ? String(window.lockedMenuCollectionId) : chLockedShiftId;
    if (lockedId && nextId !== lockedId) {
        return;
    }
    window.selectedMenuCollectionId = nextId || null;
    window.isPickupTimeManuallyChanged = false;

    const shift = getSelectedMenuCollectionShift();
    if (!nextId) {
        if (window.__collectionAutoSnappedTime && typeof resetPickupTimeToDefault === 'function') {
            resetPickupTimeToDefault();
        }
        window.__collectionAutoSnappedTime = false;
    } else if (shift) {
        if (shift.diningPolicy === 'takeaway_only' && window.currentDiningOption !== 'delivery' && !window.isAppendMode && !window.currentTableNumber) {
            window.currentDiningOption = 'takeaway';
        } else if (shift.diningPolicy === 'dine_in_only' && storeConfig?.allowDineIn !== false && (window.currentQrChannel || (Array.isArray(storeConfig?.features) && storeConfig.features.includes('dine_in')))) {
            window.currentDiningOption = 'dine_in';
        }
        syncCollectionPickupSlotIfNeeded(shift);
    }

    applyPickupConfig();
}
window.setCustomerMenuCollection = setCustomerMenuCollection;

function setCustomerDiningOption(opt) {
    if (!['takeaway', 'dine_in', 'delivery'].includes(opt)) return;
    if (window.diningOptionLocked && opt !== window.diningOptionLocked && !window.currentTableNumber && !window.isAppendMode && !window.isEditOrderMode) return;
    if (opt === 'delivery' && document.getElementById('checkout-btn-delivery')?.hidden !== false) return;
    window.currentDiningOption = opt;
    applyPickupConfig();
}

function toggleStoreHours(e) {
    if (e) e.stopPropagation();
    const displayEl = document.getElementById('store-hours-display');
    const arrowEl = document.getElementById('hours-arrow-icon');
    const toggleTextEl = document.getElementById('hours-toggle-text');
    if (displayEl) {
        const isHidden = (displayEl.style.display === 'none' || !displayEl.style.display);
        displayEl.style.display = isHidden ? 'block' : 'none';
        if (arrowEl) arrowEl.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        if (toggleTextEl) {
            toggleTextEl.innerText = isHidden
                ? (typeof ct === 'function' ? ct('hours_collapse') : '收合')
                : (typeof ct === 'function' ? ct('hours_expand') : '展開');
        }
    }
}

function renderStoreOperatingHours() {
    const displayEl = document.getElementById('store-hours-display');
    const todayPreviewEl = document.getElementById('hours-today-preview');
    const toggleTextEl = document.getElementById('hours-toggle-text');
    if (!displayEl) return;

    const t = (key, fallback) => (typeof ct === 'function' ? ct(key) : fallback);
    if (toggleTextEl) {
        const isShown = (displayEl.style.display === 'block');
        toggleTextEl.innerText = isShown ? t('hours_collapse', '收合') : t('hours_expand', '展開');
    }

    const twTime = getTaiwanDate();
    const todayIdx = twTime.getDay();

    let todayHoursStr = "";
    let isTodayOpen = false;

    if (storeConfig && storeConfig.operatingHours) {
        const hrs = storeConfig.operatingHours;
        const hoursInfo = typeof formatLocalizedHours === 'function'
            ? formatLocalizedHours(hrs)
            : null;
        const days = hoursInfo ? hoursInfo.daysName : ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
        const formatShifts = hoursInfo
            ? hoursInfo.formatShifts
            : ((shifts) => shifts.map(s => (s && s.start && s.end) ? `${s.start} - ${s.end}` : '').filter(Boolean).join(', '));
        const todayTagLabel = t('hours_today_prefix', '今天');
        const makeTodayTag = (show) => show
            ? `<span style="font-size: 11px; background: #ecfdf5; color: #059669; padding: 1px 6px; border-radius: 99px; margin-left: 6px; border: 1px solid #a7f3d0;">${todayTagLabel}</span>`
            : '';

        const todayShifts = hrs[todayIdx] || hrs[String(todayIdx)] || [];
        if (todayShifts.length > 0) {
            todayHoursStr = formatShifts(todayShifts);
            isTodayOpen = true;
        } else {
            todayHoursStr = t('hours_today_off', '今日公休');
            isTodayOpen = false;
        }

        const getDayStr = (dayIdx) => {
            const shifts = hrs[dayIdx] || hrs[String(dayIdx)] || [];
            if (shifts.length === 0) return t('hours_off', '公休');
            return formatShifts(shifts);
        };

        const monStr = getDayStr(1);
        const tueStr = getDayStr(2);
        const wedStr = getDayStr(3);
        const thuStr = getDayStr(4);
        const friStr = getDayStr(5);
        const satStr = getDayStr(6);
        const sunStr = getDayStr(0);

        const weekdaysEqual = (monStr === tueStr && tueStr === wedStr && wedStr === thuStr && thuStr === friStr);
        const weekendsEqual = (satStr === sunStr);

        let html = "";
        if (weekdaysEqual && weekendsEqual) {
            const isWeekday = (todayIdx >= 1 && todayIdx <= 5);
            const activeLocale = (typeof window !== 'undefined' && window.currentClientLocale) || 'zh-TW';
            const weekdayLabel = `${days[1]}~${days[5]}`;
            const weekendLabel = activeLocale === 'zh-TW' ? `${days[6]}、${days[0]}` : `${days[6]} / ${days[0]}`;
            html = `<div ${isWeekday ? 'style="font-weight: 700; color: #059669;"' : ''}>${weekdayLabel}&nbsp;&nbsp;${monStr}${makeTodayTag(isWeekday)}</div>
                    <div ${!isWeekday ? 'style="font-weight: 700; color: #059669;"' : ''}>${weekendLabel}&nbsp;&nbsp;${satStr}${makeTodayTag(!isWeekday)}</div>`;
        } else {
            for (let i = 1; i <= 7; i++) {
                const dayIdx = i === 7 ? 0 : i;
                const isCurrentDay = (dayIdx === todayIdx);
                const highlightStyle = isCurrentDay ? 'style="font-weight: 700; color: #059669;"' : '';
                html += `<div ${highlightStyle}>${days[dayIdx]}&nbsp;&nbsp;${getDayStr(dayIdx)}${makeTodayTag(isCurrentDay)}</div>`;
            }
        }
        displayEl.innerHTML = html;
    } else {
        const defaultDays = (typeof ct === 'function' ? ct('days_short') : null);
        const d = Array.isArray(defaultDays) && defaultDays.length === 7 ? defaultDays : ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
        const activeLocale = (typeof window !== 'undefined' && window.currentClientLocale) || 'zh-TW';
        const weekdayLabel = `${d[1]}~${d[5]}`;
        const weekendLabel = activeLocale === 'zh-TW' ? `${d[6]}、${d[0]}` : `${d[6]} / ${d[0]}`;
        if (todayIdx >= 1 && todayIdx <= 5) {
            todayHoursStr = "11:00-21:00";
            isTodayOpen = true;
        } else {
            todayHoursStr = "9:00-21:00";
            isTodayOpen = true;
        }
        displayEl.innerHTML = `<div>${weekdayLabel}&nbsp;&nbsp;11:00-21:00</div>
                               <div>${weekendLabel}&nbsp;&nbsp;9:00-21:00</div>`;
    }

    if (todayPreviewEl) {
        if (isTodayOpen) {
            todayPreviewEl.innerHTML = `${t('hours_today', '今日')} <strong style="color: #111827;">${todayHoursStr}</strong>`;
            todayPreviewEl.style.background = '#f0fdf4';
            todayPreviewEl.style.color = '#059669';
            todayPreviewEl.style.borderColor = '#bbf7d0';
        } else {
            todayPreviewEl.innerHTML = `<strong style="color: #dc2626;">${t('hours_today_off', '今日公休')}</strong>`;
            todayPreviewEl.style.background = '#fef2f2';
            todayPreviewEl.style.color = '#dc2626';
            todayPreviewEl.style.borderColor = '#fca5a5';
        }
    }
}

function applyTenantTheme(tenant, skipLocaleInit = false) {
    if (!tenant) return;
    const tenantId = getTenantIdFromUrl();
    if (tenant.id && tenant.id !== tenantId) {
        console.error(`[Tenant] Ignored theme for ${tenant.id} on ${tenantId}`);
        return;
    }
    if (!skipLocaleInit) {
        try {
            localStorage.setItem("tenant_branding_" + tenantId, JSON.stringify(tenant));
            localStorage.setItem("tenant_theme_" + tenantId, JSON.stringify(tenant));
        } catch(e) {}
        if (typeof resolveQrChannelAndInitialCollection === 'function') {
            resolveQrChannelAndInitialCollection(tenant);
        }
        if (typeof window.initClientLocale === 'function') {
            window.initClientLocale(tenant);
        }
    }
    if (typeof window.renderClientLanguageSwitcher === 'function') {
        window.renderClientLanguageSwitcher(tenant);
    }
    if (!window.isStaffOrderMode && typeof window.applyClientStaticI18n === 'function') {
        window.applyClientStaticI18n();
    }

    document.documentElement.style.setProperty('--primary', '#00b900');
    document.documentElement.style.setProperty('--primary-dark', '#009900');

    const localizedBrand = (typeof locText === 'function' ? locText(tenant, 'brandName', tenant.brandName || '') : (tenant.brandName || ''));
    const fallbackBrand = localizedBrand || (typeof ct === 'function' ? ct('fallback_brand_generic') : '點餐系統');
    const resolvedTitle = typeof ct === 'function' ? ct('page_store_title', { brand: fallbackBrand }) : `${fallbackBrand} 點餐`;
    document.title = resolvedTitle;
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = resolvedTitle;

    const nameEl = document.getElementById('store-name');
    if (nameEl) nameEl.innerText = localizedBrand;

    const localizedSubtitle = typeof locText === 'function' ? locText(tenant, 'brandSubtitle', tenant.brandSubtitle || '') : (tenant.brandSubtitle || '');
    const subEl = document.getElementById('store-subtitle');
    if (subEl) subEl.innerHTML = localizedSubtitle ? String(localizedSubtitle).replace(/\n/g, '<br>') : '';

    const localizedAddress = typeof locText === 'function' ? locText(tenant, 'storeAddress', tenant.storeAddress || '') : (tenant.storeAddress || '');
    const addrEl = document.getElementById('store-address');
    const addrRow = document.getElementById('store-address-row');
    if (addrEl) {
        addrEl.innerText = localizedAddress || '';
        if (addrRow) addrRow.style.display = localizedAddress ? 'flex' : 'none';
    }

    const logoEl = document.getElementById('store-logo');
    const logoWrapper = document.getElementById('store-logo-wrapper');
    if (logoEl) {
        if (tenant.logoUrl) {
            logoEl.src = tenant.logoUrl;
            if (logoWrapper) logoWrapper.style.display = 'flex';
        } else {
            if (logoWrapper) logoWrapper.style.display = 'none';
        }
    }

    const statusEl = document.getElementById('store-status');
    if (statusEl) statusEl.style.display = 'block';

    const hoursRow = document.getElementById('store-hours-row');
    if (hoursRow) hoursRow.style.display = 'flex';

    if (!storeConfig) storeConfig = {};
    if (Array.isArray(tenant.operatingShifts)) {
        storeConfig.operatingShifts = tenant.operatingShifts;
    }
    if (Array.isArray(tenant.qrChannels)) {
        storeConfig.qrChannels = tenant.qrChannels;
    }
    if (tenant.parsedHours) {
        storeConfig.operatingHours = tenant.parsedHours;
    } else if (tenant.operatingHours) {
        try {
            storeConfig.operatingHours = typeof tenant.operatingHours === 'string' ? JSON.parse(tenant.operatingHours) : tenant.operatingHours;
        } catch(e) {}
    }
    if (tenant.liffId) storeConfig.liffId = tenant.liffId;
    if (tenant.features) storeConfig.features = tenant.features;
    if (tenant.allowScheduledPickup !== undefined) storeConfig.allowScheduledPickup = tenant.allowScheduledPickup;
    if (tenant.allowDineIn !== undefined) storeConfig.allowDineIn = tenant.allowDineIn;
    if (tenant.dineInTableMode) storeConfig.dineInTableMode = tenant.dineInTableMode;
    if (tenant.storeStatus) storeConfig.storeStatus = tenant.storeStatus;
    if (tenant.prepTimeMinutes !== undefined) {
        storeConfig.prepTimeMinutes = Number(tenant.prepTimeMinutes);
    } else if (storeConfig.prepTimeMinutes === undefined) {
        storeConfig.prepTimeMinutes = 5;
    }
    window.storeConfig = storeConfig;
    renderStoreOperatingHours();

    const localizedAnnouncement = typeof locText === 'function' ? locText(tenant, 'announcement', tenant.announcement || '') : (tenant.announcement || '');
    const annEl = document.getElementById('store-announcement');
    const annRow = document.getElementById('store-announcement-row');
    if (annEl) {
        annEl.innerText = localizedAnnouncement || '';
        if (annRow) annRow.style.display = localizedAnnouncement ? 'flex' : 'none';
    }
    if (tenant && tenant.id) {
        window.__storeNoticeTenantId = tenant.id;
    }
    window.__currentStoreNotice = tenant && tenant.storeNotice ? tenant.storeNotice : null;
    if (!skipLocaleInit) {
        maybeShowStoreNotice();
    }
}

// --- TIME & TIMEZONE HELPERS ---
function getTaiwanDate() {
    const now = new Date();
    try {
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Taipei",
            year: "numeric", month: "numeric", day: "numeric",
            hour: "numeric", minute: "numeric", second: "numeric",
            hour12: false
        });
        const parts = formatter.formatToParts(now);
        const m = {};
        parts.forEach(p => m[p.type] = p.value);
        const h = parseInt(m.hour, 10) % 24;
        return new Date(parseInt(m.year, 10), parseInt(m.month, 10) - 1, parseInt(m.day, 10), h, parseInt(m.minute, 10), parseInt(m.second, 10));
    } catch (e) {
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        return new Date(utc + (8 * 3600000));
    }
}

function formatTaiwanDateTime(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return {
        dateStr: `${yyyy}-${mm}-${dd}`,
        timeStr: `${hh}:${min}`,
        fullStr: `${yyyy}-${mm}-${dd} ${hh}:${min}`
    };
}

function setTodayDate(forceReset = false) {
    const twNow = getTaiwanDate();
    const { dateStr } = formatTaiwanDateTime(twNow);
    const dateEl = document.getElementById('pickup-date');
    if (dateEl) {
        dateEl.min = dateStr;
        if (forceReset || !dateEl.value || dateEl.value < dateStr) {
            dateEl.value = dateStr;
        }
    }
    if (typeof syncPickupTimeDisplay === 'function') {
        syncPickupTimeDisplay();
    }
}

function updateAsapTimeDisplay() {
    const timeEl = document.getElementById('asap-current-time');
    const dineinTimeEl = document.getElementById('dinein-current-time');
    const tw = getTaiwanDate();
    const { fullStr } = formatTaiwanDateTime(tw);
    const isBusy = (storeConfig && storeConfig.storeStatus === 'busy');
    if (timeEl) {
        timeEl.innerText = isBusy
            ? (typeof ct === 'function' ? ct('asap_busy_suffix', { time: fullStr }) : `${fullStr}（門市繁忙：約 1 小時後完成）`)
            : fullStr;
    }
    if (dineinTimeEl) dineinTimeEl.innerText = fullStr;
}

function applyPickupConfig() {
    const pickerGroup = document.getElementById('pickup-time-picker-group');
    const asapNotice = document.getElementById('pickup-time-asap-notice');
    const dineInNotice = document.getElementById('pickup-time-dinein-notice');
    const diningWrapper = document.getElementById('dining-option-wrapper');
    const checkoutDiningGroup = document.getElementById('checkout-dining-option-group');
    const selectedShift = typeof getSelectedMenuCollectionShift === 'function' ? getSelectedMenuCollectionShift() : null;
    const showLegacyDiningToggle = Boolean(window.enableLegacyDiningToggle);

    const ch = window.currentQrChannel || null;
    const chPolicy = ch ? (ch.diningPolicy || 'customer_choice') : null;
    const storeAllowsDineIn = !(storeConfig && storeConfig.allowDineIn === false);
    const hasDineInFeature = Boolean(storeConfig && Array.isArray(storeConfig.features) && (storeConfig.features.includes('dine_in') || storeConfig.features.includes('table_qr_ordering')));

    const deliveryAllowed = Array.isArray(storeConfig?.features) && storeConfig.features.includes('delivery') &&
        !window.isStaffOrderMode && !window.isEditOrderMode && !window.isAppendMode && !window.currentTableNumber &&
        (!ch || chPolicy === 'customer_choice') && selectedShift?.diningPolicy !== 'dine_in_only';
    const offPremiseChoice = deliveryAllowed && window.currentDiningOption === 'delivery' ? 'delivery' : 'takeaway';

    const syncCustomerChoiceButtons = (choiceOpt, showTop, showCheckout, lockedMode = null, showDineIn = true) => {
        window.diningOptionLocked = lockedMode || null;
        const blockToggleUi = Boolean(window.isStaffOrderMode || window.isEditOrderMode);
        if (diningWrapper) diningWrapper.style.display = (showTop && !blockToggleUi) ? 'block' : 'none';
        if (checkoutDiningGroup) checkoutDiningGroup.style.display = (showCheckout && !blockToggleUi) ? 'block' : 'none';
        const topControl = diningWrapper ? diningWrapper.querySelector('.dining-segmented-control') : null;
        if (topControl) {
            topControl.classList.toggle('is-locked', Boolean(lockedMode));
        }
        const btnTopTakeaway = document.getElementById('btn-dining-takeaway');
        const btnTopDinein = document.getElementById('btn-dining-dinein');
        const syncTopBtn = (btn, mode) => {
            if (!btn) return;
            const isActive = choiceOpt === mode;
            const isLocked = Boolean(lockedMode);
            btn.classList.toggle('active', isActive);
            btn.classList.toggle('is-locked-active', isLocked && isActive);
            btn.classList.toggle('is-locked-out', isLocked && !isActive);
            btn.setAttribute('aria-selected', String(isActive));
            if (isLocked) {
                btn.setAttribute('aria-disabled', 'true');
            } else {
                btn.removeAttribute('aria-disabled');
            }
        };
        syncTopBtn(btnTopTakeaway, 'takeaway');
        syncTopBtn(btnTopDinein, 'dine_in');
        const btnTopDelivery = document.getElementById('btn-dining-delivery');
        const btnChkDelivery = document.getElementById('checkout-btn-delivery');
        if (btnTopDelivery) btnTopDelivery.hidden = !deliveryAllowed || Boolean(lockedMode);
        if (btnTopDinein) btnTopDinein.hidden = !showDineIn;
        if (btnChkDelivery) btnChkDelivery.hidden = !deliveryAllowed || Boolean(lockedMode);
        syncTopBtn(btnTopDelivery, 'delivery');
        const btnChkTakeaway = document.getElementById('checkout-btn-takeaway');
        const btnChkDinein = document.getElementById('checkout-btn-dinein');
        if (btnChkDinein) btnChkDinein.hidden = !showDineIn;
        for (const [button, mode] of [[btnChkTakeaway, 'takeaway'], [btnChkDinein, 'dine_in'], [btnChkDelivery, 'delivery']]) {
            if (!button) continue;
            button.classList.toggle('active', choiceOpt === mode);
            button.setAttribute('aria-pressed', String(choiceOpt === mode));
        }
    };

    const allowCollectionOrChannelChoice =
        (chPolicy === 'customer_choice' || (!chPolicy && selectedShift?.diningPolicy === 'both')) &&
        storeAllowsDineIn;

    const showLockedCorner = Boolean(
        hasDineInFeature && storeAllowsDineIn &&
        (ch || selectedShift?.diningPolicy === 'takeaway_only' || selectedShift?.diningPolicy === 'dine_in_only')
    );

    if (window.isAppendMode || window.currentTableNumber) {
        window.currentDiningOption = 'dine_in';
        syncCustomerChoiceButtons('dine_in', false, false, 'dine_in');
    } else if (deliveryAllowed && (selectedShift?.diningPolicy === 'takeaway_only' || (ch && !storeAllowsDineIn))) {
        window.currentDiningOption = offPremiseChoice;
        syncCustomerChoiceButtons(offPremiseChoice, false, true, null, false);
    } else if (selectedShift && selectedShift.diningPolicy === 'takeaway_only') {
        window.currentDiningOption = 'takeaway';
        syncCustomerChoiceButtons('takeaway', showLockedCorner, false, 'takeaway');
    } else if (chPolicy === 'takeaway' || (ch && !storeAllowsDineIn)) {
        window.currentDiningOption = 'takeaway';
        syncCustomerChoiceButtons('takeaway', showLockedCorner, false, 'takeaway');
    } else if ((selectedShift && selectedShift.diningPolicy === 'dine_in_only' && storeAllowsDineIn) || (chPolicy === 'dine_in' && storeAllowsDineIn)) {
        window.currentDiningOption = 'dine_in';
        syncCustomerChoiceButtons('dine_in', showLockedCorner || chPolicy === 'dine_in', false, 'dine_in');
    } else if (allowCollectionOrChannelChoice) {
        const cur = window.currentDiningOption === 'dine_in' ? 'dine_in' : offPremiseChoice;
        window.currentDiningOption = cur;
        syncCustomerChoiceButtons(cur, true, true, null);
    } else if (window.isStaffOrderMode && hasDineInFeature && storeAllowsDineIn) {
        syncCustomerChoiceButtons(window.currentDiningOption === 'dine_in' ? 'dine_in' : 'takeaway', false, false, null);
    } else {
        const isDineInAllowed = showLegacyDiningToggle && hasDineInFeature && storeAllowsDineIn;
        if (!isDineInAllowed) {
            if (!selectedShift || selectedShift.diningPolicy !== 'dine_in_only' || !hasDineInFeature || !storeAllowsDineIn) {
                window.currentDiningOption = offPremiseChoice;
            }
            syncCustomerChoiceButtons(window.currentDiningOption, false, deliveryAllowed, null, false);
        } else {
            const cur = window.currentDiningOption === 'dine_in' ? 'dine_in' : offPremiseChoice;
            syncCustomerChoiceButtons(cur, true, true, null);
        }
    }

    const tableGroup = document.getElementById('dinein-table-input-group');
    const secTitle = document.getElementById('pickup-time-section-title');
    const secTitleText = document.getElementById('pickup-time-title-text');
    const isDelivery = deliveryAllowed && window.currentDiningOption === 'delivery';
    const deliverySection = document.getElementById('checkout-delivery-details');
    if (deliverySection) deliverySection.hidden = !isDelivery;
    const pickupLabel = document.querySelector?.('#pickup-time-picker-group [data-fulfillment-time-label]');
    if (pickupLabel && typeof ct === 'function') {
        const labelKey = isDelivery ? 'delivery_time_title' : 'pickup_eta_label';
        pickupLabel.dataset.i18n = labelKey;
        pickupLabel.textContent = ct(labelKey);
    }
    const timeTrigger = document.getElementById('pickup-time-trigger');
    if (timeTrigger && typeof ct === 'function') {
        const labelKey = isDelivery ? 'delivery_time_select' : 'pickup_aria_select';
        timeTrigger.setAttribute('data-i18n-aria-label', labelKey);
        timeTrigger.setAttribute('aria-label', ct(labelKey));
    }

    if (window.currentDiningOption === 'dine_in') {
        if (secTitle) secTitle.style.display = window.isStaffOrderMode ? 'none' : '';
        if (secTitleText) {
            if (secTitleText.dataset) secTitleText.dataset.i18n = 'order_time_title';
            secTitleText.innerText = typeof ct === 'function' ? ct('order_time_title') : '點餐時間';
        }
        if (pickerGroup) pickerGroup.style.display = 'none';
        if (asapNotice) asapNotice.style.display = 'none';
        if (dineInNotice) dineInNotice.style.display = window.isStaffOrderMode ? 'none' : 'block';
        const hideTableInput = Boolean(window.isAppendMode || (storeConfig && storeConfig.dineInTableMode === 'none'));
        if (tableGroup) {
            tableGroup.style.display = hideTableInput ? 'none' : 'block';
            if (window.currentTableNumber) {
                const tableInput = document.getElementById('dinein-table-number');
                if (tableInput) {
                    tableInput.value = window.currentTableNumber;
                    tableInput.readOnly = true;
                }
            }
        }
        if (!window.isStaffOrderMode) updateAsapTimeDisplay();
    } else {
        if (secTitleText) {
            const headingKey = isDelivery ? 'delivery_time_title' : 'pickup_time_title';
            if (secTitleText.dataset) secTitleText.dataset.i18n = headingKey;
            secTitleText.innerText = typeof ct === 'function' ? ct(headingKey) : '取餐時間';
        }
        if (dineInNotice) dineInNotice.style.display = 'none';
        if (tableGroup) tableGroup.style.display = 'none';
        if (!isScheduledCheckoutEnabled()) {
            if (secTitle) secTitle.style.display = window.isStaffOrderMode ? 'none' : '';
            if (pickerGroup) pickerGroup.style.display = 'none';
            if (asapNotice) asapNotice.style.display = window.isStaffOrderMode ? 'none' : 'block';
            if (!window.isStaffOrderMode) updateAsapTimeDisplay();
        } else {
            if (secTitle) secTitle.style.display = '';
            if (pickerGroup) pickerGroup.style.display = 'block';
            if (asapNotice) asapNotice.style.display = 'none';
            setTodayDate(false);
            if (typeof initPickupTimePicker === 'function') {
                initPickupTimePicker();
            }
            if (selectedShift) {
                syncCollectionPickupSlotIfNeeded(selectedShift);
            }
        }
    }
    if (typeof renderQrChannelBanner === 'function') renderQrChannelBanner();
    if (typeof renderMenuCollectionSwitcher === 'function') renderMenuCollectionSwitcher();
    if (typeof renderDynamicCatalog === 'function' && (window.bootstrapData?.catalog || (typeof bootstrapData !== 'undefined' && bootstrapData?.catalog))) {
        renderDynamicCatalog();
        if (typeof updateTotal === 'function') updateTotal();
    }
    window.LinePayCheckout?.refreshMethods?.();
    checkStoreStatus();
}

// --- SCROLL & NAV ---
var isManualScrollLock = false;
var manualScrollTimeout = null;
var orderStickyHeights = { auth: null, nav: null };

function syncOrderStickyLayout() {
    const authBar = document.getElementById('desktop-auth-bar');
    const nav = document.getElementById('main-nav');
    // offsetHeight is zero for hidden bars, including the auth bar inside LIFF.
    const authHeight = authBar ? (authBar.offsetHeight || 0) : 0;
    const navHeight = nav ? (nav.offsetHeight || 0) : 0;
    const rootStyle = document.documentElement.style;
    if (authHeight !== orderStickyHeights.auth) {
        rootStyle.setProperty('--order-auth-height', `${authHeight}px`);
        orderStickyHeights.auth = authHeight;
    }
    if (navHeight !== orderStickyHeights.nav) {
        rootStyle.setProperty('--order-nav-height', `${navHeight}px`);
        orderStickyHeights.nav = navHeight;
    }
    return {
        height: authHeight + navHeight,
        offset: authHeight + navHeight + (window.innerWidth >= 1024 ? 16 : 8)
    };
}

function initOrderStickyLayout() {
    syncOrderStickyLayout();
    if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
            syncOrderStickyLayout();
        });
        ['desktop-auth-bar', 'main-nav'].forEach(id => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOrderStickyLayout, { once: true });
} else {
    initOrderStickyLayout();
}
window.addEventListener('resize', () => {
    syncOrderStickyLayout();
    updateActiveNavOnScroll();
});

function scrollNavButtonHorizontally(btn) {
    const nav = document.getElementById('main-nav');
    if (!nav) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    // scrollIntoView also scrolls the document when sticky bars resize.
    nav.scrollTo({
        left: nav.scrollLeft + btnRect.left - navRect.left - (nav.clientWidth - btnRect.width) / 2,
        behavior: 'smooth'
    });
}

function scrollToSec(id) {
    const el = document.getElementById(id);
    if (!el) return;

    isManualScrollLock = true;
    clearTimeout(manualScrollTimeout);
    manualScrollTimeout = setTimeout(() => {
        isManualScrollLock = false;
    }, 900);

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.querySelector(`.nav-btn[onclick="scrollToSec('${id}')"]`);
    if (targetBtn) {
        targetBtn.classList.add('active');
        scrollNavButtonHorizontally(targetBtn);
    }

    const totalOffset = syncOrderStickyLayout().offset;

    const targetY = el.getBoundingClientRect().top + window.pageYOffset - totalOffset;
    window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });

    document.querySelectorAll('.section-container').forEach(s => s.classList.remove('section-highlight-flash'));
    void el.offsetWidth;
    el.classList.add('section-highlight-flash');
    setTimeout(() => {
        el.classList.remove('section-highlight-flash');
    }, 1300);

    if (typeof updateFooterButtonState === 'function') updateFooterButtonState();
}

function updateActiveNavOnScroll() {
    if (isManualScrollLock) return;

    const sections = Array.from(document.querySelectorAll('.section-container'));
    if (sections.length === 0) return;

    const scanLine = syncOrderStickyLayout().height + 40;

    const isBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 60);
    let currentActiveId = null;

    if (isBottom) {
        currentActiveId = sections[sections.length - 1].id;
    } else {
        for (let i = 0; i < sections.length; i++) {
            const rect = sections[i].getBoundingClientRect();
            if (rect.top <= scanLine && rect.bottom > scanLine) {
                currentActiveId = sections[i].id;
                break;
            }
        }
        if (!currentActiveId && sections[0] && sections[0].getBoundingClientRect().top > scanLine) {
            currentActiveId = sections[0].id;
        }
    }

    if (currentActiveId) {
        const targetBtn = document.querySelector(`.nav-btn[onclick="scrollToSec('${currentActiveId}')"]`);
        if (targetBtn && !targetBtn.classList.contains('active')) {
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
            targetBtn.classList.add('active');
            scrollNavButtonHorizontally(targetBtn);
        }
    }
}

var scrollTimeout = null;
window.addEventListener('scroll', () => {
    if (typeof updateFooterButtonState === 'function') updateFooterButtonState();
    updateActiveNavOnScroll();

    const footerEl = document.querySelector('.footer');
    if (footerEl) {
        if (!footerEl.classList.contains('scrolling')) {
            footerEl.classList.add('scrolling');
        }
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            footerEl.classList.remove('scrolling');
        }, 200);
    }
}, { passive: true });

// --- ALERT & MODAL HELPERS ---
function customAlert(msg, callback = null) {
    const msgEl = document.getElementById('custom-alert-message');
    if (msgEl) msgEl.innerHTML = msg;
    const alertBox = document.getElementById('custom-alert');
    if (alertBox) alertBox.style.display = 'flex';
    window.alertCallback = callback;
}

function closeCustomAlert() {
    const alertBox = document.getElementById('custom-alert');
    if (alertBox) alertBox.style.display = 'none';
    if (window.alertCallback) {
        const cb = window.alertCallback;
        window.alertCallback = null;
        cb();
    }
}

function closeAndExitLiff() {
    try {
        if (typeof liff !== 'undefined' && liff.closeWindow) {
            liff.closeWindow();
        }
    } catch (e) {
        console.warn("liff.closeWindow failed:", e);
    }
    try {
        window.close();
    } catch (e) {}
}

function closeDesktopQrModal() {
    const modal = document.getElementById('desktop-qr-modal');
    if (modal) modal.style.display = 'none';
}

function openDesktopQrModal() {
    const modal = document.getElementById('desktop-qr-modal');
    const qrImg = document.getElementById('desktop-qr-img');
    if (qrImg) {
        const currentUrl = encodeURIComponent(window.location.href);
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${currentUrl}`;
    }
    if (modal) modal.style.display = 'flex';
}

// --- LINE LIFF SINGLETON & DESKTOP AUTH ---
function getCleanLiffRedirectUri() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        url.searchParams.delete('liffClientId');
        url.searchParams.delete('liffRedirectUri');
        for (const key of [...url.searchParams.keys()]) {
            if (key.startsWith('liff.')) url.searchParams.delete(key);
        }
        url.searchParams.delete('access_token');
        url.hash = '';

        if (url.pathname === '/index.html') {
            url.pathname = '/';
        }

        const currentTenant = (typeof getTenantIdFromUrl === 'function' ? getTenantIdFromUrl() : window.__INITIAL_TENANT_ID) || 'benmi';
        const orderPath = url.hostname === 'order.blabfood.app' && url.pathname.match(/^\/([a-zA-Z0-9_-]+)\/?$/);
        if (orderPath && orderPath[1] === currentTenant) {
            url.searchParams.delete('tenant_id');
            url.searchParams.delete('tenant');
        } else if (currentTenant) {
            url.searchParams.set('tenant_id', currentTenant);
            url.searchParams.delete('tenant');
        }


        return url.toString();
    } catch (e) {
        return window.location.href;
    }
}
window.getCleanLiffRedirectUri = getCleanLiffRedirectUri;

var activeLiffConfig = null;
function getLiffLoginRedirectUri() {
    if (!activeLiffConfig?.liffEndpointUrl) throw new Error('LINE endpoint configuration unavailable');
    const target = new URL(activeLiffConfig.liffEndpointUrl);
    const current = new URL(window.location.href);
    const businessKeys = ['mode', 'order_key', 'key', 'parent_order_key', 'parent_display_key', 'display_key', 'table', 'table_number', 'takeaway', 'lang', 'collection', 'shift', 'ch', 'channel', 'tag'];
    const hashParams = new URLSearchParams(current.hash.replace(/^#/, ''));
    businessKeys.forEach(key => {
        const value = current.searchParams.get(key) ?? hashParams.get(key);
        if (value !== null) target.searchParams.set(key, value);
    });
    if (activeLiffConfig.customerOrderDomain === 'legacy') target.searchParams.set('tenant_id', getTenantIdFromUrl());
    return target.toString();
}
window.getLiffLoginRedirectUri = getLiffLoginRedirectUri;

function isCurrentLiffEndpoint(endpoint) {
    const target = new URL(endpoint);
    const current = new URL(window.location.href);
    // Pages canonicalizes index.html to /; accept that same-origin document
    // without repeatedly navigating back to the recorded Console endpoint.
    const targetPath = target.pathname === '/index.html' ? '/' : target.pathname;
    const basePath = targetPath.replace(/\/$/, '');
    return current.origin === target.origin && (current.pathname === targetPath || current.pathname === basePath || current.pathname.startsWith(basePath + '/'));
}


var liffInitPromise = null;
var isLiffInitialized = false;

function ensureLiffReady() {
    if (window.isStaffOrderMode) return Promise.resolve(null);
    if (isLiffInitialized && typeof liff !== 'undefined') return Promise.resolve(liff);
    if (liffInitPromise) return liffInitPromise;

    liffInitPromise = (async () => {
        if (typeof liff === 'undefined' || typeof liff.init !== 'function') {
            return null;
        }
        if (isLiffInitialized) {
            return liff;
        }

        const tenantId = getTenantIdFromUrl();
        if (!tenantId || window.__TENANT_RESOLUTION_FAILED) throw new Error('Tenant context unavailable');

        try {
            // Resolve from D1 before initializing LIFF. Cached menu/theme data can
            // contain an old LIFF ID and start login in another store's LINE app.
            const configSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
                ? AbortSignal.timeout(5000)
                : undefined;
            const configResponse = await fetch(`${WORKER_BASE}/api/config?tenant_id=${encodeURIComponent(tenantId)}`, {
                cache: 'no-store',
                signal: configSignal
            });
            if (!configResponse.ok) throw new Error(`Tenant config request failed: ${configResponse.status}`);
            const tenantConfig = await configResponse.json();
            if (tenantConfig.tenantId !== tenantId || !['legacy', 'blabfood'].includes(tenantConfig.customerOrderDomain) || !tenantConfig.liffEndpointUrl) {
                throw new Error('Tenant LINE endpoint configuration unavailable');
            }
            const endpoint = new URL(tenantConfig.liffEndpointUrl);
            const allowedOrigins = ['https://benmi-order.pages.dev', 'https://dev.benmi-order.pages.dev', 'https://staging.benmi-order.pages.dev', 'https://blabfood.app', 'https://www.blabfood.app', 'https://order.blabfood.app'];
            if (!allowedOrigins.includes(endpoint.origin) || endpoint.username || endpoint.password) throw new Error('Invalid LINE endpoint');
            activeLiffConfig = tenantConfig;
            const liffId = tenantConfig?.liffId;
            if (!liffId || typeof liffId !== 'string') throw new Error(`No LIFF ID configured for tenant ${tenantId}`);

            if (!isCurrentLiffEndpoint(tenantConfig.liffEndpointUrl)) {
                const params = new URLSearchParams(window.location.search);
                const isCallback = [...params.keys()].some(key => key === 'code' || key === 'state' || key === 'access_token' || key.startsWith('liff.') || key === 'liffClientId' || key === 'liffRedirectUri');
                if (isCallback) throw new Error('LINE endpoint changed; reopen the store link to sign in again');
                window.__ORDER_DOMAIN_HANDOFF = true;
                window.location.replace(getLiffLoginRedirectUri());
                return null;
            }
            let initTimer;
            try {
                if (typeof setTimeout === 'function') {
                    await Promise.race([
                        liff.init({ liffId }),
                        new Promise((_, reject) => {
                            initTimer = setTimeout(() => reject(new Error('LIFF init timeout')), 5000);
                        })
                    ]);
                } else {
                    await liff.init({ liffId });
                }
            } finally {
                if (typeof clearTimeout === 'function') clearTimeout(initTimer);
            }
            isLiffInitialized = true;
            console.log(`[LIFF] Initialized successfully for tenant [${tenantId}] with ID:`, liffId);

            const currentParams = new URLSearchParams(window.location.search);
            const malformedTenant = /\?tenant_id=/.test(currentParams.get('tenant_id') || '');
            if (currentParams.has('code') || currentParams.has('liffClientId') || malformedTenant) {
                const cleanUrl = getCleanLiffRedirectUri();
                if (window.history && window.history.replaceState) {
                    window.history.replaceState({}, document.title, cleanUrl);
                }
            }
            try {
                sessionStorage.removeItem('pending_line_login_tenant_id');
            } catch (e) {}
        } catch (initErr) {
            console.warn('[LIFF] Init error for tenant [' + tenantId + ']:', initErr);
            isLiffInitialized = false;
            liffInitPromise = null;
            throw initErr;
        }
        return liff;
    })();

    return liffInitPromise;
}
window.ensureLiffReady = ensureLiffReady;

function isDesktopOutsideLiff() {
    if (window.isStaffOrderMode) return false;
    try {
        if (typeof window !== 'undefined' && window.location && typeof URLSearchParams !== 'undefined') {
            const sp = new URLSearchParams(window.location.search);
            if (sp.has('skip_liff') || sp.has('guest') || sp.has('bypass_liff')) {
                return false;
            }
        }
    } catch (e) {}

    if (!isLiffInitialized || typeof liff === 'undefined' || typeof liff.isInClient !== 'function') {
        const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
        const isLine = /Line\//i.test(ua);
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
        return !isLine && !isMobile;
    }
    try {
        return !liff.isInClient();
    } catch(e) {
        return false;
    }
}

function checkDesktopAuthGuard() {
    if (window.isStaffOrderMode) return !!window.StaffOrder?.ready();
    if (isDesktopOutsideLiff()) {
        let isLoggedIn = false;
        try {
            if (isLiffInitialized && typeof liff !== 'undefined' && typeof liff.isLoggedIn === 'function') {
                isLoggedIn = liff.isLoggedIn();
            }
        } catch(e) {}
        if (!isLoggedIn) {
            openDesktopLoginModal();
            return false;
        }
    }
    return true;
}

function openDesktopLoginModal() {
    const modal = document.getElementById('desktop-center-auth-overlay');
    if (modal) modal.style.display = 'flex';
}

function closeDesktopLoginModal() {
    const modal = document.getElementById('desktop-center-auth-overlay');
    if (modal) modal.style.display = 'none';
}

async function triggerDesktopLineLogin() {
    try {
        await ensureLiffReady();
        if (window.__ORDER_DOMAIN_HANDOFF) return;
    } catch (initErr) {
        console.error('[LIFF] Desktop initialization failed:', initErr);
        customAlert('LINE 登入暫時無法使用，請重試');
        return;
    }
    if (typeof liff !== 'undefined' && liff.login) {
        const tenantId = getTenantIdFromUrl();
        const storageKey = `cart_save_${tenantId}`;
        try {
            sessionStorage.setItem('current_tenant_id', tenantId);
            sessionStorage.setItem('pending_line_login_tenant_id', tenantId);
            localStorage.setItem(storageKey, JSON.stringify({ cart: window.cart, customizeData: window.customizeData, comboDrinkData: window.comboDrinkData, bundleCartData: window.bundleCartData || {} }));
        } catch(e) {}
        const cleanRedirectUri = getLiffLoginRedirectUri();
        try {
            liff.login({ redirectUri: cleanRedirectUri });
        } catch (loginErr) {
            console.error('[LIFF] Desktop login failed:', loginErr);
            try { sessionStorage.removeItem('pending_line_login_tenant_id'); } catch (e) {}
            customAlert('LINE 登入失敗，請重試');
        }
    }
}

async function updateDesktopAuthUI() {
    const bar = document.getElementById('desktop-auth-bar');
    const centerOverlay = document.getElementById('desktop-center-auth-overlay');
    const pageBody = document.getElementById('page-body-content');

    try {
        await ensureLiffReady();
    } catch (initErr) {
        console.warn('[LIFF] Desktop initialization notice:', initErr);
    }

    if (!isDesktopOutsideLiff()) {
        if (bar) bar.style.display = 'none';
        if (centerOverlay) centerOverlay.style.display = 'none';
        if (pageBody) pageBody.classList.remove('desktop-guest-locked');
        syncOrderStickyLayout();
        window.__storeAuthCleared = true;
        maybeShowStoreNotice();
        return;
    }

    const loggedInEl = document.getElementById('desktop-auth-logged-in');
    const loggedOutEl = document.getElementById('desktop-auth-logged-out');

    let isLoggedIn = false;
    try {
        if (isLiffInitialized && typeof liff !== 'undefined' && typeof liff.isLoggedIn === 'function') {
            isLoggedIn = liff.isLoggedIn();
        }
    } catch(e) {
        console.warn('[LIFF] isLoggedIn check notice:', e);
    }

    if (isLoggedIn) {
        if (bar) bar.style.display = 'block';
        if (loggedOutEl) loggedOutEl.style.display = 'none';
        if (loggedInEl) loggedInEl.style.display = 'flex';
        if (centerOverlay) centerOverlay.style.display = 'none';
        if (pageBody) pageBody.classList.remove('desktop-guest-locked');
        syncOrderStickyLayout();
        window.__storeAuthCleared = true;
        maybeShowStoreNotice();

        try {
            const profile = await liff.getProfile();
            if (profile) {
                const nameEl = document.getElementById('desktop-user-name');
                if (nameEl) nameEl.innerText = profile.displayName || (typeof ct === 'function' ? ct('desktop_guest') : '顧客');
                const avatarEl = document.getElementById('desktop-user-avatar');
                const placeholderEl = document.getElementById('desktop-user-placeholder-icon');
                if (profile.pictureUrl && avatarEl) {
                    avatarEl.src = profile.pictureUrl;
                    avatarEl.style.display = 'inline-block';
                    if (placeholderEl) placeholderEl.style.display = 'none';
                }
            }
        } catch(e) {}
    } else {
        window.__storeAuthCleared = false;
        const noticeModal = document.getElementById('store-notice-modal');
        if (noticeModal) noticeModal.classList.remove('is-open');
        if (bar) bar.style.display = 'none';
        if (loggedInEl) loggedInEl.style.display = 'none';
        if (loggedOutEl) loggedOutEl.style.display = 'none';
        if (centerOverlay) centerOverlay.style.display = 'flex';
        if (pageBody) pageBody.classList.add('desktop-guest-locked');
    }
    syncOrderStickyLayout();
}

// --- STORE STATUS & BUSINESS HOURS ---
function hasConfiguredOperatingHours(cfg = storeConfig) {
    if (!cfg) return false;
    if (!cfg.operatingHours || typeof cfg.operatingHours !== 'object') return false;
    return Object.values(cfg.operatingHours).some(shifts => Array.isArray(shifts) && shifts.length > 0);
}

function getEffectiveMenuScheduleTime() {
    const orderType = (typeof window !== 'undefined' && (window.currentDiningOption || window.selectedOrderType))
        || (typeof selectedOrderType !== 'undefined' ? selectedOrderType : 'takeaway');
    const allowScheduled = isScheduledCheckoutEnabled(orderType);
    if ((orderType === 'takeaway' || orderType === 'delivery') && allowScheduled && !window.isStaffOrderMode && typeof document !== 'undefined') {
        const dateEl = document.getElementById('pickup-date');
        const timeEl = document.getElementById('pickup-time');
        const dateStr = dateEl && typeof dateEl.value === 'string' ? dateEl.value.trim() : '';
        const timeStr = timeEl && typeof timeEl.value === 'string' ? timeEl.value.trim() : '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && /^\d{1,2}:\d{2}$/.test(timeStr)) {
            return { dateStr, timeStr, isScheduled: true };
        }
    }
    const nowParts = formatTaiwanDateTime(getTaiwanDate());
    return { dateStr: nowParts.dateStr, timeStr: nowParts.timeStr, isScheduled: false };
}

function isStoreClosedExpired(closedDate, nowTime = new Date(), operatingHours = null, autoOpenBeforeMinutes = 60) {
    if (!closedDate) return true;
    const match = closedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return true;
    const cYear = parseInt(match[1], 10);
    const cMonth = parseInt(match[2], 10);
    const cDay = parseInt(match[3], 10);

    const parsedHours = (() => {
        if (!operatingHours) return {};
        if (typeof operatingHours === 'string') {
            try { return JSON.parse(operatingHours); } catch { return {}; }
        }
        if (typeof operatingHours === 'object') return operatingHours;
        return {};
    })();

    const leadMinutes = typeof autoOpenBeforeMinutes === 'number' && !isNaN(autoOpenBeforeMinutes) && autoOpenBeforeMinutes >= 0
        ? autoOpenBeforeMinutes
        : 60;

    let foundShift = null;
    for (let offset = 1; offset <= 7; offset++) {
        const candDateUtc = new Date(Date.UTC(cYear, cMonth - 1, cDay + offset));
        const dayOfWeek = candDateUtc.getUTCDay();
        const shifts = parsedHours[dayOfWeek] || parsedHours[String(dayOfWeek)];
        if (Array.isArray(shifts) && shifts.length > 0 && shifts[0]?.start) {
            foundShift = {
                candYear: candDateUtc.getUTCFullYear(),
                candMonth: candDateUtc.getUTCMonth() + 1,
                candDay: candDateUtc.getUTCDate(),
                start: shifts[0].start
            };
            break;
        }
    }

    const nowMs = nowTime.getTime();

    if (foundShift) {
        const [sH, sM] = foundShift.start.split(':').map(Number);
        const validH = isNaN(sH) ? 11 : sH;
        const validM = isNaN(sM) ? 0 : sM;
        const shiftStartUtcMs = Date.UTC(foundShift.candYear, foundShift.candMonth - 1, foundShift.candDay, validH - 8, validM, 0);
        const reopenUtcMs = shiftStartUtcMs - (leadMinutes * 60 * 1000);
        return nowMs >= reopenUtcMs;
    }

    const nextDayUtc = new Date(Date.UTC(cYear, cMonth - 1, cDay + 1));
    const nextDayOfWeek = nextDayUtc.getUTCDay();
    const defaultHour = (nextDayOfWeek === 0 || nextDayOfWeek === 6) ? 9 : 11;
    const defaultShiftUtcMs = Date.UTC(nextDayUtc.getUTCFullYear(), nextDayUtc.getUTCMonth(), nextDayUtc.getUTCDate(), defaultHour - 8, 0, 0);
    const defaultReopenUtcMs = defaultShiftUtcMs - (leadMinutes * 60 * 1000);

    if (nowMs >= defaultReopenUtcMs) {
        return true;
    }

    const nowTw = new Date(nowTime.getTime() + 8 * 3600000);
    const daysDiff = (Date.UTC(nowTw.getUTCFullYear(), nowTw.getUTCMonth(), nowTw.getUTCDate()) -
        Date.UTC(cYear, cMonth - 1, cDay)) / 86400000;
    return daysDiff > 7;
}

function resolveStoreStatus(cfg = storeConfig, nowTime = new Date()) {
    let status = cfg?.storeStatus;
    if (!status) return status;
    if (typeof status === 'string' && status.startsWith('closed:')) {
        const closedDate = status.slice(7).trim();
        const autoOpenMins = cfg?.autoOpenBeforeMinutes ?? 60;
        status = isStoreClosedExpired(closedDate, nowTime, cfg?.operatingHours, autoOpenMins) ? 'open' : 'closed';
    }
    return status;
}

function isManualStoreOpen(dateObj = getTaiwanDate()) {
    const status = resolveStoreStatus(storeConfig);
    return (status === 'open' || status === 'busy') && dateObj.toDateString() === getTaiwanDate().toDateString();
}

function isStoreOpen(twTime) {
    const currentStatus = resolveStoreStatus(storeConfig);
    if (['paused', 'closed'].includes(currentStatus)) return false;
    const hasSchedule = hasConfiguredOperatingHours(storeConfig);
    if (!hasSchedule) {
        if (isManualStoreOpen(twTime)) return true;
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

    if (typeof MenuSchedule !== 'undefined' && typeof MenuSchedule.isStoreOpenAt === 'function') {
        const target = twTime instanceof Date ? formatTaiwanDateTime(twTime) : twTime;
        return MenuSchedule.isStoreOpenAt(storeConfig?.operatingShifts, storeConfig?.operatingHours, target);
    }

    const day = twTime.getDay();
    const hours = twTime.getHours();
    const minutes = twTime.getMinutes();
    const timeValue = hours + minutes / 60;
    
    const shifts = storeConfig.operatingHours[day] || storeConfig.operatingHours[String(day)] || [];
    for (let shift of shifts) {
        if (!shift || !shift.start || !shift.end) continue;
        const [sH, sM] = shift.start.split(':').map(Number);
        const [eH, eM] = shift.end.split(':').map(Number);
        const startVal = sH + sM / 60;
        let endVal = eH + eM / 60;
        
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

function renderWaitingCounterBadge(count) {
    const badge = document.getElementById("waiting-counter-badge");
    if (!badge) return;
    const numericCount = Number(count) || 0;
    badge.dataset.waitingCount = String(numericCount);
    if (numericCount > 0) {
        const aheadLabel = typeof ct === 'function' ? ct('waiting_ahead') : '前方排隊：';
        const unitLabel = typeof ct === 'function' ? ct('waiting_orders_unit') : ' 單';
        badge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> <span>${aheadLabel}<strong style="color: #78350f; font-size: 15px;">${numericCount}</strong>${unitLabel}</span>`;
        badge.style.display = "inline-flex";
    } else {
        badge.style.display = "none";
    }
}

function checkStoreStatus() {
    const twTime = getTaiwanDate();
    const isOpen = isStoreOpen(twTime);
    const statusEl = document.getElementById('store-status');
    const pausedBanner = document.getElementById('store-paused-banner');
    const busyBanner = document.getElementById('store-busy-banner');
    const submitButtons = ['btn-submit', 'btn-desktop-submit'].map(id => document.getElementById(id)).filter(Boolean);
    const storeStatus = resolveStoreStatus(storeConfig);
    const t = (key, fallback) => (typeof ct === 'function' ? ct(key) : fallback);

    const badge = document.getElementById("waiting-counter-badge");
    if (badge && badge.dataset.waitingCount) {
        renderWaitingCounterBadge(Number(badge.dataset.waitingCount));
    }

    if (storeStatus === 'paused' || storeStatus === 'closed') {
        if (statusEl) {
            statusEl.innerText = storeStatus === 'closed' ? t('status_today_closed', '今日打烊') : t('status_paused', '暫停接單');
            statusEl.className = 'store-status paused';
        }
        if (pausedBanner) {
            pausedBanner.style.display = 'flex';
            const pausedText = pausedBanner.querySelector('[data-i18n="banner_paused_desc"]') || pausedBanner.querySelector('span');
            if (pausedText) {
                pausedText.innerText = storeStatus === 'closed'
                    ? t('banner_closed_desc', '店家今日已打烊，暫不接受新訂單')
                    : t('banner_paused_desc', '目前門市暫不接受新訂單，敬請見諒！');
            }
        }
        if (busyBanner) busyBanner.style.display = 'none';
        for (const submitBtn of submitButtons) {
            if (window.isSubmitting) continue;
            submitBtn.disabled = true;
            submitBtn.innerText = storeStatus === 'closed' ? t('btn_store_closed', '今日已打烊') : t('btn_store_paused', '店家目前暫停接單');
            submitBtn.style.background = '#9ca3af';
            submitBtn.style.cursor = 'not-allowed';
        }
    } else if (storeStatus === 'busy') {
        if (statusEl) {
            statusEl.innerText = isOpen ? t('status_busy', '繁忙中 (+1h)') : t('status_closed', '休息中');
            statusEl.className = isOpen ? 'store-status busy' : 'store-status closed';
        }
        if (pausedBanner) pausedBanner.style.display = 'none';
        if (busyBanner) busyBanner.style.display = 'flex';
        for (const submitBtn of submitButtons) {
            if (window.isSubmitting) continue;
            submitBtn.disabled = false;
            submitBtn.innerText = t('btn_submit_order', '確認下單');
            submitBtn.style.background = '';
            submitBtn.style.cursor = '';
        }
    } else {
        if (statusEl) {
            statusEl.innerText = isOpen ? t('status_open', '營業中') : t('status_closed', '休息中');
            statusEl.className = isOpen ? 'store-status' : 'store-status closed';
        }
        if (pausedBanner) pausedBanner.style.display = 'none';
        if (busyBanner) busyBanner.style.display = 'none';
        for (const submitBtn of submitButtons) {
            if (window.isSubmitting) continue;
            submitBtn.disabled = false;
            submitBtn.innerText = t('btn_submit_order', '確認下單');
            submitBtn.style.background = '';
            submitBtn.style.cursor = '';
        }
    }
    if (!['paused', 'closed'].includes(storeStatus) && !window.isSubmitting && typeof updateFooterButtonState === 'function') {
        updateFooterButtonState();
    }
}

async function fetchWaitingCounter() {
    try {
        const headers = {};
        if (indexOrdersETag) headers["If-None-Match"] = indexOrdersETag;
        const tenantId = getTenantIdFromUrl();
        const res = await fetch(`${WORKER_BASE}/api/orders/waiting-count?tenant_id=${tenantId}`, { headers });
        if (res.status === 304 || !res.ok) return;

        const etag = res.headers.get("ETag");
        if (etag) indexOrdersETag = etag;

        const data = await res.json();
        renderWaitingCounterBadge(data.waitingCount || 0);
    } catch (e) {
        console.error("Error fetching waiting counter:", e);
    }
}

// --- INIT APP BOOTLOADER ---
async function initApp() {
    if (window.__appInitialized) return;
    window.__appInitialized = true;
    setTodayDate(true);
    updateAsapTimeDisplay();
    renderStoreOperatingHours();
    const tenantId = getTenantIdFromUrl();

    // 1. Instant 0ms Hydration from LocalStorage for repeat visits
    try {
        const cachedRaw = localStorage.getItem(`tenant_bootstrap_${tenantId}`);
        if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw);
            if (parsed?.tenant?.id === tenantId && Number(parsed.bootstrapVersion) >= 8 && parsed.menuComplete === true) {
                bootstrapData = parsed;
                window.bootstrapData = parsed;
                if (typeof buildModifierPriceMap === 'function') {
                    buildModifierPriceMap(parsed);
                }
                storeConfig = {
                    allowScheduledPickup: parsed.tenant.allowScheduledPickup,
                    allowDineIn: parsed.tenant.allowDineIn,
                    dineInTableMode: parsed.tenant.dineInTableMode || 'required',
                    features: parsed.tenant.features || [],
                    orderPrefix: parsed.tenant.orderPrefix,
                    storeStatus: parsed.tenant.storeStatus,
                    prepTimeMinutes: parsed.tenant.prepTimeMinutes !== undefined ? Number(parsed.tenant.prepTimeMinutes) : 5,
                    operatingHours: parsed.tenant.parsedHours,
                    operatingShifts: parsed.tenant.operatingShifts || [],
                    qrChannels: parsed.tenant.qrChannels || [],
                    liffId: parsed.tenant.liffId
                };
                window.storeConfig = storeConfig;
                applyTenantTheme(parsed.tenant);
                if (typeof renderDynamicCatalog === 'function') renderDynamicCatalog();
                renderStoreOperatingHours();
                applyPickupConfig();
            }
        }
    } catch(e) {
        console.warn('[Cache] Instant hydration notice:', e);
    }

    // 2. Fetch fresh bootstrap in background (Stale-While-Revalidate)
    window.menuPromise = (typeof fetchMenu === 'function' ? fetchMenu() : Promise.resolve()).then(() => {
        if (typeof renderDynamicCatalog === 'function') renderDynamicCatalog();
        renderStoreOperatingHours();
        applyPickupConfig();
    }).catch(err => {
        console.warn('[MenuPromise] Background refresh notice:', err);
    });

    // 3. Initialize LIFF asynchronously via Singleton Gate
    ensureLiffReady().then(() => {
        updateDesktopAuthUI();
    }).catch(err => {
        console.warn('[LIFF] Background initialization notice:', err);
        updateDesktopAuthUI();
    });

    await window.menuPromise;

    if (!window.isStaffOrderMode && typeof initAppendModeIfPresent === 'function') {
        initAppendModeIfPresent();
    }
    if (!window.isStaffOrderMode && typeof initEditOrderModeIfPresent === 'function') {
        initEditOrderModeIfPresent();
    }
    applyPickupConfig();

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const isEditOrderUrl = urlParams.get('mode') === 'edit_order' || urlParams.get('mode') === 'edit';
        if (!window.isStaffOrderMode && !window.isEditOrderMode && !isEditOrderUrl) {
            const saved = localStorage.getItem(`cart_save_${tenantId}`);
            if (saved) {
                const parsed = JSON.parse(saved);
                cart = parsed.cart || {};
                window.cart = cart;
                customizeData = parsed.customizeData || {};
                window.customizeData = customizeData;
                comboDrinkData = parsed.comboDrinkData || {};
                window.comboDrinkData = comboDrinkData;
                window.bundleCartData = parsed.bundleCartData || {};
                reconcileCartOptions();
                localStorage.removeItem(`cart_save_${tenantId}`);
                if (typeof updateQty === 'function') {
                    for (let key in cart) {
                        if (cart[key] > 0 && typeof parseCartKey === 'function') {
                            const { catSlug, origName } = parseCartKey(key);
                            updateQty(catSlug, origName, 0);
                        }
                    }
                }
            }
        }
    } catch(e) {}

    setTodayDate(true);
    checkStoreStatus();
    setInterval(checkStoreStatus, 60000);
    if (typeof fetchMenu === 'function') setInterval(fetchMenu, 10000);
    fetchWaitingCounter();
    setInterval(fetchWaitingCounter, 30000);
    setInterval(updateAsapTimeDisplay, 1000);
    setInterval(() => setTodayDate(false), 30000);

    window.addEventListener('pageshow', () => {
        setTodayDate(true);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            setTodayDate(false);
        }
    });
}

// Window Public Bindings
window.getTenantIdFromUrl = getTenantIdFromUrl;
window.setCustomerDiningOption = setCustomerDiningOption;
window.toggleStoreHours = toggleStoreHours;
window.renderStoreOperatingHours = renderStoreOperatingHours;
window.applyTenantTheme = applyTenantTheme;
window.getTaiwanDate = getTaiwanDate;
window.formatTaiwanDateTime = formatTaiwanDateTime;
window.setTodayDate = setTodayDate;
window.updateAsapTimeDisplay = updateAsapTimeDisplay;
window.applyPickupConfig = applyPickupConfig;
window.scrollToSec = scrollToSec;
window.updateActiveNavOnScroll = updateActiveNavOnScroll;
window.customAlert = customAlert;
window.closeCustomAlert = closeCustomAlert;
window.closeAndExitLiff = closeAndExitLiff;
window.closeDesktopQrModal = closeDesktopQrModal;
window.openDesktopQrModal = openDesktopQrModal;
window.isDesktopOutsideLiff = isDesktopOutsideLiff;
window.checkDesktopAuthGuard = checkDesktopAuthGuard;
window.openDesktopLoginModal = openDesktopLoginModal;
function getStoreNoticeTenantKey() {
    if (window.__storeNoticeTenantId) return String(window.__storeNoticeTenantId);
    if (typeof TENANT_ID !== 'undefined' && TENANT_ID) return String(TENANT_ID);
    try {
        const params = new URLSearchParams(window.location.search);
        const qTenant = params.get('tenant');
        if (qTenant) return String(qTenant);
    } catch (e) {}
    return (window.location && window.location.hostname) || 'default';
}

function getStoreNoticeAckKey() {
    return `store_notice_seen_${getStoreNoticeTenantKey()}`;
}

function getStoreNoticeVersion(notice) {
    if (!notice) return '';
    if (notice.version && String(notice.version).trim()) {
        return String(notice.version).trim();
    }
    return `${notice.title || ''}\n${notice.body || ''}`;
}

function openStoreNoticeModal(notice) {
    const modal = document.getElementById('store-notice-modal');
    if (!modal || !notice) return;

    const titleEl = document.getElementById('store-notice-modal-title');
    const bodyEl = document.getElementById('store-notice-modal-body');
    const ackEl = document.getElementById('store-notice-ack-checkbox');

    const titleText = notice.title ? String(notice.title).trim() : '';
    const bodyText = notice.body ? String(notice.body).trim() : '';

    if (titleEl) {
        titleEl.textContent = titleText || (typeof ct === 'function' ? ct('notice_modal_title') : '門市公告');
    }
    if (bodyEl) {
        if (bodyText) {
            bodyEl.innerHTML = (window.StoreNoticeFormat && typeof window.StoreNoticeFormat.renderBody === 'function')
                ? window.StoreNoticeFormat.renderBody(bodyText)
                : bodyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            bodyEl.style.display = '';
        } else {
            bodyEl.innerHTML = '';
            bodyEl.style.display = 'none';
        }
    }
    if (ackEl) {
        ackEl.checked = false;
    }

    const version = getStoreNoticeVersion(notice);
    modal.dataset.version = version;
    window.__storeNoticeHandledVersion = version;
    modal.classList.add('is-open');
}

function closeStoreNoticeModal() {
    const modal = document.getElementById('store-notice-modal');
    if (!modal) return;

    const ackEl = document.getElementById('store-notice-ack-checkbox');
    const version = modal.dataset.version || getStoreNoticeVersion(window.__currentStoreNotice);

    if (ackEl && ackEl.checked && version) {
        try {
            localStorage.setItem(getStoreNoticeAckKey(), version);
        } catch (e) {}
    }

    modal.classList.remove('is-open');
}

function maybeShowStoreNotice() {
    if (!window.__storeAuthCleared) return;

    const notice = window.__currentStoreNotice;
    if (!notice || notice.enabled === false) {
        const modal = document.getElementById('store-notice-modal');
        if (modal && modal.classList.contains('is-open')) {
            modal.classList.remove('is-open');
        }
        return;
    }

    const hasTitle = Boolean(notice.title && String(notice.title).trim());
    const hasBody = Boolean(notice.body && String(notice.body).trim());
    if (!hasTitle && !hasBody) return;

    const version = getStoreNoticeVersion(notice);
    if (window.__storeNoticeHandledVersion === version) return;

    try {
        const seenVersion = localStorage.getItem(getStoreNoticeAckKey());
        if (seenVersion && seenVersion === version) {
            return;
        }
    } catch (e) {}

    openStoreNoticeModal(notice);
}

window.openStoreNoticeModal = openStoreNoticeModal;
window.closeStoreNoticeModal = closeStoreNoticeModal;
window.maybeShowStoreNotice = maybeShowStoreNotice;
window.closeDesktopLoginModal = closeDesktopLoginModal;
window.triggerDesktopLineLogin = triggerDesktopLineLogin;
window.updateDesktopAuthUI = updateDesktopAuthUI;
window.hasConfiguredOperatingHours = hasConfiguredOperatingHours;
window.getEffectiveMenuScheduleTime = getEffectiveMenuScheduleTime;
window.isStoreOpen = isStoreOpen;
window.checkStoreStatus = checkStoreStatus;
window.fetchWaitingCounter = fetchWaitingCounter;
window.initApp = initApp;
window.buildModifierPriceMap = buildModifierPriceMap;
window.getModifierPrice = getModifierPrice;
window.getEffectiveItemModifierGroups = getEffectiveItemModifierGroups;
window.calculatePortionExtra = calculatePortionExtra;
