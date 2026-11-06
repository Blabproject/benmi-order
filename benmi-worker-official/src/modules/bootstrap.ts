import { detailWrites } from './order-detail';
import { tenantIsDeleted } from '../utils/tenant-lifecycle';
import { groupOptions, loadOptionCatalog, projectOptionRule, unifiedMenuEnabled } from './option-groups';
import { Env } from '../types/env';
import { json } from '../utils/http';
import { getTenantId } from './menu';
import { resolveTenantContext } from './tenant';

export interface BootstrapBundleGroup {
  id: string;
  name: string;
  label?: any;
  type?: 'choice' | 'fixed';
  items?: Array<{ itemId: string; quantity: number; surcharge: number }>;
  surcharges?: Record<string, number>;
  minQuantity: number;
  maxQuantity: number;
  allowRepeats: boolean;
  autoPopup?: boolean;
  sources: Array<{
    type: 'category' | 'item_list';
    refId?: string;
    itemIds?: string[];
  }>;
  eligibleItems?: Array<{
    id: string;
    name: string;
    price: number;
    surcharge: number;
    isOutOfStock: boolean;
    categoryId?: string;
    allowCustomization?: boolean;
    appliedModifiers?: string[];
    modifierGroups?: any[];
  }>;
}

export interface BootstrapBundleRule {
  version: number;
  autoPopup?: boolean;
  groups: BootstrapBundleGroup[];
}

// v3 retires legacy category modifiers from the unified customer read model.
export const BOOTSTRAP_VERSION = 3;

export interface BootstrapResponse {
  bootstrapVersion: number;
  menuComplete: boolean;
  /** Display lookup for legacy order IDs; never a source of selectable options. */
  optionDisplayNames?: Record<string, string>;
  customizationCategoryId?: string | null;
  tenant: {
    id: string;
    brandName: string;
    brandSubtitle?: string;
    brandColor: string;
    brandColorDark: string;
    logoUrl: string | null;
    storeAddress: string | null;
    announcement?: string | null;
    operatingHours: string | null;
    parsedHours: Record<string, Array<{ start: string; end: string }>>;
    formattedHours?: string;
    deliveryPolicy: string | null;
    allowScheduledPickup: boolean;
    allowDineIn: boolean;
    features: string[];
    orderPrefix?: string;
    storeStatus: string;
    liffId: string | null;
    liffUrl: string | null;
    locale: string;
  };
  catalog: Array<{
    id: string;
    slug: string;
    name: string;
    shortName?: string | null;
    allowCustomization: boolean;
    appliedModifiers: string[];
    modifierGroups?: Array<{
      id: string;
      name: string;
      selectionType: 'single' | 'multiple';
      isRequired: boolean;
      minSelection: number;
      maxSelection: number;
      options: Array<{
        id: string;
        name: string;
        price: number;
        isDefault: boolean;
        isOutOfStock: boolean;
      }>;
    }>;
    pricingRules?: any | null;
    sortOrder: number;
    items: Array<{
      id: string;
      name: string;
      price: number;
      description: string | null;
      imageUrl: string | null;
      isOutOfStock: boolean;
      isRecommended: boolean;
      badgeText?: string | null;
      badge?: string | null;
      maxPerOrder?: number | null;
      itemType?: 'standard' | 'bundle';
      modifierGroups?: Array<{
        id: string;
        name: string;
        selectionType: 'single' | 'multiple';
        isRequired: boolean;
        minSelection: number;
        maxSelection: number;
        options: Array<{
          id: string;
          name: string;
          price: number;
          isDefault: boolean;
          isOutOfStock: boolean;
        }>;
      }>;
      sortOrder: number;
    }>;
  }>;
  modifiers: Array<{
    id: string;
    slug: string;
    name: string;
    selectionType: 'single' | 'multiple' | 'combo_drink';
    isRequired: boolean;
    minSelection: number;
    maxSelection: number;
    sortOrder?: number;
    options: Array<{
      id: string;
      name: string;
      price: number;
      isDefault: boolean;
      isOutOfStock: boolean;
      subOptions?: any[];
      eligibilityRules?: any[];
    }>;
  }>;
  customizations?: Array<{
    scope?: string;
    id: string;
    key: string;
    title: string;
    type: 'radio' | 'checkbox';
    isRequired?: boolean;
    sortOrder: number;
    options: Array<{
      id?: string;
      name: string;
      price?: number;
      isDefault?: boolean;
      isOutOfStock?: boolean;
      is_out_of_stock?: boolean;
      min_order_amount?: number;
      minOrderSubtotal?: number;
      thresholdBasis?: string;
      ruleErrorMessage?: string;
      sub_options?: any[];
      subOptions?: any[];
      eligibilityRules?: any[];
    }>;
  }>;
  /** Position of the store-wide customization panel among catalog sections. */
  customizationSortOrder?: number;
  customizationTitle?: string | null;
  customizationShortName?: string | null;
  categoryModifierLinks?: Array<{
    categoryId: string;
    groupId: string;
    sortOrder: number;
  }>;
  translations?: Record<string, string>;
  recommended?: string[];
}

const BENMI_TRANSLATIONS: Record<string, string> = {
  "燒肉": "Braised pork / Thịt nguội",
  "火腿": "Ham / Chả",
  "雞肉": "Chicken / Thịt gà",
  "烤肉": "Grilled Meat / Thịt nướng",
  "雙層烤肉": "Double Cheesebanhmi / Thịt nướng phô mai",
  "綜合": "Mixed / Thập cẩm",
  "越南咖啡": "Coffee with Condensed Milk / Cà phê sữa",
  "豆漿": "Soy milk / Sữa đậu nành",
  "紅茶": "Black Tea / Hồng trà",
  "可樂": "Cocacola / Sprite",
  "雪碧": "Cocacola / Sprite"
};

