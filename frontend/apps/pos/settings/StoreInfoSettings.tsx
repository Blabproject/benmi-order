import { Card } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Textarea } from '@shared/ui/textarea';
import { ChoiceInput } from '@shared/ui/choice-input';
import { settingsActions as actions } from './settings-actions';
import { SettingsPanel } from './SettingsPanel';

export function StoreInfoSettings() {
  return (
    <SettingsPanel section="store-info">
      <div data-slot="card-header" className="settings-panel-actions-header">
        <div>
          <h2 className="settings-card-title" id="i18n-setting-store-info-title">門市基本資訊</h2>
          <div
            style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", fontWeight: "600", marginTop: "2px" }}
            id="i18n-setting-store-info-sub"
          >管理門市標誌 (Logo)、跑馬燈公告與門市聯絡地址</div>
        </div>
        <Button
          type="button"
          className="btn btn-primary"
          style={{ padding: "10px 20px", fontSize: "var(--pos-text-body)", borderRadius: "8px", fontWeight: "900" }}
          onClick={() => actions.saveAllStoreInfoSettings()}
          id="btn-save-all-store-info"
          variant="default"
        >儲存全部資訊</Button>
      </div>
      <div style={{ padding: "22px 20px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <Card className="ps-grid ps-gap-3">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#0f172a" }} id="i18n-setting-logo-title">門市 Logo</div>
              <div style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", marginTop: "2px" }} id="i18n-setting-logo-sub">顯示於顧客點餐頁面頂部與 POS 系統</div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <Button
                type="button"
                className="btn btn-ghost"
                style={{ border: "1px solid #fee2e2", background: "#fff5f5", color: "var(--brand-red)", padding: "8px 14px", fontSize: "var(--pos-text-meta)", borderRadius: "8px", display: "none", fontWeight: "700" }}
                onClick={() => actions.deleteStoreLogoSetting()}
                id="btn-delete-logo-setting"
                variant="outline"
              >刪除 Logo</Button>
              <Button
                type="button"
                className="btn btn-primary"
                style={{ padding: "8px 16px", fontSize: "var(--pos-text-meta)", borderRadius: "8px", fontWeight: "800" }}
                onClick={() => actions.saveStoreLogoSetting()}
                id="btn-save-logo-setting"
                variant="default"
              >儲存 Logo</Button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
            <div style={{ width: "88px", height: "88px", borderRadius: "14px", border: "2px dashed #cbd5e1", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: "0", boxShadow: "0 2px 6px rgba(0,0,0,0.04)" }}>
              <img id="setting-logo-preview" alt="Store Logo Preview" style={{ width: "100%", height: "100%", objectFit: "cover", display: "none" }} />
              <span id="setting-logo-placeholder" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
                  <path d="M2 7h20" />
                </svg>
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "1", minWidth: "220px" }}>
              <Input
                type="file"
                id="setting-logo-file-input"
                accept="image/png, image/jpeg, image/webp"
                style={{ display: "none" }}
                onChange={event => actions.handleSettingLogoSelect(event)}
              />
              <Button
                type="button"
                className="btn btn-ghost"
                id="btn-setting-choose-logo"
                style={{ alignSelf: "flex-start", border: "1.5px solid #cbd5e1", background: "#fff", padding: "10px 18px", fontSize: "var(--pos-text-meta)", fontWeight: "800", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
                onClick={() => document.getElementById('setting-logo-file-input')?.click()}
                variant="outline"
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
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span id="i18n-btn-choose-logo-text">選擇圖片</span>
              </Button>
              <div style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", fontWeight: "500" }} id="i18n-logo-hint">支援 PNG, JPG, WebP 格式（建議正方形 512x512px 以達最佳效果）</div>
            </div>
          </div>
        </Card>
        <Card className="ps-grid ps-gap-3">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#0f172a" }} id="i18n-setting-announcement-title">門市公告設定</div>
              <div style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", marginTop: "2px" }} id="i18n-setting-announcement-sub">顯示於顧客點餐頁面橫幅跑馬燈</div>
            </div>
            <Button
              type="button"
              className="btn btn-primary"
              style={{ padding: "8px 16px", fontSize: "var(--pos-text-meta)", borderRadius: "8px", fontWeight: "800" }}
              onClick={() => actions.saveStoreAnnouncementSetting()}
              id="btn-save-announcement-setting"
              variant="default"
            >儲存公告</Button>
          </div>
          <div>
            <Textarea
              id="setting-store-announcement-input"
              className="form-input"
              rows={5}
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: "var(--pos-text-body)", fontWeight: "600", minHeight: "150px", resize: "vertical", fontFamily: "inherit", lineHeight: "1.5" }}
              placeholder="請輸入門市公告（例如：今日特餐全面 9 折 / 國定假日公休公告...）"
            />
          </div>
        </Card>
        <div className="store-notice-editor" id="setting-store-notice-section">
          <div className="store-notice-editor-head">
            <div>
              <div className="store-notice-editor-title" id="i18n-setting-store-notice-title">彈出公告</div>
              <div className="store-notice-editor-sub" id="i18n-setting-store-notice-sub">顧客開啟點餐頁面時以彈出視窗顯示，顧客勾選「已讀」後不再顯示</div>
            </div>
            <div className="store-notice-editor-actions">
              <label className="ui-switch" htmlFor="setting-store-notice-enabled">
                <ChoiceInput type="checkbox" id="setting-store-notice-enabled" defaultChecked onChange={() => actions.renderStoreNoticePreview()} />
                <span className="ui-switch-track">
                  <span className="ui-switch-thumb" />
                </span>
                <span className="ui-switch-label" id="i18n-store-notice-enable">啟用</span>
              </label>
              <Button
                type="button"
                className="btn btn-primary store-notice-save-btn"
                onClick={() => actions.saveStoreNoticeSetting()}
                id="btn-save-store-notice"
                variant="default"
              >儲存彈出公告</Button>
            </div>
          </div>
          <label className="store-notice-field-label" htmlFor="setting-store-notice-title-input" id="i18n-store-notice-title-label">標題</label>
          <Input
            type="text"
            id="setting-store-notice-title-input"
            className="form-input store-notice-input"
            maxLength={80}
            placeholder="例如：國定假日營業時間調整"
            onInput={() => actions.renderStoreNoticePreview()}
          />
          <label className="store-notice-field-label" htmlFor="setting-store-notice-body-input" id="i18n-store-notice-body-label">內容</label>
          <div className="store-notice-toolbar" role="toolbar" aria-labelledby="i18n-store-notice-body-label">
            <Button
              type="button"
              className="store-notice-tool"
              id="btn-store-notice-bold"
              onClick={() => actions.applyStoreNoticeFormat('bold')}
              aria-label="粗體"
              title="粗體"
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
                aria-hidden="true"
              >
                <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
              </svg>
            </Button>
            <Button
              type="button"
              className="store-notice-tool"
              id="btn-store-notice-list"
              onClick={() => actions.applyStoreNoticeFormat('list')}
              aria-label="項目清單"
              title="項目清單"
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
                aria-hidden="true"
              >
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </Button>
            <span className="store-notice-hint" id="i18n-store-notice-format-hint">**文字** 為粗體，行首「- 」為項目清單</span>
          </div>
          <Textarea
            id="setting-store-notice-body-input"
            className="form-input store-notice-input store-notice-textarea"
            rows={7}
            maxLength={2000}
            placeholder="請輸入公告內容"
            onInput={() => actions.renderStoreNoticePreview()}
          />
          <div className="store-notice-field-label" id="i18n-store-notice-preview">顧客端預覽</div>
          <div className="store-notice-preview" id="setting-store-notice-preview" aria-live="polite" />
        </div>
        <Card className="ps-grid ps-gap-3">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#0f172a" }} id="i18n-setting-address-title">門市地址設定</div>
              <div style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", marginTop: "2px" }} id="i18n-setting-address-sub">顯示於顧客點餐頁面頂部導航資訊</div>
            </div>
            <Button
              type="button"
              className="btn btn-primary"
              style={{ padding: "8px 16px", fontSize: "var(--pos-text-meta)", borderRadius: "8px", fontWeight: "800" }}
              onClick={() => actions.saveStoreAddressSetting()}
              id="btn-save-address-setting"
              variant="default"
            >儲存地址</Button>
          </div>
          <div>
            <Input
              type="text"
              id="setting-store-address-input"
              className="form-input"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: "var(--pos-text-body)", fontWeight: "600" }}
              placeholder="請輸入門市地址（例如：新北市土城區中央路二段135號）"
            />
          </div>
        </Card>
      </div>
    </SettingsPanel>
  );
}
