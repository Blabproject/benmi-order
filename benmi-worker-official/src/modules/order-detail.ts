import type { Env } from '../types/env';
import type { Order } from '../types';
import type { DetailGroup, DetailLine, DetailRound, OrderDetailSnapshot } from '../types/order-detail';
import { loadOptionCatalog, effectiveGroups, groupOptions, validateOptionSelection, type OptionCatalog } from './option-groups';
import DetailView from '../../../js/order-detail-view.js';

export { DetailView };
export const detailReads = (env: Env) => env.ORDER_DETAIL_READS !== 'false';
export const detailWrites = (env: Env) => env.ORDER_DETAIL_WRITES !== 'false';
export class DetailError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
const fail = (code: string): never => { throw new DetailError(code); };
const amount = (n: number) => Math.round(n * 100) / 100;
const integer = (n: unknown, min = 0) => Number.isInteger(n) && Number(n) >= min && Number(n) <= 999;
const note = (value: unknown) => {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > 4000) return fail('INVALID_NOTE');
  return value.trim();
};
const selectionIdentity = (groups: any[]) => groups.map(g => ({ groupId: g.groupId,
  items: (g.items || []).map((c: any) => ({ optionId: c.optionId || c.itemId, quantity: c.quantity,
    groups: selectionIdentity(c.groups || []), subOptions: (c.subOptions || []).map((s: any) => typeof s === 'string' ? s : s.id || s.productId || s.name).sort() }))
}));
const sameSelections = (a: any[], b: any[]) => JSON.stringify(selectionIdentity(a)) === JSON.stringify(selectionIdentity(b));

