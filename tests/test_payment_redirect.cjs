const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/payment-session.js'),'utf8');
const production={paymentUrl:'https://web-pay.line.me/web/payment/wait?transactionReserveId=example',appUrl:'line://pay/payment/example'};

function fixture(navigator,liff,assign){
 const calls=[],window={navigator,liff};
 vm.runInNewContext(source,{window,URL,location:{assign:url=>{calls.push(url);assign?.(url);}}});
 return {S:window.PaymentSession,calls};
}

for(const [name,navigator,liff,usesApp] of [
 ['iPhone Safari without LIFF',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1'},undefined,true],
 ['Android Chrome outside LIFF',{userAgent:'Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile Safari/537.36'},{isInClient:()=>false},true],
 ['LINE in-app browser outside LIFF',{userAgent:'Mozilla/5.0 (iPhone) Mobile Line/15.20.0'},{isInClient:()=>false},true],
 ['iPad desktop user agent',{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1',platform:'MacIntel',maxTouchPoints:5},undefined,true],
 ['LIFF with a reduced user agent',{userAgent:''},{isInClient:()=>true},true],
 ['desktop Safari',{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1',platform:'MacIntel',maxTouchPoints:0},undefined,false],
 ['touchscreen Windows desktop',{userAgent:'Mozilla/5.0 (Windows NT 10.0) Chrome/130',platform:'Win32',maxTouchPoints:10},undefined,false],
 ['unavailable device signals',{},undefined,false]
])test('LINE Pay target: '+name,()=>{
 const {S,calls}=fixture(navigator,liff);
 assert.equal(S.providerTarget(production).usesApp,usesApp);
 S.openProvider(production);assert.deepEqual(calls,[usesApp?production.appUrl:production.paymentUrl]);
});

test('LINE Pay sandbox and unavailable or invalid app links stay on the web',()=>{
 const {S,calls}=fixture({userAgent:'iPhone'});
 for(const data of [
  {...production,paymentUrl:'https://sandbox-web-pay.line.me/web/payment/wait?transactionReserveId=example'},
  {...production,appUrl:null},
  {...production,appUrl:'javascript:alert(1)'},
  {...production,appUrl:'line://other-app/payment/example'},
  {...production,appUrl:'line://user@pay/payment/example'}
 ]){
  assert.equal(S.providerTarget(data).usesApp,false);S.openProvider(data);assert.equal(calls.at(-1),data.paymentUrl);
 }
});

test('LINE Pay launch blocked by the browser keeps explicit same-payment recovery',()=>{
 const {S,calls}=fixture({userAgent:'iPhone'},undefined,url=>{if(url.startsWith('line:'))throw new Error('App launch blocked');});
 assert.doesNotThrow(()=>S.openProvider(production));
 assert.deepEqual(calls,[production.appUrl],'Do not silently navigate to a different authentication flow');
 S.openProvider(production,true);assert.deepEqual(calls,[production.appUrl,production.paymentUrl]);
});

test('LINE Pay does not hide a failed web navigation',()=>{
 const {S}=fixture({userAgent:'Desktop'},undefined,()=>{throw new Error('Navigation blocked');});
 assert.throws(()=>S.openProvider(production),/Navigation blocked/);
});
