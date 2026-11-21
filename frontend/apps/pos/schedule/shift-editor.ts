import type { CoverageConflict, Shift, ShiftSnapshot, ShiftWindow, StoreHours, Translate } from './contracts';

type TimeField = 'startTime' | 'endTime';

interface ShiftEditorOptions {
  endpoint: () => string;
  translate: Translate;
  checkCoverage: (shifts: Shift[], hours: StoreHours) => CoverageConflict[];
  formatError: (detail: { error?: string; conflicts?: CoverageConflict[] }) => string;
  acceptSnapshot: (snapshot: ShiftSnapshot) => void;
  afterSave: () => void;
  assignmentsBusy: () => boolean;
  assignmentsDirty: () => boolean;
  render: () => void;
  focusError: () => void;
}

export function shiftBands(shift: Shift) {
  const bands = new Map<string, { key: string; startTime: string; endTime: string; days: Set<number> }>();
  for (const window of shift.windows ?? []) {
    if (!window || window.isActive === false) continue;
    const key = `${window.startTime}|${window.endTime}`;
    if (!bands.has(key)) bands.set(key, { key, startTime: window.startTime, endTime: window.endTime, days: new Set() });
    bands.get(key)?.days.add(Number(window.dayOfWeek));
  }
  return bands.size ? [...bands.values()] : [{ key: '11:00|21:00', startTime: '11:00', endTime: '21:00', days: new Set<number>() }];
}

export function formatCoverageReasons(conflicts: CoverageConflict[], hours: StoreHours, days: string[], translate: Translate) {
  const groups = new Map<string, { shift: string; start: string; end: string; hours: string; days: Set<string> }>();
  for (const conflict of conflicts) {
    const ranges = (hours[conflict.dayOfWeek] ?? []).map(window => `${window.start}–${window.end}`).join(', ');
    const { shiftId, shiftName, startTime, endTime, dayOfWeek } = conflict;
    const key = `${shiftId || shiftName}|${startTime}|${endTime}|${ranges}`;
    if (!groups.has(key)) groups.set(key, { shift: shiftName, start: startTime, end: endTime, hours: ranges, days: new Set() });
    groups.get(key)?.days.add(days[dayOfWeek] ?? String(dayOfWeek));
  }
  return [...groups.values()].map(group => translate(group.hours ? 'shiftCoverageReasonOpen' : 'shiftCoverageReasonClosed', {
    ...group, days: [...group.days].join(', ')
  }));
}

