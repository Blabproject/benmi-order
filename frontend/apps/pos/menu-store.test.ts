import { describe, expect, it, vi } from 'vitest';
import { createMenuStore, type MenuStoreLoadDependencies } from './menu-store';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

function buildHappyFetcher(): typeof fetch {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const href = String(url);
    if (href.includes('/api/tenant/bootstrap')) {
      return jsonResponse({
        menuComplete: true,
        catalog: [
          {
            id: 'cat_food_db',
            slug: 'food',
            name: 'Đồ ăn',
            sortOrder: 1,
            items: [
              { id: 'item_1', name: 'Bánh mì', price: 50, isOutOfStock: false },
              { id: 'item_2', name: 'Phở', price: 75, isOutOfStock: false }
            ]
          }
        ],
        modifiers: [],
        customizations: []
      });
    }
    if (href.includes('/api/menu/modifier-library')) {
      return jsonResponse({
        complete: true,
        groups: [
          { id: 'grp_size', name: 'Size', source: 'canonical', options: [{ id: 'opt_l', name: 'Large', price: 10 }] }
        ]
      });
    }
    if (href.includes('/api/image_list')) {
      return jsonResponse(['img_a.jpg', 'img_b.jpg']);
    }
    if (href.includes('/api/menu?')) {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({}, false, 404);
  });
}

