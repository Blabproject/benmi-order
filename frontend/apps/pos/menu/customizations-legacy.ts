import { deleteCategoryAtIndex, formatPlusBtnText } from './categories-manager';
import {
  handleCreateCustomFromSidebar,
  isModifierAppliedToCategory,
  getStoreModifiersList,
  renderMenuCategories,
  renderMenuCategoryEditor,
  setMenuSidebarTab
} from './catalog-editor';
import { menuState } from './state';
import {
  esc,
  getHost,
  invokeHook,
  posSvg,
  readCurrentLang,
  resolveTenantId,
  tr,
  type ItemModifierGroupDraft,
  type MenuCategoryDraft,
  type MenuOptionDraft,
  type MenuOptionGroupDraft
} from './types';
import { checkMenuDirty, isCustomizationCategory, markMenuDirty, syncMenuDataFromDOM } from './workspace';

export function getModifierCategorySelectionState(
  group: MenuOptionGroupDraft,
  category: MenuCategoryDraft
): { checked: boolean; indeterminate: boolean } {
  const itemIds = (category.items || []).map(item => String(item.id || `${category.id}:${item.name}`));
  const selectedCount = itemIds.filter(id => (group.appliedItems || []).includes(id)).length;
  const categorySelected = (group.appliedCategories || []).includes(category.id);
  const checked = categorySelected || (itemIds.length > 0 && selectedCount === itemIds.length);
  return {
    checked,
    indeterminate: !categorySelected && selectedCount > 0 && selectedCount < itemIds.length
  };
}

export function syncCategoryCheckboxIndeterminateState(container: ParentNode): void {
  container.querySelectorAll<HTMLInputElement>('input[data-category-checkbox="true"]').forEach(input => {
    input.indeterminate = input.getAttribute('aria-checked') === 'mixed';
  });
}

