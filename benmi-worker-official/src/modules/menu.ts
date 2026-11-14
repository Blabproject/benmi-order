import { groupOptions, loadOptionCatalog, validateOptionGraph, unifiedMenuEnabled } from './option-groups';
import { Env } from '../types/env';
import { Menu } from '../types/index';
import { json } from '../utils/http';
import { invalidateBootstrapCache } from './bootstrap';
import { loadBundleCatalog, normalizeBundleConfig } from './bundle-rules';

export const DEFAULT_MENU: Menu = {
  small: { "燒肉": 56, "火腿": 56, "雞肉": 68, "烤肉": 72, "雙層烤肉": 78, "綜合": 79 },
  large: { "燒肉": 80, "火腿": 80, "雞肉": 100, "烤肉": 105, "雙層烤肉": 115, "綜合": 130 },
  combo: { 
    "1 大燒肉+飲料": 90, "2 大火腿+飲料": 90, "3 大雞肉+飲料": 118, "4 大烤肉+飲料": 128, 
    "5 大雙層烤肉+飲料": 135, "6 大綜合+飲料": 142, "7 小燒肉+飲料": 77, "8 小雞肉+飲料": 88,
    "9 小烤肉+飲料": 95, "10 小雙層烤肉+飲料": 99, "11 小綜合+飲料": 100
  },
  drinks: { "越南咖啡": 48, "豆漿": 37, "紅茶": 37, "可樂": 37, "雪碧": 37 },
  topping: { "起司": 15, "火腿": 20, "燒肉": 20, "烤肉": 25, "雞肉": 25 }
};

// Helper để trích xuất Tenant ID từ Request
export function getTenantId(request: Request): string {
  const url = new URL(request.url);
  
  // 1. Ưu tiên query parameter ?tenant_id=... hoặc ?tenant=...
  const queryTenant = url.searchParams.get("tenant_id") || url.searchParams.get("tenant");
  if (queryTenant) {
    console.log("[Tenant] Found in query param:", queryTenant);
    return queryTenant;
  }

  // 2. Kiểm tra Header X-Tenant-ID
  const headerTenant = request.headers.get("X-Tenant-ID");
  if (headerTenant) {
    console.log("[Tenant] Found in header:", headerTenant);
    return headerTenant;
  }

  // 3. Phân tích Subdomain từ URL hostname
  const hostname = url.hostname || "";
  const parts = hostname.split(".");
  const RESERVED_SUBDOMAINS = new Set(["www", "api", "admin", "explore", "pos", "staging", "dev", "order", "test", "preview"]);
  
  console.log("[Tenant] Analyzing hostname:", hostname, "parts length:", parts.length);

  // Nếu là subdomain mặc định của Cloudflare Workers (ví dụ: worker-name.subdomain.workers.dev)
  // parts sẽ có dạng: ['spring-smoke-46ba', 'thuanmnc', 'workers', 'dev'] (4 phần)
  // Chỉ khi cấu hình dạng tenant.worker-name.subdomain.workers.dev (5 phần) ta mới trích xuất parts[0] làm tenant
  if (hostname.endsWith("workers.dev")) {
    if (parts.length >= 5 && !RESERVED_SUBDOMAINS.has(parts[0])) {
      console.log("[Tenant] Found worker subdomain tenant:", parts[0]);
      return parts[0];
    }
  } else {
    // Với domain thông thường (ví dụ: shop.benmi.vn hoặc tenant.localhost:8787)
    if (parts.length > 2 && !RESERVED_SUBDOMAINS.has(parts[0]) && !parts[0].includes("localhost") && !parts[0].includes("127")) {
      console.log("[Tenant] Found custom domain tenant:", parts[0]);
      return parts[0];
    }
  }

  // 4. Mặc định là benmi
  console.log("[Tenant] Using default fallback tenant: benmi");
  return "benmi";
}

// GET /api/menu
export async function getMenu(request: Request, env: Env): Promise<Response> {
  const tenantId = getTenantId(request);
  const cacheKey = `tenant:${tenantId}:menu`;

  try {
    // 1. Kiểm tra bộ nhớ đệm KV trước
    const cachedMenu = await env.ORDER_STATE.get(cacheKey);
    if (cachedMenu) {
      return json(JSON.parse(cachedMenu));
    }
  } catch (e) {
    console.error("KV read failed:", e);
  }

  try {
    // 2. Cache Miss: Truy vấn từ D1 Database
    // Sử dụng batch queries để giảm thiểu số vòng kết nối mạng
    const [categoriesRes, itemsRes] = await env.DB.batch([
      env.DB.prepare("SELECT id, name, short_name, slug FROM menu_categories WHERE tenant_id = ? AND COALESCE(category_type, 'catalog') = 'catalog' ORDER BY sort_order ASC").bind(tenantId),
      env.DB.prepare("SELECT id, category_id, name, price, description, out_of_stock_until FROM menu_items WHERE tenant_id = ? ORDER BY sort_order ASC").bind(tenantId)
    ]);

    const categories = categoriesRes.results as Array<{ id: string; name: string; short_name: string | null; slug: string }>;
    const items = itemsRes.results as Array<{
      id: string;
      category_id: string;
      name: string;
      price: number;
      description: string | null;
      out_of_stock_until: string | null;
    }>;

    // Nếu không có dữ liệu nào trong D1 cho Tenant này, trả về DEFAULT_MENU cho benmi, còn tenant khác trả về menu rỗng
    if (categories.length === 0 || items.length === 0) {
      if (tenantId === "benmi") return json(DEFAULT_MENU);
      return json({ out_of_stock: [] });
    }

    // 3. Xây dựng cấu trúc JSON Menu tương thích ngược
    const menuData: Menu = {
      out_of_stock: [],
      _category_names: {} as any,
      _category_short_names: {} as any
    };

    // Tạo các mảng danh mục rỗng
    const catMap = new Map<string, string>(); // category_id -> slug
    for (const cat of categories) {
      menuData[cat.slug] = {};
      catMap.set(cat.id, cat.slug);
      if (menuData._category_names) {
        menuData._category_names[cat.slug] = cat.name;
      }
      if (menuData._category_short_names) {
        menuData._category_short_names[cat.slug] = cat.short_name || cat.name;
      }
    }

    const now = new Date();
    let nextExpirationTime: Date | null = null;

    // Phân bổ món ăn vào các danh mục và xác định món hết hàng
    for (const item of items) {
      const categorySlug = catMap.get(item.category_id);
      if (!categorySlug) continue;

      // Lưu giá tiền
      menuData[categorySlug][item.name] = item.price;

      // Kiểm tra trạng thái hết hàng (out-of-stock)
      if (item.out_of_stock_until) {
        const oosUntil = new Date(item.out_of_stock_until);
        if (oosUntil > now) {
          // Món đang thực sự hết hàng
          menuData.out_of_stock!.push(`${categorySlug}:${item.name}`);

          // Tìm thời điểm phục hồi sớm nhất của món hết hàng tạm thời
          if (oosUntil.getFullYear() < 9000) { // Không tính vô thời hạn (9999)
            if (!nextExpirationTime || oosUntil < nextExpirationTime) {
              nextExpirationTime = oosUntil;
            }
          }
        }
      }
    }

    // 4. Tính toán TTL tối ưu cho KV Cache
    let ttl = 3600; // Mặc định là 1 giờ
    if (nextExpirationTime) {
      const secondsToExpiration = Math.ceil((nextExpirationTime.getTime() - now.getTime()) / 1000);
      // Giới hạn TTL tối thiểu 60 giây và tối đa 3600 giây
      ttl = Math.max(60, Math.min(3600, secondsToExpiration));
    }

    // 5. Ghi đè vào KV cache để phục vụ các request tiếp theo
    try {
      await env.ORDER_STATE.put(cacheKey, JSON.stringify(menuData), { expirationTtl: ttl });
    } catch (e) {
      console.error("KV write failed:", e);
    }

    return json(menuData);

  } catch (err: any) {
    console.error("D1 read failed, falling back to KV/Default:", err);
    
    // Fallback: Trong trường hợp D1 lỗi, đọc từ KV key cũ hoặc trả về DEFAULT_MENU
    try {
      const raw = await env.ORDER_STATE.get("menu:latest");
      if (raw) return json(JSON.parse(raw));
    } catch (e) {}

    return json(DEFAULT_MENU);
  }
}

