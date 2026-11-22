import MenuSchedule from '../../../js/menu-schedule.js';

export interface OperatingShiftWindowDto {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}

export type ShiftDisplayMode = 'switcher' | 'schedule_only' | 'qr_only';
export type ShiftDiningPolicy = 'inherit' | 'both' | 'takeaway_only' | 'dine_in_only';
export type QrChannelDiningPolicy = 'customer_choice' | 'dine_in' | 'takeaway';

export interface OperatingShiftDto {
  id: string;
  name: string;
  i18n?: Record<string, { name?: string }>;
  shiftType: 'operating' | 'menu_window';
  displayMode?: ShiftDisplayMode;
  diningPolicy?: ShiftDiningPolicy;
  sortOrder: number;
  isActive: boolean;
  windows: OperatingShiftWindowDto[];
}

export interface QrChannelDto {
  id: string;
  code: string;
  label: string;
  i18n?: Record<string, { label?: string; name?: string }>;
  diningPolicy: QrChannelDiningPolicy;
  defaultShiftId?: string | null;
  defaultLocale?: string | null;
  sortOrder: number;
  isActive: boolean;
  orders30d?: number;
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

function normalizeDisplayMode(raw: unknown): ShiftDisplayMode {
  return raw === 'schedule_only' || raw === 'qr_only' ? raw : 'switcher';
}

function normalizeDiningPolicy(raw: unknown): ShiftDiningPolicy {
  return raw === 'both' || raw === 'takeaway_only' || raw === 'dine_in_only' ? raw : 'inherit';
}

function normalizeQrChannelDiningPolicy(raw: unknown): QrChannelDiningPolicy {
  return raw === 'dine_in' || raw === 'takeaway' ? raw : 'customer_choice';
}

export async function loadTenantOperatingShifts(db: D1Database | undefined | null, tenantId: string): Promise<OperatingShiftDto[]> {
  if (!db) return [];
  const [hasShiftsTable, hasHoursTable, hasDisplayCol, hasPolicyCol] = await Promise.all([
    hasDbTable(db, 'tenant_operating_shifts'),
    hasDbTable(db, 'tenant_operating_hours'),
    hasDbColumn(db, 'tenant_operating_shifts', 'display_mode'),
    hasDbColumn(db, 'tenant_operating_shifts', 'dining_policy'),
  ]);
  if (!hasShiftsTable || !hasHoursTable) return [];

  const shiftCols = [
    'id',
    'name',
    'i18n_json',
    'shift_type',
    ...(hasDisplayCol ? ['display_mode'] : []),
    ...(hasPolicyCol ? ['dining_policy'] : []),
    'sort_order',
    'is_active',
  ].join(', ');

  const [shiftsRes, hoursRes] = await db.batch([
    db.prepare(
      `SELECT ${shiftCols}
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
      displayMode: normalizeDisplayMode(s.display_mode),
      diningPolicy: normalizeDiningPolicy(s.dining_policy),
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
      displayMode: normalizeDisplayMode(raw.displayMode ?? raw.display_mode),
      diningPolicy: normalizeDiningPolicy(raw.diningPolicy ?? raw.dining_policy),
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

  const [hasDisplayCol, hasPolicyCol] = await Promise.all([
    hasDbColumn(db, 'tenant_operating_shifts', 'display_mode'),
    hasDbColumn(db, 'tenant_operating_shifts', 'dining_policy'),
  ]);

  const statements: D1PreparedStatement[] = [];
  for (const sid of removedShiftIds) {
    statements.push(db.prepare('DELETE FROM tenant_operating_shifts WHERE tenant_id = ? AND id = ?').bind(tenantId, sid));
  }

  for (const shift of shifts) {
    const extraCols = [
      ...(hasDisplayCol ? ['display_mode'] : []),
      ...(hasPolicyCol ? ['dining_policy'] : []),
    ];
    const extraPlaceholders = extraCols.map(() => '?').join(', ');
    const extraUpdates = extraCols.map((col) => `${col} = excluded.${col}`).join(',\n           ');
    const extraBindings = [
      ...(hasDisplayCol ? [normalizeDisplayMode(shift.displayMode)] : []),
      ...(hasPolicyCol ? [normalizeDiningPolicy(shift.diningPolicy)] : []),
    ];

    statements.push(
      db.prepare(
        `INSERT INTO tenant_operating_shifts (id, tenant_id, name, i18n_json, shift_type, ${extraCols.length ? `${extraCols.join(', ')}, ` : ''}sort_order, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ${extraCols.length ? `${extraPlaceholders}, ` : ''}?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           i18n_json = excluded.i18n_json,
           shift_type = excluded.shift_type,
           ${extraUpdates ? `${extraUpdates},\n           ` : ''}sort_order = excluded.sort_order,
           is_active = excluded.is_active,
           updated_at = CURRENT_TIMESTAMP
         WHERE tenant_operating_shifts.tenant_id = excluded.tenant_id`
      ).bind(
        shift.id,
        tenantId,
        shift.name,
        serializeShiftI18n(shift.i18n),
        shift.shiftType,
        ...extraBindings,
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

function parseChannelI18n(raw: unknown): Record<string, { label?: string; name?: string }> {
  if (!raw) return {};
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '{}') return {};
    try { parsed = JSON.parse(trimmed); } catch { return {}; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, { label?: string; name?: string }> = {};
  for (const [locale, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const label = typeof (entry as any).label === 'string'
        ? (entry as any).label.trim()
        : (typeof (entry as any).name === 'string' ? (entry as any).name.trim() : '');
      if (label) out[locale] = { label, name: label };
    }
  }
  return out;
}

function normalizeChannelCode(rawCode: unknown, fallbackLabel: string): string {
  const candidate = typeof rawCode === 'string' && rawCode.trim() ? rawCode.trim() : fallbackLabel;
  const ascii = candidate
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return ascii || `ch_${crypto.randomUUID().slice(0, 8)}`;
}

export async function loadTenantQrChannels(
  db: D1Database | undefined | null,
  tenantId: string,
  options?: { includeOrderCounts?: boolean }
): Promise<QrChannelDto[]> {
  if (!db || !tenantId || !await hasDbTable(db, 'tenant_qr_channels')) return [];
  const hasChannelPolicy = await hasDbColumn(db, 'tenant_qr_channels', 'dining_policy');
  const cols = [
    'id',
    'code',
    'label',
    'i18n_json',
    ...(hasChannelPolicy ? ['dining_policy'] : []),
    'default_shift_id',
    'default_locale',
    'sort_order',
    'is_active',
  ].join(', ');
  const res = await db.prepare(
    `SELECT ${cols}
     FROM tenant_qr_channels
     WHERE tenant_id = ?
     ORDER BY sort_order ASC, rowid ASC`
  ).bind(tenantId).all<any>();
  const rows = Array.isArray(res?.results) ? res.results : [];

  const countsByChannelId = new Map<string, number>();
  if (options?.includeOrderCounts && rows.length > 0 && await hasDbColumn(db, 'orders', 'channel_id')) {
    const cntRes = await db.prepare(
      `SELECT channel_id, COUNT(DISTINCT key) AS cnt
       FROM orders
       WHERE tenant_id = ?
         AND channel_id IS NOT NULL
         AND created_at >= datetime('now', '-30 days')
         AND status NOT IN ('REJECTED', 'FORCE_REJECT', 'EXPIRED')
       GROUP BY channel_id`
    ).bind(tenantId).all<{ channel_id: string; cnt: number }>();
    for (const r of cntRes?.results || []) {
      if (r.channel_id) countsByChannelId.set(String(r.channel_id), Number(r.cnt) || 0);
    }
  }

  return rows.map((r, idx) => {
    const i18n = parseChannelI18n(r.i18n_json);
    const id = String(r.id);
    return {
      id,
      code: String(r.code),
      label: String(r.label),
      ...(Object.keys(i18n).length > 0 ? { i18n } : {}),
      diningPolicy: normalizeQrChannelDiningPolicy(r.dining_policy),
      defaultShiftId: r.default_shift_id ? String(r.default_shift_id) : null,
      defaultLocale: r.default_locale ? String(r.default_locale) : null,
      sortOrder: Number(r.sort_order ?? idx),
      isActive: r.is_active !== 0,
      ...(options?.includeOrderCounts ? { orders30d: countsByChannelId.get(id) ?? 0 } : {}),
    };
  });
}

export async function saveTenantQrChannel(
  db: D1Database,
  tenantId: string,
  raw: Record<string, unknown>
): Promise<QrChannelDto> {
  if (!await hasDbTable(db, 'tenant_qr_channels')) {
    throw new ScheduleIntegrityError('QR_CHANNELS_SCHEMA_NOT_READY', 503);
  }
  const hasChannelPolicy = await hasDbColumn(db, 'tenant_qr_channels', 'dining_policy');
  const requestedId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
  let existingRow: any = null;
  if (requestedId) {
    const owner = await db.prepare('SELECT * FROM tenant_qr_channels WHERE id = ?').bind(requestedId).first<any>();
    if (owner && owner.tenant_id !== tenantId) throw new ScheduleIntegrityError('FORBIDDEN_QR_CHANNEL_ID', 403);
    existingRow = owner || null;
  }

  const label = typeof raw.label === 'string'
    ? raw.label.trim().slice(0, 80)
    : (existingRow?.label ? String(existingRow.label) : '');
  if (!label) throw new ScheduleIntegrityError('QR_CHANNEL_LABEL_REQUIRED', 400);

  const id = requestedId || `ch_${tenantId}_${crypto.randomUUID().slice(0, 8)}`;
  const rawCode = raw.code !== undefined ? raw.code : existingRow?.code;
  let code = normalizeChannelCode(rawCode, label);
  const codeConflict = await db.prepare('SELECT id FROM tenant_qr_channels WHERE tenant_id = ? AND code = ? AND id <> ?')
    .bind(tenantId, code, id).first<{ id: string }>();
  if (codeConflict) {
    code = `${code.slice(0, 31)}_${crypto.randomUUID().slice(0, 4)}`;
  }

  let defaultShiftId: string | null = raw.defaultShiftId !== undefined
    ? (typeof raw.defaultShiftId === 'string' && raw.defaultShiftId.trim() ? raw.defaultShiftId.trim() : null)
    : (raw.default_shift_id !== undefined
        ? (typeof raw.default_shift_id === 'string' && raw.default_shift_id.trim() ? raw.default_shift_id.trim() : null)
        : (existingRow?.default_shift_id ? String(existingRow.default_shift_id) : null));
  if (defaultShiftId) {
    const ownedShift = await db.prepare('SELECT id FROM tenant_operating_shifts WHERE tenant_id = ? AND id = ?')
      .bind(tenantId, defaultShiftId).first<{ id: string }>();
    if (!ownedShift) throw new ScheduleIntegrityError('INVALID_SHIFT_ID', 400);
  }

  const rawLocaleInput = raw.defaultLocale !== undefined
    ? raw.defaultLocale
    : (raw.default_locale !== undefined ? raw.default_locale : existingRow?.default_locale);
  const rawLocale = typeof rawLocaleInput === 'string' ? rawLocaleInput.trim() : '';
  const defaultLocale = rawLocale && ['zh-TW', 'en', 'vi'].includes(rawLocale) ? rawLocale : null;

  const rawDiningPolicy = raw.diningPolicy !== undefined
    ? raw.diningPolicy
    : (raw.dining_policy !== undefined ? raw.dining_policy : existingRow?.dining_policy);
  const diningPolicy = normalizeQrChannelDiningPolicy(rawDiningPolicy);

  const rawSortOrder = raw.sortOrder ?? raw.sort_order ?? existingRow?.sort_order ?? 0;
  const sortOrder = Number.isFinite(Number(rawSortOrder)) ? Number(rawSortOrder) : 0;
  const isActive = raw.isActive !== undefined
    ? Boolean(raw.isActive)
    : (raw.is_active !== undefined ? Boolean(raw.is_active) : (existingRow ? existingRow.is_active !== 0 : true));
  const i18n = parseChannelI18n(raw.i18n ?? raw.i18n_json ?? existingRow?.i18n_json);

  const policyCol = hasChannelPolicy ? ', dining_policy' : '';
  const policyPlaceholder = hasChannelPolicy ? ', ?' : '';
  const policyUpdate = hasChannelPolicy ? ',\n       dining_policy = excluded.dining_policy' : '';
  const policyBinding = hasChannelPolicy ? [diningPolicy] : [];

  await db.prepare(
    `INSERT INTO tenant_qr_channels (id, tenant_id, code, label, i18n_json${policyCol}, default_shift_id, default_locale, sort_order, is_active, updated_at)
     VALUES (?, ?, ?, ?, ?${policyPlaceholder}, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       code = excluded.code,
       label = excluded.label,
       i18n_json = excluded.i18n_json${policyUpdate},
       default_shift_id = excluded.default_shift_id,
       default_locale = excluded.default_locale,
       sort_order = excluded.sort_order,
       is_active = excluded.is_active,
       updated_at = CURRENT_TIMESTAMP
     WHERE tenant_qr_channels.tenant_id = excluded.tenant_id`
  ).bind(id, tenantId, code, label, JSON.stringify(i18n), ...policyBinding, defaultShiftId, defaultLocale, sortOrder, isActive ? 1 : 0).run();

  const saved = (await loadTenantQrChannels(db, tenantId, { includeOrderCounts: true })).find((c) => c.id === id);
  if (!saved) throw new ScheduleIntegrityError('QR_CHANNEL_SAVE_FAILED', 500);
  return saved;
}

export async function deleteTenantQrChannel(db: D1Database, tenantId: string, id: string): Promise<boolean> {
  if (!id || !await hasDbTable(db, 'tenant_qr_channels')) return false;
  const res = await db.prepare('DELETE FROM tenant_qr_channels WHERE tenant_id = ? AND id = ?').bind(tenantId, id).run();
  return Boolean(res?.meta?.changes);
}

export interface OrderAttributionPolicyResult {
  channelId: string | null;
  channelLabel: string | null;
  channelDiningPolicy: QrChannelDiningPolicy | null;
  shiftId: string | null;
  diningPolicy: ShiftDiningPolicy;
}

export async function resolveOrderQrChannelAndShiftPolicy(
  db: D1Database | undefined | null,
  tenantId: string,
  input: Record<string, unknown>
): Promise<OrderAttributionPolicyResult> {
  let channelId: string | null = null;
  let channelLabel: string | null = null;
  let channelDiningPolicy: QrChannelDiningPolicy | null = null;
  let shiftId: string | null = null;
  let diningPolicy: ShiftDiningPolicy = 'inherit';

  if (!db) return { channelId, channelLabel, channelDiningPolicy, shiftId, diningPolicy };

  const rawChId = typeof input.channel_id === 'string' ? input.channel_id.trim()
    : (typeof input.channelId === 'string' ? input.channelId.trim() : '');
  const rawChCode = typeof input.channel_code === 'string' ? input.channel_code.trim()
    : (typeof input.channelCode === 'string' ? input.channelCode.trim() : '');
  const rawChLabel = typeof input.channel_label === 'string' ? input.channel_label.trim()
    : (typeof input.channelLabel === 'string' ? input.channelLabel.trim() : '');

  if ((rawChId || rawChCode) && await hasDbTable(db, 'tenant_qr_channels')) {
    const hasChPolicy = await hasDbColumn(db, 'tenant_qr_channels', 'dining_policy');
    const selectCols = `id, label, default_shift_id${hasChPolicy ? ', dining_policy' : ''}`;
    const row = rawChId
      ? await db.prepare(`SELECT ${selectCols} FROM tenant_qr_channels WHERE tenant_id = ? AND id = ? AND is_active = 1 LIMIT 1`)
          .bind(tenantId, rawChId).first<{ id: string; label: string; default_shift_id: string | null; dining_policy?: string }>()
      : await db.prepare(`SELECT ${selectCols} FROM tenant_qr_channels WHERE tenant_id = ? AND code = ? AND is_active = 1 LIMIT 1`)
          .bind(tenantId, rawChCode).first<{ id: string; label: string; default_shift_id: string | null; dining_policy?: string }>();
    if (row) {
      channelId = row.id;
      channelLabel = row.label;
      channelDiningPolicy = normalizeQrChannelDiningPolicy(row.dining_policy);
      if (!input.shift_id && !input.shiftId && row.default_shift_id) {
        shiftId = row.default_shift_id;
      }
    }
  }
  if (!channelLabel && rawChLabel) {
    channelLabel = rawChLabel.slice(0, 80);
  }

  const rawShiftId = typeof input.shift_id === 'string' ? input.shift_id.trim()
    : (typeof input.shiftId === 'string' ? input.shiftId.trim() : (shiftId || ''));
  if (rawShiftId && await hasDbTable(db, 'tenant_operating_shifts')) {
    const hasPolicy = await hasDbColumn(db, 'tenant_operating_shifts', 'dining_policy');
    const shiftRow = await db.prepare(
      `SELECT id${hasPolicy ? ', dining_policy' : ''} FROM tenant_operating_shifts WHERE tenant_id = ? AND id = ? LIMIT 1`
    ).bind(tenantId, rawShiftId).first<{ id: string; dining_policy?: string }>();
    if (shiftRow) {
      shiftId = shiftRow.id;
      diningPolicy = normalizeDiningPolicy(shiftRow.dining_policy);
    } else {
      shiftId = null;
    }
  }

  return { channelId, channelLabel, channelDiningPolicy, shiftId, diningPolicy };
}

export function resolveEffectiveOrderDiningOption(
  rawRequestedDining: unknown,
  attribution: OrderAttributionPolicyResult,
  options: { allowDineInFeature: boolean; allowDineInSetting?: boolean }
):
  | { ok: true; diningOption: 'dine_in' | 'takeaway' }
  | { ok: false; status: 409; error: string; message: string; shiftId: string | null; diningPolicy: string } {
  const requested = rawRequestedDining === 'dine_in' ? 'dine_in' : (rawRequestedDining === 'takeaway' ? 'takeaway' : null);
  const storeAllowsDineIn = options.allowDineInSetting !== false;

  if (attribution.diningPolicy === 'takeaway_only') {
    if (requested === 'dine_in') {
      return {
        ok: false,
        status: 409,
        error: 'SHIFT_DINING_OPTION_FORBIDDEN',
        message: 'Selected menu shift/collection only permits takeaway orders',
        shiftId: attribution.shiftId,
        diningPolicy: attribution.diningPolicy,
      };
    }
    return { ok: true, diningOption: 'takeaway' };
  }

  if (attribution.diningPolicy === 'dine_in_only' && storeAllowsDineIn && (options.allowDineInFeature || attribution.channelDiningPolicy !== null)) {
    if (requested === 'takeaway') {
      return {
        ok: false,
        status: 409,
        error: 'SHIFT_DINING_OPTION_FORBIDDEN',
        message: 'Selected menu shift/collection only permits dine-in orders',
        shiftId: attribution.shiftId,
        diningPolicy: attribution.diningPolicy,
      };
    }
    return { ok: true, diningOption: 'dine_in' };
  }

  if (attribution.channelDiningPolicy === 'takeaway') {
    if (requested === 'dine_in') {
      return {
        ok: false,
        status: 409,
        error: 'CHANNEL_DINING_OPTION_FORBIDDEN',
        message: 'Selected QR channel only permits takeaway orders',
        shiftId: attribution.shiftId,
        diningPolicy: attribution.channelDiningPolicy,
      };
    }
    return { ok: true, diningOption: 'takeaway' };
  }

  if (attribution.channelDiningPolicy === 'dine_in' && storeAllowsDineIn) {
    if (requested === 'takeaway') {
      return {
        ok: false,
        status: 409,
        error: 'CHANNEL_DINING_OPTION_FORBIDDEN',
        message: 'Selected QR channel only permits dine-in orders',
        shiftId: attribution.shiftId,
        diningPolicy: attribution.channelDiningPolicy,
      };
    }
    return { ok: true, diningOption: 'dine_in' };
  }

  if (attribution.channelDiningPolicy === 'customer_choice' && storeAllowsDineIn) {
    return { ok: true, diningOption: requested === 'dine_in' ? 'dine_in' : 'takeaway' };
  }

  if (requested === 'dine_in' && options.allowDineInFeature && storeAllowsDineIn) {
    return { ok: true, diningOption: 'dine_in' };
  }
  return { ok: true, diningOption: 'takeaway' };
}
