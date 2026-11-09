const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== Running Item Customization Note Comprehensive Tests ===\n');

// -------------------------------------------------------------
// 1. Test Client Customizations & Note Length Limit (50 chars)
// -------------------------------------------------------------
console.log('1. Testing client-customizations.js saveCustomNote...');

const custSandbox = {
  window: {},
  customizeData: {},
  currentPopup: null,
  updateTotal: () => {}
};
custSandbox.window = custSandbox;
vm.createContext(custSandbox);

const custJsPath = path.join(__dirname, '../js/client-customizations.js');
const custJsContent = fs.readFileSync(custJsPath, 'utf8');
vm.runInContext(custJsContent, custSandbox);

const { saveCustomNote } = custSandbox;
assert(typeof saveCustomNote === 'function', 'saveCustomNote should be a function');

// Test saving normal note
saveCustomNote('food_chicken', 0, '不要香菜');
assert.strictEqual(custSandbox.customizeData['food_chicken'][0].note, '不要香菜', 'Should save exact note');

// Test saving long note > 50 chars -> trimmed to 50
const longNote = 'A'.repeat(80);
saveCustomNote('food_chicken', 1, longNote);
assert.strictEqual(custSandbox.customizeData['food_chicken'][1].note.length, 50, 'Should trim note to 50 chars');
assert.strictEqual(custSandbox.customizeData['food_chicken'][1].note, 'A'.repeat(50), 'Should match first 50 chars');

console.log('  ✓ saveCustomNote works and strictly enforces 50 characters limit.');

// -------------------------------------------------------------
// 2. Test Client Checkout buildStructuredCartItems & notes saving
// -------------------------------------------------------------
console.log('\n2. Testing client-checkout.js buildStructuredCartItems & note formatting...');

const checkoutSandbox = {
  window: {},
  cart: { 'food_chicken': 2, 'food_tea': 1 },
  customizeData: {
    'food_chicken': [
      { single: { '辣度': '小辣' }, multiple: {}, note: '不要香菜' },
      { single: { '辣度': '中辣' }, multiple: {}, note: '加蔥多一點' }
    ],
    'food_tea': [
      { single: { '甜度': '無糖', '冰塊': '去冰' }, multiple: {}, note: '少珍珠' }
    ]
  },
  comboDrinkData: {},
  bootstrapData: { unifiedMenu: false },
  modPriceMap: {},
  resolveCatalogItem: (key) => {
    if (key === 'food_chicken') {
      return { catSlug: 'chicken', origName: '招牌鹹水雞', displayName: '招牌鹹水雞', basePrice: 150, categoryName: '鹹水雞', itemId: 'item_1' };
    }
    return { catSlug: 'drinks', origName: '特調綠茶', displayName: '特調綠茶', basePrice: 40, categoryName: '飲料', itemId: 'item_2' };
  },
  isItemOutOfStock: () => false,
  zhNumbers: ['第一份', '第二份', '第三份', '第四份', '第五份'],
  document: {
    documentElement: { classList: { remove: () => {} } },
    getElementById: (id) => {
      if (id === 'dinein-table-number') return { value: 'B12' };
      if (id === 'note') return { value: 'Giao trước 12h' };
      return null;
    }
  },
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { search: '' },
  storeConfig: {},
  URLSearchParams,
  console
};
checkoutSandbox.window = checkoutSandbox;
checkoutSandbox.OrderCode = require('../js/order-code.js');
vm.createContext(checkoutSandbox);

const checkoutJsPath = path.join(__dirname, '../js/client-checkout.js');
const checkoutJsContent = fs.readFileSync(checkoutJsPath, 'utf8');
vm.runInContext(checkoutJsContent, checkoutSandbox);

const { buildStructuredCartItems, formatOrderTextMessage, formatAppendItemsOnlyText } = checkoutSandbox;

const structuredItems = buildStructuredCartItems();
assert.strictEqual(structuredItems.length, 2, 'Should have 2 structured items');

