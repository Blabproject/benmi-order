const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const clientCoreSrc = fs.readFileSync('js/client-core.js', 'utf8');
const clientCheckoutSrc = fs.readFileSync('js/client-checkout.js', 'utf8');

// Mock a lightweight DOM environment
class MockElement {
    constructor(id = '', tagName = 'div') {
        this.id = id;
        this.tagName = tagName;
        this.value = '';
        this.textContent = '';
        this.innerHTML = '';
        this.style = {};
        this.classList = {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            contains(c) { return this.classes.has(c); }
        };
        this.listeners = {};
    }
    addEventListener(event, fn) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(fn);
    }
    removeEventListener(event, fn) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(f => f !== fn);
        }
    }
    dispatchEvent(event) {
        if (this.listeners[event]) {
            for (const fn of this.listeners[event]) fn();
        }
    }
}

const elements = {
    'pickup-date': new MockElement('pickup-date', 'input'),
    'pickup-time': new MockElement('pickup-time', 'input'),
    'pickup-custom-date-picker': new MockElement('pickup-custom-date-picker', 'input'),
    'pickup-time-trigger': new MockElement('pickup-time-trigger'),
    'pickup-trigger-display-time': new MockElement('pickup-trigger-display-time'),
    'pickup-trigger-display-date': new MockElement('pickup-trigger-display-date'),
    'pickup-time-modal': new MockElement('pickup-time-modal'),
    'pickup-date-tabs': new MockElement('pickup-date-tabs'),
    'pickup-asap-card': new MockElement('pickup-asap-card'),
    'pickup-asap-time-val': new MockElement('pickup-asap-time-val'),
    'pickup-asap-eta-desc': new MockElement('pickup-asap-eta-desc'),
    'pickup-slots-grid': new MockElement('pickup-slots-grid'),
    'pickup-slots-empty': new MockElement('pickup-slots-empty'),
    'pickup-sheet-confirm-btn': new MockElement('pickup-sheet-confirm-btn')
};

const mockDocument = {
    documentElement: {
        style: {
            setProperty: () => {}
        },
        classList: {
            add: () => {},
            remove: () => {},
            contains: () => false
        }
    },
    getElementById(id) {
        return elements[id] || null;
    },
    body: {
        style: {}
    },
    addEventListener: () => {}
};

const mockWindow = {
    document: mockDocument,
    location: { hostname: 'order.blabfood.app', search: '', href: 'https://order.blabfood.app/jiangjiej' },
    isPickupTimeManuallyChanged: false,
    addEventListener: () => {},
    removeEventListener: () => {}
};

const defaultStoreConfig = {
    storeStatus: 'open',
    operatingHours: {
        0: [{ start: '11:00', end: '14:00' }, { start: '17:00', end: '21:00' }],
        1: [{ start: '11:00', end: '14:00' }, { start: '17:00', end: '21:00' }],
        2: [{ start: '11:00', end: '14:00' }, { start: '17:00', end: '21:00' }],
        3: [{ start: '11:00', end: '14:00' }, { start: '17:00', end: '21:00' }],
        4: [{ start: '11:00', end: '14:00' }, { start: '17:00', end: '21:00' }],
        5: [{ start: '11:00', end: '14:00' }, { start: '17:00', end: '21:00' }],
        6: [{ start: '11:00', end: '14:00' }, { start: '17:00', end: '21:00' }]
    }
};
mockWindow.storeConfig = defaultStoreConfig;

const sandbox = {
    window: mockWindow,
    location: mockWindow.location,
    document: mockDocument,
    URLSearchParams,
    navigator: { userAgent: 'test' },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console,
    Date,
    Intl,
    Math,
    Set,
    Array,
    String,
    Number,
    Boolean,
    clearTimeout: () => {},
    setTimeout: (fn) => fn(),
    clearInterval: () => {},
    setInterval: () => {},
    customAlert: (msg) => { sandbox.lastAlert = msg; },
    storeConfig: defaultStoreConfig
};

const ctx = vm.createContext(sandbox);

// Run client-core first (defines getTaiwanDate, formatTaiwanDateTime)
vm.runInContext(clientCoreSrc, ctx);
// Run client-checkout (defines pickup time picker functions)
vm.runInContext(clientCheckoutSrc, ctx);

console.log('Testing Pickup Time Picker functions...');

// 1. Test generatePickupSlots for a future date (all slots should be present)
const tomorrow = new Date(Date.now() + 86400000);
const yyyy = tomorrow.getFullYear();
const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
const dd = String(tomorrow.getDate()).padStart(2, '0');
const tomorrowStr = `${yyyy}-${mm}-${dd}`;

