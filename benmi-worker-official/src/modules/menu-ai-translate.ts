import type { Env } from "../types/env";
import type { TenantContext } from "../types/tenant";
import { json } from "../utils/http";
import { getTenantId } from "./menu";
import { resolveTenantContext } from "./tenant";
import { invalidateBootstrapCache } from "./bootstrap";
import {
  type EntityI18nMap,
  hasTableColumn,
  isMultilingualCanaryEnabled,
  mergeI18nMaps,
  parseI18nJson,
  serializeI18nJson,
} from "./menu-i18n";

export type TranslatableEntityType =
  | "category"
  | "item"
  | "option_group"
  | "option"
  | "tenant";

export interface TranslateEntryInput {
  type: TranslatableEntityType;
  id: string;
  name?: string;
  short_name?: string;
  title?: string;
  description?: string;
  badge_text?: string;
  promo_label?: string;
  sub_options?: string[];
  existingI18n?: EntityI18nMap;
}

export interface MenuAiTranslatePayload {
  tenant_id?: string;
  sourceLocale?: string;
  targetLocales?: string[];
  applyToDatabase?: boolean;
  onlyMissing?: boolean;
  entries?: TranslateEntryInput[];
}

export const CLOUDFLARE_TRANSLATION_MODELS = [
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
] as const;

export type TranslationModelProfile = "sea" | "cjk_en";

export const TRANSLATION_MODEL_PROFILES: Record<
  TranslationModelProfile,
  readonly string[]
> = {
  sea: [
    "@cf/google/gemma-4-26b-a4b-it",
    "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
    "@cf/qwen/qwen3-30b-a3b-fp8",
  ],
  cjk_en: [
    "@cf/qwen/qwen3-30b-a3b-fp8",
    "@cf/google/gemma-4-26b-a4b-it",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  ],
} as const;

const SEA_LOCALE_PREFIXES = new Set([
  "vi",
  "th",
  "id",
  "ms",
  "tl",
  "km",
  "lo",
  "my",
]);

export function resolveLocaleModelProfile(
  locale: string
): TranslationModelProfile {
  const base = String(locale || "")
    .trim()
    .toLowerCase()
    .split("-")[0];
  return SEA_LOCALE_PREFIXES.has(base) ? "sea" : "cjk_en";
}

export interface LocaleModelGroup {
  profile: TranslationModelProfile;
  locales: string[];
  modelChain: readonly string[];
}

export function groupTargetLocalesByModelProfile(
  targetLocales: string[]
): LocaleModelGroup[] {
  const buckets: Record<TranslationModelProfile, string[]> = {
    cjk_en: [],
    sea: [],
  };
  for (const locale of targetLocales) {
    const trimmed = String(locale || "").trim();
    if (!trimmed) continue;
    buckets[resolveLocaleModelProfile(trimmed)].push(trimmed);
  }
  const groups: LocaleModelGroup[] = [];
  for (const profile of ["cjk_en", "sea"] as const) {
    if (buckets[profile].length > 0) {
      groups.push({
        profile,
        locales: buckets[profile],
        modelChain: TRANSLATION_MODEL_PROFILES[profile],
      });
    }
  }
  return groups;
}

const CHUNK_SIZE = 24;
const BATCH_CONCURRENCY = 3;
const ALLOWED_STRING_FIELDS = [
  "name",
  "short_name",
  "title",
  "description",
  "badge_text",
  "promo_label",
  "brand_name",
  "store_address",
  "announcement",
  "delivery_policy",
] as const;

function entryKey(type: TranslatableEntityType, id: string): string {
  return `${type}:${id}`;
}

function normalizeTargetLocales(
  raw: unknown,
  sourceLocale: string,
  tenantSupportedLocales?: unknown
): string[] {
  const defaults = ["en", "vi"];
  const hasExplicit = Array.isArray(raw);
  const tenantList = Array.isArray(tenantSupportedLocales)
    ? tenantSupportedLocales.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const list = hasExplicit
    ? (raw as unknown[]).map((x) => String(x || "").trim()).filter(Boolean)
    : tenantList.length > 0
      ? tenantList
      : defaults;
  const filtered = Array.from(new Set(list)).filter(
    (loc) => loc !== sourceLocale
  );
  if (filtered.length > 0) return filtered;
  if (!hasExplicit && tenantList.length > 0) return [];
  return defaults.filter((l) => l !== sourceLocale);
}

