import type { AISettings } from '../modules/ai-settings';

export interface QuickReply {
  triggers: string[];
  reply: string;
}

export interface TenantContext {
  tenantId: string;
  // LINE Integration
  lineChannelToken: string;
  lineChannelSecret: string | null;
  lineRuntime?: { connectionId: string; environment: string; revision: number; botUserId: string };
  liffId: string;
  liffUrl: string;
  // AI Integration
  groqApiKey: string | null;
  groqModel: string;
  openrouterApiKey: string | null;
  openrouterModel: string;
  aiOrderRedirectEnabled: boolean;
  aiSettings?: AISettings;
  // Branding
  brandName: string;
  brandSubtitle?: string | null;
  brandColor: string;
  logoUrl?: string | null;
  storeAddress: string | null;
  announcement?: string | null;
  storeNotice?: StoreNotice | null;
  // Business Config
  operatingHours: string | null;
  deliveryPolicy: string | null;
  allowScheduledPickup?: boolean;
  allowDineIn?: boolean;
  storeStatus?: 'open' | 'busy' | 'paused' | 'closed';
  autoOpenBeforeMinutes?: number | null;
  prepTimeMinutes?: number | null;
  paymentMethods?: string[];
  quickReplies: QuickReply[];
  defaultPassword: string;
  locale: string;
  // Google Sheets
  googleSheetsUrl: string | null;
  // Subscription & Packaging Features
  features: string[];
  orderPrefix?: string | null;
  // Metadata & Marketplace Discovery
  latitude?: number | null;
  longitude?: number | null;
  cuisineType?: string | null;
  isMarketplaceVisible?: boolean;
}

/** Popup notice shown on the customer ordering page. `version` changes only when content changes. */
export interface StoreNotice {
  enabled: boolean;
  title: string;
  body: string;
  version: string;
}

export const STORE_NOTICE_TITLE_MAX = 80;
export const STORE_NOTICE_BODY_MAX = 2000;

export function parseStoreNotice(raw: unknown): StoreNotice | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    const title = typeof v.title === 'string' ? v.title : '';
    const body = typeof v.body === 'string' ? v.body : '';
    if (!title.trim() && !body.trim()) return null;
    return { enabled: v.enabled !== false, title, body, version: typeof v.version === 'string' ? v.version : '' };
  } catch {
    return null;
  }
}

export const ORDER_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateBase32Suffix(length: number = 4): string {
  let suffix = "";
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * ORDER_ID_ALPHABET.length);
    suffix += ORDER_ID_ALPHABET[idx];
  }
  return suffix;
}

export function resolveTenantOrderPrefix(ctx: TenantContext | null | undefined, tenantId: string): string {
  if (ctx?.orderPrefix && ctx.orderPrefix.trim().length > 0) {
    return ctx.orderPrefix.trim().toUpperCase();
  }
  return tenantId.charAt(0).toUpperCase() || 'O';
}

export function generateStandardOrderId(diningOption: string = 'takeaway', dateObj: Date = new Date(), seqNumber?: number, prefix: string = ''): string {
  // Taiwan time UTC+8
  const nowTaiwan = new Date(dateObj.getTime() + 8 * 3600000);
  const mm = String(nowTaiwan.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nowTaiwan.getUTCDate()).padStart(2, "0");
  const typePrefix = diningOption === 'dine_in' ? 'D' : 'T';
  const seqStr = seqNumber !== undefined ? String(seqNumber).padStart(3, "0") : generateBase32Suffix(3);
  return `${prefix}${mm}${dd}-${typePrefix}${seqStr}`;
}

export function tenantHasFeature(ctx: TenantContext | null | undefined, featureKey: string): boolean {
  if (!ctx) return false;
  if (featureKey === 'dine_in') {
    if (ctx.allowDineIn === false) return false;
    if (Array.isArray(ctx.features) && ctx.features.includes('dine_in')) return true;
    return ctx.allowDineIn === true || ctx.allowDineIn === undefined;
  }
  if (!Array.isArray(ctx.features)) return false;
  return ctx.features.includes(featureKey);
}

