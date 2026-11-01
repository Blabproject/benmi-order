import { attachPayments } from './payments';
import { verifyStaffSession } from './staff';
import { writeDetailedOrder } from './order-detail-write';
import { attachOrderDetails, detailReads, detailWrites } from './order-detail';
import { unifiedMenuEnabled, validateUnifiedOrderItems } from './option-groups';
import { resolveOrderKey } from './order-identity';
import { Env } from '../types/env';
import { Order, DiningOption, AppendOrderPayload, OrderItemInput } from '../types/index';
import { corsHeaders, json } from '../utils/http';
import { syncToGoogleSheets } from '../integrations/googleSheets';
import { pushLineMessage, pushLineFlexMessage, buildOrderFlexMessage, buildAppendConfirmationFlexMessage, buildProgressFlexMessage, createRejectFlexBubble, createChangeFlexBubble, createTimeChangeFlexBubble, createSoldOutItemFlexBubble, createOrderModifiedConfirmationFlexBubble } from './line';
import { getTenantId } from './menu';
import { prepareOrderReceipt, pushOrderReceiptInBackground } from './line-order-receipts';

import { TenantContext, tenantHasFeature, resolveTenantOrderPrefix, generateStandardOrderId } from '../types/tenant';
import { resolveTenantContext } from './tenant';
import { attachOrderPrintItems } from './order-print-items';
import { invalidateBootstrapCache } from './bootstrap';
import { validateBundleOrderItems, BundleCheck } from './bundle-rules';
import { remainingItemNote } from '../utils/order-item-notes';

function jsonWithETag(data: any, version: string, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "ETag": `"${version}"`,
    },
  });
}

export function formatItemsToText(items: OrderItemInput[]): string {
  if (!items || items.length === 0) return "";
  return items.map(item => {
    const qty = Number(item.quantity) || 1;
    let line = `${qty}份 x ${item.name}`;

    const rawBundle = item.bundleSelections || item.bundle_snapshot_json;
    if (rawBundle) {
      try {
        const bData = typeof rawBundle === 'string' ? JSON.parse(rawBundle) : rawBundle;
        const portions: any[] = bData.portions || (Array.isArray(bData) ? (bData[0]?.groups ? bData : [{ groups: bData }]) : []);
        if (portions.length > 0) {
          portions.forEach((portion: any, pIdx: number) => {
            const pNum = typeof portion.portionIndex === 'number' ? portion.portionIndex + 1 : pIdx + 1;
            const portionPrefix = portions.length > 1 ? `第${pNum}份 ` : '';
            const groups = portion.groups || [];
            groups.forEach((g: any) => {
              const groupName = g.groupName || g.group_name || '';
              const gItems = (g.items || []).map((it: any) => {
                const bQty = Number(it.quantity) || 1;
                const sur = Number(it.surcharge || 0) + (it.modifiers || []).reduce((sum: number, mod: any) => sum + Number(mod.price || 0), 0);
                const surStr = sur > 0 ? ` (+$${sur})` : '';
                const mods = (it.modifiers || []).map((mod: any) => mod.name).filter(Boolean).join('、');
                return `${it.name} x${bQty}${mods ? ` (${mods})` : ''}${surStr}`;
              }).join('、');
              if (gItems) {
                const label = groupName ? `${portionPrefix}${groupName}` : `${portionPrefix}搭配`;
                line += `\n   ↳ ${label}: ${gItems}`;
              }
            });
          });
        }
      } catch (e) {
        console.warn("[formatItemsToText] Failed to parse bundleSelections:", e);
      }
    }

    const rawOptions = item.options || item.selected_options;
    const options: any[] = Array.isArray(rawOptions) ? rawOptions : (typeof rawOptions === 'string' ? JSON.parse(rawOptions || '[]') : []);
    if (options.length > 0) {
      const optLines = options.map((opt: any) => {
        let choice = opt.choice || opt.name || (typeof opt === 'string' ? opt : "");
        if (opt.subOption?.name && !choice.includes(`(${opt.subOption.name})`)) {
          choice += ` (${opt.subOption.name})`;
        }
        const optPrice = Number(opt.price || 0) + Number(opt.subOption?.price || 0);
        const priceExtra = optPrice > 0 ? ` (+$${optPrice})` : "";
        return `  - ${choice}${priceExtra}`;
      }).join("\n");
      line += `\n${optLines}`;
    }
    const itemNote = remainingItemNote(options, item.note || item.notes);
    if (itemNote) {
      line += `\n  - 備註: ${itemNote}`;
    }
    return line;
  }).join("\n");
}

export const ORDER_INDEX_LATEST = "order_index:latest";
export const MAX_INDEX = 200;

