const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const index = read('index.html');
const display = read('js/orders-display.js');
const init = index.match(/<script>([\s\S]*?)<\/script>/)[0];
// Exercise the real customer/staff entry point and its script attributes.
const entry = index.match(/<script\b[^>]*src="\/js\/orders-display\.js\?[^\"]+"[^>]*><\/script>/)[0]
  .replace(/ src="[^"]+"/, '').replace('</script>', `${display}</script>`);
const styles = ['index.css', 'css/staff-order.css', 'css/client-option-groups.css'].map(read).join('\n');
const content = `
  <button class="staff-chip">Mang đi</button>
  <div id="catalog-sections"><div class="card"><div class="card-title">Tên món</div><div class="card-price">$60</div></div></div>
  <div class="staff-cart-name">Tên món trong giỏ</div>
  <div class="staff-cart-discount">Ưu đãi</div>
  <div class="desktop-sidebar-price">$60</div>
  <button id="btn-desktop-submit">Gửi đơn</button>
  <div class="pickup-trigger-primary">Lấy ngay</div><div class="pickup-slot-chip">12:00</div>
  <div class="uoc-panel"><h2>Tùy chọn</h2><button class="modifier-pill">Ít cay</button><label class="modifier-checkbox-chip">Thêm hành</label><span class="uoc-count">Chọn 1</span></div>`;

function fixture(t, { staff = true, saved, width = 1024, parent, blocked = false, pos = false } = {}) {
  const dom = new JSDOM(`<html><head>${pos ? '' : init}<style>${styles}</style>${pos ? `<script>${display}</script>` : entry}</head><body>${content}</body></html>`, {
    url: `https://pos.test/${pos ? 'orders' : 'index'}.html?tenant_id=fixture${staff && !pos ? '&mode=staff' : ''}`,
    runScripts: 'dangerously',
    beforeParse(window) {
      window.innerWidth = width;
      if (parent) Object.defineProperty(window, 'parent', { value: parent });
      if (saved) window.localStorage.setItem('pos_text_size', saved);
      if (blocked) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    }
  });
  t.after(() => dom.window.close());
  return dom.window;
}

function font(window, selector) {
  return parseFloat(window.getComputedStyle(window.document.querySelector(selector)).fontSize);
}

test('staff menu, cart and option sheets scale from the saved preference and survive reload', t => {
  const samples = [
    ['.staff-chip', 13], ['.card-title', 13.5], ['.card-price', 13],
    ['.staff-cart-name', 13], ['.staff-cart-discount', 12], ['.desktop-sidebar-price', 21],
    ['#btn-desktop-submit', 14.5], ['.uoc-panel h2', 20], ['.modifier-pill', 14],
    ['.modifier-checkbox-chip', 13.5], ['.uoc-count', 13],
    ['.pickup-trigger-primary', 15.5], ['.pickup-slot-chip', 15]
  ];
  for (const [mode, scale] of [['standard', 1], ['large', 1.125], ['extra-large', 1.25]]) {
    const window = fixture(t, { saved: mode });
    for (const [selector, base] of samples) assert.equal(font(window, selector), base * scale, `${mode}: ${selector}`);
    window.selectPOSTextSize('extra-large');
    const reload = fixture(t, { saved: window.localStorage.getItem('pos_text_size') });
    assert.equal(font(reload, '.staff-chip'), 16.25);
  }
});

test('an embedded staff menu inherits unsaved host preferences and updates immediately', t => {
  const host = fixture(t, { pos: true, blocked: true, width: 1024 });
  host.selectPOSTextSize('extra-large');
  const staff = fixture(t, { parent: host, blocked: true, width: 528 });
  assert.equal(font(staff, '.card-title'), 16.875);
  const frame = host.document.createElement('iframe');
  frame.id = 'staff-order-iframe';
  host.document.body.appendChild(frame);
  Object.defineProperty(frame, 'contentWindow', { value: staff });
  // jsdom does not populate postMessage's source; preserve browser semantics here.
  staff.postMessage = (data, origin) => staff.dispatchEvent(new staff.MessageEvent('message', { data, origin, source: host }));
  host.selectPOSTextSize('standard');
  assert.equal(font(staff, '.card-title'), 13.5);
  host.selectPOSTextSize('auto');
  assert.equal(staff.getPOSTextScale(), 1.125, 'Auto uses the POS viewport, not its narrower iframe');
  host.innerWidth = 390;
  host.dispatchEvent(new host.Event('resize'));
  assert.equal(staff.getPOSTextScale(), 1);
  assert.equal(font(staff, '.card-title'), 13.5);
});

test('standalone staff menus follow storage changes and automatic viewport sizing', t => {
  const window = fixture(t, { saved: 'standard', width: 390 });
  window.dispatchEvent(new window.StorageEvent('storage', { key: 'pos_text_size', newValue: 'large' }));
  assert.equal(font(window, '.staff-chip'), 14.625);
  window.dispatchEvent(new window.StorageEvent('storage', { key: 'unrelated', newValue: 'standard' }));
  assert.equal(font(window, '.staff-chip'), 14.625);
  window.dispatchEvent(new window.StorageEvent('storage', { key: null, newValue: null }));
  assert.equal(window.getPOSTextSize(), 'auto');
  assert.equal(font(window, '.staff-chip'), 13);
  window.innerWidth = 820;
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(font(window, '.staff-chip'), 14.625);
});

test('embedded typography ignores unrelated sources, origins and invalid preferences', t => {
  const host = fixture(t, { pos: true, saved: 'standard' });
  const staff = fixture(t, { parent: host });
  for (const options of [
    { origin: 'https://other.test', source: host, value: 'extra-large' },
    { origin: host.location.origin, source: staff, value: 'extra-large' },
    { origin: host.location.origin, source: host, value: 'invalid' }
  ]) {
    staff.dispatchEvent(new staff.MessageEvent('message', { ...options, data: { type: 'POS_TEXT_SIZE', value: options.value } }));
    assert.equal(staff.getPOSTextSize(), 'standard');
  }
});

test('customer menus do not apply POS preferences', t => {
  const window = fixture(t, { staff: false, saved: 'extra-large' });
  assert.equal(window.document.documentElement.hasAttribute('data-pos-text-size'), false);
  assert.equal(window.getPOSTextSize, undefined);
  assert.equal(font(window, '.modifier-pill'), 16);
  assert.equal(font(window, '.uoc-panel h2'), 20);
  assert.equal(font(window, '.pickup-trigger-primary'), 15.5);
});
