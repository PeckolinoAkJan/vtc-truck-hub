import {
  apiError,
  audit,
  ensureDatabase,
  getSessionUser,
  platformEnv,
  randomId,
  requireVtcPermission,
} from "@/lib/platform";
import {
  ensureFinanceAccount,
  reconcileApprovedTrips,
  refreshPayrollReservation,
} from "@/lib/payroll";
type Body = {
  action?: string;
  vtcId?: string;
  id?: string;
  data?: Record<string, unknown>;
};
const clean = (v: unknown, n = 1200) =>
  String(v ?? "")
    .trim()
    .slice(0, n);
async function resolveVtc(request: Request, requested?: string | null) {
  const user = await getSessionUser(request);
  if (!user) return null;
  const db = platformEnv().DB;
  if (requested && requested !== "vtc-ngl") {
    const allowed = await db
      .prepare(
        `SELECT v.id,v.name,v.tag FROM memberships m JOIN vtcs v ON v.id=m.vtc_id LEFT JOIN roles r ON r.id=m.role_id WHERE m.user_id=? AND m.vtc_id=? AND m.status='active' AND (r.permissions LIKE '%\"manage_payroll\"%' OR r.permissions LIKE '%\"*\"%')`,
      )
      .bind(user.id, requested)
      .first<any>();
    if (allowed) return allowed;
  }
  return await db
    .prepare(
      `SELECT v.id,v.name,v.tag FROM memberships m JOIN vtcs v ON v.id=m.vtc_id LEFT JOIN roles r ON r.id=m.role_id WHERE m.user_id=? AND m.status='active' AND (r.permissions LIKE '%\"manage_payroll\"%' OR r.permissions LIKE '%\"*\"%') ORDER BY r.rank DESC,v.name LIMIT 1`,
    )
    .bind(user.id)
    .first<any>();
}
export async function GET(request: Request) {
  await ensureDatabase();
  const url = new URL(request.url),
    vtc = await resolveVtc(request, url.searchParams.get("vtcId"));
  if (!vtc) return apiError("Keine Spedition mit Lohnbürorecht gefunden", 403);
  const vtcId = vtc.id,
    actor = await requireVtcPermission(request, vtcId, "manage_payroll");
  if (!actor) return apiError("Lohnbürorecht erforderlich", 403);
  const db = platformEnv().DB;
  await ensureFinanceAccount(vtcId);
  try {
    await reconcileApprovedTrips(vtcId, actor.id);
  } catch (error) {
    return apiError(
      error instanceof Error
        ? error.message
        : "Bestehende Fahrten konnten nicht nachberechnet werden",
      409,
    );
  }
  const [accounts, entries, budgets, models, payrolls, lines] =
    await Promise.all([
      db
        .prepare(
          `SELECT a.*,
           COALESCE((SELECT SUM(r.amount_cents) FROM payroll_reservations r WHERE r.account_id=a.id AND r.status='active'),0) AS reserved_cents,
           a.balance_cents-COALESCE((SELECT SUM(r.amount_cents) FROM payroll_reservations r WHERE r.account_id=a.id AND r.status='active'),0) AS available_cents
           FROM finance_accounts a WHERE a.vtc_id=? ORDER BY a.active DESC,a.name`,
        )
        .bind(vtcId)
        .all(),
      db
        .prepare(
          `SELECT e.*,a.name AS account_name,u.display_name AS creator FROM finance_entries e JOIN finance_accounts a ON a.id=e.account_id LEFT JOIN users u ON u.id=e.created_by WHERE a.vtc_id=? ORDER BY e.booked_at DESC LIMIT 500`,
        )
        .bind(vtcId)
        .all(),
      db
        .prepare(
          `SELECT * FROM budgets WHERE vtc_id=? ORDER BY period DESC,cost_center`,
        )
        .bind(vtcId)
        .all(),
      db
        .prepare(
          `SELECT * FROM payroll_models WHERE vtc_id=? ORDER BY active DESC,name`,
        )
        .bind(vtcId)
        .all(),
      db
        .prepare(
          `SELECT p.*,u.display_name AS driver,r.account_id AS reservation_account_id,r.amount_cents AS reserved_cents,r.status AS reservation_status
           FROM payrolls p JOIN users u ON u.id=p.user_id
           LEFT JOIN payroll_reservations r ON r.payroll_id=p.id
           WHERE p.vtc_id=? ORDER BY p.period DESC,p.created_at DESC`,
        )
        .bind(vtcId)
        .all(),
      db
        .prepare(
          `SELECT l.* FROM payroll_lines l JOIN payrolls p ON p.id=l.payroll_id WHERE p.vtc_id=? ORDER BY l.created_at`,
        )
        .bind(vtcId)
        .all(),
    ]);
  const entryRows = entries.results as Array<any>,
    income = entryRows
      .filter((e) => e.amount_cents > 0 && e.status === "posted")
      .reduce((n, e) => n + Number(e.amount_cents), 0),
    expenses = Math.abs(
      entryRows
        .filter((e) => e.amount_cents < 0 && e.status === "posted")
        .reduce((n, e) => n + Number(e.amount_cents), 0),
    );
  return Response.json({
    vtc,
    actor,
    accounts: accounts.results,
    entries: entryRows,
    budgets: budgets.results,
    models: models.results,
    payrolls: payrolls.results,
    lines: lines.results,
    summary: {
      income,
      expenses,
      profit: income - expenses,
      pending: (payrolls.results as Array<any>).filter(
        (p) => p.status === "submitted",
      ).length,
      reserved: (payrolls.results as Array<any>)
        .filter((p) => p.reservation_status === "active")
        .reduce((sum, p) => sum + Number(p.reserved_cents || 0), 0),
      unfunded: (payrolls.results as Array<any>).filter(
        (p) => p.status === "submitted" && p.reservation_status === "unfunded",
      ).length,
    },
  });
}
export async function POST(request: Request) {
  await ensureDatabase();
  const b = (await request.json()) as Body,
    vtc = await resolveVtc(request, b.vtcId);
  if (!vtc) return apiError("Keine Spedition mit Lohnbürorecht gefunden", 403);
  const vtcId = vtc.id,
    actor = await requireVtcPermission(request, vtcId, "manage_payroll");
  if (!actor) return apiError("Lohnbürorecht erforderlich", 403);
  const db = platformEnv().DB,
    d = b.data ?? {};
  if (b.action === "account") {
    const id = b.id || randomId(),
      name = clean(d.name, 100);
    if (!name) return apiError("Kontoname erforderlich");
    await db
      .prepare(
        `INSERT INTO finance_accounts (id,vtc_id,name,type,currency,balance_cents,active) VALUES (?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,type=excluded.type,currency=excluded.currency,active=1`,
      )
      .bind(
        id,
        vtcId,
        name,
        clean(d.type, 30) || "operating",
        clean(d.currency, 10) || "V€",
        Math.round(Number(d.balanceCents) || 0),
      )
      .run();
    return Response.json({ saved: true, id });
  }
  if (b.action === "entry") {
    const accountId = clean(d.accountId, 100) || (await ensureFinanceAccount(vtcId)),
      amount = Math.round(Number(d.amountCents) || 0),
      description = clean(d.description, 1000),
      category = clean(d.category, 80);
    if (!amount || !description || !category)
      return apiError("Betrag, Kategorie und Beschreibung erforderlich");
    const own = await db
      .prepare(`SELECT id,balance_cents AS balanceCents FROM finance_accounts WHERE id=? AND vtc_id=?`)
      .bind(accountId, vtcId)
      .first<{id:string;balanceCents:number}>();
    if (!own) return apiError("Konto nicht gefunden", 404);
    if (amount < 0) {
      const reservation = await db
        .prepare(`SELECT COALESCE(SUM(amount_cents),0) AS reservedCents FROM payroll_reservations WHERE account_id=? AND status='active'`)
        .bind(accountId)
        .first<{reservedCents:number}>();
      const available = own.balanceCents - Number(reservation?.reservedCents ?? 0);
      if (-amount > available)
        return apiError("Der Betrag ist für eingereichte Löhne reserviert", 409);
    }
    const id = randomId(),
      center = clean(d.costCenter, 100) || null,
      period = clean(d.period, 7) || new Date().toISOString().slice(0, 7);
    await db.batch([
      db
        .prepare(
          `INSERT INTO finance_entries (id,account_id,amount_cents,category,cost_center,description,reference_type,reference_id,created_by,booked_at) VALUES (?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP))`,
        )
        .bind(
          id,
          accountId,
          amount,
          category,
          center,
          description,
          clean(d.referenceType, 60) || null,
          clean(d.referenceId, 100) || null,
          actor.id,
          clean(d.bookedAt, 30) || null,
        ),
      db
        .prepare(
          `UPDATE finance_accounts SET balance_cents=balance_cents+? WHERE id=?`,
        )
        .bind(amount, accountId),
      db
        .prepare(
          `UPDATE budgets SET spent_cents=spent_cents+? WHERE vtc_id=? AND cost_center=? AND period=? AND active=1`,
        )
        .bind(amount < 0 ? -amount : 0, vtcId, center, period),
    ]);
    await audit(
      "finance.entry.created",
      "finance_entry",
      id,
      actor.id,
      { amount, category },
      vtcId,
    );
    return Response.json({ saved: true, id });
  }
  if (b.action === "reverse" && b.id) {
    const e = await db
      .prepare(
        `SELECT e.*,a.vtc_id AS vtcId FROM finance_entries e JOIN finance_accounts a ON a.id=e.account_id WHERE e.id=? AND a.vtc_id=? AND e.status='posted'`,
      )
      .bind(b.id, vtcId)
      .first<any>();
    if (!e)
      return apiError("Buchung nicht gefunden oder bereits storniert", 404);
    if (Number(e.amount_cents) > 0) {
      const account = await db
        .prepare(`SELECT balance_cents AS balanceCents FROM finance_accounts WHERE id=?`)
        .bind(e.account_id)
        .first<{balanceCents:number}>();
      const reservation = await db
        .prepare(`SELECT COALESCE(SUM(amount_cents),0) AS reservedCents FROM payroll_reservations WHERE account_id=? AND status='active'`)
        .bind(e.account_id)
        .first<{reservedCents:number}>();
      if (Number(e.amount_cents) > Number(account?.balanceCents ?? 0) - Number(reservation?.reservedCents ?? 0))
        return apiError("Diese Einnahme kann nicht storniert werden, weil der Betrag für Löhne reserviert ist", 409);
    }
    const id = randomId();
    await db.batch([
      db
        .prepare(`UPDATE finance_entries SET status='reversed' WHERE id=?`)
        .bind(e.id),
      db
        .prepare(
          `INSERT INTO finance_entries (id,account_id,amount_cents,category,cost_center,description,status,reversal_of,created_by) VALUES (?,?,?,?,?,?,'posted',?,?)`,
        )
        .bind(
          id,
          e.account_id,
          -Number(e.amount_cents),
          "Storno",
          e.cost_center,
          `Storno: ${e.description}`,
          e.id,
          actor.id,
        ),
      db
        .prepare(
          `UPDATE finance_accounts SET balance_cents=balance_cents-? WHERE id=?`,
        )
        .bind(Number(e.amount_cents), e.account_id),
    ]);
    await audit(
      "finance.entry.reversed",
      "finance_entry",
      e.id,
      actor.id,
      { reversalId: id },
      vtcId,
    );
    return Response.json({ saved: true, id });
  }
  if (b.action === "budget") {
    const id = b.id || randomId(),
      center = clean(d.costCenter, 100),
      period = clean(d.period, 7);
    if (!center || !period)
      return apiError("Kostenstelle und Zeitraum erforderlich");
    await db
      .prepare(
        `INSERT INTO budgets (id,vtc_id,name,cost_center,period,limit_cents,spent_cents,active) VALUES (?,?,?,?,?,?,0,1) ON CONFLICT(vtc_id,cost_center,period) DO UPDATE SET name=excluded.name,limit_cents=excluded.limit_cents,active=1`,
      )
      .bind(
        id,
        vtcId,
        clean(d.name, 100) || center,
        center,
        period,
        Math.max(0, Math.round(Number(d.limitCents) || 0)),
      )
      .run();
    return Response.json({ saved: true, id });
  }
  if (b.action === "model") {
    const id = b.id || randomId(),
      name = clean(d.name, 100);
    if (!name) return apiError("Modellname erforderlich");
    await db
      .prepare(
        `INSERT INTO payroll_models (id,vtc_id,name,role_id,department_id,base_salary_cents,cents_per_km,cents_per_job,cents_per_hour,weight_factor,bonus_rules,deduction_rules,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role_id=excluded.role_id,department_id=excluded.department_id,base_salary_cents=excluded.base_salary_cents,cents_per_km=excluded.cents_per_km,cents_per_job=excluded.cents_per_job,cents_per_hour=excluded.cents_per_hour,weight_factor=excluded.weight_factor,bonus_rules=excluded.bonus_rules,deduction_rules=excluded.deduction_rules,active=1`,
      )
      .bind(
        id,
        vtcId,
        name,
        clean(d.roleId, 100) || null,
        clean(d.departmentId, 100) || null,
        Math.round(Number(d.baseSalaryCents) || 0),
        Math.round(Number(d.centsPerKm) || 0),
        Math.round(Number(d.centsPerJob) || 0),
        Math.round(Number(d.centsPerHour) || 0),
        Number(d.weightFactor) || 0,
        clean(d.bonusRules, 2000) || "{}",
        clean(d.deductionRules, 2000) || "{}",
      )
      .run();
    return Response.json({ saved: true, id });
  }
  if (b.action === "adjustPayroll" && b.id) {
    const amount = Math.round(Number(d.amountCents) || 0),
      type = amount >= 0 ? "bonus" : "deduction";
    if (!amount) return apiError("Korrekturbetrag erforderlich");
    await db
      .prepare(
        `INSERT INTO payroll_lines (id,payroll_id,type,description,amount_cents,detail) SELECT ?,id,?,?,?,'{}' FROM payrolls WHERE id=? AND vtc_id=? AND status IN ('draft','submitted','approved')`,
      )
      .bind(
        randomId(),
        type,
        clean(d.description, 500) || "Korrektur",
        amount,
        b.id,
        vtcId,
      )
      .run();
    await db
      .prepare(
        `UPDATE payrolls SET gross_cents=(SELECT COALESCE(SUM(CASE WHEN amount_cents>0 THEN amount_cents ELSE 0 END),0) FROM payroll_lines WHERE payroll_id=?),deductions_cents=(SELECT COALESCE(ABS(SUM(CASE WHEN amount_cents<0 THEN amount_cents ELSE 0 END)),0) FROM payroll_lines WHERE payroll_id=?),net_cents=(SELECT COALESCE(SUM(amount_cents),0) FROM payroll_lines WHERE payroll_id=?) WHERE id=?`,
      )
      .bind(b.id, b.id, b.id, b.id)
      .run();
    const reservation = await refreshPayrollReservation(b.id);
    return Response.json({ saved: true, reservation });
  }
  if (b.action === "approvePayroll" && b.id) {
    const p = await db
      .prepare(
        `SELECT id,user_id AS userId,net_cents AS netCents,status FROM payrolls WHERE id=? AND vtc_id=?`,
      )
      .bind(b.id, vtcId)
      .first<any>();
    if (!p) return apiError("Abrechnung nicht gefunden", 404);
    if (p.status !== "submitted")
      return apiError(
        "Nur eingereichte Abrechnungen können freigegeben werden",
        409,
      );
    let reservation = await db
      .prepare(`SELECT account_id AS accountId,amount_cents AS amountCents,status FROM payroll_reservations WHERE payroll_id=?`)
      .bind(p.id)
      .first<{accountId:string;amountCents:number;status:string}>();
    if (!reservation || reservation.status !== "active" || reservation.amountCents !== p.netCents) {
      await refreshPayrollReservation(p.id, clean(d.accountId, 100) || null);
      reservation = await db
        .prepare(`SELECT account_id AS accountId,amount_cents AS amountCents,status FROM payroll_reservations WHERE payroll_id=?`)
        .bind(p.id)
        .first<{accountId:string;amountCents:number;status:string}>();
    }
    if (!reservation || reservation.status !== "active")
      return apiError("Das VTC-Konto hat für diese Lohnzahlung nicht genügend verfügbares Guthaben", 409);
    const accountId = reservation.accountId;
    const sourceAccount = await db
      .prepare(
        `SELECT id,balance_cents AS balanceCents FROM finance_accounts WHERE id=? AND vtc_id=? AND active=1`,
      )
      .bind(accountId, vtcId)
      .first<{ id: string; balanceCents: number }>();
    if (!sourceAccount) return apiError("Das gewählte VTC-Konto wurde nicht gefunden", 404);
    if (p.netCents < 0) return apiError("Eine Abrechnung darf keinen negativen Auszahlungsbetrag haben", 409);
    if (sourceAccount.balanceCents < p.netCents)
      return apiError("Das VTC-Konto hat für diese Lohnzahlung nicht genügend Guthaben", 409);
    let wallet = await db
      .prepare(`SELECT id FROM wallets WHERE owner_type='user' AND owner_id=?`)
      .bind(p.userId)
      .first<{ id: string }>();
    if (!wallet) {
      wallet = { id: randomId() };
      await db
        .prepare(
          `INSERT INTO wallets (id,owner_type,owner_id) VALUES (?,'user',?)`,
        )
        .bind(wallet.id, p.userId)
        .run();
    }
    const already = await db
      .prepare(
        `SELECT id FROM wallet_transactions WHERE wallet_id=? AND reference_type='payroll' AND reference_id=?`,
      )
      .bind(wallet.id, p.id)
      .first();
    if (already) return apiError("Abrechnung wurde bereits ausgezahlt", 409);
    const tx = randomId(),
      entry = randomId();
    await db.batch([
      db
        .prepare(
          `INSERT INTO wallet_transactions (id,wallet_id,amount_cents,type,reference_type,reference_id,description,created_by) VALUES (?,?,?,'payroll','payroll',?,'Lohnabrechnung',?)`,
        )
        .bind(tx, wallet.id, p.netCents, p.id, actor.id),
      db
        .prepare(
          `UPDATE wallets SET balance_cents=balance_cents+?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        )
        .bind(p.netCents, wallet.id),
      db
        .prepare(
          `INSERT INTO finance_entries (id,account_id,amount_cents,category,cost_center,description,reference_type,reference_id,created_by) VALUES (?,?,-?,'Gehälter','Lohnbüro','Lohnabrechnung','payroll',?,?)`,
        )
        .bind(entry, accountId, p.netCents, p.id, actor.id),
      db
        .prepare(
          `UPDATE finance_accounts SET balance_cents=balance_cents-? WHERE id=?`,
        )
        .bind(p.netCents, accountId),
      db
        .prepare(
          `UPDATE payrolls SET status='paid',approved_by=?,approved_at=CURRENT_TIMESTAMP,paid_at=CURRENT_TIMESTAMP WHERE id=? AND status='submitted'`,
        )
        .bind(actor.id, p.id),
      db
        .prepare(`UPDATE payroll_reservations SET status='settled',updated_at=CURRENT_TIMESTAMP WHERE payroll_id=? AND status='active'`)
        .bind(p.id),
    ]);
    await audit(
      "payroll.paid",
      "payroll",
      p.id,
      actor.id,
      { netCents: p.netCents },
      vtcId,
    );
    return Response.json({ saved: true, paid: true });
  }
  return apiError("Ungültige Finanzaktion");
}
