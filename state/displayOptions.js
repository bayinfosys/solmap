// state/displayOptions.js
// Display-only toggles: what's drawn on screen, never simulation state.
// Distinct from mapState (t, camera, selected, anim.channels) - nothing
// here affects physics or the sim clock, only whether something is
// rendered. Read directly by render.js at each label's own draw call;
// written by main.js's checkbox handlers, or edited here directly as a
// default and reloaded (e.g. to strip labels for a recording, without
// touching the UI at all).
//
// A fresh object per load - never a shared reference to a data-module
// default (see the LAYER_DEFAULTS aliasing note in state.js/systems.js
// for why a shared reference is the wrong pattern here).
export const displayOptions = {
  // Consolidated from mapState.layers / mapState.lagrangeEnabled -
  // same category of thing (a named, fixed display toggle), now in
  // one place instead of split across three mechanisms.
  hillshade: false,
  hillshadeHistogram: false,
  hillshadeResidual: true,
  lagrangeEnabled: true,

  // Per-visual-element label flags. Each gates ONLY the label chip/text
  // for that element - markers, geometry, and lines it sits next to
  // (diamonds, Lagrange triangles, the live-distance line itself) are
  // unaffected and keep drawing regardless, so turning labels off never
  // removes the underlying visual, only its caption.
  orbitLabels: true,
  lagrangeLabels: true,
  liveDistanceLabel: true,
  routeLabels: true,
  bodyNameLabels: true
};
