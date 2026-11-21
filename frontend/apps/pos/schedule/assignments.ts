import { categoryId, itemId, type Availability, type MenuCategory, type MenuItem, type Shift, type Translate } from './contracts';

function sortedIds(values?: (string | number)[]) {
  return [...new Set((Array.isArray(values) ? values : []).map(String))].sort();
}

export function categoryOn(category: MenuCategory, shiftId: string) {
  return category.availabilityMode !== 'selected_shifts' || category.shiftIds?.some(id => String(id) === shiftId) === true;
}

export function itemOn(category: MenuCategory, item: MenuItem, shiftId: string) {
  if (!item.availabilityMode || item.availabilityMode === 'inherit') return categoryOn(category, shiftId);
  return item.availabilityMode === 'all_shifts' || item.shiftIds?.some(id => String(id) === shiftId) === true;
}

function normalized(entity: Availability, inherit: boolean) {
  return {
    availabilityMode: entity.availabilityMode === 'selected_shifts' ? 'selected_shifts' as const
      : inherit && entity.availabilityMode !== 'all_shifts' ? 'inherit' as const : 'all_shifts' as const,
    shiftIds: sortedIds(entity.shiftIds)
  };
}

function snapshot(categories: MenuCategory[]) {
  return categories.map(category => ({
    id: categoryId(category), ...normalized(category, false), hideWhenUnavailable: Boolean(category.hideWhenUnavailable),
    items: (category.items ?? []).map(item => ({ id: itemId(item), ...normalized(item, true) }))
  }));
}

type CategorySnapshot = ReturnType<typeof snapshot>[number];
type CategorySchedule = Omit<CategorySnapshot, 'id' | 'items'>;
type ItemSchedule = Omit<CategorySnapshot['items'][number], 'id'>;
export interface AssignmentPatch {
  categories: (CategorySchedule & { id: string; previous: CategorySchedule })[];
  items: (ItemSchedule & { id: string; categoryId: string; previous: ItemSchedule })[];
}

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const selection = (ids: string[], shiftId: string, checked: boolean) => checked ? sortedIds([...ids, shiftId]) : ids.filter(id => id !== shiftId);

export function createAssignments(categories: () => MenuCategory[], shifts: () => Shift[], translate: Translate) {
  let baseline: CategorySnapshot[] | undefined;
  const dirty = () => baseline !== undefined && !equal(snapshot(categories()), baseline);
  const selectedShifts = (category: MenuCategory, item?: MenuItem) => shifts().map(shift => String(shift.id))
    .filter(id => item ? itemOn(category, item, id) : categoryOn(category, id));

  function setSelection(entity: Availability, selected: string[]) {
    const allShifts = selected.length > 0 && selected.length === shifts().length;
    entity.availabilityMode = allShifts ? 'all_shifts' : 'selected_shifts';
    entity.shiftIds = allShifts ? [] : sortedIds(selected);
  }

  function setItemSelection(category: MenuCategory, item: MenuItem, selected: string[]) {
    if (equal(sortedIds(selected), sortedIds(selectedShifts(category)))) {
      item.availabilityMode = 'inherit';
      item.shiftIds = [];
    } else {
      setSelection(item, selected);
    }
  }

  function setCategoryColumn(category: MenuCategory, shiftId: string, enabled: boolean, itemEnabled: (item: MenuItem) => boolean) {
    const children = (category.items ?? []).map(item => ({
      item, selected: selection(selectedShifts(category, item), shiftId, itemEnabled(item))
    }));
    setSelection(category, selection(selectedShifts(category), shiftId, enabled));
    for (const { item, selected } of children) setItemSelection(category, item, selected);
  }

  return {
    dirty,
    reset: () => { baseline = snapshot(categories()); },
    clear: () => { baseline = undefined; },
    toggleCategory(id: string, shiftId: string, checked: boolean) {
      const category = categories().find(entry => categoryId(entry) === id);
      if (!category || !shifts().some(shift => String(shift.id) === shiftId)) return false;
      setCategoryColumn(category, shiftId, checked, () => checked);
      return true;
    },
    toggleItem(id: string, childId: string, shiftId: string, checked: boolean) {
      const category = categories().find(entry => categoryId(entry) === id);
      const item = category?.items?.find(entry => itemId(entry) === childId);
      if (!category || !item || !shifts().some(shift => String(shift.id) === shiftId)) return false;
      setItemSelection(category, item, selection(selectedShifts(category, item), shiftId, checked));
      return true;
    },
    copyShift(target: string, source: string) {
      const shiftsById = new Set(shifts().map(shift => String(shift.id)));
      if (target === source || !shiftsById.has(source) || !shiftsById.has(target)) return false;
      for (const category of categories()) {
        setCategoryColumn(category, target, categoryOn(category, source), item => itemOn(category, item, source));
      }
      return true;
    },
    setOutside(hidden: boolean) {
      for (const category of categories()) category.hideWhenUnavailable = hidden;
      return true;
    },
    buildPatch(): AssignmentPatch {
      const patch: AssignmentPatch = { categories: [], items: [] };
      const previous = new Map(baseline?.map(category => [category.id, category]));
      for (const { id, items, ...next } of snapshot(categories())) {
        const prior = previous.get(id);
        if (!prior) throw new Error(translate('menuScheduleSaveMenuFirst'));
        const { id: priorId, items: priorItems, ...before } = prior;
        if (!equal(next, before)) patch.categories.push({ id, ...next, previous: before });
        const itemsById = new Map(priorItems.map(item => [item.id, item]));
        for (const { id: childId, ...nextItem } of items) {
          const old = itemsById.get(childId);
          if (!childId || !old) throw new Error(translate('menuScheduleSaveMenuFirst'));
          const { id: oldId, ...beforeItem } = old;
          if (!equal(nextItem, beforeItem)) patch.items.push({ id: childId, categoryId: id, ...nextItem, previous: beforeItem });
        }
      }
      return patch;
    },
    discard() {
      for (const category of categories()) {
        const saved = baseline?.find(entry => entry.id === categoryId(category));
        if (!saved) continue;
        Object.assign(category, normalized(saved, false), { hideWhenUnavailable: saved.hideWhenUnavailable });
        for (const item of category.items ?? []) {
          const savedItem = saved.items.find(entry => entry.id === itemId(item));
          if (savedItem) Object.assign(item, normalized(savedItem, true));
        }
      }
    },
    pruneDeletedShifts() {
      const valid = new Set(shifts().map(shift => String(shift.id)));
      for (const category of [...categories(), ...(baseline ?? [])]) {
        for (const entity of [category, ...(category.items ?? [])]) {
          if (Array.isArray(entity.shiftIds)) entity.shiftIds = entity.shiftIds.filter(id => valid.has(String(id)));
        }
      }
      baseline ??= snapshot(categories());
      return valid;
    }
  };
}
