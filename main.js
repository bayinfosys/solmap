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

let trackedSystemId = null;

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
  mapState.layers.hillshade = e.target.checked;
});

document.getElementById('histToggle').addEventListener('change', function (e) {
  mapState.layers.hillshadeHistogram = e.target.checked;
});

document.getElementById('residualToggle').addEventListener('change', function (e) {
  mapState.layers.hillshadeResidual = e.target.checked;
});

// Eases both pan (camera:offsetX/Y chasing 0) and zoom (camera:logZoom -
// log-space, since zoom reads naturally as a ratio, not a difference).
function jumpToSystem(systemId) {
  const originAtJump = getSystemWorldOrigin(systemId, mapState.t);
  const startOffsetX = mapState.camera.x - originAtJump.x;
  const startOffsetY = mapState.camera.y - originAtJump.y;

  trackedSystemId = systemId;
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
  const periodYears = computeOrbitPeriodYears(body.a, sys.GM);

  const facts = [];
  facts.push(['Semi-major axis', body.a.toFixed(6) + ' AU']);
  facts.push(['Eccentricity', body.e.toFixed(4)]);
  facts.push(['Orbital period', periodYears.toFixed(3) + ' yr']);

  if (body.massRatio !== undefined) {
    const extrema = computeOrbitExtrema(body.a, body.e, body.omega);
    const rH = hillRadius(body.a, body.massRatio);
    facts.push(['Periapsis', formatDistanceAU(extrema.periapsis.r)]);
    facts.push(['Apoapsis', formatDistanceAU(extrema.apoapsis.r)]);
    facts.push(['Hill radius', formatDistanceAU(rH)]);
  }

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
  trackedSystemId = systemId;
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
  const dx = (e.clientX - lastDragX) / mapState.camera.pxPerAU;
  const dy = (e.clientY - lastDragY) / mapState.camera.pxPerAU;
  if (trackedSystemId) {
    // Direct manipulation - set value AND target together so there's no
    // lag or residual chase while the user is actively dragging.
    const newX = animGet('camera:offsetX', 0) - dx;
    const newY = animGet('camera:offsetY', 0) - dy;
    animSetValue('camera:offsetX', newX, newX, PAN_SMOOTH_TAU_SEC);
    animSetValue('camera:offsetY', newY, newY, PAN_SMOOTH_TAU_SEC);
  } else {
    mapState.camera.x -= dx;
    mapState.camera.y -= dy;
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
      jumpToBody(this.getAttribute('data-sys'), this.getAttribute('data-body'));
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

document.getElementById('lagrangeGlobalToggle').addEventListener('change', function (e) {
  mapState.lagrangeEnabled = e.target.checked;
});

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
  }

  if (trackedSystemId) {
    const origin = getSystemWorldOrigin(trackedSystemId, mapState.t);
    mapState.camera.x = origin.x + animGet('camera:offsetX', 0);
    mapState.camera.y = origin.y + animGet('camera:offsetY', 0);
  }

  advancePrecession(mapState.t); // the "update" half of update/render

  clockDisplay.textContent = simTimeToDate(mapState.t).toISOString().slice(0, 10) + '  ' + formatClock(elapsedPlaybackYears);

  drawMap(ctx, canvas.width, canvas.height);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
