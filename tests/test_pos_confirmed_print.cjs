const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const core = fs.readFileSync('js/orders-core.js', 'utf8');
const live = fs.readFileSync('js/orders-live.js', 'utf8');
const printer = fs.readFileSync('js/printer-service.js', 'utf8');
const refresh = core.slice(core.indexOf('async function fetchOrders()'), core.indexOf('\nfunction renderAll()'));
const update = live.slice(live.indexOf('let autoAcceptingOrders'), live.indexOf('async function reviewAccept('));

function fixture({
  autoPrint = true, autoAccept = false, configured = true, responseStatus = 200,
  beforeAccept = async () => {}, orderFields = {}
} = {}) {
  const storage = new Map();
  const jobs = [];
  const alerts = [];
  const writes = [];
  let order = { key: 'customer-order', status: 'NEW', source: 'line', total: 100,
    content: 'Item', updatedAt: '2026-11-23 12:00:00', ...orderFields };
  let confirmed = false;
  const context = {
    window: { location: { search: '?tenant=print-test' } },
    document: { getElementById: () => null },
    console: { log() {}, warn() {}, error() {} },
    URLSearchParams, AbortController, setTimeout, clearTimeout,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    WORKER_BASE: 'https://example.invalid', getTenantIdFromUrl: () => 'print-test',
    lastOrdersETag: '', latestOrders: [], knownOrderKeys: new Set(), knownOrderRounds: new Map(),
    knownOrderModified: new Set(), unacknowledgedAppends: new Map(), isFirstLoad: true,
    pendingNewOrders: [],
    processingKeys: new Set(), localOverrides: {}, sortByPickupTimeAsc: () => 0,
    renderAll() {}, t: key => key, alert: message => alerts.push(message),
    fetch: async (url, request) => {
      if (request.method === 'POST') {
        const body = JSON.parse(request.body);
        writes.push({ path: new URL(url).pathname, body });
        await beforeAccept();
        if (responseStatus !== 200) return { ok: false, status: responseStatus };
        order = { ...order, status: body.status };
        confirmed = order.status === 'ACCEPTED';
        return Response.json({ success: true, acceptedNow: confirmed });
      }
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => [{ ...order }] };
    }
  };
  vm.createContext(context);
  vm.runInContext(printer, context);
  const service = context.PrinterService = context.window.PrinterService;
  service.saveSettings({ autoPrintNewOrders: autoPrint, autoAcceptNewOrders: autoAccept,
    cashier: { enabled: configured }, kitchen: { enabled: configured } });
  service.printDualStation = async ticket => { jobs.push({ key: ticket.key, status: ticket.status, confirmed }); return {success:true}; };
  vm.runInContext(`let isFetchingOrders = false;\n${refresh}\n${update}`, context);
  return { context, service, jobs, alerts, writes };
}

test('polling new customer orders does not print or consume their print marker', async () => {
  const { context, service, jobs } = fixture();
  await context.fetchOrders();
  await context.fetchOrders();
  await service.handleIncomingOrders(context.latestOrders);
  await service.handleAcceptedOrder(context.latestOrders[0]);
  assert.equal(jobs.length, 0);
  assert.equal(service.isOrderAlreadyPrinted('customer-order'), false);
});

test('customer printing waits for successful staff confirmation and does not repeat on refresh', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { context, service, jobs } = fixture({ beforeAccept: () => gate });
  await context.fetchOrders();
  const accepting = context.updateStatus('customer-order', 'ACCEPTED');
  assert.equal(jobs.length, 0);
  release();
  await accepting;
  await new Promise(setImmediate);
  assert.deepEqual(jobs, [{ key: 'customer-order', status: 'ACCEPTED', confirmed: true }]);
  assert.equal(service.isOrderAlreadyPrinted('customer-order'), true);
  await context.fetchOrders();
  await context.updateStatus('customer-order', 'ACCEPTED');
  assert.equal(jobs.length, 1);
});

test('auto-accept claims a pending order once and prints only after confirmation', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { context, jobs, writes } = fixture({ autoAccept: true, beforeAccept: () => gate });
  await context.fetchOrders();
  await context.fetchOrders();
  assert.deepEqual(writes, [{ path: '/api/orders/auto-accept', body: {
    key: 'customer-order', status: 'ACCEPTED', expectedUpdatedAt: '2026-11-23 12:00:00'
  } }]);
  assert.deepEqual(jobs, []);
  release();
  await new Promise(setImmediate);
  await context.fetchOrders();
  assert.deepEqual(jobs, [{ key: 'customer-order', status: 'ACCEPTED', confirmed: true }]);
  assert.equal(writes.length, 1);
  assert.equal(context.latestOrders[0].status, 'ACCEPTED');
});

