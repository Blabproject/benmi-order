import { Env } from '../types/env';
import { json } from '../utils/http';
import { TenantContext } from '../types/tenant';

export async function getTableStatus(
  request: Request,
  env: Env,
  tenantCtx?: TenantContext | null
): Promise<Response> {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenant_id") || url.searchParams.get("tenant") || tenantCtx?.tenantId;
  const tableLabel = (url.searchParams.get("table") || url.searchParams.get("table_number") || "").trim();
  if (!tenantId) return json({ ok: false, error: "TENANT_REQUIRED" }, 400);
  if (!tableLabel) return json({ ok: false, error: "TABLE_REQUIRED" }, 400);
  if (!env.DB) return json({ ok: false, error: "NO_DB" }, 500);

  // 1. Look up table from restaurant_tables
  const table = await env.DB.prepare(
    "SELECT id, tenant_id, label, sort_order, is_active FROM restaurant_tables WHERE tenant_id = ? AND label = ?"
  ).bind(tenantId, tableLabel).first<any>();

  const isTableActive = table ? (table.is_active === 1) : true;
  const tableId = table?.id || null;

  // 2. Query for active open order on this table
  // Active statuses: NEW, ACCEPTED, COOKING, READY, PREPARING, CONFIRMED
  // Finalized / closed statuses: PAID, REJECTED, PICKED_UP, EXPIRED, FORCE_REJECT
  const activeOrder = await env.DB.prepare(`
    SELECT key, order_id, display_key, status, total_amount, round_count, detail_revision, customer_name, created_at
    FROM orders
    WHERE tenant_id = ?
      AND (table_id = ? OR table_number = ?)
      AND status NOT IN ('PAID', 'REJECTED', 'PICKED_UP', 'EXPIRED', 'FORCE_REJECT')
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(tenantId, tableId || '__none__', tableLabel).first<any>();

  return json({
    ok: true,
    tenant_id: tenantId,
    table: {
      id: tableId,
      label: tableLabel,
      is_active: isTableActive,
      exists: !!table
    },
    active_order: activeOrder ? {
      key: activeOrder.key,
      order_id: activeOrder.order_id,
      display_key: activeOrder.display_key,
      status: activeOrder.status,
      total_amount: activeOrder.total_amount,
      round_count: activeOrder.round_count,
      detail_revision: activeOrder.detail_revision,
      customer_name: activeOrder.customer_name,
      created_at: activeOrder.created_at
    } : null
  });
}
