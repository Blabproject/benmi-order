import { createClientUuid } from '@shared/infra/http';
import { menuState, type BundleWizardProduct } from './state';
import {
  esc,
  getHost,
  invokeHook,
  menuApiFetch,
  readCurrentLang,
  resolveTenantId,
  resolveWorkerBase,
  tr,
  type BundleFixedItemEntry,
  type BundleGroupDraft,
  type BundleRuleDraft
} from './types';
import { loadMenuData, syncMenuDataFromDOM } from './workspace';

interface WizardCatalogCandidate {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  rawCategoryId: string;
  databaseId?: string | null;
}

const comboGroups = (): BundleGroupDraft[] => menuState.comboWizard?.config.groups || [];
const comboDraftKey = (): string =>
  `bundle_wizard:${resolveTenantId()}:${menuState.comboWizard?.product.id || 'new'}`;

const comboCatalogItems = (): WizardCatalogCandidate[] =>
  (menuState.currentMenuData || [])
    .filter(cat => cat.type === 'catalog')
    .flatMap(cat =>
      (cat.items || [])
        .filter(item => {
          if (!item || (!item.id && !item.name)) return false;
          if (menuState.comboWizard?.product?.id && item.id === menuState.comboWizard.product.id) return false;
          if (
            !menuState.comboWizard?.product?.id &&
            menuState.comboWizard?.product?.name &&
            item.name === menuState.comboWizard.product.name
          ) {
            return false;
          }
          if (item.bundleRule && item.bundleRule.groups?.length) return false;
          return true;
        })
        .map(item => ({
          id: item.id || item.name,
          name: item.name,
          categoryId: cat.catId || cat.id,
          categoryName: cat.title,
          rawCategoryId: cat.id,
          databaseId: cat.databaseId
        }))
    );

export function isComboItemSelected(group: BundleGroupDraft | null | undefined, item: WizardCatalogCandidate | null | undefined): boolean {
  if (!group || !item) return false;
  const itemId = item.id;
  const itemName = item.name;

  if (group.type === 'fixed') {
    return (
      Array.isArray(group.items) &&
      group.items.some(f => f.itemId === itemId || Boolean(itemName && f.itemId === itemName))
    );
  }

  if (Array.isArray(group.sources)) {
    for (const src of group.sources) {
      if (src.type === 'item_list' || src.type === 'items') {
        if (
          Array.isArray(src.itemIds) &&
          (src.itemIds.includes(itemId) || Boolean(itemName && src.itemIds.includes(itemName)))
        ) {
          return true;
        }
      }
      if (src.type === 'category') {
        const catKey = src.refId || src.categoryId;
        if (catKey) {
          const cat = (menuState.currentMenuData || []).find(
            c => c.catId === catKey || c.id === catKey || (c.databaseId && c.databaseId === catKey)
          );
          if (cat) {
            if (
              item.categoryId === cat.catId ||
              item.categoryId === cat.id ||
              item.categoryId === cat.databaseId ||
              item.rawCategoryId === cat.id ||
              Boolean(cat.databaseId && item.databaseId === cat.databaseId)
            ) {
              return true;
            }
          } else if (item.categoryId === catKey || item.rawCategoryId === catKey) {
            return true;
          }
        }
      }
    }
  }

  if (
    Array.isArray(group.items) &&
    group.items.some(f => f.itemId === itemId || Boolean(itemName && f.itemId === itemName))
  ) {
    return true;
  }

  if (
    Array.isArray(group.eligibleItems) &&
    group.eligibleItems.some(
      e =>
        e.id === itemId ||
        Boolean(itemName && e.name === itemName) ||
        Boolean(e.itemId && (e.itemId === itemId || e.itemId === itemName))
    )
  ) {
    return true;
  }

  return false;
}

const comboLabel = (zh: string, vi: string): Record<string, string> => {
  const name = readCurrentLang() === 'vi' ? vi : zh;
  return { 'zh-TW': name, vi: name };
};

const comboGroupName = (group: BundleGroupDraft): string => {
  const lang = readCurrentLang();
  if (typeof group.label === 'string') return group.label;
  return group.label?.[lang] || group.name || group.label?.['zh-TW'] || group.label?.vi || '';
};

export function comboSetGroupName(group: BundleGroupDraft, name: string): void {
  group.name = name;
  group.label = { 'zh-TW': name, vi: name };
}

const comboNewGroup = (type: 'fixed' | 'choice'): BundleGroupDraft => ({
  id: `group_${createClientUuid()}`,
  type,
  label: comboLabel(type === 'fixed' ? '固定內容' : '自選餐點', type === 'fixed' ? 'Món có sẵn' : 'Món tự chọn'),
  minQuantity: 1,
  maxQuantity: 1,
  allowRepeats: false,
  sources: [],
  items: [],
  surcharges: {}
});