export async function getNextDailyOrderSeq(
  env: Env,
  tenantId: string,
  diningOption: DiningOption = "takeaway",
  dateObj: Date = new Date(),
  prefix: string = ""
): Promise<{ key: string; seq: number }> {
  const taiwanDate = new Date(dateObj.getTime() + 8 * 3600000);
  const yyyy = taiwanDate.getUTCFullYear();
  const mm = String(taiwanDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(taiwanDate.getUTCDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const typePrefix = diningOption === "dine_in" ? "D" : "T";
  const p = prefix ? prefix.trim().toUpperCase() : (tenantId.charAt(0).toUpperCase() || 'O');

  if (!env.DB) throw new Error('ORDER_COUNTER_UNAVAILABLE');
  const res = await env.DB.prepare(
    `INSERT INTO daily_order_counters (tenant_id, order_date, dining_option, last_seq)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(tenant_id, order_date, dining_option) DO UPDATE SET last_seq = last_seq + 1
     RETURNING last_seq`
  ).bind(tenantId, dateStr, diningOption).first<{ last_seq: number }>();
  if (!res?.last_seq) throw new Error('ORDER_COUNTER_UNAVAILABLE');
  return { key: `${p}${mm}${dd}-${typePrefix}${String(res.last_seq).padStart(3, "0")}`, seq: res.last_seq };
}

export function extractAllOrderSearchNames(rawItems: OrderItemInput[]): string[] {
  const names: string[] = [];
  for (const item of rawItems) {
    if (item.name) names.push(item.name);
    if (item.itemId || item.item_id) names.push((item.itemId || item.item_id)!);
    const rawBundle = item.bundleSelections || item.bundle_snapshot_json;
    if (rawBundle) {
      try {
        const bData = typeof rawBundle === 'string' ? JSON.parse(rawBundle) : rawBundle;
        const portions: any[] = bData.portions || (Array.isArray(bData) ? (bData[0]?.groups ? bData : [{ groups: bData }]) : []);
        for (const p of portions) {
          for (const g of (p.groups || [])) {
            for (const child of (g.items || [])) {
              if (child.name) names.push(child.name);
              if (child.itemId || child.item_id) names.push((child.itemId || child.item_id)!);
            }
          }
        }
      } catch (e) {}
    }
  }
  return Array.from(new Set(names.filter(Boolean)));
}

export async function validateOrderBundles(
  env: Env,
  tenantId: string,
  rawItems: OrderItemInput[]
): Promise<BundleCheck> {
  if (unifiedMenuEnabled(env)) {
    const result = await validateUnifiedOrderItems(env, tenantId, rawItems);
    if (!result.valid) return result;
    return validateBundleOrderItems(env, tenantId, result.legacy || []);
  }
  return validateBundleOrderItems(env, tenantId, rawItems);
}

async function validateBundleOrderAmount(env: Env, tenantId: string, items: OrderItemInput[], submittedTotal: number, customizations: any[] = []): Promise<BundleCheck & { expectedTotal?: number }> {
  const bundleLines = items.filter(item => Boolean(item.bundleSelections || item.bundle_snapshot_json));
  if (!bundleLines.length) return { valid: true };
  const bundleTotal = bundleLines.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const ids = items.map(item => item.itemId || item.item_id).filter(Boolean) as string[];
  if (ids.length !== items.length) return { valid: false, code: 'BUNDLE_TOTAL_UNVERIFIABLE', error: '無法確認套餐金額，請重新整理菜單' };
  const placeholders = ids.map(() => '?').join(',');
  let hasCategoryPromotion = false;
  try {
    const rows = await env.DB.prepare(`SELECT c.pricing_rules FROM menu_items i JOIN menu_categories c ON c.id = i.category_id AND c.tenant_id = i.tenant_id WHERE i.tenant_id = ? AND i.id IN (${placeholders})`).bind(tenantId, ...ids).all<any>();
    if (rows.results.length !== new Set(ids).size) return { valid: false, code: 'BUNDLE_TOTAL_UNVERIFIABLE', error: '無法確認套餐金額，請重新整理菜單' };
    hasCategoryPromotion = rows.results.some(row => {
      try { const rule = JSON.parse(row.pricing_rules || 'null'); return Number(rule?.bundle_qty) > 0 && Number(rule?.bundle_price) > 0; }
      catch { return true; }
    });
  } catch { return { valid: false, code: 'BUNDLE_TOTAL_UNVERIFIABLE', error: '無法確認套餐金額，請稍後再試' }; }
  if (hasCategoryPromotion) return { valid: true };
  if (!Number.isFinite(submittedTotal) || submittedTotal + 0.001 < bundleTotal) {
    return { valid: false, code: 'BUNDLE_TOTAL_CHANGED', error: '套餐總金額已變更，請重新確認', expectedTotal: bundleTotal };
  }
  const hasOtherCharges = items.some(item => {
    const options = item.options || item.selected_options;
    return Array.isArray(options) && options.length > 0;
  }) || customizations.some(choice => Number(choice?.price || 0) > 0 || String(choice?.value || '').includes('+$'));
  if (bundleLines.length === items.length && !hasOtherCharges && Math.abs(submittedTotal - bundleTotal) > 0.001) {
    return { valid: false, code: 'BUNDLE_TOTAL_CHANGED', error: '套餐總金額已變更，請重新確認', expectedTotal: bundleTotal };
  }
  return { valid: true };
}

export async function validateItemLimits(
  env: Env,
  tenantId: string,
  rawItems: OrderItemInput[]
): Promise<{ valid: boolean; error?: string; code?: string }> {
  if (!env.DB || !Array.isArray(rawItems) || rawItems.length === 0) return { valid: true };

  try {
    const limitedItemsRes = await env.DB.prepare(
      `SELECT id, name, max_per_order 
       FROM menu_items 
       WHERE tenant_id = ? AND max_per_order IS NOT NULL AND max_per_order > 0`
    ).bind(tenantId).all<{ id: string; name: string; max_per_order: number }>();

    const limitedItems = limitedItemsRes.results || [];
    if (limitedItems.length === 0) return { valid: true };

    const limitById = new Map<string, { id: string; name: string; maxPerOrder: number }>();
    const limitByName = new Map<string, { id: string; name: string; maxPerOrder: number }>();
    for (const it of limitedItems) {
      const entry = { id: it.id, name: it.name, maxPerOrder: Number(it.max_per_order) };
      limitById.set(it.id, entry);
      limitByName.set(it.name, entry);
    }

    const orderQtyByName = new Map<string, number>();

    for (const item of rawItems) {
      const itemId = item.itemId || item.item_id || "";
      const itemName = item.name || (item as any).itemName || "";
      const qty = Number(item.quantity) || 1;

      const matchedLimit = (itemId ? limitById.get(itemId) : undefined) || limitByName.get(itemName);
      if (matchedLimit) {
        const currentQty = (orderQtyByName.get(matchedLimit.name) || 0) + qty;
        orderQtyByName.set(matchedLimit.name, currentQty);
        if (currentQty > matchedLimit.maxPerOrder) {
          return {
            valid: false,
            error: `餐點【${matchedLimit.name}】每單限購 ${matchedLimit.maxPerOrder} 份，您目前選購了 ${currentQty} 份`,
            code: "ITEM_LIMIT_EXCEEDED"
          };
        }
      }
    }
  } catch (err) {
    console.warn(`[validateItemLimits] Error checking item limits for ${tenantId}:`, err);
  }

  return { valid: true };
}

export async function validateThresholdCustomizations(
  env: Env,
  tenantId: string,
  rawItems: OrderItemInput[],
  customizations: any[]
): Promise<{ valid: boolean; error?: string; code?: string; minSubtotal?: number; currentSubtotal?: number }> {
  if (!env.DB || (!Array.isArray(customizations) && !rawItems.some(it => Array.isArray(it.options) || Array.isArray(it.selected_options)))) return { valid: true };

  try {
    const foodMerchandiseSubtotal = rawItems.reduce(
      (sum, it) => sum + Number(it.subtotal !== undefined && it.subtotal !== null ? it.subtotal : (Number(it.price || it.unit_price || 0) * Number(it.quantity || 1))),
      0
    );

    // 1. Primary: Load rules directly from modifier_options (Pure Schema Mới)
    let hasCheckedNewSchema = false;
    try {
      const optRulesRes = await env.DB.prepare(
        `SELECT o.id AS option_id, o.name AS option_name, o.group_id, o.eligibility_rules_json, g.name AS group_name
         FROM modifier_options o
         JOIN modifier_groups g ON g.id = o.group_id AND g.tenant_id = o.tenant_id
         WHERE o.tenant_id = ? AND o.eligibility_rules_json IS NOT NULL AND o.eligibility_rules_json != '[]'`
      ).bind(tenantId).all<{
        option_id: string;
        option_name: string;
        group_id: string;
        eligibility_rules_json: string;
        group_name: string;
      }>();

      if (optRulesRes && Array.isArray(optRulesRes.results) && optRulesRes.results.length > 0) {
        hasCheckedNewSchema = true;
        for (const row of optRulesRes.results) {
          let rules: any[] = [];
          try { rules = JSON.parse(row.eligibility_rules_json || '[]'); } catch { rules = []; }

          for (const rule of rules) {
            const minSubtotal = Number(rule.min_order_subtotal || 0);
            if (minSubtotal <= 0 || foodMerchandiseSubtotal >= minSubtotal) continue;

            // Check if user selected this option in order-level customizations
            let matched = false;
            for (const c of (customizations || [])) {
              const userOptId = c.optionId || c.option_id || c.id || '';
              const userVal = String(c.value || '').trim();
              if (userOptId === row.option_id || (c.key === row.group_id && userVal.includes(row.option_name))) {
                matched = true;
                break;
              }
            }

            // Check if user selected this option in item-level options
            if (!matched) {
              for (const it of rawItems) {
                const itemOpts = it.options || it.selected_options || [];
                if (Array.isArray(itemOpts)) {
                  for (const opt of itemOpts) {
                    const optId = opt.optionId || opt.option_id || opt.id || '';
                    const optName = String(opt.choice || opt.name || '').trim();
                    if (optId === row.option_id || (opt.groupId === row.group_id && optName === row.option_name)) {
                      matched = true;
                      break;
                    }
                  }
                }
                if (matched) break;
              }
            }

            if (matched) {
              const defaultMsg = `客製化「${row.option_name}」需全單消費滿 $${minSubtotal} 元方可選擇（目前金額 $${foodMerchandiseSubtotal} 元，還差 $${minSubtotal - foodMerchandiseSubtotal} 元）`;
              return {
                valid: false,
                error: rule.error_message || defaultMsg,
                code: 'MIN_ORDER_SUBTOTAL_NOT_MET',
                minSubtotal,
                currentSubtotal: foodMerchandiseSubtotal
              };
            }
          }
        }
      }
    } catch (newSchemaErr) {
      // Table modifier_options not ready, fallback below
    }

    if (hasCheckedNewSchema || unifiedMenuEnabled(env)) return { valid: true };

    // 2. Legacy Fallback (for unmigrated environments)
    const rulesRes = await env.DB.prepare(
      `SELECT customization_key, option_id, rule_type, min_order_subtotal, threshold_basis, error_message
       FROM menu_customization_option_rules
       WHERE tenant_id = ? AND is_active = 1`
    ).bind(tenantId).all<{
      customization_key: string;
      option_id: string;
      rule_type: string;
      min_order_subtotal: number;
      threshold_basis: string;
      error_message: string | null;
    }>();

    if (!rulesRes.results || rulesRes.results.length === 0) return { valid: true };

    const custDefRes = await env.DB.prepare(
      `SELECT key, options_json FROM menu_customizations WHERE tenant_id = ?`
    ).bind(tenantId).all<{ key: string; options_json: string }>();
    const optMap = new Map<string, { id: string; name: string }[]>();
    for (const d of (custDefRes.results || [])) {
      try {
        optMap.set(d.key, JSON.parse(d.options_json));
      } catch (e) {}
    }

    for (const rule of rulesRes.results) {
      if (foodMerchandiseSubtotal >= rule.min_order_subtotal) {
        continue;
      }

      const userSelection = customizations.find((c: any) => c.key === rule.customization_key);
      if (!userSelection) continue;

      const optsForGroup = optMap.get(rule.customization_key) || [];
      const ruleOption = optsForGroup.find(o => o.id === rule.option_id);
      const ruleOptName = ruleOption ? ruleOption.name : rule.option_id;

      const userVal = String(userSelection.value || "").trim();
      const userOptId = userSelection.optionId || userSelection.option_id || userSelection.id || "";

      let matched = false;
      if (userOptId && (userOptId === rule.option_id || userOptId === ruleOptName)) {
        matched = true;
      } else if (userVal) {
        if (ruleOptName === "要") {
          matched = userVal === "要" || userVal.startsWith("要(") || userVal.startsWith("要（");
        } else if (ruleOptName === "多") {
          matched = userVal.startsWith("多");
        } else {
          matched = userVal.includes(ruleOptName);
        }
      }

      if (matched) {
        const defaultMsg = `客製化「${ruleOptName}」需全單消費滿 $${rule.min_order_subtotal} 元方可選擇（目前金額 $${foodMerchandiseSubtotal} 元，還差 $${rule.min_order_subtotal - foodMerchandiseSubtotal} 元）`;
        return {
          valid: false,
          error: rule.error_message || defaultMsg,
          code: "MIN_ORDER_SUBTOTAL_NOT_MET",
          minSubtotal: rule.min_order_subtotal,
          currentSubtotal: foodMerchandiseSubtotal
        };
      }
    }
  } catch (err) {
    console.warn(`[validateThresholdCustomizations] Error:`, err);
  }

  return { valid: true };
}

export async function createOrder(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
  tenantCtx?: TenantContext | null
): Promise<Response> {
  const data: any = await request.json();
  const tenantId = tenantCtx?.tenantId || getTenantId(request);
  if (data.detailVersion !== undefined) return writeDetailedOrder(env, tenantId, data, data.parent_order_key ? 'append' : 'create', ctx, tenantCtx);

  if (tenantCtx?.storeStatus === 'paused') {
    return json({ error: "店家目前暫停接單中，暫無法接收新訂單", code: "STORE_PAUSED" }, 400);
  }

  const cleanTime = String(data.time || "").replace(/\s*\([^)]*\)/g, '').trim();
  let diningOption: DiningOption = (data.dining_option === 'dine_in' || data.diningOption === 'dine_in') ? 'dine_in' : 'takeaway';

  // Feature gate check: if tenant lacks 'dine_in' feature, automatically fallback to 'takeaway'
  if (diningOption === 'dine_in' && tenantCtx && !tenantHasFeature(tenantCtx, 'dine_in')) {
    console.warn(`[Orders] Tenant '${tenantId}' lacks 'dine_in' feature package. Auto-fallback to 'takeaway'.`);
    diningOption = 'takeaway';
  }

  const orderUuid = data.uuid || data.order_uuid || null;

  // 0. Idempotency Check via UUID
  if (orderUuid && env.DB) {
    try {
      const existing = await env.DB.prepare(
        "SELECT key, order_id, display_key, status, total_amount FROM orders WHERE uuid = ? AND tenant_id = ?"
      ).bind(orderUuid, tenantId).first<{ key: string; order_id: string; display_key: string; status: string; total_amount: number }>();

      if (existing && existing.key) {
        console.log(`[createOrder] Idempotent hit for UUID ${orderUuid} -> returning existing key ${existing.key}`);
        return json({ success: true, key: existing.key, orderId: existing.order_id, displayKey: existing.display_key, uuid: orderUuid, idempotent: true });
      }
    } catch (e) {
      console.warn(`[createOrder] Idempotency check warning:`, e);
    }
  }

  const tableNumber = data.table_number || data.tableNumber || null;
  const userId = data.userId;
  const parentOrderKey = data.parent_order_key || data.parentOrderKey || null;
  const rawItems: OrderItemInput[] = Array.isArray(data.items) ? data.items : [];

  // 1. Kiểm tra tồn kho tại CSDL D1 cho các món trong đơn hàng (bao gồm món con trong combo)
  if (rawItems.length > 0 && env.DB) {
    const rawNames = extractAllOrderSearchNames(rawItems);
    if (rawNames.length > 0) {
      const cleanNames = rawNames.map(n => n.replace(/\s+(L|S|M)$/i, '').replace(/^\[[^\]]+\]\s*/, '').trim());
      const allSearchNames = Array.from(new Set([...rawNames, ...cleanNames]));
      const placeholders = allSearchNames.map(() => '?').join(',');

      try {
        const oosQuery = await env.DB.prepare(
          `SELECT name FROM menu_items 
           WHERE tenant_id = ? 
             AND (name IN (${placeholders}) OR id IN (${placeholders})) 
             AND out_of_stock_until IS NOT NULL 
             AND datetime(out_of_stock_until) > datetime('now')`
        ).bind(tenantId, ...allSearchNames, ...allSearchNames).all<{ name: string }>();

        if (oosQuery.results && oosQuery.results.length > 0) {
          const oosNames = Array.from(new Set(oosQuery.results.map(r => r.name)));
          console.warn(`[createOrder] Rejected order for tenant ${tenantId} due to out-of-stock items: ${oosNames.join(', ')}`);
          return json({
            error: `抱歉，您選購的餐點【${oosNames.join('、')}】目前已售完，請重新選擇！`,
            code: "ITEMS_OUT_OF_STOCK",
            outOfStockItems: oosNames
          }, 400);
        }
      } catch (stockCheckErr) {
        console.warn(`[createOrder] Stock check warning:`, stockCheckErr);
      }
    }
  }

  // 1.1 Validate Combo Bundle Selections
  const bundleCheck = await validateOrderBundles(env, tenantId, rawItems);
  if (!bundleCheck.valid) {
    console.warn('[BundleValidation]', { tenantId, code: bundleCheck.code, itemIndex: bundleCheck.itemIndex, portionIndex: bundleCheck.portionIndex, groupId: bundleCheck.groupId });
    return json(bundleCheck, bundleCheck.code === 'BUNDLE_PRICE_CHANGED' ? 409 : 400);
  }
  const hasValidatedBundle = rawItems.some(item => Boolean((item.bundleSelections || item.bundle_snapshot_json) && (item.itemId || item.item_id)));

  // 1.2 Validate Threshold-Gated Customizations
  const clientCustomizations = Array.isArray(data.customizations) ? data.customizations : (Array.isArray(data.global_customizations) ? data.global_customizations : []);
  const thresholdCheck = await validateThresholdCustomizations(env, tenantId, rawItems, clientCustomizations);
  if (!thresholdCheck.valid) {
    return json({
      error: thresholdCheck.error,
      code: thresholdCheck.code,
      minSubtotal: thresholdCheck.minSubtotal,
      currentSubtotal: thresholdCheck.currentSubtotal
    }, 400);
  }
  // 1.3 Validate Required Global Customizations (Type 3)
  if (env.DB) {
    try {
      let reqCustRows: Array<{ key: string; title: string }> = [];
      try {
        const reqGroupsRes = await env.DB.prepare(
          `SELECT id AS key, name AS title FROM modifier_groups WHERE tenant_id = ? AND scope = 'order' AND is_required = 1`
        ).bind(tenantId).all<{ key: string; title: string }>();
        if (reqGroupsRes && Array.isArray(reqGroupsRes.results) && reqGroupsRes.results.length > 0) {
          reqCustRows = reqGroupsRes.results;
        }
      } catch (modGrpErr) {
        // Table or column might not exist on older DBs
      }

      if (reqCustRows.length === 0 && !unifiedMenuEnabled(env)) {
        const reqCustRes = await env.DB.prepare(
          `SELECT key, title FROM menu_customizations WHERE tenant_id = ? AND is_required = 1`
        ).bind(tenantId).all<{ key: string; title: string }>();
        reqCustRows = reqCustRes?.results || [];
      }

      for (const req of reqCustRows) {
        const userChoice = clientCustomizations.find((c: any) => c.key === req.key || c.id === req.key || c.groupId === req.key);
        const hasValue = userChoice && (
          (typeof userChoice.value === 'string' && userChoice.value.trim() !== '') ||
          (Array.isArray(userChoice.value) && userChoice.value.length > 0) ||
          userChoice.optionId
        );
        if (!hasValue) {
          return json({
            error: `請選擇「${req.title}」`,
            code: 'ORDER_CUSTOMIZATION_REQUIRED',
            key: req.key
          }, 400);
        }
      }
    } catch (reqErr) {
      // Column is_required may not exist on unmigrated test DBs
    }
  }

  const bundleAmountCheck = await validateBundleOrderAmount(env, tenantId, rawItems, Number(data.total), clientCustomizations);
  if (!bundleAmountCheck.valid) {
    console.warn('[BundleAmount]', { tenantId, code: bundleAmountCheck.code });
    return json(bundleAmountCheck, 409);
  }

  // 1.3 Validate Max Quantity Per Order (Item Limits)
  const itemLimitCheck = await validateItemLimits(env, tenantId, rawItems);
  if (!itemLimitCheck.valid) {
    return json({ error: itemLimitCheck.error, code: itemLimitCheck.code }, 400);
  }

  // 1.1 Nếu client chủ động truyền parent_order_key thì chuyển sang xử lý append
  if (parentOrderKey && env.DB) {
    const isDesktopOrder = data.is_desktop === true || data.isDesktop === true || data.line_delivery_mode === 'push';
    return await executeAppendOrderInternal(
      env,
      tenantId,
      parentOrderKey,
      hasValidatedBundle ? formatItemsToText(rawItems) : data.content || formatItemsToText(rawItems),
      Number(data.total) || 0,
      data.note || "",
      userId,
      data.customer,
      rawItems,
      ctx,
      tenantCtx,
      isDesktopOrder,
      clientCustomizations
    );
  }

  // 2. Generate authoritative atomic sequential order key (with tenant order prefix: B0831-D001 / B0831-T001)
  const prefix = resolveTenantOrderPrefix(tenantCtx, tenantId);
  const createdAt = new Date();
  let displayKey: string;
  try {
    ({ key: displayKey } = await getNextDailyOrderSeq(env, tenantId, diningOption, createdAt, prefix));
  } catch {
    return json({ error: 'Order numbering unavailable. Please retry.', code: 'ORDER_COUNTER_UNAVAILABLE' }, 503);
  }
  const orderId = crypto.randomUUID();
  // Keep the old browser contract when the receipt is still globally unused.
  // A collision uses the UUID as compatibility key, never an upsert of another order.
  const occupied = await env.DB.prepare('SELECT 1 FROM orders WHERE key = ?').bind(displayKey).first();
  const orderKey = occupied ? orderId : displayKey;
  const businessDate = new Date(createdAt.getTime() + 8 * 3600000).toISOString().slice(0, 10);

  let orderContent = hasValidatedBundle ? formatItemsToText(rawItems) : String(data.content || "").trim();
  if (!orderContent && rawItems.length > 0) {
    orderContent = formatItemsToText(rawItems);
  }

  const order: Order = {
    key: orderKey,
    orderId,
    displayKey,
    businessDate,
    uuid: orderUuid,
    customer: data.customer || "顧客",
    time: cleanTime,
    content: orderContent,
    status: "NEW",
    createdAt: Date.now(),
    userId: data.userId,
    total: Number(data.total) || 0,
    reason: data.reason || "",
    note: data.note || "",
    diningOption: diningOption,
    tableNumber: tableNumber,
    roundCount: 1,
    round_count: 1
  };

  let receipt: Awaited<ReturnType<typeof prepareOrderReceipt>> = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      receipt = await prepareOrderReceipt(env, tenantId, order.key, order.userId, 'create',
        `[${tenantCtx?.brandName || "Benmi"}] 訂單明細 #${order.displayKey || order.key}`,
        buildOrderFlexMessage(order, tenantCtx, rawItems, data.customizations));
      if (rawItems.length > 0 && env.DB) {
        const batchStatements: any[] = [
          env.DB.prepare(
            `INSERT INTO orders (key, order_id, display_key, business_date, uuid, tenant_id, user_id, customer_name, pickup_time, status, total_amount, order_content, reason, note, dining_option, table_number, round_count, last_appended_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?, ?, 1, NULL, datetime(?, 'unixepoch'), datetime('now'))`
          ).bind(
            order.key,
            order.orderId,
            order.displayKey,
            order.businessDate,
            order.uuid || null,
            tenantId,
            order.userId || null,
            order.customer,
            order.time,
            order.total,
            order.content,
            order.reason || "",
            order.note || "",
            order.diningOption || "takeaway",
            order.tableNumber || null,
            Math.floor((order.createdAt || Date.now()) / 1000)
          ),
          ...rawItems.map(item => {
            const itemQty = Number(item.quantity) || 1;
            const unitPrice = Number(item.price || item.unit_price) || 0;
            const subtotal = Number(item.subtotal) || (unitPrice * itemQty);
            const optionsJson = JSON.stringify(item.options || item.selected_options || []);
            const itemNote = item.note || item.notes || "";
            const bundleJson = item.bundle_snapshot_json || (item.bundleSelections ? JSON.stringify(item.bundleSelections) : null);
            return env.DB.prepare(
              `INSERT INTO order_items (tenant_id, order_key, round_number, item_id, item_name, category_name, quantity, unit_price, subtotal, selected_options, bundle_snapshot_json, notes, created_at)
               VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
            ).bind(
              tenantId,
              order.key,
              item.itemId || item.item_id || null,
              item.name || "Món",
              item.category || item.category_name || null,
              itemQty,
              unitPrice,
              subtotal,
              optionsJson,
              bundleJson,
              itemNote
            );
          })
        ];
        if (receipt) batchStatements.push(receipt.statement);
        await env.DB.batch(batchStatements);
      } else {
        await saveOrder(env, order, tenantId, true, receipt?.statement);
      }
      break;
    } catch (error) {
      if (orderUuid) {
        const existing = await env.DB.prepare('SELECT key, order_id, display_key FROM orders WHERE tenant_id = ? AND uuid = ?')
          .bind(tenantId, orderUuid).first<{ key: string; order_id: string; display_key: string }>();
        if (existing) return json({ success: true, key: existing.key, orderId: existing.order_id, displayKey: existing.display_key, uuid: orderUuid, idempotent: true });
      }
      if (attempt === 0 && order.key !== orderId && String(error).includes('UNIQUE constraint failed: orders.key')) {
        order.key = orderId;
        continue;
      }
      throw error;
    }
  }

  const isDesktopOrder = data.is_desktop === true || data.isDesktop === true;
  if (isDesktopOrder || data.line_delivery_mode === 'push') {
    await pushOrderReceiptInBackground(env, receipt?.notification.id, ctx, tenantCtx);
  }
  return json({ success: true, key: order.key, orderId, displayKey, uuid: orderUuid, notification: receipt?.notification });
}

export async function executeAppendOrderInternal(
  env: Env,
  tenantId: string,
  parentKey: string,
  appendedContent: string,
  appendedTotal: number,
  note: string,
  userId?: string,
  customerName?: string,
  items?: OrderItemInput[],
  ctx?: ExecutionContext,
  tenantCtx?: TenantContext | null,
  isDesktop?: boolean,
  customizations: any[] = []
): Promise<Response> {
  const resolvedParentKey = await resolveOrderKey(env, tenantId, parentKey);
  if (!resolvedParentKey) return json({ error: 'Order not found', code: 'ORDER_NOT_FOUND' }, 404);
  parentKey = resolvedParentKey;
  const rawItems: OrderItemInput[] = Array.isArray(items) ? items : [];
  if (!appendedContent && rawItems.length > 0) {
    appendedContent = formatItemsToText(rawItems);
  }

  if (!parentKey || (!appendedContent && rawItems.length === 0) || appendedTotal <= 0) {
    return json({ error: "參數不完整 / Incomplete parameters", code: "INVALID_PARAMS" }, 400);
  }

  if (!env.DB) {
    return json({ error: "Database not configured", code: "NO_DB" }, 500);
  }

  // 0. Kiểm tra tồn kho tại CSDL D1 cho các món 加點 (bao gồm món con trong combo)
  if (rawItems.length > 0 && env.DB) {
    const rawNames = extractAllOrderSearchNames(rawItems);
    if (rawNames.length > 0) {
      const cleanNames = rawNames.map(n => n.replace(/\s+(L|S|M)$/i, '').replace(/^\[[^\]]+\]\s*/, '').trim());
      const allSearchNames = Array.from(new Set([...rawNames, ...cleanNames]));
      const placeholders = allSearchNames.map(() => '?').join(',');

      try {
        const oosQuery = await env.DB.prepare(
          `SELECT name FROM menu_items 
           WHERE tenant_id = ? 
             AND (name IN (${placeholders}) OR id IN (${placeholders})) 
             AND out_of_stock_until IS NOT NULL 
             AND datetime(out_of_stock_until) > datetime('now')`
        ).bind(tenantId, ...allSearchNames, ...allSearchNames).all<{ name: string }>();

        if (oosQuery.results && oosQuery.results.length > 0) {
          const oosNames = Array.from(new Set(oosQuery.results.map(r => r.name)));
          console.warn(`[appendOrder] Rejected append for tenant ${tenantId} due to out-of-stock items: ${oosNames.join(', ')}`);
          return json({
            error: `抱歉，您加點的餐點【${oosNames.join('、')}】目前已售完，請重新選擇！`,
            code: "ITEMS_OUT_OF_STOCK",
            outOfStockItems: oosNames
          }, 400);
        }
      } catch (stockCheckErr) {
        console.warn(`[appendOrder] Stock check warning:`, stockCheckErr);
      }
    }
  }

  // 0.1 Validate Combo Bundle Selections on append
  if (rawItems.length > 0) {
    const bundleCheck = await validateOrderBundles(env, tenantId, rawItems);
    if (!bundleCheck.valid) {
      console.warn('[BundleValidation]', { tenantId, code: bundleCheck.code, itemIndex: bundleCheck.itemIndex, portionIndex: bundleCheck.portionIndex, groupId: bundleCheck.groupId });
      return json(bundleCheck, bundleCheck.code === 'BUNDLE_PRICE_CHANGED' ? 409 : 400);
    }
    if (rawItems.some(item => Boolean((item.bundleSelections || item.bundle_snapshot_json) && (item.itemId || item.item_id)))) {
      appendedContent = formatItemsToText(rawItems);
    }
    const amountCheck = await validateBundleOrderAmount(env, tenantId, rawItems, appendedTotal, customizations);
    if (!amountCheck.valid) {
      console.warn('[BundleAmount]', { tenantId, code: amountCheck.code });
      return json(amountCheck, 409);
    }
  }

  // 1. Fetch parent order
  const row = await env.DB.prepare(
    "SELECT * FROM orders WHERE key = ? AND tenant_id = ?"
  ).bind(parentKey, tenantId).first<any>();

  if (!row) {
    return json({ error: "找不到原訂單 / Order not found", code: "ORDER_NOT_FOUND" }, 404);
  }

  // 1.1 Guard: Disallow customer append endpoint from modifying staff orders
  if (row.source === 'staff') {
    return json({
      error: "現場桌邊訂單請洽現場服務人員加點 / Đơn hàng tại bàn vui lòng báo nhân viên để gọi thêm",
      code: "STAFF_ORDER_RESTRICTED"
    }, 403);
  }
  if (Number(row.detail_revision || 0) > 0) return json({ code: 'ORDER_CLIENT_UPGRADE_REQUIRED' }, 409);

  // 2. Lock boundary: Cannot append if order is PICKED_UP, REJECTED, or PAID
  if (row.status === 'PICKED_UP' || row.status === 'REJECTED' || row.status === 'PAID') {
    return json({
      error: "訂單已完成或已取消，無法再加點，請重新開啟新訂單 / Đơn hàng đã kết thúc hoặc đã hủy, không thể gọi thêm",
      code: "ORDER_LOCKED"
    }, 400);
  }

  // 3. Compute next round & time
  const currentRound = Number(row.round_count) || 1;
  const nextRound = currentRound + 1;

  const nowTw = new Date(Date.now() + 8 * 3600000);
  const timeStr = `${String(nowTw.getUTCHours()).padStart(2, "0")}:${String(nowTw.getUTCMinutes()).padStart(2, "0")}`;

  // 4. Multi-round content formatting (Mới -> Cũ: Đợt mới nhất ở trên cùng)
  let previousRounds = String(row.order_content || "").trim();
  if (!previousRounds.includes("[第 1 輪") && !previousRounds.includes("[Đợt 1")) {
    previousRounds = `[第 1 輪 / Đợt 1]\n${previousRounds}`;
  }
  const separator = "--------------------------------";
  const newRoundBlock = `[第 ${nextRound} 輪 加點 / Đợt ${nextRound} - ${timeStr}]\n${appendedContent.trim()}`;
  const updatedContent = `${newRoundBlock}\n\n${separator}\n${previousRounds}`;

  // 5. Combine note & update total
  const combinedNote = note
    ? (row.note ? `${row.note} | [加點${nextRound}]: ${note}` : `[加點${nextRound}]: ${note}`)
    : (row.note || "");
  const newTotal = (Number(row.total_amount) || 0) + appendedTotal;

  // 7. Construct updated order object for notification & response
  const updatedOrder: Order = {
    key: parentKey,
    orderId: row.order_id,
    displayKey: row.display_key,
    legacyKey: row.legacy_key,
    businessDate: row.business_date,
    customer: row.customer_name || customerName || "顧客",
    time: row.pickup_time || "",
    content: updatedContent,
    status: "NEW",
    createdAt: row.created_at ? new Date(row.created_at + "Z").getTime() : Date.now(),
    userId: row.user_id || userId,
    total: newTotal,
    reason: row.reason || "",
    note: combinedNote,
    diningOption: (row.dining_option as any) || 'dine_in',
    tableNumber: row.table_number || null,
    roundCount: nextRound,
    round_count: nextRound,
    lastAppendedAt: new Date().toISOString()
  };

  const receipt = await prepareOrderReceipt(env, tenantId, parentKey, updatedOrder.userId, 'append',
    `[${tenantCtx?.brandName || "Benmi"}] 現場加點確認 (第 ${nextRound} 輪)`,
    buildAppendConfirmationFlexMessage(updatedOrder, appendedContent, appendedTotal, nextRound, tenantCtx, rawItems));

  // 6. Persist to D1: Luôn chuyển trạng thái về NEW khi gọi thêm món để POS hiển thị ở cột Mới và phát chuông báo
  if (rawItems.length > 0) {
    const batchStatements: any[] = [
      env.DB.prepare(
        `UPDATE orders SET
           order_content = ?,
           total_amount = ?,
           status = 'NEW',
           round_count = ?,
           last_appended_at = datetime('now'),
           note = ?,
           updated_at = datetime('now')
         WHERE key = ? AND tenant_id = ?`
      ).bind(
        updatedContent,
        newTotal,
        nextRound,
        combinedNote,
        parentKey,
        tenantId
      ),
      ...rawItems.map(item => {
        const itemQty = Number(item.quantity) || 1;
        const unitPrice = Number(item.price || item.unit_price) || 0;
        const subtotal = Number(item.subtotal) || (unitPrice * itemQty);
        const optionsJson = JSON.stringify(item.options || item.selected_options || []);
        const itemNote = item.note || item.notes || "";
        const bundleJson = item.bundle_snapshot_json || (item.bundleSelections ? JSON.stringify(item.bundleSelections) : null);
        return env.DB.prepare(
          `INSERT INTO order_items (tenant_id, order_key, round_number, item_id, item_name, category_name, quantity, unit_price, subtotal, selected_options, bundle_snapshot_json, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(
          tenantId,
          parentKey,
          nextRound,
          item.itemId || item.item_id || null,
          item.name || "Món",
          item.category || item.category_name || null,
          itemQty,
          unitPrice,
          subtotal,
          optionsJson,
          bundleJson,
          itemNote
        );
      })
    ];
    if (receipt) batchStatements.push(receipt.statement);
    await env.DB.batch(batchStatements);
  } else {
    const statement = env.DB.prepare(
      `UPDATE orders SET
         order_content = ?,
         total_amount = ?,
         status = 'NEW',
         round_count = ?,
         last_appended_at = datetime('now'),
         note = ?,
         updated_at = datetime('now')
       WHERE key = ? AND tenant_id = ?`
    ).bind(
      updatedContent,
      newTotal,
      nextRound,
      combinedNote,
      parentKey,
      tenantId
    );
    if (receipt) await env.DB.batch([statement, receipt.statement]);
    else await statement.run();
  }

  // 8. Sync to Google Sheets
  try {
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(syncToGoogleSheets(updatedOrder, env, tenantCtx));
    } else {
      await syncToGoogleSheets(updatedOrder, env, tenantCtx);
    }
  } catch (sheetErr) {
    console.error("[appendOrder] Google Sheets sync failed:", sheetErr);
  }

  if (isDesktop) await pushOrderReceiptInBackground(env, receipt?.notification.id, ctx, tenantCtx);

  return json({
    success: true,
    key: parentKey,
    orderId: row.order_id,
    displayKey: row.display_key,
    legacyKey: row.legacy_key,
    businessDate: row.business_date,
    round_count: nextRound,
    total_amount: newTotal,
    status: 'NEW',
    notification: receipt?.notification
  });
}

export async function appendOrder(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
  tenantCtx?: TenantContext | null
): Promise<Response> {
  try {
    const payload: AppendOrderPayload = await request.json();
    const tenantId = tenantCtx?.tenantId || payload.tenant_id || getTenantId(request);
    if (payload.detailVersion !== undefined) return writeDetailedOrder(env, tenantId, payload, 'append', ctx, tenantCtx);
    const parentKey = payload.parent_order_key;
    const rawItems: OrderItemInput[] = Array.isArray(payload.items) ? payload.items : (Array.isArray(payload.appended_items) ? payload.appended_items : []);
    const appendedContent = payload.appended_content || formatItemsToText(rawItems);
    const appendedTotal = Number(payload.appended_total) || 0;
    const note = payload.note ? String(payload.note).trim() : "";
    const userId = payload.user_id;
    const customerName = payload.customer_name;
    const isDesktop = payload.is_desktop === true || payload.isDesktop === true || payload.line_delivery_mode === 'push';

    return await executeAppendOrderInternal(
      env,
      tenantId,
      parentKey,
      appendedContent,
      appendedTotal,
      note,
      userId,
      customerName,
      rawItems,
      ctx,
      tenantCtx,
      isDesktop,
      Array.isArray((payload as any).customizations) ? (payload as any).customizations : []
    );
  } catch (e: any) {
    console.error("[appendOrder] Error:", e);
    return json({ error: e.message || "Failed to append order", code: "INTERNAL_ERROR" }, 500);
  }
}

export async function getPendingMap(env: Env, tenantId: string, userId: string): Promise<Record<string, any>> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM pending_actions WHERE tenant_id = ? AND user_id = ?"
    ).bind(tenantId, userId).all<any>();

    const pMap: Record<string, any> = {};
    if (results) {
      for (const row of results) {
        pMap[row.order_key] = {
          orderKey: row.order_key,
          type: row.action_type,
          createdAt: row.created_at ? new Date(row.created_at + "Z").getTime() : Date.now(),
          questionText: row.question_text,
          reason: row.reason || "",
          note: row.note || ""
        };
      }
    }
    return pMap;
  } catch (e) {
    console.error("[getPendingMap] D1 Error:", e);
    return {};
  }
}

