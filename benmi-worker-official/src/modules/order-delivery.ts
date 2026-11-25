import type { Env } from '../types/env';
import type { TenantContext } from '../types/tenant';
import { json } from '../utils/http';

export interface DeliveryDetails {
  recipient: string;
  phone: string;
  address: string;
  taxId?: string;
}

export function parseDeliveryDetails(value: unknown): DeliveryDetails | null {
  if (!value || typeof value !== 'object') return null;
  const fields = value as Record<string, unknown>;
  const recipient = typeof fields.recipient === 'string' ? fields.recipient.trim() : '';
  const phone = typeof fields.phone === 'string' ? fields.phone.trim() : '';
  const address = typeof fields.address === 'string' ? fields.address.trim() : '';
  const taxId = typeof fields.taxId === 'string' ? fields.taxId.trim() : '';
  if (!recipient || recipient.length > 100 || !address || address.length > 300 ||
      phone.length > 32 || !/^[+() .0-9-]+$/.test(phone) || !/^\d{7,20}$/.test(phone.replace(/\D/g, '')) ||
      (fields.taxId != null && typeof fields.taxId !== 'string') || taxId.length > 32) return null;
  return { recipient, phone, address, ...(taxId ? { taxId } : {}) };
}

export function deliveryDetailsStatement(db: D1Database, tenantId: string, key: string, details: DeliveryDetails) {
  return db.prepare("UPDATE orders SET delivery_details_json=? WHERE tenant_id=? AND key=? AND dining_option='delivery'")
    .bind(JSON.stringify(details), tenantId, key);
}

export async function getOrderDeliveryDetails(request: Request, env: Env, tenant: TenantContext | null) {
  const headers = { 'Cache-Control': 'no-store' };
  const key = new URL(request.url).searchParams.get('key')?.trim();
  if (!env.DB || !tenant || !key) return json({ error: 'DELIVERY_DETAILS_NOT_FOUND' }, 404, headers);
  const row = await env.DB.prepare(
    "SELECT delivery_details_json FROM orders WHERE tenant_id=? AND key=? AND dining_option='delivery'"
  ).bind(tenant.tenantId, key).first<{ delivery_details_json: string | null }>();
  const details = row?.delivery_details_json ? parseDeliveryDetails(JSON.parse(row.delivery_details_json)) : null;
  return details ? json({ details }, 200, headers) : json({ error: 'DELIVERY_DETAILS_NOT_FOUND' }, 404, headers);
}
