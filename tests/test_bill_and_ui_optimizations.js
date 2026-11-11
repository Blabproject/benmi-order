const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// 1. Setup mock canvas & DOM environment
const drawnOperations = [];
const document = {
  createElement(tag) {
    if (tag === 'canvas') {
      const canvas = { width: 0, height: 0, toDataURL: () => 'data:image/png;base64,mock' };
      const context = {
        font: 'normal 24px sans-serif',
        textAlign: 'left',
        textBaseline: 'top',
        fillStyle: '#000',
        strokeStyle: '#000',
        measureText(text) {
          return { width: String(text).length * 16 };
        },
        fillText(text, x, y) {
          drawnOperations.push({ text, x, y, font: context.font, align: context.textAlign });
        },
        fillRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        save() {},
        restore() {},
        setLineDash() {}
      };
      canvas.getContext = () => context;
      return canvas;
    }
    return {};
  },
  getElementById(id) {
    if (domElements[id]) return domElements[id];
    return null;
  },
  querySelectorAll(sel) {
    return [];
  }
};

const domElements = {};
const window = {
  currentTenantBrandName: 'BSC Store',
  Capacitor: null
};

// 2. Load PrinterService
const printerCode = ('(function(){var module;\n' + fs.readFileSync(require.resolve('../js/order-legacy-adapter.js'),'utf8') + '\n})();\n' + fs.readFileSync(require.resolve('../js/printer-service.js'), 'utf8'));
vm.runInNewContext(printerCode, {
  OrderCode: require('../js/order-code.js'),
  window,
  document,
  console,
  URLSearchParams,
  localStorage: { getItem: () => null, setItem: () => {} },
  setTimeout,
  clearTimeout
});

const service = window.PrinterService;
assert(service, "PrinterService should be initialized");

// --- TEST 1: Price calculation x3 in parseOrderItems ---
console.log("Test 1: Price calculation for multi-quantity items");

// Case A: Structured order items (quantity 3, unit_price 95)
const structuredOrder = {
  key: "ORD-001",
  items: [
    { name: "招牌牛肉麵", quantity: 3, unit_price: 95 }
  ]
};
const parsedStructured = service.parseOrderItems(structuredOrder, false);
assert.strictEqual(parsedStructured[0].quantity, 3, "Quantity should be 3");
assert.strictEqual(parsedStructured[0].price, "$285", "Price for 3x should be $285 ($95 * 3)");
assert.strictEqual(parsedStructured[0].unitPrice, "$95", "Unit price should be $95");

// Case B: Fallback text content ("3份 x 鮮奶茶 $50")
const textOrder = {
  key: "ORD-002",
  content: "3份 x 鮮奶茶 $50\n   ↳ 第一份: 半糖\n   ↳ 第二份: 微糖\n   ↳ 第三份: 無糖"
};
const parsedText = service.parseOrderItems(textOrder, false);
assert.strictEqual(parsedText[0].quantity, 3, "Quantity should be 3");
assert.strictEqual(parsedText[0].price, "$150", "Price for 3x should be $150 ($50 * 3)");

// Case C: Fallback text with modifier price ("2份 x 烤肉麵包 $80\n   ↳ 第一份: 加蛋 (+$20)")
const textWithAddon = {
  key: "ORD-003",
  content: "2份 x 烤肉麵包 $80\n   ↳ 第一份: 加蛋 (+$20)"
};
const parsedAddon = service.parseOrderItems(textWithAddon, false);
assert.strictEqual(parsedAddon[0].price, "$180", "Total price should be $180 ($80*2 + $20)");
console.log("✅ Test 1 Passed: Multi-quantity price calculates total line price correctly.");

// --- TEST 2: Order Key and Dining Option on Same Line, Right-Aligned ---
console.log("Test 2: Order key and 外帶自取 on same row");
drawnOperations.length = 0;
const testOrder2 = {
  key: "B0912-T001",
  diningOption: "takeaway",
  customer: "張三",
  time: "18:30",
  total: 285,
  items: [
    { name: "招牌麵包", quantity: 3, price: 95 }
  ]
};
service.drawReceiptToCanvas(testOrder2, false, 80);

const keyOp = drawnOperations.find(op => op.text === "0912-T001");
const diningOp = drawnOperations.find(op => op.text === "外帶自取");
assert(keyOp, "Receipt should contain the short code 0912-T001");
assert(!drawnOperations.some(op => String(op.text).includes('#B0912-T001')), "Receipt must not show the tenant prefix or hash");
assert(drawnOperations.some(op => String(op.text).includes('顧客：張三')), "Receipt should keep customer name");
assert.strictEqual(testOrder2.key, "B0912-T001", "Rendering must preserve the original key");
assert(diningOp, "Receipt should contain 外帶自取");
assert.strictEqual(keyOp.y, diningOp.y, "Order key and 外帶自取 MUST be on the exact same row (same y-coordinate)");
assert.strictEqual(diningOp.align, "right", "外帶自取 MUST be right-aligned");
console.log("✅ Test 2 Passed: Order key and 外帶自取 are on the same row, right-aligned.");

