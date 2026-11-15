import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import '@pos/pos-option-groups.css';
import type { MenuCategoryDraft } from '@shared/contracts/menu-model';
import {
  findGroupById,
  normalizeSearchText,
  type OptionCatalogDto,
} from '@shared/contracts/option-groups-model';
import { translatePos, type PosLocale } from '@shared/i18n/pos-dictionary';
import { PosOptionGroupsDrawer } from '@pos/PosOptionGroupsDrawer';
import { PosOptionGroupsSidebar } from '@pos/PosOptionGroupsSidebar';
import { PosOptionGroupsWorkspace } from '@pos/PosOptionGroupsWorkspace';
import { createOptionGroupsStore, type OptionGroupsStore } from '@pos/option-groups-store';

export interface UnifiedMenuGlobalApi {
  readonly enabled: boolean;
  imageKey: (url?: string | null) => string | null;
  groupCount: () => number;
  load: (tenantId?: string, force?: boolean) => Promise<OptionCatalogDto | null>;
  product: (
    productIdOrCatIdx: string | number,
    modeOrItemIdx?: 'product' | 'product-options' | number,
    entry?: 'options' | string
  ) => Promise<void>;
  group: (
    groupId?: string | null,
    action?: 'add-option' | 'linked' | 'option' | 'group' | 'new-item' | 'new-order',
    optionId?: string,
    defaultScope?: 'item' | 'order'
  ) => Promise<void>;
  option: (groupId: string, optionId: string) => Promise<void>;
  sidebar: () => boolean;
  filterGroups: (query: string) => void;
  workspace: () => void;
  _store?: OptionGroupsStore;
}

interface PosOptionGroupsWindow extends Window {
  currentLang?: string;
  TENANT_ID?: string;
  tenantId?: string;
  getTenantIdFromUrl?: () => string;
  WORKER_BASE?: string;
  WORKER_URL?: string;
  currentMenuData?: MenuCategoryDraft[];
  savedMenuSnapshot?: string;
  canonicalMenuSnapshot?: (data: MenuCategoryDraft[]) => string;
  _tenantImageList?: Set<string> | null;
  menuSidebarTab?: string;
  buildPosAuthHeaders?: (isJson?: boolean) => Record<string, string>;
  isTenantMultilingualEnabled?: () => boolean;
  currentTenantI18nEnabled?: boolean;
  getTenantAiTargetLocales?: () => string[];
  syncMenuDataFromDOM?: () => void;
  renderMenuCategories?: () => void;
  renderMenuCategoryEditor?: () => void;
  checkMenuDirty?: () => void;
  setMenuMobileView?: (mode: 'master' | 'detail') => void;
  applyLanguageToDOM?: () => void;
  __posOptionGroupsBridgeMounted?: boolean;
  UnifiedMenu?: UnifiedMenuGlobalApi;
}

function getWin(): PosOptionGroupsWindow {
  return window as unknown as PosOptionGroupsWindow;
}

function readLocale(): PosLocale {
  return getWin().currentLang === 'vi' ? 'vi' : 'zh-TW';
}

function readTenantId(): string {
  const win = getWin();
  if (typeof win.getTenantIdFromUrl === 'function') {
    const fromUrl = String(win.getTenantIdFromUrl() || '').trim();
    if (fromUrl) return fromUrl;
  }
  return String(win.TENANT_ID || win.tenantId || '').trim();
}

function readWorkerBase(): string {
  const win = getWin();
  return String(win.WORKER_BASE || win.WORKER_URL || '').replace(/\/+$/, '');
}

function readAuthHeaders(isJson = true): Record<string, string> {
  const win = getWin();
  if (typeof win.buildPosAuthHeaders === 'function') {
    return win.buildPosAuthHeaders(isJson);
  }
  return isJson ? { 'Content-Type': 'application/json' } : {};
}

function readMultilingualEnabled(): boolean {
  const win = getWin();
  if (typeof win.isTenantMultilingualEnabled === 'function') {
    return Boolean(win.isTenantMultilingualEnabled());
  }
  if (win.currentTenantI18nEnabled === false) return false;
  return Boolean(win.currentTenantI18nEnabled);
}

