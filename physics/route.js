// physics/route.js
// Route / delta-v planning: walks the same nested-system tree used
// elsewhere but computes an idealised two-body Hohmann-transfer delta-v
// (and transfer time) per level rather than a position.
//
// This uses each body's scalar radius only - never its angular
// position - so it says nothing about whether a real transfer geometry
// actually exists between two specific dates (a real Hohmann transfer
// requires a 180-degree phase relationship at arrival). It's a
// magnitude estimate, not a launch-window search.
//
// Every "local" leg (escaping or being captured by a planet's own
// gravity) is modelled as a Hohmann transfer between the target body's
// actual orbital radius and its parent system's Hill radius - a named
// approximation for a real sphere-of-influence match, same tier of
// honesty as the small-mass-ratio approximation already flagged for
// Lagrange points.
//
// This deliberately cannot represent gravity assists: a flyby's benefit
// only shows up in the frame where the planet itself is moving, which
// needs real velocity vectors and a three-body treatment, neither of
// which exist here. Every figure is the idealised, no-assist cost of a
// leg - the gap against a real mission's published delta-v is the
// interesting number, not an error to close.
import { mapState } from '../state/state.js';
import { ellipseState, orbitalSpeed, orbitPeriodYears } from '../core/orbits.js';
import { KM_PER_AU } from '../data/systems.js';
import { hillRadius } from '../core/lagrange.js';
import { getPrimaryName } from './worldpos.js';

const SECONDS_PER_YEAR = 365.25 * 86400;
export const KM_PER_SEC_PER_AU_PER_YEAR = KM_PER_AU / SECONDS_PER_YEAR;

function auPerYearToKmPerSec(v) {
  return v * KM_PER_SEC_PER_AU_PER_YEAR;
}


// True when candidatePoint IS the body that systemId's tree entry is
// itself anchored to (its origin body) - e.g. Earth is the primary
// terran-system is built around. One level only - nothing in the
// current dataset nests a moon of a moon, so this doesn't need to walk
// further than a direct parent/child check.
function isDirectPrimaryOf(candidatePoint, systemId) {
  const sys = mapState.systems[systemId];
  return sys.parentSystemId === candidatePoint.systemId && sys.originBodyId === candidatePoint.bodyId;
}

// A circular parking orbit's radius is body-radius-plus-altitude,
// regardless of which body it circles - this is the same calculation
// whether the orbit is around the primary (e.g. Earth launch) or the
// satellite (e.g. lunar orbit). The distinction between those two
// cases lives entirely in which GM the caller uses afterward, not in
// this radius itself. Returns null (not zero) when either the
// waypoint's altitude or the body's surface radius is missing, so the
// caller can distinguish "no orbit possible" from "genuinely zero".
function resolveParkingOrbitRadius(body, waypoint) {
  if (waypoint.parkingOrbitAltitudeKm === undefined) return null;
  if (body.radiusKm === undefined) return null;
  return (body.radiusKm + waypoint.parkingOrbitAltitudeKm) / KM_PER_AU;
}

function unavailableRoute(primaryIsDeparture, primaryBody, satBody, note) {
  const fromBody = primaryIsDeparture ? primaryBody : satBody;
  const toBody = primaryIsDeparture ? satBody : primaryBody;
  return {
    fromLabel: fromBody.name, toLabel: toBody.name,
    legs: [{ label: fromBody.name + ' -> ' + toBody.name, tier: 'primary-local', deltaVKmS: null, transferTimeYears: null, note: note }],
    totalDeltaVKmS: null, totalTransferTimeYears: null
  };
}

