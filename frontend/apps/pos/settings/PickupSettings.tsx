import { Button } from '@shared/ui/button';
import { ChoiceInput } from '@shared/ui/choice-input';
import { settingsActions as actions } from './settings-actions';
import { SettingsPanel } from './SettingsPanel';

export function PickupSettings() {
  return (
    <SettingsPanel section="ordermode">
      <div data-slot="card-header" className="settings-panel-actions-header">
        <div>
          <h2 className="settings-card-title" id="i18n-ordermode-title">點餐模式 / 取餐時間設定</h2>
          <div style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", fontWeight: "600", marginTop: "2px" }} id="i18n-ordermode-sub">自訂允許顧客預約取餐時間或依序即刻製作</div>
        </div>
        <Button
          className="btn btn-primary"
          style={{ padding: "10px 20px", fontSize: "var(--pos-text-body)", borderRadius: "8px" }}
          onClick={() => actions.saveScheduledPickupSetting()}
          id="btn-save-pickup-setting"
          variant="default"
        >儲存設定</Button>
      </div>
      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <label
          className="setting-mode-card"
          id="mode-card-scheduled"
          style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px", borderRadius: "14px", border: "1.5px solid var(--border)", cursor: "pointer" }}
        >
          <ChoiceInput
            type="radio"
            name="pickup-mode-radio"
            id="setting-allow-scheduled-true"
            value="true"
            onChange={() => actions.onPickupModeChange(true)}
            style={{ marginTop: "2px" }}
          />
          <div>
            <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-mode-scheduled-title">允許顧客預約取餐時間 (預設)</div>
            <div style={{ fontSize: "var(--pos-text-meta)", color: "#4b5563", marginTop: "4px", lineHeight: "1.4" }} id="i18n-mode-scheduled-sub">顧客可自由選擇今天或未來營業時段預約取餐。</div>
          </div>
        </label>
        <label
          className="setting-mode-card"
          id="mode-card-asap"
          style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px", borderRadius: "14px", border: "1.5px solid var(--border)", cursor: "pointer" }}
        >
          <ChoiceInput
            type="radio"
            name="pickup-mode-radio"
            id="setting-allow-scheduled-false"
            value="false"
            onChange={() => actions.onPickupModeChange(false)}
            style={{ marginTop: "2px" }}
          />
          <div>
            <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-mode-asap-title">僅限現場排隊 / 即刻出餐模式</div>
            <div style={{ fontSize: "var(--pos-text-meta)", color: "#4b5563", marginTop: "4px", lineHeight: "1.4" }} id="i18n-mode-asap-sub">關閉預約時段選單。顧客送出訂單後，店家將依序即刻製作出餐。</div>
          </div>
        </label>
        <div
          className="settings-preptime-box"
          style={{ marginTop: "8px", padding: "18px 20px", background: "#ffffff", border: "2px solid var(--border)", borderRadius: "12px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <div style={{ fontWeight: "800", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-setting-preptime-title">門市預估備餐時間</div>
            <span
              id="setting-preptime-badge"
              className="settings-positive-badge"
              style={{ fontSize: "13px", fontWeight: "800", padding: "4px 12px", borderRadius: "99px" }}
            >5 分鐘</span>
          </div>
          <div style={{ fontSize: "var(--pos-text-meta)", color: "#6b7280", marginBottom: "14px", lineHeight: "1.5" }} id="i18n-setting-preptime-sub">當顧客選擇「盡快取餐」時，系統將依此時間預估完成時間。店家可視現場忙碌狀況隨時調整</div>
          <div className="preptime-chips-grid" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <Button type="button" className="setting-preptime-btn active" data-minutes="5" onClick={() => actions.setStorePrepTime(5)}>5 分鐘 (預設)</Button>
            <Button type="button" className="setting-preptime-btn" data-minutes="10" onClick={() => actions.setStorePrepTime(10)}>10 分鐘</Button>
            <Button type="button" className="setting-preptime-btn" data-minutes="15" onClick={() => actions.setStorePrepTime(15)}>15 分鐘</Button>
            <Button type="button" className="setting-preptime-btn" data-minutes="20" onClick={() => actions.setStorePrepTime(20)}>20 分鐘</Button>
            <Button type="button" className="setting-preptime-btn" data-minutes="30" onClick={() => actions.setStorePrepTime(30)}>30 分鐘</Button>
            <Button type="button" className="setting-preptime-btn" data-minutes="45" onClick={() => actions.setStorePrepTime(45)}>45 分鐘</Button>
            <Button type="button" className="setting-preptime-btn" data-minutes="60" onClick={() => actions.setStorePrepTime(60)}>60 分鐘</Button>
            <Button type="button" className="setting-preptime-btn" data-minutes="custom" onClick={() => actions.openCustomPrepTimePrompt()}>自訂分鐘</Button>
          </div>
        </div>
      </div>
    </SettingsPanel>
  );
}