function readAiTargetLocales(): string[] {
  const win = getWin();
  if (typeof win.getTenantAiTargetLocales === 'function') {
    const list = win.getTenantAiTargetLocales();
    if (Array.isArray(list) && list.length > 0) return list;
  }
  return ['vi', 'en'];
}

function extractImageKey(url?: string | null): string | null {
  const s = String(url || '').trim();
  if (!s) return null;
  if (s.startsWith('r2:')) return s.slice(3);
  try {
    const parsed = new URL(s, 'http://localhost');
    const key = parsed.searchParams.get('key');
    if (key) return key;
  } catch {
    // ignore invalid URL
  }
  return s;
}

function resolveMenuImageUrl(raw?: string | null): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.startsWith('r2:')) {
    const key = s.slice(3);
    const base = readWorkerBase();
    return `${base}/api/image?key=${encodeURIComponent(key)}`;
  }
  return s;
}

function syncWorkspaceChrome(store: OptionGroupsStore) {
  if (typeof document === 'undefined') return;
  const snap = store.getSnapshot();
  const locale = snap.locale;
  const tr = (key: Parameters<typeof translatePos>[1]) => translatePos(locale, key);
  const selectedGroup = findGroupById(snap.catalog, snap.selectedGroupId);

  const footer = document.getElementById('menu-editor-footer');
  if (footer) footer.hidden = true;

  for (const id of [
    'btn-category-rename',
    'btn-category-delete',
    'btn-menu-create-unified',
    'cat-title-actions',
  ]) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  const titleEl = document.getElementById('menu-editor-title');
  if (titleEl) {
    titleEl.textContent = selectedGroup ? selectedGroup.name : tr('ugNoGroups');
  }

  const editBtn = document.getElementById('btn-option-group-edit') as HTMLButtonElement | null;
  if (editBtn) {
    editBtn.hidden = !selectedGroup;
    editBtn.title = tr('ugGroup');
    editBtn.setAttribute('aria-label', tr('ugGroup'));
    editBtn.onclick = selectedGroup ? () => void getWin().UnifiedMenu?.group(selectedGroup.id) : null;
  }

  const addBtn = document.getElementById('btn-option-add') as HTMLButtonElement | null;
  if (addBtn) {
    addBtn.hidden = !selectedGroup;
    const span = addBtn.querySelector('span');
    if (span) {
      span.textContent = tr('ugAdd');
    } else {
      addBtn.textContent = tr('ugAdd');
    }
    addBtn.onclick = selectedGroup
      ? () => void getWin().UnifiedMenu?.group(selectedGroup.id, 'add-option')
      : null;
  }
}