// Handles the case the general common-ancestor walk gets wrong: one
// endpoint IS the primary the other endpoint's system orbits (see the
// earlier fix in this file's history for why the general walk can't be
// reused here). Builds up to two real legs:
//  1. primary parking orbit -> satellite's sphere-of-influence edge
//     (Hill radius, same SOI convention as every other local-capture
//     leg in this file), in the PRIMARY's GM regime - this is the
//     trans-X injection + coast.
//  2. satellite's SOI edge -> a parking orbit around the SATELLITE
//     itself, in the satellite's own DERIVED GM regime
//     (primaryGM * satellite.massRatio - not independently sourced,
//     same confidence tier as massRatio itself). Only built if the
//     satellite waypoint actually specifies a parking altitude.
//
// Requires a real parking-orbit altitude AND surface radius on the
// PRIMARY side to produce anything at all - without it (e.g. a direct
// atmospheric-reentry splashdown, which never involved a parking orbit
// in the first place) this correctly falls back to "not yet
// computable" rather than inventing a number for an event this model
// was never going to represent.
function buildPrimaryLocalRoute(primaryPoint, satellitePoint, primaryIsDeparture) {
  const primarySys = mapState.systems[primaryPoint.systemId];
  const primaryBody = primarySys.bodies[primaryPoint.bodyId];
  const satSys = mapState.systems[satellitePoint.systemId];
  const satBody = satSys.bodies[satellitePoint.bodyId];
  const localGM = satSys.GM; // the primary's own GM (e.g. terran-system.GM = Earth's GM)

  const r1AU = resolveParkingOrbitRadius(primaryBody, primaryPoint);
  if (r1AU === null) {
    return unavailableRoute(primaryIsDeparture, primaryBody, satBody,
      'Needs a parking-orbit altitude and surface radius for ' + primaryBody.name);
  }

  const satSt = ellipseState(satBody.a, satBody.e, satBody.omegaBase, satBody.omegaDotRadPerYear, satellitePoint.t, satBody.tp, localGM, satBody.direction);
  const satHillR = hillRadius(satSt.r, satBody.massRatio);

  const legs = [];
  const transferLabel = primaryIsDeparture
    ? primaryBody.name + ' parking orbit -> ' + satBody.name + ' SOI (trans-' + satBody.name.toLowerCase() + ' injection)'
    : satBody.name + ' SOI -> ' + primaryBody.name + ' parking orbit';
  legs.push(makeLeg(transferLabel, 'primary-local-transfer', localGM, r1AU, satHillR));

  const satLocalR = resolveParkingOrbitRadius(satBody, satellitePoint);
  if (satLocalR !== null) {
    const satGM = localGM * satBody.massRatio;
    const captureLabel = primaryIsDeparture
      ? satBody.name + ' SOI -> ' + satBody.name + ' parking orbit'
      : satBody.name + ' parking orbit -> ' + satBody.name + ' SOI';
    legs.push(makeLeg(captureLabel, 'local-capture', satGM, satLocalR, satHillR));
  }

  let totalDeltaVKmS = 0, totalTransferTimeYears = 0;
  legs.forEach(function (leg) { totalDeltaVKmS += leg.deltaVKmS; totalTransferTimeYears += leg.transferTimeYears; });

  const fromBody = primaryIsDeparture ? primaryBody : satBody;
  const toBody = primaryIsDeparture ? satBody : primaryBody;
  return { fromLabel: fromBody.name, toLabel: toBody.name, legs: legs, totalDeltaVKmS: totalDeltaVKmS, totalTransferTimeYears: totalTransferTimeYears };
}

// Pure formula - two-burn Hohmann transfer between circular orbits of
// radius r1/r2 around a body of gravitational parameter mu, plus the
// transfer's own duration (half the transfer ellipse's period - the
// standard Hohmann time-of-flight). mu/r1/r2 in AU^3/year^2 and AU;
// conversion to km/s happens at the call site.
export function hohmannDeltaV(mu, r1, r2) {
  const aTransfer = (r1 + r2) / 2;
  const v1Circular = Math.sqrt(mu / r1);
  const v1Transfer = Math.sqrt(mu * (2 / r1 - 1 / aTransfer));
  const v2Circular = Math.sqrt(mu / r2);
  const v2Transfer = Math.sqrt(mu * (2 / r2 - 1 / aTransfer));
  const departureBurn = Math.abs(v1Transfer - v1Circular);
  const arrivalBurn = Math.abs(v2Circular - v2Transfer);
  const transferTimeYears = Math.PI * Math.sqrt((aTransfer * aTransfer * aTransfer) / mu);
  return { departureBurn: departureBurn, arrivalBurn: arrivalBurn, total: departureBurn + arrivalBurn, transferTimeYears: transferTimeYears };
}

export function getAncestorChain(systemId) {
  const chain = [];
  let current = systemId;
  while (current) {
    chain.push(current);
    current = mapState.systems[current].parentSystemId;
  }
  return chain;
}

export function findCommonAncestorSystem(systemIdA, systemIdB) {
  const chainA = getAncestorChain(systemIdA);
  const setA = {};
  for (let i = 0; i < chainA.length; i++) setA[chainA[i]] = true;
  const chainB = getAncestorChain(systemIdB);
  for (let i = 0; i < chainB.length; i++) {
    if (setA[chainB[i]]) return chainB[i];
  }
  return null;
}

function makeLeg(label, tier, mu, r1, r2) {
  const dv = hohmannDeltaV(mu, r1, r2);
  return {
    label: label,
    tier: tier,
    r1AU: r1,
    r2AU: r2,
    departureBurnKmS: auPerYearToKmPerSec(dv.departureBurn),
    arrivalBurnKmS: auPerYearToKmPerSec(dv.arrivalBurn),
    deltaVKmS: auPerYearToKmPerSec(dv.total),
    transferTimeYears: dv.transferTimeYears
  };
}

