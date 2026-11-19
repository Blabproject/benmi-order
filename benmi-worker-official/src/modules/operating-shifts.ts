import MenuSchedule from '../../../js/menu-schedule.js';

export interface OperatingShiftWindowDto {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}

export interface OperatingShiftDto {
  id: string;
  name: string;
  i18n?: Record<string, { name?: string }>;
  shiftType: 'operating' | 'menu_window';
  sortOrder: number;
  isActive: boolean;
  windows: OperatingShiftWindowDto[];
}

export function parseFeaturesArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x)).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

export async function hasTenantMenuScheduleFeature(
  db: D1Database | undefined | null,
  tenantId: string,
  tenantCtxOrFeatures?: { features?: unknown } | string[] | null
): Promise<boolean> {
  if (Array.isArray(tenantCtxOrFeatures)) {
    return tenantCtxOrFeatures.includes('menu_schedule');
  }
  if (tenantCtxOrFeatures && typeof tenantCtxOrFeatures === 'object' && Array.isArray(tenantCtxOrFeatures.features)) {
    return tenantCtxOrFeatures.features.includes('menu_schedule');
  }
  if (!db || typeof (db as any).prepare !== 'function' || !tenantId) return false;
  try {
    const row = await db
      .prepare('SELECT features FROM tenant_config WHERE tenant_id = ? LIMIT 1')
      .bind(tenantId)
      .first<{ features?: unknown }>();
    return parseFeaturesArray(row?.features).includes('menu_schedule');
  } catch {
    return false;
  }
}

export async function hasDbTable(db: D1Database | undefined | null, tableName: string): Promise<boolean> {
  if (!db || typeof (db as any).prepare !== 'function') return false;
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  try {
    const row = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .bind(safeTable)
      .first<{ name?: string }>();
    return Boolean(row && row.name === safeTable);
  } catch {
    return false;
  }
}

export async function hasDbColumn(db: D1Database | undefined | null, tableName: string, columnName: string): Promise<boolean> {
  if (!db || typeof (db as any).prepare !== 'function') return false;
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  try {
    const res = await db.prepare(`PRAGMA table_info(${safeTable})`).all<any>();
    const rows = Array.isArray(res?.results) ? res.results : [];
    return rows.some((r: any) => r?.name === columnName);
  } catch {
    return false;
  }
}

function parseShiftI18n(raw: unknown): Record<string, { name?: string }> {
  if (!raw) return {};
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '{}') return {};
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, { name?: string }> = {};
  for (const [locale, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const name = typeof (entry as any).name === 'string' ? (entry as any).name.trim() : '';
      if (name) out[locale] = { name };
    }
  }
  return out;
}

export function serializeShiftI18n(input: unknown): string {
  const parsed = parseShiftI18n(input);
  return Object.keys(parsed).length > 0 ? JSON.stringify(parsed) : '{}';
}

export async function loadTenantOperatingShifts(db: D1Database | undefined | null, tenantId: string): Promise<OperatingShiftDto[]> {
  if (!db) return [];
  const [hasShiftsTable, hasHoursTable] = await Promise.all([
    hasDbTable(db, 'tenant_operating_shifts'),
    hasDbTable(db, 'tenant_operating_hours'),
  ]);
  if (!hasShiftsTable || !hasHoursTable) return [];

  const [shiftsRes, hoursRes] = await db.batch([
    db.prepare(
      `SELECT id, name, i18n_json, shift_type, sort_order, is_active
       FROM tenant_operating_shifts
       WHERE tenant_id = ?
       ORDER BY sort_order ASC, rowid ASC`
    ).bind(tenantId),
    db.prepare(
      `SELECT id, shift_id, day_of_week, start_time, end_time, is_active
       FROM tenant_operating_hours
       WHERE tenant_id = ?
       ORDER BY day_of_week ASC, start_time ASC, rowid ASC`
    ).bind(tenantId),
  ]);

  const shiftRows = Array.isArray(shiftsRes?.results) ? (shiftsRes.results as any[]) : [];
  const hourRows = Array.isArray(hoursRes?.results) ? (hoursRes.results as any[]) : [];

  const windowsByShiftId = new Map<string, OperatingShiftWindowDto[]>();
  for (const h of hourRows) {
    const sid = String(h.shift_id);
    if (!windowsByShiftId.has(sid)) windowsByShiftId.set(sid, []);
    windowsByShiftId.get(sid)!.push({
      id: String(h.id),
      dayOfWeek: Number(h.day_of_week),
      startTime: String(h.start_time),
      endTime: String(h.end_time),
      isActive: h.is_active !== 0,
    });
  }

  return shiftRows.map((s, idx) => {
    const i18n = parseShiftI18n(s.i18n_json);
    return {
      id: String(s.id),
      name: String(s.name || `Shift ${idx + 1}`),
      ...(Object.keys(i18n).length > 0 ? { i18n } : {}),
      shiftType: s.shift_type === 'menu_window' ? 'menu_window' : 'operating',
      sortOrder: Number(s.sort_order ?? idx),
      isActive: s.is_active !== 0,
      windows: windowsByShiftId.get(String(s.id)) || [],
    };
  });
}

