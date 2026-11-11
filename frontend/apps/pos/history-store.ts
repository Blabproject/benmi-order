import type { HistoryOrderDto } from '@shared/contracts/api';
import {
  areAllDatesExpanded,
  buildHistoryGroups,
  createInitialHistoryExpandedKeys,
  toggleAllDatesExpanded,
  toggleDateExpanded,
  type DefaultHistoryExpandMode,
  type HistoryDateGroup,
  type HistoryFilterType
} from '@shared/contracts/history-model';
import { formatOrderCode } from '@shared/contracts/order-formatters';
import type { PosLocale } from '@shared/i18n/pos-dictionary';

export interface HistoryBridgeSnapshot {
  orders: HistoryOrderDto[];
  locale: PosLocale;
  loading: boolean;
  searchQuery: string;
  filterType: HistoryFilterType;
  dineInSupported: boolean;
  expandedKeys: ReadonlySet<string>;
  initialized: boolean;
  nowMs?: number;
  groups: HistoryDateGroup[];
  filteredCount: number;
  isFiltering: boolean;
  isAllExpanded: boolean;
}

export interface FetchHistoryDependencies {
  tenantId: string;
  workerBase: string;
  fetcher: typeof fetch;
  getFallbackCurrentOrders: () => readonly HistoryOrderDto[];
  isDineInSupported: () => boolean;
  now?: () => number;
}

const HISTORY_CACHE_TTL_MS = 15_000;
const FINISHED_FALLBACK_STATUSES = new Set(['PICKED_UP', 'REJECTED', 'PAID']);

