import { openBundleEditorModal } from './bundle-editor';
import { readMenuImageAsWebp, renderMenuCategories, renderMenuCategoryEditor } from './catalog-editor';
import { getInheritedItemModifierGroups, openItemModifiersModal } from './customizations-legacy';
import { menuState } from './state';
import {
  getHost,
  invokeHook,
  notifyToast,
  readCurrentLang,
  resolveTenantId,
  resolveWorkerBase,
  tr,
  type MenuCategoryDraft,
  type MenuItemDraft
} from './types';
import {
  _menuApiFetch,
  checkMenuDirty,
  loadMenuData,
  markMenuDirty,
  saveMenuData,
  syncMenuDataFromDOM,
  updateMenuSaveState
} from './workspace';

type ItemI18nMap = Record<string, { name?: string; description?: string; badge_text?: string }>;

export function updateItemDetailPhoto(src: string | null, status: string): void {
  const preview = document.getElementById('item-detail-img-preview') as HTMLImageElement | null;
  const placeholder = document.getElementById('item-detail-img-placeholder');
  const remove = document.getElementById('btn-item-detail-delete-img');
  const label = document.getElementById('item-detail-img-status');
  if (preview) {
    if (src) preview.src = src;
    preview.style.display = src ? 'block' : 'none';
  }
  if (placeholder) placeholder.style.display = src ? 'none' : 'flex';
  if (remove) remove.style.display = src ? 'inline-flex' : 'none';
  if (label) label.innerText = tr(status);
}

export async function checkItemDetailImage(categoryId: string, itemName: string): Promise<void> {
  if (!document.getElementById('item-detail-img-preview')) return;
  const request = ++menuState.itemDetailImageRequest;
  updateItemDetailPhoto(null, 'imageChecking');
  const key = `${categoryId}_${itemName}`;
  const tenantId = resolveTenantId();
  const workerBase = resolveWorkerBase();
  try {
    let list = menuState.tenantImageList;
    if (!list) {
      const res = await _menuApiFetch(
        `${workerBase}/api/image_list?tenant_id=${encodeURIComponent(tenantId)}&_t=${Date.now()}`
      );
      if (res.ok) {
        const names = (await res.json()) as string[];
        if (request !== menuState.itemDetailImageRequest || tenantId !== resolveTenantId()) return;
        list = new Set(names);
        menuState.tenantImageList = list;
      }
    }
    if (request !== menuState.itemDetailImageRequest) return;
    const resolvedName = list?.has(key) ? key : list?.has(itemName) ? itemName : null;
    if (resolvedName) {
      menuState.currentDetailImageKey = resolvedName;
      updateItemDetailPhoto(
        `${workerBase}/api/image?tenant_id=${encodeURIComponent(tenantId)}&name=${encodeURIComponent(resolvedName)}&_t=${Date.now()}`,
        'imageHasImage'
      );
    } else {
      updateItemDetailPhoto(null, 'imageNoImage');
    }
  } catch {
    if (request === menuState.itemDetailImageRequest) updateItemDetailPhoto(null, 'imageLoadFail');
  }
}

export function triggerItemDetailPhotoUpload(): void {
  const nameInput = document.getElementById('item-detail-name-input') as HTMLInputElement | null;
  const nameVal = nameInput ? nameInput.value.trim() : '';
  const lang = readCurrentLang();
  if (!nameVal && (menuState.isItemDetailCreateMode || menuState.activeItemDetailItemIdx === null)) {
    alert(
      tr('enterItemNameFirst') ||
        (lang === 'vi' ? 'Vui lòng nhập tên món trước khi tải ảnh lên' : '請先輸入餐點名稱再上傳圖片')
    );
    if (nameInput) nameInput.focus();
    return;
  }
  const fileInput = document.getElementById('item-detail-file-input');
  if (fileInput) fileInput.click();
}

