const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../benmi-worker-official/node_modules/typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText, file);
const P = require('../js/line-order-presentation.js');
const { buildOrderFlexMessage, buildAppendConfirmationFlexMessage } = require('../benmi-worker-official/src/modules/line/templates/order-receipt.ts');
const { createOrderModifiedConfirmationFlexBubble } = require('../benmi-worker-official/src/modules/line/templates/order-sold-out.ts');
const F = require('./fixtures/line-order-layout.cjs');
function texts(node) { return node && typeof node === 'object' ? [node.text || '', ...Object.values(node).filter(v => typeof v === 'object').flatMap(v => Array.isArray(v) ? v.map(texts) : [texts(v)])].flat(Infinity).filter(Boolean) : []; }
const text = node => texts(node).join('\n');
function boxes(node) { return !node || typeof node !== 'object' ? [] : [node, ...Object.values(node).filter(v => typeof v === 'object').flatMap(v => Array.isArray(v) ? v.flatMap(boxes) : boxes(v))]; }
const portionBoxes = node => boxes(node).filter(n => n.type === 'box' && n.backgroundColor === '#F8FAFC' && n.contents?.[0]?.text?.match(/^(第 |Phần )/));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const containers = result => result.type === 'receipt-pages' ? result.pages.flatMap(containers) : result.type === 'carousel' ? result.contents : [result];

test('screenshot reproduction: choices and notes stay inside the correct portion in text and Flex', () => {
  const line = F.line();
  const model = P.item({ detailLine: line });
  const flex = buildOrderFlexMessage(F.order({ detailSnapshot: F.snapshot([line]) }));
  const parts = portionBoxes(flex);
  assert.equal(parts.length, 2);
  for (const [i, names] of [['正常', '不加辣', '皮蛋', '少花生粉'], ['加大', '大辣', '泡菜', '泡菜另外放']].entries()) {
    names.forEach(name => assert.ok(text(parts[i]).includes(name), name));
  }
  assert.ok(!text(parts[0]).includes('泡菜'));
  assert.ok(!text(parts[1]).includes('皮蛋'));
  assert.equal(text(flex).split('分袋').length - 1, 1);
  assert.equal(text(flex).split('全單備註').length - 1, 1);
  assert.equal(text(flex).split('需要筷子').length - 1, 1);
  const message = P.text(model, 'zh-TW');
  assert.equal(message.split('第 1 份').length - 1, 1);
  assert.ok(message.indexOf('皮蛋') < message.indexOf('第 2 份'));
  assert.ok(message.indexOf('泡菜') > message.indexOf('第 2 份'));
});

test('consecutive identical portions merge; source indexes, identity, notes, child prices and quantities matter', () => {
  const first = F.portions()[0];
  const same = { ...structuredClone(first), portionIndex: 1 };
  const merged = P.item({ detailLine: F.line({ portions: [first, same] }) });
  assert.equal(P.runs(merged).length, 1);
  assert.match(P.text(merged), /第 1–2 份 · 相同設定/);
  for (const mutate of [p => p.note += '!', p => p.groups[0].groupId += '!', p => p.groups[0].items[0].optionId += '!',
    p => p.groups[0].items[0].quantity = 2, p => p.groups[0].items[0].surcharge = 1,
    p => p.groups[0].items[0].subOptions = [{ name: '子選項', price: 1 }],
    p => p.groups[0].items[0].groups = [F.group('子群組', ['選擇'])]]) {
    const other = structuredClone(same); mutate(other);
    assert.equal(P.runs(P.item({ detailLine: F.line({ portions: [first, other] }) })).length, 2);
  }
  const middle = F.portions()[1];
  assert.equal(P.runs(P.item({ detailLine: F.line({ quantity: 3, portions: [first, middle, { ...same, portionIndex: 2 }] }) })).length, 3);
});

test('single portions omit the heading; ordinary items without options keep only their quantity', () => {
  const single = P.item({ detailLine: F.line({ quantity: 1, portions: [F.portions()[0]], note: '' }) });
  assert.ok(!P.text(single).includes('第 1 份'));
  assert.equal(portionBoxes(P.flex(single)).length, 0);
  const plain = P.item({ detailLine: F.line({ note: '', portions: [0, 1].map(portionIndex => ({ portionIndex, groups: [], note: '' })) }) });
  assert.equal(P.flex(plain).length, 0);
  assert.equal(P.text(plain).split('\n').length, 1);
});

