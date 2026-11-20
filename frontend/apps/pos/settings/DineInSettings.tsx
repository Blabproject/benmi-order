import { Button } from '@shared/ui/button';
import { ChoiceInput } from '@shared/ui/choice-input';
import { settingsActions as actions } from './settings-actions';
import { SettingsPanel } from './SettingsPanel';

export function DineInSettings() {
  return (
    <SettingsPanel section="dinein">
      <div data-slot="card-header" className="settings-panel-actions-header">
        <div>
          <h2 className="settings-card-title" id="i18n-setting-dinein-title">內用接單設定</h2>
          <div style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", fontWeight: "600", marginTop: "2px" }} id="i18n-setting-dinein-sub">自訂是否允許顧客選擇「內用」或僅接受「外帶」</div>
        </div>
        <Button
          className="btn btn-primary"
          style={{ padding: "10px 20px", fontSize: "var(--pos-text-body)", borderRadius: "8px" }}
          onClick={() => actions.saveDineInSetting()}
          id="btn-save-dinein-setting"
          variant="default"
        >儲存設定</Button>
      </div>
      <div id="setting-dinein-body" style={{ padding: "20px" }}>
        <div id="setting-dinein-unlocked-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <label
            className="setting-mode-card"
            id="mode-card-dinein-true"
            style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px", borderRadius: "14px", border: "1.5px solid var(--border)", cursor: "pointer" }}
          >
            <ChoiceInput
              type="radio"
              name="dinein-mode-radio"
              id="setting-allow-dinein-true"
              value="true"
              onChange={() => actions.onDineInModeChange(true)}
              style={{ marginTop: "2px" }}
            />
            <div>
              <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-mode-dinein-true-title">開啟內用與外帶 (預設)</div>
              <div style={{ fontSize: "var(--pos-text-meta)", color: "#4b5563", marginTop: "4px", lineHeight: "1.4" }} id="i18n-mode-dinein-true-sub">顧客可在點餐頁面自由切換「外帶」或「內用」模式。</div>
            </div>
          </label>
          <label
            className="setting-mode-card"
            id="mode-card-dinein-false"
            style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px", borderRadius: "14px", border: "1.5px solid var(--border)", cursor: "pointer" }}
          >
            <ChoiceInput
              type="radio"
              name="dinein-mode-radio"
              id="setting-allow-dinein-false"
              value="false"
              onChange={() => actions.onDineInModeChange(false)}
              style={{ marginTop: "2px" }}
            />
            <div>
              <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-mode-dinein-false-title">僅限外帶 (關閉內用)</div>
              <div style={{ fontSize: "var(--pos-text-meta)", color: "#4b5563", marginTop: "4px", lineHeight: "1.4" }} id="i18n-mode-dinein-false-sub">隱藏內用選項，所有訂單一律為外帶自取。</div>
            </div>
          </label>
        </div>
        <div
          id="setting-dinein-locked-body"
          style={{ display: "none", background: "linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)", border: "1.5px dashed #cbd5e1", borderRadius: "12px", padding: "14px 18px", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: "1", minWidth: "240px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#ede9fe", color: "#6d28d9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: "0", border: "1px solid #ddd6fe" }}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <div
                style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#1e1b4b" }}
                id="i18n-feature-locked-title"
                data-staff-i18n="staffFeatureClosed"
              >進階功能 (未啟用)</div>
              <div style={{ fontSize: "var(--pos-text-meta)", color: "#64748b", lineHeight: "1.4", marginTop: "2px" }} id="i18n-feature-locked-desc">此功能為 BLAB 進階模組，如需啟用「內用接單」請聯繫 BLAB 團隊升級方案。</div>
            </div>
          </div>
          <Button
            type="button"
            className="btn btn-primary"
            style={{ padding: "8px 16px", fontSize: "var(--pos-text-meta)", fontWeight: "800", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "6px", boxShadow: "0 2px 8px rgba(16, 185, 129, 0.25)", cursor: "pointer", whiteSpace: "nowrap" }}
            onClick={() => actions.openBlabContactModal('upgrade')}
            id="i18n-btn-contact-upgrade"
            variant="default"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span id="i18n-btn-contact-upgrade-text" data-staff-i18n="staffContact">聯繫升級方案</span>
          </Button>
        </div>
      </div>
    </SettingsPanel>
  );
}
