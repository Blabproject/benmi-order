const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Element } = require('./helpers/menu-drawer-dom.cjs');
const DetailView = require('../js/order-detail-view.js');

function setup(stickers = true) {
  const doc = { documentElement: { lang: 'vi' }, addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] };
  const context = {
    console, document: doc, addEventListener() {},
    localStorage: { getItem: () => null }, OrderDetailView: DetailView,
    PrinterService: { getPrintCapabilities: () => ({ stickers }) },
    escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ['js/orders-i18n.js', 'js/orders-live.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  const core = fs.readFileSync('js/orders-core.js', 'utf8');
  vm.runInContext(core.slice(core.indexOf('function parsePortionCustomizations('), core.indexOf('window.parsePortionCustomizations =')), context);
  vm.runInContext("currentLang = window.currentLang = 'vi'", context);
  return {
    context,
    parse(html) { const root = new Element('div', doc); root.innerHTML = html; return root; },
  };
}
const choice = (name, quantity = 1, surcharge = 0, extra = {}) => ({ name, quantity, surcharge, groups: [], subOptions: [], ...extra });
const group = (groupName, items) => ({ groupName, groupId: groupName, items });
const line = (extra = {}) => ({ lineId: 'line', itemId: 'meal', name: 'Món <A>', category: 'Items', quantity: 3, unitPrice: 150, subtotal: 465, note: 'Ghi chú riêng của món', portions: [
  { portionIndex: 0, groups: [
    group('Nhóm bất kỳ Z', [choice('Lựa chọn A'), choice('Lựa chọn B', 2, 5)]),
    group('Độ cay', [choice('Ít cay')]), group('Nước sốt', [choice('Để riêng')]), group('Nhóm trống', []),
  ], note: 'Không hành\nĐể riêng' },
  { portionIndex: 1, groups: [group('Nhóm bất kỳ Z', [choice('Khác')])], note: 'Phần thứ hai' },
  { portionIndex: 2, groups: [], note: '' },
], ...extra });

test('snapshot portions keep each arbitrary group and note in separate rows, including empty portions', () => {
  const app = setup(), detailLine = line();
  const root = app.parse(app.context.renderItemRowHtml({ detailLine, name: detailLine.name, quantity: 3, price: '$465', stickerIndex: 4 }, 0, 'order'));
  const portions = root.querySelectorAll('.detail-portion-block');
  assert.equal(portions.length, 3);
  assert.deepEqual(portions.map(p => p.querySelector('.portion-badge').textContent), ['Phần 1', 'Phần 2', 'Phần 3']);
  assert.deepEqual(portions[0].querySelectorAll('.detail-group-label').map(n => n.textContent), ['Nhóm bất kỳ Z', 'Độ cay', 'Nước sốt', 'Ghi chú']);
  assert.equal(portions[0].querySelectorAll('.detail-group-row')[0].querySelectorAll('.detail-choice-chip').length, 2);
  assert.equal(portions[0].querySelector('.detail-note-text').textContent, 'Không hành\nĐể riêng');
  assert.equal(portions[2].querySelector('.portion-default-chip').textContent, '—');
  assert.equal(root.textContent.split('Ghi chú riêng của món').length - 1, 1);
  assert.equal(root.textContent.split('Không hành').length - 1, 1);
  assert.equal(root.querySelector('.review-item-qty-badge').textContent, '3×');
  assert.equal(root.querySelector('.review-item-name-text').textContent, 'Món <A>');
  assert.equal(root.querySelector('.detail-choice-extra').textContent, '+$10');
  assert.match(root.querySelector('.review-item-print-btn').getAttribute('onclick'), /printItemRangeStickers\('order', 4, 3,/);
});

test('single portions omit the badge, nested selections stay with their parent, and printer capability is respected', () => {
  const app = setup(false);
  const selected = choice('Cha', 2, 5, { subOptions: [{ name: 'Kèm theo', price: 1 }], groups: [group('Con', [choice('Lựa chọn con', 1, 2)])] });
  const detailLine = line({ quantity: 1, note: '', portions: [{ portionIndex: 0, note: '', groups: [group('Tùy chọn', [selected])] }] });
  const root = app.parse(app.context.renderItemRowHtml({ detailLine, quantity: 1, name: 'Món', price: '$0', stickerIndex: 2 }, 0, 'order'));
  assert.equal(root.querySelector('.portion-badge'), null);
  assert.match(root.querySelector('.detail-choice-chip').textContent, /Cha.*Lựa chọn con.*Kèm theo/);
  assert.equal(root.querySelector('.detail-choice-qty').textContent, '×2');
  assert.equal(root.querySelector('.detail-choice-extra').textContent, '+$16');
  assert.equal(root.querySelector('.review-item-price').textContent, '$0');
  assert.equal(root.querySelector('.review-item-print-btn').disabled, true);
  assert.match(root.querySelector('.review-item-print-btn').getAttribute('onclick'), /printSingleItemSticker\('order', 2\)/);
});

test('round notes stay outside items, newest rounds display first and sticker indexes retain original order', () => {
  const app = setup();
  const first = line({ quantity: 2, note: 'Món đợt đầu', portions: [{ portionIndex: 0, groups: [], note: 'Phần đầu' }, { portionIndex: 1, groups: [], note: '' }] });
  const second = line({ name: 'Món thêm', lineId: 'added', quantity: 1, note: '', portions: [{ portionIndex: 0, groups: [], note: '' }] });
  const snapshot = { schemaVersion: 1, rounds: [
    { roundNumber: 1, groups: [], note: 'Ghi chú đợt đầu', items: [first] },
    { roundNumber: 2, groups: [], note: 'Ghi chú đợt thêm', items: [second] },
  ] };
  const original = JSON.stringify(snapshot);
  const root = app.parse(app.context.formatContentHtml({ key: 'order', detailSnapshot: snapshot }));
  assert.equal(JSON.stringify(snapshot), original);
  const rounds = root.querySelectorAll('.round-section-block');
  assert.equal(rounds[0].querySelector('.round-section-header').textContent, 'Đợt 2');
  assert.match(rounds[0].querySelector('.review-item-print-btn').getAttribute('onclick'), /printSingleItemSticker\('order', 2\)/);
  assert.match(rounds[1].querySelector('.review-item-print-btn').getAttribute('onclick'), /printItemRangeStickers\('order', 0, 2,/);
  assert.equal(root.textContent.split('Ghi chú đợt đầu').length - 1, 1);
  assert.equal(rounds[1].querySelector('.review-item-row').textContent.includes('Ghi chú đợt đầu'), false);
});

test('unstructured legacy lines are retained without splitting comma-separated values or inventing groups', () => {
  const app = setup();
  const root = app.parse(app.context.renderItemRowHtml({ name: 'Cũ', quantity: 1, price: '$20', options: 'Yêu cầu lạ: A, B、C\nDặn dò riêng', note: '' }, 0, 'legacy'));
  assert.deepEqual(root.querySelector('.review-item-options').querySelectorAll('.mod-chip').map(n => n.textContent), ['Yêu cầu lạ: A, B、C', 'Dặn dò riêng']);
  assert.equal(root.querySelector('.detail-group-label'), null);
});


test('empty note groups and whitespace-only notes do not take up rows in legacy or snapshot details', () => {
  const app = setup();
  const empty = group('✦ Ghi chú dặn dò', []);
  const original = JSON.stringify(empty);
  assert.equal(app.context.renderReviewGroupHtml(empty), '');
  assert.equal(app.context.renderReviewNoteHtml(' \n\t ', 'detailPortionNote'), '');
  const legacy = app.context.renderBundleComponentsHtml({ isStructured: true, portions: [{ groups: [empty, group('Bất kỳ', [choice('Có nội dung')])] }] });
  assert.equal(legacy.includes('Ghi chú dặn dò'), false);
  assert.equal(legacy.includes('Có nội dung'), true);
  const detailLine = line({ quantity: 1, note: '  ', portions: [{ portionIndex: 0, groups: [empty], note: '\t' }] });
  const root = app.parse(app.context.renderItemRowHtml({ detailLine, name: 'Món', quantity: 1, price: '$1' }, 0, 'order'));
  assert.equal(root.querySelector('.detail-group-row'), null);
  assert.equal(root.querySelector('.detail-portion-block'), null);
  assert.equal(JSON.stringify(empty), original);
});


test('legacy portion 3 note is inside its bundle portion, with the correct sticker index', () => {
  const app = setup();
  for (const label of ['第3份', 'Phần 3', '第三份']) {
    const bundleData = { portions: [0, 1, 2].map(portionIndex => ({ portionIndex, groups: [group('Bất kỳ', [choice('Lựa chọn')])] })) };
    const item = { name: 'Combo', quantity: 3, price: '$465', stickerIndex: 4, bundleData,
      baseOptions: `${label}: 備註: Test 3`, note: '' };
    const before = JSON.stringify(item);
    const root = app.parse(app.context.renderItemRowHtml(item, 0, 'legacy'));
    const portions = root.querySelectorAll('.detail-portion-block');
    assert.equal(portions.length, 3);
    assert.equal(portions[0].querySelector('.detail-note-row'), null);
    assert.equal(portions[1].querySelector('.detail-note-row'), null);
    assert.equal(portions[2].querySelector('.detail-note-text').textContent, 'Test 3');
    assert.equal(root.textContent.split('Test 3').length - 1, 1);
    assert.match(portions[2].querySelector('.portion-print-btn').getAttribute('onclick'), /printSingleItemSticker\('legacy', 6\)/);
    assert.equal(JSON.stringify(item), before);
  }
});

test('multi-portion items with no customizations or notes do not render empty portion rows (Phan 1 -)', () => {
  const app = setup();
  // Case 1: Snapshot detailLine with 4 portions, all empty
  const detailLine = line({
    quantity: 4,
    note: '',
    portions: [
      { portionIndex: 0, groups: [], note: '' },
      { portionIndex: 1, groups: [], note: '' },
      { portionIndex: 2, groups: [], note: '' },
      { portionIndex: 3, groups: [], note: '' },
    ]
  });
  const rootSnapshot = app.parse(app.context.renderItemRowHtml({ detailLine, name: '雞胸肉', quantity: 4, price: '$244' }, 0, 'order'));
  assert.equal(rootSnapshot.querySelectorAll('.detail-portion-block').length, 0);
  assert.equal(rootSnapshot.textContent.includes('Phần 1'), false);
  assert.equal(rootSnapshot.textContent.includes('—'), false);

  // Case 2: Legacy options with portions all having default/empty chips
  const legacyItem = {
    name: '雞胸肉',
    quantity: 4,
    price: '$244',
    options: 'Phần 1: —\nPhần 2: —\nPhần 3: —\nPhần 4: —'
  };
  const rootLegacy = app.parse(app.context.renderItemRowHtml(legacyItem, 0, 'order'));
  assert.equal(rootLegacy.querySelectorAll('.detail-portion-block').length, 0);
  assert.equal(rootLegacy.textContent.includes('Phần 1'), false);
});
