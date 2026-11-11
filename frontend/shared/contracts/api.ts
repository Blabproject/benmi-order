/**
 * Frontend API DTO contracts aligned to public Worker responses.
 * Intentionally excludes internal backend secrets from TenantContext.
 */

export type DiningOption = 'takeaway' | 'dine_in';

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'NEW'
  | 'ACCEPTED'
  | 'DONE'
  | 'PICKED_UP'
  | 'PAID'
  | 'WAITING_CUSTOMER_CHANGE'
  | 'WAITING_CUSTOMER_REJECT'
  | 'REJECTED'
  | 'EXPIRED'
  | 'FORCE_REJECT'
  | (string & {});

export interface DetailSubOption {
  id?: string;
  name: string;
  price: number;
}

export interface DetailChoice {
  optionId: string;
  itemId: string;
  name: string;
  quantity: number;
  surcharge: number;
  groups: DetailGroup[];
  subOptions: DetailSubOption[];
}

export interface DetailGroup {
  groupId: string;
  groupName: string;
  items: DetailChoice[];
}

export interface DetailPortion {
  portionIndex: number;
  note: string;
  groups: DetailGroup[];
}

export interface DetailLine {
  lineId: string;
  itemId: string;
  name: string;
  categoryId: string;
  category: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  note: string;
  portions: DetailPortion[];
}

export interface DetailRound {
  roundNumber: number;
  createdAt: string;
  note: string;
  groups: DetailGroup[];
  items: DetailLine[];
  discount: number;
  total: number;
  legacyContent?: string;
}

export interface OrderDetailSnapshot {
  schemaVersion: 1;
  rounds: DetailRound[];
  total: number;
}

export interface OrderPaymentSummary {
  id: string;
  method: string;
  status: string;
  amount: number;
  currency: string;
  paidAt: number | null;
  refundedAmount: number;
}

export interface OrderPrintItemDto {
  item_name?: string;
  name?: string;
  quantity: number;
  unit_price?: number;
  price?: number;
  subtotal?: number;
  selected_options?: string | null;
  options?: string | null;
  bundle_snapshot_json?: string | null;
  notes?: string | null;
  round_number?: number;
}

export interface HistoryOrderDto {
  key: string;
  orderId?: string | null;
  displayKey?: string | null;
  legacyKey?: string | null;
  businessDate?: string | null;
  customer: string;
  phone?: string;
  phoneNumber?: string;
  time: string;
  content: string;
  status: OrderStatus;
  createdAt: number;
  pickedUpAt?: number | null;
  userId?: string;
  total: number;
  reason?: string;
  note?: string;
  diningOption?: DiningOption | string;
  dining_option?: DiningOption | string;
  tableNumber?: string | null;
  table_number?: string | null;
  tableId?: string | null;
  table_id?: string | null;
  source?: 'legacy' | 'staff' | string;
  revision?: number;
  roundCount?: number;
  round_count?: number;
  lastAppendedAt?: number | string | null;
  last_appended_at?: number | string | null;
  is_modified?: number;
  isModified?: boolean;
  items?: OrderPrintItemDto[];
  detailSnapshot?: OrderDetailSnapshot;
  detailRevision?: number;
  payment?: OrderPaymentSummary;
}

export interface StoreNoticeDto {
  enabled: boolean;
  title: string;
  body: string;
  version: string;
}

export interface TenantPublicConfigDto {
  tenantId: string;
  liffId: string | null;
  customerOrderDomain?: 'legacy' | 'blabfood';
  orderUrl?: string;
  operatingHours: Record<string, Array<{ start: string; end: string }>>;
  allowScheduledPickup: boolean;
  allowDineIn: boolean;
  features: string[];
  storeStatus: 'open' | 'busy' | 'paused' | 'closed' | string;
  autoOpenBeforeMinutes?: number;
  prepTimeMinutes?: number;
  paymentMethods: string[];
  logoUrl: string | null;
  storeAddress: string | null;
  announcement: string | null;
  storeNotice: StoreNoticeDto | null;
}

export interface StaffTableDto {
  id: string;
  tenant_id: string;
  label: string;
  sort_order: number;
  is_active: number | boolean;
  active_order_key?: string | null;
  active_order_id?: string | null;
  active_display_key?: string | null;
  active_order_status?: string | null;
  active_total_amount?: number | null;
  active_round_count?: number | null;
  active_revision?: number | null;
  active_customer_name?: string | null;
}

export interface StaffTablesResponseDto {
  ok?: boolean;
  tables: StaffTableDto[];
}
