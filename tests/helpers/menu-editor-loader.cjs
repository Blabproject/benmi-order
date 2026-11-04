// Shared helper to evaluate MenuEditorModel and orders-menu.js in VM contexts
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const modelCode = fs.readFileSync(path.join(root, 'js/orders-menu-model.js'), 'utf8');
const menuCode = fs.readFileSync(path.join(root, 'js/orders-menu.js'), 'utf8');

function loadMenuEditor(context = {}) {
  const targetContext = vm.isContext(context) ? context : vm.createContext(context);
  vm.runInContext(modelCode, targetContext);
  vm.runInContext(menuCode, targetContext);
  return targetContext;
}

module.exports = {
  loadMenuEditor,
  modelCode,
  menuCode
};
