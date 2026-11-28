import { renderMenuCategoryEditor } from './catalog-editor';
import { menuState } from './state';
import {
  esc,
  getHost,
  invokeHook,
  posSvg,
  readCurrentLang,
  resolveTenantId,
  resolveWorkerBase,
  tr,
  type BundleGroupDraft,
  type BundleRuleDraft
} from './types';
import {
  _menuApiFetch,
  canonicalMenuSnapshot,
  checkMenuDirty,
  saveMenuData,
  syncMenuDataFromDOM
} from './workspace';

export async function openBundleEditorModal(catIdx: number, itemIdx: number): Promise<void> {
  const host = getHost();
  if (host.UnifiedMenu?.enabled) {
    await host.UnifiedMenu.product?.(catIdx, itemIdx);
    return;
  }
  if (menuState.isMenuDirty) invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const targetItem = menuState.currentMenuData?.[catIdx]?.items?.[itemIdx];
  if (!targetItem) return;

  if (!targetItem.name || targetItem.name.trim() === '') {
    alert(tr('bundleValidationEmptyName') || '請先填寫菜單項目名稱');
    return;
  }

  const lang = readCurrentLang();
  if (menuState.isMenuDirty && !targetItem.id) {
    const shouldSave = confirm(
      lang === 'vi'
        ? 'Món mới cần được lưu vào hệ thống trước khi thiết lập Combo. Bạn có muốn lưu thực đơn ngay bây giờ không?'
        : '新建立的菜單項目需先儲存至資料庫方可設定組合，是否立即儲存？'
    );
    if (shouldSave) {
      await saveMenuData(true);
    } else {
      return;
    }
  }

  const refreshedItem = menuState.currentMenuData?.[catIdx]?.items?.[itemIdx];
  if (!refreshedItem) return;
  menuState.bundleEditingTarget = {
    catIndex: catIdx,
    itemIndex: itemIdx,
    item: refreshedItem
  };

  if (refreshedItem.bundleRule && Array.isArray(refreshedItem.bundleRule.groups) && refreshedItem.bundleRule.groups.length > 0) {
    const draft = JSON.parse(JSON.stringify(refreshedItem.bundleRule)) as BundleRuleDraft;
    draft.groups.forEach((grp: BundleGroupDraft, idx: number) => {
      grp.id = grp.id || `group_${idx + 1}_${Date.now()}`;
      if (!grp.label || typeof grp.label !== 'object') {
        grp.label = {
          'zh-TW': grp.name || `自選分組 #${idx + 1}`,
          vi: grp.name || `Nhóm chọn #${idx + 1}`
        };
      }
      grp.minQuantity = Math.max(1, Number(grp.minQuantity || 1));
      grp.maxQuantity = Math.max(grp.minQuantity, Number(grp.maxQuantity || grp.minQuantity));
      grp.allowRepeats =
        grp.allowRepeats !== undefined
          ? Boolean(grp.allowRepeats)
          : grp.allowRepeat !== undefined
            ? Boolean(grp.allowRepeat)
            : true;
      grp.sources = Array.isArray(grp.sources) ? grp.sources : [];

      if (grp.sources.length === 0) {
        if (Array.isArray(grp.eligibleItems) && grp.eligibleItems.length > 0) {
          grp.sources.push({
            type: 'item_list',
            itemIds: grp.eligibleItems.map(it => it.id || it.itemId || it.name).filter((v): v is string => Boolean(v))
          });
        } else if (Array.isArray(grp.items) && grp.items.length > 0) {
          grp.sources.push({
            type: 'item_list',
            itemIds: grp.items
              .map(it => it.itemId || (it as { id?: string; name?: string }).id || (it as { name?: string }).name)
              .filter((v): v is string => Boolean(v))
          });
        }
      }
    });
    menuState.bundleDraftRule = draft;
  } else {
    menuState.bundleDraftRule = {
      version: 1,
      groups: [
        {
          id: `group_1_${Date.now()}`,
          label: {
            'zh-TW': '請選擇 1 樣餐點',
            vi: 'Chọn 1 món'
          },
          name: '請選擇 1 樣餐點',
          minQuantity: 1,
          maxQuantity: 1,
          allowRepeats: false,
          sources: []
        }
      ]
    };
  }

  menuState.bundleActiveGroupIndex = 0;
  const firstGrp = menuState.bundleDraftRule?.groups?.[0];
  if (firstGrp?.sources?.some(s => s.type === 'category')) {
    menuState.bundleSourceTab = 'category';
  } else if (firstGrp?.sources?.some(s => s.type === 'item_list' || s.type === 'items')) {
    menuState.bundleSourceTab = 'items';
  } else {
    menuState.bundleSourceTab = 'category';
  }

  const nameEl = document.getElementById('bundle-modal-item-name');
  if (nameEl) nameEl.textContent = refreshedItem.name;
  const priceEl = document.getElementById('bundle-modal-item-price');
  if (priceEl) {
    priceEl.textContent = `$${refreshedItem.price !== null && refreshedItem.price !== undefined ? refreshedItem.price : 0}`;
  }

  const removeBtn = document.getElementById('btn-bundle-remove-config');
  const dangerZoneCard = document.getElementById('bundle-danger-zone-card');
  const isExistingCombo = Boolean(refreshedItem.bundleRule?.groups?.length);
  if (removeBtn) removeBtn.style.display = isExistingCombo ? 'inline-flex' : 'none';
  if (dangerZoneCard) dangerZoneCard.style.display = isExistingCombo ? 'flex' : 'none';

  const modal = document.getElementById('modal-bundle-editor');
  if (modal) {
    modal.style.display = 'flex';
    const body = document.getElementById('bundle-editor-modal-body');
    if (body) body.scrollTop = 0;
  }

  renderBundleEditorSidebar();
  renderBundleGroupConfigPanel();
}