export function getTaiwanDateStr(dateObj: Date = new Date()): string {
  const nowTaiwan = new Date(dateObj.getTime() + 8 * 3600000);
  const yyyy = nowTaiwan.getUTCFullYear();
  const mm = String(nowTaiwan.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nowTaiwan.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function isStoreClosedExpired(
  closedDate: string,
  nowTime: Date = new Date(),
  operatingHours?: unknown,
  autoOpenBeforeMinutes: number = 60
): boolean {
  if (!closedDate) return true;
  const match = closedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return true;
  const cYear = parseInt(match[1], 10);
  const cMonth = parseInt(match[2], 10);
  const cDay = parseInt(match[3], 10);

  const parsedHours: Record<string | number, Array<{ start?: string; end?: string }>> = (() => {
    if (!operatingHours) return {};
    if (typeof operatingHours === 'string') {
      try {
        return JSON.parse(operatingHours);
      } catch {
        return {};
      }
    }
    if (typeof operatingHours === 'object') {
      return operatingHours as any;
    }
    return {};
  })();

  const leadMinutes = typeof autoOpenBeforeMinutes === 'number' && !isNaN(autoOpenBeforeMinutes) && autoOpenBeforeMinutes >= 0
    ? autoOpenBeforeMinutes
    : 60;

  // Search forward for the first operating day strictly after closedDate (1 to 7 days ahead)
  let foundShift: { candYear: number; candMonth: number; candDay: number; start: string } | null = null;
  for (let offset = 1; offset <= 7; offset++) {
    const candDateUtc = new Date(Date.UTC(cYear, cMonth - 1, cDay + offset));
    const dayOfWeek = candDateUtc.getUTCDay();
    const shifts = parsedHours[dayOfWeek] || parsedHours[String(dayOfWeek)];
    if (Array.isArray(shifts) && shifts.length > 0 && shifts[0]?.start) {
      foundShift = {
        candYear: candDateUtc.getUTCFullYear(),
        candMonth: candDateUtc.getUTCMonth() + 1,
        candDay: candDateUtc.getUTCDate(),
        start: shifts[0].start
      };
      break;
    }
  }

  const nowMs = nowTime.getTime();

  if (foundShift) {
    const [sH, sM] = foundShift.start.split(':').map(Number);
    const validH = isNaN(sH) ? 11 : sH;
    const validM = isNaN(sM) ? 0 : sM;
    // Taiwan is UTC+8, so UTC hour = validH - 8
    const shiftStartUtcMs = Date.UTC(foundShift.candYear, foundShift.candMonth - 1, foundShift.candDay, validH - 8, validM, 0);
    const reopenUtcMs = shiftStartUtcMs - (leadMinutes * 60 * 1000);
    return nowMs >= reopenUtcMs;
  }

  // If no configured shifts found, check default weekday (11:00) / weekend (09:00) on the day after closedDate
  const nextDayUtc = new Date(Date.UTC(cYear, cMonth - 1, cDay + 1));
  const nextDayOfWeek = nextDayUtc.getUTCDay();
  const defaultHour = (nextDayOfWeek === 0 || nextDayOfWeek === 6) ? 9 : 11;
  const defaultShiftUtcMs = Date.UTC(nextDayUtc.getUTCFullYear(), nextDayUtc.getUTCMonth(), nextDayUtc.getUTCDate(), defaultHour - 8, 0, 0);
  const defaultReopenUtcMs = defaultShiftUtcMs - (leadMinutes * 60 * 1000);

  if (nowMs >= defaultReopenUtcMs) {
    return true;
  }

  const todayTw = getTaiwanDateStr(nowTime);
  const daysDiff = (Date.UTC(parseInt(todayTw.slice(0, 4), 10), parseInt(todayTw.slice(5, 7), 10) - 1, parseInt(todayTw.slice(8, 10), 10)) -
    Date.UTC(cYear, cMonth - 1, cDay)) / 86400000;
  return daysDiff > 7;
}

export function normalizeStoreStatus(
  value: unknown,
  nowTime: Date = new Date(),
  operatingHours?: unknown,
  autoOpenBeforeMinutes: number = 60
): 'open' | 'busy' | 'paused' | 'closed' {
  if (typeof value !== 'string') return 'open';
  const trimmed = value.trim();
  if (trimmed === 'busy') return 'busy';
  if (trimmed === 'paused') return 'paused';
  if (trimmed === 'closed') return 'closed';
  if (trimmed.startsWith('closed:')) {
    const closedDate = trimmed.slice(7).trim();
    if (isStoreClosedExpired(closedDate, nowTime, operatingHours, autoOpenBeforeMinutes)) {
      return 'open';
    }
    return 'closed';
  }
  return 'open';
}
