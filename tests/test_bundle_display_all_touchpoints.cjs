const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('../benmi-worker-official/node_modules/typescript');
const noteModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../benmi-worker-official/src/utils/order-item-notes.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: noteModule.exports });

console.log('=== Running Universal Bundle Display All-Touchpoints Tests ===\n');

// -------------------------------------------------------------
// 1. Test formatItemsToText & extractAllOrderSearchNames
// -------------------------------------------------------------
console.log('1. Testing orders.ts formatItemsToText & extractAllOrderSearchNames...');

const ordersTsPath = path.join(__dirname, '../benmi-worker-official/src/modules/orders.ts');
const ordersTsContent = fs.readFileSync(ordersTsPath, 'utf8');

// Lightweight test context for pure TS functions in orders.ts
const tsSandbox = {
  console,
  remainingItemNote: noteModule.exports.remainingItemNote,
  ORDER_INDEX_LATEST: 'order_index:latest',
  MAX_INDEX: 200,
  exports: {}
};
vm.createContext(tsSandbox);

// Extract formatItemsToText implementation
const formatMatch = ordersTsContent.match(/export function formatItemsToText[\s\S]*?\n\}\n/);
assert(formatMatch, 'Should find formatItemsToText in orders.ts');
const extractMatch = ordersTsContent.match(/export function extractAllOrderSearchNames[\s\S]*?\n\}\n/);
assert(extractMatch, 'Should find extractAllOrderSearchNames in orders.ts');

const cleanedCode = (formatMatch[0] + '\n' + extractMatch[0])
  .replace(/export function/g, 'function')
  .replace(/: OrderItemInput\[\]/g, '')
  .replace(/: string\[\]/g, '')
  .replace(/: string/g, '')
  .replace(/<string>/g, '')
  .replace(/!\)/g, ')')
  .replace(/: any\[\]/g, '')
  .replace(/: any/g, '')
  .replace(/: number/g, '');

vm.runInContext(cleanedCode + '\nexports.formatItemsToText = formatItemsToText;\nexports.extractAllOrderSearchNames = extractAllOrderSearchNames;', tsSandbox);

const { formatItemsToText, extractAllOrderSearchNames } = tsSandbox.exports;

// Test with bundle_snapshot_json
const sampleItemsWithSnapshot = [
  {
    name: '雙人豪華套餐',
    quantity: 1,
    subtotal: 350,
    bundle_snapshot_json: JSON.stringify({
      bundleRuleId: 'rule-double-combo',
      portions: [
        {
          portionIndex: 0,
          groups: [
            {
              groupName: '配菜',
              items: [
                { name: '脆皮薯條', quantity: 1, surcharge: 10 },
                { name: '生菜沙拉', quantity: 1, surcharge: 0 }
              ]
            },
            {
              groupName: '飲料',
              items: [
                { name: '冰檸檬紅茶', quantity: 1, surcharge: 5 }
              ]
            }
          ]
        }
      ]
    }),
    options: [{ name: '少冰', price: 0 }]
  }
];

const formattedText = formatItemsToText(sampleItemsWithSnapshot);
console.log('Formatted Order Text:\n' + formattedText);

assert(formattedText.includes('1份 x 雙人豪華套餐'), 'Must have parent item line');
assert(formattedText.includes('↳ 配菜: 脆皮薯條 x1 (+$10)、生菜沙拉 x1'), 'Must format bundle group with surcharge');
assert(formattedText.includes('↳ 飲料: 冰檸檬紅茶 x1 (+$5)'), 'Must format drink group with surcharge');
assert(formattedText.includes('- 少冰'), 'Must include regular options');

// Test search names extraction
const searchNames = extractAllOrderSearchNames(sampleItemsWithSnapshot);
assert(searchNames.includes('雙人豪華套餐'), 'Must include parent name');
assert(searchNames.includes('脆皮薯條'), 'Must include bundle item 1');
assert(searchNames.includes('生菜沙拉'), 'Must include bundle item 2');
assert(searchNames.includes('冰檸檬紅茶'), 'Must include bundle item 3');
console.log('✓ formatItemsToText and extractAllOrderSearchNames passed with bundle_snapshot_json');

// -------------------------------------------------------------
// 2. Test buildOrderFlexMessage in line templates (output verification)
// -------------------------------------------------------------
console.log('\n2. Testing line/templates/order-receipt.ts buildOrderFlexMessage output...');
const lineTsPath = path.join(__dirname, '../benmi-worker-official/src/modules/line.ts');
const lineTsContent = fs.readFileSync(lineTsPath, 'utf8');
assert(lineTsContent.includes('buildOrderFlexMessage'), 'line.ts must export buildOrderFlexMessage');