export async function loadCategoryAndItemShiftLinks(
  db: D1Database | undefined | null,
  tenantId: string
): Promise<{
  categoryShiftIds: Map<string, string[]>;
  itemShiftIds: Map<string, string[]>;
}> {
  const categoryShiftIds = new Map<string, string[]>();
  const itemShiftIds = new Map<string, string[]>();
  if (!db) return { categoryShiftIds, itemShiftIds };

  const [hasCatLinks, hasItemLinks] = await Promise.all([
    hasDbTable(db, 'menu_category_shifts'),
    hasDbTable(db, 'menu_item_shifts'),
  ]);
  if (!hasCatLinks && !hasItemLinks) return { categoryShiftIds, itemShiftIds };

  const queries: D1PreparedStatement[] = [];
  if (hasCatLinks) {
    queries.push(db.prepare('SELECT category_id, shift_id FROM menu_category_shifts WHERE tenant_id = ?').bind(tenantId));
  }
  if (hasItemLinks) {
    queries.push(db.prepare('SELECT item_id, shift_id FROM menu_item_shifts WHERE tenant_id = ?').bind(tenantId));
  }
  const results = await db.batch(queries);
  let idx = 0;
  if (hasCatLinks) {
    const rows = Array.isArray(results[idx]?.results) ? (results[idx].results as any[]) : [];
    for (const r of rows) {
      const cid = String(r.category_id);
      if (!categoryShiftIds.has(cid)) categoryShiftIds.set(cid, []);
      categoryShiftIds.get(cid)!.push(String(r.shift_id));
    }
    idx++;
  }
  if (hasItemLinks) {
    const rows = Array.isArray(results[idx]?.results) ? (results[idx].results as any[]) : [];
    for (const r of rows) {
      const iid = String(r.item_id);
      if (!itemShiftIds.has(iid)) itemShiftIds.set(iid, []);
      itemShiftIds.get(iid)!.push(String(r.shift_id));
    }
  }
  return { categoryShiftIds, itemShiftIds };
}

