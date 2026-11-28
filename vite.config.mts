import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { transform as transformCss } from 'lightningcss';
import tailwindcss from 'tailwindcss';
import { defineConfig, transformWithOxc, type Plugin } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const LEGACY_ROOT_FILES = [
  '_headers',
  '_redirects',
  '_routes.json',
  '_build.json',
  'index.css',
  'staff-order.html',
  'landing.html',
  'benmi_logo.png',
  'blab_icon.png',
  'blab_logo.png',
  'bsc_logo.png',
  'hero_app_mockup.png',
  'line-pay-logo.png',
  'zhadan_logo.jpg',
  'zhadan_logo.png'
];

const LEGACY_ASSET_DIRS = ['css', 'js', 'wasm'];

const LEGACY_WEBVIEW_CSS_TARGETS = { chrome: 79 << 16, safari: 13 << 16 };

async function transpileLegacyJs(srcPath: string, outPath: string): Promise<void> {
  if (srcPath.endsWith('.min.js') || !srcPath.endsWith('.js')) {
    fs.copyFileSync(srcPath, outPath);
    return;
  }
  const source = fs.readFileSync(srcPath, 'utf8');
  const result = await transformWithOxc(source, srcPath, {
    lang: 'js',
    sourceType: 'script',
    target: 'es2019'
  });
  fs.writeFileSync(outPath, result.code, 'utf8');
}

function transpileLegacyCss(srcPath: string, outPath: string): void {
  const result = transformCss({
    filename: srcPath,
    code: fs.readFileSync(srcPath),
    minify: false,
    targets: LEGACY_WEBVIEW_CSS_TARGETS
  });
  fs.writeFileSync(outPath, result.code);
}

/**
 * Keeps zero-build legacy HTML/CSS/JS/WASM pages and Cloudflare Pages routing
 * files intact inside dist/ while lowering legacy JS/CSS to ES2019 / Chrome 79.
 */
function legacyPagesCoexistencePlugin(): Plugin {
  return {
    name: 'benmi-legacy-pages-coexistence',
    apply: 'build',
    async closeBundle() {
      const outDir = path.resolve(rootDir, 'dist');
      for (const file of LEGACY_ROOT_FILES) {
        const src = path.join(rootDir, file);
        if (!fs.existsSync(src)) continue;
        if (file.endsWith('.css')) {
          transpileLegacyCss(src, path.join(outDir, file));
        } else {
          fs.copyFileSync(src, path.join(outDir, file));
        }
      }
      // Publish installable Android releases alongside the POS web app.
      const apkDir = path.join(rootDir, 'apps/android-pos');
      const apkOutDir = path.join(outDir, 'apps/android-pos');
      fs.mkdirSync(apkOutDir, { recursive: true });
      for (const file of fs.readdirSync(apkDir).filter(name => name.endsWith('.apk'))) {
        fs.copyFileSync(path.join(apkDir, file), path.join(apkOutDir, file));
      }
      const legacyJsStems = new Set<string>();
      for (const dir of LEGACY_ASSET_DIRS) {
        const srcDir = path.join(rootDir, dir);
        const destDir = path.join(outDir, dir);
        if (!fs.existsSync(srcDir)) continue;
        if (dir === 'wasm') {
          fs.cpSync(srcDir, destDir, { recursive: true });
          continue;
        }
        fs.mkdirSync(destDir, { recursive: true });
        for (const entry of fs.readdirSync(srcDir)) {
          const srcFile = path.join(srcDir, entry);
          const outFile = path.join(destDir, entry);
          if (!fs.statSync(srcFile).isFile()) continue;
          if (dir === 'css' && entry.endsWith('.css')) {
            transpileLegacyCss(srcFile, outFile);
          } else if (dir === 'js') {
            if (entry.endsWith('.js') && !entry.endsWith('.min.js')) {
              legacyJsStems.add(entry.slice(0, -3));
            }
            await transpileLegacyJs(srcFile, outFile);
          } else {
            fs.copyFileSync(srcFile, outFile);
          }
        }
      }
      // Lower Vite-copied preload script assets (e.g. client-core-*.js) that bypass Rollup transforms.
      const assetsDir = path.join(outDir, 'assets');
      if (fs.existsSync(assetsDir)) {
        for (const asset of fs.readdirSync(assetsDir)) {
          if (!asset.endsWith('.js')) continue;
          const stem = asset.match(/^(.+)-[A-Za-z0-9_-]{8}\.js$/)?.[1];
          if (stem && legacyJsStems.has(stem)) {
            await transpileLegacyJs(path.join(assetsDir, asset), path.join(assetsDir, asset));
          }
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), legacyPagesCoexistencePlugin()],
  resolve: {
    alias: {
      '@shared': path.resolve(rootDir, 'frontend/shared'),
      '@pos': path.resolve(rootDir, 'frontend/apps/pos')
    }
  },
  css: {
    postcss: {
      plugins: [tailwindcss({
        content: [
          './frontend/apps/pos/{PosHistoryPanel,history-bridge,settings-bridge,PosDisplaySettings,PosAiSettingsPanel,ItemDetailForm,MenuCatalogLists}.tsx',
          './frontend/apps/pos/{settings,schedule}/**/*.tsx',
          './frontend/apps/staff-order/*.tsx',
          './frontend/shared/ui/*.tsx'
        ],
        prefix: 'ps-',
        corePlugins: { preflight: false }
      })]
    }
  },
  publicDir: false,
  build: {
    target: ['es2019', 'chrome74', 'safari13.1'],
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    // Keep 100vh/top-right-bottom-left/classic @media fallbacks for older Android POS WebViews.
    cssTarget: ['chrome79', 'safari13'],
    rollupOptions: {
      input: {
        'pos-sandbox': path.resolve(rootDir, 'frontend/apps/pos/sandbox.html'),
        index: path.resolve(rootDir, 'index.html'),
        orders: path.resolve(rootDir, 'orders.html'),
        'payment-result': path.resolve(rootDir, 'payment-result.html'),
        marketplace: path.resolve(rootDir, 'marketplace.html')
      }
    }
  }
});