export async function updateOrder(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
  tenantCtx?: TenantContext | null
): Promise<Response> {
  const data: any = await request.json();
  const orderRow = await env.DB.prepare(
    "SELECT * FROM orders WHERE key = ? AND tenant_id = ?"
  ).bind(await resolveOrderKey(env, tenantCtx?.tenantId || getTenantId(request), data.key), tenantCtx?.tenantId || getTenantId(request)).first<any>();
  if (!orderRow) return json({ error: "order not found" }, 404);

  const paymentProtected = await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='payments'").first()
    && await env.DB.prepare('SELECT 1 FROM payments WHERE tenant_id=? AND order_key=?').bind(orderRow.tenant_id,orderRow.key).first();
  if (paymentProtected && !await verifyStaffSession(request,env,orderRow.tenant_id)) return json({code:'SESSION_REQUIRED'},401);
  if (paymentProtected && ['WAITING_CUSTOMER_CHANGE','PAID'].includes(data.status)) return json({code:'PAYMENT_ORDER_LOCKED'},409);
  if (orderRow.source === 'staff') return json({code:'STAFF_ORDER_RESTRICTED'},403);

  const effectiveTenantId = orderRow.tenant_id || tenantCtx?.tenantId || getTenantId(request);
  if (!tenantCtx || tenantCtx.tenantId !== effectiveTenantId) {
    tenantCtx = await resolveTenantContext(effectiveTenantId, env);
  }
  const tenantId = effectiveTenantId;
  const brandName = tenantCtx?.brandName || "Store";

  const order: Order = {
    key: orderRow.key,
      orderId: orderRow.order_id,
    displayKey: orderRow.display_key,
    legacyKey: orderRow.legacy_key,
    businessDate: orderRow.business_date,
    customer: orderRow.customer_name,
    time: orderRow.pickup_time,
    content: orderRow.order_content,
    status: orderRow.status,
    createdAt: new Date(orderRow.created_at + "Z").getTime(),
    userId: orderRow.user_id || undefined,
    total: orderRow.total_amount,
    reason: orderRow.reason || "",
    note: orderRow.note || "",
    diningOption: (orderRow.dining_option as any) || 'takeaway',
    tableNumber: orderRow.table_number || undefined,
    roundCount: Number(orderRow.round_count) || 1,
    round_count: Number(orderRow.round_count) || 1,
    lastAppendedAt: orderRow.last_appended_at || null,
    last_appended_at: orderRow.last_appended_at || null
  };
  const incoming = data.status;

  if (data.reason !== undefined) order.reason = data.reason;
  if (data.note !== undefined && !(incoming === "CHANGED" && data.reason === "口味售完")) {
    order.note = data.note;
  }

  // Employee 接單
  if (incoming === "ACCEPTED") {
    if (order.status === "ACCEPTED" || order.status === "DONE" || order.status === "PICKED_UP") {
      await saveOrder(env, order, tenantId); // Sync DB
      return json({ success: true });
    }
    order.status = "ACCEPTED";
    await saveOrder(env, order, tenantId);

    if (order.userId) {
      try {
        await env.DB.prepare(
          "DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ? AND order_key = ?"
        ).bind(tenantId, order.userId, order.key).run();
      } catch { }
    }
    return json({ success: true });
  }

  // Employee 準備好了
  if (incoming === "DONE") {
    if (order.status === "DONE" || order.status === "PICKED_UP") {
      await saveOrder(env, order, tenantId);
      return json({ success: true });
    }
    order.status = "DONE";
    await saveOrder(env, order, tenantId);

    return json({ success: true });
  }

  // Employee 需要更改 -> 等客戶「同意/取消」
  if (incoming === "CHANGED") {
    order.status = "WAITING_CUSTOMER_CHANGE";
    await saveOrder(env, order, tenantId);

    const reason = data.reason || order.reason || "未提供原因";
    const changeNote = data.note !== undefined ? data.note : (order.note || "");

    // Tự động tắt món trong CSDL D1 và xóa cache KV khi báo 口味售完
    if (reason === "口味售完" && changeNote) {
      try {
        const soldOutItems = changeNote.split(/[,、]/).map((s: string) => s.trim()).filter(Boolean);
        if (soldOutItems.length > 0) {
          // Tự động khôi phục lúc 04:00 AM ngày hôm sau (theo múi giờ GMT+7)
          const nowGmt7 = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
          const tomorrow4AmGmt7 = new Date(nowGmt7);
          tomorrow4AmGmt7.setDate(nowGmt7.getDate() + 1);
          tomorrow4AmGmt7.setHours(4, 0, 0, 0);
          const outOfStockUntil = new Date(tomorrow4AmGmt7.getTime() - 7 * 60 * 60 * 1000).toISOString();

          for (const itName of soldOutItems) {
            await env.DB.prepare(
              `UPDATE menu_items 
               SET out_of_stock_until = ?, updated_at = datetime('now') 
               WHERE tenant_id = ? AND name = ?`
            ).bind(outOfStockUntil, tenantId, itName).run();
          }

          const cacheKey = `tenant:${tenantId}:menu`;
          await env.ORDER_STATE.delete(cacheKey);
          await invalidateBootstrapCache(tenantId, env);
        }
      } catch (stockErr) {
        console.error("[Orders] Failed to auto-disable sold out items in menu:", stockErr);
      }
    }

    if (order.userId) {
      let notifyText = "";
      const note = changeNote;

      if (reason === "時間需調整") {
        const t = note || "稍後";
        notifyText = `目前現場較忙碌，為了提供最佳品質，請問可以改成${t}嗎？。請協助點選下方按鈕回覆，謝謝您！`;
      } else if (order.reason && order.reason.startsWith("賣完了：")) {
        const items = order.reason.replace("賣完了：", "").split(",").map((s: string) => s.trim()).filter(Boolean);
        let joinedItems = items.join("、");
        if (items.length === 2) {
          joinedItems = items.join("跟");
        } else if (items.length > 2) {
          joinedItems = items.slice(0, -1).join("、") + "跟" + items[items.length - 1];
        }
        notifyText = `不好意思 ${joinedItems}我們現在賣完了，請問可以幫您換別的嗎？`;
      } else if (reason === "口味售完") {
        const items = (note || "").split(",").map((s: string) => s.trim()).filter(Boolean);
        let joinedItems = items[0] || "";
        if (items.length === 2) {
          joinedItems = items.join("跟");
        } else if (items.length > 2) {
          joinedItems = items.slice(0, -1).join("、") + "跟" + items[items.length - 1];
        }
        notifyText = `不好意思 ${joinedItems}我們現在賣完了，請問可以幫您換別的嗎？`;
      } else {
        notifyText =
          `${brandName} 已收到您的訂單 #${order.displayKey || order.key}，需要做小幅調整。\n` +
          `原因：${reason}\n` +
          (note ? `備註：${note}\n` : "") +
          `\n請回覆您想更換的品項，或回覆「取消 / 不要了」以取消訂單。`;
      }

      await env.DB.prepare(
        `INSERT INTO pending_actions (tenant_id, user_id, order_key, action_type, question_text, reason, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id, user_id, order_key) DO UPDATE SET
           action_type = excluded.action_type,
           question_text = excluded.question_text,
           reason = excluded.reason,
           note = excluded.note,
           created_at = CURRENT_TIMESTAMP`
      ).bind(tenantId, order.userId, order.key, "CHANGE", notifyText, reason, note).run();

      if (reason === "時間需調整") {
        const timeFlex = createTimeChangeFlexBubble(order.key, note, brandName, order.displayKey);
        const flexSent = await pushLineFlexMessage(order.userId, `[${brandName}] 調整取餐時間確認 #${order.displayKey || order.key}`, timeFlex, env, tenantCtx);
        if (!flexSent) {
          await pushLineMessage(order.userId, notifyText, env, tenantCtx);
        }
      } else if (reason === "口味售完" || (order.reason && order.reason.startsWith("賣完了"))) {
        const liffUrl = tenantCtx?.liffUrl || (tenantCtx?.liffId ? `https://liff.line.me/${tenantCtx.liffId}` : "https://liff.line.me/");
        const rawSoldItems = (note || "").split(/[,、]/).map((s: string) => s.trim()).filter(Boolean);
        const fallbackSoldItems = (order.reason || "").replace("賣完了：", "").split(/[,、]/).map((s: string) => s.trim()).filter(Boolean);
        const soldOutList = rawSoldItems.length > 0 ? rawSoldItems : fallbackSoldItems;
        const soldOutFlex = createSoldOutItemFlexBubble(order.key, soldOutList.length > 0 ? soldOutList : (note || "部分品項"), brandName, order.displayKey, liffUrl, tenantId);
        const flexSent = await pushLineFlexMessage(order.userId, `[${brandName}] 品項售完通知 #${order.displayKey || order.key}`, soldOutFlex, env, tenantCtx);
        if (!flexSent) {
          await pushLineMessage(order.userId, notifyText, env, tenantCtx);
        }
      } else {
        await pushLineMessage(order.userId, notifyText, env, tenantCtx);
      }
    }

    return json({ success: true });
  }

  // Employee 無法接單 -> 等客戶「同意/不同意」
  if (incoming === "REJECTED") {
    if (order.reason === "取消並不回復客戶") {
      order.status = "REJECTED";
      await saveOrder(env, order, tenantId);
      if (ctx && ctx.waitUntil) ctx.waitUntil(syncToGoogleSheets(order, env, tenantCtx));
      return json({ success: true });
    }

    order.status = "WAITING_CUSTOMER_REJECT";
    await saveOrder(env, order, tenantId);

    if (order.userId) {
      const reason = order.reason || "商品已售完 / 目前無法接單";
      const notifyText =
        `非常抱歉！${brandName} 目前無法接下您的訂單 #${order.displayKey || order.key}。\n` +
        `原因：${reason}\n` +
        `\n請回覆「同意」以取消訂單，或回覆「不同意」以重新確認。`;

      await env.DB.prepare(
        `INSERT INTO pending_actions (tenant_id, user_id, order_key, action_type, question_text, reason, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id, user_id, order_key) DO UPDATE SET
           action_type = excluded.action_type,
           question_text = excluded.question_text,
           reason = excluded.reason,
           note = excluded.note,
           created_at = CURRENT_TIMESTAMP`
      ).bind(tenantId, order.userId, order.key, "REJECT", notifyText, reason, order.note || "").run();

      const rejectFlex = createRejectFlexBubble(order.key, reason, brandName, undefined, order.displayKey);
      const flexSent = await pushLineFlexMessage(order.userId, `[${brandName}] 無法接單通知 #${order.displayKey || order.key}`, rejectFlex, env, tenantCtx);
      if (!flexSent) {
        await pushLineMessage(order.userId, notifyText, env, tenantCtx);
      }
    }

    return json({ success: true });
  }

  // Employee 強制取消
  if (incoming === "FORCE_REJECT") {
    order.status = "REJECTED";
    await saveOrder(env, order, tenantId);

    if (order.userId) {
      try {
        await env.DB.prepare(
          "DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ? AND order_key = ?"
        ).bind(tenantId, order.userId, order.key).run();
      } catch { }
      await pushLineMessage(order.userId, `${brandName}：由於未收到您的回覆，訂單 #${order.displayKey || order.key} 已自動取消。期待下次為您服務！`, env, tenantCtx);
    }

    if (ctx && ctx.waitUntil) ctx.waitUntil(syncToGoogleSheets(order, env, tenantCtx));
    return json({ success: true });
  }

  // Employee 已取餐 (PICKED_UP - Dành cho đơn mang đi)
  if (incoming === "PICKED_UP") {
    if (order.status === "PICKED_UP") {
      await saveOrder(env, order, tenantId);
      return json({ success: true });
    }
    order.status = "PICKED_UP";
    await saveOrder(env, order, tenantId);

    if (ctx && ctx.waitUntil) ctx.waitUntil(syncToGoogleSheets(order, env, tenantCtx));
    return json({ success: true });
  }

  // Employee 已結帳 (PAID - Dành cho đơn ăn tại bàn)
  if (incoming === "PAID") {
    if (order.status === "PAID") {
      await saveOrder(env, order, tenantId);
      return json({ success: true });
    }
    order.status = "PAID";
    await saveOrder(env, order, tenantId);

    if (ctx && ctx.waitUntil) ctx.waitUntil(syncToGoogleSheets(order, env, tenantCtx));
    return json({ success: true });
  }

  order.status = incoming;
  await saveOrder(env, order, tenantId);

  return json({ success: true });
}

