# Orbital Map / Gravitational Terrain Explorer — Project Summary

A browser-based, physically-grounded map of the solar system: real orbital
mechanics, real Lagrange points, and a per-pixel visualisation of
gravitational topography. Built as a chain of small, honestly-scoped
iterations rather than one upfront design — this document distills what
actually stuck.

## 1. Development principles

These are the standards the project kept returning to, often after a
wrong turn made them explicit.

- **Real physics over plausible physics.** Every number either comes from
  a real source (JPL, Standish table) or is explicitly flagged as a
  placeholder. No silently-invented constants — when a value had to be a
  guess (early moon `omega` values, mass ratios estimated from public
  figures), it was labelled as such in code comments rather than
  presented as equivalent to sourced data.
- **Simplifications are named, not hidden.** The model is flat (no
  inclination), uses independent two-body Kepler ellipses (no mutual
  perturbation between sibling bodies, no true n-body), and treats
  Pluto–Charon as an ordinary primary/secondary pair despite Charon's
  mass being ~12% of Pluto's (a real binary system, approximated on
  purpose). Each of these is a deliberate, stated trade-off — the goal
  isn't to hide the seams, it's to know exactly where they are.
- **Exclude anything that can't be represented honestly.** A hard rule
  emerged: don't include bodies whose real inclination is high enough
  that flattening them into the ecliptic plane would misrepresent them
  more than it illustrates them. This ruled out Pallas, Eris, Makemake,
  Haumea, Halley, and Hale-Bopp — all genuinely inclined by tens of
  degrees to over 90° — in favour of lower-inclination alternatives
  (Juno, Sedna, Quaoar, Encke, 67P, Wild 2) that tell a similar story
  without the distortion.
