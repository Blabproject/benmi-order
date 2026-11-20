import { Button } from '@shared/ui/button';
import { settingsActions as actions } from './settings-actions';
import { SettingsPanel } from './SettingsPanel';

export function StoreStatusSettings() {
  return (
    <SettingsPanel section="status">
      <div data-slot="card-header">
        <h2 className="settings-card-title" id="i18n-setting-store-status-title">門市接單狀態</h2>
        <div
          style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", fontWeight: "600", marginTop: "2px" }}
          id="i18n-setting-store-status-sub"
        >隨時切換一般營業、繁忙延後或暫停接單模式</div>
      </div>
      <div className="store-status-options-grid" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <Button className="status-select-box active" id="status-box-open" aria-pressed={true} onClick={() => actions.setStoreStatus('open')} type="button">
          <span className="status-box-header">
            <span className="status-dot dot-open" />
            <span className="status-box-name" id="i18n-box-open-title">正常營業</span>
          </span>
          <span className="status-box-desc" id="i18n-box-open-desc">立即接單，優先於今日營業時間與公休日</span>
        </Button>
        <Button className="status-select-box" id="status-box-busy" aria-pressed={false} onClick={() => actions.setStoreStatus('busy')} type="button">
          <span className="status-box-header">
            <span className="status-dot dot-busy" />
            <span className="status-box-name" id="i18n-box-busy-title">門市繁忙 (+1小時)</span>
          </span>
          <span className="status-box-desc" id="i18n-box-busy-desc">新訂單自動延長 1 小時製作時間</span>
        </Button>
        <Button className="status-select-box" id="status-box-paused" aria-pressed={false} onClick={() => actions.setStoreStatus('paused')} type="button">
          <span className="status-box-header">
            <span className="status-dot dot-paused" />
            <span className="status-box-name" id="i18n-box-paused-title">暫停接單</span>
          </span>
          <span className="status-box-desc" id="i18n-box-paused-desc">暫停接收新訂單，顧客端無法下單</span>
        </Button>
        <Button className="status-select-box" id="status-box-closed" aria-pressed={false} onClick={() => actions.setStoreStatus('closed')} type="button">
          <span className="status-box-header">
            <span className="status-dot dot-closed" />
            <span className="status-box-name" id="i18n-box-closed-title">今日打烊</span>
          </span>
          <span className="status-box-desc" id="i18n-box-closed-desc">今日停止接單，下個營業日自動恢復</span>
        </Button>
      </div>
      <div style={{ margin: "0 20px 20px", padding: "18px 20px", borderRadius: "12px", border: "1.5px solid var(--border)", background: "#fafafa" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "12px" }}>
          <div>
            <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-auto-reopen-title">今日打烊自動恢復時間</div>
            <div style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", fontWeight: "600", marginTop: "3px" }} id="i18n-auto-reopen-desc">設定在下個營業日開始前多久自動恢復接單（預設 1 小時）</div>
          </div>
          <span
            className="setting-badge"
            id="setting-auto-reopen-badge"
            style={{ padding: "6px 12px", borderRadius: "8px", fontWeight: "900", fontSize: "var(--pos-text-meta)", background: "#ecfdf5", color: "var(--primary)", border: "1px solid #a7f3d0", whiteSpace: "nowrap" }}
          >1 小時</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }} id="auto-reopen-presets">
          <Button
            type="button"
            className="auto-reopen-chip"
            data-minutes="0"
            onClick={event => actions.setAutoOpenBeforeMinutes(0, event)}
            id="i18n-chip-reopen-0"
          >0 分鐘 (開門即接)</Button>
          <Button
            type="button"
            className="auto-reopen-chip"
            data-minutes="30"
            onClick={event => actions.setAutoOpenBeforeMinutes(30, event)}
            id="i18n-chip-reopen-30"
          >30 分鐘</Button>
          <Button
            type="button"
            className="auto-reopen-chip active"
            data-minutes="60"
            onClick={event => actions.setAutoOpenBeforeMinutes(60, event)}
            id="i18n-chip-reopen-60"
          >1 小時 (預設)</Button>
          <Button
            type="button"
            className="auto-reopen-chip"
            data-minutes="120"
            onClick={event => actions.setAutoOpenBeforeMinutes(120, event)}
            id="i18n-chip-reopen-120"
          >2 小時</Button>
          <Button
            type="button"
            className="auto-reopen-chip"
            data-minutes="custom"
            onClick={event => actions.openCustomAutoReopenPrompt(event)}
            id="i18n-chip-reopen-custom"
          >自訂</Button>
        </div>
      </div>
    </SettingsPanel>
  );
}