export async function getWaitingCount(request: Request, env: Env): Promise<Response> {
  const tenantId = getTenantId(request);

  if (!env.DB) return jsonWithETag({ waitingCount: 0 }, "0");

  try {
    const activeRows = await env.DB.prepare(
      `SELECT key, pickup_time, order_content, created_at, updated_at FROM orders 
       WHERE tenant_id = ? 
         AND status = 'ACCEPTED'
         AND created_at >= DATETIME('now', '-24 hours')`
    ).bind(tenantId).all<any>();

    const now = Date.now();
    // Các đơn trong hàng đợi hiện tại: đơn có giờ nhận từ quá khứ (đang làm/chưa xong) đến trong vòng 1 giờ tới (60 phút)
    const thresholdMs = now + 60 * 60 * 1000;

    let waitingCount = 0;
    let lastUpdated = "0";

    if (activeRows && activeRows.results) {
      for (const item of activeRows.results) {
        if (item.updated_at && item.updated_at > lastUpdated) {
          lastUpdated = item.updated_at;
        }
        const itemPickupMs = parsePickupTimeToMs(item.pickup_time, item.created_at, item.order_content);
        if (itemPickupMs <= thresholdMs) {
          waitingCount++;
        }
      }
    }

    const currentVersion = `detail1_items_${waitingCount}_${lastUpdated}`;

    const clientETag = request.headers.get("if-none-match")?.replace(/^W\//, '').replace(/"/g, '');
    if (clientETag && clientETag === currentVersion) {
      return new Response(null, {
        status: 304,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "ETag": `"${currentVersion}"`,
          ...corsHeaders(),
        },
      });
    }

    return jsonWithETag({ waitingCount }, currentVersion);
  } catch (e: any) {
    console.error("[getWaitingCount] D1 error:", e);
    return jsonWithETag({ waitingCount: 0 }, "0");
  }
}

