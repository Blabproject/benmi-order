/* Bulk stock controls share the menu model, while preserving unrelated drafts. */
window.MenuStockBatch = (() => {
  const limit = 100;
  const selected = new Set();
  let active = false, categoryIndex = -1, categoryId = null, pending = null;
  let returnFocus = null, previousOverflow = '';
  const el = id => document.getElementById(id);
  const text = (key, params) => t(key, params);
  const category = () => currentMenuData?.[activeCategoryIndex];
  const rows = () => [...document.querySelectorAll('#menu-editor-body .menu-catalog-row')];
  const savedIds = () => new Set((JSON.parse(savedMenuSnapshot || '[]'))
    .flatMap(cat => (cat.items || []).map(item => String(item.id))));
  const rowItem = row => category()?.items?.[Number(row.getAttribute('data-item-index'))];
  const eligible = () => {
    const ids = savedIds();
    return rows().filter(row => row.style.display !== 'none' && rowItem(row)?.id && ids.has(String(rowItem(row).id)));
  };
  function feedback(message) {
    const node = el('batch-stock-feedback');
    if (node) { node.textContent = message; node.hidden = !message; }
  }
  function resetForCategory(index) {
    if (index === categoryIndex && currentMenuData?.[index]?.id === categoryId && menuSidebarTab !== 'options' && !isCategoryManagerOpen) return;
    const removed = selected.size;
    active = false; selected.clear();
    categoryIndex = index; categoryId = currentMenuData?.[index]?.id;
    refresh(false);
    updateMenuSaveState();
    if (removed) feedback(text('batchStockRemoved', { count: removed }));
  }
  function toggle() {
    if (isMenuSaving || isStockSaving || !isMenuLoadedCompletely) return;
    syncMenuDataFromDOM();
    active = !active;
    selected.clear(); feedback('');
    refresh(); updateMenuSaveState();
  }
  function refresh(prune = true) {
    const toolbar = el('menu-editor-toolbar');
    if (!toolbar) return;
    const cat = category();
    const available = Boolean(cat && !isCustomizationCategory(cat) && menuSidebarTab !== 'options' && !isCategoryManagerOpen);
    if (!available) { active = false; selected.clear(); }
    toolbar.style.display = available ? 'flex' : 'none';
    const matches = eligible();
    if (prune) {
      const visibleIds = new Set(matches.map(row => String(rowItem(row).id)));
      const removed = [...selected].filter(id => !visibleIds.has(id));
      removed.forEach(id => selected.delete(id));
      if (removed.length) feedback(text('batchStockRemoved', { count: removed.length }));
    }
    el('menu-editor-panel')?.classList.toggle('is-stock-selecting', active);
    el('batch-stock-selection').hidden = !active;
    el('batch-stock-bar').hidden = !active;
    el('btn-menu-stock-select').textContent = text(active ? 'batchStockDone' : 'batchStockSelect');
    el('btn-menu-stock-select').setAttribute('aria-pressed', String(active));
    el('btn-menu-stock-select').disabled = isMenuSaving || isStockSaving || !isMenuLoadedCompletely;
    el('menu-stock-search').placeholder = text('batchStockSearch');
    el('menu-stock-search').setAttribute('aria-label', text('batchStockSearch'));
    // Preserve spaces, caret position and IME composition while staff type.
    if (document.activeElement !== el('menu-stock-search')
      && el('menu-stock-search').value.toLowerCase().trim() !== menuItemFilterQuery) {
      el('menu-stock-search').value = menuItemFilterQuery;
    }
    toolbar.querySelector('.batch-stock-filters').setAttribute('aria-label', text('stockLabelStatus'));
    toolbar.querySelectorAll('[data-filter]').forEach(button => {
      const filter = button.dataset.filter;
      button.textContent = text(filter === 'all' ? 'batchStockAll' : filter === 'oos' ? 'stockStatusOutOfStock' : 'stockStatusInStock');
      button.setAttribute('aria-pressed', String(menuItemFilterStatus === filter));
    });
    el('batch-stock-all-label').textContent = matches.length > limit ? text('batchStockLimit') : text('batchStockChooseAll', { count: matches.length });
    el('batch-stock-all').checked = matches.length > 0 && selected.size === matches.length;
    el('batch-stock-all').indeterminate = selected.size > 0 && selected.size < matches.length;
    el('batch-stock-all').disabled = !matches.length || matches.length > limit;
    el('batch-stock-all-label').title = matches.length > limit ? text('batchStockLimit') : '';
    el('batch-stock-clear').textContent = text('batchStockClear');
    el('batch-stock-clear').disabled = !selected.size;
    el('batch-stock-count').textContent = text('batchStockCount', { count: selected.size });
    for (const [id, key] of [['batch-stock-pause', 'batchStockPause'], ['batch-stock-restore', 'batchStockRestore']]) {
      el(id).textContent = text(key); el(id).disabled = !selected.size || isStockSaving;
    }
    const ids = savedIds();
    rows().forEach(row => {
      const item = rowItem(row), id = item?.id ? String(item.id) : '';
      let label = row.querySelector('.batch-stock-checkbox');
      if (!label) {
        label = document.createElement('label'); label.className = 'batch-stock-checkbox';
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
        checkbox.addEventListener('change', () => select(id, checkbox.checked));
        label.appendChild(checkbox); row.prepend(label);
      }
      label.hidden = !active;
      const checkbox = label.querySelector('input');
      checkbox.checked = selected.has(id); checkbox.disabled = !id || !ids.has(id);
      checkbox.setAttribute('aria-label', item?.name || text('batchStockSelect'));
      label.title = checkbox.disabled ? text('batchStockNew') : item?.name || '';
      row.classList.toggle('is-stock-selected', active && selected.has(id));
      row.querySelectorAll('input:not([type="checkbox"]),button,select,textarea').forEach(control => {
        if (active && !control.hasAttribute('data-stock-disabled')) {
          control.setAttribute('data-stock-disabled', String(control.disabled)); control.disabled = true;
        } else if (!active && control.hasAttribute('data-stock-disabled')) {
          control.disabled = control.getAttribute('data-stock-disabled') === 'true'; control.removeAttribute('data-stock-disabled');
        }
      });
    });
    for (const id of ['btn-menu-create-unified', 'btn-category-rename', 'btn-category-delete', 'btn-menu-manage-cats']) {
      const control = el(id);
      if (!control) continue;
      if (active && !control.hasAttribute('data-stock-disabled')) {
        control.setAttribute('data-stock-disabled', String(control.disabled)); control.disabled = true;
      } else if (!active && control.hasAttribute('data-stock-disabled')) {
        control.disabled = control.getAttribute('data-stock-disabled') === 'true'; control.removeAttribute('data-stock-disabled');
      }
    }
  }
  function select(id, checked) {
    if (!active || isStockSaving) return;
    if (checked && selected.size >= limit && !selected.has(id)) { feedback(text('batchStockLimit')); refresh(); return; }
    if (checked && !eligible().some(row => String(rowItem(row).id) === id)) return;
    if (checked) selected.add(id); else selected.delete(id);
    refresh();
  }
  function selectAll(checked) {
    const matches = eligible();
    if (matches.length > limit) { feedback(text('batchStockLimit')); return; }
    selected.clear();
    if (checked) matches.forEach(row => selected.add(String(rowItem(row).id)));
    refresh();
  }
  function clear() { selected.clear(); refresh(); }
  function close() {
    if (isStockSaving) return;
    el('batchStockModal')?.remove(); pending = null;
    document.body.style.overflow = previousOverflow;
    returnFocus?.focus?.({ preventScroll: true });
  }
  function open(status) {
    if (!active || !selected.size || isStockSaving || isMenuSaving) return;
    const items = category().items.filter(item => selected.has(String(item.id)));
    pending = { status, items, category: category(), duration: 'today', body: null, uncertain: false };
    returnFocus = el(status === 'in_stock' ? 'batch-stock-restore' : 'batch-stock-pause');
    previousOverflow = document.body.style.overflow;
    const modal = document.createElement('div'); modal.id = 'batchStockModal';
    modal.className = 'modal stock-drawer'; modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'batch-stock-title');
    const esc = escapeHtml;
    modal.innerHTML = `<div class="stock-drawer-panel">
      <header class="stock-drawer-header"><div class="stock-drawer-heading"><p class="stock-item-name">${esc(text('batchStockCount', { count: items.length }))}</p>
      <h2 id="batch-stock-title">${esc(text(status === 'in_stock' ? 'batchStockRestore' : 'batchStockPause'))}</h2></div>
      <button type="button" class="stock-drawer-close" data-close aria-label="${esc(text('batchStockDone'))}">×</button></header>
      <div class="stock-drawer-body"><p class="stock-drawer-hint">${esc(text(status === 'in_stock' ? 'batchStockRestoreHint' : 'batchStockHint'))}</p>
      <details class="batch-stock-details"><summary>${esc(text('batchStockDetails'))}</summary><ul>${items.map(item => `<li>${esc(item.name)}</li>`).join('')}</ul></details>
      ${status === 'out_of_stock' ? `<fieldset class="stock-choices"><legend>${esc(text('stockLabelDuration'))}</legend>
      ${['today', 'multiple_days', 'indefinite'].map((duration, index) => `<label class="stock-choice"><input type="radio" name="batch-stock-duration" value="${duration}" ${index === 0 ? 'checked' : ''}><span><strong>${esc(text(['stockOptToday', 'stockOptMultipleDays', 'stockOptIndefinite'][index]))}</strong></span></label>`).join('')}</fieldset>
      <div class="stock-date-container" id="batch-stock-date-wrap" hidden><label for="batch-stock-date">${esc(text('stockLabelDate'))}</label><input type="date" id="batch-stock-date" min="${stockTomorrowDate()}"></div><p id="batch-stock-time" class="stock-drawer-hint"></p>` : ''}
      <p id="batch-stock-error" class="stock-drawer-error" role="alert" hidden></p></div>
      <footer class="stock-drawer-footer"><p id="batch-stock-progress" role="status" aria-live="polite"></p><div class="stock-drawer-actions">
      <button type="button" class="btn btn-ghost" data-close>${esc(text('btnCancel'))}</button>
      <button type="button" class="btn btn-primary" id="batch-stock-save">${esc(text(status === 'in_stock' ? 'batchStockApplyRestore' : 'batchStockApply', { count: items.length }))}</button></div></footer></div>`;
    modal.style.display = 'flex'; document.body.appendChild(modal); document.body.style.overflow = 'hidden';
    modal.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
      if (!pending || pending.uncertain) return;
      pending.duration = modal.querySelector('input[name="batch-stock-duration"]:checked')?.value || 'today';
      pending.body = null; updateDrawer();
    }));
    el('batch-stock-save').addEventListener('click', save);
    updateDrawer(); modal.querySelector('[data-close]').focus();
  }
  function updateDrawer() {
    if (!pending) return;
    const date = el('batch-stock-date');
    const multiple = pending.duration === 'multiple_days';
    if (date) {
      el('batch-stock-date-wrap').hidden = !multiple;
      const day = multiple ? date.value : stockTomorrowDate();
      el('batch-stock-time').textContent = pending.duration === 'indefinite' || !day ? ''
        : text('batchStockTime', { time: `${day} 04:00` });
    }
    el('batch-stock-save').disabled = isStockSaving || (pending.status === 'out_of_stock' && multiple && (!date?.value || date.value < date.min));
  }
  async function save() {
    if (!pending || isStockSaving || isMenuSaving || el('batch-stock-save').disabled) return;
    const operation = pending;
    // An absolute cutoff makes retries identical even if the business day changes.
    if (!operation.body) {
      const day = operation.duration === 'today' ? stockTomorrowDate() : el('batch-stock-date')?.value;
      operation.body = { item_ids: operation.items.map(item => item.id), status: operation.status,
        duration: operation.duration === 'today' ? 'multiple_days' : operation.duration,
        until_date: operation.status === 'out_of_stock' && operation.duration !== 'indefinite' ? `${day}T04:00:00+07:00` : null };
    }
    isStockSaving = true; updateMenuSaveState();
    const modal = el('batchStockModal'); modal.setAttribute('aria-busy', 'true');
    modal.querySelectorAll('button,input').forEach(control => { control.disabled = true; });
    el('batch-stock-error').hidden = true;
    el('batch-stock-progress').textContent = text('batchStockSaving', { count: operation.items.length });
    let result;
    try {
      // Allow time to enter the PIN before starting the network timeout.
      await window.PosSession.token();
      const response = await window.PosSession.fetch(`${WORKER_BASE}/api/menu/stock-status/batch?tenant_id=${encodeURIComponent(getTenantIdFromUrl())}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation.body), signal: AbortSignal.timeout(15000)
      });
      result = await response.json();
      if (!response.ok) {
        operation.uncertain = false;
        throw Object.assign(new Error(result.error), { known: true, status: response.status });
      }
      if (!Array.isArray(result.items) || result.items.length !== operation.items.length) throw new Error('INVALID_RESPONSE');
    } catch (error) {
      result = null;
      operation.uncertain = !error.known && error.code !== 'POS_SESSION_REQUIRED';
      el('batch-stock-error').textContent = text(error.status === 409 ? 'batchStockMissing' : error.status === 401 || error.code === 'POS_SESSION_REQUIRED' ? 'batchStockLogin' : 'batchStockFailed');
      el('batch-stock-error').hidden = false;
    } finally {
      isStockSaving = false; modal.setAttribute('aria-busy', 'false');
      modal.querySelectorAll('button,input').forEach(control => { control.disabled = operation.uncertain && control.tagName === 'INPUT'; });
      el('batch-stock-progress').textContent = ''; updateDrawer(); updateMenuSaveState();
    }
    if (!result?.success) return;
    for (const saved of result.items) {
      const item = operation.items.find(item => String(item.id) === String(saved.id));
      applySavedStockStatus(operation.category, null, item, Boolean(saved.out_of_stock_until), saved.out_of_stock_until);
      try {
        const key = stockChoiceKey(operation.category, null, item);
        if (saved.out_of_stock_until) localStorage.setItem(key, JSON.stringify({ until: saved.out_of_stock_until, duration: operation.duration }));
        else localStorage.removeItem(key);
      } catch { /* Optional browser storage. */ }
    }
    const scroll = el('menu-editor-body').scrollTop;
    selected.clear(); close();
    renderMenuCategories(); renderMenuCategoryEditor(activeCategoryIndex);
    el('menu-editor-body').scrollTop = scroll;
    checkMenuDirty();
    feedback(text('batchStockSuccess', result) + (result.cache_refreshed === false ? ' ' + text('batchStockCache') : ''));
    if (window.UnifiedMenu?.enabled) {
      try { await window.UnifiedMenu.load(); } catch { /* Persisted stock remains authoritative. */ }
    }
  }
  document.addEventListener('click', event => {
    if (!active || !event.target.closest?.('#menu-editor-body .menu-catalog-row')) return;
    if (event.target.closest('.batch-stock-checkbox')) { event.stopPropagation(); return; }
    const row = event.target.closest('.menu-catalog-row'), item = rowItem(row);
    event.preventDefault(); event.stopImmediatePropagation();
    if (item?.id) select(String(item.id), !selected.has(String(item.id)));
  }, true);
  document.addEventListener('dragstart', event => {
    if (active && event.target.closest?.('#menu-editor-body')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('keydown', event => {
    if (document.querySelector('.pos-session-dialog[open]')) return;
    const modal = el('batchStockModal');
    if (modal) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === 'Tab') {
        const controls = [...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),summary')].filter(control => control.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    } else if (active && ['Enter', ' '].includes(event.key) && event.target.matches?.('.menu-catalog-row')) {
      event.preventDefault(); event.stopImmediatePropagation();
      const item = rowItem(event.target);
      if (item?.id) select(String(item.id), !selected.has(String(item.id)));
    }
  }, true);
  return { get active() { return active; }, resetForCategory, refresh, toggle, selectAll, clear, open };
})();
