# Orbital Map

An interactive, physically-grounded map of the solar system, rendered
entirely in the browser: real orbital mechanics, real Lagrange points,
and a per-pixel visualisation of gravitational "terrain" -- what the
combined pull of every nearby body actually looks like, coloured and
shaded like a relief map.

No game engine, no build step, no dependencies. Plain HTML5 Canvas and
JavaScript.

**[Live demo →](#)**

---

## What this actually is

Every body on this map -- planets, moons, a handful of asteroids and
dwarf planets -- sits on its own two-body Kepler ellipse
around whatever it orbits, solved exactly (Newton–Raphson on Kepler's
equation, not a small-angle approximation). Positions are computed live
from real orbital elements at a real epoch (J2000), so the map can jump
to any calendar date and the planets land where they actually were, or
will be, to the accuracy of the underlying model.

On top of that:

- **Lagrange points (L1–L5)** are computed for every eligible
  parent/child pair, including the equilateral-triangle geometry of L4
  and L5 and each body's Hill sphere.
- **Apsidal precession** is modelled for moons where it's fast enough to
  matter on human timescales -- periapsis direction genuinely rotates
  over time for real physical reasons (planetary oblateness, solar
  perturbation), and this map computes that rotation rather than
  freezing it.
- **Gravitational terrain**: a dense, per-pixel rendering of real
  summed Newtonian potential across whatever's in view, contrast-
  stretched by histogram equalisation so a moon's own local structure
  stays visible next to a planet a thousand times more massive, and
  shaded like relief on an OS map so the topology -- wells, saddles,
  ridges -- reads at a glance.

## Data sources

This project treats "where did this number come from" as a first-class
question. Nothing is invented without saying so.

| Category | Source | Notes |
|---|---|---|
| Planetary orbits (incl. Pluto) | Standish, *Explanatory Supplement to the Astronomical Almanac* (1992) — a 250-year least-squares fit, ~25 arcsec accurate for the inner planets | Real `a`, `e`, mean longitude, longitude of perihelion at J2000. Secular (centennial) rate terms are **not** included, so accuracy gradually loosens the further a date is from year 2000. |
| Moons | [JPL Planetary Satellite Mean Elements](https://ssd.jpl.nasa.gov/sats/elem/) | Real `a`, `e`, argument of periapsis, mean anomaly, and apsidal precession period at J2000, for every moon currently on the map. This is also where the precession feature's numbers come from — it's a real, measured effect, not decoration. |
| Asteroids / dwarf planets | General published figures | `a`/`e` are solid; argument-of-periapsis and mean-anomaly-at-epoch are **not** yet on the same rigorous footing as the planet/moon tables above — flagged in code as a known gap. |
| Comets | General published figures | Chosen specifically for **low orbital inclination** (see below) rather than fame — Halley and Hale-Bopp are both excluded for exactly this reason. |
| Masses (used for Hill spheres / Lagrange points / gravitational terrain) | Derived from published body masses | Reasonable-effort figures, not independently cross-checked against one single authoritative table the way the orbital elements are. |

If you spot a number that looks wrong, it's more likely to be a genuine
gap than a typo — check the inline comments in `systems.js` first, they
say explicitly which fields are sourced and which are placeholders.

## Known limitations — read this before reporting a "bug"

These are deliberate, understood simplifications, not oversights:

- **The model is flat.** No inclination, anywhere. A body with a real
  inclination high enough to make this misleading is simply left off
  the map — this is why you won't find Pallas, Eris, Makemake, Haumea,
  Halley's Comet, or Hale-Bopp here, even though they're famous. Lower-
  inclination alternatives are included where a similar story can be
  told honestly instead.
- **No mutual gravity between bodies.** Every orbit is an independent
  two-body problem against its immediate parent. Real resonances (e.g.
  Neptune–Pluto's actual 3:2 lock, which is *why* their crossing orbits
  don't collide) exist in the real data but aren't dynamically
  simulated — you can see that Pluto's orbit dips inside Neptune's, but
  not the perturbation that keeps them apart.
- **Pluto–Charon is a known approximation.** Charon's mass is about 12%
  of Pluto's — too large for the "massless secondary" assumption every
  other body on this map relies on. In reality they orbit a shared
  barycentre outside Pluto's surface; here, Pluto is treated as fixed
  and Charon orbits it, which is simpler but not strictly correct.
- **Lagrange points use the standard small-mass-ratio approximation**,
  not an exact restricted three-body solution. Accurate for everything
  currently on the map; would degrade for a much more comparable-mass
  pair.
- **Precession direction is assumed prograde.** The source data gives
  magnitude and period, not a verified sign, for each moon.

## Architecture, briefly

- `orbits.js` orbital mechanics only (Kepler solver, vis-viva,
  precession maths). No rendering, no map-specific data.
- `systems.js` pure data. Every body's real sourced elements, nothing
  computed.
- `systems-build.js` converts raw data into runtime state once, at
  load.
- `physics.js` the per-frame update step (currently: advancing
  precession). Classic game-loop separation: update state, then render
  it, never compute time-dependent values inside the renderer.
- `worldpos.js` / `lagrange.js` / `hillshade.js` position queries,
  Lagrange-point maths, and the gravitational-terrain renderer,
  respectively. All pure computation.
- `render.js` the only file that touches `<canvas>`.
- `main.js` UI, camera, the actual frame loop.

Adding a new body is a data-only change in `systems.js`.

## Running it locally

Any static file server works:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Contributing

If you can improve on any of the "known limitations" above with a real,
cited source that's the most useful kind of contribution this project
can take. Please include a source link in the pull request, not just
the number.

## License

MIT
