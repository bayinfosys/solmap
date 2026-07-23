// state/missions-build.js
// The load step for mission data, same role as systems-build.js:
// convert raw waypoint definitions into runtime state. Takes the
// already-built systems tree as an explicit parameter - never imports
// mapState - matching buildAllSystems's own pattern and avoiding a
// circular import (missions load as part of constructing mapState
// itself).
//
// Validates every waypoint against the real system tree, but fills in
// nothing - a missing or mismatched systemId/bodyId is always an error,
// never inferred. Explicit in, explicit out.
import { dateToSimTime } from '../core/epoch.js';

function buildWaypoint(raw, missionName, systems) {
  const sys = systems[raw.systemId];
  if (!sys) {
    throw new Error('Mission "' + missionName + '": unknown systemId "' + raw.systemId + '"');
  }
  if (!sys.bodies[raw.bodyId]) {
    throw new Error('Mission "' + missionName + '": body "' + raw.bodyId + '" is not in system "' + raw.systemId + '" (check it isn\'t actually a body of its own child system)');
  }
  return {
    t: dateToSimTime(new Date(raw.date + 'T12:00:00Z')),
    date: raw.date,
    systemId: raw.systemId,
    bodyId: raw.bodyId,
    event: raw.event
  };
}

function buildMission(raw, systems) {
  return {
    name: raw.name,
    waypoints: raw.waypoints.map(function (w) { return buildWaypoint(w, raw.name, systems); })
  };
}

export function buildAllMissions(rawMissions, systems) {
  const out = {};
  for (const missionId in rawMissions) {
    out[missionId] = buildMission(rawMissions[missionId], systems);
  }
  return out;
}
