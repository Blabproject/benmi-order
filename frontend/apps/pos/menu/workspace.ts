import {
  canonicalMenuSnapshot as contractCanonicalMenuSnapshot,
  getMenuDeletions as contractGetMenuDeletions,
  isCustomizationCategory as contractIsCustomizationCategory,
  normalizeBootstrapMenuCategories,
  serializeMenuData as contractSerializeMenuData,
  type MenuBootstrapResponseDto,
  type MenuCategoryDraft,
  type MenuDeletionsDto,
  type MenuWirePayload,
  type ModifierLibraryResponseDto
} from '@shared/contracts/menu-model';
import type { PosLocale } from '@shared/i18n/pos-dictionary';
import { createClientUuid } from '@shared/infra/http';
import { menuState, syncPosMenuStore } from './state';
import {
  getHost,
  getHostTargets,
  invokeHook,
  menuApiFetch,
  notifyToast,
  readCurrentLang,
  resolveTenantId,
  resolveWorkerBase,
  tr,
  type MenuEditorModelApi,
  type ScheduleSavePatch
} from './types';

function readLocale(): PosLocale {
  return readCurrentLang() === 'vi' ? 'vi' : 'zh-TW';
}

export function isCustomizationCategory(cat: MenuCategoryDraft | null | undefined): boolean {
  if (!cat) return false;
  return (
    cat.type === 'order_customization' ||
    cat.id === 'sec-flavor' ||
    cat.slug === 'sec-flavor' ||
    cat.type === 'modifier'
  );
}

export function getMenuModel(): MenuEditorModelApi {
  for (const target of getHostTargets()) {
    if (target.MenuEditorModel) return target.MenuEditorModel;
  }
  return {
    canonicalMenuSnapshot: contractCanonicalMenuSnapshot,
    serializeMenuData: contractSerializeMenuData,
    getMenuDeletions: contractGetMenuDeletions,
    normalizeBootstrapMenuCategories
  };
}

export function canonicalMenuSnapshot(data: unknown): string {
  return getMenuModel().canonicalMenuSnapshot(data);
}

export function updateMenuWorkspace(): void {
  const showDisplayOrder = Boolean(menuState.isCategoryManagerOpen);
  const showCategoryAdvanced = !showDisplayOrder && Boolean(menuState.isCategoryAdvancedOpen);
  const hideStandardWorkspace = showDisplayOrder || showCategoryAdvanced;
  const orderScreen = document.getElementById('menu-display-order-screen');
  if (orderScreen) orderScreen.hidden = !showDisplayOrder;
  const advancedScreen = document.getElementById('menu-category-advanced-screen');
  if (advancedScreen) advancedScreen.hidden = !showCategoryAdvanced;
  for (const id of ['menu-workspace-heading', 'menu-standard-workspace']) {
    const section = document.getElementById(id);
    if (section) section.hidden = hideStandardWorkspace;
  }
  document.getElementById('btn-menu-manage-cats')?.classList.toggle('active', showDisplayOrder);
  document.getElementById('btn-category-advanced-settings')?.classList.toggle('active', showCategoryAdvanced);
  const host = getHost();
  const optionsMode = menuState.menuSidebarTab === 'options' && Boolean(host.UnifiedMenu?.enabled);
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

export function setMenuMobileView(view: string): void {
  menuState.menuMobileView = view === 'detail' ? 'detail' : 'master';
  if (typeof document === 'undefined') return;
  const viewMenu = typeof document.getElementById === 'function' ? document.getElementById('view-menu') : null;
  if (viewMenu && typeof viewMenu.setAttribute === 'function') {
    viewMenu.setAttribute('data-mobile-view', menuState.menuMobileView);
  }
  updateMenuMobileNavButtons();
}

export function updateMenuMobileNavButtons(): void {
  if (typeof document === 'undefined') return;
  const isDetail = menuState.menuMobileView === 'detail';
  const btnNav = typeof document.querySelector === 'function' ? document.querySelector<HTMLElement>('.menu-header-nav-btn') : null;
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
      } else if (menuState.currentMenuData && menuState.currentMenuData[menuState.activeCategoryIndex]) {
        const cat = menuState.currentMenuData[menuState.activeCategoryIndex];
        if (cat) {
          titleText = isCustomizationCategory(cat)
            ? (cat.groups?.[menuState.activeOptionGroupIndex ?? 0]?.title || cat.title)
            : cat.title;
        }
      }
      if (titleEl && titleText) titleEl.textContent = titleText;
    } else {
      btnNav.style.display = '';
      btnBack.style.display = 'none';
      if (titleEl) titleEl.textContent = tr('menuWorkspaceTitle') || '菜單管理';
    }
  }
}

