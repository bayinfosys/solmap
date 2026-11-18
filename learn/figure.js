// Shared canvas helpers for the explainer pages. Same handedness as the
// map (render/render.js drawMap): world +y is drawn UP the screen, so
// angles increase anticlockwise. All drawing helpers take WORLD
// coordinates and convert to screen pixels internally; text is always
// drawn in screen space, so it never needs counter-flipping.

export function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = function (name) { return cs.getPropertyValue(name).trim(); };
  return {
    bg: v('--color-bg'), text: v('--color-text'), selected: v('--color-selected'),
    lagrange: v('--color-lagrange'), orbit: v('--color-orbit'), sun: v('--color-sun'),
    route: v('--color-route')
  };
}

// Sizes the canvas backing store to its CSS width times devicePixelRatio,
// at a fixed aspect ratio, and calls draw(fig) whenever the size changes.
// fig.w / fig.h are CSS pixels; fig.ctx is pre-scaled so callers draw
// in CSS pixels throughout.
export function setupFigure(canvas, aspect, draw) {
  const fig = { canvas: canvas, ctx: canvas.getContext('2d'), w: 0, h: 0, draw: draw };
  function resize() {
    const w = canvas.clientWidth;
    const h = Math.round(w * aspect);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    fig.w = w; fig.h = h;
    fig.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(fig);
  }
  new ResizeObserver(resize).observe(canvas);
  // Redraw requests before the first layout (w = 0) are ignored; the
  // ResizeObserver callback draws once the canvas has a size.
  fig.redraw = function () { if (fig.w > 0) draw(fig); };
  return fig;
}

// Fits the world rectangle [xMin,xMax] x [yMin,yMax] into the figure with
// equal x/y scale and a pixel margin. Returns a view with conversions.
export function fitView(fig, xMin, xMax, yMin, yMax, marginPx) {
  const m = marginPx || 16;
  const s = Math.min((fig.w - 2 * m) / (xMax - xMin), (fig.h - 2 * m) / (yMax - yMin));
  const cx = fig.w / 2 - s * (xMin + xMax) / 2;
  const cy = fig.h / 2 + s * (yMin + yMax) / 2;
  return {
    scale: s,
    sx: function (x) { return cx + x * s; },
    sy: function (y) { return cy - y * s; },
    wx: function (px) { return (px - cx) / s; },
    wy: function (py) { return (cy - py) / s; }
  };
}

export function clear(fig, theme) {
  fig.ctx.fillStyle = theme.bg;
  fig.ctx.fillRect(0, 0, fig.w, fig.h);
}

export function polyline(ctx, view, pts, color, widthPx, dash) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx || 1;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const X = view.sx(pts[i].x), Y = view.sy(pts[i].y);
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  ctx.stroke();
  ctx.restore();
}

export function line(ctx, view, x0, y0, x1, y1, color, widthPx, dash) {
  polyline(ctx, view, [{ x: x0, y: y0 }, { x: x1, y: y1 }], color, widthPx, dash);
}

export function dot(ctx, view, x, y, radiusPx, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(view.sx(x), view.sy(y), radiusPx, 0, 2 * Math.PI);
  ctx.fill();
}

export function ring(ctx, view, x, y, radiusPx, color, widthPx) {
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx || 1;
  ctx.beginPath();
  ctx.arc(view.sx(x), view.sy(y), radiusPx, 0, 2 * Math.PI);
  ctx.stroke();
}

export function diamond(ctx, view, x, y, sizePx, color) {
  const X = view.sx(x), Y = view.sy(y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(X, Y - sizePx); ctx.lineTo(X + sizePx, Y); ctx.lineTo(X, Y + sizePx); ctx.lineTo(X - sizePx, Y);
  ctx.closePath();
  ctx.fill();
}

// World-radius circle (radius in world units, not pixels).
export function worldCircle(ctx, view, x, y, r, color, widthPx, dash) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx || 1;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.arc(view.sx(x), view.sy(y), r * view.scale, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

// Angle arc at (x, y) from angle a0 to a1 (radians, anticlockwise
// positive in world terms), drawn with a fixed pixel radius.
export function angleArc(ctx, view, x, y, radiusPx, a0, a1, color, widthPx) {
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx || 1.5;
  ctx.beginPath();
  // Screen y is flipped, so world angle a maps to screen angle -a.
  ctx.arc(view.sx(x), view.sy(y), radiusPx, -a0, -a1, a1 > a0);
  ctx.stroke();
}

// Text at a world point with a pixel offset (dx right, dy up).
export function label(ctx, view, x, y, text, color, dxPx, dyPx, align) {
  ctx.font = '12px monospace';
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, view.sx(x) + (dxPx || 0), view.sy(y) - (dyPx || 0));
}

export function deg(rad) { return rad * 180 / Math.PI; }

export function wrap2pi(a) {
  const t = 2 * Math.PI;
  return ((a % t) + t) % t;
}

// Keeps every <input class="NAME"> and its <output for=...> readouts in
// step, so the same quantity can have a slider under several figures.
export function bindShared(className, initial, format, onChange) {
  const inputs = Array.prototype.slice.call(document.querySelectorAll('input.' + className));
  function set(v, source) {
    inputs.forEach(function (el) {
      if (el !== source) el.value = v;
      const out = el.parentNode.querySelector('output');
      if (out) out.textContent = format(parseFloat(v));
    });
    onChange(parseFloat(v));
  }
  inputs.forEach(function (el) {
    el.addEventListener('input', function () { set(el.value, el); });
  });
  set(initial, null);
  return set;
}
