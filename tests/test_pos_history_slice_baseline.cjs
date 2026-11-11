const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = process.cwd();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm'
};

function startStaticServer(t) {
  const server = http.createServer((req, res) => {
    const reqPath = new URL(req.url, 'http://127.0.0.1').pathname;
    const rel = reqPath === '/' ? 'orders.html' : reqPath.replace(/^\/+/, '');
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep) && abs !== root) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(abs).pipe(res);
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      t.after(() => new Promise(r => server.close(r)));
      resolve(server);
    });
  });
}

function buildTaiwanHistoryFixtures() {
  const twFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const nowMs = Date.now();
  const todayTw = twFormatter.format(new Date(nowMs));
  const yesterdayTw = twFormatter.format(new Date(nowMs - 86400 * 1000));

  return {
    todayTw,
    yesterdayTw,
    orders: [
      {
        key: 'ORD-HIST-D05',
        displayKey: '261111-005',
        customer: 'Nguyễn Văn A',
        phone: '0912345678',
        time: `${todayTw} 12:20`,
        content: '1x Bánh mì thịt nướng $95\n2x Cà phê sữa đá $130',
        status: 'PAID',
        createdAt: nowMs - 7200 * 1000,
        pickedUpAt: nowMs - 3600 * 1000,
        total: 255,
        diningOption: 'dine_in',
        tableNumber: '5',
        roundCount: 2,
        is_modified: 1,
        note: 'Ít hành ngò',
        items: [
          { item_name: 'Bánh mì thịt nướng', quantity: 1, subtotal: 95 },
          { item_name: 'Cà phê sữa đá', quantity: 2, subtotal: 130 },
          { item_name: 'Chả lụa thêm', quantity: 1, subtotal: 30 }
        ]
      },
      {
        key: 'ORD-HIST-T14',
        displayKey: '261111-014',
        customer: '陳美玲',
        phone: '0987654321',
        time: `${todayTw} 13:15`,
        content: '2x 法式經典越南麵包 $190\n1x 檸檬紅茶 $45',
        status: 'PICKED_UP',
        createdAt: nowMs - 5400 * 1000,
        pickedUpAt: nowMs - 1800 * 1000,
        total: 235,
        diningOption: 'takeaway',
        items: [
          { item_name: '法式經典越南麵包', quantity: 2, subtotal: 190 },
          { item_name: '檸檬紅茶', quantity: 1, subtotal: 45 }
        ]
      },
      {
        key: 'ORD-HIST-Y03',
        displayKey: '261110-003',
        customer: '林志明',
        time: `${yesterdayTw} 18:30`,
        content: '1x 越式烤肉涼麵 $140\n💰 總金額: $140',
        status: 'REJECTED',
        createdAt: nowMs - 90000 * 1000,
        pickedUpAt: nowMs - 88000 * 1000,
        total: 140,
        diningOption: 'takeaway',
        reason: 'Customer rescheduled'
      }
    ]
  };
}

