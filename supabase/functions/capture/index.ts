import { normalizeCapture } from './capture.mjs';

const endpoint=Deno.env.get('SUPABASE_URL')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return json({error:'Use POST.'},405);
 const authorization=req.headers.get('Authorization')??'';
 if(!authorization.startsWith('Bearer '))return json({error:'Sign in to save a capture.'},401);
 try {
  // Verify with Auth, not a client claim or a locally decoded JWT.
  const identity=await fetch(endpoint+'/auth/v1/user',{headers:{apikey:anon,Authorization:authorization}});
  if(!identity.ok)return json({error:'Your session expired. Sign in again.'},401);
  const user=await identity.json();
  if(!user.id)return json({error:'Invalid session.'},401);
  const reader=req.body?.getReader(); if(!reader)return json({error:'A capture is required.'},400);
  let size=0; const parts:Uint8Array[]=[];
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536){await reader.cancel();return json({error:'Capture exceeds 64 KB.'},413);}parts.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  let capture;try{capture=normalizeCapture(JSON.parse(new TextDecoder().decode(bytes)));}catch(e){return json({error:e instanceof Error?e.message:'Invalid capture.'},400);}
  const headers={apikey:anon,Authorization:authorization};
  const space=await fetch(endpoint+`/rest/v1/spaces?id=eq.${capture.space_id}&select=id&limit=1`,{headers});
  if(!space.ok)return json({error:'Could not check the space.'},503);
  if((await space.json()).length!==1)return json({error:'Space not found.'},404);
  const existing=await fetch(endpoint+`/rest/v1/captures?id=eq.${capture.id}&select=*`,{headers});
  if(!existing.ok)return json({error:'Could not check the capture.'},503);
  const rows=await existing.json();
  if(rows.length){
   const same=['space_id','platform','route','boundary_mm','ceiling_height_mm'].every(k=>JSON.stringify(rows[0][k])===JSON.stringify(capture[k]));
   return same?json(rows[0]):json({error:'Capture ID already belongs to different observations.'},409);
  }
  const saved=await fetch(endpoint+'/rest/v1/captures',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({...capture,owner_id:user.id})});
  if(!saved.ok){const err=await saved.json();return json({error:err.code==='23514'?'Capture or beta limit is invalid.':err.code==='23505'?'Capture already saved. Refresh and retry.':'Could not save capture.'},err.code==='23505'?409:422);}
  return json((await saved.json())[0],201);
 } catch {return json({error:'Capture service unavailable. Please retry.'},503);}
});
