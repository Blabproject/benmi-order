import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createAssignments, type AssignmentPatch } from './assignments';
import type { CoverageConflict, MenuCategory, Shift, ShiftSnapshot, StoreHours, Translate } from './contracts';
import { ScheduleWorkspace } from './ScheduleWorkspace';
import { createShiftEditor } from './shift-editor';
import '@shared/ui/tailwind.css';
import './schedule.css';

// These bindings are provided by the existing POS shell and menu editor.
declare const currentMenuData: MenuCategory[] | null;
declare const activeTab: string;
declare const WORKER_BASE: string;
declare const DAY_NAMES: Record<string, string[]> & { 'zh-TW': string[] };
declare const isMenuLoadedCompletely: boolean;
declare const isMenuLoading: boolean;
declare const MenuSchedule: { shiftCoverageIssues: (shifts: Shift[], hours: StoreHours) => CoverageConflict[] };
declare function t(key: string, params?: Record<string, string | number>): string;
declare function loadMenuData(): Promise<void>;
declare function getTenantIdFromUrl(): string;
declare function switchTab(tab: string): void;
declare function switchSettingTab(card: string): void;
declare function markMenuDirty(): void;
declare function showToast(message: string, type?: string): void;
declare function formatScheduleError(detail: { error?: string; conflicts?: CoverageConflict[] }): string;

interface ScheduleHost extends Window {
  currentMenuData?: MenuCategory[];
  storeOperatingShifts?: Shift[];
  currentLang?: string;
  __posFeaturesResolved?: boolean;
  isMenuScheduleFeatureEnabled?: () => boolean;
  acceptMenuShiftsSnapshot?: (snapshot: ShiftSnapshot) => void;
  acknowledgeMenuScheduleSave?: (patch: AssignmentPatch) => void;
  pruneSavedMenuShiftAssignments?: (validIds: Set<string>) => void;
  openHoursSettingsFromSchedule: () => void;
}

const pos = window as unknown as ScheduleHost;
const mount = document.getElementById('menu-schedule-workspace-root');
const translate: Translate = (key, params) => t(key, params);
const categories = () => {
  const menu = typeof currentMenuData !== 'undefined' && Array.isArray(currentMenuData) ? currentMenuData : pos.currentMenuData ?? [];
  return menu.filter(category => category && (category.type || 'catalog') === 'catalog');
};
const shifts = () => Array.isArray(pos.storeOperatingShifts) ? pos.storeOperatingShifts : [];
const endpoint = (path: string) => `${WORKER_BASE}${path}?tenant_id=${encodeURIComponent(getTenantIdFromUrl())}`;