export function persistComboWizard(): void {
  if (!menuState.comboWizard) return;
  menuState.comboWizard.changed = true;
  localStorage.setItem(
    comboDraftKey(),
    JSON.stringify({
      product: menuState.comboWizard.product,
      config: menuState.comboWizard.config,
      step: menuState.comboWizard.step
    })
  );
}

export function openBundleWizard(catIndex: number = menuState.activeCategoryIndex, itemIndex: number | null = null): void {
  const host = getHost();
  if (host.currentTenantFeatures?.includes('disable_bundle_builder_v2')) return;
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const cat = menuState.currentMenuData?.[catIndex];
  if (!cat || cat.type !== 'catalog') return;
  const item = itemIndex === null ? null : cat.items[itemIndex];
  const product: BundleWizardProduct = {
    id: item?.id || null,
    categoryId: cat.catId || cat.id,
    name: item?.name || '',
    price: Number(item?.price || 0)
  };
  const rule = item?.bundleRule as BundleRuleDraft | null | undefined;
  const config: BundleRuleDraft = rule?.groups?.length
    ? {
        version: 2,
        groups: rule.groups.map(group => {
          const grpType = group.type || 'choice';
          const sources = Array.isArray(group.sources)
            ? (JSON.parse(JSON.stringify(group.sources)) as NonNullable<BundleGroupDraft['sources']>)
            : [];
          const items = Array.isArray(group.items)
            ? (JSON.parse(JSON.stringify(group.items)) as BundleFixedItemEntry[])
            : [];
          const surcharges =
            group.surcharges && typeof group.surcharges === 'object' ? { ...group.surcharges } : {};

          if (sources.length === 0) {
            if (Array.isArray(group.eligibleItems) && group.eligibleItems.length > 0) {
              sources.push({
                type: 'item_list',
                itemIds: group.eligibleItems
                  .map(it => it.id || it.itemId || it.name)
                  .filter((v): v is string => Boolean(v))
              });
            } else if (items.length > 0 && grpType !== 'fixed') {
              sources.push({
                type: 'item_list',
                itemIds: items
                  .map(it => it.itemId || (it as { id?: string; name?: string }).id || (it as { name?: string }).name)
                  .filter((v): v is string => Boolean(v))
              });
            }
          }

          sources.forEach(src => {
            if (src.type === 'category') {
              src.refId = src.refId || src.categoryId;
              src.categoryId = src.categoryId || src.refId;
            } else if (src.type === 'item_list' || src.type === 'items') {
              src.type = 'item_list';
              if (Array.isArray(src.itemIds)) {
                src.itemIds = src.itemIds.map(idOrName => {
                  const found = comboCatalogItems().find(c => c.id === idOrName || c.name === idOrName);
                  return found ? found.id : idOrName;
                });
              }
            }
          });

          const resolvedName = comboGroupName(group);
          return {
            id: group.id || `group_${createClientUuid()}`,
            type: grpType,
            label: resolvedName,
            name: resolvedName,
            minQuantity: Number(group.minQuantity || 1),
            maxQuantity: Number(group.maxQuantity || group.minQuantity || 1),
            allowRepeats: Boolean(group.allowRepeats),
            sources,
            items,
            surcharges
          };
        })
      }
    : { version: 2, groups: [] };

  menuState.comboWizard = {
    product,
    config,
    step: 0,
    changed: false,
    returnFocus: typeof document !== 'undefined' ? document.activeElement : null
  };
  try {
    localStorage.removeItem(comboDraftKey());
  } catch {
    // Ignore storage restriction errors.
  }
  comboGroups().forEach(group => comboSetGroupName(group, comboGroupName(group)));
  document.body.classList.add('bundle-wizard-open');
  const wizardEl = document.getElementById('bundle-wizard');
  if (wizardEl) wizardEl.style.display = 'flex';
  renderComboWizard();
  document.getElementById('bundle-wizard-title')?.focus();
}

export function closeBundleWizard(): void {
  if (!menuState.comboWizard) return;
  try {
    localStorage.removeItem(comboDraftKey());
  } catch {
    // Ignore storage restriction errors.
  }
  dismissComboWizard();
}

export function dismissComboWizard(skipRestore = false): void {
  const returnFocus = menuState.comboWizard?.returnFocus as HTMLElement | null | undefined;
  const wizardEl = document.getElementById('bundle-wizard');
  if (wizardEl) wizardEl.style.display = 'none';
  document.body.classList.remove('bundle-wizard-open');
  menuState.comboWizard = null;
  returnFocus?.focus?.();
  if (!skipRestore && menuState.hubModalReturnState) {
    const state = menuState.hubModalReturnState;
    menuState.hubModalReturnState = null;
    invokeHook('openItemDetailModal', () => undefined, state.catIdx, state.itemIdx);
  }
}

export function comboWizardBack(): void {
  if (menuState.comboWizard && menuState.comboWizard.step > 0) {
    menuState.comboWizard.step--;
    persistComboWizard();
    renderComboWizard();
  }
}

