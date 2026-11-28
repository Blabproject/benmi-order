import { menuState, syncPosMenuStore } from './state';
import {
  esc,
  getHost,
  invokeHook,
  posSvg,
  readCurrentLang,
  resolveTenantId,
  resolveWorkerBase,
  tr,
  type DisplayOrderCaptureEntry,
  type MenuCategoryDraft,
  type MenuDisplayEntry,
  type MenuOptionGroupDraft
} from './types';
import {
  _menuApiFetch,
  checkMenuDirty,
  clearMenuDirty,
  confirmLeaveMenu,
  isCustomizationCategory,
  markMenuDirty,
  saveMenuData,
  setMenuMobileView,
  syncMenuDataFromDOM,
  updateMenuSaveState,
  updateMenuWorkspace
} from './workspace';

export function formatPlusBtnText(text: string, fallback: string): string {
  const raw = String(text || fallback || '').trim();
  if (!raw) return '';
  return raw.startsWith('+') ? raw : `+ ${raw}`;
}

export function getMenuOrderGroups(): MenuOptionGroupDraft[] {
  const groups: MenuOptionGroupDraft[] = [];
  const seenGroups = new Set<string>();
  (menuState.currentMenuData || []).forEach(cat => {
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

export function getMenuDisplayEntries(): MenuDisplayEntry[] {
  const data = menuState.currentMenuData || [];
  const section = getMenuOrderGroups().length
    ? data.find(cat => cat.type === 'order_customization') ||
      data.find(cat => isCustomizationCategory(cat) && cat.groups?.some(group => group.scope === 'order')) ||
      null
    : null;
  const entries: MenuDisplayEntry[] = data
    .filter(cat => cat === section || !isCustomizationCategory(cat))
    .map(model => ({
      model,
      title: model === section ? tr('menuOrderFlavorSection') : model.title,
      kind: model === section ? 'scopeOrder' : 'categoryTypeCatalogBadge',
      isOrderSection: model === section,
      field: 'sortOrder',
      position: Number(model.sortOrder) || 0,
      itemsCount: model === section ? getMenuOrderGroups().length : (model.items || []).length
    }));
  return entries.sort((a, b) => a.position - b.position);
}

export function commitMenuDisplayRanks(
  ordered: Array<{ model: Record<string, unknown>; field: string }>,
  initial: DisplayOrderCaptureEntry[]
): void {
  const original =
    ordered.length === initial.length &&
    ordered.every((entry, i) => entry.model === initial[i]?.model);
  const slots = initial.map(entry => entry.position);
  const useSlots =
    slots.length === ordered.length &&
    slots.every((value, i) => Number.isFinite(value) && (!i || value > (slots[i - 1] ?? -Infinity)));
  ordered.forEach((entry, i) => {
    const initEntry = initial[i];
    if (original && initEntry) {
      if (initEntry.hadOrder) entry.model[entry.field] = initEntry.value;
      else delete entry.model[entry.field];
    } else {
      entry.model[entry.field] = useSlots ? slots[i] : i + 1;
    }
  });
}

export function captureMenuDisplayOrder(): void {
  const capture = (entry: { model: Record<string, unknown>; field: string; position: number }): DisplayOrderCaptureEntry => ({
    ...entry,
    value: entry.model[entry.field],
    hadOrder: Object.prototype.hasOwnProperty.call(entry.model, entry.field)
  });
  menuState.displayOrderInitial = getMenuDisplayEntries().map(entry =>
    capture({ model: entry.model as unknown as Record<string, unknown>, field: entry.field, position: entry.position })
  );
  menuState.displayOrderGroupInitial = getMenuOrderGroups().map(model =>
    capture({ model: model as unknown as Record<string, unknown>, field: 'sortOrder', position: Number(model.sortOrder) || 0 })
  );
  try {
    menuState.displayOrderInitialSnapshot = JSON.stringify(menuState.currentMenuData);
  } catch {
    menuState.displayOrderInitialSnapshot = null;
  }
}

export function openCategoriesManager(): void {
  if (!menuState.isMenuLoadedCompletely || !menuState.currentMenuData || menuState.isMenuSaving || menuState.isCategoryManagerOpen) return;
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  menuState.categoryBeforeDisplayOrder = menuState.activeCategoryIndex;
  menuState.displayOrderCategory = menuState.currentMenuData[menuState.activeCategoryIndex] || null;
  if (menuState.displayOrderCategory && menuState.displayOrderCategory.type === 'modifier') {
    menuState.displayOrderCategory = null;
  }
  captureMenuDisplayOrder();
  menuState.isCategoryManagerOpen = true;
  menuState.activeCategoryIndex = -1;
  // Stale inline inputs must not write into newly reordered item indexes.
  const body = document.getElementById('menu-editor-body');
  if (body) body.innerHTML = '';
  invokeHook('renderMenuCategories', () => undefined);
  document.getElementById('menu-order-title')?.focus();
}

export function revertCategoriesDisplayOrder(): void {
  if (menuState.isMenuSaving || !menuState.displayOrderInitialSnapshot) return;
  try {
    menuState.currentMenuData = JSON.parse(menuState.displayOrderInitialSnapshot) as MenuCategoryDraft[];
  } catch {
    return;
  }
  invokeHook('clearMenuDirty', clearMenuDirty);
  const data = menuState.currentMenuData;
  menuState.displayOrderCategory = data.find(c => !isCustomizationCategory(c)) || data[0] || null;
  renderCategoriesManagerView();
}

export function closeCategoriesManager(): void {
  if (menuState.isMenuSaving) return;
  menuState.isCategoryManagerOpen = false;
  const data = menuState.currentMenuData || [];
  menuState.activeCategoryIndex = data[menuState.categoryBeforeDisplayOrder]
    ? menuState.categoryBeforeDisplayOrder
    : data.findIndex(cat => (menuState.menuSidebarTab === 'products' ? !isCustomizationCategory(cat) : isCustomizationCategory(cat)));
  invokeHook('renderMenuCategories', () => undefined);
  if (menuState.activeCategoryIndex >= 0) {
    invokeHook('renderMenuCategoryEditor', () => undefined, menuState.activeCategoryIndex);
  } else {
    const titleEl = document.getElementById('menu-editor-title');
    if (titleEl) titleEl.innerText = tr('menuEditorTitle');
    const subEl = document.getElementById('i18n-menu-edit-sub');
    if (subEl) subEl.innerText = tr('menuEditSub');
    const bodyEl = document.getElementById('menu-editor-body');
    if (bodyEl) {
      bodyEl.innerHTML = `<div style="text-align:center; padding: 22px; color:#999;" id="i18n-menu-select-prompt">${tr('menuSelectPrompt')}</div>`;
    }
    for (const id of ['btn-category-rename', 'btn-category-delete', 'btn-menu-create-unified', 'btn-menu-add-cat-top', 'btn-menu-manage-close']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
  }
  document.getElementById('btn-menu-manage-cats')?.focus();
}

interface DraggableOrderRow extends HTMLDivElement {
  moveTo?: (target: number) => void;
}

export function renderCategoriesManagerView(): void {
  updateMenuWorkspace();
  const container = document.getElementById('menu-order-panels') as (HTMLElement & { inert: boolean }) | null;
  if (!container) return;
  const positions = [...container.querySelectorAll<HTMLElement>('[data-order-list]')].map(list => list.scrollTop);
  const host = getHost();

  const titleEl = document.getElementById('menu-order-title');
  if (titleEl) titleEl.textContent = tr('manageCategoriesTitle');
  const descEl = document.getElementById('menu-order-description');
  if (descEl) descEl.textContent = tr('manageCategoriesSub');
  const backTextEl = document.getElementById('btn-menu-order-back-text');
  if (backTextEl) backTextEl.textContent = tr('btnBack');

  const storeBadge = document.getElementById('menu-order-store-badge');
  const storeStatusText = document.getElementById('menu-order-store-status-text');
  const isOpen = (host.currentStoreStatus ?? 'open') === 'open';
  if (storeStatusText) storeStatusText.textContent = isOpen ? tr('statusOpen') : tr('statusClosed');
  if (storeBadge) storeBadge.classList.toggle('is-closed', !isOpen);

  const storeNameEl = document.getElementById('menu-order-store-name');
  if (storeNameEl) {
    const brand =
      host.currentTenantBrandName ||
      host.storeBrandName ||
      host.currentTenantConfig?.name ||
      host.currentTenantConfig?.storeName ||
      'Quán Ăn Đài Loan';
    storeNameEl.textContent = brand;
  }
  const bcMgmt = document.getElementById('menu-order-bc-mgmt');
  if (bcMgmt) bcMgmt.textContent = tr('menuSortBreadcrumbMenu');
  const bcDining = document.getElementById('menu-order-bc-dining');
  if (bcDining) bcDining.textContent = tr('menuSortBreadcrumbDineTakeaway');

  const tipLabel = document.getElementById('tablet-tip-label');
  if (tipLabel) tipLabel.textContent = tr('tabletSortTipLabel');
  const tipDesc = document.getElementById('tablet-tip-desc');
  if (tipDesc) tipDesc.textContent = tr('tabletSortTipDesc');
  const tipBadge = document.getElementById('tablet-mode-badge');
  if (tipBadge) tipBadge.textContent = tr('posTouchModeBadge');

  container.innerHTML = '';
  const entries = getMenuDisplayEntries();
  if (!entries.some(entry => entry.model === menuState.displayOrderCategory)) {
    menuState.displayOrderCategory = entries.find(entry => !entry.isOrderSection)?.model || entries[0]?.model || null;
  }
  const selected = entries.find(entry => entry.model === menuState.displayOrderCategory);

  const addPanel = (headerEl: HTMLElement, id: string): HTMLDivElement => {
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

  const leftHeader = document.createElement('div');
  leftHeader.className = 'menu-order-panel-header';
  const leftTopRow = document.createElement('div');
  leftTopRow.className = 'panel-header-top-row';
  const leftTitleWrap = document.createElement('div');
  leftTitleWrap.className = 'panel-header-title-wrap';
  const leftTitle = document.createElement('h3');
  leftTitle.className = 'panel-header-title';
  leftTitle.id = 'menu-order-sections-title';
  leftTitle.textContent = tr('sortColSectionsTitle');
  const leftCount = document.createElement('span');
  leftCount.className = 'panel-count-badge';
  leftCount.textContent = `${entries.length} ${tr('menuUnitItem') || 'mục'}`;
  leftTitleWrap.appendChild(leftTitle);
  leftTitleWrap.appendChild(leftCount);
  const leftHint = document.createElement('span');
  leftHint.className = 'panel-header-hint';
  leftHint.textContent = tr('sortColClickToView');
  leftTopRow.appendChild(leftTitleWrap);
  leftTopRow.appendChild(leftHint);
  leftHeader.appendChild(leftTopRow);

  const sectionsList = addPanel(leftHeader, 'menu-order-sections-title');

  const displayCat = menuState.displayOrderCategory;
  const targetCategoryTitle = displayCat ? String(displayCat.title || (displayCat as { name?: string }).name || '') : '';
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
    ? tr('menuOrderGroups')
    : displayCat
      ? tr('menuOrderItems', { name: targetCategoryTitle })
      : tr('segProducts');

  const rightItemsCount = selected?.isOrderSection
    ? getMenuOrderGroups().length
    : (displayCat?.items || []).length;

  const rightCount = document.createElement('span');
  rightCount.className = 'panel-count-badge count-badge-right';
  rightCount.textContent = selected?.isOrderSection
    ? tr('nCustomizationsVisible', { n: rightItemsCount })
    : tr('nItemsVisible', { n: rightItemsCount });

  rightTitleWrap.appendChild(rightTitle);
  rightTopRow.appendChild(rightTitleWrap);
  rightTopRow.appendChild(rightCount);

  const rightSub = document.createElement('div');
  rightSub.className = 'panel-header-sub';
  rightSub.textContent = tr('sortColItemsSubtitle');
  rightHeader.appendChild(rightTopRow);
  rightHeader.appendChild(rightSub);

  const itemsList = addPanel(rightHeader, 'menu-order-items-title');

  const empty = (list: HTMLElement, key: string): void => {
    const message = document.createElement('p');
    message.className = 'menu-order-empty';
    message.textContent = tr(key);
    list.appendChild(message);
  };

  const commitSections = (ordered: MenuDisplayEntry[]): void => {
    commitMenuDisplayRanks(
      ordered.map(entry => ({ model: entry.model as unknown as Record<string, unknown>, field: entry.field })),
      menuState.displayOrderInitial
    );
  };

  const renderRows = <T,>(
    list: HTMLElement,
    values: T[],
    kind: 'section' | 'group' | 'item',
    commit: (ordered: T[]) => void
  ): void => {
    let dragged: number | null = null;
    values.forEach((value, index) => {
      const record = value as Record<string, unknown>;
      const entry = kind === 'section' ? (value as MenuDisplayEntry) : null;
      const model = entry ? entry.model : value;
      const isSelected = kind === 'section' && Boolean(menuState.displayOrderCategory && model === menuState.displayOrderCategory);
      const name = entry ? entry.title : String(record.name || record.title || '');
      const row = document.createElement('div') as DraggableOrderRow;
      row.className = 'menu-order-card menu-display-order-row' + (isSelected ? ' is-selected' : '');
      row.draggable = true;
      row.setAttribute('data-order-kind', kind);
      row.setAttribute('data-order-index', String(index));

      const ordinal = document.createElement('div');
      ordinal.className = 'menu-order-card-idx menu-order-index' + (isSelected ? ' is-active-idx' : '');
      ordinal.textContent = String(index + 1);
      ordinal.setAttribute('aria-hidden', 'true');
      row.appendChild(ordinal);

      const contentEl = document.createElement(kind === 'section' ? 'button' : 'div');
      contentEl.className = 'menu-order-card-content menu-display-order-name';
      if (kind === 'section' && entry) {
        const btnEl = contentEl as HTMLButtonElement;
        btnEl.setAttribute('type', 'button');
        btnEl.setAttribute('aria-pressed', String(isSelected));
        btnEl.onclick = () => {
          menuState.displayOrderCategory = entry.model;
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

      if (kind === 'section' && entry) {
        const tag = document.createElement('span');
        tag.className = 'menu-order-tag ' + (entry.isOrderSection ? 'tag-order' : 'tag-catalog');
        tag.textContent = entry.isOrderSection ? tr('badgeScopeOrder') : tr('badgeFoodItem');
        titleRow.appendChild(tag);
      }
      contentEl.appendChild(titleRow);

      const subRow = document.createElement('div');
      subRow.className = 'menu-order-card-sub';
      if (kind === 'section' && entry) {
        if (isSelected) {
          const selBadge = document.createElement('span');
          selBadge.className = 'badge-currently-selected';
          selBadge.textContent = tr('badgeSelectedState');
          subRow.appendChild(selBadge);
        }
        const detail = document.createElement('span');
        detail.className = 'menu-order-card-detail';
        if (entry.isOrderSection) {
          detail.textContent = tr('customizationOptionsCount', { n: getMenuOrderGroups().length });
        } else {
          const count = (entry.model.items || []).length;
          detail.textContent = tr('categoryItemsCount', { n: count });
        }
        subRow.appendChild(detail);
      } else if (kind === 'group') {
        const grpRecord = value as MenuOptionGroupDraft & { required?: boolean };
        const reqText = grpRecord.required ? tr('requiredOptionBadge') : tr('optionalOptionBadge');
        const countText = (grpRecord.options || []).length + ' ' + tr('optionsCountUnit');
        const detail = document.createElement('span');
        detail.className = 'menu-order-card-detail';
        detail.textContent = `${reqText} • ${countText}`;
        subRow.appendChild(detail);
      } else {
        const priceEl = document.createElement('span');
        priceEl.className = 'menu-order-item-price';
        priceEl.textContent = '$' + esc(record.price ?? '');
        subRow.appendChild(priceEl);
      }
      contentEl.appendChild(subRow);
      row.appendChild(contentEl);

      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'menu-order-card-actions';

      const move = (target: number): void => {
        if (menuState.isMenuSaving || target < 0 || target >= values.length || target === index) return;
        const ordered = [...values];
        const removed = ordered.splice(index, 1)[0];
        if (removed === undefined) return;
        ordered.splice(target, 0, removed);
        commit(ordered);
        invokeHook('markMenuDirty', markMenuDirty);
        renderCategoriesManagerView();
        const moved = document
          .getElementById('menu-order-panels')
          ?.querySelectorAll<HTMLElement>(`[data-order-kind="${kind}"]`)[target];
        moved?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
        moved?.scrollIntoView?.({ block: 'nearest' });
      };

      ([-1, 1] as const).forEach(direction => {
        const button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.className = 'menu-order-move';
        button.disabled = index + direction < 0 || index + direction >= values.length;
        button.setAttribute('aria-label', tr(direction < 0 ? 'moveDisplayUp' : 'moveDisplayDown') + ': ' + name);
        button.setAttribute('data-order-delta', String(direction));
        button.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${direction < 0 ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}"/></svg>`;
        button.onclick = e => {
          e?.stopPropagation?.();
          move(index + direction);
        };
        actionsWrap.appendChild(button);
      });

      const dragHandle = document.createElement('div');
      dragHandle.className = 'menu-order-drag-handle';
      dragHandle.title = tr('dragToReorder');
      dragHandle.innerHTML = '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z"/></svg>';
      actionsWrap.appendChild(dragHandle);

      row.appendChild(actionsWrap);

      row.ondragstart = event => {
        if (menuState.isMenuSaving) {
          event.preventDefault();
          return;
        }
        dragged = index;
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(index));
        }
        row.classList.add('dragging');
      };
      row.ondragend = () => {
        dragged = null;
        row.classList.remove('dragging');
      };
      row.ondragover = event => {
        if (dragged !== null) {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        }
      };
      row.ondrop = event => {
        event.preventDefault();
        if (dragged === null || menuState.isMenuSaving) return;
        const source = list.querySelectorAll<DraggableOrderRow>('[data-order-index]')[dragged];
        source?.moveTo?.(index);
      };
      row.moveTo = move;
      list.appendChild(row);
    });
  };

  renderRows(sectionsList, entries, 'section', commitSections);
  if (!entries.length) empty(sectionsList, 'menuSelectPrompt');

  const products = displayCat?.items || [];
  if (selected?.isOrderSection) {
    renderRows(itemsList, getMenuOrderGroups(), 'group', ordered =>
      commitMenuDisplayRanks(
        ordered.map(model => ({ model: model as unknown as Record<string, unknown>, field: 'sortOrder' })),
        menuState.displayOrderGroupInitial
      )
    );
    if (!getMenuOrderGroups().length) empty(itemsList, 'menuEmptyCategory');
  } else {
    renderRows(itemsList, products, 'item', ordered => {
      if (displayCat) displayCat.items.splice(0, products.length, ...ordered);
    });
    if (!products.length) empty(itemsList, 'menuEmptyCategory');
  }

  [sectionsList, itemsList].forEach((list, i) => {
    list.scrollTop = positions[i] || 0;
  });
  document.getElementById('menu-order-items-title')?.setAttribute('tabindex', '-1');
  container.inert = menuState.isMenuSaving;
  invokeHook('updateMenuSaveState', updateMenuSaveState);
}

// --- Category Management ---
export function updateAddCategoryViewport(): void {
  const modal = document.getElementById('addCategoryModal');
  if (!modal || modal.style.display === 'none') return;
  const viewport = window.visualViewport;
  modal.style.height = `${viewport ? viewport.height : window.innerHeight}px`;
  modal.style.top = `${viewport ? viewport.offsetTop : 0}px`;
}

export function onAddCategoryTypeChange(): void {
  const typeSelect = document.getElementById('add-cat-select-type') as HTMLSelectElement | null;
  const group = document.getElementById('add-cat-customization-group');
  const nameInp = document.getElementById('add-cat-input-name') as HTMLInputElement | null;
  const shortInp = document.getElementById('add-cat-input-short-name') as HTMLInputElement | null;
  if (group && typeSelect) {
    group.style.display = typeSelect.value === 'catalog' ? 'block' : 'none';
  }
  const lang = readCurrentLang();
  if (typeSelect && typeSelect.value === 'order_customization') {
    if (nameInp && !nameInp.value.trim()) {
      nameInp.value = lang === 'vi' ? 'Tùy chọn khẩu vị & biến thể' : '口味與客製化選擇';
    }
    if (shortInp && !shortInp.value.trim()) {
      shortInp.value = lang === 'vi' ? 'Khẩu vị' : '口味選擇';
    }
  }
}

export function openAddCategoryModal(defaultType = 'catalog'): void {
  if (!invokeHook('confirmLeaveMenu', confirmLeaveMenu)) return;
  const inp = document.getElementById('add-cat-input-name') as HTMLInputElement | null;
  if (inp) inp.value = '';
  const typeSelect = document.getElementById('add-cat-select-type') as HTMLSelectElement | null;
  if (typeSelect) {
    typeSelect.value = defaultType;
    invokeHook('onAddCategoryTypeChange', onAddCategoryTypeChange);
  }

  const modContainer = document.getElementById('add-cat-modifiers-list');
  const storeMods = invokeHook('getStoreModifiersList', () => []);
  if (modContainer) {
    if (!storeMods.length) {
      modContainer.innerHTML = `<div style="font-size: var(--pos-text-meta); color: #94a3b8;">${tr('noModifiersInStore')}</div>`;
    } else {
      modContainer.innerHTML = storeMods
        .map(
          (mod: { id: string; title: string }) => `
        <label style="display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; min-height: 44px; background: #fff; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: var(--pos-text-meta); font-weight: 700; cursor: pointer; color: #334155;">
          <input type="checkbox" name="add-cat-mod" value="${esc(mod.id)}" checked style="width: 18px; height: 18px; accent-color: #10b981;">
          <span>${esc(mod.title)}</span>
        </label>
      `
        )
        .join('');
    }
  }

  const group = document.getElementById('add-cat-customization-group');
  if (group) group.style.display = 'block';

  const shortInp = document.getElementById('add-cat-input-short-name') as HTMLInputElement | null;
  if (shortInp) shortInp.value = '';

  const modal = document.getElementById('addCategoryModal');
  if (modal) {
    modal.style.display = 'flex';
    const body = modal.querySelector('.modal-body');
    if (body) body.scrollTop = 0;
    updateAddCategoryViewport();
  }
}

export function closeAddCategoryModal(): void {
  const modal = document.getElementById('addCategoryModal');
  if (modal) modal.style.display = 'none';
  const inp = document.getElementById('add-cat-input-name') as HTMLInputElement | null;
  if (inp) inp.value = '';
  const shortInp = document.getElementById('add-cat-input-short-name') as HTMLInputElement | null;
  if (shortInp) shortInp.value = '';
}

export async function confirmAddCategory(): Promise<void> {
  const inp = document.getElementById('add-cat-input-name') as HTMLInputElement | null;
  const name = inp ? inp.value.trim() : '';
  if (!name) {
    alert(tr('promptCategoryNameEmpty'));
    return;
  }
  const typeSelect = document.getElementById('add-cat-select-type') as HTMLSelectElement | null;
  const type = typeSelect ? typeSelect.value : 'catalog';

  const shortInp = document.getElementById('add-cat-input-short-name') as HTMLInputElement | null;
  const shortName = shortInp && shortInp.value.trim() ? shortInp.value.trim() : name;
  const lang = readCurrentLang();

  if (type === 'order_customization') {
    if (
      menuState.currentMenuData &&
      menuState.currentMenuData.some(c => c.type === 'order_customization' || c.id === 'sec-flavor')
    ) {
      alert(lang === 'vi' ? 'Đã tồn tại phân loại Tùy biến toàn đơn!' : '已存在整單客製化分類！');
      return;
    }
    if (!menuState.currentMenuData) menuState.currentMenuData = [];
    invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);

    const newCat: MenuCategoryDraft = {
      id: 'sec-flavor',
      title: name || (lang === 'vi' ? 'Tùy chọn khẩu vị & biến thể' : '口味與客製化選擇'),
      shortName: shortName || (lang === 'vi' ? 'Khẩu vị' : '口味選擇'),
      type: 'order_customization',
      allowCustomization: false,
      appliedModifiers: [],
      groups: [],
      items: []
    };

    menuState.currentMenuData.push(newCat);
    invokeHook('markMenuDirty', markMenuDirty);
    closeAddCategoryModal();
    invokeHook('renderMenuCategories', () => undefined);

    if (menuState.isCategoryManagerOpen) {
      renderCategoriesManagerView();
    } else {
      menuState.activeCategoryIndex = menuState.currentMenuData.length - 1;
      invokeHook(
        'renderOrderCustomizationEditor',
        () => undefined,
        document.getElementById('menu-editor-body'),
        newCat,
        menuState.activeCategoryIndex
      );
    }
    return;
  }

  const selectedMods: string[] = [];
  document.querySelectorAll<HTMLInputElement>('input[name="add-cat-mod"]:checked').forEach(cb => {
    selectedMods.push(cb.value);
  });
  const allModsCount = invokeHook('getStoreModifiersList', () => []).length;
  const appliedMods = allModsCount > 0 && selectedMods.length === allModsCount ? ['*'] : selectedMods;
  const allowCust = type === 'catalog' ? selectedMods.length > 0 : false;

  let baseSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/_+/g, '');
  if (!baseSlug) baseSlug = 'cat';
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  if (!menuState.currentMenuData) menuState.currentMenuData = [];
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);

  const newCat: MenuCategoryDraft = {
    id: slug,
    title: name,
    shortName,
    type,
    allowCustomization: allowCust,
    appliedModifiers: appliedMods,
    items: []
  };

  menuState.currentMenuData.push(newCat);
  invokeHook('markMenuDirty', markMenuDirty);
  closeAddCategoryModal();
  invokeHook('renderMenuCategories', () => undefined);

  if (menuState.isCategoryManagerOpen) {
    renderCategoriesManagerView();
  } else {
    menuState.activeCategoryIndex = menuState.currentMenuData.length - 1;
    invokeHook('renderMenuCategoryEditor', () => undefined, menuState.activeCategoryIndex);
  }
  invokeHook('markMenuDirty', markMenuDirty);
}

export async function promptRenameCategoryAtIndex(idx: number): Promise<void> {
  const currentCat = menuState.currentMenuData?.[idx];
  if (!currentCat) return;
  const newTitle = prompt(tr('promptCategoryNamePrompt'), currentCat.title);
  if (newTitle !== null) {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      alert(tr('promptCategoryNameEmpty'));
      return;
    }
    invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
    currentCat.title = trimmed;
    currentCat.shortName = trimmed;
    invokeHook('markMenuDirty', markMenuDirty);
    invokeHook('renderMenuCategories', () => undefined);
    if (menuState.isCategoryManagerOpen) {
      renderCategoriesManagerView();
    } else {
      invokeHook('renderMenuCategoryEditor', () => undefined, idx);
    }
    await saveMenuData(true);
  }
}

export async function deleteCategoryAtIndex(idx: number): Promise<void> {
  if (!menuState.isMenuLoadedCompletely) {
    alert(tr('menuIncompleteReload'));
    return;
  }
  const cat = menuState.currentMenuData?.[idx];
  if (menuState.isMenuSaving || !menuState.currentMenuData || !cat) return;
  if (!confirm(tr('confirmDeleteCategory', { name: cat.title }))) return;

  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const saved = menuState.savedMenuSnapshot ? (JSON.parse(menuState.savedMenuSnapshot) as MenuCategoryDraft[]) : [];
  if (saved.some(entry => entry.id === cat.id)) {
    menuState.isMenuSaving = true;
    invokeHook('updateMenuSaveState', updateMenuSaveState);
    const panels = document.querySelectorAll<HTMLElement & { inert: boolean }>('.menu-split');
    panels.forEach(el => {
      el.inert = true;
    });
    try {
      const remaining = saved.filter(entry => entry.id !== cat.id);
      const getDeletions = getHost().getMenuDeletions;
      const deletions = typeof getDeletions === 'function'
        ? getDeletions(saved, remaining)
        : invokeHook('getMenuDeletions', () => ({ categories: [], items: [], customizations: [] }), saved, remaining);
      const res = await _menuApiFetch(`${resolveWorkerBase()}/api/menu?tenant_id=${resolveTenantId()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ __delete: deletions })
      });
      if (!res.ok) throw new Error('API returned ' + res.status);
      menuState.savedMenuSnapshot = JSON.stringify(remaining);
    } catch (error) {
      alert(tr('menuSaveFail') + (error instanceof Error ? error.message : String(error)));
      return;
    } finally {
      menuState.isMenuSaving = false;
      panels.forEach(el => {
        el.inert = false;
      });
      invokeHook('updateMenuSaveState', updateMenuSaveState);
    }
  }
  menuState.currentMenuData.splice(idx, 1);
  invokeHook('checkMenuDirty', checkMenuDirty);
  syncPosMenuStore();
  invokeHook('renderMenuCategories', () => undefined);

  if (menuState.isCategoryManagerOpen) {
    renderCategoriesManagerView();
  } else {
    menuState.activeCategoryIndex = -1;
    setMenuMobileView('master');
    const titleEl = document.getElementById('menu-editor-title');
    if (titleEl) titleEl.innerText = tr('menuEditorTitle');
    const bodyEl = document.getElementById('menu-editor-body');
    if (bodyEl) {
      bodyEl.innerHTML = `<div style="text-align:center; padding: 22px; color:#999;" id="i18n-menu-select-prompt">${tr('menuSelectPrompt')}</div>`;
    }
    const renameBtn = document.getElementById('btn-category-rename');
    const deleteBtn = document.getElementById('btn-category-delete');
    if (renameBtn) renameBtn.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = 'none';
  }
}

export function promptRenameCategory(): void {
  if (menuState.activeCategoryIndex >= 0) {
    void promptRenameCategoryAtIndex(menuState.activeCategoryIndex);
  }
}

export function deleteActiveCategory(): void {
  if (menuState.activeCategoryIndex >= 0) {
    void deleteCategoryAtIndex(menuState.activeCategoryIndex);
  }
}

// --- Unified Creation Entrypoints ---
export function openCreationTypeModal(): void {
  const modal = document.getElementById('creationTypeModal');
  if (modal) modal.style.display = 'flex';
}

export function closeCreationTypeModal(): void {
  const modal = document.getElementById('creationTypeModal');
  if (modal) modal.style.display = 'none';
}

export function handleMenuCreateClick(): void {
  const host = getHost();
  if (host.UnifiedMenu?.enabled) {
    if (menuState.menuSidebarTab === 'options') {
      void host.UnifiedMenu.group?.();
    } else {
      void host.UnifiedMenu.product?.(menuState.activeCategoryIndex);
    }
    return;
  }
  const activeCat = menuState.activeCategoryIndex >= 0 ? menuState.currentMenuData?.[menuState.activeCategoryIndex] : undefined;
  if (activeCat) {
    if (isCustomizationCategory(activeCat)) {
      invokeHook('openNewCustomGroupCreator', () => undefined, menuState.activeCategoryIndex);
      return;
    }
    const isComboFn = host.isComboCategory as ((c: MenuCategoryDraft) => boolean) | undefined;
    if (typeof isComboFn === 'function' && isComboFn(activeCat)) {
      if (typeof host.openBundleWizard === 'function') {
        (host.openBundleWizard as (cIdx?: number) => void)(menuState.activeCategoryIndex);
        return;
      }
    }
    invokeHook('openCreateItemModal', () => undefined, menuState.activeCategoryIndex);
    return;
  }
  openCreationTypeModal();
}

export function handleSelectCreateType(type: string): void {
  closeCreationTypeModal();
  const host = getHost();
  let targetCatIdx = menuState.activeCategoryIndex;
  const data = menuState.currentMenuData;
  if (!data || targetCatIdx < 0 || data[targetCatIdx]?.type !== 'catalog') {
    targetCatIdx = data ? data.findIndex(c => c.type === 'catalog') : -1;
  }

  if (type === 'standard_item' || type === 'item_with_options') {
    if (targetCatIdx >= 0) {
      menuState.activeCategoryIndex = targetCatIdx;
      invokeHook('renderMenuCategories', () => undefined);
      invokeHook('renderMenuCategoryEditor', () => undefined, targetCatIdx);
      invokeHook('openCreateItemModal', () => undefined, targetCatIdx);
    }
  } else if (type === 'bundle') {
    if (typeof host.openBundleWizard === 'function') {
      (host.openBundleWizard as () => void)();
    }
  } else if (type === 'global_customization') {
    const flavorIdx = data ? data.findIndex(c => c.type === 'order_customization' || c.id === 'sec-flavor') : -1;
    if (flavorIdx >= 0) {
      menuState.activeCategoryIndex = flavorIdx;
      menuState.isCustomGroupCreatorOpen = true;
      menuState.newCustomGroupType = 'radio';
      menuState.newCustomGroupRequired = false;
      invokeHook('renderMenuCategories', () => undefined);
      invokeHook('renderMenuCategoryEditor', () => undefined, flavorIdx);
      setTimeout(() => {
        const card = document.getElementById('cust-new-group-card');
        const inp = document.getElementById('cust-new-group-title-input');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (inp) inp.focus();
      }, 50);
    }
  }
}

export { posSvg };
