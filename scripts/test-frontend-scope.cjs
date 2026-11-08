const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { extractClassicScripts, findTopLevelDeclarations, findScopeCollisions,
  declarationFingerprint, isKnownCollision } = require('./frontend-scope.cjs');

const scripts = (...contents) => contents.map((content, index) => ({ file: `module-${index}.js`, content }));

test('detects the LIFF helper override before either function executes', () => {
  const [collision] = findScopeCollisions(scripts(
    'function hasConfiguredOperatingHours(cfg) { return !!cfg; }',
    'function hasConfiguredOperatingHours(cfg) { return window.hasConfiguredOperatingHours(cfg); }'
  ));
  assert.equal(collision.name, 'hasConfiguredOperatingHours');
  assert.equal(collision.previous.file, 'module-0.js');
  assert.equal(collision.current.file, 'module-1.js');
});

test('detects indented, async, generator, same-file and var-assigned functions', () => {
  for (const declaration of [
    '  function send() {}', 'async function send() {}',
    'function* send() {}', 'var send = () => {};', 'var send = function() {};'
  ]) {
    assert.equal(findScopeCollisions(scripts('function send() {}', declaration)).length, 1);
  }
  assert.equal(findScopeCollisions(scripts('function send() {}\nfunction send() {}')).length, 1);
});

test('ignores function-local, block-local and IIFE-local declarations, comments and strings', () => {
  const source = `
    // function send() {}
    const example = 'function send() {}';
    /* function send() {} */
    const template = \`function send() {}\`;
    function outer() { function send() {} const local = 1; }
    (() => { function send() {} })();
    { const local = 2; }
  `;
  assert.equal(findScopeCollisions(scripts('function send() {}', source)).length, 0);
});

test('detects lexical declarations, multiple declarators and destructured bindings', () => {
  for (const declaration of [
    'const send = 1;', 'let other = 1, send = 2;', 'class send {}',
    'const { value: send } = object;', 'let [other, ...send] = values;'
  ]) {
    assert.equal(findScopeCollisions(scripts('function send() {}', declaration)).length, 1);
  }
  assert.equal(findScopeCollisions(scripts('var cart = window.cart;', 'var cart = window.cart;')).length, 0);
});

test('uses parser line numbers and rejects invalid syntax', () => {
  const [declaration] = findTopLevelDeclarations('\n/* comment */\n  async function send() {}');
  assert.equal(declaration.line, 3);
  assert.throws(() => findTopLevelDeclarations('function broken('), SyntaxError);
});

test('includes inline classic scripts and excludes module, data and remote scripts', () => {
  const html = [
    '<script src="/js/core.js?v=1"></script>',
    '<script type="module" src="module.js"></script>',
    '<script type="application/ld+json">{"name":"demo"}</script>',
    '<script src="https://example.com/sdk.js"></script>',
    '<script src="//example.com/sdk.js"></script>',
    '<script>\n  function send() {}\n</script>',
    '<script src=local.js></script>'
  ].join('\n');
  const extracted = extractClassicScripts(html, 'index.html');
  assert.equal(extracted.length, 3);
  assert.equal(extracted[0].file, '/js/core.js');
  assert.equal(extracted[2].file, 'local.js');
  const [collision] = findScopeCollisions(extracted.slice(0, 2).map(script => ({
    ...script, content: script.external ? 'function send() {}' : script.content
  })));
  assert.equal(collision.current.file, 'index.html (inline script 6)');
  assert.equal(collision.current.line, 7);
});

test('legacy exceptions match exact file pairs and source fingerprints only', () => {
  const originals = scripts('function read() { return 1; }', 'function read() { return 2; }');
  const [collision] = findScopeCollisions(originals);
  const entry = {
    name: collision.name,
    previous: declarationFingerprint(collision.previous),
    current: declarationFingerprint(collision.current)
  };
  assert.equal(isKnownCollision(collision, entry), true);
  for (const changed of [
    [originals[0], { ...originals[1], content: 'function read() { return window.read(); }' }],
    [{ ...originals[0], content: 'function read() { return 3; }' }, originals[1]],
    [originals[0], { ...originals[1], file: 'unexpected.js' }]
  ]) {
    assert.equal(isKnownCollision(findScopeCollisions(changed)[0], entry), false);
  }
  const collisions = findScopeCollisions([...originals, { file: 'third.js', content: originals[1].content }]);
  assert.equal(collisions.length, 2);
  assert.equal(isKnownCollision(collisions[1], entry), false);
});

test('ignores commented-out scripts while preserving comment-like strings in JavaScript', () => {
  const extracted = extractClassicScripts([
    '<!-- <script src="disabled.js"></script> -->',
    '<script>const text = "<!-- preserved -->"; function send() {}</script>'
  ].join('\n'), 'index.html');
  assert.equal(extracted.length, 1);
  assert.ok(extracted[0].content.includes('<!-- preserved -->'));
  assert.equal(findTopLevelDeclarations(extracted[0].content)[1].name, 'send');
});

test('frontend command rejects a new function override and reports both locations', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'benmi-frontend-scope-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'js'));
  fs.symlinkSync(path.resolve(__dirname, '../node_modules'), path.join(root, 'node_modules'), 'dir');
  for (const name of ['check-frontend.js', 'frontend-scope.cjs', 'frontend-scope-allowlist.json']) {
    fs.copyFileSync(path.join(__dirname, name), path.join(root, 'scripts', name));
  }
  fs.writeFileSync(path.join(root, 'index.html'), '<script src="js/core.js"></script>\n<script src="js/checkout.js"></script>');
  fs.writeFileSync(path.join(root, 'js/core.js'), 'function hasConfiguredOperatingHours(cfg) { return !!cfg; }');
  fs.writeFileSync(path.join(root, 'js/checkout.js'), 'function hasConfiguredOperatingHours(cfg) { return window.hasConfiguredOperatingHours(cfg); }');
  const run = () => spawnSync(process.execPath, ['scripts/check-frontend.js'], { cwd: root, encoding: 'utf8' });
  const failed = run();
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /FATAL SCOPE ERROR.*hasConfiguredOperatingHours/);
  assert.match(failed.stderr, /js\/core\.js:1/);
  assert.match(failed.stderr, /js\/checkout\.js:1/);
  fs.writeFileSync(path.join(root, 'js/checkout.js'), 'function hasPickupOperatingHours(cfg) { return window.hasConfiguredOperatingHours(cfg); }');
  const passed = run();
  assert.equal(passed.status, 0, passed.stderr);
});
