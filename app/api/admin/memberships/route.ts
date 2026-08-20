import {apiError,audit,ensureDatabase,platformEnv,randomId,requireFounder} from "@/lib/platform";
import {syncSupabaseDirectory} from "@/lib/supabase-auth";

type AssignmentBody={userId?:string;vtcId?:string;role?:"owner"|"admin"|"driver"};

const roleDefinitions={
  owner:{name:"Geschäftsführer",rank:1000,protected:1,permissions:["*"]},
  admin:{name:"Administrator",rank:900,protected:0,permissions:["vtc.manage","members.manage","applications.manage","trips.review","dispatch.manage","fleet.manage","payroll.manage","events.manage","statistics.view","integrations.manage"]},
  driver:{name:"Fahrer",rank:100,protected:0,permissions:["trips.create","trips.view_own","dispatch.reserve","events.join","profile.edit_own"]},
} as const;

export async function GET(request:Request){
  await ensureDatabase();
  const founder=await requireFounder(request);
  if(!founder)return apiError("Nur das Gründerkonto darf Mitgliedschaften verwalten",403);
  await syncSupabaseDirectory(true).catch(()=>undefined);
  const db=platformEnv().DB;
  const [users,vtcs,memberships]=await Promise.all([
    db.prepare(`SELECT id,email,display_name AS displayName FROM users ORDER BY COALESCE(display_name,email)`).all(),
    db.prepare(`SELECT id,name,tag,slug FROM vtcs WHERE id NOT IN ('vtc-ngl','vtc-ast','vtc-r66') ORDER BY name`).all(),
    db.prepare(`SELECT m.id,m.user_id AS userId,m.vtc_id AS vtcId,m.status,u.email,u.display_name AS displayName,v.name AS vtcName,r.name AS roleName FROM memberships m JOIN users u ON u.id=m.user_id JOIN vtcs v ON v.id=m.vtc_id LEFT JOIN roles r ON r.id=m.role_id ORDER BY v.name,COALESCE(u.display_name,u.email)`).all(),
  ]);
  return Response.json({users:users.results,vtcs:vtcs.results,memberships:memberships.results});
}

export async function POST(request:Request){
  await ensureDatabase();
  const founder=await requireFounder(request);
  if(!founder)return apiError("Nur das Gründerkonto darf Mitgliedschaften verwalten",403);
  const body=await request.json() as AssignmentBody;
  if(!body.userId||!body.vtcId||!body.role||!(body.role in roleDefinitions))return apiError("Benutzer, Spedition und Rolle sind erforderlich");
  const db=platformEnv().DB;
  const [user,vtc]=await Promise.all([
    db.prepare(`SELECT id,email,display_name AS displayName FROM users WHERE id=?`).bind(body.userId).first<{id:string;email:string|null;displayName:string|null}>(),
    db.prepare(`SELECT id,name FROM vtcs WHERE id=? AND id NOT IN ('vtc-ngl','vtc-ast','vtc-r66')`).bind(body.vtcId).first<{id:string;name:string}>(),
  ]);
  if(!user||!vtc)return apiError("Benutzer oder Spedition wurde nicht gefunden",404);
  const definition=roleDefinitions[body.role];
  const roleId=`${body.vtcId}-role-${body.role}`;
  const existing=await db.prepare(`SELECT id FROM memberships WHERE user_id=? AND vtc_id=?`).bind(body.userId,body.vtcId).first<{id:string}>();
  const membershipId=existing?.id??randomId();
  await db.batch([
    db.prepare(`INSERT INTO roles (id,vtc_id,name,rank,permissions,protected) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,rank=excluded.rank,permissions=excluded.permissions,protected=excluded.protected`).bind(roleId,body.vtcId,definition.name,definition.rank,JSON.stringify(definition.permissions),definition.protected),
    db.prepare(`INSERT INTO memberships (id,vtc_id,user_id,role_id,status) VALUES (?,?,?,?,'active') ON CONFLICT(vtc_id,user_id) DO UPDATE SET role_id=excluded.role_id,status='active'`).bind(membershipId,body.vtcId,body.userId,roleId),
    db.prepare(`INSERT INTO personnel_records (id,vtc_id,user_id,status,last_activity) VALUES (?,?,?,'active',CURRENT_TIMESTAMP) ON CONFLICT(vtc_id,user_id) DO UPDATE SET status='active',last_activity=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(`personnel-${membershipId}`,body.vtcId,body.userId),
    db.prepare(`UPDATE vtcs SET driver_count=(SELECT COUNT(*) FROM memberships WHERE vtc_id=? AND status='active') WHERE id=?`).bind(body.vtcId,body.vtcId),
  ]);
  await audit("membership.assigned","membership",membershipId,founder.id,{userId:body.userId,userEmail:user.email,vtcId:body.vtcId,vtcName:vtc.name,role:definition.name,source:"founder-admin"});
  return Response.json({saved:true,membershipId,role:definition.name});
}
