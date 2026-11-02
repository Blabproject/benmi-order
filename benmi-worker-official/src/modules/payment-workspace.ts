import type { Env } from '../types/env';

export class PaymentWorkspaceError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}

export const paymentStatuses = ['REQUESTING', 'PENDING', 'CONFIRMING', 'UNKNOWN', 'PAID', 'CANCELLED', 'FAILED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'];
const dayMs = 86400000;
const activeStatuses = ['REQUESTING', 'PENDING', 'CONFIRMING', 'UNKNOWN', 'REFUND_PENDING'];

interface WorkspaceRow {
  id: string; order_key: string; display_key: string | null; order_status: string;
  provider_order_id: string; transaction_id: string | null; status: string; amount: number; currency: string;
  created_at: number; updated_at: number; paid_at: number | null; refunded_at: number | null;
  result_code: string | null; cancel_requested_at: number | null;
  refund_status: string | null; refund_reason: string | null; refund_created_at: number | null;
  refund_result_code: string | null; refund_transaction_id: string | null; attention_reason: string | null;
}

// Shared by the public count and authenticated list/detail. Phase-specific clocks
// prevent an old payment from making a newly requested refund look overdue.
const scopeSql = `WITH scoped AS (
 SELECT p.*, o.display_key, o.status AS order_status,
 r.status AS refund_status, r.reason AS refund_reason, r.created_at AS refund_created_at,
 r.result_code AS refund_result_code, r.transaction_id AS refund_transaction_id,
 CASE
  WHEN p.status='REFUND_FAILED' THEN 'REFUND_FAILED'
  WHEN p.status='PAID' AND (p.cancel_requested_at IS NOT NULL OR o.status IN ('CANCELLED','REJECTED','FORCE_REJECT','EXPIRED')) THEN 'PAID_CANCELLED'
  WHEN p.status='REFUND_PENDING' AND COALESCE(r.created_at,p.updated_at)<=clock.cutoff THEN 'REFUND_DELAYED'
  WHEN p.cancel_requested_at IS NOT NULL AND p.status IN ('REQUESTING','PENDING','CONFIRMING','UNKNOWN') AND p.cancel_requested_at<=clock.cutoff THEN 'CANCEL_DELAYED'
  WHEN p.status IN ('REQUESTING','CONFIRMING','UNKNOWN') AND
   CASE WHEN p.status='CONFIRMING' THEN COALESCE(p.confirmation_started_at,p.created_at) ELSE p.created_at END<=clock.cutoff THEN 'PAYMENT_UNCERTAIN'
 END AS attention_reason
 FROM payments p JOIN orders o ON o.key=p.order_key AND o.tenant_id=p.tenant_id
 JOIN tenant_payment_connections c ON c.id=p.connection_id AND c.tenant_id=p.tenant_id
 LEFT JOIN payment_refunds r ON r.payment_id=p.id AND r.tenant_id=p.tenant_id
 CROSS JOIN (SELECT ? AS cutoff) clock
 WHERE p.tenant_id=? AND c.environment=?
)`;

function scopeBindings(env: Env, tenantId: string, now: number) {
  return [now - 300000, tenantId, env.BUILD_ENVIRONMENT || 'unconfigured'];
}

function project(row: WorkspaceRow) {
  return {
    id: row.id, method: 'line_pay', orderKey: row.order_key, displayKey: row.display_key || row.order_key,
    orderStatus: row.order_status, providerOrderId: row.provider_order_id, transactionId: row.transaction_id,
    status: row.status, amount: row.amount, currency: row.currency,
    createdAt: row.created_at, updatedAt: row.updated_at, paidAt: row.paid_at, refundedAt: row.refunded_at,
    refundedAmount: row.refunded_at ? row.amount : 0, resultCode: row.result_code,
    cancelRequestedAt: row.cancel_requested_at, attentionReason: row.attention_reason,
    needsAttention: !!row.attention_reason, canReconcile: activeStatuses.includes(row.status), canRefund: row.status === 'PAID',
    refund: row.refund_status ? {
      status: row.refund_status, reason: row.refund_reason, requestedAt: row.refund_created_at,
      resultCode: row.refund_result_code, transactionId: row.refund_transaction_id
    } : null
  };
}

export function paymentDateRange(params: URLSearchParams, now = Date.now()) {
  const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  const from = params.get('from') ?? params.get('date') ?? today;
  const to = params.get('to') ?? (params.has('from') ? '' : from);
  if (params.has('to') && !params.has('from')) throw new PaymentWorkspaceError('INVALID_DATE_RANGE');
  function parse(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new PaymentWorkspaceError('INVALID_DATE_RANGE');
    const stamp = Date.parse(value + 'T00:00:00+08:00');
    if (!Number.isFinite(stamp) || new Date(stamp + 8 * 3600000).toISOString().slice(0, 10) !== value) {
      throw new PaymentWorkspaceError('INVALID_DATE_RANGE');
    }
    return stamp;
  }
  const start = parse(from), end = parse(to) + dayMs;
  if (end <= start || end - start > 31 * dayMs) throw new PaymentWorkspaceError('INVALID_DATE_RANGE');
  return { from, to, start, end };
}