const orderReceiptTsPath = path.join(__dirname, '../benmi-worker-official/src/modules/line/templates/order-receipt.ts');
const orderReceiptTsContent = fs.readFileSync(orderReceiptTsPath, 'utf8');

const compiledReceipt = ts.transpileModule(orderReceiptTsContent, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

const receiptModule = { exports: {} };
const receiptContext = vm.createContext({
  console,
  require: name => name.includes('order-code') ? require('../js/order-code.js')
    : name.includes('line-order-presentation') ? require('../js/line-order-presentation.js')
    : name.includes('order-item-notes') ? noteModule.exports
    : name === '../../order-detail' ? { DetailView: require('../js/order-detail-view.js') }
    : name.includes('order-legacy-adapter') ? require('../js/order-legacy-adapter.js') : ({}),
  module: receiptModule,
  exports: receiptModule.exports
});
vm.runInContext(compiledReceipt, receiptContext);
const { buildOrderFlexMessage } = receiptModule.exports;
assert(typeof buildOrderFlexMessage === 'function', 'buildOrderFlexMessage must be a function');

const sampleOrder = {
  id: 'ORD-001',
  orderNumber: 'A01',
  dailySeq: 'A01',
  totalAmount: 350,
  finalAmount: 350,
  customerName: 'Test Customer',
  customerPhone: '0912345678',
  diningOption: 'takeaway',
  pickupTime: '12:00',
  items: sampleItemsWithSnapshot
};

const flexOutput = buildOrderFlexMessage(sampleOrder, { brandColor: '#059669' }, sampleItemsWithSnapshot);
const flexJson = JSON.stringify(flexOutput);

assert(flexJson.includes('#F8FAFC'), 'Flex message must render nested bundle box with #F8FAFC slate background');
assert(flexJson.includes('脆皮薯條'), 'Flex message must contain bundle item 脆皮薯條');
assert(flexJson.includes('+$10'), 'Flex message must contain surcharge +$10');
assert(flexJson.includes('冰檸檬紅茶'), 'Flex message must contain drink item 冰檸檬紅茶');
assert(flexJson.includes('+$5'), 'Flex message must contain drink surcharge +$5');
console.log('✓ buildOrderFlexMessage actual output verified for structured bundle display in LINE Flex message');

// -------------------------------------------------------------
// 3. Test POS UI Rendering (orders-live.js, orders-core.js, printer-service.js)
// -------------------------------------------------------------
console.log('\n3. Testing POS UI Rendering (orders-live.js & orders-i18n.js)...');

// Setup mock browser sandbox for POS scripts
const mockWindow = {
  currentTenantBrandName: 'Benmi Test',
  addEventListener() {},
  location: { hostname: 'localhost', search: '', pathname: '/', href: 'http://localhost/' }
};
const mockDocument = {
  documentElement: {
    lang: 'zh-TW',
    style: { setProperty: () => {} }
  },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tag) => ({
    tagName: tag,
    style: {},
    setAttribute: () => {},
    classList: { add: () => {}, remove: () => {}, contains: () => false }
  }),
  addEventListener: () => {}
};

const domSandbox = {
  OrderCode: require('../js/order-code.js'),
  window: mockWindow,
  document: mockDocument,
  console,
  URLSearchParams,
  localStorage: { getItem: () => null, setItem: () => {} },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
};
mockWindow.window = mockWindow;
mockWindow.document = mockDocument;
vm.createContext(domSandbox);

// Load required scripts in sequence
const i18nJs = fs.readFileSync(path.join(__dirname, '../js/orders-i18n.js'), 'utf8');
const coreJs = fs.readFileSync(path.join(__dirname, '../js/orders-core.js'), 'utf8');
const printerJs = ('(function(){var module;\n' + fs.readFileSync(require.resolve('../js/order-legacy-adapter.js'),'utf8') + '\n})();\n' + fs.readFileSync(path.join(__dirname, '../js/printer-service.js'), 'utf8'));
const liveJs = fs.readFileSync(path.join(__dirname, '../js/orders-live.js'), 'utf8');

vm.runInContext(i18nJs, domSandbox);
vm.runInContext(coreJs, domSandbox);
vm.runInContext(printerJs, domSandbox);
vm.runInContext(liveJs, domSandbox);

const { PrinterService, renderItemRowHtml, extractBundleFromItem, renderBundleComponentsHtml, t } = domSandbox.window;

assert(typeof extractBundleFromItem === 'function', 'extractBundleFromItem must be defined');
assert(typeof renderBundleComponentsHtml === 'function', 'renderBundleComponentsHtml must be defined');