function walkToCommonAncestor(point, commonId) {
  let currentSystemId = point.systemId;
  let currentBodyId = point.bodyId;
  const t = point.t;
  const legs = [];

  while (currentSystemId !== commonId) {
    const sys = mapState.systems[currentSystemId];
    const body = sys.bodies[currentBodyId];
    const st = ellipseState(body.a, body.e, body.omegaBase, body.omegaDotRadPerYear, t, body.tp, sys.GM, body.direction);

    const parentSys = mapState.systems[sys.parentSystemId];
    const originBody = parentSys.bodies[sys.originBodyId];
    const originSt = ellipseState(originBody.a, originBody.e, originBody.omegaBase, originBody.omegaDotRadPerYear, t, originBody.tp, parentSys.GM, originBody.direction);
    const rHill = hillRadius(originSt.r, originBody.massRatio);

    legs.push(makeLeg(body.name + ' -> ' + getPrimaryName(currentSystemId) + ' SOI', 'local-capture', sys.GM, st.r, rHill));

    currentSystemId = sys.parentSystemId;
    currentBodyId = sys.originBodyId;
  }

  return { legs: legs, systemId: currentSystemId, bodyId: currentBodyId, t: t };
}

export function computeRoute(departure, arrival) {
  const depSys = mapState.systems[departure.systemId];
  const arrSys = mapState.systems[arrival.systemId];
  const depBody = depSys.bodies[departure.bodyId];
  const arrBody = arrSys.bodies[arrival.bodyId];

  if (departure.systemId === arrival.systemId && departure.bodyId === arrival.bodyId) {
    return { fromLabel: depBody.name, toLabel: arrBody.name, legs: [], totalDeltaVKmS: 0, totalTransferTimeYears: 0 };
  }

  if (isDirectPrimaryOf(departure, arrival.systemId)) return buildPrimaryLocalRoute(departure, arrival, true);
  if (isDirectPrimaryOf(arrival, departure.systemId)) return buildPrimaryLocalRoute(arrival, departure, false);

  const commonId = findCommonAncestorSystem(departure.systemId, arrival.systemId);
  const depWalk = walkToCommonAncestor(departure, commonId);
  const arrWalk = walkToCommonAncestor(arrival, commonId);

  const legs = [];
  depWalk.legs.forEach(function (leg) { legs.push(leg); });

  if (depWalk.bodyId !== arrWalk.bodyId) {
    const commonSys = mapState.systems[commonId];
    const bodyAtDep = commonSys.bodies[depWalk.bodyId];
    const bodyAtArr = commonSys.bodies[arrWalk.bodyId];
    const stDep = ellipseState(bodyAtDep.a, bodyAtDep.e, bodyAtDep.omegaBase, bodyAtDep.omegaDotRadPerYear, depWalk.t, bodyAtDep.tp, commonSys.GM, bodyAtDep.direction);
    const stArr = ellipseState(bodyAtArr.a, bodyAtArr.e, bodyAtArr.omegaBase, bodyAtArr.omegaDotRadPerYear, arrWalk.t, bodyAtArr.tp, commonSys.GM, bodyAtArr.direction);
    legs.push(makeLeg(bodyAtDep.name + ' -> ' + bodyAtArr.name, 'heliocentric', commonSys.GM, stDep.r, stArr.r));
  }

  arrWalk.legs.slice().reverse().forEach(function (leg) {
    legs.push({
      label: leg.label.split(' -> ').reverse().join(' -> '),
      tier: leg.tier, r1AU: leg.r1AU, r2AU: leg.r2AU,
      departureBurnKmS: leg.departureBurnKmS, arrivalBurnKmS: leg.arrivalBurnKmS,
      deltaVKmS: leg.deltaVKmS, transferTimeYears: leg.transferTimeYears
    });
  });

  let totalDeltaVKmS = 0, totalTransferTimeYears = 0;
  legs.forEach(function (leg) { totalDeltaVKmS += leg.deltaVKmS; totalTransferTimeYears += leg.transferTimeYears; });

  return { fromLabel: depBody.name, toLabel: arrBody.name, legs: legs, totalDeltaVKmS: totalDeltaVKmS, totalTransferTimeYears: totalTransferTimeYears };
}

// A parking orbit is circular by definition (e = 0), so vis-viva
// collapses to the simple circular-velocity case - constant speed
// everywhere on the circle, unlike a real eccentric body's varying
// speed (see orbitalSpeed's use in main.js's selectBody). r here is
// the FULL orbital radius (body radius + altitude), not altitude alone.
export function parkingOrbitSpeed(r, GM) {
  return orbitalSpeed(r, r, GM);
}


// Real mission plans state parking-orbit dwell as a revolution count
// (e.g. Apollo 8 held ~1.5 revolutions before TLI), not a raw duration -
// converts that to years using the same period formula every other
// orbital period in this codebase uses (a = r, since the orbit is
// circular).
export function parkingOrbitDurationYears(r, GM, revolutions) {
  return orbitPeriodYears(r, GM) * revolutions;
}
