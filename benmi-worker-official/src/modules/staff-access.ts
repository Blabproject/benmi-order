import type { Env } from '../types/env';

export const STAFF_CAPABILITIES = ['session', 'tables_read', 'tables_write', 'orders_read', 'create', 'append', 'status', 'pos_entry', 'auto_print_new', 'auto_print_round'] as const;
export type StaffCapability = typeof STAFF_CAPABILITIES[number];
export async function staffAccess(env: Env, tenant: string) {
  const closed = Object.fromEntries(STAFF_CAPABILITIES.map(key => [key, false])) as Record<StaffCapability, boolean>;
  try {
    const row = await env.DB.prepare('SELECT staff_ordering_enabled,staff_ordering_capabilities,is_active FROM tenant_config WHERE tenant_id=?')
      .bind(tenant).first<{ staff_ordering_enabled: number; staff_ordering_capabilities: string; is_active: number }>();
    // The runtime must never accept writes before its transaction guards are installed.
    const ready = await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_orders_active_staff_table'").first();
    const values = JSON.parse(row?.staff_ordering_capabilities || '{}');
    const enabled = !!ready && row?.staff_ordering_enabled === 1 && row?.is_active === 1;
    return { enabled, capabilities: Object.fromEntries(STAFF_CAPABILITIES.map(key => [key, enabled && values?.[key] === true])) as Record<StaffCapability, boolean> };
  } catch { return { enabled: false, capabilities: closed }; }
}