export function normalizeIncomingShifts(rawShifts: unknown, tenantId: string): OperatingShiftDto[] {
  if (!Array.isArray(rawShifts)) throw new Error('INVALID_OPERATING_SHIFTS');
  const seenIds = new Set<string>();
  return rawShifts.map((raw: any, idx: number) => {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_OPERATING_SHIFT');
    const name = String(raw.name || '').trim();
    if (!name) throw new Error('OPERATING_SHIFT_NAME_REQUIRED');
    const shiftType = raw.shiftType === 'menu_window' || raw.shift_type === 'menu_window' ? 'menu_window' : 'operating';
    const id = raw.id && String(raw.id).trim()
      ? String(raw.id).trim()
      : `shift_${tenantId}_${crypto.randomUUID().slice(0, 8)}`;
    if (seenIds.has(id)) throw new Error('DUPLICATE_OPERATING_SHIFT_ID');
    seenIds.add(id);

    const rawWindows = Array.isArray(raw.windows) ? raw.windows : [];
    const seenWindowKey = new Set<string>();
    const windows: OperatingShiftWindowDto[] = [];
    for (const w of rawWindows) {
      if (!w || typeof w !== 'object') continue;
      const day = Number(w.dayOfWeek ?? w.day_of_week);
      const startTime = String(w.startTime ?? w.start_time ?? w.start ?? '').trim();
      const endTime = String(w.endTime ?? w.end_time ?? w.end ?? '').trim();
      if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error('INVALID_SHIFT_DAY');
      const sMin = MenuSchedule.parseMinutes(startTime, false);
      const eMin = MenuSchedule.parseMinutes(endTime, true);
      if (Number.isNaN(sMin) || sMin >= 1440 || Number.isNaN(eMin)) throw new Error('INVALID_SHIFT_TIME');
      const normStart = startTime.length === 4 ? `0${startTime}` : startTime;
      const normEnd = endTime.length === 4 ? `0${endTime}` : endTime;
      const dedupKey = `${day}:${normStart}:${normEnd}`;
      if (seenWindowKey.has(dedupKey)) continue;
      seenWindowKey.add(dedupKey);
      windows.push({
        id: w.id && String(w.id).trim() ? String(w.id).trim() : `${id}_d${day}_${normStart.replace(':', '')}`,
        dayOfWeek: day,
        startTime: normStart,
        endTime: normEnd,
        isActive: w.isActive !== undefined ? Boolean(w.isActive) : (w.is_active !== undefined ? Boolean(w.is_active) : true),
      });
    }

    return {
      id,
      name,
      i18n: parseShiftI18n(raw.i18n ?? raw.i18n_json),
      shiftType,
      sortOrder: Number.isFinite(Number(raw.sortOrder ?? raw.sort_order)) ? Number(raw.sortOrder ?? raw.sort_order) : idx,
      isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : (raw.is_active !== undefined ? Boolean(raw.is_active) : true),
      windows,
    };
  });
}

export class ScheduleIntegrityError extends Error {
  constructor(message: string, public status = 409, public conflicts: unknown[] = []) { super(message); }
}

export async function readScheduleContext(db: D1Database, tenantId: string) {
  // Read the revision first: any interleaved write is detected by the transaction guard.
  const row = await db.prepare('SELECT revision FROM menu_catalog_revisions WHERE tenant_id=?').bind(tenantId).first<{ revision: number }>();
  const config = await db.prepare('SELECT operating_hours FROM tenant_config WHERE tenant_id=?').bind(tenantId).first<{ operating_hours: string | null }>();
  return { revision: Number(row?.revision || 0), hoursRaw: config?.operating_hours ?? null };
}

export function assertShiftCoverage(shifts: OperatingShiftDto[], hours: unknown) {
  let conflicts: unknown[];
  try { conflicts = MenuSchedule.shiftCoverageIssues(shifts, hours); }
  catch { throw new ScheduleIntegrityError('INVALID_OPERATING_HOURS', 400); }
  if (conflicts.length) throw new ScheduleIntegrityError('SHIFTS_OUTSIDE_OPERATING_HOURS', 409, conflicts);
}

export async function guardedScheduleBatch(db: D1Database, tenantId: string, snapshot: { revision: number; hoursRaw: string | null }, statements: D1PreparedStatement[], expectedRevision?: number) {
  if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision !== snapshot.revision)) throw new ScheduleIntegrityError('MENU_SCHEDULE_CONFLICT');
  const id = crypto.randomUUID();
  const guard = db.prepare(`INSERT INTO menu_write_guards (id,valid) VALUES (?, CASE WHEN
    COALESCE((SELECT revision FROM menu_catalog_revisions WHERE tenant_id=?),0)=?
    AND (SELECT operating_hours FROM tenant_config WHERE tenant_id=?) IS ? THEN 1 ELSE 0 END)`)
    .bind(id, tenantId, snapshot.revision, tenantId, snapshot.hoursRaw);
  try { await db.batch([guard, ...statements, db.prepare('DELETE FROM menu_write_guards WHERE id=?').bind(id)]); }
  catch (error) {
    if (/CHECK constraint failed.*valid|menu_write_guards/i.test(String(error))) throw new ScheduleIntegrityError('MENU_SCHEDULE_CONFLICT');
    throw error;
  }
}

