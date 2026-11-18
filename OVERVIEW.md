# Orbital Map / Gravitational Terrain Explorer — Project Summary

A browser-based, physically-grounded map of the solar system: real
orbital mechanics, real Lagrange points, a per-pixel gravitational
topography view, and a route/delta-v explorer. Built as a chain of
small, honestly-scoped iterations rather than one upfront design — this
document distills what actually stuck.

## 1. Development principles

- **Real physics over plausible physics.** Every number either comes
  from a real source (JPL, Standish table) or is explicitly flagged as
  a placeholder. No silently-invented constants — a guessed value
  (early moon `omega` values, mass ratios estimated from public
  figures) is labelled as such in code comments, not presented as
  equivalent to sourced data.
- **Simplifications are named, not hidden.** The model is flat (no
  inclination), uses independent two-body Kepler ellipses (no mutual
  perturbation, no true n-body), and treats Pluto–Charon as an ordinary
  primary/secondary pair despite Charon's mass being ~12% of Pluto's
  (a real binary system, approximated on purpose). Each is a stated
  trade-off.
- **Exclude anything that can't be represented honestly.** A body
  whose real inclination is high enough that flattening it would
  misrepresent it more than illustrate it is left off the map. This
  ruled out Pallas, Eris, Makemake, Haumea, Halley, and Hale-Bopp —
  inclined by tens of degrees to over 90° — in favour of
  lower-inclination alternatives (Juno, Sedna, Quaoar, Encke, 67P,
  Wild 2) that tell a similar story without the distortion.
- **A visual artefact is worth keeping if it's actually true.**
  - L4/L5 sitting visibly off a body's own orbit ring is a direct
    readout of that body's eccentricity (they trace the same ellipse
    rotated 60°, not the same ring).
  - A fast-spinning periapsis marker on a near-circular orbit (e.g.
    Tethys, precession period ~1.8 days) indicates the periapsis
    direction is barely physically meaningful at that eccentricity,
    not a rendering error.
  - Pluto's Lagrange points briefly sitting inside Neptune's orbital
    ring reflects a real fact (Pluto's perihelion is closer to the Sun
    than Neptune's orbit) — the two don't collide only because of a
    real 3:2 resonance the model doesn't simulate.
- **Prefer subtraction/normalisation to compression when fixing
  dynamic range.** The instinct to squash a huge value range with a
  transfer curve (gamma, log, S-curve) was repeatedly the wrong tool;
  the fix was changing what's being measured (excluding a dominant
  term, scoping to the viewport, percentile-clipping, histogram
  equalisation against the actual sampled distribution).
- **Small, one-responsibility modules.** Compute and draw are kept
  separate; data and execution are kept separate (see Architecture).
  Direct response to `systems.js` becoming unwieldy once mass, radius,
  and link data were added.
- **No shared mutable derived state.** A per-frame-updated field
  (`body.omega`) produced a wrong position the moment something asked
  about a date other than "now" (a historical mission waypoint). The
  fix was removing the stored field entirely and recomputing
  precession from fixed inputs on every call, not maintaining the
  cache more carefully. See Section 6.
- **British English, ASCII only, ship in-chat.** No exotic tooling, no
  framework, everything runs from ES module script tags in a browser.

## 2. Architecture

| File | Responsibility |
|---|---|
| `core/orbits.js` | Pure orbital mechanics. Kepler's equation solver, `ellipseState`, vis-viva helpers (`orbitalSpeed`, `orbitPeriodYears`), precession maths. `ellipseState` takes a body's fixed `omegaBase`/`omegaDotRadPerYear` and a time `t`, computing the precessed angle internally on every call — no external "current" state to keep in sync. |
| `data/systems.js` | **Pure data, no execution.** `RAW_SYSTEMS` — one entry per system, one entry per body, raw sourced values only. Nothing in this file calls a function. |
| `state/systems-build.js` | The load step. Converts raw definitions into runtime bodies, storing only fixed precession inputs (`omegaBase`, `omegaDotRadPerYear`, `tp`) — no mutable "current angle". |
| `physics/worldpos.js` | Recursive world-position queries (`getSystemWorldOrigin`, `getBodyWorldPosition`), plus `getChildSystems`/`getPrimaryName`/`getSystemMaxOrbitRadius`. No rendering. |
| `core/lagrange.js` | Pure closed-form L1-L5 computation (first-order small-mass-ratio approximation) and `hillRadius`, given the secondary's state and mass ratio. No imports. L3 is at r(1 - 7q/12) from the primary; L4 leads in the body's direction of travel. |
| `physics/lagrange.js` | `getLagrangePointsWorld`: the mapState-bound wrapper that places the `core/lagrange.js` points in world coordinates. |
| `render/hillshade.js` | The gravitational terrain renderer — see Section 4. Pure computation into a pixel buffer. |
| `physics/route.js` | Route/delta-v planning. Walks the system tree to compute idealised Hohmann-transfer delta-v and transfer time between any two bodies at any two dates. See Section 6 for scope and known limitations. |
| `data/missions.js` / `state/missions-build.js` | Historical mission waypoint data (dates, target bodies) and its load step — same data/execution split as `systems.js`/`systems-build.js`. Waypoints validate against the real system tree at load; a bad `systemId`/`bodyId` pair fails loudly. |
| `state/routeLibrary.js` | Keyed collection of currently displayed routes (mission or manually planned), independently toggleable — more than one route can be shown at once. |
| `state/anim.js` | Generic single-pole exponential smoothing toward a moving target — every eased visual value (selection fade, camera zoom/pan) is one channel in a plain keyed collection. |
| `render/render.js` | The render half of the loop. All `ctx` calls live here. Draw primitives take explicit colours as parameters. Theme colours read once from CSS custom properties. Owns world-to-screen handedness: `drawMap` applies a negative y scale so world +y is up the screen (view from the north ecliptic pole, prograde anticlockwise); text drawn inside that transform counter-flips its own y scale. |
| `main.js` | UI wiring: camera pan/zoom/tracking, sidebar, date-jump, route-planner UI, the `requestAnimationFrame` loop. |
| `core/epoch.js` | Real-date ⇄ simulation-time conversion (`dateToSimTime`/`simTimeToDate`), anchored to J2000. |
| `theme.css` | Colour tokens as `:root` custom properties, shared by the map and the `learn/` pages. One known exception: route-marker colours in `routeLibrary.js` are plain hex. |
| `style.css` | Map layout only. |
| `learn/` | Static explainer pages (`keplers-equation/`, `lagrange-points/`). Page scripts import from `core/` and `data/` only, so the pages run the map's own maths without constructing `mapState`. `figure.js`: shared canvas helpers, y-up like the map. Exact reference solutions (collinear Lagrange roots, rotating-frame RK4) live in the page scripts, not in `core/`. |

