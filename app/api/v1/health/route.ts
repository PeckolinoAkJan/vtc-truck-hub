import {ensureDatabase} from "@/lib/platform";
export async function GET(){try{await ensureDatabase();return Response.json({status:"ok",service:"convoyhub-api",version:"1.0.0",database:"connected",time:new Date().toISOString()})}catch{return Response.json({status:"degraded",database:"unavailable"},{status:503})}}
