import type { HistoryOrderDto } from './api';

export type HistoryFilterType = 'all' | 'dine_in' | 'takeaway';

export interface HistoryDateGroup {
  date: string;
  isToday: boolean;
  orders: HistoryOrderDto[];
  dayTotal: number;
}

const TAIWAN_OFFSET_MS = 8 * 3600 * 1000;

/** Normalizes Vietnamese text by stripping combining marks and mapping d/đ. */
export function removeVietnameseDiacritics(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function formatTaiwanYyyyMmDd(epochMs: number): string {
  const tw = new Date(epochMs + TAIWAN_OFFSET_MS);
  const yyyy = tw.getUTCFullYear();
  const mm = String(tw.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(tw.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseTimestampMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return 0;
  const trimmed = raw.trim();
  const iso = trimmed.endsWith('Z') ? trimmed : `${trimmed}Z`;
  const parsed = new Date(iso).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Returns Taiwan (UTC+8) calendar date string YYYY-MM-DD. */
export function getTaiwanTodayStr(nowMs: number = Date.now()): string {
  return formatTaiwanYyyyMmDd(nowMs);
}

/** Extracts table identifier from structured or legacy fields. */
export function extractOrderTableNumber(order: Pick<HistoryOrderDto, 'tableNumber' | 'table_number'> | null | undefined): string {
  if (!order) return '';
  return String(order.tableNumber || order.table_number || '').trim();
}

/** Determines whether an order is dine-in matching legacy orders-history precedence. */
export function isOrderDineIn(order: HistoryOrderDto | null | undefined): boolean {
  if (!order) return false;
  const opt = String(order.diningOption || order.dining_option || '').toLowerCase().trim();
  if (opt === 'dine_in' || opt === 'dinein' || opt === 'in') return true;
  if (opt === 'takeaway' || opt === 'take_out' || opt === 'out') return false;

  if (extractOrderTableNumber(order)) return true;

  const key = String(order.key || '').trim();
  if (/(?:^|-)D\d+/i.test(key)) return true;
  if (/(?:^|-)T\d+/i.test(key)) return false;

  const content = String(order.content || '');
  if (content.includes('內用') || content.includes('Tại chỗ') || content.includes('Ăn tại chỗ')) return true;
  if (content.includes('外帶') || content.includes('Mang đi') || content.includes('Mang về')) return false;

  const time = String(order.time || '');
  if (time.includes('現場內用') || time.includes('內用') || time.includes('Tại chỗ')) return true;
  if (time.includes('外帶') || time.includes('Mang đi')) return false;

  return false;
}

/** Formats concise item summary from structured items or legacy order content. */
export function buildOrderItemsSummary(order: HistoryOrderDto | null | undefined): string {
  if (!order) return '';
  if (Array.isArray(order.items) && order.items.length > 0) {
    const parts: string[] = [];
    for (const item of order.items) {
      const name = String(item.item_name || item.name || '').replace(/\$[\d,.]+/g, '').trim();
      if (!name) continue;
      const qty = Number(item.quantity) || 1;
      parts.push(`${name} x${qty}`);
    }
    if (parts.length > 0) return parts.join('、');
  }
  const lines = String(order.content || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^\d+\s*[x×]/i.test(line));
  return lines.join('、');
}

/** Matches search query across order code, customer, table, phone, items, and notes. */
export function matchesHistorySearch(
  order: HistoryOrderDto,
  query: string,
  formatDisplayCode: (code: string) => string = code => code
): boolean {
  if (!query || !query.trim()) return true;
  const q = query.trim().toLowerCase();
  const qClean = removeVietnameseDiacritics(q);
  const qNoHash = q.replace(/^#/, '');

  const displayCode = formatDisplayCode(String(order.displayKey || order.key || '')).toLowerCase();
  if (displayCode.includes(qNoHash)) return true;

  const key = String(order.key || '').toLowerCase();
  const keyClean = key.replace(/^#/, '');
  if (key.includes(q) || keyClean.includes(qNoHash) || key.includes(qNoHash)) return true;

  const customer = String(order.customer || '').toLowerCase();
  if (customer.includes(q) || removeVietnameseDiacritics(customer).includes(qClean)) return true;

  const table = extractOrderTableNumber(order).toLowerCase();
  if (table && (table === q || table === qNoHash || table.includes(q))) return true;

  const phone = String(order.phone || order.phoneNumber || '').toLowerCase();
  if (phone && phone.includes(q)) return true;

  const content = String(order.content || '').toLowerCase();
  const summary = buildOrderItemsSummary(order).toLowerCase();
  if (
    content.includes(q) ||
    summary.includes(q) ||
    removeVietnameseDiacritics(content).includes(qClean) ||
    removeVietnameseDiacritics(summary).includes(qClean)
  ) {
    return true;
  }

  const note = String(order.note || '').toLowerCase();
  return note.includes(q) || removeVietnameseDiacritics(note).includes(qClean);
}

/** Resolves YYYY-MM-DD Taiwan date key from time string or createdAt epoch ms. */
export function getOrderTaiwanDateStr(order: HistoryOrderDto): string {
  if (typeof order.time === 'string') {
    const match = order.time.match(/\d{4}-\d{2}-\d{2}/);
    if (match?.[0]) return match[0];
  }
  if (order.createdAt) {
    return formatTaiwanYyyyMmDd(order.createdAt);
  }
  return 'Unknown';
}

/** Filters, groups, and sorts history orders descending by UTC+8 date and timestamp. */
export function buildHistoryGroups(
  orders: readonly HistoryOrderDto[],
  options: {
    filterType?: HistoryFilterType;
    searchQuery?: string;
    nowMs?: number;
    formatDisplayCode?: (code: string) => string;
  } = {}
): { filtered: HistoryOrderDto[]; groups: HistoryDateGroup[] } {
  const filterType = options.filterType ?? 'all';
  const searchQuery = options.searchQuery ?? '';
  const todayStr = getTaiwanTodayStr(options.nowMs);

  let filtered = orders.slice();
  if (filterType === 'dine_in') {
    filtered = filtered.filter(order => isOrderDineIn(order));
  } else if (filterType === 'takeaway') {
    filtered = filtered.filter(order => !isOrderDineIn(order));
  }
  if (searchQuery.trim()) {
    filtered = filtered.filter(order => matchesHistorySearch(order, searchQuery, options.formatDisplayCode));
  }

  const byDate = new Map<string, HistoryOrderDto[]>();
  for (const order of filtered) {
    const date = getOrderTaiwanDateStr(order);
    const list = byDate.get(date);
    if (list) list.push(order);
    else byDate.set(date, [order]);
  }

  const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
  const groups: HistoryDateGroup[] = sortedDates.map(date => {
    const dayOrders = (byDate.get(date) || []).slice().sort((a, b) => {
      const timeA = a.pickedUpAt || a.createdAt || 0;
      const timeB = b.pickedUpAt || b.createdAt || 0;
      return timeB - timeA;
    });
    const dayTotal = dayOrders.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    return {
      date,
      isToday: date === todayStr,
      orders: dayOrders,
      dayTotal
    };
  });

  return { filtered, groups };
}

/** Formats dine-in submission clock HH:mm in UTC+8. */
export function formatOrderSubmissionTime(order: Pick<HistoryOrderDto, 'createdAt' | 'time'> | null | undefined): string {
  if (!order) return '-';
  let createdMs = parseTimestampMs(order.createdAt);
  if (!createdMs && order.time) {
    const m = String(order.time).match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})$/);
    if (m?.[1] && m[2]) {
      createdMs = new Date(`${m[1]}T${m[2].padStart(5, '0')}:00+08:00`).getTime();
    }
  }
  if (!createdMs || Number.isNaN(createdMs)) return '-';
  const tw = new Date(createdMs + TAIWAN_OFFSET_MS);
  const hh = String(tw.getUTCHours()).padStart(2, '0');
  const mm = String(tw.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Formats takeaway pickup time relative to Taiwan today, matching legacy formatPickupTimeDisplay. */
export function formatPickupTimeDisplay(
  timeStr: string | null | undefined,
  fallbackCreatedAt?: number,
  orderContent?: string,
  nowMs: number = Date.now()
): string {
  let clean = timeStr ? String(timeStr).replace(/\s*\([^)]*\)/g, '').trim() : '';
  if ((!clean || clean === 'Unknown' || clean === '-') && orderContent) {
    const match = String(orderContent).match(/(?:取餐時間|訂餐時間|點餐時間)[：:]\s*([^\n\r]+)/);
    if (match?.[1]) clean = match[1].replace(/\s*\([^)]*\)/g, '').trim();
  }

  const todayPart = formatTaiwanYyyyMmDd(nowMs);

  if (!clean || clean === 'Unknown' || clean === '-') {
    const dt = parseTimestampMs(fallbackCreatedAt);
    if (dt > 0) {
      const tw = new Date(dt + TAIWAN_OFFSET_MS);
      const yyyy = tw.getUTCFullYear();
      const mm = String(tw.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(tw.getUTCDate()).padStart(2, '0');
      const hh = String(tw.getUTCHours()).padStart(2, '0');
      const min = String(tw.getUTCMinutes()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}` === todayPart ? `${hh}:${min}` : `${mm}/${dd} ${hh}:${min}`;
    }
    return '-';
  }

  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}:\d{2})$/);
  if (match && match[1] && match[2] && match[3] && match[4]) {
    const datePart = `${match[1]}-${match[2]}-${match[3]}`;
    return datePart === todayPart ? match[4] : `${match[2]}/${match[3]} ${match[4]}`;
  }

  return clean;
}

/** Formats order total amount with legacy content fallback. */
export function formatOrderTotal(order: Pick<HistoryOrderDto, 'total' | 'content'> | null | undefined): string {
  if (order?.total !== undefined && order?.total !== null && !Number.isNaN(order.total) && Number(order.total) > 0) {
    return `$${Number(order.total).toLocaleString()}`;
  }
  if (order?.content) {
    const match =
      String(order.content).match(/💰\s*總金額[：:]\s*\$?(\d+)/) ||
      String(order.content).match(/Tổng\s*(?:tiền)?[：:]\s*(\d+)/i);
    if (match?.[1]) {
      return `$${Number(match[1]).toLocaleString()}`;
    }
  }
  return order?.total !== undefined && order?.total !== null ? `$${order.total}` : '-';
}
