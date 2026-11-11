import { translatePos, type PosLocale, type PosTranslationKey } from '../i18n/pos-dictionary';
import type { HistoryOrderDto } from './api';
import {
  extractOrderTableNumber,
  formatOrderSubmissionTime,
  formatPickupTimeDisplay,
  isOrderDineIn
} from './history-model';

export type OrderStatusTone = 'paid' | 'picked' | 'rejected' | 'neutral';

export interface OrderStatusBadgeModel {
  tone: OrderStatusTone;
  label: string;
}

export interface OrderPaymentBadgeModel {
  label: string;
  isUnrefundedWarning: boolean;
}

export interface OrderDiningBadgeModel {
  isDineIn: boolean;
  label: string;
  tableNumber: string;
  roundCount: number;
  isModified: boolean;
}

const UNREFUNDED_ORDER_STATUSES = new Set(['CANCELLED', 'REJECTED', 'FORCE_REJECT', 'EXPIRED']);

const PAYMENT_STATUS_KEYS: Record<string, PosTranslationKey> = {
  REQUESTING: 'paymentREQUESTING',
  PENDING: 'paymentPENDING',
  CONFIRMING: 'paymentCONFIRMING',
  UNKNOWN: 'paymentUNKNOWN',
  PAID: 'paymentPAID',
  CANCELLED: 'paymentCANCELLED',
  FAILED: 'paymentFAILED',
  REFUND_PENDING: 'paymentREFUND_PENDING',
  REFUNDED: 'paymentREFUNDED',
  REFUND_FAILED: 'paymentREFUND_FAILED'
};

