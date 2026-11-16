// POS menu schedule matrix. Scheduling uses the shared MenuSchedule contract.
(function () {
  const state = { loading: false, saving: false, baseline: '', expanded: new Set() };
  const tr = (key, params) => typeof t === 'function' ? t(key, params) : key;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arg = value => esc(JSON.stringify(String(value)));
  const catKey = cat => String(cat.databaseId || cat.catId || cat.id || '');
  const catName = cat => cat.title || cat.name || catKey(cat);
  const categories = () => {
    const data = typeof currentMenuData !== 'undefined' && Array.isArray(currentMenuData) ? currentMenuData : window.currentMenuData || [];
    return data.filter(c => c && (c.type || 'catalog') === 'catalog');
  };
  const shifts = () => Array.isArray(window.storeOperatingShifts) ? window.storeOperatingShifts : [];
  const ids = value => [...new Set((Array.isArray(value) ? value : []).map(String))].sort();
  const schedule = (entity, item = false) => ({
    availabilityMode: entity.availabilityMode === 'selected_shifts' ? 'selected_shifts' : item && entity.availabilityMode !== 'all_shifts' ? 'inherit' : 'all_shifts',
    shiftIds: ids(entity.shiftIds),
    ...(!item ? { hideWhenUnavailable: Boolean(entity.hideWhenUnavailable) } : {})
  });
  const snapshot = () => categories().map(cat => ({ id: catKey(cat), ...schedule(cat), items: (cat.items || []).map(it => ({ id: String(it.id || ''), ...schedule(it, true) })) }));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const dirty = () => Boolean(state.baseline) && JSON.stringify(snapshot()) !== state.baseline;
  const categoryOn = (cat, sid) => cat.availabilityMode !== 'selected_shifts' || ids(cat.shiftIds).includes(sid);
  const itemOn = (cat, it, sid) => !it.availabilityMode || it.availabilityMode === 'inherit' ? categoryOn(cat, sid) : it.availabilityMode === 'all_shifts' || ids(it.shiftIds).includes(sid);
  const vector = (cat, it) => shifts().filter(sh => it ? itemOn(cat, it, String(sh.id)) : categoryOn(cat, String(sh.id))).map(sh => String(sh.id));

  function setCategory(cat, selected) {
    cat.availabilityMode = selected.length === shifts().length && selected.length > 0 ? 'all_shifts' : 'selected_shifts';
    cat.shiftIds = cat.availabilityMode === 'all_shifts' ? [] : ids(selected);
  }
  function setItem(cat, it, selected) {
    if (equal(ids(selected), ids(vector(cat)))) { it.availabilityMode = 'inherit'; it.shiftIds = []; }
    else { it.availabilityMode = selected.length === shifts().length && selected.length > 0 ? 'all_shifts' : 'selected_shifts'; it.shiftIds = it.availabilityMode === 'all_shifts' ? [] : ids(selected); }
  }
  function changeCell(selected, sid, checked) { return checked ? ids([...selected, sid]) : selected.filter(id => id !== sid); }
  function changed() {
    if (typeof markMenuDirty === 'function') markMenuDirty();
    renderMenuScheduleWorkspace();
  }
  function toggleCategory(id, sid, checked) {
    if (state.saving) return;
    const cat = categories().find(c => catKey(c) === id);
    if (!cat || !shifts().some(s => String(s.id) === sid)) return;
    const children = (cat.items || []).map(it => ({ it, selected: changeCell(vector(cat, it), sid, checked) }));
    setCategory(cat, changeCell(vector(cat), sid, checked));
    for (const { it, selected } of children) setItem(cat, it, selected);
    changed();
  }
  function toggleItem(id, itemId, sid, checked) {
    if (state.saving) return;
    const cat = categories().find(c => catKey(c) === id), it = cat?.items?.find(it => String(it.id) === itemId);
    if (!it || !shifts().some(s => String(s.id) === sid)) return;
    setItem(cat, it, changeCell(vector(cat, it), sid, checked));
    changed();
  }
  function copyShift(target, source) {
    if (state.saving || target === source || !shifts().some(s => String(s.id) === source) || !shifts().some(s => String(s.id) === target)) return;
    for (const cat of categories()) {
      const children = (cat.items || []).map(it => ({ it, selected: changeCell(vector(cat, it), target, itemOn(cat, it, source)) }));
      setCategory(cat, changeCell(vector(cat), target, categoryOn(cat, source)));
      for (const { it, selected } of children) setItem(cat, it, selected);
    }
    changed();
  }
  function setOutside(hidden) {
    if (state.saving) return;
    for (const cat of categories()) cat.hideWhenUnavailable = hidden;
    changed();
  }
  function expand(id) {
    if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
    renderMenuScheduleWorkspace();
  }
  function buildPatch() {
    const previous = JSON.parse(state.baseline || '[]'), patch = { categories: [], items: [] };
    for (const cat of snapshot()) {
      const old = previous.find(c => c.id === cat.id);
      if (!old) throw new Error(tr('menuScheduleSaveMenuFirst'));
      const { items, id, ...nextState } = cat, { items: oldItems, id: oldId, ...oldState } = old;
      if (!equal(nextState, oldState)) patch.categories.push({ id, ...nextState, previous: oldState });
      for (const it of items) {
        const oldIt = oldItems.find(i => i.id === it.id);
        if (!it.id || !oldIt) throw new Error(tr('menuScheduleSaveMenuFirst'));
        const { id: itemId, ...nextItem } = it, { id: priorId, ...priorItem } = oldIt;
        if (!equal(nextItem, priorItem)) patch.items.push({ id: itemId, categoryId: id, ...nextItem, previous: priorItem });
      }
    }
    return patch;
  }
  function discard() {
    const saved = JSON.parse(state.baseline || '[]');
    for (const cat of categories()) {
      const old = saved.find(c => c.id === catKey(cat));
      if (!old) continue;
      Object.assign(cat, schedule(old));
      for (const it of cat.items || []) {
        const oldIt = old.items.find(i => i.id === String(it.id));
        if (oldIt) Object.assign(it, schedule(oldIt, true));
      }
    }
    if (typeof markMenuDirty === 'function') markMenuDirty();
  }
  function summary(shift) {
    const vi = (window.currentLang || 'zh-TW') === 'vi';
    const names = vi ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] : ['日', '一', '二', '三', '四', '五', '六'];
    const ranges = new Map();
    for (const win of shift.windows || []) {
      if (win.isActive === false) continue;
      const range = `${win.startTime}–${win.endTime}`;
      if (!ranges.has(range)) ranges.set(range, new Set());
      ranges.get(range).add(Number(win.dayOfWeek));
    }
    return [...ranges].map(([time, days]) => {
      const order = [...days].map(d => d === 0 ? 7 : d).sort((a,b) => a-b), parts = [];
      for (let i = 0; i < order.length; i++) {
        let end = i;
        while (end + 1 < order.length && order[end + 1] === order[end] + 1) end++;
        if (end - i >= 2) { parts.push(`${names[order[i] % 7]}–${names[order[end] % 7]}`); i = end; }
        else parts.push(names[order[i] % 7]);
      }
      return `${parts.join(vi ? ', ' : '、')} · ${time}`;
    });
  }
  const chevron = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  function checkbox({ label, checked, mixed = false, action, focus }) {
    return `<label class="ms-cell-toggle"><input type="checkbox" ${checked ? 'checked' : ''} ${mixed ? 'data-mixed="true" aria-checked="mixed"' : ''} aria-label="${esc(label)}" data-ms-focus="${esc(focus)}" onchange="${action}"><span class="ms-check-mark" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="${mixed ? 'M5 12h14' : 'm5 12 4 4L19 6'}"/></svg></span></label>`;
  }
  function renderMenuScheduleWorkspace() {
    const root = document.getElementById('menu-schedule-workspace-root');
    if (!root) return;
    const table = root.querySelector('.ms-table-scroll'), outer = root.querySelector('.ms-shell');
    const scroll = { x: table?.scrollLeft || 0, y: table?.scrollTop || 0, outer: outer?.scrollTop || 0 };
    const focused = root.contains(document.activeElement) && document.activeElement?.getAttribute('data-ms-focus');
    const cats = categories(), allShifts = shifts(), items = cats.flatMap(c => c.items || []);
    const hiddenCount = cats.filter(c => c.hideWhenUnavailable).length;
    const hidden = cats.length > 0 && hiddenCount === cats.length, shown = cats.length > 0 && hiddenCount === 0;
    const rows = cats.map(cat => {
      const id = catKey(cat), children = cat.items || [], expanded = state.expanded.has(id);
      const parentCells = allShifts.map(sh => {
        const sid = String(sh.id), count = children.filter(it => itemOn(cat, it, sid)).length;
        const checked = children.length ? count === children.length : categoryOn(cat, sid), mixed = count > 0 && count < children.length;
        return `<td>${checkbox({ label: tr('menuScheduleCategoryCell', { name: catName(cat), shift: sh.name }), checked, mixed, action: `window.msToggleCategory(${arg(id)}, ${arg(sid)}, this.checked)`, focus: `cat:${id}:${sid}` })}</td>`;
      }).join('');
      return `<tr class="ms-category-row"><th scope="row"><button type="button" class="ms-expand-btn" data-ms-focus="expand:${esc(id)}" aria-expanded="${expanded}" ${children.length ? '' : 'disabled'} onclick="window.msExpandCategory(${arg(id)})">${chevron}<span class="ms-row-name">${esc(catName(cat))}</span><span class="ms-item-count">${children.length} ${esc(tr('menuScheduleItemCountUnit'))}</span></button></th>${parentCells}</tr>${expanded ? children.map(it => `<tr class="ms-item-row"><th scope="row"><span class="ms-item-name">${esc(it.name)}</span></th>${allShifts.map(sh => `<td>${checkbox({ label: tr('menuScheduleItemCell', { name: it.name, shift: sh.name }), checked: itemOn(cat, it, String(sh.id)), action: `window.msToggleItem(${arg(id)}, ${arg(it.id)}, ${arg(sh.id)}, this.checked)`, focus: `item:${id}:${it.id}:${sh.id}` })}</td>`).join('')}</tr>`).join('') : ''}`;
    }).join('');
    root.setAttribute('aria-busy', String(state.saving));
    root.innerHTML = `<div class="ms-shell"><section class="ms-panel" aria-labelledby="ms-title">
      <h2 class="ms-title" id="ms-title">${esc(tr('menuSchedulePageTitle'))}</h2>
      <p class="ms-sub">${esc(tr('menuSchedulePageSub'))}</p>
      <div class="ms-actions"><button type="button" class="ms-hours-btn" onclick="openHoursSettingsFromSchedule()" ${state.saving ? 'disabled' : ''}>${esc(tr('menuScheduleOpenSettingsBtn'))}</button><span class="ms-status" role="status">${esc(tr(state.saving ? 'saving' : dirty() ? 'menuScheduleUnsavedPill' : 'menuScheduleSavedPill'))}</span><button type="button" id="btn-save-menu-schedule" class="ms-save-btn" onclick="saveMenuScheduleWorkspace()" ${!dirty() || state.saving || state.loading || !allShifts.length ? 'disabled' : ''}>${esc(tr('menuScheduleSaveBtn'))}</button></div>
      ${state.loading ? `<p class="ms-empty" role="status">${esc(tr('menuScheduleLoading'))}</p>` : !allShifts.length ? `<p class="ms-empty">${esc(tr('menuScheduleEmptyShifts'))}</p>` : `<div class="ms-table-scroll" tabindex="0" role="region" aria-label="${esc(tr('menuScheduleTableLabel'))}" ${state.saving ? 'inert' : ''}><table class="ms-matrix" style="--ms-columns: ${allShifts.length}"><caption class="ms-sr-only">${esc(tr('menuScheduleTableLabel'))}</caption><thead><tr><th scope="col" class="ms-name-heading">${esc(tr('menuScheduleNameColumn'))}</th>${allShifts.map(sh => {
        const count = cats.reduce((sum, cat) => sum + (cat.items || []).filter(it => itemOn(cat, it, String(sh.id))).length, 0), sid = String(sh.id);
        return `<th scope="col" class="ms-shift-heading ${sh.isActive === false ? 'is-inactive' : ''}"><span class="ms-shift-name">${esc(sh.name)}</span>${sh.isActive === false ? `<span class="ms-inactive">${esc(tr('menuScheduleInactive'))}</span>` : ''}<span class="ms-shift-times">${summary(sh).map(esc).join('<br>') || esc(tr('menuScheduleNoWindows'))}</span><span class="ms-shift-count">${esc(tr('menuScheduleAvailableCount', { count, total: items.length }))}</span><select aria-label="${esc(tr('menuScheduleCopyAria', { name: sh.name }))}" data-ms-focus="copy:${esc(sid)}" onchange="window.msCopyShift(${arg(sid)}, this.value)" ${allShifts.length < 2 ? 'disabled' : ''}><option value="">${esc(tr('menuScheduleCopyFrom'))}</option>${allShifts.filter(s => String(s.id) !== sid).map(source => `<option value="${esc(source.id)}">${esc(source.name)}</option>`).join('')}</select></th>`;
      }).join('')}</tr></thead><tbody>${rows || `<tr><td class="ms-empty" colspan="${allShifts.length + 1}">${esc(tr('menuScheduleEmptyCats'))}</td></tr>`}</tbody></table></div>`}
      <div class="ms-outside"><div><h3>${esc(tr('menuScheduleOutsideTitle'))}</h3><p>${esc(tr('menuScheduleOutsideSub'))}</p>${!hidden && !shown && cats.length ? `<p class="ms-policy-mixed">${esc(tr('menuScheduleOutsideMixed'))}</p>` : ''}</div><div class="ms-outside-options" role="group" aria-label="${esc(tr('menuScheduleOutsideTitle'))}"><button type="button" aria-pressed="${hidden}" data-ms-focus="outside:hide" onclick="window.msSetOutside(true)" ${state.saving || !cats.length ? 'disabled' : ''}>${esc(tr('menuScheduleOutsideHide'))}</button><button type="button" aria-pressed="${shown}" data-ms-focus="outside:show" onclick="window.msSetOutside(false)" ${state.saving || !cats.length ? 'disabled' : ''}>${esc(tr('menuScheduleOutsideShow'))}</button></div></div>
    </section></div>`;
    root.querySelectorAll('[data-mixed]').forEach(input => { input.indeterminate = true; });
    const nextTable = root.querySelector('.ms-table-scroll');
    if (nextTable) { nextTable.scrollLeft = scroll.x; nextTable.scrollTop = scroll.y; }
    root.querySelector('.ms-shell').scrollTop = scroll.outer;
    if (focused) [...root.querySelectorAll('[data-ms-focus]')].find(el => el.getAttribute('data-ms-focus') === focused)?.focus({ preventScroll: true });
  }
  async function initMenuScheduleWorkspace() {
    if (state.loading) return;
    state.loading = true;
    renderMenuScheduleWorkspace();
    try {
      if (!categories().length && typeof loadMenuData === 'function') await loadMenuData();
      if (!shifts().length && typeof getTenantIdFromUrl === 'function') {
        const response = await fetch(`${WORKER_BASE}/api/tenant/bootstrap?tenant_id=${encodeURIComponent(getTenantIdFromUrl())}&nocache=1`);
        if (response.ok) { const bs = await response.json(); if (Array.isArray(bs?.tenant?.operatingShifts)) window.storeOperatingShifts = bs.tenant.operatingShifts; }
      }
      state.baseline = JSON.stringify(snapshot());
      if (window.__posFeaturesResolved && typeof window.isMenuScheduleFeatureEnabled === 'function' && !window.isMenuScheduleFeatureEnabled()) {
        state.baseline = ''; if (typeof switchTab === 'function') switchTab('menu'); return;
      }
    } catch (error) { console.error('[MenuScheduleMatrix] Load failed', error); }
    finally { state.loading = false; renderMenuScheduleWorkspace(); }
  }
  async function saveMenuScheduleWorkspace() {
    if (state.saving || !dirty()) return;
    if (typeof isMenuLoadedCompletely !== 'undefined' && !isMenuLoadedCompletely) { alert(tr('menuIncompleteReload')); return; }
    state.saving = true;
    renderMenuScheduleWorkspace();
    try {
      const patch = buildPatch();
      const response = await fetch(`${WORKER_BASE}/api/menu/schedule?tenant_id=${encodeURIComponent(getTenantIdFromUrl())}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      if (!response.ok) {
        if (response.status === 409) throw new Error(tr('menuScheduleConflict'));
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || `API ${response.status}`);
      }
      if (typeof window.acknowledgeMenuScheduleSave === 'function') window.acknowledgeMenuScheduleSave(patch);
      state.baseline = JSON.stringify(snapshot());
      if (typeof showToast === 'function') showToast(tr('menuScheduleSaveSuccess'), 'success');
    } catch (error) { alert(tr('menuScheduleSaveFail') + (error?.message || error)); }
    finally { state.saving = false; renderMenuScheduleWorkspace(); }
  }
  function openHoursSettingsFromSchedule() {
    if (typeof switchTab === 'function') switchTab('settings');
    if ((typeof activeTab === 'undefined' || activeTab === 'settings') && typeof switchSettingTab === 'function') switchSettingTab('setting-card-hours');
  }
  window.initMenuScheduleWorkspace = initMenuScheduleWorkspace;
  window.renderMenuScheduleWorkspace = renderMenuScheduleWorkspace;
  window.saveMenuScheduleWorkspace = saveMenuScheduleWorkspace;
  window.hasUnsavedMenuScheduleChanges = dirty;
  window.discardMenuScheduleChanges = discard;
  window.leaveMenuScheduleToMenu = () => { if (typeof switchTab === 'function') switchTab('menu'); };
  window.openHoursSettingsFromSchedule = openHoursSettingsFromSchedule;
  window.msToggleCategory = toggleCategory;
  window.msToggleItem = toggleItem;
  window.msCopyShift = copyShift;
  window.msSetOutside = setOutside;
  window.msExpandCategory = expand;
})();
