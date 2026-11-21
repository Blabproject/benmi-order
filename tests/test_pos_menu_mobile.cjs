const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const browserType = require('playwright')[process.env.MENU_QA_BROWSER || 'chromium'];
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const sampleMenu = [
  {
    id: 'cat_main',
    title: '主餐熱銷 (Món chính)',
    type: 'catalog',
    sortOrder: 1,
    items: [
      { id: 'item_1', name: '招牌越式牛肉河粉 Phở Bò', price: 160, isOos: false },
      { id: 'item_2', name: '順化牛肉米線 Bún Bò Huế', price: 170, isOos: true },
      { id: 'item_3', name: '越式烤肉飯 Cơm Thịt Nướng', price: 150, isOos: false }
    ]
  },
  {
    id: 'cat_drinks',
    title: '特色飲品 (Đồ uống)',
    type: 'catalog',
    sortOrder: 2,
    items: [
      { id: 'item_4', name: '越式滴漏冰咖啡 Cà Phê Sữa Đá', price: 75, isOos: false },
      { id: 'item_5', name: '香茅檸檬茶 Trà Chanh Sả', price: 60, isOos: false }
    ]
  },
  {
    id: 'cat_options_sugar',
    title: '甜度選項 (Độ ngọt)',
    type: 'order_customization',
    scope: 'item',
    sortOrder: 3,
    groups: [
      {
        id: 'grp_sugar',
        title: '甜度選項 (Độ ngọt)',
        scope: 'item',
        options: [
          { id: 'opt_1', name: '正常甜 (100%)', price: 0 },
          { id: 'opt_2', name: '半糖 (50%)', price: 0 }
        ]
      }
    ],
    items: [
      { id: 'opt_1', name: '正常甜 (100%)', price: 0 },
      { id: 'opt_2', name: '半糖 (50%)', price: 0 }
    ]
  }
];