test('a lost auto-accept claim is left to the other device without replay or printing', async () => {
  const { context, jobs, writes, alerts } = fixture({ autoAccept: true, responseStatus: 409 });
  await context.fetchOrders();
  await new Promise(setImmediate);
  await context.fetchOrders();
  assert.equal(writes.length, 1);
  assert.deepEqual(jobs, []);
  assert.deepEqual(alerts, []);
  assert.equal(context.localOverrides['customer-order'], undefined);
});

test('auto-accept leaves later rounds and modified orders for review and requires a configured printer', async () => {
  for (const mode of [
    { configured: false }, { autoPrint: false }, { orderFields: { is_modified: 1 } },
    { orderFields: { roundCount: 2 } }, { orderFields: { status: 'WAITING_CUSTOMER_CHANGE' } }
  ]) {
    const { context, writes } = fixture({ autoAccept: true, ...mode });
    await context.fetchOrders();
    assert.equal(writes.length, 0);
  }
});

test('failed confirmation, rejection and manual mode do not auto-print', async () => {
  const failed = fixture({ responseStatus: 500 });
  await failed.context.fetchOrders();
  await failed.context.updateStatus('customer-order', 'ACCEPTED');
  assert.equal(failed.jobs.length, 0);
  assert.equal(failed.context.localOverrides['customer-order'], undefined);
  assert.deepEqual(failed.alerts, ['processFail']);

  const rejected = fixture();
  await rejected.context.fetchOrders();
  await rejected.context.updateStatus('customer-order', 'REJECTED');
  assert.equal(rejected.jobs.length, 0);

  const manual = fixture({ autoPrint: false });
  await manual.context.fetchOrders();
  await manual.context.updateStatus('customer-order', 'ACCEPTED');
  assert.equal(manual.jobs.length, 0);
  assert.equal(manual.service.isOrderAlreadyPrinted('customer-order'), false);
});

test('printer failures do not undo or report a failed acceptance', async () => {
  const { context, service, alerts } = fixture();
  service.printDualStation = async () => { throw new Error('offline'); };
  await context.fetchOrders();
  await context.updateStatus('customer-order', 'ACCEPTED');
  await new Promise(setImmediate);
  assert.equal(context.localOverrides['customer-order'].status, 'ACCEPTED');
  assert.equal(context.latestOrders[0].status, 'ACCEPTED');
  assert.deepEqual(alerts, []);
  assert.equal(service.isOrderAlreadyPrinted('customer-order'), false);
});

test('a never-settling print cannot block marking the accepted order ready', async () => {
  const { context, service, alerts } = fixture();
  service.printDualStation = () => new Promise(() => {});
  await context.fetchOrders();
  assert.equal(await context.updateStatus('customer-order', 'ACCEPTED'), true);
  assert.equal(context.processingKeys.size, 0);
  assert.equal(await context.updateStatus('customer-order', 'DONE'), true);
  assert.equal(context.localOverrides['customer-order'].status, 'DONE');
  assert.equal(context.processingKeys.size, 0);
  assert.deepEqual(alerts, []);
});

test('status response timeout releases the lock and refreshes without replaying or printing', async () => {
  const { context, jobs, alerts } = fixture();
  let abort, writes = 0;
  context.setTimeout = callback => { abort = callback; return 1; };
  context.clearTimeout = () => {};
  context.fetch = async (_url, request) => {
    if (request.method === 'POST') {
      writes++;
      return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    }
    return { status: 304 };
  };
  context.latestOrders = [{ key: 'customer-order', source: 'line', status: 'NEW' }];
  const action = context.updateStatus('customer-order', 'ACCEPTED');
  assert.equal(await context.updateStatus('customer-order', 'ACCEPTED'), false);
  abort();
  assert.equal(await action, false);
  assert.equal(context.processingKeys.size, 0);
  assert.equal(writes, 1);
  assert.equal(jobs.length, 0);
  assert.deepEqual(alerts, ['orderStatusUncertain']);
});
