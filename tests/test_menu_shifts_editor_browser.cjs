const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const browserName = process.env.MENU_QA_BROWSER || 'chromium';
const browserType = require('playwright')[browserName];

const artifacts = path.resolve(process.env.MENU_SHIFTS_ARTIFACTS || 'artifacts/menu-shifts-20261118');
for (const [locale, width] of [['vi', 768], ['zh-TW', 1024], ['vi', 390]]) {
  test(`shift editor validates local ranges and saves its own revisioned draft (${locale}, ${width})`, async t => {
    fs.mkdirSync(artifacts, { recursive: true });
    const browser = await browserType.launch(); t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width, height: 1024 }, hasTouch: true });
    const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
    const hours = {}; for (let d = 1; d <= 5; d++) hours[d] = [{ start: '11:00', end: d === 5 ? '19:00' : '22:30' }];
    const shifts = [ ['lunch', '午餐', '11:00', '13:30', 5], ['dinner', '晚餐', '16:30', '19:00', 5], ['late', '宵夜', '21:00', '22:30', 4] ].map(([id, name, startTime, endTime, n]) => ({ id, name, shiftType: 'operating', isActive: true, windows: Array.from({ length:n }, (_, i) => ({ id: `${id}-${i}`, dayOfWeek:i+1, startTime, endTime })) }));
    const writes=[];
    await page.route('https://worker.test/**', async route => {
      if(route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,PUT'}});
      let saved=shifts,revision=3;
      if(route.request().method()==='PUT'){const body=route.request().postDataJSON();writes.push(body);saved=body.operatingShifts;revision=4;}
      return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({operatingHours:hours,operatingShifts:saved,scheduleRevision:revision})});
    });
    await page.setContent('<style>html,body{margin:0;font-family:Arial;--menu-font-md:15px;--menu-font-base:15px;--menu-font-2xl:20px;--menu-font-sm:13px;--border:#d4d9d5}body{height:100vh;display:flex}</style><div id="menu-schedule-workspace-root"></div>');
    await page.addStyleTag({path:'css/orders-menu.css'});
    await page.evaluate(({shifts,locale})=>{window.currentTenantFeatures=['menu_schedule'];window.storeOperatingShifts=shifts;window.WORKER_BASE='https://worker.test';window.getTenantIdFromUrl=()=> 'store';window.currentMenuData=[{id:'main',type:'catalog',title:'Main',items:[{id:'food',name:'Rice',price:50}]}];window.alert=()=>{};window.confirm=()=>true;window.localStorage={getItem:()=>locale};}, {shifts,locale});
    for(const script of ['menu-schedule','orders-i18n','orders-settings','orders-menu-shifts','orders-menu-schedule']) await page.addScriptTag({path:`js/${script}.js`});
    await page.evaluate(async ({shifts,locale})=>{currentLang=locale;window.currentLang=locale;storeOperatingShifts=shifts;window.storeOperatingShifts=shifts;await initMenuScheduleWorkspace();await openMenuShiftEditor();},{shifts,locale});
    const firstStart=()=>page.locator('#menu-shifts-cards input[type=time]').first();
    await firstStart().fill('10:00'); await firstStart().press('Tab');
    await page.locator('#btn-save-menu-shifts').click();
    assert.equal(writes.length,0);
    assert(await page.locator('#menu-shifts-error .ms-shift-error-list').textContent());
    await page.evaluate(() => { window.__openedHours = 0; window.__origOpenHours = window.openHoursSettingsFromSchedule; window.openHoursSettingsFromSchedule = () => { window.__openedHours++; }; });
    await page.locator('.ms-shift-error-hours-btn').click();
    assert.equal(await page.evaluate(() => { window.openHoursSettingsFromSchedule = window.__origOpenHours; return window.__openedHours; }), 1);
    await firstStart().fill('11:00'); await firstStart().press('Tab');
    const name=page.locator('#menu-shifts-cards input[type=text]').first(); await name.fill('午餐 A'); await name.press('Tab');
    assert(await page.locator('.ms-table-scroll').evaluate(el=>el.inert));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.screenshot({path:path.join(artifacts,`editor-${browserName}-${locale}-${width}.png`),fullPage:true});
    await page.locator('#btn-save-menu-shifts').click();
    await page.waitForFunction(()=>!hasUnsavedMenuShiftChanges());
    assert.equal(writes.length,1); assert.equal(writes[0].scheduleRevision,3); assert.equal(writes[0].operatingShifts[0].name,'午餐 A'); assert.equal(writes[0].operatingHours,undefined);
    assert.deepEqual(pageErrors,[]);
  });
}
