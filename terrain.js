// --- Previous whole-system approach - kept for reference/backtracking,
// not called by the current drawGravityTerrain. See computeSystemHalos /
// computeHaloContours below for the current per-body approach. ---
// (potentialAt, gradientMagnitudeAt, fieldValueAt, estimateLevels,
//  excludePrimary, computeAdaptiveContours - ALL UNCHANGED from last
//  message, left exactly as they were)

// --- Current approach: one local patch per body ---

const terrainConfig = {
  numLevels: 12,
  maxDepth: 7,
  fieldMode: 'potential',
  haloHillMultiplier: 2.5,   // a child body's halo outer radius = this * its Hill radius
  haloInnerDivisor: 200,     // a child halo's inner radius = outer / this
  primaryOuterMultiplier: 1.1, // primary's halo outer radius = this * system's max child orbit radius
  primaryInnerDecades: 3     // primary's halo inner radius = outer / 10^this
};

const TERRAIN_MAX_DEPTH_HARD_CAP = 10;

// Levels generated directly from the body's own characteristic scale,
// not sampled from the (now full, unmodified) field - geometrically
// spaced radii from innerR to outerR, each converted via -GM/r. This is
// what lets every body get correctly-scaled levels regardless of what
// else is in the sum.
function localLevelsForBody(GM, innerR, outerR, numLevels) {
  const levels = [];
  const logLo = Math.log(innerR), logHi = Math.log(outerR);
  for (let k = 0; k < numLevels; k++) {
    const r = Math.exp(logLo + (logHi - logLo) * (k / (numLevels - 1)));
    levels.push(-GM / r);
  }
  return levels;
}

// Builds the full mass-point list (unchanged, still every body) plus one
// halo spec per body - primary included, sized to its child system;
// every massed child sized to a multiple of its own Hill radius.
function computeSystemHalos(systemId, t, config) {
  const sys = mapState.systems[systemId];
  const massPoints = buildSystemMassPoints(systemId, t);
  const halos = [];

  const maxChildR = getSystemMaxOrbitRadius(systemId);
  const primaryOuter = maxChildR > 0 ? maxChildR * config.primaryOuterMultiplier : 1;
  const primaryInner = primaryOuter / Math.pow(10, config.primaryInnerDecades);
  halos.push({ cx: 0, cy: 0, innerR: primaryInner, outerR: primaryOuter, GM: sys.GM, patchHalfSpan: primaryOuter });

  for (const bodyId in sys.bodies) {
    const b = sys.bodies[bodyId];
    if (b.massRatio === undefined) continue;
    const st = ellipseState(b.a, b.e, b.omega, t, b.tp, sys.GM, b.direction);
    const rHill = hillRadius(st.r, b.massRatio); // from lagrange.js
    const outerR = rHill * config.haloHillMultiplier;
    const innerR = outerR / config.haloInnerDivisor;
    halos.push({ cx: st.x, cy: st.y, innerR: innerR, outerR: outerR, GM: sys.GM * b.massRatio, patchHalfSpan: outerR });
  }
  return { massPoints: massPoints, halos: halos };
}

// One halo's contours - fixed physical bounds (no camera dependence at
// all), evaluated against the FULL mass-point list.
function computeHaloContours(massPoints, halo, config) {
  const cx = halo.cx, cy = halo.cy, span = halo.patchHalfSpan;
  const bounds = { xMin: cx - span, xMax: cx + span, yMin: cy - span, yMax: cy + span };
  const softening = halo.innerR * 0.05; // was * 0.5 - far smaller, only matters right at the point mass itself, not across the visible patch
  const levels = localLevelsForBody(halo.GM, halo.innerR, halo.outerR, config.numLevels);
  const maxDepth = Math.min(config.maxDepth, TERRAIN_MAX_DEPTH_HARD_CAP);
  const segmentsByLevel = [];

  const rootN = 4;
  for (let j = 0; j < rootN; j++) {
    const y0 = bounds.yMin + (bounds.yMax - bounds.yMin) * (j / rootN);
    const y1 = bounds.yMin + (bounds.yMax - bounds.yMin) * ((j + 1) / rootN);
    for (let i = 0; i < rootN; i++) {
      const x0 = bounds.xMin + (bounds.xMax - bounds.xMin) * (i / rootN);
      const x1 = bounds.xMin + (bounds.xMax - bounds.xMin) * ((i + 1) / rootN);
      subdivideAndContour(massPoints, x0, y0, x1, y1, levels, softening, 0, maxDepth, segmentsByLevel, config.fieldMode);
    }
  }
  return { levels: levels, segmentsByLevel: segmentsByLevel };
}

