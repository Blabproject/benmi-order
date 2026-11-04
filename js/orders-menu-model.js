/**
 * Menu Editor Data Model
 * Pure domain logic extracted from POS Menu Editor.
 * Free of DOM, fetch, storage, and hidden global state.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    module.exports.default = api;
  } else if (root) {
    root.MenuEditorModel = api;
    if (root.window && typeof root.window === 'object') {
      root.window.MenuEditorModel = api;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /**
   * Generates a deterministic canonical JSON string representing menu state for dirty checking.
   * Does NOT mutate inputs.
   *
   * @param {any} data - Menu data structure to snapshot
   * @returns {string} Canonical JSON string, or '' if data is falsy
   */
  function canonicalMenuSnapshot(data) {
    if (!data) return '';
    function clean(val) {
      if (val === null || val === undefined) return null;
      if (typeof val === 'string') return val.trim();
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      if (typeof val === 'boolean') return val;
      if (Array.isArray(val)) {
        return val.map(clean);
      }
      if (typeof val === 'object') {
        const sortedKeys = Object.keys(val).sort();
        const res = {};
        for (const k of sortedKeys) {
          if (k.startsWith('_')) continue;
          const v = val[k];
          if ((k === 'modifierGroups' || k === 'appliedItems' || k === 'appliedCategories' || k === 'sub_options') && (v === undefined || v === null || (Array.isArray(v) && v.length === 0))) {
            res[k] = [];
            continue;
          }
          if (k === 'badgeText') {
            res[k] = v ? String(v).trim() : '';
            continue;
          }
          if (k === 'bundleRule' && (!v || !v.groups || v.groups.length === 0)) {
            res[k] = null;
            continue;
          }
          res[k] = clean(v);
        }
        return res;
      }
      return val;
    }
    return JSON.stringify(clean(data));
  }

  /**
   * Serializes in-memory menu category drafts into the wire format expected by the backend.
   * Mutates categories in-place: generates item IDs and option IDs, sets category databaseId,
   * normalizes options, resolves appliedItems.
   *
   * Canonical dependency interface:
   * @param {Array<object>} categories - Menu category draft objects
   * @param {object} [dependencies] - Injected callbacks and dependencies
   * @param {Function} [dependencies.getTenantId] - Lazy tenant ID getter, called only when new item or category databaseId is generated
   * @param {Function} [dependencies.createUuid] - Lazy UUID generator, called only when new item ID is generated
   * @param {Function} [dependencies.getDuplicateItemMessage] - Lazy error message provider, called only on duplicate item name
   * @param {Function} [dependencies.isCustomizationCategory] - Optional category classifier callback
   * @param {Array<object>|null} [dependencies.sharedCategories] - Shared customization categories source (omit to use categories; explicit null means no shared groups)
   * @returns {object} Serialized menu wire payload
   */
  function serializeMenuData(categories, dependencies = {}) {
    const isCustomCat = c => Boolean(c && (
      c.type === 'order_customization' ||
      c.id === 'sec-flavor' ||
      c.slug === 'sec-flavor' ||
      c.type === 'modifier' ||
      (typeof dependencies.isCustomizationCategory === 'function' && dependencies.isCustomizationCategory(c))
    ));
    const output = {};

    // Resolve every new item ID before serializing group assignments. This keeps
    // appliedItems and item_modifier_links on the same stable IDs regardless of
    // whether the customization section comes before or after its menu section.
    const temporaryItemIds = new Map();
    categories.forEach(cat => {
      if (isCustomCat(cat)) return;
      const names = new Set();
      (cat.items || []).forEach(item => {
        const name = String(item.name || '').trim();
        if (!name || item.price === null || item.price === undefined) return;
        if (names.has(name)) {
          throw new Error(dependencies.getDuplicateItemMessage());
        }
        names.add(name);
        if (!item.id) {
          const tenantId = dependencies.getTenantId();
          const uuid = dependencies.createUuid();
          item.id = `${tenantId}_item_${uuid}`;
          temporaryItemIds.set(`${cat.id}:${item.name}`, String(item.id));
          temporaryItemIds.set(`${cat.id}:${name}`, String(item.id));
        }
      });
    });

    categories.filter(isCustomCat).forEach(cat => (cat.groups || []).forEach(group => {
      if (Array.isArray(group.appliedItems)) {
        group.appliedItems = [...new Set(group.appliedItems.map(id => temporaryItemIds.get(String(id)) || String(id)))];
      }
    }));

    const assignedOptionOwners = new Map();
    // Pass 1: Resolve unique option IDs for all groups across all customization categories to prevent cross-group ID collisions
    categories.filter(isCustomCat).forEach(cat => {
      (cat.groups || []).forEach(grp => {
        const stableGid = String(grp.canonicalId || grp.id || '');
        (grp.options || []).forEach((opt, oIdx) => {
          const rawId = String(opt.id || opt.name || `opt_${oIdx}`).trim();
          let uniqueOptId = rawId;
          if (assignedOptionOwners.has(uniqueOptId) && assignedOptionOwners.get(uniqueOptId) !== stableGid) {
            uniqueOptId = `mo_${stableGid}_${rawId}`;
          }
          assignedOptionOwners.set(uniqueOptId, stableGid);
          opt.id = uniqueOptId;
        });
      });
    });

    categories.forEach((cat, cIdx) => {
      const currentOrder = cat.sortOrder !== undefined ? cat.sortOrder : (cIdx + 1);
      if (cat.type === 'order_customization' || cat.id === 'sec-flavor') {
        if (cat.groups?.length && !cat.databaseId) {
          const tenantId = dependencies.getTenantId();
          cat.databaseId = `${tenantId}_${cat.id}`;
        }
        output.__customizations = {
          id: cat.databaseId || cat.id,
          title: cat.title,
          shortName: cat.shortName || cat.title,
          sortOrder: currentOrder,
          groups: (cat.groups || []).map((grp, gIdx) => ({
            id: grp.id,
            source: grp.source || undefined,
            sourceId: grp.sourceId || undefined,
            canonicalId: grp.canonicalId || undefined,
            key: grp.key,
            minSelection: grp.minSelection,
            maxSelection: grp.maxSelection,
            title: grp.title,
            type: grp.type || 'radio',
            isRequired: Boolean(grp.isRequired),
            scope: grp.scope || 'order',
            appliedCategories: Array.isArray(grp.appliedCategories) ? grp.appliedCategories : [],
            appliedItems: Array.isArray(grp.appliedItems) ? grp.appliedItems : [],
            sortOrder: grp.sortOrder !== undefined ? grp.sortOrder : (gIdx + 1),
            options: (grp.options || []).map(opt => {
              const optPrice = Number(opt.price ?? opt.surcharge ?? 0);
              const optIsDefault = Boolean(opt.isDefault ?? opt.is_default);
              const optIsOos = Boolean(opt.isOos ?? opt.isOutOfStock ?? opt.is_out_of_stock);
              const optSubOptions = Array.isArray(opt.sub_options) ? opt.sub_options : (Array.isArray(opt.subOptions) ? opt.subOptions : []);
              return {
                ...opt,
                id: opt.id || opt.name,
                name: opt.name,
                surcharge: optPrice,
                price: optPrice,
                isDefault: optIsDefault,
                is_default: optIsDefault,
                is_out_of_stock: optIsOos,
                isOutOfStock: optIsOos,
                isOos: optIsOos,
                sub_options: optSubOptions,
                subOptions: optSubOptions
              };
            })
          }))
        };
        return;
      }
      output[cat.id] = {
        __title: cat.title,
        __short_name: cat.shortName || cat.title,
        __type: cat.type || 'catalog',
        __allow_customization: cat.allowCustomization !== false ? 1 : 0,
        __applied_modifiers: cat.appliedModifiers || (cat.allowCustomization === false ? [] : ['*']),
        __sort_order: currentOrder
      };
      cat.items.forEach((item, itemIdx) => {
        if (item.name && item.name.trim() !== "" && item.price !== null) {
          if (Object.prototype.hasOwnProperty.call(output[cat.id], item.name.trim())) {
            throw new Error(dependencies.getDuplicateItemMessage());
          }
          const serializedItem = {
            id: item.id,
            price: item.price,
            badge_text: item.badgeText || null,
            is_recommended: item.isRecommended ? 1 : 0,
            item_type: item.itemType || (item.bundleRule && item.bundleRule.groups && item.bundleRule.groups.length > 0 ? 'bundle' : 'standard'),
            sort_order: item.sortOrder !== undefined ? item.sortOrder : (item.sort_order !== undefined ? item.sort_order : (itemIdx + 1))
          };
          const sharedGroups = [];
          const customCatsSource = Object.prototype.hasOwnProperty.call(dependencies, 'sharedCategories')
            ? (dependencies.sharedCategories === null ? [] : dependencies.sharedCategories)
            : categories;
          (customCatsSource || []).filter(c => isCustomCat(c)).forEach(customCat => {
            (customCat.groups || []).forEach(group => {
              sharedGroups.push({ customCat, group });
            });
          });
          const sharedGroupIds = new Set(sharedGroups.flatMap(({ group }) => [
            String(group.id), String(group.canonicalId || ''),
            group.id && String(group.id).startsWith('mg_') ? String(group.id).slice(3) : `mg_${group.id}`
          ]));
          const linkedGroups = (Array.isArray(item.modifierGroups) ? item.modifierGroups : []).filter(link =>
            !sharedGroupIds.has(String(link.id || link.groupId || link.group_id))
          );
          sharedGroups.forEach(({ customCat, group }) => {
            const itemKey = String(item.id || `${cat.id}:${item.name}`);
            if (!(group.appliedItems || []).includes(itemKey)) return;
            const linkedGroupId = group.canonicalId || group.id;
            if (linkedGroups.some(link => String(link.id || link.groupId || link.group_id) === String(linkedGroupId))) return;
            linkedGroups.push({
              id: linkedGroupId,
              name: group.title,
              selectionType: group.type === 'checkbox' ? 'multiple' : 'single',
              isRequired: Boolean(group.isRequired),
              minSelection: group.minSelection,
              maxSelection: group.maxSelection,
              sortOrder: group.sortOrder || 0,
              options: (group.options || []).map(option => {
                const optPrice = Number(option.price ?? option.surcharge ?? 0);
                const optIsDefault = Boolean(option.isDefault ?? option.is_default);
                const optIsOos = Boolean(option.isOos ?? option.isOutOfStock ?? option.is_out_of_stock);
                const optSubOptions = Array.isArray(option.sub_options) ? option.sub_options : (Array.isArray(option.subOptions) ? option.subOptions : []);
                return {
                  ...option,
                  id: option.id || option.name,
                  name: option.name,
                  price: optPrice,
                  surcharge: optPrice,
                  isDefault: optIsDefault,
                  is_default: optIsDefault,
                  isOutOfStock: optIsOos,
                  is_out_of_stock: optIsOos,
                  isOos: optIsOos,
                  subOptions: optSubOptions,
                  sub_options: optSubOptions
                };
              })
            });
          });
          linkedGroups.forEach(grp => {
            if (Array.isArray(grp.options)) {
              grp.options = grp.options.map(option => {
                const optPrice = Number(option.price ?? option.surcharge ?? 0);
                const optIsDefault = Boolean(option.isDefault ?? option.is_default);
                const optIsOos = Boolean(option.isOos ?? option.isOutOfStock ?? option.is_out_of_stock);
                const optSubOptions = Array.isArray(option.sub_options) ? option.sub_options : (Array.isArray(option.subOptions) ? option.subOptions : []);
                return {
                  ...option,
                  id: option.id || option.name,
                  name: option.name,
                  price: optPrice,
                  surcharge: optPrice,
                  isDefault: optIsDefault,
                  is_default: optIsDefault,
                  isOutOfStock: optIsOos,
                  is_out_of_stock: optIsOos,
                  isOos: optIsOos,
                  subOptions: optSubOptions,
                  sub_options: optSubOptions
                };
              });
            }
          });
          if (Array.isArray(item.modifierGroups) || linkedGroups.length > 0) {
            serializedItem.modifier_groups = linkedGroups;
          }
          output[cat.id][item.name.trim()] = serializedItem;
        }
      });
    });
    return output;
  }

  /**
   * Computes deletions against the fully loaded editor snapshot.
   * Does NOT mutate inputs. Fails fast on invalid snapshot.
   *
   * @param {Array<object>} before - Loaded baseline snapshot categories
   * @param {Array<object>} after - Current categories after user edits
   * @param {object} [dependencies] - Injected callbacks
   * @param {Function} [dependencies.isCustomizationCategory] - Optional category classifier callback
   * @returns {{ categories: string[], items: string[], customizations: string[] }}
   */
  function getMenuDeletions(before, after, dependencies = {}) {
    const isCustomCat = c => Boolean(c && (
      c.type === 'order_customization' ||
      c.id === 'sec-flavor' ||
      c.slug === 'sec-flavor' ||
      c.type === 'modifier' ||
      (typeof dependencies.isCustomizationCategory === 'function' && dependencies.isCustomizationCategory(c))
    ));
    const remainingCategories = new Set(after.map(cat => cat.id));
    const remainingItems = new Set(after.flatMap(cat => (cat.items || []).map(item => item.id)));
    const remainingGroups = new Set(after.flatMap(cat => (cat.groups || []).map(group => group.id)));
    return {
      categories: before.filter(cat => !isCustomCat(cat) && !remainingCategories.has(cat.id))
        .map(cat => cat.databaseId || cat.id).filter(Boolean),
      items: before.filter(cat => remainingCategories.has(cat.id)).flatMap(cat =>
        (cat.items || []).filter(item => item.id && !remainingItems.has(item.id)).map(item => item.id)),
      customizations: before.flatMap(cat =>
        (cat.groups || []).filter(group => group.id && !remainingGroups.has(group.id)).map(group => group.id))
    };
  }

  return {
    canonicalMenuSnapshot,
    serializeMenuData,
    getMenuDeletions
  };
});
