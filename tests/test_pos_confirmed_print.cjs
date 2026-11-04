const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const core = fs.readFileSync('js/orders-core.js', 'utf8');
const live = fs.readFileSync('js/orders-live.js', 'utf8');
const printer = fs.readFileSync('js/printer-service.js', 'utf8');
const refresh = core.slice(core.indexOf('async function fetchOrders()'), core.indexOf('\nfunction renderAll()'));
const update = live.slice(live.indexOf('async function updateStatus('), live.indexOf('async function reviewAccept('));

function fixture({ autoPrint = true, responseStatus = 200, beforeAccept = async () => {} } = {}) {
  const storage = new Map();
  const jobs = [];
  const alerts = [];
  let order = { key: 'customer-order', status: 'NEW', source: 'line', total: 100, content: 'Item' };
  let confirmed = false;
  const context = {
    window: { location: { search: '?tenant=print-test' } },
    document: { getElementById: () => null },
    console: { log() {}, warn() {}, error() {} },
    URLSearchParams, setTimeout, clearTimeout,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    WORKER_BASE: 'https://example.invalid', getTenantIdFromUrl: () => 'print-test',
    lastOrdersETag: '', latestOrders: [], knownOrderKeys: new Set(), knownOrderRounds: new Map(),
    knownOrderModified: new Set(), unacknowledgedAppends: new Map(), isFirstLoad: true,
    processingKeys: new Set(), localOverrides: {}, sortByPickupTimeAsc: () => 0,
    renderAll() {}, t: key => key, alert: message => alerts.push(message),
    fetch: async (_url, request) => {
      if (request.method === 'POST') {
        await beforeAccept();
        if (responseStatus !== 200) return { ok: false, status: responseStatus };
        order = { ...order, status: JSON.parse(request.body).status };
        confirmed = order.status === 'ACCEPTED';
        return { ok: true, status: 200 };
      }
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => [{ ...order }] };
    }
  };
  vm.createContext(context);
  vm.runInContext(printer, context);
  const service = context.PrinterService = context.window.PrinterService;
  service.saveSettings({ autoPrintNewOrders: autoPrint });
  service.printDualStation = async ticket => { jobs.push({ key: ticket.key, status: ticket.status, confirmed }); };
  vm.runInContext(`let isFetchingOrders = false;\n${refresh}\n${update}`, context);
  return { context, service, jobs, alerts };
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
  assert.deepEqual(jobs, [{ key: 'customer-order', status: 'ACCEPTED', confirmed: true }]);
  assert.equal(service.isOrderAlreadyPrinted('customer-order'), true);
  await context.fetchOrders();
  await context.updateStatus('customer-order', 'ACCEPTED');
  assert.equal(jobs.length, 1);
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
  assert.equal(context.localOverrides['customer-order'].status, 'ACCEPTED');
  assert.equal(context.latestOrders[0].status, 'ACCEPTED');
  assert.deepEqual(alerts, []);
  assert.equal(service.isOrderAlreadyPrinted('customer-order'), true);
});
