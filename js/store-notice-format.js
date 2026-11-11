// Shared renderer for the store popup notice (POS preview + customer LIFF).
// Input is plain text with a tiny markup: **bold** and lines starting with "- ".
// All text is HTML-escaped first, so no store-provided HTML ever reaches the DOM.
(function (root) {
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function inline(line) {
    return escapeHtml(line).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  }

  function renderBody(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let list = null;
    let para = [];
    const flushPara = () => { if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; } };
    const flushList = () => { if (list) { out.push('<ul>' + list.join('') + '</ul>'); list = null; } };
    for (const raw of lines) {
      const m = raw.match(/^\s*[-•]\s+(.*)$/);
      if (m) { flushPara(); (list = list || []).push('<li>' + inline(m[1]) + '</li>'); continue; }
      flushList();
      if (!raw.trim()) { flushPara(); continue; }
      para.push(inline(raw));
    }
    flushPara();
    flushList();
    return out.join('');
  }

  root.StoreNoticeFormat = { escapeHtml, renderBody };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.StoreNoticeFormat;
})(typeof window !== 'undefined' ? window : globalThis);
