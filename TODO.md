# TODO

## Done

- Map orientation: viewed from the north ecliptic pole, prograde
  anticlockwise (render.js y-flip; labels, hillshade and drag follow).
- L4/L5 follow the body's direction of travel (Triton).
- L3 measured from the primary at r(1 - 7q/12).
- Lagrange points drawn again (`lagrangeEnabledn` typo).
- Explainer pages: Kepler's equation; Lagrange points and Hill spheres.

## Next

1. Moon position. At the solar eclipses of 1999-08-11 and 2026-08-12
   the Moon's elongation from the Sun is 246 and 278 degrees; it should
   be near 0. Carry the sourced mean motion through `ellipseState`, add
   the node term, and treat JPL's Moon `papsisYears` (5.997 yr) as
   measured from the node: 1/(1/8.85 + 1/18.6) = 5.997.
2. View state in the URL (`?date=&body=&zoom=`), so pages, missions
   and events can link into a specific view.
3. Missions and events library: Apollo 10 (1969-05-18 launch,
   05-21 lunar orbit insertion, 05-26 splashdown) alongside Apollo 8 and
   Voyager 1; oppositions, conjunctions, greatest elongations, Sun-Earth-
   Moon alignments. The flat model shows alignment only, never whether
   an eclipse or transit occurs.
4. Further explainer pages: apsidal precession; gravitational potential
   terrain; coordinate frame and orientation; Hohmann transfers and
   delta-v.
5. Domain decision, then: CNAME, canonical/og/JSON-LD/sitemap URLs,
   `robots.txt` with `Sitemap:` line, Search Console property, JSON-LD
   `creator`, project card and article on bayis.co.uk.

## Housekeeping

- README and OVERVIEW section 4 describe histogram equalisation for the
  terrain view; the code uses a percentile-clipped log scale. Decide
  which is current.
- Non-ASCII characters (en/em dashes, arrows) in README and OVERVIEW.
- `getLagrangePointsWorld` (physics/lagrange.js) has no callers.
- `state.js` still carries `lagrangeEnabled`, superseded by
  `displayOptions.lagrangeEnabled`.
- At some zooms the "triangle side" chip covers the L4 label.