export async function handleItemDetailImageSelect(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (input) input.value = '';
  if (!file) return;

  const cat =
    menuState.activeItemDetailCatIdx !== null
      ? menuState.currentMenuData?.[menuState.activeItemDetailCatIdx]
      : undefined;
  const item =
    cat && menuState.activeItemDetailItemIdx !== null ? cat.items?.[menuState.activeItemDetailItemIdx] : undefined;
  const nameInput = document.getElementById('item-detail-name-input') as HTMLInputElement | null;
  const name = nameInput?.value.trim() || item?.name?.trim();
  if (!name || !cat) return;

  const request = ++menuState.itemDetailImageRequest;
  const key = `${cat.id}_${name}`;
  const tenantId = resolveTenantId();
  const status = document.getElementById('item-detail-img-status');
  if (status) status.innerText = tr('imageUploading');
  try {
    const dataUri = await readMenuImageAsWebp(file, 800, 0.82);
    const res = await _menuApiFetch(`${resolveWorkerBase()}/api/image?tenant_id=${encodeURIComponent(tenantId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: key, dataUri })
    });
    if (!res.ok) throw new Error('Upload failed');
    if (tenantId !== resolveTenantId()) return;
    if (!menuState.tenantImageList) menuState.tenantImageList = new Set();
    menuState.tenantImageList.add(key);
    if (request !== menuState.itemDetailImageRequest) return;
    menuState.currentDetailImageKey = key;
    updateItemDetailPhoto(dataUri, 'imageUploadSuccess');
  } catch (err) {
    if (request !== menuState.itemDetailImageRequest) return;
    if (status) status.innerText = tr('imageLoadFail');
    alert(tr('imageUploadFail') + (err instanceof Error ? err.message : ''));
  }
}

export async function deleteItemDetailPhoto(): Promise<void> {
  if (!confirm(tr('confirmDeleteImage'))) return;
  const statusEl = document.getElementById('item-detail-img-status');

  const cat =
    menuState.activeItemDetailCatIdx !== null
      ? menuState.currentMenuData?.[menuState.activeItemDetailCatIdx]
      : null;
  const item =
    cat && menuState.activeItemDetailItemIdx !== null ? cat.items?.[menuState.activeItemDetailItemIdx] : null;
  const targetName =
    menuState.currentDetailImageKey || (cat && item ? `${cat.id}_${item.name}` : item ? item.name : '');

  if (!targetName && !item) return;
  const request = ++menuState.itemDetailImageRequest;
  const tenantId = resolveTenantId();

  if (statusEl) statusEl.innerText = tr('imageDeleting');
  try {
    const res = await _menuApiFetch(`${resolveWorkerBase()}/api/image?tenant_id=${encodeURIComponent(tenantId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: targetName,
        itemId: item?.id,
        itemName: item?.name,
        categoryId: cat?.id
      })
    });
    if (!res.ok) throw new Error('Delete failed');

    if (tenantId !== resolveTenantId()) return;
    if (menuState.tenantImageList) {
      if (targetName) menuState.tenantImageList.delete(targetName);
      if (item?.name) menuState.tenantImageList.delete(item.name);
      if (cat?.id && item?.name) menuState.tenantImageList.delete(`${cat.id}_${item.name}`);
      if (item?.id) {
        menuState.tenantImageList.delete(item.id);
        menuState.tenantImageList.delete(`product:${item.id}`);
      }
    }
    if (item) {
      (item as { imageKey?: string | null; imageUrl?: string | null }).imageKey = null;
      (item as { imageUrl?: string | null }).imageUrl = null;
    }
    if (request !== menuState.itemDetailImageRequest) return;
    updateItemDetailPhoto(null, 'imageNoImage');
    if (menuState.itemDetailSnapshotBeforeEdit) {
      (menuState.itemDetailSnapshotBeforeEdit as { imageKey?: string | null; imageUrl?: string | null }).imageKey = null;
      (menuState.itemDetailSnapshotBeforeEdit as { imageUrl?: string | null }).imageUrl = null;
    }
    menuState.currentDetailImageKey = null;
    invokeHook('markMenuDirty', markMenuDirty);
    invokeHook('renderMenuCategories', renderMenuCategories);
    if (menuState.activeItemDetailCatIdx !== null) {
      invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, menuState.activeItemDetailCatIdx);
    }
  } catch (err) {
    if (request !== menuState.itemDetailImageRequest) return;
    alert(tr('imageDeleteFail') + (err instanceof Error ? err.message : ''));
    if (statusEl) statusEl.innerText = tr('imageLoadFail');
  }
}

export function renderQuickTags(currentVal: string): void {
  getHost().PosItemDetailForm?.setQuickTag?.(currentVal.trim());
}

export function handleQuickTagClick(tagText: string): void {
  const badgeInput = document.getElementById('item-detail-badge-input') as HTMLInputElement | null;
  if (!badgeInput) return;

  const currentVal = badgeInput.value.trim();
  if (currentVal === tagText) {
    badgeInput.value = '';
  } else {
    badgeInput.value = tagText;
  }
  renderQuickTags(badgeInput.value.trim());
}

export function getActiveMenuTargetLocales(): string[] {
  const host = getHost();
  if (typeof host.isTenantMultilingualEnabled === 'function' && !host.isTenantMultilingualEnabled()) {
    return [];
  }
  if (host.currentTenantI18nEnabled === false) {
    return [];
  }
  if (typeof host.getTenantAiTargetLocales === 'function') {
    return host.getTenantAiTargetLocales();
  }
  return [];
}

