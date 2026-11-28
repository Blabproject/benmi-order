import {
  deleteCategoryAtIndex,
  openAddCategoryModal,
  renderCategoriesManagerView
} from './categories-manager';
import { menuState } from './state';
import {
  esc,
  getHost,
  invokeHook,
  readCurrentLang,
  resolveTenantId,
  resolveWorkerBase,
  tr,
  type MenuCategoryDraft,
  type MenuItemDraft,
  type StoreModifierListItem
} from './types';
import {
  _menuApiFetch,
  confirmLeaveMenu,
  isCustomizationCategory,
  markMenuDirty,
  setMenuMobileView,
  syncMenuDataFromDOM,
  updateMenuWorkspace
} from './workspace';

export function moveMenuItem(cIdx: number, iIdx: number, direction: number): void {
  const items = menuState.currentMenuData?.[cIdx]?.items;
  const target = iIdx + direction;
  if (!items || (direction !== -1 && direction !== 1) || target < 0 || target >= items.length) return;
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const currentItem = items[iIdx];
  const targetItem = items[target];
  if (!currentItem || !targetItem) return;
  items[iIdx] = targetItem;
  items[target] = currentItem;
  invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, cIdx);
  invokeHook('markMenuDirty', markMenuDirty);
  document.getElementById(`menu-item-card-${cIdx}-${target}`)?.focus();
}

export function toggleMenuSectionCollapse(sectionKey: string): void {
  if (sectionKey === 'catalog' || sectionKey === 'custom') {
    menuState.collapsedMenuSections[sectionKey] = !menuState.collapsedMenuSections[sectionKey];
    invokeHook('renderMenuCategories', renderMenuCategories);
  }
}

export function isComboCategory(cat: MenuCategoryDraft | null | undefined): boolean {
  if (!cat) return false;
  if (cat.type !== 'catalog') return false;
  const slug = (cat.slug || '').toLowerCase();
  const title = (cat.title || '').toLowerCase();
  if (slug === 'combo' || slug === 'bundle' || slug.includes('combo') || slug.includes('bundle')) return true;
  if (title.includes('combo') || title.includes('set') || title.includes('套餐')) return true;
  if (
    Array.isArray(cat.items) &&
    cat.items.length > 0 &&
    cat.items.every(it => it.itemType === 'bundle' || Boolean(it.bundleRule?.groups?.length))
  ) {
    return true;
  }
  return false;
}

export function setMenuSidebarTab(tab: string): void {
  const normalizedTab: 'products' | 'options' = tab === 'options' ? 'options' : 'products';
  if (!invokeHook('confirmLeaveMenu', confirmLeaveMenu)) return;
  if (menuState.isMenuDirty) invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  menuState.menuSidebarTab = normalizedTab;
  try {
    sessionStorage.setItem('pos_menu_subtab', normalizedTab);
  } catch {
    // Ignore storage restriction errors.
  }

  const btnProducts = document.getElementById('btn-seg-products');
  const btnOptions = document.getElementById('btn-seg-options');
  if (btnProducts) {
    btnProducts.classList.toggle('active', normalizedTab === 'products');
    btnProducts.setAttribute('aria-selected', String(normalizedTab === 'products'));
  }
  if (btnOptions) {
    btnOptions.classList.toggle('active', normalizedTab === 'options');
    btnOptions.setAttribute('aria-selected', String(normalizedTab === 'options'));
  }

  const prodActions = document.getElementById('menu-sidebar-products-actions');
  if (prodActions) {
    prodActions.style.display = normalizedTab === 'products' ? 'block' : 'none';
  }

  menuState.isCategoryManagerOpen = false;
  menuState.isCustomGroupCreatorOpen = false;
  setMenuMobileView('master');

  const data = menuState.currentMenuData;
  if (data && data.length > 0) {
    if (normalizedTab === 'products') {
      const activeCat = data[menuState.activeCategoryIndex];
      if (!activeCat || isCustomizationCategory(activeCat)) {
        menuState.activeCategoryIndex = data.findIndex(c => !isCustomizationCategory(c));
      }
    } else {
      const activeCat = data[menuState.activeCategoryIndex];
      if (!activeCat || !isCustomizationCategory(activeCat)) {
        let flavorIdx = data.findIndex(c => c.type === 'order_customization' || c.id === 'sec-flavor' || c.slug === 'sec-flavor');
        const flavorCat = flavorIdx >= 0 ? data[flavorIdx] : undefined;
        if (flavorIdx >= 0 && (!flavorCat?.groups || flavorCat.groups.length === 0)) {
          const modIdx = data.findIndex(c => c.type === 'modifier');
          if (modIdx >= 0) flavorIdx = modIdx;
        }
        if (flavorIdx < 0) {
          flavorIdx = data.findIndex(c => isCustomizationCategory(c));
        }
        if (flavorIdx >= 0) {
          menuState.activeCategoryIndex = flavorIdx;
          menuState.activeOptionGroupIndex = 0;
        } else {
          menuState.activeCategoryIndex = -1;
        }
      }
    }
  }

  invokeHook('renderMenuCategories', renderMenuCategories);
  invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, menuState.activeCategoryIndex);
}

