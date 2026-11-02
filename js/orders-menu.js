// ==========================================
// Benmi POS - Module: Menu Editor & Stock
// ==========================================

let currentMenuData = null;   // Array form for editor
let rawMenuData = null;       // Original object form from API
let activeCategoryIndex = -1;
let isMenuDirty = false;
let savedMenuSnapshot = null;
let isMenuSaving = false;
let isStockSaving = false;
let isMenuLoadedCompletely = false;
let isMenuLoading = false;
let isCustomGroupCreatorOpen = false;
let newCustomGroupType = 'radio';
let newCustomGroupRequired = false;
let newCustomGroupScope = 'order';
let newCustomGroupAppliedCategories = [];
let currentLibraryOptionGroups = [];
let menuModifierLibrary = [];

function updateMenuWorkspace() {
  const orderScreen = document.getElementById('menu-display-order-screen');
  if (orderScreen) orderScreen.hidden = !isCategoryManagerOpen;
  for (const id of ['menu-workspace-heading', 'menu-standard-workspace']) {
    const section = document.getElementById(id);
    if (section) section.hidden = isCategoryManagerOpen;
  }
  document.getElementById('btn-menu-manage-cats')?.classList.toggle('active', isCategoryManagerOpen);
  const optionsMode = menuSidebarTab === 'options' && Boolean(window.UnifiedMenu?.enabled);
  const body = document.getElementById('menu-editor-body');
  body?.classList.toggle('is-option-workspace', optionsMode);
  document.getElementById('menu-editor-panel')?.classList.toggle('is-option-panel', optionsMode);
  const help = document.getElementById('menu-editor-help');
  if (help) help.hidden = optionsMode;
  document.getElementById('menu-categories')?.classList.toggle('is-option-groups', optionsMode);
  if (!optionsMode) {
    for (const id of ['btn-option-group-edit', 'btn-option-add']) {
      const button = document.getElementById(id);
      if (button) button.hidden = true;
    }
  }
}

let menuMobileView = 'master'; // 'master' | 'detail'

function setMenuMobileView(view) {
  menuMobileView = view === 'detail' ? 'detail' : 'master';
  if (typeof document === 'undefined') return;
  const viewMenu = typeof document.getElementById === 'function' ? document.getElementById('view-menu') : null;
  if (viewMenu && typeof viewMenu.setAttribute === 'function') {
    viewMenu.setAttribute('data-mobile-view', menuMobileView);
  }
  updateMenuMobileNavButtons();
}
window.setMenuMobileView = setMenuMobileView;

function updateMenuMobileNavButtons() {
  if (typeof document === 'undefined') return;
  const isDetail = menuMobileView === 'detail';
  const btnNav = typeof document.querySelector === 'function' ? document.querySelector('.menu-header-nav-btn') : null;
  const btnBack = typeof document.getElementById === 'function' ? document.getElementById('btn-menu-mobile-back') : null;
  const titleEl = typeof document.getElementById === 'function' ? document.getElementById('i18n-menu-workspace-title') : null;

  if (btnNav && btnBack) {
    if (isDetail) {
      btnNav.style.display = 'none';
      btnBack.style.display = 'inline-flex';
      let titleText = '';
      const editorTitle = typeof document.getElementById === 'function' ? document.getElementById('menu-editor-title') : null;
      if (editorTitle && editorTitle.textContent && editorTitle.textContent.trim()) {
        titleText = editorTitle.textContent.trim();
      } else if (currentMenuData && currentMenuData[activeCategoryIndex]) {
        const cat = currentMenuData[activeCategoryIndex];
        titleText = isCustomizationCategory(cat)
          ? (cat.groups?.[activeOptionGroupIndex]?.title || cat.title)
          : cat.title;
      }
      if (titleEl && titleText) titleEl.textContent = titleText;
    } else {
      btnNav.style.display = '';
      btnBack.style.display = 'none';
      if (titleEl) titleEl.textContent = t('menuWorkspaceTitle') || '菜單管理';
    }
  }
}
window.updateMenuMobileNavButtons = updateMenuMobileNavButtons;

function moveMenuItem(cIdx, iIdx, direction) {
  const items = currentMenuData?.[cIdx]?.items;
  const target = iIdx + direction;
  if (!items || ![-1, 1].includes(direction) || target < 0 || target >= items.length) return;
  syncMenuDataFromDOM();
  [items[iIdx], items[target]] = [items[target], items[iIdx]];
  renderMenuCategoryEditor(cIdx);
  markMenuDirty();
  document.getElementById(`menu-item-card-${cIdx}-${target}`)?.focus();
}

function getBenmiDefaultCategories() {
  return [
    { id: "small", label: currentLang === 'vi' ? "Bánh mì nhỏ" : "小麵包" },
    { id: "large", label: currentLang === 'vi' ? "Bánh mì lớn" : "大麵包" },
    { id: "combo", label: currentLang === 'vi' ? "Combo kèm đồ uống" : "特惠套餐" },
    { id: "drinks", label: currentLang === 'vi' ? "Đồ uống" : "單點飲料" },
    { id: "topping", label: currentLang === 'vi' ? "Topping thêm" : "加料選項" }
  ];
}

function updateMenuSaveState() {
  const text = t(isMenuSaving ? "menuSaving" : isMenuDirty ? "btnMenuSave" : "menuSaved");
  for (const [id, labelId] of [['btn-menu-save','btn-menu-save-text'], ['btn-menu-order-save','btn-menu-order-save-text']]) {
    const btn = document.getElementById(id), label = document.getElementById(labelId);
    if (!btn) continue;
    btn.disabled = isMenuSaving || isStockSaving || !isMenuLoadedCompletely || !isMenuDirty;
    btn.classList.toggle("has-changes", isMenuDirty);
    if (label) label.textContent = id === 'btn-menu-order-save' ? (isMenuDirty ? (t('btnSaveSortChanges') || text) : text) : text;
    else btn.textContent = text;
  }
  const statusWrap = document.getElementById('menu-order-save-status');
  const statusText = document.getElementById('menu-order-save-status-text');
  if (statusWrap && statusText) {
    if (isMenuDirty) {
      statusWrap.className = 'menu-order-save-status is-dirty';
      statusText.textContent = t('statusUnsaved');
    } else {
      statusWrap.className = 'menu-order-save-status is-saved';
      statusText.textContent = t('statusAutoSaved');
    }
  }
  const wsSavePill = document.getElementById('menu-workspace-save-pill');
  const wsSaveStatusText = document.getElementById('menu-workspace-save-status-text');
  if (wsSavePill && wsSaveStatusText) {
    if (isMenuDirty) {
      wsSavePill.className = 'menu-workspace-save-pill is-dirty';
      wsSaveStatusText.textContent = t('statusUnsaved');
    } else {
      wsSavePill.className = 'menu-workspace-save-pill is-saved';
      wsSaveStatusText.textContent = t('statusAutoSaved');
    }
  }
  const revertBtn = document.getElementById('btn-menu-order-revert');
  if (revertBtn) {
    revertBtn.disabled = isMenuSaving || !isMenuDirty;
  }
  const orderButton = document.getElementById('btn-menu-manage-cats');
  if (orderButton) orderButton.disabled = isMenuSaving || !isMenuLoadedCompletely;
  const backButton = document.getElementById('btn-menu-order-back');
  if (backButton) backButton.disabled = isMenuSaving;
}

function canonicalMenuSnapshot(data) {
  if (!data) return '';
  function clean(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (typeof val === 'boolean') return val;
    if (Array.isArray(val)) {
      return val.map(clean);
    }
    if (typeof val === 'object') {
      const sortedKeys = Object.keys(val).sort();
      const res = {};
      for (const k of sortedKeys) {
        if (k.startsWith('_')) continue;
        const v = val[k];
        if ((k === 'modifierGroups' || k === 'appliedItems' || k === 'appliedCategories' || k === 'sub_options') && (v === undefined || v === null || (Array.isArray(v) && v.length === 0))) {
          res[k] = [];
          continue;
        }
        if (k === 'badgeText') {
          res[k] = v ? String(v).trim() : '';
          continue;
        }
        if (k === 'bundleRule' && (!v || !v.groups || v.groups.length === 0)) {
          res[k] = null;
          continue;
        }
        res[k] = clean(v);
      }
      return res;
    }
    return val;
  }
  return JSON.stringify(clean(data));
}
window.canonicalMenuSnapshot = canonicalMenuSnapshot;

function checkMenuDirty() {
  if (isMenuSaving) return isMenuDirty;
  if (!isMenuLoadedCompletely || !savedMenuSnapshot || !currentMenuData) {
    updateMenuSaveState();
    return isMenuDirty;
  }
  syncMenuDataFromDOM();
  const currentSnap = canonicalMenuSnapshot(currentMenuData);
  isMenuDirty = currentSnap !== savedMenuSnapshot;
  updateMenuSaveState();
  return isMenuDirty;
}
window.checkMenuDirty = checkMenuDirty;

function markMenuDirty() {
  if (savedMenuSnapshot && isMenuLoadedCompletely && currentMenuData) {
    checkMenuDirty();
  } else {
    isMenuDirty = true;
    updateMenuSaveState();
  }
}

function clearMenuDirty() {
  isMenuDirty = false;
  savedMenuSnapshot = canonicalMenuSnapshot(currentMenuData);
  updateMenuSaveState();
}

function confirmLeaveMenu() {
  if (isMenuSaving || isStockSaving) return false;
  checkMenuDirty();
  if (!isMenuDirty) return true;
  if (!confirm(t("menuDiscardConfirm"))) return false;
  currentMenuData = savedMenuSnapshot ? JSON.parse(savedMenuSnapshot) : null;
  activeCategoryIndex = currentMenuData?.length ? Math.max(0, Math.min(activeCategoryIndex, currentMenuData.length - 1)) : -1;
  clearMenuDirty();
  renderMenuCategories();
  if (activeCategoryIndex >= 0) renderMenuCategoryEditor(activeCategoryIndex);
  else {
    const body = document.getElementById("menu-editor-body");
    if (body) body.textContent = t("menuSelectPrompt");
  }
  return true;
}
window.confirmLeaveMenu = confirmLeaveMenu;

// All help disclosures, including dynamically rendered category help and modal backdrop dismissals.
document.addEventListener('click', event => {
  document.querySelectorAll('.menu-help[open]').forEach(help => {
    if (!help.contains(event.target)) help.open = false;
  });
  const itemDetailModalEl = document.getElementById("itemDetailModal");
  if (itemDetailModalEl && event.target === itemDetailModalEl) {
    closeItemDetailModal();
  }
  const itemModModalEl = document.getElementById("itemModifiersModal");
  if (itemModModalEl && event.target === itemModModalEl) {
    closeItemModifiersModal();
  }
  const bundleModalEl = document.getElementById("modal-bundle-editor");
  if (bundleModalEl && event.target === bundleModalEl) {
    closeBundleEditorModal();
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeAllItemActionMenus();
    document.querySelectorAll('.menu-help[open]').forEach(help => { help.open = false; });
    const itemDetail = document.getElementById("itemDetailModal");
    if (itemDetail && itemDetail.style.display !== "none") {
      closeItemDetailModal();
      return;
    }
    const itemMods = document.getElementById("itemModifiersModal");
    if (itemMods && itemMods.style.display !== "none") {
      closeItemModifiersModal();
      return;
    }
    const bundleEditor = document.getElementById("modal-bundle-editor");
    if (bundleEditor && bundleEditor.style.display !== "none") {
      closeBundleEditorModal();
      return;
    }
  }
});

window.addEventListener("beforeunload", event => {
  checkMenuDirty();
  if (!isMenuDirty && !isMenuSaving && !isStockSaving) return;
  event.preventDefault();
  event.returnValue = "";
});

function openMenuSettings() {
  if (isMenuDirty) syncMenuDataFromDOM();
  activeTab = "menu";
  setMenuMobileView('master');
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".mini-btn").forEach(t => t.classList.remove("active"));
  const tabMenu = document.getElementById("tab-menu");
  if (tabMenu) tabMenu.classList.add("active");
  if (typeof updateSidebarActive === "function") {
    updateSidebarActive("menu");
  }
  document.querySelectorAll(".content").forEach(c => c.style.display = "none");
  const viewMenu = document.getElementById("view-menu");
  if (viewMenu) viewMenu.style.display = "block";
  if (typeof syncStoreStatusPlacement === "function") {
    syncStoreStatusPlacement("menu");
  }
  if (!currentMenuData || !isMenuLoadedCompletely) {
    loadMenuData();
  } else {
    renderMenuCategories();
    if (activeCategoryIndex >= 0) {
      renderMenuCategoryEditor(activeCategoryIndex);
    }
  }
}

function setMenuLoading(loading) {
  isMenuLoading = loading;
  const indicator = document.getElementById('menu-loading');
  if (indicator) indicator.hidden = !loading;
  const label = document.getElementById('i18n-menu-loading');
  if (label) label.textContent = t('menuLoading');
  for (const id of ['menu-sidebar-panel', 'menu-editor-panel']) {
    const panel = document.getElementById(id);
    if (panel) {
      panel.inert = loading;
      panel.setAttribute('aria-busy', String(loading));
    }
  }
}

async function loadMenuData() {
  if (isMenuLoading) return;
  setMenuLoading(true);
  isMenuLoadedCompletely = false;
  updateMenuSaveState();
  const bodyEl = document.getElementById("menu-editor-body");
  try {
    const tenantId = getTenantIdFromUrl();
    const [res, libraryResponse, imageListRes] = await Promise.all([
      fetch(`${WORKER_BASE}/api/tenant/bootstrap?tenant_id=${tenantId}&_t=${Date.now()}`),
      fetch(`${WORKER_BASE}/api/menu/modifier-library?tenant_id=${encodeURIComponent(tenantId)}&_t=${Date.now()}`),
      fetch(`${WORKER_BASE}/api/image_list?tenant_id=${encodeURIComponent(tenantId)}&_t=${Date.now()}`).catch(() => null)
    ]);
    if (!res.ok) throw new Error("Failed to load bootstrap");
    const data = await res.json();
    if (data.menuComplete !== true || !Array.isArray(data.catalog) || !Array.isArray(data.modifiers) ||
        (data.customizations !== undefined && !Array.isArray(data.customizations))) {
      throw new Error('Incomplete menu');
    }

    if (!libraryResponse.ok) throw new Error('Failed to load modifier library');
    const libraryData = await libraryResponse.json();
    if (libraryData.complete !== true || !Array.isArray(libraryData.groups)) throw new Error('Incomplete modifier library');
    menuModifierLibrary = libraryData.groups;

    if (imageListRes && imageListRes.ok) {
      try {
        const imgArr = await imageListRes.json();
        if (Array.isArray(imgArr)) window._tenantImageList = new Set(imgArr);
      } catch (_) {}
    }

    const categories = [];
    // The editor uses category slugs; bootstrap relationships use database IDs.
    const categoryEditorIds = new Map();
    (data.catalog || []).forEach(cat => {
      if (cat.id) categoryEditorIds.set(String(cat.id), cat.slug);
      if (cat.slug) categoryEditorIds.set(String(cat.slug), cat.slug);
    });
    const normalizeAppliedCategories = ids => [...new Set(ids
      .map(id => categoryEditorIds.get(String(id)))
      .filter(Boolean))];
    if (data.catalog) {
      data.catalog.forEach((cat, cIdx) => {
        if (cat.slug === 'sec-flavor' || cat.slug === 'flavor' || cat.categoryType === 'order_customization' || cat.category_type === 'order_customization') {
          return;
        }
        categories.push({
          id: cat.slug,
          databaseId: cat.id,
          catId: cat.id || cat.slug,
          title: cat.name,
          shortName: cat.shortName || cat.name,
          type: 'catalog',
          allowCustomization: cat.allowCustomization !== undefined ? cat.allowCustomization : (cat.slug !== 'drinks'),
          appliedModifiers: cat.appliedModifiers || (cat.allowCustomization === false ? [] : ['*']),
          sortOrder: Number(cat.sortOrder !== undefined ? cat.sortOrder : (cat.sort_order !== undefined ? cat.sort_order : (cIdx + 1))),
          items: cat.items.map(it => ({
            id: it.id || null,
            name: it.name,
            price: it.price,
            isOos: it.isOutOfStock,
            badgeText: it.badgeText || (it.badge || ''),
            isRecommended: it.isRecommended || false,
            bundleRule: it.bundleRule || null,
            itemType: it.itemType || 'standard',
            modifierGroups: Array.isArray(it.modifierGroups) ? it.modifierGroups : [],
            originalName: it.name
          }))
        });
      });
    }
    if (data.modifiers) {
      data.modifiers.forEach((mod, mIdx) => {
        if (!categories.some(c => c.id === mod.slug)) {
          const libraryGroup = menuModifierLibrary.find(group =>
            group.source === 'modifier_category' && String(group.sourceId) === String(mod.id)
          );
          const modOptions = (mod.options || []).map(opt => ({
            id: opt.id,
            name: opt.name,
            price: opt.price !== undefined ? opt.price : 0,
            isOos: Boolean(opt.isOutOfStock || opt.is_out_of_stock),
            outOfStockUntil: opt.outOfStockUntil || opt.out_of_stock_until || null,
            badgeText: opt.badgeText || (opt.badge || ''),
            isRecommended: opt.isRecommended || false,
            originalName: opt.name
          }));

          const linkedCatIds = [];
          if (Array.isArray(data.categoryModifierLinks)) {
            data.categoryModifierLinks.forEach(link => {
              if (link.groupId === mod.id || link.groupId === mod.slug || link.groupId === `mg_${mod.id}`) {
                linkedCatIds.push(link.categoryId);
              }
            });
          }
          if (Array.isArray(data.catalog)) {
            data.catalog.forEach(c => {
              if (Array.isArray(c.appliedModifiers) && (c.appliedModifiers.includes('*') || c.appliedModifiers.includes(mod.id) || c.appliedModifiers.includes(mod.slug))) {
                if (!linkedCatIds.includes(c.id)) linkedCatIds.push(c.id);
              }
              if (Array.isArray(c.modifierGroups) && c.modifierGroups.some(g => g.id === mod.id || g.id === mod.slug || g.id === `mg_${mod.id}`)) {
                if (!linkedCatIds.includes(c.id)) linkedCatIds.push(c.id);
              }
            });
          }
          const modScope = libraryGroup?.scope || mod.scope || (linkedCatIds.length > 0 ? 'category' : 'item');

          categories.push({
            id: mod.slug,
            databaseId: mod.id,
            title: mod.name,
            shortName: mod.shortName || mod.name,
            type: 'modifier',
            sortOrder: Number(mod.sortOrder !== undefined ? mod.sortOrder : (mod.sort_order !== undefined ? mod.sort_order : (100 + mIdx))),
            groups: [{
              id: libraryGroup?.canonicalId || mod.id || mod.slug,
              key: mod.slug,
              title: mod.name,
              type: mod.selectionType === 'single' ? 'radio' : 'checkbox',
              isRequired: Boolean(mod.isRequired),
              scope: modScope,
              appliedCategories: normalizeAppliedCategories(libraryGroup?.categoryIds?.length ? libraryGroup.categoryIds : linkedCatIds),
              appliedItems: Array.isArray(libraryGroup?.itemIds) ? [...libraryGroup.itemIds] : [],
              source: 'modifier_category',
              sourceId: mod.id || mod.slug,
              canonicalId: libraryGroup?.canonicalId || null,
              sortOrder: 0,
              options: modOptions
            }],
            items: modOptions
          });
        }
      });
    }

    const hasCustomizations = (Array.isArray(data.customizations) && data.customizations.length > 0);
    const hasCustomInCatalog = (data.catalog && data.catalog.some(c => c.slug === 'sec-flavor' || c.categoryType === 'order_customization' || c.category_type === 'order_customization'));
    const isLangVi = (typeof currentLang !== 'undefined' && currentLang === 'vi');

    if (hasCustomizations || hasCustomInCatalog) {
      if (!categories.some(c => c.type === 'order_customization' || c.id === 'sec-flavor')) {
        const customGroups = hasCustomizations
          ? data.customizations.map((cust, gIdx) => {
              const custId = cust.id || `custom_${tenantId}_${cust.key || gIdx}`;
              const modGid = `mg_${custId}`;
              const libraryGroup = menuModifierLibrary.find(group =>
                group.source === 'customization' && String(group.sourceId) === String(cust.id)
              ) || menuModifierLibrary.find(group => String(group.id) === String(custId));
              const linkedCatIds = [];
              if (Array.isArray(data.categoryModifierLinks)) {
                data.categoryModifierLinks.forEach(link => {
                  if (link.groupId === custId || link.groupId === modGid || link.groupId === cust.key) {
                    linkedCatIds.push(link.categoryId);
                  }
                });
              }
              if (Array.isArray(data.catalog)) {
                data.catalog.forEach(c => {
                  if (Array.isArray(c.modifierGroups) && c.modifierGroups.some(g => g.id === custId || g.id === modGid || g.id === cust.key)) {
                    if (!linkedCatIds.includes(c.id)) linkedCatIds.push(c.id);
                  }
                });
              }
              const resolvedScope = cust.scope || (linkedCatIds.length > 0 ? 'category' : 'order');

              return {
                minSelection: menuModifierLibrary.find(group => group.sourceId === cust.id)?.minSelection,
                maxSelection: menuModifierLibrary.find(group => group.sourceId === cust.id)?.maxSelection,
                id: custId,
                key: cust.key || `custom_${gIdx}`,
                title: cust.title || cust.name || '',
                type: cust.type || 'radio',
                isRequired: Boolean(cust.isRequired),
                scope: resolvedScope,
                appliedCategories: normalizeAppliedCategories(linkedCatIds),
                appliedItems: Array.isArray(libraryGroup?.itemIds) ? [...libraryGroup.itemIds] : [],
                source: 'customization',
                sourceId: cust.id || custId,
                canonicalId: libraryGroup?.canonicalId || null,
                sortOrder: cust.sortOrder !== undefined ? cust.sortOrder : gIdx,
                options: (cust.options || []).map(opt => ({
                  ...opt,
                  id: opt.id || opt.name,
                  name: opt.name || opt.title || '',
                  price: opt.price !== undefined ? opt.price : (opt.surcharge !== undefined ? opt.surcharge : 0),
                  isOos: Boolean(opt.isOutOfStock || opt.is_out_of_stock),
                  sub_options: Array.isArray(opt.sub_options) ? [...opt.sub_options] : (Array.isArray(opt.subOptions) ? [...opt.subOptions] : []),
                  originalName: opt.name || opt.title || ''
                }))
              };
            })
          : [];

        categories.push({
          id: 'sec-flavor',
          databaseId: data.customizationCategoryId || null,
          title: isLangVi ? 'Tùy chọn khẩu vị & biến thể' : '口味與客製化選擇',
          shortName: isLangVi ? 'Khẩu vị' : '口味選擇',
          type: 'order_customization',
          allowCustomization: false,
          appliedModifiers: [],
          sortOrder: Number(data.customizationSortOrder !== undefined ? data.customizationSortOrder : 0),
          groups: customGroups,
          items: []
        });
      }
    }

    // Adapt canonical groups to the same editor model as legacy customizations.
    const canonicalGroups = menuModifierLibrary.filter(group => group.source === 'canonical');
    if (canonicalGroups.length) {
      let section = categories.find(cat => cat.type === 'order_customization');
      if (!section) {
        section = { id: 'sec-flavor', type: 'order_customization', title: isLangVi ? 'Tùy chọn khẩu vị & biến thể' : '口味與客製化選擇', groups: [], items: [], sortOrder: 0 };
        categories.push(section);
      }
      canonicalGroups.forEach(group => {
        if (!section.groups.some(g => String(g.id) === String(group.id) || g.key === `canonical_${group.id}`)) {
          section.groups.push({
            ...group,
            key: `canonical_${group.id}`,
            title: group.name,
            type: group.selectionType === 'multiple' ? 'checkbox' : 'radio',
            isRequired: Boolean(group.isRequired),
            scope: group.scope || ((group.categoryIds?.length || group.itemIds?.length) ? 'category' : 'order'),
            appliedCategories: normalizeAppliedCategories(group.categoryIds || []),
            appliedItems: [...(group.itemIds || [])],
            sortOrder: group.sortOrder || 0,
            options: (group.options || []).map(option => ({
              ...option,
              id: option.id || option.name,
              name: option.name,
              price: option.price !== undefined ? option.price : 0,
              isOos: Boolean(option.isOutOfStock || option.is_out_of_stock),
              sub_options: Array.isArray(option.sub_options) ? [...option.sub_options] : [],
              originalName: option.name
            }))
          });
        }
      });
    }

    // The customization panel is a real sortable section. Keep its saved
    // position interleaved with catalog categories rather than forcing it first.
    categories.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    if (data.unifiedMenu && window.UnifiedMenu) await window.UnifiedMenu.load();
    currentMenuData = categories;
    isMenuLoadedCompletely = true;

    if (typeof updatePosCatalogPriceMap === 'function') {
      updatePosCatalogPriceMap(currentMenuData);
    }

    clearMenuDirty();
    if (menuSidebarTab === 'products') {
      const firstCatalog = currentMenuData.findIndex(c => !isCustomizationCategory(c));
      activeCategoryIndex = firstCatalog >= 0 ? firstCatalog : (currentMenuData.length > 0 ? 0 : -1);
    } else {
      let flavorIdx = currentMenuData.findIndex(c => c.type === 'order_customization' || c.id === 'sec-flavor' || c.slug === 'sec-flavor');
      if (flavorIdx >= 0 && (!currentMenuData[flavorIdx].groups || currentMenuData[flavorIdx].groups.length === 0)) {
        const modIdx = currentMenuData.findIndex(c => c.type === 'modifier');
        if (modIdx >= 0) flavorIdx = modIdx;
      }
      if (flavorIdx < 0) flavorIdx = currentMenuData.findIndex(c => isCustomizationCategory(c));
      activeCategoryIndex = flavorIdx >= 0 ? flavorIdx : (currentMenuData.length > 0 ? 0 : -1);
    }
    renderMenuCategories();
    if (activeCategoryIndex >= 0) {
      renderMenuCategoryEditor(activeCategoryIndex);
    } else {
      if (bodyEl) bodyEl.innerHTML = `<div style="text-align:center; padding: 22px; color:#999;" id="i18n-menu-select-prompt">${t("menuSelectPrompt")}</div>`;
      const titleEl = document.getElementById("menu-editor-title");
      if (titleEl) titleEl.innerText = t("menuEditorTitle");
      const renameBtn = document.getElementById("btn-category-rename");
      const deleteBtn = document.getElementById("btn-category-delete");
      if (renameBtn) renameBtn.style.display = "none";
      if (deleteBtn) deleteBtn.style.display = "none";
    }
  } catch (e) {
    console.warn("Complete menu load failed:", e);
    isMenuLoadedCompletely = false;
    updateMenuSaveState();
    if (isMenuDirty && currentMenuData) {
      if (typeof showToast === 'function') {
        showToast(t('menuIncompleteReload') || 'Tải menu không thành công, đã giữ nguyên bản nháp đang sửa.', 'warning');
      }
      return;
    }
    currentMenuData = null;
    savedMenuSnapshot = null;
    isMenuDirty = false;
    activeCategoryIndex = -1;
    renderMenuCategories();
    updateMenuSaveState();
    if (bodyEl) {
      bodyEl.textContent = t('menuIncompleteReload');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = t('menuRetryLoad');
      retry.style.minHeight = '48px';
      retry.addEventListener('click', loadMenuData);
      bodyEl.appendChild(retry);
    }
  } finally {
    setMenuLoading(false);
  }
}

let draggedCategoryIndex = null;
let isCategoryManagerOpen = false;
let categoryBeforeDisplayOrder = -1;
let displayOrderCategory = null;
let displayOrderInitial = [];
let displayOrderInitialSnapshot = null;
let displayOrderGroupInitial = [];

function captureMenuDisplayOrder() {
  const capture = entry => ({ ...entry, value: entry.model[entry.field], hadOrder: Object.hasOwn(entry.model, entry.field) });
  displayOrderInitial = getMenuDisplayEntries().map(capture);
  displayOrderGroupInitial = getMenuOrderGroups().map(model => capture({ model, field: 'sortOrder', position: Number(model.sortOrder) || 0 }));
  try {
    displayOrderInitialSnapshot = JSON.stringify(currentMenuData);
  } catch (e) {
    displayOrderInitialSnapshot = null;
  }
}

function openCategoriesManager() {
  if (!isMenuLoadedCompletely || !currentMenuData || isMenuSaving || isCategoryManagerOpen) return;
  syncMenuDataFromDOM();
  categoryBeforeDisplayOrder = activeCategoryIndex;
  displayOrderCategory = currentMenuData[activeCategoryIndex] || null;
  if (displayOrderCategory && displayOrderCategory.type === 'modifier') displayOrderCategory = null;
  captureMenuDisplayOrder();
  isCategoryManagerOpen = true;
  activeCategoryIndex = -1;
  // Stale inline inputs must not write into newly reordered item indexes.
  const body = document.getElementById('menu-editor-body');
  if (body) body.innerHTML = '';
  renderMenuCategories();
  document.getElementById('menu-order-title')?.focus();
}

function revertCategoriesDisplayOrder() {
  if (isMenuSaving || !displayOrderInitialSnapshot) return;
  try {
    currentMenuData = JSON.parse(displayOrderInitialSnapshot);
  } catch (e) {
    return;
  }
  clearMenuDirty();
  displayOrderCategory = currentMenuData.find(c => !isCustomizationCategory(c)) || currentMenuData[0] || null;
  renderCategoriesManagerView();
}
window.revertCategoriesDisplayOrder = revertCategoriesDisplayOrder;

function closeCategoriesManager() {
  if (isMenuSaving) return;
  isCategoryManagerOpen = false;
  activeCategoryIndex = currentMenuData?.[categoryBeforeDisplayOrder] ? categoryBeforeDisplayOrder : (currentMenuData || []).findIndex(cat => menuSidebarTab === 'products' ? !isCustomizationCategory(cat) : isCustomizationCategory(cat));
  renderMenuCategories();
  if (activeCategoryIndex >= 0) {
    renderMenuCategoryEditor(activeCategoryIndex);
  } else {
    const titleEl = document.getElementById("menu-editor-title");
    if (titleEl) titleEl.innerText = t("menuEditorTitle");
    const subEl = document.getElementById("i18n-menu-edit-sub");
    if (subEl) subEl.innerText = t("menuEditSub");
    const bodyEl = document.getElementById("menu-editor-body");
    if (bodyEl) bodyEl.innerHTML = `<div style="text-align:center; padding: 22px; color:#999;" id="i18n-menu-select-prompt">${t("menuSelectPrompt")}</div>`;
    const renameBtn = document.getElementById("btn-category-rename");
    const deleteBtn = document.getElementById("btn-category-delete");
    const createBtn = document.getElementById("btn-menu-create-unified");
    const addCatTopBtn = document.getElementById("btn-menu-add-cat-top");
    const closeBtn = document.getElementById("btn-menu-manage-close");
    if (renameBtn) renameBtn.style.display = "none";
    if (deleteBtn) deleteBtn.style.display = "none";
    if (createBtn) createBtn.style.display = "none";
    if (addCatTopBtn) addCatTopBtn.style.display = "none";
    if (closeBtn) closeBtn.style.display = "none";
  }
  document.getElementById('btn-menu-manage-cats')?.focus();
}