export function renderOrderCustomizationEditor(
  container: HTMLElement | null,
  cat: MenuCategoryDraft,
  cIdx: number
): void {
  if (!container) return;
  const host = getHost();
  host.MenuCatalogLists?.clearProducts?.();
  container.classList.remove('is-catalog');
  container.innerHTML = '';

  const data = menuState.currentMenuData || [];
  if (cat.type === 'modifier' && (!cat.groups || cat.groups.length === 0)) {
    const linkedCatIds: string[] = [];
    const catalogCats = data.filter(c => !isCustomizationCategory(c));
    catalogCats.forEach(c => {
      if (
        Array.isArray(c.appliedModifiers) &&
        (c.appliedModifiers.includes('*') ||
          c.appliedModifiers.includes(cat.id) ||
          Boolean(cat.databaseId && c.appliedModifiers.includes(cat.databaseId)))
      ) {
        linkedCatIds.push(c.id);
      }
    });
    cat.groups = [
      {
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
      }
    ];
  }

  const titleEl = document.getElementById('menu-editor-title');
  if (titleEl) {
    const totalOptions = cat.groups ? cat.groups.reduce((acc, g) => acc + (g.options ? g.options.length : 0), 0) : 0;
    const selectedGroup = menuState.activeOptionGroupIndex !== null ? cat.groups?.[menuState.activeOptionGroupIndex] : null;
    titleEl.innerText = `${selectedGroup?.title || cat.title} ${tr('menuItemTotalCount', {
      count: selectedGroup ? selectedGroup.options.length : totalOptions
    })}`;
  }

  const banner = document.createElement('div');
  banner.className = 'cust-header-banner';
  banner.innerHTML = `
    <div class="cust-title">${tr('customizationManageTitle')}</div>
    <div class="cust-desc">${tr('customizationManageDesc')}</div>
  `;
  container.appendChild(banner);

  const catalogCategories = data.filter(c => !isCustomizationCategory(c));
  const lang = readCurrentLang();

  if (!cat.groups || cat.groups.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.textAlign = 'center';
    emptyDiv.style.padding = '24px';
    emptyDiv.style.color = '#94a3b8';
    emptyDiv.innerText = tr('noCategoriesPrompt') || '尚無任何客製化設定';
    container.appendChild(emptyDiv);
  } else {
    cat.groups.forEach((grp, gIdx) => {
      if (
        menuState.activeOptionGroupIndex !== null &&
        cat.groups?.[menuState.activeOptionGroupIndex] &&
        gIdx !== menuState.activeOptionGroupIndex
      ) {
        return;
      }
      const card = document.createElement('div');
      card.className = 'cust-group-card';
      card.setAttribute('data-cust-group-index', String(gIdx));

      const typeBadge =
        grp.type === 'checkbox'
          ? `<span style="font-size: var(--pos-text-meta); padding: 3px 8px; background: #e0e7ff; color: #4338ca; border-radius: 6px; font-weight: 800;">${lang === 'vi' ? 'Chọn nhiều' : '多選'}</span>`
          : `<span style="font-size: var(--pos-text-meta); padding: 3px 8px; background: #ecfdf5; color: #047857; border-radius: 6px; font-weight: 800;">${lang === 'vi' ? 'Chọn 1' : '單選'}</span>`;

      const requiredBadge = `
        <span class="mod-badge-interactive ${grp.isRequired ? 'is-required' : 'is-optional'}">
          <span class="mod-badge-dot"></span>
          <span>${grp.isRequired ? tr('badgeRequired') : tr('badgeOptional')}</span>
        </span>
      `;

      const grpScope =
        grp.scope || (Array.isArray(grp.appliedCategories) && grp.appliedCategories.length > 0 ? 'category' : 'order');
      if (!grp.scope) grp.scope = grpScope;
      if (!Array.isArray(grp.appliedCategories)) grp.appliedCategories = [];
      if (!Array.isArray(grp.appliedItems)) {
        grp.appliedItems = [];
        const appliedItemsRef = grp.appliedItems;
        data
          .filter(c => !isCustomizationCategory(c))
          .forEach(menuCat => {
            (menuCat.items || []).forEach(item => {
              const itemGroups = (item.modifierGroups ||
                (item as { modifier_groups?: ItemModifierGroupDraft[] }).modifier_groups ||
                []) as ItemModifierGroupDraft[];
              if (
                itemGroups.some(link =>
                  [String(grp.id), `mg_${grp.id}`].includes(String(link.id || link.groupId || link.group_id))
                )
              ) {
                appliedItemsRef.push(String(item.id || `${menuCat.id}:${item.name}`));
              }
            });
          });
      }

      const scopeButtonsHtml = `
        <div class="cust-scope-selector-wrap">
          <button type="button" class="cust-scope-btn ${grpScope === 'order' ? 'active scope-order' : ''}" onclick="setCustomizationGroupScope(${cIdx}, ${gIdx}, 'order')">
            <span>${tr('scopeOrder') || (lang === 'vi' ? 'Toàn đơn' : '整單適用')}</span>
          </button>
          <button type="button" class="cust-scope-btn ${grpScope !== 'order' ? 'active scope-category' : ''}" onclick="setCustomizationGroupScope(${cIdx}, ${gIdx}, 'category')">
            <span>${tr('scopeCategoryItem')}</span>
          </button>
        </div>
      `;

      let scopePanelHtml = '';
      if (grpScope === 'order') {
        scopePanelHtml = `
          <div class="cust-scope-panel scope-order-panel">
            <div class="cust-scope-panel-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>${tr('scopeOrderDesc') || '適用於整筆訂單結帳時的選項（如餐具、全單辣度）'}</span>
            </div>
          </div>
        `;
      } else {
        const catChipsHtml = catalogCategories
          .map(catItem => {
            const selection = getModifierCategorySelectionState(grp, catItem);
            const isChecked = selection.checked;
            const isIndeterminate = selection.indeterminate;
            const count = Array.isArray(catItem.items) ? catItem.items.length : 0;
            return `
            <div class="cust-cat-item-select ${isIndeterminate ? 'has-partial-selection' : ''}">
              <label class="cust-cat-chip ${isChecked ? 'active' : ''} ${isIndeterminate ? 'partial' : ''}">
                <input data-category-checkbox="true" type="checkbox" aria-checked="${isIndeterminate ? 'mixed' : String(isChecked)}" ${isChecked ? 'checked' : ''} onchange="toggleGroupAppliedCategory(${cIdx}, ${gIdx}, '${esc(catItem.id)}', this.checked)">
                <span>${esc(catItem.title)}</span>
                <span class="cust-cat-chip-count">(${count})</span>
              </label>
              <div class="cust-item-chip-list">${(catItem.items || [])
                .map((item, itemIdx) => {
                  const itemId = String(item.id || `${catItem.id}:${item.name}`);
                  const checked =
                    Boolean(grp.appliedCategories?.includes(catItem.id)) ||
                    Boolean(grp.appliedItems?.includes(itemId));
                  return `<label class="cust-item-chip"><input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleGroupAppliedItem(${cIdx}, ${gIdx}, '${esc(catItem.id)}', ${itemIdx}, this.checked)"><span>${esc(item.name)}</span></label>`;
                })
                .join('')}</div>
            </div>
          `;
          })
          .join('');

        const appliedCats = catalogCategories.filter(
          c =>
            Boolean(grp.appliedCategories?.includes(c.id)) ||
            ((c.items || []).length > 0 &&
              c.items.every(item => grp.appliedItems?.includes(String(item.id || `${c.id}:${item.name}`))))
        );
        const selectedItemKeys = new Set(grp.appliedItems || []);
        appliedCats.forEach(c =>
          (c.items || []).forEach(item => selectedItemKeys.add(String(item.id || `${c.id}:${item.name}`)))
        );
        const totalItemsApplied = selectedItemKeys.size;
        const summaryTpl = tr('appliedSummary') || '已套用至 {catCount} 個分類 (共 {itemCount} 項餐點)';
        const summaryText = summaryTpl
          .replace('{catCount}', String(appliedCats.length))
          .replace('{itemCount}', String(totalItemsApplied));

        const groupKey = grp.id || `grp_${gIdx}`;
        const isCatChipsOpen = Boolean(menuState.isCustomScopeSectionOpen?.[groupKey]);

        scopePanelHtml = `
          <div class="cust-scope-panel scope-category-panel" style="padding: 10px 14px;">
            <details class="cust-cat-collapsible" ${isCatChipsOpen ? 'open' : ''} ontoggle="window.isCustomScopeSectionOpen = window.isCustomScopeSectionOpen || {}; window.isCustomScopeSectionOpen['${esc(groupKey)}'] = this.open;">
              <summary class="cust-cat-collapsible-summary" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; list-style: none; user-select: none;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                  <span style="font-weight: 700; font-size: 13px;">${tr('scopeCategoryDesc') || '所選分類下的所有餐點將自動繼承此客製化選項'}</span>
                  <span class="cust-scope-summary-pill" style="font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;">
                    ${summaryText}
                  </span>
                </div>
                <div class="cust-cat-collapsible-btn">
                  <span>${tr('btnSelectCategories') || (lang === 'vi' ? 'Chọn phân loại' : '選擇分類')}</span>
                  <svg class="cust-scope-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s ease;">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              </summary>
              <div class="cust-cat-chips-list" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #86efac;">
                ${catChipsHtml || `<span style="color:#94a3b8; font-size:12.5px;">${tr('noCategoriesPrompt') || '無分類'}</span>`}
              </div>
            </details>
          </div>
        `;
      }

      const optionsCount = (grp.options || []).length;
      let optionsHtml = '';
      if (optionsCount === 0) {
        optionsHtml = `
          <div class="cust-empty-options-hint" style="text-align: center; padding: 24px 16px; background: #f8fafc; border-radius: 10px; border: 1.5px dashed #cbd5e1; margin-bottom: 12px; color: #64748b;">
            <div style="font-size: 13.5px; font-weight: 700; margin-bottom: 4px;">${lang === 'vi' ? 'Nhóm này chưa có lựa chọn nào' : '此分組尚無任何選項'}</div>
            <div style="font-size: 12px; color: #94a3b8;">${lang === 'vi' ? 'Bấm nút "Thêm lựa chọn" bên dưới để bắt đầu' : '點擊下方「新增選項」按鈕開始建立第一個選項'}</div>
          </div>
        `;
      } else {
        (grp.options || []).forEach((opt: MenuOptionDraft, oIdx: number) => {
          const oosBg = opt.isOos ? '#fee2e2' : '#d1fae5';
          const oosColor = opt.isOos ? '#b91c1c' : '#065f46';
          const oosBorder = opt.isOos ? '#fca5a5' : '#6ee7b7';
          const oosText = opt.isOos ? tr('stockStatusOutOfStock') : tr('stockStatusInStock');

          const subChipsHtml = (opt.sub_options || [])
            .map(
              (sub, sIdx) => `
          <span class="cust-sub-chip">
            <span>${esc(typeof sub === 'string' ? sub : sub.name || '')}</span>
            <button type="button" class="cust-sub-chip-remove" onclick="removeSubOptionChip(${cIdx}, ${gIdx}, ${oIdx}, ${sIdx})" title="✕">✕</button>
          </span>
        `
            )
            .join('');

          optionsHtml += `
          <div class="cust-option-block" data-gidx="${gIdx}" data-oidx="${oIdx}">
            <div class="cust-option-row">
              <input type="text" class="menu-item-name-input" value="${esc(opt.name)}"
                data-cust-name-cidx="${cIdx}" data-cust-gidx="${gIdx}" data-cust-oidx="${oIdx}"
                oninput="syncMenuDataFromDOM(); markMenuDirty()" placeholder="${tr('labelOptionName')}">
              <label class="menu-item-price-label" title="${tr('labelSurcharge')}">
                <span>+$</span>
                <input type="number" class="menu-item-price-input" value="${opt.price !== null && opt.price !== undefined ? opt.price : 0}"
                  data-cust-price-cidx="${cIdx}" data-cust-gidx="${gIdx}" data-cust-oidx="${oIdx}"
                  oninput="syncMenuDataFromDOM(); markMenuDirty()" placeholder="0">
              </label>
              <div class="menu-item-actions" style="margin-left: auto;">
                <button type="button" class="menu-item-btn" style="background: ${oosBg}; color: ${oosColor}; border: 1px solid ${oosBorder}; display: inline-flex; align-items: center; gap: 5px;"
                  id="menu-option-stock-${cIdx}-${gIdx}-${oIdx}" aria-haspopup="dialog" aria-controls="stockModal"
                  onclick="openStockModalForCustomization(${cIdx}, ${gIdx}, ${oIdx})" title="${oosText}" aria-label="${esc(opt.name + ': ' + oosText)}">
                  <span style="width: 7px; height: 7px; border-radius: 50%; background: currentColor; display: inline-block;"></span> <span>${oosText}</span>
                </button>
                <button type="button" class="menu-item-btn btn-ghost" style="border: 1px solid #fee2e2; background: #fff5f5; color: var(--brand-red); display:inline-flex; align-items:center; gap:4px;"
                  onclick="removeCustomizationOption(${cIdx}, ${gIdx}, ${oIdx})" title="${tr('btnItemDelete')}">
                  ${posSvg('trash')} <span>${tr('btnItemDelete')}</span>
                </button>
              </div>
            </div>
            <div class="cust-sub-options-container">
              <span class="cust-sub-label">${tr('subOptionsLabel')}</span>
              ${subChipsHtml}
              <button type="button" class="cust-add-sub-chip-btn"
                onclick="promptAddSubOptionChip(${cIdx}, ${gIdx}, ${oIdx})">
                <span>${formatPlusBtnText(tr('btnAddSubOption'), '新增細項')}</span>
              </button>
            </div>
          </div>
        `;
        });
      }

      const repeatsEditorTitle =
        cat.groups!.length === 1 && String(grp.title || '').trim() === String(cat.title || '').trim();

      card.innerHTML = `
        <div class="cust-group-header">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="cust-group-title" id="cust-group-title-${gIdx}"${repeatsEditorTitle ? ' hidden' : ''}>${esc(grp.title)}</span>
            <button type="button" class="menu-item-btn btn-ghost" id="cust-group-rename-btn-${gIdx}" style="padding: 3px 6px; font-size: var(--pos-text-meta); border: 1px solid #cbd5e1; display:inline-flex; align-items:center; justify-content:center;"
              onclick="startRenameCustomizationGroup(${cIdx}, ${gIdx})" title="${tr('btnCategoryRename')}">${posSvg('edit')}</button>
            <button type="button" style="cursor: pointer; border: none; background: transparent; padding: 0;"
              onclick="toggleCustomizationGroupType(${cIdx}, ${gIdx})" title="${grp.type === 'checkbox' ? tr('toggleGroupTypeSingle') : tr('toggleGroupTypeMultiple')}">
              ${typeBadge}
            </button>
            <button type="button" style="cursor: pointer; border: none; background: transparent; padding: 0;"
              onclick="toggleCustomizationGroupRequired(${cIdx}, ${gIdx})" title="${grp.isRequired ? tr('toggleRequiredOff') : tr('toggleRequiredOn')}">
              ${requiredBadge}
            </button>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
            <span style="font-size: var(--pos-text-meta); color: #64748b; font-weight: 600;">${optionsCount} ${tr('menuItemUnit')}</span>
            <button type="button" class="menu-item-btn btn-ghost" style="border: 1px solid #fee2e2; background: #fff5f5; color: var(--brand-red); padding: 3px 6px; font-size: var(--pos-text-meta); display:inline-flex; align-items:center; justify-content:center;"
              onclick="removeCustomizationGroup(${cIdx}, ${gIdx})" title="${tr('btnCategoryDelete')}">
              ${posSvg('trash')}
            </button>
          </div>
        </div>

        ${scopeButtonsHtml}
        ${scopePanelHtml}

        <div class="cust-options-list">
          ${optionsHtml}
        </div>
        <button type="button" class="cat-mgr-add-btn" style="margin-top: 10px;" onclick="addCustomizationOption(${cIdx}, ${gIdx})">
          <span>${formatPlusBtnText(tr('btnAddCustomOption'), '新增選項')}</span>
        </button>
      `;

      syncCategoryCheckboxIndeterminateState(card);
      container.appendChild(card);
    });
  }

  if (menuState.isCustomGroupCreatorOpen) {
    const newCard = document.createElement('div');
    newCard.className = 'cust-new-group-card';
    newCard.id = 'cust-new-group-card';
    newCard.style.cssText =
      'background: #ffffff; border: 2px solid var(--primary, #2563eb); border-radius: 14px; padding: 18px; margin-top: 16px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.08);';

    const quickChips =
      lang === 'vi'
        ? ['✦ Dụng cụ ăn uống', '✦ Mức cay toàn đơn', '✦ Ghi chú dặn dò', '✦ Chọn nước sốt']
        : ['✦ 免洗餐具', '✦ 整單辣度', '✦ 店家備註', '✦ 醬料選擇'];

    const chipsHtml = quickChips
      .map(
        chip =>
          `<span class="quick-tag-chip" onclick="applyNewGroupQuickChip('${esc(chip)}')" style="cursor: pointer;">${esc(chip)}</span>`
      )
      .join('');

    const titleText = tr('newGroupCardTitle') || (lang === 'vi' ? 'Tạo nhóm tùy chọn mới' : '新增客製化分組');
    const placeholderText =
      tr('newGroupInputPlaceholder') ||
      (lang === 'vi'
        ? '✦ Nhập tên nhóm (ví dụ: Chọn nước sốt, Dụng cụ ăn uống...)'
        : '✦ 輸入分組名稱（例：✦ 醬料選擇、✦ 加料選項）');

    const creatorScopeHtml = `
      <div style="margin-bottom: 14px;">
        <label style="display:block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
          ${lang === 'vi' ? 'Phạm vi áp dụng (3 cấp độ):' : '套用範圍（三級架構）：'}
        </label>
        <div class="cust-scope-selector-wrap" style="margin-top: 0; margin-bottom: 8px;">
          <button type="button" class="cust-scope-btn ${menuState.newCustomGroupScope === 'order' ? 'active scope-order' : ''}" onclick="setNewCustomGroupScope('order', ${cIdx})">
            <span>${tr('scopeOrder') || (lang === 'vi' ? 'Toàn đơn' : '整單適用')}</span>
          </button>
          <button type="button" class="cust-scope-btn ${menuState.newCustomGroupScope !== 'order' ? 'active scope-category' : ''}" onclick="setNewCustomGroupScope('category', ${cIdx})">
            <span>${tr('scopeCategoryItem')}</span>
          </button>
        </div>
        ${
          menuState.newCustomGroupScope === 'category'
            ? `
          <div class="cust-scope-panel scope-category-panel" style="margin-bottom: 0;">
            <div class="cust-scope-panel-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
              <span>${tr('scopeCategoryDesc') || '所選分類下的所有餐點將自動繼承此客製化選項'}</span>
            </div>
            <div class="cust-cat-chips-list">
              ${catalogCategories
                .map(catItem => {
                  const isChecked = menuState.newCustomGroupAppliedCategories.includes(catItem.id);
                  const count = Array.isArray(catItem.items) ? catItem.items.length : 0;
                  return `
                  <label class="cust-cat-chip ${isChecked ? 'active' : ''}">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleNewGroupAppliedCategory('${esc(catItem.id)}', ${cIdx})">
                    <span>${esc(catItem.title)}</span>
                    <span class="cust-cat-chip-count">(${count})</span>
                  </label>
                `;
                })
                .join('')}
            </div>
          </div>
        `
            : menuState.newCustomGroupScope === 'order'
              ? `
          <div class="cust-scope-panel scope-order-panel" style="margin-bottom: 0;">
            <div class="cust-scope-panel-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>${tr('scopeOrderDesc') || '適用於整筆訂單結帳時的選項（如餐具、全單辣度）'}</span>
            </div>
          </div>
        `
              : `
          <div class="cust-scope-panel scope-item-panel" style="margin-bottom: 0;">
            <div class="cust-scope-panel-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              <span>${tr('scopeItemDesc') || '僅在手動加入個別品項或套餐時適用'}</span>
            </div>
          </div>
        `
        }
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
        <span style="font-size: 12.5px; color: #64748b; font-weight: 700;">${lang === 'vi' ? 'Gợi ý nhanh:' : '快捷標籤：'}</span>
        ${chipsHtml}
      </div>

      ${creatorScopeHtml}

      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; padding: 12px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; align-items: center;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 13px; font-weight: 700; color: #334155;">${lang === 'vi' ? 'Kiểu chọn:' : '選擇模式：'}</span>
          <button type="button" id="btn-new-grp-type-radio" class="btn" style="min-height: 40px; padding: 0 12px; font-size: 13px; font-weight: 700; border-radius: 8px; ${menuState.newCustomGroupType === 'radio' ? 'background: #eff6ff; color: #2563eb; border: 1.5px solid #93c5fd;' : 'background: #ffffff; color: #64748b; border: 1px solid #cbd5e1;'}" onclick="setNewGroupType('radio', ${cIdx})">
            ${lang === 'vi' ? 'Chọn 1 (Đơn tuyển)' : '單選 (僅選一項)'}
          </button>
          <button type="button" id="btn-new-grp-type-checkbox" class="btn" style="min-height: 40px; padding: 0 12px; font-size: 13px; font-weight: 700; border-radius: 8px; ${menuState.newCustomGroupType === 'checkbox' ? 'background: #eff6ff; color: #2563eb; border: 1.5px solid #93c5fd;' : 'background: #ffffff; color: #64748b; border: 1px solid #cbd5e1;'}" onclick="setNewGroupType('checkbox', ${cIdx})">
            ${lang === 'vi' ? 'Chọn nhiều (Đa tuyển)' : '多選 (可選多項)'}
          </button>
        </div>

        <div style="height: 20px; width: 1px; background: #cbd5e1; margin: 0 4px;"></div>

        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 13px; font-weight: 700; color: #334155;">${lang === 'vi' ? 'Quy định:' : '必選設定：'}</span>
          <button type="button" id="btn-new-grp-required" class="btn" style="min-height: 40px; padding: 0 12px; font-size: 13px; font-weight: 700; border-radius: 8px; ${menuState.newCustomGroupRequired ? 'background: #fee2e2; color: #b91c1c; border: 1.5px solid #fca5a5;' : 'background: #ffffff; color: #64748b; border: 1px solid #cbd5e1;'}" onclick="toggleNewGroupRequired(${cIdx})">
            ${menuState.newCustomGroupRequired ? tr('badgeRequired') || (lang === 'vi' ? 'Bắt buộc chọn' : '必選項目') : tr('badgeOptional') || (lang === 'vi' ? 'Không bắt buộc' : '選填項目')}
          </button>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn btn-ghost" onclick="cancelNewCustomizationGroup(${cIdx})" style="min-height: 48px; padding: 0 20px; font-weight: 700; border-radius: 10px;">
          ${tr('btnItemCancel') || (lang === 'vi' ? 'Hủy' : '取消')}
        </button>
        <button type="button" class="btn btn-primary" onclick="saveNewCustomizationGroup(${cIdx})" style="min-height: 48px; padding: 0 24px; font-weight: 800; border-radius: 10px; font-size: 14px;">
          ${tr('btnSaveGroup') || (lang === 'vi' ? 'Lưu nhóm' : '儲存分組')}
        </button>
      </div>
    `;
    container.appendChild(newCard);
  } else if (cat.type !== 'modifier' && menuState.activeOptionGroupIndex === null) {
    const addGroupBtn = document.createElement('button');
    addGroupBtn.type = 'button';
    addGroupBtn.className = 'cat-mgr-add-btn';
    addGroupBtn.style.marginTop = '16px';
    addGroupBtn.style.background = '#f8fafc';
    addGroupBtn.style.border = '2px dashed #94a3b8';
    addGroupBtn.innerHTML = `<span>${formatPlusBtnText(tr('btnAddCustomGroup'), '新增客製化分組')}</span>`;
    addGroupBtn.onclick = () => openNewCustomGroupCreator(cIdx);
    container.appendChild(addGroupBtn);
  }
}

export function openNewCustomGroupCreator(cIdx: number): void {
  const host = getHost();
  if (host.UnifiedMenu?.enabled) {
    void host.UnifiedMenu.group?.();
    return;
  }
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  menuState.isCustomGroupCreatorOpen = true;
  menuState.newCustomGroupType = 'radio';
  menuState.newCustomGroupRequired = false;
  menuState.newCustomGroupScope = 'order';
  menuState.newCustomGroupAppliedCategories = [];
  const cat = menuState.currentMenuData?.[cIdx];
  if (cat) {
    invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
  }
  setTimeout(() => {
    const card = document.getElementById('cust-new-group-card');
    const inp = document.getElementById('cust-new-group-title-input');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (inp) inp.focus();
  }, 50);
}

export function cancelNewCustomizationGroup(cIdx: number): void {
  menuState.isCustomGroupCreatorOpen = false;
  const cat = menuState.currentMenuData?.[cIdx];
  if (cat) {
    invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
  }
}

export function setNewGroupType(type: 'radio' | 'checkbox', _cIdx?: number): void {
  menuState.newCustomGroupType = type;
  const radioBtn = document.getElementById('btn-new-grp-type-radio');
  const checkBtn = document.getElementById('btn-new-grp-type-checkbox');
  if (radioBtn && checkBtn) {
    if (type === 'radio') {
      radioBtn.style.background = '#eff6ff';
      radioBtn.style.color = '#2563eb';
      radioBtn.style.border = '1.5px solid #93c5fd';
      checkBtn.style.background = '#ffffff';
      checkBtn.style.color = '#64748b';
      checkBtn.style.border = '1px solid #cbd5e1';
    } else {
      checkBtn.style.background = '#eff6ff';
      checkBtn.style.color = '#2563eb';
      checkBtn.style.border = '1.5px solid #93c5fd';
      radioBtn.style.background = '#ffffff';
      radioBtn.style.color = '#64748b';
      radioBtn.style.border = '1px solid #cbd5e1';
    }
  }
}

export function setNewCustomGroupScope(scope: 'order' | 'category' | 'item', cIdx: number): void {
  menuState.newCustomGroupScope = scope;
  const cat = menuState.currentMenuData?.[cIdx];
  if (cat) {
    invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
  }
}

export function toggleNewGroupAppliedCategory(catId: string, cIdx: number): void {
  const idx = menuState.newCustomGroupAppliedCategories.indexOf(catId);
  if (idx >= 0) {
    menuState.newCustomGroupAppliedCategories.splice(idx, 1);
  } else {
    menuState.newCustomGroupAppliedCategories.push(catId);
  }
  const cat = menuState.currentMenuData?.[cIdx];
  if (cat) {
    invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
  }
}

export function setCustomizationGroupScope(cIdx: number, gIdx: number, scope: string): void {
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const data = menuState.currentMenuData;
  const cat = data?.[cIdx];
  const grp = cat?.groups?.[gIdx];
  if (!data || !cat || !grp) return;
  grp.scope = scope;
  if (scope === 'category') {
    if (!Array.isArray(grp.appliedCategories)) grp.appliedCategories = [];
    const groupKey = grp.id || `grp_${gIdx}`;
    menuState.isCustomScopeSectionOpen = menuState.isCustomScopeSectionOpen || {};
    menuState.isCustomScopeSectionOpen[groupKey] = true;
  } else if (scope === 'item') {
    grp.appliedCategories = [];
    if (cat.type === 'modifier') {
      const modIdentifier = cat.id || cat.databaseId;
      data.forEach(c => {
        if (!isCustomizationCategory(c) && Array.isArray(c.appliedModifiers)) {
          c.appliedModifiers = c.appliedModifiers.filter(
            m => m !== '*' && m !== modIdentifier && m !== cat.id && m !== cat.databaseId
          );
        }
      });
    }
  }
  invokeHook('markMenuDirty', markMenuDirty);
  invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
}

export function toggleGroupAppliedCategory(cIdx: number, gIdx: number, catId: string, checked: boolean): void {
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const data = menuState.currentMenuData;
  const cat = data?.[cIdx];
  const grp = cat?.groups?.[gIdx];
  if (!data || !cat || !grp) return;
  if (!Array.isArray(grp.appliedCategories)) grp.appliedCategories = [];
  const idx = grp.appliedCategories.indexOf(catId);
  const targetCatalogCat = data.find(c => c.id === catId || c.databaseId === catId);
  const modIdentifier = cat.id || cat.databaseId || '';

  if (!checked || idx >= 0) {
    grp.appliedCategories = grp.appliedCategories.filter(id => id !== catId);
    const itemKeys = (targetCatalogCat?.items || []).map(item =>
      String(item.id || `${targetCatalogCat?.id}:${item.name}`)
    );
    grp.appliedItems = (grp.appliedItems || []).filter(id => !itemKeys.includes(id));
    if (cat.type === 'modifier' && targetCatalogCat) {
      if (!Array.isArray(targetCatalogCat.appliedModifiers)) targetCatalogCat.appliedModifiers = [];
      targetCatalogCat.appliedModifiers = targetCatalogCat.appliedModifiers.filter(
        m => m !== '*' && m !== modIdentifier && m !== cat.id && m !== cat.databaseId
      );
    }
  } else {
    grp.appliedCategories.push(catId);
    const categoryItemKeys = (targetCatalogCat?.items || []).map(item =>
      String(item.id || `${targetCatalogCat?.id}:${item.name}`)
    );
    grp.appliedItems = (grp.appliedItems || []).filter(id => !categoryItemKeys.includes(id));
    if (cat.type === 'modifier' && targetCatalogCat) {
      if (!Array.isArray(targetCatalogCat.appliedModifiers)) targetCatalogCat.appliedModifiers = [];
      if (modIdentifier && !targetCatalogCat.appliedModifiers.includes(modIdentifier)) {
        targetCatalogCat.appliedModifiers.push(modIdentifier);
      }
      targetCatalogCat.allowCustomization = true;
    }
  }
  invokeHook('markMenuDirty', markMenuDirty);
  invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
}

export function toggleGroupAppliedItem(
  cIdx: number,
  gIdx: number,
  catId: string,
  itemIdx: number,
  checked: boolean
): void {
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const data = menuState.currentMenuData;
  const cat = data?.[cIdx];
  const group = cat?.groups?.[gIdx];
  const menuCat = data?.find(c => c.id === catId || c.databaseId === catId);
  const item = menuCat?.items?.[itemIdx];
  if (!cat || !group || !menuCat || !item) return;
  if (!Array.isArray(group.appliedItems)) group.appliedItems = [];
  const itemKey = String(item.id || `${menuCat.id}:${item.name}`);
  const categoryWasSelected = (group.appliedCategories || []).includes(catId);
  if (categoryWasSelected) {
    group.appliedCategories = (group.appliedCategories || []).filter(id => id !== catId);
    group.appliedItems = [
      ...new Set([
        ...(group.appliedItems || []),
        ...(menuCat.items || [])
          .filter((_, i) => i !== itemIdx)
          .map(entry => String(entry.id || `${menuCat.id}:${entry.name}`))
      ])
    ];
  }
  group.appliedItems = checked
    ? [...new Set([...group.appliedItems, itemKey])]
    : group.appliedItems.filter(id => id !== itemKey);
  group.scope = 'category';
  invokeHook('markMenuDirty', markMenuDirty);
  invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
}

export function toggleNewGroupRequired(_cIdx?: number): void {
  menuState.newCustomGroupRequired = !menuState.newCustomGroupRequired;
  const reqBtn = document.getElementById('btn-new-grp-required');
  const lang = readCurrentLang();
  if (reqBtn) {
    if (menuState.newCustomGroupRequired) {
      reqBtn.style.background = '#fee2e2';
      reqBtn.style.color = '#b91c1c';
      reqBtn.style.border = '1.5px solid #fca5a5';
      reqBtn.innerText = tr('badgeRequired') || (lang === 'vi' ? 'Bắt buộc chọn' : '必選項目');
    } else {
      reqBtn.style.background = '#ffffff';
      reqBtn.style.color = '#64748b';
      reqBtn.style.border = '1px solid #cbd5e1';
      reqBtn.innerText = tr('badgeOptional') || (lang === 'vi' ? 'Không bắt buộc' : '選填項目');
    }
  }
}

export function applyNewGroupQuickChip(text: string): void {
  const inp = document.getElementById('cust-new-group-title-input') as HTMLInputElement | null;
  if (inp) {
    inp.value = text;
    inp.style.borderColor = '#cbd5e1';
    inp.focus();
  }
}

export function saveNewCustomizationGroup(cIdx: number): void {
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const inp = document.getElementById('cust-new-group-title-input') as HTMLInputElement | null;
  if (!inp) return;
  const trimmed = inp.value.trim();
  if (!trimmed) {
    inp.style.borderColor = '#ef4444';
    inp.focus();
    return;
  }
  const cat = menuState.currentMenuData?.[cIdx];
  if (cat) {
    if (!Array.isArray(cat.groups)) cat.groups = [];
    const tenantId = resolveTenantId();
    const newKey = `group_${Date.now().toString(36)}`;
    const newId = `custom_${tenantId}_${newKey}`;
    cat.groups.push({
      id: newId,
      key: newKey,
      title: trimmed,
      type: menuState.newCustomGroupType,
      isRequired: menuState.newCustomGroupRequired,
      scope: menuState.newCustomGroupScope,
      appliedCategories: menuState.newCustomGroupScope === 'category' ? [...menuState.newCustomGroupAppliedCategories] : [],
      sortOrder: cat.groups.length,
      options: []
    });
    menuState.isCustomGroupCreatorOpen = false;
    const newGroupIndex = cat.groups.length - 1;
    menuState.activeOptionGroupIndex = newGroupIndex;
    invokeHook('markMenuDirty', markMenuDirty);
    invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
    invokeHook('renderMenuCategories', renderMenuCategories);

    setTimeout(() => {
      const el = document.querySelector(`[data-cust-group-index="${newGroupIndex}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }
}

export function addCustomizationGroup(cIdx: number): void {
  openNewCustomGroupCreator(cIdx);
}

export function startRenameCustomizationGroup(cIdx: number, gIdx: number): void {
  const titleEl = document.getElementById(`cust-group-title-${gIdx}`);
  const renameBtn = document.getElementById(`cust-group-rename-btn-${gIdx}`);
  if (!titleEl) return;
  titleEl.hidden = false;
  if (renameBtn) renameBtn.style.display = 'none';
  const currentTitle = menuState.currentMenuData?.[cIdx]?.groups?.[gIdx]?.title || '';

  titleEl.innerHTML = `
    <div style="display: flex; align-items: center; gap: 6px;" onclick="event.stopPropagation()">
      <input type="text" id="cust-group-rename-input-${gIdx}" value="${esc(currentTitle)}"
        style="min-width: 160px; max-width: 240px; font-weight: 800; font-size: 15px; padding: 6px 10px; border: 1.5px solid var(--primary, #2563eb); border-radius: 8px; background: #fff;"
        onkeydown="if(event.key === 'Enter') saveRenameCustomizationGroup(${cIdx}, ${gIdx}); if(event.key === 'Escape') cancelRenameCustomizationGroup(${cIdx}, ${gIdx});">
      <button type="button" class="btn btn-primary" onclick="saveRenameCustomizationGroup(${cIdx}, ${gIdx})" style="min-height: 34px; padding: 0 10px; font-size: 13px; font-weight: 700; border-radius: 6px;">✓</button>
      <button type="button" class="btn btn-ghost" onclick="cancelRenameCustomizationGroup(${cIdx}, ${gIdx})" style="min-height: 34px; padding: 0 8px; font-size: 13px; border-radius: 6px;">✕</button>
    </div>
  `;
  const inp = document.getElementById(`cust-group-rename-input-${gIdx}`) as HTMLInputElement | null;
  if (inp) {
    inp.focus();
    inp.select();
  }
}

export function saveRenameCustomizationGroup(cIdx: number, gIdx: number): void {
  const inp = document.getElementById(`cust-group-rename-input-${gIdx}`) as HTMLInputElement | null;
  if (!inp) return;
  const trimmed = inp.value.trim();
  if (!trimmed) {
    inp.style.borderColor = '#ef4444';
    inp.focus();
    return;
  }
  const cat = menuState.currentMenuData?.[cIdx];
  const grp = cat?.groups?.[gIdx];
  if (cat && grp) {
    grp.title = trimmed;
    if (cat.type === 'modifier') {
      cat.title = trimmed;
      cat.shortName = trimmed;
    }
    invokeHook('markMenuDirty', markMenuDirty);
    invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
    invokeHook('renderMenuCategories', renderMenuCategories);
  }
}

export function cancelRenameCustomizationGroup(cIdx: number, _gIdx?: number): void {
  const cat = menuState.currentMenuData?.[cIdx];
  if (cat) {
    invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
  }
}

export function renameCustomizationGroup(cIdx: number, gIdx: number): void {
  startRenameCustomizationGroup(cIdx, gIdx);
}

export function toggleCustomizationGroupType(cIdx: number, gIdx: number): void {
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const cat = menuState.currentMenuData?.[cIdx];
  const grp = cat?.groups?.[gIdx];
  if (!cat || !grp) return;
  grp.type = grp.type === 'checkbox' ? 'radio' : 'checkbox';
  invokeHook('markMenuDirty', markMenuDirty);
  invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
}

export function toggleCustomizationGroupRequired(cIdx: number, gIdx: number): void {
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const data = menuState.currentMenuData;
  const currentCat = data?.[cIdx];
  const grp = currentCat?.groups?.[gIdx];
  if (!data || !currentCat || !grp) return;
  grp.isRequired = !grp.isRequired;

  const grpId = String(grp.id || '');
  const canonId = String(grp.canonicalId || '');
  data.forEach(cat => {
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

  invokeHook('markMenuDirty', markMenuDirty);
  invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), currentCat, cIdx);
}

export function removeCustomizationGroup(cIdx: number, gIdx: number): void {
  const data = menuState.currentMenuData;
  const cat = data?.[cIdx];
  const grp = cat?.groups?.[gIdx];
  if (!data || !cat || !grp) return;
  if (confirm(tr('confirmDeleteCustomGroup'))) {
    invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
    if (cat.type === 'modifier') {
      void deleteCategoryAtIndex(cIdx);
      return;
    }
    data.forEach(category =>
      (category.items || []).forEach(item => {
        if (Array.isArray(item.modifierGroups)) {
          item.modifierGroups = item.modifierGroups.filter(link => link.id !== grp.id && link.id !== `mg_${grp.id}`);
        }
      })
    );
    cat.groups?.splice(gIdx, 1);
    menuState.activeOptionGroupIndex = null;
    invokeHook('markMenuDirty', markMenuDirty);
    invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
    invokeHook('renderMenuCategories', renderMenuCategories);
  }
}

export function promptAddSubOptionChip(cIdx: number, gIdx: number, oIdx: number): void {
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const subName = prompt(tr('promptAddSubOption'));
  const cat = menuState.currentMenuData?.[cIdx];
  if (subName !== null && cat) {
    const trimmed = subName.trim();
    if (!trimmed) return;
    const opt = cat.groups?.[gIdx]?.options?.[oIdx];
    if (opt) {
      if (!Array.isArray(opt.sub_options)) opt.sub_options = [];
      if (!opt.sub_options.includes(trimmed)) {
        opt.sub_options.push(trimmed);
        invokeHook('markMenuDirty', markMenuDirty);
        invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
      }
    }
  }
}

export function removeSubOptionChip(cIdx: number, gIdx: number, oIdx: number, sIdx: number): void {
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const cat = menuState.currentMenuData?.[cIdx];
  const opt = cat?.groups?.[gIdx]?.options?.[oIdx];
  if (cat && opt && Array.isArray(opt.sub_options)) {
    opt.sub_options.splice(sIdx, 1);
    invokeHook('markMenuDirty', markMenuDirty);
    invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
  }
}

export function addCustomizationOption(cIdx: number, gIdx: number): void {
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const cat = menuState.currentMenuData?.[cIdx];
  const group = cat?.groups?.[gIdx];
  if (cat && group) {
    if (!Array.isArray(group.options)) group.options = [];
    const stableGid = group.canonicalId || group.id || `${cIdx}_${gIdx}`;
    const newId = `opt_${stableGid}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const defaultName = tr('newItemPlaceholder') || '新選項';
    group.options.push({
      id: newId,
      name: defaultName,
      price: 0,
      isOos: false,
      sub_options: [],
      originalName: defaultName
    });
    if (cat.type === 'modifier') {
      if (!Array.isArray(cat.items)) cat.items = [];
      cat.items.push({
        id: newId,
        name: defaultName,
        price: 0,
        isOos: false,
        badgeText: '',
        isRecommended: false,
        originalName: defaultName
      });
    }
    invokeHook('markMenuDirty', markMenuDirty);
    invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
    invokeHook('renderMenuCategories', renderMenuCategories);
    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => {
        const newInp = document.querySelector<HTMLInputElement>(
          `input[data-cust-name-cidx="${cIdx}"][data-cust-gidx="${gIdx}"][data-cust-oidx="${group.options.length - 1}"]`
        );
        if (newInp) {
          newInp.focus();
          newInp.select();
        }
      }, 50);
    }
  }
}

export function removeCustomizationOption(cIdx: number, gIdx: number, oIdx: number): void {
  const cat = menuState.currentMenuData?.[cIdx];
  const group = cat?.groups?.[gIdx];
  const opt = group?.options?.[oIdx];
  if (!cat || !group || !opt) return;
  if (confirm(tr('confirmDeleteItem'))) {
    invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
    group.options.splice(oIdx, 1);
    if (cat.type === 'modifier' && Array.isArray(cat.items)) {
      cat.items.splice(oIdx, 1);
    }
    invokeHook('markMenuDirty', markMenuDirty);
    invokeHook('renderOrderCustomizationEditor', renderOrderCustomizationEditor, document.getElementById('menu-editor-body'), cat, cIdx);
    invokeHook('renderMenuCategories', renderMenuCategories);
  }
}

// --- Legacy Item Modifiers Modal (#itemModifiersModal) ---
export function getInheritedItemModifierGroups(cat: MenuCategoryDraft): MenuOptionGroupDraft[] {
  const groups: MenuOptionGroupDraft[] = [];
  const seen = new Set<string>();
  getStoreModifiersList().forEach(mod => {
    if (!isModifierAppliedToCategory(mod, cat) || mod.group?.scope === 'order') return;
    const source = menuState.currentMenuData?.[mod.categoryIndex];
    const fallbackOpts = (source?.items || source?.groups?.[0]?.options || []) as MenuOptionDraft[];
    const group: MenuOptionGroupDraft = mod.group || {
      id: mod.id,
      title: mod.title,
      options: fallbackOpts
    };
    const id = String(group.canonicalId || group.id || mod.id);
    if (seen.has(id)) return;
    seen.add(id);
    groups.push(group);
  });
  return groups;
}

export function openItemModifiersModal(cIdx: number, iIdx: number): void {
  const host = getHost();
  if (host.UnifiedMenu?.enabled) {
    void host.UnifiedMenu.product?.(cIdx, iIdx, 'options');
    return;
  }
  invokeHook('syncMenuDataFromDOM', syncMenuDataFromDOM);
  const cat = menuState.currentMenuData?.[cIdx];
  const item = cat?.items?.[iIdx];
  if (!cat || !item) return;

  menuState.currentItemModifiersCidx = cIdx;
  menuState.currentItemModifiersIidx = iIdx;
  menuState.tempItemModifierGroups = JSON.parse(JSON.stringify(item.modifierGroups || [])) as ItemModifierGroupDraft[];
  menuState.itemModifiersSnapshotBeforeEdit = JSON.parse(JSON.stringify(item.modifierGroups || [])) as ItemModifierGroupDraft[];
  menuState.itemCustomizationCategoriesSnapshotBeforeEdit = JSON.parse(
    JSON.stringify((menuState.currentMenuData || []).filter(c => isCustomizationCategory(c)))
  ) as MenuCategoryDraft[];

  const modal = document.getElementById('itemModifiersModal');
  const titleEl = document.getElementById('item-modifiers-modal-title');
  if (titleEl) titleEl.innerText = tr('itemModifiersModalTitle');
  const subEl = document.getElementById('item-modifiers-modal-sub');
  if (subEl) subEl.innerText = tr('itemModifiersModalSub');

  menuState.itemModifierFilterMode = 'all';
  invokeHook('renderItemModifiersEditor', renderItemModifiersEditor);
  if (modal) {
    modal.style.display = 'flex';
    modal.scrollTop = 0;
    const body = document.getElementById('item-modifiers-modal-body');
    if (body) body.scrollTop = 0;
  }
}

export function closeItemModifiersModal(): void {
  const modal = document.getElementById('itemModifiersModal');
  if (modal) modal.style.display = 'none';

  if (
    menuState.currentItemModifiersCidx !== null &&
    menuState.currentItemModifiersIidx !== null &&
    menuState.itemModifiersSnapshotBeforeEdit
  ) {
    const item = menuState.currentMenuData?.[menuState.currentItemModifiersCidx]?.items?.[menuState.currentItemModifiersIidx];
    if (item) {
      item.modifierGroups = JSON.parse(JSON.stringify(menuState.itemModifiersSnapshotBeforeEdit)) as ItemModifierGroupDraft[];
    }
  }
  if (menuState.itemCustomizationCategoriesSnapshotBeforeEdit && menuState.currentMenuData) {
    const liveData = menuState.currentMenuData;
    menuState.itemCustomizationCategoriesSnapshotBeforeEdit.forEach(savedCat => {
      const liveCat = liveData.find(
        c => (savedCat.id && c.id === savedCat.id) || (savedCat.databaseId && c.databaseId === savedCat.databaseId)
      );
      if (liveCat) {
        if (Object.prototype.hasOwnProperty.call(savedCat, 'groups')) {
          liveCat.groups = JSON.parse(JSON.stringify(savedCat.groups)) as MenuOptionGroupDraft[];
        } else {
          delete liveCat.groups;
        }
      }
    });
  }

  const returnState = menuState.hubModalReturnState;
  menuState.currentItemModifiersCidx = null;
  menuState.currentItemModifiersIidx = null;
  menuState.tempItemModifierGroups = [];
  menuState.itemModifiersSnapshotBeforeEdit = null;
  menuState.itemCustomizationCategoriesSnapshotBeforeEdit = null;
  invokeHook('checkMenuDirty', checkMenuDirty);

  if (returnState) {
    menuState.hubModalReturnState = null;
    invokeHook('openItemDetailModal', () => undefined, returnState.catIdx, returnState.itemIdx);
  }
}

export function syncItemModifiersFromDOM(): void {}

export function goToCustomizationTabFromItemModal(): void {
  closeItemModifiersModal();
  invokeHook('closeItemDetailModal', () => undefined);
  setMenuSidebarTab('options');
  setTimeout(() => {
    invokeHook('handleCreateCustomFromSidebar', handleCreateCustomFromSidebar);
  }, 50);
}

export function updateItemModifiersToolbarCounts(): void {
  const container = document.getElementById('item-modifiers-modal-body');
  if (!container) return;
  const checkboxes = container.querySelectorAll<HTMLInputElement>('.item-mod-group-checkbox');
  let selectedCount = 0;
  checkboxes.forEach(cb => {
    if (cb.checked) selectedCount++;
  });
  const countBadge = document.getElementById('item-mod-selected-count-badge');
  if (countBadge) {
    const lang = readCurrentLang();
    const textTpl = tr('appliedGroupCountBadge') || (lang === 'vi' ? 'Đã chọn: {count} nhóm' : '已套用：{count} 組');
    countBadge.innerHTML = `<span class="item-modifiers-badge-dot"></span>${esc(textTpl.replace('{count}', String(selectedCount)))}`;
    if (selectedCount > 0) {
      countBadge.classList.add('active-badge');
    } else {
      countBadge.classList.remove('active-badge');
    }
  }
}

export function selectAllItemModifiers(select: boolean): void {
  const container = document.getElementById('item-modifiers-modal-body');
  if (!container) return;
  const checkboxes = container.querySelectorAll<HTMLInputElement>('.item-mod-group-checkbox');
  checkboxes.forEach(cb => {
    const card = cb.closest<HTMLElement>('.mod-lib-group-card');
    if (card && card.style.display !== 'none') {
      cb.checked = select;
      card.classList.toggle('is-selected', select);
      card.style.borderColor = select ? '#2563eb' : '#e2e8f0';
      card.style.background = select ? '#f8faff' : '#ffffff';
    }
  });
  updateItemModifiersToolbarCounts();
  filterItemModifierCards();
}

export function filterItemModifierCards(searchTerm?: string): void {
  const grid = document.getElementById('item-modifiers-cards-grid');
  if (!grid) return;
  const search = document.getElementById('item-modifiers-search') as HTMLInputElement | null;
  const normalize = (value: unknown) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  const term = normalize(searchTerm === undefined ? search?.value : searchTerm).trim();
  let visibleCount = 0;
  grid.querySelectorAll<HTMLElement>('.mod-lib-group-card').forEach(card => {
    const matches = normalize(card.getAttribute('data-group-search')).includes(term);
    const selected = Boolean(card.querySelector<HTMLInputElement>('.item-mod-group-checkbox')?.checked);
    const visible = matches && (menuState.itemModifierFilterMode !== 'selected' || selected);
    card.style.display = visible ? '' : 'none';
    if (visible) visibleCount++;
  });
  const empty = document.getElementById('item-modifiers-filter-empty');
  if (empty) empty.hidden = visibleCount > 0;
}

export function setItemModifierFilter(mode: string): void {
  menuState.itemModifierFilterMode = mode === 'selected' ? 'selected' : 'all';
  (['all', 'selected'] as const).forEach(value => {
    document
      .getElementById(`item-mod-filter-${value}`)
      ?.setAttribute('aria-pressed', String(menuState.itemModifierFilterMode === value));
  });
  filterItemModifierCards();
}

export function toggleItemModifierCardSelection(gIdx: number, forcedChecked?: boolean): void {
  const cb = document.getElementById(`item-mod-grp-cb-${gIdx}`) as HTMLInputElement | null;
  if (!cb) return;
  cb.checked = forcedChecked !== undefined ? forcedChecked : !cb.checked;
  const card = cb.closest<HTMLElement>('.mod-lib-group-card');
  if (card) {
    card.classList.toggle('is-selected', cb.checked);
    card.style.borderColor = cb.checked ? '#2563eb' : '#e2e8f0';
    card.style.background = cb.checked ? '#f8faff' : '#ffffff';
  }
  updateItemModifiersToolbarCounts();
  filterItemModifierCards();
}

export function toggleItemModifierGroupRequired(gIdx: number): void {
  const container = document.getElementById('item-modifiers-cards-grid');
  if (!container) return;
  const cards = container.querySelectorAll('.mod-lib-group-card');
  if (!cards[gIdx]) return;

  const cb = document.getElementById(`item-mod-grp-cb-${gIdx}`);
  const grpId = cb ? cb.getAttribute('data-group-id') : null;
  if (!grpId) return;

  let foundGroup: { isRequired?: boolean; title?: string; name?: string } | null = null;
  (menuState.currentMenuData || [])
    .filter(c => isCustomizationCategory(c))
    .forEach(custCat => {
      (custCat.groups || []).forEach(g => {
        const gid = String(g.id || '');
        const canonId = String(g.canonicalId || '');
        if (gid === grpId || canonId === grpId || `mg_${gid}` === grpId || gid === `mg_${grpId}`) {
          g.isRequired = !g.isRequired;
          foundGroup = g;
        }
      });
    });

  if (Array.isArray(menuState.tempItemModifierGroups)) {
    menuState.tempItemModifierGroups.forEach(existing => {
      const eid = String(existing.id || '');
      const canonId = String((existing as { canonicalId?: string }).canonicalId || '');
      if (eid === grpId || canonId === grpId || `mg_${eid}` === grpId || eid === `mg_${grpId}`) {
        existing.isRequired = foundGroup ? foundGroup.isRequired : !existing.isRequired;
        if (!foundGroup) foundGroup = existing;
      }
    });
  }

  const reqBtn = document.getElementById(`item-mod-req-btn-${gIdx}`);
  if (reqBtn && foundGroup) {
    const isNowReq = Boolean((foundGroup as { isRequired?: boolean }).isRequired);
    const label = (foundGroup as { title?: string; name?: string }).title || (foundGroup as { name?: string }).name || '';
    reqBtn.className = `mod-badge-interactive ${isNowReq ? 'is-required' : 'is-optional'}`;
    reqBtn.setAttribute('aria-label', `${label}: ${tr(isNowReq ? 'toggleRequiredOff' : 'toggleRequiredOn')}`);
    reqBtn.title = isNowReq
      ? tr('toggleRequiredOff') || 'Bấm để đổi thành Tự chọn'
      : tr('toggleRequiredOn') || 'Bấm để đổi thành Bắt buộc';
    reqBtn.innerHTML = `
      <span class="mod-badge-dot"></span>
      <span>${isNowReq ? tr('badgeRequired') || 'Bắt buộc' : tr('badgeOptional') || 'Tùy chọn'}</span>
    `;
  }

  invokeHook('markMenuDirty', markMenuDirty);
}

export function renderItemModifiersEditor(): void {
  const container = document.getElementById('item-modifiers-modal-body');
  if (!container) return;
  const cat =
    menuState.currentItemModifiersCidx !== null ? menuState.currentMenuData?.[menuState.currentItemModifiersCidx] : undefined;
  const item = menuState.currentItemModifiersIidx !== null ? cat?.items?.[menuState.currentItemModifiersIidx] : undefined;
  const inherited = cat ? getInheritedItemModifierGroups(cat) : [];
  const libraryGroups: Array<MenuOptionGroupDraft & { selectionType?: string; name?: string }> = [];

  (menuState.currentMenuData || [])
    .filter(c => isCustomizationCategory(c))
    .forEach(custCat => {
      (custCat.groups || []).forEach(g => {
        if (
          g.scope !== 'order' &&
          !libraryGroups.some(
            existing =>
              String(existing.id) === String(g.id) ||
              (g.canonicalId && String(existing.canonicalId) === String(g.canonicalId))
          )
        ) {
          libraryGroups.push(g);
        }
      });
    });
  (menuState.tempItemModifierGroups || []).forEach(g => {
    if (
      !libraryGroups.some(
        existing => String(existing.id) === String(g.id) || String(existing.canonicalId) === String(g.id)
      )
    ) {
      libraryGroups.push({
        id: String(g.id || g.groupId || ''),
        name: g.name,
        selectionType: g.selectionType,
        isRequired: g.isRequired,
        minSelection: g.minSelection,
        maxSelection: g.maxSelection,
        sortOrder: g.sortOrder,
        title: String(g.name || (g as { title?: string }).title || ''),
        type: g.selectionType === 'multiple' ? 'checkbox' : 'radio',
        options: g.options || []
      });
    }
  });

  const selectedIds = new Set<string>();
  (menuState.tempItemModifierGroups || []).forEach(g => {
    const id = String(g.id || g.groupId || g.group_id || '');
    selectedIds.add(id);
    selectedIds.add(id.startsWith('mg_') ? id.slice(3) : `mg_${id}`);
  });

  const optionList = (options: MenuOptionDraft[]) =>
    options.length
      ? `<ul class="item-mod-option-list">${options
          .map(o => {
            const price = Number(o.price ?? o.surcharge ?? 0);
            return `<li><span>${esc(o.name || '')}</span><span>${price ? `${price > 0 ? '+' : ''}$${price}` : esc(tr('itemModNoSurcharge'))}</span></li>`;
          })
          .join('')}</ul>`
      : `<p class="item-mod-empty-options">${esc(tr('noOptionsInGroup'))}</p>`;

  container.innerHTML = `
    <aside class="item-mod-context">
      <section class="item-mod-context-card">
        <p class="item-mod-eyebrow">${esc(tr('itemModAppliesTo'))}</p>
        <h2>${esc(item?.name || '')}</h2>
        <p class="item-mod-category-name">${esc(cat?.title || '')}</p>
        <p class="item-mod-draft-note">${esc(tr('itemModDraftNote'))}</p>
      </section>
      <details class="item-mod-inherited-section">
        <summary>${esc(tr('inheritedFromCategory'))}<span>${inherited.length}</span></summary>
        <p>${esc(tr('itemModInheritedHelp'))}</p>
        ${
          inherited.length
            ? inherited
                .map(
                  g =>
                    `<details class="item-mod-inherited-group"><summary>${esc(g.title || (g as { name?: string }).name || '')}</summary>${optionList(g.options || [])}</details>`
                )
                .join('')
            : `<p class="item-mod-empty-options">${esc(tr('itemModNoInherited'))}</p>`
        }
      </details>
    </aside>
    <section class="item-mod-library" aria-labelledby="item-mod-library-title">
      <div class="item-mod-library-heading"><div><h2 id="item-mod-library-title">${esc(tr('itemModDirectTitle'))}</h2><p>${esc(tr('itemModDirectHelp'))}</p></div><span id="item-mod-selected-count-badge" class="item-modifiers-badge"></span></div>
      ${
        libraryGroups.length
          ? `
        <div class="item-modifiers-toolbar">
          <div class="item-mod-filter-tabs" aria-label="${esc(tr('itemModFilterLabel'))}">
            <button type="button" id="item-mod-filter-all" aria-pressed="${menuState.itemModifierFilterMode === 'all'}" onclick="setItemModifierFilter('all')">${esc(tr('itemModAllGroups'))} <span>${libraryGroups.length}</span></button>
            <button type="button" id="item-mod-filter-selected" aria-pressed="${menuState.itemModifierFilterMode === 'selected'}" onclick="setItemModifierFilter('selected')">${esc(tr('itemModSelectedGroups'))}</button>
          </div>
          <label class="item-modifiers-search-box"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4-4"/></svg><input id="item-modifiers-search" type="search" class="item-modifiers-search-input" aria-label="${esc(tr('searchModifierGroupsPlaceholder'))}" placeholder="${esc(tr('searchModifierGroupsPlaceholder'))}" oninput="filterItemModifierCards(this.value)"></label>
          <div class="item-modifiers-toolbar-actions"><button type="button" class="item-modifiers-quick-btn" onclick="selectAllItemModifiers(true)">${esc(tr('itemModSelectVisible'))}</button><button type="button" class="item-modifiers-quick-btn" onclick="selectAllItemModifiers(false)">${esc(tr('itemModClearVisible'))}</button></div>
        </div>
        <p class="item-mod-shared-note">${esc(tr('itemModSharedHelp'))}</p>
        <div class="item-modifiers-grid" id="item-modifiers-cards-grid"></div>
        <div id="item-modifiers-filter-empty" class="item-mod-filter-empty" hidden>${esc(tr('itemModNoFilterResults'))}</div>
      `
          : `<div class="item-mod-filter-empty"><h3>${esc(tr('noLibraryModifierGroups'))}</h3><p>${esc(tr('noLibraryModifierGroupsSub'))}</p><button type="button" class="btn btn-primary" onclick="goToCustomizationTabFromItemModal()">${esc(tr('itemModCreateGroup'))}</button></div>`
      }
    </section>`;

  const grid = document.getElementById('item-modifiers-cards-grid');
  if (!grid) return;
  libraryGroups.forEach((grp, gIdx) => {
    const id = String(grp.id || '');
    const selected = selectedIds.has(id) || selectedIds.has(String(grp.canonicalId || ''));
    const single = grp.type !== 'checkbox' && grp.selectionType !== 'multiple';
    const options = grp.options || [];
    const inheritedHere = inherited.some(
      g => String(g.canonicalId || g.id) === String(grp.canonicalId || grp.id)
    );
    const label = grp.title || grp.name || '';
    const card = document.createElement('article');
    card.className = `mod-lib-group-card ${selected ? 'is-selected' : ''}`;
    card.setAttribute('data-group-search', `${label} ${options.map(o => o.name).join(' ')}`);
    card.innerHTML = `
      <div class="mod-lib-group-header">
        <label class="item-mod-selection-label" for="item-mod-grp-cb-${gIdx}">
          <span class="mod-lib-checkbox-wrapper"><input type="checkbox" class="item-mod-group-checkbox" id="item-mod-grp-cb-${gIdx}" data-group-id="${esc(id)}" ${selected ? 'checked' : ''} onchange="toggleItemModifierCardSelection(${gIdx}, this.checked)"></span>
          <span class="item-mod-group-heading"><span class="mod-lib-group-name">${esc(label)}</span><span class="item-mod-group-meta">${esc(tr(single ? 'selectionTypeSingle' : 'selectionTypeMultiple'))} · ${options.length} ${esc(tr('modifierOptionCountUnit'))}${inheritedHere ? ` · ${esc(tr('inheritedFromCategory'))}` : ''}</span></span>
        </label>
        <button type="button" class="mod-badge-interactive ${grp.isRequired ? 'is-required' : 'is-optional'}" id="item-mod-req-btn-${gIdx}" onclick="toggleItemModifierGroupRequired(${gIdx})" aria-label="${esc(label)}: ${esc(tr(grp.isRequired ? 'toggleRequiredOff' : 'toggleRequiredOn'))}" title="${esc(tr('itemModSharedHelp'))}"><span class="mod-badge-dot"></span><span>${esc(tr(grp.isRequired ? 'badgeRequired' : 'badgeOptional'))}</span></button>
      </div>
      <details class="item-mod-options-preview"><summary><span>${esc(tr('itemModViewOptions'))}</span><span class="item-mod-preview-text">${esc(options.slice(0, 3).map(o => o.name).join(', '))}</span></summary>${optionList(options)}</details>`;
    grid.appendChild(card);
  });
  updateItemModifiersToolbarCounts();
  filterItemModifierCards();
}

export function addItemModifierGroup(): void {}
export function removeItemModifierGroup(): void {}
export function addItemModifierOption(): void {}
export function removeItemModifierOption(): void {}

export function saveItemModifiersModal(): void {
  const container = document.getElementById('item-modifiers-modal-body');
  const checkboxes = container ? container.querySelectorAll<HTMLInputElement>('.item-mod-group-checkbox') : [];

  if (checkboxes.length > 0) {
    const checkedGroupIds = new Set<string>();
    checkboxes.forEach(cb => {
      if (cb.checked) {
        const gid = cb.getAttribute('data-group-id');
        if (gid) checkedGroupIds.add(gid);
      }
    });

    const allGroupsPool: Array<MenuOptionGroupDraft & { selectionType?: string; name?: string }> = [];
    (menuState.currentMenuData || [])
      .filter(c => isCustomizationCategory(c))
      .forEach(c => {
        if (Array.isArray(c.groups)) allGroupsPool.push(...c.groups);
      });
    (menuState.tempItemModifierGroups || []).forEach(existing => {
      const existingCanon = (existing as { canonicalId?: string }).canonicalId;
      if (
        !allGroupsPool.some(
          g =>
            String(g.id) === String(existing.id) ||
            (existingCanon && String(g.canonicalId) === String(existingCanon))
        )
      ) {
        allGroupsPool.push({
          id: String(existing.id || ''),
          title: String(existing.name || ''),
          options: existing.options || [],
          ...existing
        });
      }
    });

    const cleanGroups: ItemModifierGroupDraft[] = [];
    allGroupsPool.forEach(grp => {
      const gid = String(grp.id || '');
      const canonId = String(grp.canonicalId || '');
      if (checkedGroupIds.has(gid) || (canonId && checkedGroupIds.has(canonId))) {
        const targetId =
          grp.canonicalId || grp.id || `mg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const isMulti = grp.type === 'checkbox' || grp.selectionType === 'multiple';
        cleanGroups.push({
          id: targetId,
          name: (grp.title || grp.name || '').trim(),
          selectionType: isMulti ? 'multiple' : 'single',
          isRequired: Boolean(grp.isRequired),
          minSelection: grp.minSelection ?? (isMulti ? 0 : grp.isRequired ? 1 : 0),
          maxSelection: grp.maxSelection ?? (isMulti ? 99 : 1),
          options: (grp.options || []).map(opt => {
            const subOpts = Array.isArray(opt.sub_options)
              ? opt.sub_options
              : Array.isArray(opt.subOptions)
                ? opt.subOptions
                : [];
            const isDef = Boolean(opt.isDefault ?? opt.is_default);
            const isOos = Boolean(opt.isOos ?? opt.isOutOfStock ?? opt.is_out_of_stock);
            const price = Number(opt.price || opt.surcharge || 0);
            return {
              id: opt.id,
              name: opt.name,
              price,
              surcharge: price,
              isDefault: isDef,
              is_default: isDef,
              isOutOfStock: isOos,
              is_out_of_stock: isOos,
              isOos,
              subOptions: subOpts,
              sub_options: subOpts
            };
          })
        });
      }
    });

    menuState.tempItemModifierGroups = cleanGroups;

    if (
      menuState.currentItemModifiersCidx !== null &&
      menuState.currentItemModifiersIidx !== null &&
      menuState.currentMenuData
    ) {
      const cat = menuState.currentMenuData[menuState.currentItemModifiersCidx];
      const item = cat?.items?.[menuState.currentItemModifiersIidx];
      if (cat && item) {
        const itemKey = String(item.id || `${cat.id}:${item.name}`);
        menuState.currentMenuData
          .filter(c => isCustomizationCategory(c))
          .forEach(custCategory => {
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
    menuState.tempItemModifierGroups = menuState.tempItemModifierGroups.filter(
      grp => grp.name && grp.name.trim() !== ''
    );
  }

  if (menuState.currentItemModifiersCidx !== null && menuState.currentItemModifiersIidx !== null) {
    const item = menuState.currentMenuData?.[menuState.currentItemModifiersCidx]?.items?.[menuState.currentItemModifiersIidx];
    if (item) {
      item.modifierGroups = menuState.tempItemModifierGroups;
      item.itemType = item.bundleRule?.groups?.length ? 'bundle' : 'standard';
      menuState.itemModifiersSnapshotBeforeEdit = null;
      menuState.itemCustomizationCategoriesSnapshotBeforeEdit = null;
      invokeHook('checkMenuDirty', checkMenuDirty);
      invokeHook('renderMenuCategoryEditor', renderMenuCategoryEditor, menuState.currentItemModifiersCidx);
    }
  }

  invokeHook('closeItemModifiersModal', closeItemModifiersModal);
}

export function openModifierLibraryModal(): void {
  if (menuState.currentItemModifiersCidx !== null && menuState.currentItemModifiersIidx !== null) {
    openItemModifiersModal(menuState.currentItemModifiersCidx, menuState.currentItemModifiersIidx);
  }
}

export function closeModifierLibraryModal(): void {
  const modal = document.getElementById('modifierLibraryModal');
  if (modal) modal.style.display = 'none';
}
