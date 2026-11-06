const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');

const root = path.resolve(__dirname, '..');
const browserLauncher = playwright[process.env.MENU_QA_BROWSER || 'chromium'];

function createMinimalBootstrap() {
    return {
        bootstrapVersion: 3,
        menuComplete: true,
        unifiedMenu: true,
        orderDetailVersion: 1,
        modifiers: [],
        customizationCategoryId: 'sec-flavor',
        tenant: {
            id: 'jiangjiejie',
            brandName: '蔣姐姐鹹水雞',
            allowScheduledPickup: true,
            allowDineIn: false,
            features: [],
            orderPrefix: 'JJ',
            storeStatus: 'open',
            locale: 'zh-TW'
        },
        catalog: [
            {
                id: 'cat_food',
                slug: 'food',
                name: '單點',
                shortName: '單點',
                sortOrder: 1,
                items: [
                    {
                        id: 'item_chicken',
                        name: '鹹水雞半隻',
                        price: 120,
                        isOutOfStock: false
                    }
                ]
            }
        ],
        customizations: [
            {
                id: 'custom_mod_jj_chili',
                key: 'custom_mod_jj_chili',
                scope: 'order',
                title: '辣椒',
                type: 'radio',
                isRequired: false,
                sortOrder: 0,
                options: [
                    {
                        id: 'custom_mod_jj_chili_包辣',
                        name: '不要',
                        price: 0,
                        isDefault: false,
                        isOutOfStock: false
                    },
                    {
                        id: 'custom_mod_jj_chili_微',
                        name: '微',
                        price: 0,
                        isDefault: false,
                        isOutOfStock: false
                    },
                    {
                        id: 'custom_mod_jj_chili_小',
                        name: '小',
                        price: 0,
                        isDefault: false,
                        isOutOfStock: false
                    }
                ]
            },
            {
                id: 'custom_mod_jj_chicken_prep',
                key: 'custom_mod_jj_chicken_prep',
                scope: 'order',
                title: '雞肉處理',
                type: 'radio',
                isRequired: false,
                sortOrder: 1,
                options: [
                    {
                        id: 'custom_mod_jj_chicken_prep_去骨',
                        name: '去骨',
                        price: 0,
                        isDefault: false,
                        isOutOfStock: false,
                        sub_options: [
                            { id: 'sub_skinless', name: '去皮', price: 0, isOutOfStock: false }
                        ]
                    },
                    {
                        id: 'custom_mod_jj_chicken_prep_不去骨',
                        name: '不去骨',
                        price: 0,
                        isDefault: false,
                        isOutOfStock: false,
                        sub_options: [
                            { id: 'sub_skinless', name: '去皮', price: 0, isOutOfStock: false }
                        ]
                    }
                ]
            },
            {
                id: 'custom_mod_extras',
                key: 'custom_mod_extras',
                scope: 'order',
                title: '加料',
                type: 'checkbox',
                isRequired: false,
                sortOrder: 2,
                options: [
                    {
                        id: 'opt_extra_egg',
                        name: '加滷蛋',
                        price: 15,
                        is_default: true,
                        isOutOfStock: false
                    },
                    {
                        id: 'opt_extra_tofu',
                        name: '加百頁豆腐',
                        price: 20,
                        is_default: false,
                        isOutOfStock: false
                    }
                ]
            }
        ]
    };
}