- **A visual artefact is worth keeping if it's actually true.** Several
  things that initially looked like bugs turned out to be correct
  physics, and became intentional features once understood:
  - L4/L5 sitting visibly off a body's own orbit ring is a direct,
    accurate readout of that body's eccentricity (they trace the same
    ellipse *rotated 60°*, not the same ring — the gap is real).
  - A fast-spinning periapsis marker on a near-circular orbit (e.g.
    Tethys, precession period ~1.8 days) is an honest indicator that the
    periapsis direction is barely physically meaningful at that
    eccentricity, not a rendering error.
  - Pluto's Lagrange points briefly sitting inside Neptune's orbital ring
    reflects a real fact (Pluto's perihelion is closer to the Sun than
    Neptune's orbit) — the two don't collide only because of a real 3:2
    orbital resonance the model doesn't simulate.
- **Prefer subtraction/normalisation to compression when fixing dynamic
  range.** Repeatedly, the instinct to "squash" a huge value range with a
  transfer curve (gamma, log, S-curve) turned out to be the wrong tool;
  the right fix was almost always changing *what's being measured*
  (excluding a dominant term, scoping to the current viewport,
  percentile-clipping, histogram equalisation against the actual sampled
  distribution).
- **Small, one-responsibility modules.** Compute and draw are kept
  separate (pure functions returning numbers vs. functions that take an
  explicit colour and touch `ctx`). Data and execution are kept separate
  (see Architecture). This was a direct response to `systems.js`
  becoming unwieldy once mass, radius, and link data were added.
- **British English, ASCII only, ship in-chat.** Consistent throughout —
  no exotic tooling, no framework, everything runs from plain script tags
  in a browser.

## 2. Architecture

The final split, after a deliberate refactor:

| File | Responsibility |
|---|---|
| `orbits.js` | Pure orbital mechanics. Kepler's equation solver, `ellipseState`, vis-viva helpers, precession maths (`keplerElementsFromEpochWithPrecession`). No knowledge of rendering or the map's data shape. |
| `systems.js` | **Pure data, no execution.** `RAW_SYSTEMS` — one entry per system, one entry per body, raw sourced values only (`aKm`/`a`, `e`, `omega0`, `M0` or `L0`, `papsisYears`, `massRatio`, colour, links). `LAYER_DEFAULTS`. Nothing in this file calls a function. |
| `systems-build.js` | The "load" step. `buildBody`/`buildSystem`/`buildAllSystems` convert raw definitions into runtime bodies (real `omega`/`tp`/precession rate computed once). Constructs the actual `mapState` object. Also holds the small query helpers (`getChildSystems`, `getPrimaryName`, `getSystemMaxOrbitRadius`) since they operate on state rather than define it. |
| `physics.js` | The **update** half of a classic game loop. `advancePrecession(t)` recomputes each precessing body's live `omega` from its fixed epoch value each frame, writing back into `mapState`. Everything downstream just reads `body.omega` as an already-current plain value. |
| `worldpos.js` | Recursive world-position queries (`getSystemWorldOrigin`, `getBodyWorldPosition`) — walks the nested system tree, no rendering. |
| `lagrange.js` | Closed-form L1–L5 computation (Hill-sphere approximation) for any primary/secondary pair, given the secondary's current state and mass ratio. |
| `hillshade.js` | The gravitational terrain renderer — see Section 4. Pure computation into a pixel buffer. |
| `render.js` | The **render** half of the loop. All `ctx` calls live here. Draw primitives (`drawOrbitRing`, `drawDiamond`, `drawLabelChip`, etc.) take explicit colours as parameters rather than relying on caller-set `ctx` state. Theme colours are read once from CSS custom properties. |
| `main.js` | UI wiring: camera pan/zoom/tracking, sidebar, date-jump, the actual `requestAnimationFrame` loop (calls physics update, then draw). |
| `epoch.js` | Real-date ⇄ simulation-time conversion (`dateToSimTime`/`simTimeToDate`), anchored to J2000. |
| `style.css` | All colour values as `:root` custom properties — no hardcoded hex in JS. |

The nested-system tree (`solar-system` → `jovian-system` → …) is a scene
graph: each system knows its parent and which body it's anchored to.
Recursive drawing uses `ctx.save/translate/scale/restore`, mirroring the
same recursion numerically in `worldpos.js` for camera and Lagrange-point
purposes. Adding a new body or a whole new moon system is a pure data
addition — nothing structural needs to change, which was the explicit
bet the architecture made and the thing most repeatedly confirmed to
still hold.

## 3. Data sources

- **Planets (Sun-orbiting, J2000 epoch elements — `a`, `e`, mean
  longitude, longitude of perihelion):** Standish / *Explanatory
  Supplement to the Astronomical Almanac* (1992), a 250-year
  least-squares Keplerian fit, accurate to ~25 arcsec for the inner
  planets. Does **not** include the secular centennial rate terms JPL
  also publishes — accuracy is good for decades either side of 2000 and
  gradually loosens further out. Pluto's elements come from the same
  table.
- **Satellites (moons — `a`, `e`, argument of periapsis, mean anomaly,
  apsidal precession period):** JPL "Planetary Satellite Mean Elements,"
  <https://ssd.jpl.nasa.gov/sats/elem/> (main table) and
  <https://ssd.jpl.nasa.gov/sats/elem/sep.html> (grouped by planet — used
  to retrieve Uranus/Neptune/Pluto satellites after the main table was
  truncated). All epoch 2000-01-01.5 TDB. This table explicitly models
  each moon as a *precessing ellipse* fit in a least-squares sense to the
  true numerically-integrated orbit — the `Papsis` column (apsidal
  precession period, years) is the real, sourced basis for the
  precession feature. Precession **direction** is assumed prograde
  (standard for low-inclination J2-driven precession) — not
  independently verified per body, since the source gives magnitude/
  period only.
- **Known discrepancy, unresolved:** the Moon's apsidal precession is
  commonly cited elsewhere as an ~8.85-year cycle; the JPL table gives
  `Papsis = 5.997` years. Not reconciled — flagged rather than silently
  picking one.
- **Asteroids/dwarf planets (Ceres, Vesta, Hygiea, Juno, Sedna, Quaoar):**
  `a`/`e` from general web search, reasonable-confidence but not
  JPL-table-sourced the way planets/moons are. `omega`/`tp` for these are
  still placeholders (except Pluto, which is a full planet-table entry).
  Explicitly the next candidate for a proper sourcing pass.
