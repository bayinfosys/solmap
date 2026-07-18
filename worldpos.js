function getSystemWorldOrigin(systemId, t) {
  const sys = mapState.systems[systemId];
  if (!sys.parentSystemId) return { x: 0, y: 0 };
  const parentOrigin = getSystemWorldOrigin(sys.parentSystemId, t);
  const parentSys = mapState.systems[sys.parentSystemId];
  const originBody = parentSys.bodies[sys.originBodyId];
  const st = ellipseState(originBody.a, originBody.e, originBody.omega, t, originBody.tp, parentSys.GM, originBody.direction);
  return { x: parentOrigin.x + st.x, y: parentOrigin.y + st.y };
}

function getBodyWorldPosition(systemId, bodyId, t) {
  const sys = mapState.systems[systemId];
  const body = sys.bodies[bodyId];
  const origin = getSystemWorldOrigin(systemId, t);
  const st = ellipseState(body.a, body.e, body.omega, t, body.tp, sys.GM, body.direction);
  return { x: origin.x + st.x, y: origin.y + st.y };
}
