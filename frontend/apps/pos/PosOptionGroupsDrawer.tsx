import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  computeAffectedProductIds,
  findGroupById,
  findProductById,
  formatI18nSummary,
  isInsufficientLink,
  normalizeSearchText,
  resolveEffectiveOptions,
  resolveProductGroups,
  type OptionCatalogProductDto,
  type OptionDrawerState,
  type OptionGroupDraft,
  type ProductDraft,
} from '@shared/contracts/option-groups-model';
import { translatePos, type PosTranslationKey } from '@shared/i18n/pos-dictionary';
import {
  BookOpenIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  HelpCircleIcon,
  ImagePlaceholderIcon,
  LinkIcon,
  PlusIcon,
} from '@shared/ui/PosIcons';
import type { OptionGroupsStore, OptionGroupsStoreSnapshot } from '@pos/option-groups-store';

export interface PosOptionGroupsDrawerProps {
  store: OptionGroupsStore;
  snapshot: OptionGroupsStoreSnapshot;
  multilingualEnabled: boolean;
  aiTargetLocales: string[];
  imageUrlResolver?: (rawUrl: string | null) => string | null;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([hidden]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  if (r.page === 'group') return `group:${(drawer.draft as OptionGroupDraft).id || (drawer.draft as OptionGroupDraft).scope}`;
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
      return 'ugGroups';
    case 'subset':
      return 'ugOptions';
    case 'add-option':
      return 'ugNewOption';
    case 'products':
      return 'ugFromProducts';
    case 'linked':
      return 'ugLinked';
    case 'sub-products':
      return 'ugLink';
    case 'option':
      return r.isNew ? 'ugNewOption' : 'ugEditOption';
    default:
      return 'ugGroup';
  }
}

