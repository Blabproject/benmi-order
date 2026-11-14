import type { DetailChoice, DetailGroup, DetailPortion, OrderDetailSnapshot } from './api';

export interface FormattedDetailChoice {
  groupId: string;
  optionId: string;
  label: string;
  value: string;
  price: number;
}

export interface FormattedDetailLineOption extends FormattedDetailChoice {
  choice: string;
}

export interface FormattedDetailLine {
  lineId: string;
  itemId: string;
  name: string;
  category: string;
  quantity: number;
  price: number;
  unit_price: number;
  subtotal: number;
  note: string;
  notes: string;
  options: FormattedDetailLineOption[];
  round_number: number;
}

export interface FormattedGlobalChoice extends FormattedDetailChoice {
  roundNumber: number;
}

export function isOrderDetailSnapshot(value: unknown): value is OrderDetailSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OrderDetailSnapshot>;
  return candidate.schemaVersion === 1 && Array.isArray(candidate.rounds);
}

export function formatDetailChoiceText(choice: DetailChoice): string {
  const children = (choice.groups ?? []).flatMap((group) => group.items.map(formatDetailChoiceText));
  const subs = (choice.subOptions ?? []).map((sub) => sub.name);
  const nested = children.concat(subs);
  return (
    choice.name +
    (choice.quantity > 1 ? ` ×${choice.quantity}` : '') +
    (nested.length ? ` (${nested.join('、')})` : '')
  );
}

export function calculateDetailChoiceExtra(choice: DetailChoice): number {
  const subTotal = (choice.subOptions ?? []).reduce((sum, sub) => sum + Number(sub.price || 0), 0);
  const nestedTotal = (choice.groups ?? []).reduce(
    (sum, group) => sum + group.items.reduce((itemSum, nestedChoice) => itemSum + calculateDetailChoiceExtra(nestedChoice), 0),
    0
  );
  return (Number(choice.surcharge || 0) + subTotal + nestedTotal) * choice.quantity;
}

export function formatDetailGroupChoices(groups: DetailGroup[]): FormattedDetailChoice[] {
  return groups.flatMap((group) =>
    group.items.map((choice) => ({
      groupId: group.groupId,
      optionId: choice.optionId,
      label: group.groupName,
      value: formatDetailChoiceText(choice),
      price: calculateDetailChoiceExtra(choice)
    }))
  );
}

export function extractOrderDetailLines(snapshot: unknown): FormattedDetailLine[] {
  if (!isOrderDetailSnapshot(snapshot)) return [];
  return snapshot.rounds.flatMap((round) =>
    round.items.map((item) => {
      const options: FormattedDetailLineOption[] = item.portions.flatMap((portion: DetailPortion) =>
        formatDetailGroupChoices(portion.groups).map((formatted) => ({
          ...formatted,
          choice: `${item.quantity > 1 ? `第${portion.portionIndex + 1}份: ` : ''}${formatted.label}: ${formatted.value}`
        }))
      );
      const notes = item.portions
        .filter((portion) => Boolean(portion.note))
        .map((portion) => `${item.quantity > 1 ? `第${portion.portionIndex + 1}份: ` : ''}${portion.note}`);
      if (item.note) notes.unshift(item.note);
      const joinedNotes = notes.join('\n');
      return {
        lineId: item.lineId,
        itemId: item.itemId,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        price: item.unitPrice,
        unit_price: item.unitPrice,
        subtotal: item.subtotal,
        note: joinedNotes,
        notes: joinedNotes,
        options,
        round_number: round.roundNumber
      };
    })
  );
}

export function extractOrderDetailGlobalChoices(snapshot: unknown): FormattedGlobalChoice[] {
  if (!isOrderDetailSnapshot(snapshot)) return [];
  const multipleRounds = snapshot.rounds.length > 1;
  return snapshot.rounds.flatMap((round) =>
    formatDetailGroupChoices(round.groups).map((choice) => ({
      ...choice,
      roundNumber: round.roundNumber,
      label: `${multipleRounds ? `[第${round.roundNumber}輪] ` : ''}${choice.label}`
    }))
  );
}

export function extractOrderDetailNotes(snapshot: unknown): string {
  if (!isOrderDetailSnapshot(snapshot)) return '';
  const multipleRounds = snapshot.rounds.length > 1;
  return snapshot.rounds
    .filter((round) => Boolean(round.note))
    .map((round) => `${multipleRounds ? `[第${round.roundNumber}輪] ` : ''}${round.note}`)
    .join('\n');
}

export function formatOrderDetailPlainText(snapshot: unknown): string {
  if (!isOrderDetailSnapshot(snapshot)) {
    return typeof snapshot === 'string' ? snapshot : '';
  }
  const multipleRounds = snapshot.rounds.length > 1;
  return snapshot.rounds
    .map((round) => {
      if (round.legacyContent !== undefined) return round.legacyContent;
      const out = multipleRounds ? [`[第${round.roundNumber}輪]`] : [];
      formatDetailGroupChoices(round.groups).forEach((choice) => out.push(`${choice.label}: ${choice.value}`));
      extractOrderDetailLines({ schemaVersion: 1, rounds: [round], total: round.total }).forEach((item) => {
        out.push(`${item.quantity}份 x ${item.name}`);
        item.options.forEach((option) => out.push(`  - ${option.choice}${option.price ? ` (+$${option.price})` : ''}`));
        if (item.note) out.push(`  - 備註: ${item.note}`);
      });
      if (round.note) out.push(`顧客備註: ${round.note}`);
      return out.join('\n');
    })
    .join('\n\n');
}
