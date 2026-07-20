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
function keplerElementsFromEpochWithPrecession(meanLongitudeOrMDeg, longPeriOrOmegaDeg, a, GM, papsisYears, isMeanAnomaly) {
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
// Only the angular position is mirrored - radius and timing of
// periapsis/apoapsis are identical either way, since r depends on
// cos(nu), which is symmetric in the sign of nu.
function ellipseState(a, e, omega, t, tp, GM, direction) {
  direction = direction || 1;
  const n = Math.sqrt(GM / (a * a * a));
  const M = n * (t - tp);
  const E = solveKepler(M, e);
  const nu = trueAnomalyFromE(E, e) * direction;
  const r = a * (1 - e * Math.cos(E));
  const theta = omega + nu;
  return { r: r, theta: theta, nu: nu, x: r * Math.cos(theta), y: r * Math.sin(theta) };
}