export function comboWizardField(field: keyof BundleWizardProduct, value: string): void {
  if (!menuState.comboWizard) return;
  if (field === 'price') {
    menuState.comboWizard.product.price = Number(value);
  } else if (field === 'name' || field === 'categoryId') {
    menuState.comboWizard.product[field] = value;
  } else {
    menuState.comboWizard.product.id = value;
  }
  persistComboWizard();
}

export function comboWizardImage(event: Event): void {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file || !menuState.comboWizard) return;
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      if (!menuState.comboWizard) return;
      const scale = Math.min(1, 800 / image.width, 800 / image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      menuState.comboWizard.imageDataUri = canvas.toDataURL('image/webp', 0.8);
      persistComboWizard();
      renderComboWizard();
    };
    image.src = String(reader.result || '');
  };
  reader.readAsDataURL(file);
}

export function comboWizardGroupField(index: number, field: string, value: string | boolean): void {
  const group = comboGroups()[index];
  if (!group) return;
  if (field === 'name') comboSetGroupName(group, String(value));
  else if (field === 'minQuantity') {
    group.minQuantity = Math.max(1, Number(value));
    group.maxQuantity = group.minQuantity;
  } else if (field === 'allowRepeats') {
    group.allowRepeats = Boolean(value);
  }
  persistComboWizard();
}

export function comboWizardTemplate(kind: string): void {
  if (!menuState.comboWizard) return;
  if (comboGroups().length && !confirm(tr('comboReplaceTemplate'))) return;
  const newChoice = (zh: string, vi: string): BundleGroupDraft => {
    const group = comboNewGroup('choice');
    group.label = comboLabel(zh, vi);
    return group;
  };
  if (kind === 'meal') {
    menuState.comboWizard.config.groups = [newChoice('選擇主餐', 'Chọn món chính'), newChoice('選擇飲料', 'Chọn đồ uống')];
  }
  if (kind === 'many') {
    const group = newChoice('任選餐點', 'Chọn món');
    group.minQuantity = group.maxQuantity = 2;
    menuState.comboWizard.config.groups = [group];
  }
  if (kind === 'fixed') {
    const group = comboNewGroup('fixed');
    group.label = comboLabel('套餐內容', 'Món trong combo');
    menuState.comboWizard.config.groups = [group];
  }
  menuState.comboWizard.preview = {};
  menuState.comboWizard.search = {};
  menuState.comboWizard.filters = {};
  persistComboWizard();
  renderComboWizard();
  document.querySelector<HTMLInputElement>('.bundle-wizard-group input')?.focus();
}

export function comboWizardAddGroup(type: 'fixed' | 'choice'): void {
  comboGroups().push(comboNewGroup(type));
  persistComboWizard();
  renderComboWizard();
  setTimeout(() => {
    const groups = document.querySelectorAll('.bundle-wizard-group');
    if (groups.length) {
      const last = groups[groups.length - 1];
      last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      last?.querySelector<HTMLInputElement>('input')?.focus();
    }
  }, 40);
}

export function comboWizardRemoveGroup(index: number): void {
  comboGroups().splice(index, 1);
  persistComboWizard();
  renderComboWizard();
}

export function comboWizardToggleItem(index: number, itemId: string, checked: boolean): void {
  const group = comboGroups()[index];
  if (!group) return;
  const candidates = comboCatalogItems();
  const targetItem = candidates.find(c => c.id === itemId || c.name === itemId);

  if (group.type === 'fixed') {
    group.items = (group.items || []).filter(
      item => item.itemId !== itemId && (!targetItem || item.itemId !== targetItem.name)
    );
    if (checked) group.items.push({ itemId, quantity: 1, surcharge: 0 });
  } else {
    if (!Array.isArray(group.sources)) group.sources = [];
    if (!group.surcharges) group.surcharges = {};
    const catSources = group.sources.filter(s => s.type === 'category');
    if (catSources.length > 0) {
      let itemListSrc = group.sources.find(s => s.type === 'item_list');
      if (!itemListSrc) {
        itemListSrc = { type: 'item_list', itemIds: [] };
        group.sources.push(itemListSrc);
      }
      if (!Array.isArray(itemListSrc.itemIds)) itemListSrc.itemIds = [];
      const idsRef = itemListSrc.itemIds;
      candidates.forEach(cand => {
        if (isComboItemSelected(group, cand) && !idsRef.includes(cand.id)) {
          idsRef.push(cand.id);
        }
      });
      group.sources = group.sources.filter(s => s.type !== 'category');
    }

    let source = group.sources.find(src => src.type === 'item_list');
    if (!source) {
      source = { type: 'item_list', itemIds: [] };
      group.sources.push(source);
    }
    source.itemIds = (source.itemIds || []).filter(
      id => id !== itemId && (!targetItem || id !== targetItem.name)
    );
    if (checked) source.itemIds.push(itemId);
    if (!checked) {
      delete group.surcharges[itemId];
      if (targetItem) delete group.surcharges[targetItem.name];
    }
  }
  persistComboWizard();
  renderComboWizard();
}

