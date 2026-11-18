const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { transform: lightningTransform } = require('lightningcss');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('vite config pins cssTarget for older Android POS WebViews', () => {
  const viteConfig = read('vite.config.mts');
  assert.match(viteConfig, /cssTarget:\s*\[['"]chrome79['"]/, 'vite.config.mts must pin cssTarget for Android WebView compatibility');
});

test('orders CSS preserves 100vh fallbacks, classic media queries, and expanded inset offsets', () => {
  const rawCss = read('css/orders.css');
  const { code } = lightningTransform({
    filename: 'css/orders.css',
    code: Buffer.from(rawCss),
    minify: true,
    targets: { chrome: 79 << 16, safari: 13 << 16 }
  });
  const compiled = code.toString();

  assert.equal((compiled.match(/@media\s*\([^)]*[<>]=/g) || []).length, 0, 'must not emit Media Queries Level 4 range syntax');
  assert.equal((compiled.match(/\binset:\s*0\b/g) || []).length, 0, 'must expand inset:0 to top/right/bottom/left for WebView < 87');

  const appLayout = compiled.match(/\.app\.app-layout\{[^}]*\}/)?.[0] || '';
  assert.match(appLayout, /height:100vh/, '.app.app-layout must keep 100vh fallback');
  assert.match(appLayout, /height:100dvh/, '.app.app-layout must keep 100dvh');

  const activationModal = compiled.match(/\.store-activation-modal\{[^}]*\}/)?.[0] || '';
  assert.match(activationModal, /top:0/, '.store-activation-modal must have expanded top:0');
  assert.match(activationModal, /left:0/, '.store-activation-modal must have expanded left:0');

  const modalOverlay = compiled.match(/\.modal\{[^}]*\}/)?.[0] || '';
  assert.match(modalOverlay, /top:0/, '.modal must have expanded top:0');
  assert.match(modalOverlay, /left:0/, '.modal must have expanded left:0');

  const categoryModal = compiled.match(/#addCategoryModal\{[^}]*\}/)?.[0] || '';
  assert.match(categoryModal, /height:100vh/, '#addCategoryModal must keep 100vh fallback');

  const paymentDialog = compiled.match(/\.payment-detail-dialog\{[^}]*\}/)?.[0] || '';
  assert.match(paymentDialog, /height:100vh/, '.payment-detail-dialog must keep 100vh fallback');

  // Ensure label:has(input) is isolated from the :-webkit-any() touch-target rule.
  assert.doesNotMatch(compiled, /:-webkit-any\([^)]*label:has\(input\)[^)]*\)/);
});

test('Android MainActivity restores orientation before super.onCreate initializes WebView', () => {
  const mainActivity = read('apps/android-pos/android/app/src/main/java/com/benmi/pos/MainActivity.java');
  const restoreIdx = mainActivity.indexOf('POSScreenOrientationPlugin.restore(this);');
  const superIdx = mainActivity.indexOf('super.onCreate(savedInstanceState);');
  assert(restoreIdx !== -1 && superIdx !== -1 && restoreIdx < superIdx,
    'POSScreenOrientationPlugin.restore(this) must execute before super.onCreate(savedInstanceState)');
});