export function handleCreateComboFromSidebar(): void {
  if (!invokeHook('confirmLeaveMenu', confirmLeaveMenu)) return;
  if (!menuState.currentMenuData) menuState.currentMenuData = [];
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);

  menuState.menuSidebarTab = 'products';
  try {
    sessionStorage.setItem('pos_menu_subtab', 'products');
  } catch {
    // Ignore storage restriction errors.
  }
  const host = getHost();
  const lang = readCurrentLang();
  let comboCatIdx = menuState.currentMenuData.findIndex(c => isComboCategory(c));
  if (comboCatIdx < 0) {
    const comboCat: MenuCategoryDraft = {
      id: `${host.currentTenantId || 'cat'}_combo_${Date.now()}`,
      title: lang === 'vi' ? 'Combo & Set ưu đãi' : '特惠套餐',
      shortName: lang === 'vi' ? 'Combo' : '套餐',
      slug: 'combo',
      type: 'catalog',
      allowCustomization: false,
      appliedModifiers: [],
      items: []
    };
    menuState.currentMenuData.push(comboCat);
    invokeHook('markMenuDirty', markMenuDirty);
    comboCatIdx = menuState.currentMenuData.length - 1;
  }

  menuState.isCategoryManagerOpen = false;
  menuState.isCustomGroupCreatorOpen = false;
  setMenuMobileView('master');
  menuState.activeCategoryIndex = comboCatIdx;
  invokeHook('renderMenuCategories', renderMenuCategories);
  invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, comboCatIdx);
  if (typeof host.openBundleWizard === 'function') {
    (host.openBundleWizard as (cIdx: number) => void)(comboCatIdx);
  }
}

export function handleCreateCustomFromSidebar(): void {
  const host = getHost();
  if (host.UnifiedMenu?.enabled) {
    void host.UnifiedMenu.group?.();
    return;
  }
  if (!invokeHook('confirmLeaveMenu', confirmLeaveMenu)) return;
  if (!menuState.currentMenuData) menuState.currentMenuData = [];
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);

  menuState.menuSidebarTab = 'options';
  try {
    sessionStorage.setItem('pos_menu_subtab', 'options');
  } catch {
    // Ignore storage restriction errors.
  }
  const lang = readCurrentLang();
  let flavorIdx = menuState.currentMenuData.findIndex(c => c.type === 'order_customization' || c.id === 'sec-flavor');
  if (flavorIdx < 0) {
    const newCat: MenuCategoryDraft = {
      id: 'sec-flavor',
      title: lang === 'vi' ? 'Tùy chọn khẩu vị & biến thể' : '口味與客製化選擇',
      shortName: lang === 'vi' ? 'Khẩu vị' : '口味選擇',
      type: 'order_customization',
      allowCustomization: false,
      appliedModifiers: [],
      groups: [],
      items: []
    };
    menuState.currentMenuData.push(newCat);
    flavorIdx = menuState.currentMenuData.length - 1;
    invokeHook('markMenuDirty', markMenuDirty);
  }

  menuState.isCategoryManagerOpen = false;
  menuState.isCustomGroupCreatorOpen = true;
  menuState.newCustomGroupType = 'radio';
  menuState.newCustomGroupRequired = false;
  menuState.activeCategoryIndex = flavorIdx;
  invokeHook('renderMenuCategories', renderMenuCategories);
  invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, flavorIdx);
  invokeHook('openNewCustomGroupCreator', () => undefined, flavorIdx);
}

export function selectMenuCatalogCategory(index: number): void {
  if (index !== menuState.activeCategoryIndex && !invokeHook('confirmLeaveMenu', confirmLeaveMenu)) return;
  if (index === menuState.activeCategoryIndex && menuState.isMenuDirty) {
    invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  }
  menuState.isCategoryManagerOpen = false;
  menuState.isCustomGroupCreatorOpen = false;
  menuState.activeCategoryIndex = index;
  invokeHook('renderMenuCategories', renderMenuCategories);
  invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, index);
  setMenuMobileView('detail');
}

