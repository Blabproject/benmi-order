import type { ItemAnalyticsRowDto, ItemAnalyticsSummaryDto, ReportRange } from './api';

export interface TopOptionTag {
  name: string;
  count: number;
}

export interface NormalizedReportRow {
  rank: number;
  itemName: string;
  categoryName: string | null;
  totalQuantity: number;
  totalSales: number;
  orderAppearances: number;
  ratioPercent: string;
  barPercent: number;
  topOptions: TopOptionTag[];
}

const VALID_RANGES = new Set<ReportRange>(['today', '7d', '30d']);

/** Clamps arbitrary string range values from legacy callers to supported report presets. */
export function normalizeReportRange(range?: string | null): ReportRange {
  const normalized = String(range || '').trim();
  return VALID_RANGES.has(normalized as ReportRange) ? (normalized as ReportRange) : 'today';
}

/** Formats report start/end date span cleanly for the KPI subtext. */
export function formatReportDateRange(startDate?: string | null, endDate?: string | null): string {
  const start = String(startDate || '').trim();
  const end = String(endDate || '').trim();
  if (!start && !end) return '-';
  if (!start) return end;
  if (!end || start === end) return start;
  return `${start} ~ ${end}`;
}

/** Extracts top N modifier choices sorted descending by count. */
export function extractTopOptions(optionsBreakdown?: Record<string, number>, limit = 4): TopOptionTag[] {
  if (!optionsBreakdown || typeof optionsBreakdown !== 'object') return [];
  return Object.entries(optionsBreakdown)
    .filter(([name, cnt]) => Boolean(String(name || '').trim()) && Number(cnt) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, limit)
    .map(([name, cnt]) => ({ name, count: Number(cnt) }));
}

/** Projects raw analytics rows into presentation-ready ranking metrics with safe denominators. */
export function buildReportRows(summary: ItemAnalyticsSummaryDto | null): NormalizedReportRow[] {
  if (!summary || !Array.isArray(summary.items) || summary.items.length === 0) {
    return [];
  }

  const items: readonly ItemAnalyticsRowDto[] = summary.items;
  const maxQty = Math.max(...items.map(item => Math.max(0, Number(item.totalQuantity) || 0)), 1);
  const sumQuantities = items.reduce((acc, item) => acc + Math.max(0, Number(item.totalQuantity) || 0), 0);
  const totalSoldAll = Math.max(Number(summary.totalItemsSold) || 0, sumQuantities, 1);

  return items.map((item, idx) => {
    const qty = Math.max(0, Number(item.totalQuantity) || 0);
    const sales = Number(item.totalSales) || 0;
    const appearances = Math.max(0, Number(item.orderAppearances) || 0);
    const categoryRaw = typeof item.categoryName === 'string' ? item.categoryName.trim() : '';

    return {
      rank: idx + 1,
      itemName: String(item.itemName || ''),
      categoryName: categoryRaw || null,
      totalQuantity: qty,
      totalSales: sales,
      orderAppearances: appearances,
      ratioPercent: ((qty / totalSoldAll) * 100).toFixed(1),
      barPercent: Math.round((qty / maxQty) * 100),
      topOptions: extractTopOptions(item.optionsBreakdown, 4)
    };
  });
}