describe('createMenuStore', () => {
  it('loads normalized categories, selects initial catalog tab, and syncs callbacks', async () => {
    const store = createMenuStore({ initialLocale: 'vi' });
    const fetcher = buildHappyFetcher();
    const onSyncPriceMap = vi.fn();
    const onSyncImageList = vi.fn();

    const result = await store.load({
      tenantId: 'benmi',
      workerBase: 'https://worker.test',
      fetcher,
      onSyncPriceMap,
      onSyncImageList
    });

    expect(result.ok).toBe(true);
    const snap = store.getSnapshot();
    expect(snap.loadedCompletely).toBe(true);
    expect(snap.dirty).toBe(false);
    expect(snap.loading).toBe(false);
    // sec-flavor (canonical sortOrder 0) sits at index 0; first catalog category 'food' sits at index 1.
    expect(snap.categories?.map(c => c.id)).toEqual(['sec-flavor', 'food']);
    expect(snap.activeCategoryIndex).toBe(1);
    expect(snap.categories?.[1]?.items).toHaveLength(2);
    expect(snap.imageKeys).toEqual(['img_a.jpg', 'img_b.jpg']);
    expect(snap.modifierLibrary).toHaveLength(1);
    expect(onSyncPriceMap).toHaveBeenCalledTimes(1);
    expect(onSyncImageList).toHaveBeenCalledWith(['img_a.jpg', 'img_b.jpg']);
  });

  it('tracks dirty state, discards draft cleanly back to savedSnapshot, and saves deletions', async () => {
    const store = createMenuStore({ initialLocale: 'vi' });
    const fetcher = buildHappyFetcher();
    const onInvalidateCustomizationCache = vi.fn();
    const onSyncPriceMap = vi.fn();
    const deps: MenuStoreLoadDependencies = {
      tenantId: 'benmi',
      workerBase: 'https://worker.test',
      fetcher
    };

    await store.load(deps);

    store.updateDraft(draft => {
      const food = draft.find(cat => cat.id === 'food');
      food?.items.push({ name: 'Xôi xéo', price: 45 });
    });
    expect(store.getSnapshot().dirty).toBe(true);

    // Discarding restores exact original baseline
    expect(store.discardDraft()).toBe(true);
    expect(store.getSnapshot().dirty).toBe(false);
    expect(store.getSnapshot().categories?.find(cat => cat.id === 'food')?.items).toHaveLength(2);

    // Edit again: remove item_2 and add new item, then save
    store.updateDraft(draft => {
      const food = draft.find(cat => cat.id === 'food');
      if (food) {
        food.items = food.items.filter(item => item.id !== 'item_2');
        food.items.push({ name: 'Bún bò', price: 80 });
      }
    });
    expect(store.getSnapshot().dirty).toBe(true);

    const saveRes = await store.save({
      ...deps,
      createUuid: () => 'new_uuid',
      onInvalidateCustomizationCache,
      onSyncPriceMap
    });
    expect(saveRes.ok).toBe(true);
    expect(saveRes.payload?.__delete?.items).toEqual(['item_2']);
    expect(store.getSnapshot().dirty).toBe(false);
    const savedFood = store.getSnapshot().categories?.find(cat => cat.id === 'food');
    expect(savedFood?.items[1]?.id).toBe('benmi_item_new_uuid');
    expect(onInvalidateCustomizationCache).toHaveBeenCalledWith('benmi');
    expect(onSyncPriceMap).toHaveBeenCalledTimes(1);
  });

  it('refuses save when menuComplete !== true and preserves dirty draft on failed reload', async () => {
    const store = createMenuStore({ initialLocale: 'vi' });
    const fetcher = buildHappyFetcher();

    await store.load({
      tenantId: 'benmi',
      workerBase: 'https://worker.test',
      fetcher
    });

    store.updateDraft(draft => {
      const food = draft.find(cat => cat.id === 'food');
      if (food?.items[0]) {
        food.items[0].price = 60;
      }
    });
    expect(store.getSnapshot().dirty).toBe(true);

    const failingFetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/api/tenant/bootstrap')) {
        return jsonResponse({ menuComplete: false, catalog: [], modifiers: [] });
      }
      return jsonResponse({ complete: true, groups: [] });
    });

    const reloadRes = await store.load({
      tenantId: 'benmi',
      workerBase: 'https://worker.test',
      fetcher: failingFetcher
    });

    expect(reloadRes.ok).toBe(false);
    expect(reloadRes.preservedDirtyDraft).toBe(true);
    expect(store.getSnapshot().loadedCompletely).toBe(false);
    expect(store.getSnapshot().categories?.find(cat => cat.id === 'food')?.items[0]?.price).toBe(60);

    // Save must block when not loadedCompletely
    const blockedSave = await store.save({
      tenantId: 'benmi',
      workerBase: 'https://worker.test',
      fetcher: failingFetcher
    });
    expect(blockedSave.ok).toBe(false);
    expect(blockedSave.error).toContain('Thực đơn chưa tải đầy đủ');
  });

  it('ignores stale load results when active tenant changes mid-flight', async () => {
    const store = createMenuStore({ initialLocale: 'vi' });
    let activeTenant = 'benmi';

    const slowFetcher = buildHappyFetcher();
    const res = await store.load({
      tenantId: 'benmi',
      workerBase: 'https://worker.test',
      fetcher: async (url, init) => {
        activeTenant = 'other_store';
        return slowFetcher(url, init);
      },
      getCurrentTenantId: () => activeTenant
    });

    expect(res.ok).toBe(false);
    expect(store.getSnapshot().categories).toBeNull();
    expect(store.getSnapshot().loadedCompletely).toBe(false);
  });

  it('keeps dirty state intact if save POST fails', async () => {
    const store = createMenuStore({ initialLocale: 'vi' });
    const baseFetcher = buildHappyFetcher();

    await store.load({
      tenantId: 'benmi',
      workerBase: 'https://worker.test',
      fetcher: baseFetcher
    });

    store.updateDraft(draft => {
      const food = draft.find(cat => cat.id === 'food');
      if (food?.items[0]) {
        food.items[0].price = 99;
      }
    });

    const failingPostFetcher = vi.fn(async () =>
      jsonResponse({ code: 'CONFLICT' }, false, 409)
    );
    const saveRes = await store.save({
      tenantId: 'benmi',
      workerBase: 'https://worker.test',
      fetcher: failingPostFetcher
    });

    expect(saveRes.ok).toBe(false);
    expect(saveRes.error).toContain('409 (CONFLICT)');
    expect(store.getSnapshot().dirty).toBe(true);
    expect(store.getSnapshot().saving).toBe(false);
  });
});