export function comboWizardToggleCategory(index: number, categoryId: string, checked: boolean): void {
  const group = comboGroups()[index];
  if (!group) return;
  const targetCat = (menuState.currentMenuData || []).find(
    c => c.catId === categoryId || c.id === categoryId || (c.databaseId && c.databaseId === categoryId)
  );
  const catKeys = [categoryId];
  if (targetCat) {
    if (targetCat.catId) catKeys.push(targetCat.catId);
    if (targetCat.id) catKeys.push(targetCat.id);
    if (targetCat.databaseId) catKeys.push(targetCat.databaseId);
  }
  group.sources = (group.sources || []).filter(
    source => !(source.type === 'category' && catKeys.includes(source.refId || source.categoryId || ''))
  );
  if (checked) group.sources.push({ type: 'category', refId: categoryId, categoryId });
  persistComboWizard();
  renderComboWizard();
}

export function comboWizardItemValue(index: number, itemId: string, field: 'surcharge' | 'quantity', value: string): void {
  const group = comboGroups()[index];
  if (!group) return;
  if (group.type === 'fixed') {
    const item = group.items?.find(candidate => candidate.itemId === itemId);
    if (item) item[field] = Number(value);
  } else {
    if (!group.surcharges) group.surcharges = {};
    group.surcharges[itemId] = Number(value);
  }
  persistComboWizard();
}

export function comboWizardSearch(index: number, value: string): void {
  if (!menuState.comboWizard) return;
  menuState.comboWizard.search = menuState.comboWizard.search || {};
  menuState.comboWizard.search[index] = value;
  renderComboWizard();
  document.getElementById(`combo-search-${index}`)?.focus();
}

export function comboWizardFilter(index: number, categoryId: string): void {
  if (!menuState.comboWizard) return;
  menuState.comboWizard.filters = menuState.comboWizard.filters || {};
  menuState.comboWizard.filters[index] = categoryId;
  renderComboWizard();
}

export function comboWizardPreviewPick(index: number, itemId: string, change: number): void {
  if (!menuState.comboWizard) return;
  const group = comboGroups()[index];
  if (!group || group.type !== 'choice') return;
  menuState.comboWizard.preview = menuState.comboWizard.preview || {};
  const chosen = menuState.comboWizard.preview[group.id] || [];
  if (Number(group.maxQuantity) === 1 && change > 0) {
    menuState.comboWizard.preview[group.id] = [itemId];
  } else if (change < 0) {
    const at = chosen.lastIndexOf(itemId);
    if (at >= 0) chosen.splice(at, 1);
    menuState.comboWizard.preview[group.id] = chosen;
  } else if (chosen.length < Number(group.maxQuantity) && (group.allowRepeats || !chosen.includes(itemId))) {
    chosen.push(itemId);
    menuState.comboWizard.preview[group.id] = chosen;
  }
  renderComboWizard();
}

export function comboWizardError(): string {
  if (!menuState.comboWizard) return '';
  const p = menuState.comboWizard.product;
  if (!p.name.trim()) return tr('comboNeedName');
  if (!Number.isFinite(p.price) || p.price < 0) return tr('comboNeedPrice');
  if (!comboGroups().length) return tr('comboNeedGroup');
  const candidates = comboCatalogItems();
  const validIds = new Set(candidates.map(item => item.id));
  const groups = comboGroups();
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (!group) continue;
    if (!comboGroupName(group).trim()) return `${i + 1}: ${tr('comboNeedGroupName')}`;
    if (group.type === 'fixed') {
      const grpItems = group.items || [];
      if (
        !grpItems.length ||
        new Set(grpItems.map(item => item.itemId)).size !== grpItems.length ||
        grpItems.some(
          item =>
            !validIds.has(item.itemId) ||
            !Number.isInteger(Number(item.quantity)) ||
            Number(item.quantity) < 1 ||
            !Number.isFinite(Number(item.surcharge)) ||
            Number(item.surcharge) < 0
        )
      ) {
        return `${i + 1}: ${tr('comboNeedItems')}`;
      }
    } else {
      const eligible = new Set(candidates.filter(item => isComboItemSelected(group, item)).map(item => item.id));
      const minQty = Number(group.minQuantity || 0);
      if (
        !Number.isInteger(minQty) ||
        minQty < 1 ||
        eligible.size < 1 ||
        (!group.allowRepeats && eligible.size < minQty) ||
        Object.values(group.surcharges || {}).some(value => !Number.isFinite(Number(value)) || Number(value) < 0)
      ) {
        return `${i + 1}: ${tr('comboNeedItems')}`;
      }
    }
  }
  return '';
}

