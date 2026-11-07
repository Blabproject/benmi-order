import { Env } from '../types/env';
import { json, corsHeaders } from '../utils/http';
import { getTenantId } from './menu';
import { invalidateBootstrapCache } from './bootstrap';

export async function getImageList(request: Request, env: Env): Promise<Response> {
  try {
    const tenantId = getTenantId(request);
    const listKey = `tenant:${tenantId}:image_list`;
    let raw = await env.ORDER_STATE.get(listKey);
    if (!raw && tenantId === "benmi") {
      raw = await env.ORDER_STATE.get("image_list");
      if (raw) {
        await env.ORDER_STATE.put(listKey, raw);
      }
    }
    if (raw) return json(JSON.parse(raw));
  } catch (e) { }
  return json([]);
}

export async function getImage(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    if (!name) return new Response("Missing name", { status: 400, headers: corsHeaders() });

    const tenantId = getTenantId(request);
    let dataUri = await env.ORDER_STATE.get(`tenant:${tenantId}:image:${name}`);

    if (!dataUri) {
      // Try common category prefixes
      const prefixes = ["main", "snack", "small", "large", "combo", "drinks", "topping"];
      for (const prefix of prefixes) {
        dataUri = await env.ORDER_STATE.get(`tenant:${tenantId}:image:${prefix}_${name}`);
        if (dataUri) break;
      }
    }

    if (!dataUri && name.includes("_")) {
      // If name has a prefix (e.g. main_原味炸蛋蔥餅), try bare name
      const bare = name.split("_").slice(1).join("_");
      dataUri = await env.ORDER_STATE.get(`tenant:${tenantId}:image:${bare}`);
    }

    // If still not found, try dynamic search in image_list
    if (!dataUri) {
      const listKey = `tenant:${tenantId}:image_list`;
      let listRaw = await env.ORDER_STATE.get(listKey);
      if (!listRaw && tenantId === "benmi") {
        listRaw = await env.ORDER_STATE.get("image_list");
      }
      if (listRaw) {
        try {
          const list: string[] = JSON.parse(listRaw);
          const matchedKey = list.find(k => k === name || k.endsWith(`_${name}`) || (name.includes('_') && k === name.split('_').slice(1).join('_')));
          if (matchedKey) {
            dataUri = await env.ORDER_STATE.get(`tenant:${tenantId}:image:${matchedKey}`);
            if (!dataUri && tenantId === "benmi") {
              dataUri = await env.ORDER_STATE.get(`image:${matchedKey}`);
            }
          }
        } catch (e) { }
      }
    }

    if (!dataUri && tenantId === "benmi") {
      dataUri = await env.ORDER_STATE.get(`image:${name}`);
    }
    if (!dataUri) return new Response("Not found", { status: 404, headers: { ...corsHeaders(), "Cache-Control": "public, max-age=60" } });

    const match = dataUri.match(/^data:(.*?);base64,(.*)$/);
    if (!match) return new Response("Invalid format", { status: 500, headers: corsHeaders() });

    const mime = match[1];
    const base64 = match[2];
    const binaryStr = atob(base64);
    const binary = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      binary[i] = binaryStr.charCodeAt(i);
    }

    return new Response(binary, {
      headers: {
        ...corsHeaders(),
        "Content-Type": mime,
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300"
      }
    });
  } catch (e) {
    return new Response("Server error", { status: 500, headers: corsHeaders() });
  }
}

