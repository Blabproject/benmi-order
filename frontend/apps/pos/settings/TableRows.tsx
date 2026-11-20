import { Button } from '@shared/ui/button';
import { ModifyIcon } from '@shared/ui/PosIcons';
import { settingsActions as actions } from './settings-actions';

type RestaurantTable = {
  id: string;
  label: string;
  sort_order?: number;
  is_active: boolean | number;
  active_order_key?: string;
  active_display_key?: string;
  active_order_id?: string | number;
};

export type TablesView =
  | { state: 'loading' | 'error' }
  | { state: 'ready'; tables: RestaurantTable[]; canWrite: boolean };

function QrIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      {size === 24 && <rect x="3" y="14" width="7" height="7" />}
    </svg>
  );
}

export function TableRows({ view }: { view: TablesView }) {
  const t = actions.t;
  if (view.state !== 'ready') {
    return (
      <tr>
        <td colSpan={4} className={`ps-p-6 ps-text-center ${view.state === 'error' ? 'ps-text-red-700' : 'ps-text-slate-600'}`}>
          {t(view.state === 'error' ? 'tableSaveFail' : 'staffLoading')}
        </td>
      </tr>
    );
  }
  if (!view.tables.length) {
    return (
      <tr>
        <td colSpan={4} className="ps-p-0">
          <div className="restaurant-tables-empty-state">
            <div className="restaurant-tables-empty-icon"><QrIcon size={24} /></div>
            <strong>{t('tableEmptyList')}</strong>
            <div className="ps-mt-1 ps-text-slate-600">{t('tableEmptyListSub')}</div>
          </div>
        </td>
      </tr>
    );
  }
  return (
    <>
      {view.tables.map((table, index) => {
        const active = table.is_active === 1 || table.is_active === true;
        const occupied = Boolean(table.active_order_key);
        const status = !active ? 'disabled' : occupied ? 'occupied' : 'empty';
        const label = t(!active ? 'tableStatusDisabled' : occupied ? 'tableOccupied' : 'tableEmpty');
        const code = active && occupied ? actions.OrderCode.format(table.active_display_key || table.active_order_id || '') : '';
        const reason = !view.canWrite ? t('tableNoWritePermission') : occupied ? t('tableDisableOccupied') : '';
        const reasonId = `table-action-reason-${index}`;
        const toggleLabel = t(active ? 'tableDisable' : 'tableEnable');
        return (
          <tr key={table.id} className="restaurant-table-row" data-table-id={table.id}>
            <td className="table-cell-name" data-label={t('tableName')}>
              <div className="restaurant-table-name-wrap"><span className="restaurant-table-name-text">{table.label}</span></div>
            </td>
            <td className="table-cell-sort" data-label={t('tableSort')}>
              <span className="restaurant-table-sort-badge">{table.sort_order || 0}</span>
            </td>
            <td className="table-cell-status" data-label={t('tableStatus')}>
              <span data-slot="badge" className={`restaurant-table-status-pill status-${status}`} title={code ? `${label} ${code}` : undefined}>
                <span className="restaurant-table-status-dot" />
                <span>{label}</span>
              </span>
              {code && <span className="restaurant-table-order-code">{code}</span>}
            </td>
            <td className="table-cell-actions" data-label={t('tableAction')}>
              <div className="restaurant-table-actions-group">
                <Button className="table-action-btn table-action-btn-qr" title={t('tableQrBtn')} onClick={() => actions.openTableQrModal(table.id)}>
                  <QrIcon size={15} />
                  <span>{t('tableQrBtn')}</span>
                </Button>
                <Button
                  className="table-action-btn table-action-btn-edit"
                  disabled={!view.canWrite}
                  aria-describedby={!view.canWrite ? reasonId : undefined}
                  title={view.canWrite ? t('tableEdit') : reason}
                  onClick={() => actions.openEditTableModal(table.id)}
                >
                  <ModifyIcon size={14} />
                  <span>{t('tableEdit')}</span>
                </Button>
                <Button
                  className={`table-action-btn table-action-btn-${active ? 'disable' : 'enable'}`}
                  disabled={Boolean(reason)}
                  aria-describedby={reason ? reasonId : undefined}
                  title={reason || toggleLabel}
                  onClick={() => actions.toggleTableActive(table.id, active ? 0 : 1)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    {active ? <><circle cx="12" cy="12" r="10" /><path d="m5 5 14 14" /></> : <path d="m4 12 5 5L20 6" />}
                  </svg>
                  <span>{toggleLabel}</span>
                </Button>
              </div>
              {reason && <p className="restaurant-table-action-reason" id={reasonId}>{reason}</p>}
            </td>
          </tr>
        );
      })}
    </>
  );
}
