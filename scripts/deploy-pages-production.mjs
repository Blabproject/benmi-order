import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const require = createRequire(root + '/benmi-worker-official/package.json');
const { build } = require('esbuild');
const blake3 = require('blake3-wasm');

const contentTypes = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.apk': 'application/vnd.android.package-archive'
};

const account = '525bb177ae7306325d13269246769f50';
const project = 'benmi-order';
const projectPath = `/accounts/${account}/pages/projects/${project}`;
const configPath = '/Users/duccao/Library/Preferences/cloudflare/config/default.json';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

async function getAuthToken() {
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const isExpired = !cfg.expiration_time || new Date() >= new Date(cfg.expiration_time);
  if (isExpired && cfg.refresh_token) {
    console.log('Refreshing expired Cloudflare OAuth token...');
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cfg.refresh_token,
      client_id: 'cbca97e7-c331-4cdd-8fd8-e25a451b98bf'
    });
    const r = await fetch('https://dash.cloudflare.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const data = await r.json();
    if (data.access_token) {
      cfg.oauth_token = data.access_token;
      cfg.expiration_time = new Date(Date.now() + data.expires_in * 1000).toISOString();
      if (data.refresh_token) cfg.refresh_token = data.refresh_token;
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
      console.log('OAuth token refreshed successfully.');
    } else {
      throw new Error('Failed to refresh Cloudflare OAuth token: ' + JSON.stringify(data));
    }
  }
  return cfg.oauth_token;
}

async function api(endpoint, options = {}, token) {
  if (!token) token = await getAuthToken();
  const r = await fetch('https://api.cloudflare.com/client/v4' + endpoint, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
    signal: AbortSignal.timeout(120000)
  });
  const data = await r.json();
  if (!r.ok || data.success === false) {
    throw new Error(`Cloudflare API ${r.status}: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

async function main() {
  console.log('Starting Cloudflare Pages Direct API deployment for project: ' + project);

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const projectInfo = await api(projectPath);
  const parentDeployment = projectInfo.canonical_deployment?.id || null;
  console.log(`Commit: ${commit}`);
  console.log(`Current canonical deployment: ${parentDeployment}`);

  const metadata = {
    commit,
    environment: 'production',
    dirty: false,
    release: 'pickup-time-sheet-v2',
    built_at: new Date().toISOString(),
    parent_deployment: parentDeployment
  };
  fs.writeFileSync(path.join(root, '_build.json'), JSON.stringify(metadata, null, 2) + '\n');

  // Build Pages Worker bundle using Wrangler's Pages template and functions/_middleware.js
  const tmpDir = path.join(root, '.tmp_pages_build');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  fs.writeFileSync(
    path.join(tmpDir, 'routes.mjs'),
    `import {onRequest} from ${JSON.stringify(path.join(root, 'functions/_middleware.js'))};\nexport const routes=[{routePath:'/',mountPath:'/',middlewares:[onRequest],modules:[]}];\n`
  );

  const workerOutfile = path.join(tmpDir, 'pages-worker.mjs');
  await build({
    entryPoints: [path.join(root, 'benmi-worker-official/node_modules/wrangler/templates/pages-template-worker.ts')],
    inject: [path.join(tmpDir, 'routes.mjs')],
    define: { __FALLBACK_SERVICE__: '"ASSETS"' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: workerOutfile,
    logLevel: 'silent'
  });
  console.log('Built _worker.js bundle successfully.');

  // Collect canonical static assets
  const targetFiles = [
    '_build.json',
    ...fs.readdirSync(root).filter(f => /\.(html|css|png|jpg|svg)$/.test(f)),
    ...fs.readdirSync(path.join(root, 'css')).filter(f => !f.startsWith('.')).map(f => 'css/' + f),
    ...fs.readdirSync(path.join(root, 'js')).filter(f => !f.startsWith('.')).map(f => 'js/' + f),
    ...fs.readdirSync(path.join(root, 'apps/android-pos')).filter(f => f.endsWith('.apk')).map(f => 'apps/android-pos/' + f)
  ];

  console.log(`Hashing ${targetFiles.length} static assets...`);
  const assets = [];
  const manifest = {};

  for (const name of targetFiles) {
    const file = path.join(root, name);
    const bytes = fs.readFileSync(file);
    const ext = path.extname(name);
    const hash = blake3.hash(bytes.toString('base64') + ext.slice(1)).toString('hex').slice(0, 32);
    manifest['/' + name] = hash;
    assets.push({
      name,
      hash,
      sha256: sha(bytes),
      contentType: contentTypes[ext] || 'application/octet-stream'
    });
  }

  // Get upload token
  const { jwt } = await api(projectPath + '/upload-token');
  const uniqueHashes = [...new Set(assets.map(a => a.hash))];
  const missing = await api('/pages/assets/check-missing', { method: 'POST', ...json({ hashes: uniqueHashes }) }, jwt);
  console.log(`Total unique hashes: ${uniqueHashes.length}, Missing on Cloudflare edge: ${missing.length}`);

  const missingAssets = missing.map(hash => assets.find(a => a.hash === hash)).filter(Boolean);
  for (const asset of missingAssets) {
    await api('/pages/assets/upload', {
      method: 'POST',
      ...json([{
        key: asset.hash,
        value: fs.readFileSync(path.join(root, asset.name)).toString('base64'),
        base64: true,
        metadata: { contentType: asset.contentType }
      }])
    }, jwt);
    console.log(`  Uploaded missing asset: ${asset.name} (${asset.hash})`);
  }

  await api('/pages/assets/upsert-hashes', { method: 'POST', ...json({ hashes: uniqueHashes }) }, jwt);

  // Deploy to Cloudflare Pages
  console.log('Submitting deployment form to Cloudflare Pages API...');
  const form = new FormData();
  form.set('manifest', JSON.stringify(manifest));
  form.set('branch', 'main');
  form.set('commit_hash', commit);
  form.set('commit_dirty', 'false');
  form.set('commit_message', 'feat(liff): upgrade pickup time sheet v2 with 7-day tabs, meal periods and auto-fallback');

  for (const f of ['_headers', '_redirects', '_routes.json']) {
    form.set(f, new Blob([fs.readFileSync(path.join(root, f))]), f);
  }
  form.set('_worker.js', new Blob([fs.readFileSync(workerOutfile)], { type: 'application/javascript' }), '_worker.js');

  const deployed = await api(projectPath + '/deployments', { method: 'POST', body: form });

  console.log('========================================================');
  console.log('✅ Cloudflare Pages Deployment Succeeded!');
  console.log(`Deployment ID: ${deployed.id}`);
  console.log(`URL: ${deployed.url}`);
  console.log(`Environment: ${deployed.environment}`);
  console.log(`Stage: ${JSON.stringify(deployed.latest_stage)}`);
  console.log('========================================================');

  // Clean up build temp
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.unlinkSync(path.join(root, '_build.json'));
  } catch (e) {}

  return deployed;
}

main().catch(err => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
