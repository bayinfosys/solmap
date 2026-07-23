import { mapState } from './state.js';


// Generic single-pole exponential smoothing toward a moving target -
// the one mechanism behind every eased visual value in this app
// (selection fade, camera zoom, camera pan-offset decay, and whatever
// comes next). A channel is identified by an arbitrary string key and
// stores { value, target, tauSec } in mapState.anim.channels. This file
// has no knowledge of what a channel MEANS - callers decide that by
// choosing keys and targets; this just chases.
//
// tauSec is a time CONSTANT, not a fixed duration: value closes ~63% of
// the remaining gap to target every tauSec seconds, asymptotically -
// there's no exact "done" moment (see advanceAnim's cleanup rule below
// for how a fade-to-zero channel still gets tidied up).

// Sets a channel's target (and optionally its rate). If the channel
// doesn't exist yet, it's created - starting at `initialValue` if given
// (e.g. 0, so a first-ever selection fades in rather than snapping),
// otherwise starting AT the target (i.e. no animation on first use,
// a sensible default for channels like camera zoom that are explicitly
// seeded elsewhere via animSetValue before this is ever called).
export function animSet(key, target, tauSec, initialValue) {
  const channels = mapState.anim.channels;
  const ch = channels[key];
  if (!ch) {
    channels[key] = { value: initialValue !== undefined ? initialValue : target, target: target, tauSec: tauSec };
  } else {
    ch.target = target;
    if (tauSec !== undefined) ch.tauSec = tauSec;
  }
}

// Force-sets both value and target directly, cancelling any in-flight
// chase. Used for direct manipulation (dragging) and one-time seeding
// (initial camera state) where "instant, no lag" is the correct
// behaviour rather than easing.
export function animSetValue(key, value, target, tauSec) {
  mapState.anim.channels[key] = { value: value, target: target, tauSec: tauSec };
}

export function animGet(key, defaultValue) {
  const ch = mapState.anim.channels[key];
  return ch ? ch.value : (defaultValue !== undefined ? defaultValue : 0);
}

export function animGetTarget(key, defaultValue) {
  const ch = mapState.anim.channels[key];
  return ch ? ch.target : (defaultValue !== undefined ? defaultValue : 0);
}

// Advances every channel by dtMs. Channels chasing a target of exactly
// 0 are deleted once close enough - this is what lets fade-out channels
// (e.g. a body deselected once and never selected again) self-clean
// rather than accumulating forever across a long session. Channels with
// a nonzero target (camera zoom, an always-relevant value) are kept
// indefinitely, which is correct - they're not "finished", they're just
// at rest.
export function advanceAnim(dtMs) {
  const dt = dtMs / 1000;
  const channels = mapState.anim.channels;
  for (const key in channels) {
    const ch = channels[key];
    const k = 1 - Math.exp(-dt / ch.tauSec);
    ch.value += (ch.target - ch.value) * k;
    if (ch.target === 0 && Math.abs(ch.value) < 0.002) delete channels[key];
  }
}