// Check item 1 (chicken x2)
const chickenItem = structuredItems.find(it => it.itemId === 'food_chicken');
assert(chickenItem, 'Should find chicken item');
assert.strictEqual(chickenItem.quantity, 2);
assert.strictEqual(chickenItem.notes, '第1份: 不要香菜 | 第2份: 加蔥多一點', 'Item notes summary should format per portion');
assert.strictEqual(chickenItem.note, '第1份: 不要香菜 | 第2份: 加蔥多一點');

// Verify options array has portion notes
const chickenOptions = chickenItem.options;
const p1NoteOpt = chickenOptions.find(o => o.group === '備註' && o.choice.includes('第1份') && o.choice.includes('不要香菜'));
assert(p1NoteOpt, 'Should have portion 1 note in options');
assert(p1NoteOpt.choice.includes('備註: 不要香菜'), 'Should prefix note with 備註:');

const p2NoteOpt = chickenOptions.find(o => o.group === '備註' && o.choice.includes('第2份') && o.choice.includes('加蔥多一點'));
assert(p2NoteOpt, 'Should have portion 2 note in options');
assert(p2NoteOpt.choice.includes('備註: 加蔥多一點'), 'Should prefix note with 備註:');

// Check item 2 (tea x1)
const teaItem = structuredItems.find(it => it.itemId === 'food_tea');
assert(teaItem, 'Should find tea item');
assert.strictEqual(teaItem.quantity, 1);
assert.strictEqual(teaItem.notes, '少珍珠', 'Single item note should not have portion prefix in summary');
assert.strictEqual(teaItem.note, '少珍珠');

const teaNoteOpt = teaItem.options.find(o => o.group === '備註' && o.choice.includes('少珍珠'));
assert(teaNoteOpt, 'Should have note in options for single item');
assert.strictEqual(teaNoteOpt.choice, '備註: 少珍珠', 'Single item choice should be 備註: 少珍珠');

console.log('  ✓ buildStructuredCartItems properly extracts c.note, formats options with 備註: and populates notes column.');

// Check text formats
const textMsg = formatOrderTextMessage('T001', '2026-09-26', '12:30', 340, 'Xin thêm thìa đũa');
assert(textMsg.includes('備註: 不要香菜'), 'formatOrderTextMessage should include 備註: 不要香菜');
assert(textMsg.includes('備註: 加蔥多一點'), 'formatOrderTextMessage should include 備註: 加蔥多一點');
assert(textMsg.includes('備註: 少珍珠'), 'formatOrderTextMessage should include 備註: 少珍珠');
console.log('  ✓ formatOrderTextMessage formats item note with 備註: prefix.');

const appendMsg = formatAppendItemsOnlyText();
assert(appendMsg.includes('備註: 不要香菜'), 'formatAppendItemsOnlyText should include 備註: 不要香菜');
assert(appendMsg.includes('備註: 加蔥多一點'), 'formatAppendItemsOnlyText should include 備註: 加蔥多一點');
assert(appendMsg.includes('備註: 少珍珠'), 'formatAppendItemsOnlyText should include 備註: 少珍珠');
console.log('  ✓ formatAppendItemsOnlyText formats item note with 備註: prefix.');

// -------------------------------------------------------------
// 3. Test POS orders-live.js & printer-service.js
// -------------------------------------------------------------
console.log('\n3. Testing POS review modal & printer service handling...');

const posSandbox = {
  window: {},
  addEventListener: () => {},
  document: {
    addEventListener: () => {},
    documentElement: { lang: 'zh-TW' },
    createElement: () => ({ style: {} }),
    getElementById: () => null
  },
  t: (key) => key,
  POS_SVG: { printer: '', note: '<svg>note</svg>', dineIn: '', takeaway: '', check: '', eye: '' },
  escapeHtml: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  extractBundleFromItem: () => null,
  renderBundleComponentsHtml: () => '',
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { hostname: 'localhost', search: '' },
  URLSearchParams,
  setInterval: () => {},
  clearInterval: () => {},
  setTimeout: () => {},
  clearTimeout: () => {},
  console
};
posSandbox.window = posSandbox;
posSandbox.OrderCode = require('../js/order-code.js');
vm.createContext(posSandbox);

