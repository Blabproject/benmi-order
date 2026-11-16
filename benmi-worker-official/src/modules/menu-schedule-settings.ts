import type { Env } from '../types/env';
import { json } from '../utils/http';
import { getTenantId } from './menu';
import { hasTenantMenuScheduleFeature } from './operating-shifts';
import { invalidateBootstrapCache } from './bootstrap';

type Mode = 'all_shifts' | 'selected_shifts' | 'inherit';
type Schedule = { availabilityMode: Mode; shiftIds: string[]; hideWhenUnavailable?: boolean };
type Patch = Schedule & { id: string; categoryId?: string; previous: Schedule };
type CategoryRow = { id: string; availability_mode: Mode; hide_when_unavailable: number; category_type: string };
type ItemRow = { id: string; category_id: string; availability_mode: Mode };
type LinkRow = { entity_id: string; shift_id: string };
class ScheduleError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ScheduleError('INVALID_SCHEDULE_PATCH');
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new ScheduleError('INVALID_ENTITY_ID');
  return value;
}
function parseSchedule(value: unknown, item: boolean): Schedule {
  const raw = record(value);
  if (raw.availabilityMode !== 'all_shifts' && raw.availabilityMode !== 'selected_shifts' && !(item && raw.availabilityMode === 'inherit')) throw new ScheduleError('INVALID_AVAILABILITY_MODE');
  if (!Array.isArray(raw.shiftIds) || raw.shiftIds.some(id => typeof id !== 'string' || !id.trim())) throw new ScheduleError('INVALID_SHIFT_IDS');
  if (new Set(raw.shiftIds).size !== raw.shiftIds.length) throw new ScheduleError('DUPLICATE_SHIFT_ID');
  if (!item && typeof raw.hideWhenUnavailable !== 'boolean') throw new ScheduleError('INVALID_VISIBILITY');
  return { availabilityMode: raw.availabilityMode, shiftIds: [...raw.shiftIds].sort(), ...(!item ? { hideWhenUnavailable: raw.hideWhenUnavailable as boolean } : {}) };
}
function parsePatches(value: unknown, item: boolean): Patch[] {
  if (!Array.isArray(value)) throw new ScheduleError('INVALID_SCHEDULE_PATCH');
  const seen = new Set<string>();
  return value.map(entry => {
    const raw = record(entry), id = identifier(raw.id);
    const allowed = new Set(['id', 'availabilityMode', 'shiftIds', 'previous', ...(item ? ['categoryId'] : ['hideWhenUnavailable'])]);
    if (Object.keys(raw).some(key => !allowed.has(key)) || seen.has(id)) throw new ScheduleError('INVALID_SCHEDULE_PATCH');
    seen.add(id);
    return { id, ...(item ? { categoryId: identifier(raw.categoryId) } : {}), ...parseSchedule(raw, item), previous: parseSchedule(raw.previous, item) };
  });
}
const same = (a: Schedule, b: Schedule) => JSON.stringify(a) === JSON.stringify(b);
function linksFor(rows: LinkRow[], id: string): string[] { return rows.filter(r => r.entity_id === id).map(r => r.shift_id).sort(); }