/** Framework-agnostic reactive store backing both React UI and legacy imperative POS callers. */
export function createHistoryBridgeStore(options: {
  initialLocale?: PosLocale;
  initialDineInSupported?: boolean;
  expandMode?: DefaultHistoryExpandMode;
  nowMs?: number;
} = {}) {
  const expandMode: DefaultHistoryExpandMode = options.expandMode ?? 'latest';
  let orders: HistoryOrderDto[] = [];
  let locale: PosLocale = options.initialLocale ?? 'zh-TW';
  let loading = false;
  let searchQuery = '';
  let filterType: HistoryFilterType = 'all';
  let dineInSupported = options.initialDineInSupported ?? true;
  let expandedKeys = new Set<string>();
  let initialized = false;
  let lastTenantId: string | null = null;
  let lastFetchedAt = 0;

  const listeners = new Set<() => void>();
  let currentSnapshot = buildSnapshot();

  function buildSnapshot(): HistoryBridgeSnapshot {
    const isFiltering = Boolean(searchQuery.trim() || filterType !== 'all');
    const { filtered, groups } = buildHistoryGroups(orders, {
      filterType,
      searchQuery,
      nowMs: options.nowMs,
      formatDisplayCode: formatOrderCode
    });
    const dates = groups.map(group => group.date);
    return {
      orders,
      locale,
      loading,
      searchQuery,
      filterType,
      dineInSupported,
      expandedKeys,
      initialized,
      nowMs: options.nowMs,
      groups,
      filteredCount: filtered.length,
      isFiltering,
      isAllExpanded: areAllDatesExpanded(dates, expandedKeys, isFiltering)
    };
  }

  function emit(): void {
    currentSnapshot = buildSnapshot();
    for (const listener of listeners) {
      listener();
    }
  }

  function ensureInitialExpansion(nextOrders: readonly HistoryOrderDto[]): void {
    if (initialized) return;
    const { groups } = buildHistoryGroups(nextOrders, {
      filterType,
      searchQuery,
      nowMs: options.nowMs,
      formatDisplayCode: formatOrderCode
    });
    if (groups.length > 0) {
      expandedKeys = new Set(createInitialHistoryExpandedKeys(groups.map(g => g.date), expandMode));
      initialized = true;
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): HistoryBridgeSnapshot {
      return currentSnapshot;
    },

    getOrders(): HistoryOrderDto[] {
      return orders;
    },

    setOrders(nextOrders: readonly HistoryOrderDto[]): void {
      orders = Array.isArray(nextOrders) ? [...nextOrders] : [];
      ensureInitialExpansion(orders);
      emit();
    },

    renderHistory(nextOrders?: readonly HistoryOrderDto[], isSupported?: boolean): void {
      if (typeof isSupported === 'boolean') {
        dineInSupported = isSupported;
        if (!dineInSupported && filterType !== 'all') {
          filterType = 'all';
        }
      }
      if (Array.isArray(nextOrders)) {
        orders = [...nextOrders];
      }
      loading = false;
      ensureInitialExpansion(orders);
      emit();
    },

    updateFilterVisibility(isSupported: boolean): void {
      dineInSupported = isSupported;
      if (!isSupported && filterType !== 'all') {
        filterType = 'all';
      }
      emit();
    },

    setLocale(nextLocale: PosLocale): void {
      if (locale === nextLocale) return;
      locale = nextLocale;
      emit();
    },

    setSearchQuery(value: string): void {
      const normalized = String(value ?? '');
      if (searchQuery === normalized) return;
      searchQuery = normalized;
      emit();
    },

    clearSearch(): void {
      if (!searchQuery) return;
      searchQuery = '';
      emit();
    },

    setFilterType(type: HistoryFilterType | string): void {
      const target: HistoryFilterType =
        type === 'dine_in' || type === 'takeaway' ? type : 'all';
      const next = filterType === target && target !== 'all' ? 'all' : target;
      if (filterType === next) return;
      filterType = next;
      emit();
    },

    clearAllFilters(): void {
      if (!searchQuery && filterType === 'all') return;
      searchQuery = '';
      filterType = 'all';
      emit();
    },

    toggleDateGroup(date: string): void {
      const isFiltering = Boolean(searchQuery.trim() || filterType !== 'all');
      expandedKeys = toggleDateExpanded(expandedKeys, date, isFiltering);
      initialized = true;
      emit();
    },

    toggleAllGroups(): void {
      const isFiltering = Boolean(searchQuery.trim() || filterType !== 'all');
      const dates = currentSnapshot.groups.map(group => group.date);
      expandedKeys = toggleAllDatesExpanded(expandedKeys, dates, isFiltering);
      initialized = true;
      emit();
    },

    async fetchHistoryOrders(deps: FetchHistoryDependencies, force = false): Promise<void> {
      const now = deps.now ? deps.now() : Date.now();
      const supported = deps.isDineInSupported();
      dineInSupported = supported;
      if (!supported && filterType !== 'all') {
        filterType = 'all';
      }

      if (!force && lastTenantId === deps.tenantId && orders.length > 0 && now - lastFetchedAt < HISTORY_CACHE_TTL_MS) {
        emit();
        return;
      }

      if (orders.length === 0 || lastTenantId !== deps.tenantId) {
        loading = true;
        emit();
      }

      try {
        const res = await deps.fetcher(
          `${deps.workerBase}/api/orders/history-all?tenant_id=${encodeURIComponent(deps.tenantId)}&_t=${now}`
        );
        if (res.ok) {
          const data: unknown = await res.json();
          const list = Array.isArray(data)
            ? data
            : data && typeof data === 'object' && Array.isArray((data as { orders?: unknown }).orders)
              ? (data as { orders: HistoryOrderDto[] }).orders
              : null;
          if (list) {
            orders = list;
            lastTenantId = deps.tenantId;
            lastFetchedAt = deps.now ? deps.now() : Date.now();
          }
        }
      } catch (err) {
        console.error('[fetchHistoryOrders] Error:', err);
      } finally {
        loading = false;
      }

      if (orders.length === 0) {
        const fallback = deps
          .getFallbackCurrentOrders()
          .filter(o => o && FINISHED_FALLBACK_STATUSES.has(String(o.status || '')));
        if (fallback.length > 0) {
          orders = [...fallback];
        }
      }

      ensureInitialExpansion(orders);
      emit();
    }
  };
}

export type HistoryBridgeStore = ReturnType<typeof createHistoryBridgeStore>;
