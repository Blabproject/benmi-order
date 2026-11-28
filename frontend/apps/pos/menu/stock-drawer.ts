import { renderMenuCategories, renderMenuCategoryEditor } from './catalog-editor';
import { renderOrderCustomizationEditor } from './customizations-legacy';
import { menuState, syncPosMenuStore } from './state';
import {
  getHost,
  invokeHook,
  resolveTenantId,
  resolveWorkerBase,
  tr,
  type MenuCategoryDraft,
  type MenuItemDraft,
  type MenuOptionDraft,
  type MenuOptionGroupDraft
} from './types';
import {
  _menuApiFetch,
  canonicalMenuSnapshot,
  checkMenuDirty,
  syncMenuDataFromDOM,
  updateMenuSaveState
} from './workspace';

type StockTarget = MenuItemDraft | MenuOptionDraft;

export function stockTomorrowDate(): string {
  return new Date(Date.now() + (7 + 24) * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function stockChoiceKey(
  category: MenuCategoryDraft,
  group: MenuOptionGroupDraft | null | undefined,
  target: StockTarget
): string {
  return (
    'benmi:stock-choice:' +
    JSON.stringify([
      resolveTenantId(),
      group?.canonicalId || group?.id || category.id,
      target.id || target.originalName || target.name
    ])
  );
}

export function readStockChoice(target: StockTarget, key: string): { duration: string; date: string } {
  const until = target.outOfStockUntil || (target as { out_of_stock_until?: string | null }).out_of_stock_until || '';
  const timestamp = Date.parse(until);
  if (!target.isOos || (Number.isFinite(timestamp) && timestamp <= Date.now())) {
    return { duration: '', date: '' };
  }
  if (!Number.isFinite(timestamp) || new Date(timestamp).getUTCFullYear() === 9999) {
    return { duration: 'indefinite', date: '' };
  }
  const expiry = new Date(timestamp).toISOString();
  const date = new Date(timestamp + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(key);
    const cached = raw ? (JSON.parse(raw) as { until?: string; duration?: string }) : null;
    if (cached?.until === expiry && cached.duration && ['today', 'multiple_days'].includes(cached.duration)) {
      return { duration: cached.duration, date: cached.duration === 'multiple_days' ? date : '' };
    }
  } catch {
    // Storage is optional; the saved expiry remains authoritative.
  }
  const todayUntil = Date.parse(stockTomorrowDate() + 'T04:00:00+07:00');
  return timestamp === todayUntil ? { duration: 'today', date: '' } : { duration: 'multiple_days', date };
}

export function setStockError(message: string): void {
  const error = document.getElementById('stock-drawer-error');
  if (!error) return;
  error.textContent = message;
  error.hidden = !message;
}

export function updateStockSaveState(): void {
  for (const id of [
    'btn-stock-save',
    'btn-stock-cancel',
    'btn-stock-close',
    'btn-stock-restore',
    'stock-status-select',
    'stock-duration-select',
    'oos-until-date',
    'stock-choice-today',
    'stock-choice-multiple_days',
    'stock-choice-indefinite'
  ]) {
    const control = document.getElementById(id) as (HTMLButtonElement | HTMLInputElement | HTMLSelectElement) | null;
    if (control) control.disabled = menuState.isStockSaving;
  }
  const statusSelect = document.getElementById('stock-status-select') as HTMLSelectElement | null;
  const durationSelect = document.getElementById('stock-duration-select') as HTMLSelectElement | null;
  const needsDate = statusSelect?.value === 'out_of_stock' && durationSelect?.value === 'multiple_days';
  const hasError = Boolean(document.getElementById('stock-drawer-error')?.textContent);
  const button = document.getElementById('btn-stock-save') as HTMLButtonElement | null;
  if (button) {
    button.hidden = !needsDate && !hasError;
    button.textContent = tr(menuState.isStockSaving ? 'menuSaving' : hasError ? 'stockRetry' : 'btnStockSave');
    const date = document.getElementById('oos-until-date') as HTMLInputElement | null;
    button.disabled = menuState.isStockSaving || Boolean(needsDate && date && (!date.value || date.value < date.min));
  }
  const status = document.getElementById('stock-drawer-status');
  if (status) status.textContent = tr(menuState.isStockSaving ? 'menuSaving' : 'stockInstantHint');
  document.getElementById('stockModal')?.setAttribute('aria-busy', String(menuState.isStockSaving));
  invokeHook('updateMenuSaveState', updateMenuSaveState);
}

export function handleStockDurationChange(): void {
  const durationSelect = document.getElementById('stock-duration-select') as HTMLSelectElement | null;
  const dateContainer = document.getElementById('oos-date-container');
  const statusSelect = document.getElementById('stock-status-select') as HTMLSelectElement | null;

  if (dateContainer) {
    if (statusSelect?.value === 'out_of_stock' && durationSelect?.value === 'multiple_days') {
      dateContainer.style.display = 'block';
    } else {
      dateContainer.style.display = 'none';
    }
  }
  updateStockSaveState();
}

export function showStockDrawer(
  name: string,
  target: StockTarget,
  isCustom: boolean,
  triggerId: string,
  choiceKey: string
): void {
  const selected = readStockChoice(target, choiceKey);
  const isOos = Boolean(target.isOos);
  const modal = document.getElementById('stockModal');
  if (!modal) return;
  menuState.stockReturnFocus = document.getElementById(triggerId) || document.activeElement;
  menuState.stockReturnFocusId = triggerId;
  menuState.stockBodyOverflow = document.body?.style.overflow || '';
  if (document.body) document.body.style.overflow = 'hidden';

  const itemNameEl = document.getElementById('stock-item-name');
  if (itemNameEl) itemNameEl.textContent = name;
  const modalTitleEl = document.getElementById('stock-modal-title');
  if (modalTitleEl) modalTitleEl.textContent = tr('stockModalTitle');
  const currentStatus = document.getElementById('stock-current-status');
  if (currentStatus) {
    currentStatus.textContent = tr(isOos ? 'stockOptOutOfStock' : 'stockOptInStock');
    currentStatus.classList.toggle('is-oos', isOos);
  }
  const linkedNotice = document.getElementById('stock-linked-notice');
  if (linkedNotice) linkedNotice.hidden = !isCustom;
  const restoreBtn = document.getElementById('btn-stock-restore');
  if (restoreBtn) restoreBtn.hidden = !isOos;
  const statusSelect = document.getElementById('stock-status-select') as HTMLSelectElement | null;
  if (statusSelect) statusSelect.value = isOos ? 'out_of_stock' : 'in_stock';
  const durationSelect = document.getElementById('stock-duration-select') as HTMLSelectElement | null;
  if (durationSelect) durationSelect.value = selected.duration || 'today';
  const date = document.getElementById('oos-until-date') as HTMLInputElement | null;
  if (date) {
    date.value = selected.date;
    date.min = selected.date && selected.date < stockTomorrowDate() ? selected.date : stockTomorrowDate();
  }
  for (const choice of modal.querySelectorAll<HTMLInputElement>('input[name="stock-choice"]')) {
    choice.checked = choice.value === selected.duration;
  }
  setStockError('');
  handleStockDurationChange();
  modal.style.display = 'flex';
  const body = modal.querySelector('.stock-drawer-body');
  if (body) body.scrollTop = 0;
  document.getElementById('btn-stock-close')?.focus?.({ preventScroll: true });
}

export function openStockModal(cIdx: number, iIdx: number): void {
  if (menuState.isStockSaving || menuState.isMenuSaving) return;
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);

  menuState.currentStockCidx = cIdx;
  menuState.currentStockIidx = iIdx;
  menuState.currentStockGidx = null;
  menuState.currentStockOidx = null;

  const cat = menuState.currentMenuData?.[cIdx];
  const item = cat?.items?.[iIdx];
  if (!cat || !item) return;
  showStockDrawer(item.name, item, false, `menu-item-stock-${cIdx}-${iIdx}`, stockChoiceKey(cat, null, item));
}

export function openStockModalForCustomization(cIdx: number, gIdx: number, oIdx: number): void {
  if (menuState.isStockSaving || menuState.isMenuSaving) return;
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  menuState.currentStockCidx = cIdx;
  menuState.currentStockIidx = null;
  menuState.currentStockGidx = gIdx;
  menuState.currentStockOidx = oIdx;

  const cat = menuState.currentMenuData?.[cIdx];
  const group = cat?.groups?.[gIdx];
  const option = group?.options?.[oIdx];
  if (!cat || !group || !option) return;

  showStockDrawer(
    `${group.title} — ${option.name}`,
    option,
    true,
    `menu-option-stock-${cIdx}-${gIdx}-${oIdx}`,
    stockChoiceKey(cat, group, option)
  );
}

export function closeStockModal(): void {
  if (menuState.isStockSaving) return;
  const modal = document.getElementById('stockModal');
  if (modal) modal.style.display = 'none';
  if (document.body) document.body.style.overflow = menuState.stockBodyOverflow;
  const returnFocus = (
    menuState.stockReturnFocus?.isConnected
      ? menuState.stockReturnFocus
      : menuState.stockReturnFocusId
        ? document.getElementById(menuState.stockReturnFocusId)
        : null
  ) as HTMLElement | null;
  returnFocus?.focus?.({ preventScroll: true });
  menuState.stockReturnFocus = null;
  menuState.stockReturnFocusId = null;
  menuState.currentStockCidx = null;
  menuState.currentStockIidx = null;
  menuState.currentStockGidx = null;
  menuState.currentStockOidx = null;
}

export async function chooseStockStatus(choice: string): Promise<void> {
  if (
    menuState.isStockSaving ||
    menuState.isMenuSaving ||
    !['in_stock', 'today', 'multiple_days', 'indefinite'].includes(choice)
  ) {
    return;
  }
  const statusSelect = document.getElementById('stock-status-select') as HTMLSelectElement | null;
  const durationSelect = document.getElementById('stock-duration-select') as HTMLSelectElement | null;
  if (statusSelect) statusSelect.value = choice === 'in_stock' ? 'in_stock' : 'out_of_stock';
  if (durationSelect) durationSelect.value = choice === 'in_stock' ? 'today' : choice;
  setStockError('');
  handleStockDurationChange();
  if (choice === 'multiple_days') {
    document.getElementById('oos-until-date')?.focus?.();
  } else {
    await saveStockStatus();
  }
}

export function applySavedStockStatus(
  category: MenuCategoryDraft,
  group: MenuOptionGroupDraft | null | undefined,
  target: StockTarget,
  isOos: boolean,
  until: string | null = null
): void {
  const sameItem = (item: StockTarget): boolean =>
    item.id && target.id
      ? String(item.id) === String(target.id)
      : (item.originalName || item.name) === (target.originalName || target.name);
  const groupIds = new Set(
    group
      ? [group.id, group.canonicalId, group.sourceId, group.key].filter(Boolean).map(String)
      : []
  );
  const sameGroup = (candidate: Record<string, unknown>): boolean =>
    [
      candidate.id,
      candidate.groupId,
      candidate.group_id,
      candidate.canonicalId,
      candidate.sourceId,
      candidate.key
    ].some(id => Boolean(id && groupIds.has(String(id))));

  const update = (item: StockTarget): void => {
    item.isOos = isOos;
    item.outOfStockUntil = isOos ? until : null;
    for (const key of ['isOutOfStock', 'is_out_of_stock'] as const) {
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        (item as Record<string, unknown>)[key] = isOos;
      }
    }
    if (Object.prototype.hasOwnProperty.call(item, 'out_of_stock_until')) {
      (item as Record<string, unknown>).out_of_stock_until = isOos ? until : null;
    }
  };
  const updateGroup = (candidate: { options?: MenuOptionDraft[] } & Record<string, unknown>): void => {
    for (const option of candidate.options || []) {
      const productId = String(
        (option as { productId?: string; product_id?: string }).productId ||
          (option as { product_id?: string }).product_id ||
          ''
      );
      if (group ? sameGroup(candidate) && sameItem(option) : Boolean(target.id && productId === String(target.id))) {
        update(option);
      }
    }
  };

  const saved = menuState.savedMenuSnapshot
    ? (JSON.parse(menuState.savedMenuSnapshot) as MenuCategoryDraft[])
    : null;
  for (const data of [menuState.currentMenuData, saved]) {
    for (const candidate of data || []) {
      if (candidate.id === category.id) {
        (candidate.items || []).filter(sameItem).forEach(update);
      }
      (candidate.groups || []).forEach(g => updateGroup(g as unknown as { options?: MenuOptionDraft[] } & Record<string, unknown>));
      for (const item of candidate.items || []) {
        (item.modifierGroups || []).forEach(mg => updateGroup(mg as unknown as { options?: MenuOptionDraft[] } & Record<string, unknown>));
      }
    }
  }
  menuState.menuModifierLibrary.forEach(lib =>
    updateGroup(lib as unknown as { options?: MenuOptionDraft[] } & Record<string, unknown>)
  );
  if (saved) {
    menuState.savedMenuSnapshot = invokeHook('canonicalMenuSnapshot', canonicalMenuSnapshot, saved);
  }
  syncPosMenuStore();
}