function mapOrderRows(results: any[]): Order[] {
  return (results || []).map(row => {
    let parsedCreatedAt = Date.now();
    if (row.created_at) {
      const rawStr = String(row.created_at).trim();
      const isoStr = rawStr.includes("T") ? (rawStr.endsWith("Z") ? rawStr : rawStr + "Z") : rawStr.replace(" ", "T") + "Z";
      const t = new Date(isoStr).getTime();
      if (!isNaN(t)) parsedCreatedAt = t;
    }

    let parsedLastAppendedAt: number | null = null;
    if (row.last_appended_at) {
      const rawStr = String(row.last_appended_at).trim();
      const isoStr = rawStr.includes("T") ? (rawStr.endsWith("Z") ? rawStr : rawStr + "Z") : rawStr.replace(" ", "T") + "Z";
      const t = new Date(isoStr).getTime();
      if (!isNaN(t)) parsedLastAppendedAt = t;
    }

    return {
      key: row.key,
      orderId: row.order_id,
      displayKey: row.display_key,
      legacyKey: row.legacy_key,
      businessDate: row.business_date,
      customer: row.customer_name || "顧客",
      time: row.pickup_time || "",
      content: row.order_content || "",
      status: row.status || "NEW",
      createdAt: parsedCreatedAt,
      userId: row.user_id || undefined,
      total: Number(row.total_amount) || 0,
      reason: row.reason || "",
      note: row.note || "",
      diningOption: (row.dining_option as any) || 'takeaway',
      tableNumber: row.table_number || undefined,
      tableId: row.table_id || null, table_id: row.table_id || null, source: row.source, revision: Number(row.revision) || 0,
      roundCount: Number(row.round_count) || 1,
      round_count: Number(row.round_count) || 1,
      lastAppendedAt: parsedLastAppendedAt || row.last_appended_at || null,
      last_appended_at: parsedLastAppendedAt || row.last_appended_at || null,
      is_modified: Number(row.is_modified) || 0,
      isModified: Number(row.is_modified) === 1
    };
  });
}

