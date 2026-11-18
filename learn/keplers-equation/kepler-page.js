// Figures for the Kepler's equation page. Orbital maths comes from the
// map's own core/orbits.js; body eccentricities for the presets come from
// data/systems.js, so the page and the map cannot drift apart.

import { solveKepler, trueAnomalyFromE } from '../../core/orbits.js';
import { RAW_SYSTEMS } from '../../data/systems.js';
import {
  readTheme, setupFigure, fitView, clear, polyline, line, dot, ring,
  angleArc, label, deg, wrap2pi, bindShared
} from '../figure.js';

const theme = readTheme();
const TWO_PI = 2 * Math.PI;
const SECONDS_PER_ORBIT = 10;   // animation speed: one orbit of M per 10 s

const state = { e: 0.6, M: 0.6, playing: true, codeStart: true, sectors: 12 };

// ---- geometry helpers (a = 1 throughout, focus at the origin) ----

function bodyFromE(E, e) {
  const b = Math.sqrt(1 - e * e);
  return { x: Math.cos(E) - e, y: b * Math.sin(E) };
}

function ellipsePoints(e, count) {
  const pts = [];
  for (let i = 0; i <= count; i++) pts.push(bodyFromE(TWO_PI * i / count, e));
  return pts;
}

function circlePoints(cx, cy, r, count) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const a = TWO_PI * i / count;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

// Newton iterations with the same update and stopping rule as
// solveKepler, recording each step for display. startMode 'code' uses
// solveKepler's starting guess; 'M' always starts at E0 = M.
function newtonTrace(M, e, codeStart) {
  M = wrap2pi(M);
  let E = (codeStart && e >= 0.8) ? Math.PI : M;
  const steps = [{ E: E, residual: E - e * Math.sin(E) - M }];
  for (let i = 0; i < 50; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    steps.push({ E: E, residual: E - e * Math.sin(E) - M });
    if (Math.abs(dE) < 1e-8) break;
  }
  return steps;
}

// ---- Figure 1: the three anomalies ----

const figA = setupFigure(document.getElementById('figGeometry'), 0.62, function (fig) {
  const ctx = fig.ctx, e = state.e, M = wrap2pi(state.M);
  clear(fig, theme);
  const view = fitView(fig, -1 - e - 0.15, 1 - e + 0.15, -1.12, 1.12, 14);

  const E = solveKepler(M, e);
  const nu = wrap2pi(trueAnomalyFromE(E, e));
  const P = bodyFromE(E, e);
  const C = { x: -e, y: 0 };
  const Q = { x: C.x + Math.cos(E), y: Math.sin(E) };
  const Mpt = { x: C.x + Math.cos(M), y: Math.sin(M) };

  line(ctx, view, -1 - e - 0.1, 0, 1 - e + 0.1, 0, theme.orbit, 1);
  polyline(ctx, view, circlePoints(C.x, 0, 1, 180), '#3a4d66', 1, [4, 4]);
  polyline(ctx, view, ellipsePoints(e, 240), '#5f7a99', 1.5);

  line(ctx, view, C.x, 0, Mpt.x, Mpt.y, theme.route, 1, [3, 3]);
  line(ctx, view, C.x, 0, Q.x, Q.y, theme.selected, 1.5);
  line(ctx, view, Q.x, Q.y, P.x, P.y, theme.selected, 1, [2, 3]);
  line(ctx, view, 0, 0, P.x, P.y, theme.lagrange, 1.5);

  angleArc(ctx, view, C.x, 0, 26, 0, M, theme.route, 1.5);
  angleArc(ctx, view, C.x, 0, 34, 0, E, theme.selected, 1.5);
  angleArc(ctx, view, 0, 0, 20, 0, nu, theme.lagrange, 1.5);

  dot(ctx, view, Mpt.x, Mpt.y, 4, theme.route);
  dot(ctx, view, Q.x, Q.y, 3, theme.selected);
  dot(ctx, view, C.x, 0, 2.5, theme.text);
  dot(ctx, view, 0, 0, 6, theme.sun);
  dot(ctx, view, P.x, P.y, 5, theme.text);
  ring(ctx, view, P.x, P.y, 9, theme.text, 1);

  label(ctx, view, C.x, 0, 'C', theme.text, -6, -12, 'right');
  label(ctx, view, 0, 0, 'F', theme.sun, 0, -16, 'center');
  label(ctx, view, 1 - e, 0, 'periapsis', '#8899aa', 4, -10);
  label(ctx, view, Mpt.x, Mpt.y, 'M', theme.route, 8, 8);
  label(ctx, view, P.x, P.y, 'body', theme.text, 12, -12);

  const steps = newtonTrace(M, e, true).length - 1;
  document.getElementById('readoutA').textContent =
    'M = ' + deg(M).toFixed(1).padStart(5) + ' deg    E = ' + deg(E).toFixed(1).padStart(5) +
    ' deg    nu = ' + deg(nu).toFixed(1).padStart(5) + ' deg    r/a = ' + (1 - e * Math.cos(E)).toFixed(4) +
    '    Newton iterations: ' + steps;
});

