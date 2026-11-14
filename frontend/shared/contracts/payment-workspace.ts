export type PaymentWorkspaceStatus =
  | 'REQUESTING'
  | 'PENDING'
  | 'CONFIRMING'
  | 'UNKNOWN'
  | 'PAID'
  | 'CANCELLED'
  | 'FAILED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'REFUND_FAILED'
  | (string & {});

export type PaymentAttentionReason =
  | 'REFUND_FAILED'
  | 'PAID_CANCELLED'
  | 'REFUND_DELAYED'
  | 'CANCEL_DELAYED'
  | 'PAYMENT_UNCERTAIN'
  | (string & {});

export type PaymentRefundStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'UNKNOWN'
  | 'SUCCEEDED'
  | 'FAILED'
  | (string & {});

export type PaymentWorkspaceView = 'attention' | 'history';

export interface PaymentWorkspaceFilters {
  from: string;
  to: string;
  status: string;
  q: string;
}

export interface PaymentRefundInfoDto {
  reason?: string | null;
  requestedAt?: number | null;
  status: PaymentRefundStatus;
  transactionId?: string | null;
  resultCode?: string | null;
}

export interface PaymentWorkspaceItemDto {
  id: string;
  orderKey: string;
  displayKey?: string | null;
  createdAt: number;
  paidAt?: number | null;
  refundedAt?: number | null;
  amount: number;
  currency?: string;
  status: PaymentWorkspaceStatus;
  transactionId?: string | null;
  providerOrderId?: string | null;
  attentionReason?: PaymentAttentionReason | null;
  needsAttention?: boolean;
  canRefund?: boolean;
  canReconcile?: boolean;
  resultCode?: string | null;
  refund?: PaymentRefundInfoDto | null;
}

export interface PaymentWorkspaceSummaryDto {
  collected: number;
  refunded: number;
  net: number;
}

export interface PaymentTransactionsResponseDto {
  items: PaymentWorkspaceItemDto[];
  nextCursor: string | null;
}

export interface PaymentAttentionCountDto {
  count: number;
  checkedAt: number;
}

export interface PaymentConfigResponseDto {
  linePay?: {
    configured?: boolean;
    enabled?: boolean;
  } | null;
}

export const PAYMENT_WORKSPACE_STATUSES: readonly PaymentWorkspaceStatus[] = [
  'REQUESTING',
  'PENDING',
  'CONFIRMING',
  'UNKNOWN',
  'PAID',
  'CANCELLED',
  'FAILED',
  'REFUND_PENDING',
  'REFUNDED',
  'REFUND_FAILED'
];
