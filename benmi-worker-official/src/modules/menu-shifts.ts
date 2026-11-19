import type { Env } from '../types/env';
import { json } from '../utils/http';
import { getTenantId } from './menu';
import { invalidateBootstrapCache } from './bootstrap';
import { hasTenantMenuScheduleFeature, loadTenantOperatingShifts, readScheduleContext, saveTenantOperatingShifts, ScheduleIntegrityError } from './operating-shifts';

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
