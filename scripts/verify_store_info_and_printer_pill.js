const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('======================================================');
console.log('🧪 Simulating Store Info & Printer Pill in DOM VM...');
console.log('======================================================');

const ordersHtml = fs.readFileSync(path.join(__dirname, '../orders.html'), 'utf-8');
const ordersI18nJs = fs.readFileSync(path.join(__dirname, '../js/orders-i18n.js'), 'utf-8');
const ordersSettingsJs = fs.readFileSync(path.join(__dirname, '../js/orders-settings.js'), 'utf-8');

let errors = 0;
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    errors++;
  } else {
    console.log(`✓ ${message}`);
  }
}

// 1. Verify Structure in HTML
assert(ordersHtml.includes('id="toc-item-store-info"'), 'TOC contains #toc-item-store-info');
assert(!ordersHtml.includes('id="toc-item-address"'), 'Legacy #toc-item-address removed from TOC');
assert(!ordersHtml.includes('id="toc-item-announcement"'), 'Legacy #toc-item-announcement removed from TOC');
assert(!ordersHtml.includes('id="toc-item-logo"'), 'Legacy #toc-item-logo removed from TOC');

assert(ordersHtml.includes('id="setting-card-store-info"'), 'Settings container contains unified #setting-card-store-info');
assert(ordersHtml.includes('id="setting-logo-preview"'), 'Store info contains #setting-logo-preview');
assert(ordersHtml.includes('id="setting-store-announcement-input"'), 'Store info contains #setting-store-announcement-input');
assert(ordersHtml.includes('id="setting-store-address-input"'), 'Store info contains #setting-store-address-input');
assert(ordersHtml.includes('id="btn-save-all-store-info"'), 'Store info contains unified #btn-save-all-store-info');

// Verify printer status bar is located inside setting-card-printer next to btn-open-printer-guide
assert(
  ordersHtml.includes('id="setting-card-printer"') &&
  ordersHtml.includes('id="settings-printer-status-bar"') &&
  ordersHtml.indexOf('id="settings-printer-status-bar"') < ordersHtml.indexOf('id="btn-open-printer-guide"'),
  'Printer status pill is located inside #setting-card-printer next to #btn-open-printer-guide'
);

// Verify the printer title is rendered inside the printer card.
assert(
  ordersHtml.includes('id="i18n-setting-printer-title">出單與印表機</h2>') &&
  !ordersHtml.includes('id="i18n-settings-title"'),
  'The printer card provides the content heading'
);

function createMockCard(id, active) {
  const card = { id, active: Boolean(active) };
  card.classList = {
    add(cls) { if (cls === 'active') card.active = true; },
    remove(cls) { if (cls === 'active') card.active = false; },
    contains(cls) { return cls === 'active' && card.active; }
  };
  return card;
}

// 2. Simulate DOM and switchSettingTab behavior
const mockElements = {
  "settings-printer-status-bar": { style: { display: "none" }, classList: { add: () => {}, remove: () => {} } },
  "setting-card-status": createMockCard("setting-card-status", true),
  "setting-card-store-info": createMockCard("setting-card-store-info", false),
  "setting-card-printer": createMockCard("setting-card-printer", false),
  "toc-item-status": { id: "toc-item-status", classList: { add: () => {}, remove: () => {} } },
  "toc-item-store-info": { id: "toc-item-store-info", classList: { add: () => {}, remove: () => {} } },
  "toc-item-printer": { id: "toc-item-printer", classList: { add: () => {}, remove: () => {} } },
  "setting-logo-preview": { style: {}, src: "" },
  "setting-logo-placeholder": { style: {} },
  "btn-delete-logo-setting": { style: {} },
  "setting-store-address-input": { value: "" },
  "setting-store-announcement-input": { value: "" },
  "brand-logo": { style: {}, src: "./benmi_logo.png" }
};

const mockLocalStorage = {
  data: {
    "tenant_branding_benmi": JSON.stringify({
      logoUrl: "./benmi_logo.png",
      storeAddress: "新北市土城區中央路二段135號",
      announcement: "歡迎光臨！新鮮出爐越式法國麵包"
    })
  },
  getItem(k) { return this.data[k] || null; },
  setItem(k, v) { this.data[k] = v; },
  removeItem(k) { delete this.data[k]; }
};

const mockSessionStorage = {
  data: {},
  getItem(k) { return this.data[k] || null; },
  setItem(k, v) { this.data[k] = v; }
};

