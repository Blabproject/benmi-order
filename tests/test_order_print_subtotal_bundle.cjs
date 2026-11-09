const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const canvases = [];
const document = {
  addEventListener() {},
  createElement() {
    const canvas = { width: 0, height: 0, text: [], toDataURL: () => 'data:image/png;base64,test' };
    const context = new Proxy({}, { get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return text => ({ width: [...text].length * parseFloat(target.font.match(/[\d.]+px/)[0]) * 0.65 });
      if (key === 'fillText') return (text, x, y) => {
        canvas.text.push(text);
      };
      if (key === 'drawImage') return (source, x, y, w, h) => {};
      return () => {};
    }});
    canvas.getContext = () => context;
    canvases.push(canvas);
    return canvas;
  }
};

const window = {
  addEventListener() {},
  currentTenantBrandName: 'Benmi Test',
  location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
};
const sandbox = {
  OrderCode: require('../js/order-code.js'),
  window,
  document,
  console,
  URLSearchParams,
  localStorage: { getItem: () => null },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
};

// Load orders-core.js (for parsePortionCustomizations)
const coreCode = fs.readFileSync(path.join(__dirname, '../js/orders-core.js'), 'utf8');
vm.runInNewContext(coreCode, sandbox);

// Load printer-service.js
const printerCode = ('(function(){var module;\n' + fs.readFileSync(require.resolve('../js/order-legacy-adapter.js'),'utf8') + '\n})();\n' + fs.readFileSync(path.join(__dirname, '../js/printer-service.js'), 'utf8'));
vm.runInNewContext(printerCode, sandbox);

const service = window.PrinterService;
assert(service, "PrinterService should be initialized");

console.log("=================================================");
console.log("🧪 Running Order Print Subtotal & Bundle Snapshot Tests");
console.log("=================================================");

// --- TEST 1: Historical subtotal preservation (Discounted combo, zero-price gift, multi-quantity) ---
console.log("\n[Test 1] Historical subtotal preservation");

const orderWithSubtotal = {
  key: "ORD-HIST-001",
  items: [
    // Item A: Discounted combo: unit_price 150, but sold at discounted subtotal 120
    { item_name: "超值套餐 (Combo)", quantity: 1, unit_price: 150, subtotal: 120 },
    // Item B: Free promotional gift: unit_price 60, but subtotal 0
    { item_name: "開飲贈品 (Gift)", quantity: 1, unit_price: 60, subtotal: 0 },
    // Item C: Multi-quantity with bundle discount: 2x unit_price 95, subtotal 170 (instead of 190)
    { item_name: "烤肉麵包", quantity: 2, unit_price: 95, subtotal: 170 }
  ]
};

const parsed1 = service.parseOrderItems(orderWithSubtotal, false);
assert.strictEqual(parsed1.length, 3);

// Verify Item A: should be exactly $120, unitPrice $150
assert.strictEqual(parsed1[0].price, "$120", "Discounted combo must keep historical subtotal $120");
assert.strictEqual(parsed1[0].unitPrice, "$150", "Unit price should reflect $150");

// Verify Item B: should be $0, unitPrice $60
assert.strictEqual(parsed1[1].price, "$0", "Promotional gift must keep $0 subtotal");
assert.strictEqual(parsed1[1].unitPrice, "$60", "Unit price should reflect $60");

// Verify Item C: should be $170, unitPrice $95
assert.strictEqual(parsed1[2].price, "$170", "Multi-quantity must keep historical subtotal $170");
assert.strictEqual(parsed1[2].unitPrice, "$95", "Unit price should reflect $95");

console.log("  ✓ Item historical subtotals preserved ($120, $0, $170)");

// --- TEST 2: Fallback price calculation when subtotal is null ---
console.log("\n[Test 2] Fallback calculation with option + bundle surcharges when subtotal is null");

const orderWithoutSubtotal = {
  key: "ORD-FALLBACK-002",
  items: [
    {
      item_name: "自選特餐",
      quantity: 2,
      unit_price: 100,
      subtotal: null,
      selected_options: JSON.stringify([
        { group: "加料", choice: "加蛋", price: 20 }
      ]),
      bundle_snapshot_json: JSON.stringify({
        portions: [
          {
            portionIndex: 0,
            groups: [
              { groupName: "升級", items: [{ name: "起司", quantity: 1, surcharge: 15 }] }
            ]
          }
        ]
      })
    }
  ]
};

