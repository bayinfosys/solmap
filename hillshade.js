// Gravity Hillshade: per-pixel relief shading of summed Newtonian
// potential, coloured via histogram equalization (adapts to whatever's
// actually in view each frame - no manual gamma/log tuning needed) and
// a multi-hue ramp. Optional "exclude primary" mode for isolating a
// system's local structure (moons, Lagrange points) from its dominant
// central body.

const hillshadeConfig = {
  resX: 220,
  resY: 160,
  steepnessGain: 3.0,
  lightAzimuthDeg: 315,
  lightElevationDeg: 45,
  ambient: 0.35,
  loPercentile: 0.02,
  hiPercentile: 0.97,
  eqBins: 256, // upper bound only - buildEqualizer caps this further based on actual sample count, see below
  colorStops: [
    { t: 0.00, rgb: [10, 6, 20] },
    { t: 0.08, rgb: [70, 20, 130] },
    { t: 0.24, rgb: [40, 60, 200] },
    { t: 0.40, rgb: [20, 150, 180] },
    { t: 0.56, rgb: [70, 190, 70] },
    { t: 0.72, rgb: [230, 210, 40] },
    { t: 0.88, rgb: [235, 110, 30] },
    { t: 1.00, rgb: [250, 250, 240] }
  ]
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

function lightDirection(azimuthDeg, elevationDeg) {
  const az = azimuthDeg * Math.PI / 180, el = elevationDeg * Math.PI / 180;
  return { lx: Math.cos(el) * Math.sin(az), ly: -Math.cos(el) * Math.cos(az), lz: Math.sin(el) };
}

function rampColor(t, stops) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      const localT = (t - a.t) / (b.t - a.t);
      return [
        a.rgb[0] + (b.rgb[0] - a.rgb[0]) * localT,
        a.rgb[1] + (b.rgb[1] - a.rgb[1]) * localT,
        a.rgb[2] + (b.rgb[2] - a.rgb[2]) * localT
      ];
    }
  }
  return stops[stops.length - 1].rgb;
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

// Builds a CDF-based equalizer from whatever u-values (0..1, log-
// normalized magnitude) are actually present this frame. Bin count is
// capped relative to sample count (avoids empty, gap-producing bins),
// and the raw histogram is lightly smoothed before the cumulative sum.
function buildEqualizer(uValues, requestedBins) {
  const maxUsefulBins = Math.max(8, Math.floor(uValues.length / 20));
  const numBins = Math.min(requestedBins, maxUsefulBins);

  const hist = new Float64Array(numBins);
  for (let i = 0; i < uValues.length; i++) {
    let b = Math.floor(uValues[i] * numBins);
    if (b < 0) b = 0;
    if (b >= numBins) b = numBins - 1;
    hist[b]++;
  }

  const smoothed = new Float64Array(numBins);
  for (let b = 0; b < numBins; b++) {
    const b0 = Math.max(0, b - 1), b1 = Math.min(numBins - 1, b + 1);
    let sum = 0, count = 0;
    for (let k = b0; k <= b1; k++) { sum += hist[k]; count++; }
    smoothed[b] = sum / count;
  }

  const cdf = new Float64Array(numBins);
  let running = 0;
  for (let b = 0; b < numBins; b++) {
    running += smoothed[b];
    cdf[b] = running;
  }
  const total = running;
  for (let b = 0; b < numBins; b++) cdf[b] = total > 0 ? cdf[b] / total : b / numBins;

  return function (u) {
    let b = Math.floor(u * numBins);
    if (b < 0) b = 0;
    if (b >= numBins) b = numBins - 1;
    return cdf[b];
  };
}

function computeHillshadeBuffer(massPoints, bounds, config) {
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

  for (let j = 0; j < resY; j++) {
    const py = bounds.yMin + (bounds.yMax - bounds.yMin) * (j / (resY - 1));
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

  const equalize = buildEqualizer(uArr, config.eqBins);

  const light = lightDirection(config.lightAzimuthDeg, config.lightElevationDeg);
  const data = new Uint8ClampedArray(n * 4);
  const finalT = new Float64Array(n);

  for (let idx = 0; idx < n; idx++) {
    //const eq = equalize(uArr[idx]);
    let t = uArr[idx]; // 1 - eq;
    t = Math.max(0, Math.min(1, t));
    finalT[idx] = t;
    const color = [t*255., t*255., t*255.]; //rampColor(t, config.colorStops);

    const norm = slopeToNormal(gxArr[idx], gyArr[idx], config.steepnessGain);
    const dot = norm.nx * light.lx + norm.ny * light.ly + norm.nz * light.lz;
    const brightness = config.ambient + (1 - config.ambient) * ((dot + 1) / 2);
    //const brightness = 1.0;

    const o = idx * 4;
    data[o] = color[0] * brightness;
    data[o + 1] = color[1] * brightness;
    data[o + 2] = color[2] * brightness;
    data[o + 3] = 255;
  }

  return {
    pixels: data,
    minV: -hiMag,
    maxV: -loMag,
    histogram: computeValueHistogram(finalT, 40)
  };
}

// Scoped to the current viewport (plus a margin) rather than the whole
// map - prevents distant, unrelated systems from swamping the
// percentile clip with a near-constant background offset.
function gatherRelevantMassPoints(t, bounds) {
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
      const st = ellipseState(b.a, b.e, b.omega, t, b.tp, sys.GM, b.direction);
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
function excludeSystemPrimary(massPoints, systemId) {
  if (systemId === 'solar-system') {
    return massPoints.filter(function (m) { return !(m.x === 0 && m.y === 0 && m.GM === SOLAR_GM); });
  }
  const sys = mapState.systems[systemId];
  const origin = getSystemWorldOrigin(systemId, mapState.t);
  return massPoints.filter(function (m) {
    return !(Math.abs(m.x - origin.x) < 1e-12 && Math.abs(m.y - origin.y) < 1e-12 && Math.abs(m.GM - sys.GM) < 1e-6);
  });
}
