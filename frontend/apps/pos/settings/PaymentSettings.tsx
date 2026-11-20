import { Button } from '@shared/ui/button';
import { ChoiceInput } from '@shared/ui/choice-input';
import { settingsActions as actions } from './settings-actions';
import { SettingsPanel } from './SettingsPanel';

export function PaymentSettings() {
  return (
    <SettingsPanel section="payment">
      <div data-slot="card-header" className="settings-panel-actions-header">
        <div>
          <h2 className="settings-card-title" id="i18n-payment-settings-title">付款方式設定</h2>
          <div style={{ fontSize: "var(--pos-text-meta)", color: "var(--muted)", fontWeight: "600", marginTop: "2px" }} id="i18n-payment-settings-sub">自訂顧客在線上點餐時可使用的付款選項</div>
        </div>
        <Button
          className="btn btn-primary"
          style={{ padding: "10px 20px", fontSize: "var(--pos-text-body)", borderRadius: "8px" }}
          onClick={() => actions.savePaymentMethodsSetting()}
          id="btn-save-payment-setting"
          variant="default"
        >儲存設定</Button>
      </div>
      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <label
          className="setting-payment-card"
          id="payment-card-linepay"
          style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px", borderRadius: "14px", border: "1.5px solid var(--border)", cursor: "pointer" }}
        >
          <ChoiceInput
            type="checkbox"
            id="setting-payment-opt-linepay"
            value="line_pay"
            onChange={() => actions.togglePaymentCardStyle('line_pay')}
            style={{ marginTop: "2px" }}
          />
          <div style={{ flex: "1" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-payment-opt-linepay-title">LINE Pay (線上付款)</span>
              <span
                id="setting-payment-linepay-badge"
                className="settings-positive-badge"
                style={{ fontSize: "11px", fontWeight: "800", padding: "2px 8px", borderRadius: "99px" }}
              >已啟用</span>
            </div>
            <div style={{ fontSize: "var(--pos-text-meta)", color: "#4b5563", marginTop: "4px", lineHeight: "1.4" }} id="i18n-payment-opt-linepay-sub">顧客可在點餐頁直接以 LINE Pay 完成線上結帳，款項即時入帳。</div>
          </div>
        </label>
        <label
          className="setting-payment-card"
          id="payment-card-cash"
          style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px", borderRadius: "14px", border: "1.5px solid var(--border)", cursor: "pointer" }}
        >
          <ChoiceInput
            type="checkbox"
            id="setting-payment-opt-cash"
            value="cash"
            onChange={() => actions.togglePaymentCardStyle('cash')}
            style={{ marginTop: "2px" }}
          />
          <div style={{ flex: "1" }}>
            <div style={{ fontWeight: "900", fontSize: "var(--pos-text-body)", color: "#111827" }} id="i18n-payment-opt-cash-title">取餐時付款 / 現場結帳（訂單先送出）</div>
            <div style={{ fontSize: "var(--pos-text-meta)", color: "#4b5563", marginTop: "4px", lineHeight: "1.4" }} id="i18n-payment-opt-cash-sub">允許顧客先下單，待抵達門市取餐時再以現金或其他臨櫃方式結帳。</div>
          </div>
        </label>
        <div
          style={{ fontSize: "13px", color: "#4b5563", lineHeight: "1.5", padding: "12px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}
          id="i18n-payment-settings-hint"
        >提示：若僅勾選「LINE Pay」，顧客在點餐頁送出訂單前必須先完成線上付款；若同時勾選「取餐時付款」，顧客可自行選擇線上支付或到店付款。</div>
      </div>
    </SettingsPanel>
  );
}
