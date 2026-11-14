/** Escapes raw text before inline notice markup rendering so untrusted HTML never reaches DOM. */
export function escapeNoticeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderNoticeInline(line: string): string {
  return escapeNoticeHtml(line).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}

/** Formats plain notice text supporting **bold** and `-` / `•` bullet lists as safe HTML. */
export function renderStoreNoticeBody(text: string | null | undefined): string {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let list: string[] | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.join('<br>')}</p>`);
      para = [];
    }
  };

  const flushList = () => {
    if (list) {
      out.push(`<ul>${list.join('')}</ul>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const bulletMatch = raw.match(/^\s*[-•]\s+(.*)$/);
    if (bulletMatch) {
      flushPara();
      if (!list) list = [];
      list.push(`<li>${renderNoticeInline(bulletMatch[1] ?? '')}</li>`);
      continue;
    }
    flushList();
    if (!raw.trim()) {
      flushPara();
      continue;
    }
    para.push(renderNoticeInline(raw));
  }

  flushPara();
  flushList();
  return out.join('');
}
