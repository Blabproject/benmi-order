const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function getPosDistDir() {
  const root = path.resolve(__dirname, '..', '..');
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(path.join(dist, '.vite/manifest.json')) || !fs.existsSync(path.join(dist, 'orders.html'))) {
    execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.mts'], {
      cwd: root,
      stdio: 'inherit'
    });
  }
  return dist;
}

module.exports = { getPosDistDir };
