import {platformEnv,randomId,sha256} from "@/lib/platform";

export const personalClientKeyName="Persönlicher Telemetrie-Client";

const randomToken=(length:number)=>Array.from(
  crypto.getRandomValues(new Uint8Array(length)),
  byte=>byte.toString(16).padStart(2,"0"),
).join("").slice(0,length);

/**
 * Creates a user-bound telemetry credential for one VTC. Only the hash is
 * persisted; the complete credential is returned exactly once to the client.
 * Existing keys stay valid so signing in on a second PC cannot disconnect the
 * first installation. Users and administrators can revoke devices separately.
 */
export async function issuePersonalClientKey(userId:string,vtcId:string){
  const raw=`vth_live_${randomToken(12)}.${randomToken(40)}`;
  const prefix=raw.slice(0,20);
  const id=randomId();
  await platformEnv().DB.prepare(
    `INSERT INTO api_keys (id,vtc_id,user_id,name,prefix,secret_hash,scopes,rate_limit) VALUES (?,?,?,?,?,?,'["telemetry:write"]',240)`,
  ).bind(id,vtcId,userId,personalClientKeyName,prefix,await sha256(raw)).run();
  return {id,key:raw,prefix};
}
