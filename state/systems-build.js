import { keplerElementsFromEpochWithPrecession } from '../core/orbits.js';
import { SOLAR_GM, KM_PER_AU, RAW_SYSTEMS, LAYER_DEFAULTS } from '../data/systems.js';

// Converts one raw body definition + its system's GM into a runtime body
// object (real omega/tp/precession rate computed, links/name/etc passed
// through). This is the "load function" - systems.js stays pure data,
// everything here is the one place that does computation on it.
export function buildBody(raw, GM) {
  const aAU = raw.aKm !== undefined ? raw.aKm / KM_PER_AU : raw.a;
  const k = keplerElementsFromEpochWithPrecession(
    raw.isMeanAnomaly ? raw.M0 : raw.L0,
    raw.omega0,
    aAU, GM, raw.papsisYears || 0, !!raw.isMeanAnomaly
  );
  const out = {
    a: aAU, e: raw.e,
    omegaBase: k.omega,
    omegaDotRadPerYear: k.omegaDotRadPerYear,
    tp: k.tp,
    name: raw.name, color: raw.color, drawR: raw.drawR,
    massRatio: raw.massRatio, links: raw.links
  };
  if (raw.direction !== undefined) out.direction = raw.direction;
  return out;
}

export function buildSystem(rawSystem) {
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

export function buildAllSystems(rawSystems) {
  const out = {};
  for (const systemId in rawSystems) {
    out[systemId] = buildSystem(rawSystems[systemId]);
  }
  return out;
}
