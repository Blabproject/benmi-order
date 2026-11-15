import type { Env } from '../types/env';
import type { TenantContext } from '../types/tenant';
import { getStoredPassword } from './auth';
import { generateBearerToken, sha256Hex, verifyStaffSession } from './staff';
import { tenantIsDeleted } from '../utils/tenant-lifecycle';
import { json } from '../utils/http';
const reply = (body: unknown, status = 200) => json(body, status, { 'Cache-Control': 'no-store' });
/** POS authority is independent of the optional staff-ordering feature. */
export async function handlePosSession(request: Request, env: Env, tenant: TenantContext | null): Promise<Response> {
  if (!tenant || await tenantIsDeleted(env.DB,tenant.tenantId)) return reply({code:'TENANT_UNAVAILABLE'},404);
  if (request.method === 'GET' || request.method === 'DELETE') {
    const session = await verifyStaffSession(request,env,tenant.tenantId);
    if (!session) return reply({code:'UNAUTHORIZED'},401);
    if (request.method === 'DELETE') await env.DB.prepare("UPDATE staff_sessions SET revoked_at=datetime('now') WHERE tenant_id=? AND token_hash=?")
      .bind(tenant.tenantId,session.tokenHash).run();
    return reply({ok:true,tenantId:tenant.tenantId});
  }
  if (request.method !== 'POST') return reply({code:'METHOD_NOT_ALLOWED'},405);
  const ready = await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pos_session_attempts'").first();
  if (!ready) return reply({code:'POS_SESSION_NOT_READY'},503);
  const body: unknown = await request.json().catch(()=>null);
  const password = body && typeof body==='object' && !Array.isArray(body) && 'password' in body ? body.password : null;
  if (typeof password !== 'string' || !password || password.length>128) return reply({code:'INVALID_PASSWORD'},400);
  const now = Date.now(),window = Math.floor(now/300000)*300000;
  const scope = tenant.tenantId+':'+await sha256Hex(request.headers.get('CF-Connecting-IP') || 'unknown');
  const limited = await env.DB.prepare(`INSERT INTO pos_session_attempts(scope,window_start,attempts) VALUES(?,?,1)
    ON CONFLICT(scope) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,
    window_start=excluded.window_start RETURNING attempts`).bind(scope,window).first<{attempts:number}>();
  if (!limited || limited.attempts>20) return reply({code:'LOGIN_RATE_LIMITED'},429);
  const stored = await getStoredPassword(env,tenant.tenantId,tenant);
  if (await sha256Hex(password) !== await sha256Hex(stored)) return reply({code:'INVALID_PASSWORD'},401);
  const token = generateBearerToken(),expires = new Date(now+8*3600000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO staff_sessions(token_hash,tenant_id,pin_hash,expires_at,created_at)
      VALUES(?,?,?,datetime(?),datetime('now'))`).bind(await sha256Hex(token),tenant.tenantId,await sha256Hex(stored),expires),
    env.DB.prepare('DELETE FROM pos_session_attempts WHERE window_start<?').bind(window-86400000)
  ]);
  return reply({ok:true,token,tenantId:tenant.tenantId,expiresAt:expires});
}
