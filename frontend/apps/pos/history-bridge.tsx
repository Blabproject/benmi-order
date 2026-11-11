import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import '@shared/ui/tokens.css';
import './pos-history.css';
import type { HistoryOrderDto } from '@shared/contracts/api';
import { resolveWorkerBase } from '@shared/infra/http';
import type { PosLocale } from '@shared/i18n/pos-dictionary';
import { PosHistoryPanel } from './PosHistoryPanel';
import { createHistoryBridgeStore, type HistoryBridgeStore } from './history-store';

interface PosBridgeWindow extends Window {
  WORKER_BASE?: string;
  currentLang?: string;
  allowDineIn?: boolean;
  currentTenantFeatures?: string[];
  currentOrders?: HistoryOrderDto[];
  posOptionIdMap?: Map<string, string>;
  lastHistoryOrders?: HistoryOrderDto[];
  getTenantIdFromUrl?: () => string;
  isDineInSupported?: () => boolean;
  openReview?: (orderKey: string) => void;
  openBlabContactModal?: (context: string) => void;
  applyLanguageToDOM?: ((...args: unknown[]) => unknown) & {
    __benmiHistoryWrapped?: boolean;
  };
  fetchHistoryOrders?: (force?: boolean) => Promise<void>;
  renderHistory?: (orders?: HistoryOrderDto[]) => void;
  updateHistoryFilterVisibility?: () => void;
  onHistorySearchInput?: (value?: string) => void;
  clearHistorySearch?: () => void;
  setHistoryFilter?: (type?: string) => void;
  toggleHistoryDateGroup?: (date: string) => void;
  toggleAllHistoryGroups?: () => void;
}

function getPosWindow(): PosBridgeWindow {
  return window as unknown as PosBridgeWindow;
}

function readLocale(): PosLocale {
  return getPosWindow().currentLang === 'vi' ? 'vi' : 'zh-TW';
}

function readDineInSupported(): boolean {
  const posWindow = getPosWindow();
  if (typeof posWindow.isDineInSupported === 'function') {
    return Boolean(posWindow.isDineInSupported());
  }
  return (
    Array.isArray(posWindow.currentTenantFeatures) &&
    posWindow.currentTenantFeatures.includes('dine_in') &&
    posWindow.allowDineIn !== false
  );
}

function readTenantId(): string {
  const posWindow = getPosWindow();
  if (typeof posWindow.getTenantIdFromUrl === 'function') {
    return String(posWindow.getTenantIdFromUrl() || '');
  }
  const params = new URLSearchParams(window.location.search);
  return (params.get('tenant') || params.get('tenant_id') || '').trim();
}

function readWorkerBase(): string {
  const posWindow = getPosWindow();
  if (typeof posWindow.WORKER_BASE === 'string' && posWindow.WORKER_BASE.trim()) {
    return posWindow.WORKER_BASE.trim();
  }
  return resolveWorkerBase(window.location);
}

function readFallbackCurrentOrders(): readonly HistoryOrderDto[] {
  const posWindow = getPosWindow();
  return Array.isArray(posWindow.currentOrders) ? posWindow.currentOrders : [];
}

function PosHistoryWorkspace({ store }: { store: HistoryBridgeStore }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const posWindow = getPosWindow();

  return (
    <PosHistoryPanel
      orders={snapshot.orders}
      groups={snapshot.groups}
      filteredCount={snapshot.filteredCount}
      locale={snapshot.locale}
      loading={snapshot.loading}
      searchQuery={snapshot.searchQuery}
      filterType={snapshot.filterType}
      dineInSupported={snapshot.dineInSupported}
      expandedKeys={snapshot.expandedKeys}
      isFiltering={snapshot.isFiltering}
      isAllExpanded={snapshot.isAllExpanded}
      nowMs={snapshot.nowMs}
      resolveOptionLabel={id => posWindow.posOptionIdMap?.get(id)}
      onSearchChange={value => store.setSearchQuery(value)}
      onClearSearch={() => {
        store.clearSearch();
        document.getElementById('history-search-input')?.focus();
      }}
      onFilterChange={type => store.setFilterType(type)}
      onClearAllFilters={() => store.clearAllFilters()}
      onToggleDate={date => store.toggleDateGroup(date)}
      onToggleAll={() => store.toggleAllGroups()}
      onSelectOrder={orderKey => posWindow.openReview?.(orderKey)}
      onOpenSupport={() => posWindow.openBlabContactModal?.('history')}
    />
  );
}