export function renderMenuCategories(): void {
  updateMenuWorkspace();
  if (menuState.isCategoryManagerOpen) {
    renderCategoriesManagerView();
    return;
  }
  const container = document.getElementById('menu-categories');
  if (!container) return;
  const host = getHost();
  host.MenuCatalogLists?.clearCategories?.();
  container.innerHTML = '';

  const btnProducts = document.getElementById('btn-seg-products');
  const btnOptions = document.getElementById('btn-seg-options');
  if (btnProducts) {
    btnProducts.classList.toggle('active', menuState.menuSidebarTab === 'products');
    btnProducts.setAttribute('aria-selected', String(menuState.menuSidebarTab === 'products'));
  }
  const tabs = document.getElementById('menu-mode-tabs') as (HTMLElement & { menuKeyboardReady?: boolean }) | null;
  if (tabs && !tabs.menuKeyboardReady) {
    tabs.menuKeyboardReady = true;
    tabs.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 'products'
          : event.key === 'End'
            ? 'options'
            : menuState.menuSidebarTab === 'products'
              ? 'options'
              : 'products';
      setMenuSidebarTab(next);
      document.getElementById(menuState.menuSidebarTab === 'products' ? 'btn-seg-products' : 'btn-seg-options')?.focus();
    });
  }
  if (btnProducts) btnProducts.tabIndex = menuState.menuSidebarTab === 'products' ? 0 : -1;
  if (btnOptions) {
    btnOptions.tabIndex = menuState.menuSidebarTab === 'options' ? 0 : -1;
    btnOptions.classList.toggle('active', menuState.menuSidebarTab === 'options');
    btnOptions.setAttribute('aria-selected', String(menuState.menuSidebarTab === 'options'));
  }
  const prodActions = document.getElementById('menu-sidebar-products-actions');
  if (prodActions) {
    prodActions.style.display = menuState.menuSidebarTab === 'products' ? 'block' : 'none';
  }
  const btnManageCats = document.getElementById('btn-menu-manage-cats');
  if (btnManageCats) {
    btnManageCats.classList.toggle('active', Boolean(menuState.isCategoryManagerOpen));
  }

  if (host.UnifiedMenu?.sidebar?.()) return;
  if (!menuState.currentMenuData) return;

  const plusIcon =
    host.POS_SVG?.plus ||
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

  if (menuState.menuSidebarTab === 'products') {
    const catalogList: Array<{ cat: MenuCategoryDraft; originalIndex: number }> = [];
    menuState.currentMenuData.forEach((cat, originalIndex) => {
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
    if (footerCats) footerCats.textContent = tr('menuSidebarTotalCats', { count: catalogList.length });
    if (footerItems) footerItems.textContent = tr('menuSidebarActiveItems', { count: totalActiveItems });

    if (typeof host.syncStoreStatusPlacement === 'function') {
      host.syncStoreStatusPlacement('menu');
    }

    const listEl = document.createElement('div');
    listEl.className = 'menu-sidebar-section';
    container.appendChild(listEl);
    host.MenuCatalogLists?.renderCategories?.(listEl, {
      categories: catalogList.map(({ cat, originalIndex }) => ({
        index: originalIndex,
        title: cat.title,
        itemCount: Array.isArray(cat.items) ? cat.items.length : 0,
        active: menuState.activeCategoryIndex === originalIndex && !menuState.isCategoryManagerOpen,
        combo: !host.UnifiedMenu?.enabled && isComboCategory(cat)
      })),
      t: tr,
      onSelect: selectMenuCatalogCategory,
      onAdd: () => openAddCategoryModal('catalog')
    });
  } else {
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'menu-sidebar-section menu-sidebar-options-list';

    const addGroupBtn = document.createElement('button');
    addGroupBtn.type = 'button';
    addGroupBtn.className = 'menu-add-option-group-btn';
    addGroupBtn.innerHTML = `${plusIcon}<span>${esc(tr('btnAddOptionGroupTop') || tr('btnCreateCustomGroup'))}</span>`;
    addGroupBtn.onclick = () => handleCreateCustomFromSidebar();
    optionsContainer.appendChild(addGroupBtn);

    const optionCards: Array<{
      catIndex: number;
      groupIndex: number;
      scope: 'order' | 'item';
      title: string;
      count: number;
    }> = [];
    menuState.currentMenuData.forEach((cat, catIndex) => {
      if (!isCustomizationCategory(cat)) return;
      if (Array.isArray(cat.groups) && cat.groups.length) {
        cat.groups.forEach((group, groupIndex) =>
          optionCards.push({
            catIndex,
            groupIndex,
            scope: (group.scope || (cat.type === 'modifier' ? 'item' : 'order')) === 'order' ? 'order' : 'item',
            title: group.title || cat.title,
            count: (group.options || []).length
          })
        );
      } else if (cat.type === 'modifier') {
        optionCards.push({
          catIndex,
          groupIndex: 0,
          scope: 'item',
          title: cat.title,
          count: (cat.items || []).length
        });
      }
    });

    (['order', 'item'] as const).forEach(scope => {
      const cards = optionCards.filter(card => card.scope === scope);
      const section = document.createElement('details');
      section.className = 'menu-option-section';
      section.open = menuState.menuOptionSectionsOpen[scope];
      section.ontoggle = () => {
        menuState.menuOptionSectionsOpen[scope] = section.open;
      };
      const heading = document.createElement('summary');
      heading.className = 'menu-option-section-heading';
      heading.innerHTML = `<span>${esc(tr(scope === 'order' ? 'optionSectionOrder' : 'optionSectionItem'))}</span>
        <span class="menu-option-section-count">${cards.length}</span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
      section.appendChild(heading);
      const cardList = document.createElement('div');
      cardList.className = 'menu-option-section-cards';
      section.appendChild(cardList);
      if (!cards.length) {
        const empty = document.createElement('p');
        empty.className = 'menu-section-empty-hint';
        empty.textContent = tr('optionSectionEmpty');
        cardList.appendChild(empty);
      }
      cards.forEach(card => {
        const isActive =
          menuState.activeCategoryIndex === card.catIndex &&
          (menuState.activeOptionGroupIndex === card.groupIndex ||
            (menuState.activeOptionGroupIndex === null && card.groupIndex === 0));
        const cardEl = document.createElement('button');
        cardEl.type = 'button';
        cardEl.className = `menu-option-card ${isActive ? 'active' : ''}`;
        if (isActive) cardEl.setAttribute('aria-current', 'true');
        cardEl.innerHTML = `<span class="menu-option-card-content">
          <span class="menu-option-card-title">${esc(card.title)}</span>
          <span class="menu-option-card-subtitle">${card.count} ${esc(tr('optionsCountUnit'))}</span>
        </span><span class="menu-option-card-right">
          <span class="menu-option-card-badge">${card.count}</span>
          <span class="menu-option-card-chevron" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </span>
        </span>`;
        cardEl.onclick = () => {
          if (menuState.activeCategoryIndex !== card.catIndex && !invokeHook('confirmLeaveMenu', confirmLeaveMenu)) return;
          if (menuState.activeCategoryIndex === card.catIndex && menuState.isMenuDirty) {
            invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
          }
          menuState.isCategoryManagerOpen = false;
          menuState.isCustomGroupCreatorOpen = false;
          menuState.activeCategoryIndex = card.catIndex;
          menuState.activeOptionGroupIndex = card.groupIndex;
          invokeHook('renderMenuCategories', renderMenuCategories);
          invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, card.catIndex);
          setMenuMobileView('detail');
          document.querySelector<HTMLElement>('.menu-sidebar-options-list .menu-option-card.active')?.focus({ preventScroll: true });
          const target = document.querySelector(`.cust-group-card[data-cust-group-index="${card.groupIndex}"]`);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        cardList.appendChild(cardEl);
      });
      optionsContainer.appendChild(section);
    });

    const footerCats = document.getElementById('menu-sidebar-footer-cats');
    const footerItems = document.getElementById('menu-sidebar-footer-items');
    if (footerCats) footerCats.textContent = tr('menuSidebarTotalCats', { count: optionCards.length });
    if (footerItems) footerItems.textContent = '';

    container.appendChild(optionsContainer);
  }

  if (typeof container.querySelector === 'function') {
    const activePill = container.querySelector('.menu-option-card.active');
    if (activePill && typeof activePill.scrollIntoView === 'function' && container.scrollWidth > container.clientWidth) {
      activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }
}

export function getItemImageUrl(catId: string, itemName: string): string | null {
  if (!itemName) return null;
  const host = getHost();
  const list = menuState.tenantImageList;
  const canonicalProduct = host.UnifiedMenu?.imageKey?.(catId, itemName);
  const tenantId = resolveTenantId() || 'benmi';
  const workerBase = resolveWorkerBase();
  if (canonicalProduct && (!list || list.has(canonicalProduct))) {
    return `${workerBase}/api/image?tenant_id=${encodeURIComponent(tenantId)}&name=${encodeURIComponent(canonicalProduct)}`;
  }
  const key = `${catId}_${itemName}`;
  if (list && (list.has(key) || list.has(itemName))) {
    const resolvedName = list.has(key) ? key : itemName;
    return `${workerBase}/api/image?tenant_id=${encodeURIComponent(tenantId)}&name=${encodeURIComponent(resolvedName)}`;
  }
  return null;
}

export function isModifierAppliedToCategory(mod: StoreModifierListItem, cat: MenuCategoryDraft): boolean {
  if (!mod || !cat) return false;
  if (mod.type === 'customization' && mod.group) {
    const applied = mod.group.appliedCategories || [];
    return applied.includes(cat.id) || Boolean(cat.databaseId && applied.includes(cat.databaseId));
  }
  const appliedMods = cat.appliedModifiers || (cat.allowCustomization === false ? [] : ['*']);
  return (
    appliedMods.includes('*') ||
    appliedMods.includes(mod.id) ||
    Boolean(mod.databaseId && appliedMods.includes(mod.databaseId))
  );
}

export function getStoreModifiersList(): StoreModifierListItem[] {
  if (!menuState.currentMenuData) return [];
  const list: StoreModifierListItem[] = [];
  menuState.currentMenuData.forEach((c, cIdx) => {
    if (c.type === 'modifier') {
      const optCount = Array.isArray(c.items) ? c.items.length : (c.groups?.[0]?.options?.length || 0);
      list.push({
        id: c.id,
        databaseId: c.databaseId,
        title: c.title,
        type: 'modifier',
        count: optCount,
        categoryIndex: cIdx
      });
    } else if (c.type === 'order_customization' || c.id === 'sec-flavor') {
      (c.groups || []).forEach((g, gIdx) => {
        const optCount = Array.isArray(g.options) ? g.options.length : 0;
        list.push({
          id: String(g.id || g.key || ''),
          key: g.key,
          title: g.title || (g as { name?: string }).name || '',
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

export function toggleCategoryModifiersCollapse(cIdx: number): void {
  const cat = menuState.currentMenuData?.[cIdx];
  const catKey = cat ? cat.id || String(cIdx) : String(cIdx);
  if (menuState.collapsedCategoryMods.has(catKey)) {
    menuState.collapsedCategoryMods.delete(catKey);
  } else {
    menuState.collapsedCategoryMods.add(catKey);
  }
  invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, cIdx);
}

export function toggleCategoryModifierSelectAll(cIdx: number): void {
  const cat = menuState.currentMenuData?.[cIdx];
  if (!cat) return;
  const storeModifiers = getStoreModifiersList();
  const appliedCount = storeModifiers.filter(mod => isModifierAppliedToCategory(mod, cat)).length;
  const selectAll = appliedCount < storeModifiers.length;
  invokeHook('selectAllCategoryModifiers', selectAllCategoryModifiers, cIdx, selectAll);
}

export async function readMenuImageAsWebp(file: File, maxDim: number, quality: number): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(tr('imageLoadFail')));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(tr('imageLoadFail')));
    img.src = source;
  });
  const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', quality);
}

export async function uploadDirectItemImage(file: File, cIdx: number, iIdx: number): Promise<string | null> {
  if (!file?.type.startsWith('image/')) {
    alert(tr('imageUploadFail'));
    return null;
  }
  const cat = menuState.currentMenuData?.[cIdx];
  const item = cat?.items?.[iIdx];
  if (!cat || !item) return null;
  const tenantId = resolveTenantId();
  const itemName = item.name;
  const imageName = `${cat.id}_${itemName}`;

  try {
    const dataUri = await readMenuImageAsWebp(file, 600, 0.85);
    const res = await _menuApiFetch(`${resolveWorkerBase()}/api/image?tenant_id=${encodeURIComponent(tenantId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: imageName, dataUri })
    });
    if (!res.ok) throw new Error('Upload failed');

    if (resolveTenantId() !== tenantId) return null;
    if (!menuState.tenantImageList) menuState.tenantImageList = new Set();
    menuState.tenantImageList.add(imageName);
    menuState.tenantImageList.add(itemName);
    invokeHook('markMenuDirty', markMenuDirty);
    return dataUri;
  } catch (err) {
    console.error('Direct image upload failed:', err);
    alert(tr('imageUploadFail') + ': ' + (err instanceof Error ? err.message : String(err)));
    return null;
  }
}

export function closeAllItemActionMenus(): void {
  document.querySelectorAll('.menu-item-dropdown-menu').forEach(el => el.remove());
}

export function duplicateMenuItemAt(cIdx: number, iIdx: number): void {
  const cat = menuState.currentMenuData?.[cIdx];
  const original = cat?.items?.[iIdx];
  if (!cat || !original) return;
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const copySuffix = tr('duplicateSuffix') || (readCurrentLang() === 'vi' ? 'Bản sao' : '副本');
  const clone = JSON.parse(JSON.stringify(original)) as MenuItemDraft;
  clone.name = `${original.name} (${copySuffix})`;
  if (clone.id) clone.id = `${original.id}_copy_${Date.now()}`;
  cat.items.splice(iIdx + 1, 0, clone);
  invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, cIdx);
  invokeHook('markMenuDirty', markMenuDirty);
  invokeHook('renderMenuCategories', renderMenuCategories);
}

