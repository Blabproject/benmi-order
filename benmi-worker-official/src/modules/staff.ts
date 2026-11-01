import { Env } from '../types/env';
import { json } from '../utils/http';
import { getTenantId } from './menu';
import { resolveTenantContext } from './tenant';
import { TenantContext, resolveTenantOrderPrefix } from '../types/tenant';
import { getStoredPassword } from './auth';
import { getNextDailyOrderSeq } from './orders';
import { resolveOrderKey } from './order-identity';
import { staffAccess, type StaffCapability } from './staff-access';
import { buildDetailRound, DetailError, DetailView, detailStatement, detailProjection, readDetail } from './order-detail';
import type { OrderDetailSnapshot } from '../types/order-detail';

// ==========================================
// 1. HELPERS & CRYPTO UTILITIES
// ==========================================

export async function sha256Hex(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateBearerToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Directly queries D1 to verify if staff_ordering_enabled is turned on for this tenant.
 * Zero reliance on KV eventual consistency.
 */
export async function checkStaffOrderingEnabled(env: Env, tenantId: string): Promise<boolean> {
  if (!env.DB) return false;
  try {
    return (await staffAccess(env, tenantId)).enabled;
  } catch (err) {
    console.warn(`[Staff] Failed to read staff_ordering_enabled for ${tenantId}:`, err);
    return false;
  }
}

/**
 * Verifies Bearer token in Authorization header against staff_sessions table.
 */
export async function verifyStaffSession(
  request: Request,
  env: Env,
  tenantId: string
): Promise<{ tokenHash: string; tenantId: string } | null> {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const rawToken = authHeader.substring(7).trim();
  if (!rawToken || rawToken.length < 16) return null;

  const tokenHash = await sha256Hex(rawToken);

  if (!env.DB) return null;
  try {
    const session = await env.DB.prepare(
      `SELECT token_hash, tenant_id, pin_hash FROM staff_sessions
       WHERE token_hash = ? AND tenant_id = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')`
    ).bind(tokenHash, tenantId).first<{ token_hash: string; tenant_id: string; pin_hash: string }>();

    if (!session || session.pin_hash !== await sha256Hex(await getStoredPassword(env, tenantId, await resolveTenantContext(tenantId, env)))) return null;
    return { tokenHash: session.token_hash, tenantId: session.tenant_id };
  } catch (err) {
    console.warn(`[Staff] Session verification error for ${tenantId}:`, err);
    return null;
  }
}

// ==========================================
// 3. MAIN STAFF ROUTE DISPATCHER
// ==========================================

async function dispatchStaffRoute(
  request: Request,
  env: Env,
  path: string,
  tenantCtx?: TenantContext | null
): Promise<Response> {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenant_id") || url.searchParams.get("tenant") || request.headers.get("X-Tenant-Id");
  if (!tenantId) return json({error:"TENANT_REQUIRED"},400);

  if (!tenantCtx || tenantCtx.tenantId !== tenantId) {
    tenantCtx = await resolveTenantContext(tenantId, env);
  }
  if (!tenantCtx) {
    return json({ ok: false, error: "invalid_tenant", message: `門市代碼 '${tenantId}' 不存在` }, 404);
  }

  const access = await staffAccess(env, tenantId);
  const denied = () => json({ ok: false, error: 'FEATURE_DISABLED' }, 403, { 'Cache-Control': 'no-store' });

  // --- 1. GET /api/staff/capabilities ---
  if (request.method === "GET" && path === "/api/staff/capabilities") {
    const isStaffEnabled = await checkStaffOrderingEnabled(env, tenantId);
    return json({
      ok: true,
      tenantId,
      brandName: tenantCtx.brandName,
      staff_ordering_enabled: isStaffEnabled,
      capabilities: access.capabilities,
      allowDineIn: tenantCtx.allowDineIn ?? true,
      storeStatus: tenantCtx.storeStatus || 'open'
    });
  }

  // --- 2. POST /api/staff/session (Login via POS PIN) ---
  if (request.method === "POST" && path === "/api/staff/session") {
    const isStaffEnabled = await checkStaffOrderingEnabled(env, tenantId);
    if (!access.capabilities.session) {
      return json({ ok: false, error: "FEATURE_DISABLED", message: "門市尚未啟用桌邊點餐功能 / Quán chưa kích hoạt tính năng nhận đơn tại bàn" }, 403);
    }

    const body: any = await request.json().catch(() => ({}));
    const password = body.password || body.pin;
    if (!password) {
      return json({ ok: false, error: "MISSING_PIN", message: "請提供管理 PIN 碼 / Vui lòng nhập mã PIN" }, 400);
    }

    const storedPassword = await getStoredPassword(env, tenantId, tenantCtx);
    if (typeof password !== "string" || await sha256Hex(password) !== await sha256Hex(storedPassword)) {
      return json({ ok: false, error: "INVALID_PIN", message: "管理 PIN 碼錯誤 / Mã PIN không chính xác" }, 401);
    }

    const token = generateBearerToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 12 * 3600000).toISOString();

    if (!env.DB) return json({ ok: false, error: "NO_DB" }, 500);

    await env.DB.prepare(
      `INSERT INTO staff_sessions (token_hash, tenant_id, pin_hash, expires_at, created_at)
       VALUES (?, ?, ?, datetime(?, 'utc'), datetime('now'))`
    ).bind(tokenHash, tenantId, await sha256Hex(storedPassword), expiresAt).run();

    return json({
      ok: true,
      token,
      expires_at: expiresAt,
      tenant_id: tenantId,
      brand_name: tenantCtx.brandName
    });
  }

  // --- 3. DELETE /api/staff/session (Logout & Revoke Token) ---
  if (request.method === "DELETE" && path === "/api/staff/session") {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const rawToken = authHeader.substring(7).trim();
      const tokenHash = await sha256Hex(rawToken);
      if (env.DB) {
        await env.DB.prepare(
          "UPDATE staff_sessions SET revoked_at = datetime('now') WHERE token_hash = ? AND tenant_id = ?"
        ).bind(tokenHash, tenantId).run();
      }
    }
    return json({ ok: true, message: "登出成功 / Đã đăng xuất" });
  }

  // --- GUARD: All subsequent business routes require session authentication & feature flag ---
  const session = await verifyStaffSession(request, env, tenantId);
  if (!session) {
    return json({ ok: false, error: "UNAUTHORIZED", message: "登入權限已過期，請重新輸入 PIN 碼 / Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại" }, 401);
  }

  const isStaffEnabled = await checkStaffOrderingEnabled(env, tenantId);
  if (!isStaffEnabled) {
    return json({ ok: false, error: "FEATURE_DISABLED", message: "門市尚未啟用桌邊點餐功能 / Quán chưa kích hoạt tính năng nhận đơn tại bàn" }, 403);
  }

  const required: StaffCapability = path === '/api/staff/tables'
    ? (request.method === 'GET' ? 'tables_read' : 'tables_write')
    : path.startsWith('/api/staff/tables/') ? 'tables_write'
    : path.endsWith('/status') ? 'status'
    : path.endsWith('/rounds') ? 'append'
    : path === '/api/staff/orders' ? 'create' : 'orders_read';
  if (!access.capabilities[required]) return denied();

  // --- 4. GET /api/staff/tables (List tables with active order info) ---
  if (request.method === "GET" && path === "/api/staff/tables") {
    const includeInactive = url.searchParams.get("include_inactive") === "1" || url.searchParams.get("all") === "1";
    if (!env.DB) return json({ ok: false, error: "NO_DB" }, 500);

    const query = `
      SELECT t.id, t.tenant_id, t.label, t.sort_order, t.is_active, t.created_at, t.updated_at,
             o.key AS active_order_key, o.order_id AS active_order_id,
             o.display_key AS active_display_key, o.status AS active_order_status,
             o.total_amount AS active_total_amount, o.round_count AS active_round_count,
             o.revision AS active_revision, o.detail_revision AS active_detail_revision, o.customer_name AS active_customer_name,
             o.created_at AS active_created_at, o.last_appended_at AS active_last_appended_at
      FROM restaurant_tables t
      LEFT JOIN orders o ON o.table_id = t.id AND o.tenant_id=t.tenant_id AND o.source = 'staff' AND o.status NOT IN ('PAID', 'REJECTED', 'PICKED_UP', 'EXPIRED', 'FORCE_REJECT')
      WHERE t.tenant_id = ? ${includeInactive ? '' : 'AND t.is_active = 1'}
      ORDER BY t.sort_order ASC, t.label ASC
    `;
    const { results } = await env.DB.prepare(query).bind(tenantId).all();
    return json({ ok: true, tables: results || [] });
  }

  // --- 5. POST /api/staff/tables (Add table) ---
  if (request.method === "POST" && path === "/api/staff/tables") {
    const body: any = await request.json().catch(() => ({}));
    const label = String(body.label || "").trim();
    const sortOrder = parseInt(String(body.sort_order ?? body.sortOrder ?? 0), 10) || 0;

    if (!label || label.length > 100) {
      return json({ ok: false, error: "INVALID_LABEL", message: "請輸入桌號名稱 / Vui lòng nhập tên bàn" }, 400);
    }

    const tableId = crypto.randomUUID();
    if (!env.DB) return json({ ok: false, error: "NO_DB" }, 500);

    try {
      await env.DB.prepare(
        `INSERT INTO restaurant_tables (id, tenant_id, label, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
      ).bind(tableId, tenantId, label, sortOrder).run();

      return json({
        ok: true,
        table: { id: tableId, tenant_id: tenantId, label, sort_order: sortOrder, is_active: 1 }
      }, 201);
    } catch (err: any) {
      if (String(err).includes("TABLE_HAS_ACTIVE_ORDER")) return json({error:"TABLE_HAS_ACTIVE_ORDER"},409);
      if (String(err).includes("UNIQUE constraint failed")) {
        return json({ ok: false, error: "DUPLICATE_LABEL", message: `桌號【${label}】已存在 / Bàn ${label} đã tồn tại` }, 409);
      }
      throw err;
    }
  }

  // --- 6. PATCH /api/staff/tables/:id (Update table label, sort, or active state) ---
  const tablePatchMatch = path.match(/^\/api\/staff\/tables\/([a-zA-Z0-9_-]+)$/);
  if (request.method === "PATCH" && tablePatchMatch) {
    const tableId = tablePatchMatch[1];
    const body: any = await request.json().catch(() => ({}));
    if (!env.DB) return json({ ok: false, error: "NO_DB" }, 500);

    const table = await env.DB.prepare(
      "SELECT * FROM restaurant_tables WHERE id = ? AND tenant_id = ?"
    ).bind(tableId, tenantId).first<any>();

    if (!table) {
      return json({ ok: false, error: "TABLE_NOT_FOUND", message: "找不到該桌號 / Không tìm thấy bàn" }, 404);
    }

    const newLabel = body.label !== undefined ? String(body.label).trim() : table.label;
    const newSort = body.sort_order !== undefined ? parseInt(String(body.sort_order), 10) : (body.sortOrder !== undefined ? parseInt(String(body.sortOrder), 10) : table.sort_order);
    const newActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : (body.isActive !== undefined ? (body.isActive ? 1 : 0) : table.is_active);

    if (!newLabel || newLabel.length > 100 || !Number.isInteger(newSort)) return json({error:'INVALID_TABLE'},400);
    // Guard: Cannot rename or deactivate a table that has an active un-finalized staff order!
    if ((newLabel !== table.label || newActive === 0) && newActive !== table.is_active || (newLabel !== table.label)) {
      const activeOrder = await env.DB.prepare(
        `SELECT key FROM orders
         WHERE tenant_id = ? AND table_id = ? AND source = 'staff' AND status NOT IN ('PAID', 'REJECTED', 'PICKED_UP', 'EXPIRED', 'FORCE_REJECT')
         LIMIT 1`
      ).bind(tenantId, tableId).first();

      if (activeOrder) {
        return json({
          ok: false,
          error: "TABLE_HAS_ACTIVE_ORDER",
          message: "該桌尚有未結帳訂單，無法修改名稱或停用 / Bàn đang có đơn chưa thanh toán, không thể đổi tên hoặc ngừng sử dụng"
        }, 400);
      }
    }

    try {
      await env.DB.prepare(
        `UPDATE restaurant_tables SET
           label = ?,
           sort_order = ?,
           is_active = ?,
           updated_at = datetime('now')
         WHERE id = ? AND tenant_id = ?`
      ).bind(newLabel, newSort, newActive, tableId, tenantId).run();

      return json({
        ok: true,
        table: { id: tableId, tenant_id: tenantId, label: newLabel, sort_order: newSort, is_active: newActive }
      });
    } catch (err: any) {
      if (String(err).includes("TABLE_HAS_ACTIVE_ORDER")) return json({error:"TABLE_HAS_ACTIVE_ORDER"},409);
      if (String(err).includes("UNIQUE constraint failed")) {
        return json({ ok: false, error: "DUPLICATE_LABEL", message: `桌號【${newLabel}】已存在 / Bàn ${newLabel} đã tồn tại` }, 409);
      }
      throw err;
    }
  }

  // --- 7. GET /api/staff/orders/:key (Read staff order details) ---
  const orderGetMatch = path.match(/^\/api\/staff\/orders\/([a-zA-Z0-9_-]+)$/);
  if (request.method === "GET" && orderGetMatch) {
    const rawKey = orderGetMatch[1];
    if (!env.DB) return json({ ok: false, error: "NO_DB" }, 500);

    const resolvedKey = await resolveOrderKey(env, tenantId, rawKey) || rawKey;
    const order = await env.DB.prepare(
      `SELECT * FROM orders
       WHERE tenant_id = ? AND (key = ? OR order_id = ? OR display_key = ?) AND source = 'staff'`
    ).bind(tenantId, resolvedKey, rawKey, rawKey).first<any>();

    if (!order) {
      return json({ ok: false, error: "ORDER_NOT_FOUND", message: "找不到該訂單 / Không tìm thấy đơn hàng" }, 404);
    }

    const { results: items } = await env.DB.prepare(
      `SELECT * FROM order_items
       WHERE tenant_id = ? AND order_key = ?
       ORDER BY round_number ASC, id ASC`
    ).bind(tenantId, order.key).all();

    const detail = await readDetail(env, tenantId, order.key);
    return json({ ok: true, order, items: items || [], detailSnapshot: detail?.snapshot });
  }

  return handleStaffOrderWrite(request, env, path, tenantId, tenantCtx);
}

const FINAL = ['PAID','REJECTED','PICKED_UP','EXPIRED','FORCE_REJECT'];
async function handleStaffOrderWrite(request: Request, env: Env, path: string, tenant: string, tenantCtx: TenantContext) {
  const match = path.match(/^\/api\/staff\/orders\/([^/]+)\/(rounds|status)$/);
  const create = request.method === 'POST' && path === '/api/staff/orders';
  const append = request.method === 'POST' && match?.[2] === 'rounds';
  const status = request.method === 'PATCH' && match?.[2] === 'status';
  if (!create && !append && !status) return json({error:'NOT_FOUND'},404);
  try {
    const body: any = await request.json().catch(()=>{throw new DetailError("INVALID_JSON");});
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new DetailError("INVALID_JSON");
    let row: any = null;
    if (!create) {
      const key = await resolveOrderKey(env, tenant, decodeURIComponent(match![1]));
      row = await env.DB.prepare("SELECT * FROM orders WHERE tenant_id=? AND key=? AND source='staff'").bind(tenant,key).first<any>();
      if (!row) throw new DetailError('ORDER_NOT_FOUND',404);
    }
    const expected = body.expectedRevision;
    if (!create && (!Number.isInteger(expected) || expected < 0)) throw new DetailError('INVALID_REVISION');
    if (status) {
      const transitions: Record<string,string[]> = { ACCEPTED:['DONE','PAID','PICKED_UP','REJECTED','FORCE_REJECT'], DONE:['PAID','PICKED_UP','REJECTED','FORCE_REJECT'], NEW:['ACCEPTED','REJECTED','FORCE_REJECT'] };
      if (!transitions[row.status]?.includes(body.status)) throw new DetailError('INVALID_STATUS_TRANSITION',409);
      const result = await env.DB.prepare(`UPDATE orders SET status=?,revision=revision+1,
        updated_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE tenant_id=? AND key=? AND source='staff' AND revision=? AND status=?`)
        .bind(body.status,tenant,row.key,expected,row.status).run();
      if (!result.meta.changes) throw new DetailError('REVISION_CONFLICT',409);
      return json({ok:true,success:true,key:row.key,status:body.status,revision:expected+1});
    }
    if (tenantCtx.storeStatus === 'paused') throw new DetailError('STORE_PAUSED');
    const diningOption: 'dine_in' | 'takeaway' = row ? (row.dining_option || 'dine_in') : (body.diningOption === 'takeaway' || body.dining_option === 'takeaway' ? 'takeaway' : 'dine_in');
    if (diningOption === 'dine_in' && !tenantCtx.allowDineIn) throw new DetailError('DINE_IN_DISABLED',403);
    const requestId = body.requestId;
    if (typeof requestId !== 'string' || requestId.length < 16 || requestId.length > 128) throw new DetailError('INVALID_REQUEST_ID');
    const hash = await sha256Hex(JSON.stringify({kind:create?'create':'append',diningOption,table:body.tableId,key:row?.key,
      revision:expected,items:body.items,orderSelections:body.orderSelections,note:body.note,customer:body.customer,total:body.total}));
    const replay = async () => {
      const prior = await env.DB.prepare('SELECT request_hash,response_json FROM staff_order_requests WHERE tenant_id=? AND request_id=?')
        .bind(tenant,requestId).first<{request_hash:string;response_json:string}>();
      if (!prior) return null;
      if (prior.request_hash !== hash) throw new DetailError('REQUEST_COLLISION',409);
      return json({...JSON.parse(prior.response_json),idempotent:true});
    };
    const repeated = await replay(); if (repeated) return repeated;
    if (row && FINAL.includes(row.status)) throw new DetailError('ORDER_FINALIZED',409);
    if (row && row.revision !== expected) throw new DetailError('REVISION_CONFLICT',409);
    let table: any = null;
    if (create && diningOption === 'dine_in') {
      table = await env.DB.prepare('SELECT id,label FROM restaurant_tables WHERE tenant_id=? AND id=? AND is_active=1').bind(tenant,body.tableId || '').first();
      if (!table) throw new DetailError('TABLE_NOT_AVAILABLE',404);
      if (await env.DB.prepare(`SELECT 1 FROM orders WHERE tenant_id=? AND table_id=? AND source='staff'
        AND status NOT IN ('PAID','REJECTED','PICKED_UP','EXPIRED','FORCE_REJECT')`).bind(tenant,table.id).first()) throw new DetailError('TABLE_OCCUPIED',409);
    }
    const current = row ? await readDetail(env,tenant,row.key) : null;
    const snapshot: OrderDetailSnapshot = current ? structuredClone(current.snapshot) : {schemaVersion:1,rounds:[],total:0};
    if (row && !current) snapshot.rounds.push({roundNumber:Number(row.round_count)||1,createdAt:row.created_at,
      note:'',groups:[],items:[],discount:0,total:row.total_amount,legacyContent:row.order_content});
    const roundNumber = Math.max(0,...snapshot.rounds.map(r=>r.roundNumber))+1;
    const round = await buildDetailRound(env,tenant,body,roundNumber);
    snapshot.rounds.push(round);
    snapshot.total = Math.round(snapshot.rounds.reduce((sum,r)=>sum+r.total,0)*100)/100;
    const detailRevision = Number(row?.detail_revision || 0)+1;
    const revision = Number(row?.revision || 0)+1;
    let key = row?.key, orderId = row?.order_id, displayKey = row?.display_key;
    if (create) {
      const next = await getNextDailyOrderSeq(env,tenant,diningOption,new Date(),resolveTenantOrderPrefix(tenantCtx,tenant));
      orderId = crypto.randomUUID(); displayKey = next.key;
      key = await env.DB.prepare('SELECT 1 FROM orders WHERE key=?').bind(displayKey).first() ? orderId : displayKey;
    }
    const customerDisplayName = String(body.customer || (diningOption === 'dine_in' ? (table?.label || '') : '外帶顧客')).slice(0,100);
    const pickupTimeStr = (body.pickupTime || body.pickup_time || (new Date(Date.now()+8*3600000).toISOString().slice(11,16))).trim();
    const response = {ok:true,success:true,key,orderId,displayKey,status:'ACCEPTED',diningOption,roundCount:roundNumber,revision,detailRevision,
      total:snapshot.total,tableId:table?.id || row?.table_id || null,tableNumber:table?.label || row?.table_number || '',
      detailSnapshot:snapshot,appendedTotal:round.total};
    const statements: D1PreparedStatement[] = [];
    if (create) statements.push(env.DB.prepare(`INSERT INTO orders
      (key,order_id,display_key,business_date,tenant_id,customer_name,pickup_time,status,total_amount,order_content,note,
       dining_option,table_number,table_id,source,revision,round_count,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'ACCEPTED',0,'','',?,?,?,'staff',0,0,datetime('now'),datetime('now'))`)
      .bind(key,orderId,displayKey,new Date(Date.now()+8*3600000).toISOString().slice(0,10),tenant,
        customerDisplayName,pickupTimeStr,diningOption,diningOption === 'dine_in' ? table.label : '',diningOption === 'dine_in' ? table.id : null));
    statements.push(detailStatement(env,tenant,key,detailRevision,requestId,hash,snapshot,create?'create':'append'));
    statements.push(env.DB.prepare(`UPDATE orders SET revision=CASE WHEN revision=? AND status NOT IN
      ('PAID','REJECTED','PICKED_UP','EXPIRED','FORCE_REJECT') THEN revision+1 ELSE -1 END,
      detail_revision=?,total_amount=?,order_content=?,note=?,round_count=?,status='ACCEPTED',
      last_appended_at=CASE WHEN ? THEN strftime('%Y-%m-%d %H:%M:%f','now') ELSE last_appended_at END,
      updated_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE tenant_id=? AND key=? AND source='staff'`)
      .bind(create?0:expected,detailRevision,snapshot.total,DetailView.text(snapshot),DetailView.notes(snapshot),roundNumber,append?1:0,tenant,key));
    statements.push(...detailProjection(env,tenant,key,snapshot));
    statements.push(env.DB.prepare(`INSERT INTO staff_order_requests
      (tenant_id,request_id,request_hash,order_key,round_number,response_json) VALUES (?,?,?,?,?,?)`)
      .bind(tenant,requestId,hash,key,roundNumber,JSON.stringify(response)));
    try { await env.DB.batch(statements); }
    catch (error) {
      const retried = await replay(); if (retried) return retried;
      const message = String(error);

      if (/STAFF_REVISION_CONFLICT|ORDER_DETAIL_CONFLICT|ORDER_LOCKED/.test(message)) throw new DetailError('REVISION_CONFLICT',409);
      if (/UNIQUE constraint failed/.test(message)) throw new DetailError('TABLE_OCCUPIED',409);
      if (/TABLE_NOT_AVAILABLE/.test(message)) throw new DetailError('TABLE_NOT_AVAILABLE',409);
      throw error;
    }
    return json(response,create?201:200);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'STAFF_WRITE_FAILED';
    const validation = /^(OPTION_|PRODUCT_|INVALID_|ORDER_PRICE_|MIN_ORDER_|EMPTY_|DUPLICATE_|PORTION_|ORDER_SELECTIONS_|ORDER_CLIENT_)/.test(code);
    if (!(error instanceof DetailError) && !validation) console.error('[StaffWrite]',{tenant,code:'STAFF_WRITE_FAILED'});
    return json({ok:false,error:error instanceof DetailError || validation ? code : 'STAFF_WRITE_FAILED'},
      error instanceof DetailError ? error.status : validation?400:500);
  }
}

/** Staff responses, especially session tokens, must never be cached by a proxy. */
export async function handleStaffRoute(request: Request, env: Env, path: string, tenantCtx?: TenantContext | null): Promise<Response> {
  const response = await dispatchStaffRoute(request,env,path,tenantCtx);
  response.headers.set('Cache-Control','no-store');
  return response;
}
