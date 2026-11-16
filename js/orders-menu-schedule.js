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
    dragWire: null,
    baselineSnapshot: '',
    resizeObserver: null,
    search: '',
    filter: 'all',
    showHelp: true
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

  function _msIcon(name) {
    // Lucide icons (ISC), matching the POS outline icon style.
    const paths = {
      back: '<path d="m15 18-6-6 6-6"/>',
      save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
      clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
      link: '<path d="m10 13 4-4M15 7l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0M9 17l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0"/>',
      search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
      info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
      close: '<path d="m18 6-12 12M6 6l12 12"/>',
      sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
      reset: '<path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7"/>',
      grip: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>'
    };
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
  }

  function _msFilteredCategories(cats) {
    const query = _msState.search.trim().toLocaleLowerCase();
    return cats.filter(cat => {
      const selected = cat.availabilityMode === 'selected_shifts';
      if (_msState.filter === 'all_shifts' && selected) return false;
      if (_msState.filter === 'selected_shifts' && !selected) return false;
      return !query || [cat.title, cat.name, ...(cat.items || []).map(it => it.name)]
        .some(name => String(name || '').toLocaleLowerCase().includes(query));
    });
  }

  function _msSetFilter(filter) {
    _msState.filter = filter;
    _msState.pendingTapCatId = null;
    renderMenuScheduleWorkspace();
  }

  function _msSetSearch(search) {
    _msState.search = search;
    _msState.pendingTapCatId = null;
    renderMenuScheduleWorkspace();
  }

  function _msToggleHelp() {
    _msState.showHelp = !_msState.showHelp;
    renderMenuScheduleWorkspace();
  }

  function _msPickCategory(catKey) {
    _msState.pendingTapCatId = _msState.pendingTapCatId === catKey ? null : catKey;
    renderMenuScheduleWorkspace();
  }

  function _msResetAllCategories() {
    const cats = _msGetCatalogCategories();
    if (_msState.saving || !cats.some(c => c.availabilityMode === 'selected_shifts')) return;
    if (!confirm(_msT('menuScheduleResetConfirm'))) return;
    for (const cat of cats) {
      cat.availabilityMode = 'all_shifts';
      cat.shiftIds = [];
    }
    _msState.pendingTapCatId = null;
    if (typeof markMenuDirty === 'function') markMenuDirty();
    renderMenuScheduleWorkspace();
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

  function _msCssEscape(str) {
    const s = String(str ?? '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(s);
    }
    return s.replace(/([^\w-])/g, '\\$1');
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
      const portEl = canvas.querySelector(`[data-cat-port="${_msCssEscape(catKey)}"]`);
      if (!portEl) continue;
      const pRect = portEl.getBoundingClientRect();
      const x1 = pRect.left + pRect.width / 2 - cRect.left;
      const y1 = pRect.top + pRect.height / 2 - cRect.top;

      for (const sid of (cat.shiftIds || [])) {
        const targetEl = canvas.querySelector(`[data-shift-port="${_msCssEscape(String(sid))}"]`);
        if (!targetEl) continue;
        const tRect = targetEl.getBoundingClientRect();
        const x2 = tRect.left + tRect.width / 2 - cRect.left;
        const y2 = tRect.top + tRect.height / 2 - cRect.top;
        const dx = Math.max(48, Math.abs(x2 - x1) * 0.5);
        const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        const isMenuWin = shiftTypeMap.get(String(sid)) === 'menu_window';
        const strokeColor = isMenuWin ? '#d97706' : '#2563eb';

        svgContent += `
          <g class="ms-wire-group" data-wire-cat="${_msEsc(catKey)}" data-wire-shift="${_msEsc(sid)}">
            <title>${_msEsc(_msT('menuScheduleUnlinkHint'))}</title>
            <path class="ms-wire-hit" d="${pathD}" fill="none" stroke="transparent" stroke-width="24"></path>
            <path class="ms-wire-path" d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round"></path>
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
    });
  }

  function _msBindCanvasInteractions(canvas) {
    if (!canvas) return;

    // 1. Pointer drag from Category port -> Shift card/port (works seamlessly on desktop & touch)
    canvas.querySelectorAll('[data-cat-port]').forEach(portBtn => {
      // Native button activation supplies the keyboard alternative to dragging.
      portBtn.addEventListener('click', e => {
        if (e.detail === 0) _msPickCategory(portBtn.getAttribute('data-cat-port'));
      });
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
            highlightedShiftEl.classList.remove('is-drop-hover');
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

          const under = typeof document.elementFromPoint === 'function'
            ? document.elementFromPoint(moveEvt.clientX, moveEvt.clientY)
            : null;
          const targetShiftCard = under && under.closest ? under.closest('[data-shift-card]') : null;
          if (highlightedShiftEl && highlightedShiftEl !== targetShiftCard) clearShiftHighlight();
          if (targetShiftCard) {
            highlightedShiftEl = targetShiftCard;
            targetShiftCard.classList.add('is-drop-hover');
          }
        };

        const onUp = (upEvt) => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.removeEventListener('pointercancel', onUp);
          clearShiftHighlight();
          if (upEvt.type === 'pointercancel') {
            _msState.dragWire = null;
            _msDrawWires();
            return;
          }

          if (!movedEnough) {
            // Tap-to-connect toggle fallback for accessibility / quick iPad tap
            _msState.dragWire = null;
            _msPickCategory(catKey);
            return;
          }

          const under = typeof document.elementFromPoint === 'function'
            ? document.elementFromPoint(upEvt.clientX, upEvt.clientY)
            : null;
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
      const shiftPort = shiftCard.querySelector('[data-shift-port]');
      if (shiftPort) shiftPort.addEventListener('click', () => {
        if (_msState.pendingTapCatId) _msLinkCategoryToShift(_msState.pendingTapCatId, shiftId);
      });
      shiftCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'link';
        shiftCard.classList.add('is-drop-hover');
      });
      shiftCard.addEventListener('dragleave', (e) => {
        if (!e.relatedTarget || !shiftCard.contains(e.relatedTarget)) {
          shiftCard.classList.remove('is-drop-hover');
        }
      });
      shiftCard.addEventListener('drop', (e) => {
        e.preventDefault();
        shiftCard.classList.remove('is-drop-hover');
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
    const previousScroll = root.querySelector('.ms-body-scroll')?.scrollTop || 0;
    const active = root.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = active?.getAttribute('data-ms-focus');
    const selectionStart = active?.selectionStart;
    const selectionEnd = active?.selectionEnd;

    const cats = _msGetCatalogCategories();
    const visibleCats = _msFilteredCategories(cats);
    const shifts = _msGetShifts();
    const isDirty = hasUnsavedMenuScheduleChanges();
    const selectedCount = cats.filter(c => c.availabilityMode === 'selected_shifts').length;
    const linkCount = cats.reduce((sum, c) => sum + (c.availabilityMode === 'selected_shifts' ? (c.shiftIds || []).length : 0), 0);
    const pendingCat = cats.find(c => _msCatKey(c) === _msState.pendingTapCatId);
    const catName = cat => cat.title || cat.name || _msCatKey(cat);
    const guideContent = pendingCat
      ? _msT('menuScheduleTapPickHint', { name: catName(pendingCat) })
      : _msT('menuScheduleGuideText');

    const catsHtml = visibleCats.length === 0
      ? `<div class="ms-empty">${_msIcon('search')}<p>${_msEsc(_msT(cats.length ? 'menuScheduleNoResults' : 'menuScheduleEmptyCats'))}</p></div>`
      : visibleCats.map(cat => {
          const catKey = _msCatKey(cat);
          const catArg = _msEsc(JSON.stringify(catKey));
          const isSelectedMode = cat.availabilityMode === 'selected_shifts';
          const linkedShiftIds = Array.isArray(cat.shiftIds) ? cat.shiftIds : [];
          const isPendingPort = _msState.pendingTapCatId === catKey;
          const isExpanded = _msState.expandedCatIds.has(catKey);
          const itemCount = Array.isArray(cat.items) ? cat.items.length : 0;
          const itemsId = `ms-items-${catKey}`;
          const portLabel = _msT('menuScheduleConnectCategoryAria', { name: catName(cat) });

          const itemsOverrideHtml = isExpanded ? `
            <div class="ms-item-overrides" id="${_msEsc(itemsId)}">
              ${(cat.items || []).map((it, idx) => {
                const itMode = it.availabilityMode || 'inherit';
                const itShiftIds = Array.isArray(it.shiftIds) ? it.shiftIds : [];
                return `
                  <div class="ms-item-row">
                    <label class="ms-item-name" for="${_msEsc(itemsId)}-${idx}">${_msEsc(it.name)}</label>
                    <select id="${_msEsc(itemsId)}-${idx}" data-ms-focus="${_msEsc(`item:${catKey}:${idx}`)}" onchange="window.msSetItemOverrideMode(${catArg}, ${idx}, this.value)">
                      <option value="inherit" ${itMode === 'inherit' ? 'selected' : ''}>${_msEsc(_msT('menuScheduleItemModeInherit'))}</option>
                      <option value="all_shifts" ${itMode === 'all_shifts' ? 'selected' : ''}>${_msEsc(_msT('menuScheduleItemModeAll'))}</option>
                      <option value="selected_shifts" ${itMode === 'selected_shifts' ? 'selected' : ''}>${_msEsc(_msT('menuScheduleItemModeSelected'))}</option>
                    </select>
                    ${itMode === 'selected_shifts' ? `
                      <div class="ms-item-shifts">
                        ${shifts.map(sh => {
                          const checked = itShiftIds.includes(sh.id);
                          const shiftArg = _msEsc(JSON.stringify(String(sh.id)));
                          return `<label class="ms-item-shift ${checked ? 'is-checked' : ''}"><input type="checkbox" ${checked ? 'checked' : ''} data-ms-focus="${_msEsc(`item:${catKey}:${idx}:${sh.id}`)}" onchange="window.msToggleItemShift(${catArg}, ${idx}, ${shiftArg}, this.checked)"><span>${_msEsc(sh.name)}</span></label>`;
                        }).join('')}
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          ` : '';

          return `
            <article class="ms-cat-card ${isSelectedMode ? 'is-selected-mode' : ''} ${isPendingPort ? 'is-pending-port' : ''}" data-cat-card="${_msEsc(catKey)}" draggable="true">
              <div class="ms-cat-head">
                <span class="ms-grip">${_msIcon('grip')}</span>
                <h3 class="ms-cat-name">${_msEsc(catName(cat))}</h3>
                <span class="ms-count-chip">${itemCount} ${_msEsc(_msT('menuScheduleItemCountUnit'))}</span>
              </div>
              <div class="ms-cat-controls">
                <span class="ms-mode-badge ${isSelectedMode ? 'is-selected' : ''}">${_msEsc(isSelectedMode ? _msT('menuScheduleSelectedCount', { count: linkedShiftIds.length }) : _msT('menuScheduleModeAll'))}</span>
                ${itemCount > 0 ? `
                  <button type="button" class="ms-mini-btn" aria-expanded="${isExpanded}" ${isExpanded ? `aria-controls="${_msEsc(itemsId)}"` : ''} data-ms-focus="${_msEsc(`expand:${catKey}`)}" onclick="window.msToggleExpandItems(${catArg})">
                    ${_msIcon('sliders')}${_msEsc(_msT(isExpanded ? 'menuScheduleHideItemsBtn' : 'menuScheduleShowItemsBtn'))}
                  </button>
                ` : ''}
                ${isSelectedMode ? `
                  <button type="button" class="ms-mini-btn ms-unlink-all" onclick="window.msResetCategoryToAllShifts(${catArg})">${_msIcon('close')}${_msEsc(_msT('menuScheduleResetAllBtn'))}</button>
                ` : ''}
              </div>
              ${isSelectedMode ? `
                <div class="ms-mobile-links">${shifts.filter(sh => linkedShiftIds.includes(sh.id)).map(sh => `<span>${_msEsc(sh.name)}</span>`).join('')}</div>
                <label class="ms-switch-label">
                  <input type="checkbox" role="switch" class="ms-switch-input" ${cat.hideWhenUnavailable ? 'checked' : ''} data-ms-focus="${_msEsc(`hide:${catKey}`)}" onchange="window.msToggleCategoryHide(${catArg}, this.checked)">
                  <span class="ms-switch-pill" aria-hidden="true"></span>
                  <span class="ms-switch-text">${_msEsc(_msT('menuScheduleHideLabel'))}</span>
                  <span class="ms-switch-state" aria-hidden="true">${_msEsc(_msT(cat.hideWhenUnavailable ? 'menuScheduleEnabled' : 'menuScheduleDisabled'))}</span>
                </label>
              ` : ''}
              ${itemsOverrideHtml}
              <button type="button" class="ms-port-btn ${isSelectedMode ? 'is-linked' : ''} ${isPendingPort ? 'is-pending' : ''}" data-cat-port="${_msEsc(catKey)}" data-ms-focus="${_msEsc(`port:${catKey}`)}" aria-pressed="${isPendingPort}" aria-label="${_msEsc(portLabel)}" title="${_msEsc(portLabel)}"><span></span></button>
            </article>
          `;
        }).join('');

    const shiftsHtml = shifts.length === 0
      ? `<div class="ms-empty">${_msIcon('clock')}<p>${_msEsc(_msT('menuScheduleEmptyShifts'))}</p><button type="button" class="ms-secondary-btn" onclick="openHoursSettingsFromSchedule()">${_msEsc(_msT('menuScheduleOpenSettingsBtn'))}</button></div>`
      : shifts.map(shift => {
          const sid = String(shift.id);
          const shiftArg = _msEsc(JSON.stringify(sid));
          const isMenuWin = shift.shiftType === 'menu_window';
          const inactive = shift.isActive === false;
          const timeChips = _msFormatShiftSummary(shift);
          const linkedCats = cats.filter(c => c.availabilityMode === 'selected_shifts' && (c.shiftIds || []).includes(sid));
          const portLabel = _msT('menuScheduleConnectShiftAria', { name: shift.name });
          return `
            <article class="ms-shift-card ${isMenuWin ? 'is-menu-window' : ''} ${inactive ? 'is-inactive' : ''} ${pendingCat ? 'is-connectable' : ''}" data-shift-card="${_msEsc(sid)}">
              <button type="button" class="ms-shift-port" data-shift-port="${_msEsc(sid)}" data-ms-focus="${_msEsc(`shift:${sid}`)}" aria-label="${_msEsc(portLabel)}" title="${_msEsc(portLabel)}" ${!pendingCat ? 'disabled' : ''}><span></span></button>
              <div class="ms-shift-head">
                <h3 class="ms-shift-name">${_msEsc(shift.name)}</h3>
                <span class="ms-type-badge ${isMenuWin ? 'is-menu-window' : ''}">${_msEsc(_msT(inactive ? 'menuScheduleInactive' : (isMenuWin ? 'menuScheduleMenuWindow' : 'menuScheduleOperating')))}</span>
              </div>
              <div class="ms-time-chips">${timeChips.length ? timeChips.map(ch => `<span class="ms-time-chip">${_msIcon('clock')}${_msEsc(ch)}</span>`).join('') : `<span class="ms-time-chip">${_msEsc(_msT('menuScheduleNoWindows'))}</span>`}</div>
              ${linkedCats.length > 0 ? `
                <div class="ms-linked-row">
                  <span class="ms-linked-label">${_msEsc(_msT('menuScheduleLinkedCategories'))}</span>
                  ${linkedCats.map(lc => {
                    const catArg = _msEsc(JSON.stringify(_msCatKey(lc)));
                    const label = _msT('menuScheduleUnlinkAria', { category: catName(lc), shift: shift.name });
                    return `<span class="ms-linked-pill"><span>${_msEsc(catName(lc))}</span><button type="button" class="ms-linked-unlink" onclick="window.msUnlinkCategoryFromShift(${catArg}, ${shiftArg})" aria-label="${_msEsc(label)}" title="${_msEsc(label)}">${_msIcon('close')}</button></span>`;
                  }).join('')}
                </div>
              ` : ''}
            </article>
          `;
        }).join('');

    root.setAttribute('aria-busy', String(_msState.saving));
    root.innerHTML = `
      <div class="ms-shell">
        <header class="ms-header">
          <div class="ms-header-left">
            <button type="button" class="ms-back-btn" onclick="leaveMenuScheduleToMenu()">${_msIcon('back')}<span>${_msEsc(_msT('menuScheduleBackBtn'))}</span></button>
            <div class="ms-heading">
              <div class="ms-title-row"><h2 class="ms-title">${_msEsc(_msT('menuSchedulePageTitle'))}</h2><span class="ms-title-tag">${_msIcon('link')}${_msEsc(_msT('menuScheduleVisualTag'))}</span></div>
              <p class="ms-sub">${_msEsc(_msT('menuSchedulePageSub'))}</p>
            </div>
          </div>
          <div class="ms-header-actions">
            <button type="button" class="ms-help-btn" aria-label="${_msEsc(_msT('menuScheduleHelp'))}" aria-expanded="${Boolean(_msState.showHelp || pendingCat)}" aria-controls="ms-guide" data-ms-focus="help" onclick="window.msToggleHelp()">${_msIcon('info')}<span>${_msEsc(_msT('menuScheduleHelp'))}</span></button>
            <span class="ms-status-pill ${isDirty ? 'is-dirty' : ''}" role="status">${_msEsc(_msT(isDirty ? 'menuScheduleUnsavedPill' : 'menuScheduleSavedPill'))}</span>
            <button type="button" class="ms-secondary-btn" onclick="openHoursSettingsFromSchedule()">${_msIcon('clock')}<span>${_msEsc(_msT('menuScheduleOpenSettingsBtn'))}</span></button>
            <button type="button" id="btn-save-menu-schedule" class="ms-save-btn" onclick="saveMenuScheduleWorkspace()" ${!isDirty || _msState.saving ? 'disabled' : ''}>${_msIcon('save')}<span>${_msEsc(_msT(_msState.saving ? 'saving' : 'menuScheduleSaveBtn'))}</span></button>
          </div>
        </header>
        <div class="ms-body-scroll" ${_msState.saving ? 'inert' : ''}>
          <div class="ms-workspace">
            <div id="ms-guide" class="ms-guide-banner ${pendingCat ? 'is-selecting' : ''}" ${!_msState.showHelp && !pendingCat ? 'hidden' : ''}>
              ${_msIcon('info')}<p role="status">${_msEsc(guideContent)}</p>
              <button type="button" class="ms-icon-btn" onclick="${pendingCat ? 'window.msCancelConnection()' : 'window.msToggleHelp()'}" aria-label="${_msEsc(_msT(pendingCat ? 'menuScheduleCancelConnection' : 'menuScheduleDismissHelp'))}">${_msIcon('close')}</button>
            </div>
            <div class="ms-toolbar" role="region" aria-label="${_msEsc(_msT('menuScheduleFiltersAria'))}">
              <label class="ms-search">${_msIcon('search')}<input id="ms-search" type="search" data-ms-focus="search" autocomplete="off" value="${_msEsc(_msState.search)}" placeholder="${_msEsc(_msT('menuScheduleSearchPlaceholder'))}" aria-label="${_msEsc(_msT('menuScheduleSearchPlaceholder'))}" oninput="window.msSetSearch(this.value)"></label>
              <div class="ms-filters" role="group" aria-label="${_msEsc(_msT('menuScheduleFiltersAria'))}">
                ${[['all', 'menuScheduleFilterAll', cats.length], ['all_shifts', 'menuScheduleFilterAlways', cats.length - selectedCount], ['selected_shifts', 'menuScheduleFilterSelected', selectedCount]].map(([value, key, count]) => `<button type="button" class="ms-filter-btn ${_msState.filter === value ? 'is-active' : ''}" aria-pressed="${_msState.filter === value}" data-ms-filter="${value}" data-ms-focus="filter:${value}" onclick="window.msSetFilter('${value}')">${_msEsc(_msT(key))}<span>${count}</span></button>`).join('')}
              </div>
              <span class="ms-link-count" role="status">${_msEsc(_msT('menuScheduleLinkCount', { count: linkCount }))}</span>
              <button type="button" class="ms-reset-btn" onclick="window.msResetAllCategories()" ${selectedCount === 0 ? 'disabled' : ''}>${_msIcon('reset')}${_msEsc(_msT('menuScheduleResetDefault'))}</button>
            </div>
            <div id="menu-schedule-canvas" class="ms-canvas-grid">
              <svg id="menu-schedule-svg-layer" class="ms-svg-layer" aria-hidden="true"></svg>
              <section class="ms-col" aria-labelledby="ms-categories-title">
                <div class="ms-col-heading"><h3 id="ms-categories-title" class="ms-col-title">${_msEsc(_msT('menuScheduleCategoriesCol'))}</h3><span>${_msEsc(_msT('menuScheduleCategoryHint'))}</span></div>
                ${catsHtml}
              </section>
              <section class="ms-col" aria-labelledby="ms-shifts-title">
                <div class="ms-col-heading"><h3 id="ms-shifts-title" class="ms-col-title">${_msEsc(_msT('menuScheduleShiftsCol'))}</h3><span>${_msEsc(_msT('menuScheduleShiftCount', { count: shifts.filter(s => s.isActive !== false).length }))}</span></div>
                ${shiftsHtml}
              </section>
            </div>
          </div>
        </div>
      </div>
    `;
    root.onkeydown = e => {
      if (e.key === 'Escape' && _msState.pendingTapCatId) {
        _msState.pendingTapCatId = null;
        renderMenuScheduleWorkspace();
      }
    };
    const canvas = document.getElementById('menu-schedule-canvas');
    _msBindCanvasInteractions(canvas);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(_msDrawWires);
    else _msDrawWires();
    if (typeof ResizeObserver === 'function' && canvas) {
      if (_msState.resizeObserver) _msState.resizeObserver.disconnect();
      _msState.resizeObserver = new ResizeObserver(_msDrawWires);
      _msState.resizeObserver.observe(canvas);
    }
    const nextFocus = focusKey && root.querySelector(`[data-ms-focus="${_msCssEscape(focusKey)}"]`);
    if (nextFocus) {
      nextFocus.focus({ preventScroll: true });
      if (typeof selectionStart === 'number' && typeof nextFocus.setSelectionRange === 'function' && nextFocus.type === 'search') {
        nextFocus.setSelectionRange(selectionStart, selectionEnd);
      }
    }
    root.querySelector('.ms-body-scroll').scrollTop = previousScroll;
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
    if (typeof isMenuLoadedCompletely !== 'undefined' && !isMenuLoadedCompletely) {
      alert(_msT('menuIncompleteReload'));
      return;
    }
    _msState.saving = true;
    renderMenuScheduleWorkspace();
    try {
      if (typeof serializeMenuData !== 'function') {
        throw new Error('Menu serializer unavailable');
      }
      const catsSource = (typeof currentMenuData !== 'undefined' && Array.isArray(currentMenuData))
        ? currentMenuData
        : (Array.isArray(window.currentMenuData) ? window.currentMenuData : []);
      const serialized = serializeMenuData(catsSource);
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
      if (typeof clearMenuDirty === 'function') {
        clearMenuDirty();
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
  window.msSetSearch = _msSetSearch;
  window.msSetFilter = _msSetFilter;
  window.msToggleHelp = _msToggleHelp;
  window.msResetAllCategories = _msResetAllCategories;
  window.msCancelConnection = () => {
    _msState.pendingTapCatId = null;
    renderMenuScheduleWorkspace();
  };
  window.msUnlinkCategoryFromShift = _msUnlinkCategoryFromShift;
  window.msResetCategoryToAllShifts = _msResetCategoryToAllShifts;
  window.msToggleCategoryHide = _msToggleCategoryHide;
  window.msToggleExpandItems = _msToggleExpandItems;
  window.msSetItemOverrideMode = _msSetItemOverrideMode;
  window.msToggleItemShift = _msToggleItemShift;
})();