function extractAiText(result: unknown): string {
  if (!result) return "";
  if (typeof result === "string") return result;
  const obj = result as Record<string, any>;
  if (typeof obj.response === "string") return obj.response;
  if (obj.result && typeof obj.result.response === "string") {
    return obj.result.response;
  }
  if (Array.isArray(obj.choices) && obj.choices[0]?.message?.content) {
    const content = obj.choices[0].message.content;
    if (typeof content === "string") return content;
  }
  return "";
}

function parseAiJsonResponse(rawText: string): Record<string, any> | null {
  const cleaned = String(rawText || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  if (!cleaned) return null;

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fallback to slicing first JSON object boundaries
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const sliced = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      if (sliced && typeof sliced === "object" && !Array.isArray(sliced)) {
        return sliced;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function buildEntryFields(entry: TranslateEntryInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const field of ALLOWED_STRING_FIELDS) {
    const val = (entry as unknown as Record<string, unknown>)[field];
    if (typeof val === "string" && val.trim() !== "") {
      fields[field] = val.trim();
    }
  }
  if (Array.isArray(entry.sub_options) && entry.sub_options.length > 0) {
    const cleanSubs = entry.sub_options
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    if (cleanSubs.length > 0) {
      fields.sub_options = cleanSubs;
    }
  }
  return fields;
}

function parseAiResultPayload(result: unknown): Record<string, any> | null {
  if (!result) return null;
  if (typeof result === "string") return parseAiJsonResponse(result);
  const obj = result as Record<string, any>;

  if (obj.translations && typeof obj.translations === "object" && !Array.isArray(obj.translations)) {
    return obj;
  }
  if (obj.response && typeof obj.response === "object" && !Array.isArray(obj.response)) {
    return obj.response as Record<string, any>;
  }
  if (obj.result && typeof obj.result.response === "object" && !Array.isArray(obj.result.response)) {
    return obj.result.response as Record<string, any>;
  }

  const rawText = extractAiText(result);
  return rawText ? parseAiJsonResponse(rawText) : null;
}

function computeTranslationMaxTokens(entryCount: number, targetLocaleCount: number): number {
  const safeEntries = Math.max(1, entryCount);
  const safeLocales = Math.max(1, targetLocaleCount);
  return Math.min(4096, Math.max(512, safeEntries * safeLocales * 140));
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const current = nextIndex++;
        results[current] = await worker(items[current], current);
      }
    })
  );

  return results;
}

function normalizeTranslatedMap(
  rawTranslations: unknown,
  entries: TranslateEntryInput[],
  targetLocales: string[]
): Record<string, EntityI18nMap> {
  const result: Record<string, EntityI18nMap> = {};
  const sourceObj =
    rawTranslations &&
    typeof rawTranslations === "object" &&
    !Array.isArray(rawTranslations)
      ? (rawTranslations as Record<string, any>)
      : {};
  const inner =
    sourceObj.translations &&
    typeof sourceObj.translations === "object" &&
    !Array.isArray(sourceObj.translations)
      ? (sourceObj.translations as Record<string, any>)
      : sourceObj;

  for (const entry of entries) {
    const key = entryKey(entry.type, entry.id);
    const rawLocaleMap = inner[key] ?? inner[entry.id];
    if (!rawLocaleMap || typeof rawLocaleMap !== "object") continue;

    const cleanMap: EntityI18nMap = {};
    for (const locale of targetLocales) {
      const rawEntry = rawLocaleMap[locale];
      if (!rawEntry || typeof rawEntry !== "object") continue;

      const localeOut: Record<string, string | Record<string, string>> = {};
      for (const field of ALLOWED_STRING_FIELDS) {
        const srcVal = (entry as unknown as Record<string, unknown>)[field];
        const trVal = rawEntry[field];
        if (
          typeof srcVal === "string" &&
          srcVal.trim() !== "" &&
          typeof trVal === "string" &&
          trVal.trim() !== ""
        ) {
          localeOut[field] = trVal.trim();
        }
      }

      if (Array.isArray(entry.sub_options) && entry.sub_options.length > 0) {
        const rawSubs = rawEntry.sub_options ?? rawEntry.subOptions;
        if (rawSubs && typeof rawSubs === "object" && !Array.isArray(rawSubs)) {
          const subOut: Record<string, string> = {};
          for (const subName of entry.sub_options) {
            const trSub = rawSubs[subName];
            if (typeof trSub === "string" && trSub.trim() !== "") {
              subOut[subName] = trSub.trim();
            }
          }
          if (Object.keys(subOut).length > 0) {
            localeOut.sub_options = subOut;
          }
        }
      }

      if (Object.keys(localeOut).length > 0) {
        cleanMap[locale] = localeOut;
      }
    }

    if (Object.keys(cleanMap).length > 0) {
      result[key] = cleanMap;
    }
  }

  return result;
}