test('arbitrary groups, repeated choices and nested child choices retain labels and quantities', () => {
  const selected = F.choice('Parent', { quantity: 2, surcharge: 3, subOptions: [{ name: 'Sub', price: 5 }], groups: [F.group('Child group', [F.choice('Child', { quantity: 2, surcharge: 4 })])] });
  const model = P.item({ detailLine: F.line({ quantity: 1, note: '', portions: [{ portionIndex: 0, note: '', groups: [F.group('Any group Z', [selected, F.choice('123'), F.choice('123')])] }] }) });
  const value = text(P.flex(model));
  assert.match(value, /Parent ×2 \(Sub、Child group: Child ×2\)/);
  assert.match(value, /\+\$32/);
  assert.equal(value.split('123').length - 1, 2);
  assert.ok(value.includes('Any group Z'));
});

test('group labels stay left and every selected value shares the right column without forced line breaks', () => {
  const line = F.line({ quantity: 1, portions: [{ portionIndex: 0, note: 'Separate sauce', groups: [
    F.group('Extras', [F.choice('Egg', { surcharge: 15 }), F.choice('Kimchi', { quantity: 2, surcharge: 10 })]),
    F.group('Extras', ['Another group with the same name'])
  ] }] });
  const rendered = P.flex(P.item({ detailLine: line }));
  const portion = rendered.find(n => n.backgroundColor === '#F8FAFC');
  const [first, second, note] = portion.contents;
  assert.equal(first.layout, 'horizontal');
  assert.equal(first.contents.length, 2);
  assert.equal(first.contents[0].text, 'Extras');
  assert.equal(first.contents[1].text, 'Egg (+$15)、Kimchi ×2 (+$20)');
  assert.equal(first.contents[1].text.includes('\n'), false);
  assert.ok(first.contents[0].flex > 0 && first.contents[1].flex > 0);
  assert.equal(first.contents[1].wrap, true, 'Long values wrap naturally inside their column');
  assert.equal(second.contents[1].text, 'Another group with the same name', 'Distinct groups are never merged by label');
  assert.equal(note.layout, 'horizontal');
  assert.equal(note.contents[0].text, '備註');
  assert.equal(note.contents[1].text, 'Separate sauce');
  const textMessage = P.text(P.item({ detailLine: line }));
  assert.ok(textMessage.includes('Extras：Egg (+$15)、Kimchi ×2 (+$20)'));
});

test('item notes appear directly below the item name and before all portion boxes', () => {
  const model = P.item({ detailLine: F.line() });
  const rendered = P.flex(model);
  assert.equal(rendered[0].layout, 'horizontal');
  assert.equal(rendered[0].contents[0].text, '品項備註');
  assert.equal(rendered[0].contents[1].text, '分袋');
  assert.equal(portionBoxes(rendered).length, 2);
  assert.equal(text(rendered).split('分袋').length - 1, 1);
  const message = P.text(model);
  assert.ok(message.indexOf('品項備註: 分袋') < message.indexOf('第 1 份'));
  const vi = P.flex(model, 'vi');
  assert.equal(vi[0].contents[0].text, 'Ghi chú món');
});

test('legacy bundle shapes and JSON normalize equally, malformed JSON stays visible', () => {
  const p = F.portions();
  const expected = P.text(P.item(F.legacy()));
  for (const raw of [{ portions: p }, p, JSON.stringify({ portions: p }), JSON.stringify(p)])
    assert.equal(P.text(P.item(F.legacy({ bundleSelections: raw }))), expected);
  const groupArray = p[0].groups;
  assert.ok(P.text(P.item(F.legacy({ quantity: 1, bundleSelections: groupArray }))).includes('皮蛋'));
  assert.ok(P.text(P.item(F.legacy({ bundleSelections: '{broken-json' }))).includes('{broken-json'));
  const incomplete = P.item(F.legacy({ quantity: 3 }));
  assert.equal(incomplete.complete, false);
});