// (cellSegments, subdivideAndContour, buildSystemMassPoints - ALL
// UNCHANGED from last message, reused as-is by the code above)
function potentialAt(px, py, massPoints, softening) {
  let v = 0;
  for (let i = 0; i < massPoints.length; i++) {
    const m = massPoints[i];
    const dx = px - m.x, dy = py - m.y;
    const r2 = dx * dx + dy * dy + softening * softening;
    v += -m.GM / Math.sqrt(r2);
  }
  return v;
}

// Analytic gradient magnitude - exact, not finite-differenced, since the
// point-mass potential has a simple closed-form derivative.
function gradientMagnitudeAt(px, py, massPoints, softening) {
  let gx = 0, gy = 0;
  for (let i = 0; i < massPoints.length; i++) {
    const m = massPoints[i];
    const dx = px - m.x, dy = py - m.y;
    const r2 = dx * dx + dy * dy + softening * softening;
    const r3 = r2 * Math.sqrt(r2);
    gx += m.GM * dx / r3;
    gy += m.GM * dy / r3;
  }
  return Math.sqrt(gx * gx + gy * gy);
}

function fieldValueAt(px, py, massPoints, softening, mode) {
  return mode === 'gradient' ? gradientMagnitudeAt(px, py, massPoints, softening) : potentialAt(px, py, massPoints, softening);
}

// Picks level VALUES from a coarse sample. Works uniformly for both
// modes: loMag is always the smallest observed |value| (closest to zero
// - for potential that's the farthest-field point; for gradient it may
// be a well bottom OR the far field, either is a reasonable low anchor),
// hiMag is the clipped high end. sign flips the final levels negative
// for potential (always <0) or leaves them positive for gradient
// (always >=0).
function estimateLevels(massPoints, bounds, softening, config, mode) {
  const n = config.coarseSampleN;
  const mags = [];
  for (let j = 0; j < n; j++) {
    const py = bounds.yMin + (bounds.yMax - bounds.yMin) * (j / (n - 1));
    for (let i = 0; i < n; i++) {
      const px = bounds.xMin + (bounds.xMax - bounds.xMin) * (i / (n - 1));
      mags.push(Math.abs(fieldValueAt(px, py, massPoints, softening, mode)));
    }
  }
  mags.sort(function (a, b) { return a - b; });
  const loMag = Math.max(mags[0], 1e-12);
  const hiMag = Math.max(mags[Math.floor(config.clipPercentile * (mags.length - 1))], loMag * 10);
  const sign = mode === 'gradient' ? 1 : -1;

  const levels = [];
  if (hiMag <= loMag) return levels;
  if (config.spacing === 'linear') {
    for (let k = 1; k < config.numLevels; k++) levels.push(sign * (loMag + (hiMag - loMag) * (k / config.numLevels)));
    return levels;
  }
  const logLo = Math.log(loMag), logHi = Math.log(hiMag);
  for (let k = 1; k < config.numLevels; k++) {
    levels.push(sign * Math.exp(logLo + (logHi - logLo) * (k / config.numLevels)));
  }
  return levels;
}

function cellSegments(x0, y0, x1, y1, v00, v10, v11, v01, level) {
  const segs = [];
  function interpTop() { const t = (level - v00) / (v10 - v00); return { x: x0 + (x1 - x0) * t, y: y0 }; }
  function interpBottom() { const t = (level - v01) / (v11 - v01); return { x: x0 + (x1 - x0) * t, y: y1 }; }
  function interpLeft() { const t = (level - v00) / (v01 - v00); return { x: x0, y: y0 + (y1 - y0) * t }; }
  function interpRight() { const t = (level - v10) / (v11 - v10); return { x: x1, y: y0 + (y1 - y0) * t }; }
  function pair(a, b) { segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }

  const b00 = v00 > level ? 1 : 0, b10 = v10 > level ? 1 : 0, b11 = v11 > level ? 1 : 0, b01 = v01 > level ? 1 : 0;
  const c = b00 | (b10 << 1) | (b11 << 2) | (b01 << 3);
  if (c === 0 || c === 15) return segs;

  const top = interpTop(), right = interpRight(), bottom = interpBottom(), left = interpLeft();
  switch (c) {
    case 1: case 14: pair(top, left); break;    // v00 alone differs - edges touching v00
    case 2: case 13: pair(top, right); break;   // v10 alone differs
    case 4: case 11: pair(right, bottom); break; // v11 alone differs
    case 7: case 8:  pair(bottom, left); break;  // v01 alone differs
    case 3: case 12: pair(left, right); break;   // unchanged - was already correct
    case 6: case 9:  pair(top, bottom); break;   // unchanged - was already correct
    case 5: pair(top, left); pair(right, bottom); break;  // unchanged - was already correct
    case 10: pair(top, right); pair(left, bottom); break; // unchanged - was already correct
  }
  return segs;
}

