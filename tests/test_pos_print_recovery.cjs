const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/printer-service.js', 'utf8');
function fixture(storage = new Map(), tenant = 'fixture') {
  const order = { key: 'order', displayKey: 'F1112-T006', source: 'line', status: 'ACCEPTED' };
  const messages = [];
  const context = { window: { location: { search: `?tenant=${tenant}` } }, document: {},
    URLSearchParams, console: { log() {}, warn() {}, error() {} },
    latestOrders: [order], OrderCode: require('../js/order-code.js'),
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    t: (key, params = {}) => `${key} ${Object.values(params).join(' ')}`,
    showToast: (message, type) => messages.push({ message, type }) };
  vm.runInNewContext(source, context);
  const service = context.window.PrinterService;
  service.saveSettings({ autoPrintNewOrders: true,
    cashier: { enabled: true, interface_type: 'bluetooth', mac_address: '00:11:22:33:44:55' },
    kitchen: { enabled: true, interface_type: 'bluetooth', mac_address: '11:22:33:44:55:66' } });
  return { service, storage, order, messages, context };
}

test('partial success survives restart and retry sends only the selected part', async () => {
  const f = fixture(); const calls = [];
  f.service.printCashierReceipt = async () => calls.push('bill');
  f.service.printKitchenTicket = async () => { throw Object.assign(new Error('busy'), { code: 'BLUETOOTH_CONNECT_FAILED' }); };
  await f.service.handleAcceptedOrder(f.order);
  assert.equal(f.service.isOrderAlreadyPrinted(f.order.key), false);
  assert.deepEqual({ ...f.service.getPrintReports()[0].stations.cashier }, { state: 'sent' });
  assert.deepEqual({ ...f.service.getPrintReports()[0].stations.kitchen }, { state: 'failed' });
  assert.match(f.messages.at(-1).message, /printStationBill/);
  assert.match(f.messages.at(-1).message, /printStationStickers/);
  assert.doesNotMatch(f.messages.at(-1).message, /another|另一台|RFCOMM/);
  const reopened = fixture(f.storage);
  reopened.service.printCashierReceipt = async () => calls.push('bill-again');
  reopened.service.printKitchenTicket = async () => calls.push('stickers');
  await reopened.service.handleAcceptedOrder(reopened.order);
  assert.deepEqual(calls, ['bill'], 'restart never silently retries a partial print');
  await reopened.service.printManual('order', 'kitchen');
  assert.deepEqual(calls, ['bill', 'stickers']);
  assert.equal(reopened.service.isOrderAlreadyPrinted('order'), true);
});

test('an interrupted send becomes uncertain after restart; unsent queued work needs explicit action', () => {
  const f = fixture();
  f.service.savePrintReport(f.order, { autoAttempted: true, stations: { cashier: { state: 'sending' }, kitchen: { state: 'queued' } } });
  const reopened = fixture(f.storage);
  const report = reopened.service.getPrintReports()[0];
  assert.equal(report.stations.cashier.state, 'uncertain');
  assert.equal(report.stations.kitchen.state, 'failed');
  assert.equal(fixture(f.storage, 'other-tenant').service.getPrintReports().length, 0);
});

test('orders keep their bill and stickers together; repeated taps cannot queue the same order twice', async () => {
  const f = fixture(); const calls = []; let release;
  f.service.printCashierReceipt = async order => {
    calls.push(`${order.key}:bill`);
    if (order.key === 'order') await new Promise(resolve => { release = resolve; });
  };
  f.service.printKitchenTicket = async order => calls.push(`${order.key}:stickers`);
  const first = f.service.printDualStation(f.order);
  const second = f.service.printDualStation({ ...f.order, key: 'second' });
  assert.equal((await f.service.printDualStation(f.order)).reason, 'BUSY');
  assert.deepEqual(calls, ['order:bill']);
  release(); await Promise.all([first, second]);
  assert.deepEqual(calls, ['order:bill', 'order:stickers', 'second:bill', 'second:stickers']);
  assert.equal(f.service.isPrinterBusy(), false);
});

test('a failed bitmap releases exactly one queue count while a later bitmap is still active', async () => {
  const f = fixture(); let rejectFirst, releaseSecond;
  const first = f.service.enqueuePrintTask(() => new Promise((_resolve, reject) => { rejectFirst = reject; }));
  const second = f.service.enqueuePrintTask(() => new Promise(resolve => { releaseSecond = resolve; }));
  await Promise.resolve();
  rejectFirst(new Error('offline'));
  await assert.rejects(first);
  await Promise.resolve();
  assert.equal(f.service.activeJobsCount, 1);
  assert.equal(f.service.isPrinterBusy(), true);
  releaseSecond(); await second;
  assert.equal(f.service.activeJobsCount, 0);
});

test('a connect failure after earlier stickers were sent remains uncertain and never retries automatically', async () => {
  const f = fixture(); let attempts = 0;
  f.service.printCashierReceipt = async () => {};
  f.service.printKitchenTicket = async () => {
    attempts++;
    throw Object.assign(new Error('next label disconnected'), { code: 'BLUETOOTH_CONNECT_FAILED', completedCount: 1 });
  };
  await f.service.handleAcceptedOrder(f.order);
  await f.service.handleAcceptedOrder(f.order);
  assert.equal(attempts, 1);
  assert.equal(f.service.getPrintReports()[0].stations.kitchen.state, 'uncertain');
});

test('a bill-only manual print is not whole-order success and does not trigger duplicate auto-print on acceptance', async () => {
  const f = fixture(); const calls = [];
  f.service.printCashierReceipt = async () => calls.push('bill');
  f.service.printKitchenTicket = async () => calls.push('stickers');
  await f.service.printManual('order', 'cashier');
  assert.equal(f.service.isOrderAlreadyPrinted('order'), false);
  await f.service.handleAcceptedOrder(f.order);
  assert.deepEqual(calls, ['bill']);
  await f.service.printManual('order', 'kitchen');
  assert.equal(f.service.isOrderAlreadyPrinted('order'), true);
  assert.deepEqual(calls, ['bill', 'stickers']);
});
