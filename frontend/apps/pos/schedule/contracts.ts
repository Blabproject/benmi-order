export interface Availability {
  availabilityMode?: 'inherit' | 'all_shifts' | 'selected_shifts';
  shiftIds?: (string | number)[];
}

export interface MenuItem extends Availability {
  id?: string | number | null;
  name: string;
}

export interface MenuCategory extends Availability {
  databaseId?: string | number;
  catId?: string | number;
  id?: string | number;
  type?: string;
  title?: string;
  name?: string;
  hideWhenUnavailable?: boolean;
  items?: MenuItem[];
}

export interface ShiftWindow {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}

export interface Shift {
  id: string;
  name: string;
  shiftType: 'operating' | 'menu_window';
  sortOrder?: number;
  isActive?: boolean;
  windows?: ShiftWindow[];
}

export type StoreHours = Record<string, { start: string; end: string }[]>;
export type Translate = (key: string, params?: Record<string, string | number>) => string;
export type CoverageConflict = Pick<ShiftWindow, 'dayOfWeek' | 'startTime' | 'endTime'> & {
  shiftId: string;
  shiftName: string;
};
export interface ShiftSnapshot {
  operatingShifts: Shift[];
  operatingHours: StoreHours;
  scheduleRevision: number;
}

export const categoryId = (category: MenuCategory) => String(category.databaseId || category.catId || category.id || '');
export const categoryName = (category: MenuCategory) => category.title || category.name || categoryId(category);
export const itemId = (item: MenuItem) => String(item.id ?? '');
export const orderedDays = [1, 2, 3, 4, 5, 6, 0];