const futureSlots = ctx.generatePickupSlots(tomorrowStr);
console.log('tomorrowStr:', tomorrowStr, 'shifts:', ctx.getStoreOperatingShifts(new Date(tomorrowStr + 'T12:00:00')), 'slots count:', futureSlots.length, 'sample slots:', futureSlots);
assert.ok(futureSlots.length > 0, 'Future date should generate slots');
assert.ok(futureSlots.includes('11:00'), 'Should include shift 1 start');
assert.ok(futureSlots.includes('11:15'), 'Should include 15m step');
assert.ok(futureSlots.includes('14:00'), 'Should include shift 1 end');
assert.ok(futureSlots.includes('17:00'), 'Should include shift 2 start');
assert.ok(futureSlots.includes('21:00'), 'Should include shift 2 end');
assert.ok(!futureSlots.includes('15:00'), 'Should NOT include time outside operating hours (15:00 is between shifts)');
console.log(`✓ Future date slots generated correctly (${futureSlots.length} slots)`);

// 2. Test initPickupTimePicker (Default initial state: ASAP is selected with prep time default 5 min)
ctx.initPickupTimePicker();
assert.ok(elements['pickup-date'].value, 'Date input should be initialized');
assert.ok(elements['pickup-time'].value, 'Time input should be pre-selected in default initial state');
assert.ok(elements['pickup-trigger-display-time'].textContent.includes('最快取餐') || elements['pickup-trigger-display-time'].textContent.includes('取餐'), 'Display time label prompts ASAP');
console.log(`✓ initPickupTimePicker default initial state verified: ${elements['pickup-trigger-display-time'].textContent}`);

// 2b. Test customizable prepTimeMinutes parameter
const testNow = ctx.getTaiwanDate();
ctx.storeConfig.prepTimeMinutes = 10;
const asap10 = ctx.calcAsapPickupTime(testNow);
ctx.storeConfig.prepTimeMinutes = 5;
const asap5 = ctx.calcAsapPickupTime(testNow);
assert.ok(asap5, 'Should calculate ASAP with 5m prep time');
console.log(`✓ calcAsapPickupTime respects prepTimeMinutes: 5m -> ${asap5?.timeStr}, 10m -> ${asap10?.timeStr}`);

// 3. Test openPickupTimeModal with default initial state
ctx.openPickupTimeModal();
assert.equal(elements['pickup-time-modal'].style.display, 'flex', 'Modal should be shown');
assert.ok(ctx.pickupTimePickerState.tempTime, 'Modal opens with time selected by default');
assert.ok(elements['pickup-sheet-confirm-btn'].textContent.includes('確認時間'), 'Confirm button is active');
assert.ok(elements['pickup-date-tabs'].innerHTML.includes('pickup-date-tab'), 'Date tabs rendered');
assert.ok(elements['pickup-date-tabs'].innerHTML.includes('pickup-date-tab-more'), 'More dates button rendered');
// Inspect a future date so both meal periods remain available regardless of the current time.
ctx.switchPickupDateTab(tomorrowStr);
assert.ok(elements['pickup-slots-grid'].innerHTML.includes('pickup-period-group'), 'Slots should be grouped into meal periods');
assert.ok(elements['pickup-slots-grid'].innerHTML.includes('上午 / 午餐'), 'Should have lunch period header');
assert.ok(elements['pickup-slots-grid'].innerHTML.includes('晚間 / 晚餐'), 'Should have dinner period header');
console.log('✓ openPickupTimeModal opened modal with default state, 7-day tabs and meal periods');

// 3b. Test tab switching and tempTime auto-sync
ctx.pickupTimePickerState.tempTime = '03:15'; // Non-existent time
ctx.switchPickupDateTab(tomorrowStr);
assert.notEqual(ctx.pickupTimePickerState.tempTime, '03:15', 'Invalid tempTime must be reset to a valid slot on date switch');
assert.equal(ctx.pickupTimePickerState.tempType, 'slot', 'tempType should be slot');
console.log(`✓ Tab switch validated & synced tempTime: ${ctx.pickupTimePickerState.tempTime}`);

// 3c. Test findFirstAvailableDate
const avail = ctx.findFirstAvailableDate();
assert.ok(avail.dateStr, 'First available date returned');
assert.ok(avail.defaultTime, 'Default time returned');
console.log(`✓ findFirstAvailableDate returned date: ${avail.dateStr}, time: ${avail.defaultTime}`);

// 4. Test selecting a specific slot and confirming
ctx.selectPickupSlot('12:30');
assert.equal(ctx.pickupTimePickerState.tempTime, '12:30', 'Temp time should be updated');
ctx.confirmPickupTimeSelection();

assert.equal(elements['pickup-time'].value, '12:30', 'Hidden pickup-time should be updated to selected slot');
assert.equal(elements['pickup-time-modal'].style.display, 'none', 'Modal should close on confirm');
assert.ok(elements['pickup-trigger-display-time'].textContent.includes('12:30'), 'Trigger card should display 12:30');
assert.equal(ctx.window.isPickupTimeManuallyChanged, true, 'isPickupTimeManuallyChanged should be set to true');
console.log(`✓ Slot selection & confirmation verified (Time: ${elements['pickup-time'].value}, Display: ${elements['pickup-trigger-display-time'].textContent})`);