async function runCloudflareTranslationBatch(
  ai: Ai,
  entries: TranslateEntryInput[],
  sourceLocale: string,
  targetLocales: string[],
  storeBrandName?: string,
  modelChain: readonly string[] = CLOUDFLARE_TRANSLATION_MODELS
): Promise<{ modelUsed: string; translations: Record<string, EntityI18nMap> }> {
  const compactItems = entries.map((entry) => ({
    key: entryKey(entry.type, entry.id),
    type: entry.type,
    fields: buildEntryFields(entry),
  }));

  const brandHint =
    storeBrandName && storeBrandName.trim()
      ? `Store brand context: "${storeBrandName.trim()}".`
      : "";

  const systemPrompt = [
    "You are an expert culinary and F&B POS menu translator.",
    brandHint,
    `Translate restaurant menu text accurately and naturally from "${sourceLocale}" into ${targetLocales
      .map((l) => `"${l}"`)
      .join(", ")}.`,
    "For Vietnamese (vi), use natural restaurant phrasing in pure Vietnamese without mixing English words unless proper nouns (e.g., Matsusaka).",
    "Keep currency numbers ($35, $100) and quantities accurate.",
    "Do NOT translate JSON keys or field names; keep item keys identical.",
    "Preserve allergen/topping clarity (e.g., No Onion, No Garlic, Mild Spice).",
    "For fields containing `sub_options` arrays, return `sub_options` as an object mapping EACH exact original sub-option string to its translated string.",
    "Output ONLY strict valid JSON directly without prose, explanations, or markdown fences.",
    `Schema: {"translations": { "<key>": { ${targetLocales
      .map((l) => `"${l}": { ...translated fields matching input... }`)
      .join(", ")} } }}`,
  ]
    .filter(Boolean)
    .join(" ");

  const userPrompt = JSON.stringify({
    sourceLocale,
    targetLocales,
    items: compactItems,
  });

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  const maxTokens = computeTranslationMaxTokens(entries.length, targetLocales.length);

  let lastError = "Unknown Workers AI failure";
  for (const model of modelChain) {
    try {
      let response: unknown;
      try {
        response = await ai.run(model as any, {
          messages,
          temperature: 0.2,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          reasoning_effort: "none",
          chat_template_kwargs: {
            enable_thinking: false,
            thinking: false,
          },
        });
      } catch (optErr) {
        const msg = optErr instanceof Error ? optErr.message : String(optErr);
        // Retry once with minimal standard parameters if a model rejects optional JSON/thinking hints.
        if (/invalid|schema|unsupported|property|reasoning|thinking|response_format/i.test(msg)) {
          response = await ai.run(model as any, {
            messages,
            temperature: 0.2,
            max_tokens: maxTokens,
          });
        } else {
          throw optErr;
        }
      }

      const parsed = parseAiResultPayload(response);
      if (!parsed) {
        lastError = `${model}: empty or non-JSON response`;
        continue;
      }

      const normalized = normalizeTranslatedMap(parsed, entries, targetLocales);
      if (Object.keys(normalized).length === 0) {
        lastError = `${model}: JSON parsed but zero matching keys produced`;
        continue;
      }

      return { modelUsed: model, translations: normalized };
    } catch (err) {
      lastError = `${model}: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  throw new Error(lastError);
}

function needsTranslation(
  existingRaw: unknown,
  targetLocales: string[],
  requiredFields: string[]
): boolean {
  const existing = parseI18nJson(existingRaw);
  for (const locale of targetLocales) {
    const entry = existing[locale];
    if (!entry) return true;
    for (const field of requiredFields) {
      const val =
        entry[field] ??
        (field === "title" ? entry.name : field === "name" ? entry.title : undefined);
      if (typeof val !== "string" || val.trim() === "") {
        return true;
      }
    }
  }
  return false;
}

async function loadUntranslatedCatalogEntries(
  db: D1Database,
  tenantId: string,
  targetLocales: string[],
  onlyMissing: boolean
): Promise<TranslateEntryInput[]> {
  const entries: TranslateEntryInput[] = [];
  const [hasCatI18n, hasItemI18n, hasGroupI18n, hasOptI18n] =
    await Promise.all([
      hasTableColumn(db, "menu_categories", "i18n_json"),
      hasTableColumn(db, "menu_items", "i18n_json"),
      hasTableColumn(db, "modifier_groups", "i18n_json"),
      hasTableColumn(db, "modifier_options", "i18n_json"),
    ]);

  const catRes = await db
    .prepare(
      `SELECT id, name, short_name${
        hasCatI18n ? ", i18n_json" : ""
      } FROM menu_categories WHERE tenant_id = ? ORDER BY sort_order ASC`
    )
    .bind(tenantId)
    .all<Record<string, any>>();

  for (const row of catRes.results || []) {
    if (!row.name) continue;
    const req = row.short_name ? ["name", "short_name"] : ["name"];
    if (!onlyMissing || needsTranslation(row.i18n_json, targetLocales, req)) {
      entries.push({
        type: "category",
        id: String(row.id),
        name: String(row.name),
        short_name: row.short_name ? String(row.short_name) : undefined,
        existingI18n: parseI18nJson(row.i18n_json),
      });
    }
  }

  const itemRes = await db
    .prepare(
      `SELECT id, name, description, badge_text${
        hasItemI18n ? ", i18n_json" : ""
      } FROM menu_items WHERE tenant_id = ? ORDER BY sort_order ASC`
    )
    .bind(tenantId)
    .all<Record<string, any>>();

  for (const row of itemRes.results || []) {
    if (!row.name) continue;
    const req = ["name"];
    if (row.description) req.push("description");
    if (row.badge_text) req.push("badge_text");
    if (!onlyMissing || needsTranslation(row.i18n_json, targetLocales, req)) {
      entries.push({
        type: "item",
        id: String(row.id),
        name: String(row.name),
        description: row.description ? String(row.description) : undefined,
        badge_text: row.badge_text ? String(row.badge_text) : undefined,
        existingI18n: parseI18nJson(row.i18n_json),
      });
    }
  }

  const groupRes = await db
    .prepare(
      `SELECT id, name${
        hasGroupI18n ? ", i18n_json" : ""
      } FROM modifier_groups WHERE tenant_id = ? ORDER BY sort_order ASC`
    )
    .bind(tenantId)
    .all<Record<string, any>>();

  for (const row of groupRes.results || []) {
    if (!row.name) continue;
    if (
      !onlyMissing ||
      needsTranslation(row.i18n_json, targetLocales, ["title"])
    ) {
      entries.push({
        type: "option_group",
        id: String(row.id),
        title: String(row.name),
        existingI18n: parseI18nJson(row.i18n_json),
      });
    }
  }

  const optRes = await db
    .prepare(
      `SELECT id, name, sub_options_json${
        hasOptI18n ? ", i18n_json" : ""
      } FROM modifier_options WHERE tenant_id = ? ORDER BY sort_order ASC`
    )
    .bind(tenantId)
    .all<Record<string, any>>();

  for (const row of optRes.results || []) {
    if (!row.name) continue;
    let subOptions: string[] | undefined;
    if (row.sub_options_json) {
      try {
        const parsedSubs =
          typeof row.sub_options_json === "string"
            ? JSON.parse(row.sub_options_json)
            : row.sub_options_json;
        if (Array.isArray(parsedSubs) && parsedSubs.length > 0) {
          subOptions = parsedSubs
            .map((s) =>
              typeof s === "string"
                ? s.trim()
                : s && typeof s === "object" && typeof s.name === "string"
                  ? s.name.trim()
                  : ""
            )
            .filter(Boolean);
          if (subOptions.length === 0) subOptions = undefined;
        }
      } catch {
        subOptions = undefined;
      }
    }

    if (
      !onlyMissing ||
      needsTranslation(row.i18n_json, targetLocales, ["name"])
    ) {
      entries.push({
        type: "option",
        id: String(row.id),
        name: String(row.name),
        sub_options: subOptions,
        existingI18n: parseI18nJson(row.i18n_json),
      });
    }
  }

  return entries;
}

const TABLE_BY_ENTITY_TYPE: Record<TranslatableEntityType, string> = {
  category: "menu_categories",
  item: "menu_items",
  option_group: "modifier_groups",
  option: "modifier_options",
  tenant: "tenant_config",
};

async function persistTranslationsToD1(
  db: D1Database,
  tenantId: string,
  entries: TranslateEntryInput[],
  translations: Record<string, EntityI18nMap>
): Promise<number> {
  const uniqueTables = Array.from(
    new Set(entries.map((e) => TABLE_BY_ENTITY_TYPE[e.type]))
  );
  const tableSupport = new Map<string, boolean>();
  await Promise.all(
    uniqueTables.map(async (tbl) => {
      tableSupport.set(tbl, await hasTableColumn(db, tbl, "i18n_json"));
    })
  );

  const entriesNeedingLookup = entries.filter((entry) => {
    const patch = translations[entryKey(entry.type, entry.id)];
    const table = TABLE_BY_ENTITY_TYPE[entry.type];
    return patch && Object.keys(patch).length > 0 && tableSupport.get(table) && !entry.existingI18n;
  });

  const existingByKey = new Map<string, EntityI18nMap>();
  if (entriesNeedingLookup.length > 0) {
    await Promise.all(
      entriesNeedingLookup.map(async (entry) => {
        const table = TABLE_BY_ENTITY_TYPE[entry.type];
        const idColumn = entry.type === "tenant" ? "tenant_id" : "id";
        const existingRow = await db
          .prepare(
            `SELECT i18n_json FROM ${table} WHERE tenant_id = ? AND ${idColumn} = ? LIMIT 1`
          )
          .bind(tenantId, entry.id)
          .first<{ i18n_json?: string }>();
        existingByKey.set(entryKey(entry.type, entry.id), parseI18nJson(existingRow?.i18n_json));
      })
    );
  }

  const statements: D1PreparedStatement[] = [];
  for (const entry of entries) {
    const key = entryKey(entry.type, entry.id);
    const patch = translations[key];
    if (!patch || Object.keys(patch).length === 0) continue;

    const table = TABLE_BY_ENTITY_TYPE[entry.type];
    if (!tableSupport.get(table)) continue;

    const existingMap = entry.existingI18n || existingByKey.get(key) || {};

    const merged = mergeI18nMaps(existingMap, patch);
    const serialized = serializeI18nJson(merged);

    if (entry.type === "tenant") {
      statements.push(
        db
          .prepare(
            `UPDATE tenant_config SET i18n_json = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?`
          )
          .bind(serialized, tenantId)
      );
    } else {
      statements.push(
        db
          .prepare(
            `UPDATE ${table} SET i18n_json = ? WHERE tenant_id = ? AND id = ?`
          )
          .bind(serialized, tenantId, entry.id)
      );
    }
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }
  return statements.length;
}

/**
 * POST /api/menu/ai-translate
 * Translates inline menu entries or backfills untranslated D1 menu records via
 * Cloudflare Workers AI (env.AI) directly.
 */
export async function handleMenuAiTranslate(
  request: Request,
  env: Env,
  preloadedTenantCtx?: TenantContext | null
): Promise<Response> {
  let body: MenuAiTranslatePayload;
  try {
    body = (await request.json()) as MenuAiTranslatePayload;
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  const url = new URL(request.url);
  const tenantId =
    url.searchParams.get("tenant_id")?.trim() ||
    (typeof body?.tenant_id === "string" ? body.tenant_id.trim() : "") ||
    getTenantId(request);

  const tenantCtx =
    preloadedTenantCtx ??
    (await resolveTenantContext(tenantId, env).catch(() => null));
  if (
    !isMultilingualCanaryEnabled(tenantId, env, {
      features: tenantCtx?.features || [],
    })
  ) {
    return json(
      {
        error: "FEATURE_LOCKED",
        feature: "multilingual",
        message: "Multilingual AI translation package is not enabled for this tenant.",
      },
      403
    );
  }

  if (!env.AI || typeof env.AI.run !== "function") {
    return json(
      {
        error: "CLOUDFLARE_AI_UNAVAILABLE",
        message: "Cloudflare Workers AI binding (env.AI) is not configured.",
      },
      503
    );
  }
  const sourceLocale =
    (typeof body.sourceLocale === "string" && body.sourceLocale.trim()) ||
    tenantCtx?.locale ||
    "zh-TW";
  const targetLocales = normalizeTargetLocales(
    body.targetLocales,
    sourceLocale,
    tenantCtx?.supportedLocales
  );
  const applyToDatabase = body.applyToDatabase === true;
  const onlyMissing = body.onlyMissing !== false;

  if (targetLocales.length === 0) {
    return json({
      ok: true,
      tenantId,
      sourceLocale,
      targetLocales: [],
      translatedCount: 0,
      persistedCount: 0,
      appliedToDatabase: applyToDatabase,
      translations: {},
      byId: {},
    });
  }

  let entries: TranslateEntryInput[] = Array.isArray(body.entries)
    ? body.entries
        .filter(
          (e): e is TranslateEntryInput =>
            Boolean(e && typeof e.type === "string" && typeof e.id === "string")
        )
        .filter((e) => Object.keys(buildEntryFields(e)).length > 0)
    : [];

  if (entries.length === 0 && applyToDatabase) {
    if (!env.DB) {
      return json({ error: "DB_UNAVAILABLE" }, 503);
    }
    entries = await loadUntranslatedCatalogEntries(
      env.DB,
      tenantId,
      targetLocales,
      onlyMissing
    );
    if (entries.length === 0) {
      return json({
        ok: true,
        tenantId,
        sourceLocale,
        targetLocales,
        translatedCount: 0,
        persistedCount: 0,
        appliedToDatabase: true,
        translations: {},
        byId: {},
      });
    }
  }

  if (entries.length === 0) {
    return json(
      { error: "NO_ENTRIES", message: "No translatable entries provided." },
      400
    );
  }

  const allTranslations: Record<string, EntityI18nMap> = {};
  const byId: Record<string, EntityI18nMap> = {};
  let modelUsed: string = CLOUDFLARE_TRANSLATION_MODELS[0];
  const modelsUsedSet = new Set<string>();
  const modelByLocale: Record<string, string> = {};

  try {
    const localeGroups = groupTargetLocalesByModelProfile(targetLocales);
    const batchTasks: Array<{
      chunk: TranslateEntryInput[];
      group: LocaleModelGroup;
    }> = [];

    for (const group of localeGroups) {
      const groupEntries =
        applyToDatabase && onlyMissing
          ? entries.filter((entry) => {
              if (!entry.existingI18n) return true;
              const reqFields =
                entry.type === "option_group" ? ["title"] : ["name"];
              return needsTranslation(
                entry.existingI18n,
                group.locales,
                reqFields
              );
            })
          : entries;
      for (let i = 0; i < groupEntries.length; i += CHUNK_SIZE) {
        batchTasks.push({
          chunk: groupEntries.slice(i, i + CHUNK_SIZE),
          group,
        });
      }
    }

    const batchResults = await runWithConcurrency(
      batchTasks,
      BATCH_CONCURRENCY,
      async ({ chunk, group }) => ({
        chunk,
        locales: group.locales,
        batchResult: await runCloudflareTranslationBatch(
          env.AI!,
          chunk,
          sourceLocale,
          group.locales,
          tenantCtx?.brandName,
          group.modelChain
        ),
      })
    );

    for (const { chunk, locales, batchResult } of batchResults) {
      modelUsed = batchResult.modelUsed;
      modelsUsedSet.add(batchResult.modelUsed);
      for (const loc of locales) {
        modelByLocale[loc] = batchResult.modelUsed;
      }
      for (const entry of chunk) {
        const key = entryKey(entry.type, entry.id);
        const tr = batchResult.translations[key];
        if (tr) {
          allTranslations[key] = mergeI18nMaps(allTranslations[key], tr);
          byId[entry.id] = mergeI18nMaps(byId[entry.id], tr);
        }
      }
    }
  } catch (err) {
    return json(
      {
        error: "AI_TRANSLATION_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
      502
    );
  }

  let persistedCount = 0;
  if (applyToDatabase && env.DB) {
    persistedCount = await persistTranslationsToD1(
      env.DB,
      tenantId,
      entries,
      allTranslations
    );
    await invalidateBootstrapCache(tenantId, env);
  }

  return json({
    ok: true,
    modelUsed,
    modelsUsed: Array.from(modelsUsedSet),
    modelByLocale,
    tenantId,
    sourceLocale,
    targetLocales,
    translatedCount: Object.keys(allTranslations).length,
    persistedCount,
    appliedToDatabase: applyToDatabase,
    translations: allTranslations,
    byId,
  });
}