export function formatMenuI18nSectionTitle(locales?: string[]): string {
  const list = Array.isArray(locales) ? locales : getActiveMenuTargetLocales();
  const lang = readCurrentLang();
  const base = tr('itemI18nSectionBase') || (lang === 'vi' ? 'Hiển thị đa ngôn ngữ' : '多語系顯示');
  if (!list.length) return base;
  const labels = list.map(loc => tr(`localeLabel_${loc}`) || loc.toUpperCase());
  const sep = lang === 'vi' ? ', ' : ' / ';
  return lang === 'vi' ? `${base} (${labels.join(sep)})` : `${base}（${labels.join(sep)}）`;
}

export function updateMenuAiTranslateVisibility(): void {
  const btn = document.getElementById('btn-menu-ai-translate');
  if (btn) {
    btn.style.display = getActiveMenuTargetLocales().length > 0 ? '' : 'none';
  }
}

export function populateItemDetailI18nInputs(i18n?: unknown): void {
  const map = (i18n || {}) as ItemI18nMap;
  const targets = getActiveMenuTargetLocales();
  const details = document.getElementById('item-detail-i18n-details');
  if (details) {
    details.style.display = targets.length > 0 ? '' : 'none';
    details.querySelectorAll<HTMLElement>('[data-i18n-locale]').forEach(el => {
      el.style.display = targets.includes(el.dataset.i18nLocale || '') ? '' : 'none';
    });
  }
  const titleEl = document.getElementById('i18n-item-i18n-section-title');
  if (titleEl) {
    titleEl.innerText = formatMenuI18nSectionTitle(targets);
  }
  const fields: Record<string, string> = {
    'item-detail-i18n-en-name': map.en?.name || '',
    'item-detail-i18n-en-description': map.en?.description || '',
    'item-detail-i18n-en-badge': map.en?.badge_text || '',
    'item-detail-i18n-vi-name': map.vi?.name || '',
    'item-detail-i18n-vi-description': map.vi?.description || '',
    'item-detail-i18n-vi-badge': map.vi?.badge_text || ''
  };
  for (const [id, val] of Object.entries(fields)) {
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el) el.value = val;
  }
}

export function readItemDetailI18nInputs(existingI18n: unknown): ItemI18nMap | undefined {
  const enNameEl = document.getElementById('item-detail-i18n-en-name') as HTMLInputElement | null;
  if (!enNameEl) return existingI18n as ItemI18nMap | undefined;
  const targets = getActiveMenuTargetLocales();
  const enName = enNameEl.value.trim();
  const enDesc = (document.getElementById('item-detail-i18n-en-description') as HTMLTextAreaElement | null)?.value.trim() || '';
  const enBadge = (document.getElementById('item-detail-i18n-en-badge') as HTMLInputElement | null)?.value.trim() || '';
  const viName = (document.getElementById('item-detail-i18n-vi-name') as HTMLInputElement | null)?.value.trim() || '';
  const viDesc = (document.getElementById('item-detail-i18n-vi-description') as HTMLTextAreaElement | null)?.value.trim() || '';
  const viBadge = (document.getElementById('item-detail-i18n-vi-badge') as HTMLInputElement | null)?.value.trim() || '';
  const next: ItemI18nMap = existingI18n ? (JSON.parse(JSON.stringify(existingI18n)) as ItemI18nMap) : {};
  const applyLocale = (loc: string, name: string, desc: string, badge: string) => {
    const entry = { ...(next[loc] || {}) };
    if (name) entry.name = name;
    else delete entry.name;
    if (desc) entry.description = desc;
    else delete entry.description;
    if (badge) entry.badge_text = badge;
    else delete entry.badge_text;
    if (Object.keys(entry).length > 0) next[loc] = entry;
    else delete next[loc];
  };
  if (targets.includes('en')) applyLocale('en', enName, enDesc, enBadge);
  if (targets.includes('vi')) applyLocale('vi', viName, viDesc, viBadge);
  if (Object.keys(next).length === 0) return existingI18n ? {} : undefined;
  return next;
}

