import { describe, expect, it } from 'vitest';
import type { ItemAnalyticsSummaryDto } from './api';
import { buildReportRows, extractTopOptions, formatReportDateRange, normalizeReportRange } from './reports-model';

describe('reports-model', () => {
  it('normalizes supported report ranges and falls back to today', () => {
    expect(normalizeReportRange('7d')).toBe('7d');
    expect(normalizeReportRange('30d')).toBe('30d');
    expect(normalizeReportRange('custom')).toBe('today');
    expect(normalizeReportRange('')).toBe('today');
  });

  it('formats single-day and multi-day date ranges', () => {
    expect(formatReportDateRange('2026-11-14', '2026-11-14')).toBe('2026-11-14');
    expect(formatReportDateRange('2026-11-08', '2026-11-14')).toBe('2026-11-08 ~ 2026-11-14');
    expect(formatReportDateRange(null, null)).toBe('-');
  });

  it('sorts option breakdown descending and slices top 4 choices', () => {
    expect(
      extractTopOptions({
        小辣: 12,
        去骨: 3,
        不切: 18,
        加蒜: 7,
        九層塔: 9,
        忽略: 0
      })
    ).toEqual([
      { name: '不切', count: 18 },
      { name: '小辣', count: 12 },
      { name: '九層塔', count: 9 },
      { name: '加蒜', count: 7 }
    ]);
  });

  it('computes rank, ratio, bar percentage, and safe denominators from analytics DTO', () => {
    const summary: ItemAnalyticsSummaryDto = {
      tenantId: 'demo',
      range: '7d',
      startDate: '2026-11-08',
      endDate: '2026-11-14',
      totalItemsSold: 10,
      totalRevenue: 950,
      totalOrders: 6,
      topItem: {
        itemName: '香雞排',
        categoryName: '炸物',
        totalQuantity: 8,
        totalSales: 680,
        orderAppearances: 5,
        optionsBreakdown: { 特調胡椒: 6, 小辣: 4 }
      },
      items: [
        {
          itemName: '香雞排',
          categoryName: '炸物',
          totalQuantity: 8,
          totalSales: 680,
          orderAppearances: 5,
          optionsBreakdown: { 特調胡椒: 6, 小辣: 4 }
        },
        {
          itemName: '小黃瓜',
          categoryName: '',
          totalQuantity: 2,
          totalSales: 270,
          orderAppearances: 2
        }
      ]
    };

    const rows = buildReportRows(summary);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rank: 1,
      itemName: '香雞排',
      categoryName: '炸物',
      ratioPercent: '80.0',
      barPercent: 100,
      topOptions: [
        { name: '特調胡椒', count: 6 },
        { name: '小辣', count: 4 }
      ]
    });
    expect(rows[1]).toMatchObject({
      rank: 2,
      itemName: '小黃瓜',
      categoryName: null,
      ratioPercent: '20.0',
      barPercent: 25,
      topOptions: []
    });
  });
});