export function updateMenuSaveState(): void {
  const text = tr(menuState.isMenuSaving ? 'menuSaving' : menuState.isMenuDirty ? 'btnMenuSave' : 'menuSaved');
  for (const [id, labelId] of [
    ['btn-menu-save', 'btn-menu-save-text'],
    ['btn-menu-order-save', 'btn-menu-order-save-text'],
    ['btn-menu-cat-adv-save', 'btn-menu-cat-adv-save-text']
  ] as const) {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    const label = document.getElementById(labelId);
    if (!btn) continue;
    btn.disabled = menuState.isMenuSaving || menuState.isStockSaving || !menuState.isMenuLoadedCompletely || !menuState.isMenuDirty;
    btn.classList.toggle('has-changes', menuState.isMenuDirty);
    if (label) {
      label.textContent = id === 'btn-menu-order-save'
        ? (menuState.isMenuDirty ? (tr('btnSaveSortChanges') || text) : text)
        : text;
    } else {
      btn.textContent = text;
    }
  }

  for (const [wrapId, textId, savedKey] of [
    ['menu-order-save-status', 'menu-order-save-status-text', 'statusAutoSaved'],
    ['menu-cat-adv-save-status', 'menu-cat-adv-save-status-text', 'catAdvancedSyncDone']
  ] as const) {
    const statusWrap = document.getElementById(wrapId);
    const statusText = document.getElementById(textId);
    if (statusWrap && statusText) {
      if (menuState.isMenuDirty) {
        statusWrap.className = 'menu-order-save-status is-dirty';
        statusText.textContent = tr('statusUnsaved');
      } else {
        statusWrap.className = 'menu-order-save-status is-saved';
        statusText.textContent = tr(savedKey) || tr('statusAutoSaved');
      }
    }
  }

  const advBackButton = document.getElementById('btn-menu-cat-adv-back') as HTMLButtonElement | null;
  if (advBackButton) advBackButton.disabled = menuState.isMenuSaving;

  const revertBtn = document.getElementById('btn-menu-order-revert') as HTMLButtonElement | null;
  if (revertBtn) {
    revertBtn.disabled = menuState.isMenuSaving || !menuState.isMenuDirty;
  }
  const orderButton = document.getElementById('btn-menu-manage-cats') as HTMLButtonElement | null;
  if (orderButton) orderButton.disabled = menuState.isMenuSaving || !menuState.isMenuLoadedCompletely;

  const aiTranslateButton = document.getElementById('btn-menu-ai-translate') as HTMLButtonElement | null;
  if (aiTranslateButton) {
    const targetLocales = invokeHook('getActiveMenuTargetLocales', () => []);
    const canTranslate = Array.isArray(targetLocales) && targetLocales.length > 0;
    aiTranslateButton.style.display = canTranslate ? '' : 'none';
    aiTranslateButton.disabled =
      !canTranslate || menuState.isMenuSaving || !menuState.isMenuLoadedCompletely || Boolean(menuState.isMenuAiTranslating);
  }
  const backButton = document.getElementById('btn-menu-order-back') as HTMLButtonElement | null;
  if (backButton) backButton.disabled = menuState.isMenuSaving;
}

export function checkMenuDirty(): boolean {
  if (menuState.isMenuSaving) return menuState.isMenuDirty;
  if (!menuState.isMenuLoadedCompletely || !menuState.savedMenuSnapshot || !menuState.currentMenuData) {
    invokeHook('updateMenuSaveState', updateMenuSaveState);
    return menuState.isMenuDirty;
  }
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const currentSnap = invokeHook('canonicalMenuSnapshot', canonicalMenuSnapshot, menuState.currentMenuData);
  menuState.isMenuDirty = currentSnap !== menuState.savedMenuSnapshot;
  invokeHook('updateMenuSaveState', updateMenuSaveState);
  syncPosMenuStore();
  return menuState.isMenuDirty;
}

