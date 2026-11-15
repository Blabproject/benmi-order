import {
  normalizeSearchText,
  type OptionCatalogDto,
  type OptionCatalogGroupDto,
} from '@shared/contracts/option-groups-model';
import { translatePos, type PosLocale, type PosTranslationKey } from '@shared/i18n/pos-dictionary';
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
    const hidden = !matchesQuery(group);
    return (
      <button
        key={group.id}
        type="button"
        hidden={hidden}
        aria-pressed={active ? 'true' : 'false'}
        className={`menu-option-card${active ? ' active' : ''}`}
        data-group={group.id}
        onClick={() => store.selectGroup(group.id)}
      >
        <span className="menu-option-card-content">
          <strong>{group.name}</strong>
          <small>
            {optCount} {tr('ugOptions')}
          </small>
        </span>
        <span aria-hidden="true">›</span>
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
        <summary className="ug-group-section-heading">
          <span>{tr(titleKey)}</span>
          <span className="ug-group-section-count">{sectionGroups.length}</span>
          <svg
            width="16"
            height="16"
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
        </summary>
        <div className="ug-group-section-cards">
          {sectionGroups.length === 0 ? (
            <p className="ug-group-section-empty ug-muted">{tr('ugNoGroups')}</p>
          ) : (
            sectionGroups.map(renderGroupCard)
          )}
        </div>
      </details>
    );
  };

  const showNoMatch = groups.length > 0 && filteredCount === 0;
  const showLoading = loading && groups.length === 0;

  return (
    <>
      <div className="ug-group-navigation">
        <button
          type="button"
          data-action="new-group"
          onClick={() => void store.openNewGroupScope()}
        >
          {tr('ugNewGroup')}
        </button>

        <div className="ug-group-search">
          <input
            id="ug-group-search"
            type="search"
            value={groupQuery}
            placeholder={tr('ugSearchGroups')}
            aria-label={tr('ugSearchGroups')}
            onInput={(e) => store.setGroupQuery((e.currentTarget as HTMLInputElement).value)}
            onChange={(e) => store.setGroupQuery((e.currentTarget as HTMLInputElement).value)}
          />
          <button
            type="button"
            data-action="clear-search"
            aria-label={tr('ugClearGroupSearch')}
            hidden={!groupQuery}
            onClick={() => {
              store.setGroupQuery('');
              document.getElementById('ug-group-search')?.focus();
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="ug-group-list">
        {renderSection('order', 'ugOrderSection', orderGroups)}
        {renderSection('item', 'ugItemSection', itemGroups)}
        <p
          className="ug-group-empty ug-muted"
          role="status"
          hidden={!showLoading && !showNoMatch}
        >
          {showLoading ? tr('loading') : showNoMatch ? tr('ugNoMatchingGroups') : ''}
        </p>
      </div>
    </>
  );
}