function getDragAfterElement(container, y, selector) {
  const draggableElements = [...container.querySelectorAll(`${selector}:not(.dragging)`)];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateCategoryCardIndexes(cardsList) {
  if (!cardsList) return;
  const cards = cardsList.querySelectorAll('.cat-mgr-card');
  cards.forEach((c, i) => {
    const idxEl = c.querySelector('.cat-mgr-index');
    if (idxEl) idxEl.innerText = `#${i + 1}`;
  });
}

function formatPlusBtnText(text, fallback) {
  const raw = String(text || fallback || '').trim();
  if (!raw) return '';
  return raw.startsWith('+') ? raw : `+ ${raw}`;
}

function getMenuOrderGroups() {
  const groups = [];
  const seenGroups = new Set();
  (currentMenuData || []).forEach(cat => {
    if (isCustomizationCategory(cat)) {
      (cat.groups || []).forEach(group => {
        const scope = group.scope || (cat.type === 'modifier' ? 'item' : 'order');
        const id = String(group.canonicalId || group.id || '');
        if (scope !== 'order' || !id || seenGroups.has(id)) return;
        seenGroups.add(id);
        groups.push(group);
      });
    }
  });
  return groups.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
}

function getMenuDisplayEntries() {
  const section = getMenuOrderGroups().length ? currentMenuData.find(cat => cat.type === 'order_customization') || currentMenuData.find(cat => isCustomizationCategory(cat) && cat.groups?.some(group => group.scope === 'order')) : null;
  const entries = (currentMenuData || []).filter(cat => cat === section || !isCustomizationCategory(cat)).map(model => ({
    model, title: model === section ? t('menuOrderFlavorSection') : model.title,
    kind: model === section ? 'scopeOrder' : 'categoryTypeCatalogBadge', isOrderSection: model === section,
    field: 'sortOrder', position: Number(model.sortOrder) || 0,
    itemsCount: model === section ? getMenuOrderGroups().length : (model.items || []).length
  }));
  return entries.sort((a, b) => a.position - b.position);
}

function commitMenuDisplayRanks(ordered, initial) {
  const original = ordered.length === initial.length && ordered.every((entry, i) => entry.model === initial[i].model);
  const slots = initial.map(entry => entry.position);
  const useSlots = slots.length === ordered.length && slots.every((value, i) => Number.isFinite(value) && (!i || value > slots[i-1]));
  ordered.forEach((entry, i) => {
    if (original) {
      if (initial[i].hadOrder) entry.model[entry.field] = initial[i].value;
      else delete entry.model[entry.field];
    } else entry.model[entry.field] = useSlots ? slots[i] : i + 1;
  });
}

function renderCategoriesManagerView() {
  updateMenuWorkspace();
  const container = document.getElementById('menu-order-panels');
  if (!container) return;
  const positions = [...container.querySelectorAll('[data-order-list]')].map(list => list.scrollTop);

  // Synchronize header text and badges
  const titleEl = document.getElementById('menu-order-title');
  if (titleEl) titleEl.textContent = t('manageCategoriesTitle');
  const descEl = document.getElementById('menu-order-description');
  if (descEl) descEl.textContent = t('manageCategoriesSub');
  const backTextEl = document.getElementById('btn-menu-order-back-text');
  if (backTextEl) backTextEl.textContent = t('btnBack');

  const storeBadge = document.getElementById('menu-order-store-badge');
  const storeStatusText = document.getElementById('menu-order-store-status-text');
  const isOpen = (typeof currentStoreStatus !== 'undefined' ? currentStoreStatus : 'open') === 'open';
  if (storeStatusText) storeStatusText.textContent = isOpen ? t('statusOpen') : t('statusClosed');
  if (storeBadge) storeBadge.classList.toggle('is-closed', !isOpen);

  const storeNameEl = document.getElementById('menu-order-store-name');
  if (storeNameEl) {
    const brand = window.currentTenantBrandName || window.storeBrandName || (typeof currentTenantConfig !== 'undefined' && (currentTenantConfig?.name || currentTenantConfig?.storeName)) || 'Quán Ăn Đài Loan';
    storeNameEl.textContent = brand;
  }
  const bcMgmt = document.getElementById('menu-order-bc-mgmt');
  if (bcMgmt) bcMgmt.textContent = t('menuSortBreadcrumbMenu');
  const bcDining = document.getElementById('menu-order-bc-dining');
  if (bcDining) bcDining.textContent = t('menuSortBreadcrumbDineTakeaway');

  const tipLabel = document.getElementById('tablet-tip-label');
  if (tipLabel) tipLabel.textContent = t('tabletSortTipLabel');
  const tipDesc = document.getElementById('tablet-tip-desc');
  if (tipDesc) tipDesc.textContent = t('tabletSortTipDesc');
  const tipBadge = document.getElementById('tablet-mode-badge');
  if (tipBadge) tipBadge.textContent = t('posTouchModeBadge');

  container.innerHTML = '';
  const entries = getMenuDisplayEntries();
  if (!entries.some(entry => entry.model === displayOrderCategory)) {
    displayOrderCategory = entries.find(entry => !entry.isOrderSection)?.model || entries[0]?.model || null;
  }
  const selected = entries.find(entry => entry.model === displayOrderCategory);

  const addPanel = (headerEl, id) => {
    const section = document.createElement('section');
    section.className = 'menu-order-panel';
    section.setAttribute('aria-labelledby', id);
    section.appendChild(headerEl);
    const list = document.createElement('div');
    list.className = 'menu-order-list';
    list.setAttribute('data-order-list', id);
    section.appendChild(list);
    container.appendChild(section);
    return list;
  };

  // Left Panel: Sections (Catalog Categories + Unified Flavor Section)
  const leftHeader = document.createElement('div');
  leftHeader.className = 'menu-order-panel-header';
  const leftTopRow = document.createElement('div');
  leftTopRow.className = 'panel-header-top-row';
  const leftTitleWrap = document.createElement('div');
  leftTitleWrap.className = 'panel-header-title-wrap';
  const leftTitle = document.createElement('h3');
  leftTitle.className = 'panel-header-title';
  leftTitle.id = 'menu-order-sections-title';
  leftTitle.textContent = t('sortColSectionsTitle');
  const leftCount = document.createElement('span');
  leftCount.className = 'panel-count-badge';
  leftCount.textContent = `${entries.length} ${t('menuUnitItem') || 'mục'}`;
  leftTitleWrap.appendChild(leftTitle);
  leftTitleWrap.appendChild(leftCount);
  const leftHint = document.createElement('span');
  leftHint.className = 'panel-header-hint';
  leftHint.textContent = t('sortColClickToView');
  leftTopRow.appendChild(leftTitleWrap);
  leftTopRow.appendChild(leftHint);
  leftHeader.appendChild(leftTopRow);

  const sectionsList = addPanel(leftHeader, 'menu-order-sections-title');

  // Right Panel: Items in Selected Category or Groups in Flavor Section
  const targetCategoryTitle = displayOrderCategory ? (displayOrderCategory.title || displayOrderCategory.name || '') : '';
  const rightHeader = document.createElement('div');
  rightHeader.className = 'menu-order-panel-header header-right';
  const rightTopRow = document.createElement('div');
  rightTopRow.className = 'panel-header-top-row';
  const rightTitleWrap = document.createElement('div');
  rightTitleWrap.className = 'panel-header-title-wrap';
  const rightTitle = document.createElement('h3');
  rightTitle.className = 'panel-header-title';
  rightTitle.id = 'menu-order-items-title';
  rightTitle.textContent = selected?.isOrderSection
    ? t('menuOrderGroups')
    : (displayOrderCategory ? t('menuOrderItems', { name: targetCategoryTitle }) : t('segProducts'));

  const rightItemsCount = selected?.isOrderSection
    ? getMenuOrderGroups().length
    : (displayOrderCategory?.items || []).length;

  const rightCount = document.createElement('span');
  rightCount.className = 'panel-count-badge count-badge-right';
  rightCount.textContent = selected?.isOrderSection
    ? t('nCustomizationsVisible', { n: rightItemsCount })
    : t('nItemsVisible', { n: rightItemsCount });

  rightTitleWrap.appendChild(rightTitle);
  rightTopRow.appendChild(rightTitleWrap);
  rightTopRow.appendChild(rightCount);

  const rightSub = document.createElement('div');
  rightSub.className = 'panel-header-sub';
  rightSub.textContent = t('sortColItemsSubtitle');
  rightHeader.appendChild(rightTopRow);
  rightHeader.appendChild(rightSub);

  const itemsList = addPanel(rightHeader, 'menu-order-items-title');

  const empty = (list, key) => {
    const message = document.createElement('p');
    message.className = 'menu-order-empty';
    message.textContent = t(key);
    list.appendChild(message);
  };

  const commitSections = ordered => commitMenuDisplayRanks(ordered, displayOrderInitial);

  const rows = (list, values, kind, commit) => {
    let dragged = null;
    values.forEach((value, index) => {
      const model = kind === 'section' ? value.model : value;
      const isSelected = (kind === 'section' && displayOrderCategory && model === displayOrderCategory);
      const name = kind === 'section' ? value.title : (value.name || value.title || '');
      const row = document.createElement('div');
      row.className = 'menu-order-card menu-display-order-row' + (isSelected ? ' is-selected' : '');
      row.draggable = true;
      row.setAttribute('data-order-kind', kind);
      row.setAttribute('data-order-index', index);

      // Index number circle
      const ordinal = document.createElement('div');
      ordinal.className = 'menu-order-card-idx menu-order-index' + (isSelected ? ' is-active-idx' : '');
      ordinal.textContent = String(index + 1);
      ordinal.setAttribute('aria-hidden', 'true');
      row.appendChild(ordinal);

      // Content
      const contentEl = document.createElement(kind === 'section' ? 'button' : 'div');
      contentEl.className = 'menu-order-card-content menu-display-order-name';
      if (kind === 'section') {
        contentEl.type = 'button';
        contentEl.setAttribute('aria-pressed', isSelected);
        contentEl.onclick = () => {
          displayOrderCategory = model;
          renderCategoriesManagerView();
          document.getElementById('menu-order-items-title')?.focus();
        };
      }

      const titleRow = document.createElement('div');
      titleRow.className = 'menu-order-card-title-row';
      const titleStrong = document.createElement('strong');
      titleStrong.className = 'menu-order-card-title';
      titleStrong.textContent = name;
      titleRow.appendChild(titleStrong);

      if (kind === 'section') {
        const tag = document.createElement('span');
        tag.className = 'menu-order-tag ' + (value.isOrderSection ? 'tag-order' : 'tag-catalog');
        tag.textContent = value.isOrderSection ? t('badgeScopeOrder') : t('badgeFoodItem');
        titleRow.appendChild(tag);
      }
      contentEl.appendChild(titleRow);

      const subRow = document.createElement('div');
      subRow.className = 'menu-order-card-sub';
      if (kind === 'section') {
        if (isSelected) {
          const selBadge = document.createElement('span');
          selBadge.className = 'badge-currently-selected';
          selBadge.textContent = t('badgeSelectedState');
          subRow.appendChild(selBadge);
        }
        const detail = document.createElement('span');
        detail.className = 'menu-order-card-detail';
        if (value.isOrderSection) {
          detail.textContent = t('customizationOptionsCount', { n: getMenuOrderGroups().length });
        } else {
          const count = (model.items || []).length;
          detail.textContent = t('categoryItemsCount', { n: count });
        }
        subRow.appendChild(detail);
      } else if (kind === 'group') {
        const reqText = value.required ? t('requiredOptionBadge') : t('optionalOptionBadge');
        const countText = (value.options || []).length + ' ' + t('optionsCountUnit');
        const detail = document.createElement('span');
        detail.className = 'menu-order-card-detail';
        detail.textContent = `${reqText} • ${countText}`;
        subRow.appendChild(detail);
      } else {
        const priceEl = document.createElement('span');
        priceEl.className = 'menu-order-item-price';
        priceEl.textContent = '$' + escapeHtml(value.price ?? '');
        subRow.appendChild(priceEl);
      }
      contentEl.appendChild(subRow);
      row.appendChild(contentEl);

      // Actions
      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'menu-order-card-actions';

      const move = target => {
        if (isMenuSaving || target < 0 || target >= values.length || target === index) return;
        const ordered = [...values];
        ordered.splice(target, 0, ordered.splice(index, 1)[0]);
        commit(ordered);
        markMenuDirty();
        renderCategoriesManagerView();
        const moved = document.getElementById('menu-order-panels')?.querySelectorAll(`[data-order-kind="${kind}"]`)[target];
        moved?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
        moved?.scrollIntoView?.({ block: 'nearest' });
      };

      [-1, 1].forEach(direction => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu-order-move';
        button.disabled = index + direction < 0 || index + direction >= values.length;
        button.setAttribute('aria-label', t(direction < 0 ? 'moveDisplayUp' : 'moveDisplayDown') + ': ' + name);
        button.setAttribute('data-order-delta', direction);
        button.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${direction < 0 ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}"/></svg>`;
        button.onclick = (e) => {
          e?.stopPropagation?.();
          move(index + direction);
        };
        actionsWrap.appendChild(button);
      });

      const dragHandle = document.createElement('div');
      dragHandle.className = 'menu-order-drag-handle';
      dragHandle.title = t('dragToReorder');
      dragHandle.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z"/></svg>`;
      actionsWrap.appendChild(dragHandle);

      row.appendChild(actionsWrap);

      row.ondragstart = event => {
        if (isMenuSaving) return event.preventDefault();
        dragged = index;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(index));
        row.classList.add('dragging');
      };
      row.ondragend = () => {
        dragged = null;
        row.classList.remove('dragging');
      };
      row.ondragover = event => {
        if (dragged !== null) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }
      };
      row.ondrop = event => {
        event.preventDefault();
        if (dragged === null || isMenuSaving) return;
        const source = list.querySelectorAll('[data-order-index]')[dragged];
        source?.moveTo(index);
      };
      row.moveTo = move;
      list.appendChild(row);
    });
  };

  rows(sectionsList, entries, 'section', commitSections);
  if (!entries.length) empty(sectionsList, 'menuSelectPrompt');

  const products = displayOrderCategory?.items || [];
  if (selected?.isOrderSection) {
    rows(itemsList, getMenuOrderGroups(), 'group', ordered => commitMenuDisplayRanks(ordered.map(model => ({ model, field: 'sortOrder' })), displayOrderGroupInitial));
    if (!getMenuOrderGroups().length) empty(itemsList, 'menuEmptyCategory');
  } else {
    rows(itemsList, products, 'item', ordered => { displayOrderCategory.items.splice(0, products.length, ...ordered); });
    if (!products.length) empty(itemsList, 'menuEmptyCategory');
  }

  [sectionsList, itemsList].forEach((list, i) => { list.scrollTop = positions[i] || 0; });
  document.getElementById('menu-order-items-title')?.setAttribute('tabindex', '-1');
  container.inert = isMenuSaving;
  updateMenuSaveState();
}

const collapsedMenuSections = {
  catalog: false,
  custom: false
};

function toggleMenuSectionCollapse(sectionKey) {
  if (collapsedMenuSections.hasOwnProperty(sectionKey)) {
    collapsedMenuSections[sectionKey] = !collapsedMenuSections[sectionKey];
    renderMenuCategories();
  }
}
window.toggleMenuSectionCollapse = toggleMenuSectionCollapse;

function isComboCategory(cat) {
  if (!cat) return false;
  if (cat.type !== 'catalog') return false;
  const slug = (cat.slug || '').toLowerCase();
  const title = (cat.title || '').toLowerCase();
  if (slug === 'combo' || slug === 'bundle' || slug.includes('combo') || slug.includes('bundle')) return true;
  if (title.includes('combo') || title.includes('set') || title.includes('套餐')) return true;
  if (Array.isArray(cat.items) && cat.items.length > 0 && cat.items.every(it => it.itemType === 'bundle' || (it.bundleRule && it.bundleRule.groups?.length > 0))) {
    return true;
  }
  return false;
}
window.isComboCategory = isComboCategory;

function isCustomizationCategory(cat) {
  if (!cat) return false;
  return cat.type === 'order_customization' || cat.id === 'sec-flavor' || cat.slug === 'sec-flavor' || cat.type === 'modifier';
}
window.isCustomizationCategory = isCustomizationCategory;

var menuSidebarTab = 'products';
try {
  const savedMenuSubtab = sessionStorage.getItem("pos_menu_subtab");
  if (savedMenuSubtab === "products" || savedMenuSubtab === "options") {
    menuSidebarTab = savedMenuSubtab;
  }
} catch (e) {}
let activeOptionGroupIndex = null;
const menuOptionSectionsOpen = { order: true, item: true };

function setMenuSidebarTab(tab) {
  if (tab !== 'products' && tab !== 'options') tab = 'products';
  if (!confirmLeaveMenu()) return;
  if (isMenuDirty) syncMenuDataFromDOM();
  menuSidebarTab = tab;
  try {
    sessionStorage.setItem("pos_menu_subtab", tab);
  } catch (e) {}

  // Update toggle buttons in DOM
  const btnProducts = document.getElementById("btn-seg-products");
  const btnOptions = document.getElementById("btn-seg-options");
  if (btnProducts) {
    btnProducts.classList.toggle("active", tab === 'products');
    btnProducts.setAttribute("aria-selected", tab === 'products');
  }
  if (btnOptions) {
    btnOptions.classList.toggle("active", tab === 'options');
    btnOptions.setAttribute("aria-selected", tab === 'options');
  }

  // Show/hide manage cats button in header
  const prodActions = document.getElementById("menu-sidebar-products-actions");
  if (prodActions) {
    prodActions.style.display = tab === 'products' ? 'block' : 'none';
  }

  isCategoryManagerOpen = false;
  isCustomGroupCreatorOpen = false;
  setMenuMobileView('master');

  if (currentMenuData && currentMenuData.length > 0) {
    if (tab === 'products') {
      const activeCat = currentMenuData[activeCategoryIndex];
      if (!activeCat || isCustomizationCategory(activeCat)) {
        const firstCatalogIdx = currentMenuData.findIndex(c => !isCustomizationCategory(c));
        activeCategoryIndex = firstCatalogIdx;
      }
    } else {
      // options tab
      const activeCat = currentMenuData[activeCategoryIndex];
      if (!activeCat || !isCustomizationCategory(activeCat)) {
        let flavorIdx = currentMenuData.findIndex(c => c.type === 'order_customization' || c.id === 'sec-flavor' || c.slug === 'sec-flavor');
        if (flavorIdx >= 0 && (!currentMenuData[flavorIdx].groups || currentMenuData[flavorIdx].groups.length === 0)) {
          const modIdx = currentMenuData.findIndex(c => c.type === 'modifier');
          if (modIdx >= 0) flavorIdx = modIdx;
        }
        if (flavorIdx < 0) {
          flavorIdx = currentMenuData.findIndex(c => isCustomizationCategory(c));
        }
        if (flavorIdx >= 0) {
          activeCategoryIndex = flavorIdx;
          activeOptionGroupIndex = 0;
        } else activeCategoryIndex = -1;
      }
    }
  }

  renderMenuCategories();
  renderMenuCategoryEditor(activeCategoryIndex);
}
window.setMenuSidebarTab = setMenuSidebarTab;

function handleCreateComboFromSidebar() {
  if (!confirmLeaveMenu()) return;
  if (!currentMenuData) currentMenuData = [];
  syncMenuDataFromDOM();

  menuSidebarTab = 'products';
  try { sessionStorage.setItem("pos_menu_subtab", 'products'); } catch (e) {}
  let comboCatIdx = currentMenuData.findIndex(c => isComboCategory(c));
  if (comboCatIdx < 0) {
    const comboCat = {
      id: `${(window.currentTenantId || 'cat')}_combo_${Date.now()}`,
      title: currentLang === 'vi' ? 'Combo & Set ưu đãi' : '特惠套餐',
      shortName: currentLang === 'vi' ? 'Combo' : '套餐',
      slug: 'combo',
      type: 'catalog',
      allowCustomization: false,
      appliedModifiers: [],
      items: []
    };
    currentMenuData.push(comboCat);
    markMenuDirty();
    comboCatIdx = currentMenuData.length - 1;
  }

  isCategoryManagerOpen = false;
  isCustomGroupCreatorOpen = false;
  setMenuMobileView('master');
  activeCategoryIndex = comboCatIdx;
  renderMenuCategories();
  renderMenuCategoryEditor(comboCatIdx);
  if (typeof openBundleWizard === 'function') {
    openBundleWizard(comboCatIdx);
  }
}
window.handleCreateComboFromSidebar = handleCreateComboFromSidebar;

function handleCreateCustomFromSidebar() {
  if (window.UnifiedMenu?.enabled) return window.UnifiedMenu.group();
  if (!confirmLeaveMenu()) return;
  if (!currentMenuData) currentMenuData = [];
  syncMenuDataFromDOM();

  menuSidebarTab = 'options';
  try { sessionStorage.setItem("pos_menu_subtab", 'options'); } catch (e) {}
  let flavorIdx = currentMenuData.findIndex(c => c.type === 'order_customization' || c.id === 'sec-flavor');
  if (flavorIdx < 0) {
    const newCat = {
      id: 'sec-flavor',
      title: currentLang === 'vi' ? 'Tùy chọn khẩu vị & biến thể' : '口味與客製化選擇',
      shortName: currentLang === 'vi' ? 'Khẩu vị' : '口味選擇',
      type: 'order_customization',
      allowCustomization: false,
      appliedModifiers: [],
      groups: [],
      items: []
    };
    currentMenuData.push(newCat);
    flavorIdx = currentMenuData.length - 1;
    markMenuDirty();
  }

  isCategoryManagerOpen = false;
  isCustomGroupCreatorOpen = true;
  newCustomGroupType = 'radio';
  newCustomGroupRequired = false;
  activeCategoryIndex = flavorIdx;
  renderMenuCategories();
  renderMenuCategoryEditor(flavorIdx);
  openNewCustomGroupCreator(flavorIdx);
}
window.handleCreateCustomFromSidebar = handleCreateCustomFromSidebar;

function renderMenuCategories() {
  updateMenuWorkspace();
  if (isCategoryManagerOpen) return renderCategoriesManagerView();
  const container = document.getElementById("menu-categories");
  if (!container) return;
  container.innerHTML = "";

  // Synchronize segmented toggle buttons & products actions
  const btnProducts = document.getElementById("btn-seg-products");
  const btnOptions = document.getElementById("btn-seg-options");
  if (btnProducts) {
    btnProducts.classList.toggle("active", menuSidebarTab === 'products');
    btnProducts.setAttribute("aria-selected", menuSidebarTab === 'products');
  }
  const tabs = document.getElementById("menu-mode-tabs");
  if (tabs && !tabs.menuKeyboardReady) {
    tabs.menuKeyboardReady = true;
    tabs.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "products" : event.key === "End" ? "options" : menuSidebarTab === "products" ? "options" : "products";
      setMenuSidebarTab(next);
      document.getElementById(menuSidebarTab === "products" ? "btn-seg-products" : "btn-seg-options")?.focus();
    });
  }
  if (btnProducts) btnProducts.tabIndex = menuSidebarTab === "products" ? 0 : -1;
  if (btnOptions) btnOptions.tabIndex = menuSidebarTab === "options" ? 0 : -1;
  if (btnOptions) {
    btnOptions.classList.toggle("active", menuSidebarTab === 'options');
    btnOptions.setAttribute("aria-selected", menuSidebarTab === 'options');
  }
  const prodActions = document.getElementById("menu-sidebar-products-actions");
  if (prodActions) {
    prodActions.style.display = menuSidebarTab === 'products' ? 'block' : 'none';
  }
  const btnManageCats = document.getElementById("btn-menu-manage-cats");
  if (btnManageCats) {
    btnManageCats.classList.toggle("active", Boolean(isCategoryManagerOpen));
  }

  if (window.UnifiedMenu?.sidebar()) return;
  if (!currentMenuData) return;

  const plusIcon = (typeof POS_SVG !== "undefined" && POS_SVG.plus) || `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

  if (menuSidebarTab === 'products') {
    // -------------------------------------------------------------
    // PRODUCTS MODE: List of catalog items, combos & category actions
    // -------------------------------------------------------------
    const catalogList = [];
    currentMenuData.forEach((cat, originalIndex) => {
      if (!isCustomizationCategory(cat)) {
        catalogList.push({ cat, originalIndex });
      }
    });
    catalogList.sort((a, b) => (Number(a.cat.sortOrder) || 0) - (Number(b.cat.sortOrder) || 0));

    let totalActiveItems = 0;
    catalogList.forEach(({ cat }) => {
      if (Array.isArray(cat.items)) {
        cat.items.forEach(item => {
          if (!item.isOos) totalActiveItems++;
        });
      }
    });
    const footerCats = document.getElementById('menu-sidebar-footer-cats');
    const footerItems = document.getElementById('menu-sidebar-footer-items');
    if (footerCats) footerCats.textContent = t('menuSidebarTotalCats', { count: catalogList.length });
    if (footerItems) footerItems.textContent = t('menuSidebarActiveItems', { count: totalActiveItems });

    if (typeof syncStoreStatusPlacement === 'function') {
      syncStoreStatusPlacement('menu');
    }

    const listEl = document.createElement("div");
    listEl.className = "menu-sidebar-section";

    const actionCatalog = document.createElement("button");
    actionCatalog.type = "button";
    actionCatalog.className = "menu-add-option-group-btn";
    actionCatalog.innerHTML = `${plusIcon}<span>${escapeHtml(t("btnAddCatalogCategory"))}</span>`;
    actionCatalog.onclick = () => openAddCategoryModal('catalog');
    listEl.appendChild(actionCatalog);

    catalogList.sort((a, b) => (Number(a.cat.sortOrder) || 0) - (Number(b.cat.sortOrder) || 0));
    catalogList.forEach(({ cat, originalIndex }) => {
      const div = document.createElement("button");
      div.type = 'button';
      div.className = `menu-option-card ${activeCategoryIndex === originalIndex && !isCategoryManagerOpen ? 'active' : ''}`;
      div.setAttribute('aria-pressed', activeCategoryIndex === originalIndex && !isCategoryManagerOpen ? 'true' : 'false');
      const itemCount = Array.isArray(cat.items) ? cat.items.length : 0;
      const isCombo = !window.UnifiedMenu?.enabled && isComboCategory(cat);
      const comboBadgeHtml = isCombo 
        ? `<span class="cat-type-badge cat-type-combo">${escapeHtml(t('bundleBadge'))}</span>`
        : '';
      div.innerHTML = `
        <div class="menu-option-card-content">
          <div class="menu-option-card-title">${escapeHtml(cat.title)}${comboBadgeHtml}</div>
          <div class="menu-option-card-subtitle">${itemCount} ${t("menuItemUnit")}</div>
        </div>
        <div class="menu-option-card-right">
          <span class="menu-option-card-badge">${itemCount}</span>
          <div class="menu-option-card-chevron" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </div>
        </div>
      `;

      div.onclick = () => {
        if (originalIndex !== activeCategoryIndex && !confirmLeaveMenu()) return;
        if (originalIndex === activeCategoryIndex && isMenuDirty) syncMenuDataFromDOM();
        isCategoryManagerOpen = false;
        isCustomGroupCreatorOpen = false;
        activeCategoryIndex = originalIndex;
        renderMenuCategories();
        renderMenuCategoryEditor(originalIndex);
        setMenuMobileView('detail');
      };
      listEl.appendChild(div);
    });

    container.appendChild(listEl);

  } else {
    // -------------------------------------------------------------
    // OPTIONS MODE: Foodpanda-style Option Groups list & Add Button
    // -------------------------------------------------------------
    const optionsContainer = document.createElement("div");
    optionsContainer.className = "menu-sidebar-section menu-sidebar-options-list";

    // Top Action: + Add option group
    const addGroupBtn = document.createElement("button");
    addGroupBtn.type = "button";
    addGroupBtn.className = "menu-add-option-group-btn";
    addGroupBtn.innerHTML = `${plusIcon}<span>${escapeHtml(t("btnAddOptionGroupTop") || t("btnCreateCustomGroup"))}</span>`;
    addGroupBtn.onclick = () => handleCreateCustomFromSidebar();
    optionsContainer.appendChild(addGroupBtn);

    const optionCards = [];
    currentMenuData.forEach((cat, catIndex) => {
      if (!isCustomizationCategory(cat)) return;
      if (Array.isArray(cat.groups) && cat.groups.length) {
        cat.groups.forEach((group, groupIndex) => optionCards.push({
          catIndex, groupIndex,
          scope: (group.scope || (cat.type === 'modifier' ? 'item' : 'order')) === 'order' ? 'order' : 'item',
          title: group.title || cat.title,
          count: (group.options || []).length
        }));
      } else if (cat.type === 'modifier') {
        optionCards.push({ catIndex, groupIndex: 0, scope: 'item', title: cat.title, count: (cat.items || []).length });
      }
    });

    ['order', 'item'].forEach(scope => {
      const cards = optionCards.filter(card => card.scope === scope);
      const section = document.createElement('details');
      section.className = 'menu-option-section';
      section.open = menuOptionSectionsOpen[scope];
      section.ontoggle = () => { menuOptionSectionsOpen[scope] = section.open; };
      const heading = document.createElement('summary');
      heading.className = 'menu-option-section-heading';
      heading.innerHTML = `<span>${escapeHtml(t(scope === 'order' ? 'optionSectionOrder' : 'optionSectionItem'))}</span>
        <span class="menu-option-section-count">${cards.length}</span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
      section.appendChild(heading);
      const cardList = document.createElement("div");
      cardList.className = "menu-option-section-cards";
      section.appendChild(cardList);
      if (!cards.length) {
        const empty = document.createElement('p');
        empty.className = 'menu-section-empty-hint';
        empty.textContent = t('optionSectionEmpty');
        cardList.appendChild(empty);
      }
      cards.forEach(card => {
        const isActive = activeCategoryIndex === card.catIndex &&
          (activeOptionGroupIndex === card.groupIndex || (activeOptionGroupIndex === null && card.groupIndex === 0));
        const cardEl = document.createElement('button');
        cardEl.type = 'button';
        cardEl.className = `menu-option-card ${isActive ? 'active' : ''}`;
        if (isActive) cardEl.setAttribute('aria-current', 'true');
        cardEl.innerHTML = `<span class="menu-option-card-content">
          <span class="menu-option-card-title">${escapeHtml(card.title)}</span>
          <span class="menu-option-card-subtitle">${card.count} ${escapeHtml(t('optionsCountUnit'))}</span>
        </span><span class="menu-option-card-right">
          <span class="menu-option-card-badge">${card.count}</span>
          <span class="menu-option-card-chevron" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </span>
        </span>`;
        cardEl.onclick = () => {
          if (activeCategoryIndex !== card.catIndex && !confirmLeaveMenu()) return;
          if (activeCategoryIndex === card.catIndex && isMenuDirty) syncMenuDataFromDOM();
          isCategoryManagerOpen = false;
          isCustomGroupCreatorOpen = false;
          activeCategoryIndex = card.catIndex;
          activeOptionGroupIndex = card.groupIndex;
          renderMenuCategories();
          renderMenuCategoryEditor(card.catIndex);
          setMenuMobileView('detail');
          document.querySelector('.menu-sidebar-options-list .menu-option-card.active')?.focus({ preventScroll: true });
          const target = document.querySelector(`.cust-group-card[data-cust-group-index="${card.groupIndex}"]`);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        cardList.appendChild(cardEl);
      });
      optionsContainer.appendChild(section);
    });

    const footerCats = document.getElementById('menu-sidebar-footer-cats');
    const footerItems = document.getElementById('menu-sidebar-footer-items');
    if (footerCats) footerCats.textContent = t('menuSidebarTotalCats', { count: optionCards.length });
    if (footerItems) footerItems.textContent = '';

    container.appendChild(optionsContainer);
  }

  // Mobile portrait: auto-center active category pill in horizontal strip
  if (typeof container.querySelector === "function") {
    const activePill = container.querySelector(".menu-option-card.active");
    if (activePill && typeof activePill.scrollIntoView === "function" && container.scrollWidth > container.clientWidth) {
      activePill.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }
}


