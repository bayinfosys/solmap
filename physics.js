// The one place precession is actually computed. Runs once per frame,
// BEFORE render, in main.js's loop(). Every downstream reader (render.js,
// worldpos.js, lagrange.js, hillshade.js) just reads body.omega as a
// plain, already-current value - none of them need to know precession
// exists.
function advancePrecession(t) {
  for (const systemId in mapState.systems) {
    const sys = mapState.systems[systemId];
    for (const bodyId in sys.bodies) {
      const b = sys.bodies[bodyId];
      if (b.omegaDotRadPerYear) {
        b.omega = b.omegaBase + b.omegaDotRadPerYear * t;
      }
    }
  }
}
