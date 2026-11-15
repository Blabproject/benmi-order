const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const ENTRY = path.join(ROOT, 'frontend', 'apps', 'pos', 'option-groups-bridge.tsx');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache');
const CACHE_JS = path.join(CACHE_DIR, 'benmi-option-groups-test-bundle.iife.js');
const CACHE_META = path.join(CACHE_DIR, 'benmi-option-groups-test-bundle.meta.json');

const WATCHED_FILES = [
  ENTRY,
  path.join(ROOT, 'frontend', 'apps', 'pos', 'option-groups-store.ts'),
  path.join(ROOT, 'frontend', 'apps', 'pos', 'PosOptionGroupsDrawer.tsx'),
  path.join(ROOT, 'frontend', 'apps', 'pos', 'PosOptionGroupsSidebar.tsx'),
  path.join(ROOT, 'frontend', 'apps', 'pos', 'PosOptionGroupsWorkspace.tsx'),
  path.join(ROOT, 'frontend', 'shared', 'contracts', 'option-groups-model.ts'),
  path.join(ROOT, 'frontend', 'shared', 'i18n', 'pos-dictionary.ts'),
  path.join(ROOT, 'frontend', 'shared', 'ui', 'PosIcons.tsx'),
];

let memoryCache = null;
let memoryMaxMtime = 0;

function getNewestMtime() {
  let max = 0;
  for (const filePath of WATCHED_FILES) {
    try {
      const m = fs.statSync(filePath).mtimeMs;
      if (m > max) max = m;
    } catch {
      // ignore missing
    }
  }
  return max;
}

async function getOptionGroupsBridgeBundleCode() {
  const newest = getNewestMtime();
  if (memoryCache && memoryMaxMtime >= newest) {
    return memoryCache;
  }

  try {
    const meta = JSON.parse(fs.readFileSync(CACHE_META, 'utf8'));
    if (meta && meta.mtime >= newest && fs.existsSync(CACHE_JS)) {
      memoryCache = fs.readFileSync(CACHE_JS, 'utf8');
      memoryMaxMtime = meta.mtime;
      return memoryCache;
    }
  } catch {
    // rebuild cache
  }

  const { build } = await import('vite');
  const cssStubPlugin = {
    name: 'test-css-stub',
    load(id) {
      if (id.split('?')[0].endsWith('.css')) {
        return 'export default "";';
      }
      return null;
    },
  };

  const result = await build({
    configFile: false,
    root: ROOT,
    plugins: [cssStubPlugin],
    resolve: {
      alias: {
        '@shared': path.join(ROOT, 'frontend', 'shared'),
        '@pos': path.join(ROOT, 'frontend', 'apps', 'pos'),
      },
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    build: {
      write: false,
      minify: false,
      sourcemap: false,
      lib: {
        entry: ENTRY,
        formats: ['iife'],
        name: 'BenmiOptionGroupsBridge',
        fileName: () => 'option-groups-bridge.iife.js',
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    logLevel: 'silent',
  });

  const chunks = Array.isArray(result) ? result : [result];
  const output = chunks[0]?.output?.find((item) => item.type === 'chunk');
  if (!output?.code) {
    throw new Error('Failed to build option-groups-bridge test bundle');
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
  const tmpJs = `${CACHE_JS}.${suffix}.tmp`;
  const tmpMeta = `${CACHE_META}.${suffix}.tmp`;
  fs.writeFileSync(tmpJs, output.code, 'utf8');
  fs.renameSync(tmpJs, CACHE_JS);
  fs.writeFileSync(tmpMeta, JSON.stringify({ mtime: newest }), 'utf8');
  fs.renameSync(tmpMeta, CACHE_META);

  memoryCache = output.code;
  memoryMaxMtime = newest;
  return output.code;
}

module.exports = { getOptionGroupsBridgeBundleCode };
