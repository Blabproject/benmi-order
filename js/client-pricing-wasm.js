/**
 * Benmi Rust WebAssembly Pricing Engine Client
 * 
 * Provides high-performance, edge-identical pricing calculations in the browser.
 * Falls back transparently to JavaScript calculation functions if WebAssembly
 * is unsupported, loading, or encounters an unexpected input.
 */

(function () {
    const isNode = typeof window === 'undefined' || (typeof process !== 'undefined' && Boolean(process.versions?.node));
    const hasWasm = typeof WebAssembly !== 'undefined';
    const target = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);

    const PricingWasm = target.PricingWasm || (target.PricingWasm = {
        isReady: false,
        readyPromise: null,
        calculateCategoryBundle: null,
        calculateRoundTotal: null,
        validateUnifiedCart: null,
        validateOptionSelection: null,
        buildOptionCatalog: null,
        buildRoundInput: null,
        normalizePortionGroups: null,
        calculatePortionPrice: null,
        calculatePortionExtra: null,
        calculateCart: null
    });

    /**
     * Converts bootstrapData catalog, modifiers, and customizations into
     * an edge-identical OptionCatalog matching Rust pricing_core.
     */
    function buildOptionCatalog(bData) {
        if (!bData || !Array.isArray(bData.catalog)) {
            return { revision: 1, products: [], categories: [], groups: [], links: [], categoryLinks: [] };
        }
        if (bData._wasmOptionCatalog && bData._wasmOptionCatalogRevision === (bData.revision || 1)) {
            return bData._wasmOptionCatalog;
        }

        const products = [];
        const categories = [];
        const groups = [];
        const links = [];
        const seenGroupIds = new Set();
        const seenProductIds = new Set();

        for (const cat of bData.catalog) {
            const catId = cat.id || cat.slug;
            categories.push({
                id: catId,
                name: cat.name || cat.slug,
                pricingRules: cat.pricingRules || cat.pricing_rules || null
            });

            for (const item of (cat.items || [])) {
                const itemId = item.id || `${cat.slug}_${item.name}`;
                if (!seenProductIds.has(itemId)) {
                    seenProductIds.add(itemId);
                    products.push({
                        id: itemId,
                        name: item.name,
                        price: Number(item.price) || 0,
                        categoryId: catId,
                        isOutOfStock: Boolean(item.isOutOfStock),
                        outOfStockUntil: item.outOfStockUntil || null,
                        maxPerOrder: item.maxPerOrder || null
                    });
                }

                const ruleGroups = item.bundleRule?.groups || item.modifierGroups || [];
                for (const g of ruleGroups) {
                    if (!g || !g.id) continue;
                    links.push({
                        itemId: itemId,
                        groupId: g.id,
                        optionIds: null,
                        disabled: false
                    });
                    if (!seenGroupIds.has(g.id)) {
                        seenGroupIds.add(g.id);
                        groups.push({
                            id: g.id,
                            name: g.name || g.groupName || g.id,
                            scope: 'item',
                            minSelection: Number(g.minQuantity ?? g.minSelection ?? (g.included ? 1 : 0)),
                            maxSelection: Number(g.maxQuantity ?? g.maxSelection ?? (g.selectionType === 'single' ? 1 : 999)),
                            allowRepeats: Boolean(g.allowRepeats ?? g.allowRepeat ?? false),
                            included: Boolean(g.included),
                            options: (g.eligibleItems || g.options || []).map(o => ({
                                id: o.id || o.name,
                                name: o.name || o.id,
                                price: Number(o.surcharge ?? o.price ?? 0),
                                productId: o.productId || null,
                                quantity: Number(o.quantity || 1),
                                isDefault: Boolean(o.isDefault),
                                isOutOfStock: Boolean(o.isOutOfStock),
                                subOptions: o.sub_options || o.subOptions || [],
                                eligibilityRules: o.eligibilityRules || []
                            }))
                        });
                    }
                }
            }
        }

        if (Array.isArray(bData.modifiers)) {
            for (const m of bData.modifiers) {
                const mId = m.id || m.slug;
                if (!mId || seenGroupIds.has(mId)) continue;
                seenGroupIds.add(mId);
                groups.push({
                    id: mId,
                    name: m.name || m.slug || mId,
                    metadata: { slug: m.slug },
                    scope: 'item',
                    minSelection: m.selectionType === 'single' ? (m.isRequired ? 1 : 0) : 0,
                    maxSelection: m.selectionType === 'single' ? 1 : 999,
                    allowRepeats: false,
                    included: false,
                    options: (m.options || []).map(o => ({
                        id: o.id || o.name,
                        name: o.name || o.id,
                        price: Number(o.price || 0),
                        productId: null,
                        quantity: 1,
                        isDefault: Boolean(o.isDefault),
                        isOutOfStock: Boolean(o.isOutOfStock),
                        subOptions: o.sub_options || o.subOptions || [],
                        eligibilityRules: []
                    }))
                });

                for (const cat of (bData.catalog || [])) {
                    const applied = cat.appliedModifiers || ['*'];
                    const isApplicable = cat.allowCustomization !== false && (
                        applied.includes('*') || applied.includes(m.slug) || applied.includes(m.id)
                    );
                    if (isApplicable) {
                        for (const it of (cat.items || [])) {
                            const itemId = it.id || `${cat.slug}_${it.name}`;
                            links.push({
                                itemId: itemId,
                                groupId: mId,
                                optionIds: null,
                                disabled: false
                            });
                        }
                    }
                }
            }
        }

        if (Array.isArray(bData.customizations)) {
            for (const c of bData.customizations) {
                const cId = c.id || c.key;
                if (!cId || seenGroupIds.has(cId)) continue;
                seenGroupIds.add(cId);
                groups.push({
                    id: cId,
                    name: c.title || c.name || cId,
                    scope: 'order',
                    minSelection: c.type === 'radio' ? (c.isRequired ? 1 : 0) : 0,
                    maxSelection: c.type === 'radio' ? 1 : 999,
                    allowRepeats: false,
                    included: false,
                    options: (c.options || []).map(o => ({
                        id: o.id || o.name,
                        name: o.name || o.id,
                        price: Number(o.price || 0),
                        productId: null,
                        quantity: 1,
                        isDefault: Boolean(o.isDefault),
                        isOutOfStock: Boolean(o.isOutOfStock),
                        subOptions: o.sub_options || o.subOptions || [],
                        eligibilityRules: o.minOrderSubtotal ? [{ min_order_subtotal: Number(o.minOrderSubtotal) }] : []
                    }))
                });
            }
        }

        const catalog = {
            revision: bData.revision || 1,
            products,
            categories,
            groups,
            links,
            categoryLinks: []
        };
        bData._wasmOptionCatalog = catalog;
        bData._wasmOptionCatalogRevision = catalog.revision;
        return catalog;
    }

    /**
     * Normalizes a portion selection (bundle portion, Unified Option Groups details,
     * or legacy single/multiple modifiers) into structured group selections expected by Rust.
     */
    function normalizePortionGroups(portion, itemGroups) {
        const pGroups = [];
        const selDetails = portion?.selectedDetails || null;
        const singleSel = portion?.single || portion?.addonSelections?.single || null;
        const multiSel = portion?.multiple || portion?.addonSelections?.multiple || null;
        const subOpts = portion?.subOptions || null;

        for (const g of itemGroups) {
            let handled = false;

            // 1. Check if group is present in portion.groups (e.g. combo step groups)
            if (portion?.groups && Array.isArray(portion.groups)) {
                const foundGroup = portion.groups.find(eg => (eg.groupId || eg.id) === g.id || (eg.groupName && eg.groupName === g.name));
                if (foundGroup) {
                    pGroups.push({
                        groupId: g.id,
                        items: (foundGroup.items || []).map(it => ({
                            optionId: it.optionId || it.id || it.itemId,
                            quantity: Number(it.quantity || 1),
                            groups: it.groups ? it.groups.map(ng => ({
                                groupId: ng.groupId || ng.id,
                                items: (ng.items || []).map(nit => ({
                                    optionId: nit.optionId || nit.id,
                                    quantity: Number(nit.quantity || 1)
                                }))
                            })) : [],
                            subOptions: it.subOptions ? it.subOptions.map(s => typeof s === 'string' ? s : (s.id || s.productId || s.name)) : []
                        }))
                    });
                    handled = true;
                }
            }

            // 2. Check selectedDetails (Unified Option Groups format)
            if (!handled && selDetails && Object.keys(selDetails).length > 0) {
                const selItems = [];
                for (const detail of Object.values(selDetails)) {
                    if (detail && (detail.groupId === g.id || detail.groupName === g.name)) {
                        const subOpt = detail.subOption;
                        const subList = subOpt ? [subOpt.id || subOpt.name] : [];
                        selItems.push({
                            optionId: detail.id || detail.name,
                            quantity: 1,
                            subOptions: subList
                        });
                    }
                }
                if (selItems.length > 0) {
                    pGroups.push({ groupId: g.id, items: selItems });
                    handled = true;
                }
            }

            // 3. Check legacy single & multiple selections
            if (!handled && (singleSel || multiSel)) {
                const selItems = [];
                if (singleSel) {
                    const val = singleSel[g.id] || singleSel[g.name] || (g.metadata?.slug && singleSel[g.metadata.slug]);
                    if (val && val !== '不辣' && val !== '不需要') {
                        const opt = g.options.find(o => o.name === val || o.id === val);
                        if (opt) {
                            const subOpt = subOpts?.[opt.id] || subOpts?.[opt.name] || subOpts?.[val];
                            const subList = subOpt ? [subOpt.id || subOpt.name] : [];
                            selItems.push({ optionId: opt.id, quantity: 1, subOptions: subList });
                        }
                    }
                }
                if (multiSel) {
                    for (const opt of g.options) {
                        if (multiSel[opt.name] || multiSel[opt.id]) {
                            const subOpt = subOpts?.[opt.id] || subOpts?.[opt.name];
                            const subList = subOpt ? [subOpt.id || subOpt.name] : [];
                            selItems.push({ optionId: opt.id, quantity: 1, subOptions: subList });
                        }
                    }
                }
                if (selItems.length > 0) {
                    pGroups.push({ groupId: g.id, items: selItems });
                    handled = true;
                }
            }

            // 4. If required but unselected, pad with default option so Rust can build the round without throwing OPTION_GROUPS_REQUIRED
            if (!handled) {
                const selItems = [];
                if (g.minSelection > 0) {
                    const def = g.options.find(o => o.isDefault) || g.options[0];
                    if (def) selItems.push({ optionId: def.id, quantity: 1 });
                }
                pGroups.push({ groupId: g.id, items: selItems });
            }
        }
        return pGroups;
    }

    /**
     * Prepares BuildRoundInput for Rust build_detail_round from current cart state.
     */
    function buildRoundInput(options, catalog) {
        const bData = options?.bootstrapData || (typeof window !== 'undefined' ? window.bootstrapData : null) || {};
        const cartObj = options?.cart || (typeof window !== 'undefined' ? window.cart : null) || {};
        const bundleData = options?.bundleCartData || (typeof window !== 'undefined' ? window.bundleCartData : null) || {};
        const cData = options?.customizeData || (typeof window !== 'undefined' ? window.customizeData : null) || {};

        const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (typeof window !== 'undefined' && window.resolveCatalogItem ? window.resolveCatalogItem : null);

        const items = [];
        for (const key of Object.keys(cartObj)) {
            const qty = Number(cartObj[key]);
            if (!qty || qty <= 0) continue;

            if (typeof isItemOutOfStock === 'function' && isItemOutOfStock(key)) continue;

            let itemId = key;
            let origName = key;
            let displayName = key;
            let matchedItem = null;

            if (resolveFn) {
                const info = resolveFn(key);
                itemId = info.itemId || key;
                origName = info.origName || key;
                displayName = info.displayName || origName;
                matchedItem = info.targetItem;
            }

            if (typeof window !== 'undefined' && window.isEditOrderMode && Array.isArray(window.editOrderSoldOutNames)) {
                if (window.editOrderSoldOutNames.includes(displayName) ||
                    window.editOrderSoldOutNames.includes(origName) ||
                    window.editOrderSoldOutNames.some(s => s && s.trim() && (displayName.includes(s.trim()) || origName.includes(s.trim())))) {
                    continue;
                }
            }

            if (!matchedItem && Array.isArray(bData.catalog)) {
                for (const cat of bData.catalog) {
                    const prefix = `${cat.slug}_`;
                    const name = key.startsWith(prefix) ? key.substring(prefix.length) : key;
                    const found = (cat.items || []).find(i => i.id === key || i.name === name);
                    if (found) {
                        matchedItem = found;
                        itemId = found.id;
                        break;
                    }
                }
            }

            const linkedGroupIds = catalog.links.filter(l => l.itemId === itemId && !l.disabled).map(l => l.groupId);
            const itemGroups = catalog.groups.filter(g => linkedGroupIds.includes(g.id));
            const existingPortions = bundleData[key] || [];
            const legacyPortions = cData[key] || [];

            const portions = [];
            for (let i = 0; i < qty; i++) {
                const ep = existingPortions[i];
                const lp = legacyPortions[i];
                const combinedPortion = {
                    groups: ep?.groups,
                    selectedDetails: lp?.selectedDetails,
                    single: lp?.single,
                    multiple: lp?.multiple,
                    subOptions: lp?.subOptions
                };
                const pGroups = normalizePortionGroups(combinedPortion, itemGroups);
                portions.push({ groups: pGroups });
            }

            const portionNotes = Array.from({ length: qty }, (_, i) => String(legacyPortions[i]?.note || legacyPortions[i]?.customText || '').trim());

            items.push({
                lineId: key,
                itemId: itemId,
                quantity: qty,
                portionNotes: portionNotes,
                bundleSelections: portions.length > 0 ? { portions } : null
            });
        }

        let orderSelections = [];
        if (options?.orderSelections) {
            orderSelections = options.orderSelections;
        } else if (typeof DetailCheckout !== 'undefined' && typeof DetailCheckout.selections === 'function') {
            orderSelections = DetailCheckout.selections();
        } else if (Array.isArray(bData.customizations)) {
            orderSelections = bData.customizations.map(group => {
                const groupKey = group.key || group.id;
                const checkedInputs = typeof document !== 'undefined' && document.querySelectorAll
                    ? Array.from(document.querySelectorAll(`input[name="opt-${groupKey}"]:checked`))
                    : [];
                return {
                    groupId: group.id || groupKey,
                    items: checkedInputs.map(el => {
                        const container = el.closest ? el.closest('.flavor-option-container') : null;
                        const subs = container && container.querySelectorAll
                            ? Array.from(container.querySelectorAll('.sub-opt-chk:checked')).map(s => s.dataset.subId || s.value)
                            : [];
                        return {
                            optionId: el.dataset.optionId || el.value,
                            quantity: 1,
                            groups: [],
                            subOptions: subs
                        };
                    })
                };
            });
        }

        for (const g of catalog.groups.filter(grp => grp.scope === 'order')) {
            if (!orderSelections.some(os => os.groupId === g.id)) {
                orderSelections.push({ groupId: g.id, items: [] });
            }
        }

        return { items, orderSelections };
    }

    /**
     * Executes edge-identical cart pricing using the Rust WebAssembly engine.
     * Returns a complete calculation object { total, subtotal, discount, orderExtra, items, groups, lineTotals }.
     * Returns null if WASM is not ready or fails (allowing graceful JS fallback).
     */
    function calculateCart(options) {
        if (!PricingWasm.isReady || typeof PricingWasm.calculateRoundTotal !== 'function') {
            return null;
        }

        const bData = options?.bootstrapData || (typeof window !== 'undefined' ? window.bootstrapData : null);
        const cartObj = options?.cart || (typeof window !== 'undefined' ? window.cart : null);
        if (!bData?.catalog) {
            return null;
        }

        try {
            const catalog = buildOptionCatalog(bData);
            const { items, orderSelections } = buildRoundInput(options, catalog);

            if (items.length === 0) {
                let orderAddonsTotal = 0;
                if (typeof document !== 'undefined' && document.querySelectorAll) {
                    const checked = document.querySelectorAll('.custom-panel input[data-price]:checked');
                    checked.forEach(chk => { orderAddonsTotal += (Number(chk.getAttribute('data-price')) || 0); });
                }
                return {
                    total: orderAddonsTotal,
                    subtotal: 0,
                    discount: 0,
                    orderExtra: orderAddonsTotal,
                    items: [],
                    groups: [],
                    lineTotals: {},
                    isWasm: true
                };
            }

            const roundInput = { items, orderSelections };
            const round = PricingWasm.calculateRoundTotal(catalog, roundInput);

            const lineTotals = {};
            items.forEach((it, idx) => {
                if (round.items[idx]) {
                    lineTotals[it.lineId] = round.items[idx].subtotal;
                }
            });

            const itemsSubtotal = round.items.reduce((s, it) => s + it.subtotal, 0);
            const orderExtra = round.total - (itemsSubtotal - round.discount);

            return {
                total: round.total,
                subtotal: itemsSubtotal,
                discount: round.discount,
                orderExtra: Math.max(0, orderExtra),
                items: round.items,
                groups: round.groups,
                lineTotals,
                isWasm: true
            };
        } catch (err) {
            console.warn('[PricingWasm] calculateCart execution error, fallback to JS:', err);
            return null;
        }
    }

    /**
     * Calculates the extra surcharge and total price for a single portion or item
     * using the edge-identical Rust WebAssembly pricing engine.
     * 
     * @param {string|object} itemOrKey - Item ID, key, or item object
     * @param {object} portion - Portion selection (draft or bundle portion)
     * @param {object} [options] - Options (bootstrapData, catalog)
     * @returns {{ basePrice: number, extra: number, subtotal: number, isWasm: boolean } | null}
     */
    function calculatePortionPrice(itemOrKey, portion, options) {
        if (!PricingWasm.isReady || typeof PricingWasm.calculateRoundTotal !== 'function') {
            return null;
        }

        const bData = options?.bootstrapData || (typeof window !== 'undefined' ? window.bootstrapData : null);
        if (!bData?.catalog) {
            return null;
        }

        try {
            const catalog = options?.catalog || buildOptionCatalog(bData);
            let itemId = null;
            let targetItem = null;

            if (typeof itemOrKey === 'string') {
                const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (typeof window !== 'undefined' && window.resolveCatalogItem ? window.resolveCatalogItem : null);
                if (resolveFn) {
                    const info = resolveFn(itemOrKey);
                    itemId = info?.itemId || itemOrKey;
                    targetItem = info?.targetItem;
                }
                if (!targetItem) {
                    for (const cat of bData.catalog) {
                        const prefix = `${cat.slug}_`;
                        const name = itemOrKey.startsWith(prefix) ? itemOrKey.substring(prefix.length) : itemOrKey;
                        const found = (cat.items || []).find(i => i.id === itemOrKey || i.name === name || i.name === itemOrKey);
                        if (found) {
                            targetItem = found;
                            itemId = found.id;
                            break;
                        }
                    }
                }
                if (!itemId) itemId = itemOrKey;
            } else if (itemOrKey && typeof itemOrKey === 'object') {
                targetItem = itemOrKey;
                itemId = itemOrKey.id || itemOrKey.itemId || itemOrKey.key || itemOrKey.name;
            }

            if (!itemId) {
                if (portion?.groups && Array.isArray(portion.groups)) {
                    let sumExtra = 0;
                    for (const g of portion.groups) {
                        for (const it of (g.items || [])) {
                            const q = Number(it.quantity || 1);
                            let p = Number(it.surcharge ?? it.price ?? 0);
                            if (it.groups) {
                                for (const ng of it.groups) {
                                    for (const nit of (ng.items || [])) {
                                        p += Number(nit.surcharge ?? nit.price ?? 0) * Number(nit.quantity || 1);
                                    }
                                }
                            }
                            if (it.subOptions) {
                                for (const s of it.subOptions) {
                                    p += Number(typeof s === 'object' ? (s.price || 0) : 0);
                                }
                            }
                            sumExtra += q * p;
                        }
                    }
                    return { basePrice: 0, extra: sumExtra, subtotal: sumExtra, isWasm: true };
                }
                return null;
            }

            // Find linked groups
            const linkedGroupIds = catalog.links.filter(l => l.itemId === itemId && !l.disabled).map(l => l.groupId);
            let itemGroups = catalog.groups.filter(g => linkedGroupIds.includes(g.id));

            // If item has no linked groups in catalog, but portion has groups (e.g. combo modal), include those groups
            if (itemGroups.length === 0 && portion?.groups) {
                const pGroupIds = portion.groups.map(pg => pg.groupId || pg.id);
                itemGroups = catalog.groups.filter(g => pGroupIds.includes(g.id));
            }

            const pGroups = normalizePortionGroups(portion, itemGroups);

            const roundInput = {
                items: [
                    {
                        lineId: 'line_portion_preview',
                        itemId: itemId,
                        quantity: 1,
                        bundleSelections: {
                            portions: [{ groups: pGroups }]
                        }
                    }
                ],
                orderSelections: []
            };

            const round = PricingWasm.calculateRoundTotal(catalog, roundInput);
            const lineItem = round?.items?.[0];
            if (!lineItem) return null;

            const unitPrice = lineItem.unitPrice;
            const subtotal = lineItem.subtotal;
            const extra = Math.max(0, subtotal - unitPrice);

            return {
                basePrice: unitPrice,
                extra: extra,
                subtotal: subtotal,
                isWasm: true
            };
        } catch (err) {
            console.warn('[PricingWasm] calculatePortionPrice execution error, fallback to JS:', err);
            return null;
        }
    }

    function calculatePortionExtra(itemOrKey, portion, options) {
        const res = calculatePortionPrice(itemOrKey, portion, options);
        return res ? res.extra : null;
    }

    PricingWasm.buildOptionCatalog = buildOptionCatalog;
    PricingWasm.buildRoundInput = buildRoundInput;
    PricingWasm.normalizePortionGroups = normalizePortionGroups;
    PricingWasm.calculatePortionPrice = calculatePortionPrice;
    PricingWasm.calculatePortionExtra = calculatePortionExtra;
    PricingWasm.calculateCart = calculateCart;

    if (isNode || !hasWasm) {
        return;
    }

    const WASM_JS_PATH = '/wasm/pricing-engine/pricing_wasm.js?v=20261108_wasm_pricing_v1';
    const WASM_BG_PATH = '/wasm/pricing-engine/pricing_wasm_bg.wasm?v=20261108_wasm_pricing_v1';

    PricingWasm.readyPromise = (async function initWasmEngine() {
        try {
            const wasmModule = await import(WASM_JS_PATH);
            await wasmModule.default(WASM_BG_PATH);

            if (typeof wasmModule.is_wasm_ready === 'function' && wasmModule.is_wasm_ready()) {
                PricingWasm.isReady = true;
                PricingWasm.calculateCategoryBundle = wasmModule.calculate_category_bundle;
                PricingWasm.calculateRoundTotal = wasmModule.calculate_round_total;
                PricingWasm.validateUnifiedCart = wasmModule.validate_unified_cart;
                PricingWasm.validateOptionSelection = wasmModule.validate_option_selection;

                console.info('[PricingWasm] Rust WebAssembly pricing engine initialized successfully.');

                if (typeof updateTotal === 'function') {
                    updateTotal();
                }
                return true;
            }
        } catch (err) {
            console.warn('[PricingWasm] WASM initialization failed, falling back to JS:', err);
            PricingWasm.isReady = false;
            return false;
        }
    })();
})();