export async function saveStockStatus(): Promise<void> {
  if (menuState.isStockSaving || menuState.isMenuSaving) return;
  const isCustom = menuState.currentStockGidx !== null && menuState.currentStockOidx !== null;
  if (menuState.currentStockCidx === null || (!isCustom && menuState.currentStockIidx === null)) return;

  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);

  const statusSelect = document.getElementById('stock-status-select') as HTMLSelectElement | null;
  const durationSelect = document.getElementById('stock-duration-select') as HTMLSelectElement | null;
  const dateInput = document.getElementById('oos-until-date') as HTMLInputElement | null;
  const status = statusSelect?.value || 'in_stock';
  const duration = durationSelect?.value || 'today';
  const untilDate = status === 'out_of_stock' && duration === 'multiple_days' && dateInput ? dateInput.value : '';

  if (
    status === 'out_of_stock' &&
    duration === 'multiple_days' &&
    dateInput &&
    (!untilDate || untilDate < dateInput.min)
  ) {
    setStockError(tr(untilDate ? 'stockDateInvalid' : 'alertSelectOosDate'));
    dateInput.focus?.();
    updateStockSaveState();
    return;
  }

  const targetCidx = menuState.currentStockCidx;
  const targetCategory = menuState.currentMenuData?.[targetCidx];
  if (!targetCategory) return;
  const targetGroup =
    isCustom && menuState.currentStockGidx !== null
      ? targetCategory.groups?.[menuState.currentStockGidx]
      : null;

  let body: Record<string, unknown>;
  let targetItem: StockTarget | undefined;
  if (isCustom && menuState.currentStockOidx !== null) {
    targetItem = targetGroup?.options?.[menuState.currentStockOidx];
    if (!targetGroup || !targetItem) return;
    body = {
      category_slug: targetCategory.type === 'modifier' ? targetCategory.id : 'order_customization',
      customization_key: targetGroup.key || targetGroup.id,
      name: targetItem.originalName || targetItem.name,
      status,
      duration,
      until_date: untilDate ? `${untilDate}T04:00:00+07:00` : null
    };
  } else if (menuState.currentStockIidx !== null) {
    targetItem = targetCategory.items[menuState.currentStockIidx];
    if (!targetItem) return;
    body = {
      category_slug: targetCategory.id,
      name: targetItem.originalName || targetItem.name,
      status,
      duration,
      until_date: untilDate ? `${untilDate}T04:00:00+07:00` : null
    };
  } else {
    return;
  }

  menuState.isStockSaving = true;
  updateStockSaveState();
  try {
    const res = await _menuApiFetch(`${resolveWorkerBase()}/api/menu/stock-status?tenant_id=${resolveTenantId()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || 'Update failed');
    }
  } catch {
    setStockError(tr('stockSaveError'));
    return;
  } finally {
    menuState.isStockSaving = false;
    updateStockSaveState();
  }

  const outOfStockUntil =
    status !== 'out_of_stock'
      ? null
      : duration === 'indefinite'
        ? '9999-12-31T23:59:59.000Z'
        : new Date(`${duration === 'today' ? stockTomorrowDate() : untilDate}T04:00:00+07:00`).toISOString();
  applySavedStockStatus(targetCategory, targetGroup, targetItem, status === 'out_of_stock', outOfStockUntil);
  try {
    const key = stockChoiceKey(targetCategory, targetGroup, targetItem);
    if (outOfStockUntil) localStorage.setItem(key, JSON.stringify({ until: outOfStockUntil, duration }));
    else localStorage.removeItem(key);
  } catch {
    // Successful stock write must not depend on browser storage.
  }

  const categoryIndex = menuState.currentMenuData ? menuState.currentMenuData.indexOf(targetCategory) : -1;
  invokeHook('renderMenuCategories', renderMenuCategories);
  if (categoryIndex >= 0) {
    if (isCustom) {
      invokeHook(
        'renderOrderCustomizationEditor',
        renderOrderCustomizationEditor,
        document.getElementById('menu-editor-body'),
        targetCategory,
        categoryIndex
      );
    } else {
      invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, categoryIndex);
    }
  }
  closeStockModal();
  invokeHook('checkMenuDirty', checkMenuDirty);
  const host = getHost();
  if (host.UnifiedMenu?.enabled && host.UnifiedMenu.load) {
    try {
      await host.UnifiedMenu.load();
    } catch {
      // Stock write already succeeded.
    }
  }
}
