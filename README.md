# Orbital Map

An interactive, physically-grounded map of the solar system, rendered
entirely in the browser: real orbital mechanics, real Lagrange points,
a per-pixel gravitational terrain view, and a route/delta-v explorer.

No game engine, no build step, no dependencies. Plain HTML5 Canvas and
JavaScript, ES modules.

---

## Features

- **Orbital mechanics.** Every body — planets, moons, a handful of
  asteroids and dwarf planets — sits on its own two-body Kepler
  ellipse around whatever it orbits, solved exactly (Newton–Raphson on
  Kepler's equation). Positions are computed from real orbital elements
  at a real epoch (J2000); the map jumps to any calendar date and
  bodies land where they actually were or will be, to the accuracy of
  the underlying model.
- **Lagrange points (L1–L5)**, computed for every eligible
  parent/child pair, including the equilateral-triangle geometry of L4
  and L5 and each body's Hill sphere.
- **Apsidal precession**, modelled for moons where it's fast enough to
  matter on human timescales. Computed fresh from each body's fixed
  epoch values on every position query — not advanced as a stored
  per-frame value.
- **Gravitational terrain**: a dense, per-pixel rendering of summed
  Newtonian potential across whatever's in view, contrast-stretched by
  histogram equalisation so a moon's own local structure stays visible
  next to a planet a thousand times more massive, shaded as relief.
- **Route/delta-v explorer**: historical mission waypoints (Voyager 1,
  Apollo 8) plotted as schematic connectors between real dated
  positions, with idealised Hohmann-transfer delta-v computed per leg.
  Manual point-to-point route planning between any two bodies at any
  two dates. See Known Limitations for what this does and doesn't
  represent.

## Data sources

Every number either comes from a real source or is explicitly flagged
as a placeholder.

| Category | Source | Notes |
|---|---|---|
| Planetary orbits (incl. Pluto) | Standish, *Explanatory Supplement to the Astronomical Almanac* (1992) — a 250-year least-squares fit, ~25 arcsec accurate for the inner planets | Real `a`, `e`, mean longitude, longitude of perihelion at J2000. Secular (centennial) rate terms are **not** included; accuracy loosens the further a date is from year 2000. |
| Moons | [JPL Planetary Satellite Mean Elements](https://ssd.jpl.nasa.gov/sats/elem/) | Real `a`, `e`, argument of periapsis, mean anomaly, apsidal precession period at J2000. Source of the precession feature's numbers. |
| Asteroids / dwarf planets | General published figures | `a`/`e` solid; argument-of-periapsis and mean-anomaly-at-epoch not on the same footing as the planet/moon tables — flagged as a known gap. |
| Comets | General published figures | Chosen for **low orbital inclination** rather than fame — Halley and Hale-Bopp both excluded for this reason. |
| Masses (Hill spheres / Lagrange points / gravitational terrain) | Derived from published body masses | Reasonable-effort figures, not independently cross-checked against one authoritative table. |
| Mission waypoints (dates, target bodies) | JPL/NASA mission pages | Waypoint positions only. Delta-v per leg is computed (Hohmann), not taken from published mission budgets — see Known Limitations for why these are expected to disagree. |

If a number looks wrong, check the inline comments in `systems.js`
first — they state which fields are sourced and which are
placeholders.

## Known limitations — read this before reporting a "bug"

These are deliberate, understood simplifications:

- **The model is flat.** No inclination, anywhere. A body whose real
  inclination is high enough that flattening it would misrepresent it
  is left off the map — this is why Pallas, Eris, Makemake, Haumea,
  Halley's Comet, and Hale-Bopp aren't here. Lower-inclination
  alternatives are included where a similar story can be told
  honestly.
- **No mutual gravity between bodies.** Every orbit is an independent
  two-body problem against its immediate parent. Real resonances
  (e.g. Neptune–Pluto's 3:2 lock, which is why their crossing orbits
  don't collide) exist in the real data but aren't simulated.
- **Pluto–Charon is a known approximation.** Charon's mass is ~12% of
  Pluto's, too large for the massless-secondary assumption every other
  body relies on. Pluto is treated as fixed; Charon orbits it.
- **Lagrange points use the standard small-mass-ratio approximation**,
  not an exact restricted three-body solution.
- **Precession direction is assumed prograde.** The source data gives
  magnitude and period, not a verified sign, per body.
- **Route lines are schematic, not trajectories.** A mission's plotted
  path is a straight connector between two real, correctly-dated
  positions, not a solved orbital arc. It will not curve, and will not
  necessarily terminate exactly on the destination body's marker.
- **Delta-v is a phase-blind Hohmann estimate.** Each leg's cost uses
  only the two bodies' scalar orbital radii on their given dates,
  never the angle between them. A real Hohmann transfer requires a
  specific phase relationship at arrival; this is a magnitude
  estimate, not a launch-window search.
- **Gravity assists are not modelled.** A flyby's benefit only appears
  in the frame where the flown-by body is itself moving, requiring
  velocity vectors and a three-body treatment — neither exists here.
  Idealised delta-v reads higher than a real assisted mission's
  published figure; the gap is expected, not an error.
- **Parking-orbit legs need a body's real surface radius.** Without
  it (most bodies currently), a launch/insertion leg reports as not
  yet computable rather than showing an invented number.
- **A satellite's own GM, where needed** (e.g. lunar orbit insertion)
  **is derived** as primary GM × `massRatio`, not independently
  sourced — same confidence tier as `massRatio` itself.

## Architecture

- `core/orbits.js` — orbital mechanics only (Kepler solver, vis-viva,
  precession). `ellipseState` takes a body's fixed `omegaBase`/
  `omegaDotRadPerYear` and a time `t`, and computes the precessed
  position fresh on every call — a pure function of its inputs, no
  stored "current" state anywhere.
- `data/systems.js` — pure data. Real sourced orbital elements, nothing
  computed.
- `state/systems-build.js` — converts raw data into runtime bodies at
  load. Stores only fixed precession inputs, never a mutable "current
  angle".
- `physics/worldpos.js` — recursive world-position queries
  (`getSystemWorldOrigin`, `getBodyWorldPosition`), no rendering.
- `physics/lagrange.js` — closed-form L1–L5 computation for any
  primary/secondary pair, at a given `t`.
- `physics/route.js` — route/delta-v planning. Walks the system tree
  to compute idealised Hohmann-transfer delta-v and transfer time
  between any two bodies at any two dates.
- `data/missions.js` / `state/missions-build.js` — historical mission
  waypoint data and its load step; waypoints validate against the real
  system tree at load.
- `state/routeLibrary.js` — keyed collection of currently displayed
  routes, independently toggleable.
- `render/hillshade.js` — gravitational terrain renderer, pure
  computation into a pixel buffer.
- `render/render.js` — the only file that touches `<canvas>`.
- `state/anim.js` — generic exponential-smoothing channels driving
  every eased visual value (camera pan/zoom, selection fade).
- `main.js` — UI wiring: camera pan/zoom/tracking, sidebar,
  date-jump, route-planner UI, the `requestAnimationFrame` loop.
- `core/epoch.js` — real-date ⇄ simulation-time conversion, anchored
  to J2000.
- `style.css` — colour values as `:root` custom properties. One known
  exception: route-marker colours in `routeLibrary.js` are plain hex.

Adding a new body is a data-only change in `systems.js`. Adding a new
historical mission is a data-only change in `missions.js`.

## Running it locally

Any static file server works — ES modules require this rather than
opening `index.html` directly:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Contributing

Improving on any "known limitation" with a real, cited source is the
most useful contribution this project can take. Include a source link
in the pull request, not just the number.

## License

GPL v3
