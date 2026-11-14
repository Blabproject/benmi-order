import { Env } from '../types/env';
import { json } from '../utils/http';
import { invalidateBootstrapCache } from './bootstrap';
import { invalidateMarketplaceCache } from './marketplace';
import { customerOrderConfig, validateLegacyEndpoint } from '../utils/order-domain';
import { createTenantRepository } from '../repositories/tenant.repository';

export async function updateOrderDomain(request: Request, env: Env, tenantId: string): Promise<Response> {
  const noStore = { 'Cache-Control': 'no-store' };
  let payload: any;
  try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400, noStore); }
  if (!payload || !['legacy', 'blabfood'].includes(payload.customerOrderDomain) ||
      !['legacy', 'blabfood'].includes(payload.expectedCustomerOrderDomain) ||
      typeof payload.expectedLiffId !== 'string' || !payload.expectedLiffId) {
    return json({ error: 'customerOrderDomain, expectedCustomerOrderDomain and expectedLiffId are required' }, 400, noStore);
  }
  try {
    const tenantRepo = createTenantRepository(env.DB, env.ORDER_STATE, env);
    const row = await tenantRepo.getOrderDomainRow(tenantId);
    if (!row) return json({ error: 'Tenant not found' }, 404, noStore);
    if (row.liff_id !== payload.expectedLiffId || row.customer_order_domain !== payload.expectedCustomerOrderDomain) {
      return json({ error: 'Order domain or LIFF ID changed; reload configuration' }, 409, noStore);
    }
    let legacyEndpoint = row.legacy_liff_endpoint_url;
    if (payload.legacyLiffEndpointUrl !== undefined) {
      try { legacyEndpoint = validateLegacyEndpoint(payload.legacyLiffEndpointUrl, tenantId, request.url); }
      catch { return json({ error: 'Invalid legacyLiffEndpointUrl' }, 400, noStore); }
    }
    // Capture the actual Console endpoint before the first cutover, not a guess.
    if (payload.customerOrderDomain === 'blabfood' && !legacyEndpoint) {
      return json({ error: 'Save legacyLiffEndpointUrl from LINE Console before activation' }, 400, noStore);
    }

    const changed = await tenantRepo.updateOrderDomain(
      tenantId,
      payload.customerOrderDomain,
      legacyEndpoint || null,
      payload.expectedCustomerOrderDomain,
      payload.expectedLiffId,
      row.legacy_liff_endpoint_url || null
    );
    if (!changed) return json({ error: 'Configuration changed; reload and retry' }, 409, noStore);

    await invalidateBootstrapCache(tenantId, env);
    await invalidateMarketplaceCache(env);
    return json({
      success: true,
      tenantId,
      liffId: row.liff_id,
      ...customerOrderConfig(tenantId, { ...row, customer_order_domain: payload.customerOrderDomain, legacy_liff_endpoint_url: legacyEndpoint }, request.url)
    }, 200, noStore);
  } catch {
    return json({ error: 'Order domain configuration unavailable' }, 503, noStore);
  }
}