function getItemImageUrl(catId, itemName) {
  if (!itemName) return null;
  const list = window._tenantImageList;
  const canonicalProduct = window.UnifiedMenu?.imageKey?.(catId,itemName);
  const tenantId = (typeof getTenantIdFromUrl === 'function' ? getTenantIdFromUrl() : null) || 'benmi';
  if (canonicalProduct && (!list || list.has(canonicalProduct))) {
    return `${WORKER_BASE}/api/image?tenant_id=${encodeURIComponent(tenantId)}&name=${encodeURIComponent(canonicalProduct)}`;
  }
  const key = `${catId}_${itemName}`;
  if (list && (list.has(key) || list.has(itemName))) {
    const resolvedName = list.has(key) ? key : itemName;
    return `${WORKER_BASE}/api/image?tenant_id=${encodeURIComponent(tenantId)}&name=${encodeURIComponent(resolvedName)}`;
  }
  return null;
}

function isModifierAppliedToCategory(mod, cat) {
  if (!mod || !cat) return false;
  if (mod.type === 'customization' && mod.group) {
    const applied = mod.group.appliedCategories || [];
    return applied.includes(cat.id) || (cat.databaseId && applied.includes(cat.databaseId));
  }
  const appliedMods = cat.appliedModifiers || (cat.allowCustomization === false ? [] : ['*']);
  return appliedMods.includes('*') || appliedMods.includes(mod.id) || (mod.databaseId && appliedMods.includes(mod.databaseId));
}

function getStoreModifiersList() {
  if (!currentMenuData) return [];
  const list = [];
  currentMenuData.forEach((c, cIdx) => {
    if (c.type === 'modifier') {
      const optCount = Array.isArray(c.items) ? c.items.length : (c.groups?.[0]?.options?.length || 0);
      list.push({ id: c.id, databaseId: c.databaseId, title: c.title, type: 'modifier', count: optCount, categoryIndex: cIdx });
    } else if (c.type === 'order_customization' || c.id === 'sec-flavor') {
      (c.groups || []).forEach((g, gIdx) => {
        const optCount = Array.isArray(g.options) ? g.options.length : 0;
        list.push({
          id: g.id || g.key,
          key: g.key,
          title: g.title || g.name || '',
          type: 'customization',
          group: g,
          count: optCount,
          categoryIndex: cIdx,
          groupIndex: gIdx
        });
      });
    }
  });
  return list;
}

// --- Category Modifiers Collapse State & Helpers ---
window._collapsedCategoryMods = window._collapsedCategoryMods || new Set();
window._initializedCategoryMods = window._initializedCategoryMods || new Set();

function toggleCategoryModifiersCollapse(cIdx) {
  const cat = currentMenuData && currentMenuData[cIdx];
  const catKey = cat ? (cat.id || String(cIdx)) : String(cIdx);
  if (window._collapsedCategoryMods.has(catKey)) {
    window._collapsedCategoryMods.delete(catKey);
  } else {
    window._collapsedCategoryMods.add(catKey);
  }
  renderMenuCategoryEditor(cIdx);
}
window.toggleCategoryModifiersCollapse = toggleCategoryModifiersCollapse;

function toggleCategoryModifierSelectAll(cIdx) {
  const cat = currentMenuData && currentMenuData[cIdx];
  if (!cat) return;
  const storeModifiers = getStoreModifiersList();
  const appliedCount = storeModifiers.filter(mod => isModifierAppliedToCategory(mod, cat)).length;
  const selectAll = appliedCount < storeModifiers.length;
  selectAllCategoryModifiers(cIdx, selectAll);
}
window.toggleCategoryModifierSelectAll = toggleCategoryModifierSelectAll;

// --- Direct Drag-and-Drop & 1-Click Item Image Upload ---
var _currentDirectUploadTarget = null;

function handleItemThumbClick(cIdx, iIdx, event) {
  if (event) event.stopPropagation();
  const cat = currentMenuData && currentMenuData[cIdx];
  const item = cat && cat.items && cat.items[iIdx];
  if (!item) return;

  const imgUrl = getItemImageUrl(cat.id, item.name);
  if (imgUrl) {
    openItemDetailModal(cIdx, iIdx);
  } else {
    _currentDirectUploadTarget = { cIdx, iIdx };
    let fileInput = document.getElementById("direct-item-image-input");
    if (!fileInput) {
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.id = "direct-item-image-input";
      fileInput.accept = "image/*";
      fileInput.style.display = "none";
      fileInput.onchange = handleItemThumbFileSelect;
      document.body.appendChild(fileInput);
    }
    fileInput.value = "";
    fileInput.click();
  }
}
window.handleItemThumbClick = handleItemThumbClick;

function handleItemThumbFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file || !_currentDirectUploadTarget) return;
  const { cIdx, iIdx } = _currentDirectUploadTarget;
  const thumbBox = document.querySelector(`.menu-item-thumb-box[data-item-thumb-idx="${iIdx}"]`);
  uploadDirectItemImage(file, cIdx, iIdx, thumbBox);
}
window.handleItemThumbFileSelect = handleItemThumbFileSelect;

function handleItemThumbDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.add("drag-over");
}
window.handleItemThumbDragOver = handleItemThumbDragOver;

function handleItemThumbDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove("drag-over");
}
window.handleItemThumbDragLeave = handleItemThumbDragLeave;

function handleItemThumbDrop(e, cIdx, iIdx) {
  e.preventDefault();
  e.stopPropagation();
  const thumbBox = e.currentTarget;
  thumbBox.classList.remove("drag-over");
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  uploadDirectItemImage(file, cIdx, iIdx, thumbBox);
}
window.handleItemThumbDrop = handleItemThumbDrop;

async function uploadDirectItemImage(file, cIdx, iIdx, thumbBoxEl) {
  if (!file.type || !file.type.startsWith("image/")) {
    alert(t("imageUploadFail") || "Chỉ hỗ trợ file hình ảnh!");
    return;
  }
  const cat = currentMenuData && currentMenuData[cIdx];
  const item = cat && cat.items && cat.items[iIdx];
  if (!item) return;

  const originalHtml = thumbBoxEl ? thumbBoxEl.innerHTML : "";
  if (thumbBoxEl) {
    thumbBoxEl.innerHTML = `<div class="thumb-loading-spin"></div>`;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const maxDim = 600;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUri = canvas.toDataURL("image/webp", 0.85);

        const tenantId = (typeof getTenantIdFromUrl === "function" ? getTenantIdFromUrl() : null) || "benmi";
        const imageName = `${cat.id}_${item.name}`;

        const res = await fetch(`${WORKER_BASE}/api/image?tenant_id=${encodeURIComponent(tenantId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: imageName, dataUri })
        });
        if (!res.ok) throw new Error("Upload failed");

        if (!window._tenantImageList) window._tenantImageList = new Set();
        window._tenantImageList.add(imageName);
        window._tenantImageList.add(item.name);

        if (thumbBoxEl) {
          thumbBoxEl.innerHTML = `<img src="${dataUri}" alt="${escapeHtml(item.name)}" class="menu-item-thumb-img">`;
          thumbBoxEl.classList.add("has-image");
        }
        markMenuDirty();
      } catch (err) {
        console.error("Direct image upload failed:", err);
        if (thumbBoxEl) thumbBoxEl.innerHTML = originalHtml;
        alert((t("imageUploadFail") || "Tải ảnh thất bại: ") + (err.message || err));
      }
    };
    img.onerror = () => {
      if (thumbBoxEl) thumbBoxEl.innerHTML = originalHtml;
      alert(t("imageLoadFail") || "Không thể đọc file ảnh!");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
window.uploadDirectItemImage = uploadDirectItemImage;

// --- Item Action Menu (⋯) Dropdown & Duplicate ---
function closeAllItemActionMenus() {
  document.querySelectorAll(".menu-item-dropdown-menu").forEach(el => el.remove());
}
window.closeAllItemActionMenus = closeAllItemActionMenus;

function duplicateMenuItemAt(cIdx, iIdx) {
  if (!currentMenuData || !currentMenuData[cIdx] || !currentMenuData[cIdx].items[iIdx]) return;
  syncMenuDataFromDOM();
  const original = currentMenuData[cIdx].items[iIdx];
  const copySuffix = t("duplicateSuffix") || (currentLang === "vi" ? "Bản sao" : "副本");
  const clone = JSON.parse(JSON.stringify(original));
  clone.name = `${original.name} (${copySuffix})`;
  if (clone.id) clone.id = `${original.id}_copy_${Date.now()}`;
  currentMenuData[cIdx].items.splice(iIdx + 1, 0, clone);
  markMenuDirty();
  renderMenuCategoryEditor(cIdx);
  if (typeof renderMenuCategories === "function") renderMenuCategories();
}
window.duplicateMenuItemAt = duplicateMenuItemAt;

function openMenuItemFromCard(event, cIdx, iIdx) {
  if (event.defaultPrevented || event.currentTarget.classList.contains("dragging")) return;
  if (event.type === "keydown") {
    if (event.target !== event.currentTarget || event.repeat || event.isComposing || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
  } else if (event.target.closest('button,input,select,textarea,a,label,summary,[contenteditable],.menu-item-drag-handle')) {
    return;
  }
  openItemDetailModal(cIdx, iIdx);
}

let menuItemFilterQuery = '';
let menuItemFilterStatus = 'all';

function handleMenuItemsSearch(query) {
  menuItemFilterQuery = (query || '').toLowerCase().trim();
  applyMenuItemFilters();
}
window.handleMenuItemsSearch = handleMenuItemsSearch;

function setMenuItemFilter(status) {
  menuItemFilterStatus = status;
  document.querySelectorAll('.menu-filter-pill').forEach(btn => {
    const isAct = btn.getAttribute('data-filter') === status;
    btn.classList.toggle('active', isAct);
  });
  applyMenuItemFilters();
}
window.setMenuItemFilter = setMenuItemFilter;

function applyMenuItemFilters() {
  const rows = document.querySelectorAll('#menu-editor-body .menu-catalog-row');
  let visibleCount = 0;
  rows.forEach(row => {
    const nameInput = row.querySelector('.menu-item-name-input');
    const name = (nameInput ? nameInput.value : '').toLowerCase();
    const isOos = row.querySelector('.menu-item-stock-toggle')?.classList.contains('is-oos');
    const matchesSearch = !menuItemFilterQuery || name.includes(menuItemFilterQuery);
    let matchesStatus = true;
    if (menuItemFilterStatus === 'instock') matchesStatus = !isOos;
    else if (menuItemFilterStatus === 'oos') matchesStatus = Boolean(isOos);

    if (matchesSearch && matchesStatus) {
      row.style.display = '';
      visibleCount++;
    } else {
      row.style.display = 'none';
    }
  });

  const cat = currentMenuData && currentMenuData[activeCategoryIndex];
  const showingEl = document.getElementById('menu-footer-showing-count');
  if (showingEl && cat && Array.isArray(cat.items)) {
    showingEl.textContent = t('menuFooterShowing', { cat: cat.title, showing: visibleCount, total: cat.items.length });
  }
}
window.applyMenuItemFilters = applyMenuItemFilters;

function renderMenuCategoryEditor(index) {
  if (isCategoryManagerOpen) return renderCategoriesManagerView();
  if (window.UnifiedMenu?.workspace()) return;
  isCategoryManagerOpen = false;
  updateMenuWorkspace();
  const renameBtn = document.getElementById("btn-category-rename");
  const deleteBtn = document.getElementById("btn-category-delete");
  const createBtn = document.getElementById("btn-menu-create-unified");
  const createBtnText = document.getElementById("i18n-btn-create-unified-text");
  const addCatTopBtn = document.getElementById("btn-menu-add-cat-top");
  const closeBtn = document.getElementById("btn-menu-manage-close");
  const subEl = document.getElementById("i18n-menu-edit-sub");

  if (addCatTopBtn) addCatTopBtn.style.display = "none";
  if (closeBtn) closeBtn.style.display = "none";
  if (subEl) subEl.innerText = t("menuEditSub");

  if (!currentMenuData || !currentMenuData[index]) {
    if (renameBtn) { renameBtn.style.display = "none"; renameBtn.hidden = true; }
    if (deleteBtn) { deleteBtn.style.display = "none"; deleteBtn.hidden = true; }
    if (createBtn) { createBtn.style.display = "none"; createBtn.hidden = true; }
    const catActions = document.getElementById("cat-title-actions");
    if (catActions) { catActions.style.display = "none"; catActions.hidden = true; }
    const tb = document.getElementById('menu-editor-toolbar');
    if (tb) tb.style.display = 'none';
    const ft = document.getElementById('menu-editor-footer');
    if (ft) ft.style.display = 'none';
    const body = document.getElementById('menu-editor-body');
    if (body) {
      body.classList.remove('is-catalog');
      body.textContent = t(menuSidebarTab === 'options' ? 'optionSectionEmpty' : 'menuSelectPrompt');
    }
    const title = document.getElementById('menu-editor-title');
    if (title) title.textContent = t(menuSidebarTab === 'options' ? 'segOptions' : 'segProducts');
    return;
  }

  const cat = currentMenuData[index];
  const isCustom = isCustomizationCategory(cat);
  const isCombo = !window.UnifiedMenu?.enabled && isComboCategory(cat);

  if (isCustom) {
    if (renameBtn) { renameBtn.style.display = "none"; renameBtn.hidden = true; }
    if (deleteBtn) {
      deleteBtn.style.display = "inline-flex";
      deleteBtn.hidden = false;
      deleteBtn.onclick = () => deleteCategoryAtIndex(index);
    }
    if (createBtn) {
      createBtn.style.display = "none";
      createBtn.hidden = true;
    }
    const catActions = document.getElementById("cat-title-actions");
    if (catActions) {
      catActions.style.display = "";
      catActions.hidden = false;
    }
    const tb = document.getElementById('menu-editor-toolbar');
    if (tb) tb.style.display = 'none';
    const ft = document.getElementById('menu-editor-footer');
    if (ft) ft.style.display = 'none';
    renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), cat, index);
    return;
  }

  if (createBtn) {
    createBtn.style.display = "inline-flex";
    createBtn.hidden = false;
    if (createBtnText) createBtnText.textContent = t(isCombo ? 'menuAddBundle' : 'menuAddItem');
    createBtn.title = t(isCombo ? 'menuAddBundle' : 'menuAddItem');
  }

  if (renameBtn) { renameBtn.style.display = "inline-flex"; renameBtn.hidden = false; }
  if (deleteBtn) { deleteBtn.style.display = "inline-flex"; deleteBtn.hidden = false; }
  const catActions = document.getElementById("cat-title-actions");
  if (catActions) { catActions.style.display = ""; catActions.hidden = false; }

  const titleEl = document.getElementById("menu-editor-title");
  if (titleEl) titleEl.innerText = `${cat.title} ${t("menuItemTotalCount", { count: cat.items.length })}`;

  const tb = document.getElementById('menu-editor-toolbar');
  if (tb) tb.style.display = 'flex';
  const ft = document.getElementById('menu-editor-footer');
  if (ft) ft.style.display = 'flex';

  const filterCountAll = document.getElementById('filter-count-all');
  const filterCountInStock = document.getElementById('filter-count-instock');
  const filterCountOos = document.getElementById('filter-count-oos');
  if (filterCountAll) filterCountAll.textContent = cat.items.length;
  if (filterCountInStock) filterCountInStock.textContent = cat.items.filter(i => !i.isOos).length;
  if (filterCountOos) filterCountOos.textContent = cat.items.filter(i => i.isOos).length;

  const container = document.getElementById("menu-editor-body");
  if (!container) return;
  container.innerHTML = "";
  container.classList.add('is-catalog');
  const catalogCard = document.createElement("div");
  catalogCard.className = "menu-products-card";
  container.appendChild(catalogCard);

  const storeModifiers = cat.type === 'catalog' ? getStoreModifiersList() : [];
  const appliedCount = cat.type === 'catalog' ? storeModifiers.filter(mod => isModifierAppliedToCategory(mod, cat)).length : 0;

  if (cat.type === 'catalog' && !window.UnifiedMenu?.enabled) {
    const modCard = document.createElement("div");
    modCard.className = "cust-category-modifiers-card";
    const catKey = cat.id || String(index);
    if (!window._initializedCategoryMods.has(catKey)) {
      window._initializedCategoryMods.add(catKey);
      window._collapsedCategoryMods.add(catKey);
    }
    const isCollapsed = Boolean(window._collapsedCategoryMods && window._collapsedCategoryMods.has(catKey));
    if (isCollapsed) {
      modCard.classList.add("is-collapsed");
    }

    if (storeModifiers.length === 0) {
      modCard.innerHTML = `
        <div class="cust-modifiers-empty-state">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line>
              <line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line>
              <line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>
            </svg>
          </div>
          <div class="empty-state-title">${escapeHtml(t("modifiersEmptyTitle"))}</div>
          <div class="empty-state-desc">${escapeHtml(t("modifiersEmptyDesc"))}</div>
          <button type="button" class="empty-state-cta-btn" onclick="handleCreateCustomFromSidebar()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>${escapeHtml(t("btnCreateModifierGroup"))}</span>
          </button>
        </div>
      `;
    } else {
      let chipsHtml = '';
      storeModifiers.forEach(mod => {
        const isModSelected = isModifierAppliedToCategory(mod, cat);
        const safeModId = escapeHtml(mod.id);
        const countText = mod.count ? ` (${mod.count})` : '';
        chipsHtml += `
          <label class="cust-mod-chip ${isModSelected ? 'selected' : ''}">
            <input type="checkbox" ${isModSelected ? 'checked' : ''} onchange="toggleCategoryModifierItem(${index}, '${safeModId.replace(/'/g, "\\'")}', this.checked)">
            <span>${escapeHtml(mod.title)}${countText}</span>
          </label>
        `;
      });

      modCard.innerHTML = `
        <div class="cust-category-modifiers-header">
          <div class="cust-category-modifiers-title-group">
            <div class="cust-category-modifiers-title">
              <span>${escapeHtml(t("appliedModifiersTitle"))}</span>
              <span class="mod-count-badge">${appliedCount}/${storeModifiers.length}</span>
            </div>
            <div class="cust-category-modifiers-desc">${escapeHtml(t("appliedModifiersCardDesc"))}</div>
          </div>
          <div class="cust-category-modifiers-actions">
            <button type="button" class="btn-select-toggle" onclick="toggleCategoryModifierSelectAll(${index})">
              ${appliedCount === storeModifiers.length ? escapeHtml(t("btnUnselectAll")) : escapeHtml(t("btnSelectAll"))}
            </button>
            <button type="button" class="btn-add-mod-cta" onclick="handleCreateCustomFromSidebar()" title="${escapeHtml(t("btnAddOptionGroupTop"))}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>${escapeHtml(t("btnAddOptionGroupTop"))}</span>
            </button>
            <button type="button" class="btn-select-toggle" onclick="toggleCategoryModifiersCollapse(${index})" title="${isCollapsed ? escapeHtml(t("toggleModifiersExpand")) : escapeHtml(t("toggleModifiersCollapse"))}" style="display:inline-flex;align-items:center;gap:4px;">
              <span>${isCollapsed ? escapeHtml(t("toggleModifiersExpand")) : escapeHtml(t("toggleModifiersCollapse"))}</span>
              <svg class="collapse-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform:${isCollapsed ? 'rotate(-90deg)' : 'rotate(0)'};transition:transform 0.2s ease;"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
          </div>
        </div>
        <div class="cust-category-modifiers-grid">
          ${chipsHtml}
        </div>
      `;
    }
    catalogCard.appendChild(modCard);
  }

  const itemsContainer = document.createElement("div");
  itemsContainer.className = "menu-catalog-items-container";

  const cameraSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
  cat.items.forEach((item, iIdx) => {
    const row = document.createElement("div");
    row.className = "menu-item-row-card menu-catalog-row";
    row.id = `menu-item-card-${index}-${iIdx}`;
    row.setAttribute("data-item-index", iIdx);
    row.setAttribute("tabindex", "0");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", `${t("itemDetailTitle")}: ${item.name}`);
    row.setAttribute("aria-keyshortcuts", "Enter Space");
    row.addEventListener("click", (event) => openMenuItemFromCard(event, index, iIdx));
    row.addEventListener("keydown", (event) => openMenuItemFromCard(event, index, iIdx));

    const oosText = item.isOos ? t("stockStatusOutOfStock") : t("stockStatusInStock");
    const hasBundle = !window.UnifiedMenu?.enabled && (item.itemType === 'bundle' || Boolean(item.bundleRule && Array.isArray(item.bundleRule.groups) && item.bundleRule.groups.length > 0));

    if (cat.type === 'catalog' && hasBundle) {
      row.classList.add("is-bundle-row");
      const bundleCount = item.bundleRule?.groups?.length || 0;
      const bundleTooltip = currentLang === 'vi'
        ? `${t("bundleBadge")} (${bundleCount} ${t("bundleGroupUnit")})`
        : `${t("bundleBadge")} (${bundleCount}${t("bundleGroupUnit")})`;
      row.setAttribute("title", bundleTooltip);
    }

    const imgUrl = getItemImageUrl(cat.id, item.name);
    const thumbHtml = imgUrl
      ? `<img src="${imgUrl}" alt="${escapeHtml(item.name)}" class="menu-item-thumb-img"><div class="thumb-hover-overlay">${cameraSvg}</div>`
      : `<div class="menu-item-thumb-placeholder">${cameraSvg}<span class="thumb-upload-text">${escapeHtml(t('menuUploadImage'))}</span></div>`;

    const thumbTooltip = escapeHtml(t("tooltipDropToUpload") || (currentLang === 'vi' ? 'Thả ảnh vào đây hoặc bấm để tải lên' : '放開以立即上傳餐點圖片'));

    let badgesHtml = '';
    if (hasBundle) {
      badgesHtml += `<span class="menu-combo-badge">${escapeHtml(t('bundleBadge'))}</span>`;
    }
    if (item.badgeText && String(item.badgeText).trim() !== '') {
      badgesHtml += `<span class="menu-item-quick-badge">${escapeHtml(String(item.badgeText).trim())}</span>`;
    }

    const itemModCount = window.UnifiedMenu?.enabled ? window.UnifiedMenu.groupCount(item.id) : (Array.isArray(item.modifierGroups) ? item.modifierGroups.length : 0);
    if (itemModCount > 0) {
      badgesHtml += `<span class="item-mod-pill custom-mods" title="${itemModCount} ${escapeHtml(t('customItemModifiers'))}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>${itemModCount} ${escapeHtml(t('customItemModifiers'))}</span>
      </span>`;
    } else if (cat.type === 'catalog' && appliedCount > 0) {
      badgesHtml += `<span class="item-mod-pill inherited-mods" title="${appliedCount} ${escapeHtml(t('inheritedCatModifiers'))}">
        <span>${appliedCount} ${escapeHtml(t('inheritedCatModifiers'))}</span>
      </span>`;
    } else {
      badgesHtml += `<span class="item-mod-pill empty-mods">
        <span>${escapeHtml(t('noModifiersApplied'))}</span>
      </span>`;
    }

    row.innerHTML = `
      <div class="menu-item-row-left">
        <span class="menu-item-drag-handle" title="${escapeHtml(t('menuDragSort'))}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="8" x2="20" y2="8"></line><line x1="4" y1="16" x2="20" y2="16"></line>
          </svg>
        </span>
        <button type="button" class="menu-item-thumb-box ${imgUrl ? 'has-image' : ''}" data-item-thumb-idx="${iIdx}"
          onclick="handleItemThumbClick(${index}, ${iIdx}, event)"
          ondragover="handleItemThumbDragOver(event)"
          ondragleave="handleItemThumbDragLeave(event)"
          ondrop="handleItemThumbDrop(event, ${index}, ${iIdx})"
          title="${thumbTooltip}" aria-label="${escapeHtml(t('btnItemImage') + ': ' + item.name)}">
          ${thumbHtml}
        </button>
        <div class="menu-item-details-col">
          <div class="menu-item-name-col">
            <input type="text" class="menu-item-name-input" value="${escapeHtml(item.name)}" data-name-cidx="${index}" data-name-iidx="${iIdx}" oninput="markMenuDirty()"
              placeholder="${t("newItemPlaceholder")}" aria-label="${escapeHtml(t('colItemName'))}">
          </div>
          <div class="menu-item-meta-col">
            ${badgesHtml}
            <button type="button" id="menu-item-options-${index}-${iIdx}" class="menu-item-options-btn" onclick="openItemModifiersModal(${index}, ${iIdx})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path>
              </svg>
              <span>${escapeHtml(t('btnItemModifiersShort') || t('btnItemModifiers'))}</span>
              ${itemModCount > 0 ? `<span class="opt-count-pill">${itemModCount}</span>` : ''}
            </button>
            ${hasBundle && !window.UnifiedMenu?.enabled ? `<button type="button" class="menu-item-options-btn" onclick="openBundleEditorModal(${index}, ${iIdx})">${escapeHtml(t('menuBundleSettings'))}</button>` : ''}
          </div>
        </div>
      </div>
      <div class="menu-item-row-right">
        <div class="menu-item-price-block">
          <span class="menu-item-price-label">${escapeHtml(t('menuPriceLabel'))}</span>
          <div class="menu-item-price-wrapper">
            <span class="price-currency">$</span>
            <input type="number" class="menu-item-price-input" value="${item.price !== null && item.price !== undefined ? item.price : ''}" data-cidx="${index}" data-iidx="${iIdx}" oninput="markMenuDirty()"
              placeholder="${t("priceHiddenPlaceholder")}" aria-label="${escapeHtml(t('colPrice') + ': ' + item.name)}">
          </div>
        </div>
        <div class="menu-item-status-block">
          <button type="button" class="menu-item-stock-toggle ${item.isOos ? 'is-oos' : 'is-instock'}"
            onclick="openStockModal(${index}, ${iIdx})" title="${oosText}" aria-label="${escapeHtml(item.name + ': ' + oosText)}">
            <span class="stock-toggle-dot"></span>
            <span>${oosText}</span>
          </button>
          <span class="stock-toggle-sub">${item.isOos ? escapeHtml(t('menuPausedStatus')) : escapeHtml(t('menuServingStatus'))}</span>
        </div>
        <div class="menu-item-quick-actions">
          <button type="button" class="menu-item-action-icon-btn" onclick="openItemDetailModal(${index}, ${iIdx})" title="${escapeHtml(t('itemDetailTitle'))}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
          </button>
          <button type="button" class="menu-item-action-icon-btn delete-btn" onclick="removeMenuItemAt(${index}, ${iIdx})" title="${escapeHtml(t('btnItemDelete'))}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
    const thumbImage = row.querySelector('.menu-item-thumb-img');
    thumbImage?.addEventListener('error', () => {
      const imageName = new URL(imgUrl, window.location.href).searchParams.get('name');
      if (imageName) window._tenantImageList?.delete(imageName);
      const thumbBox = row.querySelector('.menu-item-thumb-box');
      if (!thumbBox) return;
      thumbBox.classList.remove('has-image');
      thumbBox.innerHTML = `<div class="menu-item-thumb-placeholder">${cameraSvg}<span class="thumb-upload-text">${escapeHtml(t('menuUploadImage'))}</span></div>`;
    });
    itemsContainer.appendChild(row);
  });
  catalogCard.appendChild(itemsContainer);
  if (!cat.items.length) {
    const empty = document.createElement('div');
    empty.className = 'menu-category-empty';
    empty.innerHTML = `<p>${escapeHtml(t('menuEmptyCategory'))}</p>`;
    catalogCard.appendChild(empty);
  }
  applyMenuItemFilters();
}

function getModifierCategorySelectionState(group, category) {
  const itemIds = (category.items || []).map(item => String(item.id || `${category.id}:${item.name}`));
  const selectedCount = itemIds.filter(id => (group.appliedItems || []).includes(id)).length;
  const categorySelected = (group.appliedCategories || []).includes(category.id);
  const checked = categorySelected || (itemIds.length > 0 && selectedCount === itemIds.length);
  return {
    checked,
    indeterminate: !categorySelected && selectedCount > 0 && selectedCount < itemIds.length
  };
}

function syncCategoryCheckboxIndeterminateState(container) {
  container.querySelectorAll('input[data-category-checkbox="true"]').forEach(input => {
    input.indeterminate = input.getAttribute('aria-checked') === 'mixed';
  });
}

