import type { TenantContext } from '../types/tenant';

/** Conversational automation only; order receipts and explicit button actions are transactional. */
export const AI_SETTING_KEYS = [
  'enabled', 'address', 'hours', 'delivery', 'customReplies',
  'orderRedirect', 'orderStatus', 'pendingOrderReplies'
] as const;
export type AISettingKey = typeof AI_SETTING_KEYS[number];
export type AISettings = Record<AISettingKey, boolean>;

export function parseAISettings(raw: unknown, legacyRedirect: unknown = undefined): AISettings {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  const data = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const settings = Object.fromEntries(AI_SETTING_KEYS.map(key => [key, data[key] !== false])) as AISettings;
  // The existing admin switch remains authoritative and can also be changed from POS.
  if (legacyRedirect === false || legacyRedirect === 0) settings.orderRedirect = false;
  if (legacyRedirect === true || legacyRedirect === 1) settings.orderRedirect = true;
  return settings;
}

export function validAISettingsPatch(value: unknown): value is Partial<AISettings> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length > 0
    && Object.entries(value).every(([key, val]) => AI_SETTING_KEYS.includes(key as AISettingKey) && typeof val === 'boolean');
}

export function aiReplyEnabled(ctx: TenantContext | null | undefined, key: Exclude<AISettingKey, 'enabled'>): boolean {
  const settings = parseAISettings(ctx?.aiSettings, ctx?.aiOrderRedirectEnabled);
  return settings.enabled && settings[key];
}