export function openMenuItemFromCard(event: MouseEvent | KeyboardEvent, cIdx: number, iIdx: number): void {
  const currentTarget = event.currentTarget as HTMLElement | null;
  if (event.defaultPrevented || currentTarget?.classList.contains('dragging')) return;
  if (event.type === 'keydown') {
    const keyEvent = event as KeyboardEvent;
    if (
      keyEvent.target !== currentTarget ||
      keyEvent.repeat ||
      keyEvent.isComposing ||
      !['Enter', ' '].includes(keyEvent.key)
    ) {
      return;
    }
    event.preventDefault();
  } else {
    const targetEl = event.target as HTMLElement | null;
    if (targetEl?.closest('button,input,select,textarea,a,label,summary,[contenteditable],.menu-item-drag-handle')) {
      return;
    }
  }
  invokeHook('openItemDetailModal', () => undefined, cIdx, iIdx);
}

export function handleMenuItemsSearch(query: string): void {
  menuState.menuItemFilterQuery = (query || '').toLowerCase().trim();
  applyMenuItemFilters();
}

export function setMenuItemFilter(status: string): void {
  const nextStatus: 'all' | 'instock' | 'oos' =
    status === 'instock' || status === 'oos' ? status : 'all';
  menuState.menuItemFilterStatus = nextStatus;
  document.querySelectorAll('.menu-filter-pill').forEach(btn => {
    const isAct = btn.getAttribute('data-filter') === nextStatus;
    btn.classList.toggle('active', isAct);
  });
  applyMenuItemFilters();
}

