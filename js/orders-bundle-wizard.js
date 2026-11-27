/* Three-step menu combo editor. Existing bundle rules remain readable. */
let comboWizard = null;
const comboEscape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const comboText = key => t(key);
const comboGroups = () => comboWizard?.config.groups || [];
const comboDraftKey = () => `bundle_wizard:${getTenantIdFromUrl()}:${comboWizard.product.id || 'new'}`;
const comboCatalogItems = () => (currentMenuData || []).filter(cat => cat.type === 'catalog').flatMap(cat => (cat.items || []).filter(item => {
  if (!item || (!item.id && !item.name)) return false;
  if (comboWizard?.product?.id && item.id === comboWizard.product.id) return false;
  if (!comboWizard?.product?.id && comboWizard?.product?.name && item.name === comboWizard.product.name) return false;
  if (item.bundleRule && item.bundleRule.groups?.length > 0) return false;
  return true;
}).map(item => ({
  id: item.id || item.name,
  name: item.name,
  categoryId: cat.catId || cat.id,
  categoryName: cat.title,
  rawCategoryId: cat.id,
  databaseId: cat.databaseId
})));

// Determine whether a menu item belongs to a combo group
function isComboItemSelected(group, item) {
  if (!group || !item) return false;
  const itemId = item.id;
  const itemName = item.name;

  // 1. Fixed group check
  if (group.type === 'fixed') {
    return Array.isArray(group.items) && group.items.some(f => f.itemId === itemId || (itemName && f.itemId === itemName));
  }

  // 2. Choice group sources check
  if (Array.isArray(group.sources)) {
    for (const src of group.sources) {
      if (src.type === 'item_list' || src.type === 'items') {
        if (Array.isArray(src.itemIds) && (src.itemIds.includes(itemId) || (itemName && src.itemIds.includes(itemName)))) {
          return true;
        }
      }
      if (src.type === 'category') {
        const catKey = src.refId || src.categoryId;
        if (catKey) {
          const cat = (currentMenuData || []).find(c => c.catId === catKey || c.id === catKey || (c.databaseId && c.databaseId === catKey));
          if (cat) {
            if (item.categoryId === cat.catId || item.categoryId === cat.id || item.categoryId === cat.databaseId ||
                item.rawCategoryId === cat.id || (cat.databaseId && item.databaseId === cat.databaseId)) {
              return true;
            }
          } else if (item.categoryId === catKey || item.rawCategoryId === catKey) {
            return true;
          }
        }
      }
    }
  }

  // 3. Fallback: check group.items (if choice group was loaded with items array)
  if (Array.isArray(group.items) && group.items.some(f => f.itemId === itemId || (itemName && f.itemId === itemName))) {
    return true;
  }

  // 4. Fallback: check group.eligibleItems if loaded from D1 bootstrap
  if (Array.isArray(group.eligibleItems) && group.eligibleItems.some(e => e.id === itemId || (itemName && e.name === itemName) || (e.itemId && (e.itemId === itemId || e.itemId === itemName)))) {
    return true;
  }

  return false;
}

