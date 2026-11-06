import type { Env } from '../types/env';
import type { TenantContext } from '../types/tenant';
import { corsHeaders, json } from '../utils/http';
import { readDetail, priceDetailMerchandise, validateDetailOrderSelections, DetailView } from './order-detail';
import type { DetailLine, DetailGroup } from '../types/order-detail';
import {
  loadOptionCatalog,
  effectiveGroups,
  validateOptionSelection,
  type OptionCatalog,
} from './option-groups';

const noStore = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization, X-Tenant-Id',
  Pragma: 'no-cache',
  Expires: '0',
};

const reply = (value: unknown, status = 200) => json(value, status, noStore);
const money = (value: number) => Math.round(value * 100) / 100;
const validQuantity = (value: unknown) => Number.isInteger(value) && Number(value) > 0 && Number(value) <= 999;
class CustomerOrderError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
function isoUtc(value: string) {
  const raw = String(value || '').trim().replace(' ', 'T');
  const milliseconds = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw) ? raw : raw + 'Z');
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : '';
}
function checkKey(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 256 || /[\u0000-\u001f]/.test(value))
    throw new CustomerOrderError('INVALID_ORDER_KEY', 400);
  return value;
}
async function readInput(request: Request) {
  if (!request.body) throw new CustomerOrderError('INVALID_JSON_BODY', 400);
  const reader = request.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 131072) { await reader.cancel(); throw new CustomerOrderError('REQUEST_TOO_LARGE', 413); }
      text += decoder.decode(value, { stream: true });
    }
    const input = JSON.parse(text + decoder.decode());
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
    return input;
  } catch (error) {
    if (error instanceof CustomerOrderError) throw error;
    throw new CustomerOrderError('INVALID_JSON_BODY', 400);
  } finally { reader.releaseLock(); }
}

type QuoteLine = Pick<DetailLine, 'itemId' | 'categoryId' | 'quantity' | 'unitPrice' | 'subtotal' | 'portions'>;
function saleProduct(catalog: OptionCatalog, id: string) {
  const product = catalog.products.find(p => p.id === id);
  return product && catalog.categories.some(c => c.id === product.category_id) ? product : undefined;
}
function quoteCartLine(catalog: OptionCatalog, raw: any): QuoteLine {
  const product = saleProduct(catalog, raw.itemId);
  if (!product || !validQuantity(raw.quantity) || (raw.options && (!Array.isArray(raw.options) || raw.options.length))) throw new Error('INVALID_ITEM');
  const supplied = raw.bundleSelections?.portions;
  if (supplied && (!Array.isArray(supplied) || supplied.length !== raw.quantity)) throw new Error('OPTION_PORTIONS_REQUIRED');
  if (!supplied && effectiveGroups(catalog, product.id).length) throw new Error('OPTION_SELECTION_REQUIRED');
  const portions = Array.from({ length: raw.quantity }, (_, i) => ({ portionIndex: i, note: '',
    groups: validateOptionSelection(catalog, product.id, supplied?.[i]?.groups || [], [], Infinity).groups as DetailGroup[] }));
  const unitPrice = Number(product.price);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('INVALID_PRICE');
  const subtotal = money(unitPrice * raw.quantity + portions.reduce((n, p) => n + p.groups.reduce((s, g) =>
    s + g.items.reduce((x, choice) => x + DetailView.extra(choice), 0), 0), 0));
  return { itemId: product.id, categoryId: product.category_id, quantity: raw.quantity, unitPrice, subtotal, portions };
}

export interface CustomerOrderListItemDTO {
  key: string;
  displayKey: string;
  createdAt: string;
  status: string;
  total: number;
  diningOption: string;
  itemSummary: string;
  itemCount: number;
  hasSnapshot: boolean;
}

