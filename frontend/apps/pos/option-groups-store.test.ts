import { describe, expect, it, vi } from 'vitest';
import type { OptionCatalogDto } from '@shared/contracts/option-groups-model';
import { createOptionGroupsStore } from './option-groups-store';

function makeCatalog(): OptionCatalogDto {
  return {
    categories: [{ id: 'c1', name: 'Món chính' }],
    products: [
      { id: 'p1', category_id: 'c1', name: 'Bánh mì', price: 50, menu_revision: 1 },
      { id: 'p2', category_id: 'c1', name: 'Trứng ốp', price: 15, menu_revision: 1 },
    ],
    groups: [
      {
        id: 'g1',
        name: 'Thêm topping',
        scope: 'item',
        minSelection: 0,
        maxSelection: 1,
        options: [
          { id: 'o1', name: 'Pate', price: 10, isLocallyOutOfStock: false },
        ],
      },
    ],
    links: [{ groupId: 'g1', itemId: 'p1', optionIds: null, sortOrder: 0 }],
  };
}

function makeBridge(fetcher: typeof fetch) {
  let menuData: unknown[] = [
    {
      id: 'c1',
      catId: 'c1',
      databaseId: 'c1',
      name: 'Món chính',
      items: [{ id: 'p1', name: 'Bánh mì', price: 50 }],
    },
  ];
  let saved = JSON.stringify(menuData);
  const onDrawerOpenChange = vi.fn();
  const afterSaveSync = vi.fn();

  const store = createOptionGroupsStore({
    getLocale: () => 'vi',
    getTenantId: () => 'benmi',
    getWorkerBase: () => 'https://worker.test',
    getCurrentMenuData: () => menuData as never,
    getSavedMenuSnapshot: () => saved,
    setMenuSnapshots: (next, nextSaved) => {
      menuData = next;
      saved = nextSaved;
    },
    getAuthHeaders: (isJson): Record<string, string> =>
      isJson ? { 'Content-Type': 'application/json' } : {},
    fetchImpl: fetcher,
    onDrawerOpenChange,
    afterSaveSync,
  });

  return { store, onDrawerOpenChange, afterSaveSync };
}

describe('createOptionGroupsStore', () => {
  it('loads catalog, opens option, and uses narrow /api/menu/stock-status when only stock changes', async () => {
    const catalog = makeCatalog();
    const calls: Array<{ url: string; method: string; body?: string }> = [];

    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      const method = init?.method || 'GET';
      calls.push({ url: href, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (href.includes('/api/menu/options')) {
        return new Response(JSON.stringify(catalog), { status: 200 });
      }
      if (href.includes('/api/menu/stock-status?') && method === 'POST') {
        catalog.groups[0]!.options[0]!.isLocallyOutOfStock = true;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    const { store, onDrawerOpenChange, afterSaveSync } = makeBridge(fetcher);
    await store.openOption('g1', 'o1');
    expect(onDrawerOpenChange).toHaveBeenCalledWith(true);

    store.setField('option.isLocallyOutOfStock', true);
    expect(store.applyRoute()).toBe(true);

    const saved = await store.save();
    expect(saved).toBe(true);

    const stockCall = calls.find((c) => c.url.includes('/api/menu/stock-status?'));
    expect(stockCall?.method).toBe('POST');
    expect(JSON.parse(stockCall?.body || '{}')).toEqual({
      category_slug: 'modifier_option',
      option_id: 'o1',
      group_id: 'g1',
      name: 'Pate',
      status: 'out_of_stock',
      duration: 'indefinite',
    });
    expect(store.getSnapshot().drawer).toBeNull();
    expect(onDrawerOpenChange).toHaveBeenLastCalledWith(false);
    expect(afterSaveSync).toHaveBeenCalledTimes(1);
  });

  it('clears outOfStockUntil = null when unmarking local out of stock and posts in_stock', async () => {
    const catalog = makeCatalog();
    catalog.groups[0]!.options[0]!.isLocallyOutOfStock = true;
    catalog.groups[0]!.options[0]!.outOfStockUntil = '2099-01-01T00:00:00Z';
    const calls: Array<{ url: string; method: string; body?: string }> = [];

    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      const method = init?.method || 'GET';
      calls.push({ url: href, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (href.includes('/api/menu/options')) {
        return new Response(JSON.stringify(catalog), { status: 200 });
      }
      if (href.includes('/api/menu/stock-status?')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    const { store } = makeBridge(fetcher);
    await store.openOption('g1', 'o1');
    store.setField('option.isLocallyOutOfStock', false);
    expect(store.applyRoute()).toBe(true);
    expect(await store.save()).toBe(true);

    const stockCall = calls.find((c) => c.url.includes('/api/menu/stock-status?'));
    expect(JSON.parse(stockCall?.body || '{}').status).toBe('in_stock');
  });

  it('asks confirmation before discarding dirty changes and restores on continue', async () => {
    const catalog = makeCatalog();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(catalog), { status: 200 }));
    const { store, onDrawerOpenChange } = makeBridge(fetcher);

    await store.openProduct('p1', 'product');
    store.setField('name', 'Bánh mì đặc biệt');
    store.requestClose();

    expect(store.getSnapshot().drawer?.confirm).toBe('discard');
    store.dismissConfirm();
    expect(store.getSnapshot().drawer?.confirm).toBeNull();

    store.requestClose();
    store.confirmDiscard();
    expect(store.getSnapshot().drawer).toBeNull();
    expect(onDrawerOpenChange).toHaveBeenLastCalledWith(false);
  });
});