/** All config/admin hours writers use this boundary, preserving other config fields. */
export async function writeConfigWithHoursGuard(db: D1Database, tenantId: string, hours: unknown, statement: D1PreparedStatement, expectedRevision?: number, beforeStatements: D1PreparedStatement[] = []) {
  if (hours === undefined || !await hasTenantMenuScheduleFeature(db, tenantId)) {
    if (beforeStatements.length) await db.batch([...beforeStatements, statement]); else await statement.run();
    return;
  }
  const snapshot = await readScheduleContext(db, tenantId);
  const shifts = await loadTenantOperatingShifts(db, tenantId);
  assertShiftCoverage(shifts, hours);
  await guardedScheduleBatch(db, tenantId, snapshot, [...beforeStatements, statement], expectedRevision);
}

export async function saveTenantOperatingShifts(
  db: D1Database,
  tenantId: string,
  rawShifts: unknown,
  expectedRevision?: number
): Promise<{
  shifts: OperatingShiftDto[];
}> {
  const [hasShiftsTable, hasHoursTable] = await Promise.all([
    hasDbTable(db, 'tenant_operating_shifts'),
    hasDbTable(db, 'tenant_operating_hours'),
  ]);
  if (!hasShiftsTable || !hasHoursTable) {
    throw new Error('OPERATING_SHIFTS_SCHEMA_NOT_READY');
  }

  const snapshot = await readScheduleContext(db, tenantId);
  const shifts = normalizeIncomingShifts(rawShifts, tenantId);
  assertShiftCoverage(shifts, snapshot.hoursRaw);
  const incomingShiftIds = shifts.map((s) => s.id);
  const windowOwners = new Map<string, string>();
  for (const shift of shifts) for (const w of shift.windows) {
    if (!w.id || windowOwners.has(w.id)) throw new Error('DUPLICATE_SHIFT_WINDOW_ID');
    windowOwners.set(w.id, shift.id);
  }
  const windowIds = [...windowOwners.keys()];
  for (let i = 0; i < windowIds.length; i += 50) {
    const chunk = windowIds.slice(i, i + 50);
    const rows = await db.prepare(`SELECT id, tenant_id, shift_id FROM tenant_operating_hours WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<{ id: string; tenant_id: string; shift_id: string }>();
    for (const row of rows.results || []) if (row.tenant_id !== tenantId || row.shift_id !== windowOwners.get(row.id)) throw new Error('FORBIDDEN_SHIFT_WINDOW_ID');
  }
  if (incomingShiftIds.length > 0) {
    for (let i = 0; i < incomingShiftIds.length; i += 50) {
      const chunk = incomingShiftIds.slice(i, i + 50);
      const placeholders = chunk.map(() => '?').join(',');
      const { results } = await db
        .prepare(`SELECT id, tenant_id FROM tenant_operating_shifts WHERE id IN (${placeholders})`)
        .bind(...chunk)
        .all<{ id: string; tenant_id: string }>();
      for (const row of results || []) {
        if (row.tenant_id !== tenantId) throw new Error('FORBIDDEN_OPERATING_SHIFT_ID');
      }
    }
  }

  const existingShifts = await loadTenantOperatingShifts(db, tenantId);
  const existingShiftIds = existingShifts.map((s) => s.id);
  const incomingSet = new Set(incomingShiftIds);
  const removedShiftIds = existingShiftIds.filter((id) => !incomingSet.has(id));

  const statements: D1PreparedStatement[] = [];
  for (const sid of removedShiftIds) {
    statements.push(db.prepare('DELETE FROM tenant_operating_shifts WHERE tenant_id = ? AND id = ?').bind(tenantId, sid));
  }

  for (const shift of shifts) {
    statements.push(
      db.prepare(
        `INSERT INTO tenant_operating_shifts (id, tenant_id, name, i18n_json, shift_type, sort_order, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           i18n_json = excluded.i18n_json,
           shift_type = excluded.shift_type,
           sort_order = excluded.sort_order,
           is_active = excluded.is_active,
           updated_at = CURRENT_TIMESTAMP
         WHERE tenant_operating_shifts.tenant_id = excluded.tenant_id`
      ).bind(
        shift.id,
        tenantId,
        shift.name,
        serializeShiftI18n(shift.i18n),
        shift.shiftType,
        shift.sortOrder,
        shift.isActive ? 1 : 0
      )
    );

    const existingWins = existingShifts.find((e) => e.id === shift.id)?.windows || [];
    const windowIdsToDelete = new Set<string>();
    for (const ew of existingWins) {
      if (!ew.id) continue;
      const stillMatches = shift.windows.some(
        (nw) => nw.id === ew.id
      );
      if (!stillMatches) {
        windowIdsToDelete.add(ew.id);
      }
    }
    for (const oldWid of windowIdsToDelete) {
      statements.push(
        db.prepare('DELETE FROM tenant_operating_hours WHERE tenant_id = ? AND shift_id = ? AND id = ?').bind(tenantId, shift.id, oldWid)
      );
    }

    for (const w of shift.windows) {
      const wid = w.id || `${shift.id}_d${w.dayOfWeek}_${w.startTime.replace(':', '')}`;
      statements.push(
        db.prepare(
          `INSERT INTO tenant_operating_hours (id, tenant_id, shift_id, day_of_week, start_time, end_time, is_active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
             day_of_week = excluded.day_of_week,
             start_time = excluded.start_time,
             end_time = excluded.end_time,
             is_active = excluded.is_active,
             updated_at = CURRENT_TIMESTAMP
           WHERE tenant_operating_hours.tenant_id = excluded.tenant_id`
        ).bind(wid, tenantId, shift.id, w.dayOfWeek, w.startTime, w.endTime, w.isActive !== false ? 1 : 0)
      );
    }
  }

  await guardedScheduleBatch(db, tenantId, snapshot, statements, expectedRevision);

  return {
    shifts: await loadTenantOperatingShifts(db, tenantId),
  };
}

export function validateCatalogScheduleForItems(
  catalog: {
    products: any[];
    categories: any[];
    operatingShifts?: OperatingShiftDto[];
    categoryShiftLinks?: Array<{ categoryId: string; shiftId: string }>;
    itemShiftLinks?: Array<{ itemId: string; shiftId: string }>;
  },
  items: any[],
  targetTimeInput?: unknown
): { valid: boolean; unavailableItemNames: string[] } {
  const shifts = Array.isArray(catalog.operatingShifts) ? catalog.operatingShifts : [];
  if (shifts.length === 0) return { valid: true, unavailableItemNames: [] };

  const catShiftMap = new Map<string, string[]>();
  for (const link of catalog.categoryShiftLinks || []) {
    if (!catShiftMap.has(link.categoryId)) catShiftMap.set(link.categoryId, []);
    catShiftMap.get(link.categoryId)!.push(link.shiftId);
  }
  const itemShiftMap = new Map<string, string[]>();
  for (const link of catalog.itemShiftLinks || []) {
    if (!itemShiftMap.has(link.itemId)) itemShiftMap.set(link.itemId, []);
    itemShiftMap.get(link.itemId)!.push(link.shiftId);
  }

  const targetTime = targetTimeInput !== undefined && targetTimeInput !== null && String(targetTimeInput).trim() !== ''
    ? targetTimeInput
    : new Date();

  const unavailableItemNames: string[] = [];
  for (const raw of items || []) {
    const id = raw?.itemId || raw?.item_id;
    if (!id) continue;
    const product = catalog.products.find((p) => p.id === id);
    if (!product) continue;
    const category = catalog.categories.find((c) => c.id === product.category_id);
    const catModel = category
      ? {
          ...category,
          availabilityMode: category.availability_mode || category.availabilityMode || 'all_shifts',
          hideWhenUnavailable: Boolean(category.hide_when_unavailable ?? category.hideWhenUnavailable),
          shiftIds: catShiftMap.get(category.id) || category.shiftIds || [],
        }
      : null;
    const itemModel = {
      ...product,
      availabilityMode: product.availability_mode || product.availabilityMode || 'inherit',
      shiftIds: itemShiftMap.get(product.id) || product.shiftIds || [],
    };
    const res = MenuSchedule.resolveItemAvailability(catModel, itemModel, shifts, null, targetTime, { inclusiveEnd: true });
    if (!res.available) {
      unavailableItemNames.push(String(product.name || id));
    }
  }

  return {
    valid: unavailableItemNames.length === 0,
    unavailableItemNames,
  };
}
