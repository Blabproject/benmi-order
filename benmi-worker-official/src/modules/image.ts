import { Env } from '../types/env';
import { json, corsHeaders } from '../utils/http';
import { getTenantId } from './menu';
import { invalidateBootstrapCache } from './bootstrap';

const LEGACY_PREFIXES = ["main", "snack", "small", "large", "combo", "drinks", "topping"];

export function extractBareName(name: string): string {
  if (!name) return "";
  if (name.startsWith("product:") || name === "store_logo") return name;
  if (name.includes("_")) {
    const bare = name.split("_").slice(1).join("_");
    return bare || name;
  }
  return name;
}

export function buildR2Key(tenantId: string, name: string): string {
  return `tenants/${encodeURIComponent(tenantId)}/images/${encodeURIComponent(name)}`;
}

function decodeDataUri(dataUri: string): { mime: string; binary: Uint8Array } | null {
  const match = dataUri.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return null;
  const mime = match[1] || "image/webp";
  const base64 = match[2];
  const binaryStr = atob(base64);
  const binary = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    binary[i] = binaryStr.charCodeAt(i);
  }
  return { mime, binary };
}

export async function upsertTenantImageInR2AndD1(
  env: Env,
  tenantId: string,
  name: string,
  binary: Uint8Array,
  contentType: string
): Promise<{ r2Key: string; etag: string | null }> {
  const r2Key = buildR2Key(tenantId, name);
  const bareName = extractBareName(name);
  let etag: string | null = null;

  if (env.IMAGES_BUCKET) {
    const putObj = await env.IMAGES_BUCKET.put(r2Key, binary, {
      httpMetadata: { contentType }
    });
    etag = putObj?.httpEtag || null;
  }

  if (env.DB) {
    await env.DB.prepare(
      `INSERT INTO tenant_images (tenant_id, name, bare_name, r2_key, content_type, byte_size, etag, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(tenant_id, name) DO UPDATE SET
         bare_name = excluded.bare_name,
         r2_key = excluded.r2_key,
         content_type = excluded.content_type,
         byte_size = excluded.byte_size,
         etag = excluded.etag,
         updated_at = datetime('now')`
    ).bind(tenantId, name, bareName, r2Key, contentType, binary.byteLength, etag).run();
  }

  return { r2Key, etag };
}

export async function deleteTenantImageFromR2AndD1(
  env: Env,
  tenantId: string,
  name: string
): Promise<string[]> {
  const bareName = extractBareName(name);
  const removedNames: string[] = [name];
  if (bareName && bareName !== name) removedNames.push(bareName);

  if (env.DB) {
    try {
      const existing = await env.DB.prepare(
        `SELECT name, r2_key FROM tenant_images WHERE tenant_id = ? AND (name = ? OR bare_name = ? OR name = ?)`
      ).bind(tenantId, name, bareName, bareName).all<{ name: string; r2_key: string }>();

      const rows = existing.results || [];
      if (env.IMAGES_BUCKET && rows.length > 0) {
        await Promise.all(rows.map(r => env.IMAGES_BUCKET!.delete(r.r2_key)));
      }
      for (const r of rows) {
        if (!removedNames.includes(r.name)) removedNames.push(r.name);
      }

      await env.DB.prepare(
        `DELETE FROM tenant_images WHERE tenant_id = ? AND (name = ? OR bare_name = ? OR name = ?)`
      ).bind(tenantId, name, bareName, bareName).run();
    } catch {
      // Ignore if tenant_images table does not exist in isolated test mocks
    }
  }

  return removedNames;
}

export async function loadTenantImageNames(env: Env, tenantId: string): Promise<string[]> {
  const names = new Set<string>();

  if (env.DB) {
    try {
      const res = await env.DB.prepare(
        `SELECT name FROM tenant_images WHERE tenant_id = ? ORDER BY name ASC`
      ).bind(tenantId).all<{ name: string }>();
      for (const row of res.results || []) {
        if (row.name) names.add(row.name);
      }
    } catch {
      // Fallback if table not initialized in mock environment
    }
  }

  if (env.ORDER_STATE && typeof env.ORDER_STATE.get === "function") {
    try {
      const listKey = `tenant:${tenantId}:image_list`;
      let raw = await env.ORDER_STATE.get(listKey);
      if (!raw && tenantId === "benmi") {
        raw = await env.ORDER_STATE.get("image_list");
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === "string" && item.trim()) names.add(item);
          }
        }
      }
    } catch {}
  }

  return Array.from(names);
}

