import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require('../../benmi-worker-official/node_modules/miniflare');
const { build } = require('../../benmi-worker-official/node_modules/esbuild');
export const root = path.resolve(import.meta.dirname, '../..');
export const tenant = 'jiangjiejie';
export const devWorker = 'https://platform-worker-dev.thuanmnc.workers.dev';
const quote = value => `"${value.replaceAll('"', '""')}"`;

let cachedBundleTextPromise = null;
const cachedMigrationTemplates = new Map();

function getWorkerBundleText() {
  if (!cachedBundleTextPromise) {
    cachedBundleTextPromise = build({
      entryPoints: [path.join(root, 'benmi-worker-official/src/index.ts')],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
    }).then(bundle => bundle.outputFiles[0].text);
  }
  return cachedBundleTextPromise;
}

function getMigrationTemplate(upgrade) {
  const key = Boolean(upgrade);
  if (cachedMigrationTemplates.has(key)) return cachedMigrationTemplates.get(key);

  const source = new DatabaseSync(':memory:');
  const migrations = readdirSync(path.join(root, 'benmi-worker-official/migrations')).filter(f => f.endsWith('.sql')).sort();
  const applied = [];
  try {
    source.exec('PRAGMA foreign_keys=ON');
    for (const name of migrations) {
      const file = `benmi-worker-official/migrations/${name}`;
      let sql = readFileSync(path.join(root, file), 'utf8'), origin = 'working-tree';
      if (key) {
        try {
          sql = execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
          origin = 'HEAD';
        } catch {
          /* A new migration is the forward upgrade; historical files are never replayed. */
        }
      }
      source.exec(sql);
      applied.push({ name, origin });
    }
    const schema = source.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
    const tableSqls = schema.filter(r => r.type === 'table').map(r => r.sql);
    const otherSqls = schema.filter(r => r.type !== 'table').map(r => r.sql);
    const seedBatches = [];
    for (const row of schema.filter(r => r.type === 'table')) {
      const rows = source.prepare(`SELECT * FROM ${quote(row.name)}`).all();
      if (rows.length === 0) continue;
      const cols = Object.keys(rows[0]);
      const colList = cols.map(quote).join(',');
      const rowPlaceholder = `(${cols.map(() => '?').join(',')})`;
      const chunkSize = Math.max(1, Math.min(25, Math.floor(90 / cols.length)));
      for (let i = 0; i < rows.length; i += chunkSize) {
        const slice = rows.slice(i, i + chunkSize);
        const sql = `INSERT INTO ${quote(row.name)} (${colList}) VALUES ${slice.map(() => rowPlaceholder).join(',')}`;
        const params = slice.flatMap(record => Object.values(record));
        seedBatches.push({ sql, params });
      }
    }
    const template = { tableSqls, otherSqls, seedBatches, applied };
    cachedMigrationTemplates.set(key, template);
    return template;
  } finally {
    source.close();
  }
}

export async function startRuntime({ upgrade = false } = {}) {
  const [scriptText, template] = await Promise.all([
    getWorkerBundleText(),
    Promise.resolve(getMigrationTemplate(upgrade)),
  ]);
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: scriptText,
    compatibilityDate: '2026-03-28',
    d1Databases: ['DB'],
    kvNamespaces: ['ORDER_STATE'],
    bindings: {
      UNIFIED_MENU_ENABLED: 'true',
      ORDER_DETAIL_READS: 'true',
      ORDER_DETAIL_WRITES: 'true',
      LINE_RUNTIME_ENABLED: 'false',
      BUILD_ENVIRONMENT: 'local',
      BUILD_COMMIT: 'local',
      BUILD_DIRTY: 'true',
    },
    outboundService: () => new Response('External services disabled in menu QA', { status: 503 })
  }));
  try {
    const db = await mf.getD1Database('DB');
    if (template.tableSqls.length) await db.batch(template.tableSqls.map(sql => db.prepare(sql)));
    if (template.seedBatches.length) {
      await db.batch([
        db.prepare('PRAGMA defer_foreign_keys=ON'),
        ...template.seedBatches.map(({ sql, params }) => db.prepare(sql).bind(...params)),
      ]);
    }
    if (template.otherSqls.length) await db.batch(template.otherSqls.map(sql => db.prepare(sql)));
    const check = await db.prepare('PRAGMA foreign_key_check').all();
    if (check.results.length) throw new Error(`Invalid QA fixture foreign keys: ${JSON.stringify(check.results)}`);
    const url = String(await mf.ready).replace(/\/$/, '');
    return {
      mf,
      db,
      kv: await mf.getKVNamespace('ORDER_STATE'),
      url,
      migrations: template.applied,
      request: (endpoint, init) => mf.dispatchFetch(`${devWorker}${endpoint}${endpoint.includes('?') ? '&' : '?'}tenant_id=${tenant}`, init),
      close: () => mf.dispose(),
    };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}

export async function startPages() {
  const server = createServer((req, res) => {
    let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name === '/') name = '/index.html';
    if (name === '/orders') name = '/orders.html';
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep) || !/\.(html|js|css|svg|png|jpg|ico|json|woff2?)$/.test(file)) { res.writeHead(404).end(); return; }
    try { res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: 'https://dev.benmi-order.pages.dev', assetUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}
