import { describe, expect, it } from 'vitest';
import type { HistoryOrderDto } from './api';
import {
  formatOrderCode,
  formatPosShortItems,
  resolveOrderDiningBadge,
  resolveOrderPaymentBadge,
  resolveOrderStatusBadge,
  resolveOrderTimestampLabel
} from './order-formatters';
import { DEFAULT_SANDBOX_ORDERS, SANDBOX_REFERENCE_NOW_MS } from '@pos/history-fixtures';

describe('order-formatters legacy POS parity', () => {
  it('formats short display codes identically to legacy OrderCode.format', () => {
    expect(formatOrderCode('#ZBCF1109-T001')).toBe('1109-T001');
    expect(formatOrderCode('B0914-D007')).toBe('0914-D007');
    expect(formatOrderCode('52K1109-T1000')).toBe('1109-T1000');
    expect(formatOrderCode('48cc482f-01ca-4939-ae70-f2c07c9cb4ce')).toBe('48cc482f-01ca-4939-ae70-f2c07c9cb4ce');
    expect(formatOrderCode(null)).toBe('');
  });

  it('formats structured items with options, bundle choices, and option ID resolution', () => {
    const order: HistoryOrderDto = {
      key: 'K-1',
      customer: 'Minh',
      time: '2026-11-11 12:00',
      content: '',
      status: 'PAID',
      createdAt: SANDBOX_REFERENCE_NOW_MS,
      total: 200,
      items: [
        {
          item_name: 'Bánh mì đặc biệt $95',
          quantity: 2,
          selected_options: JSON.stringify(['opt_no_chili', 'opt_no_chili', 'Ít pate']),
          bundle_snapshot_json: JSON.stringify({
            portions: [{ groups: [{ items: [{ name: 'opt_tea' }] }] }]
          })
        }
      ]
    };
    const resolver = (id: string) => ({ opt_no_chili: 'Không ớt', opt_tea: 'Trà đá' }[id]);
    expect(formatPosShortItems(order, resolver)).toBe('2份 x Bánh mì đặc biệt (Không ớt、Ít pate、Trà đá)');
  });

  it('parses legacy multiline content while filtering metadata headers', () => {
    const legacy: HistoryOrderDto = {
      key: 'LEG-1',
      customer: 'Lan',
      time: '2026-11-11 12:00',
      content: [
        '📍 用餐方式：外帶',
        '1份 x 招牌麵包 $90',
        '↳ 口味: yzs_fl_06, 去香菜',
        '2份 x 冰紅茶 $80',
        '💰 總金額: $170'
      ].join('\n'),
      status: 'PICKED_UP',
      createdAt: SANDBOX_REFERENCE_NOW_MS,
      total: 170
    };
    expect(formatPosShortItems(legacy, id => (id === 'yzs_fl_06' ? '微辣' : undefined))).toBe(
      '1份 x 招牌麵包 (微辣、去香菜) · 2份 x 冰紅茶'
    );
  });

  it('maps status, payment, dining, and timestamp badges accurately in zh-TW and vi', () => {
    expect(resolveOrderStatusBadge('PAID', 'vi')).toEqual({ tone: 'paid', label: 'ĐÃ THANH TOÁN' });
    expect(resolveOrderStatusBadge('FORCE_REJECT', 'zh-TW')).toEqual({ tone: 'rejected', label: '已取消' });

    const paidCancelledOrder: HistoryOrderDto = {
      ...DEFAULT_SANDBOX_ORDERS[2]!,
      status: 'REJECTED',
      payment: {
        id: 'pay-1',
        method: 'linepay',
        status: 'PAID',
        amount: 140,
        currency: 'TWD',
        paidAt: SANDBOX_REFERENCE_NOW_MS,
        refundedAmount: 0
      }
    };
    expect(resolveOrderPaymentBadge(paidCancelledOrder, 'vi')).toEqual({
      label: 'LINE Pay · Đã hủy — chưa hoàn tiền',
      isUnrefundedWarning: true
    });

    const dineInBadge = resolveOrderDiningBadge(DEFAULT_SANDBOX_ORDERS[0]!, 'vi');
    expect(dineInBadge).toEqual({
      isDineIn: true,
      label: 'Ăn tại quán · Bàn 5',
      tableNumber: '5',
      roundCount: 2,
      isModified: true
    });

    expect(resolveOrderTimestampLabel(DEFAULT_SANDBOX_ORDERS[0]!, 'zh-TW', SANDBOX_REFERENCE_NOW_MS)).toBe(
      '點餐時間: 12:20'
    );
    expect(resolveOrderTimestampLabel(DEFAULT_SANDBOX_ORDERS[2]!, 'vi', SANDBOX_REFERENCE_NOW_MS)).toBe(
      'Lấy: 11/10 18:30'
    );
  });
});