// --- TEST 3: Multi-Portion Customization Indentation ---
console.log("Test 3: Multi-portion customization indentation for portions 1, 2, 3");
drawnOperations.length = 0;
const testOrder3 = {
  key: "B0912-002",
  diningOption: "takeaway",
  customer: "李四",
  time: "18:35",
  total: 300,
  content: "3份 x 招牌越式烤肉麵包 $100\n   ↳ 第一份: 大辣, 加辣醬\n   ↳ 第二份: 小辣\n   ↳ 第三份: 不辣"
};
service.drawReceiptToCanvas(testOrder3, false, 80);

const p1 = drawnOperations.find(op => op.text.includes("第一份"));
const p2 = drawnOperations.find(op => op.text.includes("第二份"));
const p3 = drawnOperations.find(op => op.text.includes("第三份"));
assert(p1, "Should render portion 1");
assert(p2, "Should render portion 2");
assert(p3, "Should render portion 3");
assert(p1.text.startsWith("  ↳ "), `Portion 1 should start with '  ↳ ', got '${p1.text}'`);
assert(p2.text.startsWith("  ↳ "), `Portion 2 should start with '  ↳ ', got '${p2.text}'`);
assert(p3.text.startsWith("  ↳ "), `Portion 3 should start with '  ↳ ', got '${p3.text}'`);
console.log("✅ Test 3 Passed: All portions (1, 2, 3) are indented consistently with '  ↳ '.");

// --- TEST 4: Global Menu Customizations (BSC store top-of-menu options) ---
console.log("Test 4: Global menu flavor customization printing");
drawnOperations.length = 0;
const testOrder4 = {
  key: "BSC-001",
  diningOption: "dine_in",
  tableNumber: "05",
  customer: "陳先生",
  time: "19:00",
  total: 250,
  content: "🧂 口味設定：原味・微辣\n  • 配料：加蛋、加起司\n2份 x 炸蛋蔥油餅 $50",
  customizations: [
    { label: "主口味", value: "特製蒜味" },
    { label: "辣度", value: "小辣" }
  ]
};

const extractedFlavors = service.getGlobalCustomizations(testOrder4);
assert.strictEqual(extractedFlavors.length, 2, "Extracted 2 global flavor options");
assert.strictEqual(extractedFlavors[0].value, "特製蒜味");

service.drawReceiptToCanvas(testOrder4, false, 80);
const flavorHeaderOp = drawnOperations.find(op => op.text.includes("【口味與客製設定】"));
assert(flavorHeaderOp, "Receipt should print 【口味與客製設定】 header");
const flavorItemOp = drawnOperations.find(op => op.text.includes("特製蒜味"));
assert(flavorItemOp, "Receipt should print the flavor item");
console.log("✅ Test 4 Passed: Global menu flavor customizations are printed on the bill.");

// --- TEST 5: Settings Panel UI Title Synchronization ---
console.log("Test 5: Settings sub-setting title synchronization");

// Load orders-settings.js
const settingsCode = fs.readFileSync(require.resolve('../js/orders-settings.js'), 'utf8');
const settingsDom = {
  "i18n-settings-title": { innerText: "系統設定" },
  "setting-card-status": { id: "setting-card-status", classList: { add() {}, remove() {} } },
  "setting-card-printer": { id: "setting-card-printer", classList: { add() {}, remove() {} } },
  "toc-item-status": { id: "toc-item-status", classList: { add() {}, remove() {} }, querySelector: () => ({ innerText: "門市接單狀態" }) },
  "toc-item-printer": { id: "toc-item-printer", classList: { add() {}, remove() {} }, querySelector: () => ({ innerText: "出單與印表機" }) },
  "settings-scroll-container": { scrollTop: 0 }
};

const settingsContext = {
  window: {
    addEventListener() {},
    getComputedStyle: () => ({ display: 'block' })
  },
  document: {
    getElementById(id) { return settingsDom[id] || null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  },
  console,
  sessionStorage: { setItem() {}, getItem() { return null; } }
};

vm.runInNewContext(settingsCode, settingsContext);
assert(typeof settingsContext.window.switchSettingTab === 'function', "switchSettingTab should be defined");

// Switch to printer card
settingsContext.window.switchSettingTab('setting-card-printer');
assert.strictEqual(settingsDom["i18n-settings-title"].innerText, "出單與印表機", "Settings panel title should update to '出單與印表機'");

// Switch to status card
settingsContext.window.switchSettingTab('setting-card-status');
assert.strictEqual(settingsDom["i18n-settings-title"].innerText, "門市接單狀態", "Settings panel title should update to '門市接單狀態'");

console.log("✅ Test 5 Passed: Settings panel title dynamically updates to active sub-tab title.");

console.log("\n🎉 ALL 5 BILL PRINTING & UI OPTIMIZATION TESTS PASSED SUCCESSFULLY!");