export async function getImageList(request: Request, env: Env): Promise<Response> {
  try {
    const tenantId = getTenantId(request);
    const list = await loadTenantImageNames(env, tenantId);
    return json(list);
  } catch {
    return json([]);
  }
}

export async function getImage(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  try {
    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    if (!name) return new Response("Missing name", { status: 400, headers: corsHeaders() });

    const tenantId = getTenantId(request);
    const bareName = extractBareName(name);

    // 1. Primary O(1) Lookup: D1 Metadata + R2 Binary Stream
    if (env.DB && env.IMAGES_BUCKET) {
      try {
        const row = await env.DB.prepare(
          `SELECT name, r2_key, content_type, etag
           FROM tenant_images
           WHERE tenant_id = ? AND (name = ? OR bare_name = ? OR name = ?)
           ORDER BY CASE WHEN name = ? THEN 0 ELSE 1 END
           LIMIT 1`
        ).bind(tenantId, name, bareName, bareName, name).first<{
          name: string;
          r2_key: string;
          content_type: string;
          etag: string | null;
        }>();

        if (row && row.r2_key) {
          const ifNoneMatch = request.headers.get("If-None-Match");
          if (ifNoneMatch && row.etag && ifNoneMatch === row.etag) {
            return new Response(null, {
              status: 304,
              headers: {
                ...corsHeaders(),
                "ETag": row.etag,
                "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"
              }
            });
          }

          const r2Obj = await env.IMAGES_BUCKET.get(row.r2_key);
          if (r2Obj) {
            const etag = r2Obj.httpEtag || row.etag;
            const headers: Record<string, string> = {
              ...corsHeaders(),
              "Content-Type": r2Obj.httpMetadata?.contentType || row.content_type || "image/webp",
              "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"
            };
            if (etag) headers["ETag"] = etag;

            if (request.method === "HEAD") {
              return new Response(null, { status: 200, headers });
            }
            return new Response(r2Obj.body, { status: 200, headers });
          }
        }
      } catch (r2Err) {
        console.warn(`[Image] R2/D1 lookup warning for ${tenantId}/${name}:`, r2Err);
      }
    }

    // 2. Fallback Dual-Read from KV (with automatic lazy migration to R2 + D1)
    let matchedKey = name;
    let dataUri = env.ORDER_STATE ? await env.ORDER_STATE.get(`tenant:${tenantId}:image:${name}`) : null;

    if (!dataUri && env.ORDER_STATE) {
      for (const prefix of LEGACY_PREFIXES) {
        const candidate = `${prefix}_${name}`;
        dataUri = await env.ORDER_STATE.get(`tenant:${tenantId}:image:${candidate}`);
        if (dataUri) {
          matchedKey = candidate;
          break;
        }
      }
    }

    if (!dataUri && env.ORDER_STATE && name.includes("_")) {
      dataUri = await env.ORDER_STATE.get(`tenant:${tenantId}:image:${bareName}`);
      if (dataUri) matchedKey = bareName;
    }

    if (!dataUri && env.ORDER_STATE) {
      const listKey = `tenant:${tenantId}:image_list`;
      let listRaw = await env.ORDER_STATE.get(listKey);
      if (!listRaw && tenantId === "benmi") {
        listRaw = await env.ORDER_STATE.get("image_list");
      }
      if (listRaw) {
        try {
          const list: string[] = JSON.parse(listRaw);
          const foundKey = list.find(
            k => k === name || k.endsWith(`_${name}`) || (name.includes("_") && k === bareName)
          );
          if (foundKey) {
            dataUri = await env.ORDER_STATE.get(`tenant:${tenantId}:image:${foundKey}`);
            if (!dataUri && tenantId === "benmi") {
              dataUri = await env.ORDER_STATE.get(`image:${foundKey}`);
            }
            if (dataUri) matchedKey = foundKey;
          }
        } catch {}
      }
    }

    if (!dataUri && env.ORDER_STATE && tenantId === "benmi") {
      dataUri = await env.ORDER_STATE.get(`image:${name}`);
    }

    if (!dataUri) {
      return new Response("Not found", {
        status: 404,
        headers: { ...corsHeaders(), "Cache-Control": "public, max-age=60" }
      });
    }

    const decoded = decodeDataUri(dataUri);
    if (!decoded) {
      return new Response("Invalid format", { status: 500, headers: corsHeaders() });
    }

    // Lazy-migrate KV hit into R2 + D1 so subsequent reads are O(1) binary streams
    if (env.IMAGES_BUCKET && env.DB) {
      const migratePromise = upsertTenantImageInR2AndD1(
        env,
        tenantId,
        matchedKey,
        decoded.binary,
        decoded.mime
      ).catch(err => console.warn(`[Image] Lazy R2 migration failed for ${tenantId}/${matchedKey}:`, err));

      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(migratePromise);
      } else {
        await migratePromise;
      }
    }

    return new Response(decoded.binary, {
      headers: {
        ...corsHeaders(),
        "Content-Type": decoded.mime,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"
      }
    });
  } catch {
    return new Response("Server error", { status: 500, headers: corsHeaders() });
  }
}

