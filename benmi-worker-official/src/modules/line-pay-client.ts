/** All provider IDs remain strings, including numeric JSON values beyond 2^53. */
export function parseLinePay(text: string): any {
  return JSON.parse(text.replace(/("(?:transactionId|refundTransactionId)"\s*:\s*)(\d+)/g, '$1"$2"'));
}
export async function paymentHash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2,'0')).join('');
}
export async function linePaySignature(secret: string, path: string, content: string, nonce: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'},false,['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(secret+path+content+nonce)))));
}
export async function linePayCall(connection: {mode: string; channel_id: string}, secret: string,
  path: string, data?: unknown, query = ''): Promise<any> {
  const nonce = crypto.randomUUID(), body = data === undefined ? '' : JSON.stringify(data);
  const signature = await linePaySignature(secret,path,data === undefined ? query : body,nonce);
  const host = connection.mode === 'production' ? 'https://api-pay.line.me' : 'https://sandbox-api-pay.line.me';
  const response = await fetch(host+path+(query ? '?'+query : ''), {
    method: data === undefined ? 'GET' : 'POST',
    headers: {'Content-Type':'application/json','X-LINE-ChannelId':connection.channel_id,
      'X-LINE-Authorization-Nonce':nonce,'X-LINE-Authorization':signature},
    body: body || undefined, signal: AbortSignal.timeout(path.endsWith('/confirm') ? 45000 : 30000)
  });
  // Provider responses are small; bound the stream rather than trusting Content-Length.
  const reader=response.body?.getReader(); let text='', size=0;
  if (!reader) throw new Error('PROVIDER_EMPTY');
  const decoder=new TextDecoder();
  try { for (;;) { const {done,value}=await reader.read(); if(done) break;
    size+=value.length; if(size>262144) throw new Error('PROVIDER_TOO_LARGE'); text+=decoder.decode(value,{stream:true});
  } } finally { await reader.cancel(); }
  if (!response.ok) throw new Error('PROVIDER_HTTP');
  return parseLinePay(text+decoder.decode());
}
