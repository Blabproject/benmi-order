import { menuSuites, testOutcome } from './menu-qa/suites.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('Release baseline requires Node.js 24. Run nvm use before retrying.');
  process.exit(1);
}

function resolveConcurrency() {
  if (process.argv.includes('--serial')) return 1;
  const arg = process.argv.find(item => item.startsWith('--concurrency='));
  const raw = arg ? Number(arg.split('=')[1]) : Number(process.env.RELEASE_CONCURRENCY || 0);
  if (Number.isInteger(raw) && raw > 0) return raw;
  const cpuCount = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, Math.min(4, cpuCount || 4));
}

const concurrency = resolveConcurrency();
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
  concurrency,
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
const sourcePaths = ['*.html', 'index.css', 'js', 'css', 'frontend', 'vite.config.mts', 'vitest.config.mts', 'tsconfig.frontend.json', 'tsconfig.node.json', 'benmi-worker-official/src', 'benmi-worker-official/migrations', 'benmi-worker-official/cloudflare.config.ts', 'benmi-worker-official/wrangler.config.ts'];
const sourceFiles = git('ls-files', '--cached', '--others', '--exclude-standard', '--', ...sourcePaths).split('\n').filter(Boolean).sort();
const sourceHash = createHash('sha256');
for (const file of sourceFiles) sourceHash.update(file).update('\0').update(readFileSync(path.join(root, file))).update('\0');
const changedSourceFiles = [git('diff', '--name-only', 'HEAD', '--', ...sourcePaths), git('ls-files', '--others', '--exclude-standard', '--', ...sourcePaths)].flatMap(value => value.split('\n')).filter(Boolean);
report.application = { sha256: sourceHash.digest('hex'), fileCount: sourceFiles.length, changedFromHead: [...new Set(changedSourceFiles)].sort().join('\n') };
const menuOnly = process.argv.includes('--menu');
const suites = [
  ['frontend-static', ['scripts/check-frontend.js']],
  ['routing-lifecycle', ['--test', 'scripts/test-frontend-scope.cjs', 'scripts/test-explore-routing.mjs', 'scripts/test-client-modular.mjs', 'scripts/test-line-tenant-redirect.mjs', 'scripts/test-line-text-normalization.mjs', 'scripts/test-order-domain-routing.mjs', 'scripts/test-order-domain-api.cjs', 'scripts/test-tenant-lifecycle.cjs']],
  ['worker-types', ['benmi-worker-official/node_modules/typescript/bin/tsc', '--noEmit', '-p', 'benmi-worker-official/tsconfig.json']],
  ['cloudflare-config', ['--test', 'scripts/test-cloudflare-cli.mjs']],
  ['staff-runtime', ['--test', 'tests/test_staff_ordering.cjs', 'tests/test_staff_migration.cjs', 'tests/test_store_pin_api.cjs', 'tests/test_store_status.cjs']],
  ['staff-browser', ['--test', 'tests/test_staff_ordering_browser.cjs', 'tests/test_store_pin_browser.cjs', 'tests/test_table_management_browser.cjs']],
  ['frontend-modern-types', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.frontend.json']],
  ['frontend-modern-node-types', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.node.json']],
  ['frontend-modern-unit', ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.mts']],
  ['frontend-vite-dist', ['--test', 'tests/test_frontend_build_dist.mjs']],
  ['history-dto-contract', ['--test', 'tests/test_history_dto_contract.cjs']],
  ['pos-history-baseline', ['--test', 'tests/test_pos_history_slice_baseline.cjs']],
  ['pos-reports-slice', ['--test', 'tests/test_pos_reports_slice_browser.cjs']],
  ['staff-table-sync', ['--test', 'tests/test_staff_table_sync_browser.cjs']],
  ['staff-print', ['--test', 'tests/test_staff_print.cjs', 'tests/test_staff_pos.cjs']],
  ['staff-capability-schema', ['--test', 'tests/test_staff_capability_schema.cjs']],
  ['order-identity', ['tests/test_order_identity.cjs']],
  ['linepay-runtime', ['--test', 'tests/test_linepay.cjs', 'tests/test_payment_redirect.cjs']],
  ['payment-workspace-runtime', ['--test', 'tests/test_payment_workspace.cjs']],
  ['payment-workspace-browser', ['--test', 'tests/test_payment_workspace_browser.cjs']],
  ['linepay-browser', ['--test', 'tests/test_linepay_browser.cjs', 'tests/test_payment_result_browser.cjs', 'tests/test_payment_pin_onboarding_browser.cjs']],
  ['line-receipts', ['--test', 'scripts/test-line-order-receipts.cjs']],
  ['ai-settings', ['--test', 'tests/test_ai_settings.cjs', 'tests/test_ai_settings_browser.cjs']],
  ['line-portion-layout', ['--test', 'tests/test_line_order_layout.cjs', 'tests/test_order_item_note_dedup.cjs', 'tests/test_bundle_display_all_touchpoints.cjs', 'tests/test_item_customization_note.cjs', 'tests/test_customization_price_e2e.cjs']],
  ['liff-retry', ['--test', 'scripts/test-liff-message-retry.cjs']],
  ['menu-safety', ['--test', 'scripts/test-menu-safety.cjs']],
  ['print-identity', ['--test', 'tests/test_order_identity_print.cjs', 'tests/test_pos_confirmed_print.cjs', 'tests/test_pos_print_recovery.cjs', 'tests/test_pos_print_recovery_browser.cjs']],
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

// Phase 1 builds dist/ and runs static/type checks before Phase 2 browser suites read dist/.vite/manifest.json.
const PHASE_1_SUITE_NAMES = new Set([
  'frontend-static',
  'worker-types',
  'cloudflare-config',
  'frontend-modern-types',
  'frontend-modern-node-types',
  'frontend-vite-dist',
]);

// Phase 3 runs Miniflare/workerd suites sequentially with zero CPU contention so local workerd loopback sockets stay reliable.
const PHASE_3_SOLO_NAMES = new Set([
  'menu-runtime',
  'menu-full-pages-chromium',
  'menu-full-pages-webkit',
]);

// Start heavy suites first in Phase 2 to minimize tail latency across workers.
const HEAVY_SUITE_PRIORITY = new Map([
  ['staff-runtime', 1],
  ['staff-browser', 2],
  ['menu-full-pages-webkit', 3],
  ['menu-full-pages-chromium', 4],
  ['menu-components-webkit', 5],
  ['menu-components-chromium', 6],
  ['pos-tablet-layout-webkit', 7],
  ['pos-tablet-layout-chromium', 8],
  ['linepay-browser', 9],
  ['menu-runtime', 10],
  ['menu-static-contracts', 11],
  ['pos-display-webkit', 12],
  ['pos-display-chromium', 13],
]);

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const SUITE_TIMEOUT_MS = 300_000;

function runSuiteAsync(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let totalBytes = 0;
    let settled = false;
    let runtimeError = null;

    const finish = (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        status,
        signal,
        error: runtimeError,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    };

    const appendChunk = (target, chunk) => {
      totalBytes += chunk.length;
      if (totalBytes <= MAX_OUTPUT_BYTES) {
        target.push(chunk);
        return;
      }
      runtimeError = new Error(`Suite output exceeded ${MAX_OUTPUT_BYTES} bytes`);
      child.kill('SIGKILL');
    };

    child.stdout.on('data', chunk => appendChunk(stdoutChunks, chunk));
    child.stderr.on('data', chunk => appendChunk(stderrChunks, chunk));
    child.on('error', err => {
      runtimeError = err;
      finish(null, null);
    });
    child.on('close', (code, signal) => finish(code, signal));

    const timer = setTimeout(() => {
      runtimeError = new Error(`Suite timed out after ${SUITE_TIMEOUT_MS}ms`);
      child.kill('SIGKILL');
    }, SUITE_TIMEOUT_MS);
  });
}

async function executeSuite([name, rawArgs, overrides = {}]) {
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

  const result = await runSuiteAsync(args, env);
  const log = `${result.stdout || ''}${result.stderr || ''}${result.error ? `\n${result.error.message}\n` : ''}`;
  writeFileSync(path.join(directory, `${name}.log`), log);
  const status = testOutcome(result, log, args.includes('--test'));
  const entry = {
    name,
    command: ['node', ...args],
    environment: overrides,
    status,
    exitCode: result.status,
    signal: result.signal,
    elapsedMs: Date.now() - started,
    log: `${name}.log`,
    inputHashes: Object.fromEntries(
      args
        .filter(file => !file.startsWith('-') && existsSync(path.join(root, file)) && statSync(path.join(root, file)).isFile())
        .map(file => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')])
    ),
  };
  report.suites.push(entry);
  console.log(`${status === 'passed' ? 'PASS' : 'FAIL'} ${name} (${entry.elapsedMs} ms)`);
  if (status !== 'passed') console.error(log.slice(-6000));
  // Save after every suite so partial runs still leave reviewable evidence.
  writeFileSync(path.join(directory, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
}

async function runPool(items, limit) {
  if (items.length === 0) return;
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const current = items[nextIndex];
        nextIndex += 1;
        await executeSuite(current);
      }
    })
  );
}

const selectedSuites = [...(menuOnly ? suites.slice(0, 4) : suites), ...menuSuites];
const orderMap = new Map(selectedSuites.map(([name], index) => [name, index]));
const phase1Suites = selectedSuites.filter(([name]) => PHASE_1_SUITE_NAMES.has(name));
const phase2Suites = selectedSuites
  .filter(([name]) => !PHASE_1_SUITE_NAMES.has(name) && !PHASE_3_SOLO_NAMES.has(name))
  .sort((a, b) => (HEAVY_SUITE_PRIORITY.get(a[0]) ?? 100) - (HEAVY_SUITE_PRIORITY.get(b[0]) ?? 100));
const phase3Suites = selectedSuites.filter(([name]) => PHASE_3_SOLO_NAMES.has(name));

const wallStart = Date.now();
console.log(
  `Release baseline starting ${selectedSuites.length} suites (concurrency=${concurrency}, phase1=${phase1Suites.length}, phase2=${phase2Suites.length}, phase3=${phase3Suites.length})...`
);
await runPool(phase1Suites, concurrency);
await runPool(phase2Suites, concurrency);
await runPool(phase3Suites, 1);

report.suites.sort((a, b) => (orderMap.get(a.name) ?? 0) - (orderMap.get(b.name) ?? 0));
report.finishedAt = new Date().toISOString();
report.elapsedMs = Date.now() - wallStart;
report.status = report.suites.every(suite => suite.status === 'passed') ? 'passed' : 'failed';
writeFileSync(path.join(directory, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Release baseline ${report.status}: ${report.suites.filter(suite => suite.status === 'passed').length}/${report.suites.length} in ${(report.elapsedMs / 1000).toFixed(1)}s. Evidence: ${directory}`);
process.exitCode = report.status === 'passed' ? 0 : 1;
