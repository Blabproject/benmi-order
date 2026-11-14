import { Env } from '../types/env';
import { json } from '../utils/http';
import { getTenantId } from './menu';
import { TenantContext, tenantHasFeature, normalizeStoreStatus, parseStoreNotice, STORE_NOTICE_TITLE_MAX, STORE_NOTICE_BODY_MAX } from '../types/tenant';
import { invalidateBootstrapCache, parseOperatingHours } from './bootstrap';
import { invalidateMarketplaceCache } from './marketplace';
import { customerOrderConfig } from '../utils/order-domain';
import { createTenantRepository } from '../repositories/tenant.repository';
import { parseAISettings, validAISettingsPatch } from './ai-settings';

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

  const autoOpenBeforeMinutes = (domainRow.auto_open_before_minutes !== undefined && domainRow.auto_open_before_minutes !== null)
    ? Number(domainRow.auto_open_before_minutes)
    : (tenantCtx?.autoOpenBeforeMinutes ?? 60);

  return json({
    tenantId,
    aiSettings: parseAISettings(domainRow.ai_settings, domainRow.ai_order_redirect_enabled),
    liffId: domainRow.liff_id || null,
    ...orderConfig,
    operatingHours,
    allowScheduledPickup,
    allowDineIn,
    features: finalFeatures,
    storeStatus: normalizeStoreStatus(domainRow.store_status || tenantCtx?.storeStatus, new Date(), domainRow.operating_hours || tenantCtx?.operatingHours, autoOpenBeforeMinutes),
    autoOpenBeforeMinutes,
    prepTimeMinutes: (domainRow.prep_time_minutes !== undefined && domainRow.prep_time_minutes !== null) ? Number(domainRow.prep_time_minutes) : (tenantCtx?.prepTimeMinutes ?? 5),
    paymentMethods: domainRow.payment_methods ? (typeof domainRow.payment_methods === 'string' ? JSON.parse(domainRow.payment_methods) : domainRow.payment_methods) : (tenantCtx?.paymentMethods || ['line_pay']),
    logoUrl: domainRow.logo_url || tenantCtx?.logoUrl || null,
    storeAddress: domainRow.store_address || tenantCtx?.storeAddress || null,
    announcement: domainRow.announcement !== undefined && domainRow.announcement !== null ? domainRow.announcement : (tenantCtx?.announcement || null),
    storeNotice: parseStoreNotice(domainRow.store_notice)
  }, 200, { 'Cache-Control': 'no-store' });
}

/**
 * Normalize a POS-submitted notice into its stored string form.
 * Returns undefined when absent, '' to clear, or JSON. The version is kept when
 * title/body are unchanged so customers who dismissed it are not shown it again.
 */
export function serializeStoreNotice(input: unknown, existingRaw: string | null | undefined): string | undefined {
  if (input === undefined) return undefined;
  if (input === null || typeof input !== 'object') return '';
  const raw = input as Record<string, unknown>;
  const title = (typeof raw.title === 'string' ? raw.title : '').replace(/\r\n/g, '\n').trim();
  const body = (typeof raw.body === 'string' ? raw.body : '').replace(/\r\n/g, '\n').trim();
  if (title.length > STORE_NOTICE_TITLE_MAX || body.length > STORE_NOTICE_BODY_MAX) {
    throw new HttpError(400, 'STORE_NOTICE_TOO_LONG');
  }
  if (!title && !body) return '';
  const existing = parseStoreNotice(existingRaw);
  const unchanged = existing && existing.title === title && existing.body === body && existing.version;
  return JSON.stringify({
    enabled: raw.enabled !== false,
    title,
    body,
    version: unchanged ? existing!.version : new Date().toISOString()
  });
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
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

    let aiSettings: string | undefined;
    let aiOrderRedirectEnabled: boolean | undefined;
    if (payload.aiSettings !== undefined) {
      if (!validAISettingsPatch(payload.aiSettings)) return json({ error: 'INVALID_AI_SETTINGS' }, 400);
      const current = await tenantRepo.getTenantConfigRow(tenantId);
      if (!current) return json({ error: 'Tenant not found' }, 404);
      // Persist only changed keys; JSON patch in D1 preserves switches changed by another POS.
      const { orderRedirect, ...settingsPatch } = payload.aiSettings;
      aiSettings = JSON.stringify(settingsPatch);
      aiOrderRedirectEnabled = orderRedirect;
    }

    const hasDineInFeature = tenantCtx ? tenantHasFeature(tenantCtx, 'dine_in') : true;
    let allowDineInVal = payload.allowDineIn !== undefined ? payload.allowDineIn : null;
    if (allowDineInVal && !hasDineInFeature) {
      console.warn(`[updateConfig] Tenant ${tenantId} tried to enable allowDineIn without 'dine_in' feature.`);
      allowDineInVal = false;
    }

    const brandName = tenantCtx?.brandName || (tenantId === 'benmi' ? 'Benmi 越式法國麵包' : tenantId);

    let storeNotice: string | undefined;
    if (payload.storeNotice !== undefined) {
      const current = await tenantRepo.getTenantConfigRow(tenantId);
      storeNotice = serializeStoreNotice(payload.storeNotice, current?.store_notice);
    }

    await tenantRepo.updateTenantConfig(tenantId, {
      operatingHours: payload.operatingHours,
      allowScheduledPickup: payload.allowScheduledPickup,
      allowDineIn: allowDineInVal,
      storeStatus: payload.storeStatus,
      autoOpenBeforeMinutes: payload.autoOpenBeforeMinutes !== undefined ? Number(payload.autoOpenBeforeMinutes) : undefined,
      prepTimeMinutes: payload.prepTimeMinutes !== undefined ? Number(payload.prepTimeMinutes) : undefined,
      paymentMethods: payload.paymentMethods !== undefined ? payload.paymentMethods : undefined,
      liffId: payload.liffId,
      logoUrl: payload.logoUrl,
      storeAddress: payload.storeAddress,
      announcement: payload.announcement,
      storeNotice,
      aiSettings,
      aiOrderRedirectEnabled,
      features: payload.features,
      brandName
    });

    await invalidateBootstrapCache(tenantId, env);
    await invalidateMarketplaceCache(env);

    if (aiSettings) {
      const current = await tenantRepo.getTenantConfigRow(tenantId);
      return json({ success: true, aiSettings: parseAISettings(current?.ai_settings, current?.ai_order_redirect_enabled) });
    }
    return json({ success: true });
  } catch (e: any) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error('[updateConfig] Error:', e);
    return json({ error: e.message }, 500);
  }
}
