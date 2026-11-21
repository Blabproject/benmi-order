import { memo } from 'react';
import type { DetailChoice, DetailGroup, DetailLine, HistoryOrderDto, OrderDetailSnapshot } from '@shared/contracts/api';
import { Button } from '@shared/ui/button';
import { ReceiptIcon } from '@shared/ui/PosIcons';
import { LegacyOrderItems, prepareLegacyOrderItems } from './LegacyOrderItems';

declare function t(key: string, params?: Record<string, number>): string;
declare const OrderDetailView: {
  isSnapshot(value: unknown): value is OrderDetailSnapshot;
  choiceText(choice: DetailChoice): string;
  extra(choice: DetailChoice): number;
  choices(groups: DetailGroup[]): { label: string; value: string }[];
};
declare const PrinterService: {
  printSingleItemSticker(key: string, index: number): void;
  printItemRangeStickers(key: string, index: number, quantity: number, name: string): void;
};

function Note({ text, label }: { text: string; label: string }) {
  return text?.trim() ? <div className="detail-group-row detail-note-row">
    <span className="detail-group-label">{t(label)}</span><div className="detail-note-text">{text}</div>
  </div> : null;
}

function Group({ group }: { group: DetailGroup }) {
  if (!group.items?.length) return null;
  return <div className="detail-group-row">
    <span className="detail-group-label">{group.groupName || t('detailOptionGroup')}</span>
    <div className="detail-group-choices">
      {group.items.map((choice, index) => {
        const extra = OrderDetailView.extra(choice);
        return <span className="mod-chip detail-choice-chip" key={`${choice.optionId}-${index}`}>
          <span>{OrderDetailView.choiceText({ ...choice, quantity: 1 })}</span>
          {choice.quantity > 1 && <span className="detail-choice-qty">×{choice.quantity}</span>}
          {extra !== 0 && <span className="detail-choice-extra">+${extra}</span>}
        </span>;
      })}
    </div>
  </div>;
}

function OrderLine({ line, orderKey, index, stickerIndex }: { line: DetailLine; orderKey: string; index: number; stickerIndex: number }) {
  const quantity = Math.max(1, line.quantity || 1);
  const label = quantity > 1 ? t('btnPrintAllPortionsShort', { n: quantity }) : t('btnPrintStickerShort');
  const hasPortionDetails = line.portions.some(portion => portion.note?.trim() || portion.groups.some(group => group.items?.length));

  return <div className="review-item-row" id={`review-item-${orderKey}-${index}`}>
    <div className="review-item-header">
      <div className="review-item-name">
        <span className="review-item-qty-badge">{quantity}×</span><span className="review-item-name-text">{line.name}</span>
      </div>
      <div className="review-item-meta-right">
        <span className="review-item-price">${line.subtotal}</span>
        <Button className="btn btn-ghost review-item-print-btn" data-print-action="stickers" data-print-action-title={label}
          title={label} onClick={() => quantity > 1
            ? PrinterService.printItemRangeStickers(orderKey, stickerIndex, quantity, line.name)
            : PrinterService.printSingleItemSticker(orderKey, stickerIndex)}>
          <ReceiptIcon size={14} /><span>{label}</span>
        </Button>
      </div>
    </div>
    {hasPortionDetails && line.portions.map(portion => {
      const groups = portion.groups.filter(group => group.items?.length);
      const hasNote = Boolean(portion.note?.trim());
      if (quantity === 1 && !groups.length && !hasNote) return null;
      return <section className="review-item-portion-row detail-portion-block" key={portion.portionIndex}>
        {quantity > 1 && <div className="detail-portion-heading"><span className="portion-badge">{t('detailPortion', { n: portion.portionIndex + 1 })}</span></div>}
        <div className="detail-portion-content">
          {groups.map((group, position) => <Group group={group} key={`${group.groupId}-${position}`} />)}
          <Note text={portion.note} label="detailPortionNote" />
          {!groups.length && !hasNote && <span className="portion-default-chip">—</span>}
        </div>
      </section>;
    })}
    <Note text={line.note} label="detailItemNote" />
  </div>;
}

function OrderRounds({ orderKey, snapshot }: { orderKey: string; snapshot: OrderDetailSnapshot }) {
  let index = 0;
  let stickerIndex = 0;
  const rounds = snapshot.rounds.map(round => ({
    round,
    lines: round.items.map(line => {
      const entry = { line, index: index++, stickerIndex };
      stickerIndex += Math.max(1, line.quantity || 1);
      return entry;
    }),
  }));
  return <>{rounds.reverse().map(({ round, lines }) => {
    const choices = OrderDetailView.choices(round.groups);
    return <section className="round-section-block" key={round.roundNumber}>
      {rounds.length > 1 && <div className="round-section-header">{t('detailRound', { n: round.roundNumber })}</div>}
      {round.legacyContent !== undefined ? <>
        <div>{t('detailLegacy')}</div>
        <div className="review-content-raw" style={{ whiteSpace: 'pre-wrap' }}>{round.legacyContent}</div>
      </> : <>
        {(choices.length > 0 || round.note?.trim()) && <div className="flavor-custom-card">
          <div className="flavor-chips-grid">
            {choices.map((choice, position) => <span className="flavor-chip" key={position}>
              <span className="flavor-label">{choice.label}:</span><strong className="flavor-val">{choice.value}</strong>
            </span>)}
          </div>
          <Note text={round.note} label="detailRoundNote" />
        </div>}
        {lines.map(entry => <OrderLine key={entry.index} orderKey={orderKey} {...entry} />)}
      </>}
    </section>;
  })}</>;
}

export function prepareOrderItems(order: HistoryOrderDto) {
  if (OrderDetailView.isSnapshot(order.detailSnapshot)) return { snapshot: order.detailSnapshot };
  return { legacy: prepareLegacyOrderItems(order) };
}

export const OrderDetailItems = memo(function OrderDetailItems({ orderKey, data }: { orderKey: string; data: ReturnType<typeof prepareOrderItems> }) {
  if (data.snapshot) return <div className="detail-content" id="review-content">
    <OrderRounds orderKey={orderKey} snapshot={data.snapshot} />
  </div>;
  return <div className="detail-content" id="review-content"><LegacyOrderItems data={data.legacy} /></div>;
});
