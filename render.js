const LOD_MIN_PX = 3;
const LABEL_MIN_FONT_PX = 9;
const LABEL_CULL_FONT_PX = 6;

function drawOrbitPath(ctx, a, e, omega, cumulativeScale) {
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

function drawSystem(ctx, systemId, t, cumulativeScale) {
  const sys = mapState.systems[systemId];
  if (!mapState.layers[sys.id]) return;

  for (const bodyId in sys.bodies) {
    const b = sys.bodies[bodyId];
    const st = ellipseState(b.a, b.e, b.omega, t, b.tp, sys.GM, b.direction);
    const isSelected = mapState.selected.systemId === systemId && mapState.selected.bodyId === bodyId;

    ctx.strokeStyle = isSelected ? '#5fd' : '#223';
    ctx.lineWidth = (isSelected ? 2 : 1) / cumulativeScale;
    drawOrbitPath(ctx, b.a, b.e, b.omega, cumulativeScale);

    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(st.x, st.y, b.drawR / cumulativeScale, 0, 2 * Math.PI);
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = '#5fd';
      ctx.lineWidth = 1.5 / cumulativeScale;
      ctx.beginPath();
      ctx.arc(st.x, st.y, (b.drawR + 5) / cumulativeScale, 0, 2 * Math.PI);
      ctx.stroke();
    }

    const naturalFontScreenPx = 10;
    if (naturalFontScreenPx >= LABEL_CULL_FONT_PX) {
      const screenFontPx = Math.max(LABEL_MIN_FONT_PX, naturalFontScreenPx);
      ctx.save();
      ctx.translate(st.x + 8 / cumulativeScale, st.y - 8 / cumulativeScale);
      ctx.scale(1 / cumulativeScale, 1 / cumulativeScale);
      ctx.fillStyle = isSelected ? '#5fd' : '#889';
      ctx.font = screenFontPx + 'px monospace';
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

function drawMap(ctx, w, h) {
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(mapState.camera.pxPerAU, mapState.camera.pxPerAU);
  ctx.translate(-mapState.camera.x, -mapState.camera.y);

  ctx.fillStyle = '#ffd35c';
  ctx.beginPath();
  ctx.arc(0, 0, 7 / mapState.camera.pxPerAU, 0, 2 * Math.PI);
  ctx.fill();

  drawSystem(ctx, 'sun', mapState.t, mapState.camera.pxPerAU);

  ctx.restore();
}
