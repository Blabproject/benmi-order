const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {Miniflare,convertV4MiniflareOptions}=require('../benmi-worker-official/node_modules/miniflare');
const split=sql=>JSON.parse(execFileSync('python3',['-c',`import sqlite3,sys,json
s='';r=[]
for c in sys.stdin.read():
 s+=c
 if c==';' and sqlite3.complete_statement(s):r.append(s);s=''
print(json.dumps(r))`],{input:sql,encoding:'utf8'}));
for(const oldGuard of [false,true]) test(`0073 replaces ${oldGuard?'staging legacy guard':'production/dev baseline'} and preserves rows`,async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local")}}',d1Databases:['DB']}));t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');const apply=sql=>db.batch(split(sql).map(s=>db.prepare(s)));
 await apply(`CREATE TABLE tenant_lifecycle(tenant_id TEXT PRIMARY KEY,state TEXT);
 CREATE TABLE restaurant_tables(id TEXT PRIMARY KEY,tenant_id TEXT,label TEXT,is_active INTEGER DEFAULT 1);
 CREATE TABLE staff_sessions(token_hash TEXT PRIMARY KEY,tenant_id TEXT,expires_at TEXT,revoked_at TEXT);
 CREATE TABLE orders(key TEXT PRIMARY KEY,tenant_id TEXT,source TEXT,revision INTEGER,status TEXT,total_amount REAL,
 order_content TEXT,note TEXT,round_count INTEGER,detail_revision INTEGER,table_id TEXT,table_number TEXT,dining_option TEXT);
 CREATE UNIQUE INDEX idx_orders_active_staff_table ON orders(tenant_id,table_id) WHERE source='staff' AND status NOT IN ('PAID','REJECTED','PICKED_UP');
 INSERT INTO restaurant_tables VALUES('table','a','A1',1);
 INSERT INTO orders(key,tenant_id,source,revision,status,total_amount,table_id,table_number)
 VALUES('legacy','a','legacy',0,'NEW',10,NULL,NULL),('staff','a','staff',1,'ACCEPTED',100,'table','A1');
 INSERT INTO staff_sessions VALUES('synthetic','a','2030-01-01',NULL);`);
 if(oldGuard) await apply("CREATE TRIGGER orders_staff_revision_guard BEFORE UPDATE ON orders WHEN NEW.revision<0 BEGIN SELECT RAISE(ABORT,'revision'); END;");
 const before=(await db.prepare('SELECT * FROM orders ORDER BY key').all()).results;
 await apply(fs.readFileSync('benmi-worker-official/migrations/0073_staff_order_transaction_guards.sql','utf8'));
 assert.deepEqual((await db.prepare('SELECT * FROM orders ORDER BY key').all()).results,before);
 assert.equal((await db.prepare('SELECT pin_hash FROM staff_sessions').first()).pin_hash,null);
 await db.prepare("UPDATE orders SET total_amount=11 WHERE key='legacy'").run();
 await assert.rejects(db.prepare("UPDATE orders SET total_amount=1 WHERE key='staff'").run(),/REVISION/);
 await db.prepare("UPDATE orders SET status='PAID',revision=2 WHERE key='staff'").run();
 await assert.rejects(db.prepare("UPDATE orders SET status='ACCEPTED',revision=3 WHERE key='staff'").run(),/LOCKED/);
 assert.equal((await db.prepare("SELECT total_amount FROM orders WHERE key='staff'").first()).total_amount,100);

 await apply(fs.readFileSync('benmi-worker-official/migrations/0074_allow_staff_takeaway_orders.sql','utf8'));
 const trigger = await db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='staff_order_write_guard'").first();
 assert.equal(trigger, null);
 await db.prepare("INSERT INTO orders(key,tenant_id,source,revision,status,total_amount,table_id,table_number,dining_option) VALUES ('takeaway','a','staff',1,'ACCEPTED',50,NULL,'','takeaway')").run();
});
