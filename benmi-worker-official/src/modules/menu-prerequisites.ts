import { hasDbColumn, hasDbTable } from './operating-shifts';

export type CategoryPrerequisiteMode = 'none' | 'require_any';
export type ItemPrerequisiteMode = 'inherit' | 'none' | 'require_any';

export interface PrerequisiteLinkDto {
  sourceType: 'category' | 'item';
  sourceId: string;
  requiredType: 'category' | 'item';
  requiredId: string;
  minQuantity: number;
  sortOrder: number;
}

export interface PrerequisiteRuleDto {
  mode: 'require_any';
  minParentQty: number;
  requiredItemIds: string[];
  requiredCategoryIds: string[];
}

export interface LoadedPrerequisiteLinks {
  hasTable: boolean;
  links: PrerequisiteLinkDto[];
  byCategoryId: Map<string, PrerequisiteLinkDto[]>;
  byItemId: Map<string, PrerequisiteLinkDto[]>;
}

export function normalizeCategoryPrerequisiteMode(raw: unknown): CategoryPrerequisiteMode {
  return raw === 'require_any' ? 'require_any' : 'none';
}

export function normalizeItemPrerequisiteMode(raw: unknown): ItemPrerequisiteMode {
  if (raw === 'require_any') return 'require_any';
  if (raw === 'none') return 'none';
  return 'inherit';
}

export async function hasPrerequisiteSchema(
  db: D1Database | undefined | null
): Promise<{
  hasCatModeCol: boolean;
  hasItemModeCol: boolean;
  hasLinksTable: boolean;
}> {
  if (!db) {
    return { hasCatModeCol: false, hasItemModeCol: false, hasLinksTable: false };
  }
  const [hasCatModeCol, hasItemModeCol, hasLinksTable] = await Promise.all([
    hasDbColumn(db, 'menu_categories', 'prerequisite_mode'),
    hasDbColumn(db, 'menu_items', 'prerequisite_mode'),
    hasDbTable(db, 'menu_prerequisite_links'),
  ]);
  return { hasCatModeCol, hasItemModeCol, hasLinksTable };
}

