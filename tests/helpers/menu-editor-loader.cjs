// Shared helper to compile & evaluate TS MenuEditorModel and frontend/apps/pos/menu/index.ts in VM / browser contexts
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('../../benmi-worker-official/node_modules/esbuild');

const ROOT = path.resolve(__dirname, '../..');
const MENU_MODEL_TS = path.join(ROOT, 'frontend', 'shared', 'contracts', 'menu-model.ts');
const MENU_ENTRY_TS = path.join(ROOT, 'frontend', 'apps', 'pos', 'menu', 'index.ts');
const MENU_DIR = path.join(ROOT, 'frontend', 'apps', 'pos', 'menu');
const TSCONFIG_PATH = path.join(ROOT, 'tsconfig.frontend.json');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache');
const CACHE_META = path.join(CACHE_DIR, 'benmi-pos-menu-test-bundles.meta.json');
const CACHE_MODEL_IIFE = path.join(CACHE_DIR, 'benmi-menu-model-test.iife.js');
const CACHE_MODEL_CJS = path.join(CACHE_DIR, 'benmi-menu-model-test.cjs');
const CACHE_MENU_IIFE = path.join(CACHE_DIR, 'benmi-pos-menu-test.iife.js');

const EXTRA_WATCHED = [
  MENU_MODEL_TS,
  TSCONFIG_PATH,
  path.join(ROOT, 'frontend', 'shared', 'i18n', 'pos-dictionary.ts'),
  path.join(ROOT, 'frontend', 'shared', 'infra', 'http.ts')
];

function getNewestMtime() {
  let max = 0;
  const check = filePath => {
    try {
      const m = fs.statSync(filePath).mtimeMs;
      if (m > max) max = m;
    } catch {
      // Ignore missing files.
    }
  };
  for (const filePath of EXTRA_WATCHED) check(filePath);
  try {
    for (const entry of fs.readdirSync(MENU_DIR)) {
      if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        check(path.join(MENU_DIR, entry));
      }
    }
  } catch {
    // Ignore missing directory.
  }
  return max;
}

function writeFileAtomic(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
  const tmpPath = `${targetPath}.${suffix}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

function ensureBundles() {
  const newest = getNewestMtime();
  try {
    const meta = JSON.parse(fs.readFileSync(CACHE_META, 'utf8'));
    if (
      meta &&
      meta.mtime >= newest &&
      fs.existsSync(CACHE_MODEL_IIFE) &&
      fs.existsSync(CACHE_MODEL_CJS) &&
      fs.existsSync(CACHE_MENU_IIFE)
    ) {
      return {
        modelCode: fs.readFileSync(CACHE_MODEL_IIFE, 'utf8'),
        menuCode: fs.readFileSync(CACHE_MENU_IIFE, 'utf8'),
        modelCjsPath: CACHE_MODEL_CJS
      };
    }
  } catch {
    // Rebuild cache cleanly.
  }

  const modelIifeResult = buildSync({
    stdin: {
      contents: `
        import { canonicalMenuSnapshot, serializeMenuData, getMenuDeletions } from ${JSON.stringify(MENU_MODEL_TS)};
        const api = { canonicalMenuSnapshot, serializeMenuData, getMenuDeletions };
        const root = typeof globalThis !== 'undefined' ? globalThis : (0, eval)('this');
        if (root) {
          root.MenuEditorModel = api;
          if (root.window && typeof root.window === 'object') {
            root.window.MenuEditorModel = api;
          }
        }
      `,
      resolveDir: ROOT,
      loader: 'ts'
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2019',
    tsconfig: TSCONFIG_PATH
  });

  const modelCjsResult = buildSync({
    entryPoints: [MENU_MODEL_TS],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'es2022',
    tsconfig: TSCONFIG_PATH
  });

  const menuIifeResult = buildSync({
    entryPoints: [MENU_ENTRY_TS],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2019',
    tsconfig: TSCONFIG_PATH
  });

  const modelCode = modelIifeResult.outputFiles[0].text;
  const modelCjsCode = modelCjsResult.outputFiles[0].text;
  const menuCode = menuIifeResult.outputFiles[0].text;

  writeFileAtomic(CACHE_MODEL_IIFE, modelCode);
  writeFileAtomic(CACHE_MODEL_CJS, modelCjsCode);
  writeFileAtomic(CACHE_MENU_IIFE, menuCode);
  writeFileAtomic(CACHE_META, JSON.stringify({ mtime: newest }));

  return {
    modelCode,
    menuCode,
    modelCjsPath: CACHE_MODEL_CJS
  };
}

const bundles = ensureBundles();
const MenuEditorModel = require(bundles.modelCjsPath);

function loadMenuEditor(context = {}) {
  const targetContext = vm.isContext(context) ? context : vm.createContext(context);
  vm.runInContext(bundles.modelCode, targetContext);
  vm.runInContext(bundles.menuCode, targetContext);
  return targetContext;
}

module.exports = {
  loadMenuEditor,
  MenuEditorModel,
  modelCode: bundles.modelCode,
  menuCode: bundles.menuCode,
  wizardCode: '/* bundle-wizard bundled in menuCode */'
};
