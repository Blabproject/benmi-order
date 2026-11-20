import { Button } from '@shared/ui/button';
import { settingsActions as actions } from './settings-actions';
import { SettingsPanel } from './SettingsPanel';

export function HoursSettings() {
  return (
    <SettingsPanel section="hours">
      <div data-slot="card-header" className="settings-panel-actions-header">
        <div className="help-title-row">
          <h2 className="settings-card-title" id="i18n-hours-title">營業時間設定</h2>
          <details className="menu-help">
            <summary aria-labelledby="i18n-hours-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6m0 3v1" />
              </svg>
            </summary>
            <div className="menu-help-text" id="i18n-hours-sub">設定每日營業時段與公休日</div>
          </details>
        </div>
        <Button
          className="btn btn-primary"
          style={{ padding: "10px 20px", fontSize: "var(--pos-text-body)", borderRadius: "8px" }}
          onClick={() => actions.saveOperatingHours()}
          id="btn-save-hours"
          variant="default"
        >儲存設定</Button>
      </div>
      <div style={{ padding: "20px" }}>
        <div id="hours-settings-list" style={{ display: "flex", flexDirection: "column", gap: "12px" }} />
      </div>
    </SettingsPanel>
  );
}