/** Same catalog validation for every write. Inputs never supply sale labels/prices. */
export async function buildDetailRound(env: Env, tenant: string, input: any, roundNumber: number,
  previous?: DetailRound): Promise<DetailRound> {
  const catalog = await loadOptionCatalog(env, tenant);
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 200) fail('EMPTY_OR_TOO_MANY_ITEMS');
  const unchangedLine = (i: any) => {
    const old = previous?.items.find(l => l.lineId === i.lineId && l.itemId === (i.itemId || i.item_id));
    const portions = i.bundleSelections?.portions || Array.from({ length: i.quantity }, () => ({ groups: [] }));
    return old && old.quantity === i.quantity && portions.length === old.portions.length &&
      portions.every((p: any, index: number) => sameSelections(p.groups || [], old.portions[index].groups)) ? old : undefined;
  };
  const baseSubtotal = input.items.reduce((sum: number, i: any) => {
    const unchanged = unchangedLine(i);
    if (unchanged) return sum + unchanged.unitPrice * unchanged.quantity;
    const p = catalog.products.find(p => p.id === (i.itemId || i.item_id));
    if (!p || !integer(i.quantity, 1)) return fail('INVALID_ITEM');
    return sum + Number(p.price) * i.quantity;
  }, 0);
  const usedLines = new Set<string>();
  const items: DetailLine[] = input.items.map((raw: any) => {
    const unchanged = unchangedLine(raw);
    if (unchanged) {
      if (usedLines.has(unchanged.lineId)) fail('DUPLICATE_LINE');
      usedLines.add(unchanged.lineId);
      if (raw.portionNotes !== undefined && (!Array.isArray(raw.portionNotes) || raw.portionNotes.length !== unchanged.quantity)) fail('INVALID_PORTION_NOTES');
      return { ...unchanged, note: raw.note === undefined ? unchanged.note : note(raw.note),
        portions: unchanged.portions.map((p, i) => ({ ...p, note: raw.portionNotes === undefined ? p.note : note(raw.portionNotes[i]) })) };
    }
    const product = catalog.products.find(p => p.id === (raw.itemId || raw.item_id))!;
    const old = raw.lineId ? previous?.items.find(i => i.lineId === raw.lineId) : undefined;
    if (raw.lineId && previous && (!old || old.itemId !== product.id)) fail('INVALID_LINE_ID');
    const lineId = old?.lineId || crypto.randomUUID();
    if (usedLines.has(lineId)) fail('DUPLICATE_LINE');
    usedLines.add(lineId);
    if (product.is_out_of_stock || (product.out_of_stock_until && Date.parse(product.out_of_stock_until) > Date.now())) fail('PRODUCT_UNAVAILABLE');
    const quantity = raw.quantity;
    if (product.max_per_order && input.items.filter((i: any) => (i.itemId || i.item_id) === product.id)
      .reduce((n: number, i: any) => n + i.quantity, 0) > product.max_per_order) fail('ITEM_LIMIT_EXCEEDED');
    const groups = effectiveGroups(catalog, product.id);
    const supplied = raw.bundleSelections?.portions;
    if (supplied && (!Array.isArray(supplied) || supplied.length !== quantity)) fail('OPTION_PORTIONS_REQUIRED');
    if (groups.length && !supplied) fail('OPTION_SELECTION_REQUIRED');
    // All choices must arrive in the typed selection tree; never accept label-only options.
    if (raw.options?.length) fail('ORDER_CLIENT_UPGRADE_REQUIRED');
    const portionNotes = raw.portionNotes;
    if (portionNotes !== undefined && (!Array.isArray(portionNotes) || portionNotes.length !== quantity)) fail('INVALID_PORTION_NOTES');
    const portions = Array.from({ length: quantity }, (_, index) => {
      const result = validateOptionSelection(catalog, product.id, supplied?.[index]?.groups || [], [], Infinity);
      return { portionIndex: index, groups: result.groups as DetailGroup[],
        note: portionNotes === undefined ? old?.portions[index]?.note || '' : note(portionNotes[index]) };
    });
    const extra = portions.reduce((sum, p) => sum + p.groups.reduce((n, g) => n + g.items.reduce((x, c) => x + DetailView.extra(c), 0), 0), 0);
    const category = catalog.categories.find(c => c.id === product.category_id);
    return { lineId, itemId: product.id, name: product.name, categoryId: product.category_id,
      category: category?.name || '', quantity, unitPrice: Number(product.price),
      subtotal: amount(Number(product.price) * quantity + extra),
      note: raw.note === undefined ? old?.note || '' : note(raw.note), portions };
  });
  let discount = 0;
  for (const cat of catalog.categories) {
    const rule = typeof cat.pricing_rules === 'string' ? JSON.parse(cat.pricing_rules || 'null') : cat.pricing_rules;
    if (!rule?.bundle_qty || !rule?.bundle_price) continue;
    const prices = items.filter(i => i.categoryId === cat.id).flatMap(i => Array(i.quantity).fill(i.unitPrice)).sort((a, b) => b - a);
    const count = Math.floor(prices.length / rule.bundle_qty);
    if (count) discount += Math.max(0, prices.slice(0, count * rule.bundle_qty).reduce((a, b) => a + b, 0) - count * rule.bundle_price);
  }
  if (previous && items.length === previous.items.length && input.items.every(unchangedLine)) discount = previous.discount;
  const merchandiseSubtotal = amount(Math.max(0, items.reduce((n, i) => n + i.subtotal, 0) - discount));
  for (const raw of input.items) {
    if (unchangedLine(raw)) continue;
    const id = raw.itemId || raw.item_id;
    const supplied = raw.bundleSelections?.portions;
    if (Array.isArray(supplied)) {
      for (const p of supplied) validateOptionSelection(catalog, id, p?.groups || [], [], merchandiseSubtotal);
    }
  }
  let selectedGroups: DetailGroup[];
  if (previous && (input.orderSelections === undefined || (Array.isArray(input.orderSelections) && sameSelections(input.orderSelections, previous.groups)))) selectedGroups = previous.groups;
  else {
    if (!Array.isArray(input.orderSelections)) fail('ORDER_SELECTIONS_REQUIRED');
    const orderGroups = catalog.groups.filter(g => g.scope === 'order');
    // Reuse the same rules engine with a request-local synthetic product, not a stored SKU.
    const syntheticId = crypto.randomUUID();
    const synthetic: OptionCatalog = { ...catalog,
      products: [...catalog.products, { id: syntheticId, price: 0 }],
      groups: catalog.groups.map(g => g.scope === 'order' ? { ...g, scope: 'item', options: groupOptions(catalog, g) } : g),
      links: [...catalog.links, ...orderGroups.map(g => ({ itemId: syntheticId, groupId: g.id }))] };
    selectedGroups = validateOptionSelection(synthetic, syntheticId, input.orderSelections, [], merchandiseSubtotal).groups;
  }
  const total = amount(items.reduce((n, i) => n + i.subtotal, 0) - discount
    + selectedGroups.reduce((n, g) => n + g.items.reduce((x, c) => x + DetailView.extra(c), 0), 0));
  const submitted = input.appended_total ?? input.new_total ?? input.total;
  if (!Number.isFinite(submitted) || Math.abs(total - submitted) > 0.001) throw new DetailError('ORDER_PRICE_CHANGED', 409);
  return { roundNumber, createdAt: previous?.createdAt || new Date().toISOString(),
    items, groups: selectedGroups, note: input.note === undefined ? previous?.note || '' : note(input.note), discount: amount(discount), total };
}

