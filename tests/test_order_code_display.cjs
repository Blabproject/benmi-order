const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');
const ts = require('../benmi-worker-official/node_modules/typescript');
const OrderCode = require('../js/order-code.js');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, file);

test('display codes remove tenant prefixes and hashes, preserve dates/types/sequences and unknown references', () => {
  for (const [input, expected] of [
    ['#ZBCF1109-T001', '1109-T001'], ['B0914-D007', '0914-D007'],
    ['52K1109-T1000', '1109-T1000'], ['A_21109-D001', '1109-D001'],
    ['珍寶1109-T001', '1109-T001'],
    ['1109-T001', '1109-T001'], ['  # ZBCF1109-T001 ', '1109-T001'],
    ['48cc482f-01ca-4939-ae70-f2c07c9cb4ce', '48cc482f-01ca-4939-ae70-f2c07c9cb4ce'],
    ['legacy-reference', 'legacy-reference'], ['B1399-T001', 'B1399-T001'], [null, '']
  ]) assert.equal(OrderCode.format(input), expected);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync('js/order-code.js', 'utf8'), context);
  assert.equal(context.OrderCode.format('#ZBCF1109-T001'), OrderCode.format('#ZBCF1109-T001'));
});

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(v => walk(v, visit));
    else walk(child, visit);
  }
}

test('LINE receipts display the short number while progress and append actions retain the original key', () => {
  const { buildOrderFlexMessage } = require('../benmi-worker-official/src/modules/line/templates/order-receipt.ts');
  for (const key of ['ZBCF1109-D001', '48cc482f-01ca-4939-ae70-f2c07c9cb4ce']) {
    const order = Object.freeze({ key, displayKey: 'ZBCF1109-D001', customer: 'Test', time: '12:00',
      total: 85, content: 'Meal', status: 'NEW', diningOption: 'dine_in', tableNumber: 'A1', roundCount: 1 });
    const flex = buildOrderFlexMessage(order, { tenantId: 'fixture', brandName: 'Shop', features: ['dine_in'] }, [{ name: 'Meal', quantity: 1, price: 85 }]);
    const texts = [], refs = [];
    walk(flex, n => { if (n.text) texts.push(n.text); if (n.uri) refs.push(n.uri); if (n.type === 'postback') refs.push(n.data); });
    assert(texts.includes('1109-D001'));
    assert(!texts.some(t => t.includes('ZBCF1109-D001') || t.includes('#1109-D001')));
    assert(refs.some(r => r.includes('order_key=' + encodeURIComponent(key))));
    assert.equal(order.key, key); assert.equal(order.displayKey, 'ZBCF1109-D001');
  }
});

test('LINE status and sold-out cards format labels without changing postback or edit references', () => {
  const status = require('../benmi-worker-official/src/modules/line/templates/order-status.ts');
  const sold = require('../benmi-worker-official/src/modules/line/templates/order-sold-out.ts');
  const key = '48cc482f-01ca-4939-ae70-f2c07c9cb4ce', display = 'ZBCF1109-T001';
  const cards = [status.createTimeChangeFlexBubble(key, '12:30', 'Shop', display),
    sold.createSoldOutItemFlexBubble(key, ['Meal'], 'Shop', display, 'https://order.test/', 'fixture')];
  for (const card of cards) {
    const texts = [], refs = [];
    walk(card, n => { if (n.text) texts.push(n.text); if (n.uri) refs.push(n.uri); if (n.data) refs.push(n.data); });
    assert(texts.some(t => t.includes('1109-T001')));
    assert(!texts.some(t => t.includes(display) || t.includes('#1109-T001')));
    assert(refs.some(r => r.includes(key)));
  }
});

test('POS history search finds the displayed number even when the storage key is a UUID', () => {
  const { matchesHistorySearch } = require('../frontend/shared/contracts/history-model.ts');
  const order = Object.freeze({ key: '48cc482f-01ca-4939-ae70-f2c07c9cb4ce', displayKey: 'ZBCF1109-T001' });
  assert.equal(matchesHistorySearch(order, '1109-T001'), true);
  assert.equal(matchesHistorySearch(order, '#1109-T001'), true);
  assert.equal(matchesHistorySearch(order, order.key), true);
  assert.equal(matchesHistorySearch(order, 'missing'), false);
});
