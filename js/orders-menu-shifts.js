// Menu shift CRUD lives beside menu assignments, with an independent revisioned draft.
let menuShiftDraft = [], menuShiftBaseline = '', menuShiftRevision, menuShiftHours = null;
let menuShiftEditing = false, menuShiftSaving = false, menuShiftError = '';
const menuShiftDirty = () => menuShiftEditing && JSON.stringify(menuShiftDraft) !== menuShiftBaseline;
window.hasUnsavedMenuShiftChanges = menuShiftDirty;
window.discardMenuShiftChanges = () => { menuShiftDraft = JSON.parse(menuShiftBaseline || '[]'); menuShiftEditing = false; menuShiftError = ''; };
function shiftEditorSnapshot(data) {
  menuShiftDraft = JSON.parse(JSON.stringify(data.operatingShifts));
  menuShiftBaseline = JSON.stringify(menuShiftDraft);
  menuShiftRevision = data.scheduleRevision;
  menuShiftHours = data.operatingHours;
  if (typeof acceptMenuShiftsSnapshot === 'function') acceptMenuShiftsSnapshot(data);
  else window.storeOperatingShifts = data.operatingShifts;
}
async function openMenuShiftEditor() {
  if (menuShiftSaving) return;
  if (typeof window.hasUnsavedMenuAssignments === 'function' && window.hasUnsavedMenuAssignments()) { alert(t('shiftSaveAssignmentsFirst')); return; }
  try {
    const res = await fetch(`${WORKER_BASE}/api/menu/shifts?tenant_id=${encodeURIComponent(getTenantIdFromUrl())}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(formatScheduleError(data));
    shiftEditorSnapshot(data); menuShiftEditing = true; menuShiftError = '';
    renderMenuScheduleWorkspace();
  } catch (error) { alert(t('saveFail') + error.message); }
}
function closeMenuShiftEditor() {
  if (menuShiftSaving || (menuShiftDirty() && !confirm(t('shiftLeaveConfirm')))) return;
  window.discardMenuShiftChanges(); renderMenuScheduleWorkspace();
}
function renderMenuShiftEditor() {
  const root = document.getElementById('menu-schedule-workspace-root');
  root?.querySelectorAll('.ms-actions, .ms-filter-bar, .ms-table-scroll, .ms-outside').forEach(el => { el.inert = menuShiftEditing; });
  const container = document.getElementById('menu-shifts-editor');
  if (!container) return;
  const slidersIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="20" y1="21" y2="21"/><line x1="4" x2="20" y1="3" y2="3"/><line x1="4" x2="20" y1="12" y2="12"/><circle cx="14" cy="12" r="2"/><circle cx="8" cy="3" r="2"/><circle cx="16" cy="21" r="2"/></svg>';
  if (!menuShiftEditing) {
    container.innerHTML = `<button type="button" class="ms-hours-btn ms-manage-shifts-btn" onclick="openMenuShiftEditor()">${slidersIcon}<span>${escapeShiftHtml(t('menuShiftsManage'))}</span></button>`;
    return;
  }
  const dayNamesList = DAY_NAMES[currentLang] || DAY_NAMES['zh-TW'], orderedDays = [1,2,3,4,5,6,0];
  let coverage = [];
  try { coverage = MenuSchedule.shiftCoverageIssues(menuShiftDraft, menuShiftHours); }
  catch { menuShiftError = t('shiftInvalidTime'); }
  const coverageText = coverage.map(c => `${c.shiftName} · ${dayNamesList[c.dayOfWeek]} ${c.startTime}–${c.endTime}`).join('; ');
  const hoursChips = orderedDays.map(day => {
    const ranges = (menuShiftHours?.[day] || []).map(w => `${w.start}–${w.end}`).join(', ');
    return `<span class="ms-store-hour-chip ${ranges ? '' : 'is-closed'}"><strong>${escapeShiftHtml(dayNamesList[day])}</strong><span>${escapeShiftHtml(ranges || t('closedDay'))}</span></span>`;
  }).join('');
  const errorMessage = menuShiftError || (coverage.length ? t('shiftCoverageError') + ' ' + coverageText : '');
  const trashIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
  const closeIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  const plusIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';

  container.innerHTML = `<div class="ms-shift-panel">
    <div class="ms-shift-panel-head">
      <div>
        <h3 class="ms-shift-panel-title">${escapeShiftHtml(t('menuShiftsTitle'))}</h3>
        <p class="ms-shift-panel-sub">${escapeShiftHtml(t('shiftCoverageHint'))}</p>
      </div>
    </div>
    <div class="ms-store-hours-strip">${hoursChips}</div>
    <div id="menu-shifts-error" class="ms-shift-error" tabindex="-1" role="status">${escapeShiftHtml(errorMessage)}</div>
    <fieldset class="ms-shift-fieldset" ${menuShiftSaving ? 'disabled' : ''}>
      <div id="menu-shifts-cards" class="ms-shift-cards"></div>
      <div class="ms-shift-panel-footer">
        <button type="button" class="ms-hours-btn ms-shift-add-btn" onclick="addNamedShift()">${plusIcon}<span>${escapeShiftHtml(t('btnAddNamedShift').replace(/^\+\s*/, ''))}</span></button>
        <div class="ms-shift-footer-right">
          <button type="button" class="ms-hours-btn" onclick="closeMenuShiftEditor()">${escapeShiftHtml(t('shiftEditorClose'))}</button>
          <button type="button" id="btn-save-menu-shifts" class="ms-save-btn" onclick="saveMenuShifts()" ${!menuShiftDirty() ? 'disabled' : ''}>${escapeShiftHtml(t(menuShiftSaving ? 'saving' : 'btnSaveMenuShifts'))}</button>
        </div>
      </div>
    </fieldset>
  </div>`;
  const cards = container.querySelector('#menu-shifts-cards');
  if (!menuShiftDraft.length) {
    cards.innerHTML = `<p class="ms-shift-empty">${escapeShiftHtml(t('shiftEmptyHint'))}</p>`;
  }
  menuShiftDraft.forEach((shift, sIdx) => {
    const card = document.createElement("div");
    card.className = "ms-shift-card";

    const topRow = `
      <div class="ms-shift-card-top">
        <input type="text" class="ms-shift-name-input" value="${escapeShiftHtml(shift.name)}" aria-label="${escapeShiftHtml(t("shiftNameLabel"))}" placeholder="${escapeShiftHtml(t("shiftNameLabel"))}" onchange="updateNamedShiftField(${sIdx}, 'name', this.value)">
        <button type="button" class="ms-shift-delete-btn" onclick="removeNamedShift(${sIdx})">${trashIcon}<span>${escapeShiftHtml(t("shiftDeleteBtn"))}</span></button>
      </div>
    `;

    const bands = buildShiftTimeBands(shift);
    let bandsHtml = "";
    bands.forEach(band => {
      const invalid = coverage.some(c => c.shiftId === shift.id && c.startTime === band.startTime && c.endTime === band.endTime);
      const dayButtons = orderedDays.map(d => {
        const active = band.days.includes(d);
        return `<button type="button" class="ms-day-btn" aria-pressed="${active}" onclick="toggleShiftBandDay(${sIdx}, '${escapeShiftHtml(band.key)}', ${d})">${escapeShiftHtml(dayNamesList[d])}</button>`;
      }).join("");

      bandsHtml += `
        <div class="ms-shift-band ${invalid ? 'is-invalid' : ''}">
          <div class="ms-shift-days">${dayButtons}</div>
          <div class="ms-shift-time-row">
            <input type="time" class="ms-time-input" aria-invalid="${invalid}" aria-describedby="menu-shifts-error" aria-label="${escapeShiftHtml(t('startTime'))}" value="${escapeShiftHtml(band.startTime)}" onchange="updateShiftBandTime(${sIdx}, '${escapeShiftHtml(band.key)}', 'startTime', this.value)">
            <span class="ms-time-sep" aria-hidden="true">–</span>
            <input type="time" class="ms-time-input" aria-invalid="${invalid}" aria-describedby="menu-shifts-error" aria-label="${escapeShiftHtml(t('endTime'))}" value="${escapeShiftHtml(band.endTime)}" onchange="updateShiftBandTime(${sIdx}, '${escapeShiftHtml(band.key)}', 'endTime', this.value)">
            ${bands.length > 1 ? `<button type="button" class="ms-band-remove-btn" aria-label="${escapeShiftHtml(t('shiftDeleteBtn'))}" onclick="removeShiftBand(${sIdx}, '${escapeShiftHtml(band.key)}')">${closeIcon}</button>` : ''}
          </div>
        </div>
      `;
    });

    const addBandBtn = `
      <div class="ms-shift-card-foot">
        <button type="button" class="ms-shift-add-band-btn" onclick="addShiftBand(${sIdx})">${plusIcon}<span>${escapeShiftHtml(t("shiftAddWeekdayWindow").replace(/^\+\s*/, ''))}</span></button>
      </div>
    `;

    card.innerHTML = `${topRow}${bandsHtml}${addBandBtn}`;
    cards.appendChild(card);
  });
}
async function saveMenuShifts() {
  if (menuShiftSaving || !menuShiftDirty()) return;
  try {
    const conflicts = MenuSchedule.shiftCoverageIssues(menuShiftDraft, menuShiftHours);
    if (conflicts.length) throw new Error(t('shiftCoverageError'));
    menuShiftSaving = true; menuShiftError = ''; renderMenuShiftEditor();
    const response = await fetch(`${WORKER_BASE}/api/menu/shifts?tenant_id=${encodeURIComponent(getTenantIdFromUrl())}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operatingShifts: menuShiftDraft, scheduleRevision: menuShiftRevision }) });
    const data = await response.json();
    if (!response.ok) throw new Error(formatScheduleError(data));
    shiftEditorSnapshot(data);
    if (typeof window.onMenuShiftsSaved === 'function') window.onMenuShiftsSaved();
    if (typeof showToast === 'function') showToast(t('saveSuccess'));
  } catch (error) { menuShiftError = error.message; }
  finally { menuShiftSaving = false; renderMenuScheduleWorkspace(); if (menuShiftError) document.getElementById('menu-shifts-error')?.focus(); }
}
function buildShiftTimeBands(shift) {
  const bands = [];
  const bandMap = new Map();
  for (const w of (shift.windows || [])) {
    if (!w || w.isActive === false) continue;
    const key = `${w.startTime}|${w.endTime}`;
    if (!bandMap.has(key)) {
      const band = { key, startTime: w.startTime, endTime: w.endTime, days: [] };
      bandMap.set(key, band);
      bands.push(band);
    }
    const band = bandMap.get(key);
    if (!band.days.includes(Number(w.dayOfWeek))) {
      band.days.push(Number(w.dayOfWeek));
    }
  }
  if (bands.length === 0) {
    bands.push({ key: "11:00|21:00", startTime: "11:00", endTime: "21:00", days: [] });
  }
  return bands;
}