/** Update schedule fields and link deltas only; never rewrite products or modifiers. */
export async function updateMenuSchedule(request: Request, env: Env): Promise<Response> {
  const tenantId = getTenantId(request);
  if (!await hasTenantMenuScheduleFeature(env.DB, tenantId, null)) return json({ error: 'FEATURE_NOT_ENABLED', feature: 'menu_schedule' }, 403);
  try {
    let body: unknown;
    try { body = await request.json(); } catch { throw new ScheduleError('INVALID_JSON'); }
    const raw = record(body);
    if (Object.keys(raw).some(key => key !== 'categories' && key !== 'items')) throw new ScheduleError('INVALID_SCHEDULE_PATCH');
    const categories = parsePatches(raw.categories, false), items = parsePatches(raw.items, true);
    if (!categories.length && !items.length) return json({ ok: true });
    // One read batch anchors the catalog revision and all expected schedule values.
    const results = await env.DB.batch([
      env.DB.prepare('SELECT revision FROM menu_catalog_revisions WHERE tenant_id=?').bind(tenantId),
      env.DB.prepare('SELECT id, category_type, availability_mode, hide_when_unavailable FROM menu_categories WHERE tenant_id=?').bind(tenantId),
      env.DB.prepare('SELECT id, category_id, availability_mode FROM menu_items WHERE tenant_id=?').bind(tenantId),
      env.DB.prepare('SELECT category_id AS entity_id, shift_id FROM menu_category_shifts WHERE tenant_id=?').bind(tenantId),
      env.DB.prepare('SELECT item_id AS entity_id, shift_id FROM menu_item_shifts WHERE tenant_id=?').bind(tenantId),
      env.DB.prepare('SELECT id FROM tenant_operating_shifts WHERE tenant_id=?').bind(tenantId),
    ]);
    const revision = Number((results[0].results as { revision: number }[])[0]?.revision || 0);
    const categoryRows = results[1].results as CategoryRow[], itemRows = results[2].results as ItemRow[];
    const categoryLinks = results[3].results as LinkRow[], itemLinks = results[4].results as LinkRow[];
    const ownedShifts = new Set((results[5].results as { id: string }[]).map(s => s.id));
    const statements: D1PreparedStatement[] = [];
    const guardId = crypto.randomUUID();
    statements.push(env.DB.prepare('INSERT INTO menu_write_guards (id,valid) VALUES (?, CASE WHEN COALESCE((SELECT revision FROM menu_catalog_revisions WHERE tenant_id=?),0)=? THEN 1 ELSE 0 END)').bind(guardId, tenantId, revision));
    function linkDelta(patch: Patch, oldLinks: string[], item: boolean) {
      const table = item ? 'menu_item_shifts' : 'menu_category_shifts', column = item ? 'item_id' : 'category_id';
      for (const sid of oldLinks.filter(sid => !patch.shiftIds.includes(sid))) statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE tenant_id=? AND ${column}=? AND shift_id=?`).bind(tenantId, patch.id, sid));
      for (const sid of patch.shiftIds.filter(sid => !oldLinks.includes(sid))) statements.push(env.DB.prepare(`INSERT INTO ${table} (tenant_id,${column},shift_id) VALUES (?,?,?) ON CONFLICT(tenant_id,${column},shift_id) DO NOTHING`).bind(tenantId, patch.id, sid));
    }
    for (const patch of [...categories, ...items]) if (patch.shiftIds.some(sid => !ownedShifts.has(sid))) throw new ScheduleError('INVALID_SHIFT_ID');
    for (const patch of categories) {
      const row = categoryRows.find(row => row.id === patch.id && row.category_type === 'catalog');
      if (!row) throw new ScheduleError('CATEGORY_NOT_FOUND', 404);
      const previous: Schedule = { availabilityMode: row.availability_mode, shiftIds: linksFor(categoryLinks, row.id), hideWhenUnavailable: Boolean(row.hide_when_unavailable) };
      if (!same(patch.previous, previous)) throw new ScheduleError('MENU_SCHEDULE_CONFLICT', 409);
      const next: Schedule = { availabilityMode: patch.availabilityMode, shiftIds: patch.shiftIds, hideWhenUnavailable: patch.hideWhenUnavailable };
      if (same(next, previous)) continue;
      statements.push(env.DB.prepare('UPDATE menu_categories SET availability_mode=?, hide_when_unavailable=? WHERE tenant_id=? AND id=?').bind(patch.availabilityMode, patch.hideWhenUnavailable ? 1 : 0, tenantId, patch.id));
      linkDelta(patch, previous.shiftIds, false);
    }
    for (const patch of items) {
      const row = itemRows.find(row => row.id === patch.id && row.category_id === patch.categoryId);
      if (!row || !categoryRows.some(c => c.id === row.category_id && c.category_type === 'catalog')) throw new ScheduleError('ITEM_NOT_FOUND', 404);
      const previous: Schedule = { availabilityMode: row.availability_mode, shiftIds: linksFor(itemLinks, row.id) };
      if (!same(patch.previous, previous)) throw new ScheduleError('MENU_SCHEDULE_CONFLICT', 409);
      const next: Schedule = { availabilityMode: patch.availabilityMode, shiftIds: patch.shiftIds };
      if (same(next, previous)) continue;
      statements.push(env.DB.prepare('UPDATE menu_items SET availability_mode=? WHERE tenant_id=? AND id=? AND category_id=?').bind(patch.availabilityMode, tenantId, patch.id, row.category_id));
      linkDelta(patch, previous.shiftIds, true);
    }
    statements.push(env.DB.prepare('DELETE FROM menu_write_guards WHERE id=?').bind(guardId));
    try { await env.DB.batch(statements); }
    catch (error) {
      if (/CHECK constraint failed.*valid|menu_write_guards/i.test(String(error))) throw new ScheduleError('MENU_SCHEDULE_CONFLICT', 409);
      throw error;
    }
    await Promise.all([invalidateBootstrapCache(tenantId, env), env.ORDER_STATE?.delete(`tenant:${tenantId}:menu`)]);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof ScheduleError) return json({ error: error.message }, error.status);
    console.error('[MenuSchedule] Save failed', error);
    return json({ error: 'MENU_SCHEDULE_SAVE_FAILED' }, 500);
  }
}
