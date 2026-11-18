import { mapState } from '../state/state.js';
import { ellipseState } from '../core/orbits.js';
import { getSystemWorldOrigin, getPrimaryName } from './worldpos.js';

// Lagrange points for a primary/secondary pair. All formulas are the
// standard small-mass-ratio approximations (first order in massRatio),
// not exact restricted-three-body solutions - accurate enough to look
// and behave correctly for any real planet/moon pair in this map, but
// not research-grade precision.
//
// MASS_RATIO_SKIP_THRESHOLD: below this, a body's own gravity is too
// weak for L1/L2 to fall meaningfully outside its own radius - these are
// still computed (so "how close to the body is this" is an honest,
// visible fact), but flagged as degenerate rather than hidden.
const MASS_RATIO_SKIP_THRESHOLD = 1e-9;

// hillRadius: standard formula, r_H = a * (m2 / 3*M1)^(1/3).
// Only needs the mass RATIO (secondary/primary), never absolute mass -
// this is why no GM/kg values were needed anywhere in systems.js.
export function hillRadius(a, massRatio) {
  return a * Math.pow(massRatio / 3, 1 / 3);
}

// Computes all five Lagrange points for one primary/secondary pair, given
// the secondary's CURRENT orbital state (as returned by ellipseState) and
// its massRatio relative to the primary. Positions are in the SAME local
// frame as the secondary's own position (i.e. relative to the primary,
// which sits at the origin of that frame) - consistent with how bodies
// are already positioned relative to their system's origin elsewhere.
// direction: 1 = prograde (default), -1 = retrograde, as in ellipseState.
// L4 is defined as the LEADING point, so it sits 60 degrees ahead in the
// body's own direction of travel.
export function computeLagrangePoints(secondaryState, massRatio, direction) {
  direction = direction || 1;
  const r = secondaryState.r;
  const theta = secondaryState.theta;
  const rH = hillRadius(r, massRatio);
  const degenerate = massRatio < MASS_RATIO_SKIP_THRESHOLD;

  // L1, L2: standard first-order approximation, along the primary-
  // secondary line, offset inward/outward by ~the Hill radius.
  const rL1 = r - rH;
  const rL2 = r + rH;

  // L3: on the far side of the primary, first-order correction. Measured
  // from the PRIMARY (this frame's origin) L3 sits slightly INSIDE the
  // secondary's orbital radius, at r(1 - 7q/12). The often-quoted
  // 1 + 5mu/12 is its distance from the barycentre, which is a
  // different origin. Checked against the exact collinear root of the
  // restricted three-body problem: q = 0.0123 (Earth-Moon) gives
  // exact 0.99291, this formula 0.99282.
  const rL3 = r * (1 - (7 / 12) * massRatio);
  const thetaL3 = theta + Math.PI;

  // L4, L5: exact equilateral-triangle positions - same distance from
  // the primary as the secondary itself, at +/-60 degrees. Position does
  // NOT depend on mass ratio (only long-term stability does, which this
  // map doesn't model).
  const thetaL4 = theta + direction * Math.PI / 3;
  const thetaL5 = theta - direction * Math.PI / 3;

  function polarToXY(rad, ang) {
    return { x: rad * Math.cos(ang), y: rad * Math.sin(ang), r: rad, theta: ang };
  }

  return {
    degenerate: degenerate,
    hillRadius: rH,
    L1: polarToXY(rL1, theta),
    L2: polarToXY(rL2, theta),
    L3: polarToXY(rL3, thetaL3),
    L4: polarToXY(r, thetaL4),
    L5: polarToXY(r, thetaL5)
  };
}

// Convenience wrapper matching the existing world-position pattern: given
// a systemId (the SECONDARY's parent system - e.g. 'sun' for Sun-Earth,
// 'jovian-system' for Jupiter-Io) and a bodyId within it, returns the
// five points already translated into world coordinates, plus a label
// prefix following the standard "Primary-Secondary" naming convention
// (e.g. "Sun-Earth L1").
export function getLagrangePointsWorld(systemId, bodyId, t) {
  const sys = mapState.systems[systemId];
  const body = sys.bodies[bodyId];
  if (body.massRatio === undefined) return null;

  const primaryOrigin = getSystemWorldOrigin(systemId, t);
  const st = ellipseState(body.a, body.e, body.omegaBase, body.omegaDotRadPerYear, t, body.tp, sys.GM, body.direction);
  const pts = computeLagrangePoints(st, body.massRatio, body.direction);

  const labelPrefix = getPrimaryName(systemId) + '-' + body.name;

  const out = { labelPrefix: labelPrefix, degenerate: pts.degenerate, hillRadius: pts.hillRadius };
  ['L1', 'L2', 'L3', 'L4', 'L5'].forEach(function (key) {
    out[key] = { x: primaryOrigin.x + pts[key].x, y: primaryOrigin.y + pts[key].y };
  });
  return out;
}