test('POS #view-history baseline locks search, dine-in/takeaway filters, UTC+8 grouping, accordion, review modal, i18n, and 48px targets', async t => {
  const server = await startStaticServer(t);
  const { todayTw, yesterdayTw, orders } = buildTaiwanHistoryFixtures();

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  page.setDefaultTimeout(8000);

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  let allowDineInFlag = true;
  let featuresFlag = ['dine_in', 'reports'];

  await page.route('**/api/**', async route => {
    const reqUrl = new URL(route.request().url());
    const pathname = reqUrl.pathname;
    if (pathname === '/api/orders/history-all') {
      return route.fulfill({ json: orders });
    }
    if (pathname === '/api/orders') {
      return route.fulfill({ json: [] });
    }
    if (pathname === '/api/config') {
      return route.fulfill({
        json: {
          tenantId: 'a',
          allowDineIn: allowDineInFlag,
          allowScheduledPickup: true,
          features: featuresFlag,
          storeStatus: 'open',
          operatingHours: {},
          paymentMethods: ['cash']
        }
      });
    }
    if (pathname.startsWith('/api/staff/')) {
      return route.fulfill({ json: { capabilities: { staff_ordering: true, tables_read: true, tables_write: true } } });
    }
    if (pathname === '/api/orders/events') {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    }
    return route.fulfill({ json: {} });
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${baseUrl}/orders.html?tenant=a&env=dev`);
  await page.waitForFunction(() => typeof switchTab === 'function' && typeof setLanguage === 'function');

  await page.click('#i18n-btn-start-shift');
  await page.evaluate(() => {
    window.allowDineIn = true;
    window.currentTenantFeatures = ['dine_in', 'reports'];
    setLanguage('zh-TW');
    switchTab('history');
  });

  await page.waitForFunction(() => document.querySelectorAll('#list-history .history-date-group').length === 2);

  // 1. Verify UTC+8 grouping & totals (today + yesterday)
  const groupSummary = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#list-history .history-date-group')).map(el => {
      const headerEl = el.querySelector('.history-date-header');
      const headerText = headerEl?.textContent?.trim() || '';
      return {
        headerText,
        hasTodayText: Boolean(el.querySelector('.history-today-tag')),
        itemCount: el.querySelectorAll('.history-tile').length,
        expanded: Boolean(headerEl?.classList.contains('expanded'))
      };
    })
  );
  assert.equal(groupSummary[0].headerText.includes(todayTw), true, JSON.stringify(groupSummary[0]));
  assert.equal(groupSummary[0].hasTodayText, true, JSON.stringify(groupSummary[0]));
  assert.match(groupSummary[0].headerText, /490/);
  assert.equal(groupSummary[0].itemCount, 2);
  assert.equal(groupSummary[0].expanded, true, 'First date group starts expanded');

  assert.equal(groupSummary[1].headerText.includes(yesterdayTw), true, JSON.stringify(groupSummary[1]));
  assert.equal(groupSummary[1].hasTodayText, false, JSON.stringify(groupSummary[1]));
  assert.match(groupSummary[1].headerText, /140/);
  assert.equal(groupSummary[1].expanded, false, 'Older date group starts collapsed');

  // 2. Verify accent-insensitive search auto-expands & matches diacritics ("nguyen" -> "Nguyễn Văn A")
  await page.fill('#history-search-input', 'nguyen');
  const searchMatches = await page.locator('#list-history .history-tile').allInnerTexts();
  assert.equal(searchMatches.length, 1);
  assert.match(searchMatches[0], /Nguyễn Văn A/);

  await page.fill('#history-search-input', 'no-such-order-999');
  assert.equal(await page.locator('#list-history .history-tile').count(), 0);
  await page.fill('#history-search-input', '');

  // 3. Verify dining filter chips & Vietnamese translation switch
  await page.evaluate(() => setLanguage('vi'));
  assert.equal(await page.locator('#i18n-hist-filter-dinein').innerText(), 'Tại bàn');
  assert.equal(await page.locator('#i18n-hist-filter-takeaway').innerText(), 'Mang về');

  await page.click('#history-filter-group [data-filter="dine_in"]');
  assert.equal(await page.locator('#list-history .history-tile').count(), 1);
  await page.click('#history-filter-group [data-filter="takeaway"]');
  assert.equal(await page.locator('#list-history .history-tile').count(), 2);
  await page.click('#history-filter-group [data-filter="all"]');

  // 4. Verify Expand/Collapse All toggle & auto-hide filter when dine-in is disabled
  await page.click('#btn-toggle-all-history');
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('#list-history .history-date-header')).every(el => el.classList.contains('expanded'))
  );

  // Touch target size contract (>= 48px for visible POS controls inside #view-history toolbar)
  const smallControls = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#view-history [data-filter], #view-history #btn-toggle-all-history'))
      .filter(el => el.getBoundingClientRect().width > 0)
      .map(el => ({
        id: el.id || el.dataset.filter,
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height
      }))
      .filter(rect => rect.height < 47.9 || rect.width < 47.9)
  );
  assert.deepEqual(smallControls, [], 'History filter & toggle controls must be at least 48px tall and wide');

  // Opening a history item launches read-only review modal
  await page.click('#list-history .history-tile button');
  await page.waitForFunction(() => {
    const modal = document.getElementById('reviewModal');
    return Boolean(modal && getComputedStyle(modal).display !== 'none');
  });
  await page.evaluate(() => closeModal());

  // Feature-flag capability change disables dine-in filter cleanly
  allowDineInFlag = false;
  featuresFlag = ['reports'];
  await page.evaluate(() => {
    window.allowDineIn = false;
    window.currentTenantFeatures = ['reports'];
    window.isDineInSupported = () => false;
    renderHistory();
  });
  assert.equal(await page.locator('#history-filter-group').isVisible(), false, 'Filter bar hides when tenant has no dine-in');

  assert.deepEqual(pageErrors, [], 'Legacy POS History view must have zero runtime pageerrors');
});
