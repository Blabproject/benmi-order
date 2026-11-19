const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const root = path.resolve(__dirname, '..');

function loadCheckoutHarness(initialTaiwanDate) {
  let currentTw = new Date(initialTaiwanDate.getTime());
  const dateEl = { value: '', min: '', addEventListener() {} };
  const timeEl = { value: '', addEventListener() {} };
  const primaryEl = { textContent: '' };
  const secondaryEl = { textContent: '' };

  const elements = {
    'pickup-date': dateEl,
    'pickup-time': timeEl,
    'pickup-display-primary': primaryEl,
    'pickup-display-secondary': secondaryEl
  };

  const sandbox = {
    console,
    Math,
    Date,
    Set,
    Map,
    Array,
    Object,
    Number,
    String,
    Boolean,
    RegExp,
    JSON,
    URLSearchParams,
    location: { search: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    document: {
      body: { style: {}, classList: { add() {}, remove() {}, toggle() {} } },
      documentElement: { style: {}, classList: { add() {}, remove() {}, toggle() {} } },
      getElementById: id => elements[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {}
    },
    window: {},
    storeConfig: {
      storeStatus: 'open',
      prepTimeMinutes: 15,
      allowScheduledPickup: true,
      operatingHours: {
        '0': [{ start: '06:15', end: '13:00' }],
        '1': [{ start: '06:15', end: '13:00' }],
        '2': [{ start: '06:15', end: '13:00' }],
        '3': [{ start: '06:15', end: '13:00' }],
        '4': [{ start: '06:15', end: '13:00' }],
        '5': [{ start: '06:15', end: '13:00' }],
        '6': [{ start: '06:15', end: '13:00' }]
      }
    },
    getTaiwanDate: () => new Date(currentTw.getTime()),
    formatTaiwanDateTime: d => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return { dateStr: `${y}-${m}-${day}`, timeStr: `${hh}:${mm}` };
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/client-checkout.js'), 'utf8'), sandbox, {
    filename: 'js/client-checkout.js'
  });

  return {
    sandbox,
    dateEl,
    timeEl,
    setNow(nextDate) {
      currentTw = new Date(nextDate.getTime());
    }
  };
}

test('Staff pickup time resets back to fresh ASAP after a manual slot and refreshes stale past slots', () => {
  // 2026-11-19 06:25 local
  const h = loadCheckoutHarness(new Date(2026, 10, 19, 6, 25, 0));
  h.sandbox.initPickupTimePicker();
  assert.equal(h.dateEl.value, '2026-11-19');
  assert.equal(h.timeEl.value, '06:40');

  // Staff manually selects 07:00 for one customer
  h.sandbox.pickupTimePickerState.tempDate = '2026-11-19';
  h.sandbox.pickupTimePickerState.tempTime = '07:00';
  h.sandbox.pickupTimePickerState.tempType = 'slot';
  h.sandbox.confirmPickupTimeSelection();
  assert.equal(h.timeEl.value, '07:00');
  assert.equal(h.sandbox.pickupTimePickerState.selectedType, 'slot');

  // While 07:00 is still in the future (at 06:30), refreshPickupTimeIfStale preserves it
  h.setNow(new Date(2026, 10, 19, 6, 30, 0));
  h.sandbox.refreshPickupTimeIfStale();
  assert.equal(h.timeEl.value, '07:00');
  assert.equal(h.sandbox.pickupTimePickerState.selectedType, 'slot');

  // After submitting that order, resetPickupTimeToDefault restores fresh ASAP (06:30 + 15m = 06:45)
  h.sandbox.resetPickupTimeToDefault();
  assert.equal(h.timeEl.value, '06:45');
  assert.equal(h.sandbox.pickupTimePickerState.selectedType, 'asap');
  assert.equal(h.sandbox.isPickupTimeManuallyChanged, false);

  // Later at 08:30, stale ASAP refreshes to 08:45
  h.setNow(new Date(2026, 10, 19, 8, 30, 0));
  h.sandbox.refreshPickupTimeIfStale();
  assert.equal(h.timeEl.value, '08:45');
  assert.equal(h.sandbox.pickupTimePickerState.selectedType, 'asap');

  // Even if a manual slot 07:00 somehow stayed selected until 08:30 (past), refreshPickupTimeIfStale resets it to 08:45
  h.sandbox.pickupTimePickerState.selectedType = 'slot';
  h.sandbox.pickupTimePickerState.selectedTime = '07:00';
  h.timeEl.value = '07:00';
  h.sandbox.refreshPickupTimeIfStale();
  assert.equal(h.timeEl.value, '08:45');
  assert.equal(h.sandbox.pickupTimePickerState.selectedType, 'asap');
});

test('Vite POS bundles and legacy POS scripts avoid ES2021 syntax for Android WebView < 85 compatibility', () => {
  const distAssets = path.join(root, 'dist/assets');
  assert.ok(fs.existsSync(distAssets), 'dist/assets must exist (run npm run build:frontend)');
  const jsBundles = fs.readdirSync(distAssets).filter(f => f.endsWith('.js'));
  assert.ok(jsBundles.length > 0, 'Expected Vite JS bundles in dist/assets');

  for (const file of jsBundles) {
    const code = fs.readFileSync(path.join(distAssets, file), 'utf8');
    acorn.parse(code, { ecmaVersion: 2019, sourceType: 'module' });
    assert.equal(code.includes('.replaceAll('), false, `${file} must not call String.prototype.replaceAll`);
  }

  for (const legacyFile of ['js/printer-service.js', 'js/orders-live.js']) {
    const code = fs.readFileSync(path.join(root, legacyFile), 'utf8');
    acorn.parse(code, { ecmaVersion: 2020, sourceType: 'script' });
  }
});
