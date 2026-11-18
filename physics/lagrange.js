import { mapState } from '../state/state.js';
import { ellipseState } from '../core/orbits.js';
import { getSystemWorldOrigin, getPrimaryName } from './worldpos.js';
import { computeLagrangePoints } from '../core/lagrange.js';

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
