import type { Env } from '../types/env';
import { json } from '../utils/http';
import { getTenantId } from './menu';
import { invalidateBootstrapCache } from './bootstrap';
import {
  deleteTenantQrChannel,
  hasDbColumn,
  hasTenantMenuScheduleFeature,
  loadTenantOperatingShifts,
  loadTenantQrChannels,
  readScheduleContext,
  saveTenantOperatingShifts,
  saveTenantQrChannel,
  ScheduleIntegrityError,
} from './operating-shifts';

/** A revisioned snapshot owns shift editing; menu assignment has its own narrow PATCH. */
export async function menuShifts(request: Request, env: Env): Promise<Response> {
  const tenantId = getTenantId(request);
  if (!await hasTenantMenuScheduleFeature(env.DB, tenantId)) return json({ error: 'FEATURE_LOCKED', feature: 'menu_schedule' }, 403);
  try {
    if (request.method === 'PUT') {
      const body = await request.json() as any;
      if (!body || !Number.isSafeInteger(body.scheduleRevision) || Object.keys(body).some(k => !['operatingShifts', 'scheduleRevision'].includes(k))) return json({ error: 'INVALID_SHIFT_PATCH' }, 400);
      await saveTenantOperatingShifts(env.DB, tenantId, body.operatingShifts, body.scheduleRevision);
      await invalidateBootstrapCache(tenantId, env);
    }
    const snapshot = await readScheduleContext(env.DB, tenantId);
    return json({ scheduleRevision: snapshot.revision, operatingHours: snapshot.hoursRaw ? JSON.parse(snapshot.hoursRaw) : {}, operatingShifts: await loadTenantOperatingShifts(env.DB, tenantId) }, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    if (error instanceof ScheduleIntegrityError) return json({ error: error.message, conflicts: error.conflicts }, error.status);
    return json({ error: error instanceof Error ? error.message : 'INVALID_OPERATING_SHIFTS' }, 400);
  }
}

export async function qrChannels(request: Request, env: Env): Promise<Response> {
  const tenantId = getTenantId(request);
  if (!env.DB) return json({ error: 'NO_DB' }, 500);
  try {
    const readDineInTableMode = async () => {
      if (!await hasDbColumn(env.DB, 'tenant_config', 'dine_in_table_mode')) return 'required';
      const row = await env.DB.prepare('SELECT dine_in_table_mode FROM tenant_config WHERE tenant_id = ? LIMIT 1')
        .bind(tenantId).first<{ dine_in_table_mode?: string }>();
      return row?.dine_in_table_mode === 'none' || row?.dine_in_table_mode === 'optional' ? row.dine_in_table_mode : 'required';
    };

    if (request.method === 'GET') {
      const [channels, dineInTableMode] = await Promise.all([
        loadTenantQrChannels(env.DB, tenantId, { includeOrderCounts: true }),
        readDineInTableMode(),
      ]);
      return json({ qrChannels: channels, dineInTableMode }, 200, { 'Cache-Control': 'no-store' });
    }
    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return json({ error: 'INVALID_QR_CHANNEL' }, 400);
      }
      const saved = await saveTenantQrChannel(env.DB, tenantId, body as Record<string, unknown>);
      await invalidateBootstrapCache(tenantId, env);
      const channels = await loadTenantQrChannels(env.DB, tenantId, { includeOrderCounts: true });
      return json({ ok: true, channel: saved, qrChannels: channels }, 200, { 'Cache-Control': 'no-store' });
    }
    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      let id = url.searchParams.get('id') || '';
      if (!id) {
        const body = await request.json().catch(() => null) as any;
        id = typeof body?.id === 'string' ? body.id.trim() : '';
      }
      if (!id) return json({ error: 'QR_CHANNEL_ID_REQUIRED' }, 400);
      await deleteTenantQrChannel(env.DB, tenantId, id);
      await invalidateBootstrapCache(tenantId, env);
      const channels = await loadTenantQrChannels(env.DB, tenantId, { includeOrderCounts: true });
      return json({ ok: true, qrChannels: channels }, 200, { 'Cache-Control': 'no-store' });
    }
    return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  } catch (error) {
    if (error instanceof ScheduleIntegrityError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : 'QR_CHANNEL_ERROR' }, 400);
  }
}
