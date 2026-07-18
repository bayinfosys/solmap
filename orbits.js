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