export function markMenuDirty(): void {
  if (menuState.savedMenuSnapshot && menuState.isMenuLoadedCompletely && menuState.currentMenuData) {
    invokeHook('checkMenuDirty', checkMenuDirty);
  } else {
    menuState.isMenuDirty = true;
    invokeHook('updateMenuSaveState', updateMenuSaveState);
    syncPosMenuStore();
  }
}

export function clearMenuDirty(): void {
  menuState.isMenuDirty = false;
  menuState.savedMenuSnapshot = invokeHook('canonicalMenuSnapshot', canonicalMenuSnapshot, menuState.currentMenuData);
  invokeHook('updateMenuSaveState', updateMenuSaveState);
  syncPosMenuStore();
}

export function acknowledgeMenuScheduleSave(patch: ScheduleSavePatch): void {
  if (!menuState.savedMenuSnapshot) return;
  const saved = JSON.parse(menuState.savedMenuSnapshot) as MenuCategoryDraft[];
  for (const cat of saved) {
    const id = String(cat.databaseId || cat.catId || cat.id || '');
    const entry = patch.categories.find(item => item.id === id);
    if (entry) {
      Object.assign(cat, {
        availabilityMode: entry.availabilityMode,
        shiftIds: [...entry.shiftIds],
        hideWhenUnavailable: entry.hideWhenUnavailable
      });
    }
    for (const item of cat.items || []) {
      const itemPatch = patch.items.find(row => row.id === String(item.id) && row.categoryId === id);
      if (itemPatch) {
        Object.assign(item, {
          availabilityMode: itemPatch.availabilityMode,
          shiftIds: [...itemPatch.shiftIds]
        });
      }
    }
  }
  menuState.savedMenuSnapshot = invokeHook('canonicalMenuSnapshot', canonicalMenuSnapshot, saved);
  menuState.isMenuDirty = invokeHook('canonicalMenuSnapshot', canonicalMenuSnapshot, menuState.currentMenuData) !== menuState.savedMenuSnapshot;
  invokeHook('updateMenuSaveState', updateMenuSaveState);
  syncPosMenuStore();
}

export function pruneSavedMenuShiftAssignments(validIds: Set<string>): void {
  if (!menuState.savedMenuSnapshot) return;
  const saved = JSON.parse(menuState.savedMenuSnapshot) as MenuCategoryDraft[];
  for (const cat of saved) {
    if ((cat.type || 'catalog') !== 'catalog') continue;
    for (const entity of [cat, ...(cat.items || [])]) {
      if (Array.isArray(entity.shiftIds)) {
        entity.shiftIds = entity.shiftIds.filter(id => validIds.has(String(id)));
      }
    }
  }
  menuState.savedMenuSnapshot = invokeHook('canonicalMenuSnapshot', canonicalMenuSnapshot, saved);
  invokeHook('checkMenuDirty', checkMenuDirty);
}

export function confirmLeaveMenu(): boolean {
  if (menuState.isMenuSaving || menuState.isStockSaving) return false;
  invokeHook('checkMenuDirty', checkMenuDirty);
  if (!menuState.isMenuDirty) return true;
  if (!confirm(tr('menuDiscardConfirm'))) return false;
  menuState.currentMenuData = menuState.savedMenuSnapshot ? (JSON.parse(menuState.savedMenuSnapshot) as MenuCategoryDraft[]) : null;
  menuState.activeCategoryIndex = menuState.currentMenuData?.length
    ? Math.max(0, Math.min(menuState.activeCategoryIndex, menuState.currentMenuData.length - 1))
    : -1;
  invokeHook('clearMenuDirty', clearMenuDirty);
  invokeHook('renderMenuCategories', () => undefined);
  if (menuState.activeCategoryIndex >= 0) {
    invokeHook('renderMenuCategoryEditor', () => undefined, menuState.activeCategoryIndex);
  } else {
    const body = document.getElementById('menu-editor-body');
    if (body) body.textContent = tr('menuSelectPrompt');
  }
  return true;
}

