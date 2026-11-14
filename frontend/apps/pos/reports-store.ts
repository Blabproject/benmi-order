import type { ItemAnalyticsSummaryDto, ReportRange } from '@shared/contracts/api';
import {
  buildReportRows,
  formatReportDateRange,
  normalizeReportRange,
  type NormalizedReportRow
} from '@shared/contracts/reports-model';
import type { PosLocale } from '@shared/i18n/pos-dictionary';

export interface ReportsBridgeSnapshot {
  range: ReportRange;
  data: ItemAnalyticsSummaryDto | null;
  rows: NormalizedReportRow[];
  dateRangeLabel: string;
  loading: boolean;
  error: boolean;
  locale: PosLocale;
}

export interface FetchReportsDependencies {
  tenantId: string;
  workerBase: string;
  fetcher: typeof fetch;
  now?: () => number;
}

/** Framework-agnostic reactive store backing the POS Reports tab and legacy window bridges. */
export function createReportsBridgeStore(options: {
  initialLocale?: PosLocale;
  initialRange?: ReportRange;
} = {}) {
  let range: ReportRange = options.initialRange ?? 'today';
  let data: ItemAnalyticsSummaryDto | null = null;
  let loading = false;
  let error = false;
  let locale: PosLocale = options.initialLocale ?? 'zh-TW';
  let activeTenantId: string | null = null;
  let cacheByRange: Partial<Record<ReportRange, ItemAnalyticsSummaryDto>> = {};
  let requestSeq = 0;

  const listeners = new Set<() => void>();
  let currentSnapshot = buildSnapshot();

  function buildSnapshot(): ReportsBridgeSnapshot {
    return {
      range,
      data,
      rows: buildReportRows(data),
      dateRangeLabel: formatReportDateRange(data?.startDate, data?.endDate),
      loading,
      error,
      locale
    };
  }

  function emit(): void {
    currentSnapshot = buildSnapshot();
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): ReportsBridgeSnapshot {
      return currentSnapshot;
    },

    getRange(): ReportRange {
      return range;
    },

    getData(): ItemAnalyticsSummaryDto | null {
      return data;
    },

    setLocale(nextLocale: PosLocale): void {
      if (locale === nextLocale) return;
      locale = nextLocale;
      emit();
    },

    renderReports(nextData: ItemAnalyticsSummaryDto | null): void {
      if (!nextData) return;
      const nextRange = normalizeReportRange(nextData.range || range);
      range = nextRange;
      data = nextData;
      cacheByRange[nextRange] = nextData;
      loading = false;
      error = false;
      emit();
    },

    setCachedData(nextData: ItemAnalyticsSummaryDto | null): void {
      data = nextData;
      if (nextData) {
        cacheByRange[normalizeReportRange(nextData.range || range)] = nextData;
      } else {
        cacheByRange = {};
      }
      emit();
    },

    async selectRange(deps: FetchReportsDependencies, rawRange: string): Promise<void> {
      const nextRange = normalizeReportRange(rawRange);
      if (range === nextRange && activeTenantId === deps.tenantId && cacheByRange[nextRange] && !error) {
        return;
      }
      await this.fetchReports(deps, nextRange, false);
    },

    async fetchReports(
      deps: FetchReportsDependencies,
      rawRange: string = range,
      forceRefresh = false
    ): Promise<void> {
      const targetRange = normalizeReportRange(rawRange);
      const tenantId = deps.tenantId || 'benmi';
      if (activeTenantId !== null && activeTenantId !== tenantId) {
        cacheByRange = {};
        data = null;
      }
      activeTenantId = tenantId;
      range = targetRange;

      const cached = cacheByRange[targetRange];
      if (!forceRefresh && cached) {
        data = cached;
        loading = false;
        error = false;
        emit();
        return;
      }

      const seq = ++requestSeq;
      if (!cached || forceRefresh) {
        if (!cached) {
          data = null;
        }
        loading = true;
        error = false;
        emit();
      }

      const timestamp = deps.now ? deps.now() : Date.now();
      try {
        const res = await deps.fetcher(
          `${deps.workerBase}/api/reports/items-analytics?tenant_id=${encodeURIComponent(tenantId)}&range=${encodeURIComponent(targetRange)}&_t=${timestamp}`,
          {
            headers: {
              Accept: 'application/json',
              'X-Tenant-ID': tenantId
            }
          }
        );

        if (seq !== requestSeq || activeTenantId !== tenantId) return;

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        const payload = (await res.json()) as ItemAnalyticsSummaryDto;
        if (seq !== requestSeq || activeTenantId !== tenantId) return;

        cacheByRange[targetRange] = payload;
        data = payload;
        error = false;
      } catch (err) {
        if (seq !== requestSeq) return;
        console.error('[orders-reports] Failed to fetch report data:', err);
        error = true;
      } finally {
        if (seq === requestSeq) {
          loading = false;
          emit();
        }
      }
    }
  };
}

export type ReportsBridgeStore = ReturnType<typeof createReportsBridgeStore>;
