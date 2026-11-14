import type { PosLocale } from '@shared/i18n/pos-dictionary';

export interface LineOrderSubOption {
  id: string;
  name: string;
  price: number;
}

export interface LineOrderChoice {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  surcharge: number;
  subOptions: LineOrderSubOption[];
  groups: LineOrderGroup[];
}

export interface LineOrderGroup {
  id: string;
  name: string;
  choices: LineOrderChoice[];
}

export interface LineOrderPortion {
  index: number;
  groups: LineOrderGroup[];
  note: string;
  opaque: string[];
  fingerprint?: string;
}

export interface LineOrderPortionRun extends LineOrderPortion {
  end: number;
  signature: string;
}

export interface LineOrderPrice {
  amount: number;
  unit: boolean;
}

export interface NormalizedLineOrderItem {
  name: string;
  quantity: number;
  price: LineOrderPrice | null;
  note: string;
  common: string[];
  portions: LineOrderPortion[];
  complete: boolean;
}

export interface LineFlexTextNode {
  type: 'text';
  text: string;
  size?: string;
  color?: string;
  wrap?: boolean;
  flex?: number;
}

export interface LineFlexBoxNode {
  type: 'box';
  layout: 'horizontal' | 'vertical' | 'baseline';
  spacing?: string;
  margin?: string;
  backgroundColor?: string;
  cornerRadius?: string;
  paddingAll?: string;
  contents: LineFlexNode[];
}

export type LineFlexNode = LineFlexTextNode | LineFlexBoxNode;