export interface CustomerOrderDetailDTO {
  key: string;
  displayKey: string;
  createdAt: string;
  status: string;
  total: number;
  diningOption: string;
  note: string;
  reason?: string;
  rounds: Array<{
    roundNumber: number;
    createdAt?: string;
    total: number;
    discount?: number;
    note?: string;
    items: Array<{
      lineId?: string;
      itemId?: string;
      name: string;
      category?: string;
      categoryId?: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      note?: string;
      portions?: Array<{
        portionIndex: number;
        note?: string;
        groups: any[];
      }>;
      optionsText?: string[];
    }>;
    groups?: any[];
    legacyContent?: string;
  }>;
  isLegacy: boolean;
  legacyContent?: string;
  truncated?: boolean;
}

export interface ReorderPreviewItemDTO {
  historicalName: string;
  matchedItemId?: string;
  matchedName?: string;
  matchedCategory?: string;
  matchedCatSlug?: string;
  currentPrice?: number;
  historicalUnitPrice?: number;
  currentSubtotal?: number;
  historicalSubtotal?: number;
  priceChanged: boolean;
  quantity: number;
  clippedQuantity: number;
  wasClipped: boolean;
  status: 'available' | 'needs_choice' | 'unavailable';
  statusReason?: string;
  portions: Array<{
    portionIndex: number;
    note?: string;
    groups: any[];
    valid: boolean;
    issues?: string[];
  }>;
  hasOptionIssues: boolean;
  note?: string;
}

export interface ReorderPreviewDTO {
  orderKey: string;
  displayKey: string;
  canReorder: boolean;
  availableCount: number;
  needsChoiceCount: number;
  unavailableCount: number;
  items: ReorderPreviewItemDTO[];
  mode: 'merge' | 'replace';
  catalogRevision: number;
  orderSelections: DetailGroup[];
  orderOptionsNeedReview: boolean;
  cartNeedsReview: boolean;
  estimatedMerchandiseSubtotal: number;
  estimatedTotal: number | null;
  warnings: Array<{ code: string; name?: string; requestedQty?: number; allowedQty?: number }>;
  truncated: boolean;
  repricedCartItems: Array<{ itemId: string; quantity: number; portions: DetailLine['portions'] }>;
}

/**
 * Validates LIFF access token directly with LINE API and verifies tenant channel binding.
 * Never logs credentials. Returns verified userId and displayName.
 */
