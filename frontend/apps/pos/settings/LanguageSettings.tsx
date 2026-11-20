import { ChoiceInput } from '@shared/ui/choice-input';
import { Button } from '@shared/ui/button';
import { settingsActions as actions } from './settings-actions';
import { SettingsPanel } from './SettingsPanel';

export function LanguageSettings() {
  return (
    <SettingsPanel section="language">
      <div data-slot="card-header">
        <h2 className="settings-card-title" id="i18n-setting-lang-title">介面語言</h2>
        <div style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", fontWeight: "600", marginTop: "2px" }} id="i18n-setting-lang-sub">設定 POS 系統的操作與顯示語言</div>
      </div>
      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <label
          className="setting-mode-card"
          id="lang-card-zh"
          style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", borderRadius: "14px", border: "1.5px solid var(--border)", cursor: "pointer" }}
        >
          <ChoiceInput type="radio" name="pos-language-radio" id="setting-lang-zh" value="zh-TW" onChange={() => actions.selectLanguage('zh-TW')} />
          <div>
            <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#111827" }}>繁體中文 (Traditional Chinese)</div>
            <div style={{ fontSize: "var(--pos-text-meta)", color: "#64748b", marginTop: "2px" }} id="i18n-lang-zh-desc">適合台灣門市與繁體中文操作人員</div>
          </div>
        </label>
        <label
          className="setting-mode-card"
          id="lang-card-vi"
          style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", borderRadius: "14px", border: "1.5px solid var(--border)", cursor: "pointer" }}
        >
          <ChoiceInput type="radio" name="pos-language-radio" id="setting-lang-vi" value="vi" onChange={() => actions.selectLanguage('vi')} />
          <div>
            <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#111827" }}>Tiếng Việt (Vietnamese)</div>
            <div style={{ fontSize: "var(--pos-text-meta)", color: "#64748b", marginTop: "2px" }} id="i18n-lang-vi-desc">Giao diện tiếng Việt chuẩn hóa cho nhân viên quầy và thu ngân</div>
          </div>
        </label>
        <div
          id="setting-customer-locales-section"
          style={{ marginTop: "8px", paddingTop: "18px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "12px" }}
        >
          <div>
            <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-setting-cust-lang-title">顧客菜單與 AI 翻譯語言</div>
            <div
              style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", fontWeight: "600", marginTop: "2px" }}
              id="i18n-setting-cust-lang-sub"
            >選擇顧客端菜單顯示語言切換，以及 AI 自動翻譯的目標語言</div>
          </div>
          <div id="setting-customer-locales-unlocked-body" style={{ display: "none", flexDirection: "column", gap: "12px" }}>
            <label
              className="setting-mode-card is-selected"
              id="cust-lang-card-primary"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", padding: "14px 16px", minHeight: "48px", borderRadius: "14px", border: "1.5px solid var(--border)", background: "#f8fafc", cursor: "default" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <ChoiceInput type="checkbox" id="setting-cust-locale-primary" defaultChecked disabled />
                <div>
                  <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-cust-lang-primary-title">繁體中文（門市預設主語言）</div>
                  <div style={{ fontSize: "var(--pos-text-meta)", color: "#64748b", marginTop: "2px" }} id="i18n-cust-lang-primary-desc">菜單編輯主語言，顧客端永遠包含此語言</div>
                </div>
              </div>
              <span
                id="i18n-cust-lang-primary-badge"
                style={{ fontSize: "12px", fontWeight: "800", padding: "4px 10px", borderRadius: "999px", background: "#e2e8f0", color: "#334155", whiteSpace: "nowrap" }}
              >主語言</span>
            </label>
            <label
              className="setting-mode-card"
              id="cust-lang-card-en"
              style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", minHeight: "48px", borderRadius: "14px", border: "1.5px solid var(--border)", cursor: "pointer" }}
            >
              <ChoiceInput type="checkbox" id="setting-cust-locale-en" value="en" onChange={() => actions.toggleCustomerLocaleCheckbox('en')} />
              <div>
                <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-cust-lang-en-title">English（英文菜單）</div>
                <div style={{ fontSize: "var(--pos-text-meta)", color: "#64748b", marginTop: "2px" }} id="i18n-cust-lang-en-desc">開啟後，顧客可切換英文菜單，POS 與 AI 將支援英文翻譯</div>
              </div>
            </label>
            <label
              className="setting-mode-card"
              id="cust-lang-card-vi"
              style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", minHeight: "48px", borderRadius: "14px", border: "1.5px solid var(--border)", cursor: "pointer" }}
            >
              <ChoiceInput type="checkbox" id="setting-cust-locale-vi" value="vi" onChange={() => actions.toggleCustomerLocaleCheckbox('vi')} />
              <div>
                <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-cust-lang-vi-title">Tiếng Việt（越南文菜單）</div>
                <div style={{ fontSize: "var(--pos-text-meta)", color: "#64748b", marginTop: "2px" }} id="i18n-cust-lang-vi-desc">開啟後，顧客可切換越南文菜單，POS 與 AI 將支援越南文翻譯</div>
              </div>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
              <Button
                type="button"
                className="btn btn-primary"
                id="btn-save-customer-locales"
                onClick={() => actions.saveCustomerSupportedLocalesSetting()}
                style={{ minHeight: "48px", padding: "0 22px", fontWeight: "900" }}
                variant="default"
              >
                <span id="i18n-btn-save-cust-lang">儲存菜單語言設定</span>
              </Button>
            </div>
          </div>
          <div
            id="setting-customer-locales-locked-body"
            style={{ display: "flex", background: "linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)", border: "1.5px dashed #cbd5e1", borderRadius: "12px", padding: "14px 18px", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}
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
                <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#1e1b4b" }} id="i18n-cust-lang-locked-title">多語系菜單與 AI 翻譯套件（未啟用）</div>
                <div
                  style={{ fontSize: "var(--pos-text-meta)", color: "#64748b", lineHeight: "1.4", marginTop: "2px" }}
                  id="i18n-cust-lang-locked-desc"
                >可為顧客提供多語系菜單切換，並使用 AI 一鍵翻譯餐點與客製選項。歡迎聯繫升級套件。</div>
              </div>
            </div>
            <Button
              type="button"
              className="btn btn-primary"
              style={{ minHeight: "48px", padding: "8px 16px", fontSize: "var(--pos-text-meta)", fontWeight: "800", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer", whiteSpace: "nowrap" }}
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
              <span id="i18n-btn-contact-upgrade-i18n">聯繫升級方案</span>
            </Button>
          </div>
        </div>
      </div>
    </SettingsPanel>
  );
}