/** Presentation-only short code matching legacy OrderCode.format. Never use as API key. */
export function formatOrderCode(value: string | null | undefined): string {
  const code = String(value ?? '').trim().replace(/^#+\s*/, '');
  const match = code.match(/((?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-[DT]\d{3,})$/i);
  return match?.[1] ?? code;
}

function isMetadataHeaderLine(line: string): boolean {
  return (
    /^(?:訂單編號|取餐時間|點餐時間|用餐方式|桌號|聯絡電話|備註|付款方式|總金額|總計|📍|📞|👤|📝|💰|🧂|📦|----\s*|====\s*)/.test(
      line
    ) || /^(?:客製化設定|客製設定|口味設定)[：:]/.test(line)
  );
}

function cleanOptionToken(val: string, resolveOptionLabel?: (id: string) => string | undefined): string {
  const clean = val.replace(/^[↳\-+•*]\s*/, '').trim();
  if (!clean) return '';
  return resolveOptionLabel?.(clean) || clean;
}

function appendUniqueToken(target: string[], raw: unknown, resolveOptionLabel?: (id: string) => string | undefined): void {
  if (typeof raw !== 'string') return;
  const resolved = cleanOptionToken(raw, resolveOptionLabel);
  if (resolved && !target.includes(resolved)) {
    target.push(resolved);
  }
}

interface BundlePortionJson {
  groups?: Array<{ items?: Array<{ name?: unknown; itemName?: unknown }> }>;
}

/** Formats concise item summary matching legacy shortItems across structured items and raw text. */
export function formatPosShortItems(
  order: HistoryOrderDto | null | undefined,
  resolveOptionLabel?: (id: string) => string | undefined
): string {
  if (!order) return '';

  if (Array.isArray(order.items) && order.items.length > 0) {
    const dishSummaries: string[] = [];
    for (const item of order.items) {
      const name = String(item.item_name || item.name || '').replace(/\$[\d,.]+/g, '').trim();
      if (!name) continue;
      const qty = parseInt(String(item.quantity ?? 1), 10) || 1;
      const optTexts: string[] = [];

      let opts: unknown = item.selected_options ?? item.options;
      if (typeof opts === 'string') {
        try {
          opts = JSON.parse(opts);
        } catch {
          // Keep comma/delimiter-separated string fallback below
        }
      }

      if (Array.isArray(opts)) {
        for (const entry of opts) {
          const choice =
            typeof entry === 'string'
              ? entry
              : entry && typeof entry === 'object'
                ? (entry as { choice?: unknown; name?: unknown }).choice ||
                  (entry as { choice?: unknown; name?: unknown }).name
                : '';
          appendUniqueToken(optTexts, typeof choice === 'string' ? choice : '', resolveOptionLabel);
        }
      } else if (typeof opts === 'string' && opts.trim()) {
        for (const part of opts.split(/[、,\n]+/)) {
          appendUniqueToken(optTexts, part, resolveOptionLabel);
        }
      }

      const rawBundle =
        item.bundle_snapshot_json ??
        (item as { bundleSelections?: unknown }).bundleSelections;
      if (rawBundle) {
        try {
          const parsed =
            typeof rawBundle === 'string'
              ? (JSON.parse(rawBundle) as { portions?: BundlePortionJson[] })
              : (rawBundle as { portions?: BundlePortionJson[] });
          for (const portion of parsed?.portions || []) {
            for (const group of portion.groups || []) {
              for (const choice of group.items || []) {
                appendUniqueToken(
                  optTexts,
                  typeof choice.name === 'string'
                    ? choice.name
                    : typeof choice.itemName === 'string'
                      ? choice.itemName
                      : '',
                  resolveOptionLabel
                );
              }
            }
          }
        } catch {
          // Ignore malformed legacy bundle snapshots
        }
      }

      const optStr = optTexts.length > 0 ? ` (${optTexts.join('、')})` : '';
      dishSummaries.push(`${qty}份 x ${name}${optStr}`);
    }

    if (dishSummaries.length > 0) {
      return dishSummaries.join(' · ');
    }
  }

  const rawContent = String(order.content || '');
  if (!rawContent) return '';

  const lines = rawContent.split('\n').map(line => line.trim()).filter(Boolean);
  const dishes: Array<{ qty: number; name: string; options: string[] }> = [];
  let currentDish: { qty: number; name: string; options: string[] } | null = null;

  for (const line of lines) {
    if (isMetadataHeaderLine(line)) continue;

    const leadingQtyMatch = line.match(/^(\d+)\s*(?:份|x|X)\s*(?:x\s*)?(.+)$/);
    const trailingQtyMatch = leadingQtyMatch ? null : line.match(/^(.+?)\s*[xX*]\s*(\d+)$/);
    const isSubOption =
      line.startsWith('↳') ||
      line.startsWith('-') ||
      line.startsWith('+') ||
      line.startsWith('•') ||
      line.startsWith('*');

    if ((leadingQtyMatch || trailingQtyMatch) && !isSubOption) {
      const qty = parseInt(leadingQtyMatch?.[1] || trailingQtyMatch?.[2] || '1', 10) || 1;
      const rawName = leadingQtyMatch?.[2] || trailingQtyMatch?.[1] || '';
      currentDish = {
        qty,
        name: rawName.replace(/\$[\d,.]+/g, '').trim(),
        options: []
      };
      dishes.push(currentDish);
      continue;
    }

    if (isSubOption && currentDish) {
      const optText = line.replace(/^[↳\-+•*]\s*/, '').trim();
      const portionMatch = optText.match(/^(?:第[\d一二三四五六七八九十]+份|[^:：]+)[：:]\s*(.+)$/);
      const choicesStr = portionMatch?.[1] ?? optText;
      for (const token of choicesStr.split(/[、,，]+/)) {
        const cleanTok = token.replace(/\s*\(\+?\$?\d+.*?\)/g, '').replace(/\s*x\s*\d+$/g, '').trim();
        appendUniqueToken(currentDish.options, cleanTok, resolveOptionLabel);
      }
    }
  }

  if (dishes.length > 0) {
    return dishes
      .map(d => `${d.qty}份 x ${d.name}${d.options.length > 0 ? ` (${d.options.join('、')})` : ''}`)
      .join(' · ');
  }

  return lines
    .filter(line => !isMetadataHeaderLine(line))
    .map(line => cleanOptionToken(line, resolveOptionLabel))
    .filter(Boolean)
    .slice(0, 6)
    .join(' · ');
}

/** Maps order status to badge tone and localized POS label. */
export function resolveOrderStatusBadge(status: string, locale: PosLocale): OrderStatusBadgeModel {
  if (status === 'PAID') return { tone: 'paid', label: translatePos(locale, 'badgePaid') };
  if (status === 'PICKED_UP') return { tone: 'picked', label: translatePos(locale, 'badgePicked') };
  if (status === 'REJECTED' || status === 'FORCE_REJECT') {
    return { tone: 'rejected', label: translatePos(locale, 'badgeRejected') };
  }
  return { tone: 'neutral', label: status };
}

/** Computes LINE Pay payment badge text matching legacy PaymentPOS.badge(). */
export function resolveOrderPaymentBadge(
  order: Pick<HistoryOrderDto, 'status' | 'payment'> | null | undefined,
  locale: PosLocale
): OrderPaymentBadgeModel | null {
  if (!order?.payment) return null;
  const isUnrefundedWarning =
    UNREFUNDED_ORDER_STATUSES.has(String(order.status || '')) && order.payment.status === 'PAID';
  const statusKey = PAYMENT_STATUS_KEYS[order.payment.status];
  const statusLabel = isUnrefundedWarning
    ? translatePos(locale, 'paymentUnrefunded')
    : statusKey
      ? translatePos(locale, statusKey)
      : order.payment.status;
  return {
    label: `LINE Pay · ${statusLabel}`,
    isUnrefundedWarning
  };
}

/** Resolves dining option, table number, append round, and modified flags for history cards. */
export function resolveOrderDiningBadge(order: HistoryOrderDto, locale: PosLocale): OrderDiningBadgeModel {
  const isDineIn = isOrderDineIn(order);
  const tableNumber = extractOrderTableNumber(order);
  const tableSuffix = tableNumber ? ` · ${translatePos(locale, 'tableInline', { table: tableNumber })}` : '';
  const roundCount = Number(order.round_count || order.roundCount) || 1;
  const isModified = order.is_modified === 1 || order.isModified === true;

  return {
    isDineIn,
    label: `${translatePos(locale, isDineIn ? 'badgeDineIn' : 'badgeTakeaway')}${tableSuffix}`,
    tableNumber,
    roundCount,
    isModified
  };
}

/** Formats submission/pickup clock row label matching legacy history tile formatting. */
export function resolveOrderTimestampLabel(
  order: HistoryOrderDto,
  locale: PosLocale,
  nowMs: number = Date.now()
): string {
  const dineIn = isOrderDineIn(order);
  const clock = dineIn
    ? formatOrderSubmissionTime(order)
    : formatPickupTimeDisplay(order.time, order.createdAt, order.content, nowMs);
  return dineIn
    ? `${translatePos(locale, 'dineInTimeLabel')}: ${clock}`
    : `${translatePos(locale, 'pickupLabel')} ${clock}`;
}
