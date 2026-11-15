import { Env } from '../types/env';
import { json } from '../utils/http';
import { verifyStaffSession } from './staff';

export const STOCK_BATCH_LIMIT = 100;

// Keep the existing stock business-day boundary: 04:00 UTC+7.
export function stockExpiry(body: any, now = Date.now()): string | null {
  if (body.status === 'in_stock') return null;
  if (body.status !== 'out_of_stock') throw new Error('INVALID_STATUS');
  if (body.duration === 'indefinite') return '9999-12-31T23:59:59.000Z';
  if (body.duration === 'today') {
    const day = new Date(now + 31 * 3600000).toISOString().slice(0, 10);
    return new Date(`${day}T04:00:00+07:00`).toISOString();
  }
  if (body.duration !== 'multiple_days' || typeof body.until_date !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T04:00:00\+07:00$/.test(body.until_date)) throw new Error('INVALID_DURATION');
  const timestamp = Date.parse(body.until_date);
  if (!Number.isFinite(timestamp) || timestamp <= now
    || new Date(timestamp + 7 * 3600000).toISOString().slice(0, 10) !== body.until_date.slice(0, 10)) throw new Error('INVALID_DATE');
  return new Date(timestamp).toISOString();
}

export async function updateStockBatch(request: Request, env: Env, tenantId: string, ctx?: ExecutionContext): Promise<Response> {
  if (!await verifyStaffSession(request, env, tenantId)) return json({ error: 'UNAUTHORIZED' }, 401);
  const body: any = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.item_ids) || !body.item_ids.length || body.item_ids.length > STOCK_BATCH_LIMIT
    || body.item_ids.some((id: unknown) => typeof id !== 'string' || !id.trim() || id.length > 256)) {
    return json({ error: 'INVALID_ITEM_IDS', limit: STOCK_BATCH_LIMIT }, 400);
  }
  let until: string | null;
  try { until = stockExpiry(body); }
  catch (error) { return json({ error: (error as Error).message }, 400); }
  const ids = [...new Set<string>(body.item_ids)];
  const encoded = JSON.stringify(ids);
  // json_each keeps the binding count constant even for a full batch. The count
  // guard is evaluated inside the transaction, so a missing ID prevents ALL writes.
  const targets = 'SELECT value FROM json_each(?)';
  const guard = `(SELECT COUNT(*) FROM menu_items WHERE tenant_id = ? AND id IN (${targets})) = ?`;
  let before: any[], updated: any[];
  try {
    const result = await env.DB.batch([
      env.DB.prepare(`SELECT id, out_of_stock_until FROM menu_items WHERE tenant_id = ? AND id IN (${targets})`).bind(tenantId, encoded),
      env.DB.prepare(`UPDATE menu_items SET out_of_stock_until = ?, updated_at = datetime('now')
        WHERE tenant_id = ? AND id IN (${targets}) AND ${guard} RETURNING id, out_of_stock_until`)
        .bind(until, tenantId, encoded, tenantId, encoded, ids.length),
      env.DB.prepare(`UPDATE modifier_options SET out_of_stock_until = ?, is_out_of_stock = ?, updated_at = datetime('now')
        WHERE tenant_id = ? AND product_id IN (${targets}) AND ${guard}`)
        .bind(until, body.status === 'out_of_stock' ? 1 : 0, tenantId, encoded, tenantId, encoded, ids.length)
    ]);
    before = result[0].results;
    updated = result[1].results;
  } catch (error) {
    console.error(JSON.stringify({ event: 'stock_batch_failed', tenantId, count: ids.length, error: String(error) }));
    return json({ error: 'STOCK_WRITE_FAILED' }, 500);
  }
  if (updated.length !== ids.length) return json({ error: 'ITEMS_UNAVAILABLE' }, 409);

  const invalidate = async () => {
    const results = await Promise.allSettled(['menu', 'bootstrap', 'bootstrap:v2', 'config_cache']
      .map(key => env.ORDER_STATE.delete(`tenant:${tenantId}:${key}`)));
    if (results.some(result => result.status === 'rejected')) throw new Error('CACHE_INVALIDATION_FAILED');
  };
  let cacheRefreshed = true;
  try { await invalidate(); }
  catch {
    cacheRefreshed = false;
    console.warn(JSON.stringify({ event: 'stock_batch_cache_retry', tenantId, count: ids.length }));
    const retry = invalidate().catch(() => console.error(JSON.stringify({ event: 'stock_batch_cache_failed', tenantId })));
    if (ctx) ctx.waitUntil(retry); else await retry;
  }
  const changed = before.filter(item => item.out_of_stock_until !== until).length;
  return json({ success: true, items: updated, changed, unchanged: ids.length - changed, cache_refreshed: cacheRefreshed }, 200, { 'Cache-Control': 'no-store' });
}
