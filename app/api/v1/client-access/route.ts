import {issuePersonalClientKey,personalClientKeyName} from "@/lib/client-access";
import {apiError,ensureDatabase,getSessionUser,platformEnv} from "@/lib/platform";
import {syncSupabaseDirectory} from "@/lib/supabase-auth";

export async function GET(request:Request){
  await ensureDatabase();
  const user=await getSessionUser(request);if(!user)return apiError("Anmeldung erforderlich",401);
  await syncSupabaseDirectory().catch(()=>null);
  const rows=await platformEnv().DB.prepare(`SELECT v.id,v.name,v.tag,v.slug,r.name AS roleName,k.id AS keyId,k.prefix,k.last_used_at AS lastUsedAt,k.created_at AS keyCreatedAt FROM memberships m JOIN vtcs v ON v.id=m.vtc_id LEFT JOIN roles r ON r.id=m.role_id LEFT JOIN api_keys k ON k.vtc_id=v.id AND k.user_id=m.user_id AND k.name=? AND k.revoked_at IS NULL WHERE m.user_id=? AND m.status='active' ORDER BY r.rank DESC,v.name`).bind(personalClientKeyName,user.id).all();
  return Response.json({memberships:rows.results});
}

export async function POST(request:Request){
  await ensureDatabase();
  const user=await getSessionUser(request);if(!user)return apiError("Anmeldung erforderlich",401);
  const body=await request.json().catch(()=>({})) as {vtcId?:string},vtcId=String(body.vtcId??"");
  const membership=await platformEnv().DB.prepare(`SELECT v.id,v.name,v.tag FROM memberships m JOIN vtcs v ON v.id=m.vtc_id WHERE m.user_id=? AND m.vtc_id=? AND m.status='active'`).bind(user.id,vtcId).first<{id:string;name:string;tag:string}>();
  if(!membership)return apiError("Du bist dieser Spedition nicht aktiv zugeordnet",403);
  const issued=await issuePersonalClientKey(user.id,vtcId);
  return Response.json({key:issued.key,vtc:membership,notice:"Der persönliche Schlüssel wurde sicher für dieses Konto und diese Spedition erzeugt."});
}
