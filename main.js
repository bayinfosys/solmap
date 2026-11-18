import { displayOptions } from './state/displayOptions.js';
import { mapState } from './state/state.js';
import { animSetValue, animSet, animGet, animGetTarget, advanceAnim } from './state/anim.js';
import { getSystemWorldOrigin, getSystemMaxOrbitRadius, getBodyWorldPosition } from './physics/worldpos.js';
import { dateToSimTime, simTimeToDate } from './core/epoch.js';
import { ellipseState, orbitalSpeed, orbitPeriodYears } from './core/orbits.js';
import { computeOrbitExtrema, formatDistanceAU, drawMap } from './render/render.js';
import { hillRadius } from './physics/lagrange.js';
import { computeRoute, KM_PER_SEC_PER_AU_PER_YEAR } from './physics/route.js';
import { setRoute, removeRoute, setRouteVisible } from './state/routeLibrary.js';

const MIN_ZOOM = 1e-4; // pxPerAU can never go below this - prevents a stuck-at-zero zoom

const canvas = document.getElementById('mainView');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resize);
resize();

let playing = true;
let daysPerRealMinute = parseFloat(document.getElementById('speedSelect').value);
let lastMs = performance.now();

// Set by watchLeg() - when non-null and playing, the frame loop pauses
// itself automatically once mapState.t reaches this value. Lets a
// route leg be "watched" (jump to its start date, resume, arrive and
// stop) rather than only ever eyeballing a static snapshot.
let watchUntilT = null;

const SELECTION_FADE_TAU_SEC = 0.15;
const ZOOM_SMOOTH_TAU_SEC = 0.25;
const PAN_SMOOTH_TAU_SEC = 0.25;

// Seed the zoom channel from the camera's actual starting value, snapped
// (no animation) - every later zoom change (wheel, jumpToSystem) just
// moves this channel's target and lets advanceAnim() do the easing.
animSetValue('camera:logZoom', Math.log(mapState.camera.pxPerAU), Math.log(mapState.camera.pxPerAU), ZOOM_SMOOTH_TAU_SEC);

// Elapsed SIMULATED PLAYBACK time, shown as a stopwatch - deliberately
// separate from mapState.t (which is absolute, epoch-relative sim time
// used for real dates). Only advances while playing. Resets to 0 on a
// date jump, since a jump starts a new "session" of watching this run.
// Never goes negative, since it only ever accumulates forward from 0.
let elapsedPlaybackYears = 0;

const infoPanel = document.getElementById('infoPanel');
const clockDisplay = document.getElementById('clockDisplay');
const missionInfo = document.getElementById('missionInfo');
const missionSelect = document.getElementById('missionSelect');
const activeRoutesEl = document.getElementById('activeRoutes');

for (const missionId in mapState.missions) {
  const opt = document.createElement('option');
  opt.value = missionId;
  opt.textContent = mapState.missions[missionId].name;
  missionSelect.appendChild(opt);
}

// Turns one waypoint's real orbital state into a plain {x, y, label}
// point in the same absolute AU frame drawRoute expects.
function worldPointFor(systemId, bodyId, t, label) {
  const pos = getBodyWorldPosition(systemId, bodyId, t);
  return { x: pos.x, y: pos.y, label: label };
}