export async function getOrders(request: Request, env: Env): Promise<Response> {
  const tenantId = getTenantId(request);

  if (!env.DB) return jsonWithETag([], "0");

  try {
    // 1. Tính toán ETag version tức thì dựa trên Index D1 (Tối ưu O(1) - Chỉ đọc đúng 1 dòng)
    const verRow = await env.DB.prepare(
      `SELECT updated_at, key, status, round_count${detailReads(env) ? ', detail_revision' : ''} FROM orders WHERE tenant_id = ? ORDER BY updated_at DESC, key DESC LIMIT 1`
    ).bind(tenantId).first<{ updated_at: string | null; key: string | null; status: string | null; round_count: number | null; detail_revision?: number }>();

    const lastUpdated = verRow?.updated_at || "0";
    const lastKey = verRow?.key || "empty";
    const lastStatus = verRow?.status || "none";
    const lastRound = verRow?.round_count || 1;
    const currentVersion = `detail1_items_${lastUpdated}_${lastKey}_${lastStatus}_${lastRound}_${verRow?.detail_revision || 0}`;

    // 2. Client gửi Header "If-None-Match" -> So sánh với D1 version
    const clientETag = request.headers.get("if-none-match")?.replace(/^W\//, '').replace(/"/g, '');
    if (clientETag && clientETag === currentVersion) {
      return new Response(null, {
        status: 304,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "ETag": `"${currentVersion}"`,
          ...corsHeaders(),
        },
      });
    }

    // 3. Live Query: Lấy các đơn active + đơn hôm nay (UTC+8)
    const nowTw = new Date(Date.now() + 8 * 3600000);
    const todayTwStr = `${nowTw.getUTCFullYear()}-${String(nowTw.getUTCMonth() + 1).padStart(2, "0")}-${String(nowTw.getUTCDate()).padStart(2, "0")}`;
    const startOfTodayUTC = new Date(new Date(`${todayTwStr}T00:00:00+08:00`).getTime()).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

    const { results } = await env.DB.prepare(
      `SELECT key, order_id, display_key, business_date, legacy_key, customer_name, pickup_time, status, total_amount, order_content, reason, note, dining_option, table_number, table_id, source, revision, round_count, last_appended_at, created_at, is_modified
       FROM orders 
       WHERE tenant_id = ? AND status <> 'PENDING_PAYMENT'
         AND (status IN ('NEW', 'ACCEPTED', 'WAITING_CUSTOMER_CHANGE', 'WAITING_CUSTOMER_REJECT', 'DONE') 
              OR created_at >= ?)
       ORDER BY created_at DESC LIMIT 500`
    ).bind(tenantId, startOfTodayUTC).all<any>();

    const orders = mapOrderRows(results || []);
    await attachOrderPrintItems(env, tenantId, orders);
    await attachOrderDetails(env, tenantId, orders);
    await attachPayments(env, tenantId, orders);
    return jsonWithETag(orders, currentVersion);
  } catch (e: any) {
    console.error("[getOrders] D1 error:", e);
    return json({ error: "Failed to fetch orders", details: e.message }, 500);
  }
}

export async function getHistorySummary(request: Request, env: Env): Promise<Response> {
  const tenantId = getTenantId(request);
  if (!env.DB) return json([]);

  try {
    const { results } = await env.DB.prepare(
      `SELECT 
         DATE(DATETIME(created_at, '+8 hours')) as date_group,
         COUNT(*) as total_orders,
         SUM(total_amount) as total_revenue
       FROM orders
       WHERE tenant_id = ? 
         AND status IN ('PICKED_UP', 'REJECTED', 'PAID')
         AND created_at >= DATETIME('now', '-30 days')
       GROUP BY date_group
       ORDER BY date_group DESC`
    ).bind(tenantId).all<any>();

    const summary = (results || []).map(r => ({
      date: r.date_group,
      count: Number(r.total_orders) || 0,
      total: Number(r.total_revenue) || 0
    }));

    return json(summary);
  } catch (e: any) {
    console.error("[getHistorySummary] D1 error:", e);
    return json({ error: "Failed to fetch history summary", details: e.message }, 500);
  }
}