export function createShiftEditor(options: ShiftEditorOptions) {
  const state = {
    draft: [] as Shift[], hours: {} as StoreHours, editing: false, opening: false, saving: false,
    error: '', serverConflicts: [] as CoverageConflict[]
  };
  let baseline = '[]', revision = 0, openRequest = 0, newShiftId = 0;
  const dirty = () => state.editing && JSON.stringify(state.draft) !== baseline;
  const canEdit = () => state.editing && !state.saving && !options.assignmentsBusy();
  const defaultName = (index: number) => `${options.translate('shiftDefaultNamePrefix')} ${index + 1}`;

  function applySnapshot(data: ShiftSnapshot) {
    baseline = JSON.stringify(data.operatingShifts);
    state.draft = JSON.parse(baseline) as Shift[];
    revision = data.scheduleRevision;
    state.hours = data.operatingHours;
    state.serverConflicts = [];
    options.acceptSnapshot(data);
  }

  function discard() {
    ++openRequest;
    state.opening = false;
    state.editing = false;
    state.draft = JSON.parse(baseline) as Shift[];
    state.error = '';
    state.serverConflicts = [];
  }

  async function open() {
    if (state.opening || state.editing || state.saving || options.assignmentsBusy()) return;
    if (options.assignmentsDirty()) {
      alert(options.translate('shiftSaveAssignmentsFirst'));
      return;
    }
    const request = ++openRequest;
    state.opening = true;
    options.render();
    try {
      const response = await fetch(options.endpoint(), { cache: 'no-store' });
      const data = await response.json();
      if (request !== openRequest) return;
      if (!response.ok) throw new Error(options.formatError(data));
      applySnapshot(data);
      state.editing = true;
      state.error = '';
    } catch (error) {
      if (request === openRequest) alert(options.translate('saveFail') + (error instanceof Error ? error.message : String(error)));
    } finally {
      if (request === openRequest) {
        state.opening = false;
        options.render();
      }
    }
  }

  function close() {
    if (state.saving || (dirty() && !confirm(options.translate('shiftLeaveConfirm')))) return;
    discard();
    options.render();
  }

  function validation() {
    try {
      return { coverage: options.checkCoverage(state.draft, state.hours), timeInvalid: false };
    } catch {
      return { coverage: [], timeInvalid: true };
    }
  }

  async function save() {
    if (!canEdit() || !dirty()) return;
    const { coverage, timeInvalid } = validation();
    if (timeInvalid || coverage.length) {
      options.focusError();
      return;
    }
    state.saving = true;
    state.error = '';
    state.serverConflicts = [];
    options.render();
    try {
      const response = await fetch(options.endpoint(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatingShifts: state.draft.map((shift, index) => ({ ...shift, name: shift.name.trim() || defaultName(index) })),
          scheduleRevision: revision
        })
      });
      const data = await response.json();
      if (!response.ok) {
        if (data?.error === 'SHIFTS_OUTSIDE_OPERATING_HOURS' && Array.isArray(data.conflicts)) {
          state.serverConflicts = data.conflicts;
        }
        throw new Error(options.formatError(data));
      }
      applySnapshot(data);
      options.afterSave();
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      state.saving = false;
      options.render();
      if (state.error) options.focusError();
    }
  }

  function changed() {
    state.error = '';
    state.serverConflicts = [];
    options.render();
  }

  function updateWindows(index: number, bandKey: string, edit: (windows: ShiftWindow[], startTime: string, endTime: string) => void) {
    const shift = state.draft[index];
    if (!canEdit() || !shift) return;
    const [startTime = '11:00', endTime = '21:00'] = bandKey.split('|');
    edit(shift.windows ??= [], startTime, endTime);
    changed();
  }

  return {
    state, dirty, open, close, discard, save, validation,
    add() {
      if (!canEdit()) return;
      const index = state.draft.length;
      state.draft.push({
        id: `shift_${Date.now()}_${++newShiftId}`,
        name: defaultName(index),
        shiftType: 'operating',
        displayMode: 'switcher',
        diningPolicy: 'inherit',
        sortOrder: index,
        isActive: true,
        windows: Object.entries(state.hours).flatMap(([day, ranges]) => ranges.map(range => ({
          dayOfWeek: Number(day), startTime: range.start, endTime: range.end, isActive: true
        })))
      });
      changed();
    },
    setDisplayMode(index: number, displayMode: 'switcher' | 'schedule_only' | 'qr_only') {
      if (!canEdit() || !state.draft[index]) return;
      state.draft[index].displayMode = displayMode;
      changed();
    },
    setDiningPolicy(index: number, diningPolicy: 'inherit' | 'both' | 'takeaway_only' | 'dine_in_only') {
      if (!canEdit() || !state.draft[index]) return;
      state.draft[index].diningPolicy = diningPolicy;
      changed();
    },
    rename(index: number, value: string, commit = false) {
      const shift = state.draft[index];
      if (!canEdit() || !shift) return;
      const name = commit ? value.trim() || defaultName(index) : value;
      if (name === shift.name) return;
      shift.name = name;
      changed();
    },
    remove(index: number) {
      if (!canEdit() || !confirm(options.translate('shiftDeleteConfirm'))) return;
      state.draft.splice(index, 1);
      changed();
    },
    toggleDay(index: number, bandKey: string, day: number) {
      updateWindows(index, bandKey, (windows, startTime, endTime) => {
        const match = windows.findIndex(window => Number(window.dayOfWeek) === day && window.startTime === startTime && window.endTime === endTime);
        if (match >= 0) windows.splice(match, 1);
        else windows.push({ dayOfWeek: day, startTime, endTime, isActive: true });
      });
    },
    changeTime(index: number, bandKey: string, field: TimeField, value: string) {
      if (!value || value === bandKey.split('|')[field === 'startTime' ? 0 : 1]) return;
      updateWindows(index, bandKey, (windows, startTime, endTime) => {
        const matches = windows.filter(window => window.startTime === startTime && window.endTime === endTime);
        if (matches.length) {
          for (const window of matches) window[field] = value;
        } else {
          windows.push({ dayOfWeek: 1, startTime, endTime, [field]: value, isActive: true });
        }
      });
    },
    addBand(index: number) {
      updateWindows(index, '', windows => {
        const usedDays = new Set(windows.map(window => Number(window.dayOfWeek)));
        const dayOfWeek = [6, 0, 1, 2, 3, 4, 5].find(day => !usedDays.has(day)) ?? 6;
        const endTime = '21:00';
        const startTime = ['17:00', '11:30', '21:00', '22:00'].find(time => !windows.some(window => window.startTime === time && window.endTime === endTime)) ?? '22:00';
        windows.push({ dayOfWeek, startTime, endTime, isActive: true });
      });
    },
    removeBand(index: number, bandKey: string) {
      const shift = state.draft[index];
      if (!canEdit() || !shift) return;
      shift.windows = shift.windows?.filter(window => `${window.startTime}|${window.endTime}` !== bandKey);
      changed();
    }
  };
}
