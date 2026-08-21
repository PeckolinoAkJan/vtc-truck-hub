import { platformEnv, randomId } from "@/lib/platform";
import { tripFleetCompliance } from "@/lib/fleet-compliance";

type TripRow = {
  id: string;
  vtcId: string;
  userId: string;
  distanceKm: number;
  damage: number;
  income: number;
  sourceCity: string | null;
  destinationCity: string | null;
  startedAt: string;
  completedAt: string | null;
};

type PayrollRates = {
  modelId: string | null;
  modelName: string;
  baseSalaryCents: number;
  centsPerKm: number;
  centsPerJob: number;
  centsPerHour: number;
  damagePenalty: number;
};

const amount = (value: unknown) => Math.max(0, Number(value) || 0);

export async function ensureFinanceAccount(vtcId: string) {
  const db = platformEnv().DB;
  let account = await db
    .prepare(
      `SELECT id FROM finance_accounts WHERE vtc_id=? AND active=1 ORDER BY created_at LIMIT 1`,
    )
    .bind(vtcId)
    .first<{ id: string }>();
  if (!account) {
    account = { id: randomId() };
    await db
      .prepare(
        `INSERT INTO finance_accounts (id,vtc_id,name,type,balance_cents) VALUES (?,?,'Hauptkonto','operating',0)`,
      )
      .bind(account.id, vtcId)
      .run();
  }
  return account.id;
}

async function payrollRates(vtcId: string, userId: string): Promise<PayrollRates> {
  const db = platformEnv().DB;
  const model = await db
    .prepare(
      `SELECT pm.id,pm.name,pm.base_salary_cents AS baseSalaryCents,pm.cents_per_km AS centsPerKm,pm.cents_per_job AS centsPerJob,pm.cents_per_hour AS centsPerHour,pm.deduction_rules AS deductionRules
       FROM payroll_models pm
       LEFT JOIN memberships m ON m.vtc_id=pm.vtc_id AND m.user_id=? AND m.status='active'
       LEFT JOIN departments d ON d.vtc_id=pm.vtc_id AND d.name=m.department
       WHERE pm.vtc_id=? AND pm.active=1
         AND (pm.role_id IS NULL OR pm.role_id=m.role_id)
         AND (pm.department_id IS NULL OR pm.department_id=d.id)
       ORDER BY (pm.role_id IS NOT NULL)+(pm.department_id IS NOT NULL) DESC,pm.name
       LIMIT 1`,
    )
    .bind(userId, vtcId)
    .first<{
      id: string;
      name: string;
      baseSalaryCents: number;
      centsPerKm: number;
      centsPerJob: number;
      centsPerHour: number;
      deductionRules: string;
    }>();
  const economy = await db
    .prepare(
      `SELECT cents_per_km AS centsPerKm,job_bonus_cents AS centsPerJob,damage_penalty_per_percent_cents AS damagePenalty
       FROM economy_settings
       WHERE active=1 AND (vtc_id=? OR vtc_id IS NULL)
       ORDER BY vtc_id IS NULL LIMIT 1`,
    )
    .bind(vtcId)
    .first<{ centsPerKm: number; centsPerJob: number; damagePenalty: number }>();
  let modelDamagePenalty: number | undefined;
  if (model?.deductionRules) {
    try {
      const rules = JSON.parse(model.deductionRules) as {
        damagePenaltyPerPercentCents?: number;
      };
      if (Number.isFinite(rules.damagePenaltyPerPercentCents))
        modelDamagePenalty = Number(rules.damagePenaltyPerPercentCents);
    } catch {
      // Invalid optional model rules fall back to the active economy settings.
    }
  }
  return {
    modelId: model?.id ?? null,
    modelName: model?.name ?? (economy ? "Plattformstandard" : "Standard"),
    baseSalaryCents: Math.max(0, Math.round(model?.baseSalaryCents ?? 0)),
    centsPerKm: Math.max(0, Math.round(model?.centsPerKm ?? economy?.centsPerKm ?? 45)),
    centsPerJob: Math.max(0, Math.round(model?.centsPerJob ?? economy?.centsPerJob ?? 2500)),
    centsPerHour: Math.max(0, Math.round(model?.centsPerHour ?? 0)),
    damagePenalty: Math.max(
      0,
      Math.round(modelDamagePenalty ?? economy?.damagePenalty ?? 200),
    ),
  };
}

