// state/routeLibrary.js
// A small library of independently-toggleable displayed routes, so more
// than one route/mission can be shown on the map at once (e.g. Cassini's
// arrival at Saturn alongside Voyager 1's position on the same date).
// Mirrors anim.js's own shape: a plain keyed collection, with get/set
// helper functions operating on it - callers never touch the
// collection's internal shape directly.

const ROUTE_COLORS = ['#ffb347', '#55ffdd', '#ff6b9d', '#a0e8a0', '#c0a0ff', '#ffe066'];

export function createRouteLibrary() {
  return { entries: {}, nextColorIndex: 0 };
}

// Adds or replaces a named entry. Re-setting an existing id keeps its
// original colour and visibility rather than resetting them, so
// re-picking the same mission doesn't hide it or reshuffle colours.
export function setRoute(library, id, label, points) {
  const existing = library.entries[id];
  const color = existing ? existing.color : ROUTE_COLORS[library.nextColorIndex % ROUTE_COLORS.length];
  const visible = existing ? existing.visible : true;
  if (!existing) library.nextColorIndex++;
  library.entries[id] = { id: id, label: label, points: points, visible: visible, color: color };
}

export function removeRoute(library, id) {
  delete library.entries[id];
}

export function setRouteVisible(library, id, visible) {
  if (library.entries[id]) library.entries[id].visible = visible;
}

export function getVisibleRoutes(library) {
  const out = [];
  for (const id in library.entries) {
    if (library.entries[id].visible) out.push(library.entries[id]);
  }
  return out;
}