export function comboWizardNext(): void {
  if (!menuState.comboWizard) return;
  const { step, product } = menuState.comboWizard;
  const error =
    step === 0
      ? !product.name.trim()
        ? tr('comboNeedName')
        : !Number.isFinite(product.price) || product.price < 0
          ? tr('comboNeedPrice')
          : ''
      : step === 1
        ? comboWizardError()
        : '';
  const errEl = document.getElementById('bundle-wizard-error');
  if (errEl) errEl.textContent = error;
  if (error) return;
  if (menuState.comboWizard.step < 2) {
    menuState.comboWizard.step++;
    persistComboWizard();
    renderComboWizard();
    return;
  }
  void saveComboWizard();
}

export function renderBundleStepper(currentStep: number): void {
  const stepsContainer = document.getElementById('bundle-wizard-steps');
  if (!stepsContainer) return;

  const stepsConfig = [
    { key: 'comboStepInfo', subKey: 'comboStepInfoSub', num: 1 },
    { key: 'comboStepParts', subKey: 'comboStepPartsSub', num: 2 },
    { key: 'comboStepPreview', subKey: 'comboStepPreviewSub', num: 3 }
  ];

  const checkSvg =
    '<svg class="bundle-step-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  let html = '<div class="bundle-stepper">';
  stepsConfig.forEach((cfg, idx) => {
    const isCompleted = idx < currentStep;
    const isActive = idx === currentStep;
    const stateClass = isCompleted ? 'is-completed' : isActive ? 'is-active' : 'is-pending';
    const ariaCurrent = isActive ? 'aria-current="step"' : '';
    const badgeText = isCompleted ? tr('comboStepCompleted') : isActive ? tr('comboStepCurrent') : tr('comboStepPending');
    const titleText = `${cfg.num}. ${tr(cfg.key)}`;
    const subText = tr(cfg.subKey) || '';
    const iconContent = isCompleted ? checkSvg : `<span class="bundle-step-num">${cfg.num}</span>`;

    html += `
      <div class="bundle-step-item ${stateClass}" ${ariaCurrent} onclick="comboWizardJumpToStep(${idx})" role="button" tabindex="0" title="${titleText}">
        <div class="bundle-step-indicator">
          <div class="bundle-step-icon">${iconContent}</div>
        </div>
        <div class="bundle-step-content">
          <div class="bundle-step-header">
            <span class="bundle-step-badge">${badgeText}</span>
          </div>
          <div class="bundle-step-title">${titleText}</div>
          <div class="bundle-step-sub">${subText}</div>
        </div>
      </div>
    `;

    if (idx < stepsConfig.length - 1) {
      const connClass = idx < currentStep ? 'is-completed' : 'is-pending';
      html += `
        <div class="bundle-step-connector ${connClass}">
          <div class="bundle-step-connector-fill"></div>
        </div>
      `;
    }
  });
  html += '</div>';
  stepsContainer.innerHTML = html;
}