async function recalculatePayroll(payrollId: string) {
  const db = platformEnv().DB;
  await db
    .prepare(
      `UPDATE payrolls SET
       gross_cents=(SELECT COALESCE(SUM(CASE WHEN amount_cents>0 THEN amount_cents ELSE 0 END),0) FROM payroll_lines WHERE payroll_id=?),
       deductions_cents=(SELECT COALESCE(ABS(SUM(CASE WHEN amount_cents<0 THEN amount_cents ELSE 0 END)),0) FROM payroll_lines WHERE payroll_id=?),
       net_cents=MAX(0,(SELECT COALESCE(SUM(amount_cents),0) FROM payroll_lines WHERE payroll_id=?)),
       status=CASE WHEN status='paid' THEN status ELSE 'submitted' END,
       submitted_at=CASE WHEN status='paid' THEN submitted_at ELSE COALESCE(submitted_at,CURRENT_TIMESTAMP) END
       WHERE id=?`,
    )
    .bind(payrollId, payrollId, payrollId, payrollId)
    .run();
  return await db
    .prepare(
      `SELECT id,vtc_id AS vtcId,user_id AS userId,status,net_cents AS netCents FROM payrolls WHERE id=?`,
    )
    .bind(payrollId)
    .first<{ id: string; vtcId: string; userId: string; status: string; netCents: number }>();
}

