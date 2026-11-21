import type { HistoryOrderDto } from '@shared/contracts/api';
import { Button } from '@shared/ui/button';
import { DineInIcon, ModifyIcon, ReceiptIcon } from '@shared/ui/PosIcons';

type LegacyPortion = { label: string; chips: string[] };
type BundleItem = { name?: string; item_name?: string; quantity: number; surcharge?: number; modifiers?: { name: string; price?: number }[] };
type BundleGroup = { groupName?: string; group_name?: string; portionLabel?: string; items: BundleItem[] };
type BundlePortion = { portionIndex?: number; groups?: BundleGroup[] };
type Bundle = { isStructured: boolean; portions?: BundlePortion[]; textGroups?: BundleGroup[]; remainingOptionsStr?: string };
type LegacyItem = { name: string; quantity: number; price?: string; options?: string; baseOptions?: string | null; note?: string; round?: string; stickerIndex: number };
type Flavor = { label: string; value: string };
type LegacyReview = {
  raw: string; messageOnly: boolean; orderKey: string; items: LegacyItem[];
  customerChanges: string[]; flavorData: { flavors: Flavor[]; extraIngredients: (Flavor | string)[] } | null; noteText: string;
};

declare function t(key: string, params?: Record<string, number>): string;
declare function getLegacyOrderReviewData(order: HistoryOrderDto): LegacyReview;
declare function extractBundleFromItem(item: LegacyItem): Bundle | null;
declare function parsePortionCustomizations(options: string): { commonChips: string[]; portions: LegacyPortion[] } | null;
declare function reviewPortionNumber(label: string): number | null;
declare function isOrderMetadataText(value: string): boolean;
declare function lookupItemPrice(name: string): number | null;
declare const PrinterService: {
  remainingItemNote(options: string | undefined, note: string): string;
  printSingleItemSticker(key: string, index: number): void;
  printItemRangeStickers(key: string, index: number, quantity: number, name: string): void;
};

export function prepareLegacyOrderItems(order: HistoryOrderDto) {
  return getLegacyOrderReviewData(order);
}

function LegacyNote({ text, label }: { text: string; label: string }) {
  return text.trim() ? <div className="detail-group-row detail-note-row">
    <span className="detail-group-label">{t(label)}</span><div className="detail-note-text">{text}</div>
  </div> : null;
}

function PortionChips({ portion }: { portion: LegacyPortion }) {
  return <>{portion.chips.map((chip, index) => {
    const match = chip.match(/^(?:備註|Ghi chú|Note)\s*[:：]\s*([\s\S]*)$/i);
    return match?.[1] !== undefined ? <LegacyNote key={index} text={match[1]} label="detailPortionNote" />
      : <span className="mod-chip" key={index}>{chip}</span>;
  })}</>;
}

function PortionPrint({ orderKey, stickerIndex }: { orderKey: string; stickerIndex: number }) {
  return <Button className="btn btn-ghost portion-print-btn" data-print-action="stickers" title={t('btnPrintPortion')}
    onClick={() => PrinterService.printSingleItemSticker(orderKey, stickerIndex)}>
    <ReceiptIcon size={14} /><span>{t('btnPrintStickerShort')}</span>
  </Button>;
}

function BundleGroups({ groups }: { groups: BundleGroup[] }) {
  return <>{groups.filter(group => group.items?.length).map((group, index) => <div className="bundle-group-row" key={index}>
    <span className="bundle-group-label">{group.portionLabel ? group.portionLabel + ' ' : ''}{group.groupName || group.group_name || t('bundleGroupFallback')}</span>
    <div className="bundle-group-items">{group.items.map((item, position) => {
      const quantity = Number(item.quantity) || 1;
      const add = Number(item.surcharge || 0) + (item.modifiers || []).reduce((sum, mod) => sum + Number(mod.price || 0), 0);
      const modifierNames = (item.modifiers || []).map(mod => mod.name).filter(Boolean).join('、');
      return <span className="bundle-item-chip" key={position}>
        <span className="bundle-item-name">{item.name || item.item_name}</span>
        {modifierNames && <span className="bundle-item-modifiers">{modifierNames}</span>}
        <span className="bundle-item-qty">x{quantity}</span>
        {add > 0 && <span className="bundle-item-surcharge">(+${add * quantity})</span>}
      </span>;
    })}</div>
  </div>)}</>;
}

