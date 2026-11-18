// Figures for the Lagrange points page. The map's approximations come
// from core/lagrange.js; mass ratios and moon orbits from data/systems.js.
// The exact collinear points and the test-particle integration are
// computed here, in normalised units: a = 1, G(M1 + m2) = 1, n = 1, so
// one orbit of the pair takes 2 pi time units.
//
// Coordinates: PRIMARY-CENTRED for everything drawn (primary at (0,0),
// secondary at (1,0)), matching the map, where each system's primary is
// its origin. The barycentre is at (mu, 0).

import { hillRadius, computeLagrangePoints } from '../../core/lagrange.js';
import { RAW_SYSTEMS, KM_PER_AU } from '../../data/systems.js';
import {
  readTheme, setupFigure, fitView, clear, polyline, dot, ring, diamond,
  worldCircle, label, bindShared
} from '../figure.js';

const theme = readTheme();
const MU_CRIT = (1 - Math.sqrt(23 / 27)) / 2;

const state = { q: 0.0123, offsetDeg: 12, playing: true };

function muOf(q) { return q / (1 + q); }

// ---- effective potential (primary-centred) ----

function phi(x, y, mu) {
  const r1 = Math.sqrt(x * x + y * y);
  const r2 = Math.sqrt((x - 1) * (x - 1) + y * y);
  const bx = x - mu;
  return -(1 - mu) / r1 - mu / r2 - 0.5 * (bx * bx + y * y);
}

function phiGrad(x, y, mu) {
  const r1 = Math.sqrt(x * x + y * y), r2 = Math.sqrt((x - 1) * (x - 1) + y * y);
  const r13 = r1 * r1 * r1, r23 = r2 * r2 * r2;
  return {
    gx: (1 - mu) * x / r13 + mu * (x - 1) / r23 - (x - mu),
    gy: (1 - mu) * y / r13 + mu * y / r23 - y
  };
}

// Exact collinear points: roots of dPhi/dx on y = 0, one per interval.
function bisect(f, lo, hi) {
  let flo = f(lo);
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi), fm = f(mid);
    if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else { hi = mid; }
  }
  return 0.5 * (lo + hi);
}

function exactPoints(mu) {
  const fx = function (x) { return phiGrad(x, 0, mu).gx; };
  const eps = 1e-9;
  return {
    L1: { x: bisect(fx, eps, 1 - eps), y: 0 },
    L2: { x: bisect(fx, 1 + eps, 2.5), y: 0 },
    L3: { x: bisect(fx, -2.5, -eps), y: 0 },
    L4: { x: 0.5, y: Math.sqrt(3) / 2 },
    L5: { x: 0.5, y: -Math.sqrt(3) / 2 }
  };
}

const KEYS = ['L1', 'L2', 'L3', 'L4', 'L5'];

// ---- Figure 1: potential map ----

let potCache = null;   // offscreen image, rebuilt only when q or size changes