// ---- Figure 2: M(E) and the Newton iterations ----

const figB = setupFigure(document.getElementById('figSolve'), 0.62, function (fig) {
  const ctx = fig.ctx, e = state.e, M = wrap2pi(state.M);
  clear(fig, theme);
  // Plot space: x = E, y = M, both 0..2pi. Extra room left/below for axes.
  const view = fitView(fig, -0.55, TWO_PI + 0.1, -0.5, TWO_PI + 0.1, 10);

  for (let k = 0; k <= 4; k++) {
    const v = k * Math.PI / 2;
    line(ctx, view, v, 0, v, TWO_PI, '#141c28', 1);
    line(ctx, view, 0, v, TWO_PI, v, '#141c28', 1);
    label(ctx, view, v, 0, (k * 90) + '', '#8899aa', 0, -12, 'center');
    label(ctx, view, 0, v, (k * 90) + '', '#8899aa', -6, 0, 'right');
  }
  label(ctx, view, TWO_PI, 0, 'E (deg)', '#8899aa', -4, 14, 'right');
  label(ctx, view, 0, TWO_PI, 'M (deg)', '#8899aa', 6, -4, 'left');
  line(ctx, view, 0, 0, TWO_PI, TWO_PI, '#3a4d66', 1, [4, 4]);

  const curve = [];
  for (let i = 0; i <= 240; i++) {
    const E = TWO_PI * i / 240;
    curve.push({ x: E, y: E - e * Math.sin(E) });
  }
  polyline(ctx, view, curve, theme.selected, 2);
  line(ctx, view, 0, M, TWO_PI, M, theme.route, 1.5);

  const steps = newtonTrace(M, e, state.codeStart);
  for (let k = 0; k < steps.length - 1; k++) {
    const Ek = steps[k].E, Ek1 = steps[k + 1].E;
    const gk = Ek - e * Math.sin(Ek);
    line(ctx, view, Ek, M, Ek, gk, theme.lagrange, 1, [2, 3]);   // up/down to the curve
    line(ctx, view, Ek, gk, Ek1, M, theme.lagrange, 1.5);        // tangent to the target line
    dot(ctx, view, Ek, gk, 3, theme.lagrange);
    // Later steps land within a pixel or two of the root, so only the
    // first two guesses are labelled.
    if (k < 2) label(ctx, view, Ek, k === 0 ? gk : M, 'E' + k, theme.lagrange, 6, k === 0 ? 0 : -12);
  }
  const last = steps[steps.length - 1];
  dot(ctx, view, last.E, M, 4, theme.text);

  let html = '<tr><th>k</th><th>E_k (deg)</th><th>|E - e sin E - M|</th></tr>';
  steps.forEach(function (s, k) {
    html += '<tr><td>' + k + '</td><td>' + deg(s.E).toFixed(6) + '</td><td>' + Math.abs(s.residual).toExponential(2) + '</td></tr>';
  });
  html += '<tr><td>solveKepler</td><td>' + deg(solveKepler(M, e)).toFixed(6) + '</td><td></td></tr>';
  document.getElementById('iterTable').innerHTML = html;
});

// ---- Figure 3: equal-time sectors ----

const SECTOR_FILL = ['rgba(85,255,221,0.22)', 'rgba(85,255,221,0.07)'];