export function autoCommitItemDetailFields(): void {
  if (menuState.activeItemDetailCatIdx === null || menuState.activeItemDetailItemIdx === null) return;
  const item = menuState.currentMenuData?.[menuState.activeItemDetailCatIdx]?.items?.[menuState.activeItemDetailItemIdx];
  if (!item) return;

  const nameInput = document.getElementById('item-detail-name-input') as HTMLInputElement | null;
  const priceInput = document.getElementById('item-detail-price-input') as HTMLInputElement | null;
  const descInput = document.getElementById('item-detail-description-input') as HTMLTextAreaElement | null;
  const badgeInput = document.getElementById('item-detail-badge-input') as HTMLInputElement | null;
  const staffOnlyInput = document.getElementById('item-detail-staff-only-input') as HTMLInputElement | null;

  if (nameInput && nameInput.value.trim()) item.name = nameInput.value.trim();
  if (priceInput && priceInput.value !== '') {
    const p = parseFloat(priceInput.value);
    if (!isNaN(p)) item.price = p;
  }
  if (descInput) {
    item.description = descInput.value.trim();
  }
  if (badgeInput) {
    item.badgeText = badgeInput.value.trim();
  }
  if (staffOnlyInput) {
    item.staffOnly = Boolean(staffOnlyInput.checked);
  }
  const nextI18n = readItemDetailI18nInputs(item.i18n);
  if (nextI18n !== undefined) item.i18n = nextI18n;
  else delete item.i18n;
  invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, menuState.activeItemDetailCatIdx);
  invokeHook('checkMenuDirty', checkMenuDirty);
}

export function setAiTranslateButtonLoading(
  btn: HTMLButtonElement | null,
  isLoading: boolean,
  detailsEl?: HTMLElement | null
): void {
  if (btn) {
    btn.classList.toggle('is-loading', Boolean(isLoading));
    btn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    btn.disabled = Boolean(isLoading);
    const existingSpinner = btn.querySelector('.ai-inline-spinner');
    if (isLoading && !existingSpinner) {
      const spinner = document.createElement('span');
      spinner.className = 'ai-inline-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      btn.insertBefore(spinner, btn.firstChild);
    } else if (!isLoading && existingSpinner) {
      existingSpinner.remove();
    }
  }
  if (detailsEl) {
    detailsEl.classList.toggle('is-ai-loading', Boolean(isLoading));
  }
}

export function showItemDetailForm(cat: MenuCategoryDraft, item?: MenuItemDraft): void {
  ++menuState.itemDetailImageRequest;
  ++menuState.itemDetailSession;
  const host = getHost();
  const name = item?.name || '';
  const bundleCount = Array.isArray(item?.bundleRule?.groups) ? item.bundleRule.groups.length : 0;
  host.PosItemDetailForm?.show?.({
    category: cat.title || (cat as { name?: string }).name || cat.shortName || '',
    name: name.trim(),
    create: !item,
    bundle: Boolean(item && (item.itemType === 'bundle' || bundleCount > 0))
  });

  const nameInput = document.getElementById('item-detail-name-input') as HTMLInputElement | null;
  const priceInput = document.getElementById('item-detail-price-input') as HTMLInputElement | null;
  const descInput = document.getElementById('item-detail-description-input') as HTMLTextAreaElement | null;
  const badgeInput = document.getElementById('item-detail-badge-input') as HTMLInputElement | null;
  const staffOnlyInput = document.getElementById('item-detail-staff-only-input') as HTMLInputElement | null;
  const photoName = document.getElementById('item-detail-photo-item-name');
  if (photoName) photoName.innerText = name;
  if (nameInput) {
    nameInput.value = name;
    nameInput.oninput = () => {
      if (photoName) photoName.innerText = nameInput.value.trim();
    };
  }
  if (priceInput) priceInput.value = item?.price !== null && item?.price !== undefined ? String(item.price) : '';
  if (descInput) descInput.value = item?.description || '';
  if (badgeInput) {
    badgeInput.value = item?.badgeText || '';
    badgeInput.oninput = () => renderQuickTags(badgeInput.value);
    renderQuickTags(badgeInput.value);
  }
  if (staffOnlyInput) {
    staffOnlyInput.checked = Boolean(item?.staffOnly || (item as { staff_only?: unknown })?.staff_only);
  }

  const preview = document.getElementById('item-detail-img-preview');
  preview?.removeAttribute?.('src');
  updateItemDetailPhoto(null, 'imageNoImage');
  if (item) void checkItemDetailImage(cat.id, name);
  populateItemDetailI18nInputs(item?.i18n);
  const translations = document.getElementById('item-detail-i18n-details') as HTMLDetailsElement | null;
  if (translations) translations.open = false;
  setAiTranslateButtonLoading(
    document.getElementById('btn-item-detail-ai-translate') as HTMLButtonElement | null,
    false,
    translations
  );
  const translateLabel = document.getElementById('i18n-btn-item-ai-translate');
  if (translateLabel) translateLabel.innerText = tr('btnItemAiTranslate');

  const advanced = document.getElementById('item-detail-advanced-section');
  if (advanced) advanced.style.display = cat.type === 'catalog' ? 'block' : 'none';
  if (cat.type === 'catalog') {
    const modifiers = document.getElementById('item-detail-mod-summary');
    if (modifiers) {
      modifiers.innerText = tr('itemModHubSummary', {
        direct: item?.modifierGroups?.length || 0,
        inherited: getInheritedItemModifierGroups(cat).length
      });
    }
    const bundleCard = document.getElementById('item-detail-bundle-card');
    if (bundleCard) {
      bundleCard.style.display = host.currentTenantFeatures?.includes('disable_bundle_builder_v2') ? 'none' : 'flex';
    }
    const bundleSummary = document.getElementById('item-detail-bundle-summary');
    if (bundleSummary) {
      bundleSummary.innerText = bundleCount ? tr('cardBundleCount', { count: bundleCount }) : tr('cardBundleEmpty');
    }
  }

  const modal = document.getElementById('itemDetailModal');
  if (modal) modal.style.display = 'flex';
  const body = document.getElementById('item-detail-modal-body');
  if (body) body.scrollTop = 0;
  nameInput?.focus?.();
}

