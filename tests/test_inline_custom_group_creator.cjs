const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Inline Custom Group Creator: customizations-legacy.ts should not call prompt() for addCustomizationGroup or renameCustomizationGroup', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../frontend/apps/pos/menu/customizations-legacy.ts'), 'utf-8');
  assert.ok(!code.includes('prompt(tr("promptAddCustomGroup"))') && !code.includes('prompt(t("promptAddCustomGroup"))'), 'Should not use browser prompt for adding customization group');
  assert.ok(!code.includes('prompt(tr("promptRenameCustomGroup")') && !code.includes('prompt(t("promptRenameCustomGroup")'), 'Should not use browser prompt for renaming customization group');
  assert.ok(code.includes('openNewCustomGroupCreator'), 'Must define openNewCustomGroupCreator');
  assert.ok(code.includes('saveNewCustomizationGroup'), 'Must define saveNewCustomizationGroup');
  assert.ok(code.includes('startRenameCustomizationGroup'), 'Must define startRenameCustomizationGroup');
  assert.ok(code.includes('saveRenameCustomizationGroup'), 'Must define saveRenameCustomizationGroup');
});

test('Inline Custom Group Creator: orders-i18n.js has required keys for inline creation in zh-TW and vi', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../js/orders-i18n.js'), 'utf-8');
  assert.ok(code.includes('newGroupCardTitle: "新增客製化分組"'), 'zh-TW must have newGroupCardTitle');
  assert.ok(code.includes('newGroupCardTitle: "Tạo nhóm tùy chọn mới"'), 'vi must have newGroupCardTitle');
  assert.ok(code.includes('btnSaveGroup: "儲存分組"'), 'zh-TW must have btnSaveGroup');
  assert.ok(code.includes('btnSaveGroup: "Lưu nhóm"'), 'vi must have btnSaveGroup');
});

test('Inline Custom Group Creator: orders.css has .cust-new-group-card defined', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../css/orders.css'), 'utf-8');
  assert.ok(css.includes('.cust-new-group-card'), 'orders.css must define .cust-new-group-card');
});

test('Inline Custom Group Creator: orders.html has bumped cache busters and TS menu module', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../orders.html'), 'utf-8');
  assert.ok(/css\/orders\.css\?v=[a-zA-Z0-9_]+/.test(html), 'orders.css cache buster must be bumped');
  assert.ok(html.includes('src="/frontend/apps/pos/menu/index.ts"'), 'orders.html must load POS menu TS entry');
  assert.ok(/js\/orders-i18n\.js\?v=[a-zA-Z0-9_]+/.test(html), 'orders-i18n.js cache buster must be bumped');
});
