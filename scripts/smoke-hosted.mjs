// Run only with two explicitly provisioned, disposable test users.
// Never include real customer credentials in source or test output.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const users=JSON.parse(await readFile(process.argv[2],'utf8'));
const config=await readFile(new URL('../apps/ios/SpaceStaging/BackendConfig.swift',import.meta.url),'utf8');
const url=config.match(/url = "([^"]+)"/)[1], key=config.match(/publishableKey = "([^"]+)"/)[1];
let checks=0;
async function req(path,{method='GET',body,token,type='application/json',expect=200}={}) {
 const r=await fetch(url+path,{signal:AbortSignal.timeout(20000),method,headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':type,Prefer:'return=representation'},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});
 const text=await r.text();let result;try{result=JSON.parse(text)}catch{result=text;}
 if(r.status!==expect)throw new Error(`${method} ${path.split('?')[0]} returned ${r.status}, expected ${expect}: ${JSON.stringify(result).slice(0,500)}`);
 checks++;return result;
}
const sessions=[];
for(const u of users){const s=await req('/auth/v1/token?grant_type=password',{method:'POST',body:{email:u.email,password:u.password}});sessions.push(s.access_token);}
const [alice,bob]=sessions;
const project=(await req('/rest/v1/projects',{method:'POST',body:{name:'Disposable integration test'},token:alice,expect:201}))[0];
const space=(await req('/rest/v1/spaces',{method:'POST',body:{name:'Test floor',project_id:project.id},token:alice,expect:201}))[0];
assert.equal((await req('/rest/v1/projects?select=id',{token:bob})).length,0);
await req('/rest/v1/projects?select=id',{expect:401});
await req('/rest/v1/spaces',{method:'POST',body:{name:'Wrong owner',project_id:project.id},token:bob,expect:409});
const packet={schemaVersion:1,id:randomUUID(),spaceId:space.id,platform:'android',route:'arcore_guided',coordinateSystem:'right_handed_y_up',unit:'m',floorPoints:[[0,0,0],[4,0,0],[4,0,3],[0,0,3]]};
await req('/functions/v1/capture',{method:'POST',body:packet,token:bob,expect:404});
const capture=await req('/functions/v1/capture',{method:'POST',body:{...packet,verification:'validated_scan'},token:alice,expect:201});
assert.equal(capture.floor_area_m2,12);assert.equal(capture.verification,'unverified');
await req('/functions/v1/capture',{method:'POST',body:packet,token:alice});
await req('/functions/v1/capture',{method:'POST',body:{...packet,floorPoints:[[0,0,0],[4,0,0],[4,0,4]]},token:alice,expect:409});
await req('/functions/v1/capture',{method:'POST',body:{...packet,id:randomUUID(),unit:'cm'},token:alice,expect:400});
const id=randomUUID(),path=`${users[0].id}/${space.id}/${id}`;
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jav0AAAAASUVORK5CYII=','base64');
await req('/rest/v1/media',{method:'POST',body:{id,space_id:space.id,object_path:path,mime_type:'image/png',byte_size:image.length},token:alice,expect:201});
await writeFile('/tmp/staging-smoke-cleanup.json',JSON.stringify({userIds:users.map(u=>u.id),projectId:project.id,spaceId:space.id,objectPath:path,mediaId:id}));
await req('/storage/v1/object/space-media/'+path,{method:'POST',body:image,token:alice,type:'image/png',expect:200});
await req('/rest/v1/media?id=eq.'+id,{method:'PATCH',body:{status:'ready'},token:alice});
const own=await fetch(url+'/storage/v1/object/authenticated/space-media/'+path,{signal:AbortSignal.timeout(20000),headers:{apikey:key,Authorization:'Bearer '+alice}});assert.equal(own.status,200);checks++;
const other=await fetch(url+'/storage/v1/object/authenticated/space-media/'+path,{signal:AbortSignal.timeout(20000),headers:{apikey:key,Authorization:'Bearer '+bob}});assert.ok(other.status>=400);checks++;
await req('/storage/v1/object/space-media',{method:'DELETE',body:{prefixes:[path]},token:alice});
await req('/rest/v1/media?id=eq.'+id,{method:'DELETE',token:alice});
console.log(`${checks} hosted API checks passed, including real sign-in, capture validation, idempotency, private upload, and cross-user access rejection.`);
for(const token of sessions)await req('/auth/v1/logout?scope=global',{method:'POST',token,expect:204});