export async function updateImage(request: Request, env: Env): Promise<Response> {
  try {
    const { name, dataUri }: any = await request.json();
    if (!name || !dataUri) return json({ error: "Missing name or dataUri" }, 400);

    if (dataUri.length > 5 * 1024 * 1024) {
      return json({ error: "Image too large" }, 400);
    }

    const decoded = decodeDataUri(dataUri);
    if (!decoded) return json({ error: "Invalid image dataUri format" }, 400);

    const tenantId = getTenantId(request);

    if (env.IMAGES_BUCKET && env.DB) {
      await upsertTenantImageInR2AndD1(env, tenantId, name, decoded.binary, decoded.mime);
    } else if (env.ORDER_STATE) {
      // Fallback for test environments without R2 binding
      const imageKey = `tenant:${tenantId}:image:${name}`;
      const listKey = `tenant:${tenantId}:image_list`;
      await env.ORDER_STATE.put(imageKey, dataUri);
      let list: string[] = [];
      const listRaw = await env.ORDER_STATE.get(listKey);
      if (listRaw) {
        try { list = JSON.parse(listRaw); } catch {}
      }
      if (!list.includes(name)) {
        list.push(name);
        await env.ORDER_STATE.put(listKey, JSON.stringify(list));
      }
    }

    await invalidateBootstrapCache(tenantId, env);
    return json({ success: true });
  } catch {
    return json({ error: "Invalid data" }, 400);
  }
}

export async function deleteImage(request: Request, env: Env): Promise<Response> {
  try {
    const { name }: any = await request.json();
    if (!name) return json({ error: "Missing name" }, 400);

    const tenantId = getTenantId(request);
    const bareName = extractBareName(name);

    // 1. Delete from R2 + D1 tenant_images
    const r2DeletedNames = await deleteTenantImageFromR2AndD1(env, tenantId, name);

    // 2. Gather all potential legacy KV keys to delete
    const keysToDelete = new Set<string>();
    keysToDelete.add(`tenant:${tenantId}:image:${name}`);
    keysToDelete.add(`tenant:${tenantId}:image:${bareName}`);
    for (const prefix of LEGACY_PREFIXES) {
      keysToDelete.add(`tenant:${tenantId}:image:${prefix}_${bareName}`);
      keysToDelete.add(`tenant:${tenantId}:image:${prefix}_${name}`);
    }
    if (tenantId === "benmi") {
      keysToDelete.add(`image:${name}`);
      keysToDelete.add(`image:${bareName}`);
      for (const prefix of LEGACY_PREFIXES) {
        keysToDelete.add(`image:${prefix}_${bareName}`);
      }
    }

    const deletedImageNames = Array.from(
      new Set([
        ...r2DeletedNames,
        ...Array.from(keysToDelete)
          .filter(k => k.startsWith(`tenant:${tenantId}:image:`))
          .map(k => k.slice(`tenant:${tenantId}:image:`.length))
      ])
    );

    if (deletedImageNames.length > 0 && env.DB) {
      await env.DB.prepare(
        `UPDATE menu_items SET image_key = NULL WHERE tenant_id = ? AND image_key IN (${deletedImageNames.map(() => '?').join(',')})`
      ).bind(tenantId, ...deletedImageNames).run();
    }

    if (env.ORDER_STATE) {
      await Promise.all(Array.from(keysToDelete).map(k => env.ORDER_STATE.delete(k)));

      const listKey = `tenant:${tenantId}:image_list`;
      if (typeof env.ORDER_STATE.get === "function") {
        let listRaw = await env.ORDER_STATE.get(listKey);
        if (!listRaw && tenantId === "benmi") {
          listRaw = await env.ORDER_STATE.get("image_list");
        }
        if (listRaw) {
          try {
            let list: string[] = JSON.parse(listRaw);
            list = list.filter(n => {
              if (n === name || n === bareName) return false;
              const nBare = extractBareName(n);
              if (nBare === bareName || nBare === name) return false;
              return true;
            });
            await env.ORDER_STATE.put(listKey, JSON.stringify(list));
            if (tenantId === "benmi") {
              await env.ORDER_STATE.put("image_list", JSON.stringify(list));
            }
          } catch {}
        }
      }
    }

    await invalidateBootstrapCache(tenantId, env);
    const remaining = await loadTenantImageNames(env, tenantId);
    return json({ success: true, remaining });
  } catch {
    return json({ error: "Server error" }, 500);
  }
}

