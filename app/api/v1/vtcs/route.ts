import {
  apiError,
  audit,
  ensureDatabase,
  getSessionUser,
  platformEnv,
  randomId,
} from "@/lib/platform";
const clean = (v: unknown, n = 2000) =>
  String(v ?? "")
    .trim()
    .slice(0, n);
type Body = {
  action?: string;
  vtcId?: string;
  slug?: string;
  rating?: number;
  body?: string;
  reason?: string;
  name?: string;
  email?: string;
  subject?: string;
  data?: Record<string, unknown>;
};
const safe = (v: unknown, f: any) => {
    try {
      return JSON.parse(String(v));
    } catch {
      return f;
    }
  },
  list = (v: unknown) => {
    const parsed = safe(v, null);
    return Array.isArray(parsed)
      ? parsed
      : String(v ?? "")
          .split(/[,;+]/)
          .map((x) => x.trim())
          .filter(Boolean);
  };
const standardRoleSeeds:[string,string,number,string[]][]=[
  ["deputy","Stellvertretender Geschäftsführer",95,["view_management","manage_drivers","manage_applications","review_trips","manage_dispatch","manage_fleet","manage_payroll","manage_events","manage_gallery","publish_news","manage_partnerships","manage_discord","manage_roles","manage_settings","view_audit","view_sensitive_personnel"]],
  ["admin","Administrator",90,["view_management","manage_drivers","manage_applications","review_trips","manage_dispatch","manage_fleet","manage_events","manage_gallery","publish_news","manage_discord","manage_settings","view_audit"]],
  ["hr","Personalabteilung",80,["view_management","manage_drivers","manage_applications","warn_drivers","terminate_drivers","view_sensitive_personnel"]],["dispatcher","Disponent",70,["view_management","manage_dispatch","review_trips"]],["payroll","Lohnbüro",70,["view_management","manage_payroll","review_trips"]],["fleet","Fuhrparkleitung",70,["view_management","manage_fleet"]],["events","Eventmanagement",70,["view_management","manage_events"]],["media","Medienabteilung",65,["view_management","manage_gallery","publish_news"]],["support","Support",65,["view_management","manage_support"]],["trainer","Ausbilder",60,["view_management","manage_training"]],["convoy","Convoy Control",60,["view_management","manage_events"]],["driver","Fahrer",30,["view_dashboard","create_trips","view_own_payroll"]],["probation","Fahrer in Probezeit",20,["view_dashboard","create_trips","view_own_payroll"]],["applicant","Bewerber",10,["view_application"]],["partner","Partner",5,["view_partner"]],["guest","Gast",0,[]]
];
export async function GET(request: Request) {
  await ensureDatabase();
  const db = platformEnv().DB,
    url = new URL(request.url),
    slug = url.searchParams.get("slug"),
    user = await getSessionUser(request);
  if (slug) {
    const vtc = await db
      .prepare(
        `SELECT v.*,p.*,v.id AS id,v.slug AS slug,v.name AS name,v.tag AS tag,v.description AS description,v.country AS country,v.city AS city,v.games AS games,v.languages AS languages,v.timezone AS timezone,v.truckersmp_id AS truckersmpId,v.discord_url AS discordUrl,v.website_url AS websiteUrl,v.applications_open AS applicationsOpen,v.minimum_age AS minimumAge,v.verified AS verified,v.driver_count AS driverCount,v.total_km AS totalKm,p.founded_at AS foundedAt,p.main_language AS mainLanguage,p.contact_name AS contactName,p.public_status AS publicStatus,p.probation_info AS probationInfo,p.partner_seeking AS partnerSeeking,p.beginner_friendly AS beginnerFriendly,p.primary_color AS primaryColor,p.secondary_color AS secondaryColor,p.logo_upload_id AS logoUploadId,p.header_upload_id AS headerUploadId FROM vtcs v LEFT JOIN vtc_profiles p ON p.vtc_id=v.id WHERE v.slug=? AND COALESCE(p.public_status,'public')='public'`,
      )
      .bind(slug)
      .first<any>();
    if (!vtc) return apiError("Spedition nicht gefunden", 404);
    vtc.games = list(vtc.games);
    vtc.languages = list(vtc.languages);
    for (const k of ["requirements", "rules", "driving_modes"])
      vtc[k] = list(vtc[k]);
    for (const k of ["social_links", "visibility"]) vtc[k] = safe(vtc[k], {});
    const [drivers, roles, events, stats, reviews, followers, gallery] =
      await Promise.all([
        db
          .prepare(
            `SELECT u.id,u.display_name AS name,m.driver_number AS driverNumber,m.status,r.name AS role,r.color,up.avatar_upload_id AS avatarUploadId,COALESCE(SUM(t.distance_km),0) km FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN user_profiles up ON up.user_id=u.id LEFT JOIN roles r ON r.id=m.role_id LEFT JOIN trips t ON t.user_id=m.user_id AND t.vtc_id=m.vtc_id WHERE m.vtc_id=? AND m.status IN ('active','probation') GROUP BY m.user_id ORDER BY r.rank DESC,km DESC`,
          )
          .bind(vtc.id)
          .all(),
        db
          .prepare(
            `SELECT name,color,rank FROM roles WHERE vtc_id=? ORDER BY rank DESC`,
          )
          .bind(vtc.id)
          .all(),
        db
          .prepare(
            `SELECT * FROM events WHERE vtc_id=? AND starts_at>=CURRENT_TIMESTAMP AND public=1 ORDER BY starts_at LIMIT 20`,
          )
          .bind(vtc.id)
          .all(),
        db
          .prepare(
            `SELECT COUNT(*) trips,COALESCE(SUM(distance_km),0) km,COALESCE(AVG(damage),0) damage,COALESCE(AVG(CASE WHEN distance_km>0 THEN fuel_liters*100.0/distance_km END),0) consumption FROM trips WHERE vtc_id=?`,
          )
          .bind(vtc.id)
          .first(),
        db
          .prepare(
            `SELECT r.rating,r.body,r.created_at AS createdAt,u.display_name AS author FROM vtc_reviews r JOIN users u ON u.id=r.user_id WHERE r.vtc_id=? AND r.status='approved' ORDER BY r.created_at DESC LIMIT 50`,
          )
          .bind(vtc.id)
          .all(),
        db
          .prepare(`SELECT COUNT(*) count FROM vtc_follows WHERE vtc_id=?`)
          .bind(vtc.id)
          .first<any>(),
        db
          .prepare(`SELECT i.id,i.upload_id AS uploadId,i.caption,i.tags,i.created_at AS createdAt,u.display_name AS owner FROM media_items i JOIN users u ON u.id=i.owner_id WHERE i.vtc_id=? AND i.status='approved' AND i.visibility='public' ORDER BY i.created_at DESC LIMIT 40`)
          .bind(vtc.id)
          .all<any>(),
      ]);
    const following = user
      ? Boolean(
          await db
            .prepare(`SELECT id FROM vtc_follows WHERE vtc_id=? AND user_id=?`)
            .bind(vtc.id, user.id)
            .first(),
        )
      : false;
    return Response.json({
      vtc,
      drivers: drivers.results,
      roles: roles.results,
      events: events.results,
      stats,
      reviews: reviews.results,
      gallery: gallery.results.map((item:any)=>({...item,tags:safe(item.tags,[]),url:`/api/v1/uploads?id=${item.uploadId}`})),
      followers: followers?.count ?? 0,
      following,
      user: user ? { id: user.id } : null,
    });
  }
  const game = url.searchParams.get("game"),
    country = url.searchParams.get("country"),
    language = url.searchParams.get("language"),
    q = url.searchParams.get("q"),
    open = url.searchParams.get("open"),
    verified = url.searchParams.get("verified"),
    partner = url.searchParams.get("partner"),
    beginner = url.searchParams.get("beginner"),
    style = url.searchParams.get("style"),
    minimumAge = url.searchParams.get("minimumAge"),
    minDrivers = url.searchParams.get("minDrivers"),
    privacy = url.searchParams.get("privacy"),
    sort = url.searchParams.get("sort") ?? "recommended";
  let sql = `SELECT v.id,v.slug,v.name,v.tag,v.description,v.country,v.city,v.games,v.languages,v.timezone,v.truckersmp_id AS truckersmpId,v.verified,v.applications_open AS applicationsOpen,v.minimum_age AS minimumAge,v.driver_count AS driverCount,v.total_km AS totalKm,v.created_at AS createdAt,p.main_language AS mainLanguage,p.partner_seeking AS partnerSeeking,p.beginner_friendly AS beginnerFriendly,p.driving_modes AS drivingModes,p.public_status AS publicStatus,p.primary_color AS primaryColor,p.secondary_color AS secondaryColor,p.logo_upload_id AS logoUploadId,p.header_upload_id AS headerUploadId,(SELECT COUNT(*) FROM vtc_follows f WHERE f.vtc_id=v.id) followers,(SELECT COALESCE(AVG(r.rating),0) FROM vtc_reviews r WHERE r.vtc_id=v.id AND r.status='approved') rating,(SELECT COUNT(*) FROM trips t WHERE t.vtc_id=v.id AND t.started_at>=datetime('now','-30 days')) activity FROM vtcs v LEFT JOIN vtc_profiles p ON p.vtc_id=v.id WHERE 1=1`;
  const args: unknown[] = [];
  sql += ` AND v.id NOT IN ('vtc-ngl','vtc-ast','vtc-r66')`;
  if (game) {
    sql += ` AND v.games LIKE ?`;
    args.push(`%${game}%`);
  }
  if (country) {
    sql += ` AND v.country=?`;
    args.push(country);
  }
  if (language) {
    sql += ` AND (v.languages LIKE ? OR p.main_language=?)`;
    args.push(`%${language}%`, language);
  }
  if (q) {
    sql += ` AND (v.name LIKE ? OR v.tag LIKE ? OR v.country LIKE ? OR v.city LIKE ?)`;
    args.push(...Array(4).fill(`%${q}%`));
  }
  if (open === "true") sql += ` AND v.applications_open=1`;
  if (verified === "true") sql += ` AND v.verified=1`;
  if (partner === "true") sql += ` AND p.partner_seeking=1`;
  if (beginner === "true") sql += ` AND p.beginner_friendly=1`;
  if (style) {
    sql += ` AND p.driving_modes LIKE ?`;
    args.push(`%${style}%`);
  }
  if (minimumAge) {
    sql += ` AND v.minimum_age<=?`;
    args.push(Number(minimumAge));
  }
  if (minDrivers) {
    sql += ` AND v.driver_count>=?`;
    args.push(Number(minDrivers));
  }
  if (privacy) {
    sql += ` AND COALESCE(p.public_status,'public')=?`;
    args.push(privacy);
  }
  const order: Record<string, string> = {
    newest: "v.created_at DESC",
    active: "activity DESC",
    km: "v.total_km DESC",
    drivers: "v.driver_count DESC",
    rating: "rating DESC",
    jobs: "(SELECT COUNT(*) FROM trips t WHERE t.vtc_id=v.id) DESC",
    recommended: "v.verified DESC,activity DESC,v.total_km DESC",
  };
  sql += ` ORDER BY ${order[sort] ?? order.recommended} LIMIT 200`;
  const rows = await db
      .prepare(sql)
      .bind(...args)
      .all(),
    data = (rows.results as any[]).map((v) => ({
      ...v,
      games: list(v.games),
      languages: list(v.languages),
      drivingModes: list(v.drivingModes),
    }));
  return Response.json({
    data,
    meta: { count: data.length },
    user: user ? { id: user.id } : null,
  });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const b = (await request.json()) as Body,
    db = platformEnv().DB,
    user = await getSessionUser(request);
  if (b.action === "contact") {
    const v = await findVtc(b, db);
    if (!v) return apiError("Spedition nicht gefunden", 404);
    if (!clean(b.name) || !clean(b.subject) || !clean(b.body))
      return apiError("Name, Betreff und Nachricht erforderlich");
    const id = randomId();
    await db
      .prepare(
        `INSERT INTO contact_messages (id,vtc_id,sender_id,name,email,subject,body) VALUES (?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        v.id,
        user?.id ?? null,
        clean(b.name, 100),
        clean(b.email, 200) || null,
        clean(b.subject, 160),
        clean(b.body, 4000),
      )
      .run();
    return Response.json({ saved: true, id });
  }
  if (b.action === "report") {
    const v = await findVtc(b, db);
    if (!v) return apiError("Spedition nicht gefunden", 404);
    if (!clean(b.reason)) return apiError("Meldegrund erforderlich");
    const id = randomId();
    await db
      .prepare(
        `INSERT INTO content_reports (id,reporter_id,vtc_id,entity_type,entity_id,reason,detail) VALUES (?,?,?,'vtc',?,?,?)`,
      )
      .bind(
        id,
        user?.id ?? null,
        v.id,
        v.id,
        clean(b.reason, 200),
        clean(b.body, 2000) || null,
      )
      .run();
    return Response.json({ saved: true, id });
  }
  if (!user) return apiError("Anmeldung erforderlich", 401);
  const v = await findVtc(b, db);
  if (b.action === "follow") {
    if (!v) return apiError("Spedition nicht gefunden", 404);
    const found = await db
      .prepare(`SELECT id FROM vtc_follows WHERE vtc_id=? AND user_id=?`)
      .bind(v.id, user.id)
      .first();
    if (found)
      await db
        .prepare(`DELETE FROM vtc_follows WHERE vtc_id=? AND user_id=?`)
        .bind(v.id, user.id)
        .run();
    else
      await db
        .prepare(`INSERT INTO vtc_follows (id,vtc_id,user_id) VALUES (?,?,?)`)
        .bind(randomId(), v.id, user.id)
        .run();
    return Response.json({ following: !found });
  }
  if (b.action === "review") {
    if (!v) return apiError("Spedition nicht gefunden", 404);
    const rating = Math.max(1, Math.min(5, Math.round(Number(b.rating) || 0)));
    await db
      .prepare(
        `INSERT INTO vtc_reviews (id,vtc_id,user_id,rating,body,status,updated_at) VALUES (?,?,?,?,?,'pending',CURRENT_TIMESTAMP) ON CONFLICT(vtc_id,user_id) DO UPDATE SET rating=excluded.rating,body=excluded.body,status='pending',updated_at=CURRENT_TIMESTAMP`,
      )
      .bind(randomId(), v.id, user.id, rating, clean(b.body, 1500) || null)
      .run();
    return Response.json({ saved: true, moderation: "pending" });
  }
  if (b.action === "create") {
    const d = b.data ?? {},
      slug = clean(d.slug, 80)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
      name = clean(d.name, 120),
      tag = clean(d.tag, 12).toUpperCase();
    if (!slug || !name || !tag)
      return apiError("Name, Kürzel und Adresse erforderlich");
    if (await db.prepare(`SELECT id FROM vtcs WHERE slug=?`).bind(slug).first())
      return apiError("Diese Adresse ist bereits vergeben", 409);
    const id = randomId(),
      roleId = `role-${randomId()}`;
    await db.batch([
      db
        .prepare(
          `INSERT INTO vtcs (id,slug,name,tag,description,country,city,games,languages,timezone,applications_open,minimum_age) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          id,
          slug,
          name,
          tag,
          clean(d.description, 3000) || "Neue virtuelle Spedition",
          clean(d.country, 80) || "Deutschland",
          clean(d.city, 100) || null,
          JSON.stringify(Array.isArray(d.games) ? d.games : ["ETS2"]),
          JSON.stringify(
            Array.isArray(d.languages) ? d.languages : ["Deutsch"],
          ),
          clean(d.timezone, 80) || "Europe/Berlin",
          d.applicationsOpen === false ? 0 : 1,
          Math.max(0, Number(d.minimumAge) || 16),
        ),
      db
        .prepare(
          `INSERT INTO vtc_profiles (vtc_id,main_language,contact_name,public_status,requirements,rules,social_links,driving_modes) VALUES (?,?,?,'public','[]','[]','{}','[]')`,
        )
        .bind(id, clean(d.mainLanguage, 80) || "Deutsch", user.displayName),
      db
        .prepare(
          `INSERT INTO roles (id,vtc_id,name,color,rank,permissions,protected) VALUES (?,?,?,'#22d3c5',100,'["*"]',1)`,
        )
        .bind(roleId, id, "Geschäftsführer"),
      db
        .prepare(
          `INSERT INTO memberships (id,vtc_id,user_id,role_id,status,driver_number) VALUES (?,?,?,?,'active','001')`,
        )
        .bind(randomId(), id, user.id, roleId),
      db
        .prepare(
          `INSERT INTO personnel_records (id,vtc_id,user_id,status,language,timezone) VALUES (?,?,?,'active','Deutsch','Europe/Berlin')`,
        )
        .bind(randomId(), id, user.id),
    ]);
    await db.batch(standardRoleSeeds.map(([key,roleName,rank,permissions])=>db.prepare(`INSERT INTO roles (id,vtc_id,name,color,rank,permissions,protected) VALUES (?,?,?,?,?,?,0)`).bind(`role-${id}-${key}`,id,roleName,"#6f8793",rank,JSON.stringify(permissions))));
    await audit("vtc.created", "vtc", id, user.id, { slug });
    return Response.json({ saved: true, id, slug });
  }
  return apiError("Ungültige Speditionsaktion");
}
async function findVtc(b: Body, db: D1Database) {
  if (b.vtcId)
    return db
      .prepare(`SELECT id,slug FROM vtcs WHERE id=?`)
      .bind(b.vtcId)
      .first<{ id: string; slug: string }>();
  if (b.slug)
    return db
      .prepare(`SELECT id,slug FROM vtcs WHERE slug=?`)
      .bind(b.slug)
      .first<{ id: string; slug: string }>();
  return null;
}