export interface LineFlexBubble {
  type: 'bubble';
  body: {
    type: 'box';
    layout: 'vertical';
    contents: LineFlexNode[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type LineFlexReceiptPage =
  | LineFlexBubble
  | { type: 'carousel'; contents: LineFlexBubble[] };

export type LineFlexPaginatedResult =
  | LineFlexReceiptPage
  | { type: 'receipt-pages'; pages: LineFlexReceiptPage[] };

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asStr(value: unknown): string {
  return value == null ? '' : String(value);
}

function asNum(value: unknown): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function asQty(value: unknown): number {
  const parsed = asNum(value);
  return parsed > 0 ? parsed : 1;
}

export function getLineOrderLabels(locale: PosLocale | string) {
  return locale === 'vi'
    ? {
        portion: (n: string | number) => `Phần ${n}`,
        same: 'Cùng tùy chọn',
        note: 'Ghi chú',
        itemNote: 'Ghi chú món',
        group: 'Tùy chọn',
        unit: 'Đơn giá'
      }
    : {
        portion: (n: string | number) => `第 ${n} 份`,
        same: '相同設定',
        note: '備註',
        itemNote: '品項備註',
        group: '搭配',
        unit: '單價'
      };
}

function parseJsonSafe(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeChoice(raw: unknown): LineOrderChoice {
  if (!raw || typeof raw !== 'object') {
    return { id: '', itemId: '', name: asStr(raw), quantity: 1, surcharge: 0, subOptions: [], groups: [] };
  }
  const c = raw as Record<string, unknown>;
  return {
    id: asStr(c.optionId || c.option_id || c.id),
    itemId: asStr(c.itemId || c.item_id),
    name: asStr(c.name || c.item_name || c.choice),
    quantity: asQty(c.quantity),
    surcharge: asNum(c.surcharge),
    subOptions: asList<Record<string, unknown>>(c.subOptions || c.modifiers).map((s) => ({
      id: asStr(s.id),
      name: asStr(s.name),
      price: asNum(s.price)
    })),
    groups: normalizeGroups(c.groups)
  };
}

function normalizeGroups(value: unknown): LineOrderGroup[] {
  return asList<Record<string, unknown>>(value)
    .filter((group) => group && typeof group === 'object')
    .map((group) => ({
      id: asStr(group.groupId || group.group_id || group.id),
      name: asStr(group.groupName || group.group_name),
      choices: asList<unknown>(group.items)
        .filter((entry) => entry != null)
        .map(normalizeChoice)
    }));
}

function choiceText(choice: LineOrderChoice): string {
  const children = choice.groups.flatMap((group) =>
    group.choices.map((child) => `${group.name ? `${group.name}: ` : ''}${choiceText(child)}`)
  );
  const subs = choice.subOptions.map((sub) => sub.name).concat(children);
  return `${choice.name}${choice.quantity > 1 ? ` ×${choice.quantity}` : ''}${subs.length ? ` (${subs.join('、')})` : ''}`;
}

function choiceExtra(choice: LineOrderChoice): number {
  return (
    (choice.surcharge +
      choice.subOptions.reduce((sum, sub) => sum + sub.price, 0) +
      choice.groups.reduce(
        (sum, group) => sum + group.choices.reduce((inner, child) => inner + choiceExtra(child), 0),
        0
      )) *
    choice.quantity
  );
}

export function normalizeBundlePortions(raw: unknown): LineOrderPortion[] | null {
  const data = parseJsonSafe(raw);
  const portions = Array.isArray(data)
    ? data[0]?.groups
      ? data
      : [{ groups: data }]
    : (data as { portions?: unknown } | null)?.portions;
  if (!Array.isArray(portions)) return null;
  return portions.map((portion, index) => {
    const p = portion as { portionIndex?: number; groups?: unknown; note?: unknown } | null;
    return {
      index: Number.isInteger(p?.portionIndex) && (p?.portionIndex ?? -1) >= 0 ? (p!.portionIndex as number) : index,
      groups: normalizeGroups(p?.groups),
      note: asStr(p?.note),
      opaque: [],
      fingerprint: JSON.stringify(p?.groups)
    };
  });
}

export function resolveLineOrderPrice(item: Record<string, unknown>): LineOrderPrice | null {
  const known = (val: unknown) => val != null && val !== '' && Number.isFinite(Number(val));
  if (known(item.subtotal)) return { amount: Number(item.subtotal), unit: false };
  const val = item.price ?? item.unit_price ?? item.unitPrice;
  return known(val) ? { amount: Number(val), unit: true } : null;
}

function splitPortionPrefix(text: string): { index: number | null; text: string } {
  const match = text.match(/^(?:第\s*(\d+)\s*份|Phần\s*(\d+))\s*[:：]\s*([\s\S]*)$/i);
  return match ? { index: Number(match[1] || match[2]) - 1, text: match[3] ?? '' } : { index: null, text };
}

export function normalizeLineOrderItem(raw: Record<string, unknown>): NormalizedLineOrderItem {
  const line = raw.detailLine as Record<string, unknown> | undefined;
  if (line && Array.isArray(line.portions)) {
    const quantity = asQty(line.quantity);
    return {
      name: asStr(line.name),
      quantity,
      price: resolveLineOrderPrice(line),
      note: asStr(line.note),
      common: [],
      portions: line.portions.map((portion: Record<string, unknown>, index: number) => ({
        index: Number.isInteger(portion.portionIndex) ? (portion.portionIndex as number) : index,
        groups: normalizeGroups(portion.groups),
        note: asStr(portion.note),
        opaque: [],
        fingerprint: JSON.stringify(portion.groups)
      })),
      complete:
        line.portions.length === quantity &&
        line.portions.every((portion: Record<string, unknown>, index: number) => portion.portionIndex === index)
    };
  }

  const bundle = normalizeBundlePortions(raw.bundleSelections || raw.bundle_snapshot_json);
  const portions: LineOrderPortion[] = bundle || [];
  const common: string[] = [];
  const getPortion = (index: number): LineOrderPortion => {
    let found = portions.find((entry) => entry.index === index);
    if (!found) {
      found = { index, groups: [], note: '', opaque: [] };
      portions.push(found);
    }
    return found;
  };

  const rawOptions = raw.options ?? raw.selected_options;
  const parsedOptions = parseJsonSafe(rawOptions);
  const options = Array.isArray(parsedOptions)
    ? parsedOptions
    : typeof rawOptions === 'string' && rawOptions.trim()
      ? [rawOptions]
      : [];
  const representedNotes = new Set<string>();

  for (const option of options) {
    const source =
      typeof option === 'string'
        ? option
        : asStr((option as { choice?: unknown; name?: unknown } | null)?.choice || (option as { name?: unknown } | null)?.name);
    if (!source) continue;
    const scoped = splitPortionPrefix(source);
    const noteMatch = scoped.text.match(/^(?:備註|Ghi chú|Note)\s*[:：]\s*([\s\S]*)$/i);
    const optPrice = option && typeof option === 'object' ? asNum((option as { price?: unknown }).price) : 0;
    const text = scoped.text + (optPrice ? ` (+$${optPrice})` : '');
    const target =
      scoped.index !== null && scoped.index >= 0 ? getPortion(scoped.index) : asQty(raw.quantity) === 1 ? getPortion(0) : null;
    if (noteMatch) {
      const noteValue = noteMatch[1] ?? '';
      representedNotes.add(`${scoped.index ?? ''}:${noteValue.normalize('NFC')}`);
      if (target) {
        target.note = [target.note, noteValue].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join('\n');
      } else {
        common.push(text);
      }
    } else if (target) {
      target.opaque.push(text);
    } else {
      common.push(text);
    }
  }

  let itemNote = '';
  for (const entry of asStr(raw.note || raw.notes).split(/\s*\|\s*(?=(?:第\s*\d+\s*份|Phần\s*\d+)\s*[:：])/i)) {
    if (!entry) continue;
    const scoped = splitPortionPrefix(entry);
    const value = scoped.text.replace(/^(?:備註|Ghi chú|Note)\s*[:：]\s*/i, '');
    if (representedNotes.has(`${scoped.index ?? ''}:${value.normalize('NFC')}`)) continue;
    if (scoped.index !== null && scoped.index >= 0) getPortion(scoped.index).note = value;
    else itemNote = entry;
  }

  const rawBundle = raw.bundleSelections || raw.bundle_snapshot_json;
  if (rawBundle && !bundle) {
    common.push(typeof rawBundle === 'string' ? rawBundle : JSON.stringify(rawBundle));
  }
  portions.sort((a, b) => a.index - b.index);
  const quantity = asQty(raw.quantity);
  return {
    name: asStr(raw.name || raw.item_name),
    quantity,
    price: resolveLineOrderPrice(raw),
    note: itemNote,
    common,
    portions,
    complete:
      Boolean(bundle) &&
      portions.length === quantity &&
      portions.every((portion, index) => portion.index === index && !portion.opaque.length)
  };
}

export function buildPortionRuns(model: NormalizedLineOrderItem): LineOrderPortionRun[] {
  const out: LineOrderPortionRun[] = [];
  if (model.portions.every((portion) => !portion.groups.length && !portion.note && !portion.opaque.length)) {
    return out;
  }
  for (const portion of model.portions) {
    const signature = JSON.stringify([portion.groups, portion.note, portion.opaque, portion.fingerprint]);
    const previous = out[out.length - 1];
    if (model.complete && previous && previous.end + 1 === portion.index && previous.signature === signature) {
      previous.end = portion.index;
    } else {
      out.push({ ...portion, end: portion.index, signature });
    }
  }
  return out;
}

export function formatPortionRunTitle(run: LineOrderPortionRun, locale: PosLocale | string): string {
  const labels = getLineOrderLabels(locale);
  const rangeLabel = run.end === run.index ? run.index + 1 : `${run.index + 1}–${run.end + 1}`;
  return `${labels.portion(rangeLabel)}${run.end > run.index ? ` · ${labels.same}` : ''}`;
}

export function formatPortionRunRows(
  run: Pick<LineOrderPortion, 'groups'>,
  locale: PosLocale | string
): Array<{ label: string; value: string }> {
  const labels = getLineOrderLabels(locale);
  return run.groups
    .filter((group) => group.choices.length > 0)
    .map((group) => ({
      label: group.name || labels.group,
      value: group.choices
        .map((choice) => {
          const amount = choiceExtra(choice);
          return `${choiceText(choice)}${amount ? ` (+$${amount})` : ''}`;
        })
        .join('、')
    }));
}

export function formatLineOrderText(model: NormalizedLineOrderItem, locale: PosLocale | string): string {
  const labels = getLineOrderLabels(locale);
  const amount = model.price;
  const out = [
    `${model.quantity}${locale === 'vi' ? ' × ' : '份 x '}${model.name}${amount ? ` ${amount.unit ? `${labels.unit} ` : ''}$${amount.amount}` : ''}`
  ];
  if (model.note) out.push(`   ↳ ${labels.itemNote}: ${model.note}`);
  model.common.forEach((entry) => out.push(`   ↳ ${entry}`));
  for (const run of buildPortionRuns(model)) {
    if (model.quantity > 1) out.push('', `   ↳ ${formatPortionRunTitle(run, locale)}:`);
    const indent = model.quantity > 1 ? '      ' : '   ';
    const rows = formatPortionRunRows(run, locale);
    for (const row of rows) out.push(`${indent}↳ ${row.label}：${row.value}`);
    run.opaque.forEach((entry) => out.push(`${indent}↳ ${entry}`));
    if (run.note) out.push(`${indent}↳ ${labels.note}: ${run.note}`);
    if (!rows.length && !run.opaque.length && !run.note) out.push(`${indent}↳ —`);
  }
  return out.join('\n');
}

const makeFlexText = (text: string, color = '#64748B'): LineFlexTextNode => ({
  type: 'text',
  text: text || '—',
  size: 'xs',
  color,
  wrap: true
});

const makeFlexRow = (label: string, value: string, color = '#1E293B'): LineFlexBoxNode => ({
  type: 'box',
  layout: 'horizontal',
  spacing: 'sm',
  contents: [
    { ...makeFlexText(label), flex: 2 },
    { ...makeFlexText(value, color), flex: 3 }
  ]
});

export function formatLineOrderFlex(model: NormalizedLineOrderItem, locale: PosLocale | string): LineFlexNode[] {
  const labels = getLineOrderLabels(locale);
  const contents: LineFlexNode[] = model.note
    ? [{ ...makeFlexRow(labels.itemNote, model.note, '#334155'), margin: 'xs' }]
    : [];
  contents.push(...model.common.map((entry) => makeFlexText(entry)));

  for (const run of buildPortionRuns(model)) {
    const body: LineFlexNode[] = [];
    if (model.quantity > 1) {
      body.push({ ...makeFlexText(formatPortionRunTitle(run, locale)), size: 'sm' });
    }
    const rows = formatPortionRunRows(run, locale);
    for (const row of rows) body.push(makeFlexRow(row.label, row.value));
    run.opaque.forEach((entry) => body.push(makeFlexText(entry, '#1E293B')));
    if (run.note) body.push(makeFlexRow(labels.note, run.note, '#334155'));
    if (!rows.length && !run.opaque.length && !run.note) body.push(makeFlexText('—'));
    if (body.length) {
      contents.push({
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        margin: 'xs',
        backgroundColor: '#F8FAFC',
        cornerRadius: 'md',
        paddingAll: '6px',
        contents: body
      });
    }
  }
  return contents;
}

export function utf8JsonByteLength(value: unknown): number {
  let size = 0;
  for (const char of JSON.stringify(value)) {
    const code = char.codePointAt(0) ?? 0;
    size += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
  }
  return size;
}

function splitFlexNode(node: LineFlexNode): LineFlexNode[] {
  if (node.type === 'text') {
    const chars = Array.from(node.text);
    const out: LineFlexNode[] = [];
    for (let i = 0; i < chars.length; i += 1000) {
      out.push({ ...node, text: chars.slice(i, i + 1000).join('') });
    }
    return out.length ? out : [node];
  }
  if (!node.contents || utf8JsonByteLength(node) < 7000) return [node];
  if (node.layout !== 'vertical') {
    return splitFlexNode({ type: 'box', layout: 'vertical', spacing: 'xs', contents: node.contents });
  }
  const first = node.contents[0];
  const context =
    first && (first.type === 'text' || first.layout === 'horizontal') && utf8JsonByteLength(first) < 2000
      ? [first]
      : [];
  const children = node.contents.slice(context.length).flatMap(splitFlexNode);
  const out: LineFlexNode[] = [];
  let current: LineFlexNode[] = [...context];
  for (const child of children) {
    if (current.length > context.length && utf8JsonByteLength({ ...node, contents: [...current, child] }) > 10000) {
      out.push({ ...node, contents: current });
      current = [...context];
    }
    current.push(child);
  }
  if (current.length) out.push({ ...node, contents: current });
  return out;
}

export function paginateLineOrderFlex(
  bubble: LineFlexBubble,
  items: LineFlexNode[]
): LineFlexPaginatedResult {
  if (utf8JsonByteLength(bubble) <= 28000) return bubble;
  const index = bubble.body.contents.findIndex(
    (block) => block.type === 'box' && block.contents.some((child) => items.includes(child))
  );
  const all = index < 0 ? bubble.body.contents : items;
  const template = (chunk: LineFlexNode[]): LineFlexBubble => ({
    ...bubble,
    body: {
      ...bubble.body,
      contents:
        index < 0
          ? chunk
          : bubble.body.contents.map((block, i) =>
              i === index && block.type === 'box'
                ? { ...block, contents: [...block.contents.filter((child) => !items.includes(child)), ...chunk] }
                : block
            )
    }
  });

  const bubbles: LineFlexBubble[] = [];
  let current: LineFlexNode[] = [];
  for (const node of all.flatMap(splitFlexNode)) {
    if (current.length && utf8JsonByteLength(template([...current, node])) > 26000) {
      bubbles.push(template(current));
      current = [];
    }
    current.push(node);
  }
  if (current.length) bubbles.push(template(current));
  if (bubbles.some((entry) => utf8JsonByteLength(entry) > 28000) && index >= 0) {
    return paginateLineOrderFlex(bubble, []);
  }
  if (bubbles.length > 1) {
    bubbles.forEach((entry, idx) => {
      entry.body.contents.unshift({
        type: 'text',
        text: `明細 ${idx + 1}/${bubbles.length}`,
        size: 'xs',
        color: '#64748B'
      });
    });
  }

  const pages: LineFlexReceiptPage[] = [];
  let carousel: LineFlexBubble[] = [];
  for (const entry of bubbles) {
    if (carousel.length && (carousel.length === 12 || utf8JsonByteLength({ type: 'carousel', contents: [...carousel, entry] }) > 48000)) {
      pages.push(carousel.length === 1 ? carousel[0]! : { type: 'carousel', contents: carousel });
      carousel = [];
    }
    carousel.push(entry);
  }
  if (carousel.length) {
    pages.push(carousel.length === 1 ? carousel[0]! : { type: 'carousel', contents: carousel });
  }
  return pages.length === 1 ? pages[0]! : { type: 'receipt-pages', pages };
}
