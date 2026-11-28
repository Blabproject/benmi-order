import { Env } from '../types/env';
import { TenantContext, tenantHasFeature } from '../types/tenant';
import { json } from '../utils/http';
import { tenantIsDeleted } from '../utils/tenant-lifecycle';
import { getStoredPassword } from './auth';
import { generateBearerToken, sha256Hex, verifyStaffSession } from './staff';
import { resolveTenantContext } from './tenant';

const POS_SESSION_TTL_MS = 24 * 3600 * 1000;
const POS_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const POS_LOGIN_MAX_FAILURES = 10;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

const PROTECTED_POS_ROUTES: ReadonlySet<string> = new Set([
  'GET /api/orders',
  'GET /api/orders/delivery-details',
  'GET /api/orders/history-summary',
  'GET /api/orders/by-date',
  'GET /api/orders/history-all',
  'GET /api/reports/items-analytics',
  'POST /api/orders/auto-accept',
  'POST /api/update',
  'POST /api/config',
  'POST /api/menu/product',
  'POST /api/menu/option-group',
  'GET /api/menu/modifier-library',
  'POST /api/menu/ai-translate',
  'POST /api/menu',
  'PUT /api/menu/shifts',
  'POST /api/menu/qr-channels',
  'PUT /api/menu/qr-channels',
  'DELETE /api/menu/qr-channels',
  'PATCH /api/menu/schedule',
  'POST /api/menu/stock-status',
  'POST /api/menu/bundle-rules',
  'POST /api/menu/bundles',
  'POST /api/image',
  'DELETE /api/image',
  'POST /api/auth/change',
  'POST /api/auth/templink',
]);

/** Returns true when a Worker route exposes store POS operations/data. */
export function isProtectedPosRoute(method: string, path: string): boolean {
  return PROTECTED_POS_ROUTES.has(`${method.toUpperCase()} ${path}`);
}

/** Enforces a verified store PIN session only when `pos_web_login` is enabled for the tenant. */
export async function requirePosSessionIfEnabled(
  request: Request,
  env: Env,
  tenantCtx?: TenantContext | null
): Promise<Response | null> {
  if (!tenantCtx || !tenantHasFeature(tenantCtx, 'pos_web_login')) {
    return null;
  }

  const session = await verifyStaffSession(request, env, tenantCtx.tenantId);
  if (!session) {
    return json(
      {
        ok: false,
        error: 'POS_AUTH_REQUIRED',
        message: '請先輸入門市管理 PIN 碼登入 / Vui lòng nhập mã PIN quản lý để đăng nhập POS',
      },
      401,
      NO_STORE_HEADERS
    );
  }
  return null;
}

function getRateLimitScope(request: Request, tenantId: string): { scope: string; windowKey: number } {
  const forwarded = request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim();
  const ip = request.headers.get('CF-Connecting-IP') || forwarded || 'unknown';
  return {
    scope: `pos_login:${tenantId}:${ip}`,
    windowKey: Math.floor(Date.now() / POS_LOGIN_WINDOW_MS),
  };
}

async function isRateLimited(env: Env, scope: string, windowKey: number): Promise<boolean> {
  if (!env.DB) return false;
  try {
    const row = await env.DB.prepare(
      'SELECT window, count FROM payment_rate_limits WHERE scope = ?'
    ).bind(scope).first<{ window: number; count: number }>();
    return Boolean(row && Number(row.window) === windowKey && Number(row.count) >= POS_LOGIN_MAX_FAILURES);
  } catch (err) {
    if (String(err).includes('no such table')) return false;
    throw err;
  }
}