if (mount) {
  const root = createRoot(mount);
  const assignments = createAssignments(categories, shifts, translate);
  let loading = false, saving = false, initialized = false;
  const editor = createShiftEditor({
    endpoint: () => endpoint('/api/menu/shifts'),
    translate,
    checkCoverage: (draft, hours) => MenuSchedule.shiftCoverageIssues(draft, hours),
    formatError: detail => formatScheduleError(detail),
    acceptSnapshot(data) {
      if (pos.acceptMenuShiftsSnapshot) pos.acceptMenuShiftsSnapshot(data);
      else pos.storeOperatingShifts = data.operatingShifts;
      // The revisioned snapshot also reflects shifts deleted by another device.
      const validShiftIds = assignments.pruneDeletedShifts();
      pos.pruneSavedMenuShiftAssignments?.(validShiftIds);
    },
    afterSave() {
      if (typeof showToast === 'function') showToast(t('saveSuccess'));
    },
    assignmentsBusy: () => loading || saving,
    assignmentsDirty: assignments.dirty,
    render,
    focusError: () => document.getElementById('menu-shifts-error')?.focus()
  });
  const writeInProgress = () => saving || editor.state.saving;
  const assignmentsLocked = () => loading || writeInProgress() || editor.state.opening || editor.dirty();

  function render() {
    if (!initialized) return;
    const language = pos.currentLang || 'zh-TW';
    flushSync(() => root.render(<ScheduleWorkspace
      categories={categories()} shifts={shifts()} language={language} dayNames={DAY_NAMES[language] ?? DAY_NAMES['zh-TW']}
      t={translate} loading={loading} saving={saving} dirty={assignments.dirty()} editor={editor}
      toggleCategory={toggleCategory} toggleItem={toggleItem} setOutside={setOutside} save={save}
      back={() => switchTab('menu')} openHours={() => pos.openHoursSettingsFromSchedule()}
    />));
  }

  function menuChanged() {
    if (typeof markMenuDirty === 'function') markMenuDirty();
  }

  function edit(change: () => boolean) {
    if (assignmentsLocked() || !shifts().length || !change()) return;
    menuChanged();
    render();
  }

  const toggleCategory = (id: string, shift: string, checked: boolean) => edit(() => assignments.toggleCategory(id, shift, checked));
  const toggleItem = (id: string, item: string, shift: string, checked: boolean) => edit(() => assignments.toggleItem(id, item, shift, checked));
  const setOutside = (hidden: boolean) => edit(() => assignments.setOutside(hidden));

  async function init() {
    if (loading || writeInProgress() || assignments.dirty()) return;
    initialized = true;
    loading = true;
    render();
    try {
      if (typeof loadMenuData === 'function' && (!categories().length || (typeof isMenuLoading !== 'undefined' && isMenuLoading))) {
        await loadMenuData();
      }
      if (pos.__posFeaturesResolved && pos.isMenuScheduleFeatureEnabled && !pos.isMenuScheduleFeatureEnabled()) {
        assignments.clear();
        if (typeof switchTab === 'function' && (typeof activeTab === 'undefined' || activeTab === 'menu-schedule')) switchTab('menu');
        return;
      }
      assignments.reset();
      if (!shifts().length && typeof getTenantIdFromUrl === 'function') {
        const response = await fetch(`${endpoint('/api/tenant/bootstrap')}&nocache=1`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data?.tenant?.operatingShifts)) pos.storeOperatingShifts = data.tenant.operatingShifts;
        }
      }
    } catch (error) {
      console.error('[MenuSchedule] Load failed', error);
    } finally {
      loading = false;
      render();
    }
  }

  async function save() {
    if (assignmentsLocked() || !assignments.dirty() || !shifts().length) return;
    if (typeof isMenuLoadedCompletely !== 'undefined' && !isMenuLoadedCompletely) {
      alert(t('menuIncompleteReload'));
      return;
    }
    saving = true;
    render();
    try {
      const patch = assignments.buildPatch();
      const response = await fetch(endpoint('/api/menu/schedule'), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
      });
      if (!response.ok) {
        if (response.status === 409) throw new Error(t('menuScheduleConflict'));
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || `API ${response.status}`);
      }
      pos.acknowledgeMenuScheduleSave?.(patch);
      assignments.reset();
      if (typeof showToast === 'function') showToast(t('menuScheduleSaveSuccess'), 'success');
    } catch (error) {
      alert(t('menuScheduleSaveFail') + (error instanceof Error ? error.message : String(error)));
    } finally {
      saving = false;
      render();
    }
  }

  Object.assign(pos, {
    initMenuScheduleWorkspace: init,
    renderMenuScheduleWorkspace: render,
    isMenuScheduleSaving: writeInProgress,
    hasUnsavedMenuScheduleChanges: () => assignments.dirty() || editor.dirty(),
    hasUnsavedMenuAssignments: assignments.dirty,
    discardMenuScheduleChanges() {
      if (assignments.dirty()) {
        assignments.discard();
        menuChanged();
      }
      editor.discard();
      render();
    },
    openHoursSettingsFromSchedule() {
      switchTab('settings');
      if (typeof activeTab === 'undefined' || activeTab === 'settings') switchSettingTab('setting-card-hours');
    },
    // Keep the hooks used by the POS schedule regression fixtures.
    saveMenuScheduleWorkspace: save,
    onMenuShiftsSaved: assignments.pruneDeletedShifts,
    msToggleCategory: toggleCategory,
    msToggleItem: toggleItem,
    msCopyShift: (target: string, source: string) => edit(() => assignments.copyShift(target, source)),
    msSetOutside: setOutside,
    openMenuShiftEditor: editor.open,
    updateShiftBandTime: editor.changeTime,
    saveMenuShifts: editor.save,
    hasUnsavedMenuShiftChanges: editor.dirty,
    renderMenuShiftEditor: render
  });
}