test('legacy scoped notes are deduplicated only in their own scope and opaque strings never merge', () => {
  const input = F.legacy({ bundleSelections: null, options: [
    { choice: '第1份: 備註: same' }, { choice: '第2份: 備註: same' }, { choice: '第1份: extra', price: 5 }, { choice: 'common' }
  ], notes: '第1份: same | 第2份: same' });
  const model = P.item(input);
  const msg = P.text(model);
  assert.equal(msg.split('same').length - 1, 2);
  assert.equal(model.common[0], 'common');
  assert.match(msg, /extra \(\+\$5\)/);
  assert.equal(P.runs(model).length, 2);
  for (const options of ['123', '"123"', '{malformed', JSON.stringify([{ choice: 'Free text' }])]) {
    const result = P.text(P.item({ name: 'Tea', quantity: 1, selected_options: options }));
    assert.ok(result.includes(options === JSON.stringify([{ choice: 'Free text' }]) ? 'Free text' : options));
  }
});

test('prices use authoritative subtotal, retain zero and distinguish unknown unit prices', () => {
  assert.deepEqual(P.price({ subtotal: 0, price: 999 }), { amount: 0, unit: false });
  assert.deepEqual(P.price({ price: 0 }), { amount: 0, unit: true });
  assert.equal(P.price({}), null);
  assert.match(P.text(P.item({ name: 'Tea', quantity: 2, price: 50 })), /單價 \$50/);
  const flex = buildOrderFlexMessage(F.order({ total: 0 }), null, [{ name: 'Free', quantity: 2, price: 999, subtotal: 0 }]);
  assert.ok(text(flex).includes('$0'));
  assert.ok(!text(flex).includes('$1998'));
  const discounted = buildOrderFlexMessage(F.order({ total: 100 }), null, [F.legacy()]);
  assert.ok(text(discounted).includes('-$40'));
});

test('snapshot render is immutable, deterministic and independent of catalog names', () => {
  const input = freeze(F.order({ detailSnapshot: F.snapshot() }));
  const before = JSON.stringify(input);
  assert.deepEqual(buildOrderFlexMessage(input), buildOrderFlexMessage(input));
  assert.equal(JSON.stringify(input), before);
  const model = freeze(P.item({ detailLine: input.detailSnapshot.rounds[0].items[0] }));
  assert.equal(P.text(model), P.text(model));
});

test('mixed rounds render in source order and same names in separate rounds never merge', () => {
  const snapshot = F.snapshot();
  snapshot.rounds = [{ ...snapshot.rounds[0], legacyContent: 'Historical block', items: [], groups: [] },
    { ...structuredClone(snapshot.rounds[0]), roundNumber: 2 }, { ...structuredClone(snapshot.rounds[0]), roundNumber: 3 }];
  const flex = buildOrderFlexMessage(F.order({ detailSnapshot: snapshot }));
  const value = text(flex);
  assert.ok(value.indexOf('Historical block') < value.indexOf('素筍飯糰'));
  assert.equal(value.split('Historical block').length - 1, 1);
  assert.equal(value.split('素筍飯糰').length - 1, 2);
  assert.equal(portionBoxes(flex).length, 4);
});

test('legacy append gets the same portion layout and retains round, table and added amount', () => {
  const flex = buildAppendConfirmationFlexMessage(F.order({ tableNumber: '8' }), 'legacy text', 140, 2, null, [F.legacy()]);
  assert.equal(portionBoxes(flex).length, 2);
  assert.ok(text(flex).includes('8 桌'));
  assert.ok(text(flex).includes('+$140'));
});

test('legacy modify retains its confirmation header and displays replacements in separate portions', () => {
  const flex = createOrderModifiedConfirmationFlexBubble('key', 140, 10, 'Store', 'TEST', [F.legacy()]);
  assert.equal(portionBoxes(flex).length, 2);
  assert.ok(text(flex).includes('訂單修改確認'));
  assert.ok(text(flex).includes('更新後金額：$140'));
  assert.ok(!text(portionBoxes(flex)[0]).includes('泡菜'));
});

test('snapshot discounts use committed round values even with paid order-level choices', () => {
  const snapshot = F.snapshot();
  snapshot.rounds[0].groups = [F.group('Extra service', [F.choice('Paid option', { surcharge: 20 })])];
  snapshot.rounds[0].discount = 10;
  snapshot.total = snapshot.rounds[0].total = 150;
  const flex = buildOrderFlexMessage(F.order({ total: 150, detailSnapshot: snapshot }));
  assert.ok(text(flex).includes('-$10'));
  assert.ok(text(flex).includes('$150'));
  assert.ok(text(flex).includes('Extra service: Paid option'));
});

