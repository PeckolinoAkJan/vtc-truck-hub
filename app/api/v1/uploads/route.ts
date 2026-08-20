import {apiError,audit,ensureDatabase,getSessionUser,platformEnv,randomId,requireVtcPermission} from "@/lib/platform";

const imagePurposes=new Set(["avatar","company_logo","company_header","gallery","event_image","vehicle_image"]);
const purposes=new Set([...imagePurposes,"trip_evidence","document"]);
const mimeBySignature=(b:Uint8Array)=>{
  if(b.length>=8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47&&b[4]===0x0d&&b[5]===0x0a&&b[6]===0x1a&&b[7]===0x0a)return "image/png";
  if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return "image/jpeg";
  if(b.length>=12&&String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP")return "image/webp";
  if(b.length>=4&&String.fromCharCode(...b.slice(0,4))==="%PDF")return "application/pdf";
  return "";
};
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");

export async function GET(request:Request){
  await ensureDatabase();const db=platformEnv().DB,url=new URL(request.url),id=url.searchParams.get("id");if(!id)return apiError("Upload-ID fehlt");
  const row=await db.prepare(`SELECT u.*,m.purpose,m.status FROM uploads u LEFT JOIN upload_metadata m ON m.upload_id=u.id WHERE u.id=?`).bind(id).first<any>();if(!row)return apiError("Datei nicht gefunden",404);
  const publicAsset=imagePurposes.has(row.purpose)&&row.status==="approved";if(!publicAsset){const user=await getSessionUser(request);let allowed=user?.id===row.owner_id;if(!allowed&&user&&row.vtc_id)allowed=Boolean(await requireVtcPermission(request,row.vtc_id,"manage_gallery"));if(!allowed)return apiError("Kein Zugriff",403)}
  const bucket=platformEnv().UPLOADS;if(!bucket)return apiError("Dateispeicher nicht konfiguriert",503);const object=await bucket.get(row.object_key);if(!object)return apiError("Dateiobjekt fehlt",404);
  const headers=new Headers({"Content-Type":row.content_type,"Content-Length":String(row.size),"Content-Disposition":`inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,"X-Content-Type-Options":"nosniff","Cache-Control":publicAsset?"public, max-age=86400, immutable":"private, no-store","ETag":object.etag});return new Response(object.body,{headers});
}

export async function POST(request:Request){
  await ensureDatabase();const user=await getSessionUser(request);if(!user)return apiError("Anmeldung erforderlich",401);const url=new URL(request.url),purpose=url.searchParams.get("purpose")??"document",vtcId=url.searchParams.get("vtcId");if(!purposes.has(purpose))return apiError("Unbekannter Upload-Zweck");
  let manager=false;if(purpose.startsWith("company_")){if(!vtcId)return apiError("Spedition fehlt");manager=Boolean(await requireVtcPermission(request,vtcId,"manage_settings"));if(!manager)return apiError("Einstellungsrecht erforderlich",403)}else if(vtcId){manager=Boolean(await requireVtcPermission(request,vtcId,"manage_gallery"));const member=await platformEnv().DB.prepare(`SELECT id FROM memberships WHERE vtc_id=? AND user_id=? AND status IN ('active','probation')`).bind(vtcId,user.id).first();if(!manager&&!member)return apiError("Keine Mitgliedschaft in dieser Spedition",403)}
  const declared=request.headers.get("content-type")?.split(";")[0].trim()??"",bytes=await request.arrayBuffer(),actual=mimeBySignature(new Uint8Array(bytes));if(!actual||actual!==declared)return apiError("Dateiinhalt und Dateityp stimmen nicht überein",415);if(imagePurposes.has(purpose)&&!actual.startsWith("image/"))return apiError("Für diesen Bereich ist ein Bild erforderlich",415);if(!imagePurposes.has(purpose)&&!new Set(["image/jpeg","image/png","image/webp","application/pdf"]).has(actual))return apiError("Dateityp nicht erlaubt",415);
  const limit=purpose==="avatar"||purpose==="company_logo"?5*1024*1024:12*1024*1024;if(!bytes.byteLength||bytes.byteLength>limit)return apiError(`Datei ist leer oder größer als ${Math.round(limit/1024/1024)} MB`,413);
  const bucket=platformEnv().UPLOADS;if(!bucket)return apiError("Dateispeicher nicht konfiguriert",503);const id=randomId(),filename=(request.headers.get("x-filename")??"upload").replace(/[\r\n]/g,"").slice(0,160),key=`${vtcId??user.id}/${purpose}/${id}`,sha256=hex(await crypto.subtle.digest("SHA-256",bytes)),status=purpose==="gallery"&&!manager?"pending":"approved";await bucket.put(key,bytes,{httpMetadata:{contentType:actual}});
  const db=platformEnv().DB;await db.batch([db.prepare(`INSERT INTO uploads (id,owner_id,vtc_id,object_key,filename,content_type,size) VALUES (?,?,?,?,?,?,?)`).bind(id,user.id,vtcId||null,key,filename,actual,bytes.byteLength),db.prepare(`INSERT INTO upload_metadata (upload_id,purpose,status,sha256,moderated_by,moderated_at) VALUES (?,?,?,?,?,?)`).bind(id,purpose,status,sha256,status==="approved"?user.id:null,status==="approved"?new Date().toISOString():null)]);
  if(purpose==="avatar")await db.prepare(`INSERT INTO user_profiles (user_id,avatar_upload_id) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET avatar_upload_id=excluded.avatar_upload_id,updated_at=CURRENT_TIMESTAMP`).bind(user.id,id).run();
  if(purpose==="company_logo")await db.prepare(`UPDATE vtc_profiles SET logo_upload_id=?,updated_at=CURRENT_TIMESTAMP WHERE vtc_id=?`).bind(id,vtcId).run();
  if(purpose==="company_header")await db.prepare(`UPDATE vtc_profiles SET header_upload_id=?,updated_at=CURRENT_TIMESTAMP WHERE vtc_id=?`).bind(id,vtcId).run();
  await audit("upload.created","upload",id,user.id,{purpose,status,size:bytes.byteLength},vtcId);return Response.json({upload:{id,filename,size:bytes.byteLength,purpose,status,url:`/api/v1/uploads?id=${id}`}},{status:201});
}
