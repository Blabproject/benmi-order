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

// 2. Test initPickupTimePicker (Default initial state: unselected, customer has to choose)
ctx.initPickupTimePicker();
assert.ok(elements['pickup-date'].value, 'Date input should be initialized');
assert.equal(elements['pickup-time'].value, '', 'Time input must NOT be pre-selected in default initial state');
assert.equal(elements['pickup-trigger-display-time'].textContent, '請選擇預計取餐時間', 'Display time label prompts user to select');
assert.equal(elements['pickup-trigger-display-date'].textContent, '點擊選擇取餐日期與時段', 'Display date label prompts user to click');
console.log(`✓ initPickupTimePicker unselected initial state verified: ${elements['pickup-trigger-display-time'].textContent}`);

// 3. Test openPickupTimeModal with unselected initial state
ctx.openPickupTimeModal();
assert.equal(elements['pickup-time-modal'].style.display, 'flex', 'Modal should be shown');
assert.equal(ctx.pickupTimePickerState.tempTime, '', 'Modal opens with no tentative time selected by default');
assert.equal(elements['pickup-sheet-confirm-btn'].textContent, '請先選擇時間', 'Confirm button prompts user to select time');
assert.ok(elements['pickup-date-tabs'].innerHTML.includes('pickup-date-tab'), 'Date tabs rendered');
assert.ok(elements['pickup-date-tabs'].innerHTML.includes('pickup-date-tab-more'), 'More dates button rendered');
assert.ok(elements['pickup-slots-grid'].innerHTML.includes('pickup-period-group'), 'Slots should be grouped into meal periods');
assert.ok(elements['pickup-slots-grid'].innerHTML.includes('上午 / 午餐'), 'Should have lunch period header');
assert.ok(elements['pickup-slots-grid'].innerHTML.includes('晚間 / 晚餐'), 'Should have dinner period header');
console.log('✓ openPickupTimeModal opened modal with unselected initial state, 7-day tabs and meal periods');

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

// Tenant configuration is authoritative; unavailable hours must not invent slots.
ctx.storeConfig.operatingHours = null;
assert.equal(ctx.generatePickupSlots(tomorrowStr).length, 0);
ctx.storeConfig.operatingHours = {};
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
