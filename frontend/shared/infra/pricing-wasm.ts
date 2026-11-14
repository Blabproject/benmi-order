/**
 * Typed WebAssembly Pricing Engine adapter for modern TypeScript/React frontends.
 * Mirrors js/client-pricing-wasm.js without relying on global DOM state.
 */

export interface WasmCatalogOption {
  id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  disabled: boolean;
  childGroups?: string[];
  subOptions?: Array<{ id: string; name: string; price: number }>;
}

export interface WasmCatalogGroup {
  id: string;
  name: string;
  scope: 'item' | 'order';
  selectionType: 'single' | 'multiple';
  minSelection: number;
  maxSelection: number | null;
  pricingMode?: string;
  freeQuota?: number;
  options: WasmCatalogOption[];
  metadata?: { slug?: string | null };
}

export interface WasmCatalogItem {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  disabled: boolean;
}

export interface WasmCatalogCategory {
  id: string;
  name: string;
  slug: string;
  bundleRule: {
    groupSize: number;
    bundlePrice: number;
    label: string;
  } | null;
}

export interface WasmCatalogLink {
  itemId: string;
  groupId: string;
  sortOrder: number;
  disabled: boolean;
}

export interface WasmOptionCatalog {
  items: WasmCatalogItem[];
  categories: WasmCatalogCategory[];
  groups: WasmCatalogGroup[];
  links: WasmCatalogLink[];
}

export interface WasmSelectedOptionItem {
  optionId: string;
  quantity: number;
  groups?: WasmSelectedGroup[];
  subOptions?: string[];
}

export interface WasmSelectedGroup {
  groupId: string;
  items: WasmSelectedOptionItem[];
}

export interface WasmRoundItemInput {
  lineId: string;
  itemId: string;
  quantity: number;
  portionNotes: string[];
  bundleSelections: {
    portions: Array<{ groups: WasmSelectedGroup[] }>;
  } | null;
}

export interface WasmRoundInput {
  items: WasmRoundItemInput[];
  orderSelections: WasmSelectedGroup[];
}

export interface WasmCalculatedItem {
  lineId?: string;
  itemId?: string;
  quantity?: number;
  subtotal: number;
  extra?: number;
  [key: string]: unknown;
}

export interface WasmRoundResult {
  total: number;
  discount: number;
  items: WasmCalculatedItem[];
  groups: unknown[];
}

export interface WasmCartCalculationResult {
  total: number;
  subtotal: number;
  discount: number;
  orderExtra: number;
  items: WasmCalculatedItem[];
  groups: unknown[];
  lineTotals: Record<string, number>;
  isWasm: true;
}

export interface WasmPortionPriceResult {
  basePrice: number;
  extra: number;
  subtotal: number;
  isWasm: true;
}

export interface BootstrapCatalogInput {
  catalog?: Array<{
    id?: string;
    name?: string;
    slug?: string;
    bundleRule?: {
      groupSize?: number;
      bundlePrice?: number;
      label?: string;
    } | null;
    items?: Array<{
      id?: string;
      name?: string;
      price?: number;
      disabled?: boolean;
      modifierGroups?: string[];
    }>;
  }>;
  modifierGroups?: Array<{
    id: string;
    name?: string;
    slug?: string;
    scope?: string;
    selectionType?: string;
    minSelection?: number;
    maxSelection?: number | null;
    pricingMode?: string;
    freeQuota?: number;
    options?: Array<{
      id: string;
      name?: string;
      price?: number;
      priceDelta?: number;
      isDefault?: boolean;
      disabled?: boolean;
      childGroups?: string[];
      subOptions?: Array<{ id?: string; productId?: string; name?: string; price?: number }>;
    }>;
  }>;
  itemModifierLinks?: Array<{
    itemId: string;
    groupId: string;
    sortOrder?: number;
    disabled?: boolean;
  }>;
  customizations?: Array<{
    id?: string;
    key?: string;
    label?: string;
    type?: string;
    required?: boolean;
    options?: Array<{
      id?: string;
      name?: string;
      price?: number;
      disabled?: boolean;
      subOptions?: Array<{ id?: string; productId?: string; name?: string; price?: number }>;
    }>;
  }>;
}

export interface PricingWasmRuntime {
  readonly isReady: boolean;
  calculateCategoryBundle?(
    category: WasmCatalogCategory,
    items: Array<{ item: WasmCatalogItem; quantity: number }>,
  ): { total: number; discount: number };
  calculateRoundTotal?(catalog: WasmOptionCatalog, input: WasmRoundInput): WasmRoundResult;
  validateUnifiedCart?(catalog: WasmOptionCatalog, input: WasmRoundInput): unknown;
  validateOptionSelection?(group: WasmCatalogGroup, selection: WasmSelectedGroup): unknown;
  calculateCart?(options: {
    bootstrapData?: BootstrapCatalogInput;
    cart?: Record<string, number>;
    bundleCartData?: Record<string, Array<{ groups?: unknown[] }>>;
    customizeData?: Record<string, Array<Record<string, unknown>>>;
    orderSelections?: WasmSelectedGroup[];
  }): WasmCartCalculationResult | null;
  calculatePortionPrice?(
    itemOrKey: string | { id?: string; price?: number },
    portion: Record<string, unknown> | null,
    options?: { bootstrapData?: BootstrapCatalogInput; catalog?: WasmOptionCatalog },
  ): WasmPortionPriceResult | null;
}

