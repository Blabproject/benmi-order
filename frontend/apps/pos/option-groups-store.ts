import {
  cleanI18n,
  cloneValue,
  computeAffectedProductIds,
  computeSelectionErrors,
  computeSelectionRules,
  entitySnapshot,
  extractPureLocalStockChanges,
  findGroupById,
  findProductById,
  hasDrawerChanges,
  isInsufficientLink,
  isRouteChanged,
  prepareDrawerRoute,
  rebaseMenuSnapshots,
  resolveEffectiveOptions,
  resolveProductGroups,
  resolveSaveErrorKey,
  sortedUniqueIds,
  type MenuI18nMapDto,
  type OptionCatalogDto,
  type OptionCatalogGroupDto,
  type OptionCatalogLinkDto,
  type OptionCatalogOptionDto,
  type OptionCatalogProductDto,
  type OptionCatalogSubOptionDto,
  type OptionDrawerConfirmKind,
  type OptionDrawerRoute,
  type OptionDrawerState,
  type OptionGroupDraft,
  type ProductDraft,
} from '@shared/contracts/option-groups-model';
import type { MenuCategoryDraft } from '@shared/contracts/menu-model';
import { translatePos, type PosLocale } from '@shared/i18n/pos-dictionary';

export interface OptionGroupsStoreSnapshot {
  locale: PosLocale;
  tenantId: string;
  catalog: OptionCatalogDto | null;
  catalogTenant: string;
  loadingCatalog: boolean;
  selectedGroupId: string | null;
  groupQuery: string;
  groupSectionsOpen: {
    order: boolean;
    item: boolean;
  };
  drawer: OptionDrawerState | null;
}

export interface OptionGroupsHostBridge {
  getLocale: () => PosLocale;
  getTenantId: () => string;
  getWorkerBase: () => string;
  getCurrentMenuData: () => MenuCategoryDraft[];
  getSavedMenuSnapshot: () => string;
  setMenuSnapshots: (menuData: MenuCategoryDraft[], savedSnapshot: string) => void;
  getAuthHeaders: (isJson?: boolean) => Record<string, string>;
  fetchImpl?: typeof fetch;
  serializeCanonical?: (data: MenuCategoryDraft[]) => string;
  invalidateMenuImageCache?: (keys: string[]) => void;
  afterSaveSync?: () => void;
  onDrawerOpenChange?: (open: boolean) => void;
  onGroupSelected?: (groupId: string | null) => void;
  onGroupDeleted?: () => void;
  onCatalogLoaded?: (catalog: OptionCatalogDto) => void;
  onValidationFocus?: (field: string) => void;
  alertFn?: (msg: string) => void;
  syncMenuDataFromDOM?: () => void;
  isTenantMultilingualEnabled?: () => boolean;
  getTenantAiTargetLocales?: () => string[];
  readImageAsDataUrl?: (file: File) => Promise<string>;
}

const DEFAULT_AI_TARGET_LOCALES = ['vi', 'en'];

function makeTempId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeBlankGroupDraft(scope: 'item' | 'order', name = ''): OptionGroupDraft {
  return {
    id: makeTempId('group'),
    isNew: true,
    name,
    scope,
    minSelection: 0,
    maxSelection: 1,
    allowRepeats: false,
    included: false,
    autoPopup: false,
    i18n: {},
    options: [],
    sources: [],
    itemIds: [],
    categoryIds: [],
  };
}

function makeProductDraft(
  product: OptionCatalogProductDto,
  catalog: OptionCatalogDto,
  override?: {
    id?: string;
    isNew?: boolean;
    name?: string;
    price?: number;
    categoryId?: string;
    badgeText?: string;
    isRecommended?: boolean;
    revision?: number;
    i18n?: MenuI18nMapDto;
    imageKey?: string | null;
  }
): ProductDraft {
  const prodId = override?.id ?? product.id;
  const links: OptionCatalogLinkDto[] = (catalog.links || [])
    .filter((l) => l.itemId === prodId && !l.disabled)
    .map((l) => ({
      ...cloneValue(l),
      optionIds: l.optionIds ? [...l.optionIds] : null,
    }));

  const imgKey = override && 'imageKey' in override ? (override.imageKey ?? null) : (product.image_key ?? null);
  return {
    id: prodId,
    isNew: override?.isNew ?? false,
    name: override?.name ?? (product.name || ''),
    price: Number(override?.price ?? product.price ?? 0),
    categoryId: override?.categoryId ?? (product.category_id || ''),
    badgeText: override?.badgeText ?? (product.badge_text || ''),
    isRecommended: override?.isRecommended ?? Boolean(product.is_recommended),
    revision: Number(override?.revision ?? product.menu_revision ?? 1),
    i18n: cleanI18n(override?.i18n ?? product.i18n),
    links,
    imageKey: imgKey,
    prevImageKey: imgKey,
    imageDraft: null,
    removedPhoto: false,
  };
}

function makeGroupDraftFromEntity(
  group: OptionCatalogGroupDto,
  catalog: OptionCatalogDto
): OptionGroupDraft {
  const optCount = (group.options || []).length;
  const allowRepeats = Boolean(group.allowRepeats);
  const included = Boolean(group.included);
  let [minSelection, maxSelection] = included
    ? computeSelectionRules(group, catalog)
    : [Number(group.minSelection ?? 0), Number(group.maxSelection ?? 1)];
  if (
    !included &&
    !allowRepeats &&
    optCount > 0 &&
    maxSelection > optCount &&
    (!group.maxSelection || maxSelection >= 99)
  ) {
    maxSelection = optCount;
  }
  return {
    ...cloneValue(group),
    scope: group.scope === 'order' ? 'order' : 'item',
    minSelection,
    maxSelection,
    allowRepeats,
    included,
    autoPopup: Boolean(included || minSelection > 0),
    options: (group.options || []).map((o) => cloneValue(o)),
    sources: cloneValue(group.sources || []),
    itemIds: group.scope === 'order' ? [] : computeAffectedProductIds(group, catalog),
    categoryIds: group.categoryIds ? [...group.categoryIds] : [],
    i18n: cleanI18n(group.i18n),
  };
}

function makeBlankOption(overrides: Partial<OptionCatalogOptionDto> = {}): OptionCatalogOptionDto {
  return {
    id: makeTempId('opt'),
    name: '',
    productId: null,
    price: 0,
    quantity: 1,
    isDefault: false,
    isOutOfStock: false,
    isLocallyOutOfStock: false,
    outOfStockUntil: null,
    description: '',
    i18n: {},
    subOptions: [],
    eligibilityRules: [],
    ...overrides,
  };
}

function validateRouteAndDraft(
  state: OptionDrawerState,
  catalog: OptionCatalogDto | null,
  locale: PosLocale
): { error: string; ruleErrors: OptionDrawerState['ruleErrors'] } {
  const { route, draft, required } = state;
  if (route.page === 'product') {
    const p = draft as ProductDraft;
    if (!String(p.name || '').trim()) {
      return { error: translatePos(locale, 'ugInvalid'), ruleErrors: {} };
    }
    return { error: '', ruleErrors: {} };
  }
  if (route.page === 'group') {
    const g = draft as OptionGroupDraft;
    const ruleErrors = computeSelectionErrors(g, required, catalog, locale);
    if (!String(g.name || '').trim()) {
      return { error: translatePos(locale, 'ugInvalid'), ruleErrors };
    }
    if (resolveEffectiveOptions(g, catalog).length === 0) {
      return { error: translatePos(locale, 'ugGroupNoOptions'), ruleErrors };
    }
    const firstRuleErr = ruleErrors.minSelection || ruleErrors.maxSelection || '';
    return { error: firstRuleErr, ruleErrors };
  }
  if (route.page === 'option') {
    const opt = route.option;
    const g = draft as OptionGroupDraft;
    if (!opt.productId && !String(opt.name || '').trim()) {
      return { error: translatePos(locale, 'ugInvalid'), ruleErrors: state.ruleErrors };
    }
    const price = Number(opt.price);
    if (!Number.isFinite(price) || price < 0) {
      return { error: translatePos(locale, 'ugInvalid'), ruleErrors: state.ruleErrors };
    }
    if (g.included) {
      const qty = Number(opt.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        return { error: translatePos(locale, 'ugInvalid'), ruleErrors: state.ruleErrors };
      }
    }
    const invalidSub = (opt.subOptions || []).some((sub) => {
      if (typeof sub === 'string') return !sub.trim();
      return !sub.productId && !String(sub.name || '').trim();
    });
    if (invalidSub) {
      return { error: translatePos(locale, 'ugInvalid'), ruleErrors: state.ruleErrors };
    }
    return { error: '', ruleErrors: state.ruleErrors };
  }
  return { error: '', ruleErrors: state.ruleErrors };
}

