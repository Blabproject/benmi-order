import { Input } from '@shared/ui/input';
import { Button } from '@shared/ui/button';
import { settingsActions as actions } from './settings-actions';
import { SettingsPanel } from './SettingsPanel';

export function DeviceSettings() {
  return (
    <SettingsPanel section="store-pairing">
      <div data-slot="card-header" className="settings-panel-actions-header">
        <div>
          <h2 className="settings-card-title" id="i18n-setting-pairing-title">門市終端與設備綁定</h2>
          <div style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", fontWeight: "600", marginTop: "2px" }} id="i18n-setting-pairing-sub">管理此平板電腦與雲端門市之連線設定</div>
        </div>
      </div>
      <div style={{ padding: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "20px" }}>
          <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1.5px solid #e2e8f0" }}>
            <div style={{ fontSize: "var(--pos-text-meta)", color: "#64748b", marginBottom: "4px" }} id="i18n-pairing-tenant-label">當前綁定門市代碼</div>
            <div style={{ fontSize: "var(--pos-text-body)", fontWeight: "800", color: "#0f172a" }} id="display-pairing-tenant-id">--</div>
          </div>
          <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1.5px solid #e2e8f0" }}>
            <div style={{ fontSize: "var(--pos-text-meta)", color: "#64748b", marginBottom: "4px" }} id="i18n-pairing-status-label">終端連線狀態</div>
            <div style={{ fontSize: "var(--pos-text-body)", fontWeight: "800", color: "var(--settings-green-text)", display: "flex", alignItems: "center" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--settings-green)", display: "inline-block", marginRight: "8px", flexShrink: "0" }} />
              <span id="i18n-pairing-status-connected">已連線運作中</span>
            </div>
          </div>
        </div>
        <form id="store-pin-form" className="store-pin-form" onSubmit={event => actions.submitStorePinChange(event)} noValidate>
          <div>
            <h3 className="store-pin-title" data-store-pin-i18n="pinChangeTitle">變更管理 PIN 碼</h3>
            <p className="store-pin-description" data-store-pin-i18n="pinChangeDescription">此 PIN 碼適用於整間門市。變更後，員工需重新登入。</p>
          </div>
          <p id="store-pin-payment-context" className="store-pin-description store-pin-return-notice" data-store-pin-i18n="pinPaymentContext" hidden>正在設定付款管理使用的 PIN 碼。儲存後將返回付款管理，再以新 PIN 碼驗證。</p>
          <div className="store-pin-field">
            <label htmlFor="store-pin-current" data-store-pin-i18n="pinCurrent">目前 PIN 碼</label>
            <div className="store-pin-input-row">
              <Input
                id="store-pin-current"
                className="form-input"
                type="password"
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck="false"
                required
                aria-describedby="store-pin-feedback"
                data-pin-label="pinCurrent"
              />
              <Button
                type="button"
                className="btn store-pin-toggle"
                data-store-pin-toggle="store-pin-current"
                aria-controls="store-pin-current"
                aria-pressed="false"
                onClick={() => actions.toggleStorePinVisibility('store-pin-current')}
              >顯示</Button>
            </div>
          </div>
          <div className="store-pin-field">
            <label htmlFor="store-pin-new" data-store-pin-i18n="pinNew">新 PIN 碼</label>
            <div className="store-pin-input-row">
              <Input
                id="store-pin-new"
                className="form-input"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                minLength={4}
                maxLength={8}
                autoComplete="new-password"
                required
                aria-describedby="store-pin-hint store-pin-feedback"
                data-pin-label="pinNew"
              />
              <Button
                type="button"
                className="btn store-pin-toggle"
                data-store-pin-toggle="store-pin-new"
                aria-controls="store-pin-new"
                aria-pressed="false"
                onClick={() => actions.toggleStorePinVisibility('store-pin-new')}
              >顯示</Button>
            </div>
            <p id="store-pin-hint" className="store-pin-description" data-store-pin-i18n="pinFormatHint">請輸入 4–8 位數字，可使用 0 開頭。</p>
          </div>
          <div className="store-pin-field">
            <label htmlFor="store-pin-confirm" data-store-pin-i18n="pinConfirm">確認新 PIN 碼</label>
            <div className="store-pin-input-row">
              <Input
                id="store-pin-confirm"
                className="form-input"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                minLength={4}
                maxLength={8}
                autoComplete="new-password"
                required
                aria-describedby="store-pin-feedback"
                data-pin-label="pinConfirm"
              />
              <Button
                type="button"
                className="btn store-pin-toggle"
                data-store-pin-toggle="store-pin-confirm"
                aria-controls="store-pin-confirm"
                aria-pressed="false"
                onClick={() => actions.toggleStorePinVisibility('store-pin-confirm')}
              >顯示</Button>
            </div>
          </div>
          <div id="store-pin-feedback" className="store-pin-feedback" role="status" aria-live="polite" aria-atomic="true" />
          <div className="store-pin-actions">
            <Button type="submit" className="btn btn-primary" id="store-pin-submit" variant="default">變更 PIN 碼</Button>
            <Button type="button" className="btn btn-ghost" onClick={() => actions.clearStorePinChangeForm()} data-store-pin-i18n="pinClear" variant="outline">清除內容</Button>
            <Button
              type="button"
              className="btn btn-ghost"
              id="store-pin-back-to-payments"
              onClick={() => actions.cancelStorePinChangeReturn()}
              data-store-pin-i18n="pinBackToPayments"
              hidden
              variant="outline"
            >返回付款管理</Button>
          </div>
        </form>
        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "var(--pos-text-body)", fontWeight: "700", color: "#1e293b" }} id="i18n-unlink-title">解除此設備綁定 / 切換門市</div>
            <div style={{ fontSize: "var(--pos-text-meta)", color: "#64748b", marginTop: "2px" }} id="i18n-unlink-desc">解除後此終端機將停止同步該門市訂單，需輸入管理 PIN 碼確認。</div>
          </div>
          <Button
            type="button"
            className="btn"
            style={{ minHeight: "48px", padding: "0 20px", fontSize: "var(--pos-text-body)", fontWeight: "800", color: "#ef4444", background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: "10px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => actions.promptUnlinkStoreDevice()}
            id="i18n-btn-unlink-store"
          >切換門市 / 解除綁定</Button>
        </div>
      </div>
    </SettingsPanel>
  );
}