export function openCreateItemModal(cIdx: number): void {
  const host = getHost();
  if (host.UnifiedMenu?.enabled) {
    void host.UnifiedMenu.product?.(cIdx);
    return;
  }
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const cat = menuState.currentMenuData?.[cIdx];
  if (!cat) return;
  menuState.isItemDetailCreateMode = true;
  menuState.activeItemDetailCatIdx = cIdx;
  menuState.activeItemDetailItemIdx = null;
  menuState.currentDetailImageKey = null;
  menuState.itemDetailSnapshotBeforeEdit = null;
  showItemDetailForm(cat);
}

export function openItemDetailModal(cIdx: number, iIdx: number): void {
  const host = getHost();
  if (host.UnifiedMenu?.enabled) {
    void host.UnifiedMenu.product?.(cIdx, iIdx);
    return;
  }
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const cat = menuState.currentMenuData?.[cIdx];
  const item = cat?.items?.[iIdx];
  if (!cat || !item) return;
  menuState.isItemDetailCreateMode = false;
  menuState.activeItemDetailCatIdx = cIdx;
  menuState.activeItemDetailItemIdx = iIdx;
  menuState.currentDetailImageKey = `${cat.id}_${item.name}`;
  menuState.itemDetailSnapshotBeforeEdit = JSON.parse(JSON.stringify(item)) as MenuItemDraft;
  showItemDetailForm(cat, item);
}

export function closeItemDetailModal(): void {
  ++menuState.itemDetailSession;
  ++menuState.itemDetailImageRequest;
  const modal = document.getElementById('itemDetailModal');
  if (modal) modal.style.display = 'none';

  if (
    !menuState.isItemDetailCreateMode &&
    menuState.activeItemDetailCatIdx !== null &&
    menuState.activeItemDetailItemIdx !== null &&
    menuState.itemDetailSnapshotBeforeEdit
  ) {
    const items = menuState.currentMenuData?.[menuState.activeItemDetailCatIdx]?.items;
    if (items?.[menuState.activeItemDetailItemIdx]) {
      items[menuState.activeItemDetailItemIdx] = JSON.parse(
        JSON.stringify(menuState.itemDetailSnapshotBeforeEdit)
      ) as MenuItemDraft;
      invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, menuState.activeItemDetailCatIdx);
    }
  }

  menuState.isItemDetailCreateMode = false;
  menuState.activeItemDetailCatIdx = null;
  menuState.activeItemDetailItemIdx = null;
  menuState.currentDetailImageKey = null;
  menuState.itemDetailSnapshotBeforeEdit = null;
  invokeHook('checkMenuDirty', checkMenuDirty);
}

