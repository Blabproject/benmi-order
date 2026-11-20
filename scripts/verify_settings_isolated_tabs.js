const fs = require('fs');
const path = require('path');

console.log('=================================================');
console.log('🔍 Verifying Isolated Settings Tabs & Modern UI Controls...');
console.log('=================================================');

const ordersHtml = fs.readFileSync(path.join(__dirname, '../orders.html'), 'utf-8');
const ordersCss = fs.readFileSync(path.join(__dirname, '../css/orders.css'), 'utf-8');
const ordersSettingsJs = fs.readFileSync(path.join(__dirname, '../js/orders-settings.js'), 'utf-8');
const ordersI18nJs = fs.readFileSync(path.join(__dirname, '../js/orders-i18n.js'), 'utf-8');

const settingsBridge = fs.readFileSync(path.join(__dirname, '../frontend/apps/pos/settings-bridge.tsx'), 'utf-8');
const settingsSections = fs.readFileSync(path.join(__dirname, '../frontend/apps/pos/settings-sections.tsx'), 'utf-8');

const readPanel = name => fs.readFileSync(path.join(__dirname, '../frontend/apps/pos/settings', name + '.tsx'), 'utf-8');
const status = readPanel('StoreStatusSettings');
const panel = readPanel('SettingsPanel');
const storeInfo = readPanel('StoreInfoSettings');
const printer = readPanel('PrinterSettings');

let errors = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    errors++;
  } else {
    console.log(`✓ ${message}`);
  }
}

// 1. CSS Verification
assert(
  ordersCss.includes('.settings-card {') &&
  ordersCss.includes('display: none !important;') &&
  ordersCss.includes('.settings-card.active {') &&
  ordersCss.includes('display: flex !important;'),
  'CSS: .settings-card isolated tabs configured (display: none by default, display: flex when .active)'
);

assert(
  ordersCss.includes('.form-input') &&
  ordersCss.includes('.form-select') &&
  ordersCss.includes('.ui-switch') &&
  ordersCss.includes('.ui-switch-track') &&
  ordersCss.includes('.ui-switch-thumb'),
  'CSS: Modern form controls (.form-input, .form-select, .ui-switch, .ui-switch-track/thumb) present'
);

assert(
  ordersCss.includes('.printer-station-card') &&
  ordersCss.includes('.printer-station-header') &&
  ordersCss.includes('.btn-test-print') &&
  ordersCss.includes('.btn-refresh-bt'),
  'CSS: Modern printer station cards and buttons (.printer-station-card, .btn-test-print, .btn-refresh-bt) present'
);

// 2. JS Verification
assert(
  ordersSettingsJs.includes('function switchSettingTab(cardId)'),
  'JS: switchSettingTab(cardId) defined in js/orders-settings.js'
);

assert(
  ordersSettingsJs.includes('card.classList.remove("active")') &&
  ordersSettingsJs.includes('targetCard.classList.add("active")') &&
  ordersSettingsJs.includes('window.syncPOSSettingsView?.()'),
  'JS: switchSettingTab toggles .active class on settings cards and activates TOC item'
);

assert(
  ordersSettingsJs.includes('sessionStorage.setItem("last_settings_tab", targetId)'),
  'JS: switchSettingTab persists active tab to sessionStorage'
);

assert(
  ordersSettingsJs.includes('window.scrollToSettingSection = switchSettingTab'),
  'JS: scrollToSettingSection backward compatibility bridges to switchSettingTab'
);

assert(
  ordersSettingsJs.includes('openSettings()') &&
  ordersSettingsJs.includes('sessionStorage.getItem("last_settings_tab")') &&
  ordersSettingsJs.includes('switchSettingTab(lastTab)'),
  'JS: openSettings() restores last active tab from sessionStorage'
);

// 3. HTML Verification
assert(
  status.includes('<SettingsPanel section="status">') &&
  panel.includes("section === 'status' ? ' active'"),
  'React: Initial setting-card-status has .active class'
);

assert(
  ordersHtml.includes('id="pos-settings-navigation-root"') &&
  settingsBridge.includes('onValueChange={pos.switchSettingTab}') &&
  ['status', 'ordermode', 'hours', 'store-info', 'printer'].every(id => settingsSections.includes(`id: '${id}'`)),
  'React: Settings tabs call switchSettingTab, including the unified store-info panel'
);

assert(
  storeInfo.includes('<SettingsPanel section="store-info">') &&
  storeInfo.includes('id="setting-logo-preview"') &&
  storeInfo.includes('id="setting-store-announcement-input"') &&
  storeInfo.includes('id="setting-store-address-input"'),
  'React: Unified Store Info card contains logo preview, announcement input, and address input'
);

assert(
  printer.includes('id="settings-printer-status-bar"'),
  'React: Printer status pill is available in the Settings panel'
);

assert(
  ordersSettingsJs.includes('printerStatusBar.style.display = (targetId === "setting-card-printer") ? "inline-flex" : "none"') ||
  ordersSettingsJs.includes('(targetId === "setting-card-printer") ? "inline-flex" : "none"'),
  'JS: Printer status pill only visible when printer settings tab is active'
);

assert(
  printer.includes('<PrinterStation station="cashier" />') &&
  printer.includes('<PrinterStation station="kitchen" />') &&
  printer.includes('className="ui-switch"') &&
  printer.includes('<NativeSelect'),
  'React: Both printer stations share a component with native shadcn form controls'
);

// 4. I18N Verification
assert(
  ordersI18nJs.includes('btnTestPrint:') &&
  ordersI18nJs.includes('printerBtRefreshBtn:') &&
  ordersI18nJs.includes('tocStoreInfo:'),
  'I18N: New printer buttons and store-info localized in I18N dictionaries'
);

if (errors > 0) {
  console.error(`\n❌ Total errors: ${errors}`);
  process.exit(1);
} else {
  console.log('\n=================================================');
  console.log('🎉 ALL ISOLATED SETTINGS TABS & UI CHECKS PASSED!');
  console.log('=================================================');
}