test('zh-TW and vi headings, more than ten portions, Unicode and literal x1 survive', () => {
  const model = P.item({ detailLine: F.line({ quantity: 12, portions: Array.from({ length: 12 }, (_, portionIndex) => ({
    portionIndex, note: `note ${portionIndex}`, groups: [F.group('Tên <&> x1', ['Unicode 🍵 中文'])]
  })) }) });
  assert.match(P.text(model, 'vi'), /Phần 12/);
  assert.match(P.text(model), /第 12 份/);
  assert.ok(text(P.flex(model, 'vi')).includes('Tên <&> x1'));
  assert.ok(text(P.flex(model)).includes('Unicode 🍵 中文'));
});

test('31+ items and large payloads paginate within LINE budgets without dropping items', () => {
  for (const count of [29, 30, 31, 160]) {
    const items = Array.from({ length: count }, (_, i) => F.legacy({ name: `Item ${i} END`, note: 'long note 中文'.repeat(count > 31 ? 50 : 1) }));
    const flex = buildOrderFlexMessage(F.order({ total: count * 140 }), null, items);
    for (const item of items) assert.ok(text(flex).includes(item.name), item.name);
    for (const bubble of containers(flex)) assert.ok(P.bytes(bubble) < 30000, P.bytes(bubble));
    for (const page of flex.pages || [flex]) if (page.type === 'carousel') {
      assert.ok(page.contents.length <= 12); assert.ok(P.bytes(page) < 50000);
    }
  }
});

test('large single-item choices and global notes paginate without losing suffixes', () => {
  const item = F.legacy({ note: 'item-note'.repeat(5000) + 'ITEM-END' });
  const flex = buildOrderFlexMessage(F.order({ note: 'global-note'.repeat(5000) + 'GLOBAL-END' }), null, [item]);
  assert.ok(text(flex).includes('ITEM-END'));
  assert.ok(text(flex).includes('GLOBAL-END'));
  containers(flex).forEach(b => assert.ok(P.bytes(b) < 30000));
});

test('actual checkout groups display text while canonical stored text stays compatible', () => {
  const sandbox = { console, URLSearchParams, window: {}, location: { search: '', hostname: 'localhost' },
    document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    cart: { any_Meal: 2 }, customizeData: { any_Meal: [{ note: 'First note' }, { note: 'Second note' }] }, comboDrinkData: {},
    bootstrapData: { unifiedMenu: true }, storeConfig: {},
    resolveCatalogItem: () => ({ catSlug: 'any', origName: 'Meal', displayName: 'Meal', basePrice: 50, categoryName: 'Any', itemId: 'meal' }) };
  sandbox.window = sandbox; sandbox.bundleCartData = { any_Meal: F.portions() };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('js/order-code.js', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync('js/line-order-presentation.js', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync('js/client-checkout.js', 'utf8'), sandbox);
  const displayed = sandbox.formatOrderTextMessage('key', 'date', 'time', 140, 'Order note');
  const canonical = sandbox.formatOrderTextMessage('key', 'date', 'time', 140, 'Order note', true);
  assert.ok(displayed.includes('第 1 份:'));
  assert.equal(displayed.split('First note').length - 1, 1);
  assert.ok(canonical.includes('第1份 先選米'));
  assert.ok(!canonical.includes('第 1 份:'));
  assert.match(displayed, /訂單編號：key/);
  assert.match(sandbox.formatOrderTextMessage('ZBCF1109-T001', 'date', 'time', 140, ''), /^取餐號碼：1109-T001\n訂單編號：ZBCF1109-T001\n/);
  assert.match(sandbox.formatOrderTextMessage('ZBCF1109-T001', 'date', 'time', 140, '', true), /^訂單編號：ZBCF1109-T001\n/);
  assert.match(displayed, /📦 訂單內容：/);
  assert.match(displayed, /總金額：\$140/);
  assert.ok(sandbox.formatAppendItemsOnlyText().includes('第 2 份:'));
  assert.ok(sandbox.formatAppendItemsOnlyText(true).includes('第2份 先選米'));
});
