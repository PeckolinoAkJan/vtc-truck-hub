import {issuePersonalClientKey} from "@/lib/client-access";
import {apiError,ensureDatabase,getSessionUser,platformEnv,publicRequestOrigin} from "@/lib/platform";
import {syncSupabaseDirectory} from "@/lib/supabase-auth";

export async function GET(request:Request){
  await ensureDatabase();
  const user=await getSessionUser(request);if(!user)return apiError("Anmeldung erforderlich",401);
  await syncSupabaseDirectory().catch(()=>null);
  const rows=await platformEnv().DB.prepare(`SELECT v.id,v.name,v.tag,v.slug,r.name AS roleName FROM memberships m JOIN vtcs v ON v.id=m.vtc_id LEFT JOIN roles r ON r.id=m.role_id WHERE m.user_id=? AND m.status='active' ORDER BY r.rank DESC,v.name`).bind(user.id).all();
  const issued=await issuePersonalClientKey(user.id);
  return Response.json({user,memberships:rows.results.map(row=>({...row,clientKey:issued.key,keyPrefix:issued.prefix})),clientKey:issued.key,apiBase:publicRequestOrigin(request)});
}

export async function POST(request:Request){
  await ensureDatabase();
  const user=await getSessionUser(request);if(!user)return apiError("Anmeldung erforderlich",401);
  const body=await request.json().catch(()=>({})) as {vtcId?:string},vtcId=String(body.vtcId??"");
  const membership=await platformEnv().DB.prepare(`SELECT v.id,v.name,v.tag FROM memberships m JOIN vtcs v ON v.id=m.vtc_id WHERE m.user_id=? AND m.vtc_id=? AND m.status='active'`).bind(user.id,vtcId).first<{id:string;name:string;tag:string}>();
  if(!membership)return apiError("Du bist dieser Spedition nicht aktiv zugeordnet",403);
  const issued=await issuePersonalClientKey(user.id);
  return Response.json({key:issued.key,vtc:membership,notice:"Der feste persönliche Schlüssel wurde sicher für dieses Konto erzeugt. Die Speditionsberechtigung wird bei jeder Übertragung geprüft."});
}
