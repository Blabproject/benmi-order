import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import { defineConfig, type Plugin } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const LEGACY_ROOT_FILES = [
  '_headers',
  '_redirects',
  '_routes.json',
  '_build.json',
  'index.css',
  'index.html',
  'marketplace.html',
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

/**
 * Keeps zero-build legacy HTML/CSS/JS/WASM pages and Cloudflare Pages routing
 * files intact inside dist/ alongside content-hashed Vite/React bundles.
 */
function legacyPagesCoexistencePlugin(): Plugin {
  return {
    name: 'benmi-legacy-pages-coexistence',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(rootDir, 'dist');
      for (const file of LEGACY_ROOT_FILES) {
        const src = path.join(rootDir, file);
        if (fs.existsSync(src)) {
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
      for (const dir of LEGACY_ASSET_DIRS) {
        const srcDir = path.join(rootDir, dir);
        if (fs.existsSync(srcDir)) {
          fs.cpSync(srcDir, path.join(outDir, dir), { recursive: true });
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
          './frontend/apps/pos/{settings-bridge,PosDisplaySettings,PosAiSettingsPanel}.tsx',
          './frontend/apps/pos/settings/**/*.tsx',
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
        orders: path.resolve(rootDir, 'orders.html'),
        'payment-result': path.resolve(rootDir, 'payment-result.html')
      }
    }
  }
});
