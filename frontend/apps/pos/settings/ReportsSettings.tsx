import { Button } from '@shared/ui/button';
import { settingsActions as actions } from './settings-actions';
import { SettingsPanel } from './SettingsPanel';

export function ReportsSettings() {
  return (
    <SettingsPanel section="reports">
      <div data-slot="card-header" className="settings-panel-actions-header">
        <div>
          <h2 className="settings-card-title" id="i18n-setting-reports-title">銷量與營收報表</h2>
          <div style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", fontWeight: "600", marginTop: "2px" }} id="i18n-setting-reports-sub">查看門市餐點銷售統計、營收排行與加料偏好</div>
        </div>
      </div>
      <div id="setting-reports-body" style={{ padding: "20px" }}>
        <div
          id="setting-reports-unlocked-body"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "12px", padding: "16px 20px", gap: "16px", flexWrap: "wrap" }}
        >
          <div>
            <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#0f172a" }} id="i18n-reports-unlocked-name">即時餐點銷量與營收分析</div>
            <div style={{ fontSize: "var(--pos-text-meta)", color: "#64748b", marginTop: "4px" }} id="i18n-reports-unlocked-desc">依時間區間（今日、近7天、近30天）統計門市各品項銷售數量、營收總額及顧客加料分析。</div>
          </div>
          <Button
            type="button"
            className="btn btn-primary"
            style={{ padding: "10px 20px", fontSize: "var(--pos-text-body)", fontWeight: "800", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap" }}
            onClick={() => actions.openReportsFromSettings()}
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
              style={{ flexShrink: "0" }}
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span id="i18n-btn-open-reports">查看銷量報表</span>
          </Button>
        </div>
        <div
          id="setting-reports-locked-body"
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
                id="i18n-reports-locked-title"
                data-staff-i18n="staffFeatureClosed"
              >進階功能 (未啟用)</div>
              <div style={{ fontSize: "var(--pos-text-meta)", color: "#64748b", lineHeight: "1.4", marginTop: "2px" }} id="i18n-reports-locked-desc">此功能為 BLAB 進階模組，如需啟用「銷量與營收報表分析」請聯繫 BLAB 團隊升級方案。</div>
            </div>
          </div>
          <Button
            type="button"
            className="btn btn-primary"
            style={{ padding: "8px 16px", fontSize: "var(--pos-text-meta)", fontWeight: "800", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "6px", boxShadow: "0 2px 8px rgba(16, 185, 129, 0.25)", cursor: "pointer", whiteSpace: "nowrap" }}
            onClick={() => actions.openBlabContactModal('upgrade')}
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
            <span id="i18n-btn-contact-upgrade-rep" data-staff-i18n="staffContact">聯繫升級方案</span>
          </Button>
        </div>
      </div>
    </SettingsPanel>
  );
}
