import {apiError,ensureDatabase,platformEnv,publicRequestOrigin,sha256} from "@/lib/platform";
import {issuePersonalClientKey,personalClientKeyName} from "@/lib/client-access";
import {syncSupabaseDirectory} from "@/lib/supabase-auth";

export async function GET(request:Request){
  await ensureDatabase();
  const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"").trim();
  if(!supplied)return apiError("Persönlicher Clientschlüssel fehlt",401);
  const key=await platformEnv().DB.prepare(
    `SELECT user_id AS userId FROM api_keys WHERE secret_hash=? AND name=? AND vtc_id IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)`,
  ).bind(await sha256(supplied),personalClientKeyName).first<{userId:string}>();
  if(!key?.userId)return apiError("Persönlicher Clientschlüssel ist ungültig oder widerrufen",401);
  await syncSupabaseDirectory().catch(()=>null);
  const user=await platformEnv().DB.prepare(`SELECT id,email,display_name AS displayName FROM users WHERE id=?`).bind(key.userId).first();
  if(!user)return apiError("Benutzerkonto wurde nicht gefunden",404);
  const memberships=await platformEnv().DB.prepare(
    `SELECT v.id,v.name,v.tag,v.slug,r.name AS roleName FROM memberships m JOIN vtcs v ON v.id=m.vtc_id LEFT JOIN roles r ON r.id=m.role_id WHERE m.user_id=? AND m.status='active' ORDER BY r.rank DESC,v.name`,
  ).bind(key.userId).all();
  const issued=await issuePersonalClientKey(key.userId);
  return Response.json({user,memberships:memberships.results.map(row=>({...row,clientKey:issued.key,keyPrefix:issued.prefix})),clientKey:issued.key,apiBase:publicRequestOrigin(request)});
}
