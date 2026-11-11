import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const LEGACY_ROOT_FILES = [
  '_headers',
  '_redirects',
  '_routes.json',
  '_build.json',
  'index.css',
  'index.html',
  'orders.html',
  'marketplace.html',
  'staff-order.html',
  'payment-result.html',
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
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        'pos-sandbox': path.resolve(rootDir, 'frontend/apps/pos/sandbox.html')
      }
    }
  }
});
