// Converts one raw body definition + its system's GM into a runtime body
// object (real omega/tp/precession rate computed, links/name/etc passed
// through). This is the "load function" - systems.js stays pure data,
// everything here is the one place that does computation on it.
function buildBody(raw, GM) {
  const aAU = raw.aKm !== undefined ? raw.aKm / KM_PER_AU : raw.a;
  const k = keplerElementsFromEpochWithPrecession(
    raw.isMeanAnomaly ? raw.M0 : raw.L0,
    raw.omega0,
    aAU, GM, raw.papsisYears || 0, !!raw.isMeanAnomaly
  );
  const out = {
    a: aAU, e: raw.e,
    omegaBase: k.omega,        // fixed, epoch value - never mutated
    omega: k.omega,            // LIVE value - the physics step updates this every frame
    tp: k.tp,
    omegaDotRadPerYear: k.omegaDotRadPerYear,
    name: raw.name, color: raw.color, drawR: raw.drawR,
    massRatio: raw.massRatio, links: raw.links
  };
  if (raw.direction !== undefined) out.direction = raw.direction;
  return out;
}

function buildSystem(rawSystem) {
  const GM = rawSystem.GM !== undefined ? rawSystem.GM : SOLAR_GM * rawSystem.primaryMassRatio;
  const bodies = {};
  for (const bodyId in rawSystem.bodies) {
    bodies[bodyId] = buildBody(rawSystem.bodies[bodyId], GM);
  }
  return {
    id: rawSystem.id,
    parentSystemId: rawSystem.parentSystemId,
    originBodyId: rawSystem.originBodyId,
    localScale: rawSystem.localScale,
    GM: GM,
    bodies: bodies
  };
}

function buildAllSystems(rawSystems) {
  const out = {};
  for (const systemId in rawSystems) {
    out[systemId] = buildSystem(rawSystems[systemId]);
  }
  return out;
}

// Helper functions moved here from systems.js - these OPERATE on
// mapState, they're not definitions, so they belong in the build/logic
// module rather than the pure-data file.
function getChildSystems(systemId) {
  const out = [];
  for (const key in mapState.systems) {
    if (mapState.systems[key].parentSystemId === systemId) out.push(mapState.systems[key]);
  }
  return out;
}

function getPrimaryName(systemId) {
  const sys = mapState.systems[systemId];
  if (!sys.parentSystemId) return 'Sun';
  const parentSys = mapState.systems[sys.parentSystemId];
  return parentSys.bodies[sys.originBodyId].name;
}

function getSystemMaxOrbitRadius(systemId) {
  const sys = mapState.systems[systemId];
  let maxR = 0;
  for (const key in sys.bodies) {
    const b = sys.bodies[key];
    maxR = Math.max(maxR, b.a * (1 + b.e));
  }
  return maxR;
}

// The runtime state object itself - this is where mapState is actually
// constructed. systems.js only ever supplied RAW_SYSTEMS/LAYER_DEFAULTS.
const mapState = {
  t: 0,
  camera: { x: 0, y: 0, pxPerAU: 130 },
  selected: { systemId: null, bodyId: null },
  anim: { channels: {} },
  lagrangeEnabled: true,
  systems: buildAllSystems(RAW_SYSTEMS),
  layers: LAYER_DEFAULTS
};
