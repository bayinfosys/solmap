const SOLAR_GM = 4 * Math.PI * Math.PI; // AU^3 / year^2, tuned so a=1,T=1 for Earth

const mapState = {
  t: 0,
  camera: { x: 0, y: 0, pxPerAU: 130 },
  selected: { systemId: null, bodyId: null },
  systems: {
    sun: {
      id: 'sun',
      parentSystemId: null,
      originBodyId: null,
      localScale: 1,
      GM: SOLAR_GM,
      bodies: {
        mercury: { a: 0.387, e: 0.2056, omega: 0.508, tp: 0, name: 'Mercury', color: '#9c8f7c', drawR: 4 },
        venus:   { a: 0.723, e: 0.0068, omega: 0.958, tp: 0, name: 'Venus',   color: '#e0b64a', drawR: 5 },
        earth:   { a: 1.000, e: 0.0167, omega: 1.796, tp: 0, name: 'Earth',   color: '#4a90d9', drawR: 5 },
        mars:    { a: 1.524, e: 0.0934, omega: 5.000, tp: 0, name: 'Mars',    color: '#c1440e', drawR: 5 },
        ceres:   { a: 2.767, e: 0.0758, omega: 1.290, tp: 0, name: 'Ceres',   color: '#8c8378', drawR: 3 },
        jupiter: { a: 5.203, e: 0.0489, omega: 0.257, tp: 0, name: 'Jupiter', color: '#d9a066', drawR: 8 },
        saturn:  { a: 9.537, e: 0.0565, omega: 1.616, tp: 0, name: 'Saturn',  color: '#e8d6a0', drawR: 7 },
        uranus:  { a: 19.191, e: 0.0457, omega: 2.984, tp: 0, name: 'Uranus', color: '#9fd6d6', drawR: 6 },
        neptune: { a: 30.069, e: 0.0086, omega: 4.820, tp: 0, name: 'Neptune', color: '#5b7fd9', drawR: 6 }
      }
    },

    'martian-system': {
      id: 'martian-system',
      parentSystemId: 'sun',
      originBodyId: 'mars',
      localScale: 1,
      GM: SOLAR_GM * 0.0000003213, // Mars/Sun mass ratio
      bodies: {
        phobos: { a: 0.0000627, e: 0.0151, omega: 0, tp: 0, name: 'Phobos', color: '#8a7a6a', drawR: 1.5 },
        deimos: { a: 0.0001568, e: 0.0003, omega: 0, tp: 0, name: 'Deimos', color: '#8a7a6a', drawR: 1.5 }
      }
    },

    'terran-system': {
      id: 'terran-system',
      parentSystemId: 'sun',
      originBodyId: 'earth',
      localScale: 1,
      GM: SOLAR_GM * 0.0000030, // Earth/Sun mass ratio
      bodies: {
        moon: { a: 0.00257, e: 0.0549, omega: 0, tp: 0, name: 'Moon', color: '#ccc', drawR: 2 }
      }
    },

    'jovian-system': {
      id: 'jovian-system',
      parentSystemId: 'sun',
      originBodyId: 'jupiter',
      localScale: 1,
      GM: SOLAR_GM * 0.0009545, // Jupiter/Sun mass ratio
      bodies: {
        metis:    { a: 0.000860, e: 0.0002, omega: 0, tp: 0, name: 'Metis',    color: '#7a7268', drawR: 1 },
        adrastea: { a: 0.000862, e: 0.0015, omega: 0, tp: 0, name: 'Adrastea', color: '#7a7268', drawR: 1 },
        amalthea: { a: 0.001211, e: 0.0032, omega: 0, tp: 0, name: 'Amalthea', color: '#a06858', drawR: 2 },
        thebe:    { a: 0.001516, e: 0.0176, omega: 0, tp: 0, name: 'Thebe',    color: '#7a7268', drawR: 2 },
        io:       { a: 0.002819, e: 0.0041, omega: 0, tp: 0, name: 'Io',       color: '#e8d060', drawR: 3 },
        europa:   { a: 0.004486, e: 0.0094, omega: 0, tp: 0, name: 'Europa',   color: '#c9b896', drawR: 3 },
        ganymede: { a: 0.007155, e: 0.0013, omega: 0, tp: 0, name: 'Ganymede', color: '#9a8e7a', drawR: 4 },
        callisto: { a: 0.012585, e: 0.0074, omega: 0, tp: 0, name: 'Callisto', color: '#5c5346', drawR: 4 }
      }
    },

    'saturnian-system': {
      id: 'saturnian-system',
      parentSystemId: 'sun',
      originBodyId: 'saturn',
      localScale: 1,
      GM: SOLAR_GM * 0.0002857, // Saturn/Sun mass ratio
      bodies: {
        mimas:     { a: 0.001241, e: 0.0196, omega: 0, tp: 0, name: 'Mimas',     color: '#b8b0a0', drawR: 1.5 },
        enceladus: { a: 0.001588, e: 0.0047, omega: 0, tp: 0, name: 'Enceladus', color: '#d8e8f0', drawR: 2 },
        tethys:    { a: 0.001967, e: 0.0001, omega: 0, tp: 0, name: 'Tethys',    color: '#c8c0b0', drawR: 2 },
        dione:     { a: 0.002519, e: 0.0022, omega: 0, tp: 0, name: 'Dione',     color: '#c0b8a8', drawR: 2 },
        rhea:      { a: 0.003522, e: 0.0010, omega: 0, tp: 0, name: 'Rhea',      color: '#b8b0a0', drawR: 2.5 },
        titan:     { a: 0.008168, e: 0.0288, omega: 0, tp: 0, name: 'Titan',     color: '#e0a852', drawR: 4 },
        iapetus:   { a: 0.023802, e: 0.0286, omega: 0, tp: 0, name: 'Iapetus',   color: '#8a7a68', drawR: 2.5 }
      }
    },

    'uranian-system': {
      id: 'uranian-system',
      parentSystemId: 'sun',
      originBodyId: 'uranus',
      localScale: 1,
      GM: SOLAR_GM * 0.00004365, // Uranus/Sun mass ratio
      bodies: {
        miranda: { a: 0.000871, e: 0.0013, omega: 0, tp: 0, name: 'Miranda', color: '#a8a0a0', drawR: 1.5 },
        ariel:   { a: 0.001275, e: 0.0012, omega: 0, tp: 0, name: 'Ariel',   color: '#c0c0c0', drawR: 2 },
        umbriel: { a: 0.001776, e: 0.0039, omega: 0, tp: 0, name: 'Umbriel', color: '#706868', drawR: 2 },
        titania: { a: 0.002913, e: 0.0011, omega: 0, tp: 0, name: 'Titania', color: '#a89e98', drawR: 2.5 },
        oberon:  { a: 0.003900, e: 0.0014, omega: 0, tp: 0, name: 'Oberon',  color: '#988e88', drawR: 2.5 }
      }
    },

    'neptunian-system': {
      id: 'neptunian-system',
      parentSystemId: 'sun',
      originBodyId: 'neptune',
      localScale: 1,
      GM: SOLAR_GM * 0.00005148, // Neptune/Sun mass ratio
      bodies: {
        triton: { a: 0.002371, e: 0.00002, omega: 0, tp: 0, name: 'Triton', color: '#d8c8b8', drawR: 3, direction: -1 },
        nereid: { a: 0.0360, e: 0.7512, omega: 2.100, tp: 0, name: 'Nereid', color: '#9088a0', drawR: 1.5 }
      }
    }
  },

  layers: {
    sun: true,
    'martian-system': true,
    'terran-system': true,
    'jovian-system': true,
    'saturnian-system': true,
    'uranian-system': true,
    'neptunian-system': true
  }
};

function getChildSystems(systemId) {
  const out = [];
  for (const key in mapState.systems) {
    if (mapState.systems[key].parentSystemId === systemId) out.push(mapState.systems[key]);
  }
  return out;
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
