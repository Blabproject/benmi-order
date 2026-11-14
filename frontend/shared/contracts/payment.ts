import type { OrderDetailSnapshot, OrderStatus } from './api';

export type PaymentLocale = 'zh-TW' | 'vi';

export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'CANCELLED'
  | 'FAILED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'REFUND_FAILED'
  | (string & {});

export interface PaymentMerchantDto {
  brandName?: string;
  logoUrl?: string;
  locale?: string;
}

export interface PaymentResultDto {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency?: string;
  paidAt?: number | null;
  orderStatus?: OrderStatus | null;
  displayKey?: string | null;
  pickupTime?: string | null;
  receipt?: OrderDetailSnapshot | string | null;
  menuUrl?: string | null;
  paymentUrl?: string | null;
  appUrl?: string | null;
  canCancel?: boolean;
  cancelRequestedAt?: number | null;
  merchant?: PaymentMerchantDto | null;
}

export interface PaymentSessionRecord {
  id?: string;
  token: string;
  payload?: {
    operationId?: string;
    [key: string]: unknown;
  };
  cartSignature?: string;
  returnDraft?: Record<string, unknown>;
  draft?: Record<string, unknown>;
  completed?: boolean;
  terminal?: boolean;
  [key: string]: unknown;
}

export interface PaymentProviderTarget {
  url: string;
  webUrl: string;
  usesApp: boolean;
}