function renderOrderCustomizationEditor(container, cat, cIdx) {
  if (!container) return;
  container.classList.remove('is-catalog');
  container.innerHTML = "";

  if (cat.type === 'modifier' && (!cat.groups || cat.groups.length === 0)) {
    const linkedCatIds = [];
    const catalogCats = (currentMenuData || []).filter(c => !isCustomizationCategory(c));
    catalogCats.forEach(c => {
      if (Array.isArray(c.appliedModifiers) && (c.appliedModifiers.includes('*') || c.appliedModifiers.includes(cat.id) || c.appliedModifiers.includes(cat.databaseId))) {
        linkedCatIds.push(c.id);
      }
    });
    cat.groups = [{
      id: cat.databaseId || cat.id,
      key: cat.id,
      title: cat.title,
      type: 'checkbox',
      isRequired: false,
      scope: linkedCatIds.length > 0 ? 'category' : 'item',
      appliedCategories: linkedCatIds,
      sortOrder: 0,
      options: (cat.items || []).map(it => ({
        id: it.id || it.name,
        name: it.name,
        price: it.price !== null && it.price !== undefined ? it.price : 0,
        isOos: Boolean(it.isOos),
        sub_options: [],
        originalName: it.name
      }))
    }];
  }

  const titleEl = document.getElementById("menu-editor-title");
  if (titleEl) {
    const totalOptions = cat.groups ? cat.groups.reduce((acc, g) => acc + (g.options ? g.options.length : 0), 0) : 0;
    const selectedGroup = activeOptionGroupIndex !== null ? cat.groups?.[activeOptionGroupIndex] : null;
    titleEl.innerText = `${selectedGroup?.title || cat.title} ${t("menuItemTotalCount", { count: selectedGroup ? selectedGroup.options.length : totalOptions })}`;
  }

  const banner = document.createElement("div");
  banner.className = "cust-header-banner";
  banner.innerHTML = `
    <div class="cust-title">${t("customizationManageTitle")}</div>
    <div class="cust-desc">${t("customizationManageDesc")}</div>
  `;
  container.appendChild(banner);

  const catalogCategories = (currentMenuData || []).filter(c => !isCustomizationCategory(c));

  if (!cat.groups || cat.groups.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.style.textAlign = "center";
    emptyDiv.style.padding = "24px";
    emptyDiv.style.color = "#94a3b8";
    emptyDiv.innerText = t("noCategoriesPrompt") || "尚無任何客製化設定";
    container.appendChild(emptyDiv);
  } else {
    cat.groups.forEach((grp, gIdx) => {
      if (activeOptionGroupIndex !== null && cat.groups[activeOptionGroupIndex] && gIdx !== activeOptionGroupIndex) return;
      const card = document.createElement("div");
      card.className = "cust-group-card";
      card.setAttribute("data-cust-group-index", gIdx);

      const typeBadge = grp.type === 'checkbox'
        ? `<span style="font-size: var(--pos-text-meta); padding: 3px 8px; background: #e0e7ff; color: #4338ca; border-radius: 6px; font-weight: 800;">${currentLang === 'vi' ? 'Chọn nhiều' : '多選'}</span>`
        : `<span style="font-size: var(--pos-text-meta); padding: 3px 8px; background: #ecfdf5; color: #047857; border-radius: 6px; font-weight: 800;">${currentLang === 'vi' ? 'Chọn 1' : '單選'}</span>`;

      const requiredBadge = `
        <span class="mod-badge-interactive ${grp.isRequired ? 'is-required' : 'is-optional'}">
          <span class="mod-badge-dot"></span>
          <span>${grp.isRequired ? t("badgeRequired") : t("badgeOptional")}</span>
        </span>
      `;

      const grpScope = grp.scope || (Array.isArray(grp.appliedCategories) && grp.appliedCategories.length > 0 ? 'category' : 'order');
      if (!grp.scope) grp.scope = grpScope;
      if (!Array.isArray(grp.appliedCategories)) grp.appliedCategories = [];
      if (!Array.isArray(grp.appliedItems)) {
        grp.appliedItems = [];
        (currentMenuData || []).filter(c => !isCustomizationCategory(c)).forEach(menuCat => {
          (menuCat.items || []).forEach(item => {
            if ((item.modifierGroups || item.modifier_groups || []).some(link => [String(grp.id), `mg_${grp.id}`].includes(String(link.id || link.groupId || link.group_id)))) {
              grp.appliedItems.push(String(item.id || `${menuCat.id}:${item.name}`));
            }
          });
        });
      }

      const scopeButtonsHtml = `
        <div class="cust-scope-selector-wrap">
          <button type="button" class="cust-scope-btn ${grpScope === 'order' ? 'active scope-order' : ''}" onclick="setCustomizationGroupScope(${cIdx}, ${gIdx}, 'order')">
            <span>${t("scopeOrder") || (currentLang === 'vi' ? 'Toàn đơn' : '整單適用')}</span>
          </button>
          <button type="button" class="cust-scope-btn ${grpScope !== 'order' ? 'active scope-category' : ''}" onclick="setCustomizationGroupScope(${cIdx}, ${gIdx}, 'category')">
            <span>${t("scopeCategoryItem")}</span>
          </button>
        </div>
      `;

      let scopePanelHtml = '';
      let summaryText = '';
      if (grpScope === 'order') {
        scopePanelHtml = `
          <div class="cust-scope-panel scope-order-panel">
            <div class="cust-scope-panel-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>${t("scopeOrderDesc") || "適用於整筆訂單結帳時的選項（如餐具、全單辣度）"}</span>
            </div>
          </div>
        `;
      } else if (grpScope !== 'order') {
        const catChipsHtml = catalogCategories.map((catItem, menuCatIdx) => {
          const selection = getModifierCategorySelectionState(grp, catItem);
          const isChecked = selection.checked;
          const isIndeterminate = selection.indeterminate;
          const count = Array.isArray(catItem.items) ? catItem.items.length : 0;
          return `
            <div class="cust-cat-item-select ${isIndeterminate ? 'has-partial-selection' : ''}">
              <label class="cust-cat-chip ${isChecked ? 'active' : ''} ${isIndeterminate ? 'partial' : ''}">
                <input data-category-checkbox="true" type="checkbox" aria-checked="${isIndeterminate ? 'mixed' : String(isChecked)}" ${isChecked ? 'checked' : ''} onchange="toggleGroupAppliedCategory(${cIdx}, ${gIdx}, '${escapeHtml(catItem.id)}', this.checked)">
                <span>${escapeHtml(catItem.title)}</span>
                <span class="cust-cat-chip-count">(${count})</span>
              </label>
              <div class="cust-item-chip-list">${(catItem.items || []).map((item, itemIdx) => {
                const itemId = String(item.id || `${catItem.id}:${item.name}`);
                const checked = grp.appliedCategories.includes(catItem.id) || grp.appliedItems.includes(itemId);
                return `<label class="cust-item-chip"><input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleGroupAppliedItem(${cIdx}, ${gIdx}, '${escapeHtml(catItem.id)}', ${itemIdx}, this.checked)"><span>${escapeHtml(item.name)}</span></label>`;
              }).join('')}</div>
            </div>
          `;
        }).join('');

        const appliedCats = catalogCategories.filter(c => grp.appliedCategories.includes(c.id) || ((c.items || []).length > 0 && c.items.every(item => grp.appliedItems.includes(String(item.id || `${c.id}:${item.name}`)))));
        const selectedItemKeys = new Set(grp.appliedItems);
        appliedCats.forEach(c => (c.items || []).forEach(item => selectedItemKeys.add(String(item.id || `${c.id}:${item.name}`))));
        const totalItemsApplied = selectedItemKeys.size;
        const summaryTpl = t("appliedSummary") || "已套用至 {catCount} 個分類 (共 {itemCount} 項餐點)";
        const summaryText = summaryTpl.replace('{catCount}', appliedCats.length).replace('{itemCount}', totalItemsApplied);

        const groupKey = grp.id || `grp_${gIdx}`;
        const isCatChipsOpen = Boolean(window.isCustomScopeSectionOpen?.[groupKey]);

        scopePanelHtml = `
          <div class="cust-scope-panel scope-category-panel" style="padding: 10px 14px;">
            <details class="cust-cat-collapsible" ${isCatChipsOpen ? 'open' : ''} ontoggle="window.isCustomScopeSectionOpen = window.isCustomScopeSectionOpen || {}; window.isCustomScopeSectionOpen['${escapeHtml(groupKey)}'] = this.open;">
              <summary class="cust-cat-collapsible-summary" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; list-style: none; user-select: none;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                  <span style="font-weight: 700; font-size: 13px;">${t("scopeCategoryDesc") || "所選分類下的所有餐點將自動繼承此客製化選項"}</span>
                  <span class="cust-scope-summary-pill" style="font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;">
                    ${summaryText}
                  </span>
                </div>
                <div class="cust-cat-collapsible-btn">
                  <span>${t("btnSelectCategories") || (currentLang === 'vi' ? 'Chọn phân loại' : '選擇分類')}</span>
                  <svg class="cust-scope-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s ease;">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              </summary>
              <div class="cust-cat-chips-list" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #86efac;">
                ${catChipsHtml || `<span style="color:#94a3b8; font-size:12.5px;">${t("noCategoriesPrompt") || "無分類"}</span>`}
              </div>
            </details>
          </div>
        `;
      } else {
        scopePanelHtml = `
          <div class="cust-scope-panel scope-item-panel">
            <div class="cust-scope-panel-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              <span>${t("scopeItemDesc") || "僅在手動加入個別品項或套餐時適用"}</span>
            </div>
          </div>
        `;
      }

      const optionsCount = (grp.options || []).length;

      let optionsHtml = '';
      if (optionsCount === 0) {
        optionsHtml = `
          <div class="cust-empty-options-hint" style="text-align: center; padding: 24px 16px; background: #f8fafc; border-radius: 10px; border: 1.5px dashed #cbd5e1; margin-bottom: 12px; color: #64748b;">
            <div style="font-size: 13.5px; font-weight: 700; margin-bottom: 4px;">${currentLang === 'vi' ? 'Nhóm này chưa có lựa chọn nào' : '此分組尚無任何選項'}</div>
            <div style="font-size: 12px; color: #94a3b8;">${currentLang === 'vi' ? 'Bấm nút "Thêm lựa chọn" bên dưới để bắt đầu' : '點擊下方「新增選項」按鈕開始建立第一個選項'}</div>
          </div>
        `;
      } else {
        (grp.options || []).forEach((opt, oIdx) => {
        const oosBg = opt.isOos ? '#fee2e2' : '#d1fae5';
        const oosColor = opt.isOos ? '#b91c1c' : '#065f46';
        const oosBorder = opt.isOos ? '#fca5a5' : '#6ee7b7';
        const oosText = opt.isOos ? t("stockStatusOutOfStock") : t("stockStatusInStock");

        const subChipsHtml = (opt.sub_options || []).map((sub, sIdx) => `
          <span class="cust-sub-chip">
            <span>${escapeHtml(sub)}</span>
            <button type="button" class="cust-sub-chip-remove" onclick="removeSubOptionChip(${cIdx}, ${gIdx}, ${oIdx}, ${sIdx})" title="✕">✕</button>
          </span>
        `).join('');

        optionsHtml += `
          <div class="cust-option-block" data-gidx="${gIdx}" data-oidx="${oIdx}">
            <div class="cust-option-row">
              <input type="text" class="menu-item-name-input" value="${escapeHtml(opt.name)}"
                data-cust-name-cidx="${cIdx}" data-cust-gidx="${gIdx}" data-cust-oidx="${oIdx}"
                oninput="syncMenuDataFromDOM(); markMenuDirty()" placeholder="${t("labelOptionName")}">
              <label class="menu-item-price-label" title="${t("labelSurcharge")}">
                <span>+$</span>
                <input type="number" class="menu-item-price-input" value="${opt.price !== null && opt.price !== undefined ? opt.price : 0}"
                  data-cust-price-cidx="${cIdx}" data-cust-gidx="${gIdx}" data-cust-oidx="${oIdx}"
                  oninput="syncMenuDataFromDOM(); markMenuDirty()" placeholder="0">
              </label>
              <div class="menu-item-actions" style="margin-left: auto;">
                <button type="button" class="menu-item-btn" style="background: ${oosBg}; color: ${oosColor}; border: 1px solid ${oosBorder}; display: inline-flex; align-items: center; gap: 5px;"
                  onclick="openStockModalForCustomization(${cIdx}, ${gIdx}, ${oIdx})" title="${oosText}">
                  <span style="width: 7px; height: 7px; border-radius: 50%; background: currentColor; display: inline-block;"></span> <span>${oosText}</span>
                </button>
                <button type="button" class="menu-item-btn btn-ghost" style="border: 1px solid #fee2e2; background: #fff5f5; color: var(--brand-red); display:inline-flex; align-items:center; gap:4px;"
                  onclick="removeCustomizationOption(${cIdx}, ${gIdx}, ${oIdx})" title="${t("btnItemDelete")}">
                  ${(typeof POS_SVG !== 'undefined' && POS_SVG.trash) || ''} <span>${t("btnItemDelete")}</span>
                </button>
              </div>
            </div>
            <div class="cust-sub-options-container">
              <span class="cust-sub-label">${t("subOptionsLabel")}</span>
              ${subChipsHtml}
              <button type="button" class="cust-add-sub-chip-btn"
                onclick="promptAddSubOptionChip(${cIdx}, ${gIdx}, ${oIdx})">
                <span>${formatPlusBtnText(t("btnAddSubOption"), "新增細項")}</span>
              </button>
            </div>
          </div>
        `;
      });
      }

      const repeatsEditorTitle = (cat.groups.length === 1 && String(grp.title || '').trim() === String(cat.title || '').trim());

      card.innerHTML = `
        <div class="cust-group-header">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="cust-group-title" id="cust-group-title-${gIdx}"${repeatsEditorTitle ? ' hidden' : ''}>${escapeHtml(grp.title)}</span>
            <button type="button" class="menu-item-btn btn-ghost" id="cust-group-rename-btn-${gIdx}" style="padding: 3px 6px; font-size: var(--pos-text-meta); border: 1px solid #cbd5e1; display:inline-flex; align-items:center; justify-content:center;"
              onclick="startRenameCustomizationGroup(${cIdx}, ${gIdx})" title="${t("btnCategoryRename")}">${(typeof POS_SVG !== 'undefined' && POS_SVG.edit) || ''}</button>
            <button type="button" style="cursor: pointer; border: none; background: transparent; padding: 0;"
              onclick="toggleCustomizationGroupType(${cIdx}, ${gIdx})" title="${grp.type === 'checkbox' ? t('toggleGroupTypeSingle') : t('toggleGroupTypeMultiple')}">
              ${typeBadge}
            </button>
            <button type="button" style="cursor: pointer; border: none; background: transparent; padding: 0;"
              onclick="toggleCustomizationGroupRequired(${cIdx}, ${gIdx})" title="${grp.isRequired ? t('toggleRequiredOff') : t('toggleRequiredOn')}">
              ${requiredBadge}
            </button>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
            <span style="font-size: var(--pos-text-meta); color: #64748b; font-weight: 600;">${optionsCount} ${t("menuItemUnit")}</span>
            <button type="button" class="menu-item-btn btn-ghost" style="border: 1px solid #fee2e2; background: #fff5f5; color: var(--brand-red); padding: 3px 6px; font-size: var(--pos-text-meta); display:inline-flex; align-items:center; justify-content:center;"
              onclick="removeCustomizationGroup(${cIdx}, ${gIdx})" title="${t("btnCategoryDelete")}">
              ${(typeof POS_SVG !== 'undefined' && POS_SVG.trash) || ''}
            </button>
          </div>
        </div>

        ${scopeButtonsHtml}
        ${scopePanelHtml}

        <div class="cust-options-list">
          ${optionsHtml}
        </div>
        <button type="button" class="cat-mgr-add-btn" style="margin-top: 10px;" onclick="addCustomizationOption(${cIdx}, ${gIdx})">
          <span>${formatPlusBtnText(t("btnAddCustomOption"), "新增選項")}</span>
        </button>
      `;

      // `indeterminate` is a DOM property (not an HTML attribute), so restore
      // the mixed state after rendering each category header.
      syncCategoryCheckboxIndeterminateState(card);

      container.appendChild(card);
    });
  }

  if (isCustomGroupCreatorOpen) {
    const newCard = document.createElement("div");
    newCard.className = "cust-new-group-card";
    newCard.id = "cust-new-group-card";
    newCard.style.cssText = "background: #ffffff; border: 2px solid var(--primary, #2563eb); border-radius: 14px; padding: 18px; margin-top: 16px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.08);";

    const quickChips = currentLang === 'vi'
      ? ["✦ Dụng cụ ăn uống", "✦ Mức cay toàn đơn", "✦ Ghi chú dặn dò", "✦ Chọn nước sốt"]
      : ["✦ 免洗餐具", "✦ 整單辣度", "✦ 店家備註", "✦ 醬料選擇"];

    const chipsHtml = quickChips.map(chip => `
      <span class="quick-tag-chip" onclick="applyNewGroupQuickChip('${escapeHtml(chip)}')" style="cursor: pointer;">${escapeHtml(chip)}</span>
    `).join('');

    const titleText = t("newGroupCardTitle") || (currentLang === 'vi' ? 'Tạo nhóm tùy chọn mới' : '新增客製化分組');
    const placeholderText = t("newGroupInputPlaceholder") || (currentLang === 'vi' ? '✦ Nhập tên nhóm (ví dụ: Chọn nước sốt, Dụng cụ ăn uống...)' : '✦ 輸入分組名稱（例：✦ 醬料選擇、✦ 加料選項）');

    const creatorScopeHtml = `
      <div style="margin-bottom: 14px;">
        <label style="display:block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
          ${currentLang === 'vi' ? 'Phạm vi áp dụng (3 cấp độ):' : '套用範圍（三級架構）：'}
        </label>
        <div class="cust-scope-selector-wrap" style="margin-top: 0; margin-bottom: 8px;">
          <button type="button" class="cust-scope-btn ${newCustomGroupScope === 'order' ? 'active scope-order' : ''}" onclick="setNewCustomGroupScope('order', ${cIdx})">
            <span>${t("scopeOrder") || (currentLang === 'vi' ? 'Toàn đơn' : '整單適用')}</span>
          </button>
          <button type="button" class="cust-scope-btn ${newCustomGroupScope !== 'order' ? 'active scope-category' : ''}" onclick="setNewCustomGroupScope('category', ${cIdx})">
            <span>${t("scopeCategoryItem")}</span>
          </button>
        </div>
        ${newCustomGroupScope === 'category' ? `
          <div class="cust-scope-panel scope-category-panel" style="margin-bottom: 0;">
            <div class="cust-scope-panel-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
              <span>${t("scopeCategoryDesc") || "所選分類下的所有餐點將自動繼承此客製化選項"}</span>
            </div>
            <div class="cust-cat-chips-list">
              ${catalogCategories.map(catItem => {
                const isChecked = newCustomGroupAppliedCategories.includes(catItem.id);
                const count = Array.isArray(catItem.items) ? catItem.items.length : 0;
                return `
                  <label class="cust-cat-chip ${isChecked ? 'active' : ''}">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleNewGroupAppliedCategory('${escapeHtml(catItem.id)}', ${cIdx})">
                    <span>${escapeHtml(catItem.title)}</span>
                    <span class="cust-cat-chip-count">(${count})</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        ` : (newCustomGroupScope === 'order' ? `
          <div class="cust-scope-panel scope-order-panel" style="margin-bottom: 0;">
            <div class="cust-scope-panel-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>${t("scopeOrderDesc") || "適用於整筆訂單結帳時的選項（如餐具、全單辣度）"}</span>
            </div>
          </div>
        ` : `
          <div class="cust-scope-panel scope-item-panel" style="margin-bottom: 0;">
            <div class="cust-scope-panel-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              <span>${t("scopeItemDesc") || "僅在手動加入個別品項或套餐時適用"}</span>
            </div>
          </div>
        `)}
      </div>
    `;

    newCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div style="font-size: 16px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary, #2563eb);"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
          <span>${titleText}</span>
        </div>
        <button type="button" class="btn btn-ghost" onclick="cancelNewCustomizationGroup(${cIdx})" style="padding: 4px 8px; font-size: 14px; min-height: 36px;">✕</button>
      </div>

      <div style="margin-bottom: 12px;">
        <input type="text" id="cust-new-group-title-input" class="menu-item-name-input"
          placeholder="${placeholderText}"
          style="width: 100%; font-size: 15px; font-weight: 700; padding: 12px 14px; border: 1.5px solid #cbd5e1; border-radius: 10px; background: #f8fafc;"
          onkeydown="if(event.key === 'Enter') saveNewCustomizationGroup(${cIdx}); if(event.key === 'Escape') cancelNewCustomizationGroup(${cIdx});">
      </div>

      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; align-items: center;">
        <span style="font-size: 12.5px; color: #64748b; font-weight: 700;">${currentLang === 'vi' ? 'Gợi ý nhanh:' : '快捷標籤：'}</span>
        ${chipsHtml}
      </div>

      ${creatorScopeHtml}

      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; padding: 12px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; align-items: center;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 13px; font-weight: 700; color: #334155;">${currentLang === 'vi' ? 'Kiểu chọn:' : '選擇模式：'}</span>
          <button type="button" id="btn-new-grp-type-radio" class="btn" style="min-height: 40px; padding: 0 12px; font-size: 13px; font-weight: 700; border-radius: 8px; ${newCustomGroupType === 'radio' ? 'background: #eff6ff; color: #2563eb; border: 1.5px solid #93c5fd;' : 'background: #ffffff; color: #64748b; border: 1px solid #cbd5e1;'}" onclick="setNewGroupType('radio', ${cIdx})">
            ${currentLang === 'vi' ? 'Chọn 1 (Đơn tuyển)' : '單選 (僅選一項)'}
          </button>
          <button type="button" id="btn-new-grp-type-checkbox" class="btn" style="min-height: 40px; padding: 0 12px; font-size: 13px; font-weight: 700; border-radius: 8px; ${newCustomGroupType === 'checkbox' ? 'background: #eff6ff; color: #2563eb; border: 1.5px solid #93c5fd;' : 'background: #ffffff; color: #64748b; border: 1px solid #cbd5e1;'}" onclick="setNewGroupType('checkbox', ${cIdx})">
            ${currentLang === 'vi' ? 'Chọn nhiều (Đa tuyển)' : '多選 (可選多項)'}
          </button>
        </div>

        <div style="height: 20px; width: 1px; background: #cbd5e1; margin: 0 4px;"></div>

        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 13px; font-weight: 700; color: #334155;">${currentLang === 'vi' ? 'Quy định:' : '必選設定：'}</span>
          <button type="button" id="btn-new-grp-required" class="btn" style="min-height: 40px; padding: 0 12px; font-size: 13px; font-weight: 700; border-radius: 8px; ${newCustomGroupRequired ? 'background: #fee2e2; color: #b91c1c; border: 1.5px solid #fca5a5;' : 'background: #ffffff; color: #64748b; border: 1px solid #cbd5e1;'}" onclick="toggleNewGroupRequired(${cIdx})">
            ${newCustomGroupRequired ? (t('badgeRequired') || (currentLang === 'vi' ? 'Bắt buộc chọn' : '必選項目')) : (t('badgeOptional') || (currentLang === 'vi' ? 'Không bắt buộc' : '選填項目'))}
          </button>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn btn-ghost" onclick="cancelNewCustomizationGroup(${cIdx})" style="min-height: 48px; padding: 0 20px; font-weight: 700; border-radius: 10px;">
          ${t("btnItemCancel") || (currentLang === 'vi' ? 'Hủy' : '取消')}
        </button>
        <button type="button" class="btn btn-primary" onclick="saveNewCustomizationGroup(${cIdx})" style="min-height: 48px; padding: 0 24px; font-weight: 800; border-radius: 10px; font-size: 14px;">
          ${t("btnSaveGroup") || (currentLang === 'vi' ? 'Lưu nhóm' : '儲存分組')}
        </button>
      </div>
    `;
    container.appendChild(newCard);
  } else if (cat.type !== 'modifier' && activeOptionGroupIndex === null) {
    // Show dashed button to open creator
    const addGroupBtn = document.createElement("button");
    addGroupBtn.type = "button";
    addGroupBtn.className = "cat-mgr-add-btn";
    addGroupBtn.style.marginTop = "16px";
    addGroupBtn.style.background = "#f8fafc";
    addGroupBtn.style.border = "2px dashed #94a3b8";
    addGroupBtn.innerHTML = `<span>${formatPlusBtnText(t("btnAddCustomGroup"), "新增客製化分組")}</span>`;
    addGroupBtn.onclick = () => openNewCustomGroupCreator(cIdx);
    container.appendChild(addGroupBtn);
  }
}

function openNewCustomGroupCreator(cIdx) {
  if (window.UnifiedMenu?.enabled) return window.UnifiedMenu.group();
  syncMenuDataFromDOM();
  isCustomGroupCreatorOpen = true;
  newCustomGroupType = 'radio';
  newCustomGroupRequired = false;
  newCustomGroupScope = 'order';
  newCustomGroupAppliedCategories = [];
  const cat = currentMenuData[cIdx];
  renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), cat, cIdx);
  setTimeout(() => {
    const card = document.getElementById("cust-new-group-card");
    const inp = document.getElementById("cust-new-group-title-input");
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (inp) inp.focus();
  }, 50);
}
window.openNewCustomGroupCreator = openNewCustomGroupCreator;

function cancelNewCustomizationGroup(cIdx) {
  isCustomGroupCreatorOpen = false;
  const cat = currentMenuData[cIdx];
  renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), cat, cIdx);
}
window.cancelNewCustomizationGroup = cancelNewCustomizationGroup;

function setNewGroupType(type, cIdx) {
  newCustomGroupType = type;
  const radioBtn = document.getElementById("btn-new-grp-type-radio");
  const checkBtn = document.getElementById("btn-new-grp-type-checkbox");
  if (radioBtn && checkBtn) {
    if (type === 'radio') {
      radioBtn.style.background = "#eff6ff";
      radioBtn.style.color = "#2563eb";
      radioBtn.style.border = "1.5px solid #93c5fd";
      checkBtn.style.background = "#ffffff";
      checkBtn.style.color = "#64748b";
      checkBtn.style.border = "1px solid #cbd5e1";
    } else {
      checkBtn.style.background = "#eff6ff";
      checkBtn.style.color = "#2563eb";
      checkBtn.style.border = "1.5px solid #93c5fd";
      radioBtn.style.background = "#ffffff";
      radioBtn.style.color = "#64748b";
      radioBtn.style.border = "1px solid #cbd5e1";
    }
  }
}
window.setNewGroupType = setNewGroupType;

function setNewCustomGroupScope(scope, cIdx) {
  newCustomGroupScope = scope;
  const cat = currentMenuData[cIdx];
  renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), cat, cIdx);
}
window.setNewCustomGroupScope = setNewCustomGroupScope;

function toggleNewGroupAppliedCategory(catId, cIdx) {
  const idx = newCustomGroupAppliedCategories.indexOf(catId);
  if (idx >= 0) {
    newCustomGroupAppliedCategories.splice(idx, 1);
  } else {
    newCustomGroupAppliedCategories.push(catId);
  }
  const cat = currentMenuData[cIdx];
  renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), cat, cIdx);
}
window.toggleNewGroupAppliedCategory = toggleNewGroupAppliedCategory;

function setCustomizationGroupScope(cIdx, gIdx, scope) {
  syncMenuDataFromDOM();
  const cat = currentMenuData[cIdx];
  const grp = cat?.groups?.[gIdx];
  if (!grp) return;
  grp.scope = scope;
  if (scope === 'category') {
    if (!Array.isArray(grp.appliedCategories)) grp.appliedCategories = [];
    const groupKey = grp.id || `grp_${gIdx}`;
    window.isCustomScopeSectionOpen = window.isCustomScopeSectionOpen || {};
    window.isCustomScopeSectionOpen[groupKey] = true;
  } else if (scope === 'item') {
    grp.appliedCategories = [];
    if (cat.type === 'modifier') {
      const modIdentifier = cat.id || cat.databaseId;
      currentMenuData.forEach(c => {
        if (!isCustomizationCategory(c) && Array.isArray(c.appliedModifiers)) {
          c.appliedModifiers = c.appliedModifiers.filter(m => m !== '*' && m !== modIdentifier && m !== cat.id && m !== cat.databaseId);
        }
      });
    }
  }
  markMenuDirty();
  renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), currentMenuData[cIdx], cIdx);
}
window.setCustomizationGroupScope = setCustomizationGroupScope;

function toggleGroupAppliedCategory(cIdx, gIdx, catId, checked) {
  syncMenuDataFromDOM();
  const cat = currentMenuData[cIdx];
  const grp = cat?.groups?.[gIdx];
  if (!grp) return;
  if (!Array.isArray(grp.appliedCategories)) grp.appliedCategories = [];
  const idx = grp.appliedCategories.indexOf(catId);
  const targetCatalogCat = currentMenuData.find(c => c.id === catId || c.databaseId === catId);
  const modIdentifier = cat.id || cat.databaseId;

  if (!checked || idx >= 0) {
    grp.appliedCategories = grp.appliedCategories.filter(id => id !== catId);
    const itemKeys = (targetCatalogCat?.items || []).map(item => String(item.id || `${targetCatalogCat.id}:${item.name}`));
    grp.appliedItems = (grp.appliedItems || []).filter(id => !itemKeys.includes(id));
    if (cat.type === 'modifier' && targetCatalogCat) {
      if (!Array.isArray(targetCatalogCat.appliedModifiers)) targetCatalogCat.appliedModifiers = [];
      targetCatalogCat.appliedModifiers = targetCatalogCat.appliedModifiers.filter(m => m !== '*' && m !== modIdentifier && m !== cat.id && m !== cat.databaseId);
    }
  } else {
    grp.appliedCategories.push(catId);
    const categoryItemKeys = (targetCatalogCat?.items || []).map(item => String(item.id || `${targetCatalogCat.id}:${item.name}`));
    grp.appliedItems = (grp.appliedItems || []).filter(id => !categoryItemKeys.includes(id));
    if (cat.type === 'modifier' && targetCatalogCat) {
      if (!Array.isArray(targetCatalogCat.appliedModifiers)) targetCatalogCat.appliedModifiers = [];
      if (!targetCatalogCat.appliedModifiers.includes(modIdentifier)) {
        targetCatalogCat.appliedModifiers.push(modIdentifier);
      }
      targetCatalogCat.allowCustomization = true;
    }
  }
  markMenuDirty();
  renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), currentMenuData[cIdx], cIdx);
}
window.toggleGroupAppliedCategory = toggleGroupAppliedCategory;

function toggleGroupAppliedItem(cIdx, gIdx, catId, itemIdx, checked) {
  syncMenuDataFromDOM();
  const group = currentMenuData[cIdx]?.groups?.[gIdx];
  const menuCat = currentMenuData.find(c => c.id === catId || c.databaseId === catId);
  const item = menuCat?.items?.[itemIdx];
  if (!group || !menuCat || !item) return;
  if (!Array.isArray(group.appliedItems)) group.appliedItems = [];
  const itemKey = String(item.id || `${menuCat.id}:${item.name}`);
  const categoryWasSelected = (group.appliedCategories || []).includes(catId);
  if (categoryWasSelected) {
    group.appliedCategories = group.appliedCategories.filter(id => id !== catId);
    group.appliedItems = [...new Set([...(group.appliedItems || []), ...(menuCat.items || []).filter((_, i) => i !== itemIdx).map(entry => String(entry.id || `${menuCat.id}:${entry.name}`))])];
  }
  group.appliedItems = checked
    ? [...new Set([...group.appliedItems, itemKey])]
    : group.appliedItems.filter(id => id !== itemKey);
  group.scope = 'category';
  markMenuDirty();
  renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), currentMenuData[cIdx], cIdx);
}
window.toggleGroupAppliedItem = toggleGroupAppliedItem;

function toggleNewGroupRequired(cIdx) {
  newCustomGroupRequired = !newCustomGroupRequired;
  const reqBtn = document.getElementById("btn-new-grp-required");
  if (reqBtn) {
    if (newCustomGroupRequired) {
      reqBtn.style.background = "#fee2e2";
      reqBtn.style.color = "#b91c1c";
      reqBtn.style.border = "1.5px solid #fca5a5";
      reqBtn.innerText = t("badgeRequired") || (currentLang === 'vi' ? 'Bắt buộc chọn' : '必選項目');
    } else {
      reqBtn.style.background = "#ffffff";
      reqBtn.style.color = "#64748b";
      reqBtn.style.border = "1px solid #cbd5e1";
      reqBtn.innerText = t("badgeOptional") || (currentLang === 'vi' ? 'Không bắt buộc' : '選填項目');
    }
  }
}
window.toggleNewGroupRequired = toggleNewGroupRequired;

function applyNewGroupQuickChip(text) {
  const inp = document.getElementById("cust-new-group-title-input");
  if (inp) {
    inp.value = text;
    inp.style.borderColor = "#cbd5e1";
    inp.focus();
  }
}
window.applyNewGroupQuickChip = applyNewGroupQuickChip;

function saveNewCustomizationGroup(cIdx) {
  syncMenuDataFromDOM();
  const inp = document.getElementById("cust-new-group-title-input");
  if (!inp) return;
  const trimmed = inp.value.trim();
  if (!trimmed) {
    inp.style.borderColor = "#ef4444";
    inp.focus();
    return;
  }
  const cat = currentMenuData[cIdx];
  if (cat) {
    if (!Array.isArray(cat.groups)) cat.groups = [];
    const tenantId = getTenantIdFromUrl();
    const newKey = `group_${Date.now().toString(36)}`;
    const newId = `custom_${tenantId}_${newKey}`;
    cat.groups.push({
      id: newId,
      key: newKey,
      title: trimmed,
      type: newCustomGroupType,
      isRequired: newCustomGroupRequired,
      scope: newCustomGroupScope,
      appliedCategories: newCustomGroupScope === 'category' ? [...newCustomGroupAppliedCategories] : [],
      sortOrder: cat.groups.length,
      options: []
    });
    isCustomGroupCreatorOpen = false;
    const newGroupIndex = cat.groups.length - 1;
    activeOptionGroupIndex = newGroupIndex;
    markMenuDirty();
    renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), cat, cIdx);
    renderMenuCategories();

    setTimeout(() => {
      const el = document.querySelector(`[data-cust-group-index="${newGroupIndex}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }
}
window.saveNewCustomizationGroup = saveNewCustomizationGroup;

function addCustomizationGroup(cIdx) {
  openNewCustomGroupCreator(cIdx);
}
window.addCustomizationGroup = addCustomizationGroup;

function startRenameCustomizationGroup(cIdx, gIdx) {
  const titleEl = document.getElementById(`cust-group-title-${gIdx}`);
  const renameBtn = document.getElementById(`cust-group-rename-btn-${gIdx}`);
  if (!titleEl) return;
  titleEl.hidden = false;
  if (renameBtn) renameBtn.style.display = "none";
  const currentTitle = currentMenuData[cIdx]?.groups?.[gIdx]?.title || '';

  titleEl.innerHTML = `
    <div style="display: flex; align-items: center; gap: 6px;" onclick="event.stopPropagation()">
      <input type="text" id="cust-group-rename-input-${gIdx}" value="${escapeHtml(currentTitle)}"
        style="min-width: 160px; max-width: 240px; font-weight: 800; font-size: 15px; padding: 6px 10px; border: 1.5px solid var(--primary, #2563eb); border-radius: 8px; background: #fff;"
        onkeydown="if(event.key === 'Enter') saveRenameCustomizationGroup(${cIdx}, ${gIdx}); if(event.key === 'Escape') cancelRenameCustomizationGroup(${cIdx}, ${gIdx});">
      <button type="button" class="btn btn-primary" onclick="saveRenameCustomizationGroup(${cIdx}, ${gIdx})" style="min-height: 34px; padding: 0 10px; font-size: 13px; font-weight: 700; border-radius: 6px;">✓</button>
      <button type="button" class="btn btn-ghost" onclick="cancelRenameCustomizationGroup(${cIdx}, ${gIdx})" style="min-height: 34px; padding: 0 8px; font-size: 13px; border-radius: 6px;">✕</button>
    </div>
  `;
  const inp = document.getElementById(`cust-group-rename-input-${gIdx}`);
  if (inp) {
    inp.focus();
    inp.select();
  }
}
window.startRenameCustomizationGroup = startRenameCustomizationGroup;

function saveRenameCustomizationGroup(cIdx, gIdx) {
  const inp = document.getElementById(`cust-group-rename-input-${gIdx}`);
  if (!inp) return;
  const trimmed = inp.value.trim();
  if (!trimmed) {
    inp.style.borderColor = "#ef4444";
    inp.focus();
    return;
  }
  const grp = currentMenuData[cIdx]?.groups?.[gIdx];
  if (grp) {
    grp.title = trimmed;
    if (currentMenuData[cIdx].type === 'modifier') {
      currentMenuData[cIdx].title = trimmed;
      currentMenuData[cIdx].shortName = trimmed;
    }
    markMenuDirty();
    renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), currentMenuData[cIdx], cIdx);
    renderMenuCategories();
  }
}
window.saveRenameCustomizationGroup = saveRenameCustomizationGroup;

function cancelRenameCustomizationGroup(cIdx, gIdx) {
  renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), currentMenuData[cIdx], cIdx);
}
window.cancelRenameCustomizationGroup = cancelRenameCustomizationGroup;

function renameCustomizationGroup(cIdx, gIdx) {
  startRenameCustomizationGroup(cIdx, gIdx);
}
window.renameCustomizationGroup = renameCustomizationGroup;

function toggleCustomizationGroupType(cIdx, gIdx) {
  syncMenuDataFromDOM();
  const grp = currentMenuData[cIdx]?.groups?.[gIdx];
  if (!grp) return;
  grp.type = grp.type === 'checkbox' ? 'radio' : 'checkbox';
  markMenuDirty();
  renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), currentMenuData[cIdx], cIdx);
}
window.toggleCustomizationGroupType = toggleCustomizationGroupType;