export function saveItemDetailModal(): void {
  if (menuState.activeItemDetailCatIdx === null) {
    closeItemDetailModal();
    return;
  }
  const cat = menuState.currentMenuData?.[menuState.activeItemDetailCatIdx];
  if (!cat) {
    closeItemDetailModal();
    return;
  }

  const nameInput = document.getElementById('item-detail-name-input') as HTMLInputElement | null;
  const priceInput = document.getElementById('item-detail-price-input') as HTMLInputElement | null;
  const descInput = document.getElementById('item-detail-description-input') as HTMLTextAreaElement | null;
  const badgeInput = document.getElementById('item-detail-badge-input') as HTMLInputElement | null;
  const staffOnlyInput = document.getElementById('item-detail-staff-only-input') as HTMLInputElement | null;

  const nameVal = nameInput ? nameInput.value.trim() : '';
  const priceVal = priceInput && priceInput.value !== '' ? parseFloat(priceInput.value) : 0;
  const descVal = descInput ? descInput.value.trim() : '';
  const badgeVal = badgeInput ? badgeInput.value.trim() : '';
  const existingItem =
    menuState.activeItemDetailItemIdx !== null ? cat.items?.[menuState.activeItemDetailItemIdx] : undefined;
  const isRec = Boolean(existingItem?.isRecommended);
  const isStaffOnly = Boolean(staffOnlyInput?.checked);

  if (!nameVal) {
    const lang = readCurrentLang();
    alert(tr('enterItemName') || (lang === 'vi' ? 'Vui lòng nhập tên món' : '請輸入餐點名稱'));
    if (nameInput) nameInput.focus();
    return;
  }

  ++menuState.itemDetailSession;
  ++menuState.itemDetailImageRequest;
  const modal = document.getElementById('itemDetailModal');
  if (modal) modal.style.display = 'none';

  if (menuState.isItemDetailCreateMode || menuState.activeItemDetailItemIdx === null) {
    const newItemI18n = readItemDetailI18nInputs(null);
    const newItem: MenuItemDraft = {
      name: nameVal,
      price: isNaN(priceVal) ? 0 : priceVal,
      description: descVal,
      badgeText: badgeVal,
      isRecommended: isRec,
      staffOnly: isStaffOnly,
      isOos: false,
      bundleRule: null,
      itemType: 'standard',
      modifierGroups: [],
      ...(newItemI18n ? { i18n: newItemI18n } : {})
    };
    cat.items.push(newItem);
    const saveCatIdx = menuState.activeItemDetailCatIdx;
    menuState.isItemDetailCreateMode = false;
    menuState.activeItemDetailCatIdx = null;
    menuState.activeItemDetailItemIdx = null;
    menuState.currentDetailImageKey = null;
    menuState.itemDetailSnapshotBeforeEdit = null;
    invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, saveCatIdx);
    invokeHook('checkMenuDirty', checkMenuDirty);
    invokeHook('renderMenuCategories', renderMenuCategories);
  } else {
    const item = cat.items[menuState.activeItemDetailItemIdx];
    if (item) {
      item.name = nameVal;
      item.price = isNaN(priceVal) ? 0 : priceVal;
      item.description = descVal;
      item.badgeText = badgeVal;
      item.isRecommended = isRec;
      item.staffOnly = isStaffOnly;
      const nextI18n = readItemDetailI18nInputs(item.i18n);
      if (nextI18n !== undefined) item.i18n = nextI18n;
      else delete item.i18n;
      const saveCatIdx = menuState.activeItemDetailCatIdx;
      menuState.isItemDetailCreateMode = false;
      menuState.activeItemDetailCatIdx = null;
      menuState.activeItemDetailItemIdx = null;
      menuState.currentDetailImageKey = null;
      menuState.itemDetailSnapshotBeforeEdit = null;
      invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, saveCatIdx);
      invokeHook('checkMenuDirty', checkMenuDirty);
      invokeHook('renderMenuCategories', renderMenuCategories);
    } else {
      menuState.isItemDetailCreateMode = false;
      menuState.activeItemDetailCatIdx = null;
      menuState.activeItemDetailItemIdx = null;
      menuState.currentDetailImageKey = null;
      menuState.itemDetailSnapshotBeforeEdit = null;
      invokeHook('checkMenuDirty', checkMenuDirty);
    }
  }
}

