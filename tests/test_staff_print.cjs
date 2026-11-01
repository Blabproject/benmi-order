const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
function fixture() {
 const storage=new Map();
 const window={location:{search:'?tenant=a'},OrderDetailView:require('../js/order-detail-view.js'),staffOrderingCapabilities:{auto_print_new:true,auto_print_round:true}};
 vm.runInNewContext(fs.readFileSync('js/printer-service.js','utf8'),{window,console,URLSearchParams,document:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
 const service=window.PrinterService;
 service.saveSettings({autoPrintNewOrders:true,cashier:{enabled:true,interface_type:'network',ip:'127.0.0.1'},kitchen:{enabled:true,interface_type:'network',ip:'127.0.0.1'}});
 const round=n=>({roundNumber:n,createdAt:'2026-01-01',note:'',groups:[],discount:0,total:n*100,items:[{lineId:'line'+n,itemId:'item'+n,name:'Item '+n,quantity:1,unitPrice:n*100,subtotal:n*100,note:'',portions:[{portionIndex:0,note:'',groups:[]}]}]});
 const order={key:'order',orderId:'uuid',source:'staff',status:'ACCEPTED',total:600,detailSnapshot:{schemaVersion:1,rounds:[round(1),round(2),round(3)],total:600},items:[1,2,3].map(n=>({round_number:n,item_name:'Item '+n}))};
 return {service,window,order};
}
test('staff printing sends only each requested round, deduplicates across stations and reload',async()=>{
 const {service,window,order}=fixture();const calls=[];
 service.printCashierReceipt=async o=>calls.push(['cashier',o]);service.printKitchenTicket=async o=>calls.push(['kitchen',o]);
 await service.handleIncomingOrders([{...order,round_count:1}]);await service.handleIncomingOrders([{...order,round_count:1}]);
 assert.equal(calls.length,2);assert.equal(calls[0][1].total,100);assert.equal(calls[0][1].detailSnapshot.rounds.length,1);
 await service.handleAppendedRounds([{order,fromRound:2,toRound:3}]);await service.handleAppendedRounds([{order,fromRound:2,toRound:3}]);
 assert.equal(calls.length,6);
 assert.deepEqual(calls.map(([station,o])=>[station,o.items[0].round_number]),[['cashier',1],['kitchen',1],['cashier',2],['kitchen',2],['cashier',3],['kitchen',3]]);
 assert.equal(calls[2][1].content.includes('Item 1'),false);
 window.staffOrderingCapabilities={};await service.handleStaffRounds({...order,orderId:'another'},1,1,'auto_print_new');assert.equal(calls.length,6);
});
test('overlapping polls preserve station sequence and failures cannot loop',async()=>{
 const {service,order}=fixture();let release;const calls=[];
 service.printCashierReceipt=async()=>{calls.push('cashier');await new Promise(r=>release=r);};
 service.printKitchenTicket=async()=>{calls.push('kitchen');throw Error('synthetic offline');};
 const first=service.handleIncomingOrders([{...order,round_count:1}]);await service.handleIncomingOrders([{...order,round_count:1}]);assert.deepEqual(calls,['cashier']);
 release();await first;await service.handleIncomingOrders([{...order,round_count:1}]);assert.deepEqual(calls,['cashier','kitchen']);
 assert.equal(service._inFlightOrderKeys.size,0);assert.equal(service._inFlightStaffRounds.size,0);
});

test('first observation includes every unseen round when polling skipped initial creation',async()=>{
 const {service,order}=fixture();const calls=[];
 service.printCashierReceipt=async o=>calls.push(o.detailSnapshot.rounds[0].roundNumber);
 service.printKitchenTicket=async()=>{};
 await service.handleIncomingOrders([order]);await service.handleIncomingOrders([order]);
 assert.deepEqual(calls,[1,2,3]);
});