export function renderComboWizard(): void {
  if (!menuState.comboWizard) return;
  const { product, step } = menuState.comboWizard;
  document.getElementById('bundle-wizard-steps')?.setAttribute('aria-label', tr('comboStepsLabel'));
  const errEl = document.getElementById('bundle-wizard-error');
  if (errEl) errEl.textContent = '';
  const titleEl = document.getElementById('bundle-wizard-title');
  if (titleEl) titleEl.textContent = product.id ? tr('comboEditTitle') : tr('comboCreateTitle');
  const closeEl = document.getElementById('bundle-wizard-close');
  if (closeEl) closeEl.textContent = tr('comboClose');
  const prevBtn = document.getElementById('bundle-wizard-prev') as HTMLButtonElement | null;
  if (prevBtn) {
    prevBtn.textContent = tr('comboBack');
    prevBtn.disabled = step === 0;
  }
  const nextBtn = document.getElementById('bundle-wizard-next');
  if (nextBtn) nextBtn.textContent = tr(step === 2 ? 'comboSave' : 'comboContinue');
  renderBundleStepper(step);

  const body = document.getElementById('bundle-wizard-body');
  if (!body) return;
  if (menuState.comboWizard.renderedStep !== step) body.scrollTop = 0;
  menuState.comboWizard.renderedStep = step;

  const data = menuState.currentMenuData || [];
  if (step === 0) {
    body.innerHTML = `<aside class="bundle-wizard-guide"><h2>${tr('comboWhatTitle')}</h2><p>${tr('comboWhatBody')}</p><p>${tr('comboPriceHelp')}</p><p>${tr('comboSetupHelp')}</p></aside><div class="bundle-wizard-info-fields"><label>${tr('comboProductName')}<input type="text" value="${esc(product.name)}" oninput="comboWizardField('name',this.value)"></label>
      <label>${tr('comboBasePrice')}<input type="number" min="0" step="1" value="${product.price}" oninput="comboWizardField('price',this.value)"></label>
      <label>${tr('comboCategory')}<select onchange="comboWizardField('categoryId',this.value)">${data
        .filter(cat => cat.type === 'catalog')
        .map(
          cat =>
            `<option value="${esc(cat.catId)}" ${cat.catId === product.categoryId ? 'selected' : ''}>${esc(cat.title)}</option>`
        )
        .join('')}</select></label>
      <label>${tr('comboImage')}<input type="file" accept="image/*" onchange="comboWizardImage(event)"></label>
      ${menuState.comboWizard.imageDataUri ? `<img src="${menuState.comboWizard.imageDataUri}" alt="${tr('comboImage')}" class="bundle-wizard-image-preview">` : ''}
      ${product.id ? `<button type="button" class="btn btn-ghost" onclick="openImageModal('${esc(data.find(cat => cat.catId === product.categoryId)?.id || '')}','${esc(product.name)}')">${tr('comboImage')}</button>` : ''}</div>`;
  } else if (step === 1) {
    const candidates = comboCatalogItems();
    const categories = data.filter(cat => cat.type === 'catalog');
    const groups = comboGroups();

    const guideHeader = `<section class="bundle-wizard-guide">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
        <div>
          <h2 style="margin:0 0 6px; font-size:18px; color:#0f172a;">${tr('comboPartsTitle')}</h2>
          <p style="margin:0; font-size:13.5px; color:#475569; line-height:1.5;">${tr('comboPartsHelp')}</p>
        </div>
        ${
          groups.length
            ? `
          <div style="display:flex; gap:8px; flex-shrink:0;">
            <button type="button" class="btn btn-primary" onclick="comboWizardAddGroup('choice')" style="font-weight:700; font-size:13px; min-height:44px; padding:8px 16px; border-radius:8px; background:var(--primary, #00b900); color:#ffffff; border:1px solid var(--primary, #00b900); display:inline-flex; align-items:center; gap:6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>${tr('comboAddChoice')}</span>
            </button>
          </div>
        `
            : ''
        }
      </div>
    </section>`;

    let contentHtml = '';
    if (!groups.length) {
      contentHtml = `<div class="bundle-wizard-empty-state">
        <div style="width:54px; height:54px; border-radius:50%; background:#f1f5f9; display:flex; align-items:center; justify-content:center; color:#64748b;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
        </div>
        <div style="font-size:16px; font-weight:700; color:#1e293b;">${tr('comboEmptyGroupsTitle')}</div>
        <div style="font-size:13.5px; color:#64748b; max-width:440px; line-height:1.5;">${tr('comboEmptyGroupsHelp')}</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap; justify-content:center; margin-top:4px;">
          <button type="button" class="btn btn-primary" onclick="comboWizardAddGroup('choice')" style="min-height:48px; padding:10px 22px; font-weight:700; border-radius:10px; font-size:14.5px; background:var(--primary, #00b900); color:#ffffff; border:1px solid var(--primary, #00b900); display:inline-flex; align-items:center; gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>${tr('comboAddChoice')}</span>
          </button>
        </div>
      </div>`;
    } else {
      const groupsHtml = groups
        .map((group, index) => {
          const search = menuState.comboWizard?.search?.[index] || '';
          const filter = menuState.comboWizard?.filters?.[index] || 'all';
          const visible = candidates.filter(
            item => (filter === 'all' || item.categoryId === filter) && item.name.toLowerCase().includes(search.toLowerCase())
          );
          const isChoice = group.type === 'choice';
          const badgeClass = isChoice ? 'badge-choice' : 'badge-fixed';
          const badgeText = tr(isChoice ? 'comboChoiceGroup' : 'comboFixedGroup');

          return `<section class="bundle-wizard-group">
          <header>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="bundle-group-badge ${badgeClass}">${badgeText}</span>
              <h2 style="margin:0; font-size:17px; font-weight:700;">${index + 1}. ${esc(comboGroupName(group)) || badgeText}</h2>
            </div>
            <button type="button" class="btn btn-ghost" style="color:#ef4444; min-height:36px; padding:4px 10px; font-weight:600;" onclick="comboWizardRemoveGroup(${index})">
              ${tr('comboRemove')}
            </button>
          </header>
          <p class="bundle-wizard-hint" style="margin:0; font-size:13px; color:#64748b;">${tr(group.type === 'fixed' ? 'comboFixedHelp' : 'comboChoiceHelp')}</p>
          <label>${tr('comboGroupName')}<input value="${esc(comboGroupName(group))}" placeholder="${badgeText}" oninput="comboWizardGroupField(${index},'name',this.value)"></label>
          ${isChoice ? `<div class="bundle-wizard-two"><label>${tr('comboQuantity')}<input type="number" min="1" value="${group.minQuantity}" onchange="comboWizardGroupField(${index},'minQuantity',this.value)"></label><label class="bundle-wizard-check"><input type="checkbox" ${group.allowRepeats ? 'checked' : ''} onchange="comboWizardGroupField(${index},'allowRepeats',this.checked)">${tr('comboRepeat')}</label></div>` : ''}
          <div class="bundle-wizard-two"><input id="combo-search-${index}" type="search" placeholder="${tr('comboSearch')}" value="${esc(search)}" oninput="comboWizardSearch(${index},this.value)"><select aria-label="${tr('comboFilterCategory')}" onchange="comboWizardFilter(${index},this.value)"><option value="all">${tr('comboAllCategories')}</option>${categories.map(cat => `<option value="${esc(cat.catId)}" ${filter === cat.catId ? 'selected' : ''}>${esc(cat.title)}</option>`).join('')}</select></div>
          <div class="bundle-wizard-candidates">${visible
            .map(item => {
              const selected = isComboItemSelected(group, item);
              const fixed = (group.items || []).find(f => f.itemId === item.id || f.itemId === item.name);
              const extra =
                fixed?.surcharge ?? group.surcharges?.[item.id] ?? (item.name ? group.surcharges?.[item.name] : 0) ?? 0;
              return `<div class="bundle-wizard-candidate"><label><input type="checkbox" ${selected ? 'checked' : ''} onchange="comboWizardToggleItem(${index},'${esc(item.id)}',this.checked)"><span>${esc(item.name)} · ${esc(item.categoryName)}</span></label>${selected ? `<label>${tr('comboSurcharge')}<input type="number" min="0" value="${extra}" onchange="comboWizardItemValue(${index},'${esc(item.id)}','surcharge',this.value)"></label>${fixed ? `<label>${tr('comboQuantity')}<input type="number" min="1" value="${fixed.quantity}" onchange="comboWizardItemValue(${index},'${esc(item.id)}','quantity',this.value)"></label>` : ''}` : ''}</div>`;
            })
            .join('')}</div>
          ${
            isChoice
              ? `<details><summary>${tr('comboWholeCategory')}</summary><p>${tr('comboWholeCategoryHelp')}</p>${categories
                  .map(cat => {
                    const catKey = cat.catId || cat.id;
                    const isCatChecked = (group.sources || []).some(
                      src =>
                        src.type === 'category' &&
                        (src.refId === cat.catId ||
                          src.categoryId === cat.catId ||
                          src.refId === cat.id ||
                          src.categoryId === cat.id ||
                          Boolean(cat.databaseId && (src.refId === cat.databaseId || src.categoryId === cat.databaseId)))
                    );
                    return `<label class="bundle-wizard-check"><input type="checkbox" ${isCatChecked ? 'checked' : ''} onchange="comboWizardToggleCategory(${index},'${esc(catKey)}',this.checked)">${esc(cat.title)}</label>`;
                  })
                  .join('')}</details>`
              : ''
          }
        </section>`;
        })
        .join('');

      contentHtml =
        groupsHtml +
        `<div class="bundle-wizard-add" style="margin-top:16px;">
        <button type="button" class="btn btn-primary" onclick="comboWizardAddGroup('choice')" style="min-height:48px; padding:10px 22px; font-weight:700; border-radius:10px; font-size:14.5px; background:var(--primary, #00b900); color:#ffffff; border:1px solid var(--primary, #00b900); display:inline-flex; align-items:center; gap:8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span>${tr('comboAddChoice')}</span>
        </button>
      </div>`;
    }

    body.innerHTML = guideHeader + contentHtml;
  } else {
    const error = comboWizardError();
    menuState.comboWizard.preview = menuState.comboWizard.preview || {};
    const candidates = comboCatalogItems();
    let previewExtra = 0;
    let complete = true;
    const sections = comboGroups()
      .map((group, index) => {
        const name = esc(comboGroupName(group));
        if (group.type === 'fixed') {
          const details = (group.items || [])
            .map(fixed => {
              const item = candidates.find(candidate => candidate.id === fixed.itemId);
              previewExtra += Number(fixed.surcharge || 0) * Number(fixed.quantity || 1);
              return `<div>${esc(item?.name || fixed.itemId)} ×${fixed.quantity} · ${Number(fixed.surcharge) ? `+$${fixed.surcharge}` : tr('comboIncluded')}</div>`;
            })
            .join('');
          return `<section><h3>${name}</h3>${details}</section>`;
        }
        const eligible = [...new Set(candidates.filter(item => isComboItemSelected(group, item)).map(item => item.id))];
        const previewMap = menuState.comboWizard?.preview;
        const chosen = ((previewMap && previewMap[group.id]) || []).filter(id => eligible.includes(id));
        if (previewMap) previewMap[group.id] = chosen;
        if (chosen.length < Number(group.minQuantity) || chosen.length > Number(group.maxQuantity)) complete = false;
        chosen.forEach(id => {
          previewExtra += Number(group.surcharges?.[id] || 0);
        });
        const controls = eligible
          .map(id => {
            const item = candidates.find(candidate => candidate.id === id);
            if (!item) return '';
            const count = chosen.filter(value => value === id).length;
            const extra = Number(group.surcharges?.[id] || 0);
            return `<div class="bundle-wizard-preview-choice"><span>${esc(item.name)} · ${extra ? `+$${extra}` : tr('comboIncluded')}</span>${count ? `<button type="button" onclick="comboWizardPreviewPick(${index},'${esc(id)}',-1)" aria-label="${tr('comboRemove')}">−</button>` : ''}<strong>${count || ''}</strong><button type="button" onclick="comboWizardPreviewPick(${index},'${esc(id)}',1)" ${chosen.length >= Number(group.maxQuantity) && Number(group.maxQuantity) !== 1 ? 'disabled' : ''}>${Number(group.maxQuantity) === 1 ? tr('comboSelect') : '+'}</button></div>`;
          })
          .join('');
        return `<section><h3>${name} · ${chosen.length}/${group.minQuantity}</h3>${controls}</section>`;
      })
      .join('');
    body.innerHTML = `<div class="bundle-wizard-preview"><h2>${esc(product.name)} · $${Number(product.price) + previewExtra}</h2>${sections}<p>${tr(complete ? 'comboPreviewComplete' : 'comboPreviewIncomplete')}</p></div>${error ? `<p class="bundle-wizard-error">${esc(error)}</p>` : ''}`;
  }
}

