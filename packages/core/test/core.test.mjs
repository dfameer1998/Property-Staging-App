import {test} from 'node:test';
import assert from 'node:assert/strict';
import {measurement,interval,captureRoute,assessPlacement,validatePolygon,productRelation,compareOffers,operatingCost,imageAttemptCost} from '../src/index.mjs';
const m=(v,u=0)=>measurement({value:v,unit:'mm',source:'reference_measurement',evidenceId:'measurement-1',uncertainty:u,verification:'confirmed',verificationEvidenceId:'confirmation-1'});
const room=()=>({boundaryMm:[[0,0],[4000,0],[4000,4000],[0,4000]],ceiling:m(2500,10),obstaclesMm:[],boundaryUncertaintyMm:10,geometryEvidenceId:'scan-1',geometryVerification:'confirmed',geometryVerificationEvidenceId:'review-1'});
const product=()=>({width:m(1800,5),depth:m(900,5),height:m(800,5)});
const placement=(changes={})=>({room:room(),product:product(),pose:{xMm:2000,zMm:2000,rotationDegrees:0},clearanceMm:100,...changes});
test('native capture fallback reflects hardware, not operating system alone',()=>{
  assert.equal(captureRoute({platform:'ios',roomPlanSupported:true}),'roomplan');
  assert.equal(captureRoute({platform:'ios',worldTrackingSupported:true}),'arkit_guided');
  assert.equal(captureRoute({platform:'android',worldTrackingSupported:true,depthSupported:false}),'arcore_guided');
  assert.equal(captureRoute({platform:'android',worldTrackingSupported:false,depthSupported:true}),'reference_measurement');
});
test('converts units and refuses fabricated verification',()=>{
  assert.equal(measurement({value:1,unit:'ft',source:'manufacturer',evidenceId:'spec'}).mm,304.8);
  assert.throws(()=>measurement({value:1,unit:'ft',source:'manufacturer',evidenceId:'spec',verification:'confirmed'}));
  assert.equal(interval(measurement({value:2,unit:'m',source:'arkit',evidenceId:'capture'})),null);
});
test('confirmed dimensions with no error bound remain unverified for fit',()=>{
  const p=product();p.width={...p.width,uncertaintyMm:null};
  assert.equal(assessPlacement(placement({product:p})).status,'needs_verification');
});
test('valid central furniture passes geometry without asserting delivery access',()=>{
  const result=assessPlacement(placement());
  assert.equal(result.status,'fits_geometry');assert.equal(result.deliveryAccess,'not_assessed');
});
test('nominal exact fit fails after measurement uncertainty and clearance',()=>{
  const p=product();p.width=m(4000);
  assert.equal(assessPlacement(placement({product:p,clearanceMm:0})).status,'does_not_fit');
});
test('rotation changes available placement',()=>{
  const p={width:m(3000),depth:m(500),height:m(800)};
  const r={...room(),boundaryMm:[[0,0],[3200,0],[3200,1500],[0,1500]]};
  assert.equal(assessPlacement(placement({room:r,product:p,pose:{xMm:1600,zMm:750,rotationDegrees:0},clearanceMm:50})).status,'fits_geometry');
  assert.equal(assessPlacement(placement({room:r,product:p,pose:{xMm:1600,zMm:750,rotationDegrees:90},clearanceMm:50})).status,'does_not_fit');
});
test('concave recess crossing is rejected even when furniture corners are inside',()=>{
  const r={...room(),boundaryMm:[[0,0],[4000,0],[4000,4000],[2500,4000],[2500,1000],[1500,1000],[1500,4000],[0,4000]]};
  const p={width:m(2500),depth:m(500),height:m(800)};
  assert.equal(assessPlacement(placement({room:r,product:p,pose:{xMm:2000,zMm:2500,rotationDegrees:0},clearanceMm:0})).status,'does_not_fit');
});
test('obstacles fully contained under a footprint still collide',()=>{
  const r=room();r.obstaclesMm=[[[1900,1900],[2100,1900],[2100,2100],[1900,2100]]];
  assert.equal(assessPlacement(placement({room:r})).status,'does_not_fit');
});
test('invalid polygons and absent obstacle assessment fail closed',()=>{
  assert.throws(()=>validatePolygon([[0,0],[4,4],[0,4],[4,0]]));
  const r=room();delete r.obstaclesMm;
  assert.throws(()=>assessPlacement(placement({room:r})));
});
test('low ceiling rejects tall products',()=>{
  const r=room();r.ceiling=m(750,10);
  assert.equal(assessPlacement(placement({room:r})).status,'does_not_fit');
});
const variant={brand:'Example',model:'S1',finish:'Oak',size:'Wide',configuration:'Two-door',condition:'New',packCount:1,identityEvidenceId:'spec-1'};
test('same model with a different finish is an alternative',()=>{
  assert.equal(productRelation(variant,{...variant,finish:'Walnut'}).relation,'alternative');
  assert.equal(productRelation(variant,{...variant}).relation,'same_product');
  assert.equal(productRelation(variant,{...variant,configuration:null}).relation,'unverified');
});
const context={quantity:1,now:Date.parse('2026-09-16T12:00:00Z'),maxAgeMs:3600000,deadline:'2026-09-20T23:59:00Z',destinationKey:'US-90039'};
const offer=(id,price)=>({id,unitPriceMinor:price,currency:'USD',shippingMinor:1000,taxMinor:1000,feesMinor:0,checkedAt:'2026-09-16T11:30:00Z',availableQuantity:2,deliveryLatest:'2026-09-19T12:00:00Z',destinationKey:'US-90039',sourceUrl:'https://example.com/product'});
test('unknown tax does not become zero or the lowest complete offer',()=>{
  const result=compareOffers([{...offer('unknown',100),taxMinor:null},offer('complete',5000)],context)[0];
  assert.equal(result.lowestCompleteOfferId,'complete');
  assert.equal(result.allOffersComparable,false);
  assert.equal(result.rows.find(r=>r.offerId==='unknown').totalMinor,null);
});
test('foreign currency stays in a separate comparison',()=>{
  assert.equal(compareOffers([offer('usd',5000),{...offer('eur',100),currency:'EUR'}],context).length,2);
});
test('destination and deadline constraints disqualify cheap offers',()=>{
  const result=compareOffers([offer('good',5000),{...offer('wrong-zip',100),destinationKey:'US-10001'},
    {...offer('late',200),deliveryLatest:'2026-09-22T12:00:00Z'}],context)[0];
  assert.equal(result.lowestCompleteOfferId,'good');assert.equal(result.rows.filter(r=>r.eligible).length,1);
});
test('stale or future timestamps cannot win',()=>{
  const result=compareOffers([{...offer('stale',10),checkedAt:'2026-09-15T12:00:00Z'},
    {...offer('future',20),checkedAt:'2026-09-17T12:00:00Z'}],context)[0];
  assert.equal(result.lowestCompleteOfferId,null);
});
test('zero charges remain genuine zero and quantity affects item price only',()=>{
  const result=compareOffers([{...offer('one',5000),shippingMinor:0,taxMinor:0}],{...context,quantity:2})[0];
  assert.equal(result.rows[0].totalMinor,10000);assert.equal(result.allOffersComparable,true);
});
test('duplicate offers and invalid charge types are rejected',()=>{
  assert.throws(()=>compareOffers([offer('a',5000),offer('a',5000)],context));
  assert.throws(()=>compareOffers([{...offer('a',5000),shippingMinor:-1}],context));
});
test('usage model includes failed/repeated provider attempts',()=>{
  const attemptCost=imageAttemptCost({imageInputTokens:4000,textInputTokens:800,imageOutputTokens:6000,imageInputRate:8,textInputRate:5,imageOutputRate:30});
  assert.ok(Math.abs(attemptCost-.216)<1e-9);
  const result=operatingCost({activeUsers:5000,acceptedImagesPerUser:4,attemptCost,attemptsPerAcceptedImage:1.3,otherAIPerActive:.25,mediaPerActive:.05,baseInfrastructure:150,infrastructurePerActive:.03,supportPerActive:.10});
  assert.ok(Math.abs(result.total-7916)<1e-7);assert.equal(result.acceptedImages,20000);
});
