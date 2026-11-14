import { describe, expect, it } from 'vitest';
import { escapeNoticeHtml, renderStoreNoticeBody } from './store-notice-format';

describe('store-notice-format', () => {
  it('escapes HTML entities before applying inline bold formatting', () => {
    expect(escapeNoticeHtml('<script>"alert"</script>')).toBe('&lt;script&gt;&quot;alert&quot;&lt;/script&gt;');
    expect(renderStoreNoticeBody('**重要** <img src=x onerror=1>')).toBe(
      '<p><strong>重要</strong> &lt;img src=x onerror=1&gt;</p>'
    );
  });

  it('renders paragraphs and bullet lists cleanly across CRLF and blank lines', () => {
    const html = renderStoreNoticeBody('第一行\r\n第二行\r\n\r\n- **項目一**\r\n• 項目二');
    expect(html).toBe('<p>第一行<br>第二行</p><ul><li><strong>項目一</strong></li><li>項目二</li></ul>');
  });
});