// Load orders-core.js for parsePortionCustomizations
const coreJsPath = path.join(__dirname, '../js/orders-core.js');
const coreJsContent = fs.readFileSync(coreJsPath, 'utf8');
vm.runInContext(coreJsContent, posSandbox);

// Load printer-service.js
const printerJsPath = path.join(__dirname, '../js/printer-service.js');
const printerJsContent = fs.readFileSync(require.resolve('../js/order-legacy-adapter.js'), 'utf8') + '\n' + fs.readFileSync(printerJsPath, 'utf8');
vm.runInContext(printerJsContent, posSandbox);

// Load orders-live.js
const liveJsPath = path.join(__dirname, '../js/orders-live.js');
const liveJsContent = fs.readFileSync(liveJsPath, 'utf8');
vm.runInContext(liveJsContent, posSandbox);

const { PrinterService, renderItemRowHtml } = posSandbox;

// Test PrinterService.parseOrderItems with structured order
const mockOrder = {
  key: '260926-T001',
  diningOption: 'dine_in',
  tableNumber: 'B12',
  items: structuredItems
};

const parsedItems = PrinterService.parseOrderItems(mockOrder, false);
assert.strictEqual(parsedItems.length, 2);

const chickenParsed = parsedItems[0];
assert(chickenParsed.options.includes('第1份: 小辣、備註: 不要香菜'), 'Should contain formatted portion 1 note');
assert(chickenParsed.options.includes('第2份: 中辣、備註: 加蔥多一點'), 'Should contain formatted portion 2 note');
assert.strictEqual(chickenParsed.note, '', 'Notes represented by portion options must not be printed a second time');

// Legacy portions retain their complete lines; do not require the old chip CSS implementation.
const chickenHtml = renderItemRowHtml(chickenParsed, 0, mockOrder.key);
const { Element } = require('./helpers/menu-drawer-dom.cjs');
const chickenRoot = new Element('div');
chickenRoot.innerHTML = chickenHtml;
const notePortions = chickenRoot.querySelectorAll('.detail-portion-block');
assert.strictEqual(notePortions.length, 2, 'Should retain separate legacy portions');
assert(notePortions[0].textContent.includes('不要香菜'), 'First note belongs to first portion');
assert(!notePortions[0].textContent.includes('加蔥多一點'), 'Second note must not leak into first portion');
assert(notePortions[1].textContent.includes('加蔥多一點'), 'Second note belongs to second portion');
assert.strictEqual(chickenRoot.textContent.split('不要香菜').length - 1, 1, 'First note renders exactly once');
assert.strictEqual(chickenRoot.textContent.split('加蔥多一點').length - 1, 1, 'Second note renders exactly once');

// Verify that noteHtml is not duplicated underneath since it is already in portion chips
assert(!chickenHtml.includes('<div class="review-item-note">'), 'Should not redundantly duplicate review-item-note when already shown in chips');

// Test single item (tea)
const teaParsed = parsedItems[1];
const teaHtml = renderItemRowHtml(teaParsed, 1, mockOrder.key);
assert.strictEqual(teaHtml.split('少珍珠').length - 1, 1, 'Single item note renders exactly once');

console.log('  ✓ POS notes retain their portion scope and render without duplication.');

// Test fallback parser for legacy text order containing ↳ with 備註
const legacyOrder = {
  key: '260926-LEGACY',
  content: `
1 x 招牌鹹水雞 $150
  ↳ 第一份: 小辣、備註: 不要香菜
1 x 特調綠茶 $40
  ↳ 甜度: 微糖、備註: 少冰
總金額: $190
  `
};
const legacyParsed = PrinterService.parseOrderItems(legacyOrder, false);
assert.strictEqual(legacyParsed.length, 2, 'Legacy order should parse 2 items');
assert(legacyParsed[0].options.includes('備註: 不要香菜'), 'Legacy fallback should keep ↳ options with 備註');
assert(legacyParsed[1].options.includes('備註: 少冰'), 'Legacy fallback should keep tea note');

console.log('  ✓ PrinterService fallback parsing does not drop ↳ lines containing 備註.');

console.log('\n====================================================');
console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
console.log('====================================================');
