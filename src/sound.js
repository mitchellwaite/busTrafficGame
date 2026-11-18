// Sound effects, synthesized with Web Audio (like the art, nothing to load). Browsers only allow audio after the
// player taps, so the context is created on the first sound, which always comes from a tap. iOS only counts a
// finished tap (touchend / click), not a touch-down, so those also unlock it: at worst the very first boop waits for
// the finger to lift.
let ac = null
for (const type of ['touchend', 'click']) addEventListener(type, () => audio(), { capture: true, passive: true })

function audio() {
  try {
    // latencyHint 0 = the smallest buffer the device allows. Chrome on Windows: ~11 ms to the speakers instead of the
    // default ('interactive') ~50 ms. These few oscillators are far too light to stutter at that size.
    ac ??= new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 0 })
    if (ac.state === 'suspended') ac.resume()
    return ac
  } catch {
    return null // no Web Audio: the game just stays silent
  }
}

// One note `at` s from now: pitch f gliding to `to`, held then faded. lp = a "wah" low-pass that opens and closes;
// wobble = vibrato depth in Hz.
function note(f, at, dur, { type = 'sine', vol = 0.2, to = f, lp = 0, wobble = 0 } = {}) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (to !== f) o.frequency.exponentialRampToValueAtTime(to, t + dur)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.003) // full volume almost at once; 3 ms is just enough to avoid a click
  g.gain.setValueAtTime(vol, t + dur * 0.6)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  let out = o
  if (lp) {
    out = a.createBiquadFilter()
    out.type = 'lowpass'
    out.frequency.setValueAtTime(lp, t)
    out.frequency.linearRampToValueAtTime(lp * 3, t + dur * 0.3)
    out.frequency.linearRampToValueAtTime(lp, t + dur)
    o.connect(out)
  }
  if (wobble) {
    const lfo = a.createOscillator(), depth = a.createGain()
    lfo.frequency.value = 5
    depth.gain.value = wobble
    lfo.connect(depth).connect(o.frequency)
    lfo.start(t)
    lfo.stop(t + dur)
  }
  out.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}

// A short bubbly drop in pitch, for a bus that drives off.
export const boop = () => note(660, 0, 0.11, { to: 330, vol: 0.3 })

// A low, rough buzzer (two slightly detuned square waves), for a bus that can't get out.
export function buzz() {
  note(110, 0, 0.28, { type: 'square', vol: 0.09 })
  note(116, 0, 0.28, { type: 'square', vol: 0.09 })
}

// A rising C-major arpeggio, the top note held.
export const win = () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.1, i < 3 ? 0.14 : 0.5, { type: 'triangle', vol: 0.25 }))

// Sad trombone: three falling "wah"s a semitone apart, then a long wobbly one.
export function lose() {
  const brass = { type: 'sawtooth', vol: 0.14, lp: 450 }
  ;[293.66, 277.18, 261.63].forEach((f, i) => note(f, i * 0.5, 0.45, brass))
  note(246.94, 1.5, 1.4, { ...brass, wobble: 5 })
}
