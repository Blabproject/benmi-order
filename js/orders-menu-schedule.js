// ==========================================
// Benmi POS - Module: Visual Drag-and-Drop Menu Schedule Workspace
// ==========================================

(function () {
  const _msState = {
    initialized: false,
    loading: false,
    saving: false,
    pendingTapCatId: null,
    expandedCatIds: new Set(),
    hoveredWireKey: null,
    dragWire: null,
    baselineSnapshot: '',
    resizeObserver: null
  };

  function _msT(key, params) {
    return typeof t === 'function' ? t(key, params) : key;
  }

  function _msEsc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function _msGetLang() {
    return (typeof window !== 'undefined' && window.currentLang) || (typeof currentLang !== 'undefined' ? currentLang : 'zh-TW') || 'zh-TW';
  }

  function _msGetCatalogCategories() {
    const list = (typeof currentMenuData !== 'undefined' && Array.isArray(currentMenuData))
      ? currentMenuData
      : (Array.isArray(window.currentMenuData) ? window.currentMenuData : []);
    return list.filter(c => c && (c.type || 'catalog') === 'catalog');
  }

  function _msGetShifts() {
    return Array.isArray(window.storeOperatingShifts) ? window.storeOperatingShifts : [];
  }

  function _msCatKey(cat) {
    return String(cat?.databaseId || cat?.catId || cat?.id || '');
  }

  function _msBuildSnapshot() {
    const cats = _msGetCatalogCategories().map(c => ({
      id: _msCatKey(c),
      availabilityMode: c.availabilityMode === 'selected_shifts' ? 'selected_shifts' : 'all_shifts',
      hideWhenUnavailable: Boolean(c.hideWhenUnavailable),
      shiftIds: Array.isArray(c.shiftIds) ? [...c.shiftIds].sort() : [],
      items: (c.items || []).map(it => ({
        id: String(it.id || it.name || ''),
        availabilityMode: it.availabilityMode || 'inherit',
        shiftIds: Array.isArray(it.shiftIds) ? [...it.shiftIds].sort() : []
      }))
    }));
    return JSON.stringify(cats);
  }

  function hasUnsavedMenuScheduleChanges() {
    if (!_msState.baselineSnapshot) return false;
    return _msBuildSnapshot() !== _msState.baselineSnapshot;
  }

  function _msFormatShiftSummary(shift) {
    const lang = _msGetLang();
    const isVi = lang === 'vi';
    const dayShort = isVi
      ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
      : ['日', '一', '二', '三', '四', '五', '六'];
    const windows = Array.isArray(shift?.windows) ? shift.windows.filter(w => w && w.isActive !== false) : [];
    if (windows.length === 0) return [];
    const byRange = new Map();
    for (const w of windows) {
      const range = `${w.startTime}–${w.endTime}`;
      if (!byRange.has(range)) byRange.set(range, []);
      const d = Number(w.dayOfWeek);
      if (!byRange.get(range).includes(d)) byRange.get(range).push(d);
    }
    const orderIdx = d => (d === 0 ? 7 : d);
    const chips = [];
    for (const [range, days] of byRange.entries()) {
      days.sort((a, b) => orderIdx(a) - orderIdx(b));
      const daysLabel = days.map(d => dayShort[d]).join(', ');
      chips.push(`${daysLabel} · ${range}`);
    }
    return chips;
  }

  function _msLinkCategoryToShift(catKey, shiftId) {
    const cat = _msGetCatalogCategories().find(c => _msCatKey(c) === String(catKey));
    const shift = _msGetShifts().find(s => String(s.id) === String(shiftId));
    if (!cat || !shift) return;
    if (!Array.isArray(cat.shiftIds)) cat.shiftIds = [];
    if (!cat.shiftIds.includes(shift.id)) {
      cat.shiftIds.push(shift.id);
    }
    if (cat.availabilityMode !== 'selected_shifts') {
      cat.availabilityMode = 'selected_shifts';
      if (cat.hideWhenUnavailable === undefined) cat.hideWhenUnavailable = true;
    }
    _msState.pendingTapCatId = null;
    if (typeof markMenuDirty === 'function') markMenuDirty();
    renderMenuScheduleWorkspace();
  }

  function _msUnlinkCategoryFromShift(catKey, shiftId) {
    const cat = _msGetCatalogCategories().find(c => _msCatKey(c) === String(catKey));
    if (!cat) return;
    cat.shiftIds = (Array.isArray(cat.shiftIds) ? cat.shiftIds : []).filter(id => String(id) !== String(shiftId));
    if (cat.shiftIds.length === 0) {
      cat.availabilityMode = 'all_shifts';
    }
    if (typeof markMenuDirty === 'function') markMenuDirty();
    renderMenuScheduleWorkspace();
  }

  function _msResetCategoryToAllShifts(catKey) {
    const cat = _msGetCatalogCategories().find(c => _msCatKey(c) === String(catKey));
    if (!cat) return;
    cat.availabilityMode = 'all_shifts';
    cat.shiftIds = [];
    if (_msState.pendingTapCatId === catKey) _msState.pendingTapCatId = null;
    if (typeof markMenuDirty === 'function') markMenuDirty();
    renderMenuScheduleWorkspace();
  }

  function _msToggleCategoryHide(catKey, isHidden) {
    const cat = _msGetCatalogCategories().find(c => _msCatKey(c) === String(catKey));
    if (!cat) return;
    cat.hideWhenUnavailable = Boolean(isHidden);
    if (typeof markMenuDirty === 'function') markMenuDirty();
    renderMenuScheduleWorkspace();
  }

  function _msToggleExpandItems(catKey) {
    if (_msState.expandedCatIds.has(catKey)) _msState.expandedCatIds.delete(catKey);
    else _msState.expandedCatIds.add(catKey);
    renderMenuScheduleWorkspace();
  }

  function _msSetItemOverrideMode(catKey, itemIdx, mode) {
    const cat = _msGetCatalogCategories().find(c => _msCatKey(c) === String(catKey));
    const item = cat && cat.items && cat.items[itemIdx];
    if (!item) return;
    item.availabilityMode = (mode === 'all_shifts' || mode === 'selected_shifts') ? mode : 'inherit';
    if (item.availabilityMode !== 'selected_shifts') {
      item.shiftIds = [];
    } else if (!Array.isArray(item.shiftIds)) {
      item.shiftIds = [];
    }
    if (typeof markMenuDirty === 'function') markMenuDirty();
    renderMenuScheduleWorkspace();
  }

  function _msToggleItemShift(catKey, itemIdx, shiftId, checked) {
    const cat = _msGetCatalogCategories().find(c => _msCatKey(c) === String(catKey));
    const item = cat && cat.items && cat.items[itemIdx];
    if (!item) return;
    const list = Array.isArray(item.shiftIds) ? [...item.shiftIds] : [];
    if (checked) {
      if (!list.includes(shiftId)) list.push(shiftId);
    } else {
      const idx = list.indexOf(shiftId);
      if (idx >= 0) list.splice(idx, 1);
    }
    item.shiftIds = list;
    item.availabilityMode = 'selected_shifts';
    if (typeof markMenuDirty === 'function') markMenuDirty();
    renderMenuScheduleWorkspace();
  }

  function _msDrawWires() {
    const canvas = document.getElementById('menu-schedule-canvas');
    const svg = document.getElementById('menu-schedule-svg-layer');
    if (!canvas || !svg) return;

    const cRect = canvas.getBoundingClientRect();
    if (!cRect.width || !cRect.height) return;
    svg.setAttribute('width', String(cRect.width));
    svg.setAttribute('height', String(cRect.height));
    svg.setAttribute('viewBox', `0 0 ${cRect.width} ${cRect.height}`);

    const cats = _msGetCatalogCategories();
    const shifts = _msGetShifts();
    const shiftTypeMap = new Map(shifts.map(s => [String(s.id), s.shiftType]));

    let svgContent = '';
    for (const cat of cats) {
      if (cat.availabilityMode !== 'selected_shifts') continue;
      const catKey = _msCatKey(cat);
      const portEl = canvas.querySelector(`[data-cat-port="${CSS.escape(catKey)}"]`);
      if (!portEl) continue;
      const pRect = portEl.getBoundingClientRect();
      const x1 = pRect.left + pRect.width / 2 - cRect.left;
      const y1 = pRect.top + pRect.height / 2 - cRect.top;

      for (const sid of (cat.shiftIds || [])) {
        const targetEl = canvas.querySelector(`[data-shift-port="${CSS.escape(String(sid))}"]`);
        if (!targetEl) continue;
        const tRect = targetEl.getBoundingClientRect();
        const x2 = tRect.left + tRect.width / 2 - cRect.left;
        const y2 = tRect.top + tRect.height / 2 - cRect.top;
        const dx = Math.max(48, Math.abs(x2 - x1) * 0.5);
        const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const isMenuWin = shiftTypeMap.get(String(sid)) === 'menu_window';
        const strokeColor = isMenuWin ? '#d97706' : '#2563eb';
        const wireKey = `${catKey}::${sid}`;
        const isHovered = _msState.hoveredWireKey === wireKey;

        svgContent += `
          <g class="ms-wire-group" data-wire-cat="${_msEsc(catKey)}" data-wire-shift="${_msEsc(sid)}" style="pointer-events:auto; cursor:pointer;">
            <path d="${pathD}" fill="none" stroke="transparent" stroke-width="18"></path>
            <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="${isHovered ? 4.5 : 3}" stroke-linecap="round" opacity="${isHovered ? '1' : '0.82'}"></path>
            <circle cx="${x1}" cy="${y1}" r="4.5" fill="${strokeColor}"></circle>
            <circle cx="${x2}" cy="${y2}" r="4.5" fill="${strokeColor}"></circle>
            <g transform="translate(${midX}, ${midY})">
              <circle r="${isHovered ? 12 : 10}" fill="#ffffff" stroke="${strokeColor}" stroke-width="2"></circle>
              <path d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5" stroke="#dc2626" stroke-width="2" stroke-linecap="round"></path>
            </g>
          </g>
        `;
      }
    }

    if (_msState.dragWire) {
      const { x1, y1, x2, y2 } = _msState.dragWire;
      const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
      const previewD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      svgContent += `
        <path d="${previewD}" fill="none" stroke="#2563eb" stroke-width="3.5" stroke-dasharray="7 5" stroke-linecap="round" style="pointer-events:none;"></path>
        <circle cx="${x2}" cy="${y2}" r="6" fill="#2563eb" style="pointer-events:none;"></circle>
      `;
    }

    svg.innerHTML = svgContent;

    svg.querySelectorAll('.ms-wire-group').forEach(g => {
      g.addEventListener('click', (evt) => {
        evt.stopPropagation();
        const cKey = g.getAttribute('data-wire-cat');
        const sId = g.getAttribute('data-wire-shift');
        if (cKey && sId) _msUnlinkCategoryFromShift(cKey, sId);
      });
      g.addEventListener('mouseenter', () => {
        _msState.hoveredWireKey = `${g.getAttribute('data-wire-cat')}::${g.getAttribute('data-wire-shift')}`;
        _msDrawWires();
      });
      g.addEventListener('mouseleave', () => {
        _msState.hoveredWireKey = null;
        _msDrawWires();
      });
    });
  }

  function _msBindCanvasInteractions(canvas) {
    if (!canvas) return;

    // 1. Pointer drag from Category port -> Shift card/port (works seamlessly on desktop & touch)
    canvas.querySelectorAll('[data-cat-port]').forEach(portBtn => {
      portBtn.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
        e.preventDefault();
        e.stopPropagation();
        const catKey = portBtn.getAttribute('data-cat-port');
        const cRect = canvas.getBoundingClientRect();
        const pRect = portBtn.getBoundingClientRect();
        const startX = pRect.left + pRect.width / 2 - cRect.left;
        const startY = pRect.top + pRect.height / 2 - cRect.top;
        const originClientX = e.clientX;
        const originClientY = e.clientY;
        let movedEnough = false;
        let highlightedShiftEl = null;

        const clearShiftHighlight = () => {
          if (highlightedShiftEl) {
            highlightedShiftEl.style.borderColor = highlightedShiftEl.getAttribute('data-default-border') || '#e2e8f0';
            highlightedShiftEl.style.background = '#ffffff';
            highlightedShiftEl.style.boxShadow = 'none';
            highlightedShiftEl = null;
          }
        };

        const onMove = (moveEvt) => {
          const dist = Math.hypot(moveEvt.clientX - originClientX, moveEvt.clientY - originClientY);
          if (dist > 6) movedEnough = true;
          if (!movedEnough) return;
          const liveRect = canvas.getBoundingClientRect();
          _msState.dragWire = {
            catKey,
            x1: startX,
            y1: startY,
            x2: moveEvt.clientX - liveRect.left,
            y2: moveEvt.clientY - liveRect.top
          };
          _msDrawWires();

          const under = document.elementFromPoint(moveEvt.clientX, moveEvt.clientY);
          const targetShiftCard = under && under.closest ? under.closest('[data-shift-card]') : null;
          if (highlightedShiftEl && highlightedShiftEl !== targetShiftCard) clearShiftHighlight();
          if (targetShiftCard) {
            highlightedShiftEl = targetShiftCard;
            targetShiftCard.style.borderColor = '#2563eb';
            targetShiftCard.style.background = '#eff6ff';
            targetShiftCard.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.22)';
          }
        };

        const onUp = (upEvt) => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.removeEventListener('pointercancel', onUp);
          clearShiftHighlight();

          if (!movedEnough) {
            // Tap-to-connect toggle fallback for accessibility / quick iPad tap
            _msState.dragWire = null;
            _msState.pendingTapCatId = (_msState.pendingTapCatId === catKey) ? null : catKey;
            renderMenuScheduleWorkspace();
            return;
          }

          const under = document.elementFromPoint(upEvt.clientX, upEvt.clientY);
          const targetShiftCard = under && under.closest ? under.closest('[data-shift-card]') : null;
          const shiftId = targetShiftCard ? targetShiftCard.getAttribute('data-shift-card') : null;
          _msState.dragWire = null;
          if (catKey && shiftId) {
            _msLinkCategoryToShift(catKey, shiftId);
          } else {
            _msDrawWires();
          }
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
      });
    });

    // 2. HTML5 Card Drag-and-Drop & Tap-to-connect on Shift cards
    canvas.querySelectorAll('[data-cat-card]').forEach(catCard => {
      catCard.addEventListener('dragstart', (e) => {
        const catKey = catCard.getAttribute('data-cat-card');
        if (e.dataTransfer && catKey) {
          e.dataTransfer.setData('text/plain', catKey);
          e.dataTransfer.effectAllowed = 'link';
        }
      });
    });

    canvas.querySelectorAll('[data-shift-card]').forEach(shiftCard => {
      const shiftId = shiftCard.getAttribute('data-shift-card');
      shiftCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'link';
        shiftCard.style.borderColor = '#2563eb';
        shiftCard.style.background = '#eff6ff';
      });
      shiftCard.addEventListener('dragleave', () => {
        shiftCard.style.borderColor = shiftCard.getAttribute('data-default-border') || '#e2e8f0';
        shiftCard.style.background = '#ffffff';
      });
      shiftCard.addEventListener('drop', (e) => {
        e.preventDefault();
        shiftCard.style.borderColor = shiftCard.getAttribute('data-default-border') || '#e2e8f0';
        shiftCard.style.background = '#ffffff';
        const catKey = e.dataTransfer ? e.dataTransfer.getData('text/plain') : null;
        if (catKey && shiftId) _msLinkCategoryToShift(catKey, shiftId);
      });
      shiftCard.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('button')) return;
        if (_msState.pendingTapCatId && shiftId) {
          _msLinkCategoryToShift(_msState.pendingTapCatId, shiftId);
        }
      });
    });
  }

  function renderMenuScheduleWorkspace() {
    const root = document.getElementById('menu-schedule-workspace-root');
    if (!root) return;

    const cats = _msGetCatalogCategories();
    const shifts = _msGetShifts();
    const isDirty = hasUnsavedMenuScheduleChanges();
    const catNameMap = new Map(cats.map(c => [_msCatKey(c), c.title || c.name || c.id]));

    const backSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
    const saveSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
    const clockSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

    const pendingCat = _msState.pendingTapCatId ? cats.find(c => _msCatKey(c) === _msState.pendingTapCatId) : null;
    const guideContent = pendingCat
      ? _msT('menuScheduleTapPickHint', { name: pendingCat.title || pendingCat.name || '' })
      : _msT('menuScheduleGuideText');

    const catsHtml = cats.length === 0
      ? `<div style="padding:20px; border:1.5px dashed #cbd5e1; border-radius:14px; color:#64748b; text-align:center;">${_msEsc(_msT('menuScheduleEmptyCats'))}</div>`
      : cats.map(cat => {
          const catKey = _msCatKey(cat);
          const safeCatKey = catKey.replace(/'/g, "\\'");
          const isSelectedMode = cat.availabilityMode === 'selected_shifts';
          const linkedShiftIds = Array.isArray(cat.shiftIds) ? cat.shiftIds : [];
          const isPendingPort = _msState.pendingTapCatId === catKey;
          const isExpanded = _msState.expandedCatIds.has(catKey);
          const itemCount = Array.isArray(cat.items) ? cat.items.length : 0;

          const itemsOverrideHtml = isExpanded ? `
            <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #cbd5e1; display:flex; flex-direction:column; gap:8px;">
              ${(cat.items || []).map((it, idx) => {
                const itMode = it.availabilityMode || 'inherit';
                const itShiftIds = Array.isArray(it.shiftIds) ? it.shiftIds : [];
                return `
                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; gap:6px;">
                    <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px;">
                      <span style="font-weight:700; font-size:13px; color:#0f172a;">${_msEsc(it.name)}</span>
                      <select onchange="window.msSetItemOverrideMode('${safeCatKey}', ${idx}, this.value)" style="min-height:40px; padding:4px 8px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; font-size:12.5px; font-weight:700; font-family:inherit;">
                        <option value="inherit" ${itMode === 'inherit' ? 'selected' : ''}>${_msEsc(_msT('menuScheduleItemModeInherit'))}</option>
                        <option value="all_shifts" ${itMode === 'all_shifts' ? 'selected' : ''}>${_msEsc(_msT('menuScheduleItemModeAll'))}</option>
                        <option value="selected_shifts" ${itMode === 'selected_shifts' ? 'selected' : ''}>${_msEsc(_msT('menuScheduleItemModeSelected'))}</option>
                      </select>
                    </div>
                    ${itMode === 'selected_shifts' ? `
                      <div style="display:flex; flex-wrap:wrap; gap:6px;">
                        ${shifts.map(sh => {
                          const checked = itShiftIds.includes(sh.id);
                          const safeSid = String(sh.id).replace(/'/g, "\\'");
                          return `<label style="display:inline-flex; align-items:center; gap:6px; min-height:38px; padding:4px 10px; border-radius:8px; border:1px solid ${checked ? '#2563eb' : '#cbd5e1'}; background:${checked ? '#eff6ff' : '#fff'}; font-size:12px; font-weight:700; cursor:pointer;"><input type="checkbox" ${checked ? 'checked' : ''} onchange="window.msToggleItemShift('${safeCatKey}', ${idx}, '${safeSid}', this.checked)"><span>${_msEsc(sh.name)}</span></label>`;
                        }).join('')}
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          ` : '';

          return `
            <div data-cat-card="${_msEsc(catKey)}" draggable="true" style="position:relative; background:#ffffff; border:1.5px solid ${isPendingPort ? '#2563eb' : (isSelectedMode ? '#93c5fd' : '#e2e8f0')}; border-radius:14px; padding:14px 58px 14px 16px; box-shadow:0 1px 3px rgba(15,23,42,0.04); transition:border-color 0.15s ease;">
              <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
                <span style="font-size:16px; font-weight:800; color:#0f172a;">${_msEsc(cat.title || cat.name)}</span>
                <span style="font-size:12px; font-weight:700; padding:2px 8px; border-radius:9999px; background:#f1f5f9; color:#475569;">${itemCount} ${_msEsc(_msT('menuScheduleItemCountUnit'))}</span>
              </div>
              <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                <span style="font-size:12.5px; font-weight:800; padding:4px 10px; border-radius:8px; background:${isSelectedMode ? '#eff6ff' : '#ecfdf5'}; color:${isSelectedMode ? '#1d4ed8' : '#047857'}; border:1px solid ${isSelectedMode ? '#bfdbfe' : '#a7f3d0'};">
                  ${_msEsc(isSelectedMode ? _msT('menuScheduleModeSelected') : _msT('menuScheduleModeAll'))}${isSelectedMode ? ` (${linkedShiftIds.length})` : ''}
                </span>
                ${isSelectedMode ? `
                  <button type="button" onclick="window.msResetCategoryToAllShifts('${safeCatKey}')" style="min-height:38px; padding:4px 10px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc; color:#475569; font-size:12px; font-weight:700; cursor:pointer;">${_msEsc(_msT('menuScheduleResetAllBtn'))}</button>
                ` : ''}
              </div>
              ${isSelectedMode ? `
                <label style="display:inline-flex; align-items:center; gap:8px; min-height:44px; margin-top:8px; cursor:pointer; font-size:13px; font-weight:700; color:#334155;">
                  <input type="checkbox" ${cat.hideWhenUnavailable ? 'checked' : ''} onchange="window.msToggleCategoryHide('${safeCatKey}', this.checked)" style="width:19px; height:19px; accent-color:#2563eb;">
                  <span>${_msEsc(_msT('menuScheduleHideLabel'))}</span>
                </label>
              ` : ''}
              ${itemCount > 0 ? `
                <div style="margin-top:6px;">
                  <button type="button" onclick="window.msToggleExpandItems('${safeCatKey}')" style="min-height:36px; padding:4px 10px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; color:#334155; font-size:12px; font-weight:700; cursor:pointer;">
                    ${_msEsc(isExpanded ? _msT('menuScheduleHideItemsBtn') : _msT('menuScheduleShowItemsBtn'))}
                  </button>
                </div>
              ` : ''}
              ${itemsOverrideHtml}
              <button type="button" data-cat-port="${_msEsc(catKey)}" aria-label="${_msEsc(_msT('menuScheduleConnectPortAria'))}" title="${_msEsc(_msT('menuScheduleConnectPortAria'))}" style="position:absolute; right:-22px; top:50%; transform:translateY(-50%); width:44px; height:44px; border-radius:9999px; border:2.5px solid ${isPendingPort ? '#1d4ed8' : (isSelectedMode ? '#2563eb' : '#94a3b8')}; background:${isPendingPort ? '#2563eb' : '#ffffff'}; color:${isPendingPort ? '#ffffff' : '#2563eb'}; display:flex; align-items:center; justify-content:center; cursor:grab; box-shadow:0 2px 8px rgba(15,23,42,0.12); z-index:4; touch-action:none;">
                <span style="width:12px; height:12px; border-radius:9999px; background:currentColor; pointer-events:none;"></span>
              </button>
            </div>
          `;
        }).join('');

    const shiftsHtml = shifts.length === 0
      ? `<div style="padding:20px; border:1.5px dashed #cbd5e1; border-radius:14px; color:#64748b; text-align:center;">${_msEsc(_msT('menuScheduleEmptyShifts'))}</div>`
      : shifts.map(shift => {
          const sid = String(shift.id);
          const isMenuWin = shift.shiftType === 'menu_window';
          const defaultBorder = isMenuWin ? '#fde68a' : '#e2e8f0';
          const timeChips = _msFormatShiftSummary(shift);
          const linkedCats = cats.filter(c => c.availabilityMode === 'selected_shifts' && Array.isArray(c.shiftIds) && c.shiftIds.includes(sid));
          const safeSid = sid.replace(/'/g, "\\'");

          return `
            <div data-shift-card="${_msEsc(sid)}" data-default-border="${defaultBorder}" style="position:relative; background:#ffffff; border:1.5px solid ${defaultBorder}; border-radius:14px; padding:14px 16px 14px 34px; box-shadow:0 1px 3px rgba(15,23,42,0.04); transition:border-color 0.15s ease, background 0.15s ease;">
              <div data-shift-port="${_msEsc(sid)}" style="position:absolute; left:-22px; top:50%; transform:translateY(-50%); width:44px; height:44px; border-radius:9999px; border:2.5px solid ${isMenuWin ? '#d97706' : '#059669'}; background:#ffffff; display:flex; align-items:center; justify-content:center; z-index:4;">
                <span style="width:10px; height:10px; border-radius:9999px; background:${isMenuWin ? '#d97706' : '#059669'};"></span>
              </div>
              <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px;">
                <span style="font-size:16px; font-weight:800; color:#0f172a;">${_msEsc(shift.name)}</span>
                <span style="font-size:12px; font-weight:800; padding:3px 9px; border-radius:9999px; background:${isMenuWin ? '#fef3c7' : '#ecfdf5'}; color:${isMenuWin ? '#92400e' : '#047857'}; border:1px solid ${isMenuWin ? '#fde68a' : '#a7f3d0'};">
                  ${_msEsc(isMenuWin ? _msT('shiftTypeMenuWindow') : _msT('shiftTypeOperating'))}
                </span>
              </div>
              <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">
                ${timeChips.map(ch => `<span style="font-size:12.5px; font-weight:700; color:#475569; background:#f8fafc; border:1px solid #e2e8f0; padding:3px 8px; border-radius:8px;">${_msEsc(ch)}</span>`).join('')}
              </div>
              ${linkedCats.length > 0 ? `
                <div style="margin-top:10px; padding-top:8px; border-top:1px dashed #e2e8f0; display:flex; flex-wrap:wrap; gap:6px;">
                  ${linkedCats.map(lc => {
                    const ck = _msCatKey(lc);
                    const safeCk = ck.replace(/'/g, "\\'");
                    return `
                      <span style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:9999px; background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; font-size:12.5px; font-weight:800;">
                        <span>${_msEsc(catNameMap.get(ck) || lc.title)}</span>
                        <button type="button" onclick="window.msUnlinkCategoryFromShift('${safeCk}', '${safeSid}')" aria-label="Unlink" style="background:transparent; border:none; color:#dc2626; font-weight:900; font-size:14px; cursor:pointer; padding:0 2px; line-height:1;">×</button>
                      </span>
                    `;
                  }).join('')}
                </div>
              ` : ''}
            </div>
          `;
        }).join('');

    root.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px; max-width:1280px; margin:0 auto;">
        <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; background:#ffffff; border:1.5px solid var(--border, #e2e8f0); border-radius:16px; padding:14px 18px;">
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:12px;">
            <button type="button" onclick="leaveMenuScheduleToMenu()" style="min-height:48px; padding:10px 14px; border-radius:10px; border:1.5px solid #cbd5e1; background:#f8fafc; color:#0f172a; font-weight:800; font-size:14px; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
              ${backSvg}
              <span>${_msEsc(_msT('menuScheduleBackBtn'))}</span>
            </button>
            <div>
              <h2 style="margin:0; font-size:18px; font-weight:900; color:#0f172a;">${_msEsc(_msT('menuSchedulePageTitle'))}</h2>
              <div style="font-size:13px; color:#64748b; margin-top:2px;">${_msEsc(_msT('menuSchedulePageSub'))}</div>
            </div>
          </div>
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px;">
            <span style="padding:6px 12px; border-radius:9999px; font-size:12.5px; font-weight:800; background:${isDirty ? '#fef3c7' : '#ecfdf5'}; color:${isDirty ? '#92400e' : '#047857'}; border:1px solid ${isDirty ? '#fde68a' : '#a7f3d0'};">
              ${_msEsc(isDirty ? _msT('menuScheduleUnsavedPill') : _msT('menuScheduleSavedPill'))}
            </span>
            <button type="button" onclick="openHoursSettingsFromSchedule()" style="min-height:48px; padding:10px 14px; border-radius:10px; border:1.5px solid #cbd5e1; background:#fff; color:#334155; font-weight:800; font-size:13.5px; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
              ${clockSvg}
              <span>${_msEsc(_msT('menuScheduleOpenSettingsBtn'))}</span>
            </button>
            <button type="button" id="btn-save-menu-schedule" onclick="saveMenuScheduleWorkspace()" ${!isDirty || _msState.saving ? 'disabled' : ''} style="min-height:48px; padding:10px 18px; border-radius:10px; border:none; background:${isDirty ? '#00b900' : '#94a3b8'}; color:#fff; font-weight:900; font-size:14px; display:inline-flex; align-items:center; gap:6px; cursor:${isDirty ? 'pointer' : 'not-allowed'};">
              ${saveSvg}
              <span>${_msEsc(_msState.saving ? _msT('saving') : _msT('menuScheduleSaveBtn'))}</span>
            </button>
          </div>
        </div>

        <div style="background:${pendingCat ? '#eff6ff' : '#f0f9ff'}; border:1.5px solid ${pendingCat ? '#60a5fa' : '#bae6fd'}; border-radius:12px; padding:12px 16px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px;">
          <span style="font-size:13.5px; font-weight:700; color:${pendingCat ? '#1d4ed8' : '#0c4a6e'}; line-height:1.45;">${_msEsc(guideContent)}</span>
          <span style="font-size:12.5px; font-weight:700; color:#64748b;">${_msEsc(_msT('menuScheduleUnlinkHint'))}</span>
        </div>

        <div id="menu-schedule-canvas" style="position:relative; display:grid; grid-template-columns:minmax(280px, 1fr) minmax(280px, 1fr); gap:88px; align-items:start; padding:10px 24px 28px 12px; overflow-x:auto;">
          <svg id="menu-schedule-svg-layer" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:2;"></svg>
          <div style="display:flex; flex-direction:column; gap:14px; position:relative; z-index:3;">
            <div style="font-size:14px; font-weight:900; color:#475569; text-transform:uppercase; letter-spacing:0.03em; padding-left:4px;">${_msEsc(_msT('menuScheduleCategoriesCol'))}</div>
            ${catsHtml}
          </div>
          <div style="display:flex; flex-direction:column; gap:14px; position:relative; z-index:3;">
            <div style="font-size:14px; font-weight:900; color:#475569; text-transform:uppercase; letter-spacing:0.03em; padding-left:4px;">${_msEsc(_msT('menuScheduleShiftsCol'))}</div>
            ${shiftsHtml}
          </div>
        </div>
      </div>
    `;

    const canvas = document.getElementById('menu-schedule-canvas');
    _msBindCanvasInteractions(canvas);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => _msDrawWires());
    } else {
      _msDrawWires();
    }
    if (typeof ResizeObserver === 'function' && canvas) {
      if (_msState.resizeObserver) _msState.resizeObserver.disconnect();
      _msState.resizeObserver = new ResizeObserver(() => _msDrawWires());
      _msState.resizeObserver.observe(canvas);
    }
  }

  async function initMenuScheduleWorkspace() {
    if (_msState.loading) return;
    _msState.loading = true;
    try {
      const hasCats = _msGetCatalogCategories().length > 0;
      if (!hasCats && typeof loadMenuData === 'function') {
        await loadMenuData();
      } else if (_msGetShifts().length === 0) {
        const tenantId = typeof getTenantIdFromUrl === 'function' ? getTenantIdFromUrl() : '';
        if (tenantId) {
          const res = await fetch(`${WORKER_BASE}/api/tenant/bootstrap?tenant_id=${encodeURIComponent(tenantId)}&nocache=1`);
          if (res.ok) {
            const bs = await res.json();
            if (bs?.tenant && Array.isArray(bs.tenant.operatingShifts)) {
              window.storeOperatingShifts = bs.tenant.operatingShifts;
            }
          }
        }
      }
      _msState.baselineSnapshot = _msBuildSnapshot();
      _msState.initialized = true;
      if (window.__posFeaturesResolved && typeof window.isMenuScheduleFeatureEnabled === 'function' && !window.isMenuScheduleFeatureEnabled()) {
        _msState.baselineSnapshot = '';
        if (typeof switchTab === 'function') switchTab('menu');
        return;
      }
      renderMenuScheduleWorkspace();
    } catch (e) {
      console.error('[MenuScheduleWorkspace] Init error:', e);
      renderMenuScheduleWorkspace();
    } finally {
      _msState.loading = false;
    }
  }

  async function saveMenuScheduleWorkspace() {
    if (_msState.saving) return;
    _msState.saving = true;
    renderMenuScheduleWorkspace();
    try {
      if (typeof serializeMenuData !== 'function') {
        throw new Error('Menu serializer unavailable');
      }
      const serialized = serializeMenuData();
      const tenantId = getTenantIdFromUrl();
      const res = await fetch(`${WORKER_BASE}/api/menu?tenant_id=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serialized)
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || errBody.code || `API ${res.status}`);
      }
      if (typeof loadMenuData === 'function') {
        await loadMenuData();
      }
      _msState.baselineSnapshot = _msBuildSnapshot();
      if (typeof showToast === 'function') {
        showToast(_msT('menuScheduleSaveSuccess'), 'success');
      } else {
        alert(_msT('menuScheduleSaveSuccess'));
      }
    } catch (e) {
      alert(_msT('menuScheduleSaveFail') + (e?.message || e));
    } finally {
      _msState.saving = false;
      renderMenuScheduleWorkspace();
    }
  }

  function leaveMenuScheduleToMenu() {
    if (hasUnsavedMenuScheduleChanges() && !confirm(_msT('menuScheduleUnsavedLeave'))) {
      return;
    }
    _msState.baselineSnapshot = '';
    if (typeof switchTab === 'function') switchTab('menu');
  }

  function openHoursSettingsFromSchedule() {
    if (hasUnsavedMenuScheduleChanges() && !confirm(_msT('menuScheduleUnsavedLeave'))) {
      return;
    }
    _msState.baselineSnapshot = '';
    if (typeof switchTab === 'function') switchTab('settings');
    if (typeof switchSettingTab === 'function') switchSettingTab('setting-card-hours');
  }

  window.initMenuScheduleWorkspace = initMenuScheduleWorkspace;
  window.renderMenuScheduleWorkspace = renderMenuScheduleWorkspace;
  window.saveMenuScheduleWorkspace = saveMenuScheduleWorkspace;
  window.hasUnsavedMenuScheduleChanges = hasUnsavedMenuScheduleChanges;
  window.leaveMenuScheduleToMenu = leaveMenuScheduleToMenu;
  window.openHoursSettingsFromSchedule = openHoursSettingsFromSchedule;
  window.msUnlinkCategoryFromShift = _msUnlinkCategoryFromShift;
  window.msResetCategoryToAllShifts = _msResetCategoryToAllShifts;
  window.msToggleCategoryHide = _msToggleCategoryHide;
  window.msToggleExpandItems = _msToggleExpandItems;
  window.msSetItemOverrideMode = _msSetItemOverrideMode;
  window.msToggleItemShift = _msToggleItemShift;
})();
