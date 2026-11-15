import {
  computeAffectedProductIds,
  findProductById,
  formatRuleSummary,
  resolveEffectiveOptions,
  type OptionCatalogDto,
  type OptionCatalogGroupDto,
} from '@shared/contracts/option-groups-model';
import { translatePos, type PosLocale, type PosTranslationKey } from '@shared/i18n/pos-dictionary';
import type { OptionGroupsStore } from '@pos/option-groups-store';

export interface PosOptionGroupsWorkspaceProps {
  store: OptionGroupsStore;
  locale: PosLocale;
  catalog: OptionCatalogDto | null;
  selectedGroup: OptionCatalogGroupDto | null;
  loading: boolean;
}

export function PosOptionGroupsWorkspace({
  store,
  locale,
  catalog,
  selectedGroup,
  loading,
}: PosOptionGroupsWorkspaceProps) {
  const tr = (key: PosTranslationKey, params?: Record<string, string | number>) =>
    translatePos(locale, key, params);

  if (loading && !catalog) {
    return <p className="ug-workspace-empty ug-muted">{tr('loading')}</p>;
  }

  if (!selectedGroup) {
    return <p className="ug-workspace-empty ug-muted">{tr('ugNoGroups')}</p>;
  }

  const affectedIds = computeAffectedProductIds(selectedGroup, catalog);
  const linkedNames = affectedIds
    .map((id) => findProductById(catalog, id)?.name)
    .filter((name): name is string => Boolean(name));
  const options = resolveEffectiveOptions(selectedGroup, catalog);
  const ruleSummary = formatRuleSummary(selectedGroup, catalog, locale);
  const ruleText = [
    ruleSummary,
    selectedGroup.allowRepeats ? tr('ugRepeat') : '',
    selectedGroup.included ? tr('ugIncluded') : '',
    selectedGroup.scope !== 'order' && selectedGroup.autoPopup === false
      ? tr('ugManualCustomize')
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="ug-workspace">
      <div className="ug-workspace-linked">
        <div>
          <strong>
            {selectedGroup.scope === 'order'
              ? tr('ugAppliesToOrder')
              : `${tr('ugLinked')} (${affectedIds.length})`}
          </strong>
          {selectedGroup.scope !== 'order' && linkedNames.length > 0 ? (
            <span>{linkedNames.join('、')}</span>
          ) : null}
        </div>
        {selectedGroup.scope !== 'order' ? (
          <button
            type="button"
            data-action="linked"
            onClick={() => void store.openGroup(selectedGroup.id, 'linked')}
          >
            {tr('ugLink')}
          </button>
        ) : null}
      </div>

      <p className="ug-workspace-rule ug-muted">{ruleText}</p>

      <div className="ug-workspace-options">
        {options.length === 0 ? (
          <p className="ug-workspace-empty ug-muted">{tr('ugEmpty')}</p>
        ) : (
          options.map((opt) => (
            <button
              key={opt.id}
              id={`ug-option-${opt.id}`}
              type="button"
              className="ug-row"
              data-action="option"
              data-id={opt.id}
              onClick={() => void store.openGroup(selectedGroup.id, 'option', opt.id)}
            >
              <span className="ug-option-copy">
                <strong>{opt.name}</strong>
                <small className="ug-option-prices">
                  <span>
                    {tr('ugGroupSurcharge')} +${opt.price}
                  </span>
                  {opt.productId ? (
                    <span>
                      {tr('ugRetail')} ${opt.retailPrice ?? 0}
                    </span>
                  ) : null}
                </small>
              </span>
              <span className="ug-option-trailing">
                {opt.isOutOfStock ? <span className="ug-muted">{tr('ugSoldOut')}</span> : null}
                <span aria-hidden="true">›</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