export function openMenuSettings(): void {
  if (menuState.isMenuDirty) invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  menuState.isCategoryAdvancedOpen = false;
  const host = getHost();
  host.activeTab = 'menu';
  setMenuMobileView('master');
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.mini-btn').forEach(tab => tab.classList.remove('active'));
  const tabMenu = document.getElementById('tab-menu');
  if (tabMenu) tabMenu.classList.add('active');
  if (typeof host.updateSidebarActive === 'function') {
    host.updateSidebarActive('menu');
  }
  document.querySelectorAll<HTMLElement>('.content').forEach(c => {
    c.style.display = 'none';
  });
  const viewMenu = document.getElementById('view-menu');
  if (viewMenu) viewMenu.style.display = 'block';
  if (typeof host.syncStoreStatusPlacement === 'function') {
    host.syncStoreStatusPlacement('menu');
  }
  if (!menuState.currentMenuData || !menuState.isMenuLoadedCompletely) {
    void loadMenuData();
  } else {
    invokeHook('renderMenuCategories', () => undefined);
    if (menuState.activeCategoryIndex >= 0) {
      invokeHook('renderMenuCategoryEditor', () => undefined, menuState.activeCategoryIndex);
    }
  }
}

export function setMenuLoading(loading: boolean): void {
  menuState.isMenuLoading = loading;
  const indicator = document.getElementById('menu-loading');
  if (indicator) indicator.hidden = !loading;
  const label = document.getElementById('i18n-menu-loading');
  if (label) label.textContent = tr('menuLoading');
  for (const id of ['menu-sidebar-panel', 'menu-editor-panel']) {
    const panel = document.getElementById(id) as (HTMLElement & { inert: boolean }) | null;
    if (panel) {
      panel.inert = loading;
      panel.setAttribute('aria-busy', String(loading));
    }
  }
}

export function _menuApiFetch(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  return menuApiFetch(url, options);
}

export function loadMenuData(): Promise<void> {
  if (!menuState.menuLoadPromise) {
    menuState.menuLoadPromise = fetchMenuData().finally(() => {
      menuState.menuLoadPromise = null;
    });
  }
  return menuState.menuLoadPromise;
}