// Keep the legacy API label fields synchronized with the single editable name.
const comboLabel = (zh, vi) => { const name = currentLang === 'vi' ? vi : zh; return { 'zh-TW': name, vi: name }; };
const comboRandomUuid = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
  ? crypto.randomUUID()
  : `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const comboGroupName = group => typeof group.label === 'string' ? group.label : (group.label?.[currentLang] || group.name || group.label?.['zh-TW'] || group.label?.vi || '');
function comboSetGroupName(group, name) { group.name = name; group.label = { 'zh-TW': name, vi: name }; }
const comboNewGroup = type => ({ id: `group_${comboRandomUuid()}`, type, label: comboLabel(type === 'fixed' ? '固定內容' : '自選餐點', type === 'fixed' ? 'Món có sẵn' : 'Món tự chọn'), minQuantity: 1, maxQuantity: 1, allowRepeats: false, sources: [], items: [], surcharges: {} });

function persistComboWizard() {
  if (!comboWizard) return;
  comboWizard.changed = true;
  localStorage.setItem(comboDraftKey(), JSON.stringify({ product: comboWizard.product, config: comboWizard.config, step: comboWizard.step }));
}

function openBundleWizard(catIndex = activeCategoryIndex, itemIndex = null) {
  if (window.currentTenantFeatures?.includes('disable_bundle_builder_v2')) return;
  if (typeof syncMenuDataFromDOM === 'function') syncMenuDataFromDOM();
  if (!currentMenuData?.[catIndex] || currentMenuData[catIndex].type !== 'catalog') return;
  const cat = currentMenuData[catIndex];
  const item = itemIndex === null ? null : cat.items[itemIndex];
  const product = { id: item?.id || null, categoryId: cat.catId || cat.id, name: item?.name || '', price: Number(item?.price || 0) };
  const config = item?.bundleRule?.groups?.length ? {
    version: 2,
    groups: item.bundleRule.groups.map(group => {
      const grpType = group.type || 'choice';
      let sources = Array.isArray(group.sources) ? JSON.parse(JSON.stringify(group.sources)) : [];
      let items = Array.isArray(group.items) ? JSON.parse(JSON.stringify(group.items)) : [];
      let surcharges = group.surcharges && typeof group.surcharges === 'object' ? { ...group.surcharges } : {};

      // Normalize sources: If empty, populate from eligibleItems or items
      if (sources.length === 0) {
        if (Array.isArray(group.eligibleItems) && group.eligibleItems.length > 0) {
          sources.push({
            type: 'item_list',
            itemIds: group.eligibleItems.map(it => it.id || it.itemId || it.name).filter(Boolean)
          });
        } else if (items.length > 0 && grpType !== 'fixed') {
          sources.push({
            type: 'item_list',
            itemIds: items.map(it => it.itemId || it.id || it.name).filter(Boolean)
          });
        }
      }

      // Normalize any item_list sources so they match catalog items
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

      return {
        id: group.id || `group_${comboRandomUuid()}`,
        type: grpType,
        label: comboGroupName(group),
        name: comboGroupName(group),
        minQuantity: Number(group.minQuantity || 1),
        maxQuantity: Number(group.maxQuantity || group.minQuantity || 1),
        allowRepeats: Boolean(group.allowRepeats),
        sources,
        items,
        surcharges
      };
    })
  } : { version: 2, groups: [] };
  comboWizard = { product, config, step: 0, changed: false, returnFocus: document.activeElement };
  try {
    const draftKey = comboDraftKey();
    localStorage.removeItem(draftKey);
  } catch (e) {}
  comboGroups().forEach(group => comboSetGroupName(group, comboGroupName(group)));
  document.body.classList.add('bundle-wizard-open');
  document.getElementById('bundle-wizard').style.display = 'flex';
  renderComboWizard();
  document.getElementById('bundle-wizard-title').focus();
}
window.openBundleWizard = openBundleWizard;

function closeBundleWizard() {
  if (!comboWizard) return;
  try {
    const draftKey = comboDraftKey();
    localStorage.removeItem(draftKey);
  } catch (e) {}
  dismissComboWizard();
}
window.closeBundleWizard = closeBundleWizard;
function dismissComboWizard(skipRestore = false) {
  const returnFocus = comboWizard?.returnFocus;
  document.getElementById('bundle-wizard').style.display = 'none';
  document.body.classList.remove('bundle-wizard-open');
  comboWizard = null;
  returnFocus?.focus();
  if (!skipRestore && window._hubModalReturnState) {
    const state = window._hubModalReturnState;
    window._hubModalReturnState = null;
    if (typeof openItemDetailModal === 'function') {
      openItemDetailModal(state.catIdx, state.itemIdx);
    }
  }
}

function comboWizardBack() { if (comboWizard?.step > 0) { comboWizard.step--; persistComboWizard(); renderComboWizard(); } }
window.bundleWizardBack = comboWizardBack;
function comboWizardField(field, value) { comboWizard.product[field] = field === 'price' ? Number(value) : value; persistComboWizard(); }
window.comboWizardField = comboWizardField;
function comboWizardImage(event) {
  const file = event.target.files?.[0];
  if (!file || !comboWizard) return;
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      if (!comboWizard) return;
      const scale = Math.min(1, 800 / image.width, 800 / image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      comboWizard.imageDataUri = canvas.toDataURL('image/webp', 0.8);
      persistComboWizard();
      renderComboWizard();
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}
window.comboWizardImage = comboWizardImage;
function comboWizardGroupField(index, field, value) {
  const group = comboGroups()[index]; if (!group) return;
  if (field === 'name') comboSetGroupName(group, value);
  else if (field === 'minQuantity') { group.minQuantity = Math.max(1, Number(value)); group.maxQuantity = group.minQuantity; }
  else if (field === 'allowRepeats') group.allowRepeats = Boolean(value);
  persistComboWizard();
}
window.comboWizardGroupField = comboWizardGroupField;

function comboWizardTemplate(kind) {
  if (comboGroups().length && !confirm(comboText('comboReplaceTemplate'))) return;
  const newChoice = (zh, vi) => { const group = comboNewGroup('choice'); group.label = comboLabel(zh, vi); return group; };
  if (kind === 'meal') comboWizard.config.groups = [newChoice('選擇主餐', 'Chọn món chính'), newChoice('選擇飲料', 'Chọn đồ uống')];
  if (kind === 'many') { const group = newChoice('任選餐點', 'Chọn món'); group.minQuantity = group.maxQuantity = 2; comboWizard.config.groups = [group]; }
  if (kind === 'fixed') { const group = comboNewGroup('fixed'); group.label = comboLabel('套餐內容', 'Món trong combo'); comboWizard.config.groups = [group]; }
  comboWizard.preview = {}; comboWizard.search = {}; comboWizard.filters = {};
  persistComboWizard(); renderComboWizard();
  document.querySelector('.bundle-wizard-group input')?.focus();
}
window.comboWizardTemplate = comboWizardTemplate;
function comboWizardAddGroup(type) {
  comboGroups().push(comboNewGroup(type));
  persistComboWizard();
  renderComboWizard();
  setTimeout(() => {
    const groups = document.querySelectorAll('.bundle-wizard-group');
    if (groups.length) {
      const last = groups[groups.length - 1];
      last.scrollIntoView({ behavior: 'smooth', block: 'center' });
      last.querySelector('input')?.focus();
    }
  }, 40);
}
window.comboWizardAddGroup = comboWizardAddGroup;
function comboWizardRemoveGroup(index) { comboGroups().splice(index, 1); persistComboWizard(); renderComboWizard(); }
window.comboWizardRemoveGroup = comboWizardRemoveGroup;

function comboWizardToggleItem(index, itemId, checked) {
  const group = comboGroups()[index];
  if (!group) return;
  const candidates = comboCatalogItems();
  const targetItem = candidates.find(c => c.id === itemId || c.name === itemId);

  if (group.type === 'fixed') {
    group.items = (group.items || []).filter(item => item.itemId !== itemId && (!targetItem || item.itemId !== targetItem.name));
    if (checked) group.items.push({ itemId, quantity: 1, surcharge: 0 });
  } else {
    // If the group had category sources, expand them into item_list before toggling single item
    const catSources = (group.sources || []).filter(s => s.type === 'category');
    if (catSources.length > 0) {
      let itemListSrc = group.sources.find(s => s.type === 'item_list');
      if (!itemListSrc) {
        itemListSrc = { type: 'item_list', itemIds: [] };
        group.sources.push(itemListSrc);
      }
      candidates.forEach(cand => {
        if (isComboItemSelected(group, cand)) {
          if (!itemListSrc.itemIds.includes(cand.id)) {
            itemListSrc.itemIds.push(cand.id);
          }
        }
      });
      group.sources = group.sources.filter(s => s.type !== 'category');
    }

    let source = group.sources.find(src => src.type === 'item_list');
    if (!source) { source = { type: 'item_list', itemIds: [] }; group.sources.push(source); }
    source.itemIds = source.itemIds.filter(id => id !== itemId && (!targetItem || id !== targetItem.name));
    if (checked) source.itemIds.push(itemId);
    if (!checked) {
      delete group.surcharges[itemId];
      if (targetItem) delete group.surcharges[targetItem.name];
    }
  }
  persistComboWizard(); renderComboWizard();
}
window.comboWizardToggleItem = comboWizardToggleItem;
function comboWizardToggleCategory(index, categoryId, checked) {
  const group = comboGroups()[index];
  if (!group) return;
  const targetCat = (currentMenuData || []).find(c => c.catId === categoryId || c.id === categoryId || (c.databaseId && c.databaseId === categoryId));
  const catKeys = [categoryId];
  if (targetCat) {
    if (targetCat.catId) catKeys.push(targetCat.catId);
    if (targetCat.id) catKeys.push(targetCat.id);
    if (targetCat.databaseId) catKeys.push(targetCat.databaseId);
  }
  group.sources = (group.sources || []).filter(source => !(source.type === 'category' && catKeys.includes(source.refId || source.categoryId)));
  if (checked) group.sources.push({ type: 'category', refId: categoryId, categoryId: categoryId });
  persistComboWizard(); renderComboWizard();
}
window.comboWizardToggleCategory = comboWizardToggleCategory;
function comboWizardItemValue(index, itemId, field, value) {
  const group = comboGroups()[index];
  if (group.type === 'fixed') {
    const item = group.items.find(candidate => candidate.itemId === itemId);
    if (item) item[field] = Number(value);
  } else group.surcharges[itemId] = Number(value);
  persistComboWizard();
}
window.comboWizardItemValue = comboWizardItemValue;
function comboWizardSearch(index, value) { comboWizard.search = comboWizard.search || {}; comboWizard.search[index] = value; renderComboWizard(); document.getElementById(`combo-search-${index}`)?.focus(); }
window.comboWizardSearch = comboWizardSearch;
function comboWizardFilter(index, categoryId) { comboWizard.filters = comboWizard.filters || {}; comboWizard.filters[index] = categoryId; renderComboWizard(); }
window.comboWizardFilter = comboWizardFilter;
function comboWizardPreviewPick(index, itemId, change) {
  const group = comboGroups()[index];
  if (!group || group.type !== 'choice') return;
  comboWizard.preview = comboWizard.preview || {};
  const chosen = comboWizard.preview[group.id] || [];
  if (Number(group.maxQuantity) === 1 && change > 0) comboWizard.preview[group.id] = [itemId];
  else if (change < 0) { const at = chosen.lastIndexOf(itemId); if (at >= 0) chosen.splice(at, 1); comboWizard.preview[group.id] = chosen; }
  else if (chosen.length < Number(group.maxQuantity) && (group.allowRepeats || !chosen.includes(itemId))) { chosen.push(itemId); comboWizard.preview[group.id] = chosen; }
  renderComboWizard();
}
window.comboWizardPreviewPick = comboWizardPreviewPick;

function comboWizardError() {
  const p = comboWizard.product;
  if (!p.name.trim()) return comboText('comboNeedName');
  if (!Number.isFinite(p.price) || p.price < 0) return comboText('comboNeedPrice');
  if (!comboGroups().length) return comboText('comboNeedGroup');
  const candidates = comboCatalogItems();
  const validIds = new Set(candidates.map(item => item.id));
  for (let i = 0; i < comboGroups().length; i++) {
    const group = comboGroups()[i];
    if (!comboGroupName(group).trim()) return `${i + 1}: ${comboText('comboNeedGroupName')}`;
    if (group.type === 'fixed') {
      if (!group.items.length || new Set(group.items.map(item => item.itemId)).size !== group.items.length || group.items.some(item => !validIds.has(item.itemId) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || !Number.isFinite(Number(item.surcharge)) || Number(item.surcharge) < 0)) return `${i + 1}: ${comboText('comboNeedItems')}`;
    } else {
      const eligible = new Set(candidates.filter(item => isComboItemSelected(group, item)).map(item => item.id));
      if (!Number.isInteger(Number(group.minQuantity)) || Number(group.minQuantity) < 1 || eligible.size < 1 || (!group.allowRepeats && eligible.size < group.minQuantity) || Object.values(group.surcharges).some(value => !Number.isFinite(Number(value)) || Number(value) < 0)) return `${i + 1}: ${comboText('comboNeedItems')}`;
    }
  }
  return '';
}

function comboWizardNext() {
  if (!comboWizard) return;
  const error = comboWizard.step === 0 ? (!comboWizard.product.name.trim() ? comboText('comboNeedName') : !Number.isFinite(comboWizard.product.price) || comboWizard.product.price < 0 ? comboText('comboNeedPrice') : '') : comboWizard.step === 1 ? comboWizardError() : '';
  document.getElementById('bundle-wizard-error').textContent = error;
  if (error) return;
  if (comboWizard.step < 2) { comboWizard.step++; persistComboWizard(); renderComboWizard(); return; }
  saveComboWizard();
}
window.bundleWizardNext = comboWizardNext;

function renderComboWizard() {
  if (!comboWizard) return;
  const { product, step } = comboWizard;
  document.getElementById('bundle-wizard-steps').setAttribute('aria-label', comboText('comboStepsLabel'));
  document.getElementById('bundle-wizard-error').textContent = '';
  document.getElementById('bundle-wizard-title').textContent = product.id ? comboText('comboEditTitle') : comboText('comboCreateTitle');
  document.getElementById('bundle-wizard-close').textContent = comboText('comboClose');
  document.getElementById('bundle-wizard-prev').textContent = comboText('comboBack');
  document.getElementById('bundle-wizard-prev').disabled = step === 0;
  document.getElementById('bundle-wizard-next').textContent = comboText(step === 2 ? 'comboSave' : 'comboContinue');
  renderBundleStepper(step);
  const body = document.getElementById('bundle-wizard-body');
  if (comboWizard.renderedStep !== step) body.scrollTop = 0;
  comboWizard.renderedStep = step;
  if (step === 0) {
    body.innerHTML = `<aside class="bundle-wizard-guide"><h2>${comboText('comboWhatTitle')}</h2><p>${comboText('comboWhatBody')}</p><p>${comboText('comboPriceHelp')}</p><p>${comboText('comboSetupHelp')}</p></aside><div class="bundle-wizard-info-fields"><label>${comboText('comboProductName')}<input type="text" value="${comboEscape(product.name)}" oninput="comboWizardField('name',this.value)"></label>
      <label>${comboText('comboBasePrice')}<input type="number" min="0" step="1" value="${product.price}" oninput="comboWizardField('price',this.value)"></label>
      <label>${comboText('comboCategory')}<select onchange="comboWizardField('categoryId',this.value)">${currentMenuData.filter(cat => cat.type === 'catalog').map(cat => `<option value="${comboEscape(cat.catId)}" ${cat.catId === product.categoryId ? 'selected' : ''}>${comboEscape(cat.title)}</option>`).join('')}</select></label>
      <label>${comboText('comboImage')}<input type="file" accept="image/*" onchange="comboWizardImage(event)"></label>
      ${comboWizard.imageDataUri ? `<img src="${comboWizard.imageDataUri}" alt="${comboText('comboImage')}" class="bundle-wizard-image-preview">` : ''}
      ${product.id ? `<button type="button" class="btn btn-ghost" onclick="openImageModal('${comboEscape(currentMenuData.find(cat => cat.catId === product.categoryId)?.id || '')}','${comboEscape(product.name)}')">${comboText('comboImage')}</button>` : ''}</div>`;
  } else if (step === 1) {
    const candidates = comboCatalogItems();
    const categories = currentMenuData.filter(cat => cat.type === 'catalog');
    const groups = comboGroups();

    const guideHeader = `<section class="bundle-wizard-guide">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
        <div>
          <h2 style="margin:0 0 6px; font-size:18px; color:#0f172a;">${comboText('comboPartsTitle')}</h2>
          <p style="margin:0; font-size:13.5px; color:#475569; line-height:1.5;">${comboText('comboPartsHelp')}</p>
        </div>
        ${groups.length ? `
          <div style="display:flex; gap:8px; flex-shrink:0;">
            <button type="button" class="btn btn-primary" onclick="comboWizardAddGroup('choice')" style="font-weight:700; font-size:13px; min-height:44px; padding:8px 16px; border-radius:8px; background:var(--primary, #00b900); color:#ffffff; border:1px solid var(--primary, #00b900); display:inline-flex; align-items:center; gap:6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>${comboText('comboAddChoice')}</span>
            </button>
          </div>
        ` : ''}
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
        <div style="font-size:16px; font-weight:700; color:#1e293b;">${comboText('comboEmptyGroupsTitle')}</div>
        <div style="font-size:13.5px; color:#64748b; max-width:440px; line-height:1.5;">${comboText('comboEmptyGroupsHelp')}</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap; justify-content:center; margin-top:4px;">
          <button type="button" class="btn btn-primary" onclick="comboWizardAddGroup('choice')" style="min-height:48px; padding:10px 22px; font-weight:700; border-radius:10px; font-size:14.5px; background:var(--primary, #00b900); color:#ffffff; border:1px solid var(--primary, #00b900); display:inline-flex; align-items:center; gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>${comboText('comboAddChoice')}</span>
          </button>
        </div>
      </div>`;
    } else {
      const groupsHtml = groups.map((group, index) => {
        const search = comboWizard.search?.[index] || '';
        const filter = comboWizard.filters?.[index] || 'all';
        const visible = candidates.filter(item => (filter === 'all' || item.categoryId === filter) && item.name.toLowerCase().includes(search.toLowerCase()));
        const isChoice = group.type === 'choice';
        const badgeClass = isChoice ? 'badge-choice' : 'badge-fixed';
        const badgeText = comboText(isChoice ? 'comboChoiceGroup' : 'comboFixedGroup');

        return `<section class="bundle-wizard-group">
          <header>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="bundle-group-badge ${badgeClass}">${badgeText}</span>
              <h2 style="margin:0; font-size:17px; font-weight:700;">${index + 1}. ${comboEscape(comboGroupName(group)) || badgeText}</h2>
            </div>
            <button type="button" class="btn btn-ghost" style="color:#ef4444; min-height:36px; padding:4px 10px; font-weight:600;" onclick="comboWizardRemoveGroup(${index})">
              ${comboText('comboRemove')}
            </button>
          </header>
          <p class="bundle-wizard-hint" style="margin:0; font-size:13px; color:#64748b;">${comboText(group.type === 'fixed' ? 'comboFixedHelp' : 'comboChoiceHelp')}</p>
          <label>${comboText('comboGroupName')}<input value="${comboEscape(comboGroupName(group))}" placeholder="${badgeText}" oninput="comboWizardGroupField(${index},'name',this.value)"></label>
          ${isChoice ? `<div class="bundle-wizard-two"><label>${comboText('comboQuantity')}<input type="number" min="1" value="${group.minQuantity}" onchange="comboWizardGroupField(${index},'minQuantity',this.value)"></label><label class="bundle-wizard-check"><input type="checkbox" ${group.allowRepeats ? 'checked' : ''} onchange="comboWizardGroupField(${index},'allowRepeats',this.checked)">${comboText('comboRepeat')}</label></div>` : ''}
          <div class="bundle-wizard-two"><input id="combo-search-${index}" type="search" placeholder="${comboText('comboSearch')}" value="${comboEscape(search)}" oninput="comboWizardSearch(${index},this.value)"><select aria-label="${comboText('comboFilterCategory')}" onchange="comboWizardFilter(${index},this.value)"><option value="all">${comboText('comboAllCategories')}</option>${categories.map(cat => `<option value="${comboEscape(cat.catId)}" ${filter === cat.catId ? 'selected' : ''}>${comboEscape(cat.title)}</option>`).join('')}</select></div>
          <div class="bundle-wizard-candidates">${visible.map(item => {
            const selected = isComboItemSelected(group, item);
            const fixed = (group.items || []).find(f => f.itemId === item.id || f.itemId === item.name);
            const extra = fixed?.surcharge ?? group.surcharges[item.id] ?? (item.name ? group.surcharges[item.name] : 0) ?? 0;
            return `<div class="bundle-wizard-candidate"><label><input type="checkbox" ${selected ? 'checked' : ''} onchange="comboWizardToggleItem(${index},'${comboEscape(item.id)}',this.checked)"><span>${comboEscape(item.name)} · ${comboEscape(item.categoryName)}</span></label>${selected ? `<label>${comboText('comboSurcharge')}<input type="number" min="0" value="${extra}" onchange="comboWizardItemValue(${index},'${comboEscape(item.id)}','surcharge',this.value)"></label>${fixed ? `<label>${comboText('comboQuantity')}<input type="number" min="1" value="${fixed.quantity}" onchange="comboWizardItemValue(${index},'${comboEscape(item.id)}','quantity',this.value)"></label>` : ''}` : ''}</div>`;
          }).join('')}</div>
          ${isChoice ? `<details><summary>${comboText('comboWholeCategory')}</summary><p>${comboText('comboWholeCategoryHelp')}</p>${categories.map(cat => {
            const catKey = cat.catId || cat.id;
            const isCatChecked = (group.sources || []).some(src => src.type === 'category' && (
              src.refId === cat.catId || src.categoryId === cat.catId ||
              src.refId === cat.id || src.categoryId === cat.id ||
              (cat.databaseId && (src.refId === cat.databaseId || src.categoryId === cat.databaseId))
            ));
            return `<label class="bundle-wizard-check"><input type="checkbox" ${isCatChecked ? 'checked' : ''} onchange="comboWizardToggleCategory(${index},'${comboEscape(catKey)}',this.checked)">${comboEscape(cat.title)}</label>`;
          }).join('')}</details>` : ''}
        </section>`;
      }).join('');

      contentHtml = groupsHtml + `<div class="bundle-wizard-add" style="margin-top:16px;">
        <button type="button" class="btn btn-primary" onclick="comboWizardAddGroup('choice')" style="min-height:48px; padding:10px 22px; font-weight:700; border-radius:10px; font-size:14.5px; background:var(--primary, #00b900); color:#ffffff; border:1px solid var(--primary, #00b900); display:inline-flex; align-items:center; gap:8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span>${comboText('comboAddChoice')}</span>
        </button>
      </div>`;
    }

    body.innerHTML = guideHeader + contentHtml;
  } else {
    const error = comboWizardError();
    comboWizard.preview = comboWizard.preview || {};
    const candidates = comboCatalogItems();
    let previewExtra = 0;
    let complete = true;
    const sections = comboGroups().map((group, index) => {
      const name = comboEscape(comboGroupName(group));
      if (group.type === 'fixed') {
        const details = group.items.map(fixed => {
          const item = candidates.find(candidate => candidate.id === fixed.itemId);
          previewExtra += Number(fixed.surcharge || 0) * Number(fixed.quantity || 1);
          return `<div>${comboEscape(item?.name || fixed.itemId)} ×${fixed.quantity} · ${Number(fixed.surcharge) ? `+$${fixed.surcharge}` : comboText('comboIncluded')}</div>`;
        }).join('');
        return `<section><h3>${name}</h3>${details}</section>`;
      }
      const eligible = [...new Set(candidates.filter(item => isComboItemSelected(group, item)).map(item => item.id))];
      const chosen = (comboWizard.preview[group.id] || []).filter(id => eligible.includes(id));
      comboWizard.preview[group.id] = chosen;
      if (chosen.length < Number(group.minQuantity) || chosen.length > Number(group.maxQuantity)) complete = false;
      chosen.forEach(id => { previewExtra += Number(group.surcharges[id] || 0); });
      const controls = eligible.map(id => {
        const item = candidates.find(candidate => candidate.id === id);
        if (!item) return '';
        const count = chosen.filter(value => value === id).length;
        const extra = Number(group.surcharges[id] || 0);
        return `<div class="bundle-wizard-preview-choice"><span>${comboEscape(item.name)} · ${extra ? `+$${extra}` : comboText('comboIncluded')}</span>${count ? `<button type="button" onclick="comboWizardPreviewPick(${index},'${comboEscape(id)}',-1)" aria-label="${comboText('comboRemove')}">−</button>` : ''}<strong>${count || ''}</strong><button type="button" onclick="comboWizardPreviewPick(${index},'${comboEscape(id)}',1)" ${chosen.length >= Number(group.maxQuantity) && Number(group.maxQuantity) !== 1 ? 'disabled' : ''}>${Number(group.maxQuantity) === 1 ? comboText('comboSelect') : '+'}</button></div>`;
      }).join('');
      return `<section><h3>${name} · ${chosen.length}/${group.minQuantity}</h3>${controls}</section>`;
    }).join('');
    body.innerHTML = `<div class="bundle-wizard-preview"><h2>${comboEscape(product.name)} · $${Number(product.price) + previewExtra}</h2>${sections}<p>${comboText(complete ? 'comboPreviewComplete' : 'comboPreviewIncomplete')}</p></div>${error ? `<p class="bundle-wizard-error">${comboEscape(error)}</p>` : ''}`;
  }
}

async function saveComboWizard() {
  const error = comboWizardError();
  if (error) { document.getElementById('bundle-wizard-error').textContent = error; return; }
  const btn = document.getElementById('bundle-wizard-next');
  btn.disabled = true;
  try {
    const draftKey = comboDraftKey();
    const response = await fetch(`${WORKER_BASE}/api/menu/bundles?tenant_id=${encodeURIComponent(getTenantIdFromUrl())}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: comboWizard.product, config: comboWizard.config })
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || comboText('comboSaveFailed'));
    localStorage.removeItem(draftKey);
    comboWizard.product.id = result.product.id;
    if (comboWizard.imageDataUri) {
      const category = currentMenuData.find(cat => cat.catId === comboWizard.product.categoryId);
      const name = `${category?.id || comboWizard.product.categoryId}_${comboWizard.product.name}`;
      const imageResponse = await fetch(`${WORKER_BASE}/api/image?tenant_id=${encodeURIComponent(getTenantIdFromUrl())}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, dataUri: comboWizard.imageDataUri })
      });
      if (!imageResponse.ok) throw new Error(`${comboText('comboSaved')} · ${comboText('imageUploadFail')}`);
    }
    dismissComboWizard(true);
    await loadMenuData();
    alert(comboText('comboSaved'));
    if (window._hubModalReturnState) {
      const state = window._hubModalReturnState;
      window._hubModalReturnState = null;
      if (Array.isArray(currentMenuData) && typeof openItemDetailModal === 'function') {
        const freshCatIdx = currentMenuData.findIndex(c => c.id === state.catId);
        if (freshCatIdx !== -1) {
          const freshItemIdx = currentMenuData[freshCatIdx].items?.findIndex(it => it.name === state.itemName);
          if (freshItemIdx !== -1) {
            openItemDetailModal(freshCatIdx, freshItemIdx);
          }
        }
      }
    }
  } catch (error) {
    document.getElementById('bundle-wizard-error').textContent = error.message || comboText('comboSaveFailed');
  } finally { btn.disabled = false; }
}

function comboWizardJumpToStep(targetStep) {
  if (!comboWizard) return;
  if (targetStep === comboWizard.step) return;

  if (targetStep < comboWizard.step) {
    comboWizard.step = targetStep;
    persistComboWizard();
    renderComboWizard();
    return;
  }

  if (comboWizard.step === 0 || targetStep > 0) {
    if (!comboWizard.product.name.trim()) {
      document.getElementById('bundle-wizard-error').textContent = comboText('comboNeedName');
      return;
    }
    if (!Number.isFinite(comboWizard.product.price) || comboWizard.product.price < 0) {
      document.getElementById('bundle-wizard-error').textContent = comboText('comboNeedPrice');
      return;
    }
  }

  if (targetStep === 2) {
    const error = comboWizardError();
    if (error) {
      document.getElementById('bundle-wizard-error').textContent = error;
      return;
    }
  }

  comboWizard.step = targetStep;
  persistComboWizard();
  renderComboWizard();
}
window.comboWizardJumpToStep = comboWizardJumpToStep;

function renderBundleStepper(currentStep) {
  const stepsContainer = document.getElementById('bundle-wizard-steps');
  if (!stepsContainer) return;

  const stepsConfig = [
    { key: 'comboStepInfo', subKey: 'comboStepInfoSub', num: 1 },
    { key: 'comboStepParts', subKey: 'comboStepPartsSub', num: 2 },
    { key: 'comboStepPreview', subKey: 'comboStepPreviewSub', num: 3 }
  ];

  const checkSvg = `<svg class="bundle-step-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  let html = `<div class="bundle-stepper">`;

  stepsConfig.forEach((cfg, idx) => {
    const isCompleted = idx < currentStep;
    const isActive = idx === currentStep;
    const isPending = idx > currentStep;

    const stateClass = isCompleted ? 'is-completed' : isActive ? 'is-active' : 'is-pending';
    const ariaCurrent = isActive ? 'aria-current="step"' : '';

    const badgeText = isCompleted ? comboText('comboStepCompleted') : isActive ? comboText('comboStepCurrent') : comboText('comboStepPending');
    const titleText = `${cfg.num}. ${comboText(cfg.key)}`;
    const subText = comboText(cfg.subKey) || '';

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

  html += `</div>`;
  stepsContainer.innerHTML = html;
}
window.renderBundleStepper = renderBundleStepper;