function addNamedShift() {
  if (!Array.isArray(menuShiftDraft)) menuShiftDraft = [];
  const nextIdx = menuShiftDraft.length + 1;
  menuShiftDraft.push({
    id: `shift_${Date.now()}_${nextIdx}`,
    name: `${t("shiftDefaultNamePrefix") || "時段"} ${nextIdx}`,
    shiftType: "operating",
    sortOrder: menuShiftDraft.length,
    isActive: true,
    windows: Object.entries(menuShiftHours || {}).flatMap(([day, ranges]) => ranges.map(w => ({ dayOfWeek: Number(day), startTime: w.start, endTime: w.end, isActive: true })))
  });

  menuShiftError = ''; renderMenuShiftEditor();
}

function updateNamedShiftField(sIdx, field, val) {
  const shift = menuShiftDraft[sIdx];
  if (!shift) return;
  if (field === "name") shift.name = String(val || "").trim() || `${t("shiftDefaultNamePrefix") || "時段"} ${sIdx + 1}`;
  if (field === "shiftType") {
    shift.shiftType = val === "menu_window" ? "menu_window" : "operating";
  
    renderMenuShiftEditor();
    return;
  }
  menuShiftError = ''; renderMenuShiftEditor();
}

function removeNamedShift(sIdx) {
  if (!confirm(t('shiftDeleteConfirm'))) return;
  menuShiftDraft.splice(sIdx, 1);

  menuShiftError = ''; renderMenuShiftEditor();
}