export async function fetchMenuData(): Promise<void> {
  setMenuLoading(true);
  menuState.isMenuLoadedCompletely = false;
  invokeHook('updateMenuSaveState', updateMenuSaveState);
  const bodyEl = document.getElementById('menu-editor-body');
  const host = getHost();
  try {
    const tenantId = resolveTenantId();
    const workerBase = resolveWorkerBase();
    const [res, libraryResponse, imageListRes] = await Promise.all([
      _menuApiFetch(`${workerBase}/api/tenant/bootstrap?tenant_id=${tenantId}&_t=${Date.now()}`),
      _menuApiFetch(`${workerBase}/api/menu/modifier-library?tenant_id=${encodeURIComponent(tenantId)}&_t=${Date.now()}`),
      _menuApiFetch(`${workerBase}/api/image_list?tenant_id=${encodeURIComponent(tenantId)}&_t=${Date.now()}`).catch(() => null)
    ]);
    if (!res.ok) throw new Error('Failed to load bootstrap');
    const data = (await res.json()) as MenuBootstrapResponseDto & {
      tenant?: { operatingShifts?: unknown[] };
    };
    if (
      data.menuComplete !== true ||
      !Array.isArray(data.catalog) ||
      !Array.isArray(data.modifiers) ||
      (data.customizations !== undefined && !Array.isArray(data.customizations))
    ) {
      throw new Error('Incomplete menu');
    }
    if (data.tenant && typeof host.applyTenantBranding === 'function') {
      host.applyTenantBranding(data.tenant);
    }
    if (data.tenant && Array.isArray(data.tenant.operatingShifts)) {
      host.storeOperatingShifts = data.tenant.operatingShifts;
    }
    invokeHook('syncMenuScheduleEntryButtonVisibility', syncMenuScheduleEntryButtonVisibility);

    if (!libraryResponse.ok) throw new Error('Failed to load modifier library');
    const libraryData = (await libraryResponse.json()) as ModifierLibraryResponseDto;
    if (libraryData.complete !== true || !Array.isArray(libraryData.groups)) {
      throw new Error('Incomplete modifier library');
    }
    menuState.menuModifierLibrary = libraryData.groups;

    if (imageListRes && imageListRes.ok) {
      try {
        const imgArr = (await imageListRes.json()) as unknown;
        if (Array.isArray(imgArr)) {
          menuState.tenantImageList = new Set(imgArr.map(item => String(item)));
        }
      } catch {
        // Optional image list failure does not block menu loading.
      }
    }

    const categories = normalizeBootstrapMenuCategories({
      bootstrap: data,
      libraryGroups: menuState.menuModifierLibrary,
      tenantId,
      locale: readLocale()
    });

    if (data.unifiedMenu && host.UnifiedMenu?.load) {
      await host.UnifiedMenu.load();
    }
    menuState.currentMenuData = categories;
    menuState.isMenuLoadedCompletely = true;

    if (typeof host.updatePosCatalogPriceMap === 'function') {
      host.updatePosCatalogPriceMap(menuState.currentMenuData);
    }

    invokeHook('clearMenuDirty', clearMenuDirty);
    if (menuState.menuSidebarTab === 'products') {
      const firstCatalog = menuState.currentMenuData.findIndex(c => !isCustomizationCategory(c));
      menuState.activeCategoryIndex = firstCatalog >= 0 ? firstCatalog : menuState.currentMenuData.length > 0 ? 0 : -1;
    } else {
      let flavorIdx = menuState.currentMenuData.findIndex(
        c => c.type === 'order_customization' || c.id === 'sec-flavor' || c.slug === 'sec-flavor'
      );
      const flavorCat = flavorIdx >= 0 ? menuState.currentMenuData[flavorIdx] : undefined;
      if (flavorIdx >= 0 && (!flavorCat?.groups || flavorCat.groups.length === 0)) {
        const modIdx = menuState.currentMenuData.findIndex(c => c.type === 'modifier');
        if (modIdx >= 0) flavorIdx = modIdx;
      }
      if (flavorIdx < 0) flavorIdx = menuState.currentMenuData.findIndex(c => isCustomizationCategory(c));
      menuState.activeCategoryIndex = flavorIdx >= 0 ? flavorIdx : menuState.currentMenuData.length > 0 ? 0 : -1;
    }
    syncPosMenuStore();
    invokeHook('renderMenuCategories', () => undefined);
    if (menuState.activeCategoryIndex >= 0) {
      invokeHook('renderMenuCategoryEditor', () => undefined, menuState.activeCategoryIndex);
    } else {
      if (bodyEl) {
        bodyEl.innerHTML = `<div style="text-align:center; padding: 22px; color:#999;" id="i18n-menu-select-prompt">${tr('menuSelectPrompt')}</div>`;
      }
      const titleEl = document.getElementById('menu-editor-title');
      if (titleEl) titleEl.innerText = tr('menuEditorTitle');
      const renameBtn = document.getElementById('btn-category-rename');
      const deleteBtn = document.getElementById('btn-category-delete');
      if (renameBtn) renameBtn.style.display = 'none';
      if (deleteBtn) deleteBtn.style.display = 'none';
    }
  } catch (e) {
    console.warn('Complete menu load failed:', e);
    menuState.isMenuLoadedCompletely = false;
    invokeHook('updateMenuSaveState', updateMenuSaveState);
    if (menuState.isMenuDirty && menuState.currentMenuData) {
      notifyToast(tr('menuIncompleteReload') || 'Tải menu không thành công, đã giữ nguyên bản nháp đang sửa.', 'warning');
      return;
    }
    menuState.currentMenuData = null;
    menuState.savedMenuSnapshot = null;
    menuState.isMenuDirty = false;
    menuState.activeCategoryIndex = -1;
    syncPosMenuStore();
    invokeHook('renderMenuCategories', () => undefined);
    invokeHook('updateMenuSaveState', updateMenuSaveState);
    if (bodyEl) {
      bodyEl.textContent = tr('menuIncompleteReload');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = tr('menuRetryLoad');
      retry.style.minHeight = '48px';
      retry.addEventListener('click', () => {
        void loadMenuData();
      });
      bodyEl.appendChild(retry);
    }
  } finally {
    setMenuLoading(false);
  }
}