export async function refreshPayrollReservation(
  payrollId: string,
  preferredAccountId?: string | null,
) {
  const db = platformEnv().DB;
  const payroll = await db
    .prepare(
      `SELECT id,vtc_id AS vtcId,status,net_cents AS netCents FROM payrolls WHERE id=?`,
    )
    .bind(payrollId)
    .first<{ id: string; vtcId: string; status: string; netCents: number }>();
  if (!payroll || payroll.status === "paid") return null;
  const previous = await db
    .prepare(`SELECT account_id AS accountId FROM payroll_reservations WHERE payroll_id=?`)
    .bind(payrollId)
    .first<{ accountId: string }>();
  const accountId = preferredAccountId || previous?.accountId || (await ensureFinanceAccount(payroll.vtcId));
  const account = await db
    .prepare(
      `SELECT id,balance_cents AS balanceCents FROM finance_accounts WHERE id=? AND vtc_id=? AND active=1`,
    )
    .bind(accountId, payroll.vtcId)
    .first<{ id: string; balanceCents: number }>();
  if (!account) throw new Error("Das gewählte VTC-Konto wurde nicht gefunden");
  const held = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents),0) AS reservedCents FROM payroll_reservations WHERE account_id=? AND payroll_id<>? AND status='active'`,
    )
    .bind(account.id, payrollId)
    .first<{ reservedCents: number }>();
  const available = Number(account.balanceCents) - Number(held?.reservedCents ?? 0);
  const reservationStatus = available >= payroll.netCents ? "active" : "unfunded";
  await db
    .prepare(
      `INSERT INTO payroll_reservations (payroll_id,account_id,amount_cents,status,created_at,updated_at)
       VALUES (?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON CONFLICT(payroll_id) DO UPDATE SET account_id=excluded.account_id,amount_cents=excluded.amount_cents,status=excluded.status,updated_at=CURRENT_TIMESTAMP`,
    )
    .bind(payrollId, account.id, payroll.netCents, reservationStatus)
    .run();
  return {
    accountId: account.id,
    amountCents: payroll.netCents,
    status: reservationStatus,
    availableBeforeReservationCents: available,
  };
}

async function postTripIncome(trip: TripRow, actorId: string, accountId: string) {
  const db = platformEnv().DB;
  const incomeCents = Math.max(0, Math.round(amount(trip.income) * 100));
  if (!incomeCents) return false;
  const existing = await db
    .prepare(
      `SELECT id FROM finance_entries WHERE reference_type='trip_income' AND reference_id=? AND status='posted'`,
    )
    .bind(trip.id)
    .first();
  if (existing) return false;
  await db.batch([
    db
      .prepare(
        `INSERT INTO finance_entries (id,account_id,amount_cents,category,cost_center,description,reference_type,reference_id,created_by)
         VALUES (?,?,?,'Auftragseinnahmen','Fahrbetrieb',?,'trip_income',?,?)`,
      )
      .bind(
        randomId(),
        accountId,
        incomeCents,
        `${trip.sourceCity ?? "Start"} → ${trip.destinationCity ?? "Ziel"}`,
        trip.id,
        actorId,
      ),
    db
      .prepare(`UPDATE finance_accounts SET balance_cents=balance_cents+? WHERE id=?`)
      .bind(incomeCents, accountId),
  ]);
  return true;
}

export async function createOrUpdateTripPayroll(
  tripId: string,
  actorId: string,
  options: { bookIncome?: boolean; accountId?: string | null } = {},
) {
  const db = platformEnv().DB;
  const trip = await db
    .prepare(
      `SELECT id,vtc_id AS vtcId,user_id AS userId,distance_km AS distanceKm,damage,income,source_city AS sourceCity,destination_city AS destinationCity,started_at AS startedAt,completed_at AS completedAt FROM trips WHERE id=?`,
    )
    .bind(tripId)
    .first<TripRow>();
  if (!trip) throw new Error("Fahrt nicht gefunden");
  const fleet = await tripFleetCompliance(trip.id);
  if (fleet?.status === "blocked")
    throw new Error(fleet.reason || "Die Fahrt ist wegen eines gesperrten Fahrzeugs nicht abrechenbar");
  if (fleet?.status === "review")
    throw new Error(fleet.reason || "Die Fahrzeugzuordnung muss vor der Abrechnung geprüft werden");
  const periodBase = String(trip.completedAt || new Date().toISOString()).slice(0, 7);
  type PayrollTarget = {
    id: string;
    status: string;
    period: string;
    netCents?: number;
  };
  // Repeated delivery packets and repeated review actions must always resolve to
  // the payroll line that already belongs to this trip.
  let payroll = await db
    .prepare(
      `SELECT p.id,p.status,p.period,p.net_cents AS netCents
       FROM payroll_lines l JOIN payrolls p ON p.id=l.payroll_id
       WHERE l.trip_id=? AND l.type='trip_gross'
       ORDER BY p.created_at DESC LIMIT 1`,
    )
    .bind(trip.id)
    .first<PayrollTarget>();
  if (payroll?.status === "paid") {
    const accountId = options.accountId || (await ensureFinanceAccount(trip.vtcId));
    if (options.bookIncome) {
      await postTripIncome(trip, actorId, accountId);
      await db.batch([
        db
          .prepare(`UPDATE point_ledger SET status='active' WHERE trip_id=? AND status IN ('provisional','rejected')`)
          .bind(trip.id),
        db
          .prepare(`UPDATE speed_incidents SET status='active' WHERE trip_id=? AND status IN ('provisional','rejected')`)
          .bind(trip.id),
      ]);
    }
    return {
      payrollId: payroll.id,
      netCents: payroll.netCents ?? 0,
      reservation: null,
      alreadyPaid: true,
    };
  }
  if (!payroll) {
    payroll = await db
      .prepare(
        `SELECT id,status,period,net_cents AS netCents FROM payrolls
         WHERE vtc_id=? AND user_id=? AND status<>'paid'
           AND (period=? OR period LIKE ?)
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(trip.vtcId, trip.userId, periodBase, `${periodBase} · Nachtrag %`)
      .first<PayrollTarget>();
  }
  if (!payroll) {
    const prior = await db
      .prepare(
        `SELECT COUNT(*) AS count FROM payrolls
         WHERE vtc_id=? AND user_id=? AND (period=? OR period LIKE ?)`,
      )
      .bind(trip.vtcId, trip.userId, periodBase, `${periodBase} · Nachtrag %`)
      .first<{ count: number }>();
    const priorCount = Number(prior?.count ?? 0);
    const period = priorCount > 0
      ? `${periodBase} · Nachtrag ${priorCount}`
      : periodBase;
    payroll = { id: randomId(), status: "draft", period };
    await db
      .prepare(
        `INSERT INTO payrolls (id,vtc_id,user_id,period,status) VALUES (?,?,?,?,'draft')`,
      )
      .bind(payroll.id, trip.vtcId, trip.userId, payroll.period)
      .run();
  }
  const isSupplemental = payroll.period !== periodBase;
  const rates = await payrollRates(trip.vtcId, trip.userId);
  const start = Date.parse(trip.startedAt),
    end = Date.parse(trip.completedAt ?? ""),
    hours = Number.isFinite(start) && Number.isFinite(end) && end > start
      ? Math.min(720, (end - start) / 3_600_000)
      : 0;
  const gross = Math.max(
      0,
      Math.round(amount(trip.distanceKm) * rates.centsPerKm) +
        rates.centsPerJob +
        Math.round(hours * rates.centsPerHour),
    ),
    // `damage` is already stored as percentage points (for example 10.25 = 10.25%).
    deductions = Math.max(0, Math.round(amount(trip.damage) * rates.damagePenalty));
  await db.batch([
    db
      .prepare(
        `INSERT INTO payroll_lines (id,payroll_id,trip_id,type,description,amount_cents,detail)
         VALUES (?,?,?,'trip_gross',?,?,?)
         ON CONFLICT(payroll_id,trip_id,type) DO UPDATE SET description=excluded.description,amount_cents=excluded.amount_cents,detail=excluded.detail`,
      )
      .bind(
        randomId(),
        payroll.id,
        trip.id,
        `${trip.sourceCity ?? "Start"} → ${trip.destinationCity ?? "Ziel"}`,
        gross,
        JSON.stringify({
          distanceKm: trip.distanceKm,
          hours,
          modelId: rates.modelId,
          modelName: rates.modelName,
          centsPerKm: rates.centsPerKm,
          centsPerJob: rates.centsPerJob,
          centsPerHour: rates.centsPerHour,
        }),
      ),
    db
      .prepare(
        `INSERT INTO payroll_lines (id,payroll_id,trip_id,type,description,amount_cents,detail)
         VALUES (?,?,?,'damage_deduction','Schadensabzug',?,?)
         ON CONFLICT(payroll_id,trip_id,type) DO UPDATE SET amount_cents=excluded.amount_cents,detail=excluded.detail`,
      )
      .bind(
        randomId(),
        payroll.id,
        trip.id,
        -deductions,
        JSON.stringify({ damagePercent: trip.damage, centsPerPercent: rates.damagePenalty }),
      ),
  ]);
  // A supplemental payroll contains only trips delivered after the regular
  // monthly payroll was paid. The monthly base salary must never be duplicated.
  if (rates.baseSalaryCents > 0 && !isSupplemental) {
    const baseLine = await db
      .prepare(
        `SELECT id FROM payroll_lines WHERE payroll_id=? AND trip_id IS NULL AND type='base_salary' LIMIT 1`,
      )
      .bind(payroll.id)
      .first<{ id: string }>();
    if (baseLine)
      await db
        .prepare(
          `UPDATE payroll_lines SET description='Monatsgrundlohn',amount_cents=?,detail=? WHERE id=?`,
        )
        .bind(
          rates.baseSalaryCents,
          JSON.stringify({ modelId: rates.modelId, modelName: rates.modelName }),
          baseLine.id,
        )
        .run();
    else
      await db
        .prepare(
          `INSERT INTO payroll_lines (id,payroll_id,trip_id,type,description,amount_cents,detail) VALUES (?,?,NULL,'base_salary','Monatsgrundlohn',?,?)`,
        )
        .bind(
          randomId(),
          payroll.id,
          rates.baseSalaryCents,
          JSON.stringify({ modelId: rates.modelId, modelName: rates.modelName }),
        )
        .run();
  }
  const accountId = options.accountId || (await ensureFinanceAccount(trip.vtcId));
  if (options.bookIncome) {
    await postTripIncome(trip, actorId, accountId);
    await db.batch([
      db
        .prepare(`UPDATE point_ledger SET status='active' WHERE trip_id=? AND status IN ('provisional','rejected')`)
        .bind(trip.id),
      db
        .prepare(`UPDATE speed_incidents SET status='active' WHERE trip_id=? AND status IN ('provisional','rejected')`)
        .bind(trip.id),
    ]);
  }
  const totals = await recalculatePayroll(payroll.id);
  const reservation = await refreshPayrollReservation(payroll.id, accountId);
  return { payrollId: payroll.id, netCents: totals?.netCents ?? 0, reservation };
}

