// data/missions.js
// Pure data, no execution - same discipline as data/systems.js. One
// entry per mission, an ordered array of waypoints. Dates from JPL/NASA
// mission pages. Every waypoint names an explicit systemId AND bodyId -
// no shorthand, no "system implies its own primary" inference. A
// waypoint always states exactly where it is.
//
// systemId is always the system the body ORBITS, not a system named
// after the body itself - Earth and Jupiter are bodies of
// 'solar-system'; the Moon is a body of 'terran-system' (Earth's own
// child system); Titan is a body of 'saturnian-system'.

export const RAW_MISSIONS = {
  'voyager-1': {
    name: 'Voyager 1',
    waypoints: [
      { date: '1977-09-05', systemId: 'solar-system', bodyId: 'earth', event: 'launch' },
      { date: '1979-03-05', systemId: 'solar-system', bodyId: 'jupiter', event: 'flyby' },
      { date: '1980-11-12', systemId: 'saturnian-system', bodyId: 'titan', event: 'flyby' }
    ]
  },
'apollo-8': {
  name: 'Apollo 8',
  waypoints: [
    { date: '1968-12-21', systemId: 'solar-system', bodyId: 'earth', event: 'launch', parkingOrbitAltitudeKm: 190, parkingOrbitRevolutions: 1.5 },
    { date: '1968-12-24', systemId: 'terran-system', bodyId: 'moon', event: 'lunar orbit insertion', parkingOrbitAltitudeKm: 111 },
    { date: '1968-12-27', systemId: 'solar-system', bodyId: 'earth', event: 'splashdown' }
  ]
}
};
