import type { Env } from '../types/env';
import type { OptionCatalog } from './option-groups';
import type { DetailRound } from '../types/order-detail';
import { DetailError } from './order-detail';

export function pricingRustEnabled(env: Env, tenantId: string, features?: string[]): boolean {
  if (!env.PRICING_ENGINE) return false;
  if (features && Array.isArray(features) && features.includes('rust_pricing')) return true;
  if ((env.PRICING_RUST_ENABLED as string) === 'true') return true;
  try {
    const tenants: unknown = JSON.parse(env.PRICING_RUST_TENANTS || '[]');
    return Array.isArray(tenants) && tenants.every(t => typeof t === 'string') && tenants.includes(tenantId);
  } catch {
    return false;
  }
}

export async function callRustBuildDetailRound(
  env: Env,
  catalog: OptionCatalog,
  input: any,
  roundNumber: number,
  previous?: DetailRound
): Promise<DetailRound> {
  if (!env.PRICING_ENGINE) throw new Error('PRICING_ENGINE_UNAVAILABLE');

  const reqBody = {
    catalog,
    input,
    roundNumber,
    previousRound: previous || null,
    nowMs: Date.now(),
  };

  const res = await env.PRICING_ENGINE.fetch('http://pricing-engine/internal/v1/build-detail-round', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  });

  const data: any = await res.json();
  if (!res.ok || !data.success) {
    const code = data.code || data.error || 'ORDER_VALIDATION_FAILED';
    throw new DetailError(code, res.status);
  }

  return data.round;
}

export async function callRustValidateUnifiedItems(
  env: Env,
  catalog: OptionCatalog,
  items: any[]
): Promise<{ valid: boolean; legacy: any[]; items?: any[]; code?: string; error?: string; itemIndex?: number; expectedSubtotal?: number }> {
  if (!env.PRICING_ENGINE) throw new Error('PRICING_ENGINE_UNAVAILABLE');

  const reqBody = {
    catalog,
    items,
    nowMs: Date.now(),
  };

  const res = await env.PRICING_ENGINE.fetch('http://pricing-engine/internal/v1/validate-unified-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  });

  if (!res.ok) {
    const data: any = await res.json().catch(() => ({}));
    return {
      valid: false,
      code: data.code || 'OPTION_INVALID',
      error: data.error || '餐點選項已更新，請重新確認',
      legacy: [],
    };
  }

  return res.json();
}

export async function callRustValidateCatalogGraph(
  env: Env,
  catalog: OptionCatalog,
  projectProductIds?: string[]
): Promise<{ valid: boolean; code?: string; projectedRules?: Record<string, any> }> {
  if (!env.PRICING_ENGINE) throw new Error('PRICING_ENGINE_UNAVAILABLE');

  const reqBody = {
    catalog,
    nowMs: Date.now(),
    projectProductIds,
  };

  const res = await env.PRICING_ENGINE.fetch('http://pricing-engine/internal/v1/validate-catalog-graph', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  });

  const data: any = await res.json();
  if (!res.ok || !data.valid) {
    return { valid: false, code: data.code || 'GRAPH_VALIDATION_FAILED' };
  }

  return { valid: true, projectedRules: data.projectedRules };
}
