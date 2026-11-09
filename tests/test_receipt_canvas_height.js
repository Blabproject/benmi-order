const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const canvases = [];
const document = {
  createElement() {
    const canvas = { width: 0, height: 0, text: [], toDataURL: () => 'data:image/png;base64,test' };
    const context = new Proxy({}, { get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return text => ({ width: [...text].length * parseFloat(target.font.match(/[\d.]+px/)[0]) * 0.65 });
      if (key === 'fillText') return (text, x, y) => {
        assert(y + parseFloat(target.font.match(/[\d.]+px/)[0]) <= canvas.height, `Text clipped: ${text}`);
        canvas.text.push(text);
      };
      if (key === 'drawImage') return (source, x, y, w, h) => assert(h <= source.height);
      return () => {};
    }});
    canvas.getContext = () => context;
    canvases.push(canvas);
    return canvas;
  }
};
const window = { currentTenantBrandName: 'Test Restaurant' };
vm.runInNewContext(('(function(){var module;\n' + fs.readFileSync(require.resolve('../js/order-legacy-adapter.js'),'utf8') + '\n})();\n' + fs.readFileSync(require.resolve('../js/printer-service.js'), 'utf8')), {
  OrderCode: require('../js/order-code.js'), window, document, console, URLSearchParams,
  localStorage: { getItem: () => null }
});
for (const width of [58, 80]) for (const kitchen of [false, true]) {
  for (const count of [3, 100]) {
    canvases.length = 0;
    window.PrinterService.drawReceiptToCanvas({ key: 'TEST', content: Array.from({ length: count }, (_, i) => `Item ${i}`).join('\n'), note: 'Note', total: 100 }, kitchen, width);
    assert(canvases[0].text.join('').includes(`Item ${count - 1}`));
    if (!kitchen) {
      assert(canvases[0].text.join('').includes('謝謝光臨，祝您用餐愉快！'));
      assert(canvases[0].text.join('').includes('Powered by Blab'));
    }
  }
}
console.log('Receipt canvas: short/long cashier and kitchen bills fit at 58/80 mm.');
const historical = window.PrinterService.parseOrderItems({ items: [
  { item_name: 'Tea', quantity: 2, unit_price: 35, selected_options: '[{"choice":"半糖"}]' },
  { name: 'Gift', quantity: 1, price: 0 }
] }, false);
assert.equal(historical[0].price, '$70');
assert.equal(historical[0].unitPrice, '$35');
assert.equal(historical[0].options, '半糖');
assert.equal(historical[1].price, '$0');
