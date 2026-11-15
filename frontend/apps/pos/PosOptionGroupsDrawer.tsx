import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  computeAffectedProductIds,
  findGroupById,
  findProductById,
  formatI18nSummary,
  formatRuleSummary,
  isInsufficientLink,
  normalizeSearchText,
  resolveEffectiveOptions,
  resolveProductGroups,
  type MenuI18nMapDto,
  type OptionCatalogProductDto,
  type OptionCatalogSubOptionDto,
  type OptionDrawerState,
  type OptionGroupDraft,
  type ProductDraft,
} from '@shared/contracts/option-groups-model';
import { translatePos, type PosTranslationKey } from '@shared/i18n/pos-dictionary';
import type { OptionGroupsStore, OptionGroupsStoreSnapshot } from '@pos/option-groups-store';

export interface PosOptionGroupsDrawerProps {
  store: OptionGroupsStore;
  snapshot: OptionGroupsStoreSnapshot;
  multilingualEnabled: boolean;
  aiTargetLocales: string[];
  imageUrlResolver?: (rawUrl: string | null) => string | null;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([hidden]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('hidden') && !el.closest('[hidden]')
  );
}

function getRoutePageKey(drawer: OptionDrawerState | null): string {
  if (!drawer) return 'closed';
  const r = drawer.route;
  if (r.page === 'option') return `option:${r.option.id}`;
  if (r.page === 'subset') return `subset:${r.id}`;
  if (r.page === 'product') return `product:${(drawer.draft as ProductDraft).id}`;
  if (r.page === 'product-options') return `product-options:${(drawer.draft as ProductDraft).id}`;
  if (r.page === 'group') {
    const g = drawer.draft as OptionGroupDraft;
    return `group:${g.id || g.scope}`;
  }
  return r.page;
}

function getTitleKey(drawer: OptionDrawerState | null): PosTranslationKey {
  if (!drawer) return 'ugGroup';
  const r = drawer.route;
  switch (r.page) {
    case 'new-group-scope':
      return 'ugNewGroupTitle';
    case 'product':
      return (drawer.draft as ProductDraft).isNew ? 'ugNewProduct' : 'ugProduct';
    case 'product-options':
      return 'ugProductOptions';
    case 'group':
      return (drawer.draft as OptionGroupDraft).isNew ? 'ugNewGroup' : 'ugGroup';
    case 'groups':
      return 'ugAddGroup';
    case 'subset':
      return 'ugOptions';
    case 'add-option':
      return 'ugAdd';
    case 'products':
    case 'sub-products':
      return 'ugFromProducts';
    case 'linked':
      return 'ugLink';
    case 'option':
      return r.isNew ? 'ugNewOption' : 'ugEditOption';
    default:
      return 'ugGroup';
  }
}

function isProductUnavailable(p?: OptionCatalogProductDto | null): boolean {
  if (!p) return true;
  if (p.is_out_of_stock) return true;
  if (p.out_of_stock_until) {
    const parsed = Date.parse(p.out_of_stock_until);
    if (Number.isFinite(parsed) && parsed > Date.now()) return true;
  }
  return false;
}