describe('Order Customizations Preservation Browser Regression', () => {
    let browser;
    let page;
    let currentBootstrap;

    before(async () => {
        browser = await browserLauncher.launch();
        page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        currentBootstrap = createMinimalBootstrap();

        await page.addInitScript(() => {
            window.liff = {
                init: async () => {},
                ready: Promise.resolve(),
                isLoggedIn: () => true,
                isInClient: () => false,
                getOS: () => 'web',
                getLanguage: () => 'zh-TW',
                getContext: () => null,
                getProfile: async () => ({ userId: 'guest_test', displayName: 'TestUser' }),
                permission: { query: async () => ({ state: 'unavailable' }) },
                login: () => {},
                sendMessages: () => { throw new Error('No external messages'); }
            };
        });

        await page.route('**/*', async route => {
            const req = route.request();
            const u = new URL(req.url());
            if (req.method() !== 'GET') {
                return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'TEST_NO_WRITES' }) });
            }
            if (u.pathname === '/api/tenant/bootstrap') {
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify(currentBootstrap) });
            }
            if (u.origin === 'https://order.local.invalid') {
                const name = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\//, '');
                const file = path.resolve(root, name);
                if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
                    return route.fulfill({ status: 404, body: '' });
                }
                const ext = path.extname(file);
                const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
                return route.fulfill({ contentType: types[ext] || 'application/octet-stream', body: fs.readFileSync(file) });
            }
            return route.fulfill({
                status: 200,
                contentType: u.pathname.endsWith('.css') ? 'text/css' : u.pathname.includes('/api/') ? 'application/json' : 'text/javascript',
                body: u.pathname.includes('/api/') ? '{}' : ''
            });
        });

        await page.goto('https://order.local.invalid/?tenant_id=jiangjiejie', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.bootstrapData?.menuComplete && document.querySelector('input[name="opt-custom_mod_jj_chili"]'));
        await page.evaluate(() => {
            cart['food_鹹水雞半隻'] = 1;
            checkDesktopAuthGuard = () => true;
            updateTotal();
        });
    });

    after(async () => {
        if (browser) await browser.close();
    });

    test('1. First-load paid checkbox stays unchecked even with is_default:true', async () => {
        const checkboxState = await page.evaluate(() => {
            const eggCheckbox = document.querySelector('input[name="opt-custom_mod_extras"][value="加滷蛋"]');
            return {
                exists: Boolean(eggCheckbox),
                checked: eggCheckbox ? eggCheckbox.checked : null
            };
        });
        assert.equal(checkboxState.exists, true, 'Paid checkbox exists in DOM');
        assert.equal(checkboxState.checked, false, 'Paid checkbox must not be auto-checked on first load');
    });

    test('2. Radio choice and zero-price typed ID survive catalog rerender', async () => {
        // Select non-default radio "微" ($0, optionId: "custom_mod_jj_chili_微")
        await page.locator('input[name="opt-custom_mod_jj_chili"][value="微"]').evaluate(el => {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const beforeState = await page.evaluate(() => ({
            visible: document.querySelector('input[name="opt-custom_mod_jj_chili"]:checked')?.value,
            typed: DetailCheckout.selections().find(g => g.groupId === 'custom_mod_jj_chili')
        }));
        assert.equal(beforeState.visible, '微');
        assert.equal(beforeState.typed.items[0].optionId, 'custom_mod_jj_chili_微');

        // Simulate refresh with changed bootstrap
        const refreshResult = await page.evaluate(async () => {
            const fresh = structuredClone(bootstrapData);
            fresh.tenant.probeMarker = 'changed_radio_' + Date.now();
            fetch = async () => ({ ok: true, json: async () => fresh });
            await fetchMenu();
            return {
                visible: document.querySelector('input[name="opt-custom_mod_jj_chili"]:checked')?.value,
                typed: DetailCheckout.selections().find(g => g.groupId === 'custom_mod_jj_chili')
            };
        });

        assert.equal(refreshResult.visible, '微', 'Visible selection should stay 微 instead of resetting to default 不要');
        assert.equal(refreshResult.typed.items[0].optionId, 'custom_mod_jj_chili_微', 'Typed optionId should be custom_mod_jj_chili_微');
    });

    test('3. Sub-options and parent radio choice are preserved with correct visibility', async () => {
        // Select "不去骨" in chicken prep group, and check "去皮" sub-option
        await page.locator('input[name="opt-custom_mod_jj_chicken_prep"][value="不去骨"]').evaluate(el => {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.locator('.sub-opt-chk[data-flavor="不去骨"][value="去皮"]').evaluate(el => {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const beforeState = await page.evaluate(() => {
            const container = document.querySelector('.sub-option-container[data-parent-flavor="不去骨"]');
            return {
                radioChecked: document.querySelector('input[name="opt-custom_mod_jj_chicken_prep"][value="不去骨"]')?.checked,
                subDisplay: container ? window.getComputedStyle(container).display : null,
                subChecked: document.querySelector('.sub-opt-chk[data-flavor="不去骨"][value="去皮"]')?.checked,
                typed: DetailCheckout.selections().find(g => g.groupId === 'custom_mod_jj_chicken_prep')
            };
        });
        assert.equal(beforeState.radioChecked, true);
        assert.equal(beforeState.subDisplay, 'flex');
        assert.equal(beforeState.subChecked, true);
        assert.equal(beforeState.typed.items[0].subOptions[0].id, 'sub_skinless');

        // Rerender catalog
        const afterState = await page.evaluate(async () => {
            const fresh = structuredClone(bootstrapData);
            fresh.tenant.probeMarker = 'changed_subopts_' + Date.now();
            fetch = async () => ({ ok: true, json: async () => fresh });
            await fetchMenu();

            const container = document.querySelector('.sub-option-container[data-parent-flavor="不去骨"]');
            const otherContainer = document.querySelector('.sub-option-container[data-parent-flavor="去骨"]');
            return {
                radioChecked: document.querySelector('input[name="opt-custom_mod_jj_chicken_prep"][value="不去骨"]')?.checked,
                subDisplay: container ? window.getComputedStyle(container).display : null,
                subChecked: document.querySelector('.sub-opt-chk[data-flavor="不去骨"][value="去皮"]')?.checked,
                otherDisplay: otherContainer ? window.getComputedStyle(otherContainer).display : null,
                typed: DetailCheckout.selections().find(g => g.groupId === 'custom_mod_jj_chicken_prep')
            };
        });

        assert.equal(afterState.radioChecked, true, 'Parent radio choice 不去骨 should stay checked');
        assert.equal(afterState.subDisplay, 'flex', 'Sub-option container for selected radio must be visible (flex)');
        assert.equal(afterState.subChecked, true, 'Sub-option 去皮 must remain checked');
        assert.equal(afterState.otherDisplay, 'none', 'Sub-option container for unselected radio must remain hidden');
        assert.equal(afterState.typed.items[0].subOptions[0].id, 'sub_skinless');
    });

    test('4. Unavailable sub-option (isOos / isOutOfStock) is not restored', async () => {
        // Ensure "不去骨" + "去皮" selected
        await page.locator('input[name="opt-custom_mod_jj_chicken_prep"][value="不去骨"]').evaluate(el => {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.locator('.sub-opt-chk[data-flavor="不去骨"][value="去皮"]').evaluate(el => {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const result = await page.evaluate(async () => {
            const fresh = structuredClone(bootstrapData);
            fresh.tenant.probeMarker = 'changed_sub_oos_' + Date.now();
            const prepGroup = fresh.customizations.find(g => g.key === 'custom_mod_jj_chicken_prep');
            const optNoBone = prepGroup.options.find(o => o.name === '不去骨');
            optNoBone.sub_options[0].isOos = true;
            fetch = async () => ({ ok: true, json: async () => fresh });
            await fetchMenu();

            const subChk = document.querySelector('.sub-opt-chk[data-flavor="不去骨"][value="去皮"]');
            return {
                checked: subChk?.checked,
                disabled: subChk?.disabled
            };
        });

        assert.equal(result.checked, false, 'isOos sub-option must not be restored');
        assert.equal(result.disabled, true, 'isOos sub-option must be disabled');
    });

    test('5. Checkbox selection is preserved across rerender, while sold-out checkbox is invalidated', async () => {
        // Check "加百頁豆腐"
        await page.locator('input[name="opt-custom_mod_extras"][value="加百頁豆腐"]').evaluate(el => {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Rerender with normal bootstrap
        const preserved = await page.evaluate(async () => {
            const fresh = structuredClone(bootstrapData);
            fresh.tenant.probeMarker = 'changed_chk_preserve_' + Date.now();
            fetch = async () => ({ ok: true, json: async () => fresh });
            await fetchMenu();
            return document.querySelector('input[name="opt-custom_mod_extras"][value="加百頁豆腐"]')?.checked;
        });
        assert.equal(preserved, true, 'Valid checked checkbox must remain checked across rerender');

        // Rerender with "加百頁豆腐" sold out
        const invalidated = await page.evaluate(async () => {
            const fresh = structuredClone(bootstrapData);
            fresh.tenant.probeMarker = 'changed_chk_oos_' + Date.now();
            const extras = fresh.customizations.find(g => g.key === 'custom_mod_extras');
            const tofu = extras.options.find(o => o.name === '加百頁豆腐');
            tofu.isOutOfStock = true;
            fetch = async () => ({ ok: true, json: async () => fresh });
            await fetchMenu();
            const el = document.querySelector('input[name="opt-custom_mod_extras"][value="加百頁豆腐"]');
            return { checked: el?.checked, disabled: el?.disabled };
        });
        assert.equal(invalidated.checked, false, 'Sold out checkbox must not be checked');
        assert.equal(invalidated.disabled, true, 'Sold out checkbox must be disabled');
    });

    test('6. Sold-out radio option falls back to valid default', async () => {
        await page.locator('input[name="opt-custom_mod_jj_chili"][value="微"]').evaluate(el => {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const result = await page.evaluate(async () => {
            const fresh = structuredClone(bootstrapData);
            fresh.tenant.probeMarker = 'changed_oos_' + Date.now();
            const chiliGroup = fresh.customizations.find(g => g.key === 'custom_mod_jj_chili');
            const optWei = chiliGroup.options.find(o => o.name === '微' || o.id === 'custom_mod_jj_chili_微');
            if (optWei) {
                optWei.isOutOfStock = true;
            }
            fetch = async () => ({ ok: true, json: async () => fresh });
            await fetchMenu();

            const weiRadio = document.querySelector('input[name="opt-custom_mod_jj_chili"][value="微"]');
            const checkedRadio = document.querySelector('input[name="opt-custom_mod_jj_chili"]:checked');
            return {
                weiChecked: weiRadio?.checked,
                weiDisabled: weiRadio?.disabled,
                checkedValue: checkedRadio?.value
            };
        });

        assert.equal(result.weiChecked, false, 'Sold-out option must not be checked');
        assert.equal(result.weiDisabled, true, 'Sold-out option must be disabled');
        assert.equal(result.checkedValue, '不要', 'Radio group should fall back to first available valid default (不要)');
    });

    test('7. Tenant isolation: state does not leak to a different tenant', async () => {
        const result = await page.evaluate(async () => {
            // Reuse group and option IDs across stores so this checks tenant
            // ownership, rather than merely failing to find an old option ID.
            const previous = bootstrapData.customizations.find(g => g.key === 'custom_mod_jj_chili');
            previous.options.find(o => o.id === 'custom_mod_jj_chili_微').isOutOfStock = false;
            renderDynamicCatalog();
            document.querySelector('input[name="opt-custom_mod_jj_chili"][value="微"]').checked = true;
            const fresh = structuredClone(bootstrapData);
            fresh.tenant.id = 'benmi';
            fresh.tenant.brandName = 'Benmi Other Store';
            fresh.customizations = [
                {
                    id: 'custom_mod_jj_chili',
                    key: 'custom_mod_jj_chili',
                    scope: 'order',
                    title: '辣椒',
                    type: 'radio',
                    options: [
                        { id: 'custom_mod_jj_chili_包辣', name: '不辣', isDefault: false },
                        { id: 'custom_mod_jj_chili_微', name: '大辣', isDefault: false }
                    ]
                }
            ];
            window.getTenantIdFromUrl = () => 'benmi';
            fetch = async () => ({ ok: true, json: async () => fresh });
            await fetchMenu();

            const checkedRadio = document.querySelector('input[name="opt-custom_mod_jj_chili"]:checked');
            return {
                checkedValue: checkedRadio?.value,
                checkedOptionId: checkedRadio?.getAttribute('data-option-id')
            };
        });

        assert.equal(result.checkedValue, '不辣', 'New tenant must start with its own default option');
        assert.equal(result.checkedOptionId, 'custom_mod_jj_chili_包辣');
    });
});
