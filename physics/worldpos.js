import { mapState } from '../state/state.js';
import { ellipseState } from '../core/orbits.js';

export function getSystemWorldOrigin(systemId, t) {
  const sys = mapState.systems[systemId];
  if (!sys.parentSystemId) return { x: 0, y: 0 };
  const parentOrigin = getSystemWorldOrigin(sys.parentSystemId, t);
  const parentSys = mapState.systems[sys.parentSystemId];
  const originBody = parentSys.bodies[sys.originBodyId];
  const st = ellipseState(originBody.a, originBody.e, originBody.omegaBase, originBody.omegaDotRadPerYear, t, originBody.tp, parentSys.GM, originBody.direction);
  return { x: parentOrigin.x + st.x, y: parentOrigin.y + st.y };
}

export function getBodyWorldPosition(systemId, bodyId, t) {
  const sys = mapState.systems[systemId];
  const body = sys.bodies[bodyId];
  const origin = getSystemWorldOrigin(systemId, t);
  const st = ellipseState(body.a, body.e, body.omegaBase, body.omegaDotRadPerYear, t, body.tp, sys.GM, body.direction);
  return { x: origin.x + st.x, y: origin.y + st.y };
}

// Helper functions moved here from systems.js - these OPERATE on
// mapState, they're not definitions, so they belong in the build/logic
// module rather than the pure-data file.
export function getChildSystems(systemId) {
  const out = [];
  for (const key in mapState.systems) {
    if (mapState.systems[key].parentSystemId === systemId) out.push(mapState.systems[key]);
  }
  return out;
}

export function getPrimaryName(systemId) {
  const sys = mapState.systems[systemId];
  if (!sys.parentSystemId) return 'Sun';
  const parentSys = mapState.systems[sys.parentSystemId];
  return parentSys.bodies[sys.originBodyId].name;
}

export function getSystemMaxOrbitRadius(systemId) {
  const sys = mapState.systems[systemId];
  let maxR = 0;
  for (const key in sys.bodies) {
    const b = sys.bodies[key];
    maxR = Math.max(maxR, b.a * (1 + b.e));
  }
  return maxR;
}
