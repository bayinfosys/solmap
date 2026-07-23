// t=0 throughout this app is DEFINED to be the J2000 epoch (2000-01-01
// 12:00 UTC, JD 2451545.0) - see epoch.js for the real-date <-> sim-time
// bridge. Every function below assumes this.

// Precession: apsidal precession is a REAL secular effect (mainly from a
// planet's oblateness/J2, or solar perturbation for distant moons) - the
// periapsis direction genuinely rotates over time. papsisYears is the
// real, sourced period for that rotation (JPL "Papsis" column). Sign is
// ASSUMED PROGRADE (standard for low-inclination J2 perturbation) - not
// independently verified per body, since the source table gives
// magnitude/period only, not direction.
export function keplerElementsFromEpochWithPrecession(meanLongitudeOrMDeg, longPeriOrOmegaDeg, a, GM, papsisYears, isMeanAnomaly) {
  const omega = longPeriOrOmegaDeg * Math.PI / 180;
  let M0 = isMeanAnomaly ? meanLongitudeOrMDeg * Math.PI / 180 : (meanLongitudeOrMDeg - longPeriOrOmegaDeg) * Math.PI / 180;
  M0 = ((M0 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const n = Math.sqrt(GM / (a * a * a));
  const tp = -M0 / n;
  const omegaDotRadPerYear = papsisYears > 0 ? (2 * Math.PI) / papsisYears : 0;
  return { omega: omega, tp: tp, omegaDotRadPerYear: omegaDotRadPerYear };
}

function solveKepler(M, e, tol) {
  tol = tol || 1e-8;
  M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 50; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

function trueAnomalyFromE(E, e) {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

// direction: 1 = prograde (default), -1 = retrograde (e.g. Triton).
// omegaBase/omegaDotRadPerYear together define the body's precessing
// argument-of-periapsis - the precessed angle is computed fresh from
// these on every call, for whatever t is passed in. This is what makes
// the whole function a pure, stateless query: the same five orbital
// inputs plus t always give the same answer, regardless of what the
// live simulation clock elsewhere happens to be doing. There is no
// stored "current omega" anywhere any more - see physics.js's removal,
// below.
export function ellipseState(a, e, omegaBase, omegaDotRadPerYear, t, tp, GM, direction) {
  direction = direction || 1;
  const omega = omegaBase + omegaDotRadPerYear * t;
  const n = Math.sqrt(GM / (a * a * a));
  const M = n * (t - tp);
  const E = solveKepler(M, e);
  const nu = trueAnomalyFromE(E, e) * direction;
  const r = a * (1 - e * Math.cos(E));
  const theta = omega + nu;
  return { r: r, theta: theta, nu: nu, x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

// Scalar orbital speed via vis-viva, at the CURRENT true radius r (not
// the mean radius a) - this is what makes speed correctly vary around
// the orbit, fastest at periapsis, slowest at apoapsis, for any e > 0.
// Same GM/a units convention as ellipseState (AU^3/year^2, AU).
export function orbitalSpeed(r, a, GM) {
  return Math.sqrt(GM * (2 / r - 1 / a));
}

// Kepler's third law - orbital period for a body of semi-major axis a
// around a primary of gravitational parameter GM. Used for a body's own
// orbital period (via render.js) and for parking-orbit dwell time (via
// route.js, where a=r since a parking orbit is circular) - same formula
// either way, not two different calculations.
export function orbitPeriodYears(a, GM) {
  return 2 * Math.PI * Math.sqrt((a * a * a) / GM);
}
