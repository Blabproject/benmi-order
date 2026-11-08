import { Env } from '../types/env';
import { json } from '../utils/http';
import { resolveSecret } from '../utils/secrets';
import { updateOrderDomain } from './order-domain';
import { createTenantRepository } from '../repositories/tenant.repository';
import { backfillImagesFromKvToR2 } from './image';

async function verifyAdminAuth(request: Request, env: Env): Promise<boolean> {
  const adminKeyHeader = request.headers.get("X-Admin-Key");
  const expectedKey = (await resolveSecret(env.ADMIN_API_KEY)) || "benmi_admin_secret_2026";
  return adminKeyHeader === expectedKey;
}

export async function handleAdminRoute(request: Request, env: Env, path: string): Promise<Response> {
  const domainMatch = path.match(/^\/api\/admin\/tenants\/([a-zA-Z0-9_-]+)\/order-domain$/);
  if (request.method === 'PATCH' && domainMatch) {
    // This control never accepts the legacy hardcoded admin fallback key.
    const configuredKey = await resolveSecret(env.ORDER_DOMAIN_ADMIN_KEY) || await resolveSecret(env.ADMIN_API_KEY);
    if (!configuredKey || request.headers.get('X-Admin-Key') !== configuredKey) {
      return json({ error: 'Configured admin authentication required' }, 401, { 'Cache-Control': 'no-store' });
    }
    return updateOrderDomain(request, env, domainMatch[1]);
  }
  if (!(await verifyAdminAuth(request, env))) {
    return json({ error: "Unauthorized: Invalid or missing X-Admin-Key header" }, 401);
  }

  // POST /api/admin/images/backfill-r2
  if (request.method === "POST" && path === "/api/admin/images/backfill-r2") {
    return backfillImagesFromKvToR2(request, env);
  }

  const tenantRepo = createTenantRepository(env.DB, env.ORDER_STATE, env);

  // GET /api/admin/tenants
  if (request.method === "GET" && path === "/api/admin/tenants") {
    try {
      const tenants = await tenantRepo.listAdminTenants();
      return json({ tenants });
    } catch (e: any) {
      return json({ error: e.message }, 500);
    }
  }

  // GET /api/admin/tenants/:id
  const getMatch = path.match(/^\/api\/admin\/tenants\/([a-zA-Z0-9_-]+)$/);
  if (request.method === "GET" && getMatch) {
    const tenantId = getMatch[1];
    try {
      const detail = await tenantRepo.getAdminTenantDetail(tenantId);
      if (!detail) return json({ error: "Tenant not found" }, 404);
      return json(detail);
    } catch (e: any) {
      return json({ error: e.message }, 500);
    }
  }

  // POST /api/admin/tenants (Create or Update tenant)
  if (request.method === "POST" && path === "/api/admin/tenants") {
    try {
      const body: any = await request.json();
      const { tenant_id, brand_name } = body;

      if (!tenant_id || !brand_name) {
        return json({ error: "Missing required fields: tenant_id and brand_name" }, 400);
      }

      await tenantRepo.saveAdminTenant(body);
      return json({ success: true, tenant_id });
    } catch (e: any) {
      console.error("[Admin API] Failed to save tenant:", e);
      return json({ error: e.message }, 500);
    }
  }

  // DELETE /api/admin/tenants/:id (Deactivate tenant)
  const deleteMatch = path.match(/^\/api\/admin\/tenants\/([a-zA-Z0-9_-]+)$/);
  if (request.method === "DELETE" && deleteMatch) {
    const tenantId = deleteMatch[1];
    try {
      await tenantRepo.deactivateTenant(tenantId);
      return json({ success: true, message: `Tenant ${tenantId} deactivated` });
    } catch (e: any) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: "Not Found" }, 404);
}
