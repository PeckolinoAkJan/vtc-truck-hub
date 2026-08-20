import {apiError,ensureDatabase,getSessionUser,platformEnv,randomId,sha256} from "@/lib/platform";
import {syncSupabaseDirectory} from "@/lib/supabase-auth";

const personalKeyName="Persönlicher Telemetrie-Client";
const token=(length:number)=>Array.from(crypto.getRandomValues(new Uint8Array(length)),b=>b.toString(16).padStart(2,"0")).join("").slice(0,length);

export async function GET(request:Request){
  await ensureDatabase();
  const user=await getSessionUser(request);if(!user)return apiError("Anmeldung erforderlich",401);
  await syncSupabaseDirectory().catch(()=>null);
  const rows=await platformEnv().DB.prepare(`SELECT v.id,v.name,v.tag,v.slug,r.name AS roleName,k.id AS keyId,k.prefix,k.last_used_at AS lastUsedAt,k.created_at AS keyCreatedAt FROM memberships m JOIN vtcs v ON v.id=m.vtc_id LEFT JOIN roles r ON r.id=m.role_id LEFT JOIN api_keys k ON k.vtc_id=v.id AND k.user_id=m.user_id AND k.name=? AND k.revoked_at IS NULL WHERE m.user_id=? AND m.status='active' ORDER BY r.rank DESC,v.name`).bind(personalKeyName,user.id).all();
  return Response.json({memberships:rows.results});
}

export async function POST(request:Request){
  await ensureDatabase();
  const user=await getSessionUser(request);if(!user)return apiError("Anmeldung erforderlich",401);
  const body=await request.json().catch(()=>({})) as {vtcId?:string},vtcId=String(body.vtcId??"");
  const membership=await platformEnv().DB.prepare(`SELECT v.id,v.name,v.tag FROM memberships m JOIN vtcs v ON v.id=m.vtc_id WHERE m.user_id=? AND m.vtc_id=? AND m.status='active'`).bind(user.id,vtcId).first<{id:string;name:string;tag:string}>();
  if(!membership)return apiError("Du bist dieser Spedition nicht aktiv zugeordnet",403);
  const raw=`vth_live_${token(12)}.${token(40)}`,prefix=raw.slice(0,20),id=randomId(),hash=await sha256(raw),db=platformEnv().DB;
  await db.batch([
    db.prepare(`UPDATE api_keys SET revoked_at=CURRENT_TIMESTAMP WHERE vtc_id=? AND user_id=? AND name=? AND revoked_at IS NULL`).bind(vtcId,user.id,personalKeyName),
    db.prepare(`INSERT INTO api_keys (id,vtc_id,user_id,name,prefix,secret_hash,scopes,rate_limit) VALUES (?,?,?,?,?,?,'["telemetry:write"]',240)`).bind(id,vtcId,user.id,personalKeyName,prefix,hash),
  ]);
  return Response.json({key:raw,vtc:membership,notice:"Der persönliche Schlüssel wird nur jetzt vollständig angezeigt. Trage ihn im Desktop-Client ein."});
}