export function applyMenuItemFilters(): void {
  const rows = document.querySelectorAll<HTMLElement>('#menu-editor-body .menu-catalog-row');
  let visibleCount = 0;
  rows.forEach(row => {
    const nameInput = row.querySelector<HTMLInputElement>('.menu-item-name-input');
    const name = (nameInput ? nameInput.value : '').toLowerCase();
    const isOos = row.querySelector('.menu-item-stock-toggle')?.classList.contains('is-oos');
    const matchesSearch = !menuState.menuItemFilterQuery || name.includes(menuState.menuItemFilterQuery);
    let matchesStatus = true;
    if (menuState.menuItemFilterStatus === 'instock') matchesStatus = !isOos;
    else if (menuState.menuItemFilterStatus === 'oos') matchesStatus = Boolean(isOos);

    if (matchesSearch && matchesStatus) {
      row.hidden = false;
      row.style.display = '';
      visibleCount++;
    } else {
      row.hidden = true;
      row.style.display = 'none';
    }
  });

  const cat = menuState.currentMenuData?.[menuState.activeCategoryIndex];
  const showingEl = document.getElementById('menu-footer-showing-count');
  if (showingEl && cat && Array.isArray(cat.items)) {
    showingEl.textContent = tr('menuFooterShowing', {
      cat: cat.title,
      showing: visibleCount,
      total: cat.items.length
    });
  }
}

