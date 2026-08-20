import {platformEnv,randomId,sha256} from "@/lib/platform";

export const personalClientKeyName="Persönlicher Telemetrie-Client";

const hex=(bytes:Uint8Array)=>Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("");

async function fixedUserToken(userId:string,credentialId:string){
  const env=platformEnv();
  const secret=env.BOT_INTERNAL_KEY?.trim()||env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if(!secret)throw new Error("Servergeheimnis für persönliche Clientschlüssel fehlt");
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`vtc-truck-hub:telemetry:${userId}:${credentialId}`))));
  return `vth_user_${userId.replaceAll("-","").slice(0,16)}.${signature}`;
}

/**
 * Returns one stable account-bound telemetry credential. Only its hash is
 * persisted. Every telemetry request still requires an active membership in
 * the VTC named by the packet.
 */
export async function issuePersonalClientKey(userId:string){
  const existing=await platformEnv().DB.prepare(
    `SELECT id,secret_hash AS secretHash FROM api_keys WHERE user_id=? AND vtc_id IS NULL AND name=? AND revoked_at IS NULL LIMIT 1`,
  ).bind(userId,personalClientKeyName).first<{id:string;secretHash:string}>();
  const id=existing?.id??randomId();
  const raw=await fixedUserToken(userId,id);
  const prefix=raw.slice(0,20);
  const digest=await sha256(raw);
  if(existing){
    if(existing.secretHash!==digest)await platformEnv().DB.prepare(`UPDATE api_keys SET prefix=?,secret_hash=? WHERE id=?`).bind(prefix,digest,id).run();
    return {id,key:raw,prefix};
  }
  await platformEnv().DB.prepare(
    `INSERT INTO api_keys (id,vtc_id,user_id,name,prefix,secret_hash,scopes,rate_limit) VALUES (?,NULL,?,?,?,?,'["telemetry:write"]',240)`,
  ).bind(id,userId,personalClientKeyName,prefix,digest).run();
  return {id,key:raw,prefix};
}