export async function saveComboWizard(): Promise<void> {
  if (!menuState.comboWizard) return;
  const error = comboWizardError();
  const errEl = document.getElementById('bundle-wizard-error');
  if (error) {
    if (errEl) errEl.textContent = error;
    return;
  }
  const btn = document.getElementById('bundle-wizard-next') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  try {
    const draftKey = comboDraftKey();
    const tenantId = resolveTenantId();
    const workerBase = resolveWorkerBase();
    const response = await menuApiFetch(`${workerBase}/api/menu/bundles?tenant_id=${encodeURIComponent(tenantId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: menuState.comboWizard.product, config: menuState.comboWizard.config })
    });
    const result = (await response.json()) as { success?: boolean; error?: string; product?: { id?: string } };
    if (!response.ok || !result.success) throw new Error(result.error || tr('comboSaveFailed'));
    localStorage.removeItem(draftKey);
    menuState.comboWizard.product.id = result.product?.id || null;
    if (menuState.comboWizard.imageDataUri) {
      const category = (menuState.currentMenuData || []).find(
        cat => cat.catId === menuState.comboWizard?.product.categoryId
      );
      const name = `${category?.id || menuState.comboWizard.product.categoryId}_${menuState.comboWizard.product.name}`;
      const imageResponse = await menuApiFetch(`${workerBase}/api/image?tenant_id=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, dataUri: menuState.comboWizard.imageDataUri })
      });
      if (!imageResponse.ok) throw new Error(`${tr('comboSaved')} · ${tr('imageUploadFail')}`);
    }
    dismissComboWizard(true);
    await invokeHook('loadMenuData', loadMenuData);
    alert(tr('comboSaved'));
    if (menuState.hubModalReturnState) {
      const state = menuState.hubModalReturnState;
      menuState.hubModalReturnState = null;
      if (Array.isArray(menuState.currentMenuData)) {
        const freshCatIdx = menuState.currentMenuData.findIndex(c => c.id === state.catId);
        if (freshCatIdx !== -1) {
          const freshItemIdx = menuState.currentMenuData[freshCatIdx]?.items?.findIndex(
            it => it.name === state.itemName
          );
          if (freshItemIdx !== undefined && freshItemIdx !== -1) {
            invokeHook('openItemDetailModal', () => undefined, freshCatIdx, freshItemIdx);
          }
        }
      }
    }
  } catch (err) {
    if (errEl) {
      errEl.textContent = (err instanceof Error ? err.message : String(err)) || tr('comboSaveFailed');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function comboWizardJumpToStep(targetStep: number): void {
  if (!menuState.comboWizard) return;
  if (targetStep === menuState.comboWizard.step) return;

  if (targetStep < menuState.comboWizard.step) {
    menuState.comboWizard.step = targetStep;
    persistComboWizard();
    renderComboWizard();
    return;
  }

  const errEl = document.getElementById('bundle-wizard-error');
  if (menuState.comboWizard.step === 0 || targetStep > 0) {
    if (!menuState.comboWizard.product.name.trim()) {
      if (errEl) errEl.textContent = tr('comboNeedName');
      return;
    }
    if (!Number.isFinite(menuState.comboWizard.product.price) || menuState.comboWizard.product.price < 0) {
      if (errEl) errEl.textContent = tr('comboNeedPrice');
      return;
    }
  }

  if (targetStep === 2) {
    const error = comboWizardError();
    if (error) {
      if (errEl) errEl.textContent = error;
      return;
    }
  }

  menuState.comboWizard.step = targetStep;
  persistComboWizard();
  renderComboWizard();
}