export async function loadTenantPrerequisiteLinks(
  db: D1Database | undefined | null,
  tenantId: string
): Promise<LoadedPrerequisiteLinks> {
  const byCategoryId = new Map<string, PrerequisiteLinkDto[]>();
  const byItemId = new Map<string, PrerequisiteLinkDto[]>();
  if (!db || !tenantId) {
    return { hasTable: false, links: [], byCategoryId, byItemId };
  }
  const hasTable = await hasDbTable(db, 'menu_prerequisite_links');
  if (!hasTable) {
    return { hasTable: false, links: [], byCategoryId, byItemId };
  }
  const res = await db
    .prepare(
      `SELECT source_type, source_id, required_type, required_id, min_quantity, sort_order
       FROM menu_prerequisite_links
       WHERE tenant_id = ?
       ORDER BY sort_order ASC, rowid ASC`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();
  const rows = Array.isArray(res?.results) ? res.results : [];
  const links: PrerequisiteLinkDto[] = [];
  for (const r of rows) {
    const sourceType = r.source_type === 'item' ? 'item' : 'category';
    const sourceId = String(r.source_id || '').trim();
    const requiredType = r.required_type === 'category' ? 'category' : 'item';
    const requiredId = String(r.required_id || '').trim();
    if (!sourceId || !requiredId) continue;
    const dto: PrerequisiteLinkDto = {
      sourceType,
      sourceId,
      requiredType,
      requiredId,
      minQuantity: Math.max(1, Number(r.min_quantity || 1)),
      sortOrder: Number(r.sort_order || 0),
    };
    links.push(dto);
    const targetMap = sourceType === 'item' ? byItemId : byCategoryId;
    if (!targetMap.has(sourceId)) targetMap.set(sourceId, []);
    targetMap.get(sourceId)!.push(dto);
  }
  return { hasTable: true, links, byCategoryId, byItemId };
}

export function extractTargetIds(
  links: readonly PrerequisiteLinkDto[] | undefined
): {
  requiredItemIds: string[];
  requiredCategoryIds: string[];
  minParentQty: number;
} {
  const requiredItemIds: string[] = [];
  const requiredCategoryIds: string[] = [];
  let minParentQty = 1;
  for (const l of links || []) {
    if (l.minQuantity > minParentQty) minParentQty = l.minQuantity;
    if (l.requiredType === 'item') {
      if (!requiredItemIds.includes(l.requiredId)) requiredItemIds.push(l.requiredId);
    } else if (l.requiredType === 'category') {
      if (!requiredCategoryIds.includes(l.requiredId)) requiredCategoryIds.push(l.requiredId);
    }
  }
  return { requiredItemIds, requiredCategoryIds, minParentQty };
}

export function buildCategoryPrerequisiteRule(
  categoryMode: unknown,
  categoryLinks: readonly PrerequisiteLinkDto[] | undefined
): PrerequisiteRuleDto | null {
  if (normalizeCategoryPrerequisiteMode(categoryMode) !== 'require_any') return null;
  const { requiredItemIds, requiredCategoryIds, minParentQty } = extractTargetIds(categoryLinks);
  if (requiredItemIds.length === 0 && requiredCategoryIds.length === 0) return null;
  return {
    mode: 'require_any',
    minParentQty,
    requiredItemIds,
    requiredCategoryIds,
  };
}

export function resolveEffectivePrerequisiteRule(
  category: { id?: string; prerequisite_mode?: unknown; prerequisiteMode?: unknown } | null | undefined,
  item: { id?: string; prerequisite_mode?: unknown; prerequisiteMode?: unknown } | null | undefined,
  loaded: Pick<LoadedPrerequisiteLinks, 'byCategoryId' | 'byItemId'>
): PrerequisiteRuleDto | null {
  const itemMode = normalizeItemPrerequisiteMode(item?.prerequisiteMode ?? item?.prerequisite_mode);
  if (itemMode === 'none') return null;
  const itemId = item?.id ? String(item.id) : '';
  if (itemMode === 'require_any') {
    const rawLinks = itemId ? loaded.byItemId.get(itemId) || [] : [];
    const filtered = rawLinks.filter((l) => !(l.requiredType === 'item' && l.requiredId === itemId));
    const { requiredItemIds, requiredCategoryIds, minParentQty } = extractTargetIds(filtered);
    if (requiredItemIds.length === 0 && requiredCategoryIds.length === 0) return null;
    return {
      mode: 'require_any',
      minParentQty,
      requiredItemIds,
      requiredCategoryIds,
    };
  }
  const catId = category?.id ? String(category.id) : '';
  const catMode = normalizeCategoryPrerequisiteMode(category?.prerequisiteMode ?? category?.prerequisite_mode);
  if (catMode !== 'require_any' || !catId) return null;
  const rawCatLinks = loaded.byCategoryId.get(catId) || [];
  const filteredCatLinks = rawCatLinks.filter(
    (l) =>
      !(l.requiredType === 'category' && l.requiredId === catId) &&
      !(itemId && l.requiredType === 'item' && l.requiredId === itemId)
  );
  return buildCategoryPrerequisiteRule('require_any', filteredCatLinks);
}

export function buildPrerequisiteLinkDiffStatements(params: {
  db: D1Database;
  tenantId: string;
  sourceType: 'category' | 'item';
  sourceId: string;
  mode: CategoryPrerequisiteMode | ItemPrerequisiteMode;
  requiredItemIds: readonly string[];
  requiredCategoryIds: readonly string[];
  minParentQty?: number;
  existingLinks: readonly PrerequisiteLinkDto[];
  ownedCategoryIds: ReadonlySet<string>;
  ownedItemIds: ReadonlySet<string>;
}): D1PreparedStatement[] {
  const {
    db,
    tenantId,
    sourceType,
    sourceId,
    mode,
    existingLinks,
    ownedCategoryIds,
    ownedItemIds,
  } = params;
  const minQty = Math.max(1, Math.floor(Number(params.minParentQty || 1)));
  const desired: Array<{ requiredType: 'category' | 'item'; requiredId: string; minQuantity: number; sortOrder: number }> = [];

  if (mode === 'require_any') {
    const cleanCats = [...new Set(params.requiredCategoryIds.map((x) => String(x || '').trim()).filter(Boolean))];
    const cleanItems = [...new Set(params.requiredItemIds.map((x) => String(x || '').trim()).filter(Boolean))];

    for (const cid of cleanCats) {
      if (!ownedCategoryIds.has(cid)) throw new Error('INVALID_PREREQUISITE_CATEGORY_ID');
      if (sourceType === 'category' && cid === sourceId) throw new Error('PREREQUISITE_SELF_REFERENCE');
      desired.push({ requiredType: 'category', requiredId: cid, minQuantity: minQty, sortOrder: desired.length });
    }
    for (const iid of cleanItems) {
      if (!ownedItemIds.has(iid)) throw new Error('INVALID_PREREQUISITE_ITEM_ID');
      if (sourceType === 'item' && iid === sourceId) throw new Error('PREREQUISITE_SELF_REFERENCE');
      desired.push({ requiredType: 'item', requiredId: iid, minQuantity: minQty, sortOrder: desired.length });
    }
  }

  const statements: D1PreparedStatement[] = [];
  const desiredKeys = new Set(desired.map((d) => `${d.requiredType}:${d.requiredId}`));
  for (const old of existingLinks) {
    const key = `${old.requiredType}:${old.requiredId}`;
    if (!desiredKeys.has(key)) {
      statements.push(
        db
          .prepare(
            `DELETE FROM menu_prerequisite_links
             WHERE tenant_id = ? AND source_type = ? AND source_id = ? AND required_type = ? AND required_id = ?`
          )
          .bind(tenantId, sourceType, sourceId, old.requiredType, old.requiredId)
      );
    }
  }

  const existingByKey = new Map(existingLinks.map((o) => [`${o.requiredType}:${o.requiredId}`, o]));
  for (const next of desired) {
    const prev = existingByKey.get(`${next.requiredType}:${next.requiredId}`);
    if (prev && prev.minQuantity === next.minQuantity && prev.sortOrder === next.sortOrder) {
      continue;
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO menu_prerequisite_links
             (tenant_id, source_type, source_id, required_type, required_id, min_quantity, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(tenant_id, source_type, source_id, required_type, required_id)
           DO UPDATE SET min_quantity = excluded.min_quantity, sort_order = excluded.sort_order`
        )
        .bind(tenantId, sourceType, sourceId, next.requiredType, next.requiredId, next.minQuantity, next.sortOrder)
    );
  }

  return statements;
}

export interface PrerequisiteValidationFailure {
  valid: false;
  code: 'PREREQUISITE_ITEM_REQUIRED';
  itemIndex: number;
  itemId: string;
  itemName: string;
  requiredItemIds: string[];
  requiredCategoryIds: string[];
  requiredNames: string[];
  error: string;
}

export type PrerequisiteValidationResult = { valid: true } | PrerequisiteValidationFailure;

export interface OrderLikeLine {
  itemId?: string | null;
  item_id?: string | null;
  name?: string | null;
  category?: string | null;
  category_name?: string | null;
  quantity?: number;
}

function resolveCatalogProduct(
  products: ReadonlyArray<Record<string, any>>,
  categories: ReadonlyArray<Record<string, any>>,
  raw: OrderLikeLine
): Record<string, any> | null {
  const rawId = String(raw.itemId || raw.item_id || '').trim();
  if (rawId) {
    const byId = products.find((p) => String(p.id) === rawId);
    if (byId) return byId;
  }
  const rawName = String(raw.name || '')
    .replace(/\s+(L|S|M)$/i, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .trim();
  if (!rawName) return null;
  const rawCat = String(raw.category || raw.category_name || '').trim();
  if (rawCat) {
    const matchedCat = categories.find(
      (c) => String(c.id) === rawCat || String(c.slug) === rawCat || String(c.name) === rawCat
    );
    if (matchedCat) {
      const byCatAndName = products.find(
        (p) => String(p.category_id) === String(matchedCat.id) && String(p.name) === rawName
      );
      if (byCatAndName) return byCatAndName;
    }
  }
  return products.find((p) => String(p.name) === rawName) || null;
}

export function validateOrderPrerequisites(params: {
  products: ReadonlyArray<Record<string, any>>;
  categories: ReadonlyArray<Record<string, any>>;
  prerequisiteLinks?: readonly PrerequisiteLinkDto[];
  submittedItems: ReadonlyArray<OrderLikeLine>;
  existingOrderItems?: ReadonlyArray<OrderLikeLine>;
  legacyOrderTexts?: readonly string[];
}): PrerequisiteValidationResult {
  const {
    products,
    categories,
    prerequisiteLinks = [],
    submittedItems,
    existingOrderItems = [],
    legacyOrderTexts = [],
  } = params;

  if (!prerequisiteLinks.length || !submittedItems.length) {
    return { valid: true };
  }

  const byCategoryId = new Map<string, PrerequisiteLinkDto[]>();
  const byItemId = new Map<string, PrerequisiteLinkDto[]>();
  for (const l of prerequisiteLinks) {
    const map = l.sourceType === 'item' ? byItemId : byCategoryId;
    if (!map.has(l.sourceId)) map.set(l.sourceId, []);
    map.get(l.sourceId)!.push(l);
  }

  const catById = new Map<string, Record<string, any>>(
    categories.map((c) => [String(c.id), c])
  );

  // Tally qualifying quantities by resolved product ID across both existing active rounds and current submission
  const qtyByProductId = new Map<string, number>();
  const addLineQty = (line: OrderLikeLine) => {
    const qty = Number(line?.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const prod = resolveCatalogProduct(products, categories, line);
    if (!prod) return;
    const pid = String(prod.id);
    qtyByProductId.set(pid, (qtyByProductId.get(pid) || 0) + qty);
  };

  for (const prior of existingOrderItems) addLineQty(prior);
  for (const current of submittedItems) addLineQty(current);

  // Fallback for legacy unstructured text rounds on old orders during append
  if (legacyOrderTexts.length > 0) {
    const joined = legacyOrderTexts.filter(Boolean).join('\n');
    if (joined) {
      for (const prod of products) {
        const pName = String(prod.name || '').trim();
        if (pName && joined.includes(pName) && !qtyByProductId.has(String(prod.id))) {
          qtyByProductId.set(String(prod.id), 1);
        }
      }
    }
  }

  for (const [itemIndex, raw] of submittedItems.entries()) {
    const qty = Number(raw?.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const prod = resolveCatalogProduct(products, categories, raw);
    if (!prod) continue;
    const cat = catById.get(String(prod.category_id)) || null;
    const rule = resolveEffectivePrerequisiteRule(cat, prod, { byCategoryId, byItemId });
    if (!rule) continue;

    const reqItemSet = new Set(rule.requiredItemIds);
    const reqCatSet = new Set(rule.requiredCategoryIds);

    let qualifyingQty = 0;
    for (const [pid, count] of qtyByProductId.entries()) {
      if (pid === String(prod.id)) continue;
      const candidate = products.find((p) => String(p.id) === pid);
      if (!candidate) continue;
      if (reqItemSet.has(pid) || reqCatSet.has(String(candidate.category_id))) {
        qualifyingQty += count;
      }
    }

    if (qualifyingQty < rule.minParentQty) {
      const requiredNames: string[] = [];
      for (const cid of rule.requiredCategoryIds) {
        const c = catById.get(cid);
        if (c?.name && !requiredNames.includes(String(c.name))) requiredNames.push(String(c.name));
      }
      for (const iid of rule.requiredItemIds) {
        const p = products.find((x) => String(x.id) === iid);
        if (p?.name && !requiredNames.includes(String(p.name))) requiredNames.push(String(p.name));
      }
      const targetLabel = requiredNames.join(' / ') || '指定主餐';
      return {
        valid: false,
        code: 'PREREQUISITE_ITEM_REQUIRED',
        itemIndex,
        itemId: String(prod.id),
        itemName: String(prod.name || raw.name || ''),
        requiredItemIds: rule.requiredItemIds,
        requiredCategoryIds: rule.requiredCategoryIds,
        requiredNames,
        error: `選購「${String(prod.name || raw.name || '')}」需先點購「${targetLabel}」`,
      };
    }
  }

  return { valid: true };
}
