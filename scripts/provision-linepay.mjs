// Reads secrets only from stdin; emits encrypted SQL for review and cf D1 execution.
import { webcrypto, randomUUID } from 'node:crypto';
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>32768)throw new Error('Input too large');}
const data=JSON.parse(input),{tenantId,environment,mode,channelId,channelSecret,masterKey,keyVersion='v1',returnUrl}=data;
if(!/^[a-zA-Z0-9_-]+$/.test(tenantId)||!['dev','staging','production'].includes(environment)||!['sandbox','production'].includes(mode)||!/^\d+$/.test(channelId)||!channelSecret)throw new Error('Invalid connection');
if(environment!=='production'&&mode==='production')throw new Error('Real payments only in production');
const url=new URL(returnUrl);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new Error('HTTPS return URL required');
const keyBytes=Buffer.from(masterKey,'base64');if(keyBytes.length!==32)throw new Error('32-byte base64 masterKey required');
const id=randomUUID(),iv=webcrypto.getRandomValues(new Uint8Array(12));
const key=await webcrypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt']);
const encrypted=await webcrypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(JSON.stringify(['benmi-payment-v1',environment,tenantId,id]))},key,new TextEncoder().encode(channelSecret));
const value='v1.'+Buffer.from(iv).toString('base64')+'.'+Buffer.from(encrypted).toString('base64');
const sql=v=>"'"+String(v).replaceAll("'","''")+"'";
process.stdout.write(`-- Disabled by default. Store the master key in PAYMENT_SECRET_KEYS before enabling.\nINSERT INTO tenant_payment_connections(id,tenant_id,environment,mode,channel_id,encrypted_secret,key_version,return_url,enabled,created_at) VALUES(${[id,tenantId,environment,mode,channelId,value,keyVersion,url.href].map(sql).join(',')},0,${Date.now()});\n`);
