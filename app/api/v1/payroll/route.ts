import {apiError,audit,ensureDatabase,getSessionUser,platformEnv,randomId,sha256} from "@/lib/platform";
import {createOrUpdateTripPayroll} from "@/lib/payroll";
import {personalClientKeyName} from "@/lib/client-access";

type Body={action?:"confirmTrip"|"redeemPoints";tripId?:string;points?:number};
type TripRow={id:string;vtcId:string;userId:string;status:string};

async function wallet(userId:string){const db=platformEnv().DB;let row=await db.prepare(`SELECT id,balance_cents AS balanceCents FROM wallets WHERE owner_type='user' AND owner_id=?`).bind(userId).first<{id:string;balanceCents:number}>();if(!row){const id=randomId();await db.prepare(`INSERT INTO wallets (id,owner_type,owner_id) VALUES (?,'user',?)`).bind(id,userId).run();row={id,balanceCents:0}}return row}

async function authenticatedUser(request:Request){
  const sessionUser=await getSessionUser(request);if(sessionUser)return sessionUser;
  const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"").trim();if(!supplied)return null;
  return platformEnv().DB.prepare(
    `SELECT u.id,u.email,u.display_name AS displayName FROM api_keys k JOIN users u ON u.id=k.user_id WHERE k.secret_hash=? AND k.name=? AND k.user_id IS NOT NULL AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>CURRENT_TIMESTAMP)`,
  ).bind(await sha256(supplied),personalClientKeyName).first<{id:string;email:string|null;displayName:string}>();
}

export async function GET(request:Request){await ensureDatabase();const user=await getSessionUser(request);if(!user)return apiError("Anmeldung erforderlich",401);const db=platformEnv().DB,w=await wallet(user.id);const reviews=await db.prepare(`SELECT t.id,t.vtc_id AS vtcId,t.game,t.source_city AS sourceCity,t.destination_city AS destinationCity,t.cargo,t.distance_km AS distanceKm,t.status,t.completed_at AS completedAt,r.status AS reviewStatus FROM trips t LEFT JOIN trip_reviews r ON r.trip_id=t.id WHERE t.user_id=? ORDER BY t.started_at DESC LIMIT 50`).bind(user.id).all();const payrolls=await db.prepare(`SELECT p.id,p.vtc_id AS vtcId,p.period,p.status,p.gross_cents AS grossCents,p.deductions_cents AS deductionsCents,p.net_cents AS netCents,p.approved_at AS approvedAt,p.paid_at AS paidAt,r.status AS reservationStatus,r.amount_cents AS reservedCents FROM payrolls p LEFT JOIN payroll_reservations r ON r.payroll_id=p.id WHERE p.user_id=? ORDER BY p.period DESC`).bind(user.id).all();const point=await db.prepare(`SELECT COALESCE(SUM(delta),0) total FROM point_ledger WHERE user_id=? AND status='active'`).bind(user.id).first<{total:number}>();return Response.json({user,wallet:w,activePoints:point?.total??0,trips:reviews.results,payrolls:payrolls.results})}

export async function POST(request:Request){await ensureDatabase();const user=await authenticatedUser(request);if(!user)return apiError("Anmeldung oder persönlicher Clientschlüssel erforderlich",401);const body=await request.json() as Body,db=platformEnv().DB;
  if(body.action==="confirmTrip"&&body.tripId){
    const trip=await db.prepare(`SELECT id,vtc_id AS vtcId,user_id AS userId,status FROM trips WHERE id=? AND user_id=?`).bind(body.tripId,user.id).first<TripRow>();
    if(!trip)return apiError("Fahrt nicht gefunden",404);
    if(trip.status!=="pending_driver")return apiError("Diese Fahrt wartet nicht auf deine Bestätigung",409);
    try{
      const result=await createOrUpdateTripPayroll(trip.id,user.id);
      await db.batch([
        db.prepare(`UPDATE trip_reviews SET status='driver_confirmed',driver_confirmed_at=CURRENT_TIMESTAMP WHERE trip_id=?`).bind(trip.id),
        db.prepare(`UPDATE trips SET status='confirmed' WHERE id=?`).bind(trip.id),
        db.prepare(`UPDATE point_ledger SET status='active' WHERE trip_id=? AND status='provisional'`).bind(trip.id),
        db.prepare(`UPDATE speed_incidents SET status='active' WHERE trip_id=? AND status='provisional'`).bind(trip.id),
      ]);
      await audit("trip.driver_confirmed","trip",trip.id,user.id,{payrollId:result.payrollId,netCents:result.netCents,reservationStatus:result.reservation?.status},trip.vtcId);
      return Response.json({confirmed:true,...result});
    }catch(error){return apiError(error instanceof Error?error.message:"Abrechnung konnte nicht erstellt werden",409)}
  }
  if(body.action==="redeemPoints"){const count=Math.max(1,Math.floor(body.points??0)),balance=await db.prepare(`SELECT COALESCE(SUM(delta),0) total FROM point_ledger WHERE user_id=? AND status='active'`).bind(user.id).first<{total:number}>();if(count>(balance?.total??0))return apiError("Nicht genügend aktive Punkte",409);const used=await db.prepare(`SELECT COALESCE(ABS(SUM(delta)),0) total FROM point_ledger WHERE user_id=? AND delta<0 AND reason='Punkte mit virtuellem Guthaben bezahlt' AND created_at>=datetime('now','start of month')`).bind(user.id).first<{total:number}>(),settings=await db.prepare(`SELECT point_prices AS pointPrices,monthly_redemption_limit AS monthlyLimit FROM economy_settings WHERE active=1 ORDER BY vtc_id IS NOT NULL DESC LIMIT 1`).first<{pointPrices:string;monthlyLimit:number}>();if((used?.total??0)+count>(settings?.monthlyLimit??10))return apiError("Monatliches Abbaulimit überschritten",409);const prices=JSON.parse(settings?.pointPrices??'[{"to":5,"cents":50000},{"to":10,"cents":75000},{"to":20,"cents":100000},{"to":9999,"cents":150000}]') as {to:number;cents:number}[];let cost=0;for(let i=1;i<=count;i++){const position=(balance?.total??0)-i+1;cost+=prices.find(p=>position<=p.to)?.cents??prices.at(-1)?.cents??150000}const w=await wallet(user.id);if(w.balanceCents<cost)return apiError("Virtuelles Guthaben reicht nicht aus",409);const redemptionId=randomId();await db.batch([db.prepare(`UPDATE wallets SET balance_cents=balance_cents-?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND balance_cents>=?`).bind(cost,w.id,cost),db.prepare(`INSERT INTO wallet_transactions (id,wallet_id,amount_cents,type,reference_type,reference_id,description,created_by) VALUES (?,?,-?,'point_redemption','point_redemption',?,'Punkteabbau',?)`).bind(randomId(),w.id,cost,redemptionId,user.id),db.prepare(`INSERT INTO point_ledger (id,user_id,vtc_id,delta,reason,status,source_key,created_by) VALUES (?,?,'platform',?,'Punkte mit virtuellem Guthaben bezahlt','active',?,?)`).bind(randomId(),user.id,-count,`redemption:${redemptionId}`,user.id)]);await audit("points.redeemed","point_redemption",redemptionId,user.id,{points:count,costCents:cost});return Response.json({redeemed:count,costCents:cost,newBalanceCents:w.balanceCents-cost})}
  return apiError("Ungültige Aktion");
}