export async function updateImage(request: Request, env: Env): Promise<Response> {
  try {
    const { name, dataUri }: any = await request.json();
    if (!name || !dataUri) return json({ error: "Missing name or dataUri" }, 400);

    // Limit size check (~5MB base64)
    if (dataUri.length > 5 * 1024 * 1024) {
      return json({ error: "Image too large" }, 400);
    }

    const tenantId = getTenantId(request);
    const imageKey = `tenant:${tenantId}:image:${name}`;
    const listKey = `tenant:${tenantId}:image_list`;

    await env.ORDER_STATE.put(imageKey, dataUri);

    if (tenantId === "benmi") {
      await env.ORDER_STATE.put(`image:${name}`, dataUri);
    }

    let list: string[] = [];
    let listRaw = await env.ORDER_STATE.get(listKey);
    if (!listRaw && tenantId === "benmi") {
      listRaw = await env.ORDER_STATE.get("image_list");
    }
    if (listRaw) {
      try { list = JSON.parse(listRaw); } catch (e) { }
    }
    if (!list.includes(name)) {
      list.push(name);
      await env.ORDER_STATE.put(listKey, JSON.stringify(list));
    }
    if (tenantId === "benmi") {
      await env.ORDER_STATE.put("image_list", JSON.stringify(list));
    }

    await invalidateBootstrapCache(tenantId, env);
    return json({ success: true });
  } catch (e) {
    return json({ error: "Invalid data" }, 400);
  }
}

export async function deleteImage(request: Request, env: Env): Promise<Response> {
  try {
    const { name }: any = await request.json();
    if (!name) return json({ error: "Missing name" }, 400);

    const tenantId = getTenantId(request);
    const bareName = name.includes("_") ? name.split("_").slice(1).join("_") : name;
    const prefixes = ["main", "snack", "small", "large", "combo", "drinks", "topping"];

    // 1. Gather all potential KV keys to delete
    const keysToDelete = new Set<string>();
    keysToDelete.add(`tenant:${tenantId}:image:${name}`);
    keysToDelete.add(`tenant:${tenantId}:image:${bareName}`);
    for (const prefix of prefixes) {
      keysToDelete.add(`tenant:${tenantId}:image:${prefix}_${bareName}`);
      keysToDelete.add(`tenant:${tenantId}:image:${prefix}_${name}`);
    }
    if (tenantId === "benmi") {
      keysToDelete.add(`image:${name}`);
      keysToDelete.add(`image:${bareName}`);
      for (const prefix of prefixes) {
        keysToDelete.add(`image:${prefix}_${bareName}`);
      }
    }

    // The unified catalog stores a pointer to the KV image. Clear pointers for
    // every key removed above so bootstrap cannot publish a broken image URL.
    const deletedImageNames = Array.from(keysToDelete)
      .filter(k => k.startsWith(`tenant:${tenantId}:image:`))
      .map(k => k.slice(`tenant:${tenantId}:image:`.length));
    if (deletedImageNames.length > 0) {
      await env.DB.prepare(
        `UPDATE menu_items SET image_key = NULL WHERE tenant_id = ? AND image_key IN (${deletedImageNames.map(() => '?').join(',')})`
      ).bind(tenantId, ...deletedImageNames).run();
    }

    await Promise.all(Array.from(keysToDelete).map(k => env.ORDER_STATE.delete(k)));

    // 2. Clean up tenant image_list
    const listKey = `tenant:${tenantId}:image_list`;
    let list: string[] = [];
    let listRaw = await env.ORDER_STATE.get(listKey);
    if (!listRaw && tenantId === "benmi") {
      listRaw = await env.ORDER_STATE.get("image_list");
    }
    if (listRaw) {
      try { list = JSON.parse(listRaw); } catch (e) { }
    }

    list = list.filter(n => {
      if (n === name || n === bareName) return false;
      const nBare = n.includes("_") ? n.split("_").slice(1).join("_") : n;
      if (nBare === bareName || nBare === name) return false;
      return true;
    });

    await env.ORDER_STATE.put(listKey, JSON.stringify(list));

    if (tenantId === "benmi") {
      await env.ORDER_STATE.put("image_list", JSON.stringify(list));
    }

    await invalidateBootstrapCache(tenantId, env);
    return json({ success: true, remaining: list });
  } catch (e) {
    return json({ error: "Server error" }, 500);
  }
}