- **Comets (Encke, 67P/Churyumov–Gerasimenko, Wild 2):** approximate
  published `a`/`e`, chosen specifically for **low inclination** (all
  under ~12°) to satisfy the no-high-inclination rule — Halley (~162°)
  and Hale-Bopp (~89°) were deliberately excluded despite being more
  famous.
- **Mass ratios:** reasonable-effort figures derived from published
  masses, not independently re-verified against a single authoritative
  table — flagged as a category, not silently trusted as equal to the
  JPL orbital data.
- **Links:** `links.wiki` stored per body specifically to route around
  Wikipedia disambiguation pages (e.g. `Mercury_(planet)`, not `Mercury`).

## 4. The gravitational terrain — full decision history

This is the part worth narrating in order, because every stage was a
real, reasoned rejection of the previous one, not a random walk.

**The starting idea (early on):** the Interplanetary Transport Network —
Lagrange points, invariant manifolds, zero-velocity curves — belongs to
the **circular restricted three-body problem (CR3BP)**, evaluated in a
frame *co-rotating* with one specific primary/secondary pair. This is
"Option A." It correctly reproduces L4/L5 as real equilibria, but only
because of a fictitious centrifugal term valid in exactly one rotating
frame — meaning it can only ever describe **one pair at a time**, never
a combined whole-system view. Sun–Jupiter's picture and Sun–Earth's
picture literally cannot be drawn on the same axes, since they rotate at
different rates.

**"Option B"** was proposed as the alternative: drop the rotating-frame
fiction entirely and sum plain, real Newtonian potential
(`-GM/r` per body) over however many bodies are in view. This *can*
combine an arbitrary number of bodies on one set of axes, because
nothing about it depends on a choice of rotating frame. The honest
trade-off, understood from the start: it will never show L4/L5 as
special, because without the centrifugal term they aren't real
equilibria in an inertial frame — just ordinary points where gravity
happens to provide exactly the right centripetal force for orbital
motion (a fact worth keeping, and separately visualised by overlaying
the already-computed Lagrange points on top of this field).

