import type { Env } from "../types/env";

export type SupportedLocale = "zh-TW" | "en" | "vi" | string;

export interface EntityI18nEntry {
  name?: string;
  short_name?: string;
  shortName?: string;
  title?: string;
  description?: string;
  badge_text?: string;
  promo_label?: string;
  sub_options?: Record<string, string>;
  brand_name?: string;
  store_address?: string;
  announcement?: string;
  delivery_policy?: string;
  [key: string]: string | Record<string, string> | undefined;
}

export type EntityI18nMap = Record<string, EntityI18nEntry>;

const ALLOWED_LOCALES_DEFAULT = ["zh-TW", "en"];

function cleanEntry(raw: unknown): EntityI18nEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: EntityI18nEntry = {};
  let hasField = false;

  for (const [k, v] of Object.entries(src)) {
    if (k === "sub_options" || k === "subOptions") {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const subOut: Record<string, string> = {};
        let hasSub = false;
        for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
          if (typeof sv === "string" && sv.trim() !== "") {
            subOut[sk] = sv.trim();
            hasSub = true;
          }
        }
        if (hasSub) {
          out.sub_options = subOut;
          hasField = true;
        }
      }
      continue;
    }

    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed !== "") {
        out[k] = trimmed;
        hasField = true;
      }
    }
  }

  return hasField ? out : null;
}

/**
 * Safely parse an i18n_json string or pre-parsed object into a normalized map.
 */
export function parseI18nJson(raw: unknown): EntityI18nMap {
  if (!raw) return {};
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "{}") return {};
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {};
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const result: EntityI18nMap = {};
  for (const [locale, entry] of Object.entries(parsed as Record<string, unknown>)) {
    const cleaned = cleanEntry(entry);
    if (cleaned) {
      result[String(locale).trim()] = cleaned;
    }
  }
  return result;
}

/**
 * Normalize and serialize an i18n map into compact JSON text for D1 storage.
 */
export function serializeI18nJson(input: unknown): string {
  const normalized = parseI18nJson(input);
  return Object.keys(normalized).length > 0 ? JSON.stringify(normalized) : "{}";
}

/**
 * Merge patch translations on top of an existing i18n map.
 */
export function mergeI18nMaps(base: unknown, patch: unknown): EntityI18nMap {
  const target = parseI18nJson(base);
  const incoming = parseI18nJson(patch);
  for (const [locale, entry] of Object.entries(incoming)) {
    const existing = target[locale] || {};
    const mergedSubOptions =
      existing.sub_options || entry.sub_options
        ? { ...(existing.sub_options || {}), ...(entry.sub_options || {}) }
        : undefined;
    target[locale] = {
      ...existing,
      ...entry,
      ...(mergedSubOptions ? { sub_options: mergedSubOptions } : {}),
    };
  }
  return target;
}

export function hasAnyI18nTranslation(input: unknown): boolean {
  return Object.keys(parseI18nJson(input)).length > 0;
}

/**
 * Parse supported_locales from tenant_config into a de-duplicated ordered array.
 */
export function parseSupportedLocales(
  raw: unknown,
  fallback: string[] = ALLOWED_LOCALES_DEFAULT
): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = raw.split(",").map((s) => s.trim());
    }
  }

  const normalized = Array.from(
    new Set(
      list
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  );
  return normalized.length > 0 ? normalized : [...fallback];
}

function parseTenantList(raw?: string): string[] {
  if (!raw || typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x || "").trim()).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Package entitlement & canary rollout check: enables multilingual UI, POS controls,
 * and AI translation strictly when the tenant subscribes to the `multilingual` (or `i18n`)
 * package feature or is explicitly listed in `MULTILINGUAL_TENANTS` (e.g., `["blab_demo"]`).
 */
export function isMultilingualCanaryEnabled(
  tenantId: string,
  env: Env,
  options?: { features?: string[]; hasCatalogI18n?: boolean }
): boolean {
  const features = options?.features || [];
  if (features.includes("multilingual") || features.includes("i18n")) {
    return true;
  }
  const canaryTenants = parseTenantList(env.MULTILINGUAL_TENANTS);
  if (canaryTenants.includes(tenantId) || canaryTenants.includes("*")) {
    return true;
  }
  return false;
}

/**
 * Resolve a localized field value for an entity with fallback to primary canonical text.
 */
export function resolveLocalizedField(
  entity:
    | {
        i18n?: EntityI18nMap | null;
        name?: string | null;
        title?: string | null;
        [key: string]: unknown;
      }
    | null
    | undefined,
  locale: string | null | undefined,
  field: string = "name",
  fallbackValue?: string | null
): string {
  const defaultText = String(
    fallbackValue ?? (entity ? entity[field] : undefined) ?? entity?.name ?? entity?.title ?? ""
  );
  if (!entity || !locale) return defaultText;
  const map = parseI18nJson(entity.i18n);
  const direct = map[locale];
  const shortCode = locale.includes("-") ? locale.split("-")[0] : "";
  const entry = direct || (shortCode ? map[shortCode] : undefined);
  if (!entry) return defaultText;

  const val = entry[field];
  if (typeof val === "string" && val.trim() !== "") {
    return val.trim();
  }
  if (field === "title" && typeof entry.name === "string" && entry.name.trim() !== "") {
    return entry.name.trim();
  }
  if (field === "name" && typeof entry.title === "string" && entry.title.trim() !== "") {
    return entry.title.trim();
  }
  return defaultText;
}

const tableColumnCache = new WeakMap<object, Map<string, Set<string>>>();

/**
 * Inspect SQLite table columns safely and cache per D1Database instance so
 * unmigrated unit-test fixtures never fail on newly added columns like i18n_json.
 */
export async function getTableColumns(
  db: D1Database | undefined | null,
  tableName: string
): Promise<Set<string>> {
  if (!db) return new Set();
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, "");
  let byTable = tableColumnCache.get(db as unknown as object);
  if (!byTable) {
    byTable = new Map();
    tableColumnCache.set(db as unknown as object, byTable);
  }
  const cached = byTable.get(safeTable);
  if (cached) return cached;

  const cols = new Set<string>();
  try {
    const stmt: any = db.prepare(`PRAGMA table_info(${safeTable})`);
    const bound: any = typeof stmt?.bind === "function" ? stmt.bind() : stmt;
    const res = typeof bound?.all === "function" ? await bound.all() : null;
    for (const row of res?.results || []) {
      if (row?.name) cols.add(String(row.name));
    }
  } catch {
    // Custom mock DB without PRAGMA support: keep empty set cleanly.
  }

  // Only memoize non-empty metadata; empty could reflect a mock error on first probe
  if (cols.size > 0) {
    byTable.set(safeTable, cols);
  }
  return cols;
}

export async function hasTableColumn(
  db: D1Database | undefined | null,
  tableName: string,
  columnName: string
): Promise<boolean> {
  if (!db) return false;
  const cols = await getTableColumns(db, tableName);
  return cols.has(columnName);
}
