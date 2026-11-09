const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

// Mock browser environment
const domElements = {};
function getElementById(id) {
  if (!domElements[id]) {
    domElements[id] = {
      id,
      dataset: {},
      innerText: '',
      innerHTML: '',
      style: {},
      children: [],
      classList: {
        contains: () => false,
        add: () => {},
        remove: () => {}
      },
      getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
      querySelectorAll: () => [],
      querySelector: () => null,
      appendChild: () => {},
      removeAttribute: () => {},
      setAttribute: () => {}
    };
  }
  return domElements[id];
}

const mockDocument = {
  getElementById,
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
  body: {
    appendChild: () => {},
    style: {}
  },
  documentElement: {
    style: { setProperty: () => {} }
  }
};

const sandbox = {
  window: {},
  document: mockDocument,
  console: console,
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },
  sessionStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },
  navigator: { userAgent: 'Node' },
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { search: '', hostname: 'localhost' },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  setTimeout: () => 1,
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  WORKER_BASE: 'https://test-worker',
  URLSearchParams: global.URLSearchParams
};
sandbox.window = sandbox;

const context = vm.createContext(sandbox);

// Load files in order as in index.html
const files = [
  'js/order-code.js',
  'js/client-core.js',
  'js/client-menu.js',
  'js/client-customizations.js',
  'js/client-cart.js',
  'js/line-order-presentation.js',
  'js/client-checkout.js'
];

for (const f of files) {
  const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  vm.runInContext(code, context, { filename: f });
}

console.log('--- Testing Customization Price Calculation ---');

// Mock bootstrap data matching tenant `benmi`
const sampleBootstrap = {
  tenant: {
    id: 'benmi',
    name: 'Benmi Bánh Mì',
    allowDineIn: true,
    features: []
  },
  catalog: [
    {
      slug: 'banh-mi',
      name: '招牌越式麵包',
      allowCustomization: true,
      appliedModifiers: ['*'],
      items: [
        {
          id: 'item_bm_special',
          name: '傳統越式麵包',
          price: 80,
          isOutOfStock: false
        }
      ]
    }
  ],
  modifiers: [
    {
      id: 'mod_extra',
      slug: 'extra-toppings',
      name: '加料選擇',
      selectionType: 'multiple',
      isRequired: false,
      options: [
        { id: 'opt_cheese', name: '加起司', price: 15, isOutOfStock: false },
        { id: 'opt_ham', name: '加火腿', price: 20, isOutOfStock: false }
      ]
    },
    {
      id: 'mod_spicy',
      slug: 'spiciness',
      name: '辣度',
      selectionType: 'single',
      isRequired: true,
      options: [
        { id: 'spicy_no', name: '不辣', price: 0, isDefault: true },
        { id: 'spicy_yes', name: '小辣', price: 0 },
        { id: 'spicy_extra', name: '特製生辣椒', price: 10 }
      ]
    }
  ]
};

// 1. Build modifier price map
context.window.bootstrapData = sampleBootstrap;
context.window.buildModifierPriceMap(sampleBootstrap);

// Test getModifierPrice
assert.strictEqual(context.window.getModifierPrice('加起司'), 15, 'Price for 加起司 should be 15');
assert.strictEqual(context.window.getModifierPrice('起司'), 15, 'Dual lookup for 起司 should be 15');
assert.strictEqual(context.window.getModifierPrice('加火腿'), 20, 'Price for 加火腿 should be 20');
assert.strictEqual(context.window.getModifierPrice('火腿'), 20, 'Dual lookup for 火腿 should be 20');
assert.strictEqual(context.window.getModifierPrice('特製生辣椒'), 10, 'Price for 特製生辣椒 should be 10');
assert.strictEqual(context.window.getModifierPrice('不辣'), 0, 'Price for 不辣 should be 0');
assert.strictEqual(context.window.getModifierPrice('不存在的配料'), 0, 'Unknown modifier price should be 0');

console.log('✅ 1. getModifierPrice dual lookup passed');

// 2. Add item to cart with modifiers
const cartKey = 'banh-mi_傳統越式麵包';
context.window.cart = { [cartKey]: 1 };
context.window.customizeData = {
  [cartKey]: [
    {
      single: { spiciness: '特製生辣椒' },
      multiple: { '加起司': true, '加火腿': true },
      note: '少醬'
    }
  ]
};