function toggleCustomizationGroupRequired(cIdx, gIdx) {
  syncMenuDataFromDOM();
  const grp = currentMenuData[cIdx]?.groups?.[gIdx];
  if (!grp) return;
  grp.isRequired = !grp.isRequired;

  const grpId = String(grp.id || '');
  const canonId = String(grp.canonicalId || '');
  currentMenuData.forEach(cat => {
    (cat.items || []).forEach(item => {
      if (Array.isArray(item.modifierGroups)) {
        item.modifierGroups.forEach(link => {
          const lid = String(link.id || link.groupId || link.group_id || '');
          if (lid === grpId || lid === canonId || `mg_${lid}` === grpId || lid === `mg_${grpId}`) {
            link.isRequired = grp.isRequired;
          }
        });
      }
    });
  });

  markMenuDirty();
  renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), currentMenuData[cIdx], cIdx);
}
window.toggleCustomizationGroupRequired = toggleCustomizationGroupRequired;

function removeCustomizationGroup(cIdx, gIdx) {
  const grp = currentMenuData[cIdx]?.groups?.[gIdx];
  if (!grp) return;
  if (confirm(t("confirmDeleteCustomGroup"))) {
    syncMenuDataFromDOM();
    if (currentMenuData[cIdx].type === 'modifier') {
      deleteCategoryAtIndex(cIdx);
      return;
    }
    currentMenuData.forEach(category => (category.items || []).forEach(item => {
      if (Array.isArray(item.modifierGroups)) item.modifierGroups = item.modifierGroups.filter(link => link.id !== grp.id && link.id !== `mg_${grp.id}`);
    }));
    currentMenuData[cIdx].groups.splice(gIdx, 1);
    activeOptionGroupIndex = null;
    markMenuDirty();
    renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), currentMenuData[cIdx], cIdx);
    renderMenuCategories();
  }
}
window.removeCustomizationGroup = removeCustomizationGroup;

function promptAddSubOptionChip(cIdx, gIdx, oIdx) {
  syncMenuDataFromDOM();
  const subName = prompt(t("promptAddSubOption"));
  if (subName !== null) {
    const trimmed = subName.trim();
    if (!trimmed) return;
    const opt = currentMenuData[cIdx]?.groups?.[gIdx]?.options?.[oIdx];
    if (opt) {
      if (!Array.isArray(opt.sub_options)) opt.sub_options = [];
      if (!opt.sub_options.includes(trimmed)) {
        opt.sub_options.push(trimmed);
        markMenuDirty();
        renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), currentMenuData[cIdx], cIdx);
      }
    }
  }
}
window.promptAddSubOptionChip = promptAddSubOptionChip;

function removeSubOptionChip(cIdx, gIdx, oIdx, sIdx) {
  syncMenuDataFromDOM();
  const opt = currentMenuData[cIdx]?.groups?.[gIdx]?.options?.[oIdx];
  if (opt && Array.isArray(opt.sub_options)) {
    opt.sub_options.splice(sIdx, 1);
    markMenuDirty();
    renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), currentMenuData[cIdx], cIdx);
  }
}
window.removeSubOptionChip = removeSubOptionChip;

function addCustomizationOption(cIdx, gIdx) {
  syncMenuDataFromDOM();
  const group = currentMenuData[cIdx]?.groups?.[gIdx];
  if (group) {
    if (!Array.isArray(group.options)) group.options = [];
    const stableGid = group.canonicalId || group.id || `${cIdx}_${gIdx}`;
    const newId = `opt_${stableGid}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const defaultName = t("newItemPlaceholder") || "新選項";
    group.options.push({
      id: newId,
      name: defaultName,
      price: 0,
      isOos: false,
      sub_options: [],
      originalName: defaultName
    });
    if (currentMenuData[cIdx].type === 'modifier') {
      if (!Array.isArray(currentMenuData[cIdx].items)) currentMenuData[cIdx].items = [];
      currentMenuData[cIdx].items.push({
        id: newId,
        name: defaultName,
        price: 0,
        isOos: false,
        badgeText: '',
        isRecommended: false,
        originalName: defaultName
      });
    }
    markMenuDirty();
    renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), currentMenuData[cIdx], cIdx);
    renderMenuCategories();
    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => {
        const newInp = document.querySelector(`input[data-cust-name-cidx="${cIdx}"][data-cust-gidx="${gIdx}"][data-cust-oidx="${group.options.length - 1}"]`);
        if (newInp) {
          newInp.focus();
          newInp.select();
        }
      }, 50);
    }
  }
}
window.addCustomizationOption = addCustomizationOption;

function removeCustomizationOption(cIdx, gIdx, oIdx) {
  const group = currentMenuData[cIdx]?.groups?.[gIdx];
  const opt = group?.options?.[oIdx];
  if (!opt) return;
  if (confirm(t("confirmDeleteItem"))) {
    syncMenuDataFromDOM();
    group.options.splice(oIdx, 1);
    if (currentMenuData[cIdx].type === 'modifier' && Array.isArray(currentMenuData[cIdx].items)) {
      currentMenuData[cIdx].items.splice(oIdx, 1);
    }
    markMenuDirty();
    renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), currentMenuData[cIdx], cIdx);
    renderMenuCategories();
  }
}
window.removeCustomizationOption = removeCustomizationOption;

function removeMenuItemAt(cIdx, iIdx) {
  if (confirm(t("confirmDeleteItem"))) {
    syncMenuDataFromDOM();
    currentMenuData[cIdx].items.splice(iIdx, 1);
    markMenuDirty();
    renderMenuCategoryEditor(cIdx);
    renderMenuCategories();
  }
}

function addNewMenuItem() {
  handleSelectCreateType('standard_item');
}

function syncMenuDataFromDOM() {
  if (!currentMenuData) return;
  document.querySelectorAll("#menu-editor-body input[data-name-cidx]").forEach(inp => {
    const cIdx = parseInt(inp.getAttribute("data-name-cidx"), 10);
    const iIdx = parseInt(inp.getAttribute("data-name-iidx"), 10);
    if (currentMenuData[cIdx] && currentMenuData[cIdx].items[iIdx]) {
      currentMenuData[cIdx].items[iIdx].name = inp.value;
    }
  });
  document.querySelectorAll("#menu-editor-body input[data-cidx]").forEach(inp => {
    const cIdx = parseInt(inp.getAttribute("data-cidx"), 10);
    const iIdx = parseInt(inp.getAttribute("data-iidx"), 10);
    const val = inp.value.trim() === "" ? null : parseInt(inp.value, 10);
    if (currentMenuData[cIdx] && currentMenuData[cIdx].items[iIdx]) {
      currentMenuData[cIdx].items[iIdx].price = val;
    }
  });
  document.querySelectorAll("#menu-editor-body input[data-badge-cidx]").forEach(inp => {
    const cIdx = parseInt(inp.getAttribute("data-badge-cidx"), 10);
    const iIdx = parseInt(inp.getAttribute("data-badge-iidx"), 10);
    if (currentMenuData[cIdx] && currentMenuData[cIdx].items[iIdx]) {
      currentMenuData[cIdx].items[iIdx].badgeText = inp.value.trim();
    }
  });
  document.querySelectorAll("#menu-editor-body input[data-cust-name-cidx]").forEach(inp => {
    const cIdx = parseInt(inp.getAttribute("data-cust-name-cidx"), 10);
    const gIdx = parseInt(inp.getAttribute("data-cust-gidx"), 10);
    const oIdx = parseInt(inp.getAttribute("data-cust-oidx"), 10);
    if (currentMenuData[cIdx]?.groups?.[gIdx]?.options?.[oIdx]) {
      currentMenuData[cIdx].groups[gIdx].options[oIdx].name = inp.value.trim();
      if (currentMenuData[cIdx].type === 'modifier') {
        if (!currentMenuData[cIdx].items) currentMenuData[cIdx].items = [];
        if (currentMenuData[cIdx].items[oIdx]) {
          currentMenuData[cIdx].items[oIdx].name = inp.value.trim();
        }
      }
    }
  });
  document.querySelectorAll("#menu-editor-body input[data-cust-price-cidx]").forEach(inp => {
    const cIdx = parseInt(inp.getAttribute("data-cust-price-cidx"), 10);
    const gIdx = parseInt(inp.getAttribute("data-cust-gidx"), 10);
    const oIdx = parseInt(inp.getAttribute("data-cust-oidx"), 10);
    const val = inp.value.trim() === "" ? 0 : parseInt(inp.value, 10) || 0;
    if (currentMenuData[cIdx]?.groups?.[gIdx]?.options?.[oIdx]) {
      currentMenuData[cIdx].groups[gIdx].options[oIdx].price = val;
      if (currentMenuData[cIdx].type === 'modifier') {
        if (!currentMenuData[cIdx].items) currentMenuData[cIdx].items = [];
        if (currentMenuData[cIdx].items[oIdx]) {
          currentMenuData[cIdx].items[oIdx].price = val;
        }
      }
    }
  });
}

function serializeMenuData(categories) {
  const isCustomCat = c => Boolean(c && (c.type === 'order_customization' || c.id === 'sec-flavor' || c.slug === 'sec-flavor' || c.type === 'modifier' || (typeof isCustomizationCategory === 'function' && isCustomizationCategory(c))));
  const output = {};
  // Resolve every new item ID before serializing group assignments. This keeps
  // appliedItems and item_modifier_links on the same stable IDs regardless of
  // whether the customization section comes before or after its menu section.
  const temporaryItemIds = new Map();
  categories.forEach(cat => {
    if (isCustomCat(cat)) return;
    const names = new Set();
    (cat.items || []).forEach(item => {
      const name = String(item.name || '').trim();
      if (!name || item.price === null || item.price === undefined) return;
      if (names.has(name)) throw new Error(t('menuDuplicateItem'));
      names.add(name);
      if (!item.id) {
        item.id = `${getTenantIdFromUrl()}_item_${crypto.randomUUID()}`;
        temporaryItemIds.set(`${cat.id}:${item.name}`, String(item.id));
        temporaryItemIds.set(`${cat.id}:${name}`, String(item.id));
      }
    });
  });
  categories.filter(isCustomCat).forEach(cat => (cat.groups || []).forEach(group => {
    if (Array.isArray(group.appliedItems)) {
      group.appliedItems = [...new Set(group.appliedItems.map(id => temporaryItemIds.get(String(id)) || String(id)))];
    }
  }));

  const assignedOptionOwners = new Map();
  // Pass 1: Resolve unique option IDs for all groups across all customization categories to prevent cross-group ID collisions
  categories.filter(isCustomCat).forEach(cat => {
    (cat.groups || []).forEach(grp => {
      const stableGid = String(grp.canonicalId || grp.id || '');
      (grp.options || []).forEach((opt, oIdx) => {
        const rawId = String(opt.id || opt.name || `opt_${oIdx}`).trim();
        let uniqueOptId = rawId;
        if (assignedOptionOwners.has(uniqueOptId) && assignedOptionOwners.get(uniqueOptId) !== stableGid) {
          uniqueOptId = `mo_${stableGid}_${rawId}`;
        }
        assignedOptionOwners.set(uniqueOptId, stableGid);
        opt.id = uniqueOptId;
      });
    });
  });

  categories.forEach((cat, cIdx) => {
    const currentOrder = cat.sortOrder !== undefined ? cat.sortOrder : (cIdx + 1);
    if (cat.type === 'order_customization' || cat.id === 'sec-flavor') {
      if (cat.groups?.length && !cat.databaseId) cat.databaseId = `${getTenantIdFromUrl()}_${cat.id}`;
      output.__customizations = {
        id: cat.databaseId || cat.id,
        title: cat.title,
        shortName: cat.shortName || cat.title,
        sortOrder: currentOrder,
        groups: (cat.groups || []).map((grp, gIdx) => ({
          id: grp.id,
          source: grp.source || undefined,
          sourceId: grp.sourceId || undefined,
          canonicalId: grp.canonicalId || undefined,
          key: grp.key,
          minSelection: grp.minSelection,
          maxSelection: grp.maxSelection,
          title: grp.title,
          type: grp.type || 'radio',
          isRequired: Boolean(grp.isRequired),
          scope: grp.scope || 'order',
          appliedCategories: Array.isArray(grp.appliedCategories) ? grp.appliedCategories : [],
          appliedItems: Array.isArray(grp.appliedItems) ? grp.appliedItems : [],
          sortOrder: grp.sortOrder !== undefined ? grp.sortOrder : (gIdx + 1),
          options: (grp.options || []).map(opt => {
            const optPrice = Number(opt.price ?? opt.surcharge ?? 0);
            const optIsDefault = Boolean(opt.isDefault ?? opt.is_default);
            const optIsOos = Boolean(opt.isOos ?? opt.isOutOfStock ?? opt.is_out_of_stock);
            const optSubOptions = Array.isArray(opt.sub_options) ? opt.sub_options : (Array.isArray(opt.subOptions) ? opt.subOptions : []);
            return {
              ...opt,
              id: opt.id || opt.name,
              name: opt.name,
              surcharge: optPrice,
              price: optPrice,
              isDefault: optIsDefault,
              is_default: optIsDefault,
              is_out_of_stock: optIsOos,
              isOutOfStock: optIsOos,
              isOos: optIsOos,
              sub_options: optSubOptions,
              subOptions: optSubOptions
            };
          })
        }))
      };
      return;
    }
    output[cat.id] = {
      __title: cat.title,
      __short_name: cat.shortName || cat.title,
      __type: cat.type || 'catalog',
      __allow_customization: cat.allowCustomization !== false ? 1 : 0,
      __applied_modifiers: cat.appliedModifiers || (cat.allowCustomization === false ? [] : ['*']),
      __sort_order: currentOrder
    };
    cat.items.forEach((item, itemIdx) => {
        if (item.name && item.name.trim() !== "" && item.price !== null) {
          if (Object.prototype.hasOwnProperty.call(output[cat.id], item.name.trim())) throw new Error(t('menuDuplicateItem'));
        const serializedItem = {
          id: item.id,
          price: item.price,
          badge_text: item.badgeText || null,
          is_recommended: item.isRecommended ? 1 : 0,
          item_type: item.itemType || (item.bundleRule && item.bundleRule.groups && item.bundleRule.groups.length > 0 ? 'bundle' : 'standard'),
          sort_order: item.sortOrder !== undefined ? item.sortOrder : (item.sort_order !== undefined ? item.sort_order : (itemIdx + 1))
        };
        const sharedGroups = [];
        ((typeof currentMenuData !== 'undefined' ? currentMenuData : categories) || []).filter(c => isCustomCat(c)).forEach(customCat => {
          (customCat.groups || []).forEach(group => {
            sharedGroups.push({ customCat, group });
          });
        });
        const sharedGroupIds = new Set(sharedGroups.flatMap(({ group }) => [
          String(group.id), String(group.canonicalId || ''),
          group.id && String(group.id).startsWith('mg_') ? String(group.id).slice(3) : `mg_${group.id}`
        ]));
        const linkedGroups = (Array.isArray(item.modifierGroups) ? item.modifierGroups : []).filter(link =>
          !sharedGroupIds.has(String(link.id || link.groupId || link.group_id))
        );
        sharedGroups.forEach(({ customCat, group }) => {
          const itemKey = String(item.id || `${cat.id}:${item.name}`);
          if (!(group.appliedItems || []).includes(itemKey)) return;
          const linkedGroupId = group.canonicalId || group.id;
          if (linkedGroups.some(link => String(link.id || link.groupId || link.group_id) === String(linkedGroupId))) return;
          linkedGroups.push({
            id: linkedGroupId,
            name: group.title,
            selectionType: group.type === 'checkbox' ? 'multiple' : 'single',
            isRequired: Boolean(group.isRequired),
            minSelection: group.minSelection,
            maxSelection: group.maxSelection,
            sortOrder: group.sortOrder || 0,
            options: (group.options || []).map(option => {
              const optPrice = Number(option.price ?? option.surcharge ?? 0);
              const optIsDefault = Boolean(option.isDefault ?? option.is_default);
              const optIsOos = Boolean(option.isOos ?? option.isOutOfStock ?? option.is_out_of_stock);
              const optSubOptions = Array.isArray(option.sub_options) ? option.sub_options : (Array.isArray(option.subOptions) ? option.subOptions : []);
              return {
                ...option,
                id: option.id || option.name,
                name: option.name,
                price: optPrice,
                surcharge: optPrice,
                isDefault: optIsDefault,
                is_default: optIsDefault,
                isOutOfStock: optIsOos,
                is_out_of_stock: optIsOos,
                isOos: optIsOos,
                subOptions: optSubOptions,
                sub_options: optSubOptions
              };
            })
          });
        });
        linkedGroups.forEach(grp => {
          if (Array.isArray(grp.options)) {
            grp.options = grp.options.map(option => {
              const optPrice = Number(option.price ?? option.surcharge ?? 0);
              const optIsDefault = Boolean(option.isDefault ?? option.is_default);
              const optIsOos = Boolean(option.isOos ?? option.isOutOfStock ?? option.is_out_of_stock);
              const optSubOptions = Array.isArray(option.sub_options) ? option.sub_options : (Array.isArray(option.subOptions) ? option.subOptions : []);
              return {
                ...option,
                id: option.id || option.name,
                name: option.name,
                price: optPrice,
                surcharge: optPrice,
                isDefault: optIsDefault,
                is_default: optIsDefault,
                isOutOfStock: optIsOos,
                is_out_of_stock: optIsOos,
                isOos: optIsOos,
                subOptions: optSubOptions,
                sub_options: optSubOptions
              };
            });
          }
        });
        if (Array.isArray(item.modifierGroups) || linkedGroups.length > 0) {
          serializedItem.modifier_groups = linkedGroups;
        }
        output[cat.id][item.name.trim()] = serializedItem;
      }
    });
  });
  return output;
}

// Deletions are computed only against the fully loaded editor snapshot, never
// against whatever happens to exist on the server when this request arrives.
function getMenuDeletions(before, after) {
  const isCustomCat = c => Boolean(c && (c.type === 'order_customization' || c.id === 'sec-flavor' || c.slug === 'sec-flavor' || c.type === 'modifier' || (typeof isCustomizationCategory === 'function' && isCustomizationCategory(c))));
  const remainingCategories = new Set(after.map(cat => cat.id));
  const remainingItems = new Set(after.flatMap(cat => (cat.items || []).map(item => item.id)));
  const remainingGroups = new Set(after.flatMap(cat => (cat.groups || []).map(group => group.id)));
  return {
    categories: before.filter(cat => !isCustomCat(cat) && !remainingCategories.has(cat.id))
      .map(cat => cat.databaseId || cat.id).filter(Boolean),
    items: before.filter(cat => remainingCategories.has(cat.id)).flatMap(cat =>
      (cat.items || []).filter(item => item.id && !remainingItems.has(item.id)).map(item => item.id)),
    customizations: before.flatMap(cat =>
      (cat.groups || []).filter(group => group.id && !remainingGroups.has(group.id)).map(group => group.id))
  };
}

async function saveMenuData(skipConfirm = false) {
  if (!isMenuLoadedCompletely) { alert(t('menuIncompleteReload')); return; }
  if (!currentMenuData || isMenuSaving || isStockSaving) return;
  if (!skipConfirm && !confirm(t("confirmSaveMenu"))) return;
  syncMenuDataFromDOM();
  let output;
  try {
    output = serializeMenuData(currentMenuData);
    output.__delete = getMenuDeletions(JSON.parse(savedMenuSnapshot || '[]'), currentMenuData);
  } catch (error) {
    alert(t('menuSaveFail') + error.message);
    return;
  }
  isMenuSaving = true;
  updateMenuSaveState();
  const editor = document.getElementById("menu-editor-body");
  if (editor) editor.inert = true;
  document.querySelectorAll(".menu-header-actions, #menu-categories, #menu-order-panels").forEach(el => el.inert = true);

  try {
    const res = await fetch(`${WORKER_BASE}/api/menu?tenant_id=${getTenantIdFromUrl()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(output)
    });
    if (!res.ok) {
      const details = await res.json().catch(() => null);
      const code = details?.code || details?.error || '';
      throw new Error(`API returned ${res.status}${code ? ` (${code})` : ''}`);
    }
    if (window.UnifiedMenu?.enabled) await window.UnifiedMenu.load();
    clearMenuDirty();
    if (isCategoryManagerOpen) {
      captureMenuDisplayOrder();
    }
    try {
      const tid = getTenantIdFromUrl();
      localStorage.removeItem("tenant_customizations_" + tid);
    } catch(e) {}
    if (typeof updatePosCatalogPriceMap === 'function') {
      updatePosCatalogPriceMap(currentMenuData);
    }
    if (!skipConfirm) {
      alert(t("menuSaveSuccess"));
    }
    renderMenuCategories();
  } catch (e) {
    alert(t("menuSaveFail") + e.message);
  } finally {
    isMenuSaving = false;
    if (editor) editor.inert = false;
    document.querySelectorAll(".menu-header-actions, #menu-categories, #menu-order-panels").forEach(el => el.inert = false);
    updateMenuSaveState();
  }
}

function toggleCategoryModifierItem(catIndex, modId, isChecked) {
  if (!currentMenuData || !currentMenuData[catIndex]) return;
  syncMenuDataFromDOM();
  const cat = currentMenuData[catIndex];
  const storeMods = getStoreModifiersList();
  const targetMod = storeMods.find(m => m.id === modId);

  if (targetMod && targetMod.type === 'customization' && targetMod.group) {
    if (!Array.isArray(targetMod.group.appliedCategories)) targetMod.group.appliedCategories = [];
    const catIdentifier = cat.id;
    if (isChecked) {
      if (!targetMod.group.appliedCategories.includes(catIdentifier)) {
        targetMod.group.appliedCategories.push(catIdentifier);
      }
      targetMod.group.scope = 'category';
    } else {
      targetMod.group.appliedCategories = targetMod.group.appliedCategories.filter(id => id !== catIdentifier && id !== cat.databaseId);
    }
  } else {
    const allLegacyMods = storeMods.filter(m => m.type === 'modifier').map(m => m.id);
    let currentList = [];
    if (!cat.appliedModifiers || cat.appliedModifiers.includes('*')) {
      currentList = [...allLegacyMods];
    } else {
      currentList = [...cat.appliedModifiers];
    }

    if (isChecked) {
      if (!currentList.includes(modId)) currentList.push(modId);
    } else {
      currentList = currentList.filter(id => id !== modId);
    }

    cat.appliedModifiers = (allLegacyMods.length > 0 && currentList.length === allLegacyMods.length) ? ['*'] : currentList;
    cat.allowCustomization = currentList.length > 0;
  }

  markMenuDirty();
  renderMenuCategoryEditor(catIndex);
}

function selectAllCategoryModifiers(catIndex, selectAll) {
  if (!currentMenuData || !currentMenuData[catIndex]) return;
  syncMenuDataFromDOM();
  const cat = currentMenuData[catIndex];
  const storeMods = getStoreModifiersList();

  cat.appliedModifiers = selectAll ? ['*'] : [];
  cat.allowCustomization = selectAll;

  storeMods.forEach(mod => {
    if (mod.type === 'customization' && mod.group) {
      if (!Array.isArray(mod.group.appliedCategories)) mod.group.appliedCategories = [];
      const catIdentifier = cat.id;
      if (selectAll) {
        if (!mod.group.appliedCategories.includes(catIdentifier)) {
          mod.group.appliedCategories.push(catIdentifier);
        }
        mod.group.scope = 'category';
      } else {
        mod.group.appliedCategories = mod.group.appliedCategories.filter(id => id !== catIdentifier && id !== cat.databaseId);
      }
    }
  });

  markMenuDirty();
  renderMenuCategoryEditor(catIndex);
}

// --- Category Management ---
function openAddCategoryModal(defaultType = "catalog") {
  if (!confirmLeaveMenu()) return;
  const inp = document.getElementById("add-cat-input-name");
  if (inp) inp.value = "";
  const typeSelect = document.getElementById("add-cat-select-type");
  if (typeSelect) {
    typeSelect.value = defaultType;
    if (typeof onAddCategoryTypeChange === 'function') {
      onAddCategoryTypeChange();
    }
  }

  const modContainer = document.getElementById("add-cat-modifiers-list");
  const storeMods = getStoreModifiersList();
  if (modContainer) {
    if (storeMods.length === 0) {
      modContainer.innerHTML = `<div style="font-size: var(--pos-text-meta); color: #94a3b8;">${t("noModifiersInStore")}</div>`;
    } else {
      modContainer.innerHTML = storeMods.map(mod => `
        <label style="display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; min-height: 44px; background: #fff; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: var(--pos-text-meta); font-weight: 700; cursor: pointer; color: #334155;">
          <input type="checkbox" name="add-cat-mod" value="${escapeHtml(mod.id)}" checked style="width: 18px; height: 18px; accent-color: #10b981;">
          <span>${escapeHtml(mod.title)}</span>
        </label>
      `).join('');
    }
  }

  const group = document.getElementById("add-cat-customization-group");
  if (group) group.style.display = "block";

  const shortInp = document.getElementById("add-cat-input-short-name");
  if (shortInp) shortInp.value = "";

  const modal = document.getElementById("addCategoryModal");
  if (modal) {
    modal.style.display = "flex";
    // Let the user choose when to open the keyboard on a tablet.
    const body = modal.querySelector(".modal-body");
    if (body) body.scrollTop = 0;
    updateAddCategoryViewport();
  }
}

function updateAddCategoryViewport() {
  const modal = document.getElementById("addCategoryModal");
  if (!modal || modal.style.display === "none") return;
  const viewport = window.visualViewport;
  modal.style.height = `${viewport ? viewport.height : window.innerHeight}px`;
  modal.style.top = `${viewport ? viewport.offsetTop : 0}px`;
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateAddCategoryViewport);
  window.visualViewport.addEventListener("scroll", updateAddCategoryViewport);
}

function onAddCategoryTypeChange() {
  const typeSelect = document.getElementById("add-cat-select-type");
  const group = document.getElementById("add-cat-customization-group");
  const nameInp = document.getElementById("add-cat-input-name");
  const shortInp = document.getElementById("add-cat-input-short-name");
  if (group && typeSelect) {
    group.style.display = typeSelect.value === "catalog" ? "block" : "none";
  }
  if (typeSelect && typeSelect.value === "order_customization") {
    if (nameInp && !nameInp.value.trim()) {
      nameInp.value = currentLang === 'vi' ? 'Tùy chọn khẩu vị & biến thể' : '口味與客製化選擇';
    }
    if (shortInp && !shortInp.value.trim()) {
      shortInp.value = currentLang === 'vi' ? 'Khẩu vị' : '口味選擇';
    }
  }
}

function closeAddCategoryModal() {
  const modal = document.getElementById("addCategoryModal");
  if (modal) modal.style.display = "none";
  const inp = document.getElementById("add-cat-input-name");
  if (inp) inp.value = "";
  const shortInp = document.getElementById("add-cat-input-short-name");
  if (shortInp) shortInp.value = "";
}

async function confirmAddCategory() {
  const inp = document.getElementById("add-cat-input-name");
  const name = inp ? inp.value.trim() : "";
  if (!name) {
    alert(t("promptCategoryNameEmpty"));
    return;
  }
  const typeSelect = document.getElementById("add-cat-select-type");
  const type = typeSelect ? typeSelect.value : "catalog";

  const shortInp = document.getElementById("add-cat-input-short-name");
  const shortName = (shortInp && shortInp.value.trim()) ? shortInp.value.trim() : name;

  if (type === "order_customization") {
    if (currentMenuData && currentMenuData.some(c => c.type === 'order_customization' || c.id === 'sec-flavor')) {
      alert(currentLang === 'vi' ? 'Đã tồn tại phân loại Tùy biến toàn đơn!' : '已存在整單客製化分類！');
      return;
    }
    if (!currentMenuData) currentMenuData = [];
    syncMenuDataFromDOM();

    const newCat = {
      id: 'sec-flavor',
      title: name || (currentLang === 'vi' ? 'Tùy chọn khẩu vị & biến thể' : '口味與客製化選擇'),
      shortName: shortName || (currentLang === 'vi' ? 'Khẩu vị' : '口味選擇'),
      type: 'order_customization',
      allowCustomization: false,
      appliedModifiers: [],
      groups: [],
      items: []
    };

    currentMenuData.push(newCat);
    markMenuDirty();
    closeAddCategoryModal();
    renderMenuCategories();

    if (isCategoryManagerOpen) {
      renderCategoriesManagerView();
    } else {
      activeCategoryIndex = currentMenuData.length - 1;
      renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), newCat, activeCategoryIndex);
    }
    return;
  }

  const selectedMods = [];
  document.querySelectorAll('input[name="add-cat-mod"]:checked').forEach(cb => {
    selectedMods.push(cb.value);
  });
  const allModsCount = getStoreModifiersList().length;
  const appliedMods = (allModsCount > 0 && selectedMods.length === allModsCount) ? ['*'] : selectedMods;
  const allowCust = type === "catalog" ? (selectedMods.length > 0) : false;

  // Generate clean unique slug
  let baseSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/_+/g, '');
  if (!baseSlug) baseSlug = "cat";
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  if (!currentMenuData) currentMenuData = [];
  syncMenuDataFromDOM();

  const newCat = {
    id: slug,
    title: name,
    shortName: shortName,
    type: type,
    allowCustomization: allowCust,
    appliedModifiers: appliedMods,
    items: []
  };

  currentMenuData.push(newCat);
  markMenuDirty();
  closeAddCategoryModal();
  renderMenuCategories();

  if (isCategoryManagerOpen) {
    renderCategoriesManagerView();
  } else {
    activeCategoryIndex = currentMenuData.length - 1;
    renderMenuCategoryEditor(activeCategoryIndex);
  }

  // A new category remains a draft until the explicit Save action.
  markMenuDirty();
}