const figP = setupFigure(document.getElementById('figPotential'), 0.66, function (fig) {
  const ctx = fig.ctx, q = state.q, mu = muOf(q);
  const view = fitView(fig, -1.45, 1.55, -1.15, 1.15, 8);
  const exact = exactPoints(mu);
  const levels = [
    { v: phi(exact.L1.x, 0, mu), color: [85, 255, 221] },
    { v: phi(exact.L2.x, 0, mu), color: [255, 179, 71] },
    { v: phi(exact.L3.x, 0, mu), color: [255, 107, 107] }
  ];
  const top = phi(0.5, Math.sqrt(3) / 2, mu);   // L4/L5: the maxima

  const key = fig.w + 'x' + fig.h + ':' + q;
  if (!potCache || potCache.key !== key) {
    const W = Math.max(1, Math.round(fig.w)), H = Math.max(1, Math.round(fig.h));
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const octx = off.getContext('2d');
    const img = octx.createImageData(W, H);
    const pxWorld = 1 / view.scale;
    for (let j = 0; j < H; j++) {
      const y = view.wy(j + 0.5);
      for (let i = 0; i < W; i++) {
        const x = view.wx(i + 0.5);
        const v = phi(x, y, mu);
        // Tone: 0 at (top - 0.8), 1 at the L4/L5 hilltops.
        let t = (v - (top - 0.8)) / 0.8;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        let r = 8 + 120 * t * t, g = 12 + 130 * t * t, b = 22 + 150 * t * t;
        const gr = phiGrad(x, y, mu);
        const slopePx = Math.sqrt(gr.gx * gr.gx + gr.gy * gr.gy) * pxWorld;
        for (let k = 0; k < levels.length; k++) {
          if (Math.abs(v - levels[k].v) < 0.9 * slopePx) {
            r = levels[k].color[0]; g = levels[k].color[1]; b = levels[k].color[2];
          }
        }
        const o = (j * W + i) * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    potCache = { key: key, canvas: off };
  }
  clear(fig, theme);
  ctx.drawImage(potCache.canvas, 0, 0, fig.w, fig.h);

  worldCircle(ctx, view, 0, 0, 1, 'rgba(201,214,232,0.25)', 1, [3, 5]);
  const rH = hillRadius(1, q);
  worldCircle(ctx, view, 1, 0, rH, 'rgba(201,214,232,0.7)', 1, [4, 3]);
  dot(ctx, view, 0, 0, 6, theme.sun);
  dot(ctx, view, 1, 0, 4, '#8fb3ff');

  const approx = computeLagrangePoints({ r: 1, theta: 0 }, q, 1);
  KEYS.forEach(function (k) {
    ring(ctx, view, exact[k].x, exact[k].y, 6, '#ffffff', 1.5);
    diamond(ctx, view, approx[k].x, approx[k].y, 3.5, theme.lagrange);
    label(ctx, view, exact[k].x, exact[k].y, k, '#ffffff', 0, 14, 'center');
  });

  let html = '<tr><th>point</th><th>exact</th><th>map approximation</th><th>difference</th></tr>';
  KEYS.forEach(function (k) {
    const ex = Math.hypot(exact[k].x, exact[k].y);
    const ap = Math.hypot(approx[k].x, approx[k].y);
    const d = Math.hypot(exact[k].x - approx[k].x, exact[k].y - approx[k].y);
    html += '<tr><td>' + k + '</td><td>' + ex.toFixed(6) + '</td><td>' + ap.toFixed(6) +
      '</td><td>' + (d < 5e-7 ? 'exact' : (100 * d).toFixed(3) + ' % of a') + '</td></tr>';
  });
  html += '<tr><td>Hill radius</td><td colspan="3" style="text-align:left">' + rH.toFixed(6) +
    ' a   (q = ' + q.toPrecision(3) + ', mu = ' + mu.toPrecision(3) + ')</td></tr>';
  document.getElementById('pointTable').innerHTML = html;
});

// ---- Figure 2: Hill radii of the planets, log scale ----

function planetRows() {
  const rows = [];
  for (const sysId in RAW_SYSTEMS) {
    const sys = RAW_SYSTEMS[sysId];
    if (sys.parentSystemId !== 'solar-system') continue;
    const planet = RAW_SYSTEMS['solar-system'].bodies[sys.originBodyId];
    const aAU = planet.a !== undefined ? planet.a : planet.aKm / KM_PER_AU;
    const rHkm = hillRadius(aAU, planet.massRatio) * KM_PER_AU;
    const moons = [];
    for (const id in sys.bodies) {
      const m = sys.bodies[id];
      const aKm = m.aKm !== undefined ? m.aKm : m.a * KM_PER_AU;
      moons.push({ name: m.name, aKm: aKm, retro: m.direction === -1 });
    }
    moons.sort(function (p, q) { return p.aKm - q.aKm; });
    rows.push({ name: planet.name, aAU: aAU, rHkm: rHkm, moons: moons, charonLike: sys.originBodyId === 'pluto' });
  }
  rows.sort(function (p, q) { return p.aAU - q.aAU; });
  return rows;
}
const ROWS = planetRows();

const figH = setupFigure(document.getElementById('figHill'), 0.5, function (fig) {
  const ctx = fig.ctx;
  clear(fig, theme);
  const left = 78, right = fig.w - 34, top = 14, bottom = fig.h - 28;
  const lo = 3, hi = 9;   // log10 km
  const X = function (km) { return left + (Math.log10(km) - lo) / (hi - lo) * (right - left); };
  const rowH = (bottom - top) / ROWS.length;

  ctx.font = '11px monospace';
  ctx.textBaseline = 'middle';
  for (let p = lo; p <= hi; p++) {
    ctx.strokeStyle = '#141c28'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(Math.pow(10, p)), top); ctx.lineTo(X(Math.pow(10, p)), bottom); ctx.stroke();
    ctx.fillStyle = '#8899aa'; ctx.textAlign = 'center';
    ctx.fillText('1e' + p + ' km', X(Math.pow(10, p)), bottom + 14);
  }

  ROWS.forEach(function (row, i) {
    const yc = top + rowH * (i + 0.5);
    const barH = Math.min(14, rowH * 0.5);
    ctx.fillStyle = 'rgba(95,122,153,0.35)';
    ctx.fillRect(left, yc - barH / 2, X(row.rHkm) - left, barH);
    ctx.strokeStyle = '#5f7a99';
    ctx.strokeRect(left, yc - barH / 2, X(row.rHkm) - left, barH);
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = '#c9d6e8';
    ctx.beginPath(); ctx.moveTo(X(row.rHkm / 2), yc - barH / 2 - 3); ctx.lineTo(X(row.rHkm / 2), yc + barH / 2 + 3); ctx.stroke();
    ctx.restore();

    row.moons.forEach(function (m) {
      ctx.beginPath();
      ctx.arc(X(m.aKm), yc, 3.5, 0, 2 * Math.PI);
      if (m.retro) { ctx.strokeStyle = theme.selected; ctx.lineWidth = 1.5; ctx.stroke(); }
      else { ctx.fillStyle = theme.selected; ctx.fill(); }
    });
    ctx.fillStyle = theme.text; ctx.textAlign = 'right';
    ctx.fillText(row.name, left - 8, yc);
  });

  let html = '<tr><th>planet</th><th>Hill radius (km)</th><th>outermost moon on map</th><th>a / r_H</th></tr>';
  ROWS.forEach(function (row) {
    const outer = row.moons[row.moons.length - 1];
    html += '<tr><td>' + row.name + '</td><td>' + Math.round(row.rHkm).toLocaleString('en-GB') + '</td><td>' +
      outer.name + (outer.retro ? ' (retrograde)' : '') + '</td><td>' + (outer.aKm / row.rHkm).toFixed(3) + '</td></tr>';
  });
  document.getElementById('hillTable').innerHTML = html;
});

// ---- Figure 3: test particle near L4 ----
// Integrated in BARYCENTRIC rotating coordinates (the standard form of
// the equations), drawn primary-centred by adding mu to x.

function accel(x, y, vx, vy, mu) {
  const dx1 = x + mu, dx2 = x - 1 + mu;
  const r1 = Math.sqrt(dx1 * dx1 + y * y), r2 = Math.sqrt(dx2 * dx2 + y * y);
  const r13 = r1 * r1 * r1, r23 = r2 * r2 * r2;
  return {
    ax: 2 * vy + x - (1 - mu) * dx1 / r13 - mu * dx2 / r23,
    ay: -2 * vx + y - (1 - mu) * y / r13 - mu * y / r23
  };
}

function rk4(s, dt, mu) {
  function deriv(st) {
    const a = accel(st.x, st.y, st.vx, st.vy, mu);
    return { x: st.vx, y: st.vy, vx: a.ax, vy: a.ay };
  }
  function add(st, d, h) { return { x: st.x + d.x * h, y: st.y + d.y * h, vx: st.vx + d.vx * h, vy: st.vy + d.vy * h }; }
  const k1 = deriv(s), k2 = deriv(add(s, k1, dt / 2)), k3 = deriv(add(s, k2, dt / 2)), k4 = deriv(add(s, k3, dt));
  return {
    x: s.x + dt / 6 * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: s.y + dt / 6 * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    vx: s.vx + dt / 6 * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx),
    vy: s.vy + dt / 6 * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy)
  };
}