// POST /api/menu/stock-status
export async function updateStockStatus(request: Request, env: Env): Promise<Response> {
  try {
    const { category_slug, name, status, duration, until_date, customization_key, option_id, optionId, group_id, groupId } = (await request.json()) as any;

    if (!category_slug || !name || !status) {
      return json({ error: "Missing category_slug, name, or status" }, 400);
    }

    const tenantId = getTenantId(request);
    let outOfStockUntil: string | null = null;

    if (status === "out_of_stock") {
      if (duration === "today") {
        // Tự động khôi phục lúc 04:00 AM ngày hôm sau (theo múi giờ GMT+7)
        const nowGmt7 = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
        const tomorrow4AmGmt7 = new Date(nowGmt7);
        tomorrow4AmGmt7.setDate(nowGmt7.getDate() + 1);
        tomorrow4AmGmt7.setHours(4, 0, 0, 0);
        // Chuyển ngược lại UTC để lưu DB
        outOfStockUntil = new Date(tomorrow4AmGmt7.getTime() - 7 * 60 * 60 * 1000).toISOString();
      } else if (duration === "multiple_days") {
        if (!until_date) {
          return json({ error: "Missing until_date for multiple_days duration" }, 400);
        }
        outOfStockUntil = new Date(until_date).toISOString();
      } else {
        // Vô thời hạn: Đặt mốc xa năm 9999
        outOfStockUntil = "9999-12-31T23:59:59.000Z";
      }
    }

    // Helper to update stock status in modifier_options
    async function updateModifierOptionStock(): Promise<boolean> {
      const optTargetId = option_id || optionId;
      const grpTargetId = group_id || groupId;
      let query = "SELECT id, group_id, name FROM modifier_options WHERE tenant_id = ?";
      const params: any[] = [tenantId];
      if (optTargetId) {
        query += " AND id = ?";
        params.push(optTargetId);
      } else if (grpTargetId) {
        query += " AND group_id = ? AND (name = ? OR id = ?)";
        params.push(grpTargetId, name, name);
      } else {
        query += " AND (name = ? OR id = ?)";
        params.push(name, name);
      }
      const optionRows = await env.DB.prepare(query).bind(...params).all<any>();
      if (!optionRows.results || optionRows.results.length === 0) return false;

      const targetIds = optionRows.results.map((r: any) => r.id as string);
      const isOos = status === "out_of_stock" ? 1 : 0;
      const idPlaceholders = targetIds.map(() => '?').join(',');
      const statements: any[] = [
        env.DB.prepare(
          `UPDATE modifier_options SET out_of_stock_until = ?, is_out_of_stock = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id IN (${idPlaceholders})`
        ).bind(outOfStockUntil, isOos, tenantId, ...targetIds)
      ];

      // Double-write shadow sync to menu_customizations
      try {
        const { results: customRows } = await env.DB.prepare("SELECT id, options_json FROM menu_customizations WHERE tenant_id = ?").bind(tenantId).all<any>();
        if (customRows && customRows.length > 0) {
          const optNames = new Set(optionRows.results.map((r: any) => r.name).filter(Boolean));
          for (const row of customRows) {
            try {
              const opts = typeof row.options_json === 'string' ? JSON.parse(row.options_json) : (row.options_json || []);
              let found = false;
              for (const opt of opts) {
                const optIdentifier = opt.id || opt.name;
                if (targetIds.includes(opt.id) || optNames.has(opt.name) || optIdentifier === name) {
                  opt.is_out_of_stock = (status === "out_of_stock");
                  opt.out_of_stock_until = outOfStockUntil;
                  found = true;
                }
              }
              if (found) {
                statements.push(
                  env.DB.prepare("UPDATE menu_customizations SET options_json = ? WHERE id = ? AND tenant_id = ?")
                    .bind(JSON.stringify(opts), row.id, tenantId)
                );
              }
            } catch {}
          }
        }
      } catch {}

      await env.DB.batch(statements);

      const cacheKey = `tenant:${tenantId}:menu`;
      if (env.ORDER_STATE) await env.ORDER_STATE.delete(cacheKey);
      await invalidateBootstrapCache(tenantId, env);
      return true;
    }

    // Helper to update stock status in menu_customizations
    async function updateCustomizationStock(): Promise<boolean> {
      let query = "SELECT id, key, options_json FROM menu_customizations WHERE tenant_id = ?";
      const params: any[] = [tenantId];
      if (customization_key) {
        query += " AND (key = ? OR id = ?)";
        params.push(customization_key, customization_key);
      } else if (category_slug && category_slug !== 'order_customization' && category_slug !== 'sec-flavor') {
        query += " AND (key = ? OR id = ?)";
        params.push(category_slug, category_slug);
      }
      const { results: customRows } = await env.DB.prepare(query).bind(...params).all<any>();
      if (!customRows || customRows.length === 0) return false;

      for (const row of customRows) {
        try {
          const opts = typeof row.options_json === 'string' ? JSON.parse(row.options_json) : (row.options_json || []);
          let found = false;
          for (const opt of opts) {
            const optName = opt.name || opt.id || opt.title;
            if (optName === name || opt.id === name) {
              opt.is_out_of_stock = (status === "out_of_stock");
              opt.out_of_stock_until = outOfStockUntil;
              found = true;
              break;
            }
          }
          if (found) {
            const isOos = status === "out_of_stock" ? 1 : 0;
            const statements: any[] = [
              env.DB.prepare(
                "UPDATE menu_customizations SET options_json = ? WHERE id = ? AND tenant_id = ?"
              ).bind(JSON.stringify(opts), row.id, tenantId),
              // Double-write shadow sync to modifier_options
              env.DB.prepare(
                "UPDATE modifier_options SET out_of_stock_until = ?, is_out_of_stock = ?, updated_at = datetime('now') WHERE tenant_id = ? AND (name = ? OR id = ?)"
              ).bind(outOfStockUntil, isOos, tenantId, name, name)
            ];

            await env.DB.batch(statements);

            const cacheKey = `tenant:${tenantId}:menu`;
            if (env.ORDER_STATE) await env.ORDER_STATE.delete(cacheKey);
            await invalidateBootstrapCache(tenantId, env);
            return true;
          }
        } catch (e) {
          console.error("Failed to parse/update options_json:", e);
        }
      }
      return false;
    }

    // 1. If explicit customization request, update menu_customizations first
    if (category_slug === 'order_customization' || category_slug === 'sec-flavor' || customization_key) {
      const updated = await updateCustomizationStock();
      if (updated) {
        return json({ success: true, message: "Customization stock status updated and cache invalidated." });
      }
    }

    if (category_slug === 'modifier_option' || category_slug === 'modifier_group') {
      const updated = await updateModifierOptionStock();
      if (updated) {
        return json({ success: true, message: "Modifier option stock status updated and cache invalidated." });
      }
    }

    // 2. Cập nhật trạng thái trong D1 Database
    const dbRes = await env.DB.prepare(
      `UPDATE menu_items 
       SET out_of_stock_until = ?, updated_at = datetime('now') 
       WHERE tenant_id = ? 
         AND name = ? 
         AND category_id = (SELECT id FROM menu_categories WHERE tenant_id = ? AND (slug = ? OR id = ?))`
    ).bind(outOfStockUntil, tenantId, name, tenantId, category_slug, category_slug).run();

    if (dbRes.meta.changes > 0) {
      // Double-write shadow sync: if this item is used in modifier_options, sync stock
      try {
        const isOos = status === "out_of_stock" ? 1 : 0;
        await env.DB.prepare(
          `UPDATE modifier_options SET out_of_stock_until = ?, is_out_of_stock = ?, updated_at = datetime('now')
           WHERE tenant_id = ? AND product_id = (
             SELECT id FROM menu_items WHERE tenant_id = ? AND name = ? AND category_id = (
               SELECT id FROM menu_categories WHERE tenant_id = ? AND (slug = ? OR id = ?)
             ) LIMIT 1
           )`
        ).bind(outOfStockUntil, isOos, tenantId, tenantId, name, tenantId, category_slug, category_slug).run();
      } catch {}
    }

    if (dbRes.meta.changes === 0) {
      // Fallback 1: check menu_customizations if not found in menu_items
      const updatedFallback = await updateCustomizationStock();
      if (updatedFallback) {
        return json({ success: true, message: "Customization stock status updated and cache invalidated." });
      }
      // Fallback 2: check modifier_options
      const updatedModifier = await updateModifierOptionStock();
      if (updatedModifier) {
        return json({ success: true, message: "Modifier option stock status updated and cache invalidated." });
      }
      return json({ error: "Menu item not found or unauthorized" }, 404);
    }

    // 3. Invalidate bộ nhớ đệm KV của tenant
    const cacheKey = `tenant:${tenantId}:menu`;
    await env.ORDER_STATE.delete(cacheKey);
    await invalidateBootstrapCache(tenantId, env);

    return json({ success: true, message: "Stock status updated and cache invalidated." });

  } catch (err: any) {
    console.error("Update stock status failed:", err);
    return json({ error: err.message || "Internal Server Error" }, 500);
  }
}

