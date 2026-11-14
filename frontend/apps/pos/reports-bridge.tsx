import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import '@shared/ui/tokens.css';
import './pos-reports.css';
import type { ItemAnalyticsSummaryDto, ReportRange } from '@shared/contracts/api';
import { resolveWorkerBase } from '@shared/infra/http';
import type { PosLocale } from '@shared/i18n/pos-dictionary';
import { PosReportsPanel } from './PosReportsPanel';
import {
  createReportsBridgeStore,
  type FetchReportsDependencies,
  type ReportsBridgeStore
} from './reports-store';

interface PosReportsBridgeWindow extends Window {
  WORKER_BASE?: string;
  currentLang?: string;
  currentTenantId?: string;
  activeTab?: string;
  currentReportRange?: ReportRange;
  cachedReportData?: ItemAnalyticsSummaryDto | null;
  getTenantIdFromUrl?: () => string;
  openSettings?: () => void;
  applyLanguageToDOM?: ((...args: unknown[]) => unknown) & {
    __benmiReportsWrapped?: boolean;
  };
  selectReportRange?: (range: string) => void;
  refreshReportData?: () => void;
  fetchReportData?: (range?: string, forceRefresh?: boolean) => Promise<void>;
  renderReports?: (data: ItemAnalyticsSummaryDto | null) => void;
}

function getPosWindow(): PosReportsBridgeWindow {
  return window as unknown as PosReportsBridgeWindow;
}

function readLocale(): PosLocale {
  return getPosWindow().currentLang === 'vi' ? 'vi' : 'zh-TW';
}

function readTenantId(): string {
  const posWindow = getPosWindow();
  if (typeof posWindow.getTenantIdFromUrl === 'function') {
    const fromUrl = String(posWindow.getTenantIdFromUrl() || '').trim();
    if (fromUrl) return fromUrl;
  }
  const fromGlobal = typeof posWindow.currentTenantId === 'string' ? posWindow.currentTenantId.trim() : '';
  if (fromGlobal) return fromGlobal;
  const params = new URLSearchParams(window.location.search);
  return (params.get('tenant') || params.get('tenant_id') || 'benmi').trim() || 'benmi';
}

function readWorkerBase(): string {
  const posWindow = getPosWindow();
  if (typeof posWindow.WORKER_BASE === 'string' && posWindow.WORKER_BASE.trim()) {
    return posWindow.WORKER_BASE.trim();
  }
  return resolveWorkerBase(window.location);
}

function buildFetchDeps(): FetchReportsDependencies {
  return {
    tenantId: readTenantId(),
    workerBase: readWorkerBase(),
    fetcher: window.fetch.bind(window)
  };
}

function PosReportsWorkspace({ store }: { store: ReportsBridgeStore }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const posWindow = getPosWindow();

  return (
    <PosReportsPanel
      range={snapshot.range}
      data={snapshot.data}
      rows={snapshot.rows}
      dateRangeLabel={snapshot.dateRangeLabel}
      locale={snapshot.locale}
      loading={snapshot.loading}
      error={snapshot.error}
      onSelectRange={nextRange => {
        void store.selectRange(buildFetchDeps(), nextRange);
      }}
      onRefresh={() => {
        void store.fetchReports(buildFetchDeps(), snapshot.range, true);
      }}
      onBackToSettings={() => posWindow.openSettings?.()}
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

/** Mounts the React POS Reports panel inside #pos-reports-react-root and registers legacy window bridges. */
export function mountPosReportsBridge(
  mountEl: HTMLElement | null = document.getElementById('pos-reports-react-root')
): ReportsBridgeStore | null {
  if (!mountEl) return null;

  const store = createReportsBridgeStore({
    initialLocale: readLocale(),
    initialRange: 'today'
  });

  const posWindow = getPosWindow();

  Object.defineProperty(posWindow, 'currentReportRange', {
    configurable: true,
    enumerable: true,
    get() {
      return store.getRange();
    },
    set(next: string) {
      flushBridgeUpdate(() => {
        void store.selectRange(buildFetchDeps(), next);
      });
    }
  });

  Object.defineProperty(posWindow, 'cachedReportData', {
    configurable: true,
    enumerable: true,
    get() {
      return store.getData();
    },
    set(next: ItemAnalyticsSummaryDto | null) {
      flushBridgeUpdate(() => {
        store.setCachedData(next);
      });
    }
  });

  posWindow.selectReportRange = (range: string) => {
    void store.selectRange(buildFetchDeps(), range);
  };

  posWindow.refreshReportData = () => {
    void store.fetchReports(buildFetchDeps(), store.getRange(), true);
  };

  posWindow.fetchReportData = async (range = 'today', forceRefresh = false) => {
    flushBridgeUpdate(() => {
      store.setLocale(readLocale());
    });
    await store.fetchReports(buildFetchDeps(), range, forceRefresh);
  };

  posWindow.renderReports = (data: ItemAnalyticsSummaryDto | null) => {
    flushBridgeUpdate(() => {
      store.setLocale(readLocale());
      store.renderReports(data);
    });
  };

  const prevApply = posWindow.applyLanguageToDOM;
  if (typeof prevApply === 'function' && !prevApply.__benmiReportsWrapped) {
    const wrappedApply = function patchedApplyLanguageToDOM(this: unknown, ...args: unknown[]) {
      const result = prevApply.apply(this, args);
      flushBridgeUpdate(() => {
        store.setLocale(readLocale());
      });
      return result;
    } as NonNullable<PosReportsBridgeWindow['applyLanguageToDOM']>;
    wrappedApply.__benmiReportsWrapped = true;
    posWindow.applyLanguageToDOM = wrappedApply;
  }

  mountedRoot = createRoot(mountEl);
  flushBridgeUpdate(() => {
    mountedRoot?.render(
      <StrictMode>
        <PosReportsWorkspace store={store} />
      </StrictMode>
    );
  });

  if (posWindow.activeTab === 'reports') {
    void store.fetchReports(buildFetchDeps(), store.getRange(), false);
  }

  return store;
}

if (typeof document !== 'undefined') {
  if (document.getElementById('pos-reports-react-root')) {
    mountPosReportsBridge();
  } else {
    document.addEventListener('DOMContentLoaded', () => mountPosReportsBridge(), { once: true });
  }
}