function renderI18nLocaleLabel(loc: string, tr: (k: PosTranslationKey) => string): string {
  const norm = String(loc || '').toLowerCase();
  if (norm === 'vi') return tr('ugLocaleVi');
  if (norm === 'en') return tr('ugLocaleEn');
  return loc.toUpperCase();
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
  const [i18nOpen, setI18nOpen] = useState(false);

  const isOpen = Boolean(drawer);
  const route = drawer?.route ?? null;
  const routeKey = getRoutePageKey(drawer);

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
        target.focus?.();
      }
    }
    prevConfirmRef.current = curConfirm;
  }, [drawer?.confirm, drawer?.busy, isOpen]);

  useLayoutEffect(() => {
    if (!subMenuOpen) return;
    const btn = addSubBtnRef.current;
    if (btn && typeof btn.getBoundingClientRect === 'function') {
      const rect = btn.getBoundingClientRect();
      const avail = Math.max(120, (window.innerHeight || 800) - rect.bottom - 16);
      setSubMenuMaxHeight(avail);
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
        addSubBtnRef.current?.focus?.();
        return;
      }
      if (drawer.confirm) {
        store.dismissConfirm();
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

  const toggleHelp = (key: string) => {
    setOpenHelp((prev) => (prev === key ? null : key));
  };

  const renderHelpBlock = (helpKey: string, textKey: PosTranslationKey) => {
    const expanded = openHelp === helpKey;
    return (
      <>
        <button
          type="button"
          className="ug-help-btn"
          data-action="help"
          data-help={helpKey}
          aria-expanded={expanded}
          aria-label={tr('ugExplain')}
          onClick={() => toggleHelp(helpKey)}
        >
          <HelpCircleIcon size={15} />
        </button>
        <div className="ug-help-text" hidden={!expanded}>
          {tr(textKey)}
        </div>
      </>
    );
  };

  const renderCategoryChecklist = (opts: {
    selectedIds: string[];
    search: string;
    filter?: string;
    excludeIds?: Set<string>;
    disabledIds?: Set<string>;
  }) => {
    const normSearch = normalizeSearchText(opts.search);
    const filterCatId = opts.filter || '';
    const categories = catalog?.categories ?? [];
    const products = catalog?.products ?? [];
    const selectedSet = new Set(opts.selectedIds);

    const visibleCategories = categories.filter((c) => !filterCatId || c.id === filterCatId);

    const groupedCards = visibleCategories
      .map((cat) => {
        const catItems = products.filter(
          (p) => p.category_id === cat.id && !opts.excludeIds?.has(p.id)
        );
        if (catItems.length === 0) return null;
        const matchesProd = (p: OptionCatalogProductDto) =>
          !normSearch || normalizeSearchText(p.name).includes(normSearch);
        const visibleCount = catItems.filter(matchesProd).length;
        const cardHidden = Boolean(normSearch) && visibleCount === 0;
        const checkedCount = catItems.filter(
          (p) => selectedSet.has(p.id) || Boolean(opts.disabledIds?.has(p.id))
        ).length;
        const allChecked = checkedCount === catItems.length && catItems.length > 0;
        const isIndeterminate = checkedCount > 0 && checkedCount < catItems.length;
        const isOpenCat = normSearch
          ? visibleCount > 0
          : filterCatId
            ? true
            : Boolean(openCategories[cat.id]);

        return (
          <div
            key={cat.id}
            className={`ug-category-card${isOpenCat ? ' ug-category-open' : ''}`}
            data-category={cat.id}
            hidden={cardHidden}
          >
            <div className="ug-category-header">
              <button
                type="button"
                className="ug-category-toggle"
                data-action="toggle-category"
                data-category={cat.id}
                aria-expanded={isOpenCat ? 'true' : 'false'}
                aria-label={`${tr('ugToggleCategory')}: ${cat.name}`}
                onClick={() =>
                  setOpenCategories((prev) => ({ ...prev, [cat.id]: !isOpenCat }))
                }
              >
                <span className="ug-category-chevron" aria-hidden="true">
                  <ChevronDownIcon size={18} />
                </span>
                <span className="ug-category-name">{cat.name}</span>
                <span className="ug-category-count ug-muted">({catItems.length})</span>
              </button>
              <label
                className="ug-category-check"
                title={`${tr('ugSelectAllCategory')}: ${cat.name}`}
                aria-label={`${tr('ugSelectAllCategory')}: ${cat.name}`}
              >
                <input
                  type="checkbox"
                  data-check="category"
                  data-category={cat.id}
                  ref={(el) => {
                    if (el) el.indeterminate = isIndeterminate;
                  }}
                  checked={allChecked}
                  onInput={(e) =>
                    store.toggleSelectionId('category', cat.id, e.currentTarget.checked)
                  }
                  onChange={(e) =>
                    store.toggleSelectionId('category', cat.id, e.currentTarget.checked)
                  }
                />
              </label>
            </div>
            <div className="ug-category-items" hidden={!isOpenCat}>
              {catItems.map((prod: OptionCatalogProductDto) => {
                const isDisabled = Boolean(opts.disabledIds?.has(prod.id));
                const isChecked = isDisabled || selectedSet.has(prod.id);
                const rowSearch = String(prod.name || '').toLowerCase();
                return (
                  <label
                    key={prod.id}
                    className="ug-checkbox-row ug-product-check-row ug-check"
                    data-search={rowSearch}
                    hidden={Boolean(normSearch) && !matchesProd(prod)}
                  >
                    <input
                      type="checkbox"
                      data-check="product"
                      value={prod.id}
                      checked={isChecked}
                      disabled={isDisabled}
                      onInput={(e) =>
                        store.toggleSelectionId('product', prod.id, e.currentTarget.checked)
                      }
                      onChange={(e) =>
                        store.toggleSelectionId('product', prod.id, e.currentTarget.checked)
                      }
                    />
                    <span className="ug-check-label">{prod.name}</span>
                    <span className="ug-muted">NT${Number(prod.price ?? 0)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })
      .filter(Boolean);

    if (groupedCards.length === 0) {
      return <div className="ug-empty">{tr('ugEmpty')}</div>;
    }
    return <div className="ug-checklist">{groupedCards}</div>;
  };

  const renderBody = () => {
    if (!drawer || !route) return null;

    if (route.page === 'new-group-scope') {
      return (
        <div className="ug-section ug-scope-picker ug-scope-step">
          <p className="ug-muted">{tr('ugSelectScopeIntro')}</p>
          <button
            type="button"
            className="ug-row ug-scope-card ug-scope-step-card"
            data-action="select-new-scope"
            data-scope="item"
            onClick={() => store.selectNewScope('item')}
          >
            <div className="ug-scope-icon">
              <BookOpenIcon size={20} />
            </div>
            <div className="ug-row-main">
              <div className="ug-row-title">{tr('ugScopeItem')}</div>
              <div className="ug-row-sub">{tr('ugScopeItemDesc')}</div>
            </div>
            <ChevronRightIcon size={18} />
          </button>

          <button
            type="button"
            className="ug-row ug-scope-card ug-scope-step-card"
            data-action="select-new-scope"
            data-scope="order"
            onClick={() => store.selectNewScope('order')}
          >
            <div className="ug-scope-icon">
              <LinkIcon size={20} />
            </div>
            <div className="ug-row-main">
              <div className="ug-row-title">{tr('ugScopeOrder')}</div>
              <div className="ug-row-sub">{tr('ugScopeOrderDesc')}</div>
            </div>
            <ChevronRightIcon size={18} />
          </button>
        </div>
      );
    }

    if (route.page === 'product') {
      const draft = drawer.draft as ProductDraft;
      const previewSrc =
        draft.imageDraft ||
        (draft.imageKey ? imageUrlResolver?.(`r2:${draft.imageKey}`) ?? null : null);

      return (
        <div className="ug-form">
          <div className="ug-field">
            <label className="ug-label" htmlFor="ug-prod-name">
              {tr('ugName')}
            </label>
            <input
              id="ug-prod-name"
              type="text"
              className="ug-input"
              data-field="name"
              value={draft.name}
              onInput={(e) => store.setField('name', e.currentTarget.value)}
              onChange={(e) => store.setField('name', e.currentTarget.value)}
            />
          </div>

          <div className="ug-field">
            <label className="ug-label" htmlFor="ug-prod-category">
              {tr('ugCategory')}
            </label>
            <select
              id="ug-prod-category"
              className="ug-select"
              data-field="categoryId"
              value={draft.categoryId}
              onChange={(e) => store.setField('categoryId', e.currentTarget.value)}
            >
              {(catalog?.categories || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="ug-field-row">
            <div className="ug-field">
              <label className="ug-label" htmlFor="ug-prod-price">
                {tr('ugPrice')}
              </label>
              <input
                id="ug-prod-price"
                type="number"
                min={0}
                className="ug-input"
                data-field="price"
                value={draft.price}
                onInput={(e) => store.setField('price', e.currentTarget.value)}
                onChange={(e) => store.setField('price', e.currentTarget.value)}
              />
            </div>

            <div className="ug-field">
              <label className="ug-label" htmlFor="ug-prod-badge">
                {tr('ugBadge')}
              </label>
              <input
                id="ug-prod-badge"
                type="text"
                className="ug-input"
                data-field="badgeText"
                value={draft.badgeText}
                onInput={(e) => store.setField('badgeText', e.currentTarget.value)}
                onChange={(e) => store.setField('badgeText', e.currentTarget.value)}
              />
            </div>
          </div>

          <div className="ug-field">
            <span className="ug-label">{tr('ugPhoto')}</span>
            <div className="ug-photo-box">
              <div className="ug-photo-preview">
                {previewSrc ? (
                  <img src={previewSrc} alt={draft.name} />
                ) : (
                  <ImagePlaceholderIcon size={24} />
                )}
              </div>
              <div className="ug-photo-actions">
                <label className="ug-btn-secondary ug-upload-label">
                  <span>{tr('ugPhoto')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    data-field="photo"
                    hidden
                    onChange={(e) => {
                      const f = e.currentTarget.files?.[0] ?? null;
                      void store.selectProductPhoto(f);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="ug-btn-danger-ghost"
                  data-action="remove-photo"
                  hidden={!draft.imageKey && !draft.imageDraft}
                  onClick={() => store.removeProductPhoto()}
                >
                  {tr('ugRemovePhoto')}
                </button>
              </div>
            </div>
          </div>

          {multilingualEnabled ? (
            <details
              className="ug-i18n-details"
              open={i18nOpen}
              onToggle={(e) => setI18nOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="ug-i18n-summary">
                <span>{formatI18nSummary(aiTargetLocales, locale)}</span>
              </summary>
              <div className="ug-i18n-panel">
                <button
                  type="button"
                  className="ug-btn-secondary ug-ai-btn"
                  data-action="ai-translate-entity"
                  disabled={Boolean(drawer.aiBusy)}
                  onClick={() => void store.translateWithAi()}
                >
                  {drawer.aiBusy ? tr('ugAiTranslating') : tr('ugAiTranslate')}
                </button>
                {aiTargetLocales.map((loc) => {
                  const patch = draft.i18n?.[loc] || {};
                  return (
                    <div key={loc} className="ug-i18n-locale-block">
                      <div className="ug-i18n-locale-title">{renderI18nLocaleLabel(loc, tr)}</div>
                      <input
                        type="text"
                        className="ug-input"
                        data-field={`i18n.${loc}.name`}
                        placeholder={loc === 'vi' ? tr('ugI18nViName') : tr('ugI18nEnName')}
                        value={patch.name || ''}
                        onInput={(e) =>
                          store.setField(`i18n.${loc}.name`, e.currentTarget.value)
                        }
                        onChange={(e) =>
                          store.setField(`i18n.${loc}.name`, e.currentTarget.value)
                        }
                      />
                      <input
                        type="text"
                        className="ug-input"
                        data-field={`i18n.${loc}.badge_text`}
                        placeholder={loc === 'vi' ? tr('ugI18nViBadge') : tr('ugI18nEnBadge')}
                        value={patch.badge_text || ''}
                        onInput={(e) =>
                          store.setField(`i18n.${loc}.badge_text`, e.currentTarget.value)
                        }
                        onChange={(e) =>
                          store.setField(`i18n.${loc}.badge_text`, e.currentTarget.value)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}

          {renderProductGroupsSection(draft)}
        </div>
      );
    }

  function renderProductGroupsSection(draft: ProductDraft) {
    const entries = resolveProductGroups(draft, catalog);
    return (
      <div className="ug-section">
        <div className="ug-section-head">
          <div className="ug-product-options-label">{tr('ugProductOptions')}</div>
          <button
            type="button"
            className="ug-btn-secondary"
            data-action="groups"
            onClick={() => store.openProductGroupsPicker()}
          >
            <PlusIcon size={16} />
            <span>{tr('ugAddGroup')}</span>
          </button>
        </div>

        {entries.length === 0 ? (
          <div className="ug-empty">{tr('ugNoGroups')}</div>
        ) : (
          <div className="ug-group-cards">
            {entries.map((entry) => {
              const { group, link } = entry;
              const insufficient = isInsufficientLink(group, link, catalog);
              const defaultsCount = group.options.filter((o) => o.isDefault).length;
              const subsetLabel =
                link.optionIds === null
                  ? `${tr('ugAll')} (${group.options.length})`
                  : `${link.optionIds.length}/${group.options.length}`;
              return (
                <div
                  key={group.id}
                  className={`ug-linked-group-card${insufficient ? ' is-warning' : ''}`}
                >
                  <div className="ug-linked-group-head">
                    <strong>{group.name}</strong>
                    <button
                      type="button"
                      className="ug-btn-danger-ghost"
                      data-action="remove-group"
                      data-id={group.id}
                      onClick={() => store.removeProductGroup(group.id)}
                    >
                      {tr('ugRemoveGroup')}
                    </button>
                  </div>
                  <div className="ug-linked-group-actions">
                    <button
                      type="button"
                      className="ug-row"
                      data-action="subset"
                      data-id={group.id}
                      onClick={() => store.openGroupSubsetPicker(group.id)}
                    >
                      <span>
                        {group.name} · {subsetLabel}
                      </span>
                      <ChevronRightIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className="ug-row"
                      data-action="defaults"
                      data-id={group.id}
                      onClick={() => void store.openGroup(group.id)}
                    >
                      <span>
                        {tr('ugDefaults')} ({defaultsCount})
                      </span>
                      <ChevronRightIcon size={16} />
                    </button>
                  </div>
                  {insufficient ? (
                    <div className="ug-field-error">{tr('ugInsufficient')}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

    if (route.page === 'product-options') {
      return renderProductGroupsSection(drawer.draft as ProductDraft);
    }

    if (route.page === 'group') {
      const draft = drawer.draft as OptionGroupDraft;
      const effectiveOpts = resolveEffectiveOptions({ ...draft, sources: [] }, catalog);
      const affectedIds = computeAffectedProductIds(draft, catalog);

      return (
        <div className="ug-form">
          <div className="ug-field">
            <label className="ug-label" htmlFor="ug-group-name">
              {tr('ugName')}
            </label>
            <input
              id="ug-group-name"
              type="text"
              className="ug-input"
              data-field="name"
              value={draft.name}
              onInput={(e) => store.setField('name', e.currentTarget.value)}
              onChange={(e) => store.setField('name', e.currentTarget.value)}
            />
          </div>

          {draft.scope === 'order' ? (
            <section className="ug-order-scope-notice">
              <p className="ug-muted">{tr('ugAppliesToOrder')}</p>
            </section>
          ) : (
            <div className="ug-section">
              <button
                type="button"
                className="ug-row"
                data-action="linked"
                onClick={() => store.openLinkedProductsPicker()}
              >
                <div className="ug-row-main">
                  <div className="ug-row-title">{tr('ugLinked')}</div>
                  <div className="ug-row-sub">
                    {tr('ugAffected', { count: affectedIds.length })}
                  </div>
                </div>
                <ChevronRightIcon size={16} />
              </button>
              <div className="ug-linked">
                {affectedIds.length === 0 ? (
                  <span className="ug-muted">{tr('ugEmpty')}</span>
                ) : (
                  affectedIds.map((pid) => (
                    <div key={pid}>{findProductById(catalog, pid)?.name || ''}</div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="ug-section">
            <div className="ug-section-head">
              <span className="ug-label">{tr('ugOptions')}</span>
              <button
                type="button"
                className="ug-btn-secondary"
                data-action="add-option"
                onClick={() => store.openAddOptionRoute()}
              >
                <PlusIcon size={16} />
                <span>{tr('ugAdd')}</span>
              </button>
            </div>

            {effectiveOpts.length === 0 ? (
              <div className="ug-empty">{tr('ugEmpty')}</div>
            ) : (
              <div className="ug-option-list">
                {effectiveOpts.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className="ug-row"
                    data-action="option"
                    data-id={opt.id}
                    onClick={() => store.openOptionDetails(opt.id)}
                  >
                    <div className="ug-row-main">
                      <div className="ug-row-title">
                        <span>{opt.name}</span>
                        {opt.isDefault ? (
                          <span className="ug-badge ug-badge-default">{tr('ugDefault')}</span>
                        ) : null}
                        {opt.isOutOfStock ? (
                          <span className="ug-badge ug-badge-oos">{tr('ugSoldOut')}</span>
                        ) : null}
                      </div>
                      <div className="ug-row-sub">
                        {opt.price >= 0 ? `+NT$${opt.price}` : `-NT$${Math.abs(opt.price)}`}
                      </div>
                    </div>
                    <ChevronRightIcon size={16} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ug-section ug-rules-section">
            <div className="ug-label">{tr('ugRules')}</div>

            <div className="ug-rule-row">
              <label className="ug-checkbox-row" htmlFor="ug-required">
                <input
                  id="ug-required"
                  type="checkbox"
                  data-field="required"
                  disabled={Boolean(draft.included)}
                  checked={drawer.required}
                  onInput={(e) => store.setField('required', e.currentTarget.checked)}
                  onChange={(e) => store.setField('required', e.currentTarget.checked)}
                />
                <span>{tr('ugRequired')}</span>
              </label>
              {renderHelpBlock('required', 'ugRequiredHelp')}
            </div>

            {drawer.required || draft.included ? (
              <>
                <div className="ug-rule-row">
                  <div className="ug-rule-label">
                    <span>{tr('ugMin')}</span>
                  </div>
                  <div className="ug-stepper">
                    <button
                      type="button"
                      className="ug-step-btn"
                      data-action="step"
                      data-key="minSelection"
                      data-delta="-1"
                      disabled={Boolean(draft.included)}
                      onClick={() => store.stepRule('minSelection', -1)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={drawer.required ? 1 : 0}
                      max={999}
                      disabled={Boolean(draft.included)}
                      aria-invalid={drawer.ruleErrors.minSelection ? 'true' : undefined}
                      className={`ug-step-input${drawer.ruleErrors.minSelection ? ' is-invalid' : ''}`}
                      data-field="minSelection"
                      value={draft.minSelection}
                      onInput={(e) => store.setField('minSelection', e.currentTarget.value)}
                      onChange={(e) => store.setField('minSelection', e.currentTarget.value)}
                      onBlur={() => store.validateRules()}
                    />
                    <button
                      type="button"
                      className="ug-step-btn"
                      data-action="step"
                      data-key="minSelection"
                      data-delta="1"
                      disabled={Boolean(draft.included)}
                      onClick={() => store.stepRule('minSelection', 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div
                  id="ug-minSelection-error"
                  className="ug-field-error"
                  hidden={!drawer.ruleErrors.minSelection}
                >
                  {drawer.ruleErrors.minSelection || ''}
                </div>
              </>
            ) : null}

            <div className="ug-rule-row">
              <div className="ug-rule-label">
                <span>{tr('ugMax')}</span>
              </div>
              <div className="ug-stepper">
                <button
                  type="button"
                  className="ug-step-btn"
                  data-action="step"
                  data-key="maxSelection"
                  data-delta="-1"
                  disabled={Boolean(draft.included)}
                  onClick={() => store.stepRule('maxSelection', -1)}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={999}
                  disabled={Boolean(draft.included)}
                  aria-invalid={drawer.ruleErrors.maxSelection ? 'true' : undefined}
                  className={`ug-step-input${drawer.ruleErrors.maxSelection ? ' is-invalid' : ''}`}
                  data-field="maxSelection"
                  value={draft.maxSelection}
                  onInput={(e) => store.setField('maxSelection', e.currentTarget.value)}
                  onChange={(e) => store.setField('maxSelection', e.currentTarget.value)}
                  onBlur={() => store.validateRules()}
                />
                <button
                  type="button"
                  className="ug-step-btn"
                  data-action="step"
                  data-key="maxSelection"
                  data-delta="1"
                  disabled={Boolean(draft.included)}
                  onClick={() => store.stepRule('maxSelection', 1)}
                >
                  +
                </button>
              </div>
            </div>
            <div
              id="ug-maxSelection-error"
              className="ug-field-error"
              hidden={!drawer.ruleErrors.maxSelection}
            >
              {drawer.ruleErrors.maxSelection || ''}
            </div>

            <div className="ug-rule-row">
              <label className="ug-checkbox-row">
                <input
                  type="checkbox"
                  data-field="allowRepeats"
                  disabled={Boolean(draft.included)}
                  checked={Boolean(draft.allowRepeats)}
                  onInput={(e) => store.setField('allowRepeats', e.currentTarget.checked)}
                  onChange={(e) => store.setField('allowRepeats', e.currentTarget.checked)}
                />
                <span>{tr('ugRepeat')}</span>
              </label>
            </div>

            <div className="ug-rule-row">
              <label className="ug-checkbox-row">
                <input
                  type="checkbox"
                  data-field="included"
                  checked={Boolean(draft.included)}
                  onInput={(e) => store.setField('included', e.currentTarget.checked)}
                  onChange={(e) => store.setField('included', e.currentTarget.checked)}
                />
                <span>{tr('ugIncluded')}</span>
              </label>
            </div>
          </div>

          {multilingualEnabled ? (
            <details
              className="ug-i18n-details"
              open={i18nOpen}
              onToggle={(e) => setI18nOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="ug-i18n-summary">
                <span>{formatI18nSummary(aiTargetLocales, locale)}</span>
              </summary>
              <div className="ug-i18n-panel">
                <button
                  type="button"
                  className="ug-btn-secondary ug-ai-btn"
                  data-action="ai-translate-entity"
                  disabled={Boolean(drawer.aiBusy)}
                  onClick={() => void store.translateWithAi()}
                >
                  {drawer.aiBusy ? tr('ugAiTranslating') : tr('ugAiTranslate')}
                </button>
                {aiTargetLocales.map((loc) => {
                  const patch = draft.i18n?.[loc] || {};
                  return (
                    <div key={loc} className="ug-i18n-locale-block">
                      <div className="ug-i18n-locale-title">{renderI18nLocaleLabel(loc, tr)}</div>
                      <input
                        type="text"
                        className="ug-input"
                        data-field={`i18n.${loc}.name`}
                        placeholder={loc === 'vi' ? tr('ugI18nViName') : tr('ugI18nEnName')}
                        value={patch.name || ''}
                        onInput={(e) =>
                          store.setField(`i18n.${loc}.name`, e.currentTarget.value)
                        }
                        onChange={(e) =>
                          store.setField(`i18n.${loc}.name`, e.currentTarget.value)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </div>
      );
    }

    if (route.page === 'groups') {
      const search = route.view?.search || '';
      const norm = normalizeSearchText(search);
      const selected = new Set(route.ids);
      const prodId = (drawer.draft as ProductDraft).id;
      const list = (catalog?.groups || []).filter(
        (g) => g.scope !== 'order' && (!norm || normalizeSearchText(g.name).includes(norm))
      );
      return (
        <div className="ug-section">
          <input
            type="search"
            className="ug-input"
            data-field="search"
            placeholder={tr('ugSearchGroups')}
            value={search}
            onInput={(e) => store.setField('search', e.currentTarget.value)}
            onChange={(e) => store.setField('search', e.currentTarget.value)}
          />
          <div className="ug-checklist">
            {list.map((g) => {
              const isCycle = g.options.some((o) => o.productId === prodId);
              return (
                <label
                  key={g.id}
                  className={`ug-checkbox-row${isCycle ? ' ug-check-disabled' : ''}`}
                >
                  <input
                    type="checkbox"
                    data-check="group"
                    value={g.id}
                    checked={selected.has(g.id)}
                    disabled={isCycle}
                    onInput={(e) =>
                      store.toggleSelectionId('group', g.id, e.currentTarget.checked)
                    }
                    onChange={(e) =>
                      store.toggleSelectionId('group', g.id, e.currentTarget.checked)
                    }
                  />
                  <span>{g.name}</span>
                  {isCycle ? <span className="ug-cycle-badge">{tr('ugCycle')}</span> : null}
                  <span className="ug-muted">
                    {isCycle
                      ? tr('ugCycleGroupBlocked')
                      : `${g.options.length} ${tr('ugOptions')}`}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    if (route.page === 'subset') {
      const group = findGroupById(catalog, route.id);
      const search = route.view?.search || '';
      const norm = normalizeSearchText(search);
      const allIds = (group?.options || []).map((o) => o.id);
      const selected = new Set(route.optionIds === null ? allIds : route.optionIds);
      const options = (group?.options || []).filter(
        (o) => !norm || normalizeSearchText(o.name).includes(norm)
      );
      return (
        <div className="ug-section">
          <input
            type="search"
            className="ug-input"
            data-field="search"
            placeholder={tr('ugSearch')}
            value={search}
            onInput={(e) => store.setField('search', e.currentTarget.value)}
            onChange={(e) => store.setField('search', e.currentTarget.value)}
          />
          <div className="ug-checklist">
            {options.map((o) => (
              <label key={o.id} className="ug-checkbox-row">
                <input
                  type="checkbox"
                  data-check="subset"
                  value={o.id}
                  checked={selected.has(o.id)}
                  onInput={(e) =>
                    store.toggleSelectionId('subset', o.id, e.currentTarget.checked)
                  }
                  onChange={(e) =>
                    store.toggleSelectionId('subset', o.id, e.currentTarget.checked)
                  }
                />
                <span>{o.name}</span>
                <span className="ug-muted">
                  {o.price >= 0 ? `+NT$${o.price}` : `-NT$${Math.abs(o.price)}`}
                </span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    if (route.page === 'add-option') {
      return (
        <div className="ug-section ug-scope-picker">
          <button
            type="button"
            className="ug-row"
            data-action="products"
            onClick={() => store.openLinkProductsForAddOption()}
          >
            <div className="ug-scope-icon">
              <LinkIcon size={20} />
            </div>
            <div className="ug-row-main">
              <div className="ug-row-title">{tr('ugFromProducts')}</div>
              <div className="ug-row-sub">{tr('ugFromProductsHelp')}</div>
            </div>
            <ChevronRightIcon size={18} />
          </button>

          <button
            type="button"
            className="ug-row"
            data-action="custom"
            onClick={() => store.openAddCustomOption()}
          >
            <div className="ug-scope-icon">
              <PlusIcon size={20} />
            </div>
            <div className="ug-row-main">
              <div className="ug-row-title">{tr('ugCustom')}</div>
              <div className="ug-row-sub">{tr('ugCustomHelp')}</div>
            </div>
            <ChevronRightIcon size={18} />
          </button>
        </div>
      );
    }

    if (route.page === 'linked') {
      const search = route.view?.search || '';
      return (
        <div className="ug-section">
          <input
            type="search"
            className="ug-input"
            data-field="search"
            placeholder={tr('ugSearch')}
            value={search}
            onInput={(e) => store.setField('search', e.currentTarget.value)}
            onChange={(e) => store.setField('search', e.currentTarget.value)}
          />
          {renderCategoryChecklist({
            selectedIds: route.ids,
            search,
          })}
        </div>
      );
    }

    if (route.page === 'products' || route.page === 'sub-products') {
      const search = route.view?.search || '';
      const filter = route.view?.filter || '';
      const existingProductIds =
        route.page === 'products'
          ? new Set(
              (drawer.draft as OptionGroupDraft).options
                .map((o) => o.productId)
                .filter((pid): pid is string => Boolean(pid))
            )
          : undefined;
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
        <div className="ug-section">
          <div className="ug-field-row">
            <input
              type="search"
              className="ug-input"
              data-field="search"
              placeholder={tr('ugSearch')}
              value={search}
              onInput={(e) => store.setField('search', e.currentTarget.value)}
              onChange={(e) => store.setField('search', e.currentTarget.value)}
            />
            <select
              className="ug-select"
              data-field="filter"
              value={filter}
              onChange={(e) => store.setField('filter', e.currentTarget.value)}
            >
              <option value="">{tr('ugAll')}</option>
              {(catalog?.categories || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {renderCategoryChecklist({
            selectedIds: route.ids,
            search,
            filter,
            excludeIds: existingProductIds,
            disabledIds: existingSubProductIds,
          })}
        </div>
      );
    }

    if (route.page === 'option') {
      const opt = route.option;
      const isLinked = Boolean(opt.productId);
      const linkedProd = opt.productId ? findProductById(catalog, opt.productId) : null;
      const subOptions = opt.subOptions || [];
      const minSubRule = (opt.eligibilityRules || []).find(
        (r) => r.rule_type === 'min_order_subtotal'
      );

      return (
        <div className="ug-form">
          {isLinked ? (
            <div className="ug-product-summary">
              <strong>{linkedProd?.name || opt.name}</strong>
              <small>
                {tr('ugRetail')} ${linkedProd?.price ?? opt.retailPrice ?? 0}
              </small>
            </div>
          ) : (
            <div className="ug-field">
              <label className="ug-label" htmlFor="ug-opt-name">
                {tr('ugName')}
              </label>
              <input
                id="ug-opt-name"
                type="text"
                className="ug-input"
                data-field="option.name"
                value={opt.name}
                onInput={(e) => store.setField('option.name', e.currentTarget.value)}
                onChange={(e) => store.setField('option.name', e.currentTarget.value)}
              />
            </div>
          )}

          <div className="ug-field-row">
            <div className="ug-field">
              <label className="ug-label" htmlFor="ug-opt-price">
                {tr('ugSurcharge')}
              </label>
              <input
                id="ug-opt-price"
                type="number"
                className="ug-input"
                data-field="option.price"
                value={opt.price}
                onInput={(e) => store.setField('option.price', e.currentTarget.value)}
                onChange={(e) => store.setField('option.price', e.currentTarget.value)}
              />
            </div>

            <div className="ug-field">
              <label className="ug-label" htmlFor="ug-opt-qty">
                {tr('ugQuantity')}
              </label>
              <input
                id="ug-opt-qty"
                type="number"
                min={1}
                className="ug-input"
                data-field="option.quantity"
                value={opt.quantity ?? 1}
                onInput={(e) => store.setField('option.quantity', e.currentTarget.value)}
                onChange={(e) => store.setField('option.quantity', e.currentTarget.value)}
              />
            </div>
          </div>

          <div className="ug-rule-row">
            <label className="ug-checkbox-row">
              <input
                type="checkbox"
                data-field="option.isDefault"
                checked={Boolean(opt.isDefault)}
                onInput={(e) => store.setField('option.isDefault', e.currentTarget.checked)}
                onChange={(e) => store.setField('option.isDefault', e.currentTarget.checked)}
              />
              <span>{tr('ugDefault')}</span>
            </label>
            {renderHelpBlock('defaultOption', 'ugDefaultHelp')}
          </div>

          <div className="ug-rule-row">
            <label className="ug-checkbox-row">
              <input
                type="checkbox"
                data-field="option.isLocallyOutOfStock"
                checked={Boolean(opt.isLocallyOutOfStock)}
                onInput={(e) =>
                  store.setField('option.isLocallyOutOfStock', e.currentTarget.checked)
                }
                onChange={(e) =>
                  store.setField('option.isLocallyOutOfStock', e.currentTarget.checked)
                }
              />
              <span>{tr('ugLocalStock')}</span>
            </label>
            {renderHelpBlock('localStock', 'ugLocalStockHelp')}
          </div>

          <section className="ug-section ug-option-children">
            <div className="ug-section-head">
              <h3>
                {tr('ugSub')} ({subOptions.length})
              </h3>
              <div className="ug-sub-anchor">
                <button
                  ref={addSubBtnRef}
                  type="button"
                  className="ug-btn-secondary"
                  data-action="add-sub"
                  aria-expanded={subMenuOpen}
                  onClick={() => setSubMenuOpen((prev) => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSubMenuOpen(true);
                    }
                  }}
                >
                  <PlusIcon size={16} />
                  <span>{tr('ugAddSub')}</span>
                  <ChevronDownIcon size={14} />
                </button>
                <div
                  ref={subMenuRef}
                  className="ug-sub-menu"
                  role="menu"
                  hidden={!subMenuOpen}
                  style={{ maxHeight: `${subMenuMaxHeight}px`, overflowY: 'auto' }}
                  onKeyDown={(e) => {
                    const items = Array.from(
                      e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
                    );
                    const idx = items.indexOf(document.activeElement as HTMLElement);
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      items[(idx + 1) % Math.max(1, items.length)]?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      items[(idx - 1 + items.length) % Math.max(1, items.length)]?.focus();
                    }
                  }}
                >
                  <button
                    type="button"
                    className="ug-sub-menu-item"
                    role="menuitem"
                    data-action="sub-products"
                    onClick={() => {
                      setSubMenuOpen(false);
                      store.openSubProductsPicker();
                    }}
                  >
                    <LinkIcon size={15} />
                    <span>{tr('ugFromProducts')}</span>
                  </button>
                  <button
                    type="button"
                    className="ug-sub-menu-item"
                    role="menuitem"
                    data-action="sub-custom"
                    onClick={() => {
                      setSubMenuOpen(false);
                      store.addCustomSubOption();
                    }}
                  >
                    <PlusIcon size={15} />
                    <span>{tr('ugCustom')}</span>
                  </button>
                </div>
              </div>
            </div>

            {subOptions.length === 0 ? (
              <div className="ug-empty">{tr('ugSubEmpty')}</div>
            ) : (
              <div className="ug-sub-list">
                {subOptions.map((sub, idx) => {
                  const subObj = typeof sub === 'string' ? { name: sub, price: 0 } : sub;
                  const subLinkedProd = subObj.productId
                    ? findProductById(catalog, subObj.productId)
                    : null;
                  const subOos = Boolean(
                    subLinkedProd?.is_out_of_stock ||
                      (subLinkedProd?.out_of_stock_until &&
                        Date.parse(subLinkedProd.out_of_stock_until) > Date.now())
                  );
                  return (
                    <div key={subObj.id || `sub-${idx}`} className="ug-sub-item">
                      <div className="ug-sub-row">
                        <input
                          type="text"
                          className="ug-input"
                          data-field={`sub.${idx}.name`}
                          placeholder={tr('ugSubName')}
                          value={subLinkedProd ? subLinkedProd.name : subObj.name}
                          readOnly={Boolean(subObj.productId)}
                          onInput={(e) => store.setField(`sub.${idx}.name`, e.currentTarget.value)}
                          onChange={(e) =>
                            store.setField(`sub.${idx}.name`, e.currentTarget.value)
                          }
                        />
                        <input
                          type="number"
                          className="ug-input ug-sub-price"
                          data-field={`sub.${idx}.price`}
                          value={subObj.price ?? 0}
                          onInput={(e) => store.setField(`sub.${idx}.price`, e.currentTarget.value)}
                          onChange={(e) =>
                            store.setField(`sub.${idx}.price`, e.currentTarget.value)
                          }
                        />
                        <button
                          type="button"
                          className="ug-btn-danger-ghost"
                          data-action="remove-sub"
                          data-index={idx}
                          aria-label={tr('ugRemove')}
                          onClick={() => store.removeSubOption(idx)}
                        >
                          <CloseIcon size={15} />
                        </button>
                      </div>
                      {subObj.productId ? (
                        <div className="ug-sub-source-meta ug-muted">
                          #{subLinkedProd?.id ?? subObj.productId} · ${subLinkedProd?.price ?? 0}
                          {subOos ? ` · ${tr('ugSoldOut')}` : ''}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <details data-section="conditions" className="ug-conditions-details">
            <summary>{tr('ugConditions')}</summary>
            <div className="ug-section">
              <div className="ug-field">
                <label className="ug-label" htmlFor="ug-elig-min">
                  {tr('ugMinimumSubtotal')}
                </label>
                <input
                  id="ug-elig-min"
                  type="number"
                  min={0}
                  className="ug-input"
                  data-field="eligibility.min_order_subtotal"
                  value={minSubRule?.min_order_subtotal || 0}
                  onInput={(e) =>
                    store.setField('eligibility.min_order_subtotal', e.currentTarget.value)
                  }
                  onChange={(e) =>
                    store.setField('eligibility.min_order_subtotal', e.currentTarget.value)
                  }
                />
              </div>
              <div className="ug-field">
                <label className="ug-label" htmlFor="ug-elig-msg">
                  {tr('ugRuleMessage')}
                </label>
                <input
                  id="ug-elig-msg"
                  type="text"
                  className="ug-input"
                  data-field="eligibility.error_message"
                  value={minSubRule?.error_message ?? ''}
                  onInput={(e) =>
                    store.setField('eligibility.error_message', e.currentTarget.value)
                  }
                  onChange={(e) =>
                    store.setField('eligibility.error_message', e.currentTarget.value)
                  }
                />
              </div>
            </div>
          </details>

          {multilingualEnabled ? (
            <details
              className="ug-i18n-details"
              open={i18nOpen}
              onToggle={(e) => setI18nOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="ug-i18n-summary">
                <span>{formatI18nSummary(aiTargetLocales, locale)}</span>
              </summary>
              <div className="ug-i18n-panel">
                <button
                  type="button"
                  className="ug-btn-secondary ug-ai-btn"
                  data-action="ai-translate-option"
                  disabled={Boolean(drawer.aiBusy)}
                  onClick={() => void store.translateWithAi()}
                >
                  {drawer.aiBusy ? tr('ugAiTranslating') : tr('ugAiTranslate')}
                </button>
                {aiTargetLocales.map((loc) => {
                  const patch = opt.i18n?.[loc] || {};
                  return (
                    <div key={loc} className="ug-i18n-locale-block">
                      <div className="ug-i18n-locale-title">{renderI18nLocaleLabel(loc, tr)}</div>
                      {!isLinked ? (
                        <input
                          type="text"
                          className="ug-input"
                          data-field={`option.i18n.${loc}.name`}
                          placeholder={loc === 'vi' ? tr('ugI18nViName') : tr('ugI18nEnName')}
                          value={patch.name || ''}
                          onInput={(e) =>
                            store.setField(`option.i18n.${loc}.name`, e.currentTarget.value)
                          }
                          onChange={(e) =>
                            store.setField(`option.i18n.${loc}.name`, e.currentTarget.value)
                          }
                        />
                      ) : null}
                      {subOptions.map((sub, idx) => {
                        const subObj = typeof sub === 'string' ? { name: sub } : sub;
                        if ('productId' in subObj && subObj.productId) return null;
                        const subKey = String(subObj.name || '').trim() || String(idx);
                        const subMap = patch.sub_options || {};
                        return (
                          <input
                            key={`${loc}-${idx}-${subKey}`}
                            type="text"
                            className="ug-input"
                            data-field={`option.i18n.${loc}.sub_options`}
                            data-sub-key={subKey}
                            placeholder={subObj.name || tr('ugSubName')}
                            value={subMap[subKey] || ''}
                            onInput={(e) =>
                              store.setField(
                                `option.i18n.${loc}.sub_options`,
                                e.currentTarget.value,
                                subKey
                              )
                            }
                            onChange={(e) =>
                              store.setField(
                                `option.i18n.${loc}.sub_options`,
                                e.currentTarget.value,
                                subKey
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </div>
      );
    }

    return null;
  };

  const renderFooter = () => {
    if (!drawer || !route || route.page === 'new-group-scope' || route.page === 'add-option') {
      return <footer ref={footerRef} className="ug-footer" hidden />;
    }

    const isDirectSave =
      route.page === 'product' ||
      route.page === 'product-options' ||
      route.page === 'group' ||
      (route.page === 'option' && Boolean(route.direct));
    const canDeleteEntity =
      !drawer.draft.isNew &&
      ((route.page === 'product' && Boolean((drawer.draft as ProductDraft).id)) ||
        (route.page === 'group' && Boolean((drawer.draft as OptionGroupDraft).id)));
    const canRemoveOption = route.page === 'option' && !route.isNew;

    const affectedCount =
      route.page === 'group'
        ? computeAffectedProductIds(drawer.draft as OptionGroupDraft, catalog).length
        : null;

    const primaryLabelKey: PosTranslationKey =
      route.page === 'product'
        ? 'ugSaveProduct'
        : route.page === 'product-options'
          ? 'ugSaveProductOptions'
          : route.page === 'group'
            ? 'ugSaveGroup'
            : route.page === 'option'
              ? 'ugSaveOption'
              : 'ugApply';

    return (
      <footer ref={footerRef} className="ug-footer">
        {drawer.error ? (
          <div className="ug-error" role="alert">
            {drawer.error}
          </div>
        ) : null}

        <div className="ug-footer-bar">
          <div className="ug-footer-left">
            {canDeleteEntity ? (
              <button
                type="button"
                className="ug-btn-danger-ghost"
                data-action="delete"
                disabled={drawer.busy}
                onClick={() => store.requestDelete()}
              >
                {tr('ugDelete')}
              </button>
            ) : null}
            {canRemoveOption ? (
              <button
                type="button"
                className="ug-btn-danger-ghost"
                data-action="remove-option"
                disabled={drawer.busy}
                onClick={() => void store.removeOptionAction()}
              >
                {tr('ugRemoveOption')}
              </button>
            ) : null}
            {affectedCount !== null ? (
              <span className="ug-muted">{tr('ugAffected', { count: affectedCount })}</span>
            ) : null}
          </div>

          <div className="ug-footer-right">
            {isDirectSave ? (
              <button
                type="button"
                className="ug-primary"
                data-action="save"
                disabled={drawer.busy}
                onClick={() => void store.save()}
              >
                {drawer.busy ? tr('ugSaving') : tr(primaryLabelKey)}
              </button>
            ) : (
              <button
                type="button"
                className="ug-primary"
                data-action="apply"
                disabled={drawer.busy}
                onClick={() => store.applyRoute()}
              >
                {tr(primaryLabelKey)}
              </button>
            )}
          </div>
        </div>
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
          <h3 id="ug-confirm-title" className="ug-confirm-title">
            {tr(titleKey)}
          </h3>
          <p id="ug-confirm-message" className="ug-confirm-message">
            {tr(bodyKey)}
          </p>
          <div className="ug-confirm-actions">
            <button
              type="button"
              className="ug-btn-secondary"
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

  return (
    <div
      id="unified-menu-drawer"
      className="ug-overlay"
      hidden={!isOpen}
      onClick={(e) => {
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
        <header ref={headerRef} className="ug-header">
          {drawer && drawer.stack.length > 0 && route?.page !== 'option' ? (
            <button
              type="button"
              className="ug-back"
              data-action="back"
              aria-label={tr('ugBack')}
              onClick={() => store.requestBack()}
            >
              {tr('ugBack')}
            </button>
          ) : null}
          <h2 id="ug-title" className="ug-title">
            {drawer
              ? route?.page === 'product-options'
                ? (drawer.draft as ProductDraft).name
                : tr(getTitleKey(drawer))
              : ''}
          </h2>
          <button
            type="button"
            className="ug-close"
            data-action="close"
            aria-label={tr('ugClose')}
            onClick={() => store.requestClose()}
          >
            <CloseIcon size={18} />
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