export function parseOperatingHours(raw: any, tenantId: string): Record<string, Array<{ start: string; end: string }>> {
  const result: Record<string, Array<{ start: string; end: string }>> = {};

  if (!raw || (typeof raw === 'string' && raw.trim() === '')) {
    const defaultShifts = [{ start: "11:00", end: "21:00" }];
    for (let i = 0; i < 7; i++) result[String(i)] = defaultShifts;
    return result;
  }

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof parsed === 'object' && parsed !== null) {
      if (Array.isArray(parsed)) {
        for (let i = 0; i < 7; i++) result[String(i)] = parsed;
        return result;
      }
      for (let i = 0; i < 7; i++) {
        const s = parsed[String(i)] !== undefined ? parsed[String(i)] : parsed[i];
        result[String(i)] = Array.isArray(s) ? s : [];
      }
      return result;
    }
  } catch (e) {
    // Plain text parser
  }

  if (typeof raw === 'string') {
    const timeMatch = raw.match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/);
    if (timeMatch) {
      const start = timeMatch[1].padStart(5, '0');
      const end = timeMatch[2].padStart(5, '0');
      const shift = [{ start, end }];
      for (let i = 0; i < 7; i++) {
        result[String(i)] = shift;
      }
      if (tenantId === 'benmi' && raw.includes('7:30')) {
        result['0'] = [{ start: '07:30', end: '21:00' }]; // Sun
        result['6'] = [{ start: '07:30', end: '21:00' }]; // Sat
      }
      return result;
    }
  }

  const fallback = [{ start: "11:00", end: "21:00" }];
  for (let i = 0; i < 7; i++) result[String(i)] = fallback;
  return result;
}

/**
 * Formats tenant operating hours (whether JSON string, parsed object, or plain text)
 * into a human-readable multiline string for LINE messages, AI replies, or UI display.
 */
export function formatOperatingHoursForDisplay(
  raw: any,
  locale: string = 'zh-TW',
  tenantId: string = ''
): string {
  const isVi = locale === 'vi' || (typeof locale === 'string' && locale.toLowerCase().startsWith('vi'));

  if (!raw || (typeof raw === 'string' && raw.trim() === '')) {
    return isVi ? 'Thứ 2 - Chủ Nhật: 11:00 - 21:00' : '週一至週日 11:00 - 21:00';
  }

  // If raw is already human text (does not look like JSON object or array)
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return trimmed;
    }
  }

  let parsed: Record<string, Array<{ start: string; end: string }>>;
  if (typeof raw === 'object' && raw !== null) {
    if (Array.isArray(raw)) {
      parsed = {};
      for (let i = 0; i < 7; i++) parsed[String(i)] = raw;
    } else {
      parsed = {};
      for (let i = 0; i < 7; i++) {
        const s = raw[String(i)] !== undefined ? raw[String(i)] : raw[i];
        parsed[String(i)] = Array.isArray(s) ? s : [];
      }
    }
  } else {
    parsed = parseOperatingHours(raw, tenantId);
  }

  const dayNamesZh: Record<string, string> = {
    '1': '週一',
    '2': '週二',
    '3': '週三',
    '4': '週四',
    '5': '週五',
    '6': '週六',
    '0': '週日',
  };

  const dayNamesVi: Record<string, string> = {
    '1': 'Thứ 2',
    '2': 'Thứ 3',
    '3': 'Thứ 4',
    '4': 'Thứ 5',
    '5': 'Thứ 6',
    '6': 'Thứ 7',
    '0': 'Chủ Nhật',
  };

  const dayNames = isVi ? dayNamesVi : dayNamesZh;
  const closedLabel = isVi ? 'Nghỉ' : '公休';

  // Week order from Monday to Sunday: 1, 2, 3, 4, 5, 6, 0
  const weekDays = ['1', '2', '3', '4', '5', '6', '0'];

  const daySchedules: Array<{ day: string; schedule: string; isOpen: boolean }> = weekDays.map((d) => {
    const shifts = Array.isArray(parsed[d]) ? parsed[d] : [];
    if (shifts.length === 0) {
      return { day: d, schedule: closedLabel, isOpen: false };
    }
    const formattedShift = shifts
      .map((s: any) => `${s.start || ''} - ${s.end || ''}`.trim())
      .filter((s: string) => s.length > 2)
      .join(', ');
    return {
      day: d,
      schedule: formattedShift || closedLabel,
      isOpen: !!formattedShift && formattedShift !== closedLabel,
    };
  });

  // Check if all 7 days are identical
  const allSame = daySchedules.every((ds) => ds.schedule === daySchedules[0].schedule);
  if (allSame) {
    if (!daySchedules[0].isOpen) {
      return isVi ? 'Tạm ngưng hoạt động' : '暫停營業';
    }
    return isVi
      ? `Thứ 2 - Chủ Nhật: ${daySchedules[0].schedule}`
      : `週一至週日 ${daySchedules[0].schedule}`;
  }

  // Check standard Mon-Fri vs Sat-Sun split
  const monFriSame = daySchedules.slice(0, 5).every((ds) => ds.schedule === daySchedules[0].schedule);
  const satSunSame = daySchedules[5].schedule === daySchedules[6].schedule;

  if (monFriSame && satSunSame) {
    const weekdaySched = daySchedules[0].schedule;
    const weekendSched = daySchedules[5].schedule;
    if (isVi) {
      return `Thứ 2 - Thứ 6: ${weekdaySched}\nThứ 7, Chủ Nhật: ${weekendSched}`;
    } else {
      return `週一至週五 ${weekdaySched}\n週六、週日 ${weekendSched}`;
    }
  }

  // General consecutive grouping
  const groups: Array<{ days: string[]; schedule: string; isOpen: boolean }> = [];
  let currentGroup: { days: string[]; schedule: string; isOpen: boolean } | null = null;

  for (const ds of daySchedules) {
    if (currentGroup && currentGroup.schedule === ds.schedule) {
      currentGroup.days.push(ds.day);
    } else {
      currentGroup = { days: [ds.day], schedule: ds.schedule, isOpen: ds.isOpen };
      groups.push(currentGroup);
    }
  }

  const lines: string[] = [];
  for (const group of groups) {
    const startName = dayNames[group.days[0]];
    const endName = dayNames[group.days[group.days.length - 1]];

    if (group.days.length >= 3) {
      if (isVi) {
        lines.push(`${startName} - ${endName}: ${group.schedule}`);
      } else {
        lines.push(`${startName}至${endName} ${group.schedule}`);
      }
    } else if (group.days.length === 2) {
      if (isVi) {
        lines.push(`${startName}, ${endName}: ${group.schedule}`);
      } else {
        lines.push(`${startName}、${endName} ${group.schedule}`);
      }
    } else {
      if (isVi) {
        lines.push(`${startName}: ${group.schedule}`);
      } else {
        lines.push(`${startName} ${group.schedule}`);
      }
    }
  }

  return lines.join('\n');
}

