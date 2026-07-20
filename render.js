// ============================================================
// THEME
// ============================================================

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  function v(name) { return cs.getPropertyValue(name).trim(); }
  return {
    bg: v('--color-bg'),
    selected: v('--color-selected'),
    text: v('--color-text'),
    lagrange: v('--color-lagrange'),
    lagrangeDim: v('--color-lagrange-dim'),
    orbit: v('--color-orbit'),
    sun: v('--color-sun'),
    labelBg: v('--label-bg'),
    labelText: v('--label-text'),
    labelOutline: v('--label-outline')
  };
}
const theme = readTheme();

function hexToRgba(hex, alpha) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

const LOD_MIN_PX = 3;
const LABEL_MIN_FONT_PX = 9;
const LABEL_CULL_FONT_PX = 6;
const LPOINT_LOD_MIN_PX = 4;

// ============================================================
// COMPUTE - pure functions, no ctx, no drawing. Given orbital
// elements and state, return plain numbers/points. Nothing here
// knows about colour, pixels, or canvas.
// ============================================================

function computeOrbitExtrema(a, e, omega) {
  // Periapsis/apoapsis position is independent of travel direction -
  // both are fixed geometric points on the ellipse regardless of
  // whether the body is prograde or retrograde.
  const periR = a * (1 - e);
  const apoR = a * (1 + e);
  return {
    periapsis: { r: periR, x: periR * Math.cos(omega), y: periR * Math.sin(omega) },
    apoapsis: { r: apoR, x: apoR * Math.cos(omega + Math.PI), y: apoR * Math.sin(omega + Math.PI) }
  };
}

function computeOrbitPeriodYears(a, GM) {
  return 2 * Math.PI * Math.sqrt((a * a * a) / GM);
}

// Bundles everything drawSystem needs to label a body's orbit, computed
// once per frame per body rather than scattered inline.
function computeOrbitInfo(body, sys, currentState) {
  const extrema = computeOrbitExtrema(body.a, body.e, body.omega);
  return {
    a: body.a,
    e: body.e,
    r: currentState.r,
    periodYears: computeOrbitPeriodYears(body.a, sys.GM),
    periapsis: extrema.periapsis,
    apoapsis: extrema.apoapsis
  };
}

function formatDistanceAU(au) {
  if (au < 0.001) return (au * 149597870.7).toFixed(0) + ' km';
  return au.toFixed(4) + ' AU';
}

// ============================================================
// DRAW PRIMITIVES - take explicit colour/style parameters, set
// ctx state internally. Callers never need to set ctx.strokeStyle
// or fillStyle before calling these.
// ============================================================

function safeArc(ctx, x, y, r, startAngle, endAngle) {
  if (!isFinite(r) || r < 0 || !isFinite(x) || !isFinite(y)) return false;
  ctx.arc(x, y, r, startAngle, endAngle);
  return true;
}

function drawOrbitRing(ctx, a, e, omega, cumulativeScale, color, widthPx) {
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx / cumulativeScale;
  const circumferenceEstimate = 2 * Math.PI * a;
  const desiredStepAU = 2 / cumulativeScale;
  let steps = Math.ceil(circumferenceEstimate / desiredStepAU);
  steps = Math.max(60, Math.min(steps, 2000));

  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const nu = (i / steps) * 2 * Math.PI;
    const r = a * (1 - e * e) / (1 + e * Math.cos(nu));
    const x = r * Math.cos(omega + nu);
    const y = r * Math.sin(omega + nu);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawDiamond(ctx, x, y, sizePx, cumulativeScale, color) {
  ctx.fillStyle = color;
  const s = sizePx / cumulativeScale;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s, y);
  ctx.closePath();
  ctx.fill();
}

function drawFilledCircle(ctx, x, y, radiusPx, cumulativeScale, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (safeArc(ctx, x, y, radiusPx / cumulativeScale, 0, 2 * Math.PI)) ctx.fill();
}

function drawRingOutline(ctx, x, y, radiusPx, cumulativeScale, color, widthPx) {
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx / cumulativeScale;
  ctx.beginPath();
  if (safeArc(ctx, x, y, radiusPx / cumulativeScale, 0, 2 * Math.PI)) ctx.stroke();
}