// Helper to generate secure tenant-scoped IDs for modifier groups and options
function generateUniqueModifierId(prefix: string, tenantId: string): string {
  const randomPart = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${tenantId}_${randomPart}`;
}

// Missing fields are never deletion instructions. Validate the complete request
// before constructing a batch so malformed customization data cannot erase rows.
function validateMenuUpdate(data: any): void {
  const record = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = (value: any) => typeof value === 'string' && value.trim().length > 0;
  if (!record(data)) throw new Error('INVALID_MENU_PAYLOAD');
  if ('__delete' in data) {
    if (!record(data.__delete)) throw new Error('INVALID_MENU_DELETIONS');
    for (const [key, ids] of Object.entries(data.__delete)) {
      if (!['categories', 'items', 'customizations'].includes(key) ||
          !Array.isArray(ids) || !ids.every(text) || new Set(ids).size !== ids.length) {
        throw new Error('INVALID_MENU_DELETIONS');
      }
    }
  }
  if ('__customizations' in data) {
    const section = data.__customizations;
    const groups = Array.isArray(section) ? section : record(section) ? (section.groups ?? section.list) : undefined;
    if (!Array.isArray(groups)) throw new Error('INVALID_CUSTOMIZATIONS');
    if (!Array.isArray(section) && section.sortOrder !== undefined && (!Number.isSafeInteger(section.sortOrder) || section.sortOrder < 0)) throw new Error('INVALID_CUSTOMIZATION_SECTION_ORDER');
    if (!Array.isArray(section) && section.id !== undefined && !text(section.id)) throw new Error('INVALID_CUSTOMIZATION_CATEGORY_ID');
    const keys = new Set();
    const ids = new Set();
    for (const group of groups) {
      if (!record(group) || !text(group.key) || keys.has(group.key) ||
          (group.id !== undefined && (!text(group.id) || ids.has(group.id))) ||
          (group.sourceId !== undefined && !text(group.sourceId)) ||
          (group.canonicalId !== undefined && !text(group.canonicalId)) ||
          !Array.isArray(group.options) ||
          (group.type !== undefined && !['radio', 'checkbox'].includes(group.type))) {
        throw new Error('INVALID_CUSTOMIZATION_GROUP');
      }
      if ((group.minSelection !== undefined && (!Number.isInteger(group.minSelection) || group.minSelection < 0)) ||
          (group.maxSelection !== undefined && (!Number.isInteger(group.maxSelection) || group.maxSelection < 1)) ||
          (group.minSelection !== undefined && group.maxSelection !== undefined && group.minSelection > group.maxSelection)) {
        throw new Error('INVALID_MODIFIER_GROUP_BOUNDS');
      }
      if (group.sortOrder !== undefined && (!Number.isSafeInteger(group.sortOrder) || group.sortOrder < 0)) {
        throw new Error('INVALID_GROUP_SORT_ORDER');
      }
      keys.add(group.key);
      if (group.id) ids.add(group.id);
      for (const option of group.options) {
        if (!record(option) || !text(option.name) ||
            (option.price !== undefined && (typeof option.price !== 'number' || !Number.isFinite(option.price))) ||
            (option.surcharge !== undefined && (typeof option.surcharge !== 'number' || !Number.isFinite(option.surcharge))) ||
            (option.sub_options !== undefined && !Array.isArray(option.sub_options))) {
          throw new Error('INVALID_CUSTOMIZATION_OPTION');
        }
      }
    }
  }

  // Registry to catch conflicting definitions for the same modifier group or option ID in the payload
  const payloadGroupConfigs = new Map<string, string>();
  const payloadOptionConfigs = new Map<string, string>();
  const registerModifierDefinition = (group: any, stableGroupId: string): void => {
    const isRequired = Boolean(group.isRequired ?? group.is_required);
    const selectionType = group.selectionType ?? group.selection_type ?? (group.type === 'checkbox' ? 'multiple' : 'single');
    const minSelection = group.minSelection ?? group.min_selection;
    const maxSelection = group.maxSelection ?? group.max_selection;
    const groupConfig = JSON.stringify({
      name: String(group.name ?? group.title ?? '').trim(),
      selection_type: selectionType,
      is_required: isRequired,
      min_selection: Number(minSelection ?? (isRequired ? 1 : 0)),
      max_selection: Number(maxSelection ?? (selectionType === 'single' ? 1 : 99))
    });
    if (payloadGroupConfigs.has(stableGroupId) && payloadGroupConfigs.get(stableGroupId) !== groupConfig) {
      throw new Error('CONFLICTING_MODIFIER_GROUP_CONFIG');
    }
    payloadGroupConfigs.set(stableGroupId, groupConfig);

    for (const option of Array.isArray(group.options) ? group.options : []) {
      if (!option?.id) continue;
      const optionPrice = Number(option.price ?? option.surcharge ?? 0);
      const optionConfig = JSON.stringify({
        groupId: stableGroupId,
        name: String(option.name ?? option.title ?? '').trim(),
        price: optionPrice,
        isDefault: Boolean(option.isDefault ?? option.is_default),
        isOutOfStock: Boolean(option.isOos ?? option.isOutOfStock ?? option.is_out_of_stock),
        subOptions: option.sub_options ?? option.subOptions ?? []
      });
      if (payloadOptionConfigs.has(String(option.id)) && payloadOptionConfigs.get(String(option.id)) !== optionConfig) {
        throw new Error('CONFLICTING_MODIFIER_OPTION_CONFIG');
      }
      payloadOptionConfigs.set(String(option.id), optionConfig);
    }
  };

  const customSection = data.__customizations;
  const customGroups = Array.isArray(customSection) ? customSection : record(customSection) ? (customSection.groups ?? customSection.list ?? []) : [];
  for (const group of customGroups) {
    const stableGroupId = String(group.canonicalId || group.id || '');
    if (stableGroupId) registerModifierDefinition(group, stableGroupId);
  }

  for (const [key, category] of Object.entries(data) as [string, any][]) {
    if (key === '__delete' || key === '__customizations') continue;
    if (key.startsWith('_') || !record(category)) throw new Error('INVALID_MENU_CATEGORY');
    for (const [name, item] of Object.entries(category) as [string, any][]) {
      if (name.startsWith('_')) continue;
      const price = record(item) ? item.price : item;
      if (!text(name) || typeof price !== 'number' || !Number.isFinite(price) || price < 0 ||
          (record(item) && item.id !== undefined && !text(item.id))) throw new Error('INVALID_MENU_ITEM');

      if (record(item)) {
        const rawModGroups = item.modifier_groups ?? item.modifierGroups;
        if (rawModGroups !== undefined && rawModGroups !== null) {
          if (!Array.isArray(rawModGroups)) throw new Error('INVALID_MODIFIER_GROUPS');
          for (const grp of rawModGroups) {
            if (!record(grp)) throw new Error('INVALID_MODIFIER_GROUP');
            const grpId = grp.id !== undefined ? String(grp.id).trim() : undefined;
            if (grp.id !== undefined && !text(grp.id)) throw new Error('INVALID_MODIFIER_GROUP_ID');

            const grpName = grp.name ?? grp.title;
            if (grpName !== undefined && !text(grpName)) throw new Error('INVALID_MODIFIER_GROUP_NAME');

            const selType = grp.selectionType ?? grp.selection_type;
            if (selType !== undefined && !['single', 'multiple'].includes(selType)) {
              throw new Error('INVALID_MODIFIER_GROUP_SELECTION_TYPE');
            }

            const minSel = grp.minSelection ?? grp.min_selection;
            const maxSel = grp.maxSelection ?? grp.max_selection;
            if (minSel !== undefined && (typeof minSel !== 'number' || !Number.isFinite(minSel) || minSel < 0)) {
              throw new Error('INVALID_MODIFIER_GROUP_BOUNDS');
            }
            if (maxSel !== undefined && (typeof maxSel !== 'number' || !Number.isFinite(maxSel) || maxSel < 0)) {
              throw new Error('INVALID_MODIFIER_GROUP_BOUNDS');
            }
            if (minSel !== undefined && maxSel !== undefined && maxSel > 0 && minSel > maxSel) {
              throw new Error('INVALID_MODIFIER_GROUP_BOUNDS');
            }
            if (selType === 'single' && maxSel !== undefined && maxSel > 1) {
              throw new Error('INVALID_MODIFIER_GROUP_BOUNDS');
            }

            const options = grp.options;
            if (options !== undefined) {
              if (!Array.isArray(options)) throw new Error('INVALID_MODIFIER_OPTIONS');
              const seenOptIds = new Set<string>();
              for (const opt of options) {
                if (!record(opt)) throw new Error('INVALID_MODIFIER_OPTION');
                const optName = opt.name ?? opt.title;
                if (!text(optName)) throw new Error('INVALID_MODIFIER_OPTION_NAME');

                const optPrice = opt.price ?? opt.surcharge;
                if (optPrice !== undefined && (typeof optPrice !== 'number' || !Number.isFinite(optPrice))) {
                  throw new Error('INVALID_MODIFIER_OPTION_PRICE');
                }

                if (opt.id !== undefined) {
                  if (!text(opt.id)) throw new Error('INVALID_MODIFIER_OPTION_ID');
                  const optId = String(opt.id).trim();
                  if (seenOptIds.has(optId)) {
                    throw new Error('DUPLICATE_MODIFIER_OPTION_ID');
                  }
                  seenOptIds.add(optId);

              const optCanonical = JSON.stringify({
                groupId: grpId || '',
                name: optName.trim(),
                price: Number(optPrice ?? 0),
                isDefault: Boolean(opt.isDefault ?? opt.is_default),
                isOutOfStock: Boolean(opt.isOos ?? opt.isOutOfStock ?? opt.is_out_of_stock),
                subOptions: opt.sub_options ?? opt.subOptions ?? []
              });
              if (payloadOptionConfigs.has(optId) && payloadOptionConfigs.get(optId) !== optCanonical) {
                throw new Error('CONFLICTING_MODIFIER_OPTION_CONFIG');
              }
              payloadOptionConfigs.set(optId, optCanonical);
                }
              }
            }

            if (grpId) {
              registerModifierDefinition(grp, grpId);
            }
          }
        }
      }
    }
  }
}

async function syncMenuToD1(tenantId: string, menuData: any, env: Env): Promise<void> {
  validateMenuUpdate(menuData);
  // Anchor the guard before reading ranks and IDs used to construct the write batch.
  const unifiedCatalog = unifiedMenuEnabled(env) ? await loadOptionCatalog(env, tenantId) : null;
  // 1. Nạp danh mục và món ăn hiện có để ánh xạ ID tránh xung đột unique
  const { results: existingCats } = await env.DB.prepare(
    "SELECT id, slug, name, short_name, category_type, sort_order FROM menu_categories WHERE tenant_id = ?"
  ).bind(tenantId).all();

  const { results: existingItems } = await env.DB.prepare(
    "SELECT id, category_id, name FROM menu_items WHERE tenant_id = ?"
  ).bind(tenantId).all();

  const { results: existingCustomizations } = await env.DB.prepare(
    "SELECT id, key FROM menu_customizations WHERE tenant_id = ?"
  ).bind(tenantId).all();
  const customIdMap = new Map((existingCustomizations || []).map(row => [row.key as string, row.id as string]));
  const ownedItemIds = new Set((existingItems || []).map(row => row.id as string));
  const ownedCustomIds = new Set((existingCustomizations || []).map(row => row.id as string));
  const { results: existingGroups } = await env.DB.prepare('SELECT id,scope,sort_order FROM modifier_groups WHERE tenant_id = ?').bind(tenantId).all();
  const ownedGroupIds = new Set((existingGroups || []).map(row => row.id as string));

  // Collect all modifier group and option IDs from payload for cross-tenant pre-flight verification
  const incomingGroupIds = new Set<string>();
  const incomingOptionMap = new Map<string, { groupId: string; name: string }>();

  for (const [slug, category] of Object.entries(menuData) as [string, any][]) {
    if (slug === '__delete' || slug === '__customizations') continue;
    if (!category || typeof category !== 'object') continue;
    for (const [name, item] of Object.entries(category) as [string, any][]) {
      if (name.startsWith('_')) continue;
      const modGroups = item?.modifier_groups ?? item?.modifierGroups;
      if (Array.isArray(modGroups)) {
          for (const grp of modGroups) {
            if (!grp) continue;
            if (grp.id) incomingGroupIds.add(String(grp.id));
            if (grp.canonicalId) incomingGroupIds.add(String(grp.canonicalId));
            const stableGroupId = String(grp.canonicalId || grp.id || '');
            const options = Array.isArray(grp.options) ? grp.options : [];
            for (const opt of options) {
              if (opt && opt.id) {
              incomingOptionMap.set(String(opt.id), { groupId: stableGroupId, name: opt.name || opt.title || '' });
              }
            }
        }
      }
    }
  }

  const customSection = menuData.__customizations;
  const customGroups = Array.isArray(customSection) ? customSection : (customSection?.groups || customSection?.list || []);
  for (const group of customGroups) {
    if (group.id) incomingGroupIds.add(String(group.id));
    if (group.canonicalId) incomingGroupIds.add(String(group.canonicalId));
    const stableGroupId = String(group.canonicalId || group.id || '');
    for (const option of group.options || []) {
      if (option.id) incomingOptionMap.set(String(option.id), { groupId: stableGroupId, name: option.name || '' });
    }
  }

  // Pre-flight check: Reject foreign modifier groups belonging to other tenants
  if (incomingGroupIds.size > 0) {
    const grpList = Array.from(incomingGroupIds);
    for (let i = 0; i < grpList.length; i += 50) {
      const chunk = grpList.slice(i, i + 50);
      const placeholders = chunk.map(() => '?').join(',');
      const { results } = await env.DB.prepare(
        `SELECT id, tenant_id FROM modifier_groups WHERE id IN (${placeholders})`
      ).bind(...chunk).all<any>();
      for (const row of (results || [])) {
        if (row.tenant_id !== tenantId) {
          throw new Error('FORBIDDEN_MODIFIER_GROUP_ID');
        }
      }
    }
  }

  // Pre-flight check: Reject foreign modifier options or options belonging to a different group
  if (incomingOptionMap.size > 0) {
    const optList = Array.from(incomingOptionMap.keys());
    for (let i = 0; i < optList.length; i += 50) {
      const chunk = optList.slice(i, i + 50);
      const placeholders = chunk.map(() => '?').join(',');
      const { results } = await env.DB.prepare(
        `SELECT id, tenant_id, group_id FROM modifier_options WHERE id IN (${placeholders})`
      ).bind(...chunk).all<any>();
      for (const row of (results || [])) {
        if (row.tenant_id !== tenantId) {
          throw new Error('FORBIDDEN_MODIFIER_OPTION_ID');
        }
        const incoming = incomingOptionMap.get(row.id);
        if (incoming && incoming.groupId && incoming.groupId !== row.group_id) {
          throw new Error('INVALID_MODIFIER_OPTION_GROUP');
        }
      }
    }
  }

  const catIdMap = new Map<string, string>();
  const catNameMap = new Map<string, string>();
  const catShortNameMap = new Map<string, string>();
  for (const cat of (existingCats || [])) {
    catIdMap.set(cat.slug as string, cat.id as string);
    catIdMap.set(cat.id as string, cat.id as string);
    if (cat.name) {
      catNameMap.set(cat.slug as string, cat.name as string);
      catNameMap.set(cat.id as string, cat.name as string);
    }
    if (cat.short_name) {
      catShortNameMap.set(cat.slug as string, cat.short_name as string);
      catShortNameMap.set(cat.id as string, cat.short_name as string);
    }
  }

  const itemIdMap = new Map<string, string>();
  for (const item of (existingItems || [])) {
    itemIdMap.set(`${item.category_id}:${item.name}`, item.id as string);
    itemIdMap.set(item.id as string, item.id as string);
  }

  const statements: any[] = [];
  const processedGroupIds = new Set<string>();
  const defaultCategoryNamesZh: Record<string, string> = {
    main: "招牌炸蛋蔥餅",
    spicy: "加辣選項",
    egg: "雞蛋選項",
    lettuce: "生菜選項",
    topping: "加料選項",
    small: "🥖 小麵包",
    large: "🍔 大麵包",
    combo: "🎁 特惠套餐 (含飲料)",
    drinks: "🥤 單點飲料"
  };

  const deletions = menuData.__delete || {};
  const categoryDeletes: string[] = (deletions.categories || []).map((id: string) => {
    const resolved = catIdMap.get(id);
    if (!resolved) throw new Error('UNKNOWN_MENU_CATEGORY_DELETE');
    return resolved;
  });
  const itemDeletes: string[] = deletions.items || [];
  const customDeletes: string[] = deletions.customizations || [];
  if (itemDeletes.some(id => !ownedItemIds.has(id)) || customDeletes.some(id => !ownedCustomIds.has(id) && !ownedGroupIds.has(id))) {
    throw new Error('UNKNOWN_MENU_DELETE_ID');
  }
  const activeCategoryIds: string[] = [];
  const activeItemIds: string[] = [];

  let catSortOrder = 1;
  for (const slug of Object.keys(menuData)) {
    if (slug === '__delete') continue;
    const currentSortOrder = catSortOrder++;
    if (slug === '__customizations') {
      const customizationData = menuData[slug];
      const customList = Array.isArray(customizationData) ? customizationData : (customizationData?.groups || customizationData?.list || []);
      if (!Array.isArray(customizationData) && customizationData.sortOrder !== undefined && customList.some((group: any) => (group.scope || 'order') === 'order')) {
        const sections = existingCats.filter(cat => cat.category_type === 'order_customization' || cat.slug === 'sec-flavor' || cat.slug === 'flavor');
        if (sections.length > 1) throw new Error('AMBIGUOUS_CUSTOMIZATION_CATEGORY');
        const section = sections[0];
        const sectionId = String(section?.id || `${tenantId}_sec-flavor`);
        // Older bootstrap readers use a tenant-prefixed placeholder when the category ID is absent.
        if (customizationData.id && ![sectionId, 'sec-flavor', `${tenantId}_sec-flavor`].includes(customizationData.id)) throw new Error('INVALID_CUSTOMIZATION_CATEGORY_ID');
        if (!section || Number(section.sort_order) !== customizationData.sortOrder || section.category_type !== 'order_customization') {
          statements.push(env.DB.prepare(`INSERT INTO menu_categories (id,tenant_id,slug,name,short_name,category_type,allow_customization,applied_modifiers,sort_order)
            VALUES (?,?,?,?,?,'order_customization',0,'[]',?)
            ON CONFLICT(id) DO UPDATE SET sort_order=excluded.sort_order,category_type=excluded.category_type WHERE menu_categories.tenant_id=excluded.tenant_id`)
            .bind(sectionId, tenantId, section?.slug || 'sec-flavor', section?.name || '口味選擇', section?.short_name || '口味選擇', customizationData.sortOrder));
        }
      }
      const activeCustomIds: string[] = [];
      const sortedOrderGroups = new Set<string>();
      for (const cust of customList) {
        if (!cust || !cust.key) continue;
        const custKey = cust.key;
        const custTitle = cust.title || custKey;
        const custType = cust.type || 'radio';
        const custSort = Number(cust.sortOrder ?? cust.sort_order ?? 0);
        const custIsRequired = (cust.isRequired || cust.is_required) ? 1 : 0;
        const optionsList = Array.isArray(cust.options) ? cust.options : [];
        const custId = cust.sourceId || cust.id || customIdMap.get(custKey) || `custom_${tenantId}_${custKey}`;
        if (!ownedCustomIds.has(custId) && !ownedGroupIds.has(custId) && !custId.startsWith(`custom_${tenantId}_`)) {
          throw new Error('INVALID_CUSTOMIZATION_ID');
        }
        if (customDeletes.includes(custId)) throw new Error('CONFLICTING_MENU_DELETE');
        activeCustomIds.push(custId);

        const custScope = cust.scope || 'order';
        if (unifiedMenuEnabled(env)) {
          // The whole-menu writer changes order only; entity APIs own group configuration.
          const groupId = String(cust.canonicalId || cust.id || '');
          const stored = existingGroups.find(group => String(group.id) === groupId);
          if (custScope === 'order' && cust.sortOrder !== undefined) {
            if (!stored || stored.scope !== 'order') throw new Error('INVALID_ORDER_GROUP_SCOPE');
            if (sortedOrderGroups.has(groupId)) throw new Error('DUPLICATE_ORDER_GROUP');
            sortedOrderGroups.add(groupId);
            if (Number(stored.sort_order) !== cust.sortOrder) {
              statements.push(env.DB.prepare(`UPDATE modifier_groups SET sort_order=?,revision=revision+1,updated_at=datetime('now') WHERE tenant_id=? AND id=? AND scope='order'`).bind(cust.sortOrder, tenantId, groupId));
            }
          }
          continue;
        }
        const modGroupId = String(cust.canonicalId || (cust.sourceId ? (cust.id || cust.sourceId) : (cust.id || `mg_${custId}`)));
        if (!ownedGroupIds.has(modGroupId) && !ownedCustomIds.has(modGroupId) && !modGroupId.startsWith(`custom_${tenantId}_`)) {
          throw new Error('INVALID_MODIFIER_GROUP_ID');
        }

        // Sync with modifier_groups table with scope support (Pure Canonical New Schema)
        const selectionType = custType === 'checkbox' ? 'multiple' : 'single';
        const minSel = Number(cust.minSelection ?? (custIsRequired ? 1 : 0));
        const maxSel = Number(cust.maxSelection ?? (selectionType === 'single' ? 1 : 99));
        processedGroupIds.add(modGroupId);

        statements.push(
          env.DB.prepare(
            `INSERT INTO modifier_groups (id, tenant_id, name, selection_type, is_required, min_selection, max_selection, sort_order, scope, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               selection_type = excluded.selection_type,
               is_required = excluded.is_required,
               min_selection = excluded.min_selection,
               max_selection = excluded.max_selection,
               sort_order = excluded.sort_order,
               scope = excluded.scope,
               updated_at = datetime('now')
             WHERE modifier_groups.tenant_id = excluded.tenant_id`
          ).bind(modGroupId, tenantId, custTitle, selectionType, custIsRequired, minSel, maxSel, custSort, custScope)
        );

        // Sync modifier options
        const activeOptIds: string[] = [];
        for (let oIdx = 0; oIdx < optionsList.length; oIdx++) {
          const opt = optionsList[oIdx];
          const optId = opt.id ? String(opt.id) : `mo_${modGroupId}_${oIdx}`;
          activeOptIds.push(optId);
          const optName = opt.name || opt.title || '';
          const optPrice = Number(opt.price || opt.surcharge || 0);
          const outOfStockUntil = opt.outOfStockUntil ?? opt.out_of_stock_until ?? null;
          const subOptionsJson = JSON.stringify(opt.subOptions || opt.sub_options || opt.sub_options_json || []);
          const eligibilityRulesJson = JSON.stringify(opt.eligibilityRules || opt.eligibility_rules || opt.eligibility_rules_json || []);
          statements.push(
            env.DB.prepare(
              `INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, out_of_stock_until, sub_options_json, eligibility_rules_json, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
               ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 price = excluded.price,
                 is_default = excluded.is_default,
                 sort_order = excluded.sort_order,
                 out_of_stock_until = COALESCE(excluded.out_of_stock_until, modifier_options.out_of_stock_until),
                 sub_options_json = excluded.sub_options_json,
                 eligibility_rules_json = excluded.eligibility_rules_json,
                 updated_at = datetime('now')
               WHERE modifier_options.tenant_id = excluded.tenant_id`
            ).bind(optId, tenantId, modGroupId, optName, optPrice, (opt.isDefault || opt.is_default) ? 1 : 0, oIdx, outOfStockUntil, subOptionsJson, eligibilityRulesJson)
          );
        }

        // Delete unmanaged modifier options for this group
        if (activeOptIds.length > 0) {
          const optPlaceholders = activeOptIds.map(() => '?').join(',');
          statements.push(
            env.DB.prepare(
              `DELETE FROM modifier_options WHERE tenant_id = ? AND group_id = ? AND id NOT IN (${optPlaceholders})`
            ).bind(tenantId, modGroupId, ...activeOptIds)
          );
        }

        if (activeOptIds.length === 0) {
          statements.push(env.DB.prepare('DELETE FROM modifier_options WHERE tenant_id = ? AND group_id = ?').bind(tenantId, modGroupId));
        }

        // Synchronize category_modifier_links if category-level soft inheritance
        statements.push(
          env.DB.prepare(`DELETE FROM category_modifier_links WHERE tenant_id = ? AND group_id = ?`).bind(tenantId, modGroupId)
        );
        if (custScope === 'category' && Array.isArray(cust.appliedCategories) && cust.appliedCategories.length > 0) {
          let linkSort = 0;
          for (const appliedTarget of cust.appliedCategories) {
            linkSort++;
            const resolvedCatId = catIdMap.get(appliedTarget) || appliedTarget;
            statements.push(
              env.DB.prepare(
                `INSERT INTO category_modifier_links (tenant_id, category_id, group_id, sort_order)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(tenant_id, category_id, group_id) DO UPDATE SET sort_order = excluded.sort_order`
              ).bind(tenantId, resolvedCatId, modGroupId, linkSort)
            );
          }
        }
      }
      continue;
    }

    const itemsMap = menuData[slug];
    const customCatName = (itemsMap && (itemsMap.__title || itemsMap._name)) || null;
    const customCatShortName = (itemsMap && (itemsMap.__short_name || itemsMap._short_name || itemsMap.__short_title || itemsMap._short_title)) || null;
    const customCatType = (itemsMap && (itemsMap.__type || itemsMap._type)) || 'catalog';
    const customCatSort = (itemsMap && (itemsMap.__sort_order !== undefined || itemsMap._sort_order !== undefined))
      ? Number(itemsMap.__sort_order ?? itemsMap._sort_order)
      : currentSortOrder;

    // Skip order_customization / sec-flavor UI containers from being saved to menu_categories
    if (slug === 'sec-flavor' || slug.startsWith('sec-') || customCatType === 'order_customization') {
      continue;
    }

    let catId = catIdMap.get(slug);
    if (!catId) {
      catId = `${tenantId}_${slug}`;
    }
    activeCategoryIds.push(catId);

    const allowCustomization = (itemsMap && (itemsMap.__allow_customization !== undefined || itemsMap._allow_customization !== undefined))
      ? ((itemsMap.__allow_customization ?? itemsMap._allow_customization) ? 1 : 0)
      : (slug === 'drinks' ? 0 : 1);

    let appliedModifiers: string | null = null;
    if (itemsMap && (itemsMap.__applied_modifiers !== undefined || itemsMap._applied_modifiers !== undefined)) {
      const rawMods = itemsMap.__applied_modifiers ?? itemsMap._applied_modifiers;
      appliedModifiers = typeof rawMods === 'string' ? rawMods : JSON.stringify(rawMods);
    } else if (allowCustomization === 0) {
      appliedModifiers = '[]';
    }

    const catName = customCatName || catNameMap.get(slug) || defaultCategoryNamesZh[slug] || slug;
    const catShortName = customCatShortName || (customCatName ? customCatName : (catShortNameMap.get(slug) || catName));

    statements.push(
      env.DB.prepare(
        `INSERT INTO menu_categories (id, tenant_id, name, short_name, slug, category_type, allow_customization, applied_modifiers, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET 
           name = excluded.name, 
           short_name = excluded.short_name,
           slug = excluded.slug,
           category_type = excluded.category_type,
           allow_customization = excluded.allow_customization,
           applied_modifiers = excluded.applied_modifiers,
           sort_order = excluded.sort_order
             WHERE menu_categories.tenant_id = excluded.tenant_id`
      ).bind(catId, tenantId, catName, catShortName, slug, customCatType, allowCustomization, appliedModifiers, customCatSort)
    );

    if (itemsMap && typeof itemsMap === "object") {
      let itemSortOrder = 1;
      for (const itemName of Object.keys(itemsMap)) {
        if (itemName.startsWith("_")) continue;
        const itemVal = itemsMap[itemName];
        let price = 0;
        let badgeText: string | null = null;
        let isRec = 0;
        let itemType = 'standard';
        let modifierGroups: any[] | null = null;

        if (typeof itemVal === "object" && itemVal !== null) {
          price = Number(itemVal.price);
          badgeText = itemVal.badge_text || itemVal.badgeText || null;
          isRec = itemVal.is_recommended || itemVal.isRecommended ? 1 : 0;
          itemType = itemVal.item_type || itemVal.itemType || (itemVal.is_bundle ? 'bundle' : 'standard');
          if (Array.isArray(itemVal.modifier_groups || itemVal.modifierGroups)) {
            modifierGroups = itemVal.modifier_groups || itemVal.modifierGroups;
          }
        } else {
          price = Number(itemVal);
        }
        if (isNaN(price)) continue;

        if (itemVal?.id && !ownedItemIds.has(itemVal.id) && !itemVal.id.startsWith(`${tenantId}_`)) {
          throw new Error('INVALID_MENU_ITEM_ID');
        }
        let itemId = itemVal?.id || itemIdMap.get(`${catId}:${itemName}`);
        if (!itemId) {
          itemId = `${tenantId}_${slug}_${itemName}`;
        }
        activeItemIds.push(itemId);
        if (unifiedCatalog) {
          const old = unifiedCatalog.products.find(p=>p.id===itemId);
          unifiedCatalog.products = unifiedCatalog.products.filter(p=>p.id!==itemId).concat({...old,id:itemId,tenant_id:tenantId,category_id:catId,name:itemName,price});
        }

        const explicitItemSort = (itemVal && (itemVal.sort_order !== undefined || itemVal.sortOrder !== undefined))
          ? Number(itemVal.sort_order ?? itemVal.sortOrder)
          : itemSortOrder++;

        statements.push(
          env.DB.prepare(
            `INSERT INTO menu_items (id, tenant_id, category_id, name, price, badge_text, is_recommended, sort_order, item_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET 
               category_id = excluded.category_id,
               name = excluded.name,
               price = excluded.price, 
               badge_text = excluded.badge_text, 
               is_recommended = excluded.is_recommended, 
               sort_order = excluded.sort_order,
               item_type = excluded.item_type
             WHERE menu_items.tenant_id = excluded.tenant_id`
          ).bind(itemId, tenantId, catId, itemName, price, badgeText, isRec, explicitItemSort, itemType)
        );

        // If modifier groups are provided for this item, persist them
        if (modifierGroups !== null && !unifiedMenuEnabled(env)) {
          statements.push(
            env.DB.prepare("DELETE FROM item_modifier_links WHERE tenant_id = ? AND item_id = ?").bind(tenantId, itemId)
          );
          let linkOrder = 0;
          for (const grp of modifierGroups) {
            linkOrder++;
            const grpId = grp.id || generateUniqueModifierId('mg', tenantId);
            const grpName = grp.name || grp.title || '';
            const selectionType = grp.selectionType || grp.selection_type || 'single';
            const isReq = (grp.isRequired || grp.is_required) ? 1 : 0;
            const minSel = Number(grp.minSelection ?? grp.min_selection ?? (isReq ? 1 : 0));
            const maxSel = Number(grp.maxSelection ?? grp.max_selection ?? (selectionType === 'single' ? 1 : 99));
            const grpSort = Number(grp.sortOrder ?? grp.sort_order ?? linkOrder);

            if (!processedGroupIds.has(grpId)) {
              processedGroupIds.add(grpId);

              statements.push(
                env.DB.prepare(
                  `INSERT INTO modifier_groups (id, tenant_id, name, selection_type, is_required, min_selection, max_selection, sort_order, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                   ON CONFLICT(id) DO UPDATE SET
                     name = excluded.name,
                     selection_type = excluded.selection_type,
                     is_required = excluded.is_required,
                     min_selection = excluded.min_selection,
                     max_selection = excluded.max_selection,
                     sort_order = excluded.sort_order,
                     updated_at = datetime('now')
                   WHERE modifier_groups.tenant_id = excluded.tenant_id`
                ).bind(grpId, tenantId, grpName, selectionType, isReq, minSel, maxSel, grpSort)
              );

              const options = Array.isArray(grp.options) ? grp.options : [];
              const activeOptIds: string[] = [];
              let optOrder = 0;
              for (const opt of options) {
                optOrder++;
                const optId = opt.id || generateUniqueModifierId('mo', tenantId);
                activeOptIds.push(optId);
                const optName = opt.name || opt.title || '';
                const optPrice = Number(opt.price || 0);
                const optIsDef = (opt.isDefault || opt.is_default) ? 1 : 0;
                const optSort = Number(opt.sortOrder ?? opt.sort_order ?? optOrder);
                const outOfStockUntil = opt.outOfStockUntil ?? opt.out_of_stock_until ?? null;

                statements.push(
                  env.DB.prepare(
                    `INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, out_of_stock_until, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                     ON CONFLICT(id) DO UPDATE SET
                       name = excluded.name,
                       price = excluded.price,
                       is_default = excluded.is_default,
                       sort_order = excluded.sort_order,
                       out_of_stock_until = COALESCE(excluded.out_of_stock_until, modifier_options.out_of_stock_until),
                       updated_at = datetime('now')
                     WHERE modifier_options.tenant_id = excluded.tenant_id`
                  ).bind(optId, tenantId, grpId, optName, optPrice, optIsDef, optSort, outOfStockUntil)
                );
              }

              if (activeOptIds.length > 0) {
                const optPlaceholders = activeOptIds.map(() => '?').join(',');
                statements.push(
                  env.DB.prepare(
                    `DELETE FROM modifier_options WHERE tenant_id = ? AND group_id = ? AND id NOT IN (${optPlaceholders})`
                  ).bind(tenantId, grpId, ...activeOptIds)
                );
              } else {
                statements.push(
                  env.DB.prepare(
                    `DELETE FROM modifier_options WHERE tenant_id = ? AND group_id = ?`
                  ).bind(tenantId, grpId)
                );
              }
            }

            statements.push(
              env.DB.prepare(
                `INSERT INTO item_modifier_links (tenant_id, item_id, group_id, sort_order)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(tenant_id, item_id, group_id) DO UPDATE SET sort_order = excluded.sort_order`
              ).bind(tenantId, itemId, grpId, linkOrder)
            );
          }
        }
      }
    }
  }

  if (activeCategoryIds.some(id => categoryDeletes.includes(id)) ||
      activeItemIds.some(id => itemDeletes.includes(id))) throw new Error('CONFLICTING_MENU_DELETE');

  // Explicit category deletion also removes its child items and modifier links.
  for (const id of categoryDeletes) {
    statements.push(env.DB.prepare('DELETE FROM item_modifier_links WHERE tenant_id = ? AND item_id IN (SELECT id FROM menu_items WHERE tenant_id = ? AND category_id = ?)').bind(tenantId, tenantId, id));
    statements.push(env.DB.prepare('DELETE FROM menu_items WHERE tenant_id = ? AND category_id = ?').bind(tenantId, id));
  }
  if (itemDeletes.length > 0) {
    for (let i = 0; i < itemDeletes.length; i += 50) {
      const chunk = itemDeletes.slice(i, i + 50);
      statements.push(env.DB.prepare(
        `DELETE FROM item_modifier_links WHERE tenant_id = ? AND item_id IN (${chunk.map(() => '?').join(',')})`
      ).bind(tenantId, ...chunk));
    }
  }
  for (const [table, ids] of [
    ['menu_items', itemDeletes],
    ['menu_customizations', customDeletes],
    ['menu_categories', categoryDeletes]
  ] as [string, string[]][]) {
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      statements.push(env.DB.prepare(
        `DELETE FROM ${table} WHERE tenant_id = ? AND id IN (${chunk.map(() => '?').join(',')})`
      ).bind(tenantId, ...chunk));
    }
  }

  if (itemDeletes.length > 0) {
    try {
      const { results: bundleTbl } = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='menu_bundle_rules'"
      ).all();
      if (bundleTbl && bundleTbl.length > 0) {
        for (let i = 0; i < itemDeletes.length; i += 50) {
          const chunk = itemDeletes.slice(i, i + 50);
          statements.push(env.DB.prepare(
            `DELETE FROM menu_bundle_rules WHERE tenant_id = ? AND parent_item_id IN (${chunk.map(() => '?').join(',')})`
          ).bind(tenantId, ...chunk));
        }
      }
    } catch {
      // Ignore if sqlite_master check is unsupported in mock DB
    }
  }

  for (const id of customDeletes) {
    const groupIds = new Set([id, id.startsWith('mg_') ? id.slice(3) : `mg_${id}`]);
    for (const groupId of groupIds) {
      statements.push(env.DB.prepare('DELETE FROM item_modifier_links WHERE tenant_id = ? AND group_id = ?').bind(tenantId, groupId));
      statements.push(env.DB.prepare('DELETE FROM category_modifier_links WHERE tenant_id = ? AND group_id = ?').bind(tenantId, groupId));
      statements.push(env.DB.prepare('DELETE FROM modifier_options WHERE tenant_id = ? AND group_id = ?').bind(tenantId, groupId));
      statements.push(env.DB.prepare('DELETE FROM modifier_groups WHERE tenant_id = ? AND id = ?').bind(tenantId, groupId));
    }
  }

  if (unifiedCatalog) {
    const removed = new Set([...itemDeletes,...unifiedCatalog.products.filter(p=>categoryDeletes.includes(p.category_id)).map(p=>p.id)]);
    if (unifiedCatalog.groups.some(g=>groupOptions(unifiedCatalog,g).some(o=>(o.productId && removed.has(o.productId)) || o.subOptions.some(sub=>sub.productId && removed.has(sub.productId))))) throw new Error('PRODUCT_IS_LINKED');
    unifiedCatalog.products=unifiedCatalog.products.filter(p=>!removed.has(p.id));
    const removedGroups=new Set(customDeletes.flatMap(id=>[id,id.startsWith('mg_')?id.slice(3):`mg_${id}`]));
    unifiedCatalog.groups=unifiedCatalog.groups.filter(g=>!removedGroups.has(g.id));
    unifiedCatalog.links=unifiedCatalog.links.filter(l=>!removed.has(l.itemId) && !removedGroups.has(l.groupId));
    unifiedCatalog.categoryLinks=unifiedCatalog.categoryLinks.filter(l=>!categoryDeletes.includes(l.categoryId) && !removedGroups.has(l.groupId));
    validateOptionGraph(unifiedCatalog);
    const guardId=crypto.randomUUID();
    statements.unshift(env.DB.prepare('INSERT INTO menu_write_guards (id,valid) VALUES (?, CASE WHEN COALESCE((SELECT revision FROM menu_catalog_revisions WHERE tenant_id=?),0)=? THEN 1 ELSE 0 END)').bind(guardId,tenantId,unifiedCatalog.revision || 0));
    statements.push(env.DB.prepare('DELETE FROM menu_write_guards WHERE id=?').bind(guardId));
  }

  // Unlinked library groups are still editable definitions. Only an explicit
  // __delete.customizations request may remove a group and its links/options.
  // One batch keeps the entire menu update atomic if any statement fails.
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
}

export async function updateMenu(request: Request, env: Env): Promise<Response> {
  try {
    const tenantId = getTenantId(request);
    const data = await request.json();

    if (!env.DB) return json({ error: 'MENU_DATABASE_UNAVAILABLE' }, 503);
    await syncMenuToD1(tenantId, data, env);

    // 3. Xóa cache đa hộ thuê để force reload ở lượt đọc sau
    const cacheKey = `tenant:${tenantId}:menu`;
    await env.ORDER_STATE.delete(cacheKey);
    await invalidateBootstrapCache(tenantId, env);

    return json({ success: true });
  } catch (e: any) {
    console.error("Update menu failed:", e);
    const code = typeof e?.message === 'string' && e.message ? e.message : 'INVALID_MENU_PAYLOAD';
    if (code.includes('CHECK constraint')) return json({ code: 'MENU_CONFLICT', error: 'MENU_CONFLICT' }, 409);
    return json({ code, error: code }, 400);
  }
}

/**
 * Safely extracts menu items for a specified category from the store menu.
 */
export function getMenuCategoryItems(categoryKey: keyof Menu, menu: Menu = DEFAULT_MENU): Record<string, number> {
  if (!menu || !menu[categoryKey]) {
    return {};
  }
  return menu[categoryKey];
}

/**
 * Retrieves store menu data directly for internal AI/worker processing.
 */
export async function getMenuData(env: Env, tenantId: string): Promise<Menu> {
  const cacheKey = `tenant:${tenantId}:menu`;
  try {
    if (env.ORDER_STATE) {
      const cached = await env.ORDER_STATE.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }
  } catch (e) {
    console.error(`[Menu] KV cache read failed for tenant ${tenantId}:`, e);
  }

  if (env.DB) {
    try {
      const [categoriesRes, itemsRes] = await env.DB.batch([
        env.DB.prepare("SELECT id, name, slug FROM menu_categories WHERE tenant_id = ? AND COALESCE(category_type, 'catalog') = 'catalog' ORDER BY sort_order ASC").bind(tenantId),
        env.DB.prepare("SELECT id, category_id, name, price, description, out_of_stock_until FROM menu_items WHERE tenant_id = ? ORDER BY sort_order ASC").bind(tenantId)
      ]);

      const categories = categoriesRes.results as Array<{ id: string; name: string; slug: string }>;
      const items = itemsRes.results as Array<{
        id: string;
        category_id: string;
        name: string;
        price: number;
        description: string | null;
        out_of_stock_until: string | null;
      }>;

      if (categories.length > 0 && items.length > 0) {
        const catMap = new Map<string, string>();
        const menuData: Menu = { out_of_stock: [] };

        for (const cat of categories) {
          menuData[cat.slug] = {};
          catMap.set(cat.id, cat.slug);
        }

        const now = new Date();
        for (const item of items) {
          const categorySlug = catMap.get(item.category_id);
          if (!categorySlug) continue;
          menuData[categorySlug][item.name] = item.price;

          if (item.out_of_stock_until && new Date(item.out_of_stock_until) > now) {
            menuData.out_of_stock!.push(`${categorySlug}:${item.name}`);
          }
        }

        return menuData;
      }
    } catch (e) {
      console.error(`[Menu] D1 read failed for tenant ${tenantId}:`, e);
    }
  }

  return DEFAULT_MENU;
}

/**
 * Formats live store menu into a clean structured prompt text for AI system prompt context.
 */
export function formatMenuForPrompt(menuData: Menu): string {
  const categoryNames: Record<string, string> = {
    small: "小麵包 (Bánh mì nhỏ / Small Banh Mi)",
    large: "大麵包 (Bánh mì lớn / Large Banh Mi)",
    combo: "套餐 (Combo + Đồ uống / Set Combo)",
    drinks: "單點飲料 (Đồ uống / Drinks)",
    topping: "加料 (Topping / Extra Items)"
  };

  const oosSet = new Set(menuData.out_of_stock || []);
  const lines: string[] = ["📋 門市現有菜單 (STORE MENU - LIVE REAL-TIME):"];

  const categories = ["large", "small", "combo", "drinks", "topping"];
  for (const catKey of categories) {
    const items = menuData[catKey];
    if (!items || Object.keys(items).length === 0) continue;

    const catTitle = categoryNames[catKey] || catKey;
    lines.push(`\n- ${catTitle}:`);

    for (const [name, price] of Object.entries(items)) {
      const isOos = oosSet.has(`${catKey}:${name}`);
      const oosTag = isOos ? " [🔴 售完 HẾT HÀNG]" : " [🟢 正常供應 CÒN HÀNG]";
      lines.push(`  + ${name}: $${price}${oosTag}`);
    }
  }

  return lines.join("\n");
}

/**
 * Creates, updates, or deletes a bundle rule for a menu item.
 * POST /api/menu/bundle-rules?tenant_id={tenantId}
 */
export async function updateBundleRule(request: Request, env: Env): Promise<Response> {
  if (unifiedMenuEnabled(env)) return json({ error: 'USE_OPTION_GROUPS' }, 409);
  try {
    const tenantId = getTenantId(request);
    if (!env.DB) {
      return json({ error: "Database not bound" }, 500);
    }

    const body: any = await request.json();
    let parentItemId = body.parent_item_id;

    // Fallback resolution if parentItemId is missing but name & category are given
    if (!parentItemId && body.item_name && (body.category_id || body.category_slug)) {
      const catSlug = body.category_slug || body.category_id;
      const itemRow = await env.DB.prepare(
        `SELECT id FROM menu_items 
         WHERE tenant_id = ? AND name = ? 
           AND category_id = (SELECT id FROM menu_categories WHERE tenant_id = ? AND (slug = ? OR id = ?))
         LIMIT 1`
      ).bind(tenantId, body.item_name, tenantId, catSlug, catSlug).first();

      if (itemRow && itemRow.id) {
        parentItemId = itemRow.id as string;
      }
    }

    if (!parentItemId) {
      return json({ error: "parent_item_id is required" }, 400);
    }

    const existingRule = await env.DB.prepare('SELECT schema_version FROM menu_bundle_rules WHERE tenant_id = ? AND parent_item_id = ?')
      .bind(tenantId, parentItemId).first<{ schema_version: number }>();
    if (existingRule && existingRule.schema_version >= 2) {
      return json({ error: 'Edit this combo with the new combo editor', code: 'BUNDLE_EDITOR_VERSION' }, 409);
    }

    // 1. Delete / Deactivate bundle rule
    if (body.delete === true || body.isActive === false || (body.config && Array.isArray(body.config.groups) && body.config.groups.length === 0)) {
      await env.DB.prepare(
        "DELETE FROM menu_bundle_rules WHERE tenant_id = ? AND parent_item_id = ?"
      ).bind(tenantId, parentItemId).run();

      const cacheKey = `tenant:${tenantId}:menu`;
      if (env.ORDER_STATE) await env.ORDER_STATE.delete(cacheKey);
      await invalidateBootstrapCache(tenantId, env);

      return json({ success: true, deleted: true });
    }

    // 2. Validate & normalize bundle config
    const config = body.config;
    if (!config || !Array.isArray(config.groups) || config.groups.length === 0) {
      return json({ error: "config.groups array is required and must not be empty" }, 400);
    }

    const normalizedGroups = config.groups.map((grp: any, gIdx: number) => {
      const gId = grp.id || `group_${gIdx + 1}_${Date.now()}`;
      const minQty = Math.max(1, Number(grp.minQuantity ?? 1));
      const maxQty = Math.max(minQty, Number(grp.maxQuantity ?? minQty));
      const allowRepeats = grp.allowRepeats !== undefined ? Boolean(grp.allowRepeats) : (grp.allowRepeat !== undefined ? Boolean(grp.allowRepeat) : true);

      return {
        id: gId,
        label: grp.label || (grp.name ? { "zh-TW": grp.name, "vi": grp.name } : { "zh-TW": `選擇 ${minQty} 樣`, "vi": `Chọn ${minQty} món` }),
        name: typeof grp.label === 'object' ? (grp.label['zh-TW'] || grp.label['vi'] || grp.name) : (grp.name || grp.label),
        minQuantity: minQty,
        maxQuantity: maxQty,
        allowRepeat: allowRepeats,
        allowRepeats: allowRepeats,
        sources: Array.isArray(grp.sources) ? grp.sources : [],
        pricing: grp.pricing || { type: "included" }
      };
    });

    const ruleConfig = {
      version: config.version || 1,
      groups: normalizedGroups
    };
    const configJson = JSON.stringify(ruleConfig);
    const ruleId = `rule_${tenantId}_${parentItemId}`;

    await env.DB.prepare(
      `INSERT INTO menu_bundle_rules (id, tenant_id, parent_item_id, schema_version, config_json, is_active, updated_at)
       VALUES (?, ?, ?, 1, ?, 1, datetime('now'))
       ON CONFLICT(tenant_id, parent_item_id) DO UPDATE SET
         schema_version = 1,
         config_json = excluded.config_json,
         is_active = 1,
         updated_at = datetime('now')`
    ).bind(ruleId, tenantId, parentItemId, configJson).run();

    // Invalidate KV & Bootstrap Cache
    const cacheKey = `tenant:${tenantId}:menu`;
    if (env.ORDER_STATE) await env.ORDER_STATE.delete(cacheKey);
    await invalidateBootstrapCache(tenantId, env);

    return json({ success: true, bundleRule: ruleConfig });
  } catch (err: any) {
    console.error("[updateBundleRule] Failed:", err);
    return json({ error: err.message || "Internal Server Error" }, 500);
  }
}

/** Save a product and its v2 bundle configuration in one D1 transaction. */
export async function saveBundleProduct(request: Request, env: Env): Promise<Response> {
  if (unifiedMenuEnabled(env)) return json({ error: 'USE_OPTION_GROUPS' }, 409);
  try {
    const tenantId = getTenantId(request);
    const tenantConfig = await env.DB.prepare('SELECT features FROM tenant_config WHERE tenant_id = ?').bind(tenantId).first<{ features: string | null }>();
    let tenantFeatures: string[] = [];
    try { tenantFeatures = JSON.parse(tenantConfig?.features || '[]'); } catch { tenantFeatures = []; }
    if (Array.isArray(tenantFeatures) && tenantFeatures.includes('disable_bundle_builder_v2')) {
      return json({ code: 'BUNDLE_EDITOR_DISABLED', error: 'Combo editor is temporarily unavailable' }, 423);
    }
    const body: any = await request.json();
    const product = body.product || {};
    const name = String(product.name || '').trim();
    const categoryId = String(product.categoryId || '');
    const price = Number(product.price);
    if (!name || !Number.isFinite(price) || price < 0 || Math.abs(Math.round(price * 100) - price * 100) >= 0.000001) {
      return json({ code: 'BUNDLE_INVALID_PRODUCT', error: 'Invalid product name or price' }, 400);
    }
    const category = await env.DB.prepare("SELECT id FROM menu_categories WHERE tenant_id = ? AND id = ? AND category_type = 'catalog'")
      .bind(tenantId, categoryId).first();
    if (!category) return json({ code: 'BUNDLE_INVALID_CATEGORY', error: 'Category not found' }, 400);
    const catalog = await loadBundleCatalog(env, tenantId);
    const itemId = product.id ? String(product.id) : crypto.randomUUID();
    const existing = catalog.items.get(itemId);
    if (product.id && !existing) return json({ code: 'BUNDLE_PRODUCT_NOT_FOUND', error: 'Product not found' }, 404);
    if ([...catalog.items.values()].some(item => item.id !== itemId && item.category_id === categoryId && item.name === name)) {
      return json({ code: 'BUNDLE_DUPLICATE_PRODUCT', error: 'A product with this name already exists in the category' }, 409);
    }
    const childItems = new Map([...catalog.items].filter(([id, item]) => !catalog.rules.has(id) && catalog.categories.get(item.category_id)?.category_type === 'catalog'));
    let config;
    try { config = normalizeBundleConfig(body.config, childItems, itemId); }
    catch (error: any) { return json({ code: 'BUNDLE_INVALID_CONFIG', error: error.message }, 400); }
    const ruleId = `rule_${tenantId}_${itemId}`;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO menu_items (id, tenant_id, category_id, name, price, item_type, sort_order)
        VALUES (?, ?, ?, ?, ?, 'bundle', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM menu_items WHERE tenant_id = ? AND category_id = ?))
        ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, name = excluded.name, price = excluded.price, item_type = 'bundle', updated_at = datetime('now')
        WHERE menu_items.tenant_id = excluded.tenant_id`)
        .bind(itemId, tenantId, categoryId, name, price, tenantId, categoryId),
      env.DB.prepare(`INSERT INTO menu_bundle_rules (id, tenant_id, parent_item_id, schema_version, config_json, is_active, updated_at)
        VALUES (?, ?, ?, 2, ?, 1, datetime('now'))
        ON CONFLICT(tenant_id, parent_item_id) DO UPDATE SET schema_version = 2, config_json = excluded.config_json, is_active = 1, updated_at = datetime('now')`)
        .bind(ruleId, tenantId, itemId, JSON.stringify(config))
    ]);
    if (env.ORDER_STATE) await env.ORDER_STATE.delete(`tenant:${tenantId}:menu`);
    await invalidateBootstrapCache(tenantId, env);
    return json({ success: true, product: { id: itemId, categoryId, name, price }, bundleRule: config });
  } catch (error: any) {
    console.error('[saveBundleProduct]', error);
    return json({ code: 'BUNDLE_SAVE_FAILED', error: 'Could not save combo' }, 500);
  }
}