let mountedRoot: Root | null = null;
let isFlushing = false;

function flushBridgeUpdate(fn: () => void): void {
  if (isFlushing) {
    fn();
    return;
  }
  isFlushing = true;
  try {
    flushSync(fn);
  } finally {
    isFlushing = false;
  }
}

/** Mounts the React POS History panel inside #pos-history-react-root and registers legacy window bridges. */
export function mountPosHistoryBridge(mountEl: HTMLElement | null = document.getElementById('pos-history-react-root')): HistoryBridgeStore | null {
  if (!mountEl) return null;

  const store = createHistoryBridgeStore({
    initialLocale: readLocale(),
    initialDineInSupported: readDineInSupported(),
    expandMode: 'latest'
  });

  const posWindow = getPosWindow();

  Object.defineProperty(posWindow, 'lastHistoryOrders', {
    configurable: true,
    enumerable: true,
    get() {
      return store.getOrders();
    },
    set(next: HistoryOrderDto[]) {
      flushBridgeUpdate(() => {
        store.setOrders(next);
      });
    }
  });

  posWindow.updateHistoryFilterVisibility = () => {
    flushBridgeUpdate(() => {
      store.setLocale(readLocale());
      store.updateFilterVisibility(readDineInSupported());
    });
  };

  posWindow.renderHistory = (orders?: HistoryOrderDto[]) => {
    flushBridgeUpdate(() => {
      store.setLocale(readLocale());
      store.renderHistory(orders, readDineInSupported());
    });
  };

  posWindow.fetchHistoryOrders = async (force = false) => {
    flushBridgeUpdate(() => {
      store.setLocale(readLocale());
      store.updateFilterVisibility(readDineInSupported());
    });
    await store.fetchHistoryOrders(
      {
        tenantId: readTenantId(),
        workerBase: readWorkerBase(),
        fetcher: window.fetch.bind(window),
        getFallbackCurrentOrders: readFallbackCurrentOrders,
        isDineInSupported: readDineInSupported
      },
      force
    );
  };

  posWindow.onHistorySearchInput = (value = '') => {
    flushBridgeUpdate(() => {
      store.setSearchQuery(value);
    });
  };

  posWindow.clearHistorySearch = () => {
    flushBridgeUpdate(() => {
      store.clearSearch();
    });
    document.getElementById('history-search-input')?.focus();
  };

  posWindow.setHistoryFilter = (type = 'all') => {
    flushBridgeUpdate(() => {
      store.setFilterType(type);
    });
  };

  posWindow.toggleHistoryDateGroup = (date: string) => {
    flushBridgeUpdate(() => {
      store.toggleDateGroup(date);
    });
  };

  posWindow.toggleAllHistoryGroups = () => {
    flushBridgeUpdate(() => {
      store.toggleAllGroups();
    });
  };

  const prevApply = posWindow.applyLanguageToDOM;
  if (typeof prevApply === 'function' && !prevApply.__benmiHistoryWrapped) {
    const wrappedApply = function patchedApplyLanguageToDOM(this: unknown, ...args: unknown[]) {
      const result = prevApply.apply(this, args);
      flushBridgeUpdate(() => {
        store.setLocale(readLocale());
        store.updateFilterVisibility(readDineInSupported());
      });
      return result;
    } as NonNullable<PosBridgeWindow['applyLanguageToDOM']>;
    wrappedApply.__benmiHistoryWrapped = true;
    posWindow.applyLanguageToDOM = wrappedApply;
  }

  mountedRoot = createRoot(mountEl);
  flushBridgeUpdate(() => {
    mountedRoot?.render(
      <StrictMode>
        <PosHistoryWorkspace store={store} />
      </StrictMode>
    );
  });

  return store;
}

if (typeof document !== 'undefined') {
  if (document.getElementById('pos-history-react-root')) {
    mountPosHistoryBridge();
  } else {
    document.addEventListener('DOMContentLoaded', () => mountPosHistoryBridge(), { once: true });
  }
}