// Circle whose radius is already in LOCAL/world units (not screen px) -
// used for the Hill sphere, which is a real physical size, not a fixed
// on-screen marker size.
function drawWorldCircle(ctx, x, y, worldRadius, cumulativeScale, color, widthPx) {
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx / cumulativeScale;
  ctx.beginPath();
  if (safeArc(ctx, x, y, worldRadius, 0, 2 * Math.PI)) ctx.stroke();
}

function drawLine(ctx, x0, y0, x1, y1, cumulativeScale, color, widthPx) {
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx / cumulativeScale;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function drawTriangleOutline(ctx, points, cumulativeScale, color, widthPx) {
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx / cumulativeScale;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.stroke();
}

let chipsEnabled = true;

// Opaque white chip, solid black text, single-pixel black outline -
// fully opaque throughout, so nothing can compound across overlapping
// calls the way the old semi-transparent version could. The textColor
// parameter passed in by callers (e.g. theme.lagrange) is now UNUSED
// for the chip itself - kept in the signature so call sites don't all
// need editing, but every chip reads in a consistent black-on-white
// style regardless of which feature it belongs to.
function drawLabelChip(ctx, x, y, text, textColorUnused, cumulativeScale) {
  if (!chipsEnabled) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / cumulativeScale, 1 / cumulativeScale);
  ctx.font = LABEL_MIN_FONT_PX + 'px monospace';
  const metrics = ctx.measureText(text);
  const padX = 4, padY = 3;
  const w = metrics.width + padX * 2, h = LABEL_MIN_FONT_PX + padY * 2;

  ctx.fillStyle = theme.labelBg;
  ctx.fillRect(-padX, -h + padY, w, h);
  ctx.strokeStyle = theme.labelOutline;
  ctx.lineWidth = 1;
  ctx.strokeRect(-padX, -h + padY, w, h);

  ctx.fillStyle = theme.labelText;
  ctx.fillText(text, 0, -padY);
  ctx.restore();
}

// ============================================================
// COMPOSITE DRAW FUNCTIONS - orchestrate compute + primitives
// for one logical feature each.
// ============================================================

// Periapsis/apoapsis: ALWAYS drawn as small unlabelled markers (matches
// the existing Lagrange-diamond pattern) - labels only appear once
// selected. a/e/T have moved to the sidebar info panel (see main.js) -
// this function now only draws the things that are spatially meaningful
// or genuinely change frame to frame.
function drawBodyOrbitMarkers(ctx, body, cumulativeScale, color, showLabels) {
  const extrema = computeOrbitExtrema(body.a, body.e, body.omega);
  drawDiamond(ctx, extrema.periapsis.x, extrema.periapsis.y, 2.5, cumulativeScale, color);
  drawDiamond(ctx, extrema.apoapsis.x, extrema.apoapsis.y, 2.5, cumulativeScale, color);
  if (showLabels) {
    drawLabelChip(ctx, extrema.periapsis.x, extrema.periapsis.y - 10 / cumulativeScale, 'periapsis ' + formatDistanceAU(extrema.periapsis.r), color, cumulativeScale);
    drawLabelChip(ctx, extrema.apoapsis.x, extrema.apoapsis.y - 10 / cumulativeScale, 'apoapsis ' + formatDistanceAU(extrema.apoapsis.r), color, cumulativeScale);
  }
}

// Live/dynamic-only detail for the SELECTED body: current true distance
// from primary, updating every frame - this is the one number worth
// keeping on canvas per your own note, since watching it change directly
// shows eccentricity in action.
function drawBodyLiveDistance(ctx, currentState, cumulativeScale, color) {
  drawLine(ctx, 0, 0, currentState.x, currentState.y, cumulativeScale, hexToRgba(theme.text, 0.3), 1);
  drawLabelChip(ctx, currentState.x / 2, currentState.y / 2, 'r = ' + formatDistanceAU(currentState.r), color, cumulativeScale);
}

