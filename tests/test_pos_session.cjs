const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/staff-ordering.cjs');
const {handlePosSession}=require('../benmi-worker-official/src/modules/pos-session.ts');
const {verifyStaffSession}=require('../benmi-worker-official/src/modules/staff.ts');
const request=(body,token,method=body?'POST':'GET')=>new Request('https://local.test/api/pos/session',{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('POS session works for tenant without staff ordering; token is tenant scoped and revocable',async t=>{
 const f=await fixture(t),tenant=f.context('b');
 const response=await handlePosSession(request({password:'1234'}),f.env,tenant);
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
 const session=await response.json();assert.ok(session.token);
 assert.ok(await verifyStaffSession(request(undefined,session.token),f.env,'b'));
 assert.equal(await verifyStaffSession(request(undefined,session.token),f.env,'a'),null);
 assert.equal((await handlePosSession(request(undefined,session.token,'DELETE'),f.env,tenant)).status,200);
 assert.equal(await verifyStaffSession(request(undefined,session.token),f.env,'b'),null);
});
test('login throttles invalid PIN attempts and stores no plaintext token',async t=>{
 const f=await fixture(t),tenant=f.context('b');
 for(let i=0;i<20;i++) assert.equal((await handlePosSession(request({password:'incorrect'}),f.env,tenant)).status,401);
 assert.equal((await handlePosSession(request({password:'1234'}),f.env,tenant)).status,429);
 const count=await f.DB.prepare("SELECT count(*) n FROM staff_sessions WHERE tenant_id='b'").first();assert.equal(count.n,0);
});
test('PIN change and expiry invalidate existing session',async t=>{
 const f=await fixture(t),tenant=f.context('b');
 const response=await handlePosSession(request({password:'1234'}),f.env,tenant),session=await response.json();
 await f.env.ORDER_STATE.put('tenant:b:password','9999');
 assert.equal((await handlePosSession(request(undefined,session.token),f.env,tenant)).status,401);
 await f.env.ORDER_STATE.put('tenant:b:password','1234');
 await f.DB.prepare("UPDATE staff_sessions SET expires_at=datetime('now','-1 second') WHERE tenant_id='b'").run();
 assert.equal((await handlePosSession(request(undefined,session.token),f.env,tenant)).status,401);
});