const figC = setupFigure(document.getElementById('figAreas'), 0.62, function (fig) {
  const ctx = fig.ctx, e = state.e, N = state.sectors;
  clear(fig, theme);
  const b = Math.sqrt(1 - e * e);
  const view = fitView(fig, -1 - e - 0.1, 1 - e + 0.1, -b - 0.1, b + 0.1, 14);

  const areas = [];
  for (let k = 0; k < N; k++) {
    const E0 = solveKepler(TWO_PI * k / N, e);
    let E1 = solveKepler(TWO_PI * (k + 1) / N, e);
    if (k === N - 1) E1 = TWO_PI;
    const pts = [{ x: 0, y: 0 }];
    for (let i = 0; i <= 60; i++) pts.push(bodyFromE(E0 + (E1 - E0) * i / 60, e));

    let area = 0;  // shoelace over the sampled sector polygon
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      area += p.x * q.y - q.x * p.y;
    }
    areas.push(Math.abs(area) / 2);

    ctx.fillStyle = SECTOR_FILL[k % 2];
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(view.sx(p.x), view.sy(p.y)); else ctx.lineTo(view.sx(p.x), view.sy(p.y)); });
    ctx.closePath();
    ctx.fill();
    line(ctx, view, 0, 0, pts[1].x, pts[1].y, 'rgba(85,255,221,0.35)', 1);
    dot(ctx, view, pts[1].x, pts[1].y, 3, theme.text);
  }
  polyline(ctx, view, ellipsePoints(e, 240), '#5f7a99', 1.5);
  dot(ctx, view, 0, 0, 6, theme.sun);

  const expected = Math.PI * b / N;
  const minA = Math.min.apply(null, areas), maxA = Math.max.apply(null, areas);
  document.getElementById('readoutC').textContent =
    'sector area (a = 1): min ' + minA.toFixed(5) + '   max ' + maxA.toFixed(5) +
    '   pi a b / N = ' + expected.toFixed(5) +
    '\nspeed ratio periapsis / apoapsis = (1 + e) / (1 - e) = ' + ((1 + e) / (1 - e)).toFixed(3);
});

// ---- controls ----

function redrawAll() { figA.redraw(); figB.redraw(); figC.redraw(); }

const setE = bindShared('ctlE', state.e, function (v) { return v.toFixed(3); }, function (v) {
  state.e = v; redrawAll();
});
const setM = bindShared('ctlM', deg(state.M), function (v) { return v.toFixed(1) + ' deg'; }, function (v) {
  state.M = v * Math.PI / 180; figA.redraw(); figB.redraw();
});

const nInput = document.getElementById('ctlN');
function setN() {
  state.sectors = parseInt(nInput.value, 10);
  nInput.parentNode.querySelector('output').textContent = state.sectors;
  figC.redraw();
}
nInput.addEventListener('input', setN);
setN();

// Presets read the real eccentricities from the map's data.
const PRESETS = [
  ['Earth', 'solar-system', 'earth'],
  ['Mercury', 'solar-system', 'mercury'],
  ['Pluto', 'solar-system', 'pluto'],
  ['Nereid', 'neptunian-system', 'nereid']
];
const presetBox = document.getElementById('presetsA');
PRESETS.forEach(function (p) {
  const sys = RAW_SYSTEMS[p[1]];
  const body = sys && sys.bodies[p[2]];
  if (!body) return;
  const btn = document.createElement('button');
  btn.textContent = p[0] + ' ' + body.e.toFixed(3);
  btn.addEventListener('click', function () { setE(body.e, null); });
  presetBox.appendChild(btn);
});
presetBox.classList.add('controls');
presetBox.style.margin = '0';

const playBtns = Array.prototype.slice.call(document.querySelectorAll('.playBtn'));
function setPlaying(p) {
  state.playing = p;
  playBtns.forEach(function (b) { b.textContent = p ? 'Pause' : 'Play'; });
}
playBtns.forEach(function (b) { b.addEventListener('click', function () { setPlaying(!state.playing); }); });

const startBtn = document.getElementById('startModeBtn');
startBtn.addEventListener('click', function () {
  state.codeStart = !state.codeStart;
  startBtn.textContent = state.codeStart ? 'start: as code' : 'start: E0 = M';
  figB.redraw();
});

// Animation runs only while a figure is on screen, and stops if the
// reader prefers reduced motion.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduceMotion) setPlaying(false);
const visible = new Set();
const visibilityObserver = new IntersectionObserver(function (entries) {
  entries.forEach(function (en) { if (en.isIntersecting) visible.add(en.target); else visible.delete(en.target); });
});
[figA.canvas, figB.canvas].forEach(function (c) { visibilityObserver.observe(c); });

let lastMs = performance.now();
function tick(nowMs) {
  const dt = (nowMs - lastMs) / 1000;
  lastMs = nowMs;
  if (state.playing && visible.size > 0) {
    // Advance M uniformly: this is the point of the mean anomaly.
    setM(deg(wrap2pi(state.M + TWO_PI * dt / SECONDS_PER_ORBIT)).toFixed(2), null);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
