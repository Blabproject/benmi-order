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

  it('preserves canonical link display order on load, appends newly selected groups at end, and supports moveProductGroup / moveGroupOption', async () => {
    const catalog: OptionCatalogDto = {
      categories: [{ id: 'c1', name: '飯糰' }],
      products: [{ id: 'p1', category_id: 'c1', name: '辣味飯糰', price: 50, menu_revision: 1 }],
      groups: [
        {
          id: 'g_rice',
          name: '選米',
          scope: 'item',
          sortOrder: 1,
          minSelection: 0,
          maxSelection: 1,
          options: [
            { id: 'o_white', name: '白米', price: 0, isLocallyOutOfStock: false },
            { id: 'o_purple', name: '紫米', price: 5, isLocallyOutOfStock: false },
          ],
        },
        {
          id: 'g_add15',
          name: '加料 15元',
          scope: 'item',
          sortOrder: 2,
          minSelection: 0,
          maxSelection: 6,
          options: [{ id: 'o_egg', name: '滷蛋', price: 15, isLocallyOutOfStock: false }],
        },
        {
          id: 'g_add25',
          name: '加料 25元',
          scope: 'item',
          sortOrder: 0,
          minSelection: 0,
          maxSelection: 3,
          options: [{ id: 'o_pork', name: '豬排', price: 25, isLocallyOutOfStock: false }],
        },
      ],
      // Raw catalog.links is out of group.sortOrder order with tied sortOrder=0
      links: [
        { groupId: 'g_add15', itemId: 'p1', optionIds: null, sortOrder: 0 },
        { groupId: 'g_rice', itemId: 'p1', optionIds: null, sortOrder: 0 },
      ],
    };

    const calls: Array<{ url: string; body?: string }> = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, body: typeof init?.body === 'string' ? init.body : undefined });
      if (href.includes('/api/menu/options')) {
        return new Response(JSON.stringify(catalog), { status: 200 });
      }
      if (href.includes('/api/menu/product?')) {
        return new Response(JSON.stringify({ success: true, id: 'p1', catalog }), { status: 200 });
      }
      if (href.includes('/api/menu/option-group?')) {
        return new Response(JSON.stringify({ success: true, id: 'g_rice', catalog }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    const { store } = makeBridge(fetcher);
    await store.openProduct('p1', 'product-options');
    let prodDraft = store.getSnapshot().drawer?.draft as { links: Array<{ groupId: string; sortOrder?: number }> };
    // Sorted by group.sortOrder tie-breaker (g_rice=1 before g_add15=2)
    expect(prodDraft.links.map((l) => l.groupId)).toEqual(['g_rice', 'g_add15']);

    // Adding g_add25 (whose global group.sortOrder is 0) must append at end instead of jumping ahead of g_rice
    store.openProductGroupsPicker();
    store.toggleSelectionId('group', 'g_add25', true);
    expect(store.applyRoute()).toBe(true);
    prodDraft = store.getSnapshot().drawer?.draft as { links: Array<{ groupId: string; sortOrder?: number }> };
    expect(prodDraft.links.map((l) => l.groupId)).toEqual(['g_rice', 'g_add15', 'g_add25']);

    // Move g_add25 up by 1
    store.moveProductGroup('g_add25', -1);
    prodDraft = store.getSnapshot().drawer?.draft as { links: Array<{ groupId: string; sortOrder?: number }> };
    expect(prodDraft.links.map((l) => l.groupId)).toEqual(['g_rice', 'g_add25', 'g_add15']);
    expect(await store.save()).toBe(true);
    const prodSave = JSON.parse(calls.find((c) => c.url.includes('/api/menu/product?'))?.body || '{}');
    expect(prodSave.links.map((l: { groupId: string }) => l.groupId)).toEqual(['g_rice', 'g_add25', 'g_add15']);

    // Reorder options inside g_rice
    await store.openGroup('g_rice');
    store.moveGroupOption('o_purple', -1);
    expect(await store.save()).toBe(true);
    const grpSave = JSON.parse(calls.find((c) => c.url.includes('/api/menu/option-group?'))?.body || '{}');
    expect(grpSave.options.map((o: { id: string }) => o.id)).toEqual(['o_purple', 'o_white']);
  });
});
