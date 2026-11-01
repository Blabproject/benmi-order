// Real local D1; all rows are synthetic. Never calls a remote API.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const ts = require('../../benmi-worker-official/node_modules/typescript');
require.extensions['.ts'] = (mod,file) => mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {Miniflare,convertV4MiniflareOptions} = require('../../benmi-worker-official/node_modules/miniflare');
const {schemaTrueFixture} = require('./option-groups.cjs');
const {handleStaffRoute,verifyStaffSession} = require('../../benmi-worker-official/src/modules/staff.ts');
const {STAFF_CAPABILITIES} = require('../../benmi-worker-official/src/modules/staff-access.ts');
const {updateOrder,getOrders} = require('../../benmi-worker-official/src/modules/orders.ts');
const {writeDetailedOrder} = require('../../benmi-worker-official/src/modules/order-detail-write.ts');
const {handleAuthChange} = require('../../benmi-worker-official/src/modules/auth.ts');
const {readDetail} = require('../../benmi-worker-official/src/modules/order-detail.ts');
const parse = sql => JSON.parse(execFileSync('python3',['-c',`import sqlite3,sys,json
s='';r=[]
for c in sys.stdin.read():
 s+=c
 if c==';' and sqlite3.complete_statement(s):r.append(s);s=''
print(json.dumps(r))`],{input:sql,encoding:'utf8'}));
async function fixture(t) {
  const mf = new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local")}}',d1Databases:['DB']}));
  t.after(()=>mf.dispose());
  const DB = await mf.getD1Database('DB');
  const source = schemaTrueFixture().db;
  // Schema only; do not copy seeded restaurant data.
  const objects = source.prepare("SELECT type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all();
  await DB.batch(objects.map(o=>DB.prepare(o.sql)));
  source.close();
  const apply = async sql => DB.batch(parse(sql).map(s=>DB.prepare(s)));
  const capabilities = Object.fromEntries(STAFF_CAPABILITIES.map(k=>[k,true]));
  await apply(`INSERT INTO tenants(id,name) VALUES('a','Fixture A'),('b','Fixture B');
    INSERT INTO tenant_config(tenant_id,brand_name,default_password,staff_ordering_enabled,staff_ordering_capabilities)
      VALUES('a','Fixture A','1234',1,'${JSON.stringify(capabilities)}'),('b','Fixture B','1234',0,'{}');
    INSERT INTO menu_categories(id,tenant_id,slug,name) VALUES('food-a','a','food','Meals'),('food-b','b','food','Meals');
    INSERT INTO menu_items(id,tenant_id,category_id,name,price) VALUES('meal-a','a','food-a','Meal',100),('meal-b','b','food-b','Meal',100);
    INSERT INTO restaurant_tables(id,tenant_id,label) VALUES('table-a','a','A1'),('table-b','b','B1');`);
  const kv = new Map([['tenant:a:password','1234'],['tenant:b:password','1234']]);
  const env = {DB,UNIFIED_MENU_ENABLED:'true',ORDER_DETAIL_READS:'true',ORDER_DETAIL_WRITES:'true',
    ORDER_STATE:{get:async (k,type)=>type === "json" && kv.has(k) ? JSON.parse(kv.get(k)) : kv.get(k)||null,put:async(k,v)=>kv.set(k,v),delete:async k=>kv.delete(k)}};
  const context = tenant=>({tenantId:tenant,brandName:'Fixture',defaultPassword:'1234',allowDineIn:true,storeStatus:'open',features:['dine_in']});
  async function call(path,body,token,method=body?'POST':'GET',tenant='a') {
    const response = await handleStaffRoute(new Request(`https://local.test${path}?tenant_id=${tenant}`,{
      method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,path,context(tenant));
    return {http:response.status,...await response.json()};
  }
  const login = await call('/api/staff/session',{pin:'1234'});
  assert.equal(login.http,200,JSON.stringify(login));
  const token = login.token;
  const input = (change={})=>({requestId:crypto.randomUUID(),tableId:'table-a',total:100,orderSelections:[],items:[{itemId:'meal-a',quantity:1}],...change});
  return {DB,env,apply,call,context,token,input,capabilities};
}

module.exports={fixture};