export function renderMenuCategoryEditor(index?: number): void {
  const targetIndex = index === undefined ? menuState.activeCategoryIndex : index;
  if (menuState.isCategoryManagerOpen) {
    renderCategoriesManagerView();
    return;
  }
  const host = getHost();
  host.MenuCatalogLists?.clearProducts?.();
  if (host.UnifiedMenu?.workspace?.()) return;
  menuState.isCategoryManagerOpen = false;
  updateMenuWorkspace();

  const renameBtn = document.getElementById('btn-category-rename');
  const deleteBtn = document.getElementById('btn-category-delete');
  const createBtn = document.getElementById('btn-menu-create-unified');
  const createBtnText = document.getElementById('i18n-btn-create-unified-text');
  const addCatTopBtn = document.getElementById('btn-menu-add-cat-top');
  const closeBtn = document.getElementById('btn-menu-manage-close');
  const subEl = document.getElementById('i18n-menu-edit-sub');

  if (addCatTopBtn) addCatTopBtn.style.display = 'none';
  if (closeBtn) closeBtn.style.display = 'none';
  if (subEl) subEl.innerText = tr('menuEditSub');

  const cat = menuState.currentMenuData?.[targetIndex];
  if (!menuState.currentMenuData || !cat) {
    if (renameBtn) {
      renameBtn.style.display = 'none';
      renameBtn.hidden = true;
    }
    if (deleteBtn) {
      deleteBtn.style.display = 'none';
      deleteBtn.hidden = true;
    }
    if (createBtn) {
      createBtn.style.display = 'none';
      createBtn.hidden = true;
    }
    const catActions = document.getElementById('cat-title-actions');
    if (catActions) {
      catActions.style.display = 'none';
      catActions.hidden = true;
    }
    const tb = document.getElementById('menu-editor-toolbar');
    if (tb) tb.style.display = 'none';
    const ft = document.getElementById('menu-editor-footer');
    if (ft) ft.style.display = 'none';
    const body = document.getElementById('menu-editor-body');
    if (body) {
      body.classList.remove('is-catalog');
      body.textContent = tr(menuState.menuSidebarTab === 'options' ? 'optionSectionEmpty' : 'menuSelectPrompt');
    }
    const title = document.getElementById('menu-editor-title');
    if (title) title.textContent = tr(menuState.menuSidebarTab === 'options' ? 'segOptions' : 'segProducts');
    return;
  }

  const isCustom = isCustomizationCategory(cat);
  const isCombo = !host.UnifiedMenu?.enabled && isComboCategory(cat);

  if (isCustom) {
    if (renameBtn) {
      renameBtn.style.display = 'none';
      renameBtn.hidden = true;
    }
    if (deleteBtn) {
      deleteBtn.style.display = 'inline-flex';
      deleteBtn.hidden = false;
      deleteBtn.onclick = () => {
        void deleteCategoryAtIndex(targetIndex);
      };
    }
    if (createBtn) {
      createBtn.style.display = 'none';
      createBtn.hidden = true;
    }
    const catActions = document.getElementById('cat-title-actions');
    if (catActions) {
      catActions.style.display = '';
      catActions.hidden = false;
    }
    const tb = document.getElementById('menu-editor-toolbar');
    if (tb) tb.style.display = 'none';
    const ft = document.getElementById('menu-editor-footer');
    if (ft) ft.style.display = 'none';
    invokeHook('renderOrderCustomizationEditor', () => undefined, document.getElementById('menu-editor-body'), cat, targetIndex);
    return;
  }

  if (createBtn) {
    createBtn.style.display = 'inline-flex';
    createBtn.hidden = false;
    if (createBtnText) createBtnText.textContent = tr(isCombo ? 'menuAddBundle' : 'menuAddItem');
    createBtn.title = tr(isCombo ? 'menuAddBundle' : 'menuAddItem');
  }

  if (renameBtn) {
    renameBtn.style.display = 'inline-flex';
    renameBtn.hidden = false;
  }
  if (deleteBtn) {
    deleteBtn.style.display = 'inline-flex';
    deleteBtn.hidden = false;
  }
  const catActions = document.getElementById('cat-title-actions');
  if (catActions) {
    catActions.style.display = '';
    catActions.hidden = false;
  }

  const titleEl = document.getElementById('menu-editor-title');
  if (titleEl) titleEl.innerText = `${cat.title} ${tr('menuItemTotalCount', { count: cat.items.length })}`;

  const tb = document.getElementById('menu-editor-toolbar');
  if (tb) tb.style.display = 'flex';
  const ft = document.getElementById('menu-editor-footer');
  if (ft) ft.style.display = 'flex';

  const filterCountAll = document.getElementById('menu-filter-count-all');
  const filterCountInStock = document.getElementById('filter-count-instock');
  const filterCountOos = document.getElementById('filter-count-oos');
  if (filterCountAll) filterCountAll.textContent = String(cat.items.length);
  if (filterCountInStock) filterCountInStock.textContent = String(cat.items.filter(i => !i.isOos).length);
  if (filterCountOos) filterCountOos.textContent = String(cat.items.filter(i => i.isOos).length);

  const container = document.getElementById('menu-editor-body');
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('is-catalog');
  const catalogCard = document.createElement('div');
  catalogCard.className = 'menu-products-card';
  container.appendChild(catalogCard);

  const storeModifiers = cat.type === 'catalog' ? getStoreModifiersList() : [];
  const appliedCount = cat.type === 'catalog'
    ? storeModifiers.filter(mod => isModifierAppliedToCategory(mod, cat)).length
    : 0;

  if (cat.type === 'catalog' && !host.UnifiedMenu?.enabled) {
    const modCard = document.createElement('div');
    modCard.className = 'cust-category-modifiers-card';
    const catKey = cat.id || String(targetIndex);
    if (!menuState.initializedCategoryMods.has(catKey)) {
      menuState.initializedCategoryMods.add(catKey);
      menuState.collapsedCategoryMods.add(catKey);
    }
    const isCollapsed = menuState.collapsedCategoryMods.has(catKey);
    if (isCollapsed) {
      modCard.classList.add('is-collapsed');
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
          <div class="empty-state-title">${esc(tr('modifiersEmptyTitle'))}</div>
          <div class="empty-state-desc">${esc(tr('modifiersEmptyDesc'))}</div>
          <button type="button" class="empty-state-cta-btn" onclick="handleCreateCustomFromSidebar()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>${esc(tr('btnCreateModifierGroup'))}</span>
          </button>
        </div>
      `;
    } else {
      let chipsHtml = '';
      storeModifiers.forEach(mod => {
        const isModSelected = isModifierAppliedToCategory(mod, cat);
        const safeModId = esc(mod.id);
        const countText = mod.count ? ` (${mod.count})` : '';
        chipsHtml += `
          <label class="cust-mod-chip ${isModSelected ? 'selected' : ''}">
            <input type="checkbox" ${isModSelected ? 'checked' : ''} onchange="toggleCategoryModifierItem(${targetIndex}, '${safeModId.replace(/'/g, "\\'")}', this.checked)">
            <span>${esc(mod.title)}${countText}</span>
          </label>
        `;
      });

      modCard.innerHTML = `
        <div class="cust-category-modifiers-header">
          <div class="cust-category-modifiers-title-group">
            <div class="cust-category-modifiers-title">
              <span>${esc(tr('appliedModifiersTitle'))}</span>
              <span class="mod-count-badge">${appliedCount}/${storeModifiers.length}</span>
            </div>
            <div class="cust-category-modifiers-desc">${esc(tr('appliedModifiersCardDesc'))}</div>
          </div>
          <div class="cust-category-modifiers-actions">
            <button type="button" class="btn-select-toggle" onclick="toggleCategoryModifierSelectAll(${targetIndex})">
              ${appliedCount === storeModifiers.length ? esc(tr('btnUnselectAll')) : esc(tr('btnSelectAll'))}
            </button>
            <button type="button" class="btn-add-mod-cta" onclick="handleCreateCustomFromSidebar()" title="${esc(tr('btnAddOptionGroupTop'))}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>${esc(tr('btnAddOptionGroupTop'))}</span>
            </button>
            <button type="button" class="btn-select-toggle" onclick="toggleCategoryModifiersCollapse(${targetIndex})" title="${isCollapsed ? esc(tr('toggleModifiersExpand')) : esc(tr('toggleModifiersCollapse'))}" style="display:inline-flex;align-items:center;gap:4px;">
              <span>${isCollapsed ? esc(tr('toggleModifiersExpand')) : esc(tr('toggleModifiersCollapse'))}</span>
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

  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'menu-catalog-items-container';
  catalogCard.appendChild(itemsContainer);
  host.MenuCatalogLists?.renderProducts?.(itemsContainer, {
    categoryIndex: targetIndex,
    rows: cat.items.map((item: MenuItemDraft) => {
      const bundle = !host.UnifiedMenu?.enabled && (item.itemType === 'bundle' || Boolean(item.bundleRule?.groups?.length));
      return {
        name: item.name,
        price: item.price,
        isOos: item.isOos,
        staffOnly: Boolean(item.staffOnly || (item as { staff_only?: unknown }).staff_only),
        badge: String(item.badgeText || '').trim(),
        bundleCount: cat.type === 'catalog' && bundle ? item.bundleRule?.groups?.length || 0 : undefined,
        modifierCount: host.UnifiedMenu?.enabled
          ? host.UnifiedMenu.groupCount?.(item.id) ?? 0
          : item.modifierGroups?.length || 0,
        imageUrl: getItemImageUrl(cat.id, item.name)
      };
    }),
    inheritedCount: appliedCount,
    language: readCurrentLang(),
    t: tr,
    onEdit: (itemIdx: number) => invokeHook('openItemDetailModal', () => undefined, targetIndex, itemIdx),
    onOpen: (event: MouseEvent | KeyboardEvent, itemIdx: number) => openMenuItemFromCard(event, targetIndex, itemIdx),
    onDelete: (itemIdx: number) => removeMenuItemAt(targetIndex, itemIdx),
    onStock: (itemIdx: number) => invokeHook('openStockModal', () => undefined, targetIndex, itemIdx),
    onOptions: (itemIdx: number) => invokeHook('openItemModifiersModal', () => undefined, targetIndex, itemIdx),
    onBundle: (itemIdx: number) => invokeHook('openBundleEditorModal', () => undefined, targetIndex, itemIdx),
    onChange: () => invokeHook('markMenuDirty', markMenuDirty),
    onImageError: (src: string) => {
      const name = new URL(src, window.location.href).searchParams.get('name');
      if (name) menuState.tenantImageList?.delete(name);
    },
    onUpload: (file: File, itemIdx: number) => uploadDirectItemImage(file, targetIndex, itemIdx)
  });
  applyMenuItemFilters();
}

export function removeMenuItemAt(cIdx: number, iIdx: number): void {
  const cat = menuState.currentMenuData?.[cIdx];
  if (!cat) return;
  if (confirm(tr('confirmDeleteItem'))) {
    invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
    cat.items.splice(iIdx, 1);
    invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, cIdx);
    invokeHook('markMenuDirty', markMenuDirty);
    invokeHook('renderMenuCategories', renderMenuCategories);
  }
}

