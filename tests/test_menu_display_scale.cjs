const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Menu CSS defines dynamic text scale variables based on data-pos-text-size', () => {
  const css = read('css/orders-menu.css');

  // Must declare scalable root variables
  assert.match(css, /--menu-font-scale:\s*var\(--pos-font-scale,\s*1\);/);
  assert.match(css, /--menu-font-2xs:\s*calc\(10px\s*\*\s*var\(--menu-font-scale\)\);/);
  assert.match(css, /--menu-font-xs:\s*calc\(11\.5px\s*\*\s*var\(--menu-font-scale\)\);/);
  assert.match(css, /--menu-font-sm:\s*calc\(12\.5px\s*\*\s*var\(--menu-font-scale\)\);/);
  assert.match(css, /--menu-font-base:\s*calc\(13\.5px\s*\*\s*var\(--menu-font-scale\)\);/);
  assert.match(css, /--menu-font-md:\s*calc\(15px\s*\*\s*var\(--menu-font-scale\)\);/);
  assert.match(css, /--menu-font-lg:\s*calc\(16\.5px\s*\*\s*var\(--menu-font-scale\)\);/);
  assert.match(css, /--menu-font-xl:\s*calc\(18px\s*\*\s*var\(--menu-font-scale\)\);/);
  assert.match(css, /--menu-font-2xl:\s*calc\(20px\s*\*\s*var\(--menu-font-scale\)\);/);

  // Must have direct root overrides matching pos-text-size attribute
  assert.match(css, /:root\[data-pos-text-size="standard"\]\s*\{[\s\S]*?--menu-font-scale:\s*1;/);
  assert.match(css, /:root\[data-pos-text-size="large"\]\s*\{[\s\S]*?--menu-font-scale:\s*1\.125;/);
  assert.match(css, /:root\[data-pos-text-size="extra-large"\]\s*\{[\s\S]*?--menu-font-scale:\s*1\.25;/);
});

test('Menu CSS contains zero hardcoded font-size in pixels', () => {
  const css = read('css/orders-menu.css');
  const hardcodedFontSizes = css.match(/font-size:\s*\d+px/gi);
  assert.equal(hardcodedFontSizes, null, 'orders-menu.css should not have any hardcoded px font sizes');
});

test('Menu dish cards, inputs and segmented toggle scale dynamically with --menu-font-scale', () => {
  const css = read('css/orders-menu.css');

  // Segmented toggle header scale
  assert.match(css, /\.menu-sidebar-segmented-toggle[\s\S]*?width:\s*calc\(186px\s*\*\s*var\(--menu-font-scale\)\)/);
  assert.match(css, /\.menu-sidebar-segmented-toggle[\s\S]*?min-height:\s*calc\(48px\s*\+\s*6px\s*\*\s*var\(--menu-font-scale\)\)/);
  assert.match(css, /\.menu-seg-btn[\s\S]*?font-size:\s*var\(--menu-font-base\)/);

  // Dish row card heights and paddings scale
  assert.match(css, /\.menu-item-row-card[\s\S]*?min-height:\s*calc\(56px\s*\*\s*var\(--menu-font-scale\)\)/);
  assert.match(css, /\.menu-item-thumb-box[\s\S]*?calc\(44px\s*\*\s*var\(--menu-font-scale\)\)/);

  // Dish name, price, stock toggle, options button scale
  assert.match(css, /--menu-row-name-size:\s*var\(--menu-font-md\)/);
  assert.match(css, /\.menu-item-name-input[\s\S]*?font-size:\s*var\(--menu-row-name-size\)/);
  assert.match(css, /\.menu-item-name-input[\s\S]*?min-height:\s*48px/);
  assert.match(css, /\.menu-item-price-wrapper\s*\{[\s\S]*?min-height:\s*48px/);
  assert.match(css, /\.menu-item-price-input[\s\S]*?font-size:\s*var\(--menu-row-name-size\)/);
  assert.match(css, /\.menu-item-stock-toggle[\s\S]*?font-size:\s*var\(--menu-font-xs\)/);
  assert.match(css, /\.menu-item-options-btn[\s\S]*?font-size:\s*var\(--menu-font-xs\)/);
});

test('I18N dictionaries contain store closed status in zh-TW and vi', () => {
  const i18nJs = read('js/orders-i18n.js');

  // zh-TW dictionary
  assert.match(i18nJs, /statusClosed:\s*"今日打烊"/);
  assert.match(i18nJs, /statusOptClosedTitle:\s*"今日打烊"/);
  assert.match(i18nJs, /statusOptClosedDesc:\s*"今日停止接單，下個營業日自動恢復"/);

  // vi dictionary
  assert.match(i18nJs, /statusClosed:\s*"Đóng cửa hôm nay"/);
  assert.match(i18nJs, /statusOptClosedTitle:\s*"Đóng cửa hôm nay"/);
  assert.match(i18nJs, /statusOptClosedDesc:\s*"Dừng nhận đơn hôm nay, tự động mở lại vào ngày mở quán tiếp theo"/);
});

test('orders.html has updated cache-busters for menu and display scaling', () => {
  const html = read('orders.html');

  assert.ok(/css\/orders\.css\?v=2026\d{4}\w+/.test(html), 'orders.css must have bumped cache-buster');
  assert.ok(/css\/orders-menu\.css\?v=2026\d{4}\w+/.test(html), 'orders-menu.css must have bumped cache-buster');
  assert.ok(/js\/orders-i18n\.js\?v=2026\d{4}\w+/.test(html), 'orders-i18n.js must have bumped cache-buster');
  assert.ok(/js\/orders-settings\.js\?v=2026\d{4}\w+/.test(html), 'orders-settings.js must have bumped cache-buster');
  assert.ok(/js\/orders-menu\.js\?v=2026\d{4}\w+/.test(html), 'orders-menu.js must have bumped cache-buster');
});

test('Menu items catalog card seamlessly integrates without nested duplicate panel borders', () => {
  const css = read('css/orders-menu.css');
  const js = read('js/orders-menu.js');

  // css asserts menu-products-card is borderless and seamless
  assert.match(css, /\.menu-products-card[\s\S]*?border:\s*0\s*!important/);
  assert.match(css, /\.menu-products-card[\s\S]*?border-radius:\s*0\s*!important/);
  assert.match(css, /\.cust-group-card:not\(\.menu-products-card\)/);

  // js asserts catalogCard is not classified as cust-group-card
  assert.match(js, /catalogCard\.className\s*=\s*["']menu-products-card["']/);
});