function LegacyLine({ item, orderKey, index }: { item: LegacyItem; orderKey: string; index: number }) {
  const quantity = Math.max(1, Number.parseInt(String(item.quantity), 10) || 1);
  const start = item.stickerIndex;
  const bundle = extractBundleFromItem(item);
  const options = item.baseOptions ?? bundle?.remainingOptionsStr ?? item.options;
  const parsed = options ? parsePortionCustomizations(String(options).trim()) : null;
  const bundlePortions = bundle?.isStructured ? bundle.portions ?? [] : [];
  const portionNumber = (portion: BundlePortion, position: number) => (portion.portionIndex ?? position) + 1;
  const attached = new Map<number, LegacyPortion[]>();
  const unmatched = (parsed?.portions ?? []).flatMap((portion, position) => {
    const number = reviewPortionNumber(portion.label);
    if (number && bundlePortions.some((block, blockIndex) => portionNumber(block, blockIndex) === number)) {
      const matches = attached.get(number) ?? [];
      matches.push(portion);
      attached.set(number, matches);
      return [];
    }
    return [{ portion, position, number }];
  });
  const hasLegacyPortions = parsed?.portions.some(portion => portion.chips.some(chip => !['', '—', '-', '預設', 'mặc định'].includes(chip.trim().toLowerCase())));
  const label = quantity > 1 ? t('btnPrintAllPortionsShort', { n: quantity }) : t('btnPrintStickerShort');
  let price = item.price;
  if ((!price || price === '—') && item.name) {
    const lookup = lookupItemPrice(item.name);
    if (lookup != null) price = `$${Number(lookup) * quantity}`;
  }
  const note = item.note ? PrinterService.remainingItemNote(options, item.note) : '';
  const chips = parsed?.portions.length ? parsed.commonChips : String(options || '').split('\n').map(line => line.trim()).filter(Boolean);

  return <div className="review-item-row" id={`review-item-${orderKey}-${index}`}>
    <div className="review-item-header">
      <div className="review-item-name"><span className="review-item-qty-badge">{quantity}×</span><span className="review-item-name-text">{item.name}</span></div>
      <div className="review-item-meta-right">
        <span className={`review-item-price${!price || price === '—' ? ' is-empty' : ''}`}>{price || '—'}</span>
        <Button className="btn btn-ghost review-item-print-btn" data-print-action="stickers" data-print-action-title={label} title={label}
          onClick={() => quantity > 1 ? PrinterService.printItemRangeStickers(orderKey, start, quantity, item.name) : PrinterService.printSingleItemSticker(orderKey, start)}>
          <ReceiptIcon size={14} /><span>{label}</span>
        </Button>
      </div>
    </div>
    {(bundlePortions.length > 0 || Boolean(bundle?.textGroups?.some(group => group.items?.length))) && <div className="bundle-components-container">
      <div className="bundle-components-header"><ReceiptIcon /><span>{t('bundleSelectionsTitle')}</span></div>
      <div className="bundle-portions-list">
        {bundlePortions.length ? bundlePortions.map((portion, position) => {
          const number = portionNumber(portion, position);
          const matches = attached.get(number) ?? [];
          const groups = portion.groups ?? [];
          return <div className="bundle-portion-block detail-portion-block" key={number}>
            {bundlePortions.length > 1 && <div className="detail-portion-heading"><span className="portion-badge">{t('bundlePortionPrefix', { n: number })}</span></div>}
            <div className="detail-portion-content">
              <BundleGroups groups={groups} />
              {matches.map((match, i) => <PortionChips key={i} portion={match} />)}
              {!groups.some(group => group.items?.length) && !matches.length && <span className="portion-default-chip">—</span>}
            </div>
            {matches.length > 0 && <PortionPrint orderKey={orderKey} stickerIndex={start + number - 1} />}
          </div>;
        }) : <BundleGroups groups={bundle?.textGroups ?? []} />}
      </div>
    </div>}
    {chips.length > 0 && <div className="review-item-options">
      {chips.map((chip, i) => <span className={`mod-chip${!parsed?.portions.length && /^(備註|Ghi chú|Note)/.test(chip) ? ' mod-chip-note' : ''}`} key={i}>{chip}</span>)}
    </div>}
    {hasLegacyPortions && <div className="review-item-portions-container">
      {unmatched.map(({ portion, position, number }) => <div className="review-item-portion-row detail-portion-block" key={position}>
        <div className="detail-portion-heading"><span className="portion-badge">{portion.label}</span></div>
        <div className="portion-chips-wrap detail-legacy-lines">
          {portion.chips.length ? <PortionChips portion={portion} /> : <span className="portion-default-chip">—</span>}
        </div>
        <PortionPrint orderKey={orderKey} stickerIndex={start + (number ? number - 1 : position)} />
      </div>)}
    </div>}
    <LegacyNote text={note} label="detailItemNote" />
  </div>;
}