function chordDistanceAU(pointA, pointB) {
  const dx = pointA.x - pointB.x, dy = pointA.y - pointB.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Bundles one waypoint-to-waypoint transition: the physics breakdown
// from computeRoute, plus the real elapsed time and map distance
// between the two points as drawn - both compared against the
// idealised figures in the UI, never merged into one number. Some
// fields (totalDeltaVKmS etc.) may be null - see computeRoute's
// primary-local case (e.g. Earth -> Moon) where a real figure isn't
// available yet.
function buildRouteSection(fromPoint, toPoint, fromLabel, toLabel, fromXY, toXY) {
  const result = computeRoute(fromPoint, toPoint);
  return {
    fromLabel: fromLabel,
    toLabel: toLabel,
    fromT: fromPoint.t,
    toT: toPoint.t,
    legs: result.legs,
    totalDeltaVKmS: result.totalDeltaVKmS,
    totalTransferTimeYears: result.totalTransferTimeYears,
    actualDurationYears: toPoint.t - fromPoint.t,
    chordAU: chordDistanceAU(fromXY, toXY)
  };
}

function renderRouteSections(title, sections) {
  let html = '<div class="missionName">' + title + '</div>';
  sections.forEach(function (section, idx) {
    html += '<div class="missionSection">';
    html += '<div class="missionSectionHeader">' + section.fromLabel + ' -> ' + section.toLabel +
      ' <button class="watchLegBtn" data-section-idx="' + idx + '">Watch</button></div>';

    html += '<ul class="missionLegs">';
    section.legs.forEach(function (leg) {
      if (leg.deltaVKmS === null || leg.deltaVKmS === undefined) {
        html += '<li class="missionLegUnavailable"><span class="missionLegLabel">' + leg.label + '</span><span class="missionLegValue">' + (leg.note || 'not yet computable') + '</span></li>';
        return;
      }
      const tierClass = leg.tier === 'local-capture' ? 'missionLegLocal'
        : leg.tier === 'primary-local-transfer' ? 'missionLegPrimaryLocal'
        : 'missionLegHeliocentric';
      html += '<li class="' + tierClass + '">' +
        '<span class="missionLegLabel">' + leg.label + '</span>' +
        '<span class="missionLegValue">' + leg.deltaVKmS.toFixed(2) + ' km/s (dep ' + leg.departureBurnKmS.toFixed(2) + ' / arr ' + leg.arrivalBurnKmS.toFixed(2) + ')</span>' +
        '</li>';
    });
    html += '</ul>';

    if (section.totalDeltaVKmS !== null && section.totalDeltaVKmS !== undefined) {
      html += '<div class="missionTotal">Leg total: ' + section.totalDeltaVKmS.toFixed(2) + ' km/s</div>';
    }
    if (section.totalTransferTimeYears !== null && section.totalTransferTimeYears !== undefined) {
      html += '<div class="missionMeta">Idealised transfer time: ' + (section.totalTransferTimeYears * 365.25).toFixed(0) + ' days'
        + ' — actual: ' + (section.actualDurationYears * 365.25).toFixed(0) + ' days</div>';
    } else {
      html += '<div class="missionMeta">Actual duration: ' + (section.actualDurationYears * 365.25).toFixed(0) + ' days</div>';
    }
    html += '<div class="missionMeta">Straight-line map distance: ' + section.chordAU.toFixed(3) + ' AU</div>';
    html += '</div>';
  });
  missionInfo.innerHTML = html;

  const buttons = missionInfo.querySelectorAll('.watchLegBtn');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function () {
      const idx = parseInt(this.getAttribute('data-section-idx'), 10);
      watchLeg(sections[idx].fromT, sections[idx].toT);
    });
  }
}

function renderActiveRoutesList() {
  const entries = mapState.currentRoutes.entries;
  const ids = Object.keys(entries);
  if (ids.length === 0) {
    activeRoutesEl.innerHTML = 'No routes displayed.';
    return;
  }
  let html = '<div class="missionName">Displayed routes</div><ul class="missionLegs">';
  ids.forEach(function (id) {
    const r = entries[id];
    html += '<li class="routeToggleRow">' +
      '<label style="display:flex;align-items:center;gap:4px;">' +
      '<input type="checkbox" data-route-id="' + id + '" ' + (r.visible ? 'checked' : '') + '>' +
      '<span style="color:' + r.color + ';">' + r.label + '</span>' +
      '</label>' +
      '<button data-remove-id="' + id + '">remove</button>' +
      '</li>';
  });
  html += '</ul>';
  activeRoutesEl.innerHTML = html;

  const checks = activeRoutesEl.querySelectorAll('input[data-route-id]');
  for (let i = 0; i < checks.length; i++) {
    checks[i].addEventListener('change', function () {
      setRouteVisible(mapState.currentRoutes, this.getAttribute('data-route-id'), this.checked);
    });
  }
  const removes = activeRoutesEl.querySelectorAll('button[data-remove-id]');
  for (let i = 0; i < removes.length; i++) {
    removes[i].addEventListener('click', function () {
      removeRoute(mapState.currentRoutes, this.getAttribute('data-remove-id'));
      renderActiveRoutesList();
    });
  }
}

function renderMissionRoute(missionId) {
  const mission = mapState.missions[missionId];
  const waypoints = mission.waypoints;

  const points = waypoints.map(function (wp) {
    const bodyName = mapState.systems[wp.systemId].bodies[wp.bodyId].name;
    return worldPointFor(wp.systemId, wp.bodyId, wp.t, bodyName + ' (' + wp.date + ')');
  });
  setRoute(mapState.currentRoutes, missionId, mission.name, points);
  renderActiveRoutesList();

  const sections = [];
  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1], to = waypoints[i];
    const fromName = mapState.systems[from.systemId].bodies[from.bodyId].name;
    const toName = mapState.systems[to.systemId].bodies[to.bodyId].name;
    sections.push(buildRouteSection(
      { systemId: from.systemId, bodyId: from.bodyId, t: from.t },
      { systemId: to.systemId, bodyId: to.bodyId, t: to.t },
      fromName + ' (' + from.date + ')', toName + ' (' + to.date + ')',
      points[i - 1], points[i]
    ));
  }
  renderRouteSections(mission.name, sections);
}

