import { ensureDatabase, platformEnv, publicRequestOrigin } from "@/lib/platform";

type SupabaseUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

function config() {
  const env = platformEnv();
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

export function supabaseOAuthUrl(request: Request, provider: "google" | "discord") {
  const cfg = config();
  if (!cfg) return null;
  const redirect = new URL("/konto", publicRequestOrigin(request));
  redirect.searchParams.set("auth", "supabase");
  const target = new URL(`${cfg.url}/auth/v1/authorize`);
  target.searchParams.set("provider", provider);
  target.searchParams.set("redirect_to", redirect.toString());
  return target.toString();
}

export async function supabasePasswordSignIn(email: string, password: string) {
  const cfg = config();
  if (!cfg) return null;
  const response = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: cfg.key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return { ok: false as const };
  const payload = await response.json() as { user?: SupabaseUser; access_token?: string };
  return payload.user && payload.access_token
    ? { ok: true as const, user: payload.user, accessToken: payload.access_token }
    : { ok: false as const };
}

export async function supabaseUserFromToken(accessToken: string) {
  const cfg = config();
  if (!cfg) return null;
  const response = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: { apikey: cfg.key, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return await response.json() as SupabaseUser;
}

export async function syncSupabaseUser(external: SupabaseUser) {
  await ensureDatabase();
  const db = platformEnv().DB;
  const email = external.email?.trim().toLowerCase() || null;
  const existing = email
    ? await db.prepare(`SELECT id FROM users WHERE lower(email)=?`).bind(email).first<{id:string}>()
    : null;
  const userId = existing?.id ?? external.id;
  const metadata = external.user_metadata ?? {};
  const displayName = String(
    metadata.full_name ?? metadata.name ?? metadata.user_name ?? email?.split("@")[0] ?? "Fahrer",
  ).slice(0, 100);
  await db.prepare(
    `INSERT INTO users (id,email,display_name) VALUES (?,?,?)
     ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at=CURRENT_TIMESTAMP`,
  ).bind(userId, email, displayName).run();
  await db.prepare(
    `INSERT OR IGNORE INTO linked_accounts (user_id,provider,provider_id,username)
     VALUES (?,'supabase',?,?)`,
  ).bind(userId, external.id, displayName).run();
  await db.prepare(`INSERT OR IGNORE INTO account_security (user_id) VALUES (?)`).bind(userId).run();
  return { id: userId, email, displayName };
}

type SupabaseMembership = {
  vtc_id?: string | null;
  role?: string | null;
};
type SupabaseVtc={id:string;slug?:string|null;name?:string|null;tag?:string|null;description?:string|null;discord_url?:string|null;website_url?:string|null;created_by?:string|null;created_at?:string|null};

function importedRole(role: string | null | undefined) {
  const normalized = String(role ?? "driver").trim().toLowerCase();
  if (["owner", "founder", "gründer", "geschaeftsfuehrer", "geschäftsführer"].includes(normalized)) {
    return { key: "owner", name: "Geschäftsführer", rank: 100, permissions: ["*"], protected: 1 };
  }
  if (["admin", "administrator", "management", "manager"].includes(normalized)) {
    return {
      key: "admin",
      name: "Administrator",
      rank: 90,
      permissions: [
        "view_management", "manage_drivers", "manage_applications", "review_trips",
        "manage_dispatch", "manage_fleet", "manage_payroll", "manage_events",
        "manage_gallery", "publish_news", "manage_partnerships", "manage_discord",
        "manage_roles", "manage_settings", "view_audit",
      ],
      protected: 0,
    };
  }
  if (["dispatcher", "disponent", "dispatch"].includes(normalized)) {
    return { key: "dispatcher", name: "Disponent", rank: 70, permissions: ["view_management", "manage_dispatch", "review_trips"], protected: 0 };
  }
  return { key: "driver", name: "Fahrer", rank: 30, permissions: ["view_dashboard", "create_trips", "view_own_payroll"], protected: 0 };
}

export async function syncSupabaseMemberships(accessToken: string, externalUserId: string, localUserId: string) {
  const cfg = config();
  if (!cfg) return;
  const target = new URL(`${cfg.url}/rest/v1/vtc_members`);
  target.searchParams.set("select", "vtc_id,role");
  target.searchParams.set("user_id", `eq.${externalUserId}`);
  const response = await fetch(target, {
    headers: { apikey: cfg.key, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return;
  const memberships = await response.json() as SupabaseMembership[];
  const vtcResponse=await fetch(`${cfg.url}/rest/v1/vtcs?select=id,slug,name,tag,description,discord_url,website_url,created_by,created_at`,{headers:{apikey:cfg.key,Authorization:`Bearer ${accessToken}`}});
  const availableVtcs=vtcResponse.ok?await vtcResponse.json() as SupabaseVtc[]:[];
  const membershipIds=new Set(memberships.map(m=>String(m.vtc_id??"")));
  const relevant=availableVtcs.filter(v=>membershipIds.has(v.id)||v.created_by===externalUserId);
  const db = platformEnv().DB;
  for(const vtc of relevant){
    const name=String(vtc.name??"").trim(),tag=String(vtc.tag??"").trim();if(!name||!tag)continue;
    await db.prepare(`INSERT INTO vtcs (id,slug,name,tag,description,country,city,games,languages,timezone,discord_url,website_url,driver_count,created_at) VALUES (?,?,?,?,?,'Deutschland',NULL,'ETS2,ATS','Deutsch','Europe/Berlin',?,?,0,COALESCE(?,CURRENT_TIMESTAMP)) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,name=excluded.name,tag=excluded.tag,description=excluded.description,discord_url=excluded.discord_url,website_url=excluded.website_url`).bind(vtc.id,String(vtc.slug??vtc.id),name,tag,vtc.description??"Virtuelle Spedition auf VTC Truck Hub",vtc.discord_url??null,vtc.website_url??null,vtc.created_at??null).run();
  }
  const complete=[...memberships];
  for(const founded of relevant.filter(v=>v.created_by===externalUserId&&!membershipIds.has(v.id)))complete.push({vtc_id:founded.id,role:"owner"});
  for (const membership of complete) {
    const vtcId = String(membership.vtc_id ?? "").trim();
    if (!vtcId) continue;
    const vtc = await db.prepare(`SELECT id FROM vtcs WHERE id=?`).bind(vtcId).first<{ id: string }>();
    if (!vtc) continue;
    const mapped = importedRole(membership.role);
    const roleId = `role-import-${vtcId}-${mapped.key}`;
    await db.prepare(
      `INSERT OR IGNORE INTO roles (id,vtc_id,name,color,rank,permissions,protected) VALUES (?,?,?,'#22d3c5',?,?,?)`,
    ).bind(roleId, vtcId, mapped.name, mapped.rank, JSON.stringify(mapped.permissions), mapped.protected).run();
    await db.prepare(
      `INSERT INTO memberships (id,vtc_id,user_id,role_id,status)
       VALUES (?,?,?,?,?) ON CONFLICT(vtc_id,user_id) DO UPDATE SET role_id=excluded.role_id,status=excluded.status`,
    ).bind(
      `membership-import-${vtcId}-${localUserId}`,
      vtcId,
      localUserId,
      roleId,
      "active",
    ).run();
    await db.prepare(
      `INSERT OR IGNORE INTO personnel_records (id,vtc_id,user_id,status,language,timezone)
       VALUES (?,?,?,'active','Deutsch','Europe/Berlin')`,
    ).bind(`personnel-import-${vtcId}-${localUserId}`, vtcId, localUserId).run();
  }
}

type HubUser={user_id:string;display_name:string|null};
type SupabaseAdminUser={id:string;email?:string|null;user_metadata?:Record<string,unknown>};
type HubVtc={vtc_id:string;slug:string|null;name:string|null;tag:string|null;description:string|null;discord_url:string|null;website_url:string|null;is_demo:boolean|null;created_at:string|null};
type HubMembership={vtc_id:string;user_id:string;role:string|null;joined_at:string|null};
let directorySyncPromise:Promise<{users:number;vtcs:number;memberships:number}>|null=null;
let directorySyncedAt=0;

async function serviceRows<T>(path:string){
  const env=platformEnv(),base=env.SUPABASE_URL?.replace(/\/$/,""),key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw new Error("Supabase-Serverabgleich ist nicht konfiguriert");
  const response=await fetch(`${base}/rest/v1/${path}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  if(!response.ok)throw new Error(`Supabase-Abgleich fehlgeschlagen (${response.status})`);
  return await response.json() as T[];
}

async function serviceAuthUsers(){
  const env=platformEnv(),base=env.SUPABASE_URL?.replace(/\/$/,""),key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw new Error("Supabase-Serverabgleich ist nicht konfiguriert");
  const response=await fetch(`${base}/auth/v1/admin/users?page=1&per_page=1000`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  if(!response.ok)throw new Error(`Supabase-Benutzerabgleich fehlgeschlagen (${response.status})`);
  const payload=await response.json() as {users?:SupabaseAdminUser[]};
  return payload.users??[];
}

export async function syncSupabaseDirectory(force=false){
  if(!force&&directorySyncedAt&&Date.now()-directorySyncedAt<300000)return {users:0,vtcs:0,memberships:0};
  if(directorySyncPromise)return directorySyncPromise;
  directorySyncPromise=(async()=>{
    await ensureDatabase();
    const [authUsers,profiles,vtcs,memberships]=await Promise.all([
      serviceAuthUsers(),
      serviceRows<HubUser>("hub_users?select=user_id,display_name"),
      serviceRows<HubVtc>("hub_vtcs?select=vtc_id,slug,name,tag,description,discord_url,website_url,is_demo,created_at&is_demo=eq.false"),
      serviceRows<HubMembership>("hub_memberships?select=vtc_id,user_id,role,joined_at"),
    ]),db=platformEnv().DB,profileNames=new Map(profiles.map(profile=>[profile.user_id,profile.display_name])),userIds=new Map<string,string>();
    for(const user of authUsers){
      const email=user.email?.trim().toLowerCase()||null;
      const existing=email?await db.prepare(`SELECT id FROM users WHERE lower(email)=?`).bind(email).first<{id:string}>():null;
      const localUserId=existing?.id??user.id,metadata=user.user_metadata??{};
      const name=String(profileNames.get(user.id)??metadata.full_name??metadata.name??metadata.user_name??email?.split("@")[0]??"Fahrer").trim().slice(0,100)||"Fahrer";
      userIds.set(user.id,localUserId);
      await db.prepare(`INSERT INTO users (id,email,display_name) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET email=COALESCE(excluded.email,users.email),display_name=excluded.display_name,updated_at=CURRENT_TIMESTAMP`).bind(localUserId,email,name).run();
      await db.prepare(`INSERT OR IGNORE INTO linked_accounts (user_id,provider,provider_id,username) VALUES (?,'supabase',?,?)`).bind(localUserId,user.id,name).run();
      await db.prepare(`INSERT OR IGNORE INTO account_security (user_id) VALUES (?)`).bind(localUserId).run();
    }
    for(const vtc of vtcs){
      const name=String(vtc.name??"").trim(),tag=String(vtc.tag??"").trim();if(!name||!tag)continue;
      await db.prepare(`INSERT INTO vtcs (id,slug,name,tag,description,country,city,games,languages,timezone,discord_url,website_url,driver_count,created_at) VALUES (?,?,?,?,?,'Deutschland',NULL,'ETS2,ATS','Deutsch','Europe/Berlin',?,?,0,COALESCE(?,CURRENT_TIMESTAMP)) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,name=excluded.name,tag=excluded.tag,description=excluded.description,discord_url=excluded.discord_url,website_url=excluded.website_url`).bind(vtc.vtc_id,String(vtc.slug??vtc.vtc_id),name,tag,vtc.description??"Virtuelle Spedition auf VTC Truck Hub",vtc.discord_url??null,vtc.website_url??null,vtc.created_at??null).run();
    }
    for(const membership of memberships){
      const localUserId=userIds.get(membership.user_id)??membership.user_id,mapped=importedRole(membership.role),roleId=`role-import-${membership.vtc_id}-${mapped.key}`;
      await db.prepare(`INSERT OR IGNORE INTO roles (id,vtc_id,name,color,rank,permissions,protected) VALUES (?,?,?,'#22d3c5',?,?,?)`).bind(roleId,membership.vtc_id,mapped.name,mapped.rank,JSON.stringify(mapped.permissions),mapped.protected).run();
      await db.prepare(`INSERT INTO memberships (id,vtc_id,user_id,role_id,status,joined_at) VALUES (?,?,?,?,'active',COALESCE(?,CURRENT_TIMESTAMP)) ON CONFLICT(vtc_id,user_id) DO UPDATE SET role_id=excluded.role_id,status='active'`).bind(`membership-import-${membership.vtc_id}-${localUserId}`,membership.vtc_id,localUserId,roleId,membership.joined_at??null).run();
      await db.prepare(`INSERT OR IGNORE INTO personnel_records (id,vtc_id,user_id,status,language,timezone) VALUES (?,?,?,'active','Deutsch','Europe/Berlin')`).bind(`personnel-import-${membership.vtc_id}-${localUserId}`,membership.vtc_id,localUserId).run();
    }
    for(const id of ["vtc-ngl","vtc-ast","vtc-r66"]){
      await db.prepare(`DELETE FROM memberships WHERE vtc_id=?`).bind(id).run();
      await db.prepare(`DELETE FROM personnel_records WHERE vtc_id=?`).bind(id).run();
      await db.prepare(`UPDATE discord_guilds SET vtc_id=NULL WHERE vtc_id=?`).bind(id).run();
      await db.prepare(`DELETE FROM vtcs WHERE id=?`).bind(id).run();
    }
    const orphanFounders=await db.prepare(`SELECT a.entity_id AS vtcId,a.actor_id AS userId FROM audit_logs a JOIN vtcs v ON v.id=a.entity_id JOIN users u ON u.id=a.actor_id LEFT JOIN memberships m ON m.vtc_id=a.entity_id AND m.user_id=a.actor_id WHERE a.action='vtc.created' AND a.entity_type='vtc' AND a.actor_id IS NOT NULL AND m.id IS NULL`).all<{vtcId:string;userId:string}>();
    for(const founder of orphanFounders.results){
      const roleId=`role-import-${founder.vtcId}-owner`;
      await db.prepare(`INSERT OR IGNORE INTO roles (id,vtc_id,name,color,rank,permissions,protected) VALUES (?,?,?,'#22d3c5',100,'["*"]',1)`).bind(roleId,founder.vtcId,"Geschäftsführer").run();
      await db.prepare(`INSERT OR IGNORE INTO memberships (id,vtc_id,user_id,role_id,status) VALUES (?,?,?,?,'active')`).bind(`membership-recovered-${founder.vtcId}-${founder.userId}`,founder.vtcId,founder.userId,roleId).run();
      await db.prepare(`INSERT OR IGNORE INTO personnel_records (id,vtc_id,user_id,status,language,timezone) VALUES (?,?,?,'active','Deutsch','Europe/Berlin')`).bind(`personnel-recovered-${founder.vtcId}-${founder.userId}`,founder.vtcId,founder.userId).run();
    }
    for(const vtc of vtcs)await db.prepare(`UPDATE vtcs SET driver_count=(SELECT COUNT(*) FROM memberships WHERE vtc_id=? AND status='active') WHERE id=?`).bind(vtc.vtc_id,vtc.vtc_id).run();
    directorySyncedAt=Date.now();
    return {users:authUsers.length,vtcs:vtcs.length,memberships:memberships.length};
  })().finally(()=>{directorySyncPromise=null});
  return directorySyncPromise;
}

export async function approveDesktopAuth(request: Request, userId: string) {
  const token = request.headers.get("cookie")?.match(/(?:^|; )desktop_auth=([^;]+)/)?.[1];
  if (!token) return;
  await platformEnv().DB.prepare(
    `UPDATE desktop_auth_requests SET status='approved',user_id=?
     WHERE token=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP`,
  ).bind(userId, decodeURIComponent(token)).run();
}
