import { mapState } from '../state/state.js';
import { SOLAR_GM } from '../data/systems.js';
import { ellipseState } from '../core/orbits.js';
import { getSystemWorldOrigin } from '../physics/worldpos.js';

// Gravity Hillshade: per-pixel relief shading of summed Newtonian
// potential. Colour is grayscale, driven by log-normalised magnitude
// (percentile-clipped so a near-singularity pixel under a tracked body
// can't crush the frame's contrast) with Lambertian hillshading applied
// on top from the same analytic gradient. Optional "exclude primary"
// mode isolates a system's local structure (moons, Lagrange points)
// from its dominant central body's own well.
//
// Histogram equalisation and a multi-hue colour ramp were both tried
// and are not currently in use - see OVERVIEW.md section 4 for why each
// was considered. If you reintroduce either, update README.md's
// description of this feature to match.

export const hillshadeConfig = {
  resX: 220,
  resY: 160,
  steepnessGain: 3.0,
  lightAzimuthDeg: 315,
  lightElevationDeg: 45,
  ambient: 0.35,
  loPercentile: 0.02,
  hiPercentile: 0.97
};

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

function gradientAt(px, py, massPoints, softening) {
  let gx = 0, gy = 0;
  for (let i = 0; i < massPoints.length; i++) {
    const m = massPoints[i];
    const dx = px - m.x, dy = py - m.y;
    const r2 = dx * dx + dy * dy + softening * softening;
    const r3 = r2 * Math.sqrt(r2);
    gx += m.GM * dx / r3;
    gy += m.GM * dy / r3;
  }
  return { gx: gx, gy: gy };
}

function slopeToNormal(gx, gy, steepnessGain) {
  const mag = Math.sqrt(gx * gx + gy * gy);
  if (mag < 1e-30) return { nx: 0, ny: 0, nz: 1 };
  const theta = Math.atan(mag * steepnessGain);
  const sinT = Math.sin(theta), cosT = Math.cos(theta);
  return { nx: -(gx / mag) * sinT, ny: -(gy / mag) * sinT, nz: cosT };
}

// Light vector in WORLD coordinates (+y up the screen, matching the
// y-flip in render.js drawMap). Azimuth is a compass bearing measured
// clockwise from screen-up, so 315 is a light from the upper left.
function lightDirection(azimuthDeg, elevationDeg) {
  const az = azimuthDeg * Math.PI / 180, el = elevationDeg * Math.PI / 180;
  return { lx: Math.cos(el) * Math.sin(az), ly: Math.cos(el) * Math.cos(az), lz: Math.sin(el) };
}

function computeValueHistogram(tValues, numBins) {
  const bins = new Array(numBins).fill(0);
  for (let i = 0; i < tValues.length; i++) {
    let b = Math.floor(tValues[i] * numBins);
    if (b < 0) b = 0;
    if (b >= numBins) b = numBins - 1;
    bins[b]++;
  }
  return bins;
}