missionSelect.addEventListener('change', function (e) {
  if (!e.target.value) return;
  renderMissionRoute(e.target.value);
});

document.getElementById('setFromBtn').addEventListener('click', function () {
  mapState.routePlanner.pendingRole = 'from';
});
document.getElementById('setToBtn').addEventListener('click', function () {
  mapState.routePlanner.pendingRole = 'to';
});

// Jumps to a leg's start date, resumes playback, and lets the frame
// loop auto-pause once mapState.t reaches the leg's end date - see
// watchUntilT in loop() below.
function watchLeg(fromT, toT) {
  mapState.t = fromT;
  elapsedPlaybackYears = 0;
  playing = true;
  document.getElementById('playBtn').textContent = 'Pause';
  watchUntilT = toT;
  lastMs = performance.now();
}

document.getElementById('jumpDateBtn').addEventListener('click', function () {
  const val = document.getElementById('dateJump').value;
  if (!val) return;
  mapState.t = dateToSimTime(new Date(val + 'T12:00:00Z'));
  elapsedPlaybackYears = 0;
});

document.getElementById('jumpNowBtn').addEventListener('click', function () {
  mapState.t = dateToSimTime(new Date());
  elapsedPlaybackYears = 0;
});

document.getElementById('speedSelect').addEventListener('change', function (e) {
  daysPerRealMinute = parseFloat(e.target.value);
});

document.getElementById('playBtn').addEventListener('click', function (e) {
  playing = !playing;
  e.target.textContent = playing ? 'Pause' : 'Play';
  lastMs = performance.now();
});

document.getElementById('resetViewBtn').addEventListener('click', function () {
  jumpToSystem('solar-system');
});

document.getElementById('hillshadeToggle').addEventListener('change', function (e) {
  displayOptions.hillshade = e.target.checked;
});
document.getElementById('histToggle').addEventListener('change', function (e) {
  displayOptions.hillshadeHistogram = e.target.checked;
});
document.getElementById('residualToggle').addEventListener('change', function (e) {
  displayOptions.hillshadeResidual = e.target.checked;
});
document.getElementById('lagrangeGlobalToggle').addEventListener('change', function (e) {
  displayOptions.lagrangeEnabled = e.target.checked;
});

// Eases both pan (camera:offsetX/Y chasing 0) and zoom (camera:logZoom -
// log-space, since zoom reads naturally as a ratio, not a difference).
function jumpToSystem(systemId) {
  const originAtJump = getSystemWorldOrigin(systemId, mapState.t);
  const startOffsetX = mapState.camera.x - originAtJump.x;
  const startOffsetY = mapState.camera.y - originAtJump.y;

  mapState.trackedSystemId = systemId;
  animSetValue('camera:offsetX', startOffsetX, 0, PAN_SMOOTH_TAU_SEC);
  animSetValue('camera:offsetY', startOffsetY, 0, PAN_SMOOTH_TAU_SEC);

  const maxR = getSystemMaxOrbitRadius(systemId);
  const targetPx = Math.min(canvas.width, canvas.height) * 0.35;
  let targetZoom = (maxR > 0 && targetPx > 0) ? targetPx / maxR : mapState.camera.pxPerAU;
  targetZoom = Math.max(MIN_ZOOM, targetZoom);
  animSet('camera:logZoom', Math.log(targetZoom), ZOOM_SMOOTH_TAU_SEC);
}

