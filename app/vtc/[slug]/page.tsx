import DynamicVtcProfile from "../VtcProfileClient";
export default async function VtcBySlug({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <DynamicVtcProfile slug={slug}/>}
