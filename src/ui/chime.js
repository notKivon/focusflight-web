// Arrival chime, generated with the Web Audio API — no audio file ships.
// Two sine notes a fifth apart, each with a soft attack and a long decay.
//
// The context is created per chime and closed once the sound has finished, so
// nothing holds the audio hardware open for the length of a focus session.

const NOTES = [
  { frequency: 880, at: 0, duration: 0.9 }, // A5
  { frequency: 1318.51, at: 0.18, duration: 1.2 }, // E6
];

const TAIL_MS = 1600;
const PEAK = 0.18;
const ATTACK = 0.02;
const SILENCE = 0.0001; // exponential ramps cannot reach zero

/** The browser's AudioContext, or null where there isn't one. */
export function defaultContext() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/**
 * Plays the chime. Never throws: a missing, blocked or suspended audio context
 * simply means no sound, which must not take the arrival screen down with it.
 *
 * @param {{createContext?: () => object|null, volume?: number}} [options]
 * @returns {object|null} the context that is playing, for tests
 */
export function playChime({ createContext = defaultContext, volume = PEAK } = {}) {
  let ctx = null;
  try {
    ctx = createContext();
    if (!ctx) return null;
    ctx.resume?.();

    const start = ctx.currentTime;
    for (const note of NOTES) {
      const at = start + note.at;
      const end = at + note.duration;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.frequency, at);
      gain.gain.setValueAtTime(SILENCE, at);
      gain.gain.linearRampToValueAtTime(volume, at + ATTACK);
      gain.gain.exponentialRampToValueAtTime(SILENCE, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(end);
    }

    setTimeout(() => {
      try {
        ctx.close?.();
      } catch {
        /* already closed */
      }
    }, TAIL_MS);
    return ctx;
  } catch {
    return null;
  }
}