export async function getOrdersByDate(request: Request, env: Env): Promise<Response> {
  const tenantId = getTenantId(request);
  if (!env.DB) return json([]);

  const url = new URL(request.url);
  const dateStr = url.searchParams.get("date");
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return json({ error: "Invalid date format, expected YYYY-MM-DD" }, 400);
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT key, order_id, display_key, business_date, legacy_key, customer_name, pickup_time, status, total_amount, order_content, reason, note, dining_option, table_number, table_id, source, revision, round_count, last_appended_at, created_at
       FROM orders 
       WHERE tenant_id = ? 
         AND status IN ('PICKED_UP', 'REJECTED', 'PAID')
         AND DATE(DATETIME(created_at, '+8 hours')) = ?
       ORDER BY created_at DESC LIMIT 500`
    ).bind(tenantId, dateStr).all<any>();

    const orders = mapOrderRows(results || []);
    await attachOrderPrintItems(env, tenantId, orders);
    await attachOrderDetails(env, tenantId, orders);
    await attachPayments(env, tenantId, orders);
    return json(orders);
  } catch (e: any) {
    console.error("[getOrdersByDate] D1 error:", e);
    return json({ error: "Failed to fetch orders by date", details: e.message }, 500);
  }
}

export async function getHistoryAll(request: Request, env: Env): Promise<Response> {
  const tenantId = getTenantId(request);
  if (!env.DB) return json([]);

  try {
    const { results } = await env.DB.prepare(
      `SELECT key, order_id, display_key, business_date, legacy_key, customer_name, pickup_time, status, total_amount, order_content, reason, note, dining_option, table_number, table_id, source, revision, round_count, last_appended_at, created_at
       FROM orders 
       WHERE tenant_id = ? 
         AND status IN ('PICKED_UP', 'REJECTED', 'PAID')
         AND created_at >= DATETIME('now', '-30 days')
       ORDER BY created_at DESC LIMIT 1000`
    ).bind(tenantId).all<any>();

    const orders = mapOrderRows(results || []);
    await attachOrderPrintItems(env, tenantId, orders);
    await attachOrderDetails(env, tenantId, orders);
    await attachPayments(env, tenantId, orders);
    return json(orders);
  } catch (e: any) {
    console.error("[getHistoryAll] D1 error:", e);
    return json({ error: "Failed to fetch all history orders", details: e.message }, 500);
  }
}

export async function saveOrder(env: Env, order: Order, tenantId: string, createOnly = false, receiptStatement?: D1PreparedStatement): Promise<void> {
  // Save order and receipt atomically.
  const statement = env.DB.prepare(
    `INSERT INTO orders (key, order_id, display_key, business_date, uuid, tenant_id, user_id, customer_name, pickup_time, status, total_amount, order_content, reason, note, dining_option, table_number, round_count, last_appended_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 1), ?, datetime(?, 'unixepoch'), datetime('now'))
     ${createOnly ? '' : `ON CONFLICT(key) DO UPDATE SET
       uuid = CASE WHEN excluded.uuid IS NOT NULL THEN excluded.uuid ELSE orders.uuid END,
       status = CASE
         WHEN orders.status IN ('ACCEPTED', 'DONE', 'REJECTED', 'PICKED_UP', 'PAID') AND excluded.status = 'NEW'
         THEN orders.status
         ELSE excluded.status
       END,
       pickup_time = excluded.pickup_time,
       customer_name = CASE WHEN excluded.customer_name != 'Khách (Web)' THEN excluded.customer_name ELSE orders.customer_name END,
       total_amount = excluded.total_amount,
       order_content = excluded.order_content,
       reason = excluded.reason,
       note = excluded.note,
       dining_option = excluded.dining_option,
       table_number = excluded.table_number,
       round_count = CASE WHEN excluded.round_count > orders.round_count THEN excluded.round_count ELSE orders.round_count END,
       last_appended_at = CASE WHEN excluded.last_appended_at IS NOT NULL THEN excluded.last_appended_at ELSE orders.last_appended_at END,
       updated_at = datetime('now') WHERE orders.tenant_id = excluded.tenant_id`}`
  ).bind(
    order.key,
    order.orderId || null,
    order.displayKey || order.key,
    order.businessDate || new Date((order.createdAt || Date.now()) + 8 * 3600000).toISOString().slice(0, 10),
    order.uuid || null,
    tenantId,
    order.userId || null,
    order.customer || "顧客",
    order.time || "",
    order.status || "NEW",
    order.total ?? 0,
    order.content || "",
    order.reason || "",
    order.note || "",
    order.diningOption || "takeaway",
    order.tableNumber || null,
    order.roundCount || order.round_count || 1,
    order.lastAppendedAt || order.last_appended_at || null,
    Math.floor((order.createdAt || Date.now()) / 1000)
  );
  if (receiptStatement) await env.DB.batch([statement, receiptStatement]);
  else await statement.run();
}

export async function handleOrdersMigration(_request: Request, _env: Env): Promise<Response> {
  return json({ error: 'Legacy KV import is retired after order identity migration.' }, 410);
}

export function parsePickupTimeToMs(timeStr: string | null | undefined, createdAtStr: string | null | undefined, orderContent?: string): number {
  const createdDate = createdAtStr ? new Date(createdAtStr.endsWith("Z") ? createdAtStr : createdAtStr + "Z") : new Date();
  const createdMs = !isNaN(createdDate.getTime()) ? createdDate.getTime() : Date.now();

  let targetStr = (timeStr || "").trim();

  // If timeStr is missing, "Unknown", or only date without time, try finding "取餐時間", "訂餐時間", or "點餐時間" in orderContent
  if ((!targetStr || targetStr === "Unknown" || !targetStr.match(/\d{1,2}:\d{2}/)) && orderContent) {
    const match = orderContent.match(/(?:取餐時間|訂餐時間|點餐時間)[：:]\s*([^\n\r]+)/);
    if (match && match[1]) {
      targetStr = match[1].trim();
    }
  }

  // 1. Matches "YYYY-MM-DD" + "HH:mm" (even if followed by extra text like "(即時取餐)")
  const dateTimeMatch = targetStr.match(/(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}):(\d{2})/);
  if (dateTimeMatch) {
    const yyyyMmDd = dateTimeMatch[1];
    const hh = dateTimeMatch[2].padStart(2, "0");
    const min = dateTimeMatch[3].padStart(2, "0");
    const iso = `${yyyyMmDd}T${hh}:${min}:00+08:00`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // 2. Matches only "HH:mm" -> attach the YYYY-MM-DD from created_at in Taiwan UTC+8 timezone
  const timeMatch = targetStr.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const twDate = new Date(createdMs + 8 * 3600000);
    const yyyy = twDate.getUTCFullYear();
    const mm = String(twDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(twDate.getUTCDate()).padStart(2, "0");
    const hh = String(parseInt(timeMatch[1], 10)).padStart(2, "0");
    const min = String(parseInt(timeMatch[2], 10)).padStart(2, "0");
    const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:00+08:00`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // 3. Fallback: if only date "YYYY-MM-DD" with no time at all, it was placed as ASAP at createdMs
  return createdMs;
}

export async function getOrderQueueAhead(env: Env, tenantId: string, orderKey: string): Promise<{ order: Order | null; queueAhead: number }> {
  if (!env.DB) return { order: null, queueAhead: 0 };
  try {
    const row = await env.DB.prepare(
      "SELECT key, order_id, display_key, business_date, legacy_key, customer_name, pickup_time, status, total_amount, order_content, reason, note, dining_option, table_number, table_id, source, revision, round_count, last_appended_at, created_at, user_id FROM orders WHERE key = ? AND tenant_id = ?"
    ).bind(await resolveOrderKey(env, tenantId, orderKey), tenantId).first<any>();

    if (!row) return { order: null, queueAhead: 0 };

    const order: Order = {
      key: row.key,
      orderId: row.order_id,
      displayKey: row.display_key,
      legacyKey: row.legacy_key,
      businessDate: row.business_date,
      customer: row.customer_name,
      time: row.pickup_time,
      content: row.order_content,
      status: row.status,
      createdAt: new Date(row.created_at + "Z").getTime(),
      userId: row.user_id || undefined,
      total: row.total_amount,
      reason: row.reason || "",
      note: row.note || "",
      diningOption: (row.dining_option as any) || 'takeaway',
      tableNumber: row.table_number || undefined,
      tableId: row.table_id || null, table_id: row.table_id || null, source: row.source, revision: Number(row.revision) || 0,
      roundCount: Number(row.round_count) || 1,
      round_count: Number(row.round_count) || 1,
      lastAppendedAt: row.last_appended_at || null,
      last_appended_at: row.last_appended_at || null
    };

    await attachOrderDetails(env, tenantId, [order]);
    if (order.status === 'DONE' || order.status === 'PICKED_UP' || order.status === 'REJECTED') {
      return { order, queueAhead: 0 };
    }

    const activeRows = await env.DB.prepare(
      `SELECT key, pickup_time, order_content, created_at FROM orders
       WHERE tenant_id = ?
         AND status IN ('NEW', 'ACCEPTED')
         AND created_at >= DATETIME('now', '-24 hours')`
    ).bind(tenantId).all<any>();

    const targetPickupMs = parsePickupTimeToMs(row.pickup_time, row.created_at, row.order_content);
    const targetCreatedMs = new Date(row.created_at + "Z").getTime();

    let queueAhead = 0;
    if (activeRows && activeRows.results) {
      for (const item of activeRows.results) {
        if (item.key === row.key) continue;
        const itemPickupMs = parsePickupTimeToMs(item.pickup_time, item.created_at, item.order_content);
        const itemCreatedMs = new Date(item.created_at + "Z").getTime();

        // Xếp theo thứ tự thời gian nhận hàng (pickup_time):
        // 1. Đơn có giờ nhận hàng sớm hơn được ưu tiên làm trước (xếp lên trước)
        // 2. Nếu cùng giờ nhận hàng, đơn nào đặt trước (created_at trước) thì làm trước
        if (itemPickupMs < targetPickupMs) {
          queueAhead++;
        } else if (itemPickupMs === targetPickupMs && itemCreatedMs < targetCreatedMs) {
          queueAhead++;
        }
      }
    }

    return { order, queueAhead };
  } catch (e: any) {
    console.error("[getOrderQueueAhead] error:", e);
    return { order: null, queueAhead: 0 };
  }
}

export async function getUserLatestActiveOrder(env: Env, tenantId: string, userId: string): Promise<{ order: Order | null; queueAhead: number }> {
  if (!env.DB) return { order: null, queueAhead: 0 };
  try {
    const row = await env.DB.prepare(
      `SELECT key FROM orders 
       WHERE tenant_id = ? AND user_id = ?
         AND status IN ('NEW', 'ACCEPTED', 'WAITING_CUSTOMER_CHANGE', 'WAITING_CUSTOMER_REJECT', 'DONE')
       ORDER BY created_at DESC LIMIT 1`
    ).bind(tenantId, userId).first<any>();

    if (!row) return { order: null, queueAhead: 0 };

    return await getOrderQueueAhead(env, tenantId, row.key);
  } catch (e: any) {
    console.error("[getUserLatestActiveOrder] error:", e);
    return { order: null, queueAhead: 0 };
  }
}

