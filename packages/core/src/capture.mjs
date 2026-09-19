import { validatePolygon } from './geometry.mjs';

const routes = { ios: ['roomplan', 'arkit_guided', 'reference_measurement'], android: ['arcore_guided', 'arcore_depth', 'reference_measurement'] };
const id = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

// Native clients submit observations, never their own claims of verified fit.
export function normalizeCapture(input) {
  if (!input || input.schemaVersion !== 1 || !id(input.id) || !id(input.spaceId)) throw new TypeError('Invalid capture identity or schema.');
  if (!routes[input.platform]?.includes(input.route)) throw new TypeError('Capture route does not match the platform.');
  if (input.unit !== 'm' || input.coordinateSystem !== 'right_handed_y_up') throw new TypeError('Use meters in a right-handed Y-up coordinate system.');
  const points = input.floorPoints;
  if (!Array.isArray(points) || points.length < 3 || points.length > 128) throw new TypeError('Capture at least three floor corners.');
  if (points.some(p => !Array.isArray(p) || p.length !== 3 || p.some(v => !Number.isFinite(v) || Math.abs(v) > 1000))) throw new TypeError('Invalid floor coordinates.');
  if (Math.max(...points.map(p=>p[1])) - Math.min(...points.map(p=>p[1])) > 0.15) throw new TypeError('Corners must be on the same level floor.');
  const origin = points[0];
  const boundaryMm = points.map(p => [(p[0]-origin[0])*1000, (p[2]-origin[2])*1000]);
  validatePolygon(boundaryMm);
  for (let i=0; i<boundaryMm.length; i++) {
    const a=boundaryMm[i], b=boundaryMm[(i+1)%boundaryMm.length];
    if (Math.hypot(a[0]-b[0],a[1]-b[1]) < 50) throw new TypeError('Corners must be at least 5 cm apart.');
  }
  const areaMm2=Math.abs(boundaryMm.reduce((s,p,i)=>{const q=boundaryMm[(i+1)%boundaryMm.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);
  if (areaMm2 < 250000 || areaMm2 > 1e10) throw new TypeError('Floor area is outside the supported capture range.');
  const ceilingHeightM=input.ceilingHeightM ?? null;
  if (ceilingHeightM !== null && (!Number.isFinite(ceilingHeightM) || ceilingHeightM < 0.5 || ceilingHeightM > 30)) throw new TypeError('Invalid ceiling height.');
  return {
    id:input.id, space_id:input.spaceId, platform:input.platform, route:input.route,
    boundary_mm:boundaryMm, floor_area_m2:areaMm2/1e6,
    ceiling_height_mm:ceilingHeightM===null?null:ceilingHeightM*1000,
    verification:'unverified', uncertainty_mm:null,
    // Missing obstacle and access surveys must never become empty, verified lists.
    obstacles_mm:null, delivery_access:'not_assessed', schema_version:1
  };
}