async function authenticateCustomer(
  request: Request,
  tenantCtx: TenantContext | null
): Promise<{ userId: string; displayName?: string } | null> {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.length <= 8192 ? authHeader.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/i) : null;
  if (!match) return null;
  const token = match[1];

  if (!tenantCtx?.liffId) return null;
  const expectedClientId = tenantCtx.liffId.match(/^(\d+)-/)?.[1];
  if (!expectedClientId) return null;

  try {
    const verifyRes = await fetch(
      `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (verifyRes.status === 429 || verifyRes.status >= 500) throw new CustomerOrderError('IDENTITY_UNAVAILABLE', 503);
    if (!verifyRes.ok) return null;
    const verifyData: any = await verifyRes.json();
    if (String(verifyData.client_id) !== expectedClientId || !(verifyData.expires_in > 0)) {
      return null;
    }

    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (profileRes.status === 429 || profileRes.status >= 500) throw new CustomerOrderError('IDENTITY_UNAVAILABLE', 503);
    if (!profileRes.ok) return null;
    const profile: any = await profileRes.json();
    if (typeof profile.userId !== 'string' || !/^U[0-9a-f]{32}$/i.test(profile.userId)) {
      return null;
    }
    return {
      userId: profile.userId,
      displayName: typeof profile.displayName === 'string' ? profile.displayName : undefined,
    };
  } catch (error) {
    if (error instanceof CustomerOrderError) throw error;
    throw new CustomerOrderError('IDENTITY_UNAVAILABLE', 503);
  }
}

/**
 * Parses legacy order_content text into an item summary.
 */
function parseLegacySummary(content: string): { summary: string; count: number } {
  if (!content) return { summary: '', count: 0 };
  const items: string[] = [];
  let totalCount = 0;
  for (const line of content.split('\n')) {
    const cleaned = line.trim().replace(/^[•●]\s*/, '');
    const leading = cleaned.match(/^(\d+)\s*(?:份\s*)?[x×]\s*(.+)$/i);
    const trailing = cleaned.match(/^([^:：]+?)\s*[x×]\s*(\d+)(?:\s*(?:份|phần))?$/i);
    const name = leading?.[2] || trailing?.[1];
    const qty = Number(leading?.[1] || trailing?.[2]);
    if (name && validQuantity(qty)) { items.push(`${name.trim()} ×${qty}`); totalCount += qty; }
  }
  return { summary: items.slice(0, 3).join(' · ') + (items.length > 3 ? ' …' : ''), count: totalCount };
}

/**
 * GET /api/customer/orders
 * Keyset-paginated order list for verified customer and current tenant.
 */
async function listCustomerOrders(
  request: Request,
  env: Env,
  tenantCtx: TenantContext,
  userId: string
): Promise<Response> {
  const url = new URL(request.url);
  const limitParam = parseInt(url.searchParams.get('limit') || '10', 10);
  const limit = Math.min(30, Math.max(1, isNaN(limitParam) ? 10 : limitParam));
  const beforeCreatedAt = url.searchParams.get('before_created_at');
  const beforeKey = url.searchParams.get('before_key');
  if (Boolean(beforeCreatedAt) !== Boolean(beforeKey) || (beforeCreatedAt && (beforeCreatedAt.length > 64 || !isoUtc(beforeCreatedAt))) || (beforeKey && beforeKey.length > 256))
    throw new CustomerOrderError('INVALID_CURSOR', 400);

  let query: string;
  let bindings: any[];

  if (beforeCreatedAt && beforeKey) {
    query = `SELECT key, display_key, created_at, status, total_amount, dining_option, round_count, detail_revision, order_content, note
      FROM orders
      WHERE tenant_id = ? AND user_id = ?
        AND (created_at < ? OR (created_at = ? AND key < ?))
      ORDER BY created_at DESC, key DESC
      LIMIT ?`;
    bindings = [tenantCtx.tenantId, userId, beforeCreatedAt, beforeCreatedAt, beforeKey, limit + 1];
  } else {
    query = `SELECT key, display_key, created_at, status, total_amount, dining_option, round_count, detail_revision, order_content, note
      FROM orders
      WHERE tenant_id = ? AND user_id = ?
      ORDER BY created_at DESC, key DESC
      LIMIT ?`;
    bindings = [tenantCtx.tenantId, userId, limit + 1];
  }

  const { results } = await env.DB.prepare(query).bind(...bindings).all<any>();
  const rows = results || [];
  const hasMore = rows.length > limit;
  const pagedRows = hasMore ? rows.slice(0, limit) : rows;

  // Read snapshots for canonical summary if available
  const snapshotKeys = pagedRows.filter((r) => Number(r.detail_revision) > 0).map((r) => r.key);
  const snapshotMap = new Map<string, any>();

  if (snapshotKeys.length > 0) {
    const placeholders = snapshotKeys.map(() => '?').join(',');
    const snapRes = await env.DB.prepare(
      `SELECT s.order_key, s.snapshot_json FROM order_detail_snapshots s
       JOIN orders o ON o.key=s.order_key AND o.tenant_id=s.tenant_id AND o.detail_revision=s.revision
       WHERE s.tenant_id=? AND o.user_id=? AND s.order_key IN (${placeholders})`
    ).bind(tenantCtx.tenantId, userId, ...snapshotKeys).all<any>();

    for (const snap of snapRes.results || []) {
      try {
        snapshotMap.set(snap.order_key, JSON.parse(snap.snapshot_json));
      } catch {}
    }
  }

  const orders: CustomerOrderListItemDTO[] = pagedRows.map((row) => {
    let itemSummary = '';
    let itemCount = 0;
    const snap = snapshotMap.get(row.key);

    if (snap?.rounds && Array.isArray(snap.rounds)) {
      const summaryItems: string[] = [];
      for (const r of snap.rounds) {
        if (r.legacyContent !== undefined) {
          const legacy = parseLegacySummary(r.legacyContent);
          if (legacy.summary) summaryItems.push(legacy.summary);
          itemCount += legacy.count;
        } else if (Array.isArray(r.items)) {
          for (const it of r.items) {
            summaryItems.push(`${it.name} ×${it.quantity}`);
            itemCount += Number(it.quantity) || 1;
          }
        }
      }
      itemSummary = summaryItems.slice(0, 3).join(' · ') + (summaryItems.length > 3 ? ' …' : '');
    }

    if (!itemSummary) {
      const parsed = parseLegacySummary(row.order_content || '');
      itemSummary = parsed.summary;
      itemCount = parsed.count;
    }

    return {
      key: row.key,
      displayKey: row.display_key || (row.key.length > 8 ? row.key.slice(-4) : row.key),
      createdAt: isoUtc(row.created_at),
      status: row.status || 'NEW',
      total: Number(row.total_amount) || 0,
      diningOption: row.dining_option || 'takeaway',
      itemSummary,
      itemCount,
      hasSnapshot: Boolean(snap),
    };
  });

  const lastRow = pagedRows[pagedRows.length - 1];
  const nextCursor = hasMore && lastRow ? { before_created_at: lastRow.created_at, before_key: lastRow.key } : null;

  return reply({
    orders,
    nextCursor,
    hasMore,
  });
}

/**
 * GET /api/customer/orders/:key or /api/customer/orders/detail?key=...
 * Authenticated order detail lookup. Owner filtered before snapshot resolution.
 */
async function getCustomerOrderDetail(
  orderKey: string,
  env: Env,
  tenantCtx: TenantContext,
  userId: string
): Promise<Response> {
  checkKey(orderKey);

  // 1. Owner check BEFORE reading any snapshot or detail
  const orderRow = await env.DB.prepare(
    `SELECT key, display_key, created_at, status, total_amount, dining_option, round_count, detail_revision, order_content, note, reason
     FROM orders
     WHERE tenant_id = ? AND user_id = ? AND key = ?
     LIMIT 1`
  ).bind(tenantCtx.tenantId, userId, orderKey).first<any>();

  if (!orderRow) {
    // Fail closed: 404 does not reveal whether key exists for other user/tenant
    return reply({ error: 'ORDER_NOT_FOUND' }, 404);
  }

  // 2. Read snapshot if detail_revision > 0
  const detail = await readDetail(env, tenantCtx.tenantId, orderRow.key);
  const snapshot = detail?.snapshot;

  let rounds: CustomerOrderDetailDTO['rounds'] = [];
  let truncated = false;

  if (snapshot?.rounds && Array.isArray(snapshot.rounds)) {
    rounds = snapshot.rounds.map((r) => ({
      roundNumber: r.roundNumber,
      createdAt: r.createdAt,
      total: r.total,
      discount: r.discount || 0,
      note: r.note || '',
      groups: r.groups || [],
      legacyContent: r.legacyContent,
      items: (r.items || []).map((item) => ({
        lineId: item.lineId,
        itemId: item.itemId,
        name: item.name,
        category: item.category,
        categoryId: item.categoryId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        note: item.note || '',
        portions: (item.portions || []).map((p) => ({
          portionIndex: p.portionIndex,
          note: p.note || '',
          groups: p.groups || [],
        })),
      })),
    }));
  } else {
    // Fallback to order_items or legacy content
    const itemsRes = await env.DB.prepare(
      `SELECT item_id,item_name,category_name,quantity,unit_price,subtotal,notes,selected_options,round_number
       FROM order_items WHERE tenant_id = ? AND order_key = ? ORDER BY round_number ASC, id ASC LIMIT 1001`
    ).bind(tenantCtx.tenantId, orderRow.key).all<any>();

    truncated = (itemsRes.results || []).length > 1000;
    const itemRows = (itemsRes.results || []).slice(0, 1000);
    if (itemRows.length > 0) {
      const byRound = new Map<number, any[]>();
      for (const ir of itemRows) {
        const rn = Number(ir.round_number) || 1;
        if (!byRound.has(rn)) byRound.set(rn, []);
        let optionsText: string[] = [];
        if (ir.selected_options) {
          try {
            const parsed = JSON.parse(ir.selected_options);
            if (Array.isArray(parsed)) {
              optionsText = parsed.map((p) => p.choice || p.name || String(p));
            }
          } catch {
            optionsText = [String(ir.selected_options)];
          }
        }
        byRound.get(rn)!.push({
          itemId: ir.item_id || undefined,
          name: ir.item_name,
          category: ir.category_name,
          quantity: Number(ir.quantity) || 1,
          unitPrice: Number(ir.unit_price) || 0,
          subtotal: Number(ir.subtotal) || 0,
          note: ir.notes || '',
          optionsText,
        });
      }

      rounds = [...byRound.entries()].map(([rn, items]) => ({
        roundNumber: rn,
        total: items.reduce((sum, it) => sum + it.subtotal, 0),
        items,
      }));
    } else {
      // Legacy text only
      rounds = [
        {
          roundNumber: 1,
          total: Number(orderRow.total_amount) || 0,
          items: [],
        },
      ];
    }
  }

  const dto: CustomerOrderDetailDTO = {
    key: orderRow.key,
    displayKey: orderRow.display_key || (orderRow.key.length > 8 ? orderRow.key.slice(-4) : orderRow.key),
    createdAt: isoUtc(orderRow.created_at),
    status: orderRow.status || 'NEW',
    total: Number(orderRow.total_amount) || 0,
    diningOption: orderRow.dining_option || 'takeaway',
    note: orderRow.note || '',
    reason: orderRow.reason || '',
    rounds,
    isLegacy: !snapshot,
    legacyContent: orderRow.order_content || '',
    truncated,
  };

  return reply(dto);
}

/**
 * POST /api/customer/orders/reorder-preview
 * Reconciles historical order items against fresh catalog & Unified Option rules.
 * Does not mutate cart or create any order draft on server.
 */
async function previewReorder(request: Request, env: Env, tenantCtx: TenantContext, userId: string): Promise<Response> {
  const body = await readInput(request);
  const orderKey = checkKey(body.orderKey || body.key);
  const mode: 'merge' | 'replace' = body.mode === 'merge' ? 'merge' : 'replace';
  if (body.mode !== undefined && !['merge', 'replace'].includes(body.mode)) throw new CustomerOrderError('INVALID_REORDER_MODE', 400);
  const orderRow = await env.DB.prepare(`SELECT key,display_key,total_amount,detail_revision,order_content
    FROM orders WHERE tenant_id=? AND user_id=? AND key=? LIMIT 1`).bind(tenantCtx.tenantId, userId, orderKey).first<any>();
  if (!orderRow) return reply({ error: 'ORDER_NOT_FOUND' }, 404);
  const catalog = await loadOptionCatalog(env, tenantCtx.tenantId);
  const detail = Number(orderRow.detail_revision) > 0 ? await readDetail(env, tenantCtx.tenantId, orderKey) : null;
  const snapshot = detail?.snapshot;
  const warnings: ReorderPreviewDTO['warnings'] = [];
  const historical: Array<{ itemId?: string; name: string; category?: string; quantity: number; unitPrice: number;
    subtotal: number; portions?: DetailLine['portions']; note: string; legacyOptions?: boolean }> = [];
  let legacyText = false, truncated = false, historicalOrderGroups: DetailGroup[] | null = null;
  let groupFingerprint: string | undefined;
  if (snapshot?.schemaVersion === 1 && Array.isArray(snapshot.rounds)) {
    for (const round of snapshot.rounds) {
      if (round.legacyContent !== undefined) { legacyText = true; continue; }
      const groups = round.groups || [];
      // Different rounds may have incompatible order-wide preferences; require review instead of picking one.
      const identity = JSON.stringify(groups);
      if (groupFingerprint !== undefined && groupFingerprint !== identity) historicalOrderGroups = null;
      else if (groupFingerprint === undefined) historicalOrderGroups = groups;
      groupFingerprint = identity;
      for (const item of round.items || []) {
        if (historical.length >= 200) { truncated = true; break; }
        historical.push({ itemId: item.itemId, name: item.name, category: item.category, quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice), subtotal: Number(item.subtotal), portions: item.portions, note: item.note || '' });
      }
    }
    if (legacyText) historicalOrderGroups = null;
  } else {
    const { results } = await env.DB.prepare(`SELECT item_id,item_name,category_name,quantity,unit_price,subtotal,notes,selected_options
      FROM order_items WHERE tenant_id=? AND order_key=? ORDER BY round_number,id LIMIT 201`)
      .bind(tenantCtx.tenantId, orderKey).all<any>();
    truncated = (results || []).length > 200;
    const rawOptions = /(?:^|\n)\s*[↳+\-]/.test(orderRow.order_content || '');
    for (const item of (results || []).slice(0, 200)) {
      historical.push({ itemId: item.item_id || undefined, name: item.item_name, category: item.category_name || undefined,
        quantity: Number(item.quantity), unitPrice: Number(item.unit_price), subtotal: Number(item.subtotal), note: item.notes || '',
        legacyOptions: rawOptions || Boolean(item.selected_options && item.selected_options !== '[]') });
    }
    legacyText = Boolean(orderRow.order_content);
  }
  if (legacyText) warnings.push({ code: 'LEGACY_TEXT_REQUIRES_SELECTION' });
  if (truncated) warnings.push({ code: 'HISTORY_TRUNCATED' });

  const maximum = (product: OptionCatalog['products'][number]) => {
    const n = Number(product.max_per_order);
    return Number.isInteger(n) && n > 0 ? Math.min(999, n) : 999;
  };
  const existing: QuoteLine[] = [];
  const quantities = new Map<string, number>();
  let cartNeedsReview = false, totalUnits = 0;
  if (mode === 'merge') {
    if (!Array.isArray(body.cartItems) || body.cartItems.length > 200) throw new CustomerOrderError('INVALID_CART', 400);
    for (const raw of body.cartItems) {
      try {
        const line = quoteCartLine(catalog, raw);
        totalUnits += line.quantity;
        if (totalUnits > 3000) throw new CustomerOrderError('CART_TOO_LARGE', 400);
        const used = (quantities.get(line.itemId) || 0) + line.quantity;
        if (used > maximum(saleProduct(catalog, line.itemId)!)) throw new Error('ITEM_LIMIT_EXCEEDED');
        quantities.set(line.itemId, used); existing.push(line);
      } catch (error) {
        if (error instanceof CustomerOrderError) throw error;
        cartNeedsReview = true;
      }
    }
  }
  const items: ReorderPreviewItemDTO[] = [];
  const candidates = new Map<ReorderPreviewItemDTO, QuoteLine>();
  for (const old of historical) {
    const item: ReorderPreviewItemDTO = { historicalName: old.name, historicalUnitPrice: old.unitPrice,
      historicalSubtotal: old.subtotal, priceChanged: false, quantity: old.quantity, clippedQuantity: 0,
      wasClipped: false, status: 'unavailable', statusReason: 'PRODUCT_NOT_FOUND', portions: [], hasOptionIssues: false, note: old.note };
    items.push(item);
    let product = old.itemId ? saleProduct(catalog, old.itemId) : undefined;
    // A known deleted ID must never be substituted by a new product with the same name.
    if (!old.itemId && old.category) {
      const matches = catalog.products.filter(p => p.name === old.name && catalog.categories.some(c => c.id === p.category_id && c.name === old.category));
      if (matches.length === 1) product = saleProduct(catalog, matches[0].id);
    }
    if (!product) continue;
    const category = catalog.categories.find(c => c.id === product!.category_id)!;
    Object.assign(item, { matchedItemId: product.id, matchedName: product.name, matchedCategory: category.name,
      matchedCatSlug: category.slug, currentPrice: Number(product.price) });
    if (product.is_out_of_stock || (product.out_of_stock_until && Date.parse(isoUtc(product.out_of_stock_until)) > Date.now())) {
      item.statusReason = 'OUT_OF_STOCK'; continue;
    }
    if (!validQuantity(old.quantity)) { item.statusReason = 'INVALID_HISTORICAL_QUANTITY'; continue; }
    const allowed = Math.max(0, Math.min(old.quantity, maximum(product) - (quantities.get(product.id) || 0), 3000 - totalUnits));
    item.clippedQuantity = allowed; item.wasClipped = allowed !== old.quantity;
    if (item.wasClipped) warnings.push({ code: 'ITEM_LIMIT_EXCEEDED', name: old.name, requestedQty: old.quantity, allowedQty: allowed });
    if (!allowed) { item.statusReason = 'ITEM_LIMIT_REACHED'; continue; }
    try {
      if (!old.portions && (old.legacyOptions || effectiveGroups(catalog, product.id).length)) throw new Error('LEGACY_OPTIONS_NEED_REVIEW');
      const line = quoteCartLine(catalog, { itemId: product.id, quantity: allowed,
        bundleSelections: { portions: old.portions?.slice(0, allowed) || Array.from({ length: allowed }, () => ({ groups: [] })) } });
      item.status = 'available'; item.statusReason = undefined; item.currentSubtotal = line.subtotal;
      item.portions = line.portions.map((portion, i) => ({ ...portion, valid: true, note: old.portions?.[i]?.note || '' }));
      item.historicalSubtotal = old.portions
        ? money(old.unitPrice * allowed + old.portions.slice(0, allowed).reduce((n, p) => n + p.groups.reduce((s, g) =>
          s + g.items.reduce((x, choice) => x + DetailView.extra(choice), 0), 0), 0))
        : money(old.subtotal * allowed / old.quantity);
      item.priceChanged = Math.abs(line.subtotal - item.historicalSubtotal) > 0.001;
      quantities.set(product.id, (quantities.get(product.id) || 0) + allowed); totalUnits += allowed;
      candidates.set(item, line);
    } catch (error) {
      item.status = 'needs_choice'; item.hasOptionIssues = true;
      item.statusReason = error instanceof Error && /^[A-Z_]{1,80}$/.test(error.message) ? error.message : 'OPTIONS_NEED_REVIEW';
    }
  }

  // Excluding an ineligible item may lower the subtotal and invalidate another selection.
  // Each pass removes at least one candidate, so this terminates within 200 passes.
  for (;;) {
    const subtotal = priceDetailMerchandise(catalog, [...existing, ...candidates.values()]).merchandiseSubtotal;
    let removed = false;
    for (const [item, line] of candidates) {
      try { for (const portion of line.portions) validateOptionSelection(catalog, line.itemId, portion.groups, [], subtotal); }
      catch {
        item.status = 'needs_choice'; item.statusReason = 'MIN_ORDER_SUBTOTAL_NOT_MET'; item.hasOptionIssues = true;
        item.portions = []; candidates.delete(item); removed = true;
      }
    }
    if (!removed) break;
  }
  const lines = [...existing, ...candidates.values()];
  const { merchandiseSubtotal } = priceDetailMerchandise(catalog, lines);
  if (new Set(lines.map(line => line.itemId)).size > 200) { cartNeedsReview = true; warnings.push({ code: 'CART_LINE_LIMIT_EXCEEDED' }); }
  for (const line of existing) {
    try { for (const portion of line.portions) validateOptionSelection(catalog, line.itemId, portion.groups, [], merchandiseSubtotal); }
    catch { cartNeedsReview = true; }
  }
  if (cartNeedsReview) warnings.push({ code: 'EXISTING_CART_NEEDS_REVIEW' });
  let orderSelections: DetailGroup[] = [], orderOptionsNeedReview = false;
  try {
    const groups = catalog.groups.filter(g => g.scope === 'order');
    const selected = mode === 'merge' ? body.orderSelections : historicalOrderGroups;
    const supplied = selected === null ? groups.map(g => ({ groupId: g.id, items: [] })) : selected;
    orderSelections = validateDetailOrderSelections(catalog, supplied, merchandiseSubtotal);
    if (mode === 'replace' && historicalOrderGroups === null && groups.length > 0) orderOptionsNeedReview = true;
  } catch { orderOptionsNeedReview = true; }
  if (orderOptionsNeedReview) { orderSelections = []; warnings.push({ code: 'ORDER_OPTIONS_NEED_REVIEW' }); }
  const extra = orderSelections.reduce((n, g) => n + g.items.reduce((s, choice) => s + DetailView.extra(choice), 0), 0);
  const availableCount = items.filter(i => i.status === 'available').length;
  const result: ReorderPreviewDTO = { orderKey, displayKey: orderRow.display_key || orderKey, mode,
    catalogRevision: catalog.revision || 0, canReorder: availableCount > 0 && !cartNeedsReview, availableCount,
    needsChoiceCount: items.filter(i => i.status === 'needs_choice').length,
    unavailableCount: items.filter(i => i.status === 'unavailable').length, items, orderSelections,
    orderOptionsNeedReview, cartNeedsReview, estimatedMerchandiseSubtotal: merchandiseSubtotal,
    estimatedTotal: orderOptionsNeedReview ? null : money(merchandiseSubtotal + extra), warnings, truncated,
    repricedCartItems: existing.map(line => ({ itemId: line.itemId, quantity: line.quantity, portions: line.portions })) };
  return reply(result);
}

/**
 * Top-level route handler for /api/customer/orders*
 */
export async function handleCustomerOrdersRoute(
  request: Request,
  env: Env,
  tenantCtx: TenantContext | null,
  path: string
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (!tenantCtx) {
    return reply({ error: 'TENANT_NOT_FOUND' }, 404);
  }

  try {
    const auth = await authenticateCustomer(request, tenantCtx);
    if (!auth) return reply({ error: 'UNAUTHORIZED' }, 401);
    // 1. GET /api/customer/orders (List)
    if (request.method === 'GET' && (path === '/api/customer/orders' || path === '/api/customer/orders/')) {
      return await listCustomerOrders(request, env, tenantCtx, auth.userId);
    }

    // 2. GET /api/customer/orders/detail?key=...
    if (request.method === 'GET' && path === '/api/customer/orders/detail') {
      const url = new URL(request.url);
      const key = url.searchParams.get('key') || '';
      return await getCustomerOrderDetail(checkKey(key), env, tenantCtx, auth.userId);
    }

    // 3. POST /api/customer/orders/reorder-preview
    if (request.method === 'POST' && path === '/api/customer/orders/reorder-preview') {
      return await previewReorder(request, env, tenantCtx, auth.userId);
    }

    // 4. GET /api/customer/orders/:key (Direct key path)
    const directMatch = path.match(/^\/api\/customer\/orders\/([^/]+)$/);
    if (request.method === 'GET' && directMatch) {
      return await getCustomerOrderDetail(checkKey(decodeURIComponent(directMatch[1])), env, tenantCtx, auth.userId);
    }

    return reply({ error: 'NOT_FOUND' }, 404);
  } catch (err) {
    if (err instanceof CustomerOrderError) return reply({ error: err.code }, err.status);
    if (err instanceof URIError) return reply({ error: 'INVALID_ORDER_KEY' }, 400);
    console.error('[CustomerOrders] Request failed');
    return reply({ error: 'CUSTOMER_ORDERS_UNAVAILABLE' }, 503);
  }
}