/**
 * Builds the canonical OptionCatalog DTO from bootstrap data.
 */
export function buildOptionCatalog(bData?: BootstrapCatalogInput | null): WasmOptionCatalog {
  if (!bData) {
    return { items: [], categories: [], groups: [], links: [] };
  }

  const items: WasmCatalogItem[] = [];
  const categories: WasmCatalogCategory[] = [];
  const groups: WasmCatalogGroup[] = [];
  const links: WasmCatalogLink[] = [];

  if (Array.isArray(bData.catalog)) {
    for (const cat of bData.catalog) {
      const catId = cat.id || cat.slug || '';
      const catName = cat.name || cat.slug || '';
      categories.push({
        id: catId,
        name: catName,
        slug: cat.slug || catId,
        bundleRule: cat.bundleRule
          ? {
              groupSize: Number(cat.bundleRule.groupSize || 0),
              bundlePrice: Number(cat.bundleRule.bundlePrice || 0),
              label: String(cat.bundleRule.label || ''),
            }
          : null,
      });

      if (Array.isArray(cat.items)) {
        for (const it of cat.items) {
          const itemId = it.id || it.name || '';
          items.push({
            id: itemId,
            name: it.name || itemId,
            price: Number(it.price || 0),
            categoryId: catId,
            disabled: Boolean(it.disabled),
          });

          if (Array.isArray(it.modifierGroups)) {
            it.modifierGroups.forEach((gId, idx) => {
              links.push({
                itemId,
                groupId: gId,
                sortOrder: idx,
                disabled: false,
              });
            });
          }
        }
      }
    }
  }

  if (Array.isArray(bData.modifierGroups)) {
    for (const grp of bData.modifierGroups) {
      groups.push({
        id: grp.id,
        name: grp.name || grp.id,
        scope: grp.scope === 'order' ? 'order' : 'item',
        selectionType: grp.selectionType === 'multiple' ? 'multiple' : 'single',
        minSelection: Number(grp.minSelection || 0),
        maxSelection: grp.maxSelection != null ? Number(grp.maxSelection) : null,
        pricingMode: grp.pricingMode || 'SUM',
        freeQuota: Number(grp.freeQuota || 0),
        metadata: { slug: grp.slug || null },
        options: (grp.options || []).map((opt) => ({
          id: opt.id,
          name: opt.name || opt.id,
          priceDelta: Number(opt.priceDelta ?? opt.price ?? 0),
          isDefault: Boolean(opt.isDefault),
          disabled: Boolean(opt.disabled),
          childGroups: Array.isArray(opt.childGroups) ? opt.childGroups : [],
          subOptions: Array.isArray(opt.subOptions)
            ? opt.subOptions.map((s) => ({
                id: s.id || s.productId || s.name || '',
                name: s.name || s.id || '',
                price: Number(s.price || 0),
              }))
            : [],
        })),
      });
    }
  }

  if (Array.isArray(bData.itemModifierLinks)) {
    for (const link of bData.itemModifierLinks) {
      if (!links.some((l) => l.itemId === link.itemId && l.groupId === link.groupId)) {
        links.push({
          itemId: link.itemId,
          groupId: link.groupId,
          sortOrder: Number(link.sortOrder || 0),
          disabled: Boolean(link.disabled),
        });
      }
    }
  }

  if (Array.isArray(bData.customizations)) {
    for (const cust of bData.customizations) {
      const custId = cust.id || cust.key || '';
      if (!groups.some((g) => g.id === custId)) {
        groups.push({
          id: custId,
          name: cust.label || custId,
          scope: 'order',
          selectionType: cust.type === 'checkbox' || cust.type === 'multi' ? 'multiple' : 'single',
          minSelection: cust.required ? 1 : 0,
          maxSelection: cust.type === 'radio' || cust.type === 'single' ? 1 : null,
          options: (cust.options || []).map((opt) => ({
            id: opt.id || opt.name || '',
            name: opt.name || opt.id || '',
            priceDelta: Number(opt.price || 0),
            isDefault: false,
            disabled: Boolean(opt.disabled),
            subOptions: Array.isArray(opt.subOptions)
              ? opt.subOptions.map((s) => ({
                  id: s.id || s.productId || s.name || '',
                  name: s.name || s.id || '',
                  price: Number(s.price || 0),
                }))
              : [],
          })),
        });
      }
    }
  }

  return { items, categories, groups, links };
}

/**
 * Returns the global browser PricingWasm runtime if loaded, or a safe unready stub.
 */
export function getPricingWasmRuntime(): PricingWasmRuntime {
  if (typeof window !== 'undefined') {
    const win = window as unknown as { PricingWasm?: PricingWasmRuntime };
    if (win.PricingWasm) {
      return win.PricingWasm;
    }
  }
  return { isReady: false };
}

/**
 * Computes cart pricing via the Rust WASM runtime when ready; returns null to trigger JS fallback otherwise.
 */
export function tryCalculateCartWithWasm(
  options: Parameters<NonNullable<PricingWasmRuntime['calculateCart']>>[0],
  runtime: PricingWasmRuntime = getPricingWasmRuntime(),
): WasmCartCalculationResult | null {
  if (!runtime.isReady || typeof runtime.calculateCart !== 'function') {
    return null;
  }
  return runtime.calculateCart(options);
}