export function mountOptionGroupsBridge() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const win = getWin();
  if (win.__posOptionGroupsBridgeMounted) return;
  win.__posOptionGroupsBridgeMounted = true;

  let returnFocusEl: HTMLElement | null = null;
  let drawerRoot: Root | null = null;
  let sidebarRoot: Root | null = null;
  let sidebarHostEl: HTMLElement | null = null;
  let workspaceRoot: Root | null = null;
  let workspaceHostEl: HTMLElement | null = null;

  const setInertSiblings = (open: boolean) => {
    if (open) {
      returnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.body.classList.add('ug-open');
      const drawerMount = document.getElementById('pos-option-groups-drawer-root');
      const drawerEl = document.getElementById('unified-menu-drawer');
      for (const child of Array.from(document.body.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (child === drawerMount || child === drawerEl || (drawerEl && child.contains(drawerEl))) {
          continue;
        }
        if (!child.hasAttribute('inert') && !child.inert) {
          child.inert = true;
          child.setAttribute('inert', '');
          child.setAttribute('data-ug-inert', '1');
        }
      }
    } else {
      document.body.classList.remove('ug-open');
      for (const child of Array.from(document.body.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.getAttribute('data-ug-inert') === '1') {
          child.inert = false;
          child.removeAttribute('inert');
          child.removeAttribute('data-ug-inert');
        }
      }
      if (returnFocusEl && returnFocusEl.isConnected) {
        try {
          returnFocusEl.focus();
        } catch {
          // ignore focus errors
        }
      }
      returnFocusEl = null;
    }
  };

  const store = createOptionGroupsStore({
    getLocale: readLocale,
    getTenantId: readTenantId,
    getWorkerBase: readWorkerBase,
    getCurrentMenuData: () => win.currentMenuData || [],
    getSavedMenuSnapshot: () => String(win.savedMenuSnapshot || '[]'),
    setMenuSnapshots: (nextMenuData, nextSavedSnapshot) => {
      win.currentMenuData = nextMenuData;
      win.savedMenuSnapshot = nextSavedSnapshot;
    },
    getAuthHeaders: readAuthHeaders,
    serializeCanonical: (data) =>
      typeof win.canonicalMenuSnapshot === 'function'
        ? win.canonicalMenuSnapshot(data)
        : JSON.stringify(data),
    invalidateMenuImageCache: (keys) => {
      if (win._tenantImageList && typeof win._tenantImageList.delete === 'function') {
        for (const k of keys) {
          win._tenantImageList.delete(k);
        }
      }
    },
    afterSaveSync: () => {
      win.renderMenuCategories?.();
      win.renderMenuCategoryEditor?.();
      win.checkMenuDirty?.();
      if (win.menuSidebarTab === 'options') {
        syncWorkspaceChrome(store);
      }
    },
    onDrawerOpenChange: (open) => {
      setInertSiblings(open);
    },
    onGroupSelected: (groupId) => {
      if (groupId && typeof win.setMenuMobileView === 'function') {
        syncWorkspaceChrome(store);
        win.setMenuMobileView('detail');
      }
    },
    onGroupDeleted: () => {
      if (typeof win.setMenuMobileView === 'function') {
        win.setMenuMobileView('master');
      }
    },
    syncMenuDataFromDOM: () => {
      win.syncMenuDataFromDOM?.();
    },
    alertFn: (msg: string) => {
      if (typeof win.alert === 'function') {
        win.alert(msg);
      }
    },
    onValidationFocus: (field: string) => {
      flushAllSync();
      const target = document.querySelector<HTMLElement>(
        `#unified-menu-drawer [data-field="${field}"]`
      );
      target?.focus?.();
    },
    isTenantMultilingualEnabled: readMultilingualEnabled,
    getTenantAiTargetLocales: readAiTargetLocales,
  });

  let isFlushing = false;
  let pendingFlush = false;

  const syncSidebarDetailsOpen = () => {
    if (!sidebarHostEl || !sidebarHostEl.isConnected) return;
    const snap = store.getSnapshot();
    const groups = snap.catalog?.groups ?? [];
    const nq = normalizeSearchText(snap.groupQuery);
    const matching = nq ? groups.filter((g) => normalizeSearchText(g.name).includes(nq)) : groups;
    for (const scope of ['order', 'item'] as const) {
      const details = sidebarHostEl.querySelector<HTMLDetailsElement>(
        `[data-group-scope="${scope}"]`
      );
      if (!details) continue;
      const count = matching.filter((g) =>
        scope === 'order' ? g.scope === 'order' : g.scope !== 'order'
      ).length;
      const shouldOpen = nq ? count > 0 : snap.groupSectionsOpen[scope];
      if (details.open !== shouldOpen) {
        details.open = shouldOpen;
      }
    }
  };

  const renderMountedRoots = () => {
    const snap = store.getSnapshot();
    if (drawerRoot) {
      drawerRoot.render(
        <PosOptionGroupsDrawer
          store={store}
          snapshot={snap}
          multilingualEnabled={readMultilingualEnabled()}
          aiTargetLocales={readAiTargetLocales()}
          imageUrlResolver={resolveMenuImageUrl}
        />
      );
    }
    if (sidebarRoot && sidebarHostEl?.isConnected) {
      sidebarRoot.render(
        <PosOptionGroupsSidebar
          store={store}
          locale={snap.locale}
          catalog={snap.catalog}
          selectedGroupId={snap.selectedGroupId}
          groupQuery={snap.groupQuery}
          groupSectionsOpen={snap.groupSectionsOpen}
          loading={snap.loadingCatalog}
        />
      );
    }
    if (workspaceRoot && workspaceHostEl?.isConnected) {
      const selectedGroup = findGroupById(snap.catalog, snap.selectedGroupId);
      workspaceRoot.render(
        <PosOptionGroupsWorkspace
          store={store}
          locale={snap.locale}
          catalog={snap.catalog}
          selectedGroup={selectedGroup ?? null}
          loading={snap.loadingCatalog}
        />
      );
    }
  };

  const flushAllSync = () => {
    if (isFlushing) {
      pendingFlush = true;
      return;
    }
    isFlushing = true;
    try {
      flushSync(() => {
        renderMountedRoots();
      });
      syncSidebarDetailsOpen();
    } catch {
      renderMountedRoots();
      syncSidebarDetailsOpen();
    } finally {
      isFlushing = false;
    }
    if (pendingFlush) {
      pendingFlush = false;
      flushAllSync();
    }
  };

  store.subscribe(() => {
    if (win.menuSidebarTab === 'options' && workspaceHostEl?.isConnected) {
      syncWorkspaceChrome(store);
    }
    flushAllSync();
  });

  const ensureDrawerMounted = () => {
    let container = document.getElementById('pos-option-groups-drawer-root');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pos-option-groups-drawer-root';
      document.body.appendChild(container);
    }
    if (!drawerRoot) {
      drawerRoot = createRoot(container);
      flushAllSync();
    }
  };

  ensureDrawerMounted();

  const ensureWorkspaceAttached = () => {
    if (!store.getSnapshot().catalog) return false;
    const container = document.getElementById('menu-editor-body');
    if (!container) return false;
    container.classList.add('is-option-workspace');
    syncWorkspaceChrome(store);
    if (!workspaceHostEl || !container.contains(workspaceHostEl)) {
      if (workspaceRoot) {
        try {
          workspaceRoot.unmount();
        } catch {
          // ignore unmount errors
        }
        workspaceRoot = null;
      }
      container.innerHTML = '';
      workspaceHostEl = document.createElement('div');
      workspaceHostEl.id = 'pos-ug-workspace-react-root';
      container.appendChild(workspaceHostEl);
      workspaceRoot = createRoot(workspaceHostEl);
    }
    return true;
  };

  const renderSidebar = (): boolean => {
    if (!store.getSnapshot().catalog || (win.menuSidebarTab && win.menuSidebarTab !== 'options')) {
      return false;
    }
    const container = document.getElementById('menu-categories');
    if (!container) return false;
    container.classList.add('is-option-groups');
    if (!sidebarHostEl || !container.contains(sidebarHostEl)) {
      if (sidebarRoot) {
        try {
          sidebarRoot.unmount();
        } catch {
          // ignore unmount errors
        }
        sidebarRoot = null;
      }
      container.innerHTML = '';
      sidebarHostEl = document.createElement('div');
      sidebarHostEl.id = 'pos-ug-sidebar-react-root';
      container.appendChild(sidebarHostEl);
      sidebarRoot = createRoot(sidebarHostEl);
    }
    ensureWorkspaceAttached();
    flushAllSync();
    return true;
  };

  const renderWorkspace = () => {
    if (!ensureWorkspaceAttached()) return;
    flushAllSync();
  };

  const prevApplyLang = win.applyLanguageToDOM;
  win.applyLanguageToDOM = () => {
    if (typeof prevApplyLang === 'function') {
      prevApplyLang();
    }
    store.setLocale(readLocale());
    if (win.menuSidebarTab === 'options') {
      syncWorkspaceChrome(store);
    }
  };

  win.UnifiedMenu = {
    get enabled() {
      return true;
    },
    imageKey: extractImageKey,
    groupCount: () => store.getSnapshot().catalog?.groups.length ?? 0,
    load: (tenantId, force) => store.load(tenantId, force),
    product: (productIdOrCatIdx, modeOrItemIdx, entry) => {
      ensureDrawerMounted();
      return store.openProduct(productIdOrCatIdx, modeOrItemIdx, entry);
    },
    group: (groupId, action, optionId, defaultScope) => {
      ensureDrawerMounted();
      return store.openGroup(groupId, action, optionId, defaultScope);
    },
    option: (groupId, optionId) => {
      ensureDrawerMounted();
      return store.openOption(groupId, optionId);
    },
    sidebar: renderSidebar,
    filterGroups: (query: string) => {
      store.setGroupQuery(query);
    },
    workspace: renderWorkspace,
    _store: store,
  };
}

mountOptionGroupsBridge();