function toggleShiftBandDay(sIdx, bandKey, dayIdx) {
  const shift = menuShiftDraft[sIdx];
  if (!shift) return;
  const [startTime, endTime] = String(bandKey).split("|");
  if (!Array.isArray(shift.windows)) shift.windows = [];
  const existIdx = shift.windows.findIndex(w => Number(w.dayOfWeek) === dayIdx && w.startTime === startTime && w.endTime === endTime);
  if (existIdx >= 0) {
    shift.windows.splice(existIdx, 1);
  } else {
    shift.windows.push({ dayOfWeek: dayIdx, startTime: startTime || "11:00", endTime: endTime || "21:00", isActive: true });
  }

  menuShiftError = ''; renderMenuShiftEditor();
}

function updateShiftBandTime(sIdx, bandKey, field, newVal) {
  const shift = menuShiftDraft[sIdx];
  if (!shift || !newVal) return;
  const [oldStart, oldEnd] = String(bandKey).split("|");
  const matched = (shift.windows || []).filter(w => w.startTime === oldStart && w.endTime === oldEnd);
  if (matched.length === 0) {
    shift.windows.push({
      dayOfWeek: 1,
      startTime: field === "startTime" ? newVal : (oldStart || "11:00"),
      endTime: field === "endTime" ? newVal : (oldEnd || "21:00"),
      isActive: true
    });
  } else {
    matched.forEach(w => { w[field] = newVal; });
  }

  menuShiftError = ''; renderMenuShiftEditor();
}