export async function readDetail(env: Env, tenant: string, key: string) {
  const row = await env.DB.prepare(`SELECT s.snapshot_json, s.revision FROM order_detail_snapshots s
    JOIN orders o ON o.key=s.order_key AND o.tenant_id=s.tenant_id AND o.detail_revision=s.revision
    WHERE s.tenant_id=? AND s.order_key=?`).bind(tenant, key).first<{ snapshot_json: string; revision: number }>();
  return row ? { snapshot: JSON.parse(row.snapshot_json) as OrderDetailSnapshot, revision: row.revision } : null;
}

export function detailStatement(env: Env, tenant: string, key: string, revision: number,
  operation: string, hash: string, snapshot: OrderDetailSnapshot, kind: 'create' | 'append' | 'modify') {
  return env.DB.prepare(`INSERT INTO order_detail_snapshots
    (tenant_id,order_key,revision,operation_id,request_hash,snapshot_json,operation_kind) VALUES (?,?,?,?,?,?,?)`)
    .bind(tenant, key, revision, operation, hash, JSON.stringify(snapshot), kind);
}

/** Reporting projection is derived, never a second independently writable configuration. */
export function detailProjection(env: Env, tenant: string, key: string, snapshot: OrderDetailSnapshot) {
  const legacyThrough = Math.max(0, ...snapshot.rounds.filter(r => r.legacyContent !== undefined).map(r => r.roundNumber));
  return [env.DB.prepare('DELETE FROM order_items WHERE tenant_id=? AND order_key=? AND round_number>?').bind(tenant, key, legacyThrough),
    ...DetailView.lines(snapshot).map((i: any) => env.DB.prepare(`INSERT INTO order_items
      (tenant_id,order_key,round_number,item_id,item_name,category_name,quantity,unit_price,subtotal,selected_options,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(tenant, key, i.round_number, i.itemId, i.name, i.category,
        i.quantity, i.unit_price, i.subtotal, i.selected_options, i.note))];
}

export async function attachOrderDetails(env: Env, tenant: string, orders: Order[]) {
  if (!detailReads(env) || !orders.length) return;
  const byKey = new Map(orders.map(o => [o.key, o]));
  const keys = [...byKey.keys()];
  for (let start = 0; start < keys.length; start += 50) {
    const chunk = keys.slice(start, start + 50);
    const { results } = await env.DB.prepare(`SELECT s.order_key,s.revision,s.snapshot_json FROM order_detail_snapshots s
      JOIN orders o ON o.key=s.order_key AND o.tenant_id=s.tenant_id AND o.detail_revision=s.revision
      WHERE s.tenant_id=? AND s.order_key IN (${chunk.map(() => '?').join(',')})`).bind(tenant, ...chunk).all<any>();
    for (const row of results) {
      const order = byKey.get(row.order_key)!;
      order.detailSnapshot = JSON.parse(row.snapshot_json);
      order.detailRevision = row.revision;
      order.note = DetailView.notes(order.detailSnapshot);
    }
  }
}
