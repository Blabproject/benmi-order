export type DiningOption = 'takeaway' | 'dine_in';

export type OrderStatus =
  | 'NEW'
  | 'ACCEPTED'
  | 'DONE'
  | 'PICKED_UP'
  | 'PAID'
  | 'WAITING_CUSTOMER_CHANGE'
  | 'WAITING_CUSTOMER_REJECT'
  | 'REJECTED'
  | 'EXPIRED'
  | 'FORCE_REJECT';

export interface Order {
  detailSnapshot?: import('./order-detail').OrderDetailSnapshot;
  detailRevision?: number;
  items?: Array<{
    item_name: string;
    quantity: number;
    unit_price: number;
    subtotal?: number;
    selected_options: string | null;
    bundle_snapshot_json?: string | null;
    notes: string | null;
    round_number: number;
  }>;
  /** Stable compatibility key, retained for existing browsers and integrations. */
  key: string;
  /** Immutable server UUID, independent of receipt number and client retry token. */
  orderId?: string;
  displayKey?: string;
  legacyKey?: string | null;
  businessDate?: string;
  uuid?: string | null;
  customer: string;
  time: string; // "YYYY-MM-DD HH:mm"
  content: string;
  status: OrderStatus;
  createdAt: number;
  userId?: string;
  total: number;
  reason?: string;
  note?: string;
  diningOption?: DiningOption;
  tableNumber?: string | null;
  tableId?: string | null;
  table_id?: string | null;
  source?: 'legacy' | 'staff' | string;
  revision?: number;
  roundCount?: number;
  round_count?: number;
  lastAppendedAt?: string | null;
  last_appended_at?: string | null;
  is_modified?: number;
  isModified?: boolean;
}

export interface RestaurantTable {
  id: string;
  tenant_id: string;
  label: string;
  sort_order: number;
  is_active: number | boolean;
  created_at?: string;
  updated_at?: string;
  active_order_key?: string | null;
  active_order_id?: string | null;
  active_display_key?: string | null;
  active_order_status?: string | null;
  active_total_amount?: number | null;
  active_round_count?: number | null;
  active_revision?: number | null;
  active_customer_name?: string | null;
  active_created_at?: string | null;
  active_last_appended_at?: string | null;
}

export interface AppendOrderPayload {
  detailVersion?: number;
  parent_order_key: string;
  user_id?: string;
  customer_name?: string;
  appended_content?: string;
  appended_total: number;
  note?: string;
  tenant_id?: string;
  items?: OrderItemInput[];
  appended_items?: OrderItemInput[];
  is_desktop?: boolean;
  isDesktop?: boolean;
  line_delivery_mode?: 'reply' | 'push';
}

export interface Menu {
  small?: { [itemName: string]: number };
  large?: { [itemName: string]: number };
  combo?: { [itemName: string]: number };
  drinks?: { [itemName: string]: number };
  topping?: { [itemName: string]: number };
  out_of_stock?: string[];
  [category: string]: any;
}

export interface OrderItemOption {
  group?: string;
  groupId?: string;
  group_id?: string;
  id?: string;
  optionId?: string;
  option_id?: string;
  choice?: string;
  name?: string;
  price?: number;
  subOption?: {
    id?: string;
    name?: string;
    price?: number;
  };
}

export interface OrderBundleItemSelection {
  itemId?: string;
  item_id?: string;
  name: string;
  quantity: number;
  price?: number;
  surcharge?: number;
}

export interface OrderBundleGroupSelection {
  groupId?: string;
  group_id?: string;
  groupName?: string;
  group_name?: string;
  items: OrderBundleItemSelection[];
}

export interface OrderBundlePortion {
  portionIndex?: number;
  portion_index?: number;
  groups: OrderBundleGroupSelection[];
}

export interface OrderBundleSnapshot {
  bundleRuleId?: string;
  bundle_rule_id?: string;
  portions: OrderBundlePortion[];
}

export interface OrderItemInput {
  itemId?: string;
  item_id?: string;
  name: string;
  category?: string;
  category_name?: string;
  quantity: number;
  price: number;
  unit_price?: number;
  subtotal?: number;
  options?: OrderItemOption[];
  selected_options?: OrderItemOption[] | string;
  bundleSelections?: any;
  bundle_snapshot_json?: string | null;
  note?: string;
  notes?: string;
}

export interface OrderItemRecord {
  id?: number;
  tenant_id: string;
  order_key: string;
  round_number: number;
  item_id?: string | null;
  item_name: string;
  category_name?: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  selected_options?: string | null;
  bundle_snapshot_json?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface ItemAnalyticsRow {
  itemName: string;
  categoryName: string;
  totalQuantity: number;
  totalSales: number;
  orderAppearances: number;
  optionsBreakdown?: { [optionName: string]: number };
}

export interface ItemAnalyticsSummary {
  tenantId: string;
  range: string;
  startDate: string;
  endDate: string;
  totalItemsSold: number;
  totalRevenue: number;
  totalOrders: number;
  topItem: ItemAnalyticsRow | null;
  items: ItemAnalyticsRow[];
}

export interface StoreConfig {
  operatingHours?: string | null;
  liffId?: string | null;
  [key: string]: any;
}
