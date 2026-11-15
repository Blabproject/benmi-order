import type { Env } from '../types/env';
export type PendingDecision = 'cancel' | 'resume' | 'accept_time' | 'request_items';
interface PendingRow {
 action_id: string | null; order_revision: number | null; action_type: string; reason: string; note: string;
 created_ms: number | null; expires_ms: number | null; revision: number; status: string; pickup_time: string;
}
/** Called only after LINE signature verification, using event.source.userId (not client JSON). */
export async function resolvePendingOrder(env: Env, tenant: string, key: string, user: string,
 actionId: string, decision: PendingDecision, eventTime: number, replyText = ''): Promise<boolean> {
 if (!/^[a-f0-9]{32}$/i.test(actionId) || !Number.isFinite(eventTime) || !user
   || !['cancel','resume','accept_time','request_items'].includes(decision)) return false;
 const replay = await env.DB.prepare(`SELECT decision,reply_text FROM order_pending_resolutions
  WHERE tenant_id=? AND action_id=? AND order_key=? AND user_id=?`).bind(tenant,actionId,key,user).first<{decision:string;reply_text:string}>();
 if (replay) return replay.decision === decision && replay.reply_text === (decision==='request_items'?replyText.trim():'');
 const pending = await env.DB.prepare(`SELECT p.action_id,p.order_revision,p.action_type,p.reason,p.note,p.created_ms,p.expires_ms,
  o.revision,o.status,o.pickup_time FROM pending_actions p JOIN orders o ON o.tenant_id=p.tenant_id AND o.key=p.order_key
  WHERE p.tenant_id=? AND p.order_key=? AND p.user_id=? AND o.user_id=? AND p.action_id=?`)
  .bind(tenant,key,user,user,actionId).first<PendingRow>();
 const now = Date.now();
 if (!pending || pending.order_revision !== pending.revision || !pending.created_ms || !pending.expires_ms
   || pending.expires_ms<=now || eventTime<pending.created_ms || eventTime>now+60000
   || !['NEW','ACCEPTED','READY','WAITING_CUSTOMER_CHANGE','WAITING_CUSTOMER_REJECT'].includes(pending.status)) return false;
 if (decision==='accept_time' && (pending.action_type!=='CHANGE' || pending.reason!=='時間需調整')) return false;
 if (decision==='resume' && pending.action_type!=='REJECT') return false;
 if (decision==='request_items' && (pending.action_type!=='CHANGE' || pending.reason==='時間需調整' || !replyText.trim() || replyText.length>2000)) return false;
 let pickup = pending.pickup_time;
 if (decision==='accept_time') {
   if (!pending.note?.trim()) return false;
   const oldDate=(pickup || '').split(' ')[0];
   pickup=oldDate.includes('-')&&!pending.note.includes('-') ? oldDate+' '+pending.note : pending.note;
 }
 const next=decision==='cancel'?'CANCELLED':'NEW';
 // A text request is staff review information, never a replacement for priced items.
 const note=decision==='request_items'?replyText.trim():'';
 const statements=[env.DB.prepare(`INSERT INTO order_pending_resolutions
  (tenant_id,action_id,order_key,user_id,decision,expected_revision,next_status,reply_text,resolved_at) VALUES(?,?,?,?,?,?,?,?,?)`)
  .bind(tenant,actionId,key,user,decision,pending.revision,next,note,now),
  env.DB.prepare(`UPDATE orders SET status=?,revision=revision+1,pickup_time=?,
   reason=?,note=?,updated_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE tenant_id=? AND key=? AND revision=? AND user_id=?`)
   .bind(next,pickup,decision==='request_items'?'CUSTOMER_CHANGE_REVIEW_REQUIRED':'',note,tenant,key,pending.revision,user),
  env.DB.prepare(decision==='request_items'
    ? "UPDATE pending_actions SET reason='CUSTOMER_CHANGE_REVIEW_REQUIRED',note=? WHERE tenant_id=? AND order_key=? AND user_id=? AND action_id=?"
    : 'DELETE FROM pending_actions WHERE tenant_id=? AND order_key=? AND user_id=? AND action_id=?')
   .bind(...(decision==='request_items'?[note,tenant,key,user,actionId]:[tenant,key,user,actionId]))];
 try { await env.DB.batch(statements);return true; }
 catch (error) {
   const prior = await env.DB.prepare('SELECT decision,reply_text FROM order_pending_resolutions WHERE tenant_id=? AND action_id=? AND user_id=? AND order_key=?')
     .bind(tenant,actionId,user,key).first<{decision:string;reply_text:string}>();
   if(prior)return prior.decision===decision && prior.reply_text===(decision==='request_items'?replyText.trim():'');
   if(String(error).includes('PENDING_ACTION_STALE') || String(error).includes('ORDER_FINALIZED'))return false;
   throw error;
 }
}
