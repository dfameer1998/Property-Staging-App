import { interval } from './measurement.mjs';
const EPS = 1e-7;
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const distance = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1]);
const edges = p => p.map((v,i) => [v,p[(i+1)%p.length]]);
function onSegment(p,a,b) {
  return Math.abs(cross(a,b,p)) < EPS && p[0] >= Math.min(a[0],b[0])-EPS &&
    p[0] <= Math.max(a[0],b[0])+EPS && p[1] >= Math.min(a[1],b[1])-EPS && p[1] <= Math.max(a[1],b[1])+EPS;
}
function intersects(a,b,c,d) {
  const u=cross(a,b,c),v=cross(a,b,d),w=cross(c,d,a),x=cross(c,d,b);
  return (u*v < -EPS && w*x < -EPS) || onSegment(a,c,d) || onSegment(b,c,d) || onSegment(c,a,b) || onSegment(d,a,b);
}
function inside(p,poly) {
  if(edges(poly).some(([a,b])=>onSegment(p,a,b))) return true;
  let result=false;
  for(const [a,b] of edges(poly)) {
    if((a[1]>p[1]) !== (b[1]>p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) result=!result;
  }
  return result;
}
function pointDistance(p,a,b) {
  const denominator = (b[0]-a[0])**2+(b[1]-a[1])**2;
  const t = Math.max(0, Math.min(1, ((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/denominator));
  return distance(p,[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);
}
function edgeDistance(a,b,c,d) {
  if(intersects(a,b,c,d)) return 0;
  return Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
}
export function validatePolygon(poly) {
  if(!Array.isArray(poly) || poly.length < 3 || poly.length > 256 ||
    poly.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7))) throw new TypeError('Invalid floor polygon.');
  const sides=edges(poly);
  if(sides.some(([a,b])=>distance(a,b)<EPS)) throw new TypeError('Duplicate polygon vertices.');
  const area=sides.reduce((sum,[a,b])=>sum+a[0]*b[1]-b[0]*a[1],0)/2;
  if(Math.abs(area)<EPS) throw new TypeError('Polygon has no area.');
  for(let i=0;i<sides.length;i++) for(let j=i+1;j<sides.length;j++) {
    if(j===i+1 || (i===0&&j===sides.length-1)) continue;
    if(intersects(...sides[i],...sides[j])) throw new TypeError('Polygon intersects itself.');
  }
  return true;
}
export function rectangle(width,depth,pose) {
  if(![width,depth,pose?.xMm,pose?.zMm,pose?.rotationDegrees].every(Number.isFinite) || width<=0 || depth<=0) throw new TypeError('Invalid footprint.');
  const t=pose.rotationDegrees*Math.PI/180;
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>[
    pose.xMm+x*width/2*Math.cos(t)-z*depth/2*Math.sin(t),
    pose.zMm+x*width/2*Math.sin(t)+z*depth/2*Math.cos(t)
  ]);
}
function isContained(shape, room, clearance) {
  if(!shape.every(p=>inside(p,room))) return false;
  // Edges must remain inside concave rooms, not merely their corner points.
  for(const [a,b] of edges(shape)) {
    if(!inside([(a[0]+b[0])/2,(a[1]+b[1])/2],room)) return false;
    for(const [c,d] of edges(room)) {
      if(cross(a,b,c)*cross(a,b,d)<-EPS && cross(c,d,a)*cross(c,d,b)<-EPS) return false;
      if(edgeDistance(a,b,c,d)+EPS<clearance) return false;
    }
  }
  return true;
}
function conflicts(a,b,clearance) {
  if(a.some(p=>inside(p,b))||b.some(p=>inside(p,a))) return true;
  return edges(a).some(([p,q])=>edges(b).some(([r,s])=>intersects(p,q,r,s)||edgeDistance(p,q,r,s)+EPS<clearance));
}
export function assessPlacement({room, product, pose, clearanceMm}) {
  if(!Number.isFinite(clearanceMm)||clearanceMm<0) throw new TypeError('Explicit clearance is required.');
  validatePolygon(room?.boundaryMm);
  if(!Array.isArray(room.obstaclesMm)) throw new TypeError('Explicit obstacle assessment is required.');
  for(const obstacle of room.obstaclesMm) validatePolygon(obstacle);
  const dims = ['width','depth','height'].map(k=>interval(product?.[k]));
  const ceiling=interval(room.ceiling);
  const reasons=[];
  if(dims.some(x=>x===null)||ceiling===null) reasons.push('Confirm dimensions and measurement uncertainty.');
  if(!room.geometryEvidenceId || !room.geometryVerificationEvidenceId || !['confirmed','validated_scan'].includes(room.geometryVerification) ||
      !Number.isFinite(room.boundaryUncertaintyMm)||room.boundaryUncertaintyMm<0) reasons.push('Confirm the floor boundary and its uncertainty.');
  if(reasons.length) return {status:'needs_verification',reasons,deliveryAccess:'not_assessed'};
  const [w,d,h]=dims;
  const footprint=rectangle(w.max,d.max,pose);
  const buffer=clearanceMm+room.boundaryUncertaintyMm;
  if(h.max>ceiling.min) reasons.push('Product height exceeds conservative ceiling height.');
  if(!isContained(footprint,room.boundaryMm,buffer)) reasons.push('Footprint or clearance extends outside the verified boundary.');
  if(room.obstaclesMm.some(obstacle=>conflicts(footprint,obstacle,buffer))) reasons.push('Footprint or clearance conflicts with an obstacle.');
  return {status:reasons.length?'does_not_fit':'fits_geometry',reasons,footprintMm:footprint,deliveryAccess:'not_assessed'};
}
