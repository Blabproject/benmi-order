import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const distDir = path.join(root, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm'
};

function startDistServer(t) {
  const server = http.createServer((req, res) => {
    const reqPath = new URL(req.url, 'http://127.0.0.1').pathname;
    const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    const abs = path.resolve(distDir, rel);
    if (!abs.startsWith(distDir + path.sep) && abs !== distDir) {
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

test('Vite dist/ bundle coexists with legacy pages and serves POS React sandbox cleanly', async t => {
  execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.mts'], {
    cwd: root,
    stdio: 'pipe'
  });

  // 1. Verify dist/ structure: manifest, hashed /assets/*, legacy HTML/JS/CSS/WASM, Cloudflare config files
  const manifestPath = path.join(distDir, '.vite/manifest.json');
  assert.equal(fs.existsSync(manifestPath), true, 'dist/.vite/manifest.json must be generated');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entry = manifest['frontend/apps/pos/sandbox.html'];
  assert.ok(entry?.file?.startsWith('assets/pos-sandbox-'), JSON.stringify(manifest));
  assert.equal(fs.existsSync(path.join(distDir, entry.file)), true);
  assert.ok(entry.css?.[0]?.startsWith('assets/pos-sandbox-'));
  assert.equal(fs.existsSync(path.join(distDir, entry.css[0])), true);

  for (const requiredRel of [
    'frontend/apps/pos/sandbox.html',
    'orders.html',
    'index.html',
    'staff-order.html',
    'marketplace.html',
    'payment-result.html',
    'landing.html',
    'index.css',
    '_headers',
    '_routes.json',
    '_redirects',
    'js/orders-core.js',
    'css/orders.css',
    'wasm/pricing-engine'
  ]) {
    assert.equal(fs.existsSync(path.join(distDir, requiredRel)), true, `dist/${requiredRel} must exist`);
  }

  assert.match(fs.readFileSync(path.join(distDir, '_headers'), 'utf8'), /\/assets\/\*/);
  const routesJson = JSON.parse(fs.readFileSync(path.join(distDir, '_routes.json'), 'utf8'));
  assert.equal(routesJson.exclude.includes('/assets/*'), true);

  // 2. Serve dist/ over HTTP and verify both React sandbox and legacy pages load with zero broken assets
  const server = await startDistServer(t);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  page.setDefaultTimeout(8000);
  const pageErrors = [];
  const failedLocalRequests = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('response', res => {
    if (res.url().startsWith(baseUrl) && res.status() >= 400) {
      failedLocalRequests.push(`${res.status()} ${res.url()}`);
    }
  });

  await page.goto(`${baseUrl}/frontend/apps/pos/sandbox.html`, { waitUntil: 'networkidle' });
  await page.locator('.blab-modern-root h1').waitFor();

  // Verify responsive tablet/desktop touch target sizing and zero horizontal overflow
  for (const viewport of [{ width: 1280, height: 800 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    const metrics = await page.evaluate(() => {
      const small = Array.from(document.querySelectorAll('.blab-modern-root button, .blab-modern-root summary'))
        .map(el => ({ text: el.textContent?.trim(), ...el.getBoundingClientRect().toJSON() }))
        .filter(rect => rect.width > 0 && (rect.height < 47.9 || rect.width < 47.9));
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        small
      };
    });
    assert.equal(metrics.overflow, false, `Sandbox has horizontal overflow at ${viewport.width}px`);
    assert.deepEqual(metrics.small, [], `Interactive controls <48px at ${viewport.width}px: ${JSON.stringify(metrics.small)}`);
  }

  // Interactive check on live built React bundle: switch zh-TW -> vi, filter, search, modal
  await page.click('button:has-text("切換至 Tiếng Việt")');
  await page.locator('button:has-text("Tại bàn")').click();
  await page.fill('#pos-history-search', 'nguyen');
  assert.match(await page.locator('.pos-order-customer').first().innerText(), /Nguyễn Văn A/);
  await page.click('button:has-text("Xem")');
  await page.locator('dialog[open]').waitFor();
  await page.click('button:has-text("Đóng")');

  // Verify dist/orders.html and dist/index.html load local JS/CSS bundles cleanly without 404s
  await page.route('**/api/**', route => route.fulfill({ json: [] }));
  await page.route('**/bootstrap*', route => route.fulfill({ json: {} }));
  await page.goto(`${baseUrl}/orders.html?tenant=demo&env=dev`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof switchTab === 'function');
  await page.goto(`${baseUrl}/index.html?tenant=demo&env=dev`, { waitUntil: 'domcontentloaded' });

  assert.deepEqual(failedLocalRequests, [], `Broken local assets in dist/: ${failedLocalRequests.join(', ')}`);
  assert.deepEqual(pageErrors, [], `Browser runtime errors in dist/: ${pageErrors.join(' | ')}`);
});