function subdivideAndContour(massPoints, x0, y0, x1, y1, levels, softening, depth, maxDepth, segmentsByLevel, mode) {
  const v00 = fieldValueAt(x0, y0, massPoints, softening, mode);
  const v10 = fieldValueAt(x1, y0, massPoints, softening, mode);
  const v11 = fieldValueAt(x1, y1, massPoints, softening, mode);
  const v01 = fieldValueAt(x0, y1, massPoints, softening, mode);
  const cMin = Math.min(v00, v10, v11, v01), cMax = Math.max(v00, v10, v11, v01);

  let anyCross = false;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] >= cMin && levels[i] <= cMax) { anyCross = true; break; }
  }
  if (!anyCross) return;

  if (depth >= maxDepth) {
    for (let i = 0; i < levels.length; i++) {
      const lvl = levels[i];
      if (lvl < cMin || lvl > cMax) continue;
      const segs = cellSegments(x0, y0, x1, y1, v00, v10, v11, v01, lvl);
      if (!segmentsByLevel[i]) segmentsByLevel[i] = [];
      for (let s = 0; s < segs.length; s++) segmentsByLevel[i].push(segs[s]);
    }
    return;
  }

  const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  subdivideAndContour(massPoints, x0, y0, xm, ym, levels, softening, depth + 1, maxDepth, segmentsByLevel, mode);
  subdivideAndContour(massPoints, xm, y0, x1, ym, levels, softening, depth + 1, maxDepth, segmentsByLevel, mode);
  subdivideAndContour(massPoints, x0, ym, xm, y1, levels, softening, depth + 1, maxDepth, segmentsByLevel, mode);
  subdivideAndContour(massPoints, xm, ym, x1, y1, levels, softening, depth + 1, maxDepth, segmentsByLevel, mode);
}

function chooseCellSize(viewSpan, targetCellsAcross) {
  const raw = viewSpan / targetCellsAcross;
  const power = Math.round(Math.log2(raw));
  return Math.pow(2, power);
}

// Root cells are now snapped to a fixed world-space lattice, NOT bisected
// directly from the live view bounds - this is the actual fix for both
// the centreline artefacts and the pan-instability. bounds is still used
// to decide WHICH lattice cells are currently relevant, and to pick a
// sensible cell size for the current zoom level.
function computeAdaptiveContours(massPoints, bounds, softening, config, mode) {
  const levels = estimateLevels(massPoints, bounds, softening, config, mode);
  const maxDepth = Math.min(config.maxDepth, TERRAIN_MAX_DEPTH_HARD_CAP);
  const segmentsByLevel = [];

  const targetRootCells = 12;
  const viewSpan = Math.max(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin);
  const cellSize = chooseCellSize(viewSpan, targetRootCells);

  const xStart = Math.floor(bounds.xMin / cellSize) * cellSize;
  const xEnd = Math.ceil(bounds.xMax / cellSize) * cellSize;
  const yStart = Math.floor(bounds.yMin / cellSize) * cellSize;
  const yEnd = Math.ceil(bounds.yMax / cellSize) * cellSize;

  for (let y0 = yStart; y0 < yEnd; y0 += cellSize) {
    for (let x0 = xStart; x0 < xEnd; x0 += cellSize) {
      subdivideAndContour(massPoints, x0, y0, x0 + cellSize, y0 + cellSize, levels, softening, 0, maxDepth, segmentsByLevel, mode);
    }
  }
  return { levels: levels, segmentsByLevel: segmentsByLevel };
}

function buildSystemMassPoints(systemId, t) {
  const sys = mapState.systems[systemId];
  const points = [{ x: 0, y: 0, GM: sys.GM }];
  for (const bodyId in sys.bodies) {
    const b = sys.bodies[bodyId];
    if (b.massRatio === undefined) continue;
    const st = ellipseState(b.a, b.e, b.omega, t, b.tp, sys.GM, b.direction);
    points.push({ x: st.x, y: st.y, GM: sys.GM * b.massRatio });
  }
  return points;
}

// Local/residual field: potential from every body EXCEPT the system's
// own primary (buildSystemMassPoints always puts the primary first, at
// index 0). This is a genuine subtraction of the dominant term, not a
// remapping - unlike a monotonic compression (e.g. i/(1+i)), this
// produces a DIFFERENT scalar field with different level sets, which is
// what's actually needed to reveal structure that a huge, near-constant
// background would otherwise swamp.
function excludePrimary(massPoints) {
  return massPoints.slice(1);
}
