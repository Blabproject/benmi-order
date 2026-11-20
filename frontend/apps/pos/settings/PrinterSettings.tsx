import { Card } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { ChoiceInput } from '@shared/ui/choice-input';
import { NativeSelect } from '@shared/ui/native-select';
import { Input } from '@shared/ui/input';
import { settingsActions as actions } from './settings-actions';
import { SettingsPanel } from './SettingsPanel';

const labelSizes = [
  { value: '100x150', label: '100 x 150 mm (4x6" 貨運/大袋貼紙)' },
  { value: '76x130', label: '76 x 130 mm (3x5" 訂單明細貼紙)' },
  { value: '50x30', label: '50 x 30 mm (餐盒/單品標籤)' },
  { value: '40x30', label: '40 x 30 mm (飲料杯貼/單品標籤)' }
];

const labelModes = [
  { value: 'summary', label: '訂單總表貼紙 (1張/每張訂單)', className: 'i18n-opt-tspl-mode-summary' },
  { value: 'item_stickers', label: '單品/杯貼標籤 (1張/每份餐點)', className: 'i18n-opt-tspl-mode-items' }
];

function PrinterStation({ station }: { station: 'cashier' | 'kitchen' }) {
  const cashier = station === 'cashier';
  return (
    <Card flush className="printer-station-card" id={`printer-station-card-${station}`}>
      <div className="printer-station-header">
        <div className="ps-min-w-0">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <div className="printer-station-title" id={`i18n-printer-${station}-title`}>{cashier ? "櫃檯印表機 (客人聯)" : "廚房印表機 (製作聯)"}</div>
            <div
              className="settings-printer-status-pill disconnected"
              id={`printer-${station}-status-pill`}
              style={{ fontSize: "var(--pos-text-meta)", padding: "3px 10px" }}
            >
              <span className="printer-status-dot offline" id={`printer-${station}-status-dot`} />
              <span id={`printer-${station}-status-text`}>未連線印表機</span>
            </div>
          </div>
          <div className="printer-station-desc" id={`i18n-printer-${station}-desc`}>{cashier ? "出明細發票、含金額、客製化與 QR Code" : "大字號、桌號、備註清單、不顯示金額"}</div>
        </div>
        <label className="ui-switch" htmlFor={`printer-${station}-enabled`}>
          <ChoiceInput type="checkbox" id={`printer-${station}-enabled`} />
          <span className="ui-switch-track">
            <span className="ui-switch-thumb" />
          </span>
          <span className="ui-switch-label i18n-printer-enable-lbl">啟用</span>
        </label>
      </div>
      <div>
        <label htmlFor={`printer-${station}-protocol`} className="i18n-printer-protocol-lbl printer-field-label">列印指令協定 (Protocol)</label>
        <NativeSelect
          id={`printer-${station}-protocol`}
          className="form-input form-select"
          onChange={() => actions.onPrinterProtocolChange(station)}
        >
          {cashier
            ? <option value="esc_pos" className="i18n-opt-escpos">ESC/POS (收據/小票 58-80mm)</option>
            : <option value="tspl" className="i18n-opt-tspl">TSPL (貼紙/標籤機 如 Aimo D520BT, Xprinter)</option>}
        </NativeSelect>
      </div>
      <div>
        <label htmlFor={`printer-${station}-interface`} className="i18n-printer-interface-lbl printer-field-label">連線方式</label>
        <NativeSelect
          id={`printer-${station}-interface`}
          className="form-input form-select"
          onChange={() => actions.onPrinterInterfaceChange(station)}
        >
          <option value="network" className="i18n-opt-network">區域網路 / Wi-Fi (TCP/IP)</option>
          <option value="bluetooth" className="i18n-opt-bluetooth">藍牙無線 (Bluetooth SPP)</option>
        </NativeSelect>
      </div>
      <div id={`printer-${station}-network-box`} className="printer-sub-box">
        <div>
          <label htmlFor={`printer-${station}-ip`} className="i18n-printer-ip-lbl printer-field-label">IP 位址 (LAN / Wi-Fi)</label>
          <Input
            type="text"
            id={`printer-${station}-ip`}
            className="form-input"
            style={{ fontFamily: "monospace", fontSize: "var(--pos-text-meta)" }}
            placeholder={cashier ? "192.168.1.100" : "192.168.1.101"}
          />
        </div>
        <div>
          <label htmlFor={`printer-${station}-port`} className="i18n-printer-port-lbl printer-field-label">Port</label>
          <Input type="number" id={`printer-${station}-port`} className="form-input" style={{ fontFamily: "monospace" }} defaultValue="9100" />
        </div>
      </div>
      <div id={`printer-${station}-bt-box`} className="printer-sub-box" style={{ display: "none" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
            <label className="i18n-printer-bt-lbl printer-field-label" style={{ marginBottom: "0" }}>已配對藍牙裝置</label>
            <Button
              type="button"
              className="btn btn-refresh-bt i18n-printer-bt-refresh"
              onClick={() => actions.refreshPairedBluetoothDevices(station)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              重新整理
            </Button>
          </div>
          <NativeSelect id={`printer-${station}-bt-device`} className="form-input form-select">
            <option value="" className="i18n-opt-bt-placeholder">-- 請選擇已配對的藍牙印表機 --</option>
          </NativeSelect>
          <div id={`printer-${station}-bt-status`} style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", marginTop: "6px" }} />
        </div>
      </div>
      <div id={`printer-${station}-escpos-box`} style={cashier ? undefined : { display: "none" }}>
        <label htmlFor={`printer-${station}-paper`} className="i18n-printer-paper-lbl printer-field-label">紙張規格</label>
        <NativeSelect id={`printer-${station}-paper`} className="form-input form-select">
          <option value="80" className="i18n-opt-p80">80mm (標準)</option>
          <option value="58" className="i18n-opt-p58">58mm (小票)</option>
        </NativeSelect>
        <label className="printer-field-label i18n-printer-feed-before-cut" htmlFor={`printer-${station}-feed-before-cut`}>紙尾留白 / 裁切前進紙 (mm)</label>
        <Input
          type="number"
          id={`printer-${station}-feed-before-cut`}
          className="form-input"
          min="0"
          max="150"
          step="1"
          defaultValue="80"
          title="若底部內容太靠近刀口，可增加此值"
        />
      </div>
      <div id={`printer-${station}-tspl-box`} className="printer-sub-box" style={cashier ? { display: "none" } : undefined}>
        <div>
          <label htmlFor={`printer-${station}-tspl-size`} className="i18n-printer-tspl-size-lbl printer-field-label">標籤紙張尺寸</label>
          <NativeSelect id={`printer-${station}-tspl-size`} className="form-input form-select" onChange={() => actions.onTsplSizeChange(station)}>
            {(cashier ? labelSizes : [...labelSizes].reverse()).map(({ value, label }) => (
              <option key={value} value={value} className={`i18n-opt-tspl-${value}`}>{label}</option>
            ))}
            <option value="custom" className="i18n-opt-tspl-custom">自訂尺寸 (Custom mm)</option>
          </NativeSelect>
        </div>
        <div id={`printer-${station}-tspl-custom-size-box`} style={{ display: "none", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label htmlFor={`printer-${station}-tspl-width`} className="i18n-printer-tspl-width-lbl printer-field-label">寬度 (mm)</label>
            <Input type="number" id={`printer-${station}-tspl-width`} className="form-input" defaultValue={cashier ? 100 : 40} />
          </div>
          <div>
            <label htmlFor={`printer-${station}-tspl-height`} className="i18n-printer-tspl-height-lbl printer-field-label">高度 (mm)</label>
            <Input type="number" id={`printer-${station}-tspl-height`} className="form-input" defaultValue={cashier ? 150 : 30} />
          </div>
        </div>
        <div>
          <label htmlFor={`printer-${station}-tspl-mode`} className="i18n-printer-tspl-mode-lbl printer-field-label">標籤列印模式</label>
          <NativeSelect id={`printer-${station}-tspl-mode`} className="form-input form-select">
            {(cashier ? labelModes : [...labelModes].reverse()).map(({ value, label, className }) => (
              <option key={value} value={value} className={className}>{label}</option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label htmlFor={`printer-${station}-tspl-dpi`} className="i18n-printer-tspl-dpi-lbl printer-field-label">解析度 (DPI)</label>
          <NativeSelect id={`printer-${station}-tspl-dpi`} className="form-input form-select" defaultValue="203">
            <option value="203" className="i18n-opt-tspl-dpi-203">203 DPI (8 dots/mm - 標準)</option>
            <option value="300" className="i18n-opt-tspl-dpi-300">300 DPI (11.8 dots/mm - 高解析度)</option>
          </NativeSelect>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label htmlFor={`printer-${station}-tspl-x-offset`} className="i18n-printer-tspl-x-offset-lbl printer-field-label">水平邊距 X (mm)</label>
            <Input type="number" id={`printer-${station}-tspl-x-offset`} className="form-input" defaultValue="0" step="0.5" min="-30" max="50" />
          </div>
          <div>
            <label htmlFor={`printer-${station}-tspl-y-offset`} className="i18n-printer-tspl-y-offset-lbl printer-field-label">垂直邊距 Y (mm)</label>
            <Input type="number" id={`printer-${station}-tspl-y-offset`} className="form-input" defaultValue="0" step="0.5" min="-20" max="30" />
          </div>
        </div>
      </div>
      <Button type="button" className="btn btn-test-print" onClick={() => actions.testPOSPrinterStation(station)}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: "0" }}
        >
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        <span className="i18n-btn-test-print">測試列印 (Test Print)</span>
      </Button>
    </Card>
  );
}

export function PrinterSettings() {
  return (
    <SettingsPanel section="printer">
      <div className="printer-reports" data-printer-reports="issues" role="status" aria-live="polite" hidden />
      <div data-slot="card-header" className="settings-panel-actions-header">
        <div>
          <h2 className="settings-card-title" id="i18n-setting-printer-title">出單與印表機</h2>
          <div style={{ fontSize: "var(--pos-text-meta)", color: "#64748b", fontWeight: "600", marginTop: "2px" }} id="i18n-setting-printer-sub">設定 Wi-Fi / LAN 區域網路熱感應出單機 (Port 9100) 與自動列印模式</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <Button
            className="settings-printer-status-pill disconnected"
            id="settings-printer-status-bar"
            style={{ display: "none" }}
            onClick={() => actions.switchSettingTab('setting-card-printer')}
            type="button"
          >
            <span className="printer-status-dot offline" id="printer-status-dot" />
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
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span id="settings-printer-status-text">未連線印表機</span>
          </Button>
          <Button
            type="button"
            className="btn"
            variant="outline"
            onClick={() => actions.openPrinterGuideModal()}
            id="btn-open-printer-guide"
            style={{ padding: "9px 15px", fontSize: "var(--pos-text-meta)", fontWeight: "800", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "7px", cursor: "pointer", transition: "all 0.15s ease" }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span id="i18n-btn-printer-guide">出單指南 (Guide)</span>
          </Button>
          <p id="printer-save-status" role="status" aria-live="polite" style={{ display: "none" }} />
        </div>
      </div>
      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ background: "#f8fafc", padding: "18px 20px", borderRadius: "14px", border: "1.5px solid var(--border)", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <div style={{ fontWeight: "1000", fontSize: "var(--pos-text-body)", color: "#0f172a" }} id="i18n-printer-mode-title">列印出單模式</div>
            <div style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", marginTop: "2px" }} id="i18n-printer-mode-sub">選擇新訂單進來時的列印行為</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "12px", marginTop: "4px" }}>
            <label
              className="setting-mode-card"
              id="mode-card-print-auto"
              style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px", borderRadius: "14px", border: "1.5px solid var(--border)", background: "#fff", cursor: "pointer" }}
            >
              <ChoiceInput
                type="radio"
                name="printer-mode-radio"
                id="printer-mode-auto"
                value="auto"
                onChange={() => actions.onPrinterModeChange('auto')}
                style={{ marginTop: "2px" }}
              />
              <div>
                <div style={{ fontWeight: "1000", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-print-mode-auto-title">確認後自動列印</div>
                <div
                  style={{ fontSize: "var(--pos-text-meta)", color: "#4b5563", marginTop: "4px", lineHeight: "1.45" }}
                  id="i18n-print-mode-auto-desc"
                >收到新訂單時先發出提示音，店員確認接單成功後，才自動列印明細與餐點貼紙。</div>
              </div>
            </label>
            <label
              className="setting-mode-card"
              id="mode-card-print-manual"
              style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px", borderRadius: "14px", border: "1.5px solid var(--border)", background: "#fff", cursor: "pointer" }}
            >
              <ChoiceInput
                type="radio"
                name="printer-mode-radio"
                id="printer-mode-manual"
                value="manual"
                onChange={() => actions.onPrinterModeChange('manual')}
                style={{ marginTop: "2px" }}
              />
              <div>
                <div style={{ fontWeight: "1000", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-print-mode-manual-title">手動列印模式 (Manual-print)</div>
                <div
                  style={{ fontSize: "var(--pos-text-meta)", color: "#4b5563", marginTop: "4px", lineHeight: "1.45" }}
                  id="i18n-print-mode-manual-desc"
                >店員須在螢幕點選 [整單全印] 機器才會出單。適合需要先核對確認訂單的門市。</div>
              </div>
            </label>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "16px" }}>
          <PrinterStation station="cashier" />
          <PrinterStation station="kitchen" />
        </div>
      </div>
    </SettingsPanel>
  );
}