export async function paymentAttentionCount(env: Env, tenantId: string, now = Date.now()) {
  const row = await env.DB.prepare(scopeSql + ' SELECT COUNT(*) AS count FROM scoped WHERE attention_reason IS NOT NULL')
    .bind(...scopeBindings(env, tenantId, now)).first<{ count: number }>();
  return { count: row?.count || 0, checkedAt: now };
}

// Preserve the legacy array response while using the same attention predicate.
export async function paymentAttentionRows<T>(env: Env, tenantId: string, now = Date.now()) {
  const { results } = await env.DB.prepare(scopeSql + ' SELECT * FROM scoped WHERE attention_reason IS NOT NULL ORDER BY created_at,id LIMIT 100')
    .bind(...scopeBindings(env, tenantId, now)).all<T>();
  return results;
}

export async function paymentTransactions(env: Env, tenantId: string, params: URLSearchParams, now = Date.now()) {
  const view = params.get('view') || 'history';
  if (!['attention', 'history'].includes(view)) throw new PaymentWorkspaceError('INVALID_PAYMENT_VIEW');
  const range = view === 'history' ? paymentDateRange(params, now) : null;
  const status = params.get('status') || '', q = (params.get('q') || '').trim();
  if ((status && !paymentStatuses.includes(status)) || q.length > 100) throw new PaymentWorkspaceError('INVALID_PAYMENT_FILTER');
  const rawLimit = params.get('limit') || '50';
  if (!/^\d{1,3}$/.test(rawLimit) || +rawLimit < 1 || +rawLimit > 100) throw new PaymentWorkspaceError('INVALID_PAYMENT_LIMIT');
  const limit = +rawLimit;
  const filters = JSON.stringify([tenantId, env.BUILD_ENVIRONMENT, view, range?.from, range?.to, status, q]);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(filters));
  const scope = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  const where = [view === 'attention' ? 'attention_reason IS NOT NULL' : 'created_at>=? AND created_at<?'];
  const values: (string | number)[] = [...scopeBindings(env, tenantId, now)];
  if (range) values.push(range.start, range.end);
  if (view === 'history' && status) { where.push('status=?'); values.push(status); }
  if (view === 'history' && q) {
    where.push("(display_key LIKE ? ESCAPE '\\' OR order_key LIKE ? ESCAPE '\\' OR transaction_id LIKE ? ESCAPE '\\')");
    const search = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    values.push(search, search, search);
  }
  const cursor = params.get('cursor');
  const direction = view === 'attention' ? 'ASC' : 'DESC';
  if (cursor) {
    try {
      if (cursor.length > 1024) throw new Error();
      const value: unknown = JSON.parse(atob(cursor));
      if (!value || typeof value !== 'object' || !('time' in value) || !('id' in value) || !('scope' in value) ||
        typeof value.time !== 'number' || !Number.isSafeInteger(value.time) || typeof value.id !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(value.id) || value.scope !== scope) throw new Error();
      const comparison = direction === 'ASC' ? '>' : '<';
      where.push(`(created_at${comparison}? OR (created_at=? AND id${comparison}?))`);
      values.push(value.time, value.time, value.id);
    } catch { throw new PaymentWorkspaceError('INVALID_PAYMENT_CURSOR'); }
  }
  const { results } = await env.DB.prepare(scopeSql + ` SELECT * FROM scoped WHERE ${where.join(' AND ')} ORDER BY created_at ${direction},id ${direction} LIMIT ?`)
    .bind(...values, limit + 1).all<WorkspaceRow>();
  const rows = results.slice(0, limit), last = rows.at(-1);
  return { items: rows.map(project), nextCursor: results.length > limit && last ? btoa(JSON.stringify({ time: last.created_at, id: last.id, scope })) : null };
}

export async function paymentWorkspaceDetail(env: Env, tenantId: string, id: string, now = Date.now()) {
  const row = await env.DB.prepare(scopeSql + ' SELECT * FROM scoped WHERE id=?')
    .bind(...scopeBindings(env, tenantId, now), id).first<WorkspaceRow>();
  if (!row) throw new PaymentWorkspaceError('PAYMENT_NOT_FOUND', 404);
  return project(row);
}

export async function paymentSummary(env: Env, tenantId: string, params: URLSearchParams) {
  const range = paymentDateRange(params);
  const total = await env.DB.prepare(`SELECT
    COALESCE(SUM(CASE WHEN paid_at>=? AND paid_at<? THEN amount ELSE 0 END),0) AS collected,
    COALESCE(SUM(CASE WHEN refunded_at>=? AND refunded_at<? THEN amount ELSE 0 END),0) AS refunded
    FROM payments p JOIN tenant_payment_connections c ON c.id=p.connection_id AND c.tenant_id=p.tenant_id
    WHERE p.tenant_id=? AND c.environment=?`)
    .bind(range.start, range.end, range.start, range.end, tenantId, env.BUILD_ENVIRONMENT || 'unconfigured')
    .first<{ collected: number; refunded: number }>();
  return { date: range.from, from: range.from, to: range.to, currency: 'TWD', collected: total?.collected || 0,
    refunded: total?.refunded || 0, net: (total?.collected || 0) - (total?.refunded || 0) };
}
