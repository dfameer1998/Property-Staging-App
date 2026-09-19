import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCapture } from '../packages/core/src/capture.mjs';
const packet=()=>({schemaVersion:1,id:'11111111-1111-4111-8111-111111111111',spaceId:'22222222-2222-4222-8222-222222222222',platform:'ios',route:'arkit_guided',unit:'m',coordinateSystem:'right_handed_y_up',floorPoints:[[5,1,8],[9,1,8],[9,1,11],[5,1,11]]});
test('normalizes a real-world meter origin into a 12 m² floor',()=>{
 const out=normalizeCapture(packet());assert.equal(out.floor_area_m2,12);assert.deepEqual(out.boundary_mm,[[0,0],[4000,0],[4000,3000],[0,3000]]);
});
test('Android and iOS observations produce the same metric geometry',()=>{
 const p=packet(),a=normalizeCapture(p),b=normalizeCapture({...p,platform:'android',route:'arcore_depth'});assert.deepEqual(a.boundary_mm,b.boundary_mm);
});
test('client supplied confidence never authorizes confirmed fit',()=>{
 const out=normalizeCapture({...packet(),verification:'validated_scan',uncertainty_mm:0,obstacles_mm:[]});
 assert.equal(out.verification,'unverified');assert.equal(out.uncertainty_mm,null);assert.equal(out.obstacles_mm,null);assert.equal(out.ceiling_height_mm,null);
});
test('rejects mixed levels, self crossings, duplicate points and wrong routes',()=>{
 for(const p of [{...packet(),floorPoints:[[0,0,0],[4,1,0],[4,0,3]]},{...packet(),floorPoints:[[0,0,0],[4,0,3],[0,0,3],[4,0,0]]},{...packet(),floorPoints:[[0,0,0],[0,0,0],[4,0,3]]},{...packet(),route:'arcore_guided'}]) assert.throws(()=>normalizeCapture(p));
});
test('rejects false scale, tiny geometry, nonfinite data and excessive payloads',()=>{
 for(const p of [{...packet(),unit:'cm'},{...packet(),floorPoints:[[0,0,0],[0.01,0,0],[0,0,0.01]]},{...packet(),floorPoints:[[0,0,0],[NaN,0,0],[0,0,3]]},{...packet(),floorPoints:Array(129).fill([0,0,0])}]) assert.throws(()=>normalizeCapture(p));
});
