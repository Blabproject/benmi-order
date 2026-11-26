// Regression test: Order Detail Fullpage Modal mobile bottom clearance and scrolling
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const { getPosDistDir } = require('./helpers/pos-dist.cjs');

async function run() {
  const browser = await chromium.launch();
  const dist = getPosDistDir();
  const html = fs.readFileSync(path.join(dist, 'orders.html'), 'utf8')
    .replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');

  const testViewports = [
    { name: 'Mobile Compact (375x600)', width: 375, height: 600, isMobile: true },
    { name: 'Mobile Standard (412x750)', width: 412, height: 750, isMobile: true },
    { name: 'Mobile Large (390x844)', width: 390, height: 844, isMobile: true },
    { name: 'Tablet iPad (1024x768)', width: 1024, height: 768, isMobile: false },
    { name: 'Desktop (1440x900)', width: 1440, height: 900, isMobile: false }
  ];

  const deliveryDetails = {
    recipient: 'Test recipient',
    phone: '0912 345 678',
    address: '42 Example Road',
    taxId: '12345678'
  };

  for (const vp of testViewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const deliveryRequests = [];
    const loginRequests = [];
    await page.route('**/*', route => {
      const { hostname, pathname, searchParams } = new URL(route.request().url());
      if (pathname === '/api/orders/delivery-details') {
        deliveryRequests.push([searchParams.get('tenant_id'), searchParams.get('key'), route.request().headers().authorization]);
        return route.fulfill({ json: { details: deliveryDetails } });
      }
      if (pathname === '/api/auth' || pathname === '/api/staff/session') loginRequests.push(pathname);
      if (hostname === 'pos.test' && pathname === '/orders.html') {
        return route.fulfill({ body: html, contentType: 'text/html' });
      }
      if (hostname === 'pos.test' && /^\/(assets|css|js)\/[\w.-]+$/.test(pathname)) {
        return route.fulfill({ path: path.join(dist, pathname.slice(1)) });
      }
      return route.fulfill({ json: {} });
    });
    await page.addInitScript(() => { window.setInterval = () => 0; });
    await page.goto('http://pos.test/orders.html?tenant=fixture');

    await page.evaluate(() => {
      document.body.classList.add('is-web-platform', 'is-prod-env');
      window.currentTenantFeatures = ['dine_in'];
      const testOrder = {
        key: 'test-shirley',
        displayKey: 'K1003-T016',
        customer: 'Shirley',
        status: 'DONE',
        diningOption: 'takeaway',
        content: '🔥 口味與客製設定\n口味: 特調胡椒 鹹度: 調味清淡 辣度: 不辣\n\n1 x 雞胸肉 $60\n1 x 甜椒 $35\n1 x 娃娃菜 $35\n1 x 烤馬鈴薯 $35',
        subtotal: 165,
        discount: 5,
        total: 160,
        time: '11:46',
        pickup_time: '11:46',
        createdAt: Date.now() - 2040 * 60 * 1000
      };
      latestOrders = [testOrder];
      openReview('test-shirley');
    });

    // Scroll to maximum bottom
    await page.evaluate(() => {
      const modal = document.getElementById('reviewModal');
      modal.scrollTop = modal.scrollHeight;
    });

    const metrics = await page.evaluate(() => {
      const modal = document.getElementById('reviewModal');
      const pickedBtn = document.getElementById('btn-review-picked');
      const cancelBtn = document.getElementById('btn-review-cancel-2');
      const card = document.querySelector('.order-detail-customer-card');
      const container = document.querySelector('.order-detail-page-container');
      const grid = document.querySelector('.order-detail-grid');
      const csGrid = window.getComputedStyle(grid);

      return {
        modalHeight: modal.clientHeight,
        modalScrollHeight: modal.scrollHeight,
        modalScrollTop: modal.scrollTop,
        pickedBtnRect: pickedBtn.getBoundingClientRect(),
        cancelBtnRect: cancelBtn.getBoundingClientRect(),
        cardRect: card.getBoundingClientRect(),
        gridColumns: csGrid.gridTemplateColumns,
        containerPaddingBottom: parseFloat(window.getComputedStyle(container).paddingBottom) || 0,
        containerPaddingTop: parseFloat(window.getComputedStyle(container).paddingTop) || 0
      };
    });

    // Verify button visibility and clearance
    assert(
      metrics.pickedBtnRect.bottom <= vp.height,
      `[${vp.name}] pickedBtn bottom (${metrics.pickedBtnRect.bottom}px) must be within viewport height (${vp.height}px)`
    );
    assert(
      metrics.cancelBtnRect.bottom <= vp.height,
      `[${vp.name}] cancelBtn bottom (${metrics.cancelBtnRect.bottom}px) must be within viewport height (${vp.height}px)`
    );
    assert(
      metrics.cardRect.bottom <= vp.height,
      `[${vp.name}] customerCard bottom (${metrics.cardRect.bottom}px) must be within viewport height (${vp.height}px)`
    );

    // Verify minimum touch target 48px
    assert(
      metrics.pickedBtnRect.height >= 48,
      `[${vp.name}] pickedBtn height (${metrics.pickedBtnRect.height}px) must be at least 48px`
    );

    if (vp.isMobile) {
      // On mobile, bottom clearance should be at least 80px when scrolled to bottom
      const clearance = vp.height - metrics.pickedBtnRect.bottom;
      assert(
        clearance >= 80,
        `[${vp.name}] Button clearance from bottom (${clearance}px) must be at least 80px`
      );
      assert(
        metrics.containerPaddingBottom >= 96,
        `[${vp.name}] Container bottom padding (${metrics.containerPaddingBottom}px) must be at least 96px`
      );
    } else {
      // On tablet/desktop, 2 columns layout
      assert(
        metrics.gridColumns.includes(' '),
        `[${vp.name}] Should have multi-column layout on tablet/desktop, got: ${metrics.gridColumns}`
      );
    }

    if (vp.width === 375) {
      const details = page.locator('.order-delivery-card');
      const fixtures = [
        { key: 'delivery-no-note', note: '', snapshot: true },
        { key: 'delivery-with-note', note: '請分開裝', snapshot: true },
        { key: 'delivery-legacy-note', note: '請按門鈴', snapshot: false }
      ];
      for (const fixture of fixtures) {
        await page.evaluate(({ key, note, snapshot }) => {
          const order = { ...latestOrders[0], key, note, diningOption: 'delivery' };
          order.detailSnapshot = snapshot ? {
            schemaVersion: 1, total: 60,
            rounds: [{ roundNumber: 1, groups: [], note, items: [
              { name: '雞胸肉', quantity: 1, unitPrice: 60, subtotal: 60, note: '', portions: [] }
            ] }]
          } : undefined;
          latestOrders = [order];
          openReview(order.key);
        }, fixture);
        await details.locator('dd').first().waitFor({ state: 'visible', timeout: 5000 });
        assert.deepEqual(await details.locator('dd').allTextContents(), Object.values(deliveryDetails));
        assert.equal(await details.locator('input,button').count(), 0);
        const layout = await details.evaluate(card => {
          const firstItem = document.querySelector('#review-content .review-item-row');
          const previousNote = card.previousElementSibling?.querySelector('.detail-note-text, .flavor-note-val');
          return {
            aboveItems: card.getBoundingClientRect().bottom <= firstItem.getBoundingClientRect().top,
            previousNote: previousNote?.textContent ?? ''
          };
        });
        assert.equal(layout.aboveItems, true, fixture.key);
        if (fixture.note) assert.ok(layout.previousNote.includes(fixture.note), fixture.key);
        else assert.equal(layout.previousNote, '', fixture.key);
      }
      assert.deepEqual(deliveryRequests, fixtures.map(({ key }) => ['fixture', key, undefined]));
      assert.deepEqual(loginRequests, []);
      assert.equal(await page.locator('#storeActivationModal').isVisible(), false);
    }

    await page.close();
  }

  await browser.close();
  console.log('PASS: Order Detail fullpage modal mobile scrolling & bottom button clearance verified across all viewports.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