export function PosOptionGroupsDrawer({
  store,
  snapshot,
  multilingualEnabled,
  aiTargetLocales,
  imageUrlResolver,
}: PosOptionGroupsDrawerProps) {
  const { locale, catalog, drawer } = snapshot;
  const tr = (key: PosTranslationKey, params?: Record<string, string | number>) =>
    translatePos(locale, key, params);

  const drawerRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLElement | null>(null);
  const confirmCardRef = useRef<HTMLDivElement | null>(null);
  const subMenuRef = useRef<HTMLDivElement | null>(null);
  const addSubBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastPageKeyRef = useRef<string>('closed');
  const prevConfirmRef = useRef<OptionDrawerState['confirm']>(null);
  const confirmFocusRef = useRef<HTMLElement | null>(null);

  const [openHelp, setOpenHelp] = useState<string | null>(null);
  const [subMenuOpen, setSubMenuOpen] = useState(false);
  const [subMenuMaxHeight, setSubMenuMaxHeight] = useState<number>(220);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [photoFailed, setPhotoFailed] = useState(false);

  const isOpen = Boolean(drawer);
  const route = drawer?.route ?? null;
  const routeKey = getRoutePageKey(drawer);

  const prodDraft = drawer?.kind === 'product' ? (drawer.draft as ProductDraft) : null;
  const rawPreviewSrc =
    prodDraft?.imageDraft ||
    (prodDraft && prodDraft.imageKey !== ''
      ? imageUrlResolver?.(`r2:${prodDraft.imageKey || prodDraft.name}`) ?? null
      : null);

  useEffect(() => {
    setPhotoFailed(false);
  }, [rawPreviewSrc, routeKey]);

  useEffect(() => {
    if (routeKey !== lastPageKeyRef.current) {
      lastPageKeyRef.current = routeKey;
      setOpenHelp(null);
      setSubMenuOpen(false);
      if (bodyRef.current) {
        bodyRef.current.scrollTop = drawer?.scroll ?? 0;
      }
    }
  }, [routeKey, drawer?.scroll]);

  useLayoutEffect(() => {
    const curConfirm = drawer?.confirm ?? null;
    const isBusy = Boolean(drawer?.busy);
    const shouldInert = isBusy || Boolean(curConfirm);
    if (headerRef.current) headerRef.current.inert = Boolean(curConfirm);
    if (bodyRef.current) bodyRef.current.inert = shouldInert;
    if (footerRef.current) footerRef.current.inert = Boolean(curConfirm);

    if (curConfirm && curConfirm !== prevConfirmRef.current) {
      confirmFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const cancelBtn = confirmCardRef.current?.querySelector<HTMLElement>(
        '[data-action="continue"]'
      );
      cancelBtn?.focus?.();
    } else if (!curConfirm && prevConfirmRef.current && isOpen) {
      const prevEl = confirmFocusRef.current;
      confirmFocusRef.current = null;
      if (prevEl && prevEl.isConnected) {
        prevEl.focus?.();
      } else {
        drawerRef.current?.focus?.();
      }
    } else if (isOpen && !curConfirm) {
      const target = drawerRef.current;
      if (target && !target.contains(document.activeElement)) {
        const defaultTarget =
          (route?.page === 'new-group-scope' &&
            drawerRef.current?.querySelector<HTMLElement>('[data-action="select-new-scope"]')) ||
          (route?.page === 'group' &&
            drawer?.draft.isNew &&
            drawerRef.current?.querySelector<HTMLElement>('#ug-name')) ||
          drawerRef.current?.querySelector<HTMLElement>('#ug-title') ||
          target;
        defaultTarget?.focus?.({ preventScroll: true });
      }
    }
    prevConfirmRef.current = curConfirm;
  }, [drawer?.confirm, drawer?.busy, isOpen, route?.page, drawer?.draft.isNew]);

  useLayoutEffect(() => {
    if (!subMenuOpen) return;
    const btn = addSubBtnRef.current;
    const body = bodyRef.current;
    if (btn && body && typeof btn.getBoundingClientRect === 'function') {
      const triggerRect = btn.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      const avail = Math.max(80, body.clientHeight - triggerRect.height - 18);
      setSubMenuMaxHeight(avail);
      const menuEl = subMenuRef.current;
      if (menuEl && typeof menuEl.getBoundingClientRect === 'function') {
        const menuRect = menuEl.getBoundingClientRect();
        if (bodyRect.height > 0 && menuRect.height > 0) {
          const overflow = menuRect.bottom - bodyRect.bottom + 8;
          if (overflow > 0) body.scrollTop += overflow;
        }
      }
    }
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        subMenuRef.current &&
        target &&
        !subMenuRef.current.contains(target) &&
        !addSubBtnRef.current?.contains(target)
      ) {
        setSubMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [subMenuOpen]);

  const flushLocalState = (fn: () => void) => {
    try {
      flushSync(fn);
    } catch {
      fn();
    }
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!drawer) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (subMenuOpen) {
        flushLocalState(() => setSubMenuOpen(false));
        addSubBtnRef.current?.focus?.({ preventScroll: true });
        return;
      }
      if (drawer.confirm) {
        store.dismissConfirm();
        return;
      }
      if (openHelp) {
        const expandedBtn = drawerRef.current?.querySelector<HTMLElement>(
          `[data-action="help"][data-help="${openHelp}"]`
        );
        flushLocalState(() => setOpenHelp(null));
        expandedBtn?.focus?.({ preventScroll: true });
        return;
      }
      store.requestClose();
      return;
    }

    if (e.key === 'Tab') {
      const container = drawer.confirm ? confirmCardRef.current : drawerRef.current;
      const focusables = getFocusableElements(container);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !container?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const renderField = (
    key: string,
    labelKey: PosTranslationKey,
    value: string | number,
    opts?: {
      id?: string;
      type?: 'text' | 'number';
      min?: string | number;
      step?: string;
      subKey?: string;
      spanText?: string;
    }
  ) => (
    <label className="ug-field">
      <span>{opts?.spanText ?? tr(labelKey)}</span>
      <input
        id={opts?.id}
        data-field={key}
        data-sub-key={opts?.subKey}
        type={opts?.type ?? 'text'}
        min={opts?.min}
        step={opts?.step}
        value={value}
        onInput={(e) => store.setField(key, e.currentTarget.value, opts?.subKey)}
        onChange={(e) => store.setField(key, e.currentTarget.value, opts?.subKey)}
      />
    </label>
  );

  const renderToggle = (
    key: string,
    labelKey: PosTranslationKey,
    value: boolean,
    help?: { dataKey: string; textKey: PosTranslationKey } | null,
    disabled = false
  ) => {
    const id = `ug-${key.replace(/\./g, '-')}`;
    const expanded = Boolean(help && openHelp === help.dataKey);
    return (
      <div className={`ug-rule ${help ? 'ug-rule-help' : ''}`}>
        <div className="ug-rule-label">
          <label htmlFor={id}>{tr(labelKey)}</label>
          {help ? (
            <button
              type="button"
              className="ug-help-button"
              data-action="help"
              data-help={help.dataKey}
              aria-label={`${tr('ugExplain')}: ${tr(labelKey)}`}
              aria-expanded={expanded}
              aria-controls={`${id}-help`}
              onClick={() =>
                setOpenHelp((prev) => (prev === help.dataKey ? null : help.dataKey))
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
            </button>
          ) : null}
        </div>
        <label className="ug-switch">
          <input
            id={id}
            type="checkbox"
            role="switch"
            data-field={key}
            aria-describedby={help ? `${id}-help` : undefined}
            checked={Boolean(value)}
            disabled={disabled}
            onInput={(e) => store.setField(key, e.currentTarget.checked)}
            onChange={(e) => store.setField(key, e.currentTarget.checked)}
          />
          <span className="ug-switch-track" aria-hidden="true" />
        </label>
        {help ? (
          <p id={`${id}-help`} className="ug-help-text" hidden={!expanded}>
            {tr(help.textKey)}
          </p>
        ) : null}
      </div>
    );
  };

  const renderStepper = (
    key: 'minSelection' | 'maxSelection' | 'option.quantity',
    labelKey: PosTranslationKey,
    value: number | string,
    min: number,
    disabled = false,
    errorText = ''
  ) => {
    const id = `ug-${key.replace(/\./g, '-')}`;
    const errId = `${id}-error`;
    const handleStep = (delta: number) => {
      if (key === 'option.quantity') {
        const nextQty = Math.max(1, Number(value || 1) + delta);
        store.setField('option.quantity', String(nextQty));
      } else {
        store.stepRule(key, delta);
      }
    };
    return (
      <div className="ug-rule-field">
        <div className="ug-rule">
          <label htmlFor={id}>{tr(labelKey)}</label>
          <div className="ug-stepper">
            <button
              type="button"
              data-action="step"
              data-key={key}
              data-delta="-1"
              aria-label={`${tr(labelKey)} −`}
              disabled={disabled}
              onClick={() => handleStep(-1)}
            >
              −
            </button>
            <input
              id={id}
              aria-label={tr(labelKey)}
              aria-describedby={errId}
              aria-invalid={errorText ? 'true' : undefined}
              data-field={key}
              type="number"
              min={min}
              max={999}
              step={1}
              value={value}
              disabled={disabled}
              onInput={(e) => store.setField(key, e.currentTarget.value)}
              onChange={(e) => store.setField(key, e.currentTarget.value)}
              onBlur={() => {
                if (key === 'minSelection' || key === 'maxSelection') {
                  store.validateRules();
                }
              }}
            />
            <button
              type="button"
              data-action="step"
              data-key={key}
              data-delta="1"
              aria-label={`${tr(labelKey)} +`}
              disabled={disabled}
              onClick={() => handleStep(1)}
            >
              +
            </button>
          </div>
        </div>
        <p id={errId} className="ug-rule-error" hidden={!errorText}>
          {errorText}
        </p>
      </div>
    );
  };

  const renderRow = (
    action: string,
    title: string,
    sub: string,
    onClick: () => void,
    dataId?: string
  ) => (
    <button
      key={dataId || `${action}:${title}`}
      type="button"
      className="ug-row"
      data-action={action}
      data-id={dataId}
      onClick={onClick}
    >
      <span>
        <strong>{title}</strong>
        {sub ? <small>{sub}</small> : null}
      </span>
      <span aria-hidden="true">›</span>
    </button>
  );

  const renderCheck = (opts: {
    key: string;
    id: string;
    name: string;
    sub: string;
    checked: boolean;
    kind: 'group' | 'product' | 'subset';
    category?: string;
    disabled?: boolean;
    warning?: string;
    hidden?: boolean;
  }) => (
    <label
      key={opts.key}
      className={`ug-check ${opts.disabled ? 'ug-check-disabled' : ''}`}
      data-search={opts.name.toLowerCase()}
      data-category={opts.category ?? ''}
      hidden={opts.hidden}
    >
      <input
        type="checkbox"
        data-check={opts.kind}
        value={opts.id}
        checked={opts.checked}
        disabled={opts.disabled}
        onInput={(e) => store.toggleSelectionId(opts.kind, opts.id, e.currentTarget.checked)}
        onChange={(e) => store.toggleSelectionId(opts.kind, opts.id, e.currentTarget.checked)}
      />
      <span>
        <strong>
          {opts.name}
          {opts.warning ? (
            <>
              {' '}
              <span className="ug-cycle-badge">{opts.warning}</span>
            </>
          ) : null}
        </strong>
        <small>{opts.sub}</small>
      </span>
    </label>
  );

  const renderI18nSection = (opts: {
    prefix: 'i18n' | 'option.i18n';
    i18nMap: MenuI18nMapDto | undefined;
    includeBadge: boolean;
    aiAction: 'ai-translate-entity' | 'ai-translate-option';
    subOptions?: Array<string | OptionCatalogSubOptionDto>;
    hideNameInput?: boolean;
  }) => {
    if (!multilingualEnabled || aiTargetLocales.length === 0) return null;
    const normLocales = aiTargetLocales.map((l) => l.toLowerCase());
    const showEn = normLocales.includes('en');
    const showVi = normLocales.includes('vi');
    if (!showEn && !showVi) return null;

    const en = opts.i18nMap?.en || {};
    const vi = opts.i18nMap?.vi || {};
    const isBusy = Boolean(drawer?.aiBusy);

    const customSubNames = (opts.subOptions || [])
      .filter((s) => typeof s === 'string' || !s.productId)
      .map((s) => (typeof s === 'string' ? s : String(s.name || '').trim()))
      .filter(Boolean);

    return (
      <details
        data-section="i18n"
        className={`ug-i18n-details${isBusy ? ' is-ai-loading' : ''}`}
      >
        <summary>{formatI18nSummary(aiTargetLocales, locale)}</summary>
        <div className="ug-i18n-box">
          <button
            type="button"
            className={`ug-ai-btn${isBusy ? ' is-loading' : ''}`}
            data-action={opts.aiAction}
            aria-busy={isBusy ? 'true' : 'false'}
            disabled={isBusy}
            onClick={() => void store.translateWithAi()}
          >
            {isBusy ? <span className="ai-inline-spinner" aria-hidden="true" /> : null}
            <span>{tr(isBusy ? 'ugAiTranslating' : 'ugAiTranslate')}</span>
          </button>

          {showEn && !opts.hideNameInput
            ? renderField(`${opts.prefix}.en.name`, 'ugI18nEnName', en.name || '')
            : null}
          {showEn && opts.includeBadge
            ? renderField(`${opts.prefix}.en.badge_text`, 'ugI18nEnBadge', en.badge_text || '')
            : null}
          {showVi && !opts.hideNameInput
            ? renderField(`${opts.prefix}.vi.name`, 'ugI18nViName', vi.name || '')
            : null}
          {showVi && opts.includeBadge
            ? renderField(`${opts.prefix}.vi.badge_text`, 'ugI18nViBadge', vi.badge_text || '')
            : null}

          {customSubNames.map((subName) => (
            <div key={subName} className="ug-i18n-subrow">
              <span className="ug-i18n-subkey">{subName}</span>
              {showEn
                ? renderField(
                    `${opts.prefix}.en.sub_options`,
                    'ugSubName',
                    en.sub_options?.[subName] || '',
                    { subKey: subName, spanText: 'EN' }
                  )
                : null}
              {showVi
                ? renderField(
                    `${opts.prefix}.vi.sub_options`,
                    'ugSubName',
                    vi.sub_options?.[subName] || '',
                    { subKey: subName, spanText: 'VI' }
                  )
                : null}
            </div>
          ))}
        </div>
      </details>
    );
  };

  const renderCategoryChecklist = (opts: {
    selectedIds: string[];
    search: string;
    filter?: string;
    disabledIds?: Set<string>;
  }) => {
    const normSearch = normalizeSearchText(opts.search);
    const filterCatId = opts.filter || '';
    const categories = (catalog?.categories ?? []).filter(
      (c) => (c.category_type || 'catalog') === 'catalog'
    );
    const products = catalog?.products ?? [];
    const selectedSet = new Set(opts.selectedIds);
    const selectableCatIds = new Set(categories.map((c) => c.id));
    const uncategorized = products.filter((p) => !selectableCatIds.has(p.category_id));

    const categoryBuckets: Array<{ id: string; name: string; items: OptionCatalogProductDto[] }> =
      categories
        .filter((c) => !filterCatId || c.id === filterCatId)
        .map((c) => ({
          id: c.id,
          name: c.name,
          items: products.filter((p) => p.category_id === c.id),
        }))
        .filter((bucket) => bucket.items.length > 0);

    if (!filterCatId && uncategorized.length > 0) {
      categoryBuckets.push({
        id: 'uncategorized',
        name: tr('ugOther'),
        items: uncategorized,
      });
    }

    return (
      <div className="ug-category-accordion-list">
        {categoryBuckets.map((bucket) => {
          const matchesProd = (p: OptionCatalogProductDto) =>
            !normSearch || normalizeSearchText(p.name).includes(normSearch);
          const visibleCount = bucket.items.filter(matchesProd).length;
          const cardHidden = Boolean(normSearch) && visibleCount === 0;
          const checkedCount = bucket.items.filter(
            (p) => selectedSet.has(p.id) || Boolean(opts.disabledIds?.has(p.id))
          ).length;
          const selectableCount = bucket.items.filter(
            (p) => !opts.disabledIds?.has(p.id)
          ).length;
          const allChecked = checkedCount === bucket.items.length && bucket.items.length > 0;
          const isIndeterminate = checkedCount > 0 && checkedCount < bucket.items.length;
          const isOpenCat = normSearch
            ? visibleCount > 0
            : filterCatId
              ? true
              : Boolean(openCategories[bucket.id]);

          return (
            <div
              key={bucket.id}
              className={`ug-category-card ${isOpenCat ? 'ug-category-open' : ''}`}
              data-category={bucket.id}
              hidden={cardHidden}
            >
              <div className="ug-category-header">
                <button
                  type="button"
                  className="ug-category-toggle"
                  data-action="toggle-category"
                  data-category={bucket.id}
                  aria-expanded={isOpenCat ? 'true' : 'false'}
                  aria-label={`${tr('ugToggleCategory')}: ${bucket.name}`}
                  onClick={() =>
                    setOpenCategories((prev) => ({ ...prev, [bucket.id]: !isOpenCat }))
                  }
                >
                  <svg
                    className="ug-category-chevron"
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span className="ug-category-name">{bucket.name}</span>
                  <span className="ug-category-count ug-muted">({bucket.items.length})</span>
                </button>
                <label
                  className="ug-category-check"
                  title={`${tr('ugSelectAllCategory')}: ${bucket.name}`}
                  aria-label={`${tr('ugSelectAllCategory')}: ${bucket.name}`}
                >
                  <input
                    type="checkbox"
                    data-check="category"
                    data-category={bucket.id}
                    ref={(el) => {
                      if (el) el.indeterminate = isIndeterminate;
                    }}
                    checked={allChecked}
                    disabled={selectableCount === 0}
                    onInput={(e) =>
                      store.toggleSelectionId('category', bucket.id, e.currentTarget.checked)
                    }
                    onChange={(e) =>
                      store.toggleSelectionId('category', bucket.id, e.currentTarget.checked)
                    }
                  />
                </label>
              </div>
              <div className="ug-category-items ug-list" hidden={!isOpenCat}>
                {bucket.items.map((prod) => {
                  const isDisabled = Boolean(opts.disabledIds?.has(prod.id));
                  const isChecked = isDisabled || selectedSet.has(prod.id);
                  return renderCheck({
                    key: prod.id,
                    id: prod.id,
                    name: prod.name,
                    sub: `${tr('ugRetail')} $${prod.price}`,
                    checked: isChecked,
                    kind: 'product',
                    category: prod.category_id,
                    disabled: isDisabled,
                    hidden: Boolean(normSearch) && !matchesProd(prod),
                  });
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderProductGroupSection = (draft: ProductDraft) => {
    const entries = resolveProductGroups(draft, catalog);
    return (
      <section>
        <div className="ug-section-title">
          <h3>{tr('ugGroups')}</h3>
          <button
            type="button"
            data-action="groups"
            onClick={() => store.openProductGroupsPicker()}
          >
            {tr('ugAddGroup')}
          </button>
        </div>
        <div className="ug-list">
          {entries.length === 0 ? (
            <p className="ug-muted">{tr('ugNoGroups')}</p>
          ) : (
            entries.map(({ group, link }) => {
              const opts = resolveEffectiveOptions(group, catalog);
              const subsetText = link.optionIds
                ? `${opts.filter((o) => link.optionIds?.includes(o.id)).length}/${opts.length}`
                : `${opts.length}`;
              const sub = `${formatRuleSummary(group, catalog, locale)} · ${subsetText} ${tr('ugOptions').toLowerCase()}${isInsufficientLink(group, link, catalog) ? ` · ${tr('ugInsufficient')}` : ''}`;
              return renderRow(
                'subset',
                group.name,
                sub,
                () => store.openGroupSubsetPicker(group.id),
                group.id
              );
            })
          )}
        </div>
      </section>
    );
  };

  const renderBody = () => {
    if (!drawer || !route) return null;

    if (route.page === 'new-group-scope') {
      return (
        <div className="ug-scope-step">
          <p className="ug-scope-step-intro">{tr('ugSelectScopeIntro')}</p>
          <div className="ug-scope-step-cards">
            <button
              type="button"
              className="ug-scope-step-card"
              data-action="select-new-scope"
              data-scope="item"
              onClick={() => store.selectNewScope('item')}
            >
              <div className="ug-scope-step-icon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
                  <path d="M7 2v20" />
                  <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
                </svg>
              </div>
              <div className="ug-scope-step-info">
                <strong className="ug-scope-step-title">{tr('ugScopeItem')}</strong>
                <small className="ug-scope-step-desc">{tr('ugScopeItemDesc')}</small>
              </div>
              <svg
                className="ug-scope-step-chevron"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>

            <button
              type="button"
              className="ug-scope-step-card"
              data-action="select-new-scope"
              data-scope="order"
              onClick={() => store.selectNewScope('order')}
            >
              <div className="ug-scope-step-icon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                  <path d="M3 6h18" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
              </div>
              <div className="ug-scope-step-info">
                <strong className="ug-scope-step-title">{tr('ugScopeOrder')}</strong>
                <small className="ug-scope-step-desc">{tr('ugScopeOrderDesc')}</small>
              </div>
              <svg
                className="ug-scope-step-chevron"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      );
    }

    if (route.page === 'product') {
      const draft = drawer.draft as ProductDraft;
      const catalogCategories = (catalog?.categories || []).filter(
        (c) => c.category_type === 'catalog' || !c.category_type
      );
      const showImg = Boolean(rawPreviewSrc) && !photoFailed;

      return (
        <>
          <section className="ug-photo">
            <div className="ug-photo-frame">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8" cy="8" r="1.5" />
                <path d="m3 17 6-6 4 4 3-3 5 5" />
              </svg>
              <img
                hidden={!showImg}
                src={rawPreviewSrc || undefined}
                alt=""
                onError={() => setPhotoFailed(true)}
              />
            </div>
            <div>
              <label className="ug-upload">
                {tr('ugPhoto')}
                <input
                  type="file"
                  accept="image/*"
                  data-field="photo"
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0] ?? null;
                    void store.selectProductPhoto(f);
                  }}
                />
              </label>
              <button
                type="button"
                data-action="remove-photo"
                onClick={() => store.removeProductPhoto()}
              >
                {tr('ugRemovePhoto')}
              </button>
            </div>
          </section>

          {renderField('name', 'ugName', draft.name)}

          <label className="ug-field">
            <span>{tr('ugCategory')}</span>
            <select
              data-field="categoryId"
              value={draft.categoryId}
              onChange={(e) => store.setField('categoryId', e.currentTarget.value)}
            >
              {catalogCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {renderField('price', 'ugPrice', draft.price, {
            type: 'number',
            min: 0,
            step: '0.01',
          })}
          {renderField('badgeText', 'ugBadge', draft.badgeText)}

          {renderI18nSection({
            prefix: 'i18n',
            i18nMap: draft.i18n,
            includeBadge: true,
            aiAction: 'ai-translate-entity',
          })}

          {renderProductGroupSection(draft)}

          {!draft.isNew ? (
            <button
              type="button"
              className="ug-danger"
              data-action="delete"
              onClick={() => store.requestDelete()}
            >
              {tr('ugDelete')}
            </button>
          ) : null}
        </>
      );
    }

    if (route.page === 'product-options') {
      return renderProductGroupSection(drawer.draft as ProductDraft);
    }

    if (route.page === 'group') {
      const draft = drawer.draft as OptionGroupDraft;
      const effectiveOpts = resolveEffectiveOptions({ ...draft, sources: [] }, catalog);
      const affectedIds = computeAffectedProductIds(draft, catalog);
      const isOrder = draft.scope === 'order';
      const [minVal, maxVal] = draft.included
        ? [
            effectiveOpts.reduce((sum, o) => sum + Number(o.quantity || 1), 0),
            effectiveOpts.reduce((sum, o) => sum + Number(o.quantity || 1), 0),
          ]
        : [draft.minSelection, draft.maxSelection];

      return (
        <>
          <section>
            <h3>{tr('ugDetails')}</h3>
            {renderField('name', 'ugName', draft.name, { id: 'ug-name' })}
            {renderI18nSection({
              prefix: 'i18n',
              i18nMap: draft.i18n,
              includeBadge: false,
              aiAction: 'ai-translate-entity',
            })}
          </section>

          <section>
            <h3>{tr('ugRules')}</h3>
            <div className="ug-list">
              {renderToggle(
                'required',
                'ugRequired',
                draft.included ? Number(minVal) > 0 : drawer.required,
                draft.scope === 'order' || draft.included
                  ? null
                  : { dataKey: 'required', textKey: 'ugRequiredHelp' },
                Boolean(draft.included)
              )}
              {draft.included || drawer.required
                ? renderStepper(
                    'minSelection',
                    'ugMin',
                    minVal,
                    1,
                    Boolean(draft.included),
                    drawer.ruleErrors.minSelection || ''
                  )
                : null}
              {renderStepper(
                'maxSelection',
                'ugMax',
                maxVal,
                1,
                Boolean(draft.included),
                drawer.ruleErrors.maxSelection || ''
              )}
            </div>
            <div className="ug-list">
              {renderToggle(
                'allowRepeats',
                'ugRepeat',
                Boolean(draft.allowRepeats),
                null,
                Boolean(draft.included)
              )}
              {renderToggle('included', 'ugIncluded', Boolean(draft.included))}
            </div>
          </section>

          <section>
            <div className="ug-section-title">
              <h3>
                {tr('ugOptions')} ({effectiveOpts.length})
              </h3>
              <button
                type="button"
                data-action="add-option"
                onClick={() => store.openAddOptionRoute()}
              >
                {tr('ugAdd')}
              </button>
            </div>
            <div className="ug-list">
              {effectiveOpts.length === 0 ? (
                <p className="ug-muted">{tr('ugEmpty')}</p>
              ) : (
                effectiveOpts.map((o) =>
                  renderRow(
                    'option',
                    o.name,
                    `${o.productId ? `${tr('ugRetail')} $${o.retailPrice ?? 0} · ` : ''}+$${o.price}`,
                    () => store.openOptionDetails(o.id),
                    o.id
                  )
                )
              )}
            </div>
          </section>

          {isOrder ? (
            <section className="ug-order-scope-notice">
              <p className="ug-muted">{tr('ugAppliesToOrder')}</p>
            </section>
          ) : (
            <section>
              <div className="ug-section-title">
                <h3>
                  {tr('ugLinked')} ({affectedIds.length})
                </h3>
                <button
                  type="button"
                  data-action="linked"
                  onClick={() => store.openLinkedProductsPicker()}
                >
                  {tr('ugLink')}
                </button>
              </div>
              <div className="ug-linked">
                {affectedIds.length === 0 ? (
                  <span className="ug-muted">{tr('ugEmpty')}</span>
                ) : (
                  affectedIds.map((pid) => (
                    <div key={pid}>{findProductById(catalog, pid)?.name || ''}</div>
                  ))
                )}
              </div>
            </section>
          )}

          {!draft.isNew ? (
            <button
              type="button"
              className="ug-danger"
              data-action="delete"
              onClick={() => store.requestDelete()}
            >
              {tr('ugDelete')}
            </button>
          ) : null}
        </>
      );
    }

    if (route.page === 'groups') {
      const search = route.view?.search || '';
      const norm = normalizeSearchText(search);
      const selected = new Set(route.ids);
      const prodId = (drawer.draft as ProductDraft).id;
      const list = (catalog?.groups || []).filter((g) => g.scope !== 'order');

      return (
        <>
          <input
            className="ug-search"
            type="search"
            data-field="search"
            placeholder={tr('ugSearch')}
            aria-label={tr('ugSearch')}
            value={search}
            onInput={(e) => store.setField('search', e.currentTarget.value)}
            onChange={(e) => store.setField('search', e.currentTarget.value)}
          />
          <div className="ug-list">
            {list.map((g) => {
              const hidden = Boolean(norm) && !normalizeSearchText(g.name).includes(norm);
              const isCycle = g.options.some((o) => o.productId === prodId);
              const sub = isCycle
                ? tr('ugCycleGroupBlocked')
                : `${formatRuleSummary(g, catalog, locale)} · ${g.options.map((o) => o.name).join('、')}`;
              return renderCheck({
                key: g.id,
                id: g.id,
                name: g.name,
                sub,
                checked: selected.has(g.id),
                kind: 'group',
                disabled: isCycle,
                warning: isCycle ? tr('ugCycle') : '',
                hidden,
              });
            })}
          </div>
        </>
      );
    }

    if (route.page === 'subset') {
      const group = findGroupById(catalog, route.id);
      if (!group) return null;
      const opts = resolveEffectiveOptions(group, catalog);
      const selected = new Set(route.optionIds === null ? opts.map((o) => o.id) : route.optionIds);

      return (
        <>
          <p className="ug-muted">
            {formatRuleSummary(group, catalog, locale)} ·{' '}
            {tr(route.optionIds === null ? 'ugDefaults' : 'ugOwn')}
          </p>
          <button
            type="button"
            data-action="defaults"
            onClick={() => store.resetSubsetDefaults()}
          >
            {tr('ugDefaults')}
          </button>
          <div className="ug-list">
            {opts.map((o) =>
              renderCheck({
                key: o.id,
                id: o.id,
                name: o.name,
                sub: `+$${o.price}${o.isOutOfStock ? ` · ${tr('ugSoldOut')}` : ''}`,
                checked: selected.has(o.id),
                kind: 'subset',
              })
            )}
          </div>
          <button
            type="button"
            className="ug-danger"
            data-action="remove-group"
            onClick={() => {
              store.removeProductGroup(group.id);
              store.requestBack();
            }}
          >
            {tr('ugRemoveGroup')}
          </button>
        </>
      );
    }

    if (route.page === 'add-option') {
      const isOrder = (drawer.draft as OptionGroupDraft).scope === 'order';
      return (
        <>
          {!isOrder
            ? renderRow('products', tr('ugFromProducts'), tr('ugFromProductsHelp'), () =>
                store.openLinkProductsForAddOption()
              )
            : null}
          {renderRow('custom', tr('ugCustom'), tr('ugCustomHelp'), () =>
            store.openAddCustomOption()
          )}
        </>
      );
    }

    if (route.page === 'products' || route.page === 'linked' || route.page === 'sub-products') {
      const search = route.view?.search || '';
      const filter = route.view?.filter || '';
      const selectableCategories = (catalog?.categories || []).filter(
        (c) => (c.category_type || 'catalog') === 'catalog'
      );
      const parentOptionRoute =
        route.page === 'sub-products' ? drawer.stack[drawer.stack.length - 1]?.route : undefined;
      const existingSubProductIds =
        parentOptionRoute?.page === 'option'
          ? new Set(
              (parentOptionRoute.option.subOptions || [])
                .map((s) => (typeof s === 'string' ? null : s.productId || null))
                .filter((pid): pid is string => Boolean(pid))
            )
          : undefined;

      return (
        <>
          <input
            className="ug-search"
            type="search"
            data-field="search"
            placeholder={tr('ugSearch')}
            aria-label={tr('ugSearch')}
            value={search}
            onInput={(e) => store.setField('search', e.currentTarget.value)}
            onChange={(e) => store.setField('search', e.currentTarget.value)}
          />
          <select
            className="ug-filter"
            data-field="filter"
            hidden
            value={filter}
            onChange={(e) => store.setField('filter', e.currentTarget.value)}
          >
            <option value="">{tr('ugAll')}</option>
            {selectableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {renderCategoryChecklist({
            selectedIds: route.ids,
            search,
            filter,
            disabledIds: existingSubProductIds,
          })}
        </>
      );
    }

    if (route.page === 'option') {
      const groupDraft = drawer.draft as OptionGroupDraft;
      const opt = route.option;
      const isLinked = Boolean(opt.productId);
      const linkedProd = opt.productId ? findProductById(catalog, opt.productId) : null;
      const subOptions = opt.subOptions || [];
      const minSubRule = (opt.eligibilityRules || []).find(
        (r) => r.rule_type === 'min_order_subtotal'
      );

      const renderSubMenuSvg = (paths: string) => (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {paths.split('|').map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
      );

      return (
        <>
          <p className="ug-option-context">{groupDraft.name}</p>

          <section className="ug-option-details">
            {linkedProd ? (
              <div className="ug-product-summary">
                <strong>{linkedProd.name}</strong>
                <small>
                  {tr('ugRetail')} ${linkedProd.price}
                  {isProductUnavailable(linkedProd) ? ` · ${tr('ugSoldOut')}` : ''}
                </small>
              </div>
            ) : (
              renderField('option.name', 'ugName', opt.name)
            )}

            {renderField('option.price', 'ugSurcharge', opt.price, {
              type: 'number',
              min: 0,
              step: '0.01',
            })}

            {groupDraft.included
              ? renderStepper('option.quantity', 'ugQuantity', opt.quantity ?? 1, 1)
              : null}

            <div className="ug-list ug-option-toggles">
              {renderToggle('option.isDefault', 'ugDefault', Boolean(opt.isDefault), {
                dataKey: 'defaultOption',
                textKey: 'ugDefaultHelp',
              })}
              {renderToggle(
                'option.isLocallyOutOfStock',
                'ugLocalStock',
                Boolean(opt.isLocallyOutOfStock),
                { dataKey: 'localStock', textKey: 'ugLocalStockHelp' }
              )}
            </div>

            {!linkedProd
              ? renderI18nSection({
                  prefix: 'option.i18n',
                  i18nMap: opt.i18n,
                  includeBadge: false,
                  aiAction: 'ai-translate-option',
                  subOptions,
                  hideNameInput: isLinked,
                })
              : null}
          </section>

          <section className="ug-option-children">
            <div className="ug-section-title">
              <h3>
                {tr('ugSub')} ({subOptions.length})
              </h3>
              <div className="ug-sub-add">
                <button
                  ref={addSubBtnRef}
                  type="button"
                  id="ug-add-sub"
                  data-action="add-sub"
                  aria-haspopup="menu"
                  aria-expanded={subMenuOpen}
                  aria-controls="ug-sub-menu"
                  onClick={() => setSubMenuOpen((prev) => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      flushLocalState(() => setSubMenuOpen(true));
                      const items = Array.from(
                        subMenuRef.current?.querySelectorAll<HTMLElement>('button') || []
                      );
                      const target = e.key === 'ArrowUp' ? items[items.length - 1] : items[0];
                      target?.focus?.({ preventScroll: true });
                    }
                  }}
                >
                  {tr('ugAddSub')}
                </button>
                <div
                  ref={subMenuRef}
                  id="ug-sub-menu"
                  className="ug-sub-menu"
                  role="menu"
                  aria-labelledby="ug-add-sub"
                  hidden={!subMenuOpen}
                  style={{ maxHeight: `${subMenuMaxHeight}px` }}
                  onKeyDown={(e) => {
                    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button'));
                    const idx = items.indexOf(document.activeElement as HTMLElement);
                    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                      e.preventDefault();
                      const nextIdx =
                        e.key === 'Home'
                          ? 0
                          : e.key === 'End'
                            ? items.length - 1
                            : (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) %
                              Math.max(1, items.length);
                      items[nextIdx]?.focus();
                      return;
                    }
                    if (e.key === 'Tab') {
                      flushLocalState(() => setSubMenuOpen(false));
                      addSubBtnRef.current?.focus({ preventScroll: true });
                    }
                  }}
                >
                  {groupDraft.scope !== 'order' ? (
                    <button
                      type="button"
                      className="ug-sub-menu-action"
                      role="menuitem"
                      data-action="sub-products"
                      onClick={() => {
                        setSubMenuOpen(false);
                        store.openSubProductsPicker();
                      }}
                    >
                      <span className="ug-sub-menu-icon">
                        {renderSubMenuSvg(
                          'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z|M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'
                        )}
                      </span>
                      <span className="ug-sub-menu-copy">
                        <strong>{tr('ugFromProducts')}</strong>
                        <small>{tr('ugFromProductsHelp')}</small>
                      </span>
                      {renderSubMenuSvg('m9 5 7 7-7 7')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ug-sub-menu-action"
                    role="menuitem"
                    data-action="sub-custom"
                    onClick={() => {
                      setSubMenuOpen(false);
                      store.addCustomSubOption();
                    }}
                  >
                    <span className="ug-sub-menu-icon">
                      {renderSubMenuSvg('M12 5v14M5 12h14')}
                    </span>
                    <span className="ug-sub-menu-copy">
                      <strong>{tr('ugCustom')}</strong>
                      <small>{tr('ugCustomHelp')}</small>
                    </span>
                    {renderSubMenuSvg('m9 5 7 7-7 7')}
                  </button>
                </div>
              </div>
            </div>

            {subOptions.length === 0 ? (
              <p className="ug-muted">{tr('ugSubEmpty')}</p>
            ) : (
              subOptions.map((sub, idx) => {
                const subObj: OptionCatalogSubOptionDto =
                  typeof sub === 'string' ? { name: sub, price: 0 } : sub;
                const linkedSub = Boolean(subObj.productId);
                const subProd = linkedSub ? findProductById(catalog, subObj.productId) : null;
                const subName = linkedSub
                  ? subProd?.name || subObj.name || tr('ugMissingProduct')
                  : subObj.name || '';
                const unavailable = linkedSub && isProductUnavailable(subProd);
                const metadata = subProd
                  ? `#${subProd.sku || subProd.id} · ${tr('ugOriginalPrice')} $${Number(subProd.price || 0)}`
                  : tr('ugMissingProduct');

                return (
                  <div
                    key={subObj.id || `sub-${idx}`}
                    className={`ug-sub-option ug-sub-option-compact ${linkedSub ? 'ug-sub-option-linked' : ''}`}
                  >
                    <div className="ug-sub-name">
                      <div className="ug-sub-origin">
                        <span className="ug-sub-origin-copy">
                          {linkedSub ? (
                            <>
                              {renderSubMenuSvg(
                                'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2'
                              )}
                              {tr('ugFromProducts')}
                            </>
                          ) : (
                            tr('ugSubName')
                          )}
                        </span>
                        <span
                          className="ug-sub-kind"
                          title={linkedSub ? tr('ugLinkedHelp') : undefined}
                        >
                          {tr(linkedSub ? 'ugLinkedStatus' : 'ugCustomStatus')}
                        </span>
                      </div>
                      {linkedSub ? (
                        <small className="ug-sub-source-meta" title={metadata}>
                          {metadata}
                          {unavailable ? ` · ${tr('ugSoldOut')}` : ''}
                        </small>
                      ) : null}
                      <label className="ug-field">
                        <input
                          data-field={`sub.${idx}.name`}
                          type="text"
                          value={subName}
                          aria-label={tr('ugSubName')}
                          readOnly={linkedSub}
                          onInput={(e) => store.setField(`sub.${idx}.name`, e.currentTarget.value)}
                          onChange={(e) => store.setField(`sub.${idx}.name`, e.currentTarget.value)}
                        />
                      </label>
                    </div>

                    <label className="ug-field ug-sub-price">
                      <span>{tr('ugGroupSurcharge')}</span>
                      <div className="ug-sub-price-input">
                        <span aria-hidden="true">$</span>
                        <input
                          data-field={`sub.${idx}.price`}
                          type="number"
                          value={subObj.price ?? 0}
                          min={0}
                          step="0.01"
                          onInput={(e) => store.setField(`sub.${idx}.price`, e.currentTarget.value)}
                          onChange={(e) =>
                            store.setField(`sub.${idx}.price`, e.currentTarget.value)
                          }
                        />
                      </div>
                    </label>

                    <button
                      type="button"
                      data-action="remove-sub"
                      data-index={idx}
                      aria-label={`${tr('ugRemove')} ${subName || tr('ugSub')}`}
                      onClick={() => store.removeSubOption(idx)}
                    >
                      {tr('ugRemove')}
                    </button>
                  </div>
                );
              })
            )}
          </section>

          <details data-section="conditions">
            <summary>{tr('ugConditions')}</summary>
            {renderField(
              'eligibility.min_order_subtotal',
              'ugMinimumSubtotal',
              minSubRule?.min_order_subtotal || 0,
              { type: 'number', min: 0, step: '0.01' }
            )}
            {renderField(
              'eligibility.error_message',
              'ugRuleMessage',
              minSubRule?.error_message || ''
            )}
          </details>

          {!route.isNew ? (
            <button
              type="button"
              className="ug-option-remove"
              data-action="remove-option"
              disabled={drawer.busy}
              onClick={() => void store.removeOptionAction()}
            >
              {tr('ugRemoveOption')}
            </button>
          ) : null}
        </>
      );
    }

    return null;
  };

  const renderFooter = () => {
    const isScopeStep = !drawer || !route || route.page === 'new-group-scope';
    const isAddChooser = route?.page === 'add-option';
    const hideFooter = isScopeStep || isAddChooser;

    if (hideFooter) {
      return <footer ref={footerRef} className="ug-footer" hidden />;
    }

    const isMainEntityPage =
      route.page === 'group' || route.page === 'product' || route.page === 'product-options';
    const isDirectOptionSave = route.page === 'option' && drawer.stack.length === 0 && Boolean(route.direct);
    const btnAction: 'save' | 'apply' =
      isMainEntityPage || drawer.stack.length === 0 ? 'save' : 'apply';

    const btnLabelKey: PosTranslationKey = drawer.busy
      ? 'ugSaving'
      : isMainEntityPage
        ? drawer.optionsOnly
          ? 'ugSaveProductOptions'
          : drawer.kind === 'product'
            ? 'ugSaveProduct'
            : 'ugSaveGroup'
        : drawer.stack.length > 0
          ? 'ugApply'
          : isDirectOptionSave
            ? 'ugSaveOption'
            : 'ugSaveGroup';

    const affectedCount =
      drawer.kind === 'group' && isMainEntityPage
        ? computeAffectedProductIds(drawer.draft as OptionGroupDraft, catalog).length
        : null;

    return (
      <footer ref={footerRef} className="ug-footer">
        <p className="ug-error" role="alert">
          {drawer.error}
        </p>
        {affectedCount !== null ? (
          <p className="ug-muted">{tr('ugAffected', { count: affectedCount })}</p>
        ) : null}
        <button
          type="button"
          className="ug-primary"
          data-action={btnAction}
          disabled={drawer.busy}
          onClick={() => {
            if (btnAction === 'save') {
              void store.save();
            } else {
              store.applyRoute();
            }
          }}
        >
          {tr(btnLabelKey)}
        </button>
      </footer>
    );
  };

  const renderConfirm = () => {
    const confirm = drawer?.confirm;
    const isDelete = confirm === 'delete';
    const titleKey: PosTranslationKey = isDelete ? 'ugDeleteTitle' : 'ugDiscardTitle';
    const bodyKey: PosTranslationKey = isDelete ? 'ugDeleteConfirm' : 'ugUnsaved';
    const dangerAction = isDelete ? 'confirm-delete' : 'discard';
    const dangerLabelKey: PosTranslationKey = isDelete ? 'ugDelete' : 'ugDiscard';

    return (
      <div className="ug-confirmation" hidden={!confirm}>
        <div
          ref={confirmCardRef}
          className="ug-confirm-card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ug-confirm-title"
          aria-describedby="ug-confirm-message"
        >
          <h3 id="ug-confirm-title">{tr(titleKey)}</h3>
          <p id="ug-confirm-message">{tr(bodyKey)}</p>
          <div className="ug-confirm-actions">
            <button
              type="button"
              data-action="continue"
              onClick={() => store.dismissConfirm()}
            >
              {tr('ugCancel')}
            </button>
            <button
              type="button"
              className="ug-confirm-danger"
              data-action={dangerAction}
              onClick={() => {
                if (isDelete) {
                  void store.confirmDelete();
                } else {
                  store.confirmDiscard();
                }
              }}
            >
              {tr(dangerLabelKey)}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const bodyClass = [
    'ug-body',
    route?.page === 'option' ? 'ug-option-body' : '',
    route?.page === 'product-options' ? 'ug-product-options-body' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const titleText = drawer
    ? route?.page === 'product-options'
      ? (drawer.draft as ProductDraft).name
      : route?.page === 'subset'
        ? findGroupById(catalog, route.id)?.name || tr('ugOptions')
        : tr(getTitleKey(drawer))
    : '';

  return (
    <div
      id="unified-menu-drawer"
      className="ug-overlay"
      hidden={!isOpen}
      onClick={(e) => {
        if (subMenuOpen && !(e.target as Element | null)?.closest?.('.ug-sub-add')) {
          flushLocalState(() => setSubMenuOpen(false));
          if (e.target === e.currentTarget) return;
        }
        if (e.target === e.currentTarget) {
          store.requestClose();
        }
      }}
      onKeyDown={handleOverlayKeyDown}
    >
      <section
        ref={drawerRef}
        className="ug-drawer"
        role="dialog"
        aria-modal={drawer?.confirm ? 'false' : 'true'}
        aria-labelledby="ug-title"
        tabIndex={-1}
      >
        <header ref={headerRef}>
          {drawer && drawer.stack.length > 0 && route?.page !== 'option' ? (
            <button
              type="button"
              data-action="back"
              onClick={() => store.requestBack()}
            >
              {tr('ugBack')}
            </button>
          ) : null}
          <h2 id="ug-title" tabIndex={-1}>
            {route?.page === 'product-options' ? (
              <small className="ug-product-options-label">{tr('ugProductOptions')}</small>
            ) : null}
            {titleText}
          </h2>
          <button
            type="button"
            className="ug-close"
            data-action="close"
            onClick={() => store.requestClose()}
          >
            {tr('ugClose')}
          </button>
        </header>

        <div
          ref={bodyRef}
          className={bodyClass}
          inert={drawer?.busy ? (true as unknown as boolean) : undefined}
          onScroll={(e) => store.setScroll(e.currentTarget.scrollTop)}
        >
          {renderBody()}
        </div>

        {renderFooter()}
        {renderConfirm()}
      </section>
    </div>
  );
}