const parsed2 = service.parseOrderItems(orderWithoutSubtotal, false);
// Expected calculation: 100 * 2 + 20 (option) + 15 (bundle surcharge) = 235
assert.strictEqual(parsed2[0].price, "$235", "Fallback total should sum unit*qty + option surcharge + bundle surcharge");
console.log("  ✓ Fallback calculated line total: $235 (100*2 + 20 + 15)");

// --- TEST 3: Single-portion bundle snapshot rendering ---
console.log("\n[Test 3] Single-portion bundle snapshot rendering into print options");

const singleBundleOrder = {
  key: "ORD-BUNDLE-003",
  items: [
    {
      item_name: "蔬鮮輕食餐盒",
      quantity: 1,
      unit_price: 120,
      subtotal: 125,
      selected_options: JSON.stringify([
        { group: "醬料", choice: "胡麻醬" }
      ]),
      bundle_snapshot_json: JSON.stringify({
        bundleRuleId: "rule-salad-1",
        portions: [
          {
            portionIndex: 0,
            groups: [
              {
                groupName: "配菜",
                items: [
                  { name: "水煮蛋", quantity: 1, surcharge: 0 },
                  { name: "地瓜", quantity: 1, surcharge: 5 }
                ]
              }
            ]
          }
        ]
      })
    }
  ]
};

const parsed3 = service.parseOrderItems(singleBundleOrder, false);
assert.strictEqual(parsed3[0].price, "$125");
assert(parsed3[0].options.includes("胡麻醬"), "Options should include base options (胡麻醬)");
assert(parsed3[0].options.includes("配菜：水煮蛋、地瓜"), "Options should include bundle names without surcharge annotations");
assert(!parsed3[0].options.includes("+$"), "Bundle surcharges must not appear in printed options");
console.log("  ✓ Single bundle options formatted: " + parsed3[0].options);

// --- TEST 4: Multi-portion bundle snapshot rendering & sticker expansion ---
console.log("\n[Test 4] Multi-portion bundle snapshot rendering & TSPL sticker expansion");

const multiBundleOrder = {
  key: "ORD-BUNDLE-004",
  displayKey: "B0915-01",
  diningOption: "takeaway",
  customer: "王小明",
  time: "12:30",
  total: 250,
  items: [
    {
      item_name: "雙人輕食餐",
      quantity: 2,
      unit_price: 120,
      subtotal: 240,
      selected_options: JSON.stringify([
        { group: "辣度", choice: "第1份: 大辣" },
        { group: "辣度", choice: "第2份: 不辣" }
      ]),
      bundle_snapshot_json: JSON.stringify({
        portions: [
          {
            portionIndex: 0,
            groups: [
              { groupName: "配菜", items: [{ name: "生菜", quantity: 1 }, { name: "玉米", quantity: 1 }] }
            ]
          },
          {
            portionIndex: 1,
            groups: [
              { groupName: "配菜", items: [{ name: "花椰菜", quantity: 1 }, { name: "蕃茄", quantity: 1 }] }
            ]
          }
        ]
      })
    }
  ]
};

// 4A: Unexpanded (Cashier bill)
const parsed4Unexpanded = service.parseOrderItems(multiBundleOrder, false);
assert.strictEqual(parsed4Unexpanded.length, 1);
assert(parsed4Unexpanded[0].options.includes("第1份: 大辣、配菜：生菜、玉米"), "Portion 1 should combine spice and bundle items");
assert(parsed4Unexpanded[0].options.includes("第2份: 不辣、配菜：花椰菜、蕃茄"), "Portion 2 should combine spice and bundle items");
console.log("  ✓ Cashier bill options formatted:\n" + parsed4Unexpanded[0].options.split('\n').map(l => '      ' + l).join('\n'));

// 4B: Expanded (Stickers 1/2 and 2/2)
const parsed4Expanded = service.parseOrderItems(multiBundleOrder, true);
assert.strictEqual(parsed4Expanded.length, 2, "2-quantity item should expand into 2 sticker units");
assert.strictEqual(parsed4Expanded[0].unitIndex, 1);
assert.strictEqual(parsed4Expanded[1].unitIndex, 2);