export async function backfillImagesFromKvToR2(request: Request, env: Env): Promise<Response> {
  if (!env.IMAGES_BUCKET || !env.DB || !env.ORDER_STATE) {
    return json({ error: "Missing IMAGES_BUCKET, DB, or ORDER_STATE binding" }, 500);
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {}
  const cleanupKv = Boolean(body?.cleanupKv);
  const filterTenant = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";

  const migrated: Array<{ tenantId: string; name: string; r2Key: string; bytes: number }> = [];
  const skipped: Array<{ key: string; reason: string }> = [];
  const deletedKvKeys: string[] = [];
  const touchedTenants = new Set<string>();

  // Helper to list all keys for a prefix
  async function listAllKvKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined = undefined;
    do {
      const res: KVNamespaceListResult<unknown> = await env.ORDER_STATE.list({ prefix, cursor });
      for (const k of res.keys) keys.push(k.name);
      cursor = res.list_complete ? undefined : res.cursor;
    } while (cursor);
    return keys;
  }

  const tenantPrefix = filterTenant ? `tenant:${filterTenant}:image:` : "tenant:";
  const allTenantKeys = await listAllKvKeys(tenantPrefix);
  const imageKeys = allTenantKeys.filter(k => /^tenant:[^:]+:image:.+$/.test(k));

  for (const kvKey of imageKeys) {
    const m = kvKey.match(/^tenant:([^:]+):image:(.+)$/);
    if (!m) continue;
    const [, tenantId, name] = m;
    const dataUri = await env.ORDER_STATE.get(kvKey);
    if (!dataUri) {
      skipped.push({ key: kvKey, reason: "empty_value" });
      continue;
    }
    const decoded = decodeDataUri(dataUri);
    if (!decoded) {
      skipped.push({ key: kvKey, reason: "invalid_data_uri" });
      continue;
    }

    const { r2Key } = await upsertTenantImageInR2AndD1(env, tenantId, name, decoded.binary, decoded.mime);
    migrated.push({ tenantId, name, r2Key, bytes: decoded.binary.byteLength });
    touchedTenants.add(tenantId);

    if (cleanupKv) {
      await env.ORDER_STATE.delete(kvKey);
      deletedKvKeys.push(kvKey);
    }
  }

  // Also check legacy root `image:*` keys for `benmi`
  if (!filterTenant || filterTenant === "benmi") {
    const legacyBenmiKeys = await listAllKvKeys("image:");
    for (const kvKey of legacyBenmiKeys) {
      const name = kvKey.slice("image:".length);
      if (!name) continue;
      const dataUri = await env.ORDER_STATE.get(kvKey);
      if (!dataUri) continue;
      const decoded = decodeDataUri(dataUri);
      if (!decoded) {
        skipped.push({ key: kvKey, reason: "invalid_data_uri" });
        continue;
      }
      const { r2Key } = await upsertTenantImageInR2AndD1(env, "benmi", name, decoded.binary, decoded.mime);
      migrated.push({ tenantId: "benmi", name, r2Key, bytes: decoded.binary.byteLength });
      touchedTenants.add("benmi");

      if (cleanupKv) {
        await env.ORDER_STATE.delete(kvKey);
        deletedKvKeys.push(kvKey);
      }
    }
  }

  // If cleanupKv is requested, also delete `tenant:*:image_list` and `image_list` from KV
  if (cleanupKv) {
    const listKeys = allTenantKeys.filter(k => /^tenant:[^:]+:image_list$/.test(k));
    for (const lk of listKeys) {
      await env.ORDER_STATE.delete(lk);
      deletedKvKeys.push(lk);
    }
    if (!filterTenant || filterTenant === "benmi") {
      await env.ORDER_STATE.delete("image_list");
      deletedKvKeys.push("image_list");
    }
  }

  for (const tId of touchedTenants) {
    await invalidateBootstrapCache(tId, env);
  }

  return json({
    success: true,
    migratedCount: migrated.length,
    deletedKvCount: deletedKvKeys.length,
    tenants: Array.from(touchedTenants),
    migrated,
    skipped
  });
}
