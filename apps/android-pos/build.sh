#!/usr/bin/env bash
set -e

# ==========================================================
# Benmi POS - Web Assets Sync Script for Capacitor
# Copies root web files into apps/android-pos/dist/
# ==========================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"

echo "📦 Preparing web assets in $DIST_DIR..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# 0. Ensure Vite-compiled POS frontend bundles and transpiled legacy assets exist
if [ ! -f "$ROOT_DIR/dist/orders.html" ] || [ ! -d "$ROOT_DIR/dist/assets" ] || [ ! -d "$ROOT_DIR/dist/js" ] || [ ! -d "$ROOT_DIR/dist/css" ]; then
  echo "⚙️  Building compiled POS frontend bundles via Vite..."
  (cd "$ROOT_DIR" && npm run build:frontend)
fi

# 1. Copy compiled POS HTML (with bundled React modules) and Customer HTML files
cp "$ROOT_DIR/dist/orders.html" "$DIST_DIR/orders.html"
# Set orders.html as default landing page index.html in the Android POS App
cp "$ROOT_DIR/dist/orders.html" "$DIST_DIR/index.html"

if [ -f "$ROOT_DIR/dist/index.html" ]; then
  cp "$ROOT_DIR/dist/index.html" "$DIST_DIR/customer-menu.html"
elif [ -f "$ROOT_DIR/index.html" ]; then
  cp "$ROOT_DIR/index.html" "$DIST_DIR/customer-menu.html"
fi

# 1b. Copy Vite-compiled JS/CSS assets for React POS modules (History, Reports, etc.)
if [ -d "$ROOT_DIR/dist/assets" ]; then
  cp -r "$ROOT_DIR/dist/assets" "$DIST_DIR/"
fi

# 2. Copy WebView-transpiled CSS stylesheets
if [ -d "$ROOT_DIR/dist/css" ]; then
  cp -r "$ROOT_DIR/dist/css" "$DIST_DIR/"
fi
if [ -f "$ROOT_DIR/dist/index.css" ]; then
  cp "$ROOT_DIR/dist/index.css" "$DIST_DIR/"
fi

# 3. Copy ES2019-transpiled JavaScript modules
if [ -d "$ROOT_DIR/dist/js" ]; then
  cp -r "$ROOT_DIR/dist/js" "$DIST_DIR/"
fi

# 4. Copy assets & images if present
if [ -d "$ROOT_DIR/images" ]; then
  cp -r "$ROOT_DIR/images" "$DIST_DIR/"
fi
if [ -d "$ROOT_DIR/assets" ]; then
  cp -r "$ROOT_DIR/assets" "$DIST_DIR/"
fi
if [ -f "$ROOT_DIR/blab_icon.png" ]; then
  cp "$ROOT_DIR/blab_icon.png" "$DIST_DIR/"
fi

if [ "${APP_ENV:-}" = "pilot" ] || [ "${APP_ENV:-}" = "dev-local" ]; then
  node - "$DIST_DIR/js/orders-core.js" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
fs.writeFileSync(file, 'window.POS_BUNDLED_ENV = ' + JSON.stringify(process.env.APP_ENV === 'dev-local' ? 'dev' : 'prod') + ';\n' + fs.readFileSync(file, 'utf8'));
NODE
fi

echo "✅ Web assets synchronized successfully into $DIST_DIR!"
