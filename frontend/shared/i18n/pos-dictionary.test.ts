import { describe, expect, it } from 'vitest';
import { getAllPosTranslationKeys, hasMatchingDictionaryKeys, translatePos } from './pos-dictionary';

describe('pos-dictionary bilingual parity', () => {
  it('maintains identical translation keys across zh-TW and vi', () => {
    expect(hasMatchingDictionaryKeys()).toBe(true);
    const keys = getAllPosTranslationKeys();
    expect(keys.length).toBeGreaterThan(20);

    for (const key of keys) {
      expect(translatePos('zh-TW', key).trim().length).toBeGreaterThan(0);
      expect(translatePos('vi', key).trim().length).toBeGreaterThan(0);
    }
  });

  it('interpolates placeholder parameters consistently', () => {
    expect(translatePos('zh-TW', 'badgeAppendRound', { n: 2 })).toBe('第 2 輪');
    expect(translatePos('vi', 'badgeAppendRound', { n: 2 })).toBe('Đợt 2');
    expect(translatePos('zh-TW', 'tablePrefix', { table: '5' })).toBe('桌 5');
    expect(translatePos('vi', 'tablePrefix', { table: '5' })).toBe('Bàn 5');
  });

  it('enforces minimalist iconography rules with zero emoji characters', () => {
    const emojiPattern = /[\u{1F300}-\u{1FAFF}]/u;
    for (const key of getAllPosTranslationKeys()) {
      expect(emojiPattern.test(translatePos('zh-TW', key))).toBe(false);
      expect(emojiPattern.test(translatePos('vi', key))).toBe(false);
    }
  });
});