export function syncMenuDataFromDOM(): void {
  const data = menuState.currentMenuData;
  if (!data) return;
  document.querySelectorAll<HTMLInputElement>('#menu-editor-body input[data-name-cidx]').forEach(inp => {
    const cIdx = parseInt(inp.getAttribute('data-name-cidx') || '', 10);
    const iIdx = parseInt(inp.getAttribute('data-name-iidx') || '', 10);
    const item = data[cIdx]?.items?.[iIdx];
    if (item) {
      item.name = inp.value;
    }
  });
  document.querySelectorAll<HTMLInputElement>('#menu-editor-body input[data-cidx]').forEach(inp => {
    const cIdx = parseInt(inp.getAttribute('data-cidx') || '', 10);
    const iIdx = parseInt(inp.getAttribute('data-iidx') || '', 10);
    const val = inp.value.trim() === '' ? null : parseInt(inp.value, 10);
    const item = data[cIdx]?.items?.[iIdx];
    if (item) {
      item.price = val;
    }
  });
  document.querySelectorAll<HTMLInputElement>('#menu-editor-body input[data-badge-cidx]').forEach(inp => {
    const cIdx = parseInt(inp.getAttribute('data-badge-cidx') || '', 10);
    const iIdx = parseInt(inp.getAttribute('data-badge-iidx') || '', 10);
    const item = data[cIdx]?.items?.[iIdx];
    if (item) {
      item.badgeText = inp.value.trim();
    }
  });
  document.querySelectorAll<HTMLInputElement>('#menu-editor-body input[data-cust-name-cidx]').forEach(inp => {
    const cIdx = parseInt(inp.getAttribute('data-cust-name-cidx') || '', 10);
    const gIdx = parseInt(inp.getAttribute('data-cust-gidx') || '', 10);
    const oIdx = parseInt(inp.getAttribute('data-cust-oidx') || '', 10);
    const cat = data[cIdx];
    const opt = cat?.groups?.[gIdx]?.options?.[oIdx];
    if (cat && opt) {
      opt.name = inp.value.trim();
      if (cat.type === 'modifier') {
        if (!cat.items) cat.items = [];
        const modItem = cat.items[oIdx];
        if (modItem) {
          modItem.name = inp.value.trim();
        }
      }
    }
  });
  document.querySelectorAll<HTMLInputElement>('#menu-editor-body input[data-cust-price-cidx]').forEach(inp => {
    const cIdx = parseInt(inp.getAttribute('data-cust-price-cidx') || '', 10);
    const gIdx = parseInt(inp.getAttribute('data-cust-gidx') || '', 10);
    const oIdx = parseInt(inp.getAttribute('data-cust-oidx') || '', 10);
    const val = inp.value.trim() === '' ? 0 : parseInt(inp.value, 10) || 0;
    const cat = data[cIdx];
    const opt = cat?.groups?.[gIdx]?.options?.[oIdx];
    if (cat && opt) {
      opt.price = val;
      if (cat.type === 'modifier') {
        if (!cat.items) cat.items = [];
        const modItem = cat.items[oIdx];
        if (modItem) {
          modItem.price = val;
        }
      }
    }
  });
}

export function serializeMenuData(categories?: MenuCategoryDraft[]): MenuWirePayload {
  const targetCategories = Array.isArray(categories)
    ? categories
    : Array.isArray(menuState.currentMenuData)
      ? menuState.currentMenuData
      : [];
  const hostIsCustom = getHost().isCustomizationCategory;
  const isCustomFn = typeof hostIsCustom === 'function'
    ? (hostIsCustom as (c: MenuCategoryDraft) => boolean)
    : isCustomizationCategory;
  return getMenuModel().serializeMenuData(targetCategories, {
    getTenantId: resolveTenantId,
    createUuid: createClientUuid,
    sharedCategories: menuState.currentMenuData ?? targetCategories,
    isCustomizationCategory: isCustomFn,
    getDuplicateItemMessage: () => tr('menuDuplicateItem')
  });
}