The nested-system tree (`solar-system` → `jovian-system` → …) is a
scene graph: each system knows its parent and which body it's anchored
to. Recursive drawing uses `ctx.save/translate/scale/restore`,
mirroring the same recursion numerically in `worldpos.js` for camera,
Lagrange-point, and route-leg purposes. Adding a new body or moon
system is a pure data addition; adding a new historical mission is a
pure data addition in `missions.js`.

## 3. Data sources

- **Planets (Sun-orbiting, J2000 epoch elements):** Standish /
  *Explanatory Supplement to the Astronomical Almanac* (1992), a
  250-year least-squares Keplerian fit, accurate to ~25 arcsec for the
  inner planets. Secular centennial rate terms not included. Pluto's
  elements come from the same table.
- **Satellites (moons):** JPL "Planetary Satellite Mean Elements,"
  <https://ssd.jpl.nasa.gov/sats/elem/> and
  <https://ssd.jpl.nasa.gov/sats/elem/sep.html>. All epoch 2000-01-01.5
  TDB. The `Papsis` column (apsidal precession period, years) is the
  sourced basis for the precession feature. Precession direction
  assumed prograde — not independently verified per body.
- **Known discrepancy, unresolved:** the Moon's apsidal precession is
  commonly cited elsewhere as ~8.85 years; the JPL table gives
  `Papsis = 5.997` years. Flagged rather than silently reconciled.
- **Asteroids/dwarf planets:** `a`/`e` from general web search,
  reasonable-confidence, not JPL-table-sourced. `omega`/`tp` still
  placeholders except Pluto.
- **Comets:** approximate published `a`/`e`, chosen for low
  inclination (under ~12°) to satisfy the no-high-inclination rule.
- **Mass ratios:** reasonable-effort figures derived from published
  masses, not independently re-verified against one table.
- **Mission waypoints (dates, target bodies):** JPL/NASA mission
  pages. Delta-v per leg is computed (Hohmann), not taken from
  published mission budgets — expected to disagree where a real
  mission used a gravity assist; see Section 6.
- **Links:** `links.wiki` stored per body to route around Wikipedia
  disambiguation pages.

## 4. The gravitational terrain — decision history

The Interplanetary Transport Network idea (Lagrange points, invariant
manifolds, zero-velocity curves) belongs to the circular restricted
three-body problem, evaluated in a frame co-rotating with one specific
primary/secondary pair — correct for one pair at a time, never a
combined whole-system view, since different pairs rotate at different
rates.

The alternative: sum plain Newtonian potential (`-GM/r` per body) over
however many bodies are in view. Combines any number of bodies on one
set of axes, since nothing depends on a rotating frame. Trade-off:
L4/L5 never appear special here, since without the centrifugal term
they aren't real equilibria in an inertial frame — separately overlaid
using the already-computed Lagrange points.