const DT = 0.004;
const STEPS_PER_FRAME = 150;   // about 6 orbits of the secondary per second at 60 fps
const TRAIL_SAMPLE = 8;
const TRAIL_MAX = 20000;
const sim = { s: null, t: 0, trail: [], status: '' };

function restartSim() {
  const mu = muOf(state.q);
  const ang = (60 + state.offsetDeg) * Math.PI / 180;
  // On the secondary's orbit about the primary, offset ahead of L4, at
  // rest in the rotating frame; converted to barycentric x.
  sim.s = { x: Math.cos(ang) - mu, y: Math.sin(ang), vx: 0, vy: 0 };
  sim.t = 0;
  sim.trail = [];
  sim.status = 'running';
}

function stepSim() {
  const mu = muOf(state.q);
  for (let i = 0; i < STEPS_PER_FRAME && sim.status === 'running'; i++) {
    sim.s = rk4(sim.s, DT, mu);
    sim.t += DT;
    // A fixed-step integrator is unreliable near either body, so the run
    // stops there instead of drawing a numerically meaningless slingshot.
    const r1 = Math.hypot(sim.s.x + mu, sim.s.y);
    const r2 = Math.hypot(sim.s.x - 1 + mu, sim.s.y);
    const r = Math.hypot(sim.s.x, sim.s.y);
    if (r1 < 0.05) sim.status = 'close approach to the primary: integration stopped';
    else if (r2 < 0.03) sim.status = 'close approach to the secondary: integration stopped';
    else if (r > 2.5) sim.status = 'escaped from the system';
    if (i % TRAIL_SAMPLE === 0) {
      sim.trail.push({ x: sim.s.x + mu, y: sim.s.y });
      if (sim.trail.length > TRAIL_MAX) sim.trail.shift();
    }
  }
}

