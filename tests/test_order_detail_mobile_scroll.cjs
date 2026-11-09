// Regression test: Order Detail Fullpage Modal mobile bottom clearance and scrolling
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');

async function run() {
  const browser = await chromium.launch();
  const htmlRaw = fs.readFileSync(path.join(root, 'orders.html'), 'utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*>/gi, '');
  const css = fs.readFileSync(path.join(root, 'css/orders.css'), 'utf8');

  const testViewports = [
    { name: 'Mobile Compact (375x600)', width: 375, height: 600, isMobile: true },
    { name: 'Mobile Standard (412x750)', width: 412, height: 750, isMobile: true },
    { name: 'Mobile Large (390x844)', width: 390, height: 844, isMobile: true },
    { name: 'Tablet iPad (1024x768)', width: 1024, height: 768, isMobile: false },
    { name: 'Desktop (1440x900)', width: 1440, height: 900, isMobile: false }
  ];

  for (const vp of testViewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.route('**/*', route => route.fulfill({ body: '<html></html>', contentType: 'text/html' }));
    await page.goto('http://pos.test/?tenant=fixture');
    await page.setContent(htmlRaw);
    await page.addStyleTag({ content: css });

    for (const file of ['js/order-code.js', 'js/orders-i18n.js', 'js/order-legacy-adapter.js', 'js/orders-core.js', 'js/orders-live.js', 'js/orders-modals.js']) {
      await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
    }

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

    await page.close();
  }

  await browser.close();
  console.log('PASS: Order Detail fullpage modal mobile scrolling & bottom button clearance verified across all viewports.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
