export interface LegacyGlobalChoice {
  label: string;
  value: string;
}

export interface LegacyReceiptLine {
  text: string;
  isOption: boolean;
}

export interface LegacyOrderInput {
  content?: string | null;
  raw_content?: string | null;
  customizations?: Array<{ label?: string; title?: string; value?: string; choice?: string }> | null;
  items?: LegacyRawOrderItem[] | null;
  roundCount?: number | null;
  round_count?: number | null;
}

export interface LegacyRawOrderItem {
  name?: string;
  item_name?: string;
  quantity?: number | string;
  price?: number | string | null;
  unit_price?: number | string | null;
  unitPrice?: number | string | null;
  subtotal?: number | string | null;
  options?: unknown;
  selected_options?: unknown;
  bundleSelections?: unknown;
  bundle_snapshot_json?: unknown;
  note?: string | null;
  notes?: string | null;
  round?: string | null;
  round_number?: number | null;
}

export interface LegacyAdaptedOrderItem {
  name: string;
  quantity: number;
  price: string;
  unitPrice?: string;
  options: string;
  baseOptions?: string;
  bundle_snapshot_json?: string | null;
  bundleData?: unknown;
  note: string;
  round: string;
  _lineTotal?: number | null;
  originalQty?: number;
  unitIndex?: number;
}

export interface LegacyAdapterCallbacks {
  lookupItemPrice?: (name: string) => number | string | null | undefined;
  parseBundleSnapshotData?: (raw: unknown) => unknown;
  extractBundleOptions?: (bundleData: unknown, qty: number) => unknown[];
  formatPrintOptions?: (options: unknown) => string;
  remainingItemNote?: (baseOptions: unknown, rawNote: unknown) => string;
  stripPrintOptionSurcharges?: (optionLine: string) => string;
  itemNoteKey?: (line: string, preferLabel?: boolean) => string | null;
  parsePortionCustomizations?: (options: string) => {
    commonChips?: string[];
    portions?: Array<{ chips: string[] }>;
  } | null;
}

/** Extracts global customization pairs from historical plain-text order content. */
export function extractLegacyFlavors(content: string | null | undefined): LegacyGlobalChoice[] {
  const choices: LegacyGlobalChoice[] = [];
  let inSection = false;
  for (const source of String(content || '').split('\n')) {
    const line = source.trim();
    const heading = line.match(
      /^(?:[🧂🧪🎛️【\s]*)(?:口味設定|客製化設定|客製設定|Khẩu vị|Hương vị|Tùy chọn khẩu vị)[：:]\s*(.*)$/u
    );
    if (heading) {
      inSection = true;
      if (heading[1]) {
        for (const part of heading[1].replace(/】$/, '').split(/[・·|｜]/)) {
          const pair = part.trim().match(/^([^：:]+)[：:]\s*(.+)$/);
          if (pair) choices.push({ label: (pair[1] ?? '').trim(), value: pair[2] ?? '' });
        }
      }
      continue;
    }
    if (!line) continue;
    const bullet = line.match(/^[•●*\-]\s*([^：:]+)[：:]\s*(.+)$/);
    if (inSection && bullet) {
      choices.push({ label: (bullet[1] ?? '').trim(), value: bullet[2] ?? '' });
      continue;
    }
    inSection = false;
  }
  return choices;
}

/** Extracts global customization choices from legacy order object or content string. */
export function extractLegacyGlobalChoices(order: LegacyOrderInput): LegacyGlobalChoice[] {
  if (Array.isArray(order.customizations)) {
    return order.customizations.map((choice) => ({
      label: choice.label || choice.title || '',
      value: choice.value || choice.choice || ''
    }));
  }
  return extractLegacyFlavors(order.content || order.raw_content);
}

