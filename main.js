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

let cameraAnim = null;
let trackedSystemId = null;
let trackOffsetX = 0;
let trackOffsetY = 0;

const infoPanel = document.getElementById('infoPanel');
const clockDisplay = document.getElementById('clockDisplay');

document.getElementById('speedSelect').addEventListener('change', function (e) {
  daysPerRealMinute = parseFloat(e.target.value);
});

document.getElementById('playBtn').addEventListener('click', function (e) {
  playing = !playing;
  e.target.textContent = playing ? 'Pause' : 'Play';
  lastMs = performance.now();
});

document.getElementById('resetViewBtn').addEventListener('click', function () {
  jumpToSystem('sun');
});

function animateZoomTo(targetZoom, durationMs) {
  cameraAnim = {
    startZoom: mapState.camera.pxPerAU, targetZoom: targetZoom,
    startMs: performance.now(), durationMs: durationMs || 1200
  };
}

function jumpToSystem(systemId) {
  trackedSystemId = systemId;
  trackOffsetX = 0;
  trackOffsetY = 0;
  const maxR = getSystemMaxOrbitRadius(systemId);
  const targetPx = Math.min(canvas.width, canvas.height) * 0.35;
  const targetZoom = maxR > 0 ? targetPx / maxR : mapState.camera.pxPerAU;
  animateZoomTo(targetZoom, 1200);
}

function selectBody(systemId, bodyId) {
  mapState.selected.systemId = systemId;
  mapState.selected.bodyId = bodyId;
  const body = mapState.systems[systemId].bodies[bodyId];
  const wikiName = body.name.replace(/ /g, '_');
  infoPanel.innerHTML =
    '<strong>' + body.name + '</strong><br>' +
    'a = ' + body.a.toFixed(6) + ' AU, e = ' + body.e.toFixed(4) + '<br>' +
    '<a href="https://en.wikipedia.org/wiki/' + wikiName + '" target="_blank" rel="noopener">Wikipedia</a>';

  const rows = document.querySelectorAll('.bodyRow');
  for (let i = 0; i < rows.length; i++) {
    const match = rows[i].getAttribute('data-sys') === systemId && rows[i].getAttribute('data-body') === bodyId;
    rows[i].classList.toggle('selected', match);
  }
}

function jumpToBody(systemId, bodyId) {
  selectBody(systemId, bodyId);
  const child = getChildSystems(systemId).filter(function (s) { return s.originBodyId === bodyId; })[0];
  if (child) {
    jumpToSystem(child.id);
    return;
  }
  trackedSystemId = systemId;
  trackOffsetX = 0;
  trackOffsetY = 0;
}

let dragging = false, lastDragX = 0, lastDragY = 0;
canvas.addEventListener('mousedown', function (e) {
  dragging = true; lastDragX = e.clientX; lastDragY = e.clientY;
  cameraAnim = null;
});
window.addEventListener('mouseup', function () { dragging = false; });
window.addEventListener('mousemove', function (e) {
  if (!dragging) return;
  const dx = (e.clientX - lastDragX) / mapState.camera.pxPerAU;
  const dy = (e.clientY - lastDragY) / mapState.camera.pxPerAU;
  if (trackedSystemId) {
    trackOffsetX -= dx;
    trackOffsetY -= dy;
  } else {
    mapState.camera.x -= dx;
    mapState.camera.y -= dy;
  }
  lastDragX = e.clientX; lastDragY = e.clientY;
});
canvas.addEventListener('wheel', function (e) {
  e.preventDefault();
  cameraAnim = null;
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  mapState.camera.pxPerAU *= factor;
}, { passive: false });

function buildSidebar() {
  const el = document.getElementById('bodyList');
  let html = '';
  for (const sysId in mapState.systems) {
    const sys = mapState.systems[sysId];
    html += '<div class="sysHeader" data-sys="' + sysId + '">' + sysId +
      ' <input type="checkbox" data-layer="' + sysId + '"' + (mapState.layers[sysId] ? ' checked' : '') + '></div>';
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
    headers[i].addEventListener('click', function (e) {
      if (e.target.tagName === 'INPUT') return;
      jumpToSystem(this.getAttribute('data-sys'));
    });
  }
  const boxes = el.querySelectorAll('input[data-layer]');
  for (let i = 0; i < boxes.length; i++) {
    boxes[i].addEventListener('change', function () {
      mapState.layers[this.getAttribute('data-layer')] = this.checked;
    });
  }
}
buildSidebar();

// "Earth clock" - a stopwatch of total simulated elapsed time, NOT a real
// date (per your note, no absolute epoch is tracked). Rolls past 24h
// freely rather than wrapping, since there's no day-boundary meaning here.
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

  if (cameraAnim) {
    const p = Math.min(1, (nowMs - cameraAnim.startMs) / cameraAnim.durationMs);
    mapState.camera.pxPerAU = cameraAnim.startZoom + (cameraAnim.targetZoom - cameraAnim.startZoom) * p;
    if (p >= 1) cameraAnim = null;
  }
  if (playing) mapState.t += (daysPerRealMinute * (deltaMs / 60000)) / 365.25;

  if (trackedSystemId) {
    const origin = getSystemWorldOrigin(trackedSystemId, mapState.t);
    mapState.camera.x = origin.x + trackOffsetX;
    mapState.camera.y = origin.y + trackOffsetY;
  }

  clockDisplay.textContent = formatClock(mapState.t);

  drawMap(ctx, canvas.width, canvas.height);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
