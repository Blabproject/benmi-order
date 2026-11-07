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
  // Branding
  brandName: string;
  brandSubtitle?: string | null;
  brandColor: string;
  logoUrl?: string | null;
  storeAddress: string | null;
  announcement?: string | null;
  // Business Config
  operatingHours: string | null;
  deliveryPolicy: string | null;
  allowScheduledPickup?: boolean;
  allowDineIn?: boolean;
  storeStatus?: 'open' | 'busy' | 'paused';
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