export function closeBundleEditorModal(): void {
  const modal = document.getElementById('modal-bundle-editor');
  if (modal) modal.style.display = 'none';
  const returnState = menuState.hubModalReturnState;
  menuState.bundleEditingTarget = null;
  menuState.bundleDraftRule = null;
  menuState.bundleActiveGroupIndex = 0;
  invokeHook('checkMenuDirty', checkMenuDirty);
  if (returnState) {
    menuState.hubModalReturnState = null;
    invokeHook('openItemDetailModal', () => undefined, returnState.catIdx, returnState.itemIdx);
  }
}

export function syncBundleCurrentGroupFromDOM(): void {
  const grp = menuState.bundleDraftRule?.groups?.[menuState.bundleActiveGroupIndex];
  if (!grp) return;
  const zhInp = document.getElementById('bundle-group-name-zh') as HTMLInputElement | null;
  const viInp = document.getElementById('bundle-group-name-vi') as HTMLInputElement | null;
  if (!grp.label || typeof grp.label !== 'object') grp.label = {};
  if (zhInp) grp.label['zh-TW'] = zhInp.value;
  if (viInp) grp.label.vi = viInp.value;
  grp.name = grp.label['zh-TW'] || grp.label.vi || grp.name;
}

export function renderBundleEditorSidebar(): void {
  const listEl = document.getElementById('bundle-groups-list');
  const badgeEl = document.getElementById('bundle-group-count-badge');
  const draft = menuState.bundleDraftRule;
  if (!listEl || !draft) return;

  if (badgeEl) badgeEl.textContent = String(draft.groups.length);
  listEl.innerHTML = '';
  const lang = readCurrentLang();

  draft.groups.forEach((grp, gIdx) => {
    const isActive = gIdx === menuState.bundleActiveGroupIndex;
    const labelObj = grp.label && typeof grp.label === 'object' ? grp.label : undefined;
    const grpName =
      (labelObj && (labelObj[lang] || labelObj['zh-TW'] || labelObj.vi)) ||
      (typeof grp.label === 'string' ? grp.label : '') ||
      grp.name ||
      `${tr('bundleBadge')} #${gIdx + 1}`;
    const qty = grp.minQuantity || 1;
    const repeatText = grp.allowRepeats
      ? lang === 'vi'
        ? 'Được chọn lặp lại'
        : '可重複選'
      : lang === 'vi'
        ? 'Không lặp lại'
        : '不可重複';
    const ruleSummary =
      lang === 'vi'
        ? `Bắt buộc ${qty} ${tr('bundleItemUnit')} • ${repeatText}`
        : `必須選取 ${qty} ${tr('bundleItemUnit')} • ${repeatText}`;

    const card = document.createElement('div');
    card.className = `bundle-group-card ${isActive ? 'active' : ''}`;
    card.onclick = () => selectBundleGroup(gIdx);

    let deleteBtnHtml = '';
    if (draft.groups.length > 1) {
      deleteBtnHtml = `
        <button type="button" class="bundle-group-card-delete" onclick="deleteBundleGroup(${gIdx}, event)" title="${tr('btnItemDelete')}">
          ${posSvg('trash')}
        </button>
      `;
    }

    card.innerHTML = `
      <div class="bundle-group-card-header">
        <span class="bundle-group-card-title">${esc(grpName)}</span>
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

export function selectBundleGroup(groupIdx: number): void {
  syncBundleCurrentGroupFromDOM();
  menuState.bundleActiveGroupIndex = groupIdx;
  const grp = menuState.bundleDraftRule?.groups?.[menuState.bundleActiveGroupIndex];
  if (grp?.sources?.some(s => s.type === 'category')) {
    menuState.bundleSourceTab = 'category';
  } else if (grp?.sources?.some(s => s.type === 'item_list' || s.type === 'items')) {
    menuState.bundleSourceTab = 'items';
  }
  renderBundleEditorSidebar();
  renderBundleGroupConfigPanel();
}

export function addBundleGroup(): void {
  const draft = menuState.bundleDraftRule;
  if (!draft) return;
  syncBundleCurrentGroupFromDOM();
  const newIdx = draft.groups.length + 1;
  draft.groups.push({
    id: `group_${newIdx}_${Date.now()}`,
    label: {
      'zh-TW': `請選擇 1 樣餐點 (組 ${newIdx})`,
      vi: `Chọn 1 món (Nhóm ${newIdx})`
    },
    name: `請選擇 1 樣餐點 (組 ${newIdx})`,
    minQuantity: 1,
    maxQuantity: 1,
    allowRepeats: false,
    sources: []
  });
  menuState.bundleActiveGroupIndex = draft.groups.length - 1;
  renderBundleEditorSidebar();
  renderBundleGroupConfigPanel();
}

export function deleteBundleGroup(groupIdx: number, event?: Event): void {
  if (event) event.stopPropagation();
  const draft = menuState.bundleDraftRule;
  if (!draft) return;
  if (draft.groups.length <= 1) {
    alert(tr('bundleValidationEmptyGroups'));
    return;
  }
  const confirmMsg = readCurrentLang() === 'vi' ? 'Bạn có chắc muốn xóa nhóm chọn này?' : '確定要刪除此分組嗎？';
  if (!confirm(confirmMsg)) return;

  draft.groups.splice(groupIdx, 1);
  if (menuState.bundleActiveGroupIndex >= draft.groups.length) {
    menuState.bundleActiveGroupIndex = draft.groups.length - 1;
  }
  renderBundleEditorSidebar();
  renderBundleGroupConfigPanel();
}

export function updateBundleGroupName(val: string): void {
  const grp = menuState.bundleDraftRule?.groups?.[menuState.bundleActiveGroupIndex];
  if (!grp) return;
  grp.name = val;
  if (!grp.label || typeof grp.label !== 'object') {
    grp.label = {};
  }
  grp.label['zh-TW'] = val;
  grp.label.vi = val;

  const cards = document.querySelectorAll('#bundle-groups-list .bundle-group-card');
  const activeCard = cards[menuState.bundleActiveGroupIndex];
  if (activeCard) {
    const titleEl = activeCard.querySelector('.bundle-group-card-title');
    const displayVal = val || `${tr('bundleBadge')} #${menuState.bundleActiveGroupIndex + 1}`;
    if (titleEl) titleEl.textContent = displayVal;
  }
}

export function updateBundleGroupLabel(_lang: string, val: string): void {
  updateBundleGroupName(val);
}

export function stepBundleQty(delta: number): void {
  const grp = menuState.bundleDraftRule?.groups?.[menuState.bundleActiveGroupIndex];
  if (!grp) return;
  const newQty = Math.max(1, (grp.minQuantity || 1) + delta);
  grp.minQuantity = newQty;
  grp.maxQuantity = newQty;

  const valEl = document.getElementById('bundle-stepper-val');
  if (valEl) valEl.textContent = String(newQty);
  renderBundleEditorSidebar();
}

export function toggleBundleRepeat(isChecked: boolean): void {
  const grp = menuState.bundleDraftRule?.groups?.[menuState.bundleActiveGroupIndex];
  if (!grp) return;
  grp.allowRepeats = isChecked;
  const lbl = document.getElementById('bundle-repeat-label');
  if (lbl) lbl.classList.toggle('checked', isChecked);
  renderBundleEditorSidebar();
}

export function switchBundleSourceTab(tab: 'category' | 'items'): void {
  menuState.bundleSourceTab = tab;
  renderBundleSourcesSection();
}

export function toggleBundleSourceCategory(catId: string, isChecked: boolean): void {
  const grp = menuState.bundleDraftRule?.groups?.[menuState.bundleActiveGroupIndex];
  if (!grp) return;
  if (!Array.isArray(grp.sources)) grp.sources = [];
  const targetCat = (menuState.currentMenuData || []).find(
    c => c.catId === catId || c.id === catId || (c.databaseId && c.databaseId === catId)
  );
  const catKeys = [catId];
  if (targetCat) {
    if (targetCat.catId) catKeys.push(targetCat.catId);
    if (targetCat.id) catKeys.push(targetCat.id);
    if (targetCat.databaseId) catKeys.push(targetCat.databaseId);
  }
  if (isChecked) {
    if (!grp.sources.some(s => s.type === 'category' && catKeys.includes(s.categoryId || s.refId || ''))) {
      grp.sources.push({ type: 'category', categoryId: catId, refId: catId });
    }
  } else {
    grp.sources = grp.sources.filter(s => !(s.type === 'category' && catKeys.includes(s.categoryId || s.refId || '')));
  }
  renderBundleSourcesSection();
  renderBundleEligiblePreview();
}

export function toggleBundleSourceItem(itemId: string, isChecked: boolean): void {
  const grp = menuState.bundleDraftRule?.groups?.[menuState.bundleActiveGroupIndex];
  if (!grp) return;
  if (!Array.isArray(grp.sources)) grp.sources = [];
  let itemListSrc = grp.sources.find(s => s.type === 'item_list');
  if (!itemListSrc) {
    itemListSrc = { type: 'item_list', itemIds: [] };
    grp.sources.push(itemListSrc);
  }
  if (!Array.isArray(itemListSrc.itemIds)) itemListSrc.itemIds = [];
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

export function computeEligibleItemsCount(grp: BundleGroupDraft | null | undefined): number {
  if (!grp || !menuState.currentMenuData) return 0;
  const itemSet = new Set<string>();
  menuState.currentMenuData.forEach(cat => {
    if (cat.type !== 'catalog' || !Array.isArray(cat.items)) return;
    const catMatches = (grp.sources || []).some(
      s =>
        s.type === 'category' &&
        (s.categoryId === cat.catId ||
          s.refId === cat.catId ||
          s.categoryId === cat.id ||
          s.refId === cat.id ||
          Boolean(cat.databaseId && (s.categoryId === cat.databaseId || s.refId === cat.databaseId)))
    );
    if (catMatches) {
      cat.items.forEach(it => {
        if (it.name) itemSet.add(it.id || it.name);
      });
    } else {
      const itemSources = (grp.sources || []).filter(s => s.type === 'item_list' || s.type === 'items');
      const itemIds = itemSources.flatMap(s => (Array.isArray(s.itemIds) ? s.itemIds : []));
      cat.items.forEach(it => {
        if (
          (it.id && itemIds.includes(it.id)) ||
          (it.name && itemIds.includes(it.name)) ||
          (Array.isArray(grp.items) && grp.items.some(f => f.itemId === it.id || f.itemId === it.name)) ||
          (Array.isArray(grp.eligibleItems) && grp.eligibleItems.some(e => e.id === it.id || (e.name && e.name === it.name)))
        ) {
          itemSet.add(it.id || it.name);
        }
      });
    }
  });
  return itemSet.size;
}

export function renderBundleEligiblePreview(): void {
  const previewEl = document.getElementById('bundle-eligible-count');
  const grp = menuState.bundleDraftRule?.groups?.[menuState.bundleActiveGroupIndex];
  if (!previewEl || !grp) return;
  previewEl.textContent = String(computeEligibleItemsCount(grp));
}

export function renderBundleSourcesSection(): void {
  const container = document.getElementById('bundle-sources-container');
  const grp = menuState.bundleDraftRule?.groups?.[menuState.bundleActiveGroupIndex];
  if (!container || !grp) return;

  const catTabActive = menuState.bundleSourceTab === 'category';
  const itemTabActive = menuState.bundleSourceTab === 'items';

  let sourcesHtml = `
    <div class="bundle-source-type-segmented">
      <button type="button" class="bundle-source-type-pill ${catTabActive ? 'active' : ''}" onclick="switchBundleSourceTab('category')">
        ${posSvg('folder')}<span>${tr('bundleSourceCategory')}</span>
      </button>
      <button type="button" class="bundle-source-type-pill ${itemTabActive ? 'active' : ''}" onclick="switchBundleSourceTab('items')">
        ${posSvg('tag')}<span>${tr('bundleSourceItems')}</span>
      </button>
    </div>
  `;

  if (catTabActive) {
    sourcesHtml += `<div class="bundle-sources-grid" style="margin-top: 10px;">`;
    (menuState.currentMenuData || []).forEach(cat => {
      if (cat.type !== 'catalog') return;
      const catKey = cat.catId || cat.id;
      const isSelected = (grp.sources || []).some(
        s =>
          s.type === 'category' &&
          (s.categoryId === cat.catId ||
            s.refId === cat.catId ||
            s.categoryId === cat.id ||
            s.refId === cat.id ||
            Boolean(cat.databaseId && (s.categoryId === cat.databaseId || s.refId === cat.databaseId)))
      );
      const itemCount = (cat.items && cat.items.length) || 0;
      sourcesHtml += `
        <label class="bundle-source-chip ${isSelected ? 'selected' : ''}">
          <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleBundleSourceCategory('${esc(catKey)}', this.checked)">
          <span class="bundle-source-chip-name">${esc(cat.title)}</span>
          <span class="bundle-source-chip-count">${itemCount} ${tr('bundleItemUnit')}</span>
        </label>
      `;
    });
    sourcesHtml += `</div>`;
  } else {
    sourcesHtml += `<div class="bundle-sources-grid" style="margin-top: 10px; max-height: 260px;">`;
    const itemSources = (grp.sources || []).filter(s => s.type === 'item_list' || s.type === 'items');
    const selectedItemIds = itemSources.flatMap(s => (Array.isArray(s.itemIds) ? s.itemIds : []));

    (menuState.currentMenuData || []).forEach(cat => {
      if (cat.type !== 'catalog' || !cat.items || cat.items.length === 0) return;
      cat.items.forEach(it => {
        const itemKey = it.id || it.name;
        const isSelected =
          Boolean(it.id && selectedItemIds.includes(it.id)) ||
          Boolean(it.name && selectedItemIds.includes(it.name)) ||
          Boolean(Array.isArray(grp.items) && grp.items.some(f => f.itemId === it.id || f.itemId === it.name)) ||
          Boolean(
            Array.isArray(grp.eligibleItems) &&
              grp.eligibleItems.some(e => e.id === it.id || (e.name && e.name === it.name))
          );
        sourcesHtml += `
          <label class="bundle-source-chip ${isSelected ? 'selected' : ''}" title="${esc(cat.title)} - ${esc(it.name)}">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleBundleSourceItem('${esc(itemKey)}', this.checked)">
            <span class="bundle-source-chip-name">${esc(it.name)}</span>
            <span class="bundle-source-chip-count">$${it.price || 0}</span>
          </label>
        `;
      });
    });
    sourcesHtml += `</div>`;
  }

  container.innerHTML = sourcesHtml;
}

export function renderBundleGroupConfigPanel(): void {
  const panel = document.getElementById('bundle-group-config-panel');
  if (!panel) return;
  const grp = menuState.bundleDraftRule?.groups?.[menuState.bundleActiveGroupIndex];
  if (!grp) {
    panel.innerHTML = `<div style="text-align:center; padding: 40px; color:#94a3b8;">${tr('bundleValidationEmptyGroups')}</div>`;
    return;
  }

  const lang = readCurrentLang();
  const labelObj = grp.label && typeof grp.label === 'object' ? grp.label : undefined;
  const grpName =
    grp.name ||
    (labelObj && (labelObj[lang] || labelObj['zh-TW'] || labelObj.vi)) ||
    (typeof grp.label === 'string' ? grp.label : '') ||
    '';
  const qty = grp.minQuantity || 1;
  const isRepeat = Boolean(grp.allowRepeats);
  const eligibleCount = computeEligibleItemsCount(grp);

  panel.innerHTML = `
    <div class="bundle-config-section">
      <div class="bundle-config-section-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        <span id="i18n-bundle-section-name">${tr('bundleGroupDetailTitle')}</span>
      </div>
      <div class="bundle-group-name-inputs">
        <div class="bundle-field-group">
          <label class="bundle-field-label" id="i18n-bundle-name-lbl">${tr('bundleGroupName')}</label>
          <input type="text" class="bundle-input-text" id="bundle-group-name" value="${esc(grpName)}"
            placeholder="${tr('bundleGroupNamePlaceholder')}" oninput="updateBundleGroupName(this.value)">
        </div>
      </div>
    </div>

    <div class="bundle-config-section">
      <div class="bundle-config-section-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
        <span id="i18n-bundle-section-rule">${tr('bundleQuantityRule')}</span>
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
            <span class="bundle-checkbox-title">${tr('bundleAllowRepeat')}</span>
            <span class="bundle-checkbox-desc">${tr('bundleAllowRepeatDesc')}</span>
          </div>
        </label>
      </div>
    </div>

    <div class="bundle-config-section">
      <div class="bundle-config-section-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
          <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/>
          <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>
        </svg>
        <span id="i18n-bundle-section-source">${tr('bundleSourceType')}</span>
      </div>
      <div id="bundle-sources-container"></div>
    </div>

    <div class="bundle-config-section" style="margin-top: auto; padding-top: 10px; border-top: 1px dashed #e2e8f0;">
      <div style="display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #475569;">
        <span>${tr('bundleEligiblePreview')}:</span>
        <strong style="font-size: 16px; color: #4338ca;"><span id="bundle-eligible-count">${eligibleCount}</span> ${tr('bundleItemUnit')}</strong>
      </div>
    </div>
  `;

  renderBundleSourcesSection();
}

export async function saveBundleConfig(): Promise<void> {
  const editingTarget = menuState.bundleEditingTarget;
  const draftRule = menuState.bundleDraftRule;
  if (!editingTarget || !draftRule) return;
  syncBundleCurrentGroupFromDOM();

  if (!draftRule.groups || draftRule.groups.length === 0) {
    alert(tr('bundleValidationEmptyGroups'));
    return;
  }

  for (let i = 0; i < draftRule.groups.length; i++) {
    const grp = draftRule.groups[i];
    if (!grp) continue;
    const labelObj = grp.label && typeof grp.label === 'object' ? grp.label : undefined;
    const zh = labelObj?.['zh-TW'];
    const vi = labelObj?.vi;
    if ((!zh || zh.trim() === '') && (!vi || vi.trim() === '') && (!grp.name || grp.name.trim() === '')) {
      alert(`${tr('bundleValidationEmptyName')} (#${i + 1})`);
      selectBundleGroup(i);
      return;
    }
    if (!grp.sources || grp.sources.length === 0) {
      alert(`${tr('bundleValidationEmptySources')} (#${i + 1})`);
      selectBundleGroup(i);
      return;
    }
  }

  const btnSave = document.getElementById('btn-bundle-modal-save') as HTMLButtonElement | null;
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.textContent = tr('menuSaving');
  }

  try {
    const tenantId = resolveTenantId();
    const cat = menuState.currentMenuData?.[editingTarget.catIndex];
    if (!cat) return;
    const payload = {
      parent_item_id: editingTarget.item.id || null,
      item_name: editingTarget.item.name,
      category_id: cat.catId || null,
      category_slug: cat.id,
      config: {
        version: 1,
        groups: draftRule.groups
      }
    };

    const res = await _menuApiFetch(`${resolveWorkerBase()}/api/menu/bundle-rules?tenant_id=${tenantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resData = (await res.json()) as { error?: string; bundleRule?: BundleRuleDraft };
    if (!res.ok || resData.error) {
      throw new Error(resData.error || res.statusText);
    }

    editingTarget.item.bundleRule = resData.bundleRule || draftRule;
    if (menuState.savedMenuSnapshot) {
      try {
        const snapData = JSON.parse(menuState.savedMenuSnapshot) as Array<{ items?: Array<{ bundleRule?: unknown }> }>;
        const snapItem = snapData[editingTarget.catIndex]?.items?.[editingTarget.itemIndex];
        if (snapItem) {
          snapItem.bundleRule = editingTarget.item.bundleRule;
          menuState.savedMenuSnapshot = invokeHook('canonicalMenuSnapshot', canonicalMenuSnapshot, snapData);
        }
      } catch (e) {
        console.error('Failed to sync bundleRule to savedMenuSnapshot', e);
      }
    }
    alert(tr('bundleSaveSuccess'));
    const catIdx = editingTarget.catIndex;
    closeBundleEditorModal();
    invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, catIdx);
  } catch (err) {
    alert(tr('bundleSaveFail') + (err instanceof Error ? err.message : String(err)));
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        <span id="i18n-btn-bundle-save">${tr('btnBundleSave')}</span>
      `;
    }
  }
}

export async function clearBundleConfig(): Promise<void> {
  const editingTarget = menuState.bundleEditingTarget;
  if (!editingTarget) return;
  if (!confirm(tr('confirmRemoveBundleConfig'))) return;

  const btnDel = document.getElementById('btn-bundle-remove-config') as HTMLButtonElement | null;
  if (btnDel) btnDel.disabled = true;

  try {
    const tenantId = resolveTenantId();
    const cat = menuState.currentMenuData?.[editingTarget.catIndex];
    if (!cat) return;
    const payload = {
      parent_item_id: editingTarget.item.id || null,
      item_name: editingTarget.item.name,
      category_id: cat.catId || null,
      category_slug: cat.id,
      delete: true
    };

    const res = await _menuApiFetch(`${resolveWorkerBase()}/api/menu/bundle-rules?tenant_id=${tenantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resData = (await res.json()) as { error?: string };
    if (!res.ok || resData.error) {
      throw new Error(resData.error || res.statusText);
    }

    editingTarget.item.bundleRule = null;
    if (menuState.savedMenuSnapshot) {
      try {
        const snapData = JSON.parse(menuState.savedMenuSnapshot) as Array<{ items?: Array<{ bundleRule?: unknown }> }>;
        const snapItem = snapData[editingTarget.catIndex]?.items?.[editingTarget.itemIndex];
        if (snapItem) {
          snapItem.bundleRule = null;
          menuState.savedMenuSnapshot = invokeHook('canonicalMenuSnapshot', canonicalMenuSnapshot, snapData);
        }
      } catch (e) {
        console.error('Failed to sync bundleRule to savedMenuSnapshot', e);
      }
    }
    const catIdx = editingTarget.catIndex;
    closeBundleEditorModal();
    invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, catIdx);
  } catch (err) {
    alert(tr('bundleSaveFail') + (err instanceof Error ? err.message : String(err)));
  } finally {
    if (btnDel) btnDel.disabled = false;
  }
}