async function promptRenameCategoryAtIndex(idx) {
  if (!currentMenuData || !currentMenuData[idx]) return;
  const currentCat = currentMenuData[idx];
  const newTitle = prompt(t("promptCategoryNamePrompt"), currentCat.title);
  if (newTitle !== null) {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      alert(t("promptCategoryNameEmpty"));
      return;
    }
    syncMenuDataFromDOM();
    currentCat.title = trimmed;
    currentCat.shortName = trimmed;
    markMenuDirty();
    renderMenuCategories();
    if (isCategoryManagerOpen) {
      renderCategoriesManagerView();
    } else {
      renderMenuCategoryEditor(idx);
    }
    // Auto-save immediately to database & refresh edge cache
    await saveMenuData(true);
  }
}

async function deleteCategoryAtIndex(idx) {
  if (!isMenuLoadedCompletely) { alert(t('menuIncompleteReload')); return; }
  if (isMenuSaving || !currentMenuData || !currentMenuData[idx]) return;
  const cat = currentMenuData[idx];
  if (!confirm(t("confirmDeleteCategory", { name: cat.title }))) return;

  syncMenuDataFromDOM();
  // Persist only the deletion. Other unsaved edits must remain drafts.
  const saved = savedMenuSnapshot ? JSON.parse(savedMenuSnapshot) : [];
  if (saved.some(entry => entry.id === cat.id)) {
    isMenuSaving = true;
    updateMenuSaveState();
    const panels = document.querySelectorAll('.menu-split');
    panels.forEach(el => { el.inert = true; });
    try {
      const remaining = saved.filter(entry => entry.id !== cat.id);
      const res = await fetch(`${WORKER_BASE}/api/menu?tenant_id=${getTenantIdFromUrl()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ __delete: getMenuDeletions(saved, remaining) })
      });
      if (!res.ok) throw new Error('API returned ' + res.status);
      savedMenuSnapshot = JSON.stringify(remaining);
    } catch (error) {
      alert(t('menuSaveFail') + error.message);
      return;
    } finally {
      isMenuSaving = false;
      panels.forEach(el => { el.inert = false; });
      updateMenuSaveState();
    }
  }
  currentMenuData.splice(idx, 1);
  checkMenuDirty();
  renderMenuCategories();

  if (isCategoryManagerOpen) {
    renderCategoriesManagerView();
  } else {
    activeCategoryIndex = -1;
    setMenuMobileView('master');
    const titleEl = document.getElementById("menu-editor-title");
    if (titleEl) titleEl.innerText = t("menuEditorTitle");
    const bodyEl = document.getElementById("menu-editor-body");
    if (bodyEl) bodyEl.innerHTML = `<div style="text-align:center; padding: 22px; color:#999;" id="i18n-menu-select-prompt">${t("menuSelectPrompt")}</div>`;
    
    const renameBtn = document.getElementById("btn-category-rename");
    const deleteBtn = document.getElementById("btn-category-delete");
    if (renameBtn) renameBtn.style.display = "none";
    if (deleteBtn) deleteBtn.style.display = "none";
  }


}

function promptRenameCategory() {
  if (activeCategoryIndex >= 0) {
    promptRenameCategoryAtIndex(activeCategoryIndex);
  }
}

function deleteActiveCategory() {
  if (activeCategoryIndex >= 0) {
    deleteCategoryAtIndex(activeCategoryIndex);
  }
}

// --- Image Management ---
let currentImageItemName = null;

async function openImageModal(categoryId, itemName) {
  currentImageItemName = `${categoryId}_${itemName}`;
  document.getElementById("image-modal-title").innerText = t("imageModalItem", { name: itemName });
  document.getElementById("image-preview").style.display = "none";
  document.getElementById("btn-delete-image").style.display = "none";
  document.getElementById("image-status").innerText = t("imageChecking");

  document.getElementById("imageModal").style.display = "flex";

  try {
    const res = await fetch(`${WORKER_BASE}/api/image_list?tenant_id=${getTenantIdFromUrl()}&_t=${Date.now()}`);
    if (res.ok) {
      const list = await res.json();
      const hasImg = list.includes(currentImageItemName) || list.includes(itemName);
      if (hasImg) {
        const resolvedName = list.includes(currentImageItemName) ? currentImageItemName : itemName;
        document.getElementById("image-preview").src = `${WORKER_BASE}/api/image?tenant_id=${getTenantIdFromUrl()}&name=${encodeURIComponent(resolvedName)}&_t=${Date.now()}`;
        document.getElementById("image-preview").style.display = "block";
        document.getElementById("btn-delete-image").style.display = "block";
        document.getElementById("image-status").innerText = t("imageHasImage");
      } else {
        document.getElementById("image-status").innerText = t("imageNoImage");
      }
    }
  } catch (e) {
    document.getElementById("image-status").innerText = t("imageLoadFail");
  }
}

function handleImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      // Resize if too large
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // Get base64 (webp is usually smaller)
      const dataUri = canvas.toDataURL("image/webp", 0.8);
      uploadImage(dataUri);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = ''; // reset
}

async function uploadImage(dataUri) {
  document.getElementById("image-status").innerText = t("imageUploading");
  try {
    const res = await fetch(`${WORKER_BASE}/api/image?tenant_id=${getTenantIdFromUrl()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: currentImageItemName, dataUri })
    });
    if (!res.ok) throw new Error("Upload failed");

    document.getElementById("image-preview").src = dataUri;
    document.getElementById("image-preview").style.display = "block";
    document.getElementById("btn-delete-image").style.display = "block";
    document.getElementById("image-status").innerText = t("imageUploadSuccess");
  } catch (e) {
    alert(t("imageUploadFail") + e.message);
    document.getElementById("image-status").innerText = t("imageLoadFail");
  }
}

async function deleteItemImage() {
  if (!confirm(t("confirmDeleteImage"))) return;
  const statusEl = document.getElementById("image-status");
  const previewEl = document.getElementById("image-preview");
  const deleteBtn = document.getElementById("btn-delete-image");

  if (statusEl) statusEl.innerText = t("imageDeleting");
  try {
    const tenantId = getTenantIdFromUrl();
    const res = await fetch(`${WORKER_BASE}/api/image?tenant_id=${tenantId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: currentImageItemName })
    });
    if (!res.ok) throw new Error("Delete failed");

    if (previewEl) {
      previewEl.src = "";
      previewEl.style.display = "none";
    }
    if (deleteBtn) deleteBtn.style.display = "none";
    if (statusEl) statusEl.innerText = t("imageNoImage");
  } catch (e) {
    alert(t("imageDeleteFail") + e.message);
    if (statusEl) statusEl.innerText = t("imageLoadFail");
  }
}

// --- Stock Management ---
let currentStockCidx = null;
let currentStockIidx = null;
let currentStockGidx = null;
let currentStockOidx = null;

function openStockModal(cIdx, iIdx) {
  if (isStockSaving || isMenuSaving) return;
  // Sync changes currently typed in DOM
  syncMenuDataFromDOM();

  currentStockCidx = cIdx;
  currentStockIidx = iIdx;
  currentStockGidx = null;
  currentStockOidx = null;

  const item = currentMenuData[cIdx].items[iIdx];
  document.getElementById("stock-modal-title").innerText = t("stockModalItem", { name: item.name });

  // Set values
  const statusSelect = document.getElementById("stock-status-select");
  statusSelect.value = item.isOos ? "out_of_stock" : "in_stock";

  // Reset duration & date
  document.getElementById("stock-duration-select").value = "today";
  document.getElementById("oos-until-date").value = "";

  handleStockStatusChange();

  document.getElementById("stockModal").style.display = "flex";
}

function openStockModalForCustomization(cIdx, gIdx, oIdx) {
  if (isStockSaving || isMenuSaving) return;
  syncMenuDataFromDOM();
  currentStockCidx = cIdx;
  currentStockIidx = null;
  currentStockGidx = gIdx;
  currentStockOidx = oIdx;

  const group = currentMenuData[cIdx]?.groups?.[gIdx];
  const option = group?.options?.[oIdx];
  if (!group || !option) return;

  const titleEl = document.getElementById("stock-modal-title");
  if (titleEl) titleEl.innerText = t("stockModalItem", { name: `${group.title} - ${option.name}` });

  const statusSelect = document.getElementById("stock-status-select");
  if (statusSelect) statusSelect.value = option.isOos ? "out_of_stock" : "in_stock";

  const durationSelect = document.getElementById("stock-duration-select");
  if (durationSelect) durationSelect.value = "today";
  const untilDateInput = document.getElementById("oos-until-date");
  if (untilDateInput) untilDateInput.value = "";

  handleStockStatusChange();
  const modal = document.getElementById("stockModal");
  if (modal) modal.style.display = "flex";
}
window.openStockModalForCustomization = openStockModalForCustomization;

function closeStockModal() {
  if (isStockSaving) return;
  document.getElementById("stockModal").style.display = "none";
  currentStockCidx = null;
  currentStockIidx = null;
  currentStockGidx = null;
  currentStockOidx = null;
}

function handleStockStatusChange() {
  const status = document.getElementById("stock-status-select").value;
  const optionsContainer = document.getElementById("oos-options-container");
  if (status === "out_of_stock") {
    optionsContainer.style.display = "block";
  } else {
    optionsContainer.style.display = "none";
  }
  handleStockDurationChange();
}

function handleStockDurationChange() {
  const duration = document.getElementById("stock-duration-select").value;
  const dateContainer = document.getElementById("oos-date-container");
  const status = document.getElementById("stock-status-select").value;

  if (status === "out_of_stock" && duration === "multiple_days") {
    dateContainer.style.display = "block";
  } else {
    dateContainer.style.display = "none";
  }
}

async function saveStockStatus() {
  if (isStockSaving || isMenuSaving) return;
  const isCustom = (currentStockGidx !== null && currentStockOidx !== null);
  if (currentStockCidx === null || (!isCustom && currentStockIidx === null)) return;

  // Sync current data from DOM
  syncMenuDataFromDOM();

  const status = document.getElementById("stock-status-select").value;
  const duration = document.getElementById("stock-duration-select").value;
  const untilDate = document.getElementById("oos-until-date").value;

  if (status === "out_of_stock" && duration === "multiple_days" && !untilDate) {
    alert(t("alertSelectOosDate"));
    return;
  }

  let body;
  let targetItem;
  const targetCidx = currentStockCidx;
  const targetCategory = currentMenuData[targetCidx];
  const targetGroup = isCustom ? targetCategory.groups?.[currentStockGidx] : null;

  if (isCustom) {
    const group = currentMenuData[currentStockCidx]?.groups?.[currentStockGidx];
    targetItem = group?.options?.[currentStockOidx];
    if (!targetItem) return;
    const cat = currentMenuData[currentStockCidx];
    body = {
      category_slug: (cat.type === 'modifier' ? cat.id : 'order_customization'),
      customization_key: group.key || group.id,
      name: targetItem.originalName || targetItem.name,
      status: status,
      duration: duration,
      until_date: untilDate ? `${untilDate}T04:00:00+07:00` : null
    };
  } else {
    const categorySlug = currentMenuData[currentStockCidx].id;
    targetItem = currentMenuData[currentStockCidx].items[currentStockIidx];
    body = {
      category_slug: categorySlug,
      name: targetItem.originalName || targetItem.name,
      status: status,
      duration: duration,
      until_date: untilDate ? `${untilDate}T04:00:00+07:00` : null
    };
  }

  isStockSaving = true;
  updateStockSaveState();
  try {
    const res = await fetch(`${WORKER_BASE}/api/menu/stock-status?tenant_id=${getTenantIdFromUrl()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Update failed");
    }
  } catch (e) {
    alert(t("stockUpdateFail") + e.message);
    return;
  } finally {
    isStockSaving = false;
    updateStockSaveState();
  }

  // Stock is already persisted: rebase only its fields, preserving other drafts.
  applySavedStockStatus(targetCategory, targetGroup, targetItem, status === "out_of_stock");
  closeStockModal();
  const categoryIndex = currentMenuData.indexOf(targetCategory);
  renderMenuCategories();
  if (categoryIndex >= 0) {
    if (isCustom) {
      renderOrderCustomizationEditor(document.getElementById("menu-editor-body"), targetCategory, categoryIndex);
    } else {
      renderMenuCategoryEditor(categoryIndex);
    }
  }
  checkMenuDirty();
  // Refresh the Unified editor's separate catalog without replacing menu drafts.
  if (window.UnifiedMenu?.enabled) {
    try { await window.UnifiedMenu.load(); } catch { /* The stock write already succeeded. */ }
  }
}

function updateStockSaveState() {
  for (const id of ['btn-stock-save', 'btn-stock-cancel', 'stock-status-select', 'stock-duration-select', 'oos-until-date']) {
    const control = document.getElementById(id);
    if (control) control.disabled = isStockSaving;
  }
  const button = document.getElementById('btn-stock-save');
  if (button) button.textContent = t(isStockSaving ? 'menuSaving' : 'btnStockSave');
  document.getElementById('stockModal')?.setAttribute('aria-busy', String(isStockSaving));
  updateMenuSaveState();
}

function applySavedStockStatus(category, group, target, isOos) {
  const sameItem = item => item.id && target.id
    ? String(item.id) === String(target.id)
    : (item.originalName || item.name) === (target.originalName || target.name);
  const groupIds = new Set(group ? [group.id, group.canonicalId, group.sourceId, group.key].filter(Boolean).map(String) : []);
  const sameGroup = candidate => [candidate.id, candidate.groupId, candidate.group_id, candidate.canonicalId, candidate.sourceId, candidate.key]
    .some(id => id && groupIds.has(String(id)));
  const update = item => {
    item.isOos = isOos;
    for (const key of ['isOutOfStock', 'is_out_of_stock']) {
      if (Object.prototype.hasOwnProperty.call(item, key)) item[key] = isOos;
    }
    if (!isOos) {
      for (const key of ['outOfStockUntil', 'out_of_stock_until']) {
        if (Object.prototype.hasOwnProperty.call(item, key)) item[key] = null;
      }
    }
  };
  const updateGroup = candidate => {
    for (const option of candidate.options || []) {
      if (group ? sameGroup(candidate) && sameItem(option)
        : target.id && String(option.productId || option.product_id || '') === String(target.id)) update(option);
    }
  };
  const saved = savedMenuSnapshot ? JSON.parse(savedMenuSnapshot) : null;
  for (const data of [currentMenuData, saved]) {
    for (const candidate of data || []) {
      if (candidate.id === category.id) {
        (candidate.items || []).filter(sameItem).forEach(update);
      }
      (candidate.groups || []).forEach(updateGroup);
      for (const item of candidate.items || []) (item.modifierGroups || []).forEach(updateGroup);
    }
  }
  menuModifierLibrary.forEach(updateGroup);
  if (saved) savedMenuSnapshot = canonicalMenuSnapshot(saved);
}

// Position disclosures in viewport coordinates, outside the category columns.
document.addEventListener('toggle', event => {
  const help = event.target;
  if (!help.matches?.('.menu-help') || !help.open) return;
  const text = help.querySelector('.menu-help-text');
  if (!text) return;
  const anchor = help.getBoundingClientRect();
  text.style.right = 'auto';
  text.style.maxWidth = (window.innerWidth - 24) + 'px';
  text.style.left = Math.max(12, Math.min(anchor.left, window.innerWidth - text.offsetWidth - 12)) + 'px';
  text.style.top = Math.max(12, Math.min(anchor.bottom, window.innerHeight - text.offsetHeight - 12)) + 'px';
}, true);

// ==========================================================================
// POS Menu Bundle / Combo Editor Controller
// ==========================================================================

let bundleEditingTarget = null; // { catIndex, itemIndex, item }
let bundleDraftRule = null; // { version: 1, groups: [...] }
let bundleActiveGroupIndex = 0;
let bundleSourceTab = 'category'; // 'category' | 'items'

async function openBundleEditorModal(catIdx, itemIdx) {
  if (window.UnifiedMenu?.enabled) return window.UnifiedMenu.product(catIdx, itemIdx);
  if (isMenuDirty) syncMenuDataFromDOM();
  if (!currentMenuData || !currentMenuData[catIdx] || !currentMenuData[catIdx].items[itemIdx]) return;

  const targetItem = currentMenuData[catIdx].items[itemIdx];
  if (!targetItem.name || targetItem.name.trim() === '') {
    alert(t("bundleValidationEmptyName") || "請先填寫菜單項目名稱");
    return;
  }

  // If item is freshly added and hasn't been saved to D1 yet, prompt to save
  if (isMenuDirty && !targetItem.id) {
    const shouldSave = confirm(currentLang === 'vi' 
      ? "Món mới cần được lưu vào hệ thống trước khi thiết lập Combo. Bạn có muốn lưu thực đơn ngay bây giờ không?" 
      : "新建立的菜單項目需先儲存至資料庫方可設定組合，是否立即儲存？");
    if (shouldSave) {
      await saveMenuData(true);
    } else {
      return;
    }
  }

  bundleEditingTarget = {
    catIndex: catIdx,
    itemIndex: itemIdx,
    item: currentMenuData[catIdx].items[itemIdx]
  };

  if (targetItem.bundleRule && Array.isArray(targetItem.bundleRule.groups) && targetItem.bundleRule.groups.length > 0) {
    bundleDraftRule = JSON.parse(JSON.stringify(targetItem.bundleRule));
    // Ensure group properties
    bundleDraftRule.groups.forEach((grp, idx) => {
      grp.id = grp.id || `group_${idx + 1}_${Date.now()}`;
      if (!grp.label || typeof grp.label !== 'object') {
        grp.label = {
          "zh-TW": grp.name || `自選分組 #${idx + 1}`,
          "vi": grp.name || `Nhóm chọn #${idx + 1}`
        };
      }
      grp.minQuantity = Math.max(1, Number(grp.minQuantity || 1));
      grp.maxQuantity = Math.max(grp.minQuantity, Number(grp.maxQuantity || grp.minQuantity));
      grp.allowRepeats = grp.allowRepeats !== undefined ? Boolean(grp.allowRepeats) : (grp.allowRepeat !== undefined ? Boolean(grp.allowRepeat) : true);
      grp.sources = Array.isArray(grp.sources) ? grp.sources : [];

      // Auto-populate sources if missing from eligibleItems or items
      if (grp.sources.length === 0) {
        if (Array.isArray(grp.eligibleItems) && grp.eligibleItems.length > 0) {
          grp.sources.push({
            type: 'item_list',
            itemIds: grp.eligibleItems.map(it => it.id || it.itemId || it.name).filter(Boolean)
          });
        } else if (Array.isArray(grp.items) && grp.items.length > 0) {
          grp.sources.push({
            type: 'item_list',
            itemIds: grp.items.map(it => it.itemId || it.id || it.name).filter(Boolean)
          });
        }
      }
    });
  } else {
    // Default initial bundle structure with 1 group
    bundleDraftRule = {
      version: 1,
      groups: [
        {
          id: `group_1_${Date.now()}`,
          label: {
            "zh-TW": "請選擇 1 樣餐點",
            "vi": "Chọn 1 món"
          },
          name: "請選擇 1 樣餐點",
          minQuantity: 1,
          maxQuantity: 1,
          allowRepeats: false,
          sources: []
        }
      ]
    };
  }

  bundleActiveGroupIndex = 0;
  const firstGrp = bundleDraftRule?.groups?.[0];
  if (firstGrp && firstGrp.sources && firstGrp.sources.some(s => s.type === 'category')) {
    bundleSourceTab = 'category';
  } else if (firstGrp && firstGrp.sources && firstGrp.sources.some(s => s.type === 'item_list' || s.type === 'items')) {
    bundleSourceTab = 'items';
  } else {
    bundleSourceTab = 'category';
  }

  // Set modal header details
  const nameEl = document.getElementById("bundle-modal-item-name");
  if (nameEl) nameEl.textContent = targetItem.name;
  const priceEl = document.getElementById("bundle-modal-item-price");
  if (priceEl) priceEl.textContent = `$${targetItem.price !== null && targetItem.price !== undefined ? targetItem.price : 0}`;

  // Show/hide remove combo button & danger zone card
  const removeBtn = document.getElementById("btn-bundle-remove-config");
  const dangerZoneCard = document.getElementById("bundle-danger-zone-card");
  const isExistingCombo = Boolean(targetItem.bundleRule && targetItem.bundleRule.groups?.length > 0);
  if (removeBtn) {
    removeBtn.style.display = isExistingCombo ? "inline-flex" : "none";
  }
  if (dangerZoneCard) {
    dangerZoneCard.style.display = isExistingCombo ? "flex" : "none";
  }

  const modal = document.getElementById("modal-bundle-editor");
  if (modal) {
    modal.style.display = "flex";
    const body = document.getElementById("bundle-editor-modal-body");
    if (body) body.scrollTop = 0;
  }

  renderBundleEditorSidebar();
  renderBundleGroupConfigPanel();
}
window.openBundleEditorModal = openBundleEditorModal;

function closeBundleEditorModal() {
  const modal = document.getElementById("modal-bundle-editor");
  if (modal) modal.style.display = "none";
  const returnState = window._hubModalReturnState;
  bundleEditingTarget = null;
  bundleDraftRule = null;
  bundleActiveGroupIndex = 0;
  checkMenuDirty();
  if (returnState) {
    window._hubModalReturnState = null;
    openItemDetailModal(returnState.catIdx, returnState.itemIdx);
  }
}
window.closeBundleEditorModal = closeBundleEditorModal;

function syncBundleCurrentGroupFromDOM() {
  if (!bundleDraftRule || !bundleDraftRule.groups[bundleActiveGroupIndex]) return;
  const grp = bundleDraftRule.groups[bundleActiveGroupIndex];
  const zhInp = document.getElementById("bundle-group-name-zh");
  const viInp = document.getElementById("bundle-group-name-vi");
  if (zhInp) grp.label["zh-TW"] = zhInp.value;
  if (viInp) grp.label["vi"] = viInp.value;
  grp.name = grp.label["zh-TW"] || grp.label["vi"] || grp.name;
}

function renderBundleEditorSidebar() {
  const listEl = document.getElementById("bundle-groups-list");
  const badgeEl = document.getElementById("bundle-group-count-badge");
  if (!listEl || !bundleDraftRule) return;

  if (badgeEl) badgeEl.textContent = String(bundleDraftRule.groups.length);
  listEl.innerHTML = "";

  bundleDraftRule.groups.forEach((grp, gIdx) => {
    const isActive = gIdx === bundleActiveGroupIndex;
    const grpName = (grp.label && (grp.label[currentLang] || grp.label['zh-TW'] || grp.label['vi'])) || grp.name || `${t("bundleBadge")} #${gIdx + 1}`;
    const qty = grp.minQuantity || 1;
    const repeatText = grp.allowRepeats ? (currentLang === 'vi' ? 'Được chọn lặp lại' : '可重複選') : (currentLang === 'vi' ? 'Không lặp lại' : '不可重複');
    const ruleSummary = currentLang === 'vi'
      ? `Bắt buộc ${qty} ${t("bundleItemUnit")} • ${repeatText}`
      : `必須選取 ${qty} ${t("bundleItemUnit")} • ${repeatText}`;

    const card = document.createElement("div");
    card.className = `bundle-group-card ${isActive ? 'active' : ''}`;
    card.onclick = () => selectBundleGroup(gIdx);

    let deleteBtnHtml = '';
    if (bundleDraftRule.groups.length > 1) {
      deleteBtnHtml = `
        <button type="button" class="bundle-group-card-delete" onclick="deleteBundleGroup(${gIdx}, event)" title="${t('btnItemDelete')}">
          ${POS_SVG.trash}
        </button>
      `;
    }

    card.innerHTML = `
      <div class="bundle-group-card-header">
        <span class="bundle-group-card-title">${escapeHtml(grpName)}</span>
        <span class="bundle-group-card-badge">#${gIdx + 1}</span>
      </div>
      <div class="bundle-group-card-rule">
        <span>${ruleSummary}</span>
      </div>
      ${deleteBtnHtml}
    `;
    listEl.appendChild(card);
  });
}

function selectBundleGroup(groupIdx) {
  syncBundleCurrentGroupFromDOM();
  bundleActiveGroupIndex = groupIdx;
  const grp = bundleDraftRule?.groups?.[bundleActiveGroupIndex];
  if (grp && grp.sources && grp.sources.some(s => s.type === 'category')) {
    bundleSourceTab = 'category';
  } else if (grp && grp.sources && grp.sources.some(s => s.type === 'item_list' || s.type === 'items')) {
    bundleSourceTab = 'items';
  }
  renderBundleEditorSidebar();
  renderBundleGroupConfigPanel();
}
window.selectBundleGroup = selectBundleGroup;

function addBundleGroup() {
  syncBundleCurrentGroupFromDOM();
  const newIdx = bundleDraftRule.groups.length + 1;
  bundleDraftRule.groups.push({
    id: `group_${newIdx}_${Date.now()}`,
    label: {
      "zh-TW": `請選擇 1 樣餐點 (組 ${newIdx})`,
      "vi": `Chọn 1 món (Nhóm ${newIdx})`
    },
    name: `請選擇 1 樣餐點 (組 ${newIdx})`,
    minQuantity: 1,
    maxQuantity: 1,
    allowRepeats: false,
    sources: []
  });
  bundleActiveGroupIndex = bundleDraftRule.groups.length - 1;
  renderBundleEditorSidebar();
  renderBundleGroupConfigPanel();
}
window.addBundleGroup = addBundleGroup;

function deleteBundleGroup(groupIdx, event) {
  if (event) event.stopPropagation();
  if (bundleDraftRule.groups.length <= 1) {
    alert(t("bundleValidationEmptyGroups"));
    return;
  }
  const confirmMsg = currentLang === 'vi' ? "Bạn có chắc muốn xóa nhóm chọn này?" : "確定要刪除此分組嗎？";
  if (!confirm(confirmMsg)) return;

  bundleDraftRule.groups.splice(groupIdx, 1);
  if (bundleActiveGroupIndex >= bundleDraftRule.groups.length) {
    bundleActiveGroupIndex = bundleDraftRule.groups.length - 1;
  }
  renderBundleEditorSidebar();
  renderBundleGroupConfigPanel();
}
window.deleteBundleGroup = deleteBundleGroup;

function updateBundleGroupName(val) {
  if (!bundleDraftRule || !bundleDraftRule.groups[bundleActiveGroupIndex]) return;
  const grp = bundleDraftRule.groups[bundleActiveGroupIndex];
  grp.name = val;
  if (!grp.label || typeof grp.label !== 'object') {
    grp.label = {};
  }
  grp.label["zh-TW"] = val;
  grp.label["vi"] = val;

  // Update card title live
  const cards = document.querySelectorAll("#bundle-groups-list .bundle-group-card");
  if (cards[bundleActiveGroupIndex]) {
    const titleEl = cards[bundleActiveGroupIndex].querySelector(".bundle-group-card-title");
    const displayVal = val || `${t("bundleBadge")} #${bundleActiveGroupIndex + 1}`;
    if (titleEl) titleEl.textContent = displayVal;
  }
}
window.updateBundleGroupName = updateBundleGroupName;

function updateBundleGroupLabel(lang, val) {
  updateBundleGroupName(val);
}
window.updateBundleGroupLabel = updateBundleGroupLabel;

function stepBundleQty(delta) {
  if (!bundleDraftRule || !bundleDraftRule.groups[bundleActiveGroupIndex]) return;
  const grp = bundleDraftRule.groups[bundleActiveGroupIndex];
  const newQty = Math.max(1, (grp.minQuantity || 1) + delta);
  grp.minQuantity = newQty;
  grp.maxQuantity = newQty;

  const valEl = document.getElementById("bundle-stepper-val");
  if (valEl) valEl.textContent = String(newQty);
  renderBundleEditorSidebar();
}
window.stepBundleQty = stepBundleQty;

function toggleBundleRepeat(isChecked) {
  if (!bundleDraftRule || !bundleDraftRule.groups[bundleActiveGroupIndex]) return;
  bundleDraftRule.groups[bundleActiveGroupIndex].allowRepeats = isChecked;
  const lbl = document.getElementById("bundle-repeat-label");
  if (lbl) lbl.classList.toggle("checked", isChecked);
  renderBundleEditorSidebar();
}
window.toggleBundleRepeat = toggleBundleRepeat;

function switchBundleSourceTab(tab) {
  bundleSourceTab = tab;
  renderBundleSourcesSection();
}
window.switchBundleSourceTab = switchBundleSourceTab;

function toggleBundleSourceCategory(catId, isChecked) {
  if (!bundleDraftRule || !bundleDraftRule.groups[bundleActiveGroupIndex]) return;
  const grp = bundleDraftRule.groups[bundleActiveGroupIndex];
  const targetCat = (currentMenuData || []).find(c => c.catId === catId || c.id === catId || (c.databaseId && c.databaseId === catId));
  const catKeys = [catId];
  if (targetCat) {
    if (targetCat.catId) catKeys.push(targetCat.catId);
    if (targetCat.id) catKeys.push(targetCat.id);
    if (targetCat.databaseId) catKeys.push(targetCat.databaseId);
  }
  if (isChecked) {
    if (!grp.sources.some(s => s.type === 'category' && catKeys.includes(s.categoryId || s.refId))) {
      grp.sources.push({ type: 'category', categoryId: catId, refId: catId });
    }
  } else {
    grp.sources = grp.sources.filter(s => !(s.type === 'category' && catKeys.includes(s.categoryId || s.refId)));
  }
  renderBundleSourcesSection();
  renderBundleEligiblePreview();
}
window.toggleBundleSourceCategory = toggleBundleSourceCategory;

function toggleBundleSourceItem(itemId, isChecked) {
  if (!bundleDraftRule || !bundleDraftRule.groups[bundleActiveGroupIndex]) return;
  const grp = bundleDraftRule.groups[bundleActiveGroupIndex];
  let itemListSrc = grp.sources.find(s => s.type === 'item_list');
  if (!itemListSrc) {
    itemListSrc = { type: 'item_list', itemIds: [] };
    grp.sources.push(itemListSrc);
  }
  if (isChecked) {
    if (!itemListSrc.itemIds.includes(itemId)) itemListSrc.itemIds.push(itemId);
  } else {
    itemListSrc.itemIds = itemListSrc.itemIds.filter(id => id !== itemId);
    if (Array.isArray(grp.items)) {
      grp.items = grp.items.filter(f => f.itemId !== itemId);
    }
    if (Array.isArray(grp.eligibleItems)) {
      grp.eligibleItems = grp.eligibleItems.filter(e => e.id !== itemId && e.name !== itemId);
    }
  }
  if (itemListSrc.itemIds.length === 0) {
    grp.sources = grp.sources.filter(s => s !== itemListSrc);
  }
  renderBundleSourcesSection();
  renderBundleEligiblePreview();
}
window.toggleBundleSourceItem = toggleBundleSourceItem;

function computeEligibleItemsCount(grp) {
  if (!grp || !currentMenuData) return 0;
  const itemSet = new Set();
  currentMenuData.forEach(cat => {
    if (cat.type !== 'catalog' || !Array.isArray(cat.items)) return;
    const catMatches = (grp.sources || []).some(s => s.type === 'category' && (
      s.categoryId === cat.catId || s.refId === cat.catId ||
      s.categoryId === cat.id || s.refId === cat.id ||
      (cat.databaseId && (s.categoryId === cat.databaseId || s.refId === cat.databaseId))
    ));
    if (catMatches) {
      cat.items.forEach(it => {
        if (it.name) itemSet.add(it.id || it.name);
      });
    } else {
      const itemSources = (grp.sources || []).filter(s => s.type === 'item_list' || s.type === 'items');
      const itemIds = itemSources.flatMap(s => Array.isArray(s.itemIds) ? s.itemIds : []);
      cat.items.forEach(it => {
        if (itemIds.includes(it.id) || (it.name && itemIds.includes(it.name)) ||
            (Array.isArray(grp.items) && grp.items.some(f => f.itemId === it.id || f.itemId === it.name)) ||
            (Array.isArray(grp.eligibleItems) && grp.eligibleItems.some(e => e.id === it.id || (e.name && e.name === it.name)))) {
          itemSet.add(it.id || it.name);
        }
      });
    }
  });
  return itemSet.size;
}

function renderBundleEligiblePreview() {
  const previewEl = document.getElementById("bundle-eligible-count");
  if (!previewEl || !bundleDraftRule || !bundleDraftRule.groups[bundleActiveGroupIndex]) return;
  const grp = bundleDraftRule.groups[bundleActiveGroupIndex];
  const count = computeEligibleItemsCount(grp);
  previewEl.textContent = String(count);
}

function renderBundleSourcesSection() {
  const container = document.getElementById("bundle-sources-container");
  if (!container || !bundleDraftRule || !bundleDraftRule.groups[bundleActiveGroupIndex]) return;
  const grp = bundleDraftRule.groups[bundleActiveGroupIndex];

  const catTabActive = bundleSourceTab === 'category';
  const itemTabActive = bundleSourceTab === 'items';

  let sourcesHtml = `
    <div class="bundle-source-type-segmented">
      <button type="button" class="bundle-source-type-pill ${catTabActive ? 'active' : ''}" onclick="switchBundleSourceTab('category')">
        ${POS_SVG.folder}<span>${t("bundleSourceCategory")}</span>
      </button>
      <button type="button" class="bundle-source-type-pill ${itemTabActive ? 'active' : ''}" onclick="switchBundleSourceTab('items')">
        ${POS_SVG.tag}<span>${t("bundleSourceItems")}</span>
      </button>
    </div>
  `;

  if (catTabActive) {
    sourcesHtml += `<div class="bundle-sources-grid" style="margin-top: 10px;">`;
    (currentMenuData || []).forEach(cat => {
      if (cat.type !== 'catalog') return;
      const catKey = cat.catId || cat.id;
      const isSelected = (grp.sources || []).some(s => s.type === 'category' && (
        s.categoryId === cat.catId || s.refId === cat.catId ||
        s.categoryId === cat.id || s.refId === cat.id ||
        (cat.databaseId && (s.categoryId === cat.databaseId || s.refId === cat.databaseId))
      ));
      const itemCount = (cat.items && cat.items.length) || 0;
      sourcesHtml += `
        <label class="bundle-source-chip ${isSelected ? 'selected' : ''}">
          <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleBundleSourceCategory('${escapeHtml(catKey)}', this.checked)">
          <span class="bundle-source-chip-name">${escapeHtml(cat.title)}</span>
          <span class="bundle-source-chip-count">${itemCount} ${t("bundleItemUnit")}</span>
        </label>
      `;
    });
    sourcesHtml += `</div>`;
  } else {
    // Individual Items selector
    sourcesHtml += `<div class="bundle-sources-grid" style="margin-top: 10px; max-height: 260px;">`;
    let itemSources = (grp.sources || []).filter(s => s.type === 'item_list' || s.type === 'items');
    const selectedItemIds = itemSources.flatMap(s => Array.isArray(s.itemIds) ? s.itemIds : []);

    (currentMenuData || []).forEach(cat => {
      if (cat.type !== 'catalog' || !cat.items || cat.items.length === 0) return;
      cat.items.forEach(it => {
        const itemKey = it.id || it.name;
        const isSelected = selectedItemIds.includes(it.id) ||
                           (it.name && selectedItemIds.includes(it.name)) ||
                           (Array.isArray(grp.items) && grp.items.some(f => f.itemId === it.id || f.itemId === it.name)) ||
                           (Array.isArray(grp.eligibleItems) && grp.eligibleItems.some(e => e.id === it.id || (e.name && e.name === it.name)));
        sourcesHtml += `
          <label class="bundle-source-chip ${isSelected ? 'selected' : ''}" title="${escapeHtml(cat.title)} - ${escapeHtml(it.name)}">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleBundleSourceItem('${escapeHtml(itemKey)}', this.checked)">
            <span class="bundle-source-chip-name">${escapeHtml(it.name)}</span>
            <span class="bundle-source-chip-count">$${it.price || 0}</span>
          </label>
        `;
      });
    });
    sourcesHtml += `</div>`;
  }

  container.innerHTML = sourcesHtml;
}

function renderBundleGroupConfigPanel() {
  const panel = document.getElementById("bundle-group-config-panel");
  if (!panel) return;

  if (!bundleDraftRule || !bundleDraftRule.groups || !bundleDraftRule.groups[bundleActiveGroupIndex]) {
    panel.innerHTML = `<div style="text-align:center; padding: 40px; color:#94a3b8;">${t("bundleValidationEmptyGroups")}</div>`;
    return;
  }

  const grp = bundleDraftRule.groups[bundleActiveGroupIndex];
  const grpName = grp.name || (grp.label && (grp.label[currentLang] || grp.label['zh-TW'] || grp.label['vi'])) || '';
  const qty = grp.minQuantity || 1;
  const isRepeat = Boolean(grp.allowRepeats);
  const eligibleCount = computeEligibleItemsCount(grp);

  panel.innerHTML = `
    <!-- Section 1: Group Name -->
    <div class="bundle-config-section">
      <div class="bundle-config-section-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        <span id="i18n-bundle-section-name">${t("bundleGroupDetailTitle")}</span>
      </div>
      <div class="bundle-group-name-inputs">
        <div class="bundle-field-group">
          <label class="bundle-field-label" id="i18n-bundle-name-lbl">${t("bundleGroupName")}</label>
          <input type="text" class="bundle-input-text" id="bundle-group-name" value="${escapeHtml(grpName)}"
            placeholder="${t("bundleGroupNamePlaceholder")}" oninput="updateBundleGroupName(this.value)">
        </div>
      </div>
    </div>

    <!-- Section 2: Quantity Rule & Repeat -->
    <div class="bundle-config-section">
      <div class="bundle-config-section-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
        <span id="i18n-bundle-section-rule">${t("bundleQuantityRule")}</span>
      </div>
      <div class="bundle-quantity-stepper-row">
        <div class="bundle-stepper-control">
          <button type="button" class="bundle-stepper-btn" onclick="stepBundleQty(-1)" aria-label="Decrease">-</button>
          <span class="bundle-stepper-value" id="bundle-stepper-val">${qty}</span>
          <button type="button" class="bundle-stepper-btn" onclick="stepBundleQty(1)" aria-label="Increase">+</button>
        </div>
        <label class="bundle-checkbox-label ${isRepeat ? 'checked' : ''}" id="bundle-repeat-label">
          <input type="checkbox" class="bundle-checkbox-input" ${isRepeat ? 'checked' : ''} onchange="toggleBundleRepeat(this.checked)">
          <div class="bundle-checkbox-text">
            <span class="bundle-checkbox-title">${t("bundleAllowRepeat")}</span>
            <span class="bundle-checkbox-desc">${t("bundleAllowRepeatDesc")}</span>
          </div>
        </label>
      </div>
    </div>

    <!-- Section 3: Sources Selector -->
    <div class="bundle-config-section">
      <div class="bundle-config-section-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
          <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/>
          <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>
        </svg>
        <span id="i18n-bundle-section-source">${t("bundleSourceType")}</span>
      </div>
      <div id="bundle-sources-container"></div>
    </div>

    <!-- Section 4: Live Eligible Items Preview -->
    <div class="bundle-config-section" style="margin-top: auto; padding-top: 10px; border-top: 1px dashed #e2e8f0;">
      <div style="display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #475569;">
        <span>${t("bundleEligiblePreview")}:</span>
        <strong style="font-size: 16px; color: #4338ca;"><span id="bundle-eligible-count">${eligibleCount}</span> ${t("bundleItemUnit")}</strong>
      </div>
    </div>
  `;

  renderBundleSourcesSection();
}

async function saveBundleConfig() {
  if (!bundleEditingTarget || !bundleDraftRule) return;
  syncBundleCurrentGroupFromDOM();

  if (!bundleDraftRule.groups || bundleDraftRule.groups.length === 0) {
    alert(t("bundleValidationEmptyGroups"));
    return;
  }

  for (let i = 0; i < bundleDraftRule.groups.length; i++) {
    const grp = bundleDraftRule.groups[i];
    const zh = grp.label && grp.label["zh-TW"];
    const vi = grp.label && grp.label["vi"];
    if ((!zh || zh.trim() === '') && (!vi || vi.trim() === '') && (!grp.name || grp.name.trim() === '')) {
      alert(`${t("bundleValidationEmptyName")} (#${i + 1})`);
      selectBundleGroup(i);
      return;
    }
    if (!grp.sources || grp.sources.length === 0) {
      alert(`${t("bundleValidationEmptySources")} (#${i + 1})`);
      selectBundleGroup(i);
      return;
    }
  }

  const btnSave = document.getElementById("btn-bundle-modal-save");
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.textContent = t("menuSaving");
  }

  try {
    const tenantId = getTenantIdFromUrl();
    const cat = currentMenuData[bundleEditingTarget.catIndex];
    const payload = {
      parent_item_id: bundleEditingTarget.item.id || null,
      item_name: bundleEditingTarget.item.name,
      category_id: cat.catId || null,
      category_slug: cat.id,
      config: {
        version: 1,
        groups: bundleDraftRule.groups
      }
    };

    const res = await fetch(`${WORKER_BASE}/api/menu/bundle-rules?tenant_id=${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const resData = await res.json();
    if (!res.ok || resData.error) {
      throw new Error(resData.error || res.statusText);
    }

    bundleEditingTarget.item.bundleRule = resData.bundleRule || bundleDraftRule;
    if (savedMenuSnapshot) {
      try {
        const snapData = JSON.parse(savedMenuSnapshot);
        if (snapData[bundleEditingTarget.catIndex]?.items?.[bundleEditingTarget.itemIndex]) {
          snapData[bundleEditingTarget.catIndex].items[bundleEditingTarget.itemIndex].bundleRule = bundleEditingTarget.item.bundleRule;
          savedMenuSnapshot = canonicalMenuSnapshot(snapData);
        }
      } catch (e) {
        console.error("Failed to sync bundleRule to savedMenuSnapshot", e);
      }
    }
    alert(t("bundleSaveSuccess"));
    const catIdx = bundleEditingTarget.catIndex;
    closeBundleEditorModal();
    renderMenuCategoryEditor(catIdx);
  } catch (err) {
    alert(t("bundleSaveFail") + (err.message || err));
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        <span id="i18n-btn-bundle-save">${t("btnBundleSave")}</span>
      `;
    }
  }
}
window.saveBundleConfig = saveBundleConfig;

