import OrderCode from '../../../js/order-code.js';
import type { Env } from '../types/env';
import type { Order, DiningOption } from '../types';
import type { OrderDetailSnapshot } from '../types/order-detail';
import { resolveTenantOrderPrefix, tenantHasFeature, type TenantContext } from '../types/tenant';
import { resolveOrderKey } from './order-identity';
import { getNextDailyOrderSeq } from './orders';
import { prepareOrderReceipt, pushOrderReceiptInBackground } from './line-order-receipts';
import { buildOrderFlexMessage } from './line/templates/order-receipt';
import { json } from '../utils/http';
import { buildDetailRound, DetailError, DetailView, detailWrites, detailStatement, detailProjection, readDetail } from './order-detail';
import { hasDbColumn, resolveOrderQrChannelAndShiftPolicy, resolveEffectiveOrderDiningOption } from './operating-shifts';

import { deliveryDetailsStatement, parseDeliveryDetails, type DeliveryDetails } from './order-delivery';

type Kind = 'create' | 'append' | 'modify';
const digest = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(JSON.stringify(value))))).map(b => b.toString(16).padStart(2, '0')).join('');

/** Request identity excludes retry/delivery diagnostics, but covers every business field. */
export async function detailRequestHash(kind: Kind, input: any, key: string) {
  return digest({ kind, key, items: input.items, selections: input.orderSelections, note: input.note,
    total: input.appended_total ?? input.new_total ?? input.total, round: input.targetRound,
    revision: input.expectedDetailRevision, customer: input.customer, user: input.userId || input.user_id,
    time: input.time, dining: input.dining_option || input.diningOption, table: input.table_number || input.tableNumber,
    channel: input.channel_id || input.channelId || input.channel_code || input.channelCode,
    shift: input.shift_id || input.shiftId, delivery: kind === 'create' && (input.dining_option || input.diningOption) === 'delivery'
      ? parseDeliveryDetails(input.delivery_details) : undefined });
}

