/** Canonical policy. Payment PAID is deliberately not an order state.
 * Callers must authenticate actors and commit the decision with revision CAS.
 * This module performs no I/O and never infers collection from completion.
 */
export const orderStates = ['PENDING_PAYMENT', 'NEW', 'ACCEPTED', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED'] as const;
export type OrderState = typeof orderStates[number];
export type OrderAction = 'accept' | 'mark_ready' | 'complete' | 'cancel' | 'expire' | 'publish_paid' | 'refund_succeeded';
export type Actor = 'staff' | 'payment' | 'system';
export interface LifecycleContext {
  state: OrderState;
  actor: Actor;
  pendingAction: boolean;
  payment: 'manual' | 'paid' | 'unresolved' | 'refund_pending' | 'refunded';
}
export class LifecycleError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function isOrderState(value: unknown): value is OrderState {
  return typeof value === 'string' && (orderStates as readonly string[]).includes(value);
}
export function isTerminal(state: OrderState): boolean {
  return state === 'COMPLETED' || state === 'CANCELLED' || state === 'EXPIRED';
}
/** Legacy completion proves service completion only. Pending/unknown needs review. */
export function mapLegacyOrder(status: string): { state: OrderState | null; reviewRequired: boolean; collectionEvidence: 'unknown' } {
  const aliases: Record<string, OrderState> = { DONE: 'READY', PICKED_UP: 'COMPLETED', PAID: 'COMPLETED', REJECTED: 'CANCELLED', FORCE_REJECT: 'CANCELLED' };
  const state = isOrderState(status) ? status : Object.hasOwn(aliases, status) ? aliases[status] : null;
  return { state, reviewRequired: state === null, collectionEvidence: 'unknown' };
}
export function projectLegacyOrder(state: OrderState, dining: 'takeaway' | 'dine_in'): string {
  if (state === 'COMPLETED') return dining === 'dine_in' ? 'PAID' : 'PICKED_UP';
  if (state === 'READY') return 'DONE';
  if (state === 'CANCELLED') return 'REJECTED';
  return state;
}
export function decideOrderTransition(context: LifecycleContext, action: OrderAction): OrderState {
  if (!isOrderState(context.state)) throw new LifecycleError('INVALID_ORDER_STATE');
  const { state, actor, pendingAction, payment } = context;
  if (action === 'refund_succeeded') {
    if (actor !== 'payment' || payment !== 'refunded') throw new LifecycleError('PAYMENT_EVIDENCE_REQUIRED');
    // Refund never erases completed service or revives a closed order.
    return isTerminal(state) ? state : 'CANCELLED';
  }
  if (action === 'publish_paid') {
    if (actor !== 'payment' || payment !== 'paid') throw new LifecycleError('PAYMENT_EVIDENCE_REQUIRED');
    if (state !== 'PENDING_PAYMENT') throw new LifecycleError('INVALID_STATUS_TRANSITION');
    return 'NEW';
  }
  if (actor !== 'staff' && !(actor === 'system' && action === 'expire')) throw new LifecycleError('ACTOR_FORBIDDEN');
  if (isTerminal(state)) throw new LifecycleError('ORDER_FINALIZED');
  if (state === 'PENDING_PAYMENT') throw new LifecycleError('PAYMENT_RECONCILIATION_REQUIRED');
  if (action === 'cancel') return 'CANCELLED'; // Cancellation is not a refund.
  if (action === 'expire') {
    if (actor !== 'system') throw new LifecycleError('ACTOR_FORBIDDEN');
    if (payment !== 'manual') throw new LifecycleError('PAYMENT_RECONCILIATION_REQUIRED');
    return 'EXPIRED';
  }
  if (pendingAction) throw new LifecycleError('PENDING_ACTION_UNRESOLVED');
  if (payment === 'unresolved' || payment === 'refund_pending' || payment === 'refunded')
    throw new LifecycleError('PAYMENT_RECONCILIATION_REQUIRED');
  if (action === 'accept' && state === 'NEW') return 'ACCEPTED';
  if (action === 'mark_ready' && state === 'ACCEPTED') return 'READY';
  if (action === 'complete' && (state === 'ACCEPTED' || state === 'READY')) return 'COMPLETED';
  throw new LifecycleError('INVALID_STATUS_TRANSITION');
}
export interface CompletionSettlement {
  mode: 'unchanged' | 'confirm_manual';
  amountMinor?: number;
  currency?: string;
  method?: 'cash' | 'bank_transfer' | 'other';
}
/** Explicit confirmation only; returned amount is the server's authoritative total. */
export function manualCollectionForCompletion(
  input: CompletionSettlement, totalMinor: number, currency: string,
  payment: LifecycleContext['payment'], alreadyCollected: boolean
): { amountMinor: number; currency: string; method: string } | null {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) throw new LifecycleError('INVALID_ORDER_AMOUNT');
  if (input.mode === 'unchanged') return null;
  if (input.mode !== 'confirm_manual') throw new LifecycleError('INVALID_SETTLEMENT_MODE');
  if (payment !== 'manual' || alreadyCollected) throw new LifecycleError('MANUAL_COLLECTION_FORBIDDEN');
  if (input.amountMinor !== totalMinor || input.currency !== currency) throw new LifecycleError('SETTLEMENT_AMOUNT_MISMATCH');
  if (!['cash', 'bank_transfer', 'other'].includes(input.method || '')) throw new LifecycleError('PAYMENT_METHOD_REQUIRED');
  if (totalMinor === 0) return null;
  return { amountMinor: totalMinor, currency, method: input.method! };
}
