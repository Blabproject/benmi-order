/* Combo selection shared by new v2 bundles and existing v1 rules. */
(() => {
  let draft = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const getRule = item => item?.bundleRule || item?.targetItem?.bundleRule;
  const groupName = group => group.name || group.label?.['zh-TW'] || group.label?.vi || '搭配';
  const minOf = group => Number(group.minQuantity ?? group.minSelections ?? group.requiredCount ?? 1);
  const maxOf = group => Number(group.maxQuantity ?? group.maxSelections ?? group.requiredCount ?? minOf(group));
  const optionsFor = item => {
    if (!item) return [];
    if (typeof window.getEffectiveItemModifierGroups === 'function') {
      return window.getEffectiveItemModifierGroups(item);
    }
    const itemMods = item.modifierGroups || item.modifier_groups || [];
    let catMods = [];
    if (item.categoryId && Array.isArray(bootstrapData?.catalog)) {
      const cat = bootstrapData.catalog.find(c => c.id === item.categoryId);
      if (cat && Array.isArray(cat.modifierGroups) && cat.modifierGroups.length > 0) {
        catMods = cat.modifierGroups;
      }
    }
    if (!catMods.length) {
      catMods = (bootstrapData?.modifiers || []).filter(mod => 
        item.appliedModifiers?.includes('*') || item.appliedModifiers?.includes(mod.id) || item.appliedModifiers?.includes(mod.slug)
      );
    }
    const existingGids = new Set(itemMods.map(m => m.id));
    return [...itemMods, ...catMods.filter(m => !existingGids.has(m.id))];
  };
  const optionPrice = option => Number(option?.price || 0);
  const groupExtra = groups => groups.reduce((sum, group) => sum + (group.items || []).reduce((amount, item) => amount + itemExtra(item) * Number(item.quantity || 1), 0), 0);
  const itemExtra = item => Number(item.surcharge || 0) +
    (Array.isArray(item.subOptions) || (Array.isArray(item.groups) && item.groups.length > 0)
      ? groupExtra(item.groups || []) + (item.subOptions || []).reduce((sum, sub) => sum + Number(sub.price || 0), 0)
      : (item.modifiers || []).reduce((sum, mod) => sum + Number(mod.price || 0), 0));

  function buildFixed(group) {
    return (group.items || []).flatMap(fixed => {
      const item = (group.eligibleItems || []).find(candidate => candidate.id === fixed.itemId);
      if (!item) return [];
      return Array.from({ length: Number(fixed.quantity || 1) }, () => ({ itemId: item.id, name: item.name, quantity: 1,
        surcharge: Number(fixed.surcharge || item.surcharge || 0), modifiers: [] }));
    });
  }

  function validGroup(group, items) {
    if (!items || items.length < minOf(group) || items.length > maxOf(group)) return false;
    if (group.type === 'fixed') {
      const expected = new Map((group.items || []).map(item => [item.itemId, Number(item.quantity)]));
      for (const item of items) expected.set(item.itemId, Number(expected.get(item.itemId) || 0) - Number(item.quantity || 0));
      if ([...expected.values()].some(count => count !== 0)) return false;
    }
    if (!group.allowRepeats && new Set(items.map(item => item.itemId)).size !== items.length && group.type !== 'fixed') return false;
    return items.every(item => {
      const eligible = (group.eligibleItems || []).find(candidate => candidate.id === item.itemId && !candidate.isOutOfStock);
      if (!eligible) return false;
      if (Number(item.surcharge || 0) !== Number(eligible.surcharge || 0)) return false;
      if (Number(group.bundleVersion || 1) < 2) return true;
      return optionsFor(eligible).every(mod => {
        const count = (item.modifiers || []).filter(choice => choice.groupId === mod.id).length;
        return count >= Number(mod.minSelection || (mod.isRequired ? 1 : 0)) && (!mod.maxSelection || count <= Number(mod.maxSelection));
      });
    });
  }

  function render() {
    if (!draft) return;
    const { rule, selections, key, mode } = draft;
    const groupIndex = draft.groupIndex ?? 0;
    const isAddonsTab = draft.currentTab === 'addons';
    const hasAddons = Boolean(draft.catModifiers && draft.catModifiers.length > 0);
    const missingAddon = hasAddons ? draft.catModifiers.find(m => m.isRequired && (!draft.addonSelections?.single || !draft.addonSelections.single[m.slug])) : null;
    const isAddonsValid = !missingAddon;
    const allGroupsComplete = rule.groups.every(candidate => validGroup(candidate, selections[candidate.id]));

    // Navigation Step Tabs
    const nav = document.getElementById('bundle-step-nav');
    if (nav) {
      const totalSteps = rule.groups.length + (hasAddons ? 1 : 0);
      if (totalSteps > 1) {
        if (nav.style) nav.style.display = 'flex';
        const groupButtons = rule.groups.map((candidate, index) => {
          const isActive = !isAddonsTab && index === groupIndex;
          const isDone = validGroup(candidate, selections[candidate.id]);
          return `<button type="button" class="bundle-v2-nav ${isActive ? 'active' : ''}" onclick="bundleChooseGroup(${index})">${isDone ? '✓ ' : ''}${esc(groupName(candidate))}</button>`;
        }).join('');
        const addonButton = hasAddons ? `<button type="button" class="bundle-v2-nav ${isAddonsTab ? 'active' : ''}" onclick="bundleChooseAddonsTab()">${isAddonsValid ? '✓ ' : ''}自訂選項</button>` : '';
        nav.innerHTML = groupButtons + addonButton;
      } else {
        if (nav.style) nav.style.display = 'none';
        nav.innerHTML = '';
      }
    }

    const stale = rule.groups.some(candidate => (selections[candidate.id] || []).some(item => {
      const current = candidate.eligibleItems?.find(source => source.id === item.itemId);
      return current && Number(current.surcharge || 0) !== Number(item.surcharge || 0);
    }));
    document.getElementById('bundle-refresh-prices').style.display = stale ? 'block' : 'none';

    const catTabs = document.getElementById('bundle-cat-tabs');
    const list = document.getElementById('bundle-items-list');
    const addonsContainer = document.getElementById('bundle-addons-container');
    const quotaBadge = document.getElementById('bundle-quota-badge');

    if (isAddonsTab) {
      // --- ADDONS STEP VIEW ---
      document.getElementById('bundle-modal-group-label').textContent = '自訂餐點選項與加料';
      document.getElementById('bundle-modal-current-count').textContent = isAddonsValid ? '1' : '0';
      document.getElementById('bundle-modal-max-count').textContent = '1';
      document.getElementById('bundle-progress-fill').style.width = isAddonsValid ? '100%' : '50%';
      quotaBadge.style.display = 'inline-flex';
      quotaBadge.textContent = isAddonsValid ? '已完成' : '待選擇';
      quotaBadge.style.background = isAddonsValid ? '#10b981' : '#f59e0b';

      if (catTabs) {
        catTabs.style.display = 'none';
        catTabs.innerHTML = '';
      }
      if (list) {
        list.style.display = 'none';
        list.innerHTML = '';
      }

      if (addonsContainer) {
        addonsContainer.style.display = 'block';
        addonsContainer.style.borderTop = 'none';
        addonsContainer.style.paddingTop = '6px';
        let addonsHTML = `
          <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            <span>自訂餐點選項 / 加料 / 口味</span>
          </div>
        `;
        const getPrice = window.getModifierPrice || (typeof getModifierPrice === 'function' ? getModifierPrice : () => 0);
        draft.catModifiers.forEach(mod => {
          const isSingle = mod.selectionType === 'single';
          const reqBadge = mod.isRequired ? '<span class="modifier-req-badge" style="color:#ef4444; font-size:12px; font-weight:800; margin-left:4px;">*必選</span>' : '';
          addonsHTML += `
            <div class="bundle-addon-group" style="margin-bottom: 16px; background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0;">
              <div style="font-size: 13.5px; font-weight: 800; color: #334155; margin-bottom: 8px;">${esc(mod.name)}${reqBadge}</div>
          `;
          if (isSingle) {
            addonsHTML += `<div class="modifier-pills-row" style="margin-bottom: 4px; display: flex; flex-wrap: wrap; gap: 8px;">`;
            (mod.options || []).forEach((opt, optIdx) => {
              const isOos = Boolean(opt.isOutOfStock);
              const optId = (typeof getUniqueModifierOptionId === 'function') ? getUniqueModifierOptionId(mod, opt, optIdx) : (opt.id || `${mod.id || mod.slug}:${opt.name}:${optIdx}`);
              const isSelected = (draft.addonSelections?.single?.[mod.slug] === optId) ||
                                 (draft.addonSelections?.single?.[mod.slug] === opt.name) ||
                                 Boolean(draft.addonSelections?.selectedDetails?.[optId]);
              const price = Number(opt.price !== undefined ? opt.price : getPrice(opt.name));
              const priceText = price > 0 ? ` (+$${price})` : '';
              const oosBadge = isOos ? `<span class="modifier-oos-tag">已售完</span>` : '';
              addonsHTML += `
                <div class="modifier-pill ${isSelected ? 'active' : ''} ${isOos ? 'disabled' : ''}" 
                     style="min-height: 44px; padding: 8px 16px; border-radius: 10px; display: inline-flex; align-items: center; cursor: pointer;"
                     onclick="${isOos ? '' : `bundleSelectAddonSingle('${esc(mod.slug)}', '${esc(optId)}', '${esc(opt.name)}')`}">
                  <span>${esc(opt.name)}${priceText}</span>${oosBadge}
                </div>
              `;
            });
            addonsHTML += `</div>`;
          } else {
            addonsHTML += `<div class="modifier-checkbox-grid" style="margin-bottom: 4px; display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px;">`;
            (mod.options || []).forEach((opt, optIdx) => {
              const isOos = Boolean(opt.isOutOfStock);
              const optId = (typeof getUniqueModifierOptionId === 'function') ? getUniqueModifierOptionId(mod, opt, optIdx) : (opt.id || `${mod.id || mod.slug}:${opt.name}:${optIdx}`);
              const isChecked = Boolean(draft.addonSelections?.multiple?.[optId] || draft.addonSelections?.multiple?.[opt.name] || draft.addonSelections?.selectedDetails?.[optId]);
              const price = Number(opt.price !== undefined ? opt.price : getPrice(opt.name));
              const priceText = isOos ? `<span class="modifier-oos-tag">已售完</span>` : (price > 0 ? `+$${price}` : '$0');
              addonsHTML += `
                <div class="modifier-checkbox-chip ${isChecked ? 'active' : ''} ${isOos ? 'disabled' : ''}" 
                     style="min-height: 44px; padding: 8px 12px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;"
                     onclick="${isOos ? '' : `bundleToggleAddonMultiple('${esc(optId)}', '${esc(opt.name)}')`}">
                  <span>${esc(opt.name)}</span>
                  <span style="font-size: 12px; opacity: 0.85; font-weight: 700;">${priceText}</span>
                </div>
              `;
            });
            addonsHTML += `</div>`;
          }
          addonsHTML += `</div>`;
        });

        // Addon individual note
        addonsHTML += `
          <div style="margin-top: 12px; background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <label style="font-size: 13.5px; font-weight: 800; color: #334155; display: block; margin-bottom: 6px;">個別備註</label>
            <input type="text" maxlength="50" value="${esc(draft.addonSelections?.note || '')}"
                   oninput="bundleUpdateAddonNote(this.value)"
                   style="width: 100%; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 10px 14px; font-size: 14px; color: #1e293b; background: #fff; outline: none; box-sizing: border-box; min-height: 44px;">
          </div>
        `;
        addonsContainer.innerHTML = addonsHTML;
      }
    } else {
      // --- REGULAR GROUP STEP VIEW ---
      const group = rule.groups[groupIndex] || rule.groups[0];
      const items = selections[group.id] || [];
      const cleanGroupLabel = (group.name || '').replace(/^請選擇\s*(\d+\s*樣)?/g, '').trim() || '配菜';
      document.getElementById('bundle-modal-group-label').textContent = `請選擇 ${maxOf(group)} 樣${cleanGroupLabel}`;
      document.getElementById('bundle-modal-current-count').textContent = String(items.length);
      document.getElementById('bundle-modal-max-count').textContent = String(maxOf(group));
      const fillPct = maxOf(group) > 0 ? Math.min(100, Math.round((items.length / maxOf(group)) * 100)) : 0;
      document.getElementById('bundle-progress-fill').style.width = `${fillPct}%`;
      quotaBadge.style.display = validGroup(group, items) ? 'inline-flex' : 'none';
      quotaBadge.textContent = '已選滿';
      quotaBadge.style.background = '#10b981';

      if (addonsContainer) {
        addonsContainer.style.display = 'none';
        addonsContainer.innerHTML = '';
      }

      if (catTabs) {
        catTabs.style.display = group.type === 'fixed' ? 'none' : 'flex';
        const cats = new Map([['all', '全部']]);
        (group.eligibleItems || []).forEach(item => {
          const cat = bootstrapData?.catalog?.find(candidate => candidate.id === item.categoryId);
          if (cat) cats.set(cat.id, cat.name || cat.shortName);
        });
        catTabs.innerHTML = group.type === 'fixed' ? '' : [...cats].map(([id, label]) => `<button type="button" class="bundle-cat-tab-btn ${draft.category === id ? 'active' : ''}" onclick="bundleFilterCategory('${esc(id)}')">${esc(label)}</button>`).join('');
      }

      if (list) {
        list.style.display = 'flex';
        const display = group.type === 'fixed' ? items.map((item, index) => ({ item, index, source: (group.eligibleItems || []).find(it => it.id === item.itemId) }))
          : (group.eligibleItems || []).filter(it => draft.category === 'all' || it.categoryId === draft.category).map(source => ({ source }));
        const listed = display.map(entry => {
          const source = entry.source;
          if (!source) return '';
          const selected = group.type === 'fixed' ? [entry.item] : items.filter(item => item.itemId === source.id);
          const soldOut = Boolean(source.isOutOfStock);
          const count = selected.length;
          const canAdd = !soldOut && group.type !== 'fixed' && (maxOf(group) === 1 ? count === 0 : (items.length < maxOf(group) && (group.allowRepeats || count === 0)));
          const addAction = maxOf(group) === 1 && group.type !== 'fixed' ? `bundleSelectSingle('${esc(source.id)}')` : `bundleAddItem('${esc(source.id)}')`;
          const settings = selected.map((item, localIndex) => {
            const actualIndex = group.type === 'fixed' ? entry.index : items.indexOf(item);
            const mods = optionsFor(source);
            if (!mods.length) return '';
            const labels = (item.modifiers || []).map(mod => esc(mod.name)).join('、');
            const hasRequired = mods.some(mod => mod.isRequired || Number(mod.minSelection || 0) > 0);
            const isComplete = mods.every(mod => {
              const c = (item.modifiers || []).filter(choice => choice.groupId === mod.id).length;
              return c >= Number(mod.minSelection || (mod.isRequired ? 1 : 0));
            });
            const statusLabel = labels ? `<span class="bundle-v2-mod-labels">${labels}</span>`
              : (hasRequired ? '<span class="bundle-v2-mod-pending">需選擇客製化</span>' : '<span class="bundle-v2-mod-labels">可自選客製化</span>');
            return `<div class="bundle-v2-detail" onclick="event.stopPropagation()">
              ${statusLabel}
              <button type="button" class="bundle-v2-mod-btn ${!isComplete && hasRequired ? 'pulse' : ''}" onclick="bundleEditModifiers(${actualIndex})">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:-1px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>客製化${selected.length > 1 ? ` (${localIndex + 1})` : ''}
              </button>
            </div>`;
          }).filter(Boolean).join('');
          const extra = Number(source.surcharge || 0);
          const cleanName = (source.name || '').replace(/^(\d+|[A-Za-z])\.\s*/, '');
          const safeName = esc(cleanName);
          const priceLabel = extra > 0 ? ` (+<span style="color:#059669; font-weight:800;">$${extra}</span>)` : '';
          const oosBadge = soldOut ? '<span class="oos-badge" style="color:#dc2626; font-size:12px; font-weight:800; margin-left:6px;">(已售完)</span>' : '';
          const disabledPlus = !canAdd;

          if (group.type === 'fixed') {
            return `<div class="bundle-item-card selected">
              <div class="bundle-item-info">
                <span class="bundle-item-title">${safeName}</span>${priceLabel}
              </div>
              <span class="bundle-v2-badge-fixed">已包含</span>
            </div>${settings}`;
          }

          if (count === 0) {
            return `<div class="bundle-item-card ${soldOut ? 'sold-out' : ''}" ${canAdd ? `onclick="${addAction}" style="cursor:pointer;"` : ''} style="${soldOut ? 'opacity: 0.5; pointer-events: none;' : ''}">
              <div class="bundle-item-info">
                <span class="bundle-item-title">${safeName}</span>${priceLabel}${oosBadge}
              </div>
              <div class="bundle-stepper" onclick="event.stopPropagation()">
                <button type="button" class="bundle-btn-add ${disabledPlus ? 'disabled' : ''}" onclick="${addAction}" ${disabledPlus ? 'disabled' : ''} aria-label="Add ${safeName}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
              </div>
            </div>`;
          }

          return `<div class="bundle-item-card selected ${soldOut ? 'sold-out' : ''}" style="${soldOut ? 'opacity: 0.5; pointer-events: none;' : ''}">
            <div class="bundle-item-info">
              <span class="bundle-item-title">${safeName}</span>${priceLabel}${oosBadge}
            </div>
            <div class="bundle-stepper" onclick="event.stopPropagation()">
              <button type="button" class="bundle-btn-minus" onclick="bundleRemoveLastItemOf('${esc(source.id)}')" aria-label="Decrease">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <span class="bundle-qty-val">${count}</span>
              <button type="button" class="bundle-btn-plus ${disabledPlus ? 'disabled' : ''}" onclick="${addAction}" ${disabledPlus ? 'disabled' : ''} aria-label="Increase">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
            </div>
          </div>${settings}`;
        }).join('');
        const orphaned = group.type === 'fixed' ? '' : items.map((item, index) => ({ item, index })).filter(({ item }) => !(group.eligibleItems || []).some(source => source.id === item.itemId)).map(({ item, index }) =>
          `<div class="bundle-item-card sold-out"><div class="bundle-item-info"><span class="bundle-item-title">${esc(item.name || item.itemId)}</span><span style="color:#dc2626; font-size:12px; margin-left:8px;">已無法選擇，請移除</span></div><button type="button" class="bundle-btn-minus" onclick="bundleRemoveItem(${index})">✕</button></div>`).join('');
        list.innerHTML = listed + orphaned || '<p class="bundle-v2-empty">目前沒有可選餐點</p>';
      }
    }

    // Confirmation Button State
    const btn = document.getElementById('bundle-confirm-btn');
    if (!allGroupsComplete) {
      const missingIdx = rule.groups.findIndex(candidate => !validGroup(candidate, selections[candidate.id]));
      const targetGroup = rule.groups[missingIdx] || rule.groups[0];
      const targetRemain = Math.max(0, minOf(targetGroup) - (selections[targetGroup.id]?.length || 0));
      const targetLabel = (targetGroup.name || '').replace(/^請選擇\s*(\d+\s*樣)?/g, '').trim() || '配菜';
      btn.disabled = false;
      btn.className = 'bundle-confirm-btn pending';
      btn.innerHTML = `還需選擇 ${targetRemain} 樣${targetLabel} <span style="font-size: 13px; font-weight: 600; opacity: 0.85; margin-left: 4px;">(未完成)</span>`;
      btn.onclick = () => bundleChooseGroup(missingIdx >= 0 ? missingIdx : 0);
    } else if (!isAddonsValid) {
      btn.disabled = false;
      btn.className = 'bundle-confirm-btn pending';
      btn.innerHTML = `請選擇「${esc(missingAddon.name)}」 <span style="font-size: 13px; font-weight: 600; opacity: 0.85; margin-left: 4px;">(套餐選項)</span>`;
      btn.onclick = () => bundleChooseAddonsTab();
    } else {
      btn.disabled = false;
      btn.className = 'bundle-confirm-btn ready';
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><polyline points="20 6 9 17 4 12"></polyline></svg>確認套餐組合 <span style="font-size: 13px; font-weight: 600; opacity: 0.9; margin-left: 4px;">(全部完成)</span>`;
      btn.onclick = () => confirmBundleSelection();
    }

    const copy = document.getElementById('bundle-copy-previous');
    if (copy) copy.style.display = draft.portionIndex > 0 && mode === 'new' ? 'block' : 'none';
  }

  window.openBundleBuilderModal = function(catSlug, origName, portionIndex) {
    const key = catSlug + '_' + origName;
    const itemInfo = resolveCatalogItem(key);
    const rule = getRule(itemInfo);
    if (!rule?.groups?.length) return;
    if (rule.version === 3 && window.UnifiedOptions) return window.UnifiedOptions.open(catSlug, origName, portionIndex);
    rule.groups.forEach(group => { group.bundleVersion = Number(rule.version || 1); });
    const targetIndex = Number.isInteger(portionIndex) ? portionIndex : Number(cart[key] || 0);
    const existing = window.bundleCartData?.[key]?.[targetIndex];
    const selections = {};
    for (const group of rule.groups) {
      const prior = existing?.groups?.find(saved => saved.groupId === group.id);
      const previous = prior ? (prior.items || []).flatMap(item => Array.from({ length: Number(item.quantity || 1) }, () => ({ ...item, quantity: 1, modifiers: [...(item.modifiers || [])] }))) : [];
      if (group.type === 'fixed') {
        const remaining = [...previous];
        selections[group.id] = buildFixed(group).map(item => {
          const oldIndex = remaining.findIndex(old => old.itemId === item.itemId);
          const old = oldIndex >= 0 ? remaining.splice(oldIndex, 1)[0] : null;
          return old ? { ...item, surcharge: old.surcharge ?? item.surcharge, modifiers: [...(old.modifiers || [])] } : item;
        });
      } else selections[group.id] = previous;
    }
    const firstMissing = rule.groups.findIndex(group => !validGroup(group, selections[group.id]));

    // Check item/category modifiers for this combo
    const getItemModsFn = typeof getItemModifiers === 'function' ? getItemModifiers : (window.getItemModifiers || (typeof getCategoryModifiers === 'function' ? getCategoryModifiers : (window.getCategoryModifiers || (() => []))));
    const catModifiers = getItemModsFn(catSlug, origName);
    let addonSelections = null;
    if (catModifiers && catModifiers.length > 0) {
      const cData = window.customizeData || customizeData || {};
      const priorAddons = cData?.[key]?.[targetIndex];
      if (priorAddons) {
        addonSelections = JSON.parse(JSON.stringify(priorAddons));
      } else {
        const defaultSingle = {};
        catModifiers.filter(m => m.selectionType === 'single').forEach(m => {
          const defOpt = (m.options || []).find(o => o.isDefault && !o.isOutOfStock);
          if (defOpt) defaultSingle[m.slug] = defOpt.name;
        });
        const defaultMulti = {};
        catModifiers.filter(m => m.selectionType === 'multiple').forEach(m => {
          (m.options || []).filter(o => o.isDefault && !o.isOutOfStock).forEach(o => {
            defaultMulti[o.name] = true;
          });
        });
        addonSelections = { single: defaultSingle, multiple: defaultMulti, note: '' };
      }
    }

    const hasAddons = Boolean(catModifiers && catModifiers.length > 0);
    const allGroupsDone = rule.groups.every(g => validGroup(g, selections[g.id]));
    const initialTab = (allGroupsDone && hasAddons) ? 'addons' : 'group';
    draft = { key, catSlug, origName, itemInfo, rule, selections, catModifiers, addonSelections, portionIndex: targetIndex, groupIndex: Math.max(0, firstMissing), currentTab: initialTab, category: 'all', mode: existing ? 'edit' : 'new' };
    document.getElementById('bundle-modal-item-name').textContent = `${itemInfo.displayName || origName}${targetIndex ? ` · 第 ${targetIndex + 1} 份` : ''}`;
    document.getElementById('bundle-builder-modal').style.display = 'flex';
    render();
  };
  window.bundleQuickAdd = function(catSlug, origName) {
    const key = catSlug + '_' + origName;
    const rule = getRule(resolveCatalogItem(key));
    if (!rule?.groups?.length || rule.groups.some(group => group.type !== 'fixed')) return false;
    const groups = rule.groups.map(group => ({ groupId: group.id, groupName: groupName(group), items: buildFixed(group) }));
    if (rule.groups.some((group, index) => !validGroup(group, groups[index].items))) return false;
    const portionIndex = Number(cart[key] || 0);
    window.bundleCartData = window.bundleCartData || {};
    window.bundleCartData[key] = window.bundleCartData[key] || [];
    window.bundleCartData[key][portionIndex] = { portionIndex, groups };
    cart[key] = portionIndex + 1;
    const qty = document.getElementById('qty-' + catSlug + '-' + origName);
    if (qty) qty.textContent = String(cart[key]);
    const edit = document.getElementById('bundle-edit-btn-' + catSlug + '-' + origName);
    if (edit) edit.style.display = 'flex';
    updateTotal();
    return true;
  };
  window.closeBundleBuilderModal = function() { document.getElementById('bundle-builder-modal').style.display = 'none'; draft = null; };
  window.bundleChooseGroup = function(index) { if (!draft) return; draft.currentTab = 'group'; draft.groupIndex = index; draft.category = 'all'; render(); };
  window.bundleChooseAddonsTab = function() { if (!draft) return; draft.currentTab = 'addons'; render(); };
  window.bundleFocusGroup = function(groupId) { if (!draft) return; const index = draft.rule.groups.findIndex(group => group.id === groupId); if (index >= 0) window.bundleChooseGroup(index); };
  window.bundleFilterCategory = function(category) { if (!draft) return; draft.category = category; render(); };
  window.bundleSelectSingle = function(itemId) {
    if (!draft) return;
    const group = draft.rule.groups[draft.groupIndex];
    const source = group.eligibleItems.find(item => item.id === itemId);
    if (!source || source.isOutOfStock) return;
    const wasIncomplete = !validGroup(group, draft.selections[group.id]);
    draft.selections[group.id] = [{ itemId, name: source.name, quantity: 1, surcharge: Number(source.surcharge || 0), modifiers: [] }];

    const childMods = optionsFor(source);
    const hasRequiredChildMods = childMods.some(mod => mod.isRequired || Number(mod.minSelection || 0) > 0);
    if (hasRequiredChildMods) {
      render();
      window.bundleEditModifiers(0);
      return;
    }

    if (wasIncomplete && validGroup(group, draft.selections[group.id])) {
      const next = draft.rule.groups.findIndex(candidate => !validGroup(candidate, draft.selections[candidate.id]));
      if (next >= 0) {
        draft.groupIndex = next;
      } else if (draft.catModifiers && draft.catModifiers.length > 0) {
        draft.currentTab = 'addons';
      }
    }
    render();
  };
  window.bundleAddItem = function(itemId) {
    if (!draft) return;
    const group = draft.rule.groups[draft.groupIndex];
    const list = draft.selections[group.id];
    const source = group.eligibleItems.find(item => item.id === itemId);
    if (!source || source.isOutOfStock || list.length >= maxOf(group) || (!group.allowRepeats && list.some(item => item.itemId === itemId))) return;
    const newItem = { itemId, name: source.name, quantity: 1, surcharge: Number(source.surcharge || 0), modifiers: [] };
    list.push(newItem);

    const childMods = optionsFor(source);
    const hasRequiredChildMods = childMods.some(mod => mod.isRequired || Number(mod.minSelection || 0) > 0);
    if (hasRequiredChildMods) {
      render();
      window.bundleEditModifiers(list.length - 1);
      return;
    }

    if (validGroup(group, list)) {
      const next = draft.rule.groups.findIndex(candidate => !validGroup(candidate, draft.selections[candidate.id]));
      if (next >= 0) {
        draft.groupIndex = next;
      } else if (draft.catModifiers && draft.catModifiers.length > 0) {
        draft.currentTab = 'addons';
      }
    }
    render();
  };
  window.bundleRemoveItem = function(index) { if (!draft) return; draft.selections[draft.rule.groups[draft.groupIndex].id].splice(index, 1); render(); };
  window.bundleRemoveLastItemOf = function(itemId) {
    if (!draft) return;
    const group = draft.rule.groups[draft.groupIndex];
    if (!group || group.type === 'fixed') return;
    const list = draft.selections[group.id] || [];
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].itemId === itemId) {
        list.splice(i, 1);
        break;
      }
    }
    render();
  };
  window.bundleEditModifiers = function(index) {
    if (!draft) return;
    const group = draft.rule.groups[draft.groupIndex];
    const item = draft.selections[group.id][index];
    const source = group.eligibleItems.find(it => it.id === item?.itemId);
    if (!source) return;
    const mods = optionsFor(source);
    const body = mods.map(mod => {
      const choices = mod.options.filter(option => !option.isOutOfStock).map(option => {
        const selected = item.modifiers.some(choice => choice.groupId === mod.id && choice.optionId === option.id);
        return `<label class="bundle-v2-mod-option"><input type="${mod.selectionType === 'multiple' ? 'checkbox' : 'radio'}" name="bundle-mod-${esc(mod.id)}" ${selected ? 'checked' : ''} onchange="bundleSetModifier('${esc(mod.id)}','${esc(option.id)}',this.checked)"><span>${esc(option.name)}${optionPrice(option) ? ` +$${optionPrice(option)}` : ''}</span></label>`;
      }).join('');
      return `<fieldset class="bundle-v2-mod-group"><legend>${esc(mod.name)}${mod.isRequired ? ' · 必選' : ''}</legend>${choices}</fieldset>`;
    }).join('');
    draft.editingItem = item;
    document.getElementById('bundle-modifier-editor').innerHTML = `<div class="bundle-v2-mod-panel"><button type="button" onclick="bundleCloseModifiers()">← 返回選擇</button><h3>${esc(source.name)}</h3>${body}<button type="button" onclick="bundleCloseModifiers()">完成</button></div>`;
    document.getElementById('bundle-modifier-editor').style.display = 'block';
  };
  window.bundleSetModifier = function(groupId, optionId, checked) {
    const item = draft?.editingItem;
    const group = draft?.rule?.groups?.[draft?.groupIndex];
    const source = group?.eligibleItems?.find(it => it.id === item?.itemId);
    const availableMods = source ? optionsFor(source) : (bootstrapData?.modifiers || []);
    const mod = availableMods.find(candidate => candidate.id === groupId) || bootstrapData?.modifiers?.find(candidate => candidate.id === groupId);
    const option = mod?.options?.find(candidate => candidate.id === optionId);
    if (!item || !option || option.isOutOfStock) return;
    item.modifiers = item.modifiers.filter(choice => choice.groupId !== groupId || (mod.selectionType === 'multiple' && choice.optionId !== optionId));
    if (checked) {
      const count = item.modifiers.filter(choice => choice.groupId === groupId).length;
      if (mod.selectionType === 'multiple' && mod.maxSelection && count >= Number(mod.maxSelection)) {
        if (typeof customAlert === 'function') customAlert(`最多選擇 ${mod.maxSelection} 項`);
        else alert(`最多選擇 ${mod.maxSelection} 項`);
        window.bundleEditModifiers(draft.selections[draft.rule.groups[draft.groupIndex].id].indexOf(item));
        return;
      }
      item.modifiers.push({
        groupId,
        optionId,
        name: option.name,
        price: optionPrice(option),
        source: mod.isItemSpecific ? 'item' : 'category'
      });
    }
  };
  window.bundleCloseModifiers = function() {
    document.getElementById('bundle-modifier-editor').style.display = 'none';
    if (draft) {
      draft.editingItem = null;
      const group = draft.rule.groups[draft.groupIndex];
      if (group && validGroup(group, draft.selections[group.id])) {
        const next = draft.rule.groups.findIndex(candidate => !validGroup(candidate, draft.selections[candidate.id]));
        if (next >= 0) {
          draft.groupIndex = next;
        } else if (draft.catModifiers && draft.catModifiers.length > 0) {
          draft.currentTab = 'addons';
        }
      }
    }
    render();
  };
  window.bundleSelectAddonSingle = function(modSlug, optId, optName) {
    if (!draft) return;
    if (!draft.addonSelections) draft.addonSelections = { single: {}, multiple: {}, note: '', selectedDetails: {} };
    if (!draft.addonSelections.single) draft.addonSelections.single = {};
    if (!draft.addonSelections.selectedDetails) draft.addonSelections.selectedDetails = {};
    const effectiveOptId = optId || optName;
    const effectiveOptName = optName || optId;
    draft.addonSelections.single[modSlug] = effectiveOptName;
    for (const k of Object.keys(draft.addonSelections.selectedDetails)) {
      if (draft.addonSelections.selectedDetails[k]?.groupId === modSlug) {
        delete draft.addonSelections.selectedDetails[k];
      }
    }
    const getPrice = window.getModifierPrice || (() => 0);
    draft.addonSelections.selectedDetails[effectiveOptId] = {
      id: effectiveOptId,
      name: effectiveOptName,
      price: getPrice(effectiveOptName),
      groupId: modSlug
    };
    render();
  };
  window.bundleToggleAddonMultiple = function(optId, optName) {
    if (!draft) return;
    if (!draft.addonSelections) draft.addonSelections = { single: {}, multiple: {}, note: '', selectedDetails: {} };
    if (!draft.addonSelections.multiple) draft.addonSelections.multiple = {};
    if (!draft.addonSelections.selectedDetails) draft.addonSelections.selectedDetails = {};
    const key = optId || optName;
    const effectiveName = optName || optId;
    if (draft.addonSelections.multiple[key] || draft.addonSelections.selectedDetails[key]) {
      delete draft.addonSelections.multiple[key];
      if (optName) delete draft.addonSelections.multiple[optName];
      delete draft.addonSelections.selectedDetails[key];
    } else {
      draft.addonSelections.multiple[key] = true;
      const getPrice = window.getModifierPrice || (() => 0);
      draft.addonSelections.selectedDetails[key] = {
        id: key,
        name: effectiveName,
        price: getPrice(effectiveName)
      };
    }
    render();
  };
  window.bundleUpdateAddonNote = function(val) {
    if (!draft) return;
    if (!draft.addonSelections) draft.addonSelections = { single: {}, multiple: {}, note: '' };
    draft.addonSelections.note = String(val || '').slice(0, 50);
  };
  window.bundleCopyPrevious = function() {
    if (!draft || draft.portionIndex < 1) return;
    const previous = window.bundleCartData?.[draft.key]?.[draft.portionIndex - 1];
    if (!previous) return;
    for (const group of draft.rule.groups) {
      const saved = previous.groups.find(candidate => candidate.groupId === group.id);
      if (saved) draft.selections[group.id] = structuredClone(saved.items).flatMap(item => Array.from({ length: Number(item.quantity || 1) }, () => ({ ...item, quantity: 1 })));
    }
    if (draft.catModifiers && draft.catModifiers.length > 0) {
      const prevCustom = window.customizeData?.[draft.key]?.[draft.portionIndex - 1];
      if (prevCustom) {
        draft.addonSelections = JSON.parse(JSON.stringify(prevCustom));
      }
    }
    render();
  };
  window.bundleRefreshPrices = function() {
    if (!draft) return;
    for (const group of draft.rule.groups) for (const item of draft.selections[group.id] || []) {
      const current = group.eligibleItems?.find(source => source.id === item.itemId);
      if (current) item.surcharge = Number(current.surcharge || 0);
    }
    render();
  };
  window.confirmBundleSelection = function() {
    if (!draft || !draft.rule.groups.every(group => validGroup(group, draft.selections[group.id]))) return;

    if (draft.catModifiers && draft.catModifiers.length > 0) {
      const missingReq = draft.catModifiers.find(m => m.isRequired && (!draft.addonSelections?.single || !draft.addonSelections.single[m.slug]));
      if (missingReq) {
        draft.currentTab = 'addons';
        render();
        if (typeof customAlert === 'function') customAlert(`請選擇「${missingReq.name}」`);
        else alert(`請選擇「${missingReq.name}」`);
        return;
      }
    }

    const { key, catSlug, origName, portionIndex, rule, selections } = draft;
    const portion = { portionIndex, groups: rule.groups.map(group => ({ groupId: group.id, groupName: groupName(group),
      items: selections[group.id].map(item => ({ ...item, price: 0 })) })) };
    window.bundleCartData = window.bundleCartData || {};
    window.bundleCartData[key] = window.bundleCartData[key] || [];
    window.bundleCartData[key][portionIndex] = portion;

    if (draft.catModifiers && draft.catModifiers.length > 0) {
      window.customizeData = window.customizeData || {};
      window.customizeData[key] = window.customizeData[key] || [];
      window.customizeData[key][portionIndex] = JSON.parse(JSON.stringify(draft.addonSelections || { single: {}, multiple: {}, note: '' }));
    }

    cart[key] = Math.max(Number(cart[key] || 0), portionIndex + 1);
    const qty = document.getElementById('qty-' + catSlug + '-' + origName);
    if (qty) qty.textContent = String(cart[key]);
    const edit = document.getElementById('bundle-edit-btn-' + catSlug + '-' + origName);
    if (edit) edit.style.display = 'flex';
    window.closeBundleBuilderModal();
    updateTotal();
  };
  window.bundleRemovePortion = function(catSlug, origName, index) {
    const key = catSlug + '_' + origName;
    window.bundleCartData?.[key]?.splice(index, 1);
    if (window.bundleCartData?.[key]) window.bundleCartData[key].forEach((portion, pIndex) => { portion.portionIndex = pIndex; });
    if (window.customizeData?.[key]) {
      window.customizeData[key].splice(index, 1);
      if (window.customizeData[key].length === 0) delete window.customizeData[key];
    }
    cart[key] = Math.max(0, Number(cart[key] || 0) - 1);
    const qty = document.getElementById('qty-' + catSlug + '-' + origName);
    if (qty) qty.textContent = String(cart[key]);
    const edit = document.getElementById('bundle-edit-btn-' + catSlug + '-' + origName);
    if (edit) edit.style.display = cart[key] > 0 ? 'flex' : 'none';
    updateTotal();
  };
  window.bundlePortionExtra = portion => groupExtra(portion?.groups || []);
  window.checkAllBundlesComplete = function() {
    for (const key of Object.keys(cart || {})) {
      if (!cart[key]) continue;
      const item = resolveCatalogItem(key);
      const rule = getRule(item);
      if (!rule?.groups?.length) continue;
      if (rule.version === 3 && window.UnifiedOptions) {
        for (let i=0;i<cart[key];i++) if (!window.UnifiedOptions.valid(rule, window.bundleCartData?.[key]?.[i])) return {valid:false,error:((typeof currentLocale !== 'undefined' && currentLocale === 'vi') ? 'Vui lòng chọn đủ tùy chọn' : '請完成餐點選項'),key,portionIndex:i};
        continue;
      }
      const portions = window.bundleCartData?.[key] || [];
      for (let index = 0; index < cart[key]; index++) {
        const portion = portions[index];
        const missing = rule.groups.find(group => !validGroup(group, portion?.groups?.find(saved => saved.groupId === group.id)?.items?.flatMap(selected => Array.from({ length: Number(selected.quantity || 1) }, () => selected))));
        if (missing) return { valid: false, error: `${item.displayName || item.origName} · 第 ${index + 1} 份：請完成「${groupName(missing)}」`, key, portionIndex: index, groupId: missing.id };
      }
    }
    return { valid: true };
  };
})();