export function transitionToSubEditor(type: 'modifiers' | 'bundle'): void {
  if (menuState.activeItemDetailCatIdx === null) return;
  const cat = menuState.currentMenuData?.[menuState.activeItemDetailCatIdx];
  if (!cat) return;

  const nameInput = document.getElementById('item-detail-name-input') as HTMLInputElement | null;
  const priceInput = document.getElementById('item-detail-price-input') as HTMLInputElement | null;
  const descInput = document.getElementById('item-detail-description-input') as HTMLTextAreaElement | null;
  const badgeInput = document.getElementById('item-detail-badge-input') as HTMLInputElement | null;
  const staffOnlyInput = document.getElementById('item-detail-staff-only-input') as HTMLInputElement | null;

  const nameVal = nameInput ? nameInput.value.trim() : '';
  const priceVal = priceInput && priceInput.value !== '' ? parseFloat(priceInput.value) : 0;
  const descVal = descInput ? descInput.value.trim() : '';
  const badgeVal = badgeInput ? badgeInput.value.trim() : '';
  const existingItem =
    menuState.activeItemDetailItemIdx !== null ? cat.items?.[menuState.activeItemDetailItemIdx] : undefined;
  const isRec = Boolean(existingItem?.isRecommended);
  const isStaffOnly = Boolean(staffOnlyInput?.checked);

  if (menuState.isItemDetailCreateMode || menuState.activeItemDetailItemIdx === null) {
    const lang = readCurrentLang();
    if (!nameVal) {
      alert(
        tr('enterItemNameFirst') ||
          (lang === 'vi'
            ? 'Vui lòng nhập tên món trước khi thiết lập nâng cao'
            : '請先輸入餐點名稱再進行進階設定')
      );
      if (nameInput) nameInput.focus();
      return;
    }
    const newItemI18n = readItemDetailI18nInputs(null);
    const newItem: MenuItemDraft = {
      name: nameVal,
      price: isNaN(priceVal) ? 0 : priceVal,
      description: descVal,
      badgeText: badgeVal,
      isRecommended: isRec,
      staffOnly: isStaffOnly,
      isOos: false,
      bundleRule: null,
      itemType: 'standard',
      modifierGroups: [],
      ...(newItemI18n ? { i18n: newItemI18n } : {})
    };
    cat.items.push(newItem);
    menuState.activeItemDetailItemIdx = cat.items.length - 1;
    menuState.isItemDetailCreateMode = false;
    invokeHook('markMenuDirty', markMenuDirty);
    invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, menuState.activeItemDetailCatIdx);
    invokeHook('renderMenuCategories', renderMenuCategories);
  } else {
    autoCommitItemDetailFields();
  }

  const item = cat.items[menuState.activeItemDetailItemIdx];
  if (!item) return;

  menuState.hubModalReturnState = {
    catId: cat.id,
    itemName: item.name,
    catIdx: menuState.activeItemDetailCatIdx,
    itemIdx: menuState.activeItemDetailItemIdx
  };

  ++menuState.itemDetailSession;
  ++menuState.itemDetailImageRequest;
  const modal = document.getElementById('itemDetailModal');
  if (modal) modal.style.display = 'none';

  if (type === 'modifiers') {
    invokeHook('openItemModifiersModal', openItemModifiersModal, menuState.activeItemDetailCatIdx, menuState.activeItemDetailItemIdx);
  } else if (type === 'bundle') {
    void invokeHook('openBundleEditorModal', openBundleEditorModal, menuState.activeItemDetailCatIdx, menuState.activeItemDetailItemIdx);
  }
}

