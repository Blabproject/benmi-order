import { describe, expect, it } from 'vitest';
import type { OrderDetailSnapshot } from './api';
import {
  extractOrderDetailGlobalChoices,
  extractOrderDetailLines,
  extractOrderDetailNotes,
  formatOrderDetailPlainText,
  isOrderDetailSnapshot
} from './order-detail-view';

describe('order-detail-view', () => {
  const sampleSnapshot: OrderDetailSnapshot = {
    schemaVersion: 1,
    total: 185,
    rounds: [
      {
        roundNumber: 1,
        createdAt: '2026-11-14T10:00:00Z',
        note: '少冰微糖',
        discount: 0,
        total: 185,
        groups: [
          {
            groupId: 'dining',
            groupName: '用餐方式',
            items: [
              {
                optionId: 'takeaway',
                itemId: 'takeaway',
                name: '外帶',
                quantity: 1,
                surcharge: 0,
                groups: [],
                subOptions: []
              }
            ]
          }
        ],
        items: [
          {
            lineId: 'line-1',
            itemId: 'item-banhmi',
            name: '招牌法國麵包',
            categoryId: 'cat-1',
            category: '主餐',
            quantity: 2,
            unitPrice: 85,
            subtotal: 185,
            note: '加辣',
            portions: [
              {
                portionIndex: 0,
                note: '不要香菜',
                groups: [
                  {
                    groupId: 'egg',
                    groupName: '加料',
                    items: [
                      {
                        optionId: 'opt-egg',
                        itemId: 'opt-egg',
                        name: '荷包蛋',
                        quantity: 1,
                        surcharge: 15,
                        groups: [],
                        subOptions: [{ name: '半熟', price: 0 }]
                      }
                    ]
                  }
                ]
              },
              {
                portionIndex: 1,
                note: '',
                groups: []
              }
            ]
          }
        ]
      }
    ]
  };

  it('recognizes schemaVersion 1 snapshots and rejects plain text', () => {
    expect(isOrderDetailSnapshot(sampleSnapshot)).toBe(true);
    expect(isOrderDetailSnapshot('1 x Banh Mi')).toBe(false);
    expect(isOrderDetailSnapshot(null)).toBe(false);
  });

  it('extracts global choices, portion options, notes, and fallback text', () => {
    expect(extractOrderDetailGlobalChoices(sampleSnapshot)).toEqual([
      {
        groupId: 'dining',
        optionId: 'takeaway',
        label: '用餐方式',
        value: '外帶',
        price: 0,
        roundNumber: 1
      }
    ]);
    const lines = extractOrderDetailLines(sampleSnapshot);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.options[0]?.choice).toBe('第1份: 加料: 荷包蛋 (半熟)');
    expect(lines[0]?.note).toBe('加辣\n第1份: 不要香菜');
    expect(extractOrderDetailNotes(sampleSnapshot)).toBe('少冰微糖');
    expect(formatOrderDetailPlainText('legacy receipt text')).toBe('legacy receipt text');
    expect(formatOrderDetailPlainText(sampleSnapshot)).toContain('2份 x 招牌法國麵包');
  });
});