/** Extracts deduplicated receipt display lines from historical plain-text order content. */
export function extractLegacyReceiptLines(
  content: string | null | undefined,
  noteKey: (line: string, preferLabel: boolean) => string | null
): LegacyReceiptLine[] {
  const result: LegacyReceiptLine[] = [];
  const seen = new Set<string>();
  let globalSection = false;

  for (const raw of String(content || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(?:[🧂🧪🎛️【\s]*)(?:口味設定|客製化設定|客製設定)[：:]/u.test(line)) {
      globalSection = true;
      continue;
    }
    if (globalSection && /^[•●*\-]/.test(line)) continue;
    globalSection = false;
    const isOption = /^[↳\-+]/.test(line);
    const text = isOption ? line.replace(/^[↳\-+]\s*/, '') : line;
    if (!isOption) seen.clear();
    const key = isOption ? noteKey(text, true) : null;
    if (key !== null) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    result.push({ text, isOption });
  }
  return result;
}

function defaultFormatPrintOptions(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const obj = entry as { choice?: unknown; name?: unknown; label?: unknown };
          return String(obj.choice || obj.name || obj.label || '');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return typeof raw === 'string' ? raw : '';
}

/** Adapts legacy orders without detailSnapshot into printable/display item rows. */
export function extractLegacyOrderItems(
  order: LegacyOrderInput,
  expand = true,
  callbacks: LegacyAdapterCallbacks = {}
): LegacyAdaptedOrderItem[] {
  const parseBundle = callbacks.parseBundleSnapshotData ?? ((raw: unknown) => {
    if (!raw) return null;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    }
    return raw;
  });
  const extractBundleOpts = callbacks.extractBundleOptions ?? (() => []);
  const formatOpts = callbacks.formatPrintOptions ?? defaultFormatPrintOptions;
  const remainingNote = callbacks.remainingItemNote ?? ((_base: unknown, rawNote: unknown) => String(rawNote || ''));
  const stripSurcharges = callbacks.stripPrintOptionSurcharges ?? ((opt: string) => opt);
  const noteKey = callbacks.itemNoteKey ?? (() => null);

  const items: LegacyAdaptedOrderItem[] = [];
  if (Array.isArray(order.items) && order.items.length > 0) {
    for (const it of order.items) {
      let rawPrice = it.price ?? it.unit_price ?? it.unitPrice;
      const itemName = it.name || it.item_name || '餐點';
      if ((rawPrice == null || rawPrice === '') && callbacks.lookupItemPrice) {
        rawPrice = callbacks.lookupItemPrice(itemName);
      }
      const qty = Math.max(1, Number(it.quantity) || 1);
      const unitNum =
        rawPrice != null && rawPrice !== '' ? Number(String(rawPrice).replace(/[^0-9.]/g, '')) || 0 : null;

      let lineTotal: number | null = null;
      if (it.subtotal != null && it.subtotal !== '' && !Number.isNaN(Number(it.subtotal))) {
        lineTotal = Number(it.subtotal);
      } else if (unitNum != null && !Number.isNaN(unitNum)) {
        let optExtra = 0;
        let rawOptions = it.options ?? it.selected_options;
        if (typeof rawOptions === 'string') {
          try {
            rawOptions = JSON.parse(rawOptions) as unknown;
          } catch {
            // Keep string fallback.
          }
        }
        if (Array.isArray(rawOptions)) {
          for (const opt of rawOptions) {
            if (opt && typeof opt === 'object' && 'price' in opt && Number((opt as { price: unknown }).price) > 0) {
              optExtra += Number((opt as { price: unknown }).price);
            }
          }
        }
        let bundleExtra = 0;
        const bundleData = parseBundle(it.bundleSelections ?? it.bundle_snapshot_json);
        if (bundleData && typeof bundleData === 'object') {
          const maybePortions = Array.isArray((bundleData as { portions?: unknown[] }).portions)
            ? (bundleData as { portions: Array<{ groups?: Array<{ items?: Array<Record<string, unknown>> }> }> }).portions
            : Array.isArray(bundleData)
              ? (bundleData as Array<{ groups?: Array<{ items?: Array<Record<string, unknown>> }> }>)
              : null;
          if (maybePortions) {
            for (const portion of maybePortions) {
              for (const group of portion.groups || []) {
                for (const bi of group.items || []) {
                  const mods = Array.isArray(bi.modifiers) ? (bi.modifiers as Array<{ price?: number }>) : [];
                  const sur =
                    Number(bi.surcharge || 0) + mods.reduce((sum, mod) => sum + Number(mod.price || 0), 0);
                  if (sur > 0) {
                    bundleExtra += sur * (Number(bi.quantity) || 1);
                  }
                }
              }
            }
          }
        }
        lineTotal = unitNum * qty + optExtra + bundleExtra;
      }

      const bundleData = parseBundle(it.bundleSelections ?? it.bundle_snapshot_json);
      const bundleOpts = extractBundleOpts(bundleData, qty);

      let baseOptions = it.options ?? it.selected_options;
      if (typeof baseOptions === 'string') {
        try {
          baseOptions = JSON.parse(baseOptions) as unknown;
        } catch {
          // Keep string fallback.
        }
      }

      let combinedOptionsList: unknown[];
      if (Array.isArray(baseOptions)) {
        combinedOptionsList = [...baseOptions, ...bundleOpts];
      } else if (typeof baseOptions === 'string' && baseOptions.trim()) {
        combinedOptionsList = [baseOptions, ...bundleOpts];
      } else {
        combinedOptionsList = bundleOpts;
      }

      if (combinedOptionsList.length === 0 && order.content) {
        const contentLines = String(order.content).split('\n');
        let matchedItem = false;
        const fallbackOpts: string[] = [];
        for (const cLine of contentLines) {
          const trimmed = cLine.trim();
          if (!matchedItem && (trimmed.includes(itemName) || (trimmed.startsWith(`${qty}份`) && trimmed.includes(itemName)))) {
            matchedItem = true;
            continue;
          }
          if (matchedItem) {
            if (!trimmed.startsWith('↳') && !trimmed.startsWith('-') && !trimmed.startsWith('•') && trimmed.length > 0) {
              break;
            }
            if (
              trimmed.startsWith('↳') ||
              (trimmed.startsWith('-') &&
                !trimmed.includes('口味設定') &&
                !trimmed.includes('備註') &&
                !trimmed.includes('Ghi chú') &&
                !trimmed.includes('Khẩu vị') &&
                !trimmed.includes('Hương vị'))
            ) {
              fallbackOpts.push(trimmed);
            }
          }
        }
        if (fallbackOpts.length > 0) {
          combinedOptionsList = [...combinedOptionsList, ...fallbackOpts];
        }
      }

      const itemPrice =
        lineTotal != null
          ? `$${lineTotal}`
          : rawPrice != null && rawPrice !== ''
            ? String(rawPrice).startsWith('$')
              ? String(rawPrice)
              : `$${rawPrice}`
            : '';

      items.push({
        name: itemName,
        quantity: qty,
        price: itemPrice,
        unitPrice: unitNum != null ? `$${unitNum}` : '',
        options: formatOpts(combinedOptionsList),
        baseOptions: formatOpts(baseOptions ? (Array.isArray(baseOptions) ? baseOptions : [baseOptions]) : []),
        bundle_snapshot_json:
          typeof it.bundle_snapshot_json === 'string'
            ? it.bundle_snapshot_json
            : it.bundleSelections
              ? typeof it.bundleSelections === 'string'
                ? it.bundleSelections
                : JSON.stringify(it.bundleSelections)
              : null,
        bundleData,
        note: remainingNote(baseOptions, it.note || it.notes),
        round:
          it.round ||
          (Number(order.roundCount || order.round_count) > 1 ? `[第${it.round_number || 1}輪]` : '')
      });
    }
  } else {
    const lines = (order.content || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    let currentItem: LegacyAdaptedOrderItem | null = null;
    let currentRound = '';

    for (const line of lines) {
      if ((line.startsWith('[第') || line.startsWith('[Đợt')) && line.endsWith(']')) {
        currentRound = line;
        continue;
      }
      const isSubOption =
        line.startsWith('↳') || line.startsWith('-') || line.startsWith('+') || line.startsWith('•') || line.startsWith('－');
      if (isSubOption) {
        if (currentItem) {
          const opt = line.replace(/^[↳\-+•－]\s*/, '').trim();
          const printOpt = stripSurcharges(opt);
          currentItem.options = currentItem.options ? `${currentItem.options}\n${printOpt}` : printOpt;
          const addMatch = opt.match(/(?:\(\s*\+\s*\$|\+\s*\$)(\d+(?:\.\d+)?)/);
          if (addMatch && currentItem._lineTotal != null) {
            currentItem._lineTotal += Number(addMatch[1]) || 0;
            currentItem.price = `$${currentItem._lineTotal}`;
          }
        }
        continue;
      }

      if (
        line.startsWith('----') ||
        line.startsWith('====') ||
        line.includes('【') ||
        line.includes('訂單') ||
        line.includes('總金額') ||
        line.includes('總計') ||
        line.includes('時間') ||
        line.includes('用餐方式') ||
        line.includes('桌號') ||
        line.includes('聯絡電話') ||
        line.includes('備註') ||
        line.includes('付款') ||
        line.includes('取餐') ||
        line.startsWith('📍') ||
        line.startsWith('📞') ||
        line.startsWith('👤') ||
        line.startsWith('📝') ||
        line.startsWith('💰') ||
        line.includes('Hình thức') ||
        line.includes('Bàn số') ||
        line.includes('Số bàn') ||
        line.includes('Ghi chú') ||
        line.includes('Thanh toán') ||
        line.includes('Tổng cộng') ||
        line.includes('口味設定') ||
        line.includes('Khẩu vị') ||
        line.includes('Hương vị') ||
        line.startsWith('🧂') ||
        line.startsWith('📦')
      ) {
        continue;
      }

      const priceMatch = line.match(/\$[\d,.]+/);
      let rawNum = priceMatch ? Number(priceMatch[0].replace(/[^0-9.]/g, '')) : null;
      const match =
        line.match(/^(\d+)\s*(?:份|x|X)\s*(?:x\s*)?(.+)$/) || line.match(/^(.+?)\s*[xX*]\s*(\d+)$/);
      const qty = match ? Number(match[1]) || Number(match[2]) || 1 : 1;
      const name = (match ? match[2] || match[1] || line : line).replace(/\$[\d,.]+/g, '').trim();
      if ((rawNum == null || Number.isNaN(rawNum)) && name && callbacks.lookupItemPrice) {
        const lp = callbacks.lookupItemPrice(name);
        if (lp != null) rawNum = Number(lp);
      }
      const totalNum = rawNum != null ? (match ? rawNum * qty : rawNum) : null;
      currentItem = {
        name,
        quantity: qty,
        price: totalNum != null ? `$${totalNum}` : '',
        _lineTotal: totalNum,
        options: '',
        note: '',
        round: currentRound
      };
      items.push(currentItem);
    }
  }

  if (items.length === 0) {
    items.push({ name: '特餐餐點', quantity: 1, price: '', options: '', note: '', round: '' });
  }

  for (const item of items) {
    if (item.options) {
      item.options = formatOpts(item.options);
    }
    const seenNotes = new Set<string>();
    item.options = String(item.options || '')
      .split('\n')
      .filter((line) => {
        const key = noteKey(line, true);
        if (key === null) return true;
        if (seenNotes.has(key)) return false;
        seenNotes.add(key);
        return true;
      })
      .join('\n');
  }

  if (!expand) return items;

  const expanded: LegacyAdaptedOrderItem[] = [];
  for (const it of items) {
    const qty = Math.max(1, parseInt(String(it.quantity), 10) || 1);
    const parsedPortions = callbacks.parsePortionCustomizations ? callbacks.parsePortionCustomizations(it.options) : null;
    for (let q = 0; q < qty; q++) {
      let unitOptions = it.options;
      if (parsedPortions?.portions && parsedPortions.portions.length > 0) {
        const matched = parsedPortions.portions[q];
        const combined = [...(parsedPortions.commonChips || []), ...(matched?.chips || [])];
        unitOptions = combined.length > 0 ? combined.join('、') : '';
      }
      expanded.push({
        ...it,
        options: unitOptions,
        quantity: 1,
        originalQty: qty,
        unitIndex: q + 1
      });
    }
  }
  return expanded;
}
