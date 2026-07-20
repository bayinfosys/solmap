// Circular Restricted Three-Body Problem (CR3BP) maths, in the standard
// normalised rotating frame: primary at x=-mu, secondary at x=1-mu,
// separation=1, total mass=1. mu = secondary_mass/(primary+secondary).
//
// HONEST LIMIT: strictly valid only for a secondary on a CIRCULAR orbit.
// Every body in this map has real (usually small) eccentricity, so this
// is an approximation - the same kind of first-order approximation
// lagrange.js already uses, just extended to full nonlinear dynamics.

function crtbpMassParameter(massRatio) {
  return massRatio / (1 + massRatio);
}

// Converts a body's real orbital data into (mu, normalized-time-rate n).
// tau = n * t lets you move between real years (t) and normalized time.
function crtbpUnits(a, primaryGM, massRatio) {
  const mu = crtbpMassParameter(massRatio);
  const GMtotal = primaryGM * (1 + massRatio);
  const n = Math.sqrt(GMtotal / (a * a * a)); // rad/year - also the real mean motion
  return { mu: mu, n: n };
}

function r1of(x, y, mu) {
  const dx = x + mu;
  return Math.sqrt(dx * dx + y * y);
}
function r2of(x, y, mu) {
  const dx = x - 1 + mu;
  return Math.sqrt(dx * dx + y * y);
}

// dOmega/dx along y=0 - the function whose root gives the collinear
// Lagrange points.
function collinearF(x, mu) {
  const r1 = Math.abs(x + mu), r2 = Math.abs(x - 1 + mu);
  return x - (1 - mu) * (x + mu) / (r1 * r1 * r1) - mu * (x - 1 + mu) / (r2 * r2 * r2);
}

// d/dx of collinearF - this IS Uxx at y=0, so it does double duty: the
// derivative Newton's method needs, AND the curvature term the
// linearisation needs. One function, two uses.
function collinearUxx(x, mu) {
  const r1 = Math.abs(x + mu), r2 = Math.abs(x - 1 + mu);
  return 1 - (1 - mu) / (r1 * r1 * r1) + 3 * (1 - mu) * (x + mu) * (x + mu) / (r1 * r1 * r1 * r1 * r1)
           - mu / (r2 * r2 * r2) + 3 * mu * (x - 1 + mu) * (x - 1 + mu) / (r2 * r2 * r2 * r2 * r2);
}

function collinearUyy(x, mu) {
  const r1 = Math.abs(x + mu), r2 = Math.abs(x - 1 + mu);
  return 1 - (1 - mu) / (r1 * r1 * r1) - mu / (r2 * r2 * r2);
}

function findCollinearPoint(mu, x0, tol) {
  tol = tol || 1e-12;
  let x = x0;
  for (let i = 0; i < 100; i++) {
    const fx = collinearF(x, mu);
    const fpx = collinearUxx(x, mu);
    const dx = fx / fpx;
    x -= dx;
    if (Math.abs(dx) < tol) break;
  }
  return x;
}

// Returns L1, L2, L3 x-coordinates in the normalized rotating frame
// (primary at x=-mu, secondary at x=1-mu). Standard initial guesses.
function findCollinearPoints(mu) {
  const guessOffset = Math.pow(mu / 3, 1 / 3);
  return {
    xL1: findCollinearPoint(mu, (1 - mu) - guessOffset),
    xL2: findCollinearPoint(mu, (1 - mu) + guessOffset),
    xL3: findCollinearPoint(mu, -1 - (5 / 12) * mu)
  };
}

// The real payoff: local stable/unstable eigen-directions at a collinear
// point, from the linearised system derived above.
function collinearEigenDirection(x, mu) {
  const Uxx = collinearUxx(x, mu);
  const Uyy = collinearUyy(x, mu);
  const beta = 4 - Uxx - Uyy;
  const gamma = Uxx * Uyy;
  const disc = beta * beta - 4 * gamma; // always positive at a collinear point
  const lambdaSq = (-beta + Math.sqrt(disc)) / 2; // the positive root - the saddle
  const lambda = Math.sqrt(lambdaSq);
  const slopeUnstable = (lambdaSq - Uxx) / (2 * lambda);
  const slopeStable = (lambdaSq - Uxx) / (2 * -lambda);
  return {
    lambda: lambda,
    unstableDir: { xi: 1, eta: slopeUnstable },
    stableDir: { xi: 1, eta: slopeStable }
  };
}

// Full NONLINEAR vector field over 4D phase space [x,y,vx,vy] - this is
// the "flow field" your RK4 background maps onto directly. Ready for
// tracing the real manifold spine (not just its initial direction) by
// seeding a point just off a collinear point along its eigenvector and
// integrating this field forward (unstable) or backward (stable).
function crtbpDerivative(state, mu) {
  const x = state[0], y = state[1], vx = state[2], vy = state[3];
  const r1 = r1of(x, y, mu), r2 = r2of(x, y, mu);
  const ax = 2 * vy + x - (1 - mu) * (x + mu) / (r1 * r1 * r1) - mu * (x - 1 + mu) / (r2 * r2 * r2);
  const ay = -2 * vx + y - (1 - mu) * y / (r1 * r1 * r1) - mu * y / (r2 * r2 * r2);
  return [vx, vy, ax, ay];
}

function addScaled(state, deriv, h) {
  const out = [];
  for (let i = 0; i < 4; i++) out[i] = state[i] + h * deriv[i];
  return out;
}

function rk4Step(state, mu, dtau) {
  const k1 = crtbpDerivative(state, mu);
  const k2 = crtbpDerivative(addScaled(state, k1, dtau / 2), mu);
  const k3 = crtbpDerivative(addScaled(state, k2, dtau / 2), mu);
  const k4 = crtbpDerivative(addScaled(state, k3, dtau), mu);
  const out = [];
  for (let i = 0; i < 4; i++) out[i] = state[i] + (dtau / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return out;
}
