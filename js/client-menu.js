// ==========================================
// Benmi Client Menu - Module: Menu, Catalog & Dynamic Item Cards
// ==========================================

var bootstrapData = window.bootstrapData;
var storeConfig = window.storeConfig;
var cart = window.cart;

function _cmEsc(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function clientMenuLanguage() {
    if (typeof currentClientLocale !== 'undefined' && currentClientLocale) return currentClientLocale;
    if (typeof window !== 'undefined' && window.currentClientLocale) return window.currentClientLocale;
    if (typeof currentLocale !== 'undefined' && currentLocale) return currentLocale;
    const docLang = (typeof document !== 'undefined' && document && document.documentElement) ? document.documentElement.lang : '';
    if (docLang) return docLang;
    const bData = (typeof window !== 'undefined' && window.bootstrapData) || (typeof bootstrapData !== 'undefined' ? bootstrapData : null);
    return (bData && bData.tenant && bData.tenant.locale) || 'zh-TW';
}

function _cmT(key, vars, zhFallback, viFallback) {
    if (typeof ct === 'function') return ct(key, vars);
    return clientMenuLanguage() === 'vi' && viFallback !== undefined ? viFallback : zhFallback;
}

function shouldAutoOpenItemOptions(rule) {
    if (!rule) return false;
    if (Number(rule.version) !== 3) return rule.autoPopup !== false;
    return (rule.groups || []).some(group => group.included || Number(group.minSelection ?? group.minQuantity ?? 0) > 0);
}

// --- FETCH DATA ---
async function fetchMenu() {
    try {
        const tenantId = typeof getTenantIdFromUrl === 'function' ? getTenantIdFromUrl() : (window.__INITIAL_TENANT_ID || "benmi");
        const workerBase = window.WORKER_BASE || "";
        const res = await fetch(`${workerBase}/api/tenant/bootstrap?tenant_id=${tenantId}`, {
            cache: 'no-cache'
        });
        if (res.ok) {
            const freshData = await res.json();
            if (freshData?.tenant?.id !== tenantId) {
                throw new Error(`Bootstrap tenant mismatch for ${tenantId}`);
            }
            if (!freshData || freshData.menuComplete !== true || !Array.isArray(freshData.catalog) ||
                freshData.catalog.some(c => !c || !Array.isArray(c.items))) {
                console.warn('[fetchMenu] Received incomplete menu bootstrap, preserving current state');
                return;
            }
            const prevDataStr = localStorage.getItem(`tenant_bootstrap_${tenantId}`);
            const freshDataStr = JSON.stringify(freshData);
            const hasChanged = (prevDataStr !== freshDataStr);

            bootstrapData = freshData;
            window.bootstrapData = freshData;
            if (typeof buildModifierPriceMap === 'function') {
                buildModifierPriceMap(freshData);
            }
            if (typeof reconcileCartOptions === 'function') reconcileCartOptions(freshData);
            storeConfig = bootstrapData.tenant ? {
                allowScheduledPickup: bootstrapData.tenant.allowScheduledPickup,
                allowDineIn: bootstrapData.tenant.allowDineIn,
                features: bootstrapData.tenant.features || [],
                orderPrefix: bootstrapData.tenant.orderPrefix,
                storeStatus: bootstrapData.tenant.storeStatus,
                prepTimeMinutes: bootstrapData.tenant.prepTimeMinutes,
                operatingHours: bootstrapData.tenant.parsedHours,
                liffId: bootstrapData.tenant.liffId
            } : null;
            window.storeConfig = storeConfig;

            try {
                localStorage.setItem(`tenant_bootstrap_${tenantId}`, freshDataStr);
            } catch(e) {}

            if (typeof applyTenantTheme === 'function') {
                applyTenantTheme(bootstrapData.tenant);
            }
            
            const sections = document.getElementById('catalog-sections');
            const hasRendered = sections && sections.children.length > 0;

            if (hasChanged || !hasRendered) {
                renderDynamicCatalog();
                if (typeof renderStoreOperatingHours === 'function') {
                    renderStoreOperatingHours();
                }
            } else {
                updateDynamicStockAndPrices();
            }
            if (typeof updateTotal === 'function') updateTotal();
        }
        if (typeof applyPickupConfig === 'function') applyPickupConfig();
        if (typeof checkStoreStatus === 'function') checkStoreStatus();
    } catch (e) {
        console.error("Failed to fetch menu or config", e);
    }
}

function openImageLightbox(src) {
    const img = document.getElementById('lightbox-img');
    if (img) img.src = src;
    const lightbox = document.getElementById('image-lightbox');
    if (lightbox) lightbox.style.display = 'flex';
}

function closeImageLightbox() {
    const lightbox = document.getElementById('image-lightbox');
    if (lightbox) lightbox.style.display = 'none';
}

function formatBundleButtonLabel(item, hasModifiers) {
    if (item.bundleRule?.version === 3) {
        return _cmT('bundle_v3_option_btn', null, '選項', 'Tuỳ chọn');
    }
    const firstGroup = item.bundleRule?.groups?.[0];
    const rawGroupName = firstGroup
        ? (typeof locText === 'function' ? locText(firstGroup, 'name', firstGroup.name || '') : (firstGroup.name || ''))
        : '';
    const bundleGroupLabel = rawGroupName.replace(/^(請選擇\s*(\d+\s*樣)?|Select\s*\d*\s*|Chọn\s*\d*\s*)/i, '').trim();
    const hasCombinedModifiers = Boolean(item.bundleRule) && hasModifiers;
    if (hasCombinedModifiers) {
        return bundleGroupLabel
            ? _cmT('bundle_adjust_label_addons', { label: bundleGroupLabel }, `調整${bundleGroupLabel} / 加料`, `Tùy chỉnh ${bundleGroupLabel} / Thêm món`)
            : _cmT('bundle_adjust_combo', null, '調整搭配 / 加料', 'Tùy chỉnh combo / Thêm món');
    }
    return bundleGroupLabel
        ? _cmT('bundle_adjust_label', { label: bundleGroupLabel }, `調整${bundleGroupLabel}`, `Tùy chỉnh ${bundleGroupLabel}`)
        : _cmT('bundle_adjust_sides', null, '調整套餐配菜', 'Chọn món ăn kèm');
}

// --- DYNAMIC CATALOG RENDERING (UNIFIED FOR ALL TENANTS) ---
function renderDynamicCatalog() {
    const bData = window.bootstrapData || bootstrapData;
    if (!bData || !bData.catalog) return;

    const catalogSections = bData.catalog.map(cat => ({ type: 'catalog', sortOrder: cat.sortOrder || 0, category: cat }));
    const globalCustomizationGroups = (bData.customizations || [])
        .filter(group => !group.scope || group.scope === 'order')
        .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    if (globalCustomizationGroups.length > 0) {
        const sectionTitle = _cmT('global_flavor_section_title', null, '口味選擇', 'Tùy chọn khẩu vị');
        catalogSections.push({
            type: 'customizations',
            groups: globalCustomizationGroups,
            sectionId: 'sec-order-option',
            title: sectionTitle,
            shortName: sectionTitle,
            sortOrder: bData.customizationSortOrder ?? 0
        });
    }
    catalogSections.sort((a, b) => a.sortOrder - b.sortOrder);

    // 1. Navigation Tabs
    const nav = document.getElementById('main-nav');
    let navHTML = '';

    catalogSections.forEach((section, idx) => {
        const isActive = idx === 0;
        if (section.type === 'customizations') {
            navHTML += `<div class="nav-btn ${isActive ? 'active' : ''}" onclick="scrollToSec('${section.sectionId}')">${_cmEsc(section.shortName)}</div>`;
            return;
        }
        const cat = section.category;
        const catDisplayName = typeof locText === 'function' ? locText(cat, 'name', cat.name) : cat.name;
        const activeLocale = (typeof window !== 'undefined' && window.currentClientLocale) || 'zh-TW';
        const localizedShort = (cat.i18n && cat.i18n[activeLocale] && cat.i18n[activeLocale].shortName)
            ? cat.i18n[activeLocale].shortName
            : ((cat.shortName && catDisplayName && catDisplayName.includes(cat.shortName)) ? cat.shortName : catDisplayName);
        navHTML += `<div class="nav-btn ${isActive ? 'active' : ''}" onclick="scrollToSec('sec-${cat.slug}')">${_cmEsc(localizedShort)}</div>`;
    });
    const navCheckoutLabel = _cmT('nav_checkout', null, '結帳', 'Thanh toán');
    navHTML += `<div class="nav-btn" onclick="scrollToSec('sec-checkout')">${_cmEsc(navCheckoutLabel)}</div>`;
    if (nav) nav.innerHTML = navHTML;

    // 2. Section Containers
    const container = document.getElementById('catalog-sections');
    if (!container) return;
    container.innerHTML = '';

    catalogSections.forEach(section => {
        const sec = document.createElement('div');
        sec.className = 'section-container';
        if (section.type === 'customizations') {
            sec.id = section.sectionId;
            renderCustomizationsPanel(sec, section.groups, section.title);
        } else {
            const cat = section.category;
            sec.id = `sec-${cat.slug}`;
            const titleDiv = document.createElement('div');
            titleDiv.className = 'section-title';
            const catDisplayName = typeof locText === 'function' ? locText(cat, 'name', cat.name) : cat.name;
            const activeLocale = (typeof window !== 'undefined' && window.currentClientLocale) || 'zh-TW';
            const localizedPromo = (cat.pricingRules?.promo_label_i18n && cat.pricingRules.promo_label_i18n[activeLocale])
                || (typeof locText === 'function' ? locText(cat, 'promo_label', '') : '')
                || cat.pricingRules?.promo_label
                || '';
            const promoBadge = localizedPromo ? `<span style="margin-left:auto; font-size:12px; font-weight:700; color:#059669; background:#ecfdf5; border:1px solid #a7f3d0; padding:2px 8px; border-radius:9999px;">${_cmEsc(localizedPromo)}</span>` : '';
            titleDiv.innerHTML = `<span>${_cmEsc(catDisplayName)}</span>${promoBadge}`;
            sec.appendChild(titleDiv);

            const gridDiv = document.createElement('div');
            gridDiv.className = 'grid';
            gridDiv.id = `grid-${cat.slug}`;

            (cat.items || []).forEach(item => {
                gridDiv.appendChild(createDynamicItemCard(cat.slug, item));
            });

            sec.appendChild(gridDiv);
        }
        container.appendChild(sec);
    });

    if (typeof updateActiveNavOnScroll === 'function') {
        updateActiveNavOnScroll();
    }
    if (typeof updateDesktopAuthUI === 'function') {
        updateDesktopAuthUI();
    }
}

function renderCustomizationsPanel(container, list, sectionTitle) {
    if (!container || !list || list.length === 0) return;

    const resolvedSectionTitle = sectionTitle || _cmT('global_flavor_section_title', null, '口味選擇', 'Tùy chọn khẩu vị');
    let html = `<div class="section-title">${_cmEsc(resolvedSectionTitle)}</div>
    <div class="custom-panel-wrapper">
    <div class="custom-panel">`;

    const currentSubtotal = typeof calculateCurrentFoodSubtotal === 'function' ? calculateCurrentFoodSubtotal() : 0;

    function formatOptionContent(displayName, priceLabelHtml) {
        const raw = String(displayName || '');
        const match = raw.match(/^([^(（]+?)\s*[（(]([^)）]+)[）)]\s*$/);
        if (match) {
            const title = match[1].trim();
            const subtitle = match[2].trim();
            return `<div class="choice-content">
                <span class="choice-title"><span class="choice-name">${_cmEsc(title)}</span>${priceLabelHtml}</span>
                <span class="choice-subtitle">${_cmEsc(subtitle)}</span>
            </div>`;
        }
        return `<div class="choice-content">
            <span class="choice-title"><span class="choice-name">${_cmEsc(raw)}</span>${priceLabelHtml}</span>
        </div>`;
    }

    list.forEach((group, groupIdx) => {
        const topMargin = groupIdx > 0 ? 'margin-top: 16px; border-top: 1px dashed #f1f5f9; padding-top: 14px;' : '';
        const canonicalGroupTitle = group.title || group.name || '';
        const displayGroupTitle = typeof locText === 'function'
            ? locText(group, 'title', locText(group, 'name', canonicalGroupTitle))
            : canonicalGroupTitle;

        const hasDenseOptions = (group.options || []).some(o => {
            const rawOpt = typeof o === 'string' ? o : (o ? o.name || '' : '');
            const dispOpt = (typeof o === 'object' && o && typeof locText === 'function') ? locText(o, 'name', rawOpt) : rawOpt;
            return dispOpt.length > 8 || /[（(].+[)）]/.test(dispOpt);
        });
        const denseGridClass = hasDenseOptions ? ' dense-grid' : '';
        const hasNestedOptions = group.type === 'radio' && (group.options || []).some(opt => Array.isArray(opt?.sub_options) && opt.sub_options.length > 0);

        html += `<div class="custom-group" style="${topMargin}">
            <label class="custom-label">${_cmEsc(displayGroupTitle)}</label>
            <div class="custom-options-grid${denseGridClass}${hasNestedOptions ? ' has-nested-options' : ''}">`;

        (group.options || []).forEach((opt, optIdx) => {
            const optName = typeof opt === 'string' ? opt : (opt ? opt.name || '' : '');
            const optDisplayName = (typeof opt === 'object' && opt && typeof locText === 'function')
                ? locText(opt, 'name', optName)
                : optName;
            const optPrice = (typeof opt === 'object' && opt && opt.price) ? Number(opt.price) : 0;
            const isOos = Boolean(typeof opt === 'object' && opt && (opt.is_out_of_stock || opt.isOutOfStock || opt.out_of_stock));
            const subOpts = (typeof opt === 'object' && opt && Array.isArray(opt.sub_options)) ? opt.sub_options : [];
            const inputName = `opt-${group.key}`;
            const firstAvailableIdx = (group.options || []).findIndex(o => !Boolean(typeof o === 'object' && o && (o.is_out_of_stock || o.isOutOfStock || o.out_of_stock)));
            const explicitDefaults = (group.options || []).some(o => o && typeof o === 'object' && o.is_default !== undefined);
            const isChecked = (group.type === 'radio' && !isOos && (explicitDefaults ? opt.is_default === true : optIdx === firstAvailableIdx)) ? 'checked' : '';
            const priceLabel = optPrice > 0 ? `<span class="choice-price-badge">+$${optPrice}</span>` : '';
            const soldOutLabel = _cmT('sold_out', null, '已售完', 'Hết món');
            const oosBadge = isOos ? ` <span class="oos-badge" style="color:#dc2626; font-size:12px; font-weight:900; text-decoration:none;">(${_cmEsc(soldOutLabel)})</span>` : '';

            const minSubtotal = (typeof opt === 'object' && opt && (opt.minOrderSubtotal || opt.min_order_amount)) ? Number(opt.minOrderSubtotal || opt.min_order_amount) : 0;
            const optRuleMsg = (typeof opt === 'object' && opt && opt.ruleErrorMessage) ? opt.ruleErrorMessage : '';
            const optId = (typeof opt === 'object' && opt && opt.id) ? opt.id : optName;
            const minSpendText = _cmT('option_min_spend', { amount: minSubtotal }, `滿$${minSubtotal}可選`, `Từ $${minSubtotal}`);
            const thresholdBadgeHTML = minSubtotal > 0 ? `<span class="threshold-badge">${_cmEsc(minSpendText)}</span>` : '';
            const thresholdAttrs = minSubtotal > 0
                ? `data-min-subtotal="${minSubtotal}" data-option-id="${_cmEsc(optId)}" data-option-name="${_cmEsc(optName)}" data-option-display-name="${_cmEsc(optDisplayName)}" data-error-msg="${_cmEsc(optRuleMsg)}"`
                : `data-option-id="${_cmEsc(optId)}" data-option-name="${_cmEsc(optName)}" data-option-display-name="${_cmEsc(optDisplayName)}"`;

            const isThresholdBlocked = (minSubtotal > 0 && currentSubtotal < minSubtotal);
            const isEffectivelyDisabled = isOos || isThresholdBlocked;
            const disabledAttr = isEffectivelyDisabled ? 'disabled' : '';
            const thresholdClass = isThresholdBlocked ? ' threshold-disabled' : '';
            const thresholdDataAttr = isThresholdBlocked ? ' data-threshold-disabled="true"' : '';
            const thresholdStyle = isThresholdBlocked ? 'opacity: 0.42; background-color: #f1f5f9; border-color: #e2e8f0; color: #94a3b8; cursor: not-allowed;' : '';
            const oosStyle = isOos ? 'opacity: 0.5; pointer-events: none; text-decoration: line-through; color: #94a3b8;' : '';
            const combinedStyle = (thresholdStyle || oosStyle) ? `style="${thresholdStyle} ${oosStyle}"` : '';

            if (group.type === 'radio') {
                html += `<div class="flavor-option-container${subOpts.length > 0 ? ' has-sub-options' : ''}">
                    <label class="radio-label${thresholdClass}" ${thresholdDataAttr} ${combinedStyle}>
                        <input type="radio" name="${inputName}" data-price="${optPrice}" data-group-title="${_cmEsc(canonicalGroupTitle)}" value="${_cmEsc(optName)}" ${thresholdAttrs} ${isChecked} ${disabledAttr} onchange="handleCustomizationChange(event)"> 
                        ${formatOptionContent(optDisplayName, priceLabel)}${thresholdBadgeHTML}${oosBadge}
                    </label>`;

                if (subOpts.length > 0) {
                    html += `<div class="sub-option-container" role="group" aria-label="${_cmEsc(optDisplayName)}" data-parent-flavor="${_cmEsc(optName)}" ${isChecked ? '' : 'hidden'}>`;
                    subOpts.forEach((sub) => {
                        const rawSubName = typeof sub === 'string' ? sub : sub.name;
                        const subDisplayName = typeof locSubOptionText === 'function' ? locSubOptionText(opt, sub) : rawSubName;
                        html += `<label class="checkbox-label sub-chip">
                            <input type="checkbox" class="sub-opt-chk" data-flavor="${_cmEsc(optName)}" data-sub-id="${_cmEsc(typeof sub === 'string' ? sub : sub.id || sub.productId || sub.name)}" data-price="${Number(sub.price || 0)}" value="${_cmEsc(rawSubName)}" onchange="handleCustomizationChange(event)"> 
                            <span>${_cmEsc(subDisplayName)}</span>
                        </label>`;
                    });
                    html += `</div>`;
                }
                html += `</div>`;
            } else {
                html += `<label class="checkbox-label${thresholdClass}" ${thresholdDataAttr} ${combinedStyle}>
                    <input type="checkbox" name="${inputName}" data-price="${optPrice}" data-group-title="${_cmEsc(canonicalGroupTitle)}" value="${_cmEsc(optName)}" ${thresholdAttrs} ${disabledAttr} onchange="handleCustomizationChange(event)"> 
                    ${formatOptionContent(optDisplayName, priceLabel)}${thresholdBadgeHTML}${oosBadge}
                </label>`;
            }
        });

        html += `</div>`; // Close .custom-options-grid
        html += `</div>`; // Close .custom-group
    });

    html += `</div>`; // Close .custom-panel

    const lockTitle = _cmT('custom_panel_lock_title', null, '請先登入 LINE 帳號以自訂餐點口味', 'Vui lòng đăng nhập LINE để tùy chỉnh món');
    const lockBtn = _cmT('custom_panel_lock_btn', null, '使用 LINE 登入', 'Đăng nhập LINE');

    // Frosted glass lock overlay for desktop guest users
    html += `<div class="custom-panel-lock-overlay" style="display: none;" onclick="triggerDesktopLineLogin()">
        <div class="lock-badge-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
        </div>
        <p class="lock-badge-title">${_cmEsc(lockTitle)}</p>
        <button type="button" class="lock-badge-btn">
            <svg class="line-btn-svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.057.592.121.303.079.778.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967 1.739-1.907 2.572-3.843 2.572-5.992z"/>
            </svg>
            <span>${_cmEsc(lockBtn)}</span>
        </button>
    </div>`;

    html += `</div>`; // Close .custom-panel-wrapper
    container.innerHTML = html;
    toggleFlavorSubOptions();
    if (typeof updateCustomizationThresholdUI === 'function') {
        updateCustomizationThresholdUI();
    }
}

function handleCustomizationChange(event) {
    if (typeof checkDesktopAuthGuard === 'function' && !checkDesktopAuthGuard()) return;

    // Check threshold condition on immediate user selection
    if (event && event.target && (event.target.type === 'radio' || event.target.type === 'checkbox')) {
        const target = event.target;
        const minSub = Number(target.getAttribute('data-min-subtotal')) || 0;
        if (minSub > 0 && target.checked) {
            const currentSubtotal = typeof calculateCurrentFoodSubtotal === 'function' ? calculateCurrentFoodSubtotal() : 0;
            if (currentSubtotal < minSub) {
                const optName = target.getAttribute('data-option-display-name') || target.getAttribute('data-option-name') || target.value;
                const defaultMsg = typeof ct === 'function'
                    ? ct('threshold_opt_alert', { name: optName, min: minSub, current: currentSubtotal, diff: minSub - currentSubtotal })
                    : `此選項「${optName}」需全單商品消費滿 $${minSub} 元方可選擇（目前金額 $${currentSubtotal} 元，還差 $${minSub - currentSubtotal} 元）`;
                const customMsg = target.getAttribute('data-error-msg') || defaultMsg;

                if (target.type === 'radio') {
                    const groupRadios = document.querySelectorAll(`input[name="${target.name}"]`);
                    let fallbackRadio = null;
                    groupRadios.forEach(r => {
                        const rMin = Number(r.getAttribute('data-min-subtotal')) || 0;
                        if (rMin === 0 && !fallbackRadio) fallbackRadio = r;
                    });
                    if (fallbackRadio) {
                        fallbackRadio.checked = true;
                    } else if (groupRadios.length > 0) {
                        groupRadios[0].checked = true;
                    }
                } else {
                    target.checked = false;
                }

                if (typeof customAlert === 'function') {
                    customAlert(customMsg);
                } else {
                    alert(customMsg);
                }
                toggleFlavorSubOptions();
                if (typeof updateTotal === 'function') updateTotal();
                return;
            }
        }
    }

    toggleFlavorSubOptions();
    if (typeof updateTotal === 'function') updateTotal();
}

function toggleFlavorSubOptions() {
    document.querySelectorAll('.sub-option-container').forEach(el => {
        const parentOptContainer = el.closest('.flavor-option-container');
        const radioInput = parentOptContainer ? parentOptContainer.querySelector('input[type="radio"]') : null;
        const isSelected = radioInput ? radioInput.checked : false;

        el.hidden = !isSelected;
        if (!isSelected) {
            el.querySelectorAll('input[type="checkbox"]').forEach(chk => chk.checked = false);
        }
    });
}

function handleItemCardClick(catSlug, itemName, event) {
    if (event) {
        if (event.target.closest('.item-img') || event.target.closest('.qty-control') || event.target.closest('.btn-qty')) {
            return;
        }
    }
    const key = `${catSlug}_${itemName}`;
    if (typeof isItemOutOfStock === 'function' && isItemOutOfStock(key)) return;
    if (typeof checkDesktopAuthGuard === 'function' && !checkDesktopAuthGuard()) return;

    const resolveFn = typeof resolveCatalogItem === 'function' ? resolveCatalogItem : (window.resolveCatalogItem || (k => ({ origName: itemName, displayName: itemName })));
    const itemInfo = resolveFn(key);
    const bundleRule = itemInfo?.bundleRule || (itemInfo?.targetItem && itemInfo.targetItem.bundleRule);

    const getItemModsFn = typeof getItemModifiers === 'function' ? getItemModifiers : (window.getItemModifiers || (typeof getCategoryModifiers === 'function' ? getCategoryModifiers : (window.getCategoryModifiers || (() => []))));
    const itemModifiers = getItemModsFn(catSlug, itemName);
    const hasModifiers = Array.isArray(itemModifiers) && itemModifiers.length > 0;
    const hasRequiredModifiers = hasModifiers && itemModifiers.some(m => m.isRequired || Number(m.minSelection || 0) > 0);

    const cartObj = window.cart || cart || {};
    const currentQty = cartObj[key] || 0;

    const shouldBundleAutoPopup = shouldAutoOpenItemOptions(bundleRule);

    if (bundleRule && shouldBundleAutoPopup) {
        if (typeof openBundleBuilderModal === 'function') {
            openBundleBuilderModal(catSlug, itemName, currentQty > 0 ? 0 : 0);
        }
    } else if (!bundleRule && hasRequiredModifiers) {
        const openCustFn = typeof openItemCustomizeModal === 'function' ? openItemCustomizeModal : window.openItemCustomizeModal;
        if (typeof openCustFn === 'function') {
            openCustFn(catSlug, itemName, currentQty > 0 ? 0 : 0);
        }
    } else {
        updateQty(catSlug, itemName, 1);
    }
}

function createDynamicItemCard(catSlug, item) {
    const div = document.createElement('div');
    div.className = 'card';
    div.id = `item-${catSlug}-${item.name}`;

    const isOos = item.isOutOfStock;
    if (isOos) {
        div.style.opacity = '0.65';
        div.style.pointerEvents = 'none';
    }

    const itemDisplayName = typeof locText === 'function' ? locText(item, 'name', item.name) : item.name;
    const rawBadge = typeof locText === 'function'
        ? locText(item, 'badgeText', item.badgeText || item.badge || '')
        : (item.badgeText || item.badge || '');
    const badgeText = String(rawBadge || '').trim();
    const badgeHTML = badgeText ? `<span class="badge">${_cmEsc(badgeText)}</span>` : '';
    const limitLabel = _cmT('item_limit_badge', { max: item.maxPerOrder }, `限購${item.maxPerOrder}份`, `Tối đa ${item.maxPerOrder} phần`);
    const limitBadgeHTML = (item.maxPerOrder && item.maxPerOrder > 0) ? `<span class="badge badge-limit" style="background:#fffbeb; color:#b45309; border:1px solid #fde68a;">${_cmEsc(limitLabel)}</span>` : '';

    const workerBase = window.WORKER_BASE || "";
    let imgSrc = "";
    if (item.imageUrl) {
        const base = (item.imageUrl.startsWith("http://") || item.imageUrl.startsWith("https://"))
            ? item.imageUrl
            : `${workerBase}${item.imageUrl}`;
        const glue = base.includes("?") ? "&" : "?";
        imgSrc = `${base}${glue}v=2`;
    }
    const imgHTML = imgSrc
        ? `<img class="item-img" src="${imgSrc}" alt="${_cmEsc(itemDisplayName)}" loading="lazy" onclick="openImageLightbox(this.src)" style="cursor: zoom-in;" onerror="this.style.display='none'">`
        : '';

    const bData = window.bootstrapData || bootstrapData;
    const localizedDesc = typeof locText === 'function' ? locText(item, 'description', '') : '';
    const trans = localizedDesc || (bData?.translations && bData.translations[item.name]) || item.description || '';
    const transHTML = trans ? `<div style="font-size: 13px; color: #9ca3af; margin-top: 2px;">${_cmEsc(trans)}</div>` : '';

    const safeItemName = item.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const safeCatSlug = catSlug.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const cartObj = window.cart || cart || {};
    const qty = cartObj[`${catSlug}_${item.name}`] || 0;
    const footerHTML = getDynamicItemFooterHTML(catSlug, item.name, item.price, isOos);
    const getItemModsFn = typeof getItemModifiers === 'function' ? getItemModifiers : (window.getItemModifiers || (typeof getCategoryModifiers === 'function' ? getCategoryModifiers : (window.getCategoryModifiers || (() => []))));
    const itemModifiers = getItemModsFn(catSlug, item.name);
    const hasModifiers = Array.isArray(itemModifiers) && itemModifiers.length > 0;
    const hasBundleRule = Boolean(item.bundleRule);
    const bundleBtnText = formatBundleButtonLabel(item, hasModifiers);
    const customizeCardLabel = _cmT('customize_card_label', null, '客製化（加料 / 辣度 / 備註）', 'Tùy chỉnh (thêm món / độ cay / ghi chú)');

    const customizeBtnHTML = `
        <button class="customize-btn" id="customize-btn-${catSlug}-${item.name}" onclick="openItemCustomizeModal('${safeCatSlug}','${safeItemName}', 0)" style="pointer-events: auto; display: ${(!isOos && qty > 0 && hasModifiers && !hasBundleRule) ? 'flex' : 'none'}; align-items: center; justify-content: center; gap: 5px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
            <span>${_cmEsc(customizeCardLabel)}</span>
        </button>
    `;

    const bundleEditBtnHTML = `
        <button class="bundle-edit-btn" id="bundle-edit-btn-${catSlug}-${item.name}" onclick="openBundleBuilderModal('${safeCatSlug}','${safeItemName}', 0)" style="pointer-events: auto; display: ${(!isOos && qty > 0 && hasBundleRule) ? 'flex' : 'none'};">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            <span>${_cmEsc(bundleBtnText)}</span>
        </button>
    `;

    div.innerHTML = `
        <div class="card-main" onclick="handleItemCardClick('${safeCatSlug}','${safeItemName}',event)" style="${isOos ? 'pointer-events: none;' : 'cursor: pointer;'}">
            ${imgHTML}
            <div class="card-info">
                <div>
                    <div class="card-title">${_cmEsc(itemDisplayName)} ${badgeHTML} ${limitBadgeHTML}</div>
                    ${transHTML}
                </div>
                <div class="card-footer">
                    ${footerHTML}
                </div>
            </div>
        </div>
        ${customizeBtnHTML}
        ${bundleEditBtnHTML}
        <div id="combo-container-${catSlug}-${item.name}"></div>
    `;

    return div;
}

function getDynamicItemFooterHTML(catSlug, itemName, price, isOos) {
    const cartObj = window.cart || cart || {};
    const qty = cartObj[`${catSlug}_${itemName}`] || 0;
    const safeItemName = itemName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const safeCatSlug = catSlug.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const soldOutTodayText = _cmT('sold_out_today', null, '今日已售完', 'Hôm nay đã hết');
    return isOos ? `
        <div class="card-price" style="color: #9ca3af;">$${price}</div>
        <div style="color: #dc2626; font-weight: 900; font-size: 14px; background: #fee2e2; padding: 4px 10px; border-radius: 6px;">${_cmEsc(soldOutTodayText)}</div>
    ` : `
        <div class="card-price">$${price}</div>
        <div class="qty-control">
            <button class="btn-qty" onclick="event.stopPropagation(); updateQty('${safeCatSlug}','${safeItemName}',-1)">-</button>
            <span class="qty-text" id="qty-${catSlug}-${itemName}" style="${qty > 0 ? 'color: var(--primary);' : ''}">${qty}</span>
            <button class="btn-qty" onclick="event.stopPropagation(); updateQty('${safeCatSlug}','${safeItemName}',1)">+</button>
        </div>
    `;
}

function updateDynamicStockAndPrices() {
    const bData = window.bootstrapData || bootstrapData;
    if (!bData || !bData.catalog) return;
    const cartObj = window.cart || cart || {};

    bData.catalog.forEach(cat => {
        cat.items.forEach(item => {
            const card = document.getElementById(`item-${cat.slug}-${item.name}`);
            if (!card) return;
            card.style.opacity = item.isOutOfStock ? '0.65' : '1';
            card.style.pointerEvents = item.isOutOfStock ? 'none' : 'auto';

            const footer = card.querySelector('.card-footer');
            if (footer) {
                footer.innerHTML = getDynamicItemFooterHTML(cat.slug, item.name, item.price, item.isOutOfStock);
            }

            const getItemModsFn = typeof getItemModifiers === 'function' ? getItemModifiers : (window.getItemModifiers || (typeof getCategoryModifiers === 'function' ? getCategoryModifiers : (window.getCategoryModifiers || (() => []))));
            const itemModifiers = getItemModsFn(cat.slug, item.name);
            const hasModifiers = Array.isArray(itemModifiers) && itemModifiers.length > 0;
            const hasBundleRule = Boolean(item.bundleRule);

            const custBtn = card.querySelector('.customize-btn');
            if (custBtn) {
                const qty = cartObj[`${cat.slug}_${item.name}`] || 0;
                custBtn.style.display = (!item.isOutOfStock && qty > 0 && hasModifiers && !hasBundleRule) ? 'flex' : 'none';
            }

            const bundleEditBtn = card.querySelector('.bundle-edit-btn');
            if (bundleEditBtn) {
                const qty = cartObj[`${cat.slug}_${item.name}`] || 0;
                bundleEditBtn.style.display = (!item.isOutOfStock && qty > 0 && hasBundleRule) ? 'flex' : 'none';
                const bundleBtnText = formatBundleButtonLabel(item, hasModifiers);
                const span = bundleEditBtn.querySelector('span');
                if (span) span.textContent = bundleBtnText;
            }
        });
    });
}

function resolveCatalogItem(key) {
    const parseFn = typeof parseCartKey === 'function' ? parseCartKey : (window.parseCartKey || (k => ({ catSlug: '', origName: k, itemName: k })));
    const { catSlug, origName } = parseFn(key);
    let targetCat = null;
    let targetItem = null;
    const bData = window.bootstrapData || bootstrapData;

    if (typeof bData !== 'undefined' && bData?.catalog) {
        if (catSlug) {
            targetCat = bData.catalog.find(c => c.slug === catSlug);
            if (targetCat?.items) {
                targetItem = targetCat.items.find(it => it.name === origName || it.id === key);
            }
        }
        if (!targetItem) {
            for (const cat of bData.catalog) {
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
    let localizedDisplayName = (targetItem && typeof locText === 'function')
        ? locText(targetItem, 'name', origName)
        : origName;
    let localizedCategoryName = (targetCat && typeof locText === 'function')
        ? locText(targetCat, 'name', targetCat.name || '')
        : (targetCat?.name || '');

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
        if (bData?.catalog) {
            for (const cat of bData.catalog) {
                if (cat.items?.some(it => it.name === origName)) nameCount++;
            }
        }

        if (sizeTag && !origName.includes(' L') && !origName.includes(' S') && !origName.includes(' M') && !origName.startsWith('大') && !origName.startsWith('小')) {
            displayName = `${origName}${sizeTag}`;
        } else if (nameCount > 1 && catNameClean && !origName.includes(catNameClean)) {
            const shortClean = catNameClean.split(/[\s\(\[\{（【]/)[0].trim();
            displayName = `[${shortClean}] ${origName}`;
        }

        const locCatClean = (localizedCategoryName || catNameClean).replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '').trim();
        if (sizeTag && !localizedDisplayName.includes(' L') && !localizedDisplayName.includes(' S') && !localizedDisplayName.includes(' M') && !localizedDisplayName.startsWith('大') && !localizedDisplayName.startsWith('小')) {
            localizedDisplayName = `${localizedDisplayName}${sizeTag}`;
        } else if (nameCount > 1 && locCatClean && !localizedDisplayName.includes(locCatClean)) {
            const shortLocClean = locCatClean.split(/[\s\(\[\{（【]/)[0].trim();
            if (shortLocClean) localizedDisplayName = `[${shortLocClean}] ${localizedDisplayName}`;
        }
    }

    const fallbackCategory = typeof ct === 'function' ? ct('item_category_fallback') : '餐點';
    return {
        catSlug,
        origName,
        displayName,
        localizedDisplayName,
        targetCat,
        targetItem,
        basePrice: Number(targetItem?.price) || 0,
        categoryName: targetCat?.name || catSlug || fallbackCategory,
        localizedCategoryName: localizedCategoryName || targetCat?.name || catSlug || fallbackCategory,
        itemId: targetItem?.id || key,
        bundleRule: targetItem?.bundleRule || null
    };
}

// Window Public Bindings
window.fetchMenu = fetchMenu;
window.openImageLightbox = openImageLightbox;
window.closeImageLightbox = closeImageLightbox;
window.renderDynamicCatalog = renderDynamicCatalog;
window.renderCustomizationsPanel = renderCustomizationsPanel;
window.handleCustomizationChange = handleCustomizationChange;
window.toggleFlavorSubOptions = toggleFlavorSubOptions;
window.handleItemCardClick = handleItemCardClick;
window.createDynamicItemCard = createDynamicItemCard;
window.getDynamicItemFooterHTML = getDynamicItemFooterHTML;
window.updateDynamicStockAndPrices = updateDynamicStockAndPrices;
window.resolveCatalogItem = resolveCatalogItem;
