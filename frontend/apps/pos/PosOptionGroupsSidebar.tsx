import {
  formatRuleSummary,
  normalizeSearchText,
  type OptionCatalogDto,
  type OptionCatalogGroupDto,
} from '@shared/contracts/option-groups-model';
import { translatePos, type PosLocale, type PosTranslationKey } from '@shared/i18n/pos-dictionary';
import { CloseIcon, PlusIcon, SearchIcon } from '@shared/ui/PosIcons';
import type { OptionGroupsStore } from '@pos/option-groups-store';

export interface PosOptionGroupsSidebarProps {
  store: OptionGroupsStore;
  locale: PosLocale;
  catalog: OptionCatalogDto | null;
  selectedGroupId: string | null;
  groupQuery: string;
  groupSectionsOpen: {
    order: boolean;
    item: boolean;
  };
  loading: boolean;
}

export function PosOptionGroupsSidebar({
  store,
  locale,
  catalog,
  selectedGroupId,
  groupQuery,
  groupSectionsOpen,
  loading,
}: PosOptionGroupsSidebarProps) {
  const tr = (key: PosTranslationKey, params?: Record<string, string | number>) =>
    translatePos(locale, key, params);

  const groups = catalog?.groups ?? [];
  const normalizedQuery = normalizeSearchText(groupQuery);
  const matchesQuery = (group: OptionCatalogGroupDto) =>
    !normalizedQuery || normalizeSearchText(group.name).includes(normalizedQuery);
  const filteredCount = groups.filter(matchesQuery).length;

  const orderGroups = groups.filter((g) => g.scope === 'order');
  const itemGroups = groups.filter((g) => g.scope !== 'order');

  const renderGroupCard = (group: OptionCatalogGroupDto) => {
    const active = group.id === selectedGroupId;
    const optCount = group.options?.length ?? 0;
    const ruleSummary = formatRuleSummary(group, catalog, locale);
    const hidden = !matchesQuery(group);
    return (
      <button
        key={group.id}
        type="button"
        hidden={hidden}
        aria-pressed={active ? 'true' : 'false'}
        className={`menu-category-card menu-option-card${active ? ' is-active' : ''}`}
        data-group={group.id}
        onClick={() => store.selectGroup(group.id)}
      >
        <div className="menu-category-card-title">{group.name}</div>
        <div className="menu-category-card-meta">
          <span>
            {optCount} {tr('ugOptions')}
          </span>
          {ruleSummary ? <span className="ug-card-rule"> · {ruleSummary}</span> : null}
        </div>
      </button>
    );
  };

  const renderSection = (
    scope: 'order' | 'item',
    titleKey: 'ugOrderSection' | 'ugItemSection',
    sectionGroups: OptionCatalogGroupDto[]
  ) => {
    const visibleCount = sectionGroups.filter(matchesQuery).length;
    const isOpen = normalizedQuery ? visibleCount > 0 : groupSectionsOpen[scope];
    const sectionHidden =
      (loading && groups.length === 0) ||
      (groups.length > 0 && Boolean(normalizedQuery) && visibleCount === 0);
    return (
      <details
        key={scope}
        className="ug-group-section"
        data-group-scope={scope}
        hidden={sectionHidden}
        open={isOpen}
        onToggle={(e) => {
          const detailsEl = e.currentTarget as HTMLDetailsElement;
          if (normalizedQuery) {
            if (detailsEl.open !== isOpen) {
              detailsEl.open = isOpen;
            }
            return;
          }
          store.setGroupSectionOpen(scope, detailsEl.open);
        }}
      >
        <summary className="ug-group-section-header">
          <span className="ug-group-section-title">{tr(titleKey)}</span>
          <span className="ug-group-section-count">{visibleCount}</span>
        </summary>
        <div className="ug-group-section-list">
          {sectionGroups.map(renderGroupCard)}
          {sectionGroups.length === 0 ? (
            <div className="ug-group-section-empty">{tr('ugNoGroups')}</div>
          ) : null}
        </div>
      </details>
    );
  };

  const showNoMatch = groups.length > 0 && filteredCount === 0;
  const showLoading = loading && groups.length === 0;

  return (
    <>
      <button
        type="button"
        className="menu-add-category-btn ug-new-group-btn"
        data-action="new-group"
        onClick={() => void store.openNewGroupScope()}
      >
        <PlusIcon size={16} />
        <span>{tr('ugNewGroup')}</span>
      </button>

      <div className="ug-search">
        <SearchIcon size={16} />
        <input
          id="ug-group-search"
          type="search"
          className="ug-search-input"
          value={groupQuery}
          placeholder={tr('ugSearchGroups')}
          aria-label={tr('ugSearchGroups')}
          onInput={(e) => store.setGroupQuery((e.currentTarget as HTMLInputElement).value)}
          onChange={(e) => store.setGroupQuery((e.currentTarget as HTMLInputElement).value)}
        />
        {groupQuery ? (
          <button
            type="button"
            className="ug-search-clear"
            data-action="clear-search"
            aria-label={tr('ugClearGroupSearch')}
            onClick={() => {
              store.setGroupQuery('');
              document.getElementById('ug-group-search')?.focus();
            }}
          >
            <CloseIcon size={14} />
          </button>
        ) : null}
      </div>

      <div className="ug-group-empty" hidden={!showLoading && !showNoMatch}>
        {showLoading ? tr('loading') : tr('ugNoMatchingGroups')}
      </div>

      {renderSection('order', 'ugOrderSection', orderGroups)}
      {renderSection('item', 'ugItemSection', itemGroups)}
    </>
  );
}
