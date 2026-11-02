const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/staff-ordering.cjs');
const { handleAuth, handleAuthChange } = require('../benmi-worker-official/src/modules/auth.ts');
const { verifyStaffSession, sha256Hex } = require('../benmi-worker-official/src/modules/staff.ts');

function change(f, body, env = f.env) {
  return handleAuthChange(new Request('https://local.test/api/auth/change?tenant_id=a', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }), env, f.context('a'));
}

async function login(f, pin, tenant = 'a') {
  return handleAuth(new Request(`https://local.test/api/auth?tenant_id=${tenant}`, {
    method: 'POST', body: JSON.stringify({ password: pin })
  }), f.env, undefined, f.context(tenant));
}

test('PIN changes preserve leading zeros and revoke only the selected tenant sessions', async t => {
  const f = await fixture(t);
  const otherToken = 'b'.repeat(64);
  await f.DB.prepare(`INSERT INTO staff_sessions(token_hash,tenant_id,pin_hash,expires_at,created_at)
    VALUES (?,'b',?,datetime('now','+1 hour'),datetime('now'))`)
    .bind(await sha256Hex(otherToken), await sha256Hex('1234')).run();
  const session = (tenant, token) => new Request(`https://local.test/api/staff/tables?tenant_id=${tenant}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal((await change(f, { current: '1234', newPassword: '0000', tenant_id: 'a' })).status, 200);
  assert.equal((await login(f, '0000')).status, 200);
  assert.equal((await login(f, '1234')).status, 401);
  assert.equal(await verifyStaffSession(session('a', f.token), f.env, 'a'), null);
  assert(await verifyStaffSession(session('b', otherToken), f.env, 'b'));
  assert.equal((await login(f, '1234', 'b')).status, 200);
  assert.equal((await change(f, { current: '0000', newPassword: '00123456' })).status, 200);
  assert.equal((await login(f, '00123456')).status, 200);
  assert.equal(await f.env.ORDER_STATE.get('tenant:a:password'), '00123456');
});

test('new PIN format and JSON types are validated without changing credentials or sessions', async t => {
  const f = await fixture(t);
  for (const newPassword of [undefined, null, '', '123', '123456789', '12ab', ' 1234', '1234 ', '1234\n', '１２３４', 1234, {}, [], true]) {
    const response = await change(f, { current: '1234', newPassword });
    assert.equal(response.status, 400, JSON.stringify(newPassword));
    assert.equal((await response.json()).error, 'INVALID_NEW_PIN');
  }
  for (const body of [null, [], false, {}, { current: 1234, newPassword: '5678' }, { current: '1234', newPassword: '5678', tenant_id: {} }]) {
    assert.equal((await change(f, body)).status, 400);
  }
  const malformed = await handleAuthChange(new Request('https://local.test/api/auth/change', {
    method: 'POST', body: '{'
  }), f.env, f.context('a'));
  assert.equal(malformed.status, 400);
  assert.equal((await change(f, { current: 'wrong', newPassword: '5678' })).status, 401);
  assert.equal(await f.env.ORDER_STATE.get('tenant:a:password'), '1234');
  assert.equal((await f.call('/api/staff/tables', null, f.token)).http, 200);
});

test('legacy alphanumeric PINs can be changed, inactive and unknown tenants cannot', async t => {
  const f = await fixture(t);
  await f.env.ORDER_STATE.put('tenant:a:password', 'Legacy PIN');
  assert.equal((await change(f, { current: 'Legacy PIN', newPassword: '012345' })).status, 200);
  assert.equal((await login(f, '012345')).status, 200);
  assert.equal((await change(f, { current: '012345', newPassword: '5678', tenant_id: 'missing' })).status, 404);
  await f.DB.prepare("UPDATE tenant_config SET is_active=0 WHERE tenant_id='a'").run();
  await f.env.ORDER_STATE.delete('tenant:a:config_cache');
  assert.equal((await handleAuthChange(new Request('https://local.test/api/auth/change?tenant_id=a', {
    method: 'POST', body: JSON.stringify({ current: '012345', newPassword: '5678' })
  }), f.env)).status, 404);
  assert.equal(await f.env.ORDER_STATE.get('tenant:a:password'), '012345');
});

test('unavailable PIN storage never reports success or revokes sessions', async t => {
  const f = await fixture(t);
  const body = { current: '1234', newPassword: '5678' };
  for (const ORDER_STATE of [undefined,
    { ...f.env.ORDER_STATE, get: async () => { throw new Error('read failed'); } },
    { ...f.env.ORDER_STATE, put: async () => { throw new Error('write failed'); } }
  ]) {
    const response = await change(f, body, { ...f.env, ORDER_STATE });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: 'PIN_STORAGE_UNAVAILABLE' });
  }
  assert.equal(await f.env.ORDER_STATE.get('tenant:a:password'), '1234');
  assert.equal((await f.call('/api/staff/tables', null, f.token)).http, 200);
});
