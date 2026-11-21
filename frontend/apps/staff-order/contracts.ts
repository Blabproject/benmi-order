export interface StaffTable {
  id: string;
  label: string;
  active_order_key?: string | null;
}

export interface StaffTableView {
  tables: StaffTable[];
  selected: string;
  takeaway: boolean;
  allowDine: boolean;
}

export interface StaffCatalogItem {
  name: string;
  displayName: string;
  price: number;
  quantity: number;
  badge: string;
  limit: string;
  image: string;
  soldOut: boolean;
  outsideSchedule: boolean;
  unavailableLabel: string;
  schedule: string;
  required: boolean;
  optional: boolean;
}

export interface StaffCatalogSection {
  id: string;
  label: string;
  title: string;
  promo?: string;
  schedule?: string;
  outsideSchedule?: boolean;
  slug?: string;
  items?: StaffCatalogItem[];
}

export interface StaffCartItem {
  type: 'item';
  key: string;
  catSlug: string;
  itemName: string;
  displayName: string;
  qty: number;
  lineTotal: number;
  hasOptions: boolean;
}

export interface StaffCartDiscount {
  type: 'discount';
  key: string;
  label: string;
  amount: number;
}

export interface StaffCartOption {
  key: string;
  title: string;
  choices: { label: string; extra: number }[];
}

export interface StaffCartView {
  rows: (StaffCartItem | StaffCartDiscount)[];
  options: StaffCartOption[];
  quantity: number;
}

export function staffText(zh: string, vi: string) {
  return document.documentElement.lang === 'vi' ? vi : zh;
}

export function money(value: number) {
  return String(roundMoney(value));
}

export function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
