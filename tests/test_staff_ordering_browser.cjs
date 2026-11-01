const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {fixture} = require('./helpers/staff-ordering.cjs');
const {handleStaffRoute} = require('../benmi-worker-official/src/modules/staff.ts');
const {getTenantBootstrap} = require('../benmi-worker-official/src/modules/bootstrap.ts');
const {getOptionCatalog} = require('../benmi-worker-official/src/modules/option-groups.ts');
const {chromium,webkit} = require('playwright');

for (const [name,engine] of Object.entries({chromium,webkit})) test(`${name}: staff ordering with real D1 on tablet and mobile, both languages`,async t=>{
  const f=await fixture(t);
  await f.apply(`INSERT INTO modifier_groups(id,tenant_id,name,selection_type,is_required,min_selection,max_selection,scope)
    VALUES('sauce-a','a','Sauce','single',1,1,1,'item'),('order-a','a','Whole order','single',0,0,1,'order');
    INSERT INTO modifier_options(id,tenant_id,group_id,name,price,is_default)
      VALUES('sauce-choice','a','sauce-a','Sauce',10,0),('order-choice','a','order-a','Whole order choice',5,1);
    INSERT INTO item_modifier_links(tenant_id,item_id,group_id) VALUES('a','meal-a','sauce-a');`);
  const server=http.createServer((req,res)=>{
    const file=path.resolve(new URL(req.url,'http://local').pathname.slice(1));
    if (!file.startsWith(process.cwd()+path.sep) || !fs.existsSync(file)) {res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const browser=await engine.launch({headless:true});t.after(()=>browser.close());
  const output=process.env.STAFF_SCREENSHOT_DIR || 'artifacts/release-baseline/staff-ordering';fs.mkdirSync(output,{recursive:true});
  let caseNumber=0;
  for(const viewport of [{width:1024,height:768},{width:768,height:1024},{width:390,height:844}]) for(const locale of ['vi','zh-TW']) {
    caseNumber++;
    const tableId=`browser-${caseNumber}`;await f.DB.prepare("INSERT INTO restaurant_tables(id,tenant_id,label) VALUES (?,'a',?)").bind(tableId,tableId).run();
    const context=await browser.newContext({viewport});const page=await context.newPage();
    page.setDefaultTimeout(8000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
    await page.addInitScript(lang=>localStorage.setItem('staff_order_lang',lang),locale);
    let loseFirstResponse=name==='chromium' && caseNumber===1;const sent=[];
    await page.route('**/api/**',async route=>{
      try {
        const r=route.request(),url=new URL(r.url()),p=url.pathname;
        const request=new Request(r.url(),{method:r.method(),headers:r.headers(),...(['GET','HEAD'].includes(r.method())?{}:{body:r.postData()})});
        let response;
        if(p.startsWith('/api/staff')) response=await handleStaffRoute(request,f.env,p,f.context('a'));
        else if(p==='/api/tenant/bootstrap') response=await getTenantBootstrap(request,f.env);
        else if(p==='/api/menu/options') response=await getOptionCatalog(request,f.env);
        else response=new Response('{}',{status:404});
        if(p==='/api/staff/orders' && r.method()==='POST') {
          sent.push(JSON.parse(r.postData()));
          if(loseFirstResponse) {loseFirstResponse=false;await route.abort();return;}
        }
        await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
      } catch(e) {errors.push(String(e));await route.fulfill({status:500,body:'{}'});}
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/staff-order.html?tenant_id=a&env=dev`);
    await page.fill('#inp-pin','1234');await page.click('#btn-submit-login');
    await page.locator('.table-card').filter({hasText:tableId}).click();
    await page.locator('.btn-quick-add').first().click();
    await page.locator('#unified-option-modal [data-choose],#unified-option-modal [data-add]').first().click();
    await page.locator('#unified-option-modal [data-confirm]').click();
    if(viewport.width<900) await page.click('#i18n-btn-view-cart');
    await page.waitForFunction(()=>document.querySelector('#cart-summary-total').textContent==='$115');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(output,`${name}-${viewport.width}-${locale}.png`),fullPage:true,animations:"disabled"});
    await page.click('#btn-submit-order');
    if(name==='chromium' && caseNumber===1) {
      await page.waitForFunction(()=>!document.querySelector('#btn-submit-order').disabled);
      await page.click('#btn-submit-order');
      await page.locator('#successModal').waitFor({state:'visible'});
      assert.equal(sent.length,2);assert.equal(sent[0].requestId,sent[1].requestId);
    } else await page.locator('#successModal').waitFor({state:'visible'});
    const order=await f.DB.prepare('SELECT * FROM orders WHERE table_id=?').bind(tableId).first();
    assert.equal(order.total_amount,115);assert.equal(order.round_count,1);
    assert.equal((await f.DB.prepare('SELECT count(*) n FROM orders WHERE table_id=?').bind(tableId).first()).n,1);
    if (name === 'chromium' && caseNumber === 1) {
      await page.click('#i18n-btn-success-back');
      await page.locator('.table-card').filter({hasText:tableId}).click();
      await page.locator('.btn-quick-add').first().click();
      await page.locator('#unified-option-modal [data-choose],#unified-option-modal [data-add]').first().click();
      await page.locator('#unified-option-modal [data-confirm]').click();
      const changed = await f.call(`/api/staff/orders/${order.key}/status`,{status:'DONE',expectedRevision:1},f.token,'PATCH');
      assert.equal(changed.http,200);
      await f.DB.prepare("UPDATE menu_items SET price=120 WHERE id='meal-a'").run();
      await page.click('#btn-submit-order');await page.locator('#conflictModal').waitFor({state:'visible'});
      await page.click('#i18n-btn-resolve-conflict');
      await page.click('#btn-submit-order');await page.locator('#successModal').waitFor({state:'visible'});
      const appended = await f.DB.prepare('SELECT total_amount,round_count,revision FROM orders WHERE key=?').bind(order.key).first();
      assert.deepEqual(appended,{total_amount:250,round_count:2,revision:3});
      await f.DB.prepare("UPDATE menu_items SET price=100 WHERE id='meal-a'").run();
      await f.env.ORDER_STATE.delete('tenant:a:bootstrap:v2');
      await f.env.ORDER_STATE.delete('tenant:a:bootstrap');
    }
    assert.deepEqual(errors,[]);
    await context.close();
  }
});
