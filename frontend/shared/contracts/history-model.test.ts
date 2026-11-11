import { describe, expect, it } from 'vitest';
import type { HistoryOrderDto } from './api';
import {
  buildHistoryGroups,
  buildOrderItemsSummary,
  formatOrderSubmissionTime,
  formatOrderTotal,
  formatPickupTimeDisplay,
  getTaiwanTodayStr,
  isOrderDineIn,
  matchesHistorySearch,
  removeVietnameseDiacritics
} from './history-model';
import { DEFAULT_SANDBOX_ORDERS, SANDBOX_REFERENCE_NOW_MS } from '@pos/history-fixtures';

describe('history-model domain parity', () => {
  it('strips Vietnamese combining diacritics and maps đ/Đ consistently', () => {
    expect(removeVietnameseDiacritics('Nguyễn Văn Đức')).toBe('Nguyen Van Duc');
    expect(removeVietnameseDiacritics('ĐẶNG THỊ HƯƠNG')).toBe('DANG THI HUONG');
  });

  it('infers dine-in vs takeaway using legacy orders-history precedence', () => {
    expect(isOrderDineIn({ key: 'K1', customer: 'A', time: '', content: '', status: 'PAID', createdAt: 1, total: 100, diningOption: 'dine_in' })).toBe(true);
    expect(isOrderDineIn({ key: 'K2', customer: 'A', time: '', content: '', status: 'PAID', createdAt: 1, total: 100, dining_option: 'takeaway', tableNumber: '9' })).toBe(false);
    expect(isOrderDineIn({ key: 'K3', customer: 'A', time: '', content: '', status: 'PAID', createdAt: 1, total: 100, table_number: '12' })).toBe(true);
    expect(isOrderDineIn({ key: 'ORD-D05', customer: 'A', time: '', content: '', status: 'PAID', createdAt: 1, total: 100 })).toBe(true);
    expect(isOrderDineIn({ key: 'ORD-T05', customer: 'A', time: '', content: '', status: 'PAID', createdAt: 1, total: 100 })).toBe(false);
    expect(isOrderDineIn({ key: 'K4', customer: 'A', time: '', content: '內用 桌號 3', status: 'PAID', createdAt: 1, total: 100 })).toBe(true);
    expect(isOrderDineIn({ key: 'K5', customer: 'A', time: '2026-11-11 外帶', content: '', status: 'PAID', createdAt: 1, total: 100 })).toBe(false);
  });

  it('builds item summaries from structured items or legacy multiline content', () => {
    const structuredSummary = buildOrderItemsSummary(DEFAULT_SANDBOX_ORDERS[0]);
    expect(structuredSummary).toBe('Bánh mì thịt nướng x1、Cà phê sữa đá x2、Chả lụa thêm x1');

    const legacyOrder: HistoryOrderDto = {
      key: 'LEG-1',
      customer: 'Lan',
      time: '2026-11-10 12:00',
      content: '訂單摘要\n2x 招牌麵包 $180\n1 × 冰美式\n💰 總金額: $240',
      status: 'PICKED_UP',
      createdAt: 1,
      total: 0
    };
    expect(buildOrderItemsSummary(legacyOrder)).toBe('2x 招牌麵包 $180、1 × 冰美式');
    expect(formatOrderTotal(legacyOrder)).toBe('$240');
  });

  it('matches accent-insensitive customer names, table numbers, display keys, and notes', () => {
    const dineInOrder = DEFAULT_SANDBOX_ORDERS[0]!;
    expect(matchesHistorySearch(dineInOrder, 'nguyen')).toBe(true);
    expect(matchesHistorySearch(dineInOrder, 'van a')).toBe(true);
    expect(matchesHistorySearch(dineInOrder, '#261111-005')).toBe(true);
    expect(matchesHistorySearch(dineInOrder, '5')).toBe(true);
    expect(matchesHistorySearch(dineInOrder, 'hanh ngo')).toBe(true);
    expect(matchesHistorySearch(dineInOrder, 'không khớp')).toBe(false);
  });

  it('groups orders by Taiwan UTC+8 date descending and computes daily sums', () => {
    expect(getTaiwanTodayStr(SANDBOX_REFERENCE_NOW_MS)).toBe('2026-11-11');

    const { groups } = buildHistoryGroups(DEFAULT_SANDBOX_ORDERS, {
      nowMs: SANDBOX_REFERENCE_NOW_MS
    });

    expect(groups.map(g => g.date)).toEqual(['2026-11-11', '2026-11-10']);
    expect(groups[0]?.isToday).toBe(true);
    expect(groups[0]?.dayTotal).toBe(490);
    expect(groups[0]?.orders.map(o => o.key)).toEqual(['ORD-20261111-D05', 'ORD-20261111-T14']);
    expect(groups[1]?.isToday).toBe(false);
    expect(groups[1]?.dayTotal).toBe(140);

    const dineInOnly = buildHistoryGroups(DEFAULT_SANDBOX_ORDERS, {
      filterType: 'dine_in',
      nowMs: SANDBOX_REFERENCE_NOW_MS
    });
    expect(dineInOnly.filtered.map(o => o.key)).toEqual(['ORD-20261111-D05']);

    const takeawayOnly = buildHistoryGroups(DEFAULT_SANDBOX_ORDERS, {
      filterType: 'takeaway',
      nowMs: SANDBOX_REFERENCE_NOW_MS
    });
    expect(takeawayOnly.filtered.map(o => o.key)).toEqual(['ORD-20261111-T14', 'ORD-20261110-T03']);
  });

  it('formats submission clock and pickup timestamps in Taiwan timezone', () => {
    expect(formatOrderSubmissionTime(DEFAULT_SANDBOX_ORDERS[0])).toBe('12:20');
    expect(formatPickupTimeDisplay('2026-11-11 13:15', undefined, undefined, SANDBOX_REFERENCE_NOW_MS)).toBe('13:15');
    expect(formatPickupTimeDisplay('2026-11-10 18:30', undefined, undefined, SANDBOX_REFERENCE_NOW_MS)).toBe('11/10 18:30');
  });
});
