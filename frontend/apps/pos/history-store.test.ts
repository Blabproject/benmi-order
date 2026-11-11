import { describe, expect, it, vi } from 'vitest';
import { createHistoryBridgeStore } from './history-store';
import { DEFAULT_SANDBOX_ORDERS, SANDBOX_REFERENCE_NOW_MS } from './history-fixtures';

describe('createHistoryBridgeStore', () => {
  it('fetches, caches for 15s, falls back to currentOrders, and respects force refresh', async () => {
    let clock = SANDBOX_REFERENCE_NOW_MS;
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(DEFAULT_SANDBOX_ORDERS), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as unknown as typeof fetch;

    const store = createHistoryBridgeStore({ nowMs: SANDBOX_REFERENCE_NOW_MS });

    await store.fetchHistoryOrders({
      tenantId: 'demo',
      workerBase: 'https://worker.test',
      fetcher,
      getFallbackCurrentOrders: () => [],
      isDineInSupported: () => true,
      now: () => clock
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().orders).toHaveLength(3);
    expect(store.getSnapshot().groups.map(g => g.date)).toEqual(['2026-11-11', '2026-11-10']);

    // Within 15s TTL returns cached orders without re-fetching
    clock += 5_000;
    await store.fetchHistoryOrders({
      tenantId: 'demo',
      workerBase: 'https://worker.test',
      fetcher,
      getFallbackCurrentOrders: () => [],
      isDineInSupported: () => true,
      now: () => clock
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Force bypasses TTL cache
    await store.fetchHistoryOrders(
      {
        tenantId: 'demo',
        workerBase: 'https://worker.test',
        fetcher,
        getFallbackCurrentOrders: () => [],
        isDineInSupported: () => true,
        now: () => clock
      },
      true
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('falls back to finished live orders when remote history returns empty', async () => {
    const store = createHistoryBridgeStore({ nowMs: SANDBOX_REFERENCE_NOW_MS });
    await store.fetchHistoryOrders({
      tenantId: 'demo',
      workerBase: 'https://worker.test',
      fetcher: (async () =>
        new Response('[]', {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })) as unknown as typeof fetch,
      getFallbackCurrentOrders: () => [
        { ...DEFAULT_SANDBOX_ORDERS[0]!, status: 'PAID' },
        { ...DEFAULT_SANDBOX_ORDERS[1]!, status: 'NEW' }
      ],
      isDineInSupported: () => true
    });

    expect(store.getSnapshot().orders).toHaveLength(1);
    expect(store.getSnapshot().orders[0]?.status).toBe('PAID');
  });

  it('initializes only latest date expanded in production mode, toggles, and clears dine-in filter when unsupported', () => {
    const store = createHistoryBridgeStore({ expandMode: 'latest', nowMs: SANDBOX_REFERENCE_NOW_MS });
    store.renderHistory(DEFAULT_SANDBOX_ORDERS, true);

    const firstSnap = store.getSnapshot();
    expect(firstSnap.expandedKeys.has('2026-11-11')).toBe(true);
    expect(firstSnap.expandedKeys.has('2026-11-10')).toBe(false);
    expect(firstSnap.isAllExpanded).toBe(false);

    store.toggleAllGroups();
    expect(store.getSnapshot().isAllExpanded).toBe(true);

    store.setFilterType('dine_in');
    expect(store.getSnapshot().filterType).toBe('dine_in');

    // Toggling the same filter resets back to "all"
    store.setFilterType('dine_in');
    expect(store.getSnapshot().filterType).toBe('all');

    // Disabling dine-in resets active dine-in filter to "all"
    store.setFilterType('dine_in');
    store.updateFilterVisibility(false);
    expect(store.getSnapshot().dineInSupported).toBe(false);
    expect(store.getSnapshot().filterType).toBe('all');
  });
});