First attempt — isolines/contours of raw potential — failed
repeatedly: potential spans orders of magnitude (Jupiter's GM vs. a
moon's), so any contour-level set is dominated by whichever mass is
biggest in view, regardless of spacing (linear, log, percentile-
clipped). Absolute potential depth scales with mass; there is no way
to normalise that away without changing what's being measured.

The break: a well's bottom (zero gradient) is the same shape regardless
of depth — a moon's well is as flat at its own centre as Jupiter's is
at its. This motivated excluding the dominant primary from the sum for
a given local view, producing real, un-hacked local topography. Three
things tried and rejected along the way:
- Per-body local contour halos avoided the dominance problem but
  reintroduced a softening/units bug for small bodies and still
  couldn't show a planet and its moon on equal footing.
- Gradient magnitude falls off faster than potential (1/r² vs 1/r),
  making it more, not less, dominated by the nearest large mass.
- Marching-squares contouring had a genuine edge-adjacency indexing
  bug for single-corner cases, unrelated to the dynamic-range problem.

Final architecture — per-pixel hillshade, not vector isolines. At
every pixel: compute summed potential and its analytic gradient, then:
1. Percentile-clip the sampled magnitude range so no near-singularity
   pixel crushes the frame's contrast.
2. Histogram-equalise every frame — a flat, fully-used colour range
   regardless of absolute scale, adapting automatically to whatever's
   in view.
3. Multi-hue colour ramp (violet → blue → teal → green → yellow →
   orange → white) rather than single-hue lightness, so the terrain
   reads as coloured, not merely light/dark.
4. Lambertian hillshading on top, using the same analytic gradient as
   a surface normal against a fixed light direction.
5. Optional "exclude primary" toggle, tied to the tracked system:
   removes the dominant central mass from the summed field for that
   render pass.

Net effect: one scalar field (real physics, no rotating-frame
approximation), rendered through a pipeline that adapts its own
contrast to whatever's in view.

## 5. Goals and values of the developer, as understood

- **Enjoys the process of getting physics right as much as the visual
  payoff** — repeatedly chased a correct explanation (why L4/L5 don't
  sit on the ring, why precession is real, why gravity's potential is
  negative) over a plausible-looking shortcut.
- **Distrusts unlabelled precision.** Called out "random numbers" and
  asked, unprompted, where real data could be sourced.
- **Wants honest gaps over false completeness.** Comfortable leaving
  something flagged as "not yet sourced" rather than filling it with
  an invented number.
- **Values legibility and debuggability as design goals.** Asked for
  a live histogram overlay specifically to stop guessing at fixes
  blindly.
- **Cares about code shape, not just output.** Pushed for
  data/execution separation, compute/draw separation, and named
  "one responsibility per function" as an explicit preference.
- **Wants the simulation to double as a teaching tool.** Repeatedly
  interested in why something looks the way it does, not only in
  making it look right.
- **Enthusiasm for scale and real oddities** — wanted Sedna, Nereid's
  extreme eccentricity, and Pluto–Neptune's crossing orbits because
  they're strange, real, and checkable.
- **A working, calm, ambient end state matters** — the real-time
  playback idea, framed as wanting a "screensaver."
- **Wants a stateless core.** Given a choice between maintaining a
  more carefully-updated cache and removing the cache entirely, chose
  removal — a shared mutable field is a source of exactly this class
  of bug regardless of how diligently it's kept in sync.

## 6. Route/delta-v planning — scope and decision history

Delta-v was chosen over energy (joules) as the base currency: it's
mass-independent, a property of the trajectory rather than the
spacecraft. Converting to fuel mass via the rocket equation is a
deliberately separate, not-yet-built layer.

**Why cost to a specific moon differs from cost to its planet.** A
journey to Titan is a nested sequence, not one transfer: an outer
heliocentric leg to Saturn's orbital radius (identical for every
Saturnian moon), then an inner leg from Saturn's Hill-radius edge down
to Titan's own orbital radius around Saturn (where different moons
genuinely diverge). `route.js` walks the system tree one level per
leg for this reason, rather than treating "arrive at Saturn" and
"arrive at Titan" as the same event.

**Why the common-ancestor walk needed a direct-primary case.** The
general tree walk assumes departure and arrival are siblings or
cousins converging on a shared ancestor above both. It has no case for
one endpoint being the other's primary (Earth is the body
`terran-system` is anchored to) — applied without this case, it
computed the cost of the Moon escaping past its own orbit to Earth's
Hill-sphere edge, a real number answering the wrong question.
`isDirectPrimaryOf`/`buildPrimaryLocalRoute` handle this relationship
explicitly.

**Why parking orbits live on the waypoint, not the body.** A parking
orbit's altitude is a mission choice (Apollo used ~190 km; another
mission could choose differently), not a property of the body the way
`a`/`e` are. Stored per-waypoint (`parkingOrbitAltitudeKm`,
`parkingOrbitRevolutions`), computed against the body's real
`radiusKm` only where entered — absent either, the leg reports as not
yet computable.

**Why gravity assists are out of scope.** A flyby's delta-v benefit
only appears in the frame where the flown-by body is itself moving,
requiring velocity vectors and a three-body treatment — neither
exists here. Every figure is the idealised, no-assist cost of a leg;
the gap against a real mission's lower, assisted delta-v is the
intended validation check, not a bug to close.

**Why the drawn route is a straight connector, not a solved arc.** Two
real, correctly-dated positions are known; the true connecting orbit
between them (Lambert's problem) is not solved. The line is a
topological connector in the spirit of a delta-v transit diagram, not
a trajectory — it will not curve, and will not necessarily terminate
exactly on the destination marker even when both positions are
individually correct.