export async function submitDeliveredTrip(tripId: string) {
  const db = platformEnv().DB;
  const trip = await db
    .prepare(
      `SELECT id,vtc_id AS vtcId,user_id AS userId,status FROM trips WHERE id=?`,
    )
    .bind(tripId)
    .first<{ id: string; vtcId: string; userId: string; status: string }>();
  if (!trip) throw new Error("Fahrt nicht gefunden");
  if (["cancelled", "rejected", "started", "interrupted", "paused"].includes(trip.status))
    throw new Error("Diese Fahrt ist noch nicht zur Abrechnung bereit");

  const fleet = await tripFleetCompliance(trip.id);
  if (fleet?.status === "blocked") {
    await db.batch([
      db.prepare(`UPDATE trips SET status='blocked_vehicle' WHERE id=?`).bind(trip.id),
      db.prepare(
        `INSERT INTO trip_reviews (id,trip_id,status,reason)
         VALUES (?,?,'rejected',?)
         ON CONFLICT(trip_id) DO UPDATE SET status='rejected',reason=excluded.reason`,
      ).bind(randomId(),trip.id,fleet.reason||"Gesperrtes Fahrzeug verwendet"),
    ]);
    return {
      payrollId: null,
      netCents: 0,
      reservation: null,
      tripId: trip.id,
      vtcId: trip.vtcId,
      userId: trip.userId,
      status: "fleet_blocked",
    };
  }
  if (fleet?.status === "review") {
    await db.batch([
      db.prepare(`UPDATE trips SET status='pending_review' WHERE id=?`).bind(trip.id),
      db.prepare(
        `INSERT INTO trip_reviews (id,trip_id,status,reason)
         VALUES (?,?,'pending_review',?)
         ON CONFLICT(trip_id) DO UPDATE SET status='pending_review',reason=excluded.reason`,
      ).bind(randomId(),trip.id,fleet.reason||"Fahrzeugzuordnung prüfen"),
    ]);
    return {
      payrollId: null,
      netCents: 0,
      reservation: null,
      tripId: trip.id,
      vtcId: trip.vtcId,
      userId: trip.userId,
      status: "pending_review",
    };
  }

  const result = await createOrUpdateTripPayroll(trip.id, trip.userId);
  if (trip.status === "pending_driver") {
    await db.batch([
      db
        .prepare(
          `INSERT INTO trip_reviews (id,trip_id,status,driver_confirmed_at)
           VALUES (?,?,'driver_confirmed',CURRENT_TIMESTAMP)
           ON CONFLICT(trip_id) DO UPDATE SET status='driver_confirmed',reason=NULL,driver_confirmed_at=CURRENT_TIMESTAMP`,
        )
        .bind(randomId(), trip.id),
      db.prepare(`UPDATE trips SET status='confirmed' WHERE id=? AND status='pending_driver'`).bind(trip.id),
      db.prepare(`UPDATE point_ledger SET status='active' WHERE trip_id=? AND status='provisional'`).bind(trip.id),
      db.prepare(`UPDATE speed_incidents SET status='active' WHERE trip_id=? AND status='provisional'`).bind(trip.id),
    ]);
  }
  return {
    ...result,
    tripId: trip.id,
    vtcId: trip.vtcId,
    userId: trip.userId,
    status: trip.status === "pending_driver" ? "confirmed" : trip.status,
  };
}