// Case A: Structured Order with bundle_snapshot_json
const mockStructuredOrder = {
  key: '260915-T001',
  items: [
    {
      name: '超值雙人套餐',
      quantity: 1,
      unit_price: 350,
      subtotal: 365,
      bundle_snapshot_json: JSON.stringify({
        portions: [
          {
            portionIndex: 0,
            groups: [
              {
                groupName: '主餐搭配',
                items: [{ name: '招牌越式麵包', quantity: 1, surcharge: 0 }]
              },
              {
                groupName: '副食點心',
                items: [{ name: '黃金脆薯', quantity: 1, surcharge: 15 }]
              }
            ]
          }
        ]
      }),
      options: [{ choice: '微辣', price: 0 }],
      notes: '分開裝'
    }
  ]
};

const parsedItems = PrinterService.parseOrderItems(mockStructuredOrder, false);
assert.strictEqual(parsedItems.length, 1);
assert.strictEqual(parsedItems[0].price, '$365', 'Line total subtotal must be preserved');
assert(parsedItems[0].bundleData, 'bundleData must be attached');

const itemHtml = renderItemRowHtml(parsedItems[0], 0, mockStructuredOrder.key);
console.log('\nGenerated POS Item HTML:\n' + itemHtml);

assert(itemHtml.includes('bundle-components-container'), 'Must contain .bundle-components-container');
assert(itemHtml.includes('主餐搭配'), 'Must contain group name 主餐搭配');
assert(itemHtml.includes('招牌越式麵包'), 'Must contain bundle item 招牌越式麵包');
assert(itemHtml.includes('副食點心'), 'Must contain group name 副食點心');
assert(itemHtml.includes('黃金脆薯'), 'Must contain bundle item 黃金脆薯');
assert(itemHtml.includes('+$15'), 'Must contain surcharge (+$15)');
assert(itemHtml.includes('微辣'), 'Must contain separate option chip 微辣 in .review-item-options');
assert(itemHtml.includes('分開裝'), 'Must contain note 分開裝');
console.log('✓ Case A (Structured bundle_snapshot_json) successfully verified on POS card');

// Case B: Legacy Text Fallback (e.g. from order.content)
const legacyFallbackItem = {
  name: '特惠分享餐',
  quantity: 1,
  price: '$280',
  options: '配菜：地瓜球 x1 (+$10)、洋蔥圈 x1\n飲料：無糖綠茶 x1\n不要酸菜',
  note: ''
};

const legacyHtml = renderItemRowHtml(legacyFallbackItem, 0, '260915-T002');
console.log('\nLegacy Fallback POS Item HTML:\n' + legacyHtml);

assert(legacyHtml.includes('bundle-components-container'), 'Legacy fallback must generate .bundle-components-container');
assert(legacyHtml.includes('配菜'), 'Legacy fallback must extract group 配菜');
assert(legacyHtml.includes('地瓜球'), 'Legacy fallback must extract item 地瓜球');
assert(legacyHtml.includes('+$10'), 'Legacy fallback must extract surcharge +$10');
assert(legacyHtml.includes('飲料'), 'Legacy fallback must extract group 飲料');
assert(legacyHtml.includes('無糖綠茶'), 'Legacy fallback must extract item 無糖綠茶');
assert(legacyHtml.includes('不要酸菜'), 'Legacy fallback must keep 不要酸菜 in regular options');
console.log('✓ Case B (Legacy Text Fallback) successfully verified on POS card');

// Case C: Multi-portion bundle (e.g. 2 portions in 1 line)
const multiPortionOrder = {
  key: '260915-T003',
  items: [
    {
      name: '雙人自選餐',
      quantity: 2,
      subtotal: 500,
      bundle_snapshot_json: JSON.stringify({
        portions: [
          {
            portionIndex: 0,
            groups: [
              { groupName: '主餐', items: [{ name: '烤豬肉麵包', quantity: 1, surcharge: 0 }] }
            ]
          },
          {
            portionIndex: 1,
            groups: [
              { groupName: '主餐', items: [{ name: '香茅雞麵包', quantity: 1, surcharge: 10 }] }
            ]
          }
        ]
      })
    }
  ]
};

const multiParsed = PrinterService.parseOrderItems(multiPortionOrder, false);
const multiHtml = renderItemRowHtml(multiParsed[0], 0, multiPortionOrder.key);
assert(multiHtml.includes('第 1 份'), 'Must include portion prefix 第 1 份');
assert(multiHtml.includes('第 2 份'), 'Must include portion prefix 第 2 份');
assert(multiHtml.includes('烤豬肉麵包'), 'Must include portion 1 item');
assert(multiHtml.includes('香茅雞麵包'), 'Must include portion 2 item');
console.log('✓ Case C (Multi-portion bundle) successfully verified on POS card');

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Universal bundle display verified across all touchpoints.\n');
process.exit(0);
