#!/usr/bin/env bash
set -e

# ==========================================================
# Benmi POS - Web Assets Sync Script for Desktop POS (Windows & macOS)
# Copies root web files + boot.html into apps/desktop-pos/dist/
# ==========================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"

echo "📦 Preparing Desktop POS web assets in $DIST_DIR..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# 0. Ensure Vite-compiled POS frontend bundles exist (orders.html + assets/)
if [ ! -f "$ROOT_DIR/dist/orders.html" ] || [ ! -d "$ROOT_DIR/dist/assets" ]; then
  echo "⚙️  Building compiled POS frontend bundles via Vite..."
  (cd "$ROOT_DIR" && npm run build:frontend)
fi

# 1. Copy compiled POS HTML + offline-recovery boot page
cp "$ROOT_DIR/dist/orders.html" "$DIST_DIR/orders.html"
cp "$ROOT_DIR/dist/orders.html" "$DIST_DIR/index.html"
cp "$SCRIPT_DIR/boot.html" "$DIST_DIR/boot.html"

if [ -f "$ROOT_DIR/index.html" ]; then
  cp "$ROOT_DIR/index.html" "$DIST_DIR/customer-menu.html"
fi

if [ -d "$ROOT_DIR/dist/assets" ]; then
  cp -r "$ROOT_DIR/dist/assets" "$DIST_DIR/"
fi

# 2. Copy CSS stylesheets
if [ -d "$ROOT_DIR/css" ]; then
  cp -r "$ROOT_DIR/css" "$DIST_DIR/"
fi
if [ -f "$ROOT_DIR/index.css" ]; then
  cp "$ROOT_DIR/index.css" "$DIST_DIR/"
fi

# 3. Copy JavaScript modules
if [ -d "$ROOT_DIR/js" ]; then
  cp -r "$ROOT_DIR/js" "$DIST_DIR/"
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
fs.writeFileSync(
  file,
  'window.POS_BUNDLED_ENV = ' + JSON.stringify(process.env.APP_ENV === 'dev-local' ? 'dev' : 'prod') + ';\n' + fs.readFileSync(file, 'utf8')
);
NODE
fi

echo "✅ Desktop POS web assets synchronized successfully into $DIST_DIR!"