// Check sticker 1 options: should ONLY have portion 1 items
assert(parsed4Expanded[0].options.includes("大辣"), "Sticker 1 should have 大辣");
assert(parsed4Expanded[0].options.includes("配菜：生菜、玉米"), "Sticker 1 should have portion 1 bundle items");
assert(!parsed4Expanded[0].options.includes("花椰菜"), "Sticker 1 must NOT have portion 2 items");

// Check sticker 2 options: should ONLY have portion 2 items
assert(parsed4Expanded[1].options.includes("不辣"), "Sticker 2 should have 不辣");
assert(parsed4Expanded[1].options.includes("配菜：花椰菜、蕃茄"), "Sticker 2 should have portion 2 bundle items");
assert(!parsed4Expanded[1].options.includes("玉米"), "Sticker 2 must NOT have portion 1 items");

console.log("  ✓ Sticker 1 unit options: " + parsed4Expanded[0].options);
console.log("  ✓ Sticker 2 unit options: " + parsed4Expanded[1].options);

// --- TEST 5: Cashier receipt drawing with bundle options ---
console.log("\n[Test 5] Canvas receipt drawing test with bundle options");
canvases.length = 0;
service.drawReceiptToCanvas(multiBundleOrder, false, 80);
assert(canvases.length > 0, "Receipt canvas should be created");
const drawnText = canvases[0].text.join('\n');
assert(drawnText.includes("2 x 雙人輕食餐"), "Receipt text must include item name and quantity");
assert(drawnText.includes("$240"), "Receipt text must include correct historical subtotal $240");
assert(drawnText.includes("生菜、玉米"), "Receipt text must include portion 1 bundle items");
assert(drawnText.includes("花椰菜、蕃茄"), "Receipt text must include portion 2 bundle items");
console.log("  ✓ Receipt canvas correctly rendered subtotal and bundle selections");

// Existing orders can have surcharge annotations embedded in their saved option text.
const savedOptions = [
  { choice: '第1份: 白蘿蔔 (+$20)', price: 20 },
  { choice: '第2份: 地瓜（+$20.50） x2', price: 20.5 }
];
const savedOrder = { total: 240.5, items: [{
  item_name: '套餐', quantity: 2, unit_price: 100,
  selected_options: JSON.stringify(savedOptions), notes: '保留備註 (+$20)'
}] };
const originalOrder = JSON.stringify(savedOrder);
const savedItems = service.parseOrderItems(savedOrder, false);
assert.equal(savedItems[0].price, '$240.5');
assert.equal(savedItems[0].options, '第1份: 白蘿蔔\n第2份: 地瓜 x2');
assert.equal(savedItems[0].note, '保留備註 (+$20)');
assert.equal(JSON.stringify(savedOrder), originalOrder, 'Printing must not change stored order data');
assert(service.parseOrderItems(savedOrder, true).every(item => !item.options.includes('+$')));
assert.equal(service.formatPrintOptions('白蘿蔔 (+$20)、57號地瓜 (大份)'), '白蘿蔔、57號地瓜 (大份)');
const legacy = service.parseOrderItems({ content: '1份 套餐 $100\n↳ 白蘿蔔 (+$20)' }, false);
assert.equal(legacy[0].options, '白蘿蔔');
assert.equal(legacy[0].price, '$120', 'Legacy surcharge calculation must remain unchanged');
const contentFallback = service.parseOrderItems({
  items: [{ item_name: '套餐', quantity: 1, subtotal: 120 }],
  content: '1份 套餐 $100\n↳ 白蘿蔔 (+$20)'
}, false);
assert(!contentFallback[0].options.includes('+$'));
canvases.length = 0;
service.drawReceiptToCanvas(singleBundleOrder, false, 80);
assert(!canvases[0].text.join('\n').includes('+$'), 'Receipt drawing must omit bundle surcharge annotations');
assert(canvases[0].text.includes('$125'), 'Receipt drawing must preserve the line total');

console.log("\n=================================================");
console.log("🎉 ALL ORDER PRINT SUBTOTAL & BUNDLE TESTS PASSED!");
console.log("=================================================");
process.exit(0);
