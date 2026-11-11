/**
 * scripts/verify_contact_modal.js
 * Verification test for BLAB Support & Contact Modal Redesign
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log("=================================================");
console.log("🔍 Verifying BLAB Support & Contact Modal Redesign...");
console.log("=================================================");

const ordersHtml = fs.readFileSync(path.join(__dirname, '../orders.html'), 'utf-8');
const posHistoryPanelTsx = fs.readFileSync(path.join(__dirname, '../frontend/apps/pos/PosHistoryPanel.tsx'), 'utf-8');
const historyBridgeTsx = fs.readFileSync(path.join(__dirname, '../frontend/apps/pos/history-bridge.tsx'), 'utf-8');
const modalsJs = fs.readFileSync(path.join(__dirname, '../js/orders-modals.js'), 'utf-8');
const i18nJs = fs.readFileSync(path.join(__dirname, '../js/orders-i18n.js'), 'utf-8');

let errors = 0;
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    errors++;
  } else {
    console.log(`✓ ${message}`);
  }
}

// 1. Check HTML structure of blabContactModal
assert(ordersHtml.includes('id="blabContactModal"'), '#blabContactModal present in orders.html');

const requiredIds = [
  'id="i18n-modal-blab-title"',
  'id="i18n-modal-blab-subtitle"',
  'id="blab-contact-context-banner"',
  'id="blab-context-banner-title"',
  'id="blab-context-banner-desc"',
  'id="i18n-blab-status-online"',
  'id="i18n-btn-modal-blab-line"',
  'id="i18n-blab-upgrade-title"',
  'id="i18n-blab-upgrade-sub"',
  'id="i18n-btn-modal-blab-upgrade"',
  'id="i18n-blab-hours-commitment"',
  'id="i18n-btn-modal-blab-close"'
];

for (const id of requiredIds) {
  assert(ordersHtml.includes(id), `Required semantic element ${id} present in orders.html`);
}

// 2. Check call sites in orders.html
assert(
  ordersHtml.includes('id="tab-support"') && ordersHtml.includes("openBlabContactModal('support')"),
  'tab-support calls openBlabContactModal(\'support\')'
);

assert(
  ordersHtml.includes('id="i18n-btn-contact-upgrade"') && ordersHtml.includes("openBlabContactModal('upgrade')"),
  'Dine-in locked upgrade button calls openBlabContactModal(\'upgrade\')'
);

assert(
  ordersHtml.includes('id="setting-reports-locked-body"') && ordersHtml.includes("openBlabContactModal('upgrade')"),
  'Reports locked upgrade button calls openBlabContactModal(\'upgrade\')'
);

// 3. Check POS History React module for clean SVG icons (No childish emojis)
assert(!posHistoryPanelTsx.includes('📦'), 'Emoji 📦 eliminated from frontend/apps/pos/PosHistoryPanel.tsx');
assert(!posHistoryPanelTsx.includes('💬'), 'Emoji 💬 eliminated from frontend/apps/pos/PosHistoryPanel.tsx');
assert(historyBridgeTsx.includes("openBlabContactModal?.('history')"), 'frontend/apps/pos/history-bridge.tsx calls openBlabContactModal(\'history\')');

// 4. Verify DOM VM logic & I18N
const elements = {};
function getMockElement(id) {
  if (!elements[id]) {
    elements[id] = {
      id,
      innerText: '',
      innerHTML: '',
      style: { display: 'none', background: '', borderColor: '' },
      querySelector: () => null,
      querySelectorAll: () => [],
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      setAttribute() {},
      getAttribute() { return null; }
    };
  }
  return elements[id];
}

const sandbox = {
  document: {
    getElementById(id) {
      return getMockElement(id);
    },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {}
  },
  window: {},
  addEventListener() {},
  removeEventListener() {},
  getTenantIdFromUrl: () => 'test',
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
  console: { log: () => {}, warn: () => {}, error: () => {} },
  setTimeout: (fn) => fn(),
  clearTimeout: () => {}
};

sandbox.window = sandbox;
const context = vm.createContext(sandbox);

vm.runInContext(i18nJs, context);
vm.runInContext(modalsJs, context);

// Test context banner dynamic updates
vm.runInContext("openBlabContactModal('history')", context);
assert(
  getMockElement('blab-context-banner-title').innerText.includes('歷史訂單進階調閱') ||
  getMockElement('blab-context-banner-title').innerText.includes('Tra cứu dữ liệu'),
  `openBlabContactModal('history') banner title set correctly (${getMockElement('blab-context-banner-title').innerText})`
);

vm.runInContext("openBlabContactModal('upgrade')", context);
assert(
  getMockElement('blab-context-banner-title').innerText.includes('方案升級') ||
  getMockElement('blab-context-banner-title').innerText.includes('Mở khóa tính năng'),
  `openBlabContactModal('upgrade') banner title set correctly (${getMockElement('blab-context-banner-title').innerText})`
);

vm.runInContext("openBlabContactModal('support')", context);
assert(
  getMockElement('blab-context-banner-title').innerText.includes('即時專屬支援管道') ||
  getMockElement('blab-context-banner-title').innerText.includes('Kênh kết nối kỹ thuật'),
  `openBlabContactModal('support') banner title set correctly (${getMockElement('blab-context-banner-title').innerText})`
);

// Test I18N switching
vm.runInContext("setLanguage('vi')", context);
assert(
  getMockElement('i18n-modal-blab-title').innerText === 'Hỗ trợ kỹ thuật & Liên hệ BLAB',
  `Vietnamese modal title translated correctly: "${getMockElement('i18n-modal-blab-title').innerText}"`
);
assert(
  getMockElement('i18n-blab-status-online').innerText === 'Trực tuyến',
  `Vietnamese online badge translated correctly: "${getMockElement('i18n-blab-status-online').innerText}"`
);
assert(
  getMockElement('i18n-btn-modal-blab-close').innerText === 'Đóng',
  `Vietnamese close button translated correctly: "${getMockElement('i18n-btn-modal-blab-close').innerText}"`
);

vm.runInContext("setLanguage('zh-TW')", context);
assert(
  getMockElement('i18n-modal-blab-title').innerText === 'BLAB 客服與技術支援',
  `Traditional Chinese modal title translated correctly: "${getMockElement('i18n-modal-blab-title').innerText}"`
);
assert(
  getMockElement('i18n-blab-status-online').innerText === '線上',
  `Traditional Chinese online badge translated correctly: "${getMockElement('i18n-blab-status-online').innerText}"`
);
assert(
  getMockElement('i18n-btn-modal-blab-close').innerText === '關閉',
  `Traditional Chinese close button translated correctly: "${getMockElement('i18n-btn-modal-blab-close').innerText}"`
);

if (errors > 0) {
  console.error(`\n❌ Completed with ${errors} error(s)`);
  process.exit(1);
} else {
  console.log("\n=================================================");
  console.log("🎉 ALL BLAB SUPPORT & CONTACT MODAL TESTS PASSED!");
  console.log("=================================================");
}