export function getMenuDeletions(
  before: MenuCategoryDraft[],
  after: MenuCategoryDraft[]
): MenuDeletionsDto {
  const hostIsCustom = getHost().isCustomizationCategory;
  const isCustomFn = typeof hostIsCustom === 'function'
    ? (hostIsCustom as (c: MenuCategoryDraft) => boolean)
    : contractIsCustomizationCategory;
  return getMenuModel().getMenuDeletions(before, after, {
    isCustomizationCategory: isCustomFn
  });
}

export async function saveMenuData(skipConfirm = false): Promise<void> {
  if (!menuState.isMenuLoadedCompletely) {
    alert(tr('menuIncompleteReload'));
    return;
  }
  if (!menuState.currentMenuData || menuState.isMenuSaving || menuState.isStockSaving) return;
  if (!skipConfirm && !confirm(tr('confirmSaveMenu'))) return;
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  let output: MenuWirePayload;
  try {
    output = serializeMenuData(menuState.currentMenuData);
    output.__delete = getMenuDeletions(
      JSON.parse(menuState.savedMenuSnapshot || '[]') as MenuCategoryDraft[],
      menuState.currentMenuData
    );
  } catch (error) {
    alert(tr('menuSaveFail') + (error instanceof Error ? error.message : String(error)));
    return;
  }

  menuState.isMenuSaving = true;
  invokeHook('updateMenuSaveState', updateMenuSaveState);
  const editor = document.getElementById('menu-editor-body') as (HTMLElement & { inert: boolean }) | null;
  if (editor) editor.inert = true;
  document.querySelectorAll<HTMLElement & { inert: boolean }>('.menu-header-actions, #menu-categories, #menu-order-panels, #menu-category-advanced-body').forEach(el => {
    el.inert = true;
  });

  const host = getHost();
  try {
    const res = await _menuApiFetch(`${resolveWorkerBase()}/api/menu?tenant_id=${resolveTenantId()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(output)
    });
    if (!res.ok) {
      const details = (await res.json().catch(() => null)) as { code?: string; error?: string } | null;
      const code = details?.code || details?.error || '';
      throw new Error(`API returned ${res.status}${code ? ` (${code})` : ''}`);
    }
    if (host.UnifiedMenu?.enabled && host.UnifiedMenu.load) {
      await host.UnifiedMenu.load();
    }
    invokeHook('clearMenuDirty', clearMenuDirty);
    if (menuState.isCategoryManagerOpen) {
      invokeHook('captureMenuDisplayOrder', () => undefined);
    }
    if (menuState.isCategoryAdvancedOpen) {
      invokeHook('renderCategoryAdvancedSettingsView', () => undefined);
    }
    try {
      const tid = resolveTenantId();
      localStorage.removeItem('tenant_customizations_' + tid);
    } catch {
      // Ignore storage errors.
    }
    if (typeof host.updatePosCatalogPriceMap === 'function') {
      host.updatePosCatalogPriceMap(menuState.currentMenuData);
    }
    if (!skipConfirm) {
      alert(tr('menuSaveSuccess'));
    }
    invokeHook('renderMenuCategories', () => undefined);
  } catch (e) {
    alert(tr('menuSaveFail') + (e instanceof Error ? e.message : String(e)));
  } finally {
    menuState.isMenuSaving = false;
    if (editor) editor.inert = false;
    document.querySelectorAll<HTMLElement & { inert: boolean }>('.menu-header-actions, #menu-categories, #menu-order-panels, #menu-category-advanced-body').forEach(el => {
      el.inert = false;
    });
    invokeHook('updateMenuSaveState', updateMenuSaveState);
  }
}

export function syncMenuScheduleEntryButtonVisibility(): void {
  const btn = document.getElementById('btn-menu-schedule-builder');
  if (!btn) return;
  const host = getHost();
  const enabled = typeof host.isMenuScheduleWorkspaceAvailable === 'function'
    ? host.isMenuScheduleWorkspaceAvailable()
    : (typeof host.isMenuScheduleFeatureEnabled === 'function' && host.isMenuScheduleFeatureEnabled());
  btn.style.display = enabled ? 'inline-flex' : 'none';
}