async function clearBundleConfig() {
  if (!bundleEditingTarget) return;
  if (!confirm(t("confirmRemoveBundleConfig"))) return;

  const btnDel = document.getElementById("btn-bundle-remove-config");
  if (btnDel) btnDel.disabled = true;

  try {
    const tenantId = getTenantIdFromUrl();
    const cat = currentMenuData[bundleEditingTarget.catIndex];
    const payload = {
      parent_item_id: bundleEditingTarget.item.id || null,
      item_name: bundleEditingTarget.item.name,
      category_id: cat.catId || null,
      category_slug: cat.id,
      delete: true
    };

    const res = await fetch(`${WORKER_BASE}/api/menu/bundle-rules?tenant_id=${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const resData = await res.json();
    if (!res.ok || resData.error) {
      throw new Error(resData.error || res.statusText);
    }

    bundleEditingTarget.item.bundleRule = null;
    if (savedMenuSnapshot) {
      try {
        const snapData = JSON.parse(savedMenuSnapshot);
        if (snapData[bundleEditingTarget.catIndex]?.items?.[bundleEditingTarget.itemIndex]) {
          snapData[bundleEditingTarget.catIndex].items[bundleEditingTarget.itemIndex].bundleRule = null;
          savedMenuSnapshot = canonicalMenuSnapshot(snapData);
        }
      } catch (e) {
        console.error("Failed to sync bundleRule to savedMenuSnapshot", e);
      }
    }
    const catIdx = bundleEditingTarget.catIndex;
    closeBundleEditorModal();
    renderMenuCategoryEditor(catIdx);
  } catch (err) {
    alert(t("bundleSaveFail") + (err.message || err));
  } finally {
    if (btnDel) btnDel.disabled = false;
  }
}
window.clearBundleConfig = clearBundleConfig;

// ==========================================
// Unified Creation & Item Modifiers Editor
// ==========================================

function openCreationTypeModal() {
  const modal = document.getElementById("creationTypeModal");
  if (modal) modal.style.display = "flex";
}
window.openCreationTypeModal = openCreationTypeModal;

function closeCreationTypeModal() {
  const modal = document.getElementById("creationTypeModal");
  if (modal) modal.style.display = "none";
}
window.closeCreationTypeModal = closeCreationTypeModal;

function handleMenuCreateClick() {
  if (window.UnifiedMenu?.enabled) return menuSidebarTab === "options" ? window.UnifiedMenu.group() : window.UnifiedMenu.product(activeCategoryIndex);
  if (activeCategoryIndex >= 0 && currentMenuData && currentMenuData[activeCategoryIndex]) {
    const cat = currentMenuData[activeCategoryIndex];
    if (isCustomizationCategory(cat)) {
      openNewCustomGroupCreator(activeCategoryIndex);
      return;
    }
    if (isComboCategory(cat)) {
      if (typeof openBundleWizard === 'function') {
        openBundleWizard(activeCategoryIndex);
        return;
      }
    }
    openCreateItemModal(activeCategoryIndex);
    return;
  }
  openCreationTypeModal();
}
window.handleMenuCreateClick = handleMenuCreateClick;

function handleSelectCreateType(type) {
  closeCreationTypeModal();
  let targetCatIdx = activeCategoryIndex;
  if (!currentMenuData || targetCatIdx < 0 || currentMenuData[targetCatIdx].type !== 'catalog') {
    targetCatIdx = currentMenuData ? currentMenuData.findIndex(c => c.type === 'catalog') : -1;
  }

  if (type === 'standard_item' || type === 'item_with_options') {
    if (targetCatIdx >= 0) {
      activeCategoryIndex = targetCatIdx;
      renderMenuCategories();
      renderMenuCategoryEditor(targetCatIdx);
      openCreateItemModal(targetCatIdx);
    }
  } else if (type === 'bundle') {
    if (typeof openBundleWizard === 'function') {
      openBundleWizard();
    }
  } else if (type === 'global_customization') {
    const flavorIdx = currentMenuData ? currentMenuData.findIndex(c => c.type === 'order_customization' || c.id === 'sec-flavor') : -1;
    if (flavorIdx >= 0) {
      activeCategoryIndex = flavorIdx;
      isCustomGroupCreatorOpen = true;
      newCustomGroupType = 'radio';
      newCustomGroupRequired = false;
      renderMenuCategories();
      renderMenuCategoryEditor(flavorIdx);
      setTimeout(() => {
        const card = document.getElementById("cust-new-group-card");
        const inp = document.getElementById("cust-new-group-title-input");
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (inp) inp.focus();
      }, 50);
    }
  }
}
window.handleSelectCreateType = handleSelectCreateType;

let currentItemModifiersCidx = null;
let currentItemModifiersIidx = null;
let tempItemModifierGroups = [];
let itemModifierFilterMode = "all";
let itemModifiersSnapshotBeforeEdit = null;
let itemCustomizationCategoriesSnapshotBeforeEdit = null;

function openItemModifiersModal(cIdx, iIdx) {
  if (window.UnifiedMenu?.enabled) return window.UnifiedMenu.product(cIdx, iIdx, "options");
  syncMenuDataFromDOM();
  if (!currentMenuData || !currentMenuData[cIdx] || !currentMenuData[cIdx].items || !currentMenuData[cIdx].items[iIdx]) return;
  currentItemModifiersCidx = cIdx;
  currentItemModifiersIidx = iIdx;
  const item = currentMenuData[cIdx].items[iIdx];
  tempItemModifierGroups = JSON.parse(JSON.stringify(item.modifierGroups || []));

  // Snapshot for rollback on cancel
  itemModifiersSnapshotBeforeEdit = JSON.parse(JSON.stringify(item.modifierGroups || []));
  itemCustomizationCategoriesSnapshotBeforeEdit = JSON.parse(JSON.stringify(
    (currentMenuData || []).filter(c => isCustomizationCategory(c))
  ));

  const modal = document.getElementById("itemModifiersModal");
  const titleEl = document.getElementById("item-modifiers-modal-title");
  if (titleEl) {
    titleEl.innerText = t("itemModifiersModalTitle");
  }
  const subEl = document.getElementById("item-modifiers-modal-sub");
  if (subEl) subEl.innerText = t("itemModifiersModalSub");

  itemModifierFilterMode = "all";
  renderItemModifiersEditor();
  if (modal) {
    modal.style.display = "flex";
    modal.scrollTop = 0;
    const body = document.getElementById("item-modifiers-modal-body");
    if (body) body.scrollTop = 0;
  }
}
window.openItemModifiersModal = openItemModifiersModal;

function closeItemModifiersModal() {
  const modal = document.getElementById("itemModifiersModal");
  if (modal) modal.style.display = "none";

  // Rollback on Cancel if we did not save
  if (currentItemModifiersCidx !== null && currentItemModifiersIidx !== null && itemModifiersSnapshotBeforeEdit) {
    const item = currentMenuData?.[currentItemModifiersCidx]?.items?.[currentItemModifiersIidx];
    if (item) {
      item.modifierGroups = JSON.parse(JSON.stringify(itemModifiersSnapshotBeforeEdit));
    }
  }
  if (itemCustomizationCategoriesSnapshotBeforeEdit && currentMenuData) {
    const savedCust = itemCustomizationCategoriesSnapshotBeforeEdit;
    savedCust.forEach(savedCat => {
      const liveCat = currentMenuData.find(c => (savedCat.id && c.id === savedCat.id) || (savedCat.databaseId && c.databaseId === savedCat.databaseId));
      if (liveCat) {
        if (Object.prototype.hasOwnProperty.call(savedCat, "groups")) {
          liveCat.groups = JSON.parse(JSON.stringify(savedCat.groups));
        } else {
          delete liveCat.groups;
        }
      }
    });
  }

  const returnState = window._hubModalReturnState;
  currentItemModifiersCidx = null;
  currentItemModifiersIidx = null;
  tempItemModifierGroups = [];
  itemModifiersSnapshotBeforeEdit = null;
  itemCustomizationCategoriesSnapshotBeforeEdit = null;
  checkMenuDirty();

  if (returnState) {
    window._hubModalReturnState = null;
    openItemDetailModal(returnState.catIdx, returnState.itemIdx);
  }
}
window.closeItemModifiersModal = closeItemModifiersModal;

function syncItemModifiersFromDOM() {}
window.syncItemModifiersFromDOM = syncItemModifiersFromDOM;

function goToCustomizationTabFromItemModal() {
  closeItemModifiersModal();
  closeItemDetailModal();
  setMenuSidebarTab('options');
  if (typeof handleCreateCustomFromSidebar === 'function') {
    setTimeout(() => {
      handleCreateCustomFromSidebar();
    }, 50);
  }
}
window.goToCustomizationTabFromItemModal = goToCustomizationTabFromItemModal;

function updateItemModifiersToolbarCounts() {
  const container = document.getElementById("item-modifiers-modal-body");
  if (!container) return;
  const checkboxes = container.querySelectorAll(".item-mod-group-checkbox");
  let selectedCount = 0;
  checkboxes.forEach(cb => {
    if (cb.checked) selectedCount++;
  });
  const countBadge = document.getElementById("item-mod-selected-count-badge");
  if (countBadge) {
    const textTpl = t("appliedGroupCountBadge") || (currentLang === 'vi' ? 'Đã chọn: {count} nhóm' : '已套用：{count} 組');
    countBadge.innerHTML = `<span class="item-modifiers-badge-dot"></span>${escapeHtml(textTpl.replace('{count}', selectedCount))}`;
    if (selectedCount > 0) {
      countBadge.classList.add("active-badge");
    } else {
      countBadge.classList.remove("active-badge");
    }
  }
}
window.updateItemModifiersToolbarCounts = updateItemModifiersToolbarCounts;

function selectAllItemModifiers(select) {
  const container = document.getElementById("item-modifiers-modal-body");
  if (!container) return;
  const checkboxes = container.querySelectorAll(".item-mod-group-checkbox");
  checkboxes.forEach((cb) => {
    const card = cb.closest(".mod-lib-group-card");
    if (card && card.style.display !== 'none') {
      cb.checked = select;
      card.classList.toggle("is-selected", select);
      card.style.borderColor = select ? '#2563eb' : '#e2e8f0';
      card.style.background = select ? '#f8faff' : '#ffffff';
    }
  });
  updateItemModifiersToolbarCounts();
  filterItemModifierCards();
}
window.selectAllItemModifiers = selectAllItemModifiers;

function filterItemModifierCards(searchTerm) {
  const grid = document.getElementById("item-modifiers-cards-grid");
  if (!grid) return;
  const search = document.getElementById("item-modifiers-search");
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const term = normalize(searchTerm === undefined ? search?.value : searchTerm).trim();
  let visibleCount = 0;
  grid.querySelectorAll(".mod-lib-group-card").forEach(card => {
    const matches = normalize(card.getAttribute("data-group-search")).includes(term);
    const selected = Boolean(card.querySelector(".item-mod-group-checkbox")?.checked);
    const visible = matches && (itemModifierFilterMode !== 'selected' || selected);
    // Keep every input mounted: search/filter must never discard assignment drafts.
    card.style.display = visible ? "" : "none";
    if (visible) visibleCount++;
  });
  const empty = document.getElementById("item-modifiers-filter-empty");
  if (empty) empty.hidden = visibleCount > 0;
}
window.filterItemModifierCards = filterItemModifierCards;

function setItemModifierFilter(mode) {
  itemModifierFilterMode = mode === 'selected' ? 'selected' : 'all';
  ['all', 'selected'].forEach(value => {
    document.getElementById(`item-mod-filter-${value}`)?.setAttribute('aria-pressed', String(itemModifierFilterMode === value));
  });
  filterItemModifierCards();
}
window.setItemModifierFilter = setItemModifierFilter;

// Use the same category applicability rules as the menu workspace, across all
// library sections, including legacy modifier categories.
function getInheritedItemModifierGroups(cat) {
  const groups = [];
  const seen = new Set();
  getStoreModifiersList().forEach(mod => {
    if (!isModifierAppliedToCategory(mod, cat) || mod.group?.scope === 'order') return;
    const source = currentMenuData[mod.categoryIndex];
    const group = mod.group || { id: mod.id, title: mod.title, options: source.items || source.groups?.[0]?.options || [] };
    const id = String(group.canonicalId || group.id || mod.id);
    if (seen.has(id)) return;
    seen.add(id);
    groups.push(group);
  });
  return groups;
}
window.getInheritedItemModifierGroups = getInheritedItemModifierGroups;

function toggleItemModifierCardSelection(gIdx, forcedChecked) {
  const cb = document.getElementById(`item-mod-grp-cb-${gIdx}`);
  if (!cb) return;
  if (forcedChecked !== undefined) {
    cb.checked = forcedChecked;
  } else {
    cb.checked = !cb.checked;
  }
  const card = cb.closest(".mod-lib-group-card");
  if (card) {
    card.classList.toggle("is-selected", cb.checked);
    card.style.borderColor = cb.checked ? '#2563eb' : '#e2e8f0';
    card.style.background = cb.checked ? '#f8faff' : '#ffffff';
  }
  updateItemModifiersToolbarCounts();
  filterItemModifierCards();
}
window.toggleItemModifierCardSelection = toggleItemModifierCardSelection;

function toggleItemModifierGroupRequired(gIdx) {
  const container = document.getElementById("item-modifiers-cards-grid");
  if (!container) return;
  const cards = container.querySelectorAll(".mod-lib-group-card");
  const card = cards[gIdx];
  if (!card) return;

  const cb = document.getElementById(`item-mod-grp-cb-${gIdx}`);
  const grpId = cb ? cb.getAttribute("data-group-id") : null;
  if (!grpId) return;

  let foundGroup = null;
  (currentMenuData || []).filter(c => isCustomizationCategory(c)).forEach(custCat => {
    (custCat.groups || []).forEach(g => {
      const gid = String(g.id || '');
      const canonId = String(g.canonicalId || '');
      if (gid === grpId || canonId === grpId || `mg_${gid}` === grpId || gid === `mg_${grpId}`) {
        g.isRequired = !g.isRequired;
        foundGroup = g;
      }
    });
  });

  if (Array.isArray(tempItemModifierGroups)) {
    tempItemModifierGroups.forEach(existing => {
      const eid = String(existing.id || '');
      const canonId = String(existing.canonicalId || '');
      if (eid === grpId || canonId === grpId || `mg_${eid}` === grpId || eid === `mg_${grpId}`) {
        existing.isRequired = foundGroup ? foundGroup.isRequired : !existing.isRequired;
        if (!foundGroup) foundGroup = existing;
      }
    });
  }

  const reqBtn = document.getElementById(`item-mod-req-btn-${gIdx}`);
  if (reqBtn && foundGroup) {
    const isNowReq = Boolean(foundGroup.isRequired);
    reqBtn.className = `mod-badge-interactive ${isNowReq ? 'is-required' : 'is-optional'}`;
    reqBtn.setAttribute("aria-label", `${foundGroup.title || foundGroup.name || ''}: ${t(isNowReq ? 'toggleRequiredOff' : 'toggleRequiredOn')}`);
    reqBtn.title = isNowReq ? (t('toggleRequiredOff') || 'Bấm để đổi thành Tự chọn') : (t('toggleRequiredOn') || 'Bấm để đổi thành Bắt buộc');
    reqBtn.innerHTML = `
      <span class="mod-badge-dot"></span>
      <span>${isNowReq ? (t("badgeRequired") || 'Bắt buộc') : (t("badgeOptional") || 'Tùy chọn')}</span>
    `;
  }

  markMenuDirty();
}
window.toggleItemModifierGroupRequired = toggleItemModifierGroupRequired;

function renderItemModifiersEditor() {
  const container = document.getElementById("item-modifiers-modal-body");
  if (!container) return;
  const cat = currentMenuData?.[currentItemModifiersCidx];
  const item = cat?.items?.[currentItemModifiersIidx];
  const inherited = cat ? getInheritedItemModifierGroups(cat) : [];
  const libraryGroups = [];
  (currentMenuData || []).filter(c => isCustomizationCategory(c)).forEach(custCat => {
    (custCat.groups || []).forEach(g => {
      if (g.scope !== 'order' && !libraryGroups.some(existing => String(existing.id) === String(g.id) || (g.canonicalId && String(existing.canonicalId) === String(g.canonicalId)))) libraryGroups.push(g);
    });
  });
  (tempItemModifierGroups || []).forEach(g => {
    if (!libraryGroups.some(existing => String(existing.id) === String(g.id) || String(existing.canonicalId) === String(g.id))) {
      libraryGroups.push({ ...g, title: g.name || g.title, type: g.selectionType === 'multiple' ? 'checkbox' : 'radio' });
    }
  });
  const selectedIds = new Set();
  (tempItemModifierGroups || []).forEach(g => {
    const id = String(g.id || g.groupId || g.group_id || '');
    selectedIds.add(id);
    selectedIds.add(id.startsWith('mg_') ? id.slice(3) : `mg_${id}`);
  });
  const optionList = options => options.length ? `<ul class="item-mod-option-list">${options.map(o => {
    const price = Number(o.price ?? o.surcharge ?? 0);
    return `<li><span>${escapeHtml(o.name || '')}</span><span>${price ? `${price > 0 ? '+' : ''}$${price}` : escapeHtml(t('itemModNoSurcharge'))}</span></li>`;
  }).join('')}</ul>` : `<p class="item-mod-empty-options">${escapeHtml(t('noOptionsInGroup'))}</p>`;

  container.innerHTML = `
    <aside class="item-mod-context">
      <section class="item-mod-context-card">
        <p class="item-mod-eyebrow">${escapeHtml(t('itemModAppliesTo'))}</p>
        <h2>${escapeHtml(item?.name || '')}</h2>
        <p class="item-mod-category-name">${escapeHtml(cat?.title || '')}</p>
        <p class="item-mod-draft-note">${escapeHtml(t('itemModDraftNote'))}</p>
      </section>
      <details class="item-mod-inherited-section">
        <summary>${escapeHtml(t('inheritedFromCategory'))}<span>${inherited.length}</span></summary>
        <p>${escapeHtml(t('itemModInheritedHelp'))}</p>
        ${inherited.length ? inherited.map(g => `<details class="item-mod-inherited-group"><summary>${escapeHtml(g.title || g.name || '')}</summary>${optionList(g.options || [])}</details>`).join('') : `<p class="item-mod-empty-options">${escapeHtml(t('itemModNoInherited'))}</p>`}
      </details>
    </aside>
    <section class="item-mod-library" aria-labelledby="item-mod-library-title">
      <div class="item-mod-library-heading"><div><h2 id="item-mod-library-title">${escapeHtml(t('itemModDirectTitle'))}</h2><p>${escapeHtml(t('itemModDirectHelp'))}</p></div><span id="item-mod-selected-count-badge" class="item-modifiers-badge"></span></div>
      ${libraryGroups.length ? `
        <div class="item-modifiers-toolbar">
          <div class="item-mod-filter-tabs" aria-label="${escapeHtml(t('itemModFilterLabel'))}">
            <button type="button" id="item-mod-filter-all" aria-pressed="${itemModifierFilterMode === 'all'}" onclick="setItemModifierFilter('all')">${escapeHtml(t('itemModAllGroups'))} <span>${libraryGroups.length}</span></button>
            <button type="button" id="item-mod-filter-selected" aria-pressed="${itemModifierFilterMode === 'selected'}" onclick="setItemModifierFilter('selected')">${escapeHtml(t('itemModSelectedGroups'))}</button>
          </div>
          <label class="item-modifiers-search-box"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4-4"/></svg><input id="item-modifiers-search" type="search" class="item-modifiers-search-input" aria-label="${escapeHtml(t('searchModifierGroupsPlaceholder'))}" placeholder="${escapeHtml(t('searchModifierGroupsPlaceholder'))}" oninput="filterItemModifierCards(this.value)"></label>
          <div class="item-modifiers-toolbar-actions"><button type="button" class="item-modifiers-quick-btn" onclick="selectAllItemModifiers(true)">${escapeHtml(t('itemModSelectVisible'))}</button><button type="button" class="item-modifiers-quick-btn" onclick="selectAllItemModifiers(false)">${escapeHtml(t('itemModClearVisible'))}</button></div>
        </div>
        <p class="item-mod-shared-note">${escapeHtml(t('itemModSharedHelp'))}</p>
        <div class="item-modifiers-grid" id="item-modifiers-cards-grid"></div>
        <div id="item-modifiers-filter-empty" class="item-mod-filter-empty" hidden>${escapeHtml(t('itemModNoFilterResults'))}</div>
      ` : `<div class="item-mod-filter-empty"><h3>${escapeHtml(t('noLibraryModifierGroups'))}</h3><p>${escapeHtml(t('noLibraryModifierGroupsSub'))}</p><button type="button" class="btn btn-primary" onclick="goToCustomizationTabFromItemModal()">${escapeHtml(t('itemModCreateGroup'))}</button></div>`}
    </section>`;

  const grid = document.getElementById("item-modifiers-cards-grid");
  if (!grid) return;
  libraryGroups.forEach((grp, gIdx) => {
    const id = String(grp.id || '');
    const selected = selectedIds.has(id) || selectedIds.has(String(grp.canonicalId || ''));
    const single = grp.type !== 'checkbox' && grp.selectionType !== 'multiple';
    const options = grp.options || [];
    const inheritedHere = inherited.some(g => String(g.canonicalId || g.id) === String(grp.canonicalId || grp.id));
    const card = document.createElement('article');
    card.className = `mod-lib-group-card ${selected ? 'is-selected' : ''}`;
    card.setAttribute('data-group-search', `${grp.title || grp.name || ''} ${options.map(o => o.name).join(' ')}`);
    // Selection belongs to the label/checkbox only. Expanding details or editing
    // a group's shared requirement must not also toggle its assignment.
    card.innerHTML = `
      <div class="mod-lib-group-header">
        <label class="item-mod-selection-label" for="item-mod-grp-cb-${gIdx}">
          <span class="mod-lib-checkbox-wrapper"><input type="checkbox" class="item-mod-group-checkbox" id="item-mod-grp-cb-${gIdx}" data-group-id="${escapeHtml(id)}" ${selected ? 'checked' : ''} onchange="toggleItemModifierCardSelection(${gIdx}, this.checked)"></span>
          <span class="item-mod-group-heading"><span class="mod-lib-group-name">${escapeHtml(grp.title || grp.name || '')}</span><span class="item-mod-group-meta">${escapeHtml(t(single ? 'selectionTypeSingle' : 'selectionTypeMultiple'))} · ${options.length} ${escapeHtml(t('modifierOptionCountUnit'))}${inheritedHere ? ` · ${escapeHtml(t('inheritedFromCategory'))}` : ''}</span></span>
        </label>
        <button type="button" class="mod-badge-interactive ${grp.isRequired ? 'is-required' : 'is-optional'}" id="item-mod-req-btn-${gIdx}" onclick="toggleItemModifierGroupRequired(${gIdx})" aria-label="${escapeHtml(grp.title || grp.name || '')}: ${escapeHtml(t(grp.isRequired ? 'toggleRequiredOff' : 'toggleRequiredOn'))}" title="${escapeHtml(t('itemModSharedHelp'))}"><span class="mod-badge-dot"></span><span>${escapeHtml(t(grp.isRequired ? 'badgeRequired' : 'badgeOptional'))}</span></button>
      </div>
      <details class="item-mod-options-preview"><summary><span>${escapeHtml(t('itemModViewOptions'))}</span><span class="item-mod-preview-text">${escapeHtml(options.slice(0, 3).map(o => o.name).join(', '))}</span></summary>${optionList(options)}</details>`;
    grid.appendChild(card);
  });
  updateItemModifiersToolbarCounts();
  filterItemModifierCards();
}

function addItemModifierGroup() {}
window.addItemModifierGroup = addItemModifierGroup;
function removeItemModifierGroup() {}
window.removeItemModifierGroup = removeItemModifierGroup;
function addItemModifierOption() {}
window.addItemModifierOption = addItemModifierOption;
function removeItemModifierOption() {}
window.removeItemModifierOption = removeItemModifierOption;

function saveItemModifiersModal() {
  const container = document.getElementById("item-modifiers-modal-body");
  const checkboxes = container ? container.querySelectorAll(".item-mod-group-checkbox") : [];

  if (checkboxes.length > 0) {
    const checkedGroupIds = new Set();
    checkboxes.forEach(cb => {
      if (cb.checked) {
        checkedGroupIds.add(cb.getAttribute("data-group-id"));
      }
    });

    const allGroupsPool = [];
    (currentMenuData || []).filter(c => isCustomizationCategory(c)).forEach(c => {
      if (Array.isArray(c.groups)) allGroupsPool.push(...c.groups);
    });
    (tempItemModifierGroups || []).forEach(existing => {
      if (!allGroupsPool.some(g => String(g.id) === String(existing.id) || (existing.canonicalId && String(g.canonicalId) === String(existing.canonicalId)))) {
        allGroupsPool.push(existing);
      }
    });

    const cleanGroups = [];
    allGroupsPool.forEach(grp => {
      const gid = String(grp.id || '');
      const canonId = String(grp.canonicalId || '');
      if (checkedGroupIds.has(gid) || (canonId && checkedGroupIds.has(canonId))) {
        const targetId = grp.canonicalId || grp.id || `mg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        cleanGroups.push({
          id: targetId,
          name: (grp.title || grp.name || '').trim(),
          selectionType: (grp.type === 'checkbox' || grp.selectionType === 'multiple') ? 'multiple' : 'single',
          isRequired: Boolean(grp.isRequired),
          minSelection: grp.minSelection ?? ((grp.type === 'checkbox' || grp.selectionType === 'multiple') ? 0 : (grp.isRequired ? 1 : 0)),
          maxSelection: grp.maxSelection ?? ((grp.type === 'checkbox' || grp.selectionType === 'multiple') ? 99 : 1),
          options: (grp.options || []).map(opt => ({
            id: opt.id,
            name: opt.name,
            price: Number(opt.price || opt.surcharge || 0),
            surcharge: Number(opt.price || opt.surcharge || 0),
            isDefault: Boolean(opt.isDefault ?? opt.is_default),
            is_default: Boolean(opt.isDefault ?? opt.is_default),
            isOutOfStock: Boolean(opt.isOos ?? opt.isOutOfStock ?? opt.is_out_of_stock),
            is_out_of_stock: Boolean(opt.isOos ?? opt.isOutOfStock ?? opt.is_out_of_stock),
            isOos: Boolean(opt.isOos ?? opt.isOutOfStock ?? opt.is_out_of_stock),
            subOptions: Array.isArray(opt.sub_options) ? opt.sub_options : (Array.isArray(opt.subOptions) ? opt.subOptions : []),
            sub_options: Array.isArray(opt.sub_options) ? opt.sub_options : (Array.isArray(opt.subOptions) ? opt.subOptions : [])
          }))
        });
      }
    });

    tempItemModifierGroups = cleanGroups;

    // Bi-directional sync with all customization categories groups appliedItems
    if (currentItemModifiersCidx !== null && currentItemModifiersIidx !== null && currentMenuData) {
      const cat = currentMenuData[currentItemModifiersCidx];
      const item = cat?.items?.[currentItemModifiersIidx];
      if (cat && item) {
        const itemKey = String(item.id || `${cat.id}:${item.name}`);
        (currentMenuData || []).filter(c => isCustomizationCategory(c)).forEach(custCategory => {
          (custCategory.groups || []).forEach(grp => {
            if (!Array.isArray(grp.appliedItems)) grp.appliedItems = [];
            const gid = String(grp.id || '');
            const canonId = String(grp.canonicalId || '');
            if (checkedGroupIds.has(gid) || (canonId && checkedGroupIds.has(canonId))) {
              if (!grp.appliedItems.includes(itemKey)) grp.appliedItems.push(itemKey);
            } else {
              grp.appliedItems = grp.appliedItems.filter(k => k !== itemKey);
            }
          });
        });
      }
    }
  } else {
    // Fallback mode for unit tests or programmatic execution
    tempItemModifierGroups = tempItemModifierGroups.filter(grp => grp.name && grp.name.trim() !== "");
  }

  if (currentItemModifiersCidx !== null && currentItemModifiersIidx !== null) {
    const item = currentMenuData[currentItemModifiersCidx]?.items?.[currentItemModifiersIidx];
    if (item) {
      item.modifierGroups = tempItemModifierGroups;
      item.itemType = (item.bundleRule && item.bundleRule.groups && item.bundleRule.groups.length > 0) ? 'bundle' : 'standard';
      itemModifiersSnapshotBeforeEdit = null;
      itemCustomizationCategoriesSnapshotBeforeEdit = null;
      checkMenuDirty();
      renderMenuCategoryEditor(currentItemModifiersCidx);
    }
  }

  closeItemModifiersModal();
}
window.saveItemModifiersModal = saveItemModifiersModal;