export async function getOrderEditContext(request: Request, env: Env, tenantCtx?: TenantContext | null): Promise<Response> {
  const url = new URL(request.url);
  const rawKey = url.searchParams.get("key") || url.searchParams.get("order_key");
  const tenantId = tenantCtx?.tenantId || getTenantId(request);

  if (!rawKey) {
    return json({ error: "Missing order key parameter", code: "MISSING_KEY" }, 400);
  }
  if (!env.DB) {
    return json({ error: "Database not configured", code: "NO_DB" }, 500);
  }

  try {
    const resolvedKey = await resolveOrderKey(env, tenantId, rawKey);
    if (!resolvedKey) {
      return json({ error: "Order not found", code: "ORDER_NOT_FOUND" }, 404);
    }

    const orderRow = await env.DB.prepare(
      `SELECT * FROM orders WHERE tenant_id = ? AND key = ? LIMIT 1`
    ).bind(tenantId, resolvedKey).first<any>();

    if (!orderRow) {
      return json({ error: "Order not found", code: "ORDER_NOT_FOUND" }, 404);
    }

    const pendingRow = await env.DB.prepare(
      `SELECT reason, note FROM pending_actions WHERE tenant_id = ? AND order_key = ? LIMIT 1`
    ).bind(tenantId, resolvedKey).first<any>();

    let soldOutItemNames: string[] = [];
    if (pendingRow?.note) {
      soldOutItemNames = pendingRow.note.split(/[,、]/).map((s: string) => s.trim()).filter(Boolean);
    } else if (orderRow.note && orderRow.reason === '口味售完') {
      soldOutItemNames = orderRow.note.split(/[,、]/).map((s: string) => s.trim()).filter(Boolean);
    }

    const itemsRes = await env.DB.prepare(
      `SELECT * FROM order_items WHERE tenant_id = ? AND order_key = ? ORDER BY round_number ASC, id ASC`
    ).bind(tenantId, resolvedKey).all<any>();

    const items = (itemsRes.results || []).map((row: any) => {
      let options = [];
      let bundleSelections = null;
      try { if (row.selected_options) options = JSON.parse(row.selected_options); } catch {}
      try { if (row.bundle_snapshot_json) bundleSelections = JSON.parse(row.bundle_snapshot_json); } catch {}

      return {
        id: row.id,
        itemId: row.item_id,
        name: row.item_name,
        category: row.category_name,
        quantity: row.quantity,
        unitPrice: row.unit_price,
        subtotal: row.subtotal,
        options,
        bundleSelections,
        note: row.notes || "",
        roundNumber: row.round_number
      };
    });

    const detailOrder = mapOrderRows([orderRow])[0];
    await attachOrderDetails(env, tenantId, [detailOrder]);

    return json({
      success: true,
      order: {
        detailSnapshot: detailOrder.detailSnapshot,
        detailRevision: detailOrder.detailRevision || 0,
        key: orderRow.key,
        orderId: orderRow.order_id,
        displayKey: orderRow.display_key,
        businessDate: orderRow.business_date,
        customer: orderRow.customer_name,
        time: orderRow.pickup_time,
        status: orderRow.status,
        total: orderRow.total_amount,
        content: orderRow.order_content,
        reason: orderRow.reason,
        note: orderRow.note,
        diningOption: orderRow.dining_option,
        tableNumber: orderRow.table_number,
        userId: orderRow.user_id,
        isModified: Number(orderRow.is_modified) === 1
      },
      soldOutItemNames,
      items
    });
  } catch (err: any) {
    console.error("[getOrderEditContext] error:", err);
    return json({ error: err.message || "Failed to load order edit context", code: "INTERNAL_ERROR" }, 500);
  }
}

export async function modifyOrder(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
  tenantCtx?: TenantContext | null
): Promise<Response> {
  if (!env.DB) {
    return json({ error: "Database not configured", code: "NO_DB" }, 500);
  }

  try {
    const payload: any = await request.json();
    const rawKey = payload.order_key || payload.key;
    const tenantId = tenantCtx?.tenantId || payload.tenant_id || getTenantId(request);
    if (payload.detailVersion !== undefined) return writeDetailedOrder(env, tenantId, payload, 'modify', ctx, tenantCtx);

    if (!rawKey) {
      return json({ error: "Missing order_key", code: "MISSING_KEY" }, 400);
    }

    const resolvedKey = await resolveOrderKey(env, tenantId, rawKey);
    if (!resolvedKey) {
      return json({ error: "Order not found", code: "ORDER_NOT_FOUND" }, 404);
    }

    const orderRow = await env.DB.prepare(
      `SELECT * FROM orders WHERE tenant_id = ? AND key = ? LIMIT 1`
    ).bind(tenantId, resolvedKey).first<any>();

    if (!orderRow) {
      return json({ error: "Order not found", code: "ORDER_NOT_FOUND" }, 404);
    }

    if (orderRow.source === 'staff') return json({code:'STAFF_ORDER_RESTRICTED'},403);
    if (Number(orderRow.detail_revision || 0) > 0) return json({ code: 'ORDER_CLIENT_UPGRADE_REQUIRED' }, 409);

    if (orderRow.status !== 'WAITING_CUSTOMER_CHANGE') {
      return json({
        error: "此訂單目前狀態不允許修改 / Trạng thái đơn hàng hiện tại không cho phép chỉnh sửa",
        code: "ORDER_NOT_MODIFIABLE",
        currentStatus: orderRow.status
      }, 400);
    }

    const rawItems: OrderItemInput[] = Array.isArray(payload.items) ? payload.items : [];
    if (rawItems.length === 0) {
      return json({ error: "購物車不能為空 / Giỏ hàng không được để trống", code: "EMPTY_ITEMS" }, 400);
    }

    // 1. Kiểm tra tồn kho tại CSDL D1 cho các món mới chọn
    const rawNames = extractAllOrderSearchNames(rawItems);
    if (rawNames.length > 0) {
      const cleanNames = rawNames.map(n => n.replace(/\s+(L|S|M)$/i, '').replace(/^\[[^\]]+\]\s*/, '').trim());
      const allSearchNames = Array.from(new Set([...rawNames, ...cleanNames]));
      const placeholders = allSearchNames.map(() => '?').join(',');

      try {
        const oosQuery = await env.DB.prepare(
          `SELECT name FROM menu_items 
           WHERE tenant_id = ? 
             AND (name IN (${placeholders}) OR id IN (${placeholders})) 
             AND out_of_stock_until IS NOT NULL 
             AND datetime(out_of_stock_until) > datetime('now')`
        ).bind(tenantId, ...allSearchNames, ...allSearchNames).all<{ name: string }>();

        if (oosQuery.results && oosQuery.results.length > 0) {
          const oosNames = Array.from(new Set(oosQuery.results.map(r => r.name)));
          return json({
            error: `抱歉，您選擇的餐點【${oosNames.join('、')}】目前已售完，請更換其他品項！`,
            code: "ITEMS_OUT_OF_STOCK",
            outOfStockItems: oosNames
          }, 400);
        }
      } catch (stockCheckErr) {
        console.warn(`[modifyOrder] Stock check warning:`, stockCheckErr);
      }
    }

    // 2. Validate combo bundle selections
    const bundleCheck = await validateOrderBundles(env, tenantId, rawItems);
    if (!bundleCheck.valid) {
      return json({ error: bundleCheck.error, code: bundleCheck.code }, 400);
    }

    // 3. Format updated content & calculate totals
    const newItemsText = formatItemsToText(rawItems);
    const newTotal = Number(payload.new_total) || Number(payload.total) || rawItems.reduce((sum, it) => {
      const qty = Number(it.quantity) || 1;
      const unit = Number(it.price || it.unit_price) || 0;
      return sum + (it.subtotal ? Number(it.subtotal) : unit * qty);
    }, 0);

    const oldTotal = Number(orderRow.total_amount) || 0;
    const deltaAmount = newTotal - oldTotal;

    const separator = "--------------------------------";
    let updatedContent = `【顧客更換品項 - 已更新】\n${newItemsText.trim()}`;
    if (orderRow.order_content) {
      updatedContent += `\n\n${separator}\n[原訂單明細 (更換前)]:\n${orderRow.order_content.trim()}`;
    }

    const customerNote = payload.note ? String(payload.note).trim() : (orderRow.note || "");

    const receipt = await prepareOrderReceipt(env, tenantId, resolvedKey, orderRow.user_id, 'modify',
      `[${tenantCtx?.brandName || "Benmi"}] 訂單品項已成功更換 #${orderRow.display_key || resolvedKey}`,
      createOrderModifiedConfirmationFlexBubble(resolvedKey, newTotal, deltaAmount, tenantCtx?.brandName || "Benmi", orderRow.display_key, rawItems));

    // 4. Atomic D1 Batch: Update orders, delete old order_items & insert new ones, delete pending_actions
    const batchStatements: any[] = [
      env.DB.prepare(
        `UPDATE orders SET
           order_content = ?,
           total_amount = ?,
           status = 'NEW',
           is_modified = 1,
           reason = '',
           note = ?,
           updated_at = datetime('now')
         WHERE key = ? AND tenant_id = ?`
      ).bind(
        updatedContent,
        newTotal,
        customerNote,
        resolvedKey,
        tenantId
      ),
      env.DB.prepare(
        `DELETE FROM order_items WHERE tenant_id = ? AND order_key = ?`
      ).bind(tenantId, resolvedKey),
      ...rawItems.map(item => {
        const itemQty = Number(item.quantity) || 1;
        const unitPrice = Number(item.price || item.unit_price) || 0;
        const subtotal = Number(item.subtotal) || (unitPrice * itemQty);
        const optionsJson = JSON.stringify(item.options || item.selected_options || []);
        const itemNote = item.note || item.notes || "";
        const bundleJson = item.bundle_snapshot_json || (item.bundleSelections ? JSON.stringify(item.bundleSelections) : null);
        return env.DB.prepare(
          `INSERT INTO order_items (tenant_id, order_key, round_number, item_id, item_name, category_name, quantity, unit_price, subtotal, selected_options, bundle_snapshot_json, notes, created_at)
           VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(
          tenantId,
          resolvedKey,
          item.itemId || item.item_id || null,
          item.name || "Món",
          item.category || item.category_name || null,
          itemQty,
          unitPrice,
          subtotal,
          optionsJson,
          bundleJson,
          itemNote
        );
      }),
      env.DB.prepare(
        `DELETE FROM pending_actions WHERE tenant_id = ? AND order_key = ?`
      ).bind(tenantId, resolvedKey)
    ];

    if (receipt) batchStatements.push(receipt.statement);
    await env.DB.batch(batchStatements);

    // 5. Construct updated order object
    const updatedOrder: Order = {
      key: resolvedKey,
      orderId: orderRow.order_id,
      displayKey: orderRow.display_key,
      legacyKey: orderRow.legacy_key,
      businessDate: orderRow.business_date,
      customer: orderRow.customer_name || "顧客",
      time: orderRow.pickup_time || "",
      content: updatedContent,
      status: "NEW",
      createdAt: orderRow.created_at ? new Date(orderRow.created_at + "Z").getTime() : Date.now(),
      userId: orderRow.user_id || undefined,
      total: newTotal,
      reason: "",
      note: customerNote,
      diningOption: (orderRow.dining_option as any) || 'takeaway',
      tableNumber: orderRow.table_number || undefined,
      roundCount: Number(orderRow.round_count) || 1,
      round_count: Number(orderRow.round_count) || 1,
      is_modified: 1,
      isModified: true
    };

    // 6. Sync Google Sheets in background
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(syncToGoogleSheets(updatedOrder, env, tenantCtx));
    } else {
      await syncToGoogleSheets(updatedOrder, env, tenantCtx);
    }

    const isDesktop = payload.is_desktop === true || payload.isDesktop === true || payload.line_delivery_mode === 'push';
    if (isDesktop) await pushOrderReceiptInBackground(env, receipt?.notification.id, ctx, tenantCtx);

    return json({
      success: true,
      key: resolvedKey,
      displayKey: orderRow.display_key,
      oldTotal,
      newTotal,
      deltaAmount,
      isModified: true,
      notification: receipt?.notification
    });
  } catch (err: any) {
    console.error("[modifyOrder] error:", err);
    return json({ error: err.message || "Failed to modify order", code: "INTERNAL_ERROR" }, 500);
  }
}
