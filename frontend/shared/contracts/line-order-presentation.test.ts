import { describe, expect, it } from 'vitest';
import {
  buildPortionRuns,
  formatLineOrderFlex,
  formatLineOrderText,
  normalizeLineOrderItem,
  paginateLineOrderFlex,
  type LineFlexBubble
} from './line-order-presentation';

describe('line-order-presentation', () => {
  it('merges consecutive identical portions into a single run and formats zh-TW/vi text', () => {
    const model = normalizeLineOrderItem({
      detailLine: {
        name: '招牌法國麵包',
        quantity: 3,
        subtotal: 270,
        note: '',
        portions: [
          { portionIndex: 0, note: '', groups: [{ groupId: 'g1', groupName: '辣度', items: [{ name: '小辣', quantity: 1, surcharge: 0 }] }] },
          { portionIndex: 1, note: '', groups: [{ groupId: 'g1', groupName: '辣度', items: [{ name: '小辣', quantity: 1, surcharge: 0 }] }] },
          { portionIndex: 2, note: '不要香菜', groups: [] }
        ]
      }
    });

    const runs = buildPortionRuns(model);
    expect(runs).toHaveLength(2);
    expect(runs[0]?.index).toBe(0);
    expect(runs[0]?.end).toBe(1);

    const viText = formatLineOrderText(model, 'vi');
    expect(viText).toContain('Phần 1–2 · Cùng tùy chọn');
    expect(viText).toContain('Ghi chú: 不要香菜');

    const flex = formatLineOrderFlex(model, 'zh-TW');
    expect(flex.length).toBeGreaterThan(0);
  });

  it('paginates oversized Flex bubbles cleanly under 28KB limit', () => {
    const hugeItems = Array.from({ length: 40 }, (_, i) => ({
      type: 'text' as const,
      text: `Item ${i}: ${'x'.repeat(900)}`
    }));
    const bubble: LineFlexBubble = {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            contents: hugeItems
          }
        ]
      }
    };
    const paged = paginateLineOrderFlex(bubble, hugeItems);
    expect(['carousel', 'receipt-pages']).toContain(paged.type);
  });
});