const sandbox = {
  window: {},
  addEventListener: () => {},
  document: {
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById(id) { return mockElements[id] || null; },
    querySelectorAll(selector) {
      if (selector === '.settings-card') {
        return [mockElements["setting-card-status"], mockElements["setting-card-store-info"], mockElements["setting-card-printer"]];
      }
      if (selector === '.settings-toc-item') {
        return [mockElements["toc-item-status"], mockElements["toc-item-store-info"], mockElements["toc-item-printer"]];
      }
      return [];
    }
  },
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  getComputedStyle: () => ({ display: 'block' }),
  getTenantIdFromUrl: () => "benmi",
  WORKER_BASE: "https://mock.workers.dev",
  t: (k) => k,
  fetch: async () => ({ ok: false }),
  console: console
};
sandbox.window = sandbox;

vm.createContext(sandbox);

// Load orders-i18n and orders-settings
vm.runInContext(ordersI18nJs, sandbox);
vm.runInContext(ordersSettingsJs, sandbox);

// 3. Test switchSettingTab for non-printer tab (e.g. store-info)
sandbox.switchSettingTab('setting-card-store-info');
assert(
  mockElements["settings-printer-status-bar"].style.display === "none",
  'Printer status pill is HIDDEN when on setting-card-store-info tab'
);
assert(
  mockElements["setting-card-store-info"].active === true,
  'setting-card-store-info is active'
);

// 4. Test switchSettingTab for legacy aliases ('address', 'announcement', 'logo')
sandbox.switchSettingTab('setting-card-address');
assert(
  mockElements["setting-card-store-info"].active === true,
  'Legacy "setting-card-address" maps to setting-card-store-info'
);

sandbox.switchSettingTab('logo');
assert(
  mockElements["setting-card-store-info"].active === true,
  'Legacy alias "logo" maps to setting-card-store-info'
);

// 5. Test switchSettingTab for printer tab
sandbox.switchSettingTab('setting-card-printer');
assert(
  mockElements["settings-printer-status-bar"].style.display === "inline-flex",
  'Printer status pill BECOMES VISIBLE (inline-flex) when on setting-card-printer tab'
);

// Switch back to status tab
sandbox.switchSettingTab('setting-card-status');
assert(
  mockElements["settings-printer-status-bar"].style.display === "none",
  'Printer status pill returns to HIDDEN when switching away from printer tab'
);

// 6. Test preloading from localStorage cache in loadOperatingHours
(async () => {
  await sandbox.loadOperatingHours();

  assert(
    mockElements["setting-store-address-input"].value === "新北市土城區中央路二段135號",
    `Store address preloaded from cache: "${mockElements["setting-store-address-input"].value}"`
  );
  assert(
    mockElements["setting-store-announcement-input"].value === "歡迎光臨！新鮮出爐越式法國麵包",
    `Store announcement preloaded from cache: "${mockElements["setting-store-announcement-input"].value}"`
  );
  assert(
    mockElements["setting-logo-preview"].src === "./benmi_logo.png" &&
    mockElements["setting-logo-preview"].style.display === "block",
    `Store logo preloaded from cache: "${mockElements["setting-logo-preview"].src}"`
  );

  // 7. Test I18N dictionary keys
  const i18nObj = vm.runInContext("I18N", sandbox);
  assert(i18nObj["zh-TW"].tocStoreInfo === "門市基本資訊", 'I18N zh-TW tocStoreInfo present');
  assert(i18nObj["vi"].tocStoreInfo === "Thông tin cửa hàng", 'I18N vi tocStoreInfo present');
  assert(i18nObj["zh-TW"].btnSaveAllStoreInfo === "儲存全部資訊", 'I18N zh-TW btnSaveAllStoreInfo present');
  assert(i18nObj["vi"].btnSaveAllStoreInfo === "Lưu tất cả thông tin", 'I18N vi btnSaveAllStoreInfo present');
  assert(i18nObj["zh-TW"].settingPrinterTitle === "出單與印表機", 'I18N zh-TW settingPrinterTitle is "出單與印表機"');
  assert(i18nObj["vi"].settingPrinterTitle === "Máy in & xuất vé", 'I18N vi settingPrinterTitle is "Máy in & xuất vé"');

  if (errors > 0) {
    console.error(`\n❌ Total errors: ${errors}`);
    process.exit(1);
  } else {
    console.log('\n======================================================');
    console.log('🎉 ALL STORE INFO & PRINTER PILL BEHAVIOR TESTS PASSED!');
    console.log('======================================================');
  }
})();