export function computeHillshadeBuffer(massPoints, bounds, config) {
  const resX = config.resX, resY = config.resY;
  const n = resX * resY;
  const values = new Float64Array(n);
  const gxArr = new Float64Array(n);
  const gyArr = new Float64Array(n);
  const uArr = new Float64Array(n);

  const cx = (bounds.xMin + bounds.xMax) / 2, cy = (bounds.yMin + bounds.yMax) / 2;
  let minDist = Infinity;
  for (let i = 0; i < massPoints.length; i++) {
    const d = Math.sqrt(Math.pow(massPoints[i].x - cx, 2) + Math.pow(massPoints[i].y - cy, 2));
    if (d > 1e-9 && d < minDist) minDist = d;
  }
  const span = Math.max(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin);
  const softening = isFinite(minDist) ? Math.min(minDist * 0.02, span * 0.02) : span * 0.02;

  // Row 0 is the TOP of the image, which is world yMax (world +y is up
  // the screen - see render.js drawMap).
  for (let j = 0; j < resY; j++) {
    const py = bounds.yMax - (bounds.yMax - bounds.yMin) * (j / (resY - 1));
    for (let i = 0; i < resX; i++) {
      const px = bounds.xMin + (bounds.xMax - bounds.xMin) * (i / (resX - 1));
      const idx = j * resX + i;
      values[idx] = potentialAt(px, py, massPoints, softening);
      const g = gradientAt(px, py, massPoints, softening);
      gxArr[idx] = g.gx; gyArr[idx] = g.gy;
    }
  }

  const mags = new Float64Array(n);
  for (let i = 0; i < n; i++) mags[i] = Math.abs(values[i]);
  const sortedMags = Array.prototype.slice.call(mags).sort(function (a, b) { return a - b; });
  const loMag = Math.max(sortedMags[Math.floor(config.loPercentile * (n - 1))], 1e-30);
  const hiMag = Math.max(sortedMags[Math.floor(config.hiPercentile * (n - 1))], loMag * 10);
  const logLo = Math.log(loMag), logHi = Math.log(hiMag);

  for (let idx = 0; idx < n; idx++) {
    const mag = Math.min(Math.max(Math.abs(values[idx]), loMag), hiMag);
    uArr[idx] = (Math.log(mag) - logLo) / Math.max(logHi - logLo, 1e-30);
  }

  const light = lightDirection(config.lightAzimuthDeg, config.lightElevationDeg);
  const data = new Uint8ClampedArray(n * 4);

  for (let idx = 0; idx < n; idx++) {
    const t = Math.max(0, Math.min(1, uArr[idx]));
    const norm = slopeToNormal(gxArr[idx], gyArr[idx], config.steepnessGain);
    const dot = norm.nx * light.lx + norm.ny * light.ly + norm.nz * light.lz;
    const brightness = config.ambient + (1 - config.ambient) * ((dot + 1) / 2);

    const shade = t * 255 * brightness;
    const o = idx * 4;
    data[o] = shade;
    data[o + 1] = shade;
    data[o + 2] = shade;
    data[o + 3] = 255;
  }

  return {
    pixels: data,
    minV: -hiMag,
    maxV: -loMag,
    histogram: computeValueHistogram(uArr, 40)
  };
}

// Scoped to the current viewport (plus a margin) rather than the whole
// map - prevents distant, unrelated systems from swamping the
// percentile clip with a near-constant background offset.
export function gatherRelevantMassPoints(t, bounds) {
  const marginX = (bounds.xMax - bounds.xMin) * 0.5;
  const marginY = (bounds.yMax - bounds.yMin) * 0.5;
  const xMin = bounds.xMin - marginX, xMax = bounds.xMax + marginX;
  const yMin = bounds.yMin - marginY, yMax = bounds.yMax + marginY;

  const points = [];
  if (0 >= xMin && 0 <= xMax && 0 >= yMin && 0 <= yMax) {
    points.push({ x: 0, y: 0, GM: SOLAR_GM });
  }
  for (const systemId in mapState.systems) {
    if (!mapState.layers[systemId]) continue;
    const sys = mapState.systems[systemId];
    const origin = getSystemWorldOrigin(systemId, t);
    for (const bodyId in sys.bodies) {
      const b = sys.bodies[bodyId];
      if (b.massRatio === undefined) continue;
      const st = ellipseState(b.a, b.e, b.omegaBase, b.omegaDotRadPerYear, t, b.tp, sys.GM, b.direction);
      const wx = origin.x + st.x, wy = origin.y + st.y;
      if (wx >= xMin && wx <= xMax && wy >= yMin && wy <= yMax) {
        points.push({ x: wx, y: wy, GM: sys.GM * b.massRatio });
      }
    }
  }
  if (points.length === 0) points.push({ x: 0, y: 0, GM: SOLAR_GM });
  return points;
}

// Excludes the given system's own primary from a mass-point list -
// isolates local structure (moons, Lagrange points) from a dominant
// central body's own well.
export function excludeSystemPrimary(massPoints, systemId) {
  if (systemId === 'solar-system') {
    return massPoints.filter(function (m) { return !(m.x === 0 && m.y === 0 && m.GM === SOLAR_GM); });
  }
  const sys = mapState.systems[systemId];
  const origin = getSystemWorldOrigin(systemId, mapState.t);
  return massPoints.filter(function (m) {
    return !(Math.abs(m.x - origin.x) < 1e-12 && Math.abs(m.y - origin.y) < 1e-12 && Math.abs(m.GM - sys.GM) < 1e-6);
  });
}
