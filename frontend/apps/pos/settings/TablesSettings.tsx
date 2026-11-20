import { Button } from '@shared/ui/button';
import { settingsActions as actions } from './settings-actions';
import { SettingsPanel } from './SettingsPanel';

export function TablesSettings() {
  return (
    <SettingsPanel section="tables" className="restaurant-tables-card">
      <header className="restaurant-tables-card-header" data-slot="card-header">
        <h2 className="settings-card-title" id="i18n-setting-tables-title">桌號管理</h2>
        <div className="restaurant-tables-header" id="settings-table-tools" role="group" aria-labelledby="i18n-setting-tables-title">
          <div className="restaurant-tables-header-actions">
            <Button
              type="button"
              className="restaurant-tables-header-btn btn-outline"
              onClick={() => actions.printAllTablesQrA4()}
              id="i18n-table-print-all-btn"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>列印全部 QR (A4)</span>
            </Button>
            <Button type="button" className="restaurant-tables-header-btn btn-outline" onClick={() => actions.openBatchTableModal()} id="i18n-table-batch-btn">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span>批次新增桌號</span>
            </Button>
            <Button
              type="button"
              className="restaurant-tables-header-btn btn-primary"
              onClick={() => actions.openAddTableModal()}
              id="i18n-table-add-btn"
              variant="default"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>新增桌號</span>
            </Button>
          </div>
        </div>
      </header>
      <div id="setting-tables-body" style={{ padding: "20px" }}>
        <div
          id="setting-tables-locked-body"
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
              <div style={{ fontWeight: "900", fontSize: "15px", color: "#1e1b4b" }} data-staff-i18n="staffFeatureClosed">進階功能 (未啟用)</div>
              <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.4", marginTop: "2px" }} data-staff-i18n="staffFeatureClosedHelp">此功能為 BLAB 進階模組，如需啟用「桌邊點餐」請聯繫 BLAB 團隊升級方案。</div>
            </div>
          </div>
          <Button
            type="button"
            className="btn btn-primary"
            style={{ padding: "8px 16px", fontSize: "14px", fontWeight: "800", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "6px", boxShadow: "0 2px 8px rgba(16, 185, 129, 0.25)", cursor: "pointer", whiteSpace: "nowrap", minHeight: "48px" }}
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
            <span data-staff-i18n="staffContact">聯繫升級方案</span>
          </Button>
        </div>
        <div id="setting-tables-unlocked-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="restaurant-tables-table-wrap">
            <table className="restaurant-tables-table" data-slot="table">
              <thead>
                <tr>
                  <th className="col-name" id="i18n-th-table-name">桌號名稱</th>
                  <th className="col-sort" id="i18n-th-table-sort">排序</th>
                  <th className="col-status" id="i18n-th-table-status">狀態</th>
                  <th className="col-actions" id="i18n-th-table-action">操作</th>
                </tr>
              </thead>
              <tbody id="tables-list-tbody" />
            </table>
          </div>
          <div className="restaurant-tables-notice">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: "0", color: "#64748b" }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span id="i18n-setting-tables-notice">提示：為維護營業歷史報表與數據完整性，使用過之桌號僅能停用，不提供硬性刪除。</span>
          </div>
        </div>
      </div>
    </SettingsPanel>
  );
}