export async function translateItemDetailWithAI(): Promise<void> {
  const nameInput = document.getElementById('item-detail-name-input') as HTMLInputElement | null;
  const descInput = document.getElementById('item-detail-description-input') as HTMLTextAreaElement | null;
  const badgeInput = document.getElementById('item-detail-badge-input') as HTMLInputElement | null;
  const aiBtn = document.getElementById('btn-item-detail-ai-translate') as HTMLButtonElement | null;
  const aiBtnLabel = document.getElementById('i18n-btn-item-ai-translate');
  const details = document.getElementById('item-detail-i18n-details') as HTMLDetailsElement | null;
  const nameVal = nameInput ? nameInput.value.trim() : '';
  const descVal = descInput ? descInput.value.trim() : '';
  const badgeVal = badgeInput ? badgeInput.value.trim() : '';

  if (!nameVal) {
    alert(tr('enterItemNameFirst') || tr('enterItemName'));
    if (nameInput) nameInput.focus();
    return;
  }

  const tenantId = resolveTenantId();
  const targetLocales = getActiveMenuTargetLocales();
  if (targetLocales.length === 0) {
    notifyToast(tr('custLangNoneEnabled'), 'info');
    return;
  }
  const session = menuState.itemDetailSession;
  const entryId = `draft_${Date.now()}`;
  if (details) details.open = true;
  setAiTranslateButtonLoading(aiBtn, true, details);
  if (aiBtnLabel) aiBtnLabel.innerText = tr('btnItemAiTranslating');
  try {
    const res = await _menuApiFetch(
      `${resolveWorkerBase()}/api/menu/ai-translate?tenant_id=${encodeURIComponent(tenantId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          applyToDatabase: false,
          targetLocales,
          entries: [
            {
              type: 'item',
              id: entryId,
              name: nameVal,
              description: descVal,
              badge_text: badgeVal
            }
          ]
        })
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      byId?: Record<string, ItemI18nMap>;
      translations?: Record<string, ItemI18nMap>;
    };
    if (!res.ok) throw new Error(data.error || 'AI_TRANSLATION_FAILED');
    if (session !== menuState.itemDetailSession) return;
    const translated = data.byId?.[entryId] || data.translations?.[`item:${entryId}`] || {};
    const enNameEl = document.getElementById('item-detail-i18n-en-name') as HTMLInputElement | null;
    const enDescEl = document.getElementById('item-detail-i18n-en-description') as HTMLTextAreaElement | null;
    const enBadgeEl = document.getElementById('item-detail-i18n-en-badge') as HTMLInputElement | null;
    const viNameEl = document.getElementById('item-detail-i18n-vi-name') as HTMLInputElement | null;
    const viDescEl = document.getElementById('item-detail-i18n-vi-description') as HTMLTextAreaElement | null;
    const viBadgeEl = document.getElementById('item-detail-i18n-vi-badge') as HTMLInputElement | null;
    if (targetLocales.includes('en')) {
      if (enNameEl && translated.en?.name) enNameEl.value = translated.en.name;
      if (enDescEl && translated.en?.description) enDescEl.value = translated.en.description;
      if (enBadgeEl && translated.en?.badge_text) enBadgeEl.value = translated.en.badge_text;
    }
    if (targetLocales.includes('vi')) {
      if (viNameEl && translated.vi?.name) viNameEl.value = translated.vi.name;
      if (viDescEl && translated.vi?.description) viDescEl.value = translated.vi.description;
      if (viBadgeEl && translated.vi?.badge_text) viBadgeEl.value = translated.vi.badge_text;
    }
    if (details) details.open = true;
  } catch {
    if (session !== menuState.itemDetailSession) return;
    if (!notifyToast(tr('menuAiTranslateFailed'), 'error')) {
      alert(tr('menuAiTranslateFailed'));
    }
  } finally {
    if (session === menuState.itemDetailSession) {
      setAiTranslateButtonLoading(aiBtn, false, details);
      if (aiBtnLabel) aiBtnLabel.innerText = tr('btnItemAiTranslate');
    }
  }
}

export async function translateMissingMenuWithAI(): Promise<void> {
  if (!menuState.isMenuLoadedCompletely || menuState.isMenuSaving || menuState.isMenuAiTranslating) return;
  const tenantId = resolveTenantId();
  if (!tenantId) return;
  const targetLocales = getActiveMenuTargetLocales();
  if (targetLocales.length === 0) {
    notifyToast(tr('custLangNoneEnabled'), 'info');
    return;
  }

  menuState.isMenuAiTranslating = true;
  const aiBtn = document.getElementById('btn-menu-ai-translate') as HTMLButtonElement | null;
  const aiBtnLabel = document.getElementById('i18n-btn-menu-ai-translate-text');
  if (aiBtnLabel) aiBtnLabel.innerText = tr('btnMenuAiTranslating');
  invokeHook('updateMenuSaveState', updateMenuSaveState);
  setAiTranslateButtonLoading(aiBtn, true);

  const host = getHost();
  try {
    if (menuState.isMenuDirty) {
      await saveMenuData(true);
    }
    const res = await _menuApiFetch(
      `${resolveWorkerBase()}/api/menu/ai-translate?tenant_id=${encodeURIComponent(tenantId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          applyToDatabase: true,
          onlyMissing: true,
          targetLocales
        })
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      translatedCount?: number;
      persistedCount?: number;
    };
    if (!res.ok) throw new Error(data.error || 'AI_TRANSLATION_FAILED');
    const count = Number(data.translatedCount || data.persistedCount || 0);
    if (count > 0) {
      await invokeHook('loadMenuData', loadMenuData);
      if (host.UnifiedMenu && typeof host.UnifiedMenu.load === 'function') {
        await host.UnifiedMenu.load().catch(() => null);
      }
      notifyToast(tr('menuAiTranslateDone', { count }), 'success');
    } else {
      notifyToast(tr('menuAiTranslateNothing'), 'info');
    }
  } catch {
    if (!notifyToast(tr('menuAiTranslateFailed'), 'error')) {
      alert(tr('menuAiTranslateFailed'));
    }
  } finally {
    menuState.isMenuAiTranslating = false;
    setAiTranslateButtonLoading(aiBtn, false);
    if (aiBtnLabel) aiBtnLabel.innerText = tr('btnMenuAiTranslate');
    if (aiBtn) aiBtn.disabled = menuState.isMenuSaving || !menuState.isMenuLoadedCompletely;
    invokeHook('updateMenuSaveState', updateMenuSaveState);
  }
}
