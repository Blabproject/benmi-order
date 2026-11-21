#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_PATH="$SCRIPT_DIR/src-tauri/target/release/bundle/macos/Blab POS.app"
DMG_DIR="$SCRIPT_DIR/src-tauri/target/release/bundle/dmg"
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
  ARCH="aarch64"
fi
DMG_PATH="$DMG_DIR/Blab POS_1.1.4_${ARCH}.dmg"

if [ ! -d "$APP_PATH" ]; then
  echo "❌ Missing app bundle at $APP_PATH"
  exit 1
fi

rm -rf /tmp/benmi-dmg-staging "$DMG_PATH"
mkdir -p /tmp/benmi-dmg-staging "$DMG_DIR"
cp -R "$APP_PATH" /tmp/benmi-dmg-staging/
ln -s /Applications /tmp/benmi-dmg-staging/Applications
hdiutil create -volname "Blab POS" -srcfolder /tmp/benmi-dmg-staging -ov -format UDZO "$DMG_PATH"
rm -rf /tmp/benmi-dmg-staging

echo "✅ Created macOS DMG installer: $DMG_PATH"