// Test updateTotal
const computedTotal = context.window.updateTotal();
// Base price = 80, spicy = 10, cheese = 15, ham = 20 -> Total = 125
assert.strictEqual(computedTotal, 125, `Total should be 125 (80 + 10 + 15 + 20), got ${computedTotal}`);
console.log('✅ 2. updateTotal calculated total:', computedTotal);

// Test calculateCurrentFoodSubtotal
const foodSubtotal = context.window.calculateCurrentFoodSubtotal();
assert.strictEqual(foodSubtotal, 125, `calculateCurrentFoodSubtotal should be 125, got ${foodSubtotal}`);
console.log('✅ 3. calculateCurrentFoodSubtotal calculated:', foodSubtotal);

// Test buildStructuredCartItems
const structured = context.window.buildStructuredCartItems();
assert.strictEqual(structured.length, 1);
const item = structured[0];
assert.strictEqual(item.name, '傳統越式麵包');
assert.strictEqual(item.quantity, 1);
assert.strictEqual(item.price, 80);
assert.strictEqual(item.subtotal, 125, `item.subtotal must include modifiers (125), got ${item.subtotal}`);

const cheeseOption = item.options.find(o => o.choice.includes('加起司'));
assert.ok(cheeseOption, 'Cheese option must be present');
assert.strictEqual(cheeseOption.price, 15, `Cheese option price must be 15, got ${cheeseOption.price}`);

const hamOption = item.options.find(o => o.choice.includes('加火腿'));
assert.ok(hamOption, 'Ham option must be present');
assert.strictEqual(hamOption.price, 20, `Ham option price must be 20, got ${hamOption.price}`);

const spicyOption = item.options.find(o => o.choice.includes('特製生辣椒'));
assert.ok(spicyOption, 'Spicy option must be present');
assert.strictEqual(spicyOption.price, 10, `Spicy option price must be 10, got ${spicyOption.price}`);

console.log('✅ 4. buildStructuredCartItems output:', JSON.stringify(item, null, 2));

// Test formatOrderTextMessage
const textMsg = context.window.formatOrderTextMessage('A01', '2026-09-26', '12:00', computedTotal, '外送請快');
assert.ok(textMsg.includes('加起司 (+$15)'), `Text message should include (+$15): ${textMsg}`);
assert.ok(textMsg.includes('加火腿 (+$20)'), `Text message should include (+$20): ${textMsg}`);
assert.ok(textMsg.includes('特製生辣椒 (+$10)'), `Text message should include (+$10): ${textMsg}`);
assert.ok(textMsg.includes('總金額：$125'), `Text message total must be $125: ${textMsg}`);
console.log('✅ 5. formatOrderTextMessage formatted text:\n', textMsg);

// 3. Multi-portion test (qty = 2, portion 1 has cheese +$15, portion 2 has ham +$20)
context.window.cart = { [cartKey]: 2 };
context.window.customizeData = {
  [cartKey]: [
    {
      single: { spiciness: '不辣' },
      multiple: { '加起司': true },
      note: ''
    },
    {
      single: { spiciness: '不辣' },
      multiple: { '加火腿': true },
      note: ''
    }
  ]
};

const multiPortionTotal = context.window.updateTotal();
// 80 * 2 + 15 + 20 = 195
assert.strictEqual(multiPortionTotal, 195, `Multi-portion total should be 195, got ${multiPortionTotal}`);

const multiStructured = context.window.buildStructuredCartItems();
assert.strictEqual(multiStructured[0].quantity, 2);
assert.strictEqual(multiStructured[0].subtotal, 195, `item.subtotal for 2 qty should be 195, got ${multiStructured[0].subtotal}`);

const multiText = context.window.formatOrderTextMessage('A02', '2026-09-26', '12:00', multiPortionTotal, '');
assert.ok(multiText.includes('第 1 份:') && multiText.indexOf('加起司 (+$15)') < multiText.indexOf('第 2 份:'), `Cheese belongs to portion 1: ${multiText}`);
assert.ok(multiText.includes('第 2 份:') && multiText.indexOf('加火腿 (+$20)') > multiText.indexOf('第 2 份:'), `Ham belongs to portion 2: ${multiText}`);
assert.ok(multiText.includes('總金額：$195'), `Total must be 195: ${multiText}`);
console.log('✅ 6. Multi-portion test passed (Total: $195)');

console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
