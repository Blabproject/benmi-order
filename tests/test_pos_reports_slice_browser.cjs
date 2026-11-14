const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = process.cwd();
const distRoot = path.join(root, 'dist');

function buildDist() {
  execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.mts'], {
    cwd: root,
    stdio: 'inherit'
  });
}

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
  buildDist();
  const server = http.createServer((req, res) => {
    const reqPath = new URL(req.url, 'http://127.0.0.1').pathname;
    const rel = reqPath === '/' ? 'orders.html' : reqPath.replace(/^\/+/, '');
    const abs = path.resolve(distRoot, rel);
    if (!abs.startsWith(distRoot + path.sep) && abs !== distRoot) {
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

function buildReportPayload(range) {
  if (range === '7d') {
    return {
      tenantId: 'a',
      range: '7d',
      startDate: '2026-11-08',
      endDate: '2026-11-14',
      totalItemsSold: 42,
      totalRevenue: 3960,
      totalOrders: 18,
      topItem: {
        itemName: '招牌香雞排',
        categoryName: '現炸主食',
        totalQuantity: 25,
        totalSales: 2125,
        orderAppearances: 14,
        optionsBreakdown: { 特調胡椒: 19, 小辣: 11 }
      },
      items: [
        {
          itemName: '招牌香雞排',
          categoryName: '現炸主食',
          totalQuantity: 25,
          totalSales: 2125,
          orderAppearances: 14,
          optionsBreakdown: { 特調胡椒: 19, 小辣: 11 }
        },
        {
          itemName: '煉乳銀絲卷',
          categoryName: '點心',
          totalQuantity: 17,
          totalSales: 1835,
          orderAppearances: 10
        }
      ]
    };
  }
  return {
    tenantId: 'a',
    range: 'today',
    startDate: '2026-11-14',
    endDate: '2026-11-14',
    totalItemsSold: 9,
    totalRevenue: 810,
    totalOrders: 4,
    topItem: {
      itemName: '無骨鹽酥雞',
      categoryName: '炸物',
      totalQuantity: 6,
      totalSales: 540,
      orderAppearances: 4,
      optionsBreakdown: { 加蒜: 5 }
    },
    items: [
      {
        itemName: '無骨鹽酥雞',
        categoryName: '炸物',
        totalQuantity: 6,
        totalSales: 540,
        orderAppearances: 4,
        optionsBreakdown: { 加蒜: 5 }
      },
      {
        itemName: '脆皮甜不辣',
        categoryName: '',
        totalQuantity: 3,
        totalSales: 270,
        orderAppearances: 2
      }
    ]
  };
}

test('POS #view-reports React slice fetches analytics, switches ranges, localizes zh-TW/vi, and enforces 48px targets', async t => {
  const server = await startStaticServer(t);
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  page.setDefaultTimeout(8000);

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  let reportRequestCount = 0;
  let lastReportTenantHeader = null;
  await page.route('**/api/**', async route => {
    const req = route.request();
    const reqUrl = new URL(req.url());
    const pathname = reqUrl.pathname;
    if (pathname === '/api/reports/items-analytics') {
      reportRequestCount += 1;
      lastReportTenantHeader = req.headers()['x-tenant-id'] || null;
      const range = reqUrl.searchParams.get('range') || 'today';
      return route.fulfill({ json: buildReportPayload(range) });
    }
    if (pathname === '/api/orders') return route.fulfill({ json: [] });
    if (pathname === '/api/config') {
      return route.fulfill({
        json: {
          tenantId: 'a',
          allowDineIn: true,
          allowScheduledPickup: true,
          features: ['dine_in', 'reports'],
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
  await page.waitForFunction(() => typeof switchTab === 'function' && typeof selectReportRange === 'function');

  await page.click('#i18n-btn-start-shift');
  await page.evaluate(() => {
    setLanguage('zh-TW');
    switchTab('reports');
  });

  await page.waitForFunction(() => document.querySelectorAll('#reports-table-container tbody tr').length === 2);
  assert.equal(lastReportTenantHeader, 'a');
  assert.equal(await page.locator('#kpi-top-item-name').innerText(), '無骨鹽酥雞');
  assert.equal(await page.locator('#kpi-total-revenue').innerText(), '$810');
  assert.equal(await page.locator('#reports-item-count').innerText(), '2 品項');

  // Touch target size contract (>= 48px for visible interactive buttons inside #view-reports)
  const smallControls = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#view-reports button')).flatMap(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return [];
      return rect.height < 48 || rect.width < 48 ? [`${el.id || el.className}:${Math.round(rect.width)}x${Math.round(rect.height)}`] : [];
    })
  );
  assert.deepEqual(smallControls, [], `Reports controls below 48px: ${smallControls.join(', ')}`);

  // Switch range to 7d and confirm API fetch + DOM update
  await page.click('#i18n-range-7d');
  await page.waitForFunction(() => document.querySelector('#kpi-top-item-name')?.textContent === '招牌香雞排');
  assert.equal(await page.locator('#kpi-total-revenue').innerText(), '$3,960');
  assert.equal(await page.locator('#kpi-date-range').innerText(), '2026-11-08 ~ 2026-11-14');

  // Force refresh triggers another fetch
  const beforeRefresh = reportRequestCount;
  await Promise.all([
    page.waitForResponse(res => new URL(res.url()).pathname === '/api/reports/items-analytics' && res.status() === 200),
    page.click('#btn-refresh-reports')
  ]);
  assert.equal(reportRequestCount, beforeRefresh + 1);

  // Switch language to Vietnamese without mixed text
  await page.evaluate(() => setLanguage('vi'));
  assert.equal(await page.locator('#i18n-reports-title').innerText(), 'Phân tích doanh số & Doanh thu món');
  assert.equal(await page.locator('#i18n-range-7d').innerText(), '7 ngày qua');
  assert.equal(await page.locator('#i18n-btn-back-settings').innerText(), 'Quay lại cài đặt');

  assert.deepEqual(pageErrors, []);
});
