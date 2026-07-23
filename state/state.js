import { buildAllSystems } from './systems-build.js';
import { buildAllMissions } from './missions-build.js';
import { createRouteLibrary } from './routeLibrary.js';
import { RAW_SYSTEMS, LAYER_DEFAULTS } from '../data/systems.js';
import { RAW_MISSIONS } from '../data/missions.js';

const systems = buildAllSystems(RAW_SYSTEMS);

export const mapState = {
  t: 0,
  camera: { x: 0, y: 0, pxPerAU: 130 },
  selected: { systemId: null, bodyId: null },
  trackedSystemId: null,
  anim: { channels: {} },
  lagrangeEnabled: true,
  systems: systems,
  layers: LAYER_DEFAULTS,
  missions: buildAllMissions(RAW_MISSIONS, systems),
  currentRoutes: createRouteLibrary(),
  routePlanner: {
    fromSystemId: null, fromBodyId: null, fromT: null,
    toSystemId: null, toBodyId: null, toT: null,
    pendingRole: null
  }
};