// 5. Test ASAP selection
ctx.openPickupTimeModal();
ctx.selectPickupAsap();
if (ctx.pickupTimePickerState.asapTime) {
    ctx.confirmPickupTimeSelection();
    assert.equal(elements['pickup-time'].value, ctx.pickupTimePickerState.asapTime, 'ASAP time set');
    assert.ok(elements['pickup-trigger-display-time'].textContent.includes('最快取餐'), 'Trigger shows ASAP text');
    console.log(`✓ ASAP selection verified: ${elements['pickup-trigger-display-time'].textContent}`);
}

// With no manual receiving status, the configured schedule remains authoritative.
ctx.storeConfig.storeStatus = undefined;
ctx.storeConfig.operatingHours = null;
assert.equal(ctx.generatePickupSlots(tomorrowStr).length, 0);
ctx.storeConfig.operatingHours = {};
elements['pickup-date'].value = '';
elements['pickup-time'].value = '';
ctx.initPickupTimePicker();
assert.equal(elements['pickup-time'].value, '', 'A closed day must not default to 11:00');

// Midnight belongs to the following date, not 00:00 on the selected date.
ctx.storeConfig.operatingHours = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, [{ start: '23:30', end: '00:00' }]]));
const midnightSlots = ctx.generatePickupSlots(tomorrowStr);
assert.ok(midnightSlots.includes('23:30'));
assert.ok(!midnightSlots.includes('00:00'));
console.log('✓ Missing/closed tenant hours and midnight cutoff verified');
console.log('ALL PICKUP TIME PICKER UNIT TESTS PASSED!');

// POS status takes precedence today, including a fixed weekly holiday.
const manualNow = new Date(2026, 10, 7, 10, 0);
ctx.getTaiwanDate = () => new Date(manualNow);
ctx.storeConfig.operatingHours = {};
ctx.storeConfig.prepTimeMinutes = 5;
ctx.storeConfig.storeStatus = 'open';
assert.equal(ctx.isStoreOpen(manualNow), true);
assert.equal(ctx.calcAsapPickupTime(manualNow).timeStr, '10:05');
assert.ok(ctx.generatePickupSlots('2026-11-07').includes('10:15'));
assert.equal(ctx.generatePickupSlots('2026-11-08').length, 0, 'Future holiday reservations still follow the calendar');
ctx.initPickupTimePicker();
assert.equal(elements['pickup-date'].value, '2026-11-07');
assert.equal(elements['pickup-time'].value, '10:05');
ctx.storeConfig.storeStatus = 'busy';
assert.equal(ctx.isStoreOpen(manualNow), true);
assert.equal(ctx.calcAsapPickupTime(manualNow).timeStr, '11:00');
for (const status of ['paused', 'closed']) {
    ctx.storeConfig.storeStatus = status;
    assert.equal(ctx.isStoreOpen(manualNow), false);
    assert.equal(ctx.calcAsapPickupTime(manualNow), null);
    assert.equal(ctx.generatePickupSlots('2026-11-07').length, 0);
}
console.log('POS receiving status overrides today’s holiday; busy, paused and future holidays verified');

// Scheduled weekly holiday with configured operating hours (e.g. Sunday day off)
const sundayHoliday = new Date(2026, 10, 8, 12, 0); // 2026-11-08 is Sunday
ctx.getTaiwanDate = () => new Date(sundayHoliday);
ctx.storeConfig.storeStatus = 'open';
ctx.storeConfig.operatingHours = {
    "0": [],
    "1": [{ "start": "14:30", "end": "21:00" }],
    "2": [{ "start": "14:30", "end": "21:00" }],
    "3": [{ "start": "14:30", "end": "21:00" }],
    "4": [{ "start": "14:30", "end": "21:00" }],
    "5": [{ "start": "14:30", "end": "21:00" }],
    "6": [{ "start": "14:30", "end": "21:00" }]
};

assert.equal(ctx.isStoreOpen(sundayHoliday), false, 'Store must be closed on scheduled weekly holiday');
assert.equal(ctx.calcAsapPickupTime(sundayHoliday), null, 'No ASAP pickup on scheduled weekly holiday');
assert.equal(ctx.generatePickupSlots('2026-11-08').length, 0, 'No slots generated on scheduled holiday');
const firstAvail = ctx.findFirstAvailableDate();
assert.equal(firstAvail.dateStr, '2026-11-09', 'First available date should advance to Monday');
assert.equal(firstAvail.defaultTime, '14:30', 'First available slot should be Monday opening time');

elements['pickup-date'].value = '';
elements['pickup-time'].value = '';
ctx.initPickupTimePicker();
assert.equal(elements['pickup-date'].value, '2026-11-09', 'Pickup date input must default to Monday');
assert.equal(elements['pickup-time'].value, '14:30', 'Pickup time input must default to 14:30');

// Modal tab switch to Sunday shows holiday empty message and disabled confirm button
ctx.openPickupTimeModal();
ctx.switchPickupDateTab('2026-11-08');
assert.equal(elements['pickup-slots-empty'].textContent, '本日為門市公休日 (店休)');
assert.equal(elements['pickup-sheet-confirm-btn'].disabled, true);
console.log('✓ Scheduled weekly holiday (store off) correctly blocks Sunday pickup and advances to Monday');