function addShiftBand(sIdx) {
  const shift = menuShiftDraft[sIdx];
  if (!shift) return;
  if (!Array.isArray(shift.windows)) shift.windows = [];
  const usedDays = new Set(shift.windows.map(w => Number(w.dayOfWeek)));
  const pickDay = [6, 0, 1, 2, 3, 4, 5].find(d => !usedDays.has(d)) ?? 6;
  let candidateStart = "17:00";
  let candidateEnd = "21:00";
  while (shift.windows.some(w => w.startTime === candidateStart && w.endTime === candidateEnd)) {
    candidateStart = candidateStart === "17:00" ? "11:30" : (candidateStart === "11:30" ? "21:00" : `${String(Math.min(22, Number(candidateStart.slice(0, 2)) + 1)).padStart(2, "0")}:00`);
    if (candidateStart === "22:00") break;
  }
  shift.windows.push({ dayOfWeek: pickDay, startTime: candidateStart, endTime: candidateEnd, isActive: true });

  menuShiftError = ''; renderMenuShiftEditor();
}

function removeShiftBand(sIdx, bandKey) {
  const shift = menuShiftDraft[sIdx];
  if (!shift || !Array.isArray(shift.windows)) return;
  const [startTime, endTime] = String(bandKey).split("|");
  shift.windows = shift.windows.filter(w => !(w.startTime === startTime && w.endTime === endTime));

  menuShiftError = ''; renderMenuShiftEditor();
}

