import {ensureDatabase} from "@/lib/platform";
export async function GET(){try{await ensureDatabase();return Response.json({status:"ok",service:"vtc-truck-hub-api",version:"1.3.1",database:"connected",time:new Date().toISOString()})}catch{return Response.json({status:"degraded",database:"unavailable"},{status:503})}}