export function toggleCategoryModifierItem(catIndex: number, modId: string, isChecked: boolean): void {
  const cat = menuState.currentMenuData?.[catIndex];
  if (!cat) return;
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
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
      targetMod.group.appliedCategories = targetMod.group.appliedCategories.filter(
        id => id !== catIdentifier && id !== cat.databaseId
      );
    }
  } else {
    const allLegacyMods = storeMods.filter(m => m.type === 'modifier').map(m => m.id);
    let currentList =
      !cat.appliedModifiers || cat.appliedModifiers.includes('*') ? [...allLegacyMods] : [...cat.appliedModifiers];

    if (isChecked) {
      if (!currentList.includes(modId)) currentList.push(modId);
    } else {
      currentList = currentList.filter(id => id !== modId);
    }

    cat.appliedModifiers =
      allLegacyMods.length > 0 && currentList.length === allLegacyMods.length ? ['*'] : currentList;
    cat.allowCustomization = currentList.length > 0;
  }

  invokeHook('markMenuDirty', markMenuDirty);
  invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, catIndex);
}

export function setCategoryAvailabilityMode(catIndex: number, mode: string): void {
  const cat = menuState.currentMenuData?.[catIndex];
  if (!cat) return;
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  cat.availabilityMode = mode === 'selected_shifts' ? 'selected_shifts' : 'all_shifts';
  if (cat.availabilityMode === 'selected_shifts' && cat.hideWhenUnavailable === undefined) {
    cat.hideWhenUnavailable = true;
  }
  if (!Array.isArray(cat.shiftIds)) cat.shiftIds = [];
  invokeHook('markMenuDirty', markMenuDirty);
  invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, catIndex);
}

export function toggleCategoryShiftId(catIndex: number, shiftId: string, isChecked: boolean): void {
  const cat = menuState.currentMenuData?.[catIndex];
  if (!cat) return;
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const current = Array.isArray(cat.shiftIds) ? [...cat.shiftIds] : [];
  if (isChecked) {
    if (!current.includes(shiftId)) current.push(shiftId);
  } else {
    const idx = current.indexOf(shiftId);
    if (idx >= 0) current.splice(idx, 1);
  }
  cat.shiftIds = current;
  invokeHook('markMenuDirty', markMenuDirty);
  invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, catIndex);
}