function openModifierLibraryModal() {
  if (currentItemModifiersCidx !== null && currentItemModifiersIidx !== null) {
    openItemModifiersModal(currentItemModifiersCidx, currentItemModifiersIidx);
  }
}
window.openModifierLibraryModal = openModifierLibraryModal;

function closeModifierLibraryModal() {
  const modal = document.getElementById("modifierLibraryModal");
  if (modal) modal.style.display = "none";
}
window.closeModifierLibraryModal = closeModifierLibraryModal;

// ==========================================================================
// Item Detail Hub Modal (#itemDetailModal) Controller
// ==========================================================================
let activeItemDetailCatIdx = null;
let activeItemDetailItemIdx = null;
let currentDetailImageKey = null;
let isItemDetailCreateMode = false;

async function checkItemDetailImage(categoryId, itemName) {
  const previewEl = document.getElementById("item-detail-img-preview");
  const placeholderEl = document.getElementById("item-detail-img-placeholder");
  const deleteBtn = document.getElementById("btn-item-detail-delete-img");
  const statusEl = document.getElementById("item-detail-img-status");

  if (!previewEl || !placeholderEl || !statusEl) return;
  statusEl.innerText = t("imageChecking");
  previewEl.style.display = "none";
  placeholderEl.style.display = "flex";
  if (deleteBtn) deleteBtn.style.display = "none";

  const key = `${categoryId}_${itemName}`;
  const tenantId = getTenantIdFromUrl();

  try {
    let list = window._tenantImageList;
    if (!list) {
      const res = await fetch(`${WORKER_BASE}/api/image_list?tenant_id=${tenantId}&_t=${Date.now()}`);
      if (res.ok) {
        const arr = await res.json();
        list = new Set(arr);
        window._tenantImageList = list;
      }
    }
    const hasImg = list && (list.has(key) || list.has(itemName));
    if (hasImg) {
      const resolvedName = list.has(key) ? key : itemName;
      previewEl.src = `${WORKER_BASE}/api/image?tenant_id=${tenantId}&name=${encodeURIComponent(resolvedName)}&_t=${Date.now()}`;
      previewEl.style.display = "block";
      placeholderEl.style.display = "none";
      if (deleteBtn) deleteBtn.style.display = "inline-flex";
      statusEl.innerText = t("imageHasImage");
    } else {
      statusEl.innerText = t("imageNoImage");
    }
  } catch (e) {
    statusEl.innerText = t("imageLoadFail");
  }
}

function triggerItemDetailPhotoUpload() {
  const nameInput = document.getElementById("item-detail-name-input");
  const nameVal = nameInput ? nameInput.value.trim() : "";
  if (!nameVal && (isItemDetailCreateMode || activeItemDetailItemIdx === null)) {
    alert(t("enterItemNameFirst") || (currentLang === 'vi' ? "Vui lòng nhập tên món trước khi tải ảnh lên" : "請先輸入餐點名稱再上傳圖片"));
    if (nameInput) nameInput.focus();
    return;
  }
  const cat = currentMenuData[activeItemDetailCatIdx];
  if (cat && nameVal) {
    currentDetailImageKey = `${cat.id}_${nameVal}`;
  }
  const fileInput = document.getElementById("item-detail-file-input");
  if (fileInput) fileInput.click();
}
window.triggerItemDetailPhotoUpload = triggerItemDetailPhotoUpload;

function handleItemDetailImageSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const nameInput = document.getElementById("item-detail-name-input");
  const nameVal = (nameInput ? nameInput.value.trim() : "") || (currentMenuData[activeItemDetailCatIdx]?.items?.[activeItemDetailItemIdx]?.name || "").trim();
  const cat = currentMenuData[activeItemDetailCatIdx];
  if (!nameVal || !cat) {
    event.target.value = "";
    return;
  }
  currentDetailImageKey = `${cat.id}_${nameVal}`;

  const statusEl = document.getElementById("item-detail-img-status");
  if (statusEl) statusEl.innerText = t("imageUploading");

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = async function() {
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      const dataUri = canvas.toDataURL("image/webp", 0.82);

      try {
        const tenantId = getTenantIdFromUrl();
        const res = await fetch(`${WORKER_BASE}/api/image?tenant_id=${tenantId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: currentDetailImageKey, dataUri })
        });
        if (!res.ok) throw new Error("Upload failed");

        const previewEl = document.getElementById("item-detail-img-preview");
        const placeholderEl = document.getElementById("item-detail-img-placeholder");
        const deleteBtn = document.getElementById("btn-item-detail-delete-img");

        if (previewEl) {
          previewEl.src = dataUri;
          previewEl.style.display = "block";
        }
        if (placeholderEl) placeholderEl.style.display = "none";
        if (deleteBtn) deleteBtn.style.display = "inline-flex";
        if (statusEl) statusEl.innerText = t("imageUploadSuccess");

        if (window._tenantImageList) window._tenantImageList.add(currentDetailImageKey);
      } catch (err) {
        alert(t("imageUploadFail") + (err.message || ""));
        if (statusEl) statusEl.innerText = t("imageLoadFail");
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = "";
}
window.handleItemDetailImageSelect = handleItemDetailImageSelect;

async function deleteItemDetailPhoto() {
  if (!currentDetailImageKey) return;
  if (!confirm(t("confirmDeleteImage"))) return;

  const statusEl = document.getElementById("item-detail-img-status");
  const previewEl = document.getElementById("item-detail-img-preview");
  const placeholderEl = document.getElementById("item-detail-img-placeholder");
  const deleteBtn = document.getElementById("btn-item-detail-delete-img");

  if (statusEl) statusEl.innerText = t("imageDeleting");
  try {
    const tenantId = getTenantIdFromUrl();
    const res = await fetch(`${WORKER_BASE}/api/image?tenant_id=${tenantId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: currentDetailImageKey })
    });
    if (!res.ok) throw new Error("Delete failed");

    if (previewEl) {
      previewEl.src = "";
      previewEl.style.display = "none";
    }
    if (placeholderEl) placeholderEl.style.display = "flex";
    if (deleteBtn) deleteBtn.style.display = "none";
    if (statusEl) statusEl.innerText = t("imageNoImage");

    if (window._tenantImageList) {
      window._tenantImageList.delete(currentDetailImageKey);
      const bareName = currentDetailImageKey.includes("_") ? currentDetailImageKey.split("_").slice(1).join("_") : currentDetailImageKey;
      window._tenantImageList.delete(bareName);
    }
    if (activeItemDetailCatIdx !== null && activeItemDetailItemIdx !== null && currentMenuData?.[activeItemDetailCatIdx]?.items?.[activeItemDetailItemIdx]) {
      const item = currentMenuData[activeItemDetailCatIdx].items[activeItemDetailItemIdx];
      item.imageKey = null;
      if (window._tenantImageList) window._tenantImageList.delete(item.name);
    }
    markMenuDirty();
    renderMenuCategories();
  } catch (err) {
    alert(t("imageDeleteFail") + (err.message || ""));
    if (statusEl) statusEl.innerText = t("imageLoadFail");
  }
}
window.deleteItemDetailPhoto = deleteItemDetailPhoto;

function renderQuickTags(currentVal) {
  const container = document.getElementById("item-detail-quick-tags");
  if (!container) return;
  container.innerHTML = "";

  const tags = [
    { key: "quickTagHot", text: t("quickTagHot") },
    { key: "quickTagRecommend", text: t("quickTagRecommend") },
    { key: "quickTagNew", text: t("quickTagNew") },
    { key: "quickTagSpicy", text: t("quickTagSpicy") }
  ];

  tags.forEach(tg => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(currentVal === tg.text));
    chip.className = `quick-tag-chip ${currentVal === tg.text ? 'active' : ''}`;
    chip.innerText = tg.text;
    chip.onclick = () => handleQuickTagClick(tg.text);
    container.appendChild(chip);
  });
}

function handleQuickTagClick(tagText) {
  const badgeInput = document.getElementById("item-detail-badge-input");
  if (!badgeInput) return;

  const currentVal = badgeInput.value.trim();
  if (currentVal === tagText) {
    badgeInput.value = "";
  } else {
    badgeInput.value = tagText;
  }
  renderQuickTags(badgeInput.value.trim());
}
window.handleQuickTagClick = handleQuickTagClick;

let itemDetailSnapshotBeforeEdit = null;

function autoCommitItemDetailFields() {
  if (activeItemDetailCatIdx === null || activeItemDetailItemIdx === null) return;
  const item = currentMenuData[activeItemDetailCatIdx]?.items?.[activeItemDetailItemIdx];
  if (!item) return;

  const nameInput = document.getElementById("item-detail-name-input");
  const priceInput = document.getElementById("item-detail-price-input");
  const badgeInput = document.getElementById("item-detail-badge-input");

  if (nameInput && nameInput.value.trim()) item.name = nameInput.value.trim();
  if (priceInput && priceInput.value !== "") {
    const p = parseFloat(priceInput.value);
    if (!isNaN(p)) item.price = p;
  }
  if (badgeInput) {
    const bVal = badgeInput.value.trim();
    item.badgeText = bVal;
  }
  checkMenuDirty();
}

function openCreateItemModal(cIdx) {
  if (window.UnifiedMenu?.enabled) return window.UnifiedMenu.product(cIdx);
  syncMenuDataFromDOM();
  if (!currentMenuData || !currentMenuData[cIdx]) return;

  isItemDetailCreateMode = true;
  activeItemDetailCatIdx = cIdx;
  activeItemDetailItemIdx = null;
  currentDetailImageKey = null;
  itemDetailSnapshotBeforeEdit = null;

  const cat = currentMenuData[cIdx];
  const modal = document.getElementById("itemDetailModal");
  const titleEl = document.getElementById("item-detail-modal-title");
  if (titleEl) {
    titleEl.innerText = `${t("itemCreateTitle") || (currentLang === 'vi' ? "Thêm món mới" : "新增餐點")}`;
    titleEl.setAttribute("data-custom-title", "1");
  }
  const catNameEl = document.getElementById("item-detail-topbar-cat-name");
  if (catNameEl && cat) {
    catNameEl.innerText = cat.title || cat.name || cat.shortName || "";
  }

  // Name & Price inputs
  const nameInput = document.getElementById("item-detail-name-input");
  if (nameInput) {
    nameInput.value = "";
    nameInput.oninput = () => {
      const val = nameInput.value.trim();
      const photoNameEl = document.getElementById("item-detail-photo-item-name");
      if (photoNameEl) photoNameEl.innerText = val || "";
    };
  }
  const priceInput = document.getElementById("item-detail-price-input");
  if (priceInput) priceInput.value = "";

  // Photo
  const photoNameEl = document.getElementById("item-detail-photo-item-name");
  if (photoNameEl) photoNameEl.innerText = "";
  const previewEl = document.getElementById("item-detail-img-preview");
  const placeholderEl = document.getElementById("item-detail-img-placeholder");
  const deleteBtn = document.getElementById("btn-item-detail-delete-img");
  const statusEl = document.getElementById("item-detail-img-status");

  if (previewEl) {
    previewEl.src = "";
    previewEl.style.display = "none";
  }
  if (placeholderEl) placeholderEl.style.display = "flex";
  if (deleteBtn) deleteBtn.style.display = "none";
  if (statusEl) statusEl.innerText = t("imageNoImage");

  // Badge
  const badgeInput = document.getElementById("item-detail-badge-input");
  if (badgeInput) {
    badgeInput.value = "";
    renderQuickTags("");
    badgeInput.oninput = () => renderQuickTags(badgeInput.value.trim());
  }

  // Advanced Section
  const advSection = document.getElementById("item-detail-advanced-section");
  if (cat.type !== 'catalog') {
    if (advSection) advSection.style.display = "none";
  } else {
    if (advSection) advSection.style.display = "block";
    const modSumEl = document.getElementById("item-detail-mod-summary");
    if (modSumEl) modSumEl.innerText = t("itemModHubSummary", { direct: 0, inherited: getInheritedItemModifierGroups(cat).length });

    const bundleCard = document.getElementById("item-detail-bundle-card");
    const isBundleDisabled = window.currentTenantFeatures?.includes('disable_bundle_builder_v2');
    if (isBundleDisabled) {
      if (bundleCard) bundleCard.style.display = "none";
    } else {
      if (bundleCard) bundleCard.style.display = "flex";
      const bndlSumEl = document.getElementById("item-detail-bundle-summary");
      if (bndlSumEl) bndlSumEl.innerText = t("cardBundleEmpty");
    }
  }

  // Buttons
  const cancelBtn = document.getElementById("btn-item-detail-cancel");
  if (cancelBtn) cancelBtn.innerText = t("btnItemCancel") || (currentLang === 'vi' ? "Hủy" : "取消");

  const doneBtn = document.getElementById("btn-item-detail-done");
  if (doneBtn) {
    doneBtn.innerText = t("btnItemCreate") || (currentLang === 'vi' ? "Tạo món" : "建立餐點");
    doneBtn.setAttribute("data-custom-text", "1");
  }

  if (modal) {
    modal.style.display = "flex";
    const body = document.getElementById("item-detail-modal-body");
    if (body) body.scrollTop = 0;
  }
  setTimeout(() => {
    if (nameInput) nameInput.focus();
  }, 80);
}
window.openCreateItemModal = openCreateItemModal;

function openItemDetailModal(cIdx, iIdx) {
  if (window.UnifiedMenu?.enabled) return window.UnifiedMenu.product(cIdx, iIdx);
  syncMenuDataFromDOM();
  if (!currentMenuData || !currentMenuData[cIdx] || !currentMenuData[cIdx].items || !currentMenuData[cIdx].items[iIdx]) return;

  isItemDetailCreateMode = false;
  activeItemDetailCatIdx = cIdx;
  activeItemDetailItemIdx = iIdx;

  const cat = currentMenuData[cIdx];
  const item = cat.items[iIdx];
  itemDetailSnapshotBeforeEdit = JSON.parse(JSON.stringify(item));

  const modal = document.getElementById("itemDetailModal");
  const titleEl = document.getElementById("item-detail-modal-title");
  if (titleEl) {
    const itemName = item.name ? item.name.trim() : (t("newItemPlaceholder") || "Món mới");
    titleEl.innerText = `${t("itemDetailTitle")} - ${itemName}`;
    if (item.itemType === 'bundle' || item.bundleRule?.groups?.length > 0) {
      const comboBadge = document.createElement('span');
      comboBadge.className = 'menu-combo-badge menu-combo-badge-modal';
      comboBadge.textContent = t('bundleBadge');
      titleEl.appendChild(comboBadge);
    }
    titleEl.setAttribute("data-custom-title", "1");
  }
  const catNameEl = document.getElementById("item-detail-topbar-cat-name");
  if (catNameEl && cat) {
    catNameEl.innerText = cat.title || cat.name || cat.shortName || "";
  }

  // Name & Price inputs
  const nameInput = document.getElementById("item-detail-name-input");
  if (nameInput) {
    nameInput.value = item.name || "";
    nameInput.oninput = () => {
      const val = nameInput.value.trim();
      const photoNameEl = document.getElementById("item-detail-photo-item-name");
      if (photoNameEl) photoNameEl.innerText = val || "";
    };
  }
  const priceInput = document.getElementById("item-detail-price-input");
  if (priceInput) {
    priceInput.value = (item.price !== null && item.price !== undefined) ? item.price : "";
  }

  // Photo
  const photoNameEl = document.getElementById("item-detail-photo-item-name");
  if (photoNameEl) photoNameEl.innerText = item.name || "";
  currentDetailImageKey = `${cat.id}_${item.name}`;
  checkItemDetailImage(cat.id, item.name);

  // Badge
  const badgeInput = document.getElementById("item-detail-badge-input");
  if (badgeInput) {
    badgeInput.value = item.badgeText || "";
    renderQuickTags(item.badgeText || "");
    badgeInput.oninput = () => renderQuickTags(badgeInput.value.trim());
  }

  // Advanced Section
  const advSection = document.getElementById("item-detail-advanced-section");
  if (cat.type !== 'catalog') {
    if (advSection) advSection.style.display = "none";
  } else {
    if (advSection) advSection.style.display = "block";

    // Modifiers Summary
    const modCount = (item.modifierGroups || []).length;
    const modSumEl = document.getElementById("item-detail-mod-summary");
    if (modSumEl) {
      modSumEl.innerText = t("itemModHubSummary", { direct: modCount, inherited: getInheritedItemModifierGroups(cat).length });
    }

    // Bundle Summary
    const bundleCard = document.getElementById("item-detail-bundle-card");
    const isBundleDisabled = window.currentTenantFeatures?.includes('disable_bundle_builder_v2');
    if (isBundleDisabled) {
      if (bundleCard) bundleCard.style.display = "none";
    } else {
      if (bundleCard) bundleCard.style.display = "flex";
      const bundleCount = (item.bundleRule && Array.isArray(item.bundleRule.groups)) ? item.bundleRule.groups.length : 0;
      const bndlSumEl = document.getElementById("item-detail-bundle-summary");
      if (bndlSumEl) {
        bndlSumEl.innerText = bundleCount > 0 ? t("cardBundleCount", { count: bundleCount }) : t("cardBundleEmpty");
      }
    }
  }

  // Buttons
  const cancelBtn = document.getElementById("btn-item-detail-cancel");
  if (cancelBtn) cancelBtn.innerText = t("btnItemCancel") || (currentLang === 'vi' ? "Hủy" : "取消");

  const doneBtn = document.getElementById("btn-item-detail-done");
  if (doneBtn) {
    doneBtn.innerText = t("btnDetailDone") || (currentLang === 'vi' ? "Hoàn tất" : "完成");
    doneBtn.removeAttribute("data-custom-text");
  }

  if (modal) {
    modal.style.display = "flex";
    const body = document.getElementById("item-detail-modal-body");
    if (body) body.scrollTop = 0;
  }
}
window.openItemDetailModal = openItemDetailModal;

function closeItemDetailModal() {
  const modal = document.getElementById("itemDetailModal");
  if (modal) modal.style.display = "none";

  // Rollback on Cancel if we were editing an existing item and did not save
  if (!isItemDetailCreateMode && activeItemDetailCatIdx !== null && activeItemDetailItemIdx !== null && itemDetailSnapshotBeforeEdit) {
    if (currentMenuData?.[activeItemDetailCatIdx]?.items?.[activeItemDetailItemIdx]) {
      currentMenuData[activeItemDetailCatIdx].items[activeItemDetailItemIdx] = JSON.parse(JSON.stringify(itemDetailSnapshotBeforeEdit));
    }
  }

  isItemDetailCreateMode = false;
  activeItemDetailCatIdx = null;
  activeItemDetailItemIdx = null;
  currentDetailImageKey = null;
  itemDetailSnapshotBeforeEdit = null;
  checkMenuDirty();
}
window.closeItemDetailModal = closeItemDetailModal;

function saveItemDetailModal() {
  if (activeItemDetailCatIdx === null) {
    closeItemDetailModal();
    return;
  }
  const cat = currentMenuData[activeItemDetailCatIdx];
  if (!cat) {
    closeItemDetailModal();
    return;
  }

  const nameInput = document.getElementById("item-detail-name-input");
  const priceInput = document.getElementById("item-detail-price-input");
  const badgeInput = document.getElementById("item-detail-badge-input");

  const nameVal = nameInput ? nameInput.value.trim() : "";
  const priceVal = priceInput && priceInput.value !== "" ? parseFloat(priceInput.value) : 0;
  const badgeVal = badgeInput ? badgeInput.value.trim() : "";
  const isRec = Boolean(cat.items?.[activeItemDetailItemIdx]?.isRecommended);

  if (!nameVal) {
    alert(t("enterItemName") || (currentLang === 'vi' ? "Vui lòng nhập tên món" : "請輸入餐點名稱"));
    if (nameInput) nameInput.focus();
    return;
  }

  const modal = document.getElementById("itemDetailModal");
  if (modal) modal.style.display = "none";

  if (isItemDetailCreateMode || activeItemDetailItemIdx === null) {
    const newItem = {
      name: nameVal,
      price: isNaN(priceVal) ? 0 : priceVal,
      badgeText: badgeVal,
      isRecommended: isRec,
      isOos: false,
      bundleRule: null,
      itemType: "standard",
      modifierGroups: []
    };
    cat.items.push(newItem);
    const saveCatIdx = activeItemDetailCatIdx;
    isItemDetailCreateMode = false;
    activeItemDetailCatIdx = null;
    activeItemDetailItemIdx = null;
    currentDetailImageKey = null;
    itemDetailSnapshotBeforeEdit = null;
    checkMenuDirty();
    renderMenuCategoryEditor(saveCatIdx);
    renderMenuCategories();
  } else {
    const item = cat.items[activeItemDetailItemIdx];
    if (item) {
      item.name = nameVal;
      item.price = isNaN(priceVal) ? 0 : priceVal;
      item.badgeText = badgeVal;
      item.isRecommended = isRec;
      const saveCatIdx = activeItemDetailCatIdx;
      isItemDetailCreateMode = false;
      activeItemDetailCatIdx = null;
      activeItemDetailItemIdx = null;
      currentDetailImageKey = null;
      itemDetailSnapshotBeforeEdit = null;
      checkMenuDirty();
      renderMenuCategoryEditor(saveCatIdx);
      renderMenuCategories();
    } else {
      isItemDetailCreateMode = false;
      activeItemDetailCatIdx = null;
      activeItemDetailItemIdx = null;
      currentDetailImageKey = null;
      itemDetailSnapshotBeforeEdit = null;
      checkMenuDirty();
    }
  }
}
window.saveItemDetailModal = saveItemDetailModal;

function transitionToSubEditor(type) {
  if (activeItemDetailCatIdx === null) return;
  const cat = currentMenuData[activeItemDetailCatIdx];
  if (!cat) return;

  const nameInput = document.getElementById("item-detail-name-input");
  const priceInput = document.getElementById("item-detail-price-input");
  const badgeInput = document.getElementById("item-detail-badge-input");

  const nameVal = nameInput ? nameInput.value.trim() : "";
  const priceVal = priceInput && priceInput.value !== "" ? parseFloat(priceInput.value) : 0;
  const badgeVal = badgeInput ? badgeInput.value.trim() : "";
  const isRec = Boolean(cat.items?.[activeItemDetailItemIdx]?.isRecommended);

  if (isItemDetailCreateMode || activeItemDetailItemIdx === null) {
    if (!nameVal) {
      alert(t("enterItemNameFirst") || (currentLang === 'vi' ? "Vui lòng nhập tên món trước khi thiết lập nâng cao" : "請先輸入餐點名稱再進行進階設定"));
      if (nameInput) nameInput.focus();
      return;
    }
    const newItem = {
      name: nameVal,
      price: isNaN(priceVal) ? 0 : priceVal,
      badgeText: badgeVal,
      isRecommended: isRec,
      isOos: false,
      bundleRule: null,
      itemType: "standard",
      modifierGroups: []
    };
    cat.items.push(newItem);
    activeItemDetailItemIdx = cat.items.length - 1;
    isItemDetailCreateMode = false;
    markMenuDirty();
    renderMenuCategoryEditor(activeItemDetailCatIdx);
    renderMenuCategories();
  } else {
    autoCommitItemDetailFields();
  }

  const item = cat.items[activeItemDetailItemIdx];
  if (!item) return;

  window._hubModalReturnState = {
    catId: cat.id,
    itemName: item.name,
    catIdx: activeItemDetailCatIdx,
    itemIdx: activeItemDetailItemIdx
  };

  const modal = document.getElementById("itemDetailModal");
  if (modal) modal.style.display = "none";

  if (type === 'modifiers') {
    openItemModifiersModal(activeItemDetailCatIdx, activeItemDetailItemIdx);
  } else if (type === 'bundle') {
    openBundleEditorModal(activeItemDetailCatIdx, activeItemDetailItemIdx);
  }
}
window.transitionToSubEditor = transitionToSubEditor;