export async function removeTripAccounting(tripId: string, actorId: string) {
  const db = platformEnv().DB;
  let affectedPayrollId: string | null = null;
  let payrollHasLines = false;
  const line = await db
    .prepare(`SELECT payroll_id AS payrollId FROM payroll_lines WHERE trip_id=? LIMIT 1`)
    .bind(tripId)
    .first<{ payrollId: string }>();
  if (line) {
    affectedPayrollId = line.payrollId;
    const payroll = await db
      .prepare(`SELECT status FROM payrolls WHERE id=?`)
      .bind(line.payrollId)
      .first<{ status: string }>();
    if (payroll?.status === "paid")
      throw new Error("Eine bereits ausgezahlte Fahrt kann nicht zurückgenommen werden");
    await db.prepare(`DELETE FROM payroll_lines WHERE trip_id=?`).bind(tripId).run();
    const remaining = await db
      .prepare(`SELECT COUNT(*) AS count FROM payroll_lines WHERE payroll_id=?`)
      .bind(line.payrollId)
      .first<{ count: number }>();
    await recalculatePayroll(line.payrollId);
    payrollHasLines = Number(remaining?.count ?? 0) > 0;
    if (!payrollHasLines) {
      await db
        .prepare(`UPDATE payrolls SET status='draft',submitted_at=NULL WHERE id=?`)
        .bind(line.payrollId)
        .run();
      await db
        .prepare(`UPDATE payroll_reservations SET status='released',amount_cents=0,updated_at=CURRENT_TIMESTAMP WHERE payroll_id=?`)
        .bind(line.payrollId)
        .run();
    }
  }
  const income = await db
    .prepare(
      `SELECT id,account_id AS accountId,amount_cents AS amountCents,description FROM finance_entries WHERE reference_type='trip_income' AND reference_id=? AND status='posted'`,
    )
    .bind(tripId)
    .first<{ id: string; accountId: string; amountCents: number; description: string }>();
  if (income) {
    await db.batch([
      db.prepare(`UPDATE finance_entries SET status='reversed' WHERE id=?`).bind(income.id),
      db
        .prepare(
          `INSERT INTO finance_entries (id,account_id,amount_cents,category,cost_center,description,status,reversal_of,reference_type,reference_id,created_by)
           VALUES (?,?,-?,'Storno','Fahrbetrieb',?,'posted',?,'trip_income_reversal',?,?)`,
        )
        .bind(
          randomId(),
          income.accountId,
          income.amountCents,
          `Storno: ${income.description}`,
          income.id,
          tripId,
          actorId,
        ),
      db
        .prepare(`UPDATE finance_accounts SET balance_cents=balance_cents-? WHERE id=?`)
        .bind(income.amountCents, income.accountId),
    ]);
  }
  await db.batch([
    db
      .prepare(`UPDATE point_ledger SET status='rejected' WHERE trip_id=? AND status IN ('provisional','active')`)
      .bind(tripId),
    db
      .prepare(`UPDATE speed_incidents SET status='rejected' WHERE trip_id=? AND status IN ('provisional','active')`)
      .bind(tripId),
  ]);
  if (affectedPayrollId && payrollHasLines)
    await refreshPayrollReservation(affectedPayrollId);
}