function drawLagrangePoints(ctx, systemId, bodyId, t, cumulativeScale) {
  const body = mapState.systems[systemId].bodies[bodyId];
  if (body.massRatio === undefined) return;

  const sys = mapState.systems[systemId];
  const st = ellipseState(body.a, body.e, body.omega, t, body.tp, sys.GM, body.direction);
  const pts = computeLagrangePoints(st, body.massRatio);

  const isSelected = mapState.selected.systemId === systemId && mapState.selected.bodyId === bodyId;
  const apparentOrbitPx = st.r * cumulativeScale;
  if (apparentOrbitPx < LPOINT_LOD_MIN_PX && !isSelected) return;

  const color = pts.degenerate ? theme.lagrangeDim : theme.lagrange;

  // Labels dropped to plain "L1".."L5" - the primary-secondary prefix
  // was redundant once you're already looking at the selected body.
  ['L1', 'L2', 'L3', 'L4', 'L5'].forEach(function (key) {
    const p = pts[key];
    drawDiamond(ctx, p.x, p.y, 3, cumulativeScale, color);
    if (isSelected) {
      drawLabelChip(ctx, p.x, p.y - 8 / cumulativeScale, key, color, cumulativeScale);
    }
  });

  if (isSelected) {
    drawWorldCircle(ctx, st.x, st.y, pts.hillRadius, cumulativeScale, hexToRgba(theme.lagrange, 0.4), 1);
    // Hill radius moved to the sidebar (see main.js selectBody) - no
    // longer labelled here, matches the "constants off-canvas" principle.

    drawTriangleOutline(ctx, [{ x: 0, y: 0 }, { x: st.x, y: st.y }, { x: pts.L4.x, y: pts.L4.y }], cumulativeScale, hexToRgba(theme.lagrange, 0.55), 1);
    drawTriangleOutline(ctx, [{ x: 0, y: 0 }, { x: st.x, y: st.y }, { x: pts.L5.x, y: pts.L5.y }], cumulativeScale, hexToRgba(theme.lagrange, 0.55), 1);

    // Side-length label now sits at the MIDPOINT of the actual edge it
    // measures (primary to secondary), not at a vertex - removes the
    // "distance from where?" ambiguity you flagged. Equal-sides property
    // of the equilateral triangle means this one label still correctly
    // states the length of all three edges.
    const sideLength = Math.sqrt(st.x * st.x + st.y * st.y);
    drawLabelChip(ctx, st.x / 2, st.y / 2 - 14 / cumulativeScale, 'triangle side = ' + formatDistanceAU(sideLength), theme.lagrange, cumulativeScale);
  }
}

function drawSystem(ctx, systemId, t, cumulativeScale) {
  const sys = mapState.systems[systemId];
  if (!mapState.layers[sys.id]) return;

  for (const bodyId in sys.bodies) {
    const b = sys.bodies[bodyId];
    const st = ellipseState(b.a, b.e, b.omega, t, b.tp, sys.GM, b.direction);
    const isSelected = mapState.selected.systemId === systemId && mapState.selected.bodyId === bodyId;

    drawOrbitRing(ctx, b.a, b.e, b.omega, cumulativeScale, isSelected ? theme.selected : theme.orbit, isSelected ? 2 : 1);
    drawFilledCircle(ctx, st.x, st.y, b.drawR, cumulativeScale, b.color);

    if (b.massRatio !== undefined) {
      drawBodyOrbitMarkers(ctx, b, cumulativeScale, isSelected ? theme.selected : hexToRgba(theme.orbit, 0.6), isSelected);
    }

    if (isSelected) {
      drawRingOutline(ctx, st.x, st.y, b.drawR + 5, cumulativeScale, theme.selected, 1.5);
      drawBodyLiveDistance(ctx, st, cumulativeScale, theme.text);
    }

    if (mapState.lagrangeEnabled && systemId === mapState.selected.systemId) {
      drawLagrangePoints(ctx, systemId, bodyId, t, cumulativeScale);
    }

    const naturalFontScreenPx = 10;
    if (naturalFontScreenPx >= LABEL_CULL_FONT_PX) {
      const screenFontPx = Math.max(LABEL_MIN_FONT_PX, naturalFontScreenPx);
      ctx.save();
      ctx.translate(st.x + 8 / cumulativeScale, st.y - 8 / cumulativeScale);
      ctx.scale(1 / cumulativeScale, 1 / cumulativeScale);
      ctx.font = screenFontPx + 'px monospace';
      ctx.fillStyle = isSelected ? theme.selected : theme.text;
      ctx.fillText(b.name, 0, 0);
      ctx.restore();
    }

    const child = getChildSystems(systemId).filter(function (s) { return s.originBodyId === bodyId; })[0];
    if (child) {
      const childScale = cumulativeScale * child.localScale;
      const apparentPx = getSystemMaxOrbitRadius(child.id) * childScale;
      if (apparentPx >= LOD_MIN_PX) {
        ctx.save();
        ctx.translate(st.x, st.y);
        ctx.scale(child.localScale, child.localScale);
        drawSystem(ctx, child.id, t, childScale);
        ctx.restore();
      }
    }
  }
}