**First attempt — isolines/contours of raw potential.** This repeatedly
hit the same failure: potential spans many orders of magnitude (Jupiter's
GM vs. a moon's), so any single set of contour levels is dominated by
whichever mass is biggest in view — a small body's real local structure
(a moon's own well, its own Lagrange points) was invisible next to its
planet, no matter how the levels were spaced (linear, log, percentile-
clipped). Root cause was genuine and instructive: **absolute potential
depth scales with mass, and there is no way to normalise that away
without changing what's being measured.**

**The insight that broke the deadlock:** the *shape* of a well's bottom
(zero gradient) is the same in kind regardless of how deep the well is —
a small moon's well is just as flat at its own centre as Jupiter's is at
its. This suggested gradient-based approaches, and ultimately motivated
excluding the dominant primary from the sum entirely for a given local
view — "Option B, minus the system's own primary" — which produced the
first genuinely good result: real, un-hacked topography of a moon's own
gravitational neighbourhood, visible without descending into a nested
per-system view. This was independently the point where per-body
"halo" contouring, gradient fields, and colour-based rendering were all
tried and each taught something:
- **Per-body local contour halos** (separate level sets per body, sized
  to each body's own Hill radius) correctly avoided the dominance
  problem but reintroduced a units/quadtree bug (softening scaled wrong
  for small bodies) and, more importantly, still couldn't show Jupiter
  and a moon on equal footing — the actual ask.
- **Gradient magnitude** was tried and *rejected*: gradient falls off
  even faster than potential (1/r² vs 1/r), so it was, if anything, more
  dominated by the biggest nearby mass, not less. A real correction, not
  a refinement.
- **Marching-squares contouring** had a genuine, confirmed indexing bug
  (edge-adjacency table wired wrong for the single-corner cases) —
  found and fixed by inspection, unrelated to the deeper dynamic-range
  problem, but a good example of separating "is the maths right" from
  "is the visualisation right."

**Final architecture — per-pixel hillshade, not vector isolines.** The
decisive move was abandoning discrete contour lines (which require
choosing levels — the actual source of every dynamic-range failure) for
a **dense, per-pixel raster**: at every pixel, compute the true summed
potential and its analytic gradient, then:
1. **Percentile-clip** the sampled magnitude range (ignore the extreme
   few percent) so no single near-singularity pixel (e.g. directly under
   a tracked body) can crush the whole frame's contrast.
2. **Histogram-equalise** the resulting values every frame — build a CDF
   from what's actually present in the current view and use it as the
   colour-mapping function. This *guarantees* a flat, fully-used colour
   range regardless of absolute scale, adapting automatically whether
   the view is the whole solar system or a single Earth–Moon close-up.
   This directly replaced earlier, less robust gamma/log/exponential
   tone-curve attempts once it became clear the real need was "spread
   whatever's actually here across the full range," which is precisely
   what equalisation is *for*.
3. **Multi-hue colour ramp** (violet → blue → teal → green → yellow →
   orange → white) rather than a single-hue lightness ramp — a
   single-hue ramp reads as grey regardless of the numbers underneath;
   genuine hue variation is what makes the terrain read as *coloured*
   rather than merely light/dark.
4. **Lambertian hillshading** on top, using the same analytic gradient
   as a surface normal against a fixed light direction — this is what
   gives the terrain its embossed, OS-map-like relief character, and is
   entirely separate from the colour-mapping step (shading answers "how
   steep, which way," colour answers "how deep").
5. **Optional "exclude primary"** toggle, tied to the currently tracked
   system: literally removes the dominant central mass from the summed
   field for that render pass. This was the single most-liked result in
   the whole feature — real local structure (a moon's own well, visible
   perturbation from its own small companions) with nothing subtracted
   except the one term that was never the point of looking in the first
   place.

Net effect: one scalar field (real physics, no rotating-frame
approximation), rendered through a pipeline that adapts its own contrast
to whatever's actually in view, rather than a fixed transform tuned for
one scale that inevitably fails at another.

## 5. Goals and values of the developer, as understood

- **Enjoys the *process* of getting physics right as much as the visual
  payoff** — repeatedly chose to chase down a correct explanation (why
  L4/L5 don't sit on the ring, why precession is real, why gravity's
  potential is negative) over accepting a plausible-looking shortcut.
- **Distrusts unlabelled precision.** Explicitly called out "random
  numbers" and asked, unprompted, where real data could be sourced —
  the JPL satellite-elements table was found *because* a placeholder
  was rejected rather than accepted.
- **Wants honest gaps over false completeness.** Repeatedly comfortable
  leaving something flagged as "not yet sourced" (Ceres's omega, Uranus's
  moon precession before it was found, mass/radius fields) rather than
  filling it with an invented number.
- **Values legibility and debuggability as design goals in their own
  right** — asked for a live histogram overlay specifically to stop
  guessing at fixes blindly; asked for a quadtree debug view (later
  dropped once deemed no longer necessary, but the instinct to *see the
  algorithm's own working* recurred throughout).
- **Cares about code shape, not just output** — pushed for
  data/execution separation in `systems.js`, compute/draw separation in
  `render.js`, and named "one responsibility per function" as an
  explicit preference rather than something to infer.
- **Wants the simulation to double as a teaching tool** — repeatedly
  interested in *why* something looks the way it does (precession,
  Lagrange geometry, the residual-field view) rather than only in
  making it look right.
- **Enthusiasm for scale and real oddities** — actively wanted Sedna,
  Nereid's extreme eccentricity, and Pluto–Neptune's crossing orbits
  specifically *because* they're strange, real, and checkable, not
  despite it.
- **A working, calm, ambient end state matters** — the real-time (1:1)
  playback idea, explicitly framed as wanting a "screensaver," suggests
  the tool is meant to be something pleasant to leave running and watch,
  not only a technical instrument.
