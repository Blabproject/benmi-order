import { Env } from '../types/env';
import { json } from '../utils/http';
import { getTenantId } from './menu';
import { resolveTenantContext } from './tenant';
import { TenantContext } from '../types/tenant';
import { createTenantRepository } from '../repositories';

export const DEFAULT_PASSWORD = "12345678";

export async function getStoredPassword(env: Env, tenantId: string, tenantCtx?: TenantContext | null): Promise<string> {
  const repo = createTenantRepository(env.DB, env.ORDER_STATE, env);
  return repo.getStorePassword(tenantId, tenantCtx?.defaultPassword || DEFAULT_PASSWORD);
}

export async function handleAuth(request: Request, env: Env, url?: URL, tenantCtx?: TenantContext | null): Promise<Response> {
  const reqUrl = url || new URL(request.url);
  let password: string | null = null;
  let tenantId = reqUrl.searchParams.get("tenant_id") || reqUrl.searchParams.get("tenant") || tenantCtx?.tenantId || getTenantId(request);

  if (request.method === "GET") {
    password = reqUrl.searchParams.get("pw");
  } else {
    const body: any = await request.json().catch(() => ({}));
    password = body.password;
    if (body.tenant_id) tenantId = body.tenant_id;
  }
  if (!password) return json({ ok: false, error: "no_password", message: "請提供管理 PIN 碼" }, 400);
  if (!tenantId) return json({ ok: false, error: "no_tenant", message: "請提供門市代碼" }, 400);

  // 1. Mandatory Tenant Verification: Ensure tenant exists in D1 database and is active
  if (!tenantCtx || tenantCtx.tenantId !== tenantId) {
    tenantCtx = await resolveTenantContext(tenantId, env);
  }
  if (!tenantCtx) {
    return json({ ok: false, error: "invalid_tenant", message: `門市代碼 '${tenantId}' 不存在或已停用` }, 404);
  }

  // 2. Validate Password against Store PIN
  const stored = await getStoredPassword(env, tenantId, tenantCtx);
  if (password !== stored) {
    return json({ ok: false, error: "invalid_password", message: "管理 PIN 碼錯誤" }, 401);
  }

  return json({
    ok: true,
    tenant_id: tenantCtx.tenantId,
    brand_name: tenantCtx.brandName
  });
}

export async function handleAuthChange(request: Request, env: Env, tenantCtx?: TenantContext | null): Promise<Response> {
  const { current, newPassword, tenant_id }: any = await request.json().catch(() => ({}));
  if (!current || !newPassword) return json({ ok: false, error: "Missing fields" }, 400);
  
  const tenantId = tenant_id || tenantCtx?.tenantId || getTenantId(request);
  if (!tenantCtx || tenantCtx.tenantId !== tenantId) {
    tenantCtx = await resolveTenantContext(tenantId, env);
  }
  if (!tenantCtx) {
    return json({ ok: false, error: "invalid_tenant", message: `門市代碼 '${tenantId}' 不存在或已停用` }, 404);
  }

  const repo = createTenantRepository(env.DB, env.ORDER_STATE, env);
  const stored = await repo.getStorePassword(tenantId, tenantCtx.defaultPassword || DEFAULT_PASSWORD);
  if (current !== stored) return json({ ok: false, error: "Wrong current password" }, 401);
  if (newPassword.length < 4) return json({ ok: false, error: "Password too short" }, 400);
  
  await repo.setStorePassword(tenantId, newPassword);
  // Revoke all active staff sessions for this tenant when store PIN changes
  if (env.DB) {
    try {
      await env.DB.prepare(
        "UPDATE staff_sessions SET revoked_at = datetime('now') WHERE tenant_id = ? AND revoked_at IS NULL"
      ).bind(tenantId).run();
    } catch (e) {
      console.warn(`[handleAuthChange] Failed to revoke staff sessions for ${tenantId}:`, e);
    }
  }

  return json({ ok: true });
}

export async function handleCreateTempLink(request: Request, env: Env, tenantCtx?: TenantContext | null): Promise<Response> {
  const { password, hours = 24, tenant_id }: any = await request.json().catch(() => ({}));

  const tenantId = tenant_id || tenantCtx?.tenantId || getTenantId(request);
  if (!tenantCtx || tenantCtx.tenantId !== tenantId) {
    tenantCtx = await resolveTenantContext(tenantId, env);
  }
  if (!tenantCtx) {
    return json({ ok: false, error: "invalid_tenant" }, 404);
  }

  const repo = createTenantRepository(env.DB, env.ORDER_STATE, env);
  const stored = await repo.getStorePassword(tenantId, tenantCtx.defaultPassword || DEFAULT_PASSWORD);
  if (password !== stored) return json({ ok: false, error: "Wrong password" }, 401);

  const ttl = Math.min(Math.max(parseInt(hours) || 24, 1), 168);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  await repo.createTempLinkToken(tenantId, token, ttl * 3600);
  return json({ ok: true, token, hours: ttl });
}

export async function handleVerifyTempLink(request: Request, env: Env, tenantCtx?: TenantContext | null): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  if (!token) return json({ ok: false });

  const tenantId = url.searchParams.get("tenant_id") || tenantCtx?.tenantId || getTenantId(request);
  const repo = createTenantRepository(env.DB, env.ORDER_STATE, env);
  const ok = await repo.verifyTempLinkToken(tenantId, token);
  return json({ ok });
}