export async function getTenantBootstrap(request: Request, env: Env): Promise<Response> {
  const tenantId = getTenantId(request);
  if (await tenantIsDeleted(env.DB, tenantId)) return json({ error: 'TENANT_DELETED' }, 410, { 'Cache-Control': 'no-store' });
  const isUnified = unifiedMenuEnabled(env);
  const cacheKey = isUnified ? `tenant:${tenantId}:bootstrap:v2` : `tenant:${tenantId}:bootstrap`;

  try {
    // 1. Check KV Edge Cache (bypass if _t or nocache query param is present)
    const url = new URL(request.url);
    const noCache = url.searchParams.has('nocache') || url.searchParams.has('_t');
    if (!noCache && env.ORDER_STATE) {
      const cached = await env.ORDER_STATE.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.bootstrapVersion === BOOTSTRAP_VERSION && parsed.menuComplete === true && Boolean(parsed.unifiedMenu) === unifiedMenuEnabled(env) && (parsed.orderDetailVersion === 1) === detailWrites(env)) {
            return json(parsed, 200, {
              "X-Cache": "HIT",
              "Cache-Control": "no-cache, must-revalidate"
            });
          }
        } catch {
          // ignore corrupted or legacy cache, fallback to fresh D1 query
        }
      }
    }
  } catch (e) {
    console.error(`[Bootstrap] KV read failed for ${tenantId}:`, e);
  }

  try {
    // 2. Fetch Tenant Context
    const tenantCtx = await resolveTenantContext(tenantId, env);
    if (!tenantCtx && tenantId !== 'benmi') {
      return json({ error: `Tenant '${tenantId}' not found or inactive` }, 404);
    }
    const brandName = tenantCtx?.brandName || (tenantId === 'benmi' ? 'Benmi 越式法國麵包' : tenantId);
    const brandColor = '#00b900';
    const brandColorDark = '#009900';
    const brandSubtitle = tenantCtx?.brandSubtitle || (tenantId === 'benmi' ? 'Bánh mì Việt Nam / 越式法國麵包' : '');
    const storeAddress = tenantCtx?.storeAddress || (tenantId === 'benmi' ? '新北市土城區中央路二段135號' : null);
    const operatingHours = tenantCtx?.operatingHours || null;
    const deliveryPolicy = tenantCtx?.deliveryPolicy || null;
    const liffId = tenantCtx?.liffId || (tenantId === 'benmi' ? (env.LIFF_ID || null) : null);
    const liffUrl = tenantCtx?.liffUrl || (tenantId === 'benmi' ? (env.LIFF_URL || null) : null);
    const locale = tenantCtx?.locale || 'zh-TW';

    const logoUrl = tenantCtx?.logoUrl || (tenantId === 'benmi' ? './benmi_logo.png' : null);

    // 3. Batch Query D1 Database
    let menuComplete = false;
    let categories: any[] = [];
    let items: any[] = [];
    let rawCustomizations: any[] = [];
    let orderModifierRows: any[] = [];
    let bundleRulesRows: any[] = [];
    let customRulesRows: any[] = [];
    let itemModifierRows: any[] = [];
    let categoryModifierRows: any[] = [];

    if (env.DB) {
      try {
        const [catsRes, itemsRes, customRes, orderModRes] = await env.DB.batch([
          env.DB.prepare(
            `SELECT id, name, short_name, slug, 
                    COALESCE(category_type, 'catalog') AS category_type, 
                    COALESCE(selection_type, 'single') AS selection_type, 
                    COALESCE(is_required, 0) AS is_required, 
                    COALESCE(min_selection, 0) AS min_selection, 
                    COALESCE(max_selection, 1) AS max_selection, 
                    COALESCE(allow_customization, 1) AS allow_customization,
                    COALESCE(applied_modifiers, '') AS applied_modifiers,
                    pricing_rules,
                    sort_order 
             FROM menu_categories 
             WHERE tenant_id = ? 
             ORDER BY sort_order ASC`
          ).bind(tenantId),
          env.DB.prepare(
            `SELECT id, category_id, name, price, description, out_of_stock_until, sort_order,
                    COALESCE(badge_text, '') AS badge_text,
                    COALESCE(is_recommended, 0) AS is_recommended,
                    max_per_order,
                    COALESCE(item_type, 'standard') AS item_type
             FROM menu_items 
             WHERE tenant_id = ? 
             ORDER BY sort_order ASC`
          ).bind(tenantId),
          isUnified
            ? env.DB.prepare('SELECT 1 WHERE 0')
            : env.DB.prepare(
            `SELECT id, key, title, type, sort_order, options_json,
                    COALESCE(is_required, 0) AS is_required,
                    COALESCE((SELECT g.scope FROM modifier_groups g
                      WHERE g.tenant_id = menu_customizations.tenant_id
                        AND (g.id = menu_customizations.id OR g.id = 'mg_' || menu_customizations.id)
                      ORDER BY g.id LIMIT 1), 'order') AS scope
             FROM menu_customizations
             WHERE tenant_id = ?
             ORDER BY sort_order ASC`
          ).bind(tenantId),
          env.DB.prepare(
            `SELECT g.id AS group_id, g.name AS group_name, g.selection_type,
                    COALESCE(g.is_required, 0) AS is_required,
                    COALESCE(g.min_selection, 0) AS min_selection,
                    COALESCE(g.max_selection, 1) AS max_selection,
                    COALESCE(g.sort_order, 0) AS sort_order,
                    COALESCE(g.scope, 'order') AS scope,
                    o.id AS option_id, o.name AS option_name, COALESCE(o.price, 0) AS option_price,
                    COALESCE(o.is_default, 0) AS is_default, o.out_of_stock_until AS option_out_of_stock_until,
                    COALESCE(o.sub_options_json, '[]') AS sub_options_json,
                    COALESCE(o.eligibility_rules_json, '[]') AS eligibility_rules_json
             FROM modifier_groups g
             LEFT JOIN modifier_options o ON o.group_id = g.id AND o.tenant_id = g.tenant_id
             WHERE g.tenant_id = ? AND g.scope = 'order'
             ORDER BY g.sort_order ASC, o.sort_order ASC`
          ).bind(tenantId)
        ]);
        if ([catsRes, itemsRes, customRes].some(result => !result || !result.success || !Array.isArray(result.results))) {
          throw new Error('Incomplete menu query');
        }
        categories = (catsRes.results as any[]) || [];
        items = (itemsRes.results as any[]) || [];
        rawCustomizations = (customRes.results as any[]) || [];
        orderModifierRows = (orderModRes && orderModRes.success && Array.isArray(orderModRes.results)) ? (orderModRes.results as any[]) : [];
        menuComplete = true;

        if (!isUnified) {
          try {
            const [bRes, rRes] = await env.DB.batch([
              env.DB.prepare(
                `SELECT parent_item_id, schema_version, config_json
                 FROM menu_bundle_rules
                 WHERE tenant_id = ? AND is_active = 1`
              ).bind(tenantId),
              env.DB.prepare(
                `SELECT customization_key, option_id, rule_type, min_order_subtotal, threshold_basis, error_message
                 FROM menu_customization_option_rules
                 WHERE tenant_id = ? AND is_active = 1`
              ).bind(tenantId)
            ]);
            if (!bRes || !bRes.success || !Array.isArray(bRes.results) || !rRes || !rRes.success || !Array.isArray(rRes.results)) {
              throw new Error('Incomplete bundle or custom rules query');
            }
            bundleRulesRows = (bRes.results as any[]) || [];
            customRulesRows = (rRes.results as any[]) || [];
          } catch (subRulesErr) {
            menuComplete = false;
            console.warn(`[Bootstrap] menu_bundle_rules or option_rules query failure for ${tenantId}:`, subRulesErr);
          }
        }

        try {
          const [modRes, catModRes] = await env.DB.batch([
            env.DB.prepare(
              `SELECT l.item_id, g.id AS group_id, g.name AS group_name, g.selection_type,
                      COALESCE(g.is_required, 0) AS is_required,
                      COALESCE(g.min_selection, 0) AS min_selection,
                      COALESCE(g.max_selection, 1) AS max_selection,
                      COALESCE(g.scope, 'item') AS scope,
                      o.id AS option_id, o.name AS option_name, COALESCE(o.price, 0) AS option_price,
                      COALESCE(o.is_default, 0) AS is_default, o.out_of_stock_until AS option_out_of_stock_until,
                      COALESCE(o.sub_options_json, '[]') AS sub_options_json,
                      COALESCE(o.eligibility_rules_json, '[]') AS eligibility_rules_json
               FROM item_modifier_links l
               JOIN modifier_groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
               LEFT JOIN modifier_options o ON o.group_id = g.id AND o.tenant_id = g.tenant_id
               WHERE l.tenant_id = ?
               ORDER BY l.sort_order ASC, g.sort_order ASC, o.sort_order ASC`
            ).bind(tenantId),
            env.DB.prepare(
              `SELECT l.category_id, g.id AS group_id, g.name AS group_name, g.selection_type,
                      COALESCE(g.is_required, 0) AS is_required,
                      COALESCE(g.min_selection, 0) AS min_selection,
                      COALESCE(g.max_selection, 1) AS max_selection,
                      COALESCE(g.scope, 'category') AS scope,
                      o.id AS option_id, o.name AS option_name, COALESCE(o.price, 0) AS option_price,
                      COALESCE(o.is_default, 0) AS is_default, o.out_of_stock_until AS option_out_of_stock_until,
                      COALESCE(o.sub_options_json, '[]') AS sub_options_json,
                      COALESCE(o.eligibility_rules_json, '[]') AS eligibility_rules_json
               FROM category_modifier_links l
               JOIN modifier_groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
               LEFT JOIN modifier_options o ON o.group_id = g.id AND o.tenant_id = g.tenant_id
               WHERE l.tenant_id = ?
               ORDER BY l.sort_order ASC, g.sort_order ASC, o.sort_order ASC`
            ).bind(tenantId)
          ]);
          if (!modRes || !modRes.success || !Array.isArray(modRes.results)) {
            throw new Error('Incomplete item modifiers query');
          }
          itemModifierRows = (modRes.results as any[]) || [];
          categoryModifierRows = (catModRes && catModRes.success && Array.isArray(catModRes.results)) ? (catModRes.results as any[]) : [];
        } catch (modErr) {
          menuComplete = false;
          console.warn(`[Bootstrap] item/category modifiers query failure for ${tenantId}:`, modErr);
        }
      } catch (dbErr) {
        menuComplete = false;
        console.error(`[Bootstrap] D1 Query error for ${tenantId}:`, dbErr);
      }
    } else {
      menuComplete = false;
    }

    const now = new Date();

    // Map customization option rules
    const customRulesMap = new Map<string, any>();
    for (const r of customRulesRows) {
      customRulesMap.set(`${r.customization_key}::${r.option_id}`, r);
    }

    const customizations: BootstrapResponse['customizations'] = [];

    if (orderModifierRows.length > 0 || unifiedMenuEnabled(env)) {
      // Primary: Pure Canonical New Schema for order-level customizations
      const orderGroupsMap = new Map<string, any>();
      for (const row of orderModifierRows) {
        if (!orderGroupsMap.has(row.group_id)) {
          orderGroupsMap.set(row.group_id, {
            id: row.group_id,
            key: row.group_id,
            scope: 'order',
            title: row.group_name,
            type: row.selection_type === 'multiple' ? 'checkbox' : 'radio',
            isRequired: Boolean(row.is_required),
            sortOrder: Number(row.sort_order || 0),
            options: []
          });
        }
        if (row.option_id) {
          const isOos = Boolean(
            row.option_out_of_stock_until && new Date(row.option_out_of_stock_until) > now
          );
          let subOptions: any[] = [];
          try { subOptions = JSON.parse(row.sub_options_json || '[]'); } catch { subOptions = []; }
          let eligibilityRules: any[] = [];
          try { eligibilityRules = JSON.parse(row.eligibility_rules_json || '[]'); } catch { eligibilityRules = []; }

          const minRule = eligibilityRules.find((r: any) => r.rule_type === 'min_order_subtotal' && Number(r.min_order_subtotal) > 0);
          const minSubtotal = minRule ? Number(minRule.min_order_subtotal) : undefined;

          orderGroupsMap.get(row.group_id)!.options.push({
            id: row.option_id,
            name: row.option_name,
            price: Number(row.option_price || 0),
            isDefault: Boolean(row.is_default),
            isOutOfStock: isOos,
            is_out_of_stock: isOos,
            minOrderSubtotal: minSubtotal,
            min_order_amount: minSubtotal,
            thresholdBasis: minRule?.threshold_basis,
            ruleErrorMessage: minRule?.error_message,
            subOptions: subOptions.length > 0 ? subOptions : undefined,
            sub_options: subOptions.length > 0 ? subOptions : undefined,
            eligibilityRules: eligibilityRules.length > 0 ? eligibilityRules : undefined
          });
        }
      }
      customizations.push(...Array.from(orderGroupsMap.values()));
    } else {
      // Legacy Fallback for unmigrated tenant environments
      for (const c of rawCustomizations) {
        try {
          const opts = typeof c.options_json === 'string' ? JSON.parse(c.options_json) : c.options_json;
          if (!Array.isArray(opts)) throw new Error('Invalid customization options');
          const enrichedOpts = opts.map((opt: any) => {
            const optId = opt.id || opt.name;
            const rule = customRulesMap.get(`${c.key}::${optId}`) || customRulesMap.get(`${c.key}::${opt.name}`);
            const minSubtotal = rule ? rule.min_order_subtotal : (opt.min_order_amount || 0);
            const isOos = Boolean(
              opt.is_out_of_stock ||
              opt.isOutOfStock ||
              (opt.out_of_stock_until && new Date(opt.out_of_stock_until) > now)
            );

            return {
              ...opt,
              id: optId,
              isOutOfStock: isOos,
              is_out_of_stock: isOos,
              minOrderSubtotal: minSubtotal > 0 ? minSubtotal : undefined,
              min_order_amount: minSubtotal > 0 ? minSubtotal : (opt.min_order_amount || undefined),
              thresholdBasis: rule?.threshold_basis,
              ruleErrorMessage: rule?.error_message
            };
          });

          customizations.push({
            id: c.id,
            key: c.key,
            scope: c.scope || 'order',
            title: c.title,
            type: c.type || 'radio',
            isRequired: Boolean(c.is_required),
            sortOrder: c.sort_order || 0,
            options: enrichedOpts
          });
        } catch (e) {
          menuComplete = false;
          console.error(`[Bootstrap] Failed to parse options_json for ${c.id}:`, e);
        }
      }
    }

    // Build Item Modifier Groups Map before resolving bundle rules so eligible child items get modifier groups
    const itemModifierGroupsMap = new Map<string, any[]>();
    for (const row of itemModifierRows) {
      if (!itemModifierGroupsMap.has(row.item_id)) {
        itemModifierGroupsMap.set(row.item_id, []);
      }
      const groupList = itemModifierGroupsMap.get(row.item_id)!;
      let grp = groupList.find((g: any) => g.id === row.group_id);
      if (!grp) {
        grp = {
          id: row.group_id,
          name: row.group_name,
          selectionType: row.selection_type || 'single',
          isRequired: Boolean(row.is_required),
          minSelection: Number(row.min_selection ?? 0),
          maxSelection: Number(row.max_selection ?? 1),
          options: []
        };
        groupList.push(grp);
      }
      if (row.option_id) {
        const isOptOos = Boolean(row.option_out_of_stock_until && new Date(row.option_out_of_stock_until) > now);
        let subOptions: any[] = [];
        try { subOptions = JSON.parse(row.sub_options_json || '[]'); } catch { subOptions = []; }
        let eligibilityRules: any[] = [];
        try { eligibilityRules = JSON.parse(row.eligibility_rules_json || '[]'); } catch { eligibilityRules = []; }
        const minRule = eligibilityRules.find((r: any) => r.rule_type === 'min_order_subtotal' && Number(r.min_order_subtotal) > 0);

        grp.options.push({
          id: row.option_id,
          name: row.option_name,
          price: Number(row.option_price || 0),
          isDefault: Boolean(row.is_default),
          isOutOfStock: isOptOos,
          subOptions: subOptions.length > 0 ? subOptions : undefined,
          eligibilityRules: eligibilityRules.length > 0 ? eligibilityRules : undefined,
          minOrderSubtotal: minRule ? Number(minRule.min_order_subtotal) : undefined,
          ruleErrorMessage: minRule?.error_message
        });
      }
    }

    // Build Category Modifier Groups Map for Category-Level soft inheritance (Tier 3)
    const categoryModifierGroupsMap = new Map<string, any[]>();
    for (const row of categoryModifierRows) {
      if (!categoryModifierGroupsMap.has(row.category_id)) {
        categoryModifierGroupsMap.set(row.category_id, []);
      }
      const groupList = categoryModifierGroupsMap.get(row.category_id)!;
      let grp = groupList.find((g: any) => g.id === row.group_id);
      if (!grp) {
        grp = {
          id: row.group_id,
          name: row.group_name,
          selectionType: row.selection_type || 'single',
          isRequired: Boolean(row.is_required),
          minSelection: Number(row.min_selection ?? 0),
          maxSelection: Number(row.max_selection ?? 1),
          scope: row.scope || 'category',
          options: []
        };
        groupList.push(grp);
      }
      if (row.option_id) {
        const isOptOos = Boolean(row.option_out_of_stock_until && new Date(row.option_out_of_stock_until) > now);
        let subOptions: any[] = [];
        try { subOptions = JSON.parse(row.sub_options_json || '[]'); } catch { subOptions = []; }
        let eligibilityRules: any[] = [];
        try { eligibilityRules = JSON.parse(row.eligibility_rules_json || '[]'); } catch { eligibilityRules = []; }
        const minRule = eligibilityRules.find((r: any) => r.rule_type === 'min_order_subtotal' && Number(r.min_order_subtotal) > 0);

        grp.options.push({
          id: row.option_id,
          name: row.option_name,
          price: Number(row.option_price || 0),
          isDefault: Boolean(row.is_default),
          isOutOfStock: isOptOos,
          subOptions: subOptions.length > 0 ? subOptions : undefined,
          eligibilityRules: eligibilityRules.length > 0 ? eligibilityRules : undefined,
          minOrderSubtotal: minRule ? Number(minRule.min_order_subtotal) : undefined,
          ruleErrorMessage: minRule?.error_message
        });
      }
    }

    // Resolve bundle rules and populate eligibleItems
    const bundleRulesByItemId = new Map<string, BootstrapBundleRule>();
    for (const row of bundleRulesRows) {
      try {
        const parsed = typeof row.config_json === 'string' ? JSON.parse(row.config_json) : row.config_json;
        if (!parsed || !Array.isArray(parsed.groups)) {
          menuComplete = false;
          continue;
        }

        const resolvedGroups: BootstrapBundleGroup[] = parsed.groups.map((group: any) => {
          const eligibleItems: any[] = [];
          const seenItemIds = new Set<string>();

          const addEligible = (it: any) => {
            if (!it || seenItemIds.has(it.id) || it.id === row.parent_item_id || bundleRulesRows.some((rule: any) => rule.parent_item_id === it.id)) return;
            seenItemIds.add(it.id);
            const cat = categories.find((category: any) => category.id === it.category_id);
            let appliedModifiers: string[] = [];
            if (cat?.allow_customization) {
              try { appliedModifiers = JSON.parse(cat.applied_modifiers || '[]'); }
              catch { appliedModifiers = String(cat.applied_modifiers || '').split(',').map((s: string) => s.trim()).filter(Boolean); }
            }
            const modGroups = itemModifierGroupsMap.get(it.id) || [];
            eligibleItems.push({
              id: it.id,
              name: it.name,
              price: it.price,
              surcharge: Number(group.type === 'fixed' ? (group.items || []).find((x: any) => x.itemId === it.id)?.surcharge || 0 : group.surcharges?.[it.id] || 0),
              isOutOfStock: Boolean(it.out_of_stock_until && new Date(it.out_of_stock_until) > now),
              categoryId: it.category_id,
              allowCustomization: appliedModifiers.length > 0 || modGroups.length > 0,
              appliedModifiers,
              modifierGroups: modGroups.length > 0 ? modGroups : undefined
            });
          };

          if (group.type === 'fixed') {
            for (const fixedItem of group.items || []) addEligible(items.find((it: any) => it.id === fixedItem.itemId));
          }

          if (Array.isArray(group.sources)) {
            for (const src of group.sources) {
              const targetCatId = src.refId || src.categoryId;
              if (src.type === 'category' && targetCatId) {
                const catItems = items.filter(it => it.category_id === targetCatId);
                for (const it of catItems) {
                  addEligible(it);
                }
              } else if (src.type === 'item_list' && Array.isArray(src.itemIds)) {
                for (const itemId of src.itemIds) {
                  const it = items.find(i => i.id === itemId);
                  addEligible(it);
                }
              }
            }
          }

          const groupName = (typeof group.label === 'object' ? (group.label[locale] || group.label['zh-TW'] || group.label['vi']) : group.label) || group.name || `任選 ${group.minQuantity} 樣菜`;
          const allowRepeats = group.allowRepeats !== undefined ? Boolean(group.allowRepeats) : (group.allowRepeat !== undefined ? Boolean(group.allowRepeat) : true);

          return {
            id: group.id,
            type: group.type || 'choice',
            items: group.items || [],
            surcharges: group.surcharges || {},
            name: groupName,
            label: group.label || groupName,
            minQuantity: group.minQuantity ?? 1,
            maxQuantity: group.maxQuantity ?? 1,
            allowRepeats: allowRepeats,
            sources: group.sources || [],
            eligibleItems: eligibleItems
          };
        });

        bundleRulesByItemId.set(row.parent_item_id, {
          version: parsed.version || 1,
          groups: resolvedGroups
        });
      } catch (e) {
        menuComplete = false;
        console.error(`[Bootstrap] Failed to parse bundle rule for ${row.parent_item_id}:`, e);
      }
    }

    // Load image_list to accurately attach imageUrl only to items with uploaded image
    let imageList: string[] = [];
    let imageListLoaded = false;
    if (env.ORDER_STATE) {
      const listKey = `tenant:${tenantId}:image_list`;
      let listRaw = await env.ORDER_STATE.get(listKey);
      if (!listRaw && tenantId === "benmi") {
        listRaw = await env.ORDER_STATE.get("image_list");
      }
      if (listRaw) {
        try {
          const parsed = JSON.parse(listRaw);
          if (Array.isArray(parsed)) {
            imageList = parsed;
            imageListLoaded = true;
          }
        } catch (e) { }
      }
    }

    // 4. Organize Items by Category
    const itemsByCatId = new Map<string, any[]>();
    for (const item of items) {
      if (!itemsByCatId.has(item.category_id)) {
        itemsByCatId.set(item.category_id, []);
      }
      const isOos = Boolean(item.out_of_stock_until && new Date(item.out_of_stock_until) > now);
      const isRec = Boolean(item.is_recommended);
      const badge = (item.badge_text && item.badge_text.trim()) ? item.badge_text.trim() : null;

      const hasImage = imageList.includes(item.name) ||
                       imageList.some(k => k.endsWith(`_${item.name}`) || (k.includes('_') && k.split('_').slice(1).join('_') === item.name));
      const imageUrl = hasImage ? `/api/image?tenant_id=${tenantId}&name=${encodeURIComponent(item.name)}` : null;
      const bundleRule = bundleRulesByItemId.get(item.id) || null;
      const modGroups = itemModifierGroupsMap.get(item.id) || [];

      itemsByCatId.get(item.category_id)!.push({
        id: item.id,
        name: item.name,
        price: item.price,
        description: item.description || null,
        imageUrl: imageUrl,
        isOutOfStock: isOos,
        isRecommended: isRec,
        badgeText: badge,
        badge: badge,
        bundleRule: bundleRule,
        maxPerOrder: item.max_per_order !== null && item.max_per_order !== undefined && item.max_per_order > 0 ? Number(item.max_per_order) : null,
        itemType: item.item_type || 'standard',
        modifierGroups: modGroups.length > 0 ? modGroups : undefined,
        outOfStockUntil: item.out_of_stock_until || null,
        sortOrder: item.sort_order || 0
      });
    }

    // 5. Separate Catalog vs Modifiers
    const catalog: BootstrapResponse['catalog'] = [];
    const modifiers: BootstrapResponse['modifiers'] = [];
    let customizationSortOrder: number | undefined;
    let customizationCategoryId: string | null = null;
    let customizationTitle: string | null = null;
    let customizationShortName: string | null = null;

    for (const cat of categories) {
      if (cat.slug === 'sec-flavor' || cat.slug === 'flavor' || cat.category_type === 'order_customization') {
        customizationSortOrder = cat.sort_order || 0;
        customizationCategoryId = cat.id;
        customizationTitle = cat.name || null;
        customizationShortName = cat.short_name || null;
        continue;
      }
      const catType = cat.category_type || (cat.slug === 'topping' ? 'modifier' : 'catalog');
      // A bundle pool only supplies eligible choices for a bundle rule. It is
      // intentionally hidden from standalone catalog and modifier rendering.
      if (catType === 'bundle_pool') continue;
      const catItems = itemsByCatId.get(cat.id) || [];

      if (catType === 'modifier') {
        modifiers.push({
          id: cat.id,
          slug: cat.slug,
          name: cat.name,
          selectionType: (cat.slug === 'topping' ? 'multiple' : (cat.selection_type || 'single')),
          isRequired: Boolean(cat.is_required),
          minSelection: cat.min_selection || 0,
          maxSelection: cat.max_selection || 1,
          sortOrder: cat.sort_order || 0,
          options: catItems.map((opt, idx) => ({
            id: opt.id,
            name: opt.name,
            price: opt.price,
            isDefault: idx === 0 && Boolean(cat.is_required),
            isOutOfStock: opt.isOutOfStock,
            outOfStockUntil: opt.outOfStockUntil || null
          }))
        });
      } else {
        // Catalog Category
        let appliedModifiers: string[] = ['*'];
        if (cat.allow_customization === 0) {
          appliedModifiers = [];
        } else if (cat.applied_modifiers && cat.applied_modifiers.trim() !== '') {
          try {
            appliedModifiers = JSON.parse(cat.applied_modifiers);
          } catch {
            appliedModifiers = cat.applied_modifiers.split(',').map((s: string) => s.trim()).filter(Boolean);
          }
        }

        let pricingRules: any = null;
        if (cat.pricing_rules && String(cat.pricing_rules).trim() !== '') {
          try {
            pricingRules = JSON.parse(cat.pricing_rules);
          } catch (e) {
            console.error(`[Bootstrap] Failed to parse pricing_rules for ${cat.id}:`, e);
          }
        }

        const catModGroups = categoryModifierGroupsMap.get(cat.id) || [];
        const isCustomizationAllowed = Boolean(cat.allow_customization ?? 1) && (appliedModifiers.length > 0 || catModGroups.length > 0);

        catalog.push({
          id: cat.id,
          slug: cat.slug,
          name: cat.name,
          shortName: cat.short_name || null,
          allowCustomization: isCustomizationAllowed,
          appliedModifiers: appliedModifiers,
          modifierGroups: catModGroups,
          pricingRules: pricingRules,
          sortOrder: cat.sort_order || 0,
          items: catItems
        });
      }
    }

    const payload: BootstrapResponse = {
      bootstrapVersion: BOOTSTRAP_VERSION,
      menuComplete,
      customizationCategoryId,
      tenant: {
        id: tenantId,
        brandName,
        brandSubtitle,
        brandColor,
        brandColorDark: brandColorDark || '#047857',
        logoUrl,
        storeAddress,
        announcement: tenantCtx?.announcement || null,
        operatingHours,
        parsedHours: parseOperatingHours(operatingHours, tenantId),
        formattedHours: formatOperatingHoursForDisplay(operatingHours, locale, tenantId),
        deliveryPolicy,
        allowScheduledPickup: tenantCtx?.allowScheduledPickup !== undefined ? tenantCtx.allowScheduledPickup : true,
        allowDineIn: tenantCtx?.allowDineIn !== undefined ? tenantCtx.allowDineIn : true,
        features: tenantCtx?.features || [],
        orderPrefix: tenantCtx?.orderPrefix || (tenantId === 'benmi' ? 'B' : tenantId.charAt(0).toUpperCase()),
        storeStatus: tenantCtx?.storeStatus || 'open',
        liffId,
        liffUrl,
        locale
      },
      catalog,
      modifiers,
      customizations: customizations.length > 0 ? customizations : undefined,
      customizationSortOrder,
      customizationTitle,
      customizationShortName,
      categoryModifierLinks: Array.from(categoryModifierGroupsMap.entries()).flatMap(([catId, groups]) =>
        groups.map((g, idx) => ({ categoryId: catId, groupId: g.id, sortOrder: idx }))
      ),
      translations: tenantId === 'benmi' ? BENMI_TRANSLATIONS : undefined,
      recommended: items.filter(it => it.is_recommended || it.badge_text).map(it => it.name)
    };

    if (unifiedMenuEnabled(env)) {
      const options = await loadOptionCatalog(env, tenantId);
      payload.optionDisplayNames = Object.fromEntries([
        ...modifiers.flatMap(m => (m.options || []).filter((o: any) => o?.id && o?.name).map((o: any) => [o.id, o.name])),
        ...options.products.map(p => [p.id, p.name]),
        ...options.groups.flatMap(g => groupOptions(options, g).map(o => [o.id, o.name]))
      ]);
      // Legacy categories/items remain in D1 for rollback and historical orders.
      // Never expose them as a second configuration authority in unified mode:
      // older LIFF scripts can otherwise resurrect groups deleted through POS.
      payload.modifiers = [];
      payload.categoryModifierLinks = [];
      for (const category of catalog) {
        category.appliedModifiers = [];
        category.modifierGroups = [];
        category.allowCustomization = false;
      }
      for (const category of catalog) for (const item of category.items) {
        const product = options.products.find(p=>p.id===item.id);
        (item as any).imageKey = product?.image_key;
        if (product?.image_key !== null && product?.image_key !== undefined) {
          item.imageUrl = product.image_key && (!imageListLoaded || imageList.includes(product.image_key))
            ? `/api/image?tenant_id=${encodeURIComponent(tenantId)}&name=${encodeURIComponent(product.image_key)}`
            : null;
        }
        (item as any).modifierGroups = [];
        (item as any).unifiedOptions = true;
        (item as any).bundleRule = projectOptionRule(options, item.id!);
      }
      for (const customization of customizations) {
        const group=options.groups.find(g=>g.scope==='order' && g.id===customization.id);
        if(group) customization.options=groupOptions(options,group).map(o=>({...o,is_out_of_stock:o.isOutOfStock,sub_options:o.subOptions,minOrderSubtotal:o.eligibilityRules.find(r=>r.rule_type==='min_order_subtotal')?.min_order_subtotal}));
      }
      (payload as any).unifiedMenu = true;
    }
    (payload as any).orderDetailVersion = detailWrites(env) ? 1 : 0;
    // 6. Cache in KV Edge Cache
    if (menuComplete && env.ORDER_STATE) {
      try {
        await env.ORDER_STATE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 3600 });
      } catch (kvErr) {
        console.error(`[Bootstrap] KV put error for ${tenantId}:`, kvErr);
      }
    }

    return json(payload, 200, {
      "X-Cache": "MISS",
      "Cache-Control": "no-cache, must-revalidate"
    });

  } catch (err: any) {
    console.error(`[Bootstrap] Failed to bootstrap tenant ${tenantId}:`, err);
    return json({ error: err.message || 'Internal Server Error' }, 500);
  }
}

export async function invalidateBootstrapCache(tenantId: string, env: Env): Promise<void> {
  if (env.ORDER_STATE) {
    try {
      await Promise.all([
        env.ORDER_STATE.delete(`tenant:${tenantId}:bootstrap`),
        env.ORDER_STATE.delete(`tenant:${tenantId}:bootstrap:v2`),
        env.ORDER_STATE.delete(`tenant:${tenantId}:config_cache`)
      ]);
      console.log(`[Bootstrap] Invalidated KV cache and config_cache for tenant ${tenantId}`);
    } catch (e) {
      console.error(`[Bootstrap] Failed to invalidate cache for ${tenantId}:`, e);
    }
  }
}