export async function writeDetailedOrder(env: Env, tenant: string, input: any, kind: Kind,
  ctx?: ExecutionContext, tenantCtx?: TenantContext | null): Promise<Response> {
  if (!detailWrites(env)) return json({ code: 'ORDER_DETAILS_NOT_READY', error: '請重新整理 / Vui lòng tải lại trang' }, 503);
  try {
    if (tenantCtx?.storeStatus === 'paused' || tenantCtx?.storeStatus === 'closed') throw new DetailError('STORE_PAUSED');
    if (input.detailVersion !== 1) throw new DetailError('ORDER_CLIENT_UPGRADE_REQUIRED', 409);
    const operation = input.operationId || (kind === 'create' ? input.uuid : undefined);
    if (typeof operation !== 'string' || operation.length < 16 || operation.length > 128) throw new DetailError('INVALID_OPERATION_ID');
    const requestedKey = String(input.parent_order_key || input.order_key || input.key || '');
    const hash = await detailRequestHash(kind, input, requestedKey);
    const replay = async () => {
      const existing = await env.DB.prepare(`SELECT s.order_key,s.revision,s.request_hash,s.snapshot_json,o.order_id,o.display_key
        FROM order_detail_snapshots s JOIN orders o ON o.key=s.order_key AND o.tenant_id=s.tenant_id
        WHERE s.tenant_id=? AND s.operation_id=?`).bind(tenant, operation).first<any>();
      if (!existing) return null;
      if (existing.request_hash !== hash) throw new DetailError('OPERATION_ID_REUSED', 409);
      return json({ success: true, key: existing.order_key, orderId: existing.order_id, displayKey: existing.display_key,
        detailRevision: existing.revision, detailSnapshot: JSON.parse(existing.snapshot_json), idempotent: true });
    };
    const repeated = await replay();
    if (repeated) return repeated;

    let row: any = null;
    let current: Awaited<ReturnType<typeof readDetail>> = null;
    let key: string;
    let orderId: string;
    let displayKey: string;
    let businessDate: string;
    let deliveryDetails: DeliveryDetails | null = null;
    const rawRequestedDining = input.dining_option || input.diningOption;
    let dining: DiningOption = rawRequestedDining === 'dine_in' ? 'dine_in' : 'takeaway';
    const attribution = kind === 'create'
      ? await resolveOrderQrChannelAndShiftPolicy(env.DB, tenant, input)
      : { channelId: null, channelLabel: null, channelDiningPolicy: null, shiftId: null, diningPolicy: 'inherit' as const };
    if (kind === 'create') {
      const resolvedDining = resolveEffectiveOrderDiningOption(rawRequestedDining, attribution, {
        allowDineInFeature: !tenantCtx || tenantHasFeature(tenantCtx, 'dine_in'),
        allowDineInSetting: tenantCtx?.allowDineIn !== false,
        allowDelivery: !!tenantCtx && tenantHasFeature(tenantCtx, 'delivery'),
      });
      if (!resolvedDining.ok) {
        return json({
          error: resolvedDining.error,
          message: resolvedDining.message,
          shiftId: resolvedDining.shiftId,
          diningPolicy: resolvedDining.diningPolicy,
        }, resolvedDining.status);
      }
      dining = resolvedDining.diningOption;
      if (dining === 'delivery') {
        deliveryDetails = parseDeliveryDetails(input.delivery_details);
        if (!deliveryDetails) throw new DetailError('INVALID_DELIVERY_DETAILS');
      }
      const next = await getNextDailyOrderSeq(env, tenant, dining, new Date(), resolveTenantOrderPrefix(tenantCtx, tenant));
      orderId = crypto.randomUUID();
      displayKey = next.key;
      key = await env.DB.prepare('SELECT 1 FROM orders WHERE key=?').bind(displayKey).first() ? orderId : displayKey;
      businessDate = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    } else {
      const found = await resolveOrderKey(env, tenant, requestedKey);
      if (!found) throw new DetailError('ORDER_NOT_FOUND', 404);
      key = found;
      row = await env.DB.prepare('SELECT * FROM orders WHERE tenant_id=? AND key=?').bind(tenant, key).first<any>();
      if (!row) throw new DetailError('ORDER_NOT_FOUND', 404);
      if (row.source === 'staff') throw new DetailError('STAFF_ORDER_RESTRICTED',403);
      if ((kind === 'modify' && row.status !== 'WAITING_CUSTOMER_CHANGE') ||
        (kind === 'append' && ['PICKED_UP','REJECTED','PAID','EXPIRED','FORCE_REJECT'].includes(row.status))) throw new DetailError('ORDER_LOCKED', 409);
      if (!Number.isInteger(input.expectedDetailRevision) || input.expectedDetailRevision !== row.detail_revision)
        throw new DetailError('ORDER_DETAIL_CONFLICT', 409);
      current = await readDetail(env, tenant, key);
      orderId = row.order_id; displayKey = row.display_key; businessDate = row.business_date; dining = row.dining_option;
    }
    const revision = Number(row?.detail_revision || 0) + 1;
    const snapshot: OrderDetailSnapshot = current ? structuredClone(current.snapshot) : { schemaVersion: 1, rounds: [], total: 0 };
    if (row && !current) {
      // Preserve exact source. Do not invent a scope for historical text.
      snapshot.rounds.push({ roundNumber: Number(row.round_count) || 1, createdAt: row.created_at,
        note: '', groups: [], items: [], discount: 0, total: Number(row.total_amount), legacyContent: row.order_content });
      if (kind === 'modify') throw new DetailError('LEGACY_ORDER_REVIEW_REQUIRED', 409);
    }
    const roundNumber = kind === 'modify' ? input.targetRound : Math.max(0, ...snapshot.rounds.map(r => r.roundNumber)) + 1;
    const previous = kind === 'modify' ? snapshot.rounds.find(r => r.roundNumber === roundNumber) : undefined;
    if (kind === 'modify' && (!previous || previous.legacyContent !== undefined)) throw new DetailError('INVALID_TARGET_ROUND');
    const roundInput = kind === 'modify' && !input.time && row?.pickup_time
      ? { ...input, time: row.pickup_time }
      : (kind === 'append' ? { ...input, time: new Date() } : input);
    const priorRounds = snapshot.rounds.filter(r => r !== previous);
    const round = await buildDetailRound(env, tenant, roundInput, roundNumber, previous, tenantCtx?.features, { priorRounds });
    if (previous) snapshot.rounds[snapshot.rounds.indexOf(previous)] = round;
    else snapshot.rounds.push(round);
    snapshot.total = Math.round(snapshot.rounds.reduce((n, r) => n + r.total, 0) * 100) / 100;
    const order: Order = { key, orderId, displayKey, businessDate, uuid: input.uuid || input.order_uuid,
      customer: row?.customer_name || input.customer || input.customer_name || '顧客',
      time: row?.pickup_time || String(input.time || ''), status: 'NEW', createdAt: Date.now(),
      userId: row?.user_id || input.userId || input.user_id,
      total: snapshot.total, content: DetailView.text(snapshot), note: DetailView.notes(snapshot),
      diningOption: dining, tableNumber: dining === 'delivery' ? null : row?.table_number || input.table_number || input.tableNumber || null,
      roundCount: Math.max(...snapshot.rounds.map(r => r.roundNumber)), detailRevision: revision, detailSnapshot: snapshot };
    // Append receipts show only this round, while persisted snapshot contains the whole order.
    const receiptOrder = kind === 'append' ? { ...order, total: round.total,
      detailSnapshot: { schemaVersion: 1 as const, rounds: [round], total: round.total } } : order;
    const receipt = await prepareOrderReceipt(env, tenant, key, order.userId, kind,
      `[${tenantCtx?.brandName || tenant}] ${OrderCode.format(displayKey)}`, buildOrderFlexMessage(receiptOrder, tenantCtx));
    const statements: D1PreparedStatement[] = [];
    let tableId: string | null = null;
    if (order.tableNumber && env.DB) {
      const tblRow = await env.DB.prepare('SELECT id FROM restaurant_tables WHERE tenant_id=? AND label=? AND is_active=1')
        .bind(tenant, order.tableNumber).first<{ id: string }>();
      if (tblRow) tableId = tblRow.id;
    }
    if (kind === 'create') {
      const hasAttrCols = env.DB ? await hasDbColumn(env.DB, 'orders', 'channel_id') : false;
      const attrCols = hasAttrCols ? ',channel_id,channel_label,shift_id' : '';
      const attrPlaceholders = hasAttrCols ? ',?,?,?' : '';
      const attrBindings = hasAttrCols ? [attribution.channelId || null, attribution.channelLabel || null, attribution.shiftId || null] : [];
      statements.push(env.DB.prepare(`INSERT INTO orders
        (key,order_id,display_key,business_date,uuid,tenant_id,user_id,customer_name,pickup_time,status,total_amount,
         order_content,note,dining_option,table_number,table_id${attrCols},round_count,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,'NEW',?,?,?,?,?,?${attrPlaceholders},1,datetime('now'),strftime('%Y-%m-%d %H:%M:%f','now'))`)
        .bind(key, orderId, displayKey, businessDate, order.uuid || operation, tenant, order.userId || null,
          order.customer, order.time, order.total, order.content, order.note || '', dining, order.tableNumber || null, tableId || null, ...attrBindings));
    }
    if (deliveryDetails) statements.push(deliveryDetailsStatement(env.DB, tenant, key, deliveryDetails));
    statements.push(detailStatement(env, tenant, key, revision, operation, hash, snapshot, kind));
    statements.push(env.DB.prepare(`UPDATE orders SET detail_revision=?,order_content=?,note=?,total_amount=?,status='NEW',
      round_count=?,last_appended_at=CASE WHEN ?='append' THEN strftime('%Y-%m-%d %H:%M:%f','now') ELSE last_appended_at END,
      is_modified=CASE WHEN ?='modify' THEN 1 ELSE is_modified END,
      reason=CASE WHEN ?='modify' THEN '' ELSE reason END,updated_at=strftime('%Y-%m-%d %H:%M:%f','now')
      WHERE tenant_id=? AND key=?`).bind(revision, order.content, order.note || '', order.total,
        order.roundCount, kind, kind, kind, tenant, key));
    statements.push(...detailProjection(env, tenant, key, snapshot));
    if (kind === 'modify') statements.push(env.DB.prepare('DELETE FROM pending_actions WHERE tenant_id=? AND order_key=?').bind(tenant, key));
    if (receipt) statements.push(receipt.statement);
    try { await env.DB.batch(statements); }
    catch (error) {
      const retried = await replay();
      if (retried) return retried;
      if (String(error).includes('ORDER_DETAIL_CONFLICT') || String(error).includes('ORDER_LOCKED')) throw new DetailError('ORDER_DETAIL_CONFLICT', 409);
      throw error;
    }
    if (input.is_desktop || input.isDesktop || input.line_delivery_mode === 'push')
      await pushOrderReceiptInBackground(env, receipt?.notification.id, ctx, tenantCtx);
    return json({ success: true, key, orderId, displayKey, detailSnapshot: snapshot, detailRevision: revision,
      total: order.total, deltaAmount: order.total - Number(row?.total_amount || 0), notification: receipt?.notification });
  } catch (error) {
    const validationCodes = /^(OPTION_|PRODUCT_UNAVAILABLE|MIN_ORDER_SUBTOTAL_NOT_MET|PREREQUISITE_)/;
    if (error instanceof Error && !(error instanceof DetailError) && validationCodes.test(error.message)) error = new DetailError(error.message);
    if (String(error).includes('TENANT_DELETED')) error = new DetailError('TENANT_DELETED', 410);
    const code = error instanceof DetailError ? error.code : 'ORDER_DETAIL_WRITE_FAILED';
    const extraDetails = error instanceof DetailError && error.details ? error.details : {};
    console.warn('[OrderDetail]', { tenantId: tenant, kind, code });
    return json({ code, error: (extraDetails.message as string) || code, ...extraDetails }, error instanceof DetailError ? error.status : 500);
  }
}
