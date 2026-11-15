import {
  computeAffectedProductIds,
  formatRuleSummary,
  resolveEffectiveOptions,
  type OptionCatalogDto,
  type OptionCatalogGroupDto,
} from '@shared/contracts/option-groups-model';
import { translatePos, type PosLocale, type PosTranslationKey } from '@shared/i18n/pos-dictionary';
import { ChevronRightIcon, ImagePlaceholderIcon, PlusIcon } from '@shared/ui/PosIcons';
import type { OptionGroupsStore } from '@pos/option-groups-store';

export interface PosOptionGroupsWorkspaceProps {
  store: OptionGroupsStore;
  locale: PosLocale;
  catalog: OptionCatalogDto | null;
  selectedGroup: OptionCatalogGroupDto | null;
  loading: boolean;
}

function formatPriceDelta(price: number): string {
  const num = Number(price || 0);
  if (!num) return 'NT$0';
  return num > 0 ? `+NT$${num}` : `-NT$${Math.abs(num)}`;
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
    return <div className="ug-workspace-empty">{tr('loading')}</div>;
  }

  if (!selectedGroup) {
    return (
      <div className="ug-workspace-empty">
        <p>{tr('ugNoGroups')}</p>
        <button
          type="button"
          className="ug-btn-secondary"
          data-action="new-group"
          onClick={() => void store.openNewGroupScope()}
        >
          <PlusIcon size={16} />
          <span>{tr('ugNewGroup')}</span>
        </button>
      </div>
    );
  }

  const affectedIds = computeAffectedProductIds(selectedGroup, catalog);
  const options = resolveEffectiveOptions(selectedGroup, catalog);
  const ruleSummary = formatRuleSummary(selectedGroup, catalog, locale);

  return (
    <div className="ug-workspace">
      <div className="ug-workspace-meta">
        <button
          type="button"
          className="ug-workspace-linked"
          data-action="linked"
          onClick={() => {
            void store.openGroup(selectedGroup.id).then(() => {
              store.openLinkedProductsPicker();
            });
          }}
        >
          <span>{`${tr('ugLinked')} (${affectedIds.length})`}</span>
          <ChevronRightIcon size={16} />
        </button>
        {ruleSummary ? <div className="ug-workspace-rule">{ruleSummary}</div> : null}
      </div>

      <div className="ug-workspace-options">
        {options.length === 0 ? (
          <div className="ug-workspace-empty">
            <p>{tr('ugEmpty')}</p>
            <button
              type="button"
              className="ug-btn-secondary"
              data-action="add-option"
              onClick={() => void store.openGroup(selectedGroup.id, 'add-option')}
            >
              <PlusIcon size={16} />
              <span>{tr('ugAdd')}</span>
            </button>
          </div>
        ) : (
          options.map((opt) => (
            <button
              key={opt.id}
              id={`ug-option-${opt.id}`}
              type="button"
              className={`ug-row ug-option-row${opt.isOutOfStock ? ' is-out-of-stock' : ''}`}
              data-action="option"
              data-id={opt.id}
              onClick={() => void store.openOption(selectedGroup.id, opt.id)}
            >
              <div className="ug-option-thumb">
                {opt.imageUrl ? (
                  <img src={opt.imageUrl} alt={opt.name} />
                ) : (
                  <ImagePlaceholderIcon size={18} />
                )}
              </div>
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
                  <span>{formatPriceDelta(opt.price)}</span>
                  {Number(opt.quantity || 1) > 1 ? <span> × {opt.quantity}</span> : null}
                  {opt.productId ? <span> · {tr('ugLinkedStatus')}</span> : null}
                </div>
              </div>
              <ChevronRightIcon size={16} />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
