import { describe, expect, it } from 'vitest';
import {
  extractLegacyFlavors,
  extractLegacyGlobalChoices,
  extractLegacyOrderItems,
  extractLegacyReceiptLines
} from './order-legacy-adapter';

describe('order-legacy-adapter', () => {
  it('extracts flavor sections across Chinese and Vietnamese headings', () => {
    const content = '口味設定：\n• 辣度：小辣\n• 餐具：不需要\n2份 x 牛肉麵';
    expect(extractLegacyFlavors(content)).toEqual([
      { label: '辣度', value: '小辣' },
      { label: '餐具', value: '不需要' }
    ]);
    expect(extractLegacyGlobalChoices({ customizations: [{ title: 'Độ ngọt', choice: '50%' }] })).toEqual([
      { label: 'Độ ngọt', value: '50%' }
    ]);
  });

  it('deduplicates repeated option notes in legacy receipt lines', () => {
    const lines = extractLegacyReceiptLines(
      '口味設定：\n- 不要辣\n1份 x 法國麵包\n↳ 加蛋\n↳ 加蛋',
      (line) => line
    );
    expect(lines).toEqual([
      { text: '1份 x 法國麵包', isOption: false },
      { text: '加蛋', isOption: true }
    ]);
  });

  it('parses legacy text items with fallback prices and unit expansion', () => {
    const items = extractLegacyOrderItems(
      { content: '2份 x 招牌麵包 $85\n↳ +荷包蛋 (+$15)' },
      true
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.name).toBe('招牌麵包');
    expect(items[0]?.price).toBe('$185');
    expect(items[1]?.unitIndex).toBe(2);
  });
});
