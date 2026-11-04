const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const printedText = [];
const storage = {};
const document = { createElement() {
  const canvas = { width: 0, height: 0, toDataURL: ()=>'data:image/png;base64,test' };
  const context = new Proxy({}, { get(target,key) {
    if (key in target) return target[key];
    if (key==='measureText') return text=>({width:String(text).length*10});
    if (key==='fillText') return text=>printedText.push(String(text));
    return ()=>{};
  }});
  canvas.getContext=()=>context; return canvas;
}};
const window={currentTenantBrandName:'Test',location:{search:'?tenant=identity-test'}};
vm.runInNewContext(('(function(){var module;\n' + fs.readFileSync(require.resolve('../js/order-legacy-adapter.js'),'utf8') + '\n})();\n' + fs.readFileSync(require.resolve('../js/printer-service.js'),'utf8')),{
  window,document,console,URLSearchParams,localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>{storage[k]=v}}
});
const service=window.PrinterService;
const order={key:'48cc482f-01ca-4939-ae70-f2c07c9cb4ce',legacyKey:'B0914-T007',displayKey:'B0914-T007',status:'ACCEPTED',total:100,content:'Item',customer:'Test'};
for(const kitchen of [false,true]) {
 printedText.length=0; service.drawReceiptToCanvas(order,kitchen,80);
 assert(printedText.join('').includes('#B0914-T007'));
 assert(!printedText.join('').includes(order.key));
}
printedText.length=0;service.drawItemStickerToCanvas({name:'Item',quantity:1},order,1,1);
assert(printedText.join('').includes('#B0914-T007'));assert(!printedText.join('').includes(order.key));
(async()=>{
 service.saveSettings({autoPrintNewOrders:true});
 service.markOrderAsPrinted(order.legacyKey);
 const ids=[];service.printDualStation=async o=>{ids.push(o.key);return {success:true}};
 await service.handleAcceptedOrder(order);assert.equal(ids.length,0);
 const later={...order,key:'8588ce97-8efc-4baa-a509-9a6d983b030e',legacyKey:null};
 await service.handleAcceptedOrder(later);assert.deepEqual(ids,[later.key]);
 let release, calls=0;
 const concurrent={...order,key:'concurrent-order',legacyKey:'concurrent-display'};
 service.printDualStation=async()=>{calls++;await new Promise(resolve=>{release=resolve;});};
 const printing=service.handleAcceptedOrder(concurrent);
 await service.handleAcceptedOrder(concurrent);assert.equal(calls,1);
 release();await printing;await service.handleAcceptedOrder(concurrent);assert.equal(calls,1);
 assert.equal(service.isOrderAlreadyPrinted(concurrent.key),true);
 assert.equal(service.isOrderAlreadyPrinted(concurrent.legacyKey),true);
 const failed={...order,key:'offline-order',legacyKey:null};
 service.printDualStation=async()=>{calls++;throw Error('station offline');};
 await service.handleAcceptedOrder(failed);await service.handleAcceptedOrder(failed);
 assert.equal(calls,2);assert.equal(service._inFlightOrderKeys.size,0);
 console.log('PASS receipt/sticker display number, migrated print dedup, later-year accepted order still prints');
})().catch(e=>{console.error(e);process.exitCode=1});