function wouldCreateCycle(
  productId: string,
  targetGroupId: string,
  catalog: OptionCatalogDto | null
): boolean {
  if (!productId || !targetGroupId || !catalog) return false;
  const visited = new Set<string>();
  const stack = [targetGroupId];
  while (stack.length > 0) {
    const gid = stack.pop();
    if (!gid || visited.has(gid)) continue;
    visited.add(gid);
    const group = findGroupById(catalog, gid);
    if (!group) continue;
    const linkedIds = computeAffectedProductIds(group, catalog);
    if (linkedIds.includes(productId)) return true;
    for (const lid of linkedIds) {
      for (const link of catalog.links || []) {
        if (!link.disabled && link.itemId === lid && !visited.has(link.groupId)) {
          stack.push(link.groupId);
        }
      }
    }
    for (const opt of group.options || []) {
      if (opt.productId === productId) return true;
      for (const sub of opt.subOptions || []) {
        if (typeof sub !== 'string' && sub.productId === productId) return true;
      }
    }
  }
  return false;
}

export function createOptionGroupsStore(bridge: OptionGroupsHostBridge) {
  let snapshot: OptionGroupsStoreSnapshot = {
    locale: bridge.getLocale(),
    tenantId: bridge.getTenantId(),
    catalog: null,
    catalogTenant: '',
    loadingCatalog: false,
    selectedGroupId: null,
    groupQuery: '',
    groupSectionsOpen: { order: true, item: true },
    drawer: null,
  };

  let inFlightLoad: Promise<OptionCatalogDto | null> | null = null;
  let inFlightTenant = '';
  const listeners = new Set<() => void>();

  function emit() {
    listeners.forEach((listener) => listener());
  }

  function setSnapshot(updater: (prev: OptionGroupsStoreSnapshot) => OptionGroupsStoreSnapshot) {
    snapshot = updater(snapshot);
    emit();
  }

  function updateDrawer(updater: (prev: OptionDrawerState) => OptionDrawerState) {
    setSnapshot((prev) => {
      if (!prev.drawer) return prev;
      return {
        ...prev,
        drawer: updater(prev.drawer),
      };
    });
  }

  function doFetch(url: string, init?: RequestInit): Promise<Response> {
    const impl = bridge.fetchImpl ?? fetch;
    return impl(url, init);
  }

  function syncLocale(): PosLocale {
    const locale = bridge.getLocale();
    if (locale !== snapshot.locale) {
      snapshot = { ...snapshot, locale };
    }
    return locale;
  }

  async function load(tenantId?: string, force = true): Promise<OptionCatalogDto | null> {
    const targetTenant = String(tenantId || bridge.getTenantId() || '').trim();
    if (!targetTenant) return null;
    if (!force && snapshot.catalog && snapshot.catalogTenant === targetTenant) {
      return snapshot.catalog;
    }
    if (!force && inFlightLoad && inFlightTenant === targetTenant) {
      return inFlightLoad;
    }

    inFlightTenant = targetTenant;
    setSnapshot((prev) => ({
      ...prev,
      tenantId: targetTenant,
      loadingCatalog: true,
    }));

    const promise = (async () => {
      try {
        const res = await doFetch(
          `${bridge.getWorkerBase()}/api/menu/options?tenant_id=${encodeURIComponent(targetTenant)}`
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const raw = (await res.json()) as OptionCatalogDto & { catalog?: OptionCatalogDto };
        const data: OptionCatalogDto = raw.catalog ?? raw;
        const normalized: OptionCatalogDto = {
          categories: Array.isArray(data.categories) ? data.categories : [],
          products: Array.isArray(data.products) ? data.products : [],
          groups: Array.isArray(data.groups) ? data.groups : [],
          links: Array.isArray(data.links) ? data.links : [],
          categoryLinks: Array.isArray(data.categoryLinks) ? data.categoryLinks : [],
        };
        setSnapshot((prev) => {
          const isSameTenant = prev.catalogTenant === targetTenant;
          const stillExists =
            isSameTenant &&
            prev.selectedGroupId &&
            normalized.groups.some((g) => g.id === prev.selectedGroupId);
          const defaultSelected =
            normalized.groups.find((g) => g.scope !== 'order')?.id ??
            normalized.groups[0]?.id ??
            null;
          const nextSelected = stillExists ? prev.selectedGroupId : defaultSelected;
          return {
            ...prev,
            tenantId: targetTenant,
            catalog: normalized,
            catalogTenant: targetTenant,
            loadingCatalog: false,
            selectedGroupId: nextSelected,
            groupQuery: isSameTenant ? prev.groupQuery : '',
            groupSectionsOpen: isSameTenant
              ? prev.groupSectionsOpen
              : { order: true, item: true },
          };
        });
        bridge.onCatalogLoaded?.(normalized);
        return normalized;
      } catch (err) {
        setSnapshot((prev) => ({ ...prev, loadingCatalog: false }));
        throw err;
      } finally {
        if (inFlightTenant === targetTenant) {
          inFlightLoad = null;
        }
      }
    })();

    inFlightLoad = promise;
    return promise;
  }

  function finishDrawer() {
    const wasOpen = Boolean(snapshot.drawer);
    setSnapshot((prev) => ({
      ...prev,
      drawer: null,
    }));
    if (wasOpen) {
      bridge.onDrawerOpenChange?.(false);
    }
  }

  function pushRoute(nextRoute: OptionDrawerRoute) {
    const preparedNext = prepareDrawerRoute(nextRoute);
    updateDrawer((prev) => ({
      ...prev,
      stack: [...prev.stack, { route: prev.route, scroll: prev.scroll }],
      route: preparedNext,
      error: '',
      scroll: 0,
      confirm: null,
    }));
  }

  function popRoute() {
    updateDrawer((prev) => {
      if (prev.stack.length === 0) return prev;
      const nextStack = prev.stack.slice(0, -1);
      const top = prev.stack[prev.stack.length - 1]!;
      return {
        ...prev,
        stack: nextStack,
        route: top.route,
        scroll: top.scroll,
        error: '',
        confirm: null,
      };
    });
  }

  function getCachedCatalog(targetTenant: string): OptionCatalogDto | null {
    if (!targetTenant) return null;
    if (snapshot.catalog && snapshot.catalogTenant === targetTenant) {
      return snapshot.catalog;
    }
    return null;
  }

  function applyOpenProduct(
    catalog: OptionCatalogDto,
    tenant: string,
    productIdOrCatIdx: string | number,
    modeOrItemIdx: 'product' | 'product-options' | number = 'product',
    entry?: 'options' | string
  ): void {
    let draft: ProductDraft | null = null;
    let optionsOnly = false;

    if (typeof productIdOrCatIdx === 'number') {
      bridge.syncMenuDataFromDOM?.();
      const menuCats = bridge.getCurrentMenuData();
      const cat = menuCats[productIdOrCatIdx];
      const local = typeof modeOrItemIdx === 'number' ? cat?.items?.[modeOrItemIdx] : undefined;
      if (!cat) return;
      const localRecord = (local ?? {}) as {
        id?: string;
        name?: string;
        originalName?: string;
        price?: number;
        badgeText?: string;
        isRecommended?: boolean;
        menuRevision?: number;
        imageKey?: string | null;
        i18n?: MenuI18nMapDto;
      };
      const resolvedCategoryId =
        catalog.categories.find(
          (c) =>
            (cat.databaseId && c.id === cat.databaseId) ||
            c.id === cat.id ||
            (c.slug && (c.slug === cat.id || c.slug === cat.slug))
        )?.id ||
        cat.databaseId ||
        cat.id;
      const prod = localRecord.id ? findProductById(catalog, localRecord.id) : null;
      optionsOnly = entry === 'options' && Boolean(prod);
      const syntheticProd: OptionCatalogProductDto = prod ?? {
        id: localRecord.id || `${tenant}_prod_${makeTempId('opt')}`,
        name: localRecord.name || '',
        price: Number(localRecord.price ?? 0),
        category_id: resolvedCategoryId,
        badge_text: localRecord.badgeText || '',
        is_recommended: Boolean(localRecord.isRecommended),
        menu_revision: Number(localRecord.menuRevision ?? 1),
        image_key: localRecord.imageKey ?? null,
        i18n: localRecord.i18n || {},
      };
      if (optionsOnly && prod) {
        draft = makeProductDraft(prod, catalog);
      } else {
        draft = makeProductDraft(syntheticProd, catalog, {
          id: syntheticProd.id,
          isNew: !prod,
          name: localRecord.name || '',
          price: Number(localRecord.price ?? 0),
          categoryId: resolvedCategoryId,
          badgeText: localRecord.badgeText || '',
          isRecommended: Boolean(localRecord.isRecommended),
          revision: Number(prod?.menu_revision ?? localRecord.menuRevision ?? 1),
          i18n: cleanI18n(localRecord.i18n || prod?.i18n),
          imageKey:
            prod?.image_key ??
            localRecord.imageKey ??
            (local ? `${cat.id}_${localRecord.originalName || localRecord.name || ''}` : null),
        });
      }
    } else {
      const productId = String(productIdOrCatIdx);
      const product = findProductById(catalog, productId);
      if (!product) return;
      optionsOnly = modeOrItemIdx === 'product-options';
      draft = makeProductDraft(product, catalog);
    }

    const initialRoute = prepareDrawerRoute({
      page: optionsOnly ? 'product-options' : 'product',
    });

    const wasOpen = Boolean(snapshot.drawer);
    if (!wasOpen) {
      bridge.onDrawerOpenChange?.(true);
    }
    setSnapshot((prev) => ({
      ...prev,
      tenantId: tenant,
      drawer: {
        kind: 'product',
        draft,
        original: entitySnapshot('product', draft),
        required: false,
        ruleErrors: {},
        optionsOnly,
        stack: [],
        route: initialRoute,
        busy: false,
        aiBusy: false,
        error: '',
        scroll: 0,
        confirm: null,
      },
    }));
  }

  function openProduct(
    productIdOrCatIdx: string | number,
    modeOrItemIdx: 'product' | 'product-options' | number = 'product',
    entry?: 'options' | string
  ): Promise<void> {
    syncLocale();
    const tenant = bridge.getTenantId();
    const cached = getCachedCatalog(tenant);
    if (cached) {
      applyOpenProduct(cached, tenant, productIdOrCatIdx, modeOrItemIdx, entry);
      return Promise.resolve();
    }
    return load(tenant, false)
      .catch(() => snapshot.catalog)
      .then((catalog) => {
        if (catalog) applyOpenProduct(catalog, tenant, productIdOrCatIdx, modeOrItemIdx, entry);
      });
  }

  function applyOpenGroup(
    catalog: OptionCatalogDto,
    tenant: string,
    groupId: string | null | undefined,
    action?: 'add-option' | 'linked' | 'option' | 'group' | 'new-item' | 'new-order',
    optionId?: string,
    defaultScope?: 'item' | 'order'
  ): void {
    const wasOpen = Boolean(snapshot.drawer);
    const existing = groupId ? findGroupById(catalog, groupId) : null;

    if (!existing && action !== 'group' && action !== 'new-item' && action !== 'new-order') {
      const selected = findGroupById(catalog, snapshot.selectedGroupId);
      const initScope =
        defaultScope || (selected?.scope === 'order' ? 'order' : 'item');
      const blank = makeBlankGroupDraft(initScope);
      if (!wasOpen) bridge.onDrawerOpenChange?.(true);
      setSnapshot((prev) => ({
        ...prev,
        tenantId: tenant,
        drawer: {
          kind: 'group',
          draft: blank,
          original: entitySnapshot('group', blank),
          required: false,
          ruleErrors: {},
          optionsOnly: false,
          stack: [],
          route: prepareDrawerRoute({ page: 'new-group-scope' }),
          busy: false,
          aiBusy: false,
          error: '',
          scroll: 0,
          confirm: null,
        },
      }));
      return;
    }

    let draft: OptionGroupDraft;
    if (!existing || action === 'new-item' || action === 'new-order' || action === 'group') {
      const scope =
        action === 'new-order'
          ? 'order'
          : action === 'new-item'
            ? 'item'
            : defaultScope || 'item';
      draft = makeBlankGroupDraft(scope);
    } else {
      draft = makeGroupDraftFromEntity(existing, catalog);
    }

    const directOpt =
      existing && action === 'option' && optionId
        ? draft.options.find((o) => o.id === optionId) ?? null
        : null;
    const initialRoute = prepareDrawerRoute(
      directOpt
        ? {
            page: 'option',
            option: cloneValue(directOpt),
            isNew: false,
            direct: true,
          }
        : { page: 'group' }
    );

    const required = Boolean(draft.included || Number(draft.minSelection) > 0);
    if (!wasOpen) bridge.onDrawerOpenChange?.(true);
    setSnapshot((prev) => ({
      ...prev,
      tenantId: tenant,
      selectedGroupId: existingOrKeep(draft.id, prev.selectedGroupId),
      drawer: {
        kind: 'group',
        draft,
        original: entitySnapshot('group', draft),
        required,
        ruleErrors: {},
        optionsOnly: false,
        stack: [],
        route: initialRoute,
        busy: false,
        aiBusy: false,
        error: '',
        scroll: 0,
        confirm: null,
      },
    }));

    if (existing && action === 'add-option') {
      pushRoute({ page: 'add-option' });
    } else if (existing && action === 'linked') {
      pushRoute({ page: 'linked', ids: [...(draft.itemIds || [])] });
    }
  }

  function openGroup(
    groupId?: string | null,
    action?: 'add-option' | 'linked' | 'option' | 'group' | 'new-item' | 'new-order',
    optionId?: string,
    defaultScope?: 'item' | 'order'
  ): Promise<void> {
    syncLocale();
    const tenant = bridge.getTenantId();
    const cached = getCachedCatalog(tenant);
    if (cached) {
      applyOpenGroup(cached, tenant, groupId, action, optionId, defaultScope);
      return Promise.resolve();
    }
    return load(tenant, false)
      .catch(() => snapshot.catalog)
      .then((catalog) => {
        if (catalog) applyOpenGroup(catalog, tenant, groupId, action, optionId, defaultScope);
      });
  }

  function existingOrKeep(id: string, fallback: string | null): string | null {
    return id ? id : fallback;
  }

  function applyOpenOption(optionId: string): void {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.kind !== 'group') return;
    const groupDraft = drawer.draft as OptionGroupDraft;
    const opt = groupDraft.options.find((o) => o.id === optionId);
    if (!opt) return;
    pushRoute({
      page: 'option',
      option: cloneValue(opt),
      isNew: false,
      direct: true,
    });
  }

  function openOption(groupId: string, optionId: string): Promise<void> {
    syncLocale();
    const tenant = bridge.getTenantId();
    const cached = getCachedCatalog(tenant);
    if (cached) {
      applyOpenGroup(cached, tenant, groupId);
      applyOpenOption(optionId);
      return Promise.resolve();
    }
    return openGroup(groupId).then(() => {
      applyOpenOption(optionId);
    });
  }

  function requestClose() {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.busy) return;
    if (drawer.confirm) {
      updateDrawer((prev) => ({ ...prev, confirm: null }));
      return;
    }
    if (hasDrawerChanges(drawer)) {
      updateDrawer((prev) => ({ ...prev, confirm: 'discard' }));
      return;
    }
    finishDrawer();
  }

  function requestBack() {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.busy) return;
    if (drawer.stack.length === 0) {
      requestClose();
      return;
    }
    const isPicker =
      drawer.route.page === 'products' ||
      drawer.route.page === 'groups' ||
      drawer.route.page === 'linked' ||
      drawer.route.page === 'subset' ||
      drawer.route.page === 'sub-products';
    if (!isPicker && isRouteChanged(drawer.route)) {
      updateDrawer((prev) => ({ ...prev, confirm: 'discard' }));
      return;
    }
    popRoute();
  }

  function confirmDiscard() {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.confirm !== 'discard') return;
    finishDrawer();
  }

  function dismissConfirm() {
    updateDrawer((prev) => ({ ...prev, confirm: null }));
  }

  function requestDelete() {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.busy) return;
    const { route } = drawer;
    if (route.page === 'option' || route.page === 'group' || route.page === 'product') {
      const confirm: OptionDrawerConfirmKind = 'delete';
      updateDrawer((prev) => ({ ...prev, confirm }));
    }
  }

  function selectNewScope(scope: 'item' | 'order') {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.route.page !== 'new-group-scope') return;
    const draft = makeBlankGroupDraft(scope);
    const scopeEntry = {
      route: prepareDrawerRoute({ page: 'new-group-scope' }),
      scroll: drawer.scroll,
    };
    setSnapshot((prev) => ({
      ...prev,
      drawer: {
        kind: 'group',
        draft,
        original: entitySnapshot('group', draft),
        required: false,
        ruleErrors: {},
        optionsOnly: false,
        stack: [scopeEntry],
        route: prepareDrawerRoute({ page: 'group' }),
        busy: false,
        aiBusy: false,
        error: '',
        scroll: 0,
        confirm: null,
      },
    }));
  }

  function setRouteViewPatch(patch: Partial<NonNullable<OptionDrawerRoute['view']>>) {
    updateDrawer((prev) => ({
      ...prev,
      route: {
        ...prev.route,
        view: {
          ...(prev.route.view || {}),
          ...patch,
        },
      },
    }));
  }

  function setScroll(scroll: number) {
    if (!snapshot.drawer) return;
    snapshot = {
      ...snapshot,
      drawer: {
        ...snapshot.drawer,
        scroll,
      },
    };
  }

  function writeI18nValue(
    target: MenuI18nMapDto | undefined,
    loc: string,
    prop: string,
    value: string,
    subKey?: string
  ): MenuI18nMapDto {
    const next: MenuI18nMapDto = cloneValue(target || {});
    const patch = { ...(next[loc] || {}) };
    if (prop === 'sub_options' && subKey) {
      const subs = { ...(patch.sub_options || {}) };
      subs[subKey] = value;
      patch.sub_options = subs;
    } else {
      patch[prop] = value;
    }
    next[loc] = patch;
    return cleanI18n(next);
  }

  function setField(field: string, value: string | number | boolean, subKey?: string) {
    const locale = syncLocale();
    updateDrawer((prev) => {
      const next = cloneValue(prev);

      if (next.route.page === 'product') {
        const d = next.draft as ProductDraft;
        if (field === 'name') d.name = String(value);
        else if (field === 'categoryId') d.categoryId = String(value);
        else if (field === 'price') {
          const parsed = Number(value);
          d.price = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        } else if (field === 'badgeText') {
          d.badgeText = String(value);
        } else if (field === 'isRecommended') {
          d.isRecommended = Boolean(value);
        } else if (field.startsWith('i18n.')) {
          const parts = field.split('.');
          const loc = parts[1];
          const prop = parts[2];
          if (loc && prop) d.i18n = writeI18nValue(d.i18n, loc, prop, String(value));
        }
        next.error = '';
        return next;
      }

      if (next.route.page === 'group') {
        const g = next.draft as OptionGroupDraft;
        if (field === 'name') {
          g.name = String(value);
        } else if (field === 'required') {
          const req = Boolean(value);
          next.required = req;
          if (req && Number(g.minSelection) < 1) {
            g.minSelection = 1;
          } else if (!req) {
            g.minSelection = 0;
          }
          g.autoPopup = Boolean(g.included || Number(g.minSelection) > 0);
        } else if (field === 'minSelection') {
          const raw = String(value).trim();
          g.minSelection = raw === '' ? '' : Number(raw);
          if (raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 1) {
            next.required = true;
          }
          g.autoPopup = Boolean(g.included || Number(g.minSelection) > 0);
        } else if (field === 'maxSelection') {
          const raw = String(value).trim();
          g.maxSelection = raw === '' ? '' : Number(raw);
        } else if (field === 'allowRepeats') {
          g.allowRepeats = Boolean(value);
        } else if (field === 'included') {
          const inc = Boolean(value);
          g.included = inc;
          if (inc) {
            const [minC, maxC] = computeSelectionRules({ ...g, included: true }, snapshot.catalog);
            g.minSelection = minC;
            g.maxSelection = maxC;
            next.required = true;
          }
          g.autoPopup = Boolean(g.included || Number(g.minSelection) > 0);
        } else if (field.startsWith('i18n.')) {
          const parts = field.split('.');
          const loc = parts[1];
          const prop = parts[2];
          if (loc && prop) g.i18n = writeI18nValue(g.i18n, loc, prop, String(value));
        }

        next.ruleErrors = computeSelectionErrors(g, next.required, snapshot.catalog, locale);
        next.error = next.ruleErrors.minSelection || next.ruleErrors.maxSelection || '';
        return next;
      }

      if (next.route.page === 'option') {
        const opt = next.route.option;
        if (field === 'option.name') {
          opt.name = String(value);
        } else if (field === 'option.price') {
          const parsed = Number(value);
          opt.price = Number.isFinite(parsed) ? parsed : 0;
        } else if (field === 'option.quantity') {
          const raw = String(value).trim();
          opt.quantity = raw === '' ? 0 : Number(raw);
        } else if (field === 'option.isDefault') {
          opt.isDefault = Boolean(value);
        } else if (field === 'option.isLocallyOutOfStock') {
          const out = Boolean(value);
          opt.isLocallyOutOfStock = out;
          if (!out) {
            opt.outOfStockUntil = null;
          }
        } else if (field === 'option.description') {
          opt.description = String(value);
        } else if (field === 'eligibility.min_order_subtotal' || field === 'eligibility.error_message') {
          const rules = cloneValue(opt.eligibilityRules || []);
          let rule = rules.find((r) => r.rule_type === 'min_order_subtotal');
          if (!rule) {
            rule = {
              rule_type: 'min_order_subtotal',
              min_order_subtotal: 0,
              error_message: '',
              threshold_basis: 'merchandise_subtotal',
            };
            rules.push(rule);
          }
          if (field === 'eligibility.min_order_subtotal') {
            const num = Number(value);
            rule.min_order_subtotal = Number.isFinite(num) && num > 0 ? num : 0;
          } else {
            rule.error_message = String(value);
          }
          opt.eligibilityRules = rules.filter(
            (r) =>
              r.rule_type !== 'min_order_subtotal' ||
              Number(r.min_order_subtotal || 0) > 0 ||
              Boolean(String(r.error_message || '').trim())
          );
        } else if (field.startsWith('sub.')) {
          const match = /^sub\.(\d+)\.(name|price)$/.exec(field);
          if (match) {
            const idx = Number(match[1]);
            const prop = match[2];
            const subs = [...(opt.subOptions || [])];
            const cur = subs[idx];
            if (cur !== undefined) {
              const obj: OptionCatalogSubOptionDto =
                typeof cur === 'string' ? { name: cur, price: 0 } : { ...cur };
              if (prop === 'name') {
                if (obj.productId) return prev;
                obj.name = String(value);
              }
              if (prop === 'price') {
                const parsed = Number(value);
                obj.price = Number.isFinite(parsed) ? parsed : 0;
              }
              subs[idx] = obj;
              opt.subOptions = subs;
            }
          }
        } else if (field.startsWith('option.i18n.')) {
          const parts = field.split('.');
          const loc = parts[2];
          const prop = parts[3];
          if (loc && prop) {
            opt.i18n = writeI18nValue(opt.i18n, loc, prop, String(value), subKey);
          }
        }
        next.error = '';
        return next;
      }

      if (field === 'search') {
        next.route.view = { ...(next.route.view || {}), search: String(value) };
      } else if (field === 'filter') {
        next.route.view = { ...(next.route.view || {}), filter: String(value) };
      }
      return next;
    });
  }

  function stepRule(key: 'minSelection' | 'maxSelection', delta: number) {
    const locale = syncLocale();
    const drawer = snapshot.drawer;
    if (!drawer || drawer.kind !== 'group') return;
    updateDrawer((prev) => {
      if (prev.kind !== 'group') return prev;
      const next = cloneValue(prev);
      const g = next.draft as OptionGroupDraft;
      const curMin = Number(g.minSelection || 0);
      const curMax = Number(g.maxSelection || 0);
      if (key === 'minSelection') {
        const minBound = next.required ? 1 : 0;
        const nextMin = Math.min(999, Math.max(minBound, curMin + delta));
        g.minSelection = nextMin;
        if (nextMin > curMax) {
          g.maxSelection = nextMin;
        }
        next.required = nextMin >= 1;
        g.autoPopup = Boolean(g.included || nextMin > 0);
      } else {
        const nextMax = Math.min(999, Math.max(1, curMax + delta));
        g.maxSelection = nextMax;
        if (nextMax < curMin) {
          g.minSelection = next.required ? Math.max(1, nextMax) : nextMax;
          g.autoPopup = Boolean(g.included || Number(g.minSelection) > 0);
        }
      }
      next.ruleErrors = computeSelectionErrors(g, next.required, snapshot.catalog, locale);
      next.error = next.ruleErrors.minSelection || next.ruleErrors.maxSelection || '';
      return next;
    });
  }

  function validateRules() {
    const locale = syncLocale();
    updateDrawer((prev) => {
      if (prev.kind !== 'group' || prev.route.page !== 'group') return prev;
      const g = prev.draft as OptionGroupDraft;
      const ruleErrors = computeSelectionErrors(g, prev.required, snapshot.catalog, locale);
      return {
        ...prev,
        ruleErrors,
      };
    });
  }

  function toggleSelectionId(
    checkType: 'group' | 'product' | 'subset' | 'category',
    id: string,
    checked: boolean
  ) {
    updateDrawer((prev) => {
      const next = cloneValue(prev);
      const route = next.route;

      if (checkType === 'group' && route.page === 'groups') {
        const set = new Set(route.ids);
        if (checked) set.add(id);
        else set.delete(id);
        route.ids = Array.from(set);
      } else if (checkType === 'subset' && route.page === 'subset') {
        const group = findGroupById(snapshot.catalog, route.id);
        const allIds = (group?.options || []).map((o) => o.id);
        const set = new Set(route.optionIds === null ? allIds : route.optionIds);
        if (checked) set.add(id);
        else set.delete(id);
        if (route.originalOptionIds === null && allIds.length > 0 && set.size >= allIds.length) {
          route.optionIds = null;
        } else {
          route.optionIds = allIds.filter((oid) => set.has(oid));
        }
      } else if (
        checkType === 'product' &&
        (route.page === 'products' || route.page === 'linked' || route.page === 'sub-products')
      ) {
        const set = new Set(route.ids);
        if (checked) set.add(id);
        else set.delete(id);
        route.ids = Array.from(set);
      } else if (
        checkType === 'category' &&
        (route.page === 'products' || route.page === 'linked' || route.page === 'sub-products')
      ) {
        const set = new Set(route.ids);
        for (const p of snapshot.catalog?.products || []) {
          if (p.category_id !== id) continue;
          if (checked) set.add(p.id);
          else set.delete(p.id);
        }
        route.ids = Array.from(set);
      }

      next.error = '';
      return next;
    });
  }

  function removeProductGroup(groupId: string) {
    updateDrawer((prev) => {
      if (prev.kind !== 'product') return prev;
      const next = cloneValue(prev);
      const d = next.draft as ProductDraft;
      const prevIdx = d.links.findIndex((l) => l.groupId === groupId);
      const prevLink = prevIdx >= 0 ? d.links[prevIdx] : null;
      const nextLink: OptionCatalogLinkDto = {
        groupId,
        optionIds: null,
        disabled: true,
        ...(prevLink?.sortOrder !== undefined ? { sortOrder: prevLink.sortOrder } : {}),
      };
      if (prevIdx >= 0) d.links[prevIdx] = nextLink;
      else d.links.push(nextLink);
      return next;
    });
  }

  function openProductGroupsPicker() {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.kind !== 'product') return;
    const d = drawer.draft as ProductDraft;
    pushRoute({
      page: 'groups',
      ids: resolveProductGroups(d, snapshot.catalog).map((e) => e.group.id),
    });
  }

  function openGroupSubsetPicker(groupId: string) {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.kind !== 'product') return;
    const d = drawer.draft as ProductDraft;
    const link = d.links.find((l) => l.groupId === groupId);
    if (!link) return;
    pushRoute({
      page: 'subset',
      id: groupId,
      optionIds: link.optionIds ? [...link.optionIds] : null,
    });
  }

  function openAddOptionRoute() {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.kind !== 'group') return;
    pushRoute({ page: 'add-option' });
  }

  function openAddCustomOption() {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.kind !== 'group') return;
    pushRoute({
      page: 'option',
      option: makeBlankOption(),
      isNew: true,
    });
  }

  function openLinkedProductsPicker() {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.kind !== 'group') return;
    const g = drawer.draft as OptionGroupDraft;
    pushRoute({
      page: 'linked',
      ids: [...(g.itemIds || [])],
    });
  }

  function openLinkProductsForAddOption() {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.kind !== 'group') return;
    pushRoute({
      page: 'products',
      ids: [],
    });
  }

  function openOptionDetails(optionId: string) {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.kind !== 'group') return;
    const g = drawer.draft as OptionGroupDraft;
    const opt = g.options.find((o) => o.id === optionId);
    if (!opt) return;
    pushRoute({
      page: 'option',
      option: cloneValue(opt),
      isNew: false,
    });
  }

  function addCustomSubOption() {
    updateDrawer((prev) => {
      if (prev.route.page !== 'option') return prev;
      const next = cloneValue(prev);
      const opt = (next.route as Extract<OptionDrawerRoute, { page: 'option' }>).option;
      opt.subOptions = [
        ...(opt.subOptions || []),
        { id: makeTempId('opt'), name: '', price: 0, productId: null },
      ];
      return next;
    });
  }

  function openSubProductsPicker() {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.route.page !== 'option') return;
    const existingIds = (drawer.route.option.subOptions || [])
      .map((s) => (typeof s === 'string' ? null : s.productId || null))
      .filter((id): id is string => Boolean(id));
    pushRoute({
      page: 'sub-products',
      ids: existingIds,
    });
  }

  function removeSubOption(index: number) {
    updateDrawer((prev) => {
      if (prev.route.page !== 'option') return prev;
      const next = cloneValue(prev);
      const opt = (next.route as Extract<OptionDrawerRoute, { page: 'option' }>).option;
      opt.subOptions = (opt.subOptions || []).filter((_, i) => i !== index);
      return next;
    });
  }

  async function selectProductPhoto(file: File | null) {
    if (!file) return;
    try {
      const dataUrl = bridge.readImageAsDataUrl
        ? await bridge.readImageAsDataUrl(file)
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => reject(reader.error || new Error('File read error'));
            reader.readAsDataURL(file);
          });
      updateDrawer((prev) => {
        if (prev.kind !== 'product') return prev;
        const next = cloneValue(prev);
        const d = next.draft as ProductDraft;
        d.imageDraft = dataUrl || null;
        d.removedPhoto = false;
        return next;
      });
    } catch {
      // ignore unreadable file
    }
  }

  function removeProductPhoto() {
    updateDrawer((prev) => {
      if (prev.kind !== 'product') return prev;
      const next = cloneValue(prev);
      const d = next.draft as ProductDraft;
      d.imageKey = '';
      d.imageDraft = null;
      d.removedPhoto = true;
      return next;
    });
  }

  function applyRoute(): boolean {
    const locale = syncLocale();
    const drawer = snapshot.drawer;
    if (!drawer) return false;
    const validation = validateRouteAndDraft(drawer, snapshot.catalog, locale);
    if (validation.error || validation.ruleErrors.minSelection || validation.ruleErrors.maxSelection) {
      updateDrawer((prev) => ({
        ...prev,
        error: validation.error,
        ruleErrors: validation.ruleErrors,
      }));
      return false;
    }

    const { route } = drawer;

    if (route.page === 'option') {
      updateDrawer((prev) => {
        const next = cloneValue(prev);
        const g = next.draft as OptionGroupDraft;
        const opt = cloneValue((prev.route as Extract<OptionDrawerRoute, { page: 'option' }>).option);
        const idx = g.options.findIndex((o) => o.id === opt.id);
        if (idx >= 0) g.options[idx] = opt;
        else g.options.push(opt);

        const nextStack = [...next.stack];
        while (nextStack.length > 0 && nextStack[nextStack.length - 1]!.route.page === 'add-option') {
          nextStack.pop();
        }
        const top = nextStack.pop();
        return {
          ...next,
          stack: nextStack,
          route: top ? top.route : prepareDrawerRoute({ page: 'group' }),
          scroll: top ? top.scroll : 0,
          error: '',
          confirm: null,
        };
      });
      return true;
    }

    if (route.page === 'products') {
      const groupDraft = drawer.draft as OptionGroupDraft;
      for (const pid of route.ids) {
        if (wouldCreateCycle(pid, groupDraft.id, snapshot.catalog)) {
          updateDrawer((prev) => ({
            ...prev,
            error: translatePos(locale, 'ugCycle'),
          }));
          return false;
        }
      }
      updateDrawer((prev) => {
        const next = cloneValue(prev);
        const g = next.draft as OptionGroupDraft;
        const existingPids = new Set(g.options.map((o) => o.productId).filter(Boolean));
        for (const pid of route.ids) {
          if (existingPids.has(pid)) continue;
          const prod = findProductById(snapshot.catalog, pid);
          if (!prod) continue;
          g.options.push(
            makeBlankOption({
              name: prod.name,
              productId: prod.id,
              price: 0,
              quantity: 1,
              retailPrice: prod.price,
            })
          );
        }
        const nextStack = [...next.stack];
        while (nextStack.length > 0 && nextStack[nextStack.length - 1]!.route.page === 'add-option') {
          nextStack.pop();
        }
        const top = nextStack.pop();
        return {
          ...next,
          stack: nextStack,
          route: top ? top.route : prepareDrawerRoute({ page: 'group' }),
          scroll: top ? top.scroll : 0,
          error: '',
          confirm: null,
        };
      });
      return true;
    }

    if (route.page === 'sub-products') {
      updateDrawer((prev) => {
        if (prev.stack.length === 0) return prev;
        const nextStack = prev.stack.slice(0, -1);
        const top = prev.stack[prev.stack.length - 1]!;
        if (top.route.page !== 'option') return prev;
        const nextRoute = cloneValue(top.route);
        const customSubs = (nextRoute.option.subOptions || []).filter(
          (s) => typeof s === 'string' || !s.productId
        );
        const existingLinked = new Map<string, OptionCatalogSubOptionDto>();
        for (const s of nextRoute.option.subOptions || []) {
          if (typeof s !== 'string' && s.productId) {
            existingLinked.set(s.productId, s);
          }
        }
        const linkedSubs: OptionCatalogSubOptionDto[] = [];
        for (const pid of route.ids) {
          const kept = existingLinked.get(pid);
          if (kept) {
            linkedSubs.push(cloneValue(kept));
          } else {
            const prod = findProductById(snapshot.catalog, pid);
            if (prod) {
              linkedSubs.push({
                id: makeTempId('opt'),
                productId: prod.id,
                name: prod.name,
                price: 0,
              });
            }
          }
        }
        nextRoute.option.subOptions = [...customSubs, ...linkedSubs];
        return {
          ...prev,
          stack: nextStack,
          route: nextRoute,
          scroll: top.scroll,
          error: '',
          confirm: null,
        };
      });
      return true;
    }

    if (route.page === 'linked') {
      updateDrawer((prev) => {
        if (prev.kind !== 'group') return prev;
        const next = cloneValue(prev);
        const g = next.draft as OptionGroupDraft;
        g.itemIds = sortedUniqueIds(route.ids);
        const nextStack = prev.stack.slice(0, -1);
        const top = prev.stack[prev.stack.length - 1];
        return {
          ...next,
          stack: nextStack,
          route: top ? top.route : prepareDrawerRoute({ page: 'group' }),
          scroll: top ? top.scroll : 0,
          error: '',
          confirm: null,
        };
      });
      return true;
    }

    if (route.page === 'groups') {
      updateDrawer((prev) => {
        if (prev.kind !== 'product') return prev;
        const next = cloneValue(prev);
        const d = next.draft as ProductDraft;
        const selected = new Set(route.ids);
        const byId = new Map<string, OptionCatalogLinkDto>();
        for (const l of d.links || []) {
          byId.set(l.groupId, l);
        }
        const nextLinks: OptionCatalogLinkDto[] = [];
        for (const l of d.links || []) {
          if (selected.has(l.groupId)) {
            nextLinks.push({ ...cloneValue(l), disabled: false });
          } else {
            nextLinks.push({
              ...cloneValue(l),
              disabled: true,
            });
          }
        }
        let nextOrder = nextLinks.reduce((m, x) => Math.max(m, Number(x.sortOrder ?? -1)), -1) + 1;
        for (const gid of route.ids) {
          if (byId.has(gid)) continue;
          const group = findGroupById(snapshot.catalog, gid);
          nextLinks.push({
            groupId: gid,
            itemId: d.id,
            optionIds: null,
            disabled: false,
            sortOrder: group?.sortOrder ?? nextOrder++,
          });
        }
        d.links = nextLinks;
        const nextStack = prev.stack.slice(0, -1);
        const top = prev.stack[prev.stack.length - 1];
        return {
          ...next,
          stack: nextStack,
          route: top ? top.route : prepareDrawerRoute({ page: 'product-options' }),
          scroll: top ? top.scroll : 0,
          error: '',
          confirm: null,
        };
      });
      return true;
    }

    if (route.page === 'subset') {
      const group = findGroupById(snapshot.catalog, route.id);
      if (group && isInsufficientLink(group, { optionIds: route.optionIds }, snapshot.catalog)) {
        updateDrawer((prev) => ({ ...prev, error: translatePos(locale, 'ugInsufficient') }));
        return false;
      }
      updateDrawer((prev) => {
        if (prev.kind !== 'product') return prev;
        const next = cloneValue(prev);
        const d = next.draft as ProductDraft;
        const prevIdx = d.links.findIndex((l) => l.groupId === route.id);
        const prevLink = prevIdx >= 0 ? d.links[prevIdx] : null;
        const nextOrder =
          prevLink?.sortOrder !== undefined
            ? prevLink.sortOrder
            : d.links.reduce((m, x) => Math.max(m, Number(x.sortOrder ?? -1)), -1) + 1;
        const nextLink: OptionCatalogLinkDto = {
          groupId: route.id,
          itemId: d.id,
          optionIds: route.optionIds ? [...route.optionIds] : null,
          disabled: false,
          sortOrder: nextOrder,
        };
        if (prevIdx >= 0) d.links[prevIdx] = nextLink;
        else d.links.push(nextLink);
        const nextStack = prev.stack.slice(0, -1);
        const top = prev.stack[prev.stack.length - 1];
        return {
          ...next,
          stack: nextStack,
          route: top ? top.route : prepareDrawerRoute({ page: 'product-options' }),
          scroll: top ? top.scroll : 0,
          error: '',
          confirm: null,
        };
      });
      return true;
    }

    return false;
  }

  function syncMenuAfterSave(opts: {
    kind: 'product' | 'group';
    id: string;
    remove: boolean;
    optionsOnly: boolean;
    catalog: OptionCatalogDto;
  }) {
    const res = rebaseMenuSnapshots({
      kind: opts.kind,
      id: opts.id,
      remove: opts.remove,
      optionsOnly: opts.optionsOnly,
      catalog: opts.catalog,
      currentMenuData: bridge.getCurrentMenuData(),
      savedMenuSnapshot: bridge.getSavedMenuSnapshot(),
      serializeCanonical: bridge.serializeCanonical,
    });
    bridge.setMenuSnapshots(res.currentMenuData, res.savedMenuSnapshot);
    bridge.afterSaveSync?.();
  }

  async function persistEntity(
    remove: boolean,
    overrideDraft?: ProductDraft | OptionGroupDraft,
    skipPureStockCheck = false
  ): Promise<boolean> {
    const locale = syncLocale();
    const drawer = snapshot.drawer;
    if (!drawer || drawer.busy) return false;

    const targetDraft = overrideDraft ?? drawer.draft;

    if (!remove) {
      if (!overrideDraft && !hasDrawerChanges(drawer)) {
        finishDrawer();
        return true;
      }
      if (!overrideDraft) {
        const validation = validateRouteAndDraft(drawer, snapshot.catalog, locale);
        if (validation.error || validation.ruleErrors.minSelection || validation.ruleErrors.maxSelection) {
          const focusField = validation.ruleErrors.minSelection
            ? 'minSelection'
            : validation.ruleErrors.maxSelection
              ? 'maxSelection'
              : null;
          updateDrawer((prev) => ({
            ...prev,
            error: validation.error,
            ruleErrors: validation.ruleErrors,
          }));
          if (focusField) {
            bridge.onValidationFocus?.(focusField);
          }
          if (
            drawer.kind === 'group' &&
            drawer.route.page === 'group' &&
            (validation.error === translatePos(locale, 'ugGroupNoOptions') ||
              Boolean(validation.ruleErrors.minSelection || validation.ruleErrors.maxSelection))
          ) {
            bridge.alertFn?.(validation.error);
          }
          return false;
        }
      }
    }

    updateDrawer((prev) => ({ ...prev, busy: true, error: '', confirm: null }));
    const tenant = bridge.getTenantId();
    const base = bridge.getWorkerBase();
    const kind = drawer.kind;

    try {
      let nextCatalog: OptionCatalogDto | null = null;
      let savedId = targetDraft.id;

      if (!remove && !skipPureStockCheck && kind === 'group') {
        const g = targetDraft as OptionGroupDraft;
        const pureStock = !g.isNew && snapshot.catalog ? extractPureLocalStockChanges(g, snapshot.catalog) : null;
        if (pureStock && pureStock.length > 0) {
          for (const opt of pureStock) {
            const stockRes = await doFetch(
              `${base}/api/menu/stock-status?tenant_id=${encodeURIComponent(tenant)}`,
              {
                method: 'POST',
                headers: bridge.getAuthHeaders(true),
                body: JSON.stringify({
                  category_slug: 'modifier_option',
                  option_id: opt.id,
                  group_id: g.id,
                  name: findProductById(snapshot.catalog, opt.productId)?.name || opt.name || opt.id,
                  status: opt.isLocallyOutOfStock ? 'out_of_stock' : 'in_stock',
                  duration: 'indefinite',
                }),
              }
            );
            const stockJson = (await stockRes.json().catch(() => ({}))) as { error?: string };
            if (!stockRes.ok) {
              throw new Error(stockJson.error || 'MENU_SAVE_FAILED');
            }
          }
          nextCatalog = await load(tenant, true);
          if (nextCatalog && savedId) {
            syncMenuAfterSave({
              kind: 'group',
              id: savedId,
              remove: false,
              optionsOnly: true,
              catalog: nextCatalog,
            });
          }
          finishDrawer();
          return true;
        }
      }

      const endpoint = kind === 'product' ? 'product' : 'option-group';
      const payload: Record<string, unknown> = {
        ...cloneValue(targetDraft),
        delete: remove,
      };
      if (targetDraft.i18n !== undefined) {
        payload.i18n = cleanI18n(targetDraft.i18n);
      }
      if (kind === 'group' && Array.isArray(payload.options)) {
        payload.options = (payload.options as OptionCatalogOptionDto[]).map((opt) =>
          opt && opt.i18n !== undefined ? { ...opt, i18n: cleanI18n(opt.i18n) } : opt
        );
      }

      const res = await doFetch(
        `${base}/api/menu/${endpoint}?tenant_id=${encodeURIComponent(tenant)}`,
        {
          method: 'POST',
          headers: bridge.getAuthHeaders(true),
          body: JSON.stringify(payload),
        }
      );
      const result = (await res.json().catch(() => ({}))) as {
        error?: string;
        catalog?: OptionCatalogDto;
        id?: string;
        groupId?: string;
      };
      if (!res.ok) {
        throw new Error(result.error || 'MENU_SAVE_FAILED');
      }

      savedId = result.groupId || result.id || savedId;
      if (result.catalog) {
        nextCatalog = result.catalog;
        const savedScopeKey =
          kind === 'group' && (targetDraft as OptionGroupDraft).scope === 'order' ? 'order' : 'item';
        setSnapshot((prev) => ({
          ...prev,
          catalog: nextCatalog,
          catalogTenant: tenant,
          selectedGroupId:
            kind === 'group' && !remove
              ? savedId || prev.selectedGroupId
              : prev.selectedGroupId,
          groupSectionsOpen:
            kind === 'group' && !remove
              ? { ...prev.groupSectionsOpen, [savedScopeKey]: true }
              : prev.groupSectionsOpen,
        }));
      } else {
        nextCatalog = await load(tenant, true);
        if (kind === 'group' && !remove) {
          const savedScopeKey = (targetDraft as OptionGroupDraft).scope === 'order' ? 'order' : 'item';
          setSnapshot((prev) => ({
            ...prev,
            selectedGroupId: savedId || prev.selectedGroupId,
            groupSectionsOpen: { ...prev.groupSectionsOpen, [savedScopeKey]: true },
          }));
        }
      }

      if (kind === 'product') {
        const d = targetDraft as ProductDraft;
        if (d.imageDraft && !remove) {
          const imageRes = await doFetch(
            `${base}/api/image?tenant_id=${encodeURIComponent(tenant)}`,
            {
              method: 'POST',
              headers: bridge.getAuthHeaders(true),
              body: JSON.stringify({ name: d.imageKey, dataUri: d.imageDraft }),
            }
          );
          if (!imageRes.ok) {
            const refreshedProd = findProductById(nextCatalog, d.id);
            updateDrawer((prev) => {
              const next = cloneValue(prev);
              (next.draft as ProductDraft).revision = refreshedProd?.menu_revision ?? 1;
              return next;
            });
            throw new Error('IMAGE_SAVE_FAILED');
          }
        } else if (!d.imageDraft && !d.imageKey) {
          const keys: string[] = [];
          if (d.prevImageKey) keys.push(d.prevImageKey);
          keys.push(d.name, `product:${d.id}`);
          if (d.id) keys.push(d.id);
          if (d.categoryId) keys.push(`${d.categoryId}_${d.name}`);
          for (const cat of nextCatalog?.categories || []) {
            keys.push(`${cat.id}_${d.name}`);
            if (cat.slug) keys.push(`${cat.slug}_${d.name}`);
          }
          bridge.invalidateMenuImageCache?.(keys);
        }
      }

      if (nextCatalog && savedId) {
        syncMenuAfterSave({
          kind,
          id: savedId,
          remove,
          optionsOnly: drawer.optionsOnly,
          catalog: nextCatalog,
        });
      }
      if (kind === 'group' && remove) {
        bridge.onGroupDeleted?.();
      }
      finishDrawer();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || '');
      const key = resolveSaveErrorKey(msg);
      updateDrawer((prev) => ({
        ...prev,
        busy: false,
        error: translatePos(locale, key),
      }));
      return false;
    }
  }

  async function save(): Promise<boolean> {
    const locale = syncLocale();
    const drawer = snapshot.drawer;
    if (!drawer || drawer.busy) return false;

    if (drawer.route.page === 'option' && drawer.route.direct) {
      if (!isRouteChanged(drawer.route)) {
        finishDrawer();
        return true;
      }
      const validation = validateRouteAndDraft(drawer, snapshot.catalog, locale);
      if (validation.error) {
        updateDrawer((prev) => ({
          ...prev,
          error: validation.error,
        }));
        return false;
      }
      const pendingGroup = cloneValue(drawer.draft as OptionGroupDraft);
      const opt = cloneValue(drawer.route.option);
      const idx = pendingGroup.options.findIndex((o) => o.id === opt.id);
      if (idx >= 0) pendingGroup.options[idx] = opt;
      else pendingGroup.options.push(opt);
      if (pendingGroup.included) {
        const [minC, maxC] = computeSelectionRules(pendingGroup, snapshot.catalog);
        pendingGroup.minSelection = minC;
        pendingGroup.maxSelection = maxC;
      }
      return persistEntity(false, pendingGroup);
    }

    if (
      drawer.route.page !== 'product' &&
      drawer.route.page !== 'product-options' &&
      drawer.route.page !== 'group'
    ) {
      return applyRoute();
    }

    return persistEntity(false);
  }

  async function removeOptionAction(): Promise<boolean> {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.busy || drawer.route.page !== 'option') return false;
    const optId = drawer.route.option.id;
    if (drawer.route.direct) {
      const pendingGroup = cloneValue(drawer.draft as OptionGroupDraft);
      pendingGroup.options = pendingGroup.options.filter((o) => o.id !== optId);
      return persistEntity(false, pendingGroup, true);
    }
    updateDrawer((prev) => {
      const next = cloneValue(prev);
      const g = next.draft as OptionGroupDraft;
      g.options = g.options.filter((o) => o.id !== optId);
      const nextStack = [...next.stack];
      while (nextStack.length > 0 && nextStack[nextStack.length - 1]!.route.page === 'add-option') {
        nextStack.pop();
      }
      const top = nextStack.pop();
      return {
        ...next,
        stack: nextStack,
        route: top ? top.route : prepareDrawerRoute({ page: 'group' }),
        scroll: top ? top.scroll : 0,
        confirm: null,
        error: '',
      };
    });
    return true;
  }

  async function confirmDelete(): Promise<boolean> {
    const drawer = snapshot.drawer;
    if (!drawer || drawer.busy) return false;

    if (drawer.route.page === 'option') {
      const optId = drawer.route.option.id;
      updateDrawer((prev) => {
        const next = cloneValue(prev);
        const g = next.draft as OptionGroupDraft;
        g.options = g.options.filter((o) => o.id !== optId);
        const nextStack = [...next.stack];
        while (nextStack.length > 0 && nextStack[nextStack.length - 1]!.route.page === 'add-option') {
          nextStack.pop();
        }
        const top = nextStack.pop();
        return {
          ...next,
          stack: nextStack,
          route: top ? top.route : prepareDrawerRoute({ page: 'group' }),
          scroll: top ? top.scroll : 0,
          confirm: null,
          error: '',
        };
      });
      return true;
    }

    if (drawer.route.page !== 'group' && drawer.route.page !== 'product') return false;
    if (drawer.draft.isNew || !drawer.draft.id) {
      finishDrawer();
      return true;
    }
    return persistEntity(true);
  }

  async function translateWithAi(): Promise<boolean> {
    const locale = syncLocale();
    const drawer = snapshot.drawer;
    if (!drawer || drawer.aiBusy) return false;
    const targetLocales =
      bridge.getTenantAiTargetLocales?.().length
        ? bridge.getTenantAiTargetLocales()
        : DEFAULT_AI_TARGET_LOCALES;
    const tenant = bridge.getTenantId();
    const base = bridge.getWorkerBase();

    updateDrawer((prev) => ({ ...prev, aiBusy: true, error: '' }));

    try {
      if (drawer.route.page === 'product') {
        const d = drawer.draft as ProductDraft;
        const res = await doFetch(`${base}/api/menu/ai-translate`, {
          method: 'POST',
          headers: bridge.getAuthHeaders(true),
          body: JSON.stringify({
            tenant,
            targetLocales,
            item: { name: d.name, badge_text: d.badgeText },
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          translations?: MenuI18nMapDto;
        };
        if (!res.ok || !json.translations) {
          throw new Error(json.error || translatePos(locale, 'ugAiTranslateError'));
        }
        updateDrawer((prev) => {
          const next = cloneValue(prev);
          const pd = next.draft as ProductDraft;
          pd.i18n = cleanI18n({ ...(pd.i18n || {}), ...json.translations });
          next.aiBusy = false;
          return next;
        });
        return true;
      }

      if (drawer.route.page === 'group') {
        const g = drawer.draft as OptionGroupDraft;
        const res = await doFetch(`${base}/api/menu/ai-translate`, {
          method: 'POST',
          headers: bridge.getAuthHeaders(true),
          body: JSON.stringify({
            tenant,
            targetLocales,
            group: { name: g.name },
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          translations?: MenuI18nMapDto;
        };
        if (!res.ok || !json.translations) {
          throw new Error(json.error || translatePos(locale, 'ugAiTranslateError'));
        }
        updateDrawer((prev) => {
          const next = cloneValue(prev);
          const gd = next.draft as OptionGroupDraft;
          gd.i18n = cleanI18n({ ...(gd.i18n || {}), ...json.translations });
          next.aiBusy = false;
          return next;
        });
        return true;
      }

      if (drawer.route.page === 'option') {
        const opt = drawer.route.option;
        const subNames = (opt.subOptions || [])
          .map((s) => (typeof s === 'string' ? s : s.productId ? '' : s.name))
          .filter(Boolean);
        const res = await doFetch(`${base}/api/menu/ai-translate`, {
          method: 'POST',
          headers: bridge.getAuthHeaders(true),
          body: JSON.stringify({
            tenant,
            targetLocales,
            option: { name: opt.name, sub_options: subNames },
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          translations?: MenuI18nMapDto;
        };
        if (!res.ok || !json.translations) {
          throw new Error(json.error || translatePos(locale, 'ugAiTranslateError'));
        }
        updateDrawer((prev) => {
          if (prev.route.page !== 'option') return { ...prev, aiBusy: false };
          const next = cloneValue(prev);
          const nextOpt = (next.route as Extract<OptionDrawerRoute, { page: 'option' }>).option;
          nextOpt.i18n = cleanI18n({ ...(nextOpt.i18n || {}), ...json.translations });
          next.aiBusy = false;
          return next;
        });
        return true;
      }

      updateDrawer((prev) => ({ ...prev, aiBusy: false }));
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      updateDrawer((prev) => ({
        ...prev,
        aiBusy: false,
        error: msg || translatePos(locale, 'ugAiTranslateError'),
      }));
      return false;
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    setLocale(locale: PosLocale) {
      if (snapshot.locale === locale) return;
      setSnapshot((prev) => ({ ...prev, locale }));
    },
    load,
    selectGroup(groupId: string | null) {
      setSnapshot((prev) => ({ ...prev, selectedGroupId: groupId }));
      bridge.onGroupSelected?.(groupId);
    },
    setGroupQuery(query: string) {
      setSnapshot((prev) => ({ ...prev, groupQuery: query }));
    },
    setGroupSectionOpen(scope: 'order' | 'item', open: boolean) {
      setSnapshot((prev) => ({
        ...prev,
        groupSectionsOpen: { ...prev.groupSectionsOpen, [scope]: open },
      }));
    },
    openNewGroupScope: () => openGroup(null),
    openProduct,
    openGroup,
    openOption,
    pushRoute,
    requestClose,
    requestBack,
    confirmDiscard,
    dismissConfirm,
    requestDelete,
    confirmDelete,
    selectNewScope,
    setRouteViewPatch,
    setScroll,
    setField,
    stepRule,
    validateRules,
    toggleSelectionId,
    removeProductGroup,
    openProductGroupsPicker,
    openGroupSubsetPicker,
    openAddOptionRoute,
    openAddCustomOption,
    openLinkedProductsPicker,
    openLinkProductsForAddOption,
    openOptionDetails,
    addCustomSubOption,
    openSubProductsPicker,
    removeSubOption,
    selectProductPhoto,
    removeProductPhoto,
    applyRoute,
    save,
    removeOptionAction,
    translateWithAi,
  };
}

export type OptionGroupsStore = ReturnType<typeof createOptionGroupsStore>;