export async function reconcileApprovedTrips(vtcId: string, actorId: string) {
  const db = platformEnv().DB;
  const rows = await db
    .prepare(
      `SELECT DISTINCT t.id
       FROM trips t
       LEFT JOIN payroll_lines l ON l.trip_id=t.id AND l.type='trip_gross'
       LEFT JOIN payrolls p ON p.id=l.payroll_id
       LEFT JOIN payroll_reservations r ON r.payroll_id=p.id
       LEFT JOIN finance_entries e ON e.reference_type='trip_income' AND e.reference_id=t.id AND e.status='posted'
       WHERE t.vtc_id=? AND t.status='approved'
         AND (l.id IS NULL
           OR (COALESCE(p.status,'')<>'paid' AND (r.payroll_id IS NULL OR r.status='unfunded'))
           OR (t.income>0 AND e.id IS NULL))
       ORDER BY t.completed_at`,
    )
    .bind(vtcId)
    .all<{ id: string }>();
  let processed = 0;
  for (const row of rows.results) {
    await createOrUpdateTripPayroll(row.id, actorId, { bookIncome: true });
    processed++;
  }
  return processed;
}

export async function reconcilePendingDriverTrips(vtcId: string) {
  const db = platformEnv().DB;
  const rows = await db
    .prepare(
      `SELECT id FROM trips
       WHERE vtc_id=? AND status='pending_driver'
       ORDER BY completed_at,started_at`,
    )
    .bind(vtcId)
    .all<{ id: string }>();
  let processed = 0;
  const errors: string[] = [];
  for (const row of rows.results) {
    try {
      await submitDeliveredTrip(row.id);
      processed++;
    } catch (error) {
      errors.push(`${row.id}: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`);
    }
  }
  return { processed, errors };
}