export function toggleCategoryHideWhenUnavailable(catIndex: number, isChecked: boolean): void {
  const cat = menuState.currentMenuData?.[catIndex];
  if (!cat) return;
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  cat.hideWhenUnavailable = Boolean(isChecked);
  invokeHook('markMenuDirty', markMenuDirty);
  invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, catIndex);
}

export function selectAllCategoryModifiers(catIndex: number, selectAll: boolean): void {
  const cat = menuState.currentMenuData?.[catIndex];
  if (!cat) return;
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
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
        mod.group.appliedCategories = mod.group.appliedCategories.filter(
          id => id !== catIdentifier && id !== cat.databaseId
        );
      }
    }
  });

  invokeHook('markMenuDirty', markMenuDirty);
  invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, catIndex);
}

// --- Legacy Image Modal ---
export async function openImageModal(categoryId: string, itemName: string): Promise<void> {
  menuState.currentImageItemName = `${categoryId}_${itemName}`;
  const titleEl = document.getElementById('image-modal-title');
  const previewEl = document.getElementById('image-preview') as HTMLImageElement | null;
  const deleteBtn = document.getElementById('btn-delete-image');
  const statusEl = document.getElementById('image-status');
  const modal = document.getElementById('imageModal');

  if (titleEl) titleEl.innerText = tr('imageModalItem', { name: itemName });
  if (previewEl) previewEl.style.display = 'none';
  if (deleteBtn) deleteBtn.style.display = 'none';
  if (statusEl) statusEl.innerText = tr('imageChecking');
  if (modal) modal.style.display = 'flex';

  try {
    const tenantId = resolveTenantId();
    const workerBase = resolveWorkerBase();
    const res = await _menuApiFetch(`${workerBase}/api/image_list?tenant_id=${tenantId}&_t=${Date.now()}`);
    if (res.ok) {
      const list = (await res.json()) as string[];
      const hasImg = list.includes(menuState.currentImageItemName) || list.includes(itemName);
      if (hasImg) {
        const resolvedName = list.includes(menuState.currentImageItemName) ? menuState.currentImageItemName : itemName;
        if (previewEl) {
          previewEl.src = `${workerBase}/api/image?tenant_id=${tenantId}&name=${encodeURIComponent(resolvedName)}&_t=${Date.now()}`;
          previewEl.style.display = 'block';
        }
        if (deleteBtn) deleteBtn.style.display = 'block';
        if (statusEl) statusEl.innerText = tr('imageHasImage');
      } else if (statusEl) {
        statusEl.innerText = tr('imageNoImage');
      }
    }
  } catch {
    if (statusEl) statusEl.innerText = tr('imageLoadFail');
  }
}

export function handleImageSelect(event: Event): void {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else if (height > MAX_HEIGHT) {
        width *= MAX_HEIGHT / height;
        height = MAX_HEIGHT;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      const dataUri = canvas.toDataURL('image/webp', 0.8);
      void uploadImage(dataUri);
    };
    img.src = String(e.target?.result || '');
  };
  reader.readAsDataURL(file);
  if (input) input.value = '';
}

export async function uploadImage(dataUri: string): Promise<void> {
  const statusEl = document.getElementById('image-status');
  const previewEl = document.getElementById('image-preview') as HTMLImageElement | null;
  const deleteBtn = document.getElementById('btn-delete-image');

  if (statusEl) statusEl.innerText = tr('imageUploading');
  try {
    const res = await _menuApiFetch(`${resolveWorkerBase()}/api/image?tenant_id=${resolveTenantId()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: menuState.currentImageItemName, dataUri })
    });
    if (!res.ok) throw new Error('Upload failed');

    if (previewEl) {
      previewEl.src = dataUri;
      previewEl.style.display = 'block';
    }
    if (deleteBtn) deleteBtn.style.display = 'block';
    if (statusEl) statusEl.innerText = tr('imageUploadSuccess');
  } catch (e) {
    alert(tr('imageUploadFail') + (e instanceof Error ? e.message : String(e)));
    if (statusEl) statusEl.innerText = tr('imageLoadFail');
  }
}

export async function deleteItemImage(): Promise<void> {
  if (!confirm(tr('confirmDeleteImage'))) return;
  const statusEl = document.getElementById('image-status');
  const previewEl = document.getElementById('image-preview') as HTMLImageElement | null;
  const deleteBtn = document.getElementById('btn-delete-image');

  if (statusEl) statusEl.innerText = tr('imageDeleting');
  try {
    const tenantId = resolveTenantId();
    const res = await _menuApiFetch(`${resolveWorkerBase()}/api/image?tenant_id=${tenantId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: menuState.currentImageItemName })
    });
    if (!res.ok) throw new Error('Delete failed');

    if (previewEl) {
      previewEl.src = '';
      previewEl.style.display = 'none';
    }
    if (deleteBtn) deleteBtn.style.display = 'none';
    if (statusEl) statusEl.innerText = tr('imageNoImage');

    if (menuState.tenantImageList && menuState.currentImageItemName) {
      menuState.tenantImageList.delete(menuState.currentImageItemName);
      const bare = menuState.currentImageItemName.includes('_')
        ? menuState.currentImageItemName.split('_').slice(1).join('_')
        : menuState.currentImageItemName;
      menuState.tenantImageList.delete(bare);
    }
    invokeHook('markMenuDirty', markMenuDirty);
    invokeHook('renderMenuCategories', renderMenuCategories);
    if (menuState.activeCategoryIndex !== null) {
      invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, menuState.activeCategoryIndex);
    }
  } catch (e) {
    alert(tr('imageDeleteFail') + (e instanceof Error ? e.message : String(e)));
    if (statusEl) statusEl.innerText = tr('imageLoadFail');
  }
}