function getVisibleLocalBounds(ctx) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const inv = ctx.getTransform().invertSelf();
  const corners = [
    inv.transformPoint({ x: 0, y: 0 }),
    inv.transformPoint({ x: w, y: 0 }),
    inv.transformPoint({ x: 0, y: h }),
    inv.transformPoint({ x: w, y: h })
  ];
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < corners.length; i++) {
    xMin = Math.min(xMin, corners[i].x); xMax = Math.max(xMax, corners[i].x);
    yMin = Math.min(yMin, corners[i].y); yMax = Math.max(yMax, corners[i].y);
  }
  return { xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax };
}

let hillshadeCanvas = null;

function drawHistogramOverlay(ctx, w, h, result) {
  const boxW = 220, boxH = 70, x0 = w - boxW - 10, y0 = 10;
  ctx.fillStyle = 'rgba(5,7,13,0.75)';
  ctx.fillRect(x0, y0, boxW, boxH);

  const bins = result.histogram;
  const maxCount = Math.max.apply(null, bins);
  const barW = boxW / bins.length;
  ctx.fillStyle = '#8ab';
  for (let i = 0; i < bins.length; i++) {
    const barH = maxCount > 0 ? (bins[i] / maxCount) * (boxH - 20) : 0;
    ctx.fillRect(x0 + i * barW, y0 + boxH - 18 - barH, Math.max(1, barW - 1), barH);
  }

  ctx.fillStyle = '#cde';
  ctx.font = '10px monospace';
  ctx.fillText('min ' + result.minV.toExponential(2) + '   max ' + result.maxV.toExponential(2), x0 + 4, y0 + boxH - 4);
}

function drawGravityHillshade(ctx, w, h) {
  const cam = mapState.camera;
  const halfW = (w / 2) / cam.pxPerAU;
  const halfH = (h / 2) / cam.pxPerAU;
  const bounds = { xMin: cam.x - halfW, xMax: cam.x + halfW, yMin: cam.y - halfH, yMax: cam.y + halfH };

  let massPoints = gatherRelevantMassPoints(mapState.t, bounds);
  if (mapState.layers.hillshadeResidual && trackedSystemId) {
    massPoints = excludeSystemPrimary(massPoints, trackedSystemId);
  }
  const result = computeHillshadeBuffer(massPoints, bounds, hillshadeConfig);

  if (!hillshadeCanvas) {
    hillshadeCanvas = document.createElement('canvas');
    hillshadeCanvas.width = hillshadeConfig.resX;
    hillshadeCanvas.height = hillshadeConfig.resY;
  }
  const hctx = hillshadeCanvas.getContext('2d');
  const imgData = hctx.createImageData(hillshadeConfig.resX, hillshadeConfig.resY);
  imgData.data.set(result.pixels);
  hctx.putImageData(imgData, 0, 0);

  ctx.drawImage(hillshadeCanvas, 0, 0, w, h);

  if (mapState.layers.hillshadeHistogram) {
    drawHistogramOverlay(ctx, w, h, result);
  }
}

// Single definition - the earlier duplicate (hardcoded colours, no
// theme) has been removed. This is the only drawMap in the file.
function drawMap(ctx, w, h) {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);

  if (mapState.layers.hillshade) {
    drawGravityHillshade(ctx, w, h);
  }

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(mapState.camera.pxPerAU, mapState.camera.pxPerAU);
  ctx.translate(-mapState.camera.x, -mapState.camera.y);

  drawFilledCircle(ctx, 0, 0, 7, mapState.camera.pxPerAU, theme.sun);
  drawSystem(ctx, 'solar-system', mapState.t, mapState.camera.pxPerAU);

  ctx.restore();
}