function selectBody(systemId, bodyId) {
  const newKey = systemId + ':' + bodyId;
  const prevKey = (mapState.selected.systemId && mapState.selected.bodyId)
    ? mapState.selected.systemId + ':' + mapState.selected.bodyId : null;
  if (prevKey && prevKey !== newKey) animSet('selection:' + prevKey, 0, SELECTION_FADE_TAU_SEC);
  animSet('selection:' + newKey, 1, SELECTION_FADE_TAU_SEC, 0); // 0 = fade in from nothing, not a snap

  mapState.selected.systemId = systemId;
  mapState.selected.bodyId = bodyId;
  const sys = mapState.systems[systemId];
  const body = sys.bodies[bodyId];
  const wikiName = body.name.replace(/ /g, '_');
  const periodYears = orbitPeriodYears(body.a, sys.GM);

  const facts = [];
  facts.push(['Semi-major axis', body.a.toFixed(6) + ' AU']);
  facts.push(['Eccentricity', body.e.toFixed(4)]);
  facts.push(['Orbital period', periodYears.toFixed(3) + ' yr']);

  if (body.massRatio !== undefined) {
    const omega = body.omegaBase + body.omegaDotRadPerYear * mapState.t;
    const extrema = computeOrbitExtrema(body.a, body.e, omega);
    const rH = hillRadius(body.a, body.massRatio);
    facts.push(['Periapsis', formatDistanceAU(extrema.periapsis.r)]);
    facts.push(['Apoapsis', formatDistanceAU(extrema.apoapsis.r)]);
    facts.push(['Hill radius', formatDistanceAU(rH)]);
  }

  const st = ellipseState(body.a, body.e, body.omegaBase, body.omegaDotRadPerYear, mapState.t, body.tp, sys.GM, body.direction);
  const speedAUyr = orbitalSpeed(st.r, body.a, sys.GM);
  facts.push(['Current speed', (speedAUyr * KM_PER_SEC_PER_AU_PER_YEAR).toFixed(3) + ' km/s']);

  if (body.massKg !== undefined) facts.push(['Mass', body.massKg.toExponential(3) + ' kg']);
  if (body.radiusKm !== undefined) facts.push(['Radius', body.radiusKm.toLocaleString() + ' km']);

  let html = '<div class="infoName">' + body.name + '</div><ul class="infoList">';
  facts.forEach(function (f) {
    html += '<li><span class="infoLabel">' + f[0] + '</span><span class="infoValue">' + f[1] + '</span></li>';
  });
  html += '</ul><a href="https://en.wikipedia.org/wiki/' + wikiName + '" target="_blank" rel="noopener">Wikipedia</a>';
  infoPanel.innerHTML = html;

  const rows = document.querySelectorAll('.bodyRow');
  for (let i = 0; i < rows.length; i++) {
    const match = rows[i].getAttribute('data-sys') === systemId && rows[i].getAttribute('data-body') === bodyId;
    rows[i].classList.toggle('selected', match);
  }
}

function jumpToBody(systemId, bodyId) {
  selectBody(systemId, bodyId);
  mapState.trackedSystemId = systemId;
  animSetValue('camera:offsetX', 0, 0, PAN_SMOOTH_TAU_SEC);
  animSetValue('camera:offsetY', 0, 0, PAN_SMOOTH_TAU_SEC);
}

let dragging = false, lastDragX = 0, lastDragY = 0;
canvas.addEventListener('mousedown', function (e) {
  dragging = true; lastDragX = e.clientX; lastDragY = e.clientY;
  // Freeze any in-flight pan animation at its current position, so a
  // drag started mid-transition doesn't fight the eased motion.
  const ox = animGet('camera:offsetX', 0), oy = animGet('camera:offsetY', 0);
  animSetValue('camera:offsetX', ox, ox, PAN_SMOOTH_TAU_SEC);
  animSetValue('camera:offsetY', oy, oy, PAN_SMOOTH_TAU_SEC);
});
window.addEventListener('mouseup', function () { dragging = false; });
window.addEventListener('mousemove', function (e) {
  if (!dragging) return;
  // Screen +y is down, world +y is up (see render.js drawMap), so the
  // vertical drag delta has the opposite sign to the horizontal one.
  const dx = (e.clientX - lastDragX) / mapState.camera.pxPerAU;
  const dy = (e.clientY - lastDragY) / mapState.camera.pxPerAU;
  if (mapState.trackedSystemId) {
    // Direct manipulation - set value AND target together so there's no
    // lag or residual chase while the user is actively dragging.
    const newX = animGet('camera:offsetX', 0) - dx;
    const newY = animGet('camera:offsetY', 0) + dy;
    animSetValue('camera:offsetX', newX, newX, PAN_SMOOTH_TAU_SEC);
    animSetValue('camera:offsetY', newY, newY, PAN_SMOOTH_TAU_SEC);
  } else {
    mapState.camera.x -= dx;
    mapState.camera.y += dy;
  }
  lastDragX = e.clientX; lastDragY = e.clientY;
});