async function recordFailedLoginAttempt(env: Env, scope: string, windowKey: number): Promise<void> {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO payment_rate_limits(scope, window, count) VALUES (?, ?, 1)
       ON CONFLICT(scope) DO UPDATE SET
         count = CASE WHEN window = excluded.window THEN count + 1 ELSE 1 END,
         window = excluded.window`
    ).bind(scope, windowKey).run();
  } catch (err) {
    if (!String(err).includes('no such table')) throw err;
  }
}

async function clearFailedLoginAttempts(env: Env, scope: string): Promise<void> {
  if (!env.DB) return;
  try {
    await env.DB.prepare('DELETE FROM payment_rate_limits WHERE scope = ?').bind(scope).run();
  } catch (err) {
    if (!String(err).includes('no such table')) throw err;
  }
}

/** Handles GET (session check), POST (PIN login), and DELETE (logout) for `/api/pos/session`. */
export async function handlePosSessionRoute(
  request: Request,
  env: Env,
  path: string,
  tenantCtx?: TenantContext | null
): Promise<Response> {
  if (path !== '/api/pos/session') {
    return json({ ok: false, error: 'NOT_FOUND' }, 404, NO_STORE_HEADERS);
  }

  const url = new URL(request.url);
  const explicitQueryTenant = (
    url.searchParams.get('tenant_id')
    || url.searchParams.get('tenant')
    || request.headers.get('X-Tenant-ID')
    || ''
  ).trim();

  if (request.method === 'GET') {
    const targetTenantId = explicitQueryTenant || tenantCtx?.tenantId || '';
    if (!targetTenantId) {
      return json({ ok: false, error: 'TENANT_REQUIRED' }, 400, NO_STORE_HEADERS);
    }
    const resolvedCtx = (tenantCtx && tenantCtx.tenantId === targetTenantId)
      ? tenantCtx
      : await resolveTenantContext(targetTenantId, env);
    if (!resolvedCtx) {
      return json({ ok: false, error: 'INVALID_TENANT' }, 404, NO_STORE_HEADERS);
    }

    const session = await verifyStaffSession(request, env, resolvedCtx.tenantId);
    return json(
      {
        ok: true,
        authenticated: Boolean(session),
        posWebLoginRequired: tenantHasFeature(resolvedCtx, 'pos_web_login'),
        tenant_id: resolvedCtx.tenantId,
        brand_name: resolvedCtx.brandName,
      },
      200,
      NO_STORE_HEADERS
    );
  }

  if (request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as {
      pin?: unknown;
      password?: unknown;
      tenant_id?: unknown;
      tenantId?: unknown;
    };

    const bodyTenantId = typeof body.tenant_id === 'string'
      ? body.tenant_id.trim()
      : (typeof body.tenantId === 'string' ? body.tenantId.trim() : '');
    const targetTenantId = explicitQueryTenant || bodyTenantId || tenantCtx?.tenantId || '';
    if (!targetTenantId) {
      return json({ ok: false, error: 'TENANT_REQUIRED' }, 400, NO_STORE_HEADERS);
    }
    if (env.DB && await tenantIsDeleted(env.DB, targetTenantId)) {
      return json({ ok: false, error: 'TENANT_DELETED' }, 410, NO_STORE_HEADERS);
    }

    const resolvedCtx = (tenantCtx && tenantCtx.tenantId === targetTenantId)
      ? tenantCtx
      : await resolveTenantContext(targetTenantId, env);
    if (!resolvedCtx) {
      return json(
        { ok: false, error: 'INVALID_TENANT', message: `門市代碼 '${targetTenantId}' 不存在` },
        404,
        NO_STORE_HEADERS
      );
    }

    const rawPin = typeof body.pin === 'string' ? body.pin : body.password;
    const pin = typeof rawPin === 'string' ? rawPin.trim() : '';
    if (!pin) {
      return json(
        { ok: false, error: 'MISSING_PIN', message: '請輸入管理 PIN 碼 / Vui lòng nhập mã PIN quản lý' },
        400,
        NO_STORE_HEADERS
      );
    }

    const { scope, windowKey } = getRateLimitScope(request, resolvedCtx.tenantId);
    if (await isRateLimited(env, scope, windowKey)) {
      return json(
        {
          ok: false,
          error: 'POS_LOGIN_RATE_LIMIT',
          message: 'PIN 碼錯誤次數過多，請稍後再試 / Nhập sai mã PIN quá nhiều lần, vui lòng thử lại sau',
        },
        429,
        NO_STORE_HEADERS
      );
    }

    const storedPassword = await getStoredPassword(env, resolvedCtx.tenantId, resolvedCtx);
    const [inputHash, storedHash] = await Promise.all([sha256Hex(pin), sha256Hex(storedPassword)]);
    if (inputHash !== storedHash) {
      await recordFailedLoginAttempt(env, scope, windowKey);
      return json(
        { ok: false, error: 'INVALID_PIN', message: '管理 PIN 碼錯誤 / Mã PIN quản lý không chính xác' },
        401,
        NO_STORE_HEADERS
      );
    }

    if (!env.DB) {
      return json({ ok: false, error: 'NO_DB' }, 500, NO_STORE_HEADERS);
    }

    await clearFailedLoginAttempts(env, scope);

    const token = generateBearerToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + POS_SESSION_TTL_MS).toISOString();

    await env.DB.prepare(
      `INSERT INTO staff_sessions (token_hash, tenant_id, pin_hash, expires_at, created_at)
       VALUES (?, ?, ?, datetime(?, 'utc'), datetime('now'))`
    ).bind(tokenHash, resolvedCtx.tenantId, storedHash, expiresAt).run();

    return json(
      {
        ok: true,
        token,
        expires_at: expiresAt,
        tenant_id: resolvedCtx.tenantId,
        brand_name: resolvedCtx.brandName,
      },
      200,
      NO_STORE_HEADERS
    );
  }

  if (request.method === 'DELETE') {
    const targetTenantId = explicitQueryTenant || tenantCtx?.tenantId || '';
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    if (env.DB && targetTenantId && authHeader && authHeader.startsWith('Bearer ')) {
      const rawToken = authHeader.substring(7).trim();
      if (rawToken.length >= 16) {
        const tokenHash = await sha256Hex(rawToken);
        await env.DB.prepare(
          "UPDATE staff_sessions SET revoked_at = datetime('now') WHERE token_hash = ? AND tenant_id = ?"
        ).bind(tokenHash, targetTenantId).run();
      }
    }
    return json({ ok: true, message: '登出成功 / Đã đăng xuất' }, 200, NO_STORE_HEADERS);
  }

  return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, NO_STORE_HEADERS);
}
