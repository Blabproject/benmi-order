import { describe, expect, it, vi } from 'vitest';
import type { ItemAnalyticsSummaryDto } from '@shared/contracts/api';
import { createReportsBridgeStore } from './reports-store';

function makeSummary(range: 'today' | '7d' | '30d', tenantId = 'demo'): ItemAnalyticsSummaryDto {
  return {
    tenantId,
    range,
    startDate: '2026-11-14',
    endDate: '2026-11-14',
    totalItemsSold: range === 'today' ? 5 : 18,
    totalRevenue: range === 'today' ? 450 : 1620,
    totalOrders: range === 'today' ? 3 : 11,
    topItem: {
      itemName: '香雞排',
      categoryName: '炸物',
      totalQuantity: range === 'today' ? 3 : 10,
      totalSales: range === 'today' ? 255 : 850,
      orderAppearances: 3
    },
    items: [
      {
        itemName: '香雞排',
        categoryName: '炸物',
        totalQuantity: range === 'today' ? 3 : 10,
        totalSales: range === 'today' ? 255 : 850,
        orderAppearances: 3
      }
    ]
  };
}

describe('createReportsBridgeStore', () => {
  it('fetches analytics with tenant headers, caches per range, and bypasses cache on forceRefresh', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const parsed = new URL(url);
      const range = (parsed.searchParams.get('range') || 'today') as 'today' | '7d' | '30d';
      const tenant = parsed.searchParams.get('tenant_id') || 'demo';
      return new Response(JSON.stringify(makeSummary(range, tenant)), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as unknown as typeof fetch;

    const store = createReportsBridgeStore();
    const deps = { tenantId: 'demo', workerBase: 'https://worker.test', fetcher, now: () => 1000 };

    await store.fetchReports(deps, 'today');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://worker.test/api/reports/items-analytics?tenant_id=demo&range=today&_t=1000',
      expect.objectContaining({
        headers: { Accept: 'application/json', 'X-Tenant-ID': 'demo' }
      })
    );
    expect(store.getSnapshot().data?.totalRevenue).toBe(450);

    // Selecting 7d fetches 7d, returning to today hits per-range cache
    await store.selectRange(deps, '7d');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().range).toBe('7d');
    expect(store.getSnapshot().data?.totalRevenue).toBe(1620);

    await store.selectRange(deps, 'today');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().range).toBe('today');
    expect(store.getSnapshot().data?.totalRevenue).toBe(450);

    // Force refresh refetches current range
    await store.fetchReports(deps, 'today', true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('invalidates cached reports when tenant switches and captures errors without throwing', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeSummary('today', 'tenant-a')), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(new Response('Server Error', { status: 500 })) as unknown as typeof fetch;

    const store = createReportsBridgeStore();
    await store.fetchReports({ tenantId: 'tenant-a', workerBase: 'https://worker.test', fetcher }, 'today');
    expect(store.getSnapshot().data?.tenantId).toBe('tenant-a');
    expect(store.getSnapshot().error).toBe(false);

    await store.fetchReports({ tenantId: 'tenant-b', workerBase: 'https://worker.test', fetcher }, 'today');
    expect(store.getSnapshot().data).toBeNull();
    expect(store.getSnapshot().error).toBe(true);
    expect(store.getSnapshot().loading).toBe(false);
  });
});
