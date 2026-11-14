import { describe, expect, it, vi } from 'vitest';
import {
  buildOptionCatalog,
  tryCalculateCartWithWasm,
  type PricingWasmRuntime,
} from './pricing-wasm';

describe('pricing-wasm adapter', () => {
  it('builds canonical OptionCatalog DTO from bootstrap data', () => {
    const catalog = buildOptionCatalog({
      catalog: [
        {
          id: 'cat_1',
          name: 'Bánh Mì',
          slug: 'banh-mi',
          bundleRule: { groupSize: 2, bundlePrice: 180, label: '2 for 180' },
          items: [
            { id: 'item_1', name: 'Thịt Nướng', price: 95, modifierGroups: ['grp_1'] },
          ],
        },
      ],
      modifierGroups: [
        {
          id: 'grp_1',
          name: 'Độ cay',
          slug: 'spice',
          scope: 'item',
          selectionType: 'single',
          minSelection: 1,
          maxSelection: 1,
          options: [
            { id: 'opt_1', name: 'Cay vừa', priceDelta: 5, isDefault: true },
          ],
        },
      ],
      customizations: [
        {
          id: 'ord_bag',
          label: 'Túi',
          type: 'radio',
          required: false,
          options: [{ id: 'bag_1', name: 'Túi giấy', price: 2 }],
        },
      ],
    });

    expect(catalog.categories).toHaveLength(1);
    expect(catalog.categories[0]?.bundleRule).toEqual({
      groupSize: 2,
      bundlePrice: 180,
      label: '2 for 180',
    });
    expect(catalog.items[0]).toMatchObject({
      id: 'item_1',
      price: 95,
      categoryId: 'cat_1',
    });
    expect(catalog.links).toEqual([
      { itemId: 'item_1', groupId: 'grp_1', sortOrder: 0, disabled: false },
    ]);
    expect(catalog.groups).toHaveLength(2);
    expect(catalog.groups[1]?.scope).toBe('order');
  });

  it('returns null gracefully when WASM runtime is not ready', () => {
    const stub: PricingWasmRuntime = { isReady: false };
    expect(tryCalculateCartWithWasm({ cart: { item_1: 1 } }, stub)).toBeNull();
  });

  it('delegates to WASM runtime when ready', () => {
    const calculateCart = vi.fn().mockReturnValue({
      total: 100,
      subtotal: 100,
      discount: 0,
      orderExtra: 0,
      items: [],
      groups: [],
      lineTotals: { item_1: 100 },
      isWasm: true,
    });
    const runtime: PricingWasmRuntime = {
      isReady: true,
      calculateCart,
    };

    const result = tryCalculateCartWithWasm({ cart: { item_1: 1 } }, runtime);
    expect(result?.total).toBe(100);
    expect(calculateCart).toHaveBeenCalledTimes(1);
  });
});
