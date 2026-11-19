const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const markup = read('orders.html').match(/<section id="pos-screen-orientation"[\s\S]*?<\/section>/)[0];

async function fixture(t, { native = true, plugin, storage = { mode: 'landscape' } } = {}) {
  const dom = new JSDOM(markup, { url: 'https://pos.test', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  const writes = [];
  const bridge = plugin === null ? null : plugin || {
    async getMode() { return { mode: storage.mode }; },
    async setMode({ mode }) { writes.push(mode); storage.mode = mode; return { mode }; }
  };
  w.isNativeAppPlatform = () => native;
  w.Capacitor = { Plugins: { POSScreenOrientation: bridge } };
  w.eval(read('js/orders-i18n.js'));
  w.eval(read('js/orders-orientation.js'));
  await new Promise(resolve => setImmediate(resolve));
  return {
    w, writes, storage,
    section: w.document.getElementById('pos-screen-orientation'),
    status: w.document.getElementById('pos-screen-orientation-status'),
    radios: [...w.document.querySelectorAll('input')],
    selected: () => w.document.querySelector('input:checked')?.value
  };
}

test('device modes round-trip through the native bridge and survive page reloads', async t => {
  const storage = { mode: 'landscape' };
  const f = await fixture(t, { storage });
  assert.equal(f.section.hidden, false);
  assert.equal(f.selected(), 'landscape');
  for (const mode of ['portrait', 'auto', 'landscape']) {
    await f.w.selectPOSScreenOrientation(mode);
    assert.equal(f.selected(), mode);
    assert.equal(storage.mode, mode);
    const reopened = await fixture(t, { storage });
    assert.equal(reopened.selected(), mode);
  }
  assert.deepEqual(f.writes, ['portrait', 'auto', 'landscape']);
});

test('browser hides the native setting; old APK explains why it is unavailable', async t => {
  const web = await fixture(t, { native: false });
  assert.equal(web.section.hidden, true);
  const old = await fixture(t, { plugin: null });
  assert.equal(old.section.hidden, false);
  assert(old.radios.every(radio => radio.disabled));
  assert.equal(old.status.dataset.posDisplayI18n, 'orientationUpdateRequired');
  await old.w.selectPOSScreenOrientation('portrait');
  assert.equal(old.selected(), undefined);
});

test('native write failure restores the previous radio selection and permits retry', async t => {
  let fail = true;
  const f = await fixture(t, { plugin: {
    async getMode() { return { mode: 'landscape' }; },
    async setMode({ mode }) { if (fail) throw new Error('Native failure'); return { mode }; }
  } });
  f.radios.find(radio => radio.value === 'portrait').checked = true;
  await f.w.selectPOSScreenOrientation('portrait');
  assert.equal(f.selected(), 'landscape');
  assert.equal(f.status.dataset.posDisplayI18n, 'orientationSaveFailed');
  assert(f.radios.every(radio => !radio.disabled));
  fail = false;
  await f.w.selectPOSScreenOrientation('portrait');
  assert.equal(f.selected(), 'portrait');
});

test('pending native writes prevent overlapping mutations and setting reads', async t => {
  let finish;
  let reads = 0;
  const calls = [];
  const f = await fixture(t, { plugin: {
    async getMode() { reads++; return { mode: 'landscape' }; },
    setMode({ mode }) { calls.push(mode); return new Promise(resolve => { finish = resolve; }); }
  } });
  const pending = f.w.selectPOSScreenOrientation('portrait');
  assert(f.radios.every(radio => radio.disabled));
  await f.w.selectPOSScreenOrientation('auto');
  await f.w.loadPOSScreenOrientationSetting();
  assert.deepEqual(calls, ['portrait']);
  assert.equal(reads, 1);
  finish({ mode: 'portrait' });
  await pending;
  assert.equal(f.selected(), 'portrait');
  assert(f.radios.every(radio => !radio.disabled));
});

test('failed or malformed native reads stay disabled and recover when settings reopen', async t => {
  for (const result of [new Error('Read failed'), { mode: 'invalid' }]) {
    let fail = true;
    const f = await fixture(t, { plugin: {
      async getMode() { if (fail && result instanceof Error) throw result; return fail ? result : { mode: 'auto' }; },
      async setMode() { assert.fail('Unavailable settings must not write'); }
    } });
    assert(f.radios.every(radio => radio.disabled));
    assert.equal(f.status.dataset.posDisplayI18n, 'orientationLoadFailed');
    fail = false;
    await f.w.loadPOSScreenOrientationSetting();
    assert.equal(f.selected(), 'auto');
    assert(f.radios.every(radio => !radio.disabled));
  }
});

test('invalid selections never reach Android and all UI states have both translations', async t => {
  const f = await fixture(t);
  await f.w.selectPOSScreenOrientation('sideways');
  assert.deepEqual(f.writes, []);
  assert.equal(f.selected(), 'landscape');
  const keys = ['orientationTitle', 'orientationAuto', 'orientationPortrait', 'orientationLandscape',
    'orientationDeviceHint', 'orientationUpdateRequired', 'orientationLoadFailed', 'orientationSaveFailed', 'orientationSaved'];
  for (const locale of ['vi', 'zh-TW']) {
    for (const key of keys) assert.equal(typeof f.w.I18N[locale][key], 'string', `${locale}: ${key}`);
  }
  f.w.currentLang = 'vi';
  await f.w.selectPOSScreenOrientation('auto');
  assert.equal(f.status.textContent, f.w.I18N.vi.orientationSaved);
  f.w.currentLang = 'zh-TW';
  await f.w.loadPOSScreenOrientationSetting();
  assert.equal(f.status.textContent, f.w.I18N['zh-TW'].orientationDeviceHint);
});
