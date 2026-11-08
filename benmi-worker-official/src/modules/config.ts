import { Env } from '../types/env';
import { json } from '../utils/http';
import { getTenantId } from './menu';
import { TenantContext, tenantHasFeature, normalizeStoreStatus } from '../types/tenant';
import { invalidateBootstrapCache, parseOperatingHours } from './bootstrap';
import { invalidateMarketplaceCache } from './marketplace';
import { customerOrderConfig } from '../utils/order-domain';
import { createTenantRepository } from '../repositories/tenant.repository';

export async function getConfig(
  request: Request,
  env: Env,
  tenantCtx?: TenantContext | null
): Promise<Response> {
  const tenantId = tenantCtx?.tenantId || getTenantId(request);
  const tenantRepo = createTenantRepository(env.DB, env.ORDER_STATE, env);

  let domainRow;
  try {
    domainRow = await tenantRepo.getTenantConfigRow(tenantId);
  } catch (e) {
    console.error('[getConfig] D1 configuration unavailable');
    return json({ error: 'Tenant configuration unavailable' }, 503, { 'Cache-Control': 'no-store' });
  }

  if (!domainRow) {
    return json({ error: 'Tenant not found' }, 404, { 'Cache-Control': 'no-store' });
  }

  let operatingHours = parseOperatingHours(domainRow.operating_hours, tenantId);
  if (!operatingHours) {
    operatingHours = parseOperatingHours(null, tenantId);
  }

  let allowScheduledPickup = true;
  if (domainRow.allow_scheduled_pickup !== undefined && domainRow.allow_scheduled_pickup !== null) {
    allowScheduledPickup = Boolean(domainRow.allow_scheduled_pickup);
  }

  let allowDineIn = true;
  if (domainRow.allow_dine_in !== undefined && domainRow.allow_dine_in !== null) {
    allowDineIn = Boolean(domainRow.allow_dine_in);
  }

  let features: string[] = [];
  try {
    if (domainRow.features) {
      features = typeof domainRow.features === 'string' ? JSON.parse(domainRow.features) : domainRow.features;
    }
  } catch {
    features = [];
  }

  const finalFeatures = Array.isArray(features) && features.length > 0 ? features : (tenantCtx?.features || []);

  let orderConfig;
  try {
    orderConfig = customerOrderConfig(tenantId, domainRow, request.url);
  } catch {
    return json({ error: 'Invalid tenant endpoint configuration' }, 503, { 'Cache-Control': 'no-store' });
  }

  return json({
    tenantId,
    liffId: domainRow.liff_id || null,
    ...orderConfig,
    operatingHours,
    allowScheduledPickup,
    allowDineIn,
    features: finalFeatures,
    storeStatus: normalizeStoreStatus(domainRow.store_status || tenantCtx?.storeStatus),
    prepTimeMinutes: (domainRow.prep_time_minutes !== undefined && domainRow.prep_time_minutes !== null) ? Number(domainRow.prep_time_minutes) : (tenantCtx?.prepTimeMinutes ?? 5),
    paymentMethods: domainRow.payment_methods ? (typeof domainRow.payment_methods === 'string' ? JSON.parse(domainRow.payment_methods) : domainRow.payment_methods) : (tenantCtx?.paymentMethods || ['line_pay']),
    logoUrl: domainRow.logo_url || tenantCtx?.logoUrl || null,
    storeAddress: domainRow.store_address || tenantCtx?.storeAddress || null,
    announcement: domainRow.announcement !== undefined && domainRow.announcement !== null ? domainRow.announcement : (tenantCtx?.announcement || null)
  }, 200, { 'Cache-Control': 'no-store' });
}

export async function updateConfig(
  request: Request,
  env: Env,
  tenantCtx?: TenantContext | null
): Promise<Response> {
  try {
    const tenantId = tenantCtx?.tenantId || getTenantId(request);
    const payload: any = await request.json();
    if (payload.storeStatus !== undefined) {
      const rawStatus = typeof payload.storeStatus === 'string' ? payload.storeStatus.split(':')[0].trim() : '';
      if (!['open', 'busy', 'paused', 'closed'].includes(rawStatus)) {
        return json({ error: 'INVALID_STORE_STATUS' }, 400);
      }
    }
    const tenantRepo = createTenantRepository(env.DB, env.ORDER_STATE, env);

    const hasDineInFeature = tenantCtx ? tenantHasFeature(tenantCtx, 'dine_in') : true;
    let allowDineInVal = payload.allowDineIn !== undefined ? payload.allowDineIn : null;
    if (allowDineInVal && !hasDineInFeature) {
      console.warn(`[updateConfig] Tenant ${tenantId} tried to enable allowDineIn without 'dine_in' feature.`);
      allowDineInVal = false;
    }

    const brandName = tenantCtx?.brandName || (tenantId === 'benmi' ? 'Benmi 越式法國麵包' : tenantId);

    await tenantRepo.updateTenantConfig(tenantId, {
      operatingHours: payload.operatingHours,
      allowScheduledPickup: payload.allowScheduledPickup,
      allowDineIn: allowDineInVal,
      storeStatus: payload.storeStatus,
      prepTimeMinutes: payload.prepTimeMinutes !== undefined ? Number(payload.prepTimeMinutes) : undefined,
      paymentMethods: payload.paymentMethods !== undefined ? payload.paymentMethods : undefined,
      liffId: payload.liffId,
      logoUrl: payload.logoUrl,
      storeAddress: payload.storeAddress,
      announcement: payload.announcement,
      features: payload.features,
      brandName
    });

    await invalidateBootstrapCache(tenantId, env);
    await invalidateMarketplaceCache(env);

    return json({ success: true });
  } catch (e: any) {
    console.error('[updateConfig] Error:', e);
    return json({ error: e.message }, 500);
  }
}