const figT = setupFigure(document.getElementById('figTrojan'), 0.66, function (fig) {
  const ctx = fig.ctx, q = state.q, mu = muOf(q);
  clear(fig, theme);
  const view = fitView(fig, -1.35, 1.45, -1.25, 1.25, 8);
  worldCircle(ctx, view, 0, 0, 1, 'rgba(201,214,232,0.25)', 1, [3, 5]);
  dot(ctx, view, 0, 0, 6, theme.sun);
  dot(ctx, view, 1, 0, 4, '#8fb3ff');
  const pts = computeLagrangePoints({ r: 1, theta: 0 }, q, 1);
  KEYS.forEach(function (k) {
    diamond(ctx, view, pts[k].x, pts[k].y, 3, theme.lagrange);
    label(ctx, view, pts[k].x, pts[k].y, k, '#c9d6e8', 0, 12, 'center');
  });
  if (sim.trail.length > 1) polyline(ctx, view, sim.trail, 'rgba(255,179,71,0.75)', 1);
  if (sim.s) dot(ctx, view, sim.s.x + mu, sim.s.y, 4, theme.route);

  const stable = mu < MU_CRIT;
  document.getElementById('readoutTrojan').textContent =
    'mu = ' + mu.toPrecision(3) + (stable ? '  <  ' : '  >  ') + MU_CRIT.toFixed(5) +
    (stable ? '   L4/L5 linearly stable' : '   L4/L5 unstable') +
    '\nelapsed: ' + (sim.t / (2 * Math.PI)).toFixed(1) + ' orbits of the secondary   ' + sim.status;
});

// ---- controls ----

const setQ = bindShared('ctlQ', Math.log10(state.q), function (v) {
  return 'q = ' + Math.pow(10, v).toPrecision(3);
}, function (v) {
  state.q = Math.pow(10, v);
  figP.redraw();
  restartSim();
  figT.redraw();
});

const PRESETS = [
  ['Sun-Jupiter', 'solar-system', 'jupiter'],
  ['Saturn-Titan', 'saturnian-system', 'titan'],
  ['Earth-Moon', 'terran-system', 'moon'],
  ['Pluto-Charon', 'plutonian-system', 'charon']
];
document.querySelectorAll('.presetsQ').forEach(function (box) {
  PRESETS.forEach(function (p) {
    const body = RAW_SYSTEMS[p[1]] && RAW_SYSTEMS[p[1]].bodies[p[2]];
    if (!body) return;
    const btn = document.createElement('button');
    btn.textContent = p[0];
    btn.title = 'q = ' + body.massRatio;
    btn.addEventListener('click', function () { setQ(Math.log10(body.massRatio), null); });
    box.appendChild(btn);
  });
  const crit = document.createElement('button');
  crit.textContent = 'critical';
  crit.title = 'mu = 0.0385, the L4/L5 stability limit';
  crit.addEventListener('click', function () { setQ(Math.log10(MU_CRIT / (1 - MU_CRIT)), null); });
  box.appendChild(crit);
  box.classList.add('controls');
  box.style.margin = '0';
});

const offInput = document.getElementById('ctlOffset');
function setOffset() {
  state.offsetDeg = parseFloat(offInput.value);
  offInput.parentNode.querySelector('output').textContent = state.offsetDeg + ' deg';
  restartSim();
  figT.redraw();
}
offInput.addEventListener('input', setOffset);
setOffset();

const playBtn = document.getElementById('trojanPlay');
function setPlaying(p) { state.playing = p; playBtn.textContent = p ? 'Pause' : 'Play'; }
playBtn.addEventListener('click', function () { setPlaying(!state.playing); });
document.getElementById('trojanRestart').addEventListener('click', function () { restartSim(); figT.redraw(); });
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false);

let trojanVisible = false;
new IntersectionObserver(function (entries) {
  entries.forEach(function (en) { trojanVisible = en.isIntersecting; });
}).observe(figT.canvas);

function tick() {
  if (state.playing && trojanVisible && sim.status === 'running') {
    stepSim();
    figT.redraw();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
