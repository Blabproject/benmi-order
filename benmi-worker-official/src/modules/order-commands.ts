import type { Env } from '../types/env';
import { json } from '../utils/http';
import { resolveOrderKey } from './order-identity';
import { verifyStaffSession, sha256Hex } from './staff';
import { staffAccess } from './staff-access';
import { tenantIsDeleted } from '../utils/tenant-lifecycle';
import { decideOrderTransition, isOrderState, LifecycleError, manualCollectionForCompletion,
  type CompletionSettlement, type LifecycleContext, type OrderState } from '../domain/order-lifecycle';

type StaffAction = 'accept' | 'mark_ready' | 'complete' | 'cancel' | 'refund_manual';
interface Input { operationId: string; expectedRevision: number; action: StaffAction; settlement: CompletionSettlement; reason: string }
interface Row { key: string; status: string; revision: number; total_amount: number; detail_revision: number; source: string }
interface PaymentRow { id: string; status: string; updated_at: number; paid_at: number | null; refunded_at: number | null }
interface ManualRow { amount_minor: number; method: 'cash' | 'bank_transfer' | 'other'; currency: string }
const actions = ['accept','mark_ready','complete','cancel','refund_manual'];
const noStore = { 'Cache-Control': 'no-store' };
const reply = (value: unknown, status = 200) => json(value, status, noStore);
export function parseOrderCommand(body: unknown): Input {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LifecycleError('INVALID_COMMAND');
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some(k => !['operationId','expectedRevision','action','settlement','reason'].includes(k))) throw new LifecycleError('INVALID_COMMAND');
  if (typeof b.operationId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(b.operationId)) throw new LifecycleError('INVALID_OPERATION_ID');
  if (!Number.isSafeInteger(b.expectedRevision) || (b.expectedRevision as number) < 0) throw new LifecycleError('INVALID_REVISION');
  if (typeof b.action !== 'string' || !actions.includes(b.action)) throw new LifecycleError('INVALID_ACTION');
  if (b.reason !== undefined && (typeof b.reason !== 'string' || b.reason.trim().length > 500)) throw new LifecycleError('INVALID_REASON');
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (['cancel','refund_manual'].includes(b.action) && !reason) throw new LifecycleError('REASON_REQUIRED');
  const settlement = b.settlement ?? { mode: 'unchanged' };
  if (!settlement || typeof settlement !== 'object' || Array.isArray(settlement)) throw new LifecycleError('INVALID_SETTLEMENT_MODE');
  const s = settlement as Record<string, unknown>;
  if (Object.keys(s).some(k => !['mode','amountMinor','currency','method'].includes(k))) throw new LifecycleError('INVALID_SETTLEMENT_MODE');
  if (s.mode !== 'unchanged' && s.mode !== 'confirm_manual') throw new LifecycleError('INVALID_SETTLEMENT_MODE');
  if (s.mode === 'unchanged' && Object.keys(s).length !== 1) throw new LifecycleError('INVALID_SETTLEMENT_MODE');
  if (s.mode === 'confirm_manual' && (b.action !== 'complete' || !Number.isSafeInteger(s.amountMinor) || (s.amountMinor as number) < 0 || s.currency !== 'TWD'
    || !['cash','bank_transfer','other'].includes(String(s.method)))) throw new LifecycleError('INVALID_SETTLEMENT_MODE');
  return { operationId: b.operationId, expectedRevision: b.expectedRevision as number, action: b.action as StaffAction,
    settlement: { mode: s.mode, ...(s.mode === 'confirm_manual' ? { amountMinor: s.amountMinor as number, currency: 'TWD', method: s.method as 'cash' | 'bank_transfer' | 'other' } : {}) }, reason };
}
function paymentState(p: PaymentRow | null): LifecycleContext['payment'] {
  if (!p) return 'manual';
  if (p.refunded_at !== null) return 'refunded';
  if (p.status === 'REFUND_PENDING' || p.status === 'REFUND_FAILED') return 'refund_pending';
  if (p.status === 'PAID' && p.paid_at !== null) return 'paid';
  return 'unresolved';
}
export function amountToMinor(value: number): number {
  const minor = Math.round(value * 100);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(minor) || Math.abs(value * 100 - minor) > 0.000001)
    throw new LifecycleError('INVALID_ORDER_AMOUNT');
  return minor;
}
export async function handleOrderCommand(request: Request, env: Env, tenant: string, requestedKey: string): Promise<Response> {
  try {
    if (await tenantIsDeleted(env.DB, tenant)) return reply({code:'TENANT_DELETED'},410);
    const actor = await verifyStaffSession(request, env, tenant);
    if (!actor) return reply({code:'UNAUTHORIZED'},401);
    const ready = await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='order_commands'").first();
    if (!ready) return reply({code:'ORDER_COMMANDS_NOT_READY'},503);
    const input = parseOrderCommand(await request.json().catch(() => null));
    const key = await resolveOrderKey(env, tenant, requestedKey);
    const row = key ? await env.DB.prepare('SELECT key,status,revision,total_amount,detail_revision,source FROM orders WHERE tenant_id=? AND key=?')
      .bind(tenant,key).first<Row>() : null;
    if (!row) return reply({code:'ORDER_NOT_FOUND'},404);
    if (row.source === 'staff' && !(await staffAccess(env,tenant)).capabilities.status) return reply({code:'FEATURE_DISABLED'},403);
    const hash = await sha256Hex(JSON.stringify({ key: row.key, ...input }));
    const replay = async (): Promise<Response | null> => {
      const old = await env.DB.prepare('SELECT request_hash,response_json FROM order_commands WHERE tenant_id=? AND operation_id=?')
        .bind(tenant,input.operationId).first<{request_hash:string;response_json:string}>();
      if (!old) return null;
      if (old.request_hash !== hash) throw new LifecycleError('OPERATION_ID_REUSED');
      return reply({...JSON.parse(old.response_json),idempotent:true});
    };
    const prior = await replay(); if (prior) return prior;
    if (row.revision !== input.expectedRevision) throw new LifecycleError('ORDER_REVISION_CONFLICT');
    if (!isOrderState(row.status)) throw new LifecycleError('ORDER_MIGRATION_REVIEW_REQUIRED');
    const payment = await env.DB.prepare('SELECT id,status,updated_at,paid_at,refunded_at FROM payments WHERE tenant_id=? AND order_key=?')
      .bind(tenant,row.key).first<PaymentRow>();
    const pending = !!await env.DB.prepare('SELECT 1 FROM pending_actions WHERE tenant_id=? AND order_key=?').bind(tenant,row.key).first();
    const receipt = await env.DB.prepare("SELECT amount_minor,method,currency FROM manual_payment_entries WHERE tenant_id=? AND order_key=? AND kind='collected'")
      .bind(tenant,row.key).first<ManualRow>();
    const refund = await env.DB.prepare("SELECT 1 FROM manual_payment_entries WHERE tenant_id=? AND order_key=? AND kind='refunded'").bind(tenant,row.key).first();
    const now = new Date().toISOString();
    let next: OrderState;
    let money: {amountMinor:number;currency:string;method:string} | null = null;
    if (input.action === 'refund_manual') {
      if (payment || !receipt || refund) throw new LifecycleError('MANUAL_REFUND_INVALID');
      next = ['COMPLETED','CANCELLED','EXPIRED'].includes(row.status) ? row.status : 'CANCELLED';
      money = { amountMinor: receipt.amount_minor, currency: receipt.currency, method: receipt.method };
    } else {
      next = decideOrderTransition({ state:row.status,actor:'staff',pendingAction:pending,payment:paymentState(payment) },input.action);
      if (input.action === 'complete') money = manualCollectionForCompletion(input.settlement,amountToMinor(row.total_amount),'TWD',paymentState(payment),!!receipt);
    }
    const result = { success:true,key:row.key,status:next,revision:row.revision+1,
      settlementRecorded:money ? (input.action === 'refund_manual' ? 'refunded' : 'collected') : null };
    const statements = [env.DB.prepare(`INSERT INTO order_commands
      (tenant_id,operation_id,order_key,request_hash,actor,action,expected_revision,previous_status,next_status,
       expected_amount,expected_detail_revision,expected_payment_id,expected_payment_status,expected_payment_updated_at,response_json,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(tenant,input.operationId,row.key,hash,actor.tokenHash,input.action,row.revision,row.status,next,
        row.total_amount,row.detail_revision,payment?.id ?? null,payment?.status ?? null,payment?.updated_at ?? null,JSON.stringify(result),now),
      env.DB.prepare(`UPDATE orders SET status=?,revision=revision+1,updated_at=strftime('%Y-%m-%d %H:%M:%f','now'),
        reason=CASE WHEN ?='cancel' THEN ? ELSE reason END WHERE tenant_id=? AND key=? AND revision=? AND status=?`)
        .bind(next,input.action,input.reason,tenant,row.key,row.revision,row.status)];
    if (input.action === 'complete') statements.push(env.DB.prepare(`INSERT INTO order_completions
      (tenant_id,order_key,operation_id,amount,detail_revision,completed_at,evidence) VALUES(?,?,?,?,?,?,'command')`)
      .bind(tenant,row.key,input.operationId,row.total_amount,row.detail_revision,now));
    if (money) statements.push(env.DB.prepare(`INSERT INTO manual_payment_entries
      (tenant_id,order_key,operation_id,kind,amount_minor,currency,method,actor,occurred_at,reason) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(tenant,row.key,input.operationId,input.action==='refund_manual'?'refunded':'collected',money.amountMinor,money.currency,money.method,actor.tokenHash,now,input.reason || null));
    if (next === 'CANCELLED') statements.push(env.DB.prepare('DELETE FROM pending_actions WHERE tenant_id=? AND order_key=?').bind(tenant,row.key));
    try { await env.DB.batch(statements); }
    catch (error) { const repeated = await replay(); if (repeated) return repeated; throw error; }
    return reply(result);
  } catch (error) {
    if (error instanceof LifecycleError) return reply({code:error.code},error.code.startsWith('INVALID_') || error.code==='REASON_REQUIRED' ? 400 : 409);
    const message = String(error);
    const code = ['ORDER_REVISION_CONFLICT','ORDER_PAYMENT_CONFLICT','ORDER_SESSION_EXPIRED','PENDING_ACTION_UNRESOLVED','ORDER_FINALIZED','COMPLETION_COMMAND_REQUIRED','MANUAL_PAYMENT_COMMAND_REQUIRED','MANUAL_REFUND_INVALID'].find(c=>message.includes(c));
    if (code) return reply({code},code==='ORDER_SESSION_EXPIRED'?401:409);
    console.error('[Order command failed]',error instanceof Error ? error.message : 'unknown');
    return reply({code:'ORDER_COMMAND_FAILED'},500);
  }
}
