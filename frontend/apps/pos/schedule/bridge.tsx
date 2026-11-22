import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { TablesView } from '../settings/TableRows';
import { createAssignments, type AssignmentPatch } from './assignments';
import type { CoverageConflict, DineInTableMode, MenuCategory, QrChannel, Shift, ShiftSnapshot, StoreHours, Translate } from './contracts';
import type { QrChannelDraft } from './QrChannelsPanel';
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
declare const storeOperatingHours: StoreHours | undefined;
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
  currentTenantFeatures?: string[];
  storeOperatingShifts?: Shift[];
  storeOperatingHours?: StoreHours;
  storeQrChannels?: QrChannel[];
  dineInTableMode?: DineInTableMode;
  currentLang?: string;
  __posFeaturesResolved?: boolean;
  isMenuScheduleFeatureEnabled?: () => boolean;
  hasDineInFeatureEnabled?: () => boolean;
  isMenuScheduleWorkspaceAvailable?: () => boolean;
  staffOrderingCapabilities?: { tables_read?: boolean; tables_write?: boolean };
  acceptMenuShiftsSnapshot?: (snapshot: ShiftSnapshot) => void;
  acknowledgeMenuScheduleSave?: (patch: AssignmentPatch) => void;
  pruneSavedMenuShiftAssignments?: (validIds: Set<string>) => void;
  openHoursSettingsFromSchedule: () => void;
  loadRestaurantTablesSetting?: () => Promise<void>;
  renderPOSRestaurantTables?: (view: TablesView) => void;
  switchMenuScheduleScreen?: (screen: 'schedule' | 'qr', prefillShiftId?: string) => void;
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
  let activeScreen: 'schedule' | 'qr' = 'schedule';
  let prefillShiftId: string | null = null;
  let channelsLoading = false;
  let tableConfigSaving = false;
  let tablesView: TablesView = { state: 'loading' };

  const qrChannelsList = (): QrChannel[] => Array.isArray(pos.storeQrChannels) ? pos.storeQrChannels : [];
  const tableModeValue = (): DineInTableMode => (
    pos.dineInTableMode === 'none' || pos.dineInTableMode === 'optional' ? pos.dineInTableMode : 'required'
  );
  const hasMenuSchedule = (): boolean => (
    !pos.__posFeaturesResolved || !pos.isMenuScheduleFeatureEnabled || pos.isMenuScheduleFeatureEnabled()
  );
  const hasDineIn = (): boolean => {
    if (typeof pos.hasDineInFeatureEnabled === 'function') {
      if (pos.hasDineInFeatureEnabled()) return true;
      return !pos.__posFeaturesResolved && (!Array.isArray(pos.currentTenantFeatures) || pos.currentTenantFeatures.length === 0);
    }
    const feats = Array.isArray(pos.currentTenantFeatures) ? pos.currentTenantFeatures : null;
    if (!pos.__posFeaturesResolved && (!feats || feats.length === 0)) return true;
    return Boolean(
      feats?.includes('dine_in')
      || feats?.includes('table_qr_ordering')
      || pos.staffOrderingCapabilities?.tables_read
    );
  };

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
    fallbackShifts: shifts,
    fallbackHours: () => (typeof storeOperatingHours !== 'undefined' ? storeOperatingHours : pos.storeOperatingHours) ?? {},
    render,
    focusError: () => document.getElementById('menu-shifts-error')?.focus()
  });
  const writeInProgress = () => saving || editor.state.saving;
  const assignmentsLocked = () => loading || writeInProgress() || editor.state.opening || editor.dirty();

  async function reloadChannels() {
    if (channelsLoading) return;
    channelsLoading = true;
    render();
    try {
      const response = await fetch(endpoint('/api/menu/qr-channels'));
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data?.qrChannels)) pos.storeQrChannels = data.qrChannels;
        if (data?.dineInTableMode) pos.dineInTableMode = data.dineInTableMode;
      }
    } catch (error) {
      console.error('[QrChannels] Load failed', error);
    } finally {
      channelsLoading = false;
      render();
    }
  }

  async function saveChannel(draft: QrChannelDraft): Promise<QrChannel | null> {
    const isUpdate = Boolean(draft.id);
    const response = await fetch(endpoint('/api/menu/qr-channels'), {
      method: isUpdate ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(draft.id ? { id: draft.id } : {}),
        label: draft.label,
        ...(draft.code ? { code: draft.code } : {}),
        diningPolicy: draft.diningPolicy,
        defaultShiftId: draft.defaultShiftId || null,
        defaultLocale: draft.defaultLocale || null,
        isActive: draft.isActive,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `API ${response.status}`);
    }
    if (Array.isArray(data?.qrChannels)) pos.storeQrChannels = data.qrChannels;
    if (typeof showToast === 'function') {
      showToast(t(isUpdate ? 'saveSuccess' : 'collectionQrCreatedToast'), 'success');
    }
    render();
    return data?.channel ?? null;
  }

  async function toggleChannel(channel: QrChannel, isActive: boolean): Promise<void> {
    const response = await fetch(endpoint('/api/menu/qr-channels'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: channel.id, isActive }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(data?.error || t('saveFail'));
      return;
    }
    if (Array.isArray(data?.qrChannels)) pos.storeQrChannels = data.qrChannels;
    render();
  }

  async function deleteChannel(channel: QrChannel): Promise<void> {
    const response = await fetch(`${endpoint('/api/menu/qr-channels')}&id=${encodeURIComponent(channel.id)}`, {
      method: 'DELETE',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `API ${response.status}`);
    }
    if (Array.isArray(data?.qrChannels)) pos.storeQrChannels = data.qrChannels;
    if (typeof showToast === 'function') showToast(t('saveSuccess'), 'success');
    render();
  }

  async function setDineInTableMode(mode: DineInTableMode): Promise<void> {
    if (tableConfigSaving) return;
    tableConfigSaving = true;
    render();
    try {
      const response = await fetch(endpoint('/api/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dineInTableMode: mode }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data?.error || t('saveFail'));
        return;
      }
      pos.dineInTableMode = mode;
      if (mode !== 'none') {
        void pos.loadRestaurantTablesSetting?.();
      }
      if (typeof showToast === 'function') showToast(t('saveSuccess'), 'success');
    } finally {
      tableConfigSaving = false;
      render();
    }
  }

  function selectScreen(screen: 'schedule' | 'qr', nextPrefillShiftId?: string) {
    activeScreen = hasMenuSchedule() ? screen : 'qr';
    if (nextPrefillShiftId) {
      prefillShiftId = nextPrefillShiftId;
    }
    render();
    if (activeScreen === 'qr') {
      if (hasMenuSchedule()) void reloadChannels();
      void pos.loadRestaurantTablesSetting?.();
    }
  }

  function render() {
    if (!initialized) return;
    const language = pos.currentLang || 'zh-TW';
    const menuScheduleEnabled = hasMenuSchedule();
    const dineInEnabled = hasDineIn();
    const effectiveScreen: 'schedule' | 'qr' = menuScheduleEnabled ? activeScreen : 'qr';
    const canReadTables = Boolean(pos.staffOrderingCapabilities?.tables_read || dineInEnabled);
    const canWriteTables = Boolean(
      pos.staffOrderingCapabilities
        ? pos.staffOrderingCapabilities.tables_write
        : dineInEnabled
    );
    flushSync(() => root.render(<ScheduleWorkspace
      categories={categories()} shifts={shifts()} language={language} dayNames={DAY_NAMES[language] ?? DAY_NAMES['zh-TW']}
      t={translate} loading={loading} saving={saving} dirty={assignments.dirty()} editor={editor}
      toggleCategory={toggleCategory} toggleItem={toggleItem} setOutside={setOutside} save={save}
      back={() => switchTab('menu')} openHours={() => pos.openHoursSettingsFromSchedule()}
      activeScreen={effectiveScreen}
      hasMenuSchedule={menuScheduleEnabled}
      hasDineIn={dineInEnabled}
      onSelectScreen={selectScreen}
      qrPanelProps={{
        channels: qrChannelsList(),
        loading: channelsLoading,
        dineInTableMode: tableModeValue(),
        tableConfigSaving,
        hasDineIn: dineInEnabled,
        hasMenuSchedule: menuScheduleEnabled,
        tablesView,
        canReadTables,
        canWriteTables,
        prefillShiftId,
        onClearPrefillShift: () => { prefillShiftId = null; },
        onSaveChannel: saveChannel,
        onToggleChannel: toggleChannel,
        onDeleteChannel: deleteChannel,
        onSetDineInTableMode: setDineInTableMode,
      }}
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
    if (loading || writeInProgress() || assignments.dirty() || editor.dirty()) return;
    initialized = true;
    loading = true;
    render();
    try {
      if (typeof loadMenuData === 'function' && (!categories().length || (typeof isMenuLoading !== 'undefined' && isMenuLoading))) {
        await loadMenuData();
      }
      if (pos.__posFeaturesResolved && !hasMenuSchedule() && !hasDineIn()) {
        assignments.clear();
        if (typeof switchTab === 'function' && (typeof activeTab === 'undefined' || activeTab === 'menu-schedule')) switchTab('menu');
        return;
      }
      if (!hasMenuSchedule() && hasDineIn()) {
        activeScreen = 'qr';
      }
      assignments.reset();
      if (hasMenuSchedule()) {
        await editor.load({ quiet: true });
      }
      if (activeScreen === 'qr') {
        if (hasMenuSchedule()) void reloadChannels();
        void pos.loadRestaurantTablesSetting?.();
      }
      if (!shifts().length && typeof getTenantIdFromUrl === 'function') {
        const response = await fetch(`${endpoint('/api/tenant/bootstrap')}&nocache=1`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data?.tenant?.operatingShifts)) pos.storeOperatingShifts = data.tenant.operatingShifts;
          if (data?.tenant?.operatingHours) pos.storeOperatingHours = data.tenant.operatingHours;
          if (Array.isArray(data?.tenant?.qrChannels)) pos.storeQrChannels = data.tenant.qrChannels;
          if (data?.tenant?.dineInTableMode) pos.dineInTableMode = data.tenant.dineInTableMode;
          editor.seedFallback();
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
    renderMenuShiftEditor: render,
    switchMenuScheduleScreen: selectScreen,
    renderPOSRestaurantTables(view: TablesView) {
      tablesView = view;
      render();
    }
  });
}