// Wheel only moves the zoom channel's TARGET, from the target's current
// value (not the live, still-animating value) - so repeated scroll
// ticks accumulate toward an ever-further goal rather than restarting
// from wherever the easing has currently reached.
canvas.addEventListener('wheel', function (e) {
  e.preventDefault();
  const currentTargetZoom = Math.exp(animGetTarget('camera:logZoom', Math.log(mapState.camera.pxPerAU)));
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const newTargetZoom = Math.max(MIN_ZOOM, currentTargetZoom * factor);
  animSet('camera:logZoom', Math.log(newTargetZoom), ZOOM_SMOOTH_TAU_SEC);
}, { passive: false });

function buildSidebar() {
  const el = document.getElementById('bodyList');
  let html = '';
  for (const sysId in mapState.systems) {
    const sys = mapState.systems[sysId];
    html += '<div class="sysHeader" data-sys="' + sysId + '">' + sysId + '</div>';
    for (const bodyId in sys.bodies) {
      html += '<div class="bodyRow" data-sys="' + sysId + '" data-body="' + bodyId + '">' + sys.bodies[bodyId].name + '</div>';
    }
  }
  el.innerHTML = html;

  const rows = el.querySelectorAll('.bodyRow');
  for (let i = 0; i < rows.length; i++) {
    rows[i].addEventListener('click', function () {
      const sysId = this.getAttribute('data-sys');
      const bodyId = this.getAttribute('data-body');
      const rp = mapState.routePlanner;

      if (rp.pendingRole === 'from') {
        rp.fromSystemId = sysId; rp.fromBodyId = bodyId; rp.fromT = mapState.t;
        rp.pendingRole = null;
      } else if (rp.pendingRole === 'to') {
        rp.toSystemId = sysId; rp.toBodyId = bodyId; rp.toT = mapState.t;
        rp.pendingRole = null;
      } else {
        jumpToBody(sysId, bodyId);
        return;
      }

      if (rp.fromSystemId && rp.toSystemId) {
        const fromName = mapState.systems[rp.fromSystemId].bodies[rp.fromBodyId].name;
        const toName = mapState.systems[rp.toSystemId].bodies[rp.toBodyId].name;
        const fromXY = worldPointFor(rp.fromSystemId, rp.fromBodyId, rp.fromT, fromName);
        const toXY = worldPointFor(rp.toSystemId, rp.toBodyId, rp.toT, toName);

        setRoute(mapState.currentRoutes, 'manual', fromName + ' -> ' + toName, [fromXY, toXY]);
        renderActiveRoutesList();

        const section = buildRouteSection(
          { systemId: rp.fromSystemId, bodyId: rp.fromBodyId, t: rp.fromT },
          { systemId: rp.toSystemId, bodyId: rp.toBodyId, t: rp.toT },
          fromName, toName, fromXY, toXY
        );
        renderRouteSections(fromName + ' -> ' + toName, [section]);
      }
    });
  }

  const headers = el.querySelectorAll('.sysHeader');
  for (let i = 0; i < headers.length; i++) {
    headers[i].addEventListener('click', function () {
      jumpToSystem(this.getAttribute('data-sys'));
    });
  }
}
buildSidebar();

// Formats a small elapsed-time value (years) as a HH:MM:SS stopwatch.
// Only ever called on elapsedPlaybackYears, which is >= 0 by
// construction, so no negative-input handling is needed here.
function formatClock(tYears) {
  const totalSeconds = tYears * 365.25 * 24 * 3600;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return 'T+' + pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
}

function loop(nowMs) {
  const deltaMs = nowMs - lastMs;
  lastMs = nowMs;

  advanceAnim(deltaMs);

  mapState.camera.pxPerAU = Math.max(MIN_ZOOM, Math.exp(animGet('camera:logZoom', Math.log(mapState.camera.pxPerAU))));

  if (playing) {
    const dYears = (daysPerRealMinute * (deltaMs / 60000)) / 365.25;
    mapState.t += dYears;
    elapsedPlaybackYears += dYears;

    if (watchUntilT !== null && mapState.t >= watchUntilT) {
      mapState.t = watchUntilT;
      playing = false;
      watchUntilT = null;
      document.getElementById('playBtn').textContent = 'Play';
    }
  }

  if (mapState.trackedSystemId) {
    const origin = getSystemWorldOrigin(mapState.trackedSystemId, mapState.t);
    mapState.camera.x = origin.x + animGet('camera:offsetX', 0);
    mapState.camera.y = origin.y + animGet('camera:offsetY', 0);
  }

  clockDisplay.textContent = simTimeToDate(mapState.t).toISOString().slice(0, 10) + '  ' + formatClock(elapsedPlaybackYears);

  drawMap(ctx, canvas.width, canvas.height);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