function FlavorCard({ flavors, note }: { flavors: LegacyReview['flavorData']; note: string }) {
  if (!flavors && !note) return null;
  const cleanNote = note.replace(/^["“”']+|["“”']+$/g, '').trim();
  return <div className="flavor-custom-card">
    {flavors && <>
      <div className="flavor-card-header"><ModifyIcon /><span>{t('flavorTitle')}</span></div>
      <div className="flavor-chips-grid">
        {flavors.flavors.map(({ label, value }, index) => <span className="flavor-chip" key={index}>
          {label && <span className="flavor-label">{label}:</span>}<strong className="flavor-val">{value}</strong>
        </span>)}
        {flavors.extraIngredients.map((extra, index) => <span className="flavor-chip extra-chip" key={index}>
          <span className="flavor-label">{typeof extra === 'string' ? t('extraIngredientLabel') : extra.label || t('extraIngredientLabel')}:</span>
          <strong className="flavor-val">{typeof extra === 'string' ? extra : extra.value}</strong>
        </span>)}
      </div>
    </>}
    {note && <div className={`flavor-card-note order-note-alert ${flavors ? 'has-flavors' : 'note-only'}`}>
      <span className="flavor-note-label order-note-alert-header"><ModifyIcon /><span>{t('customerNoteLabel')}：</span></span>
      <span className="flavor-note-val order-note-alert-body">“{cleanNote}”</span>
    </div>}
  </div>;
}

export function LegacyOrderItems({ data }: { data: LegacyReview }) {
  const { raw, messageOnly, orderKey, items, customerChanges, flavorData, noteText } = data;
  if (messageOnly) return <div className="review-content-raw">{raw}</div>;
  const lines = items.length ? [] : raw.split('\n').map(line => line.trimEnd()).filter(line => line.trim() && !isOrderMetadataText(line));
  if (!items.length && !lines.length) return <div className="review-content-empty">-</div>;

  const rounds = new Map<string, { item: LegacyItem; index: number }[]>();
  if (raw.includes('[第') || raw.includes('[Đợt')) items.forEach((item, index) => {
    const label = item.round || t('roundBlockInitial');
    const collection = rounds.get(label) ?? [];
    collection.push({ item, index });
    rounds.set(label, collection);
  });
  const roundNumber = (label: string) => Number(label.match(/(?:第\s*(\d+)\s*輪|Đợt\s*(\d+))/i)?.slice(1).find(Boolean)) || 1;

  return <div className="review-content-card">
    {customerChanges.length > 0 && <div className="customer-change-card">
      <div className="customer-change-header"><ModifyIcon /><span>{t('customerChangeTitle')}</span></div>
      <div className="customer-change-body">{customerChanges.map((line, index) => <div className="customer-change-line" key={index}>{line}</div>)}</div>
    </div>}
    <FlavorCard flavors={flavorData} note={noteText} />
    {rounds.size > 0 ? [...rounds.entries()].sort(([a], [b]) => roundNumber(b) - roundNumber(a)).map(([title, entries], index) => {
      const latest = rounds.size > 1 && index === 0;
      return <div className={`round-section-block${latest ? ' round-section-latest' : ''}`} key={title}>
        <div className="round-section-header">
          <span className="round-title"><DineInIcon />{title.replace(/^\[|\]$/g, '')}</span>
          {latest && <span className="round-latest-badge">{t('roundBlockLatest')}</span>}
        </div>
        <div className="round-items-container">{entries.map(entry => <LegacyLine key={entry.index} orderKey={orderKey} {...entry} />)}</div>
      </div>;
    }) : items.length ? <div className="review-items-list">
      {items.map((item, index) => <LegacyLine key={index} orderKey={orderKey} item={item} index={index} />)}
    </div> : <div className="review-items-list-raw">
      {lines.map((line, index) => <div className={/^[-•↳－]/.test(line.trimStart()) ? 'review-raw-sub' : 'review-raw-item'} key={index}>{line}</div>)}
    </div>}
  </div>;
}