async function run() {
  execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.mts'], { cwd: root, stdio: 'pipe' });
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/orders.html') {
      const html = read('dist/orders.html').replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');
      return route.fulfill({ body: html, contentType: 'text/html' });
    }
    if (/^\/assets\/[\w.-]+$/.test(url.pathname)) {
      return route.fulfill({ path: path.join(root, 'dist', url.pathname.slice(1)) });
    }
    if (/^\/(js|css)\/[\w.-]+$/.test(url.pathname)) {
      return route.fulfill({ body: read(url.pathname.slice(1)), contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript' });
    }
    return route.fulfill({ body: '{}', contentType: 'application/json' });
  });

  await page.addInitScript(() => {
    window.setInterval = () => 0;
    window.fetch = async () => ({ ok: true, headers: new Headers(), json: async () => ({}) });
  });

  await page.goto('http://pos.test/orders.html?tenant=benmi');

  // Switch to Menu Tab and populate sample data
  await page.evaluate((menuData) => {
    currentMenuData = menuData;
    isMenuLoadedCompletely = true;
    switchTab('menu');
    setMenuSidebarTab('products');
    setMenuMobileView('master');
    renderMenuCategories();
  }, sampleMenu);

  await page.waitForTimeout(300);

  // 1. Verify Level 1: Master View on Mobile (390x844)
  const masterMetrics = await page.evaluate(() => {
    const sidebar = document.getElementById('menu-sidebar-panel');
    const editor = document.getElementById('menu-editor-panel');
    const backBtn = document.getElementById('btn-menu-mobile-back');
    const navBtn = document.querySelector('.menu-header-nav-btn');
    const cards = [...document.querySelectorAll('#menu-categories .menu-option-card')];
    
    return {
      sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
      editorDisplay: editor ? getComputedStyle(editor).display : null,
      backBtnDisplay: backBtn ? getComputedStyle(backBtn).display : null,
      navBtnDisplay: navBtn ? getComputedStyle(navBtn).display : null,
      cardsCount: cards.length,
      firstCardWidth: cards[0] ? cards[0].getBoundingClientRect().width : 0,
      firstCardHeight: cards[0] ? cards[0].getBoundingClientRect().height : 0,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });

  console.log('Mobile Level 1 (Master) Metrics:', masterMetrics);
  assert.equal(masterMetrics.sidebarDisplay, 'flex', 'Sidebar panel is visible in Level 1');
  assert.equal(masterMetrics.editorDisplay, 'none', 'Editor panel is hidden in Level 1');
  assert.equal(masterMetrics.backBtnDisplay, 'none', 'Back button is hidden in Level 1');
  assert(masterMetrics.navBtnDisplay.includes('flex'), 'Nav hamburger is visible in Level 1');
  assert.equal(masterMetrics.cardsCount, 2, 'Two category cards rendered');
  assert(masterMetrics.firstCardWidth >= 340, 'Category card is full width');
  assert(masterMetrics.firstCardHeight >= 50, 'Category card is spacious');
  assert(!masterMetrics.hasHorizontalOverflow, 'No horizontal overflow in Level 1');

  // 2. Click on First Category -> Transition to Level 2: Detail View
  await page.locator('#menu-categories .menu-option-card').first().click();
  await page.waitForTimeout(300);

  const detailMetrics = await page.evaluate(() => {
    const sidebar = document.getElementById('menu-sidebar-panel');
    const editor = document.getElementById('menu-editor-panel');
    const backBtn = document.getElementById('btn-menu-mobile-back');
    const navBtn = document.querySelector('.menu-header-nav-btn');
    const itemCards = [...document.querySelectorAll('.menu-item-row-card')];
    
    return {
      sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
      editorDisplay: editor ? getComputedStyle(editor).display : null,
      backBtnDisplay: backBtn ? getComputedStyle(backBtn).display : null,
      navBtnDisplay: navBtn ? getComputedStyle(navBtn).display : null,
      itemCardsCount: itemCards.length,
      firstItemCardWidth: itemCards[0] ? itemCards[0].getBoundingClientRect().width : 0,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });

  console.log('Mobile Level 2 (Detail) Metrics:', detailMetrics);
  assert.equal(detailMetrics.sidebarDisplay, 'none', 'Sidebar panel is hidden in Level 2');
  assert.equal(detailMetrics.editorDisplay, 'flex', 'Editor panel is visible in Level 2');
  assert(detailMetrics.backBtnDisplay.includes('flex'), 'Back button is visible in Level 2');
  assert.equal(detailMetrics.navBtnDisplay, 'none', 'Nav hamburger is hidden in Level 2');
  assert.equal(detailMetrics.itemCardsCount, 3, 'Items in selected category are rendered');
  assert(detailMetrics.firstItemCardWidth >= 340, 'Item card takes full width with padding');
  assert(!detailMetrics.hasHorizontalOverflow, 'No horizontal overflow in Level 2');

  // Inline inputs feed the same draft across sorting and Lịch bán.
  await page.evaluate(() => {
    clearMenuDirty();
    window.currentTenantFeatures = ['menu_schedule'];
    window.storeOperatingShifts = [{ id: 'lunch', name: 'Lunch', windows: [] }];
  });
  const rows = page.locator('#menu-editor-body .menu-catalog-row');
  const firstName = await rows.first().locator('.menu-item-name-input').inputValue();
  const secondName = await rows.nth(1).locator('.menu-item-name-input').inputValue();
  await rows.first().locator('.menu-item-price-input').fill('188');
  await page.evaluate(() => moveMenuItem(0, 0, 1));
  assert.equal(await rows.nth(1).locator('.menu-item-name-input').inputValue(), firstName);
  assert.equal(await rows.nth(1).locator('.menu-item-price-input').inputValue(), '188');
  assert.equal(await rows.first().locator('.menu-item-name-input').inputValue(), secondName);

  await page.evaluate(() => switchTab('menu-schedule'));
  await page.locator('.ms-matrix').waitFor();
  await page.locator('.ms-back-btn').click();
  await page.locator('#menu-categories .menu-option-card').first().click();
  assert.equal(await rows.nth(1).locator('.menu-item-price-input').inputValue(), '188');
  assert.equal(await page.evaluate(() => isMenuDirty), true);

  page.once('dialog', dialog => dialog.accept());
  await rows.first().locator('.menu-item-action-icon-btn.delete-btn').click();
  assert.equal(await rows.first().locator('.menu-item-name-input').inputValue(), firstName);
  assert.equal(await rows.first().locator('.menu-item-price-input').inputValue(), '188');

  const png = await page.evaluate(() => document.createElement('canvas').toDataURL('image/png').split(',')[1]);
  await rows.first().locator('input[type=file]').setInputFiles({
    name: 'product.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64')
  });
  const thumbnail = rows.first().locator('.menu-item-thumb-img');
  await thumbnail.waitFor();
  assert.match(await thumbnail.getAttribute('src'), /^data:image\//);

  // Test the compatibility form with the same React product rows.
  await page.evaluate(() => {
    window.__testUnifiedMenu = window.UnifiedMenu;
    window.isTenantMultilingualEnabled = () => true;
    window.getTenantAiTargetLocales = () => ['en', 'vi'];
    const originalFetch = window.fetch;
    window.fetch = async (url, options) => {
      if (!String(url).includes('/api/menu/ai-translate?')) return originalFetch(url, options);
      const [entry] = JSON.parse(options.body).entries;
      return { ok: true, json: async () => ({ byId: { [entry.id]: { en: { name: 'Translated dish' } } } }) };
    };
    window.UnifiedMenu = undefined;
    window._tenantImageList = new Set();
  });
  const details = page.locator('#itemDetailModal');
  await rows.first().locator('.menu-item-quick-actions button').first().click();
  const detailName = details.locator('#item-detail-name-input');
  const detailPrice = details.locator('#item-detail-price-input');
  assert.equal(await detailName.inputValue(), firstName);
  await detailName.fill('Canceled name');
  await page.keyboard.press('Escape');
  await details.waitFor({ state: 'hidden' });
  assert.equal(await rows.first().locator('.menu-item-name-input').inputValue(), firstName);

  await rows.first().locator('.menu-item-quick-actions button').first().click();
  await detailName.fill('React dish');
  await detailPrice.fill('210');
  await details.locator('#item-detail-i18n-details summary').click();
  await details.locator('#btn-item-detail-ai-translate').click();
  await page.waitForFunction(() => document.getElementById('item-detail-i18n-en-name').value === 'Translated dish');
  const chip = details.locator('.quick-tag-chip').first();
  await chip.click();
  assert.equal(await chip.getAttribute('aria-pressed'), 'true');
  assert.equal(await details.locator('#item-detail-badge-input').inputValue(), await chip.textContent());
  await details.locator('#btn-item-detail-done').click();
  await details.waitFor({ state: 'hidden' });
  assert.equal(await rows.first().locator('.menu-item-name-input').inputValue(), 'React dish');
  assert.equal(await rows.first().locator('.menu-item-price-input').inputValue(), '210');
  assert.equal(await page.evaluate(() => currentMenuData[0].items[0].i18n.en.name), 'Translated dish');

  await page.evaluate(() => openCreateItemModal(0));
  assert.equal(await detailName.inputValue(), '');
  await detailName.fill('New React dish');
  await detailPrice.fill('110');
  await details.locator('#item-detail-file-input').setInputFiles({
    name: 'new-product.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64')
  });
  await details.locator('#item-detail-img-preview').waitFor();
  page.once('dialog', dialog => dialog.accept());
  await details.locator('#btn-item-detail-delete-img').click();
  await details.locator('#item-detail-img-preview').waitFor({ state: 'hidden' });
  await details.locator('#btn-item-detail-done').click();
  await details.waitFor({ state: 'hidden' });
  assert.equal(await rows.last().locator('.menu-item-name-input').inputValue(), 'New React dish');
  await page.evaluate(() => {
    window.UnifiedMenu = window.__testUnifiedMenu;
    delete window.__testUnifiedMenu;
  });

  // Restore the fixture before switching to the options workspace.
  await page.evaluate(menuData => {
    currentMenuData = menuData;
    window._tenantImageList = new Set();
    renderMenuCategoryEditor(0);
    clearMenuDirty();
  }, sampleMenu);

  // 3. Click Back Button -> Return to Level 1: Master View
  await page.locator('#btn-menu-mobile-back').click();
  await page.waitForTimeout(300);

  const backMetrics = await page.evaluate(() => {
    const sidebar = document.getElementById('menu-sidebar-panel');
    const editor = document.getElementById('menu-editor-panel');
    const backBtn = document.getElementById('btn-menu-mobile-back');
    return {
      sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
      editorDisplay: editor ? getComputedStyle(editor).display : null,
      backBtnDisplay: backBtn ? getComputedStyle(backBtn).display : null
    };
  });

  console.log('Mobile Back to Master Metrics:', backMetrics);
  assert.equal(backMetrics.sidebarDisplay, 'flex', 'Sidebar is back to visible');
  assert.equal(backMetrics.editorDisplay, 'none', 'Editor is back to hidden');
  assert.equal(backMetrics.backBtnDisplay, 'none', 'Back button is hidden again');

  // 4. Switch to Options Mode -> Level 1 shows Option Groups
  await page.evaluate(() => {
    setMenuSidebarTab('options');
    renderMenuCategories();
  });
  await page.waitForTimeout(300);

  const optionsMasterMetrics = await page.evaluate(() => {
    const sidebar = document.getElementById('menu-sidebar-panel');
    const editor = document.getElementById('menu-editor-panel');
    const cards = [...document.querySelectorAll('#menu-categories .menu-option-card')];
    return {
      sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
      editorDisplay: editor ? getComputedStyle(editor).display : null,
      cardsCount: cards.length
    };
  });

  console.log('Mobile Options Master Metrics:', optionsMasterMetrics);
  assert.equal(optionsMasterMetrics.sidebarDisplay, 'flex');
  assert.equal(optionsMasterMetrics.editorDisplay, 'none');
  assert.equal(optionsMasterMetrics.cardsCount, 1, 'One option group rendered in options mode');

  // 5. Click Option Group -> Transition to Level 2 Options Detail
  await page.locator('#menu-categories .menu-option-card').first().click();
  await page.waitForTimeout(300);

  const optionsDetailMetrics = await page.evaluate(() => {
    const sidebar = document.getElementById('menu-sidebar-panel');
    const editor = document.getElementById('menu-editor-panel');
    const backBtn = document.getElementById('btn-menu-mobile-back');
    return {
      sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
      editorDisplay: editor ? getComputedStyle(editor).display : null,
      backBtnDisplay: backBtn ? getComputedStyle(backBtn).display : null
    };
  });

  console.log('Mobile Options Detail Metrics:', optionsDetailMetrics);
  assert.equal(optionsDetailMetrics.sidebarDisplay, 'none');
  assert.equal(optionsDetailMetrics.editorDisplay, 'flex');
  assert(optionsDetailMetrics.backBtnDisplay.includes('flex'));

  // 6. Test UnifiedMenu Option Groups click transition on mobile (<680px)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const fakeCatalog = {
      products: [],
      categories: [],
      groups: [
        { id: 'grp_sugar', name: '甜度選項', scope: 'item', options: [{ id: 'opt_1', name: '正常甜', price: 0 }] },
        { id: 'grp_ice', name: '冰塊選項', scope: 'item', options: [{ id: 'opt_2', name: '正常冰', price: 0 }] }
      ],
      links: []
    };
    window.fetch = async (url) => {
      if (String(url).includes('/api/menu/options')) {
        return { ok: true, json: async () => fakeCatalog };
      }
      return { ok: true, json: async () => ({}) };
    };
    await window.UnifiedMenu.load();
    setMenuSidebarTab('options');
    setMenuMobileView('master');
    window.UnifiedMenu.sidebar();
  });
  await page.waitForTimeout(300);

  // Check UnifiedMenu master view
  const umMasterMetrics = await page.evaluate(() => {
    const sidebar = document.getElementById('menu-sidebar-panel');
    const editor = document.getElementById('menu-editor-panel');
    const groupCards = [...document.querySelectorAll('#menu-categories button[data-group]')];
    return {
      sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
      editorDisplay: editor ? getComputedStyle(editor).display : null,
      groupCardsCount: groupCards.length
    };
  });
  console.log('Mobile UnifiedMenu Master Metrics:', umMasterMetrics);
  assert.equal(umMasterMetrics.sidebarDisplay, 'flex');
  assert.equal(umMasterMetrics.editorDisplay, 'none');
  assert.equal(umMasterMetrics.groupCardsCount, 2);

  // Click on UnifiedMenu group card -> Should transition to detail view!
  await page.locator('#menu-categories button[data-group="grp_sugar"]').click();
  await page.waitForTimeout(300);

  const umDetailMetrics = await page.evaluate(() => {
    const sidebar = document.getElementById('menu-sidebar-panel');
    const editor = document.getElementById('menu-editor-panel');
    const backBtn = document.getElementById('btn-menu-mobile-back');
    const title = document.getElementById('i18n-menu-workspace-title');
    const workspace = document.querySelector('.ug-workspace');
    return {
      sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
      editorDisplay: editor ? getComputedStyle(editor).display : null,
      backBtnDisplay: backBtn ? getComputedStyle(backBtn).display : null,
      titleText: title ? title.textContent : null,
      hasWorkspace: Boolean(workspace)
    };
  });
  console.log('Mobile UnifiedMenu Detail Metrics:', umDetailMetrics);
  assert.equal(umDetailMetrics.sidebarDisplay, 'none');
  assert.equal(umDetailMetrics.editorDisplay, 'flex');
  assert(umDetailMetrics.backBtnDisplay.includes('flex'));
  assert.equal(umDetailMetrics.titleText, '甜度選項');
  assert.equal(umDetailMetrics.hasWorkspace, true);

  // Click back button -> Should return to master view!
  await page.locator('#btn-menu-mobile-back').click();
  await page.waitForTimeout(300);

  const umBackMetrics = await page.evaluate(() => {
    const sidebar = document.getElementById('menu-sidebar-panel');
    const editor = document.getElementById('menu-editor-panel');
    const backBtn = document.getElementById('btn-menu-mobile-back');
    return {
      sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
      editorDisplay: editor ? getComputedStyle(editor).display : null,
      backBtnDisplay: backBtn ? getComputedStyle(backBtn).display : null
    };
  });
  console.log('Mobile UnifiedMenu Back Metrics:', umBackMetrics);
  assert.equal(umBackMetrics.sidebarDisplay, 'flex');
  assert.equal(umBackMetrics.editorDisplay, 'none');
  assert.equal(umBackMetrics.backBtnDisplay, 'none');

  // 7. Test Tablet & Desktop (Ensure 0 regression on larger screens)
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(300);

  const tabletMetrics = await page.evaluate(() => {
    const sidebar = document.getElementById('menu-sidebar-panel');
    const editor = document.getElementById('menu-editor-panel');
    const backBtn = document.getElementById('btn-menu-mobile-back');
    return {
      sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
      editorDisplay: editor ? getComputedStyle(editor).display : null,
      backBtnDisplay: backBtn ? getComputedStyle(backBtn).display : null
    };
  });

  console.log('Tablet (820x1180) Metrics:', tabletMetrics);
  assert(tabletMetrics.sidebarDisplay !== 'none', 'Tablet shows sidebar');
  assert(tabletMetrics.editorDisplay !== 'none', 'Tablet shows editor');
  assert.equal(tabletMetrics.backBtnDisplay, 'none', 'Back button is never shown on tablet');

  assert.deepEqual(errors, [], 'No runtime JS errors');
  console.log('PASS: 2-Level Master-Detail Mobile Menu and Tablet Compatibility Verified!');

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
