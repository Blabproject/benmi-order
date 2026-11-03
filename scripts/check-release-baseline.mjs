import { menuSuites, testOutcome } from './menu-qa/suites.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('Release baseline requires Node.js 24. Run nvm use before retrying.');
  process.exit(1);
}
const directory = path.join(root, 'artifacts/release-baseline', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(directory, { recursive: true });
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Cannot capture baseline Git provenance');
  return result.stdout.trim();
};
const report = {
  startedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  commit: git('rev-parse', 'HEAD'),
  branch: git('branch', '--show-current'),
  workingTree: git('status', '--short', '--untracked-files=all'),
  mode: 'local synthetic fixtures; no Cloudflare CLI or deployment commands',
  suites: []
};
report.dependencies = {
  playwright: JSON.parse(readFileSync(path.join(root, 'node_modules/playwright/package.json'), 'utf8')).version,
  lockfiles: Object.fromEntries(['package-lock.json', 'benmi-worker-official/package-lock.json'].map(file =>
    [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')]))
};
const sourcePaths = ['*.html', 'index.css', 'js', 'css', 'benmi-worker-official/src', 'benmi-worker-official/migrations', 'benmi-worker-official/cloudflare.config.ts', 'benmi-worker-official/wrangler.config.ts'];
const sourceFiles = git('ls-files', '--cached', '--others', '--exclude-standard', '--', ...sourcePaths).split('\n').filter(Boolean).sort();
const sourceHash = createHash('sha256');
for (const file of sourceFiles) sourceHash.update(file).update('\0').update(readFileSync(path.join(root, file))).update('\0');
const changedSourceFiles = [git('diff', '--name-only', 'HEAD', '--', ...sourcePaths), git('ls-files', '--others', '--exclude-standard', '--', ...sourcePaths)].flatMap(value => value.split('\n')).filter(Boolean);
report.application = { sha256: sourceHash.digest('hex'), fileCount: sourceFiles.length, changedFromHead: [...new Set(changedSourceFiles)].sort().join('\n') };
const menuOnly = process.argv.includes('--menu');
const suites = [
  ['frontend-static', ['scripts/check-frontend.js']],
  ['routing-lifecycle', ['--test', 'scripts/test-explore-routing.mjs', 'scripts/test-client-modular.mjs', 'scripts/test-line-tenant-redirect.mjs', 'scripts/test-line-text-normalization.mjs', 'scripts/test-order-domain-routing.mjs', 'scripts/test-order-domain-api.cjs', 'scripts/test-tenant-lifecycle.cjs']],
  ['worker-types', ['benmi-worker-official/node_modules/typescript/bin/tsc', '--noEmit', '-p', 'benmi-worker-official/tsconfig.json']],
  ['cloudflare-config', ['--test', 'scripts/test-cloudflare-cli.mjs']],
  ['staff-runtime', ['--test', 'tests/test_staff_ordering.cjs', 'tests/test_staff_migration.cjs', 'tests/test_store_pin_api.cjs']],
  ['staff-browser', ['--test', 'tests/test_staff_ordering_browser.cjs', 'tests/test_store_pin_browser.cjs']],
  ['staff-print', ['--test', 'tests/test_staff_print.cjs', 'tests/test_staff_pos.cjs']],
  ['staff-capability-schema', ['--test', 'tests/test_staff_capability_schema.cjs']],
  ['order-identity', ['tests/test_order_identity.cjs']],
  ['linepay-runtime', ['--test', 'tests/test_linepay.cjs']],
  ['payment-workspace-runtime', ['--test', 'tests/test_payment_workspace.cjs']],
  ['payment-workspace-browser', ['--test', 'tests/test_payment_workspace_browser.cjs']],
  ['linepay-browser', ['--test', 'tests/test_linepay_browser.cjs', 'tests/test_payment_result_browser.cjs', 'tests/test_payment_pin_onboarding_browser.cjs']],
  ['line-receipts', ['--test', 'scripts/test-line-order-receipts.cjs']],
  ['line-portion-layout', ['--test', 'tests/test_line_order_layout.cjs', 'tests/test_order_item_note_dedup.cjs', 'tests/test_bundle_display_all_touchpoints.cjs', 'tests/test_item_customization_note.cjs', 'tests/test_customization_price_e2e.cjs']],
  ['liff-retry', ['--test', 'scripts/test-liff-message-retry.cjs']],
  ['menu-safety', ['--test', 'scripts/test-menu-safety.cjs']],
  ['print-identity', ['tests/test_order_identity_print.cjs']],
  ['print-items', ['tests/test_order_print_items.js']],
  ['print-sequence', ['tests/test_printer_sequence.js']],
  ['print-subtotals', ['tests/test_order_print_subtotal_bundle.cjs']],
  ['print-canvas', ['tests/test_receipt_canvas_height.js']],
  ['pos-display-chromium', ['tests/test_pos_display.cjs'], { POS_DISPLAY_BROWSER: 'chromium' }],
  ['pos-display-webkit', ['tests/test_pos_display.cjs'], { POS_DISPLAY_BROWSER: 'webkit' }],
  ...['chromium', 'webkit'].map(browser => [`pos-tablet-layout-${browser}`,
    ['--test', 'tests/test_pos_tablet_layout.cjs'], { POS_DISPLAY_BROWSER: browser }]),
  ['pos-live-mobile', ['tests/test_pos_live_mobile.cjs']],
  ['pos-detail-scroll', ['tests/test_order_detail_mobile_scroll.cjs']]
];

for (const [name, rawArgs, overrides = {}] of [...(menuOnly ? suites.slice(0, 4) : suites), ...menuSuites]) {
  const args = rawArgs.includes('--test') ? ['--test-reporter=tap', ...rawArgs] : rawArgs;
  console.log(`Running ${name}...`);
  const started = Date.now();
  const env = { ...process.env, ...overrides, NO_COLOR: '1' };
  // Always use the pinned package/browser in the release gate, even if a local
  // interactive test normally uses an externally supplied Chrome or Playwright.
  delete env.CHROME_PATH;
  delete env.PLAYWRIGHT_MODULE;
  delete env.FORCE_COLOR;
  env.POS_DISPLAY_SCREENSHOT_DIR = path.join(directory, name);
  env.POS_LIVE_SCREENSHOT_DIR = path.join(directory, name);
  env.MENU_QA_ARTIFACT_DIR = path.join(directory, name);
  const result = spawnSync(process.execPath, args, {
    cwd: root, env, encoding: 'utf8', timeout: 300_000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024
  });
  const log = `${result.stdout || ''}${result.stderr || ''}${result.error ? `\n${result.error.message}\n` : ''}`;
  writeFileSync(path.join(directory, `${name}.log`), log);
  const status = testOutcome(result, log, args.includes('--test'));
  report.suites.push({ name, command: ['node', ...args], environment: overrides, status, exitCode: result.status, signal: result.signal, elapsedMs: Date.now() - started, log: `${name}.log`, inputHashes: Object.fromEntries(args.filter(file => !file.startsWith('-')).map(file => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')])) });
  console.log(`${status === 'passed' ? 'PASS' : 'FAIL'} ${name} (${Date.now() - started} ms)`);
  if (status !== 'passed') console.error(log.slice(-6000));
  // Save after every suite so partial runs still leave reviewable evidence.
  writeFileSync(path.join(directory, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
}
report.finishedAt = new Date().toISOString();
report.status = report.suites.every(suite => suite.status === 'passed') ? 'passed' : 'failed';
writeFileSync(path.join(directory, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Release baseline ${report.status}: ${report.suites.filter(suite => suite.status === 'passed').length}/${report.suites.length}. Evidence: ${directory}`);
process.exitCode = report.status === 'passed' ? 0 : 1;
