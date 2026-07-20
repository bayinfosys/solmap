const KM_PER_AU = 149597870.7;
const SOLAR_GM = 4 * Math.PI * Math.PI; // AU^3 / year^2 - physical constant, not computed from body data

// Orbit accuracy note: planetary a/e/L0/varpi are real J2000 values
// (Standish table). Satellite a/e/omega0/M0/papsisYears are real J2000
// values from JPL's Planetary Satellite Mean Elements
// (ssd.jpl.nasa.gov/sats/elem/sep.html). Planetary secular rate terms and
// full n-body perturbation are still NOT modeled - only satellite
// apsidal precession is, via papsisYears. No inclination anywhere.

const RAW_SYSTEMS = {
  'solar-system': {
    id: 'solar-system',
    parentSystemId: null,
    originBodyId: null,
    localScale: 1,
    GM: SOLAR_GM,
    bodies: {
      mercury: { aKm: 0.38709893 * KM_PER_AU, e: 0.20563069, L0: 252.25084, omega0: 77.45645, isMeanAnomaly: false,
        name: 'Mercury', color: '#9c8f7c', drawR: 4, massRatio: 1.660e-7,
        links: { wiki: 'https://en.wikipedia.org/wiki/Mercury_(planet)' } },
      venus: { aKm: 0.72333199 * KM_PER_AU, e: 0.00677323, L0: 181.97973, omega0: 131.53298, isMeanAnomaly: false,
        name: 'Venus', color: '#e0b64a', drawR: 5, massRatio: 2.447e-6,
        links: { wiki: 'https://en.wikipedia.org/wiki/Venus' } },
      earth: { aKm: 1.00000011 * KM_PER_AU, e: 0.01671022, L0: 100.46435, omega0: 102.94719, isMeanAnomaly: false,
        name: 'Earth', color: '#4a90d9', drawR: 5, massRatio: 3.003e-6,
        links: { wiki: 'https://en.wikipedia.org/wiki/Earth' } },
      mars: { aKm: 1.52366231 * KM_PER_AU, e: 0.09341233, L0: 355.45332, omega0: 336.04084, isMeanAnomaly: false,
        name: 'Mars', color: '#c1440e', drawR: 5, massRatio: 3.227e-7,
        links: { wiki: 'https://en.wikipedia.org/wiki/Mars' } },
      // Ceres: real a/e, still NOT on real J2000 omega/M - separate
      // sourcing task (asteroid, not a satellite - not part of this pass).
      ceres: { aKm: 2.767 * KM_PER_AU, e: 0.0758, omega0: 73.9, M0: 0, isMeanAnomaly: true, papsisYears: 0,
        name: 'Ceres', color: '#8c8378', drawR: 3, massRatio: 4.72e-10,
        links: { wiki: 'https://en.wikipedia.org/wiki/Ceres_(dwarf_planet)' } },
      jupiter: { aKm: 5.20336301 * KM_PER_AU, e: 0.04839266, L0: 34.40438, omega0: 14.75385, isMeanAnomaly: false,
        name: 'Jupiter', color: '#d9a066', drawR: 8, massRatio: 9.545e-4,
        links: { wiki: 'https://en.wikipedia.org/wiki/Jupiter' } },
      saturn: { aKm: 9.53707032 * KM_PER_AU, e: 0.05415060, L0: 49.94432, omega0: 92.43194, isMeanAnomaly: false,
        name: 'Saturn', color: '#e8d6a0', drawR: 7, massRatio: 2.857e-4,
        links: { wiki: 'https://en.wikipedia.org/wiki/Saturn' } },
      uranus: { aKm: 19.19126393 * KM_PER_AU, e: 0.04716771, L0: 313.23218, omega0: 170.96424, isMeanAnomaly: false,
        name: 'Uranus', color: '#9fd6d6', drawR: 6, massRatio: 4.365e-5,
        links: { wiki: 'https://en.wikipedia.org/wiki/Uranus' } },
      neptune: { aKm: 30.06896348 * KM_PER_AU, e: 0.00858587, L0: 304.88003, omega0: 44.97135, isMeanAnomaly: false,
        name: 'Neptune', color: '#5b7fd9', drawR: 6, massRatio: 5.148e-5,
        links: { wiki: 'https://en.wikipedia.org/wiki/Neptune' } },
      pluto: { aKm: 39.48168677 * KM_PER_AU, e: 0.24880766, L0: 238.92881, omega0: 224.06676, isMeanAnomaly: false,
        name: 'Pluto', color: '#c8b8a0', drawR: 3, massRatio: 6.55e-9,
        links: { wiki: 'https://en.wikipedia.org/wiki/Pluto' } }
    }
  },

  'martian-system': {
    id: 'martian-system', parentSystemId: 'solar-system', originBodyId: 'mars', localScale: 1,
    primaryMassRatio: 0.0000003213,
    bodies: {
      phobos: { aKm: 9375, e: 0.015, omega0: 216.3, M0: 189.7, isMeanAnomaly: true, papsisYears: 1.1,
        name: 'Phobos', color: '#8a7a6a', drawR: 1.5, massRatio: 1.66e-8,
        links: { wiki: 'https://en.wikipedia.org/wiki/Phobos_(moon)' } },
      deimos: { aKm: 23457, e: 0.000, omega0: 0.0, M0: 205.0, isMeanAnomaly: true, papsisYears: 0,
        name: 'Deimos', color: '#8a7a6a', drawR: 1.5, massRatio: 2.3e-9,
        links: { wiki: 'https://en.wikipedia.org/wiki/Deimos_(moon)' } }
    }
  },

  'terran-system': {
    id: 'terran-system', parentSystemId: 'solar-system', originBodyId: 'earth', localScale: 1,
    primaryMassRatio: 0.0000030,
    bodies: {
      moon: { aKm: 384400, e: 0.0554, omega0: 318.15, M0: 135.27, isMeanAnomaly: true, papsisYears: 5.997,
        name: 'Moon', color: '#ccc', drawR: 2, massRatio: 0.0123,
        links: { wiki: 'https://en.wikipedia.org/wiki/Moon' } }
    }
  },

  'jovian-system': {
    id: 'jovian-system', parentSystemId: 'solar-system', originBodyId: 'jupiter', localScale: 1,
    primaryMassRatio: 0.0009545,
    bodies: {
      metis:    { aKm: 128000,  e: 0.000, omega0: 0.0,   M0: 166.0, isMeanAnomaly: true, papsisYears: 0,
        name: 'Metis',    color: '#7a7268', drawR: 1, massRatio: 4.0e-10, links: { wiki: 'https://en.wikipedia.org/wiki/Metis_(moon)' } },
      adrastea: { aKm: 129000,  e: 0.000, omega0: 0.0,   M0: 214.5, isMeanAnomaly: true, papsisYears: 0,
        name: 'Adrastea', color: '#7a7268', drawR: 1, massRatio: 4.0e-11, links: { wiki: 'https://en.wikipedia.org/wiki/Adrastea_(moon)' } },
      amalthea: { aKm: 181400,  e: 0.003, omega0: 180.1, M0: 310.6, isMeanAnomaly: true, papsisYears: 0.196,
        name: 'Amalthea', color: '#a06858', drawR: 2, massRatio: 4.3e-9, links: { wiki: 'https://en.wikipedia.org/wiki/Amalthea_(moon)' } },
      thebe:    { aKm: 221900,  e: 0.018, omega0: 26.6,  M0: 182.1, isMeanAnomaly: true, papsisYears: 0.398,
        name: 'Thebe',    color: '#7a7268', drawR: 2, massRatio: 4.3e-10, links: { wiki: 'https://en.wikipedia.org/wiki/Thebe_(moon)' } },
      io:       { aKm: 421800,  e: 0.004, omega0: 49.1,  M0: 330.9, isMeanAnomaly: true, papsisYears: 1.333,
        name: 'Io',       color: '#e8d060', drawR: 3, massRatio: 4.70e-5, links: { wiki: 'https://en.wikipedia.org/wiki/Io_(moon)' } },
      europa:   { aKm: 671100,  e: 0.009, omega0: 45.0,  M0: 345.4, isMeanAnomaly: true, papsisYears: 1.394,
        name: 'Europa',   color: '#c9b896', drawR: 3, massRatio: 2.53e-5, links: { wiki: 'https://en.wikipedia.org/wiki/Europa_(moon)' } },
      ganymede: { aKm: 1070400, e: 0.001, omega0: 198.3, M0: 324.8, isMeanAnomaly: true, papsisYears: 68.301,
        name: 'Ganymede', color: '#9a8e7a', drawR: 4, massRatio: 7.80e-5, links: { wiki: 'https://en.wikipedia.org/wiki/Ganymede_(moon)' } },
      callisto: { aKm: 1882700, e: 0.007, omega0: 43.8,  M0: 87.4,  isMeanAnomaly: true, papsisYears: 277.921,
        name: 'Callisto', color: '#5c5346', drawR: 4, massRatio: 5.67e-5, links: { wiki: 'https://en.wikipedia.org/wiki/Callisto_(moon)' } }
    }
  },

  'saturnian-system': {
    id: 'saturnian-system', parentSystemId: 'solar-system', originBodyId: 'saturn', localScale: 1,
    primaryMassRatio: 0.0002857,
    bodies: {
      mimas:     { aKm: 186000,  e: 0.020, omega0: 160.4, M0: 275.3, isMeanAnomaly: true, papsisYears: 0.493,
        name: 'Mimas',     color: '#b8b0a0', drawR: 1.5, massRatio: 6.6e-8, links: { wiki: 'https://en.wikipedia.org/wiki/Mimas_(moon)' } },
      enceladus: { aKm: 238400,  e: 0.005, omega0: 119.5, M0: 57.0,  isMeanAnomaly: true, papsisYears: 2.916,
        name: 'Enceladus', color: '#d8e8f0', drawR: 2, massRatio: 1.9e-7, links: { wiki: 'https://en.wikipedia.org/wiki/Enceladus' } },
      // Tethys: e=0.001 is tiny - Papsis of 0.005yr (~1.8 days) is a real
      // fitted value, but at this eccentricity the periapsis direction
      // is barely physically meaningful. Expect its marker to spin fast
      // on screen - an honest indicator of near-zero eccentricity, same
      // spirit as L4/L5 sitting off-ring for HIGH eccentricity bodies.
      tethys:    { aKm: 295000,  e: 0.001, omega0: 335.3, M0: 0.0,   isMeanAnomaly: true, papsisYears: 0.005,
        name: 'Tethys',    color: '#c8c0b0', drawR: 2, massRatio: 1.09e-6, links: { wiki: 'https://en.wikipedia.org/wiki/Tethys_(moon)' } },
      dione:     { aKm: 377700,  e: 0.002, omega0: 116.0, M0: 212.0, isMeanAnomaly: true, papsisYears: 11.698,
        name: 'Dione',     color: '#c0b8a8', drawR: 2, massRatio: 1.93e-6, links: { wiki: 'https://en.wikipedia.org/wiki/Dione_(moon)' } },
      rhea:      { aKm: 527200,  e: 0.001, omega0: 44.3,  M0: 31.5,  isMeanAnomaly: true, papsisYears: 33.939,
        name: 'Rhea',      color: '#b8b0a0', drawR: 2.5, massRatio: 4.06e-6, links: { wiki: 'https://en.wikipedia.org/wiki/Rhea_(moon)' } },
      titan:     { aKm: 1221900, e: 0.029, omega0: 78.3,  M0: 11.7,  isMeanAnomaly: true, papsisYears: 346.680,
        name: 'Titan',     color: '#e0a852', drawR: 4, massRatio: 2.37e-4, links: { wiki: 'https://en.wikipedia.org/wiki/Titan_(moon)' } },
      iapetus:   { aKm: 3561700, e: 0.028, omega0: 254.5, M0: 74.8,  isMeanAnomaly: true, papsisYears: 1662.900,
        name: 'Iapetus',   color: '#8a7a68', drawR: 2.5, massRatio: 3.18e-6, links: { wiki: 'https://en.wikipedia.org/wiki/Iapetus_(moon)' } }
    }
  },

  'uranian-system': {
    id: 'uranian-system', parentSystemId: 'solar-system', originBodyId: 'uranus', localScale: 1,
    primaryMassRatio: 0.00004365,
    bodies: {
      miranda: { aKm: 129846, e: 0.001, omega0: 154.8, M0: 73.0,  isMeanAnomaly: true, papsisYears: 8.939,
        name: 'Miranda', color: '#a8a0a0', drawR: 1.5, massRatio: 7.4e-7, links: { wiki: 'https://en.wikipedia.org/wiki/Miranda_(moon)' } },
      ariel:   { aKm: 190929, e: 0.001, omega0: 9.6,   M0: 193.5, isMeanAnomaly: true, papsisYears: 28.901,
        name: 'Ariel',   color: '#c0c0c0', drawR: 2, massRatio: 1.44e-5, links: { wiki: 'https://en.wikipedia.org/wiki/Ariel_(moon)' } },
      umbriel: { aKm: 265986, e: 0.004, omega0: 183.4, M0: 253.0, isMeanAnomaly: true, papsisYears: 64.126,
        name: 'Umbriel', color: '#706868', drawR: 2, massRatio: 1.46e-5, links: { wiki: 'https://en.wikipedia.org/wiki/Umbriel_(moon)' } },
      titania: { aKm: 436298, e: 0.002, omega0: 184.0, M0: 68.1,  isMeanAnomaly: true, papsisYears: 579.928,
        name: 'Titania', color: '#a89e98', drawR: 2.5, massRatio: 3.92e-5, links: { wiki: 'https://en.wikipedia.org/wiki/Titania_(moon)' } },
      oberon:  { aKm: 583511, e: 0.002, omega0: 132.2, M0: 143.6, isMeanAnomaly: true, papsisYears: 158.604,
        name: 'Oberon',  color: '#988e88', drawR: 2.5, massRatio: 3.55e-5, links: { wiki: 'https://en.wikipedia.org/wiki/Oberon_(moon)' } }
    }
  },

  'neptunian-system': {
    id: 'neptunian-system', parentSystemId: 'solar-system', originBodyId: 'neptune', localScale: 1,
    primaryMassRatio: 0.00005148,
    bodies: {
      // Triton: real i=157.3deg confirms genuinely retrograde - direction:-1 kept, independent of precession.
      triton: { aKm: 354800, e: 0.000, omega0: 0.0, M0: 63.0, isMeanAnomaly: true, papsisYears: 0,
        name: 'Triton', color: '#d8c8b8', drawR: 3, direction: -1, massRatio: 2.09e-4,
        links: { wiki: 'https://en.wikipedia.org/wiki/Triton_(moon)' } },
      nereid: { aKm: 5513900, e: 0.751, omega0: 296.8, M0: 318.5, isMeanAnomaly: true, papsisYears: 7990.433,
        name: 'Nereid', color: '#9088a0', drawR: 1.5, massRatio: 3.03e-7,
        links: { wiki: 'https://en.wikipedia.org/wiki/Nereid_(moon)' } }
    }
  },

  'plutonian-system': {
    id: 'plutonian-system', parentSystemId: 'solar-system', originBodyId: 'pluto', localScale: 1,
    primaryMassRatio: 6.55e-9,
    bodies: {
      // HACK, still accepted: Charon treated as ordinary massless-secondary
      // moon of a fixed Pluto - real system is a binary orbiting a shared
      // barycentre outside Pluto's surface (Charon mass ~12% of Pluto's).
      charon: { aKm: 19600, e: 0.000, omega0: 0.0, M0: 304.1, isMeanAnomaly: true, papsisYears: 0,
        name: 'Charon', color: '#b0a898', drawR: 2, massRatio: 0.1217,
        links: { wiki: 'https://en.wikipedia.org/wiki/Charon_(moon)' } }
    }
  }
};

const LAYER_DEFAULTS = {
  'solar-system': true,
  'martian-system': true,
  'terran-system': true,
  'jovian-system': true,
  'saturnian-system': true,
  'uranian-system': true,
  'neptunian-system': true,
  'plutonian-system': true,
  hillshade: true,
  hillshadeHistogram: true,
  hillshadeResidual: true
};
