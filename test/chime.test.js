import { describe, it, expect, vi, afterEach } from 'vitest';
import { playChime } from '../src/ui/chime.js';

/** A recording stand-in for AudioContext: every node logs what it was told. */
function fakeContext({ currentTime = 0 } = {}) {
  const oscillators = [];
  const gains = [];
  const ctx = {
    currentTime,
    destination: { id: 'destination' },
    closed: false,
    resumed: false,
    resume: () => {
      ctx.resumed = true;
    },
    close: () => {
      ctx.closed = true;
    },
    createOscillator() {
      const osc = {
        type: null,
        connectedTo: null,
        started: null,
        stopped: null,
        frequency: { calls: [], setValueAtTime: (v, t) => osc.frequency.calls.push([v, t]) },
        connect: (node) => {
          osc.connectedTo = node;
        },
        start: (t) => {
          osc.started = t;
        },
        stop: (t) => {
          osc.stopped = t;
        },
      };
      oscillators.push(osc);
      return osc;
    },
    createGain() {
      const gain = {
        connectedTo: null,
        gain: {
          calls: [],
          setValueAtTime: (v, t) => gain.gain.calls.push(['set', v, t]),
          linearRampToValueAtTime: (v, t) => gain.gain.calls.push(['linear', v, t]),
          exponentialRampToValueAtTime: (v, t) => gain.gain.calls.push(['exp', v, t]),
        },
        connect: (node) => {
          gain.connectedTo = node;
        },
      };
      gains.push(gain);
      return gain;
    },
    oscillators,
    gains,
  };
  return ctx;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('playChime', () => {
  it('plays two sine notes a fifth apart, wired through gain to the output', () => {
    const ctx = fakeContext();
    playChime({ createContext: () => ctx });

    expect(ctx.resumed).toBe(true);
    expect(ctx.oscillators).toHaveLength(2);
    const [first, second] = ctx.oscillators;
    expect(first.type).toBe('sine');
    expect(second.type).toBe('sine');
    expect(first.frequency.calls[0][0]).toBe(880);
    expect(second.frequency.calls[0][0]).toBeCloseTo(1318.51, 2);
    // Each oscillator goes through its own gain, and the gain to the destination.
    expect(first.connectedTo).toBe(ctx.gains[0]);
    expect(ctx.gains[0].connectedTo).toBe(ctx.destination);
  });

  it('gives every note an attack and a decay, and stops it again', () => {
    const ctx = fakeContext({ currentTime: 12 });
    playChime({ createContext: () => ctx, volume: 0.2 });

    for (const gain of ctx.gains) {
      const kinds = gain.gain.calls.map((call) => call[0]);
      expect(kinds).toEqual(['set', 'linear', 'exp']);
      expect(gain.gain.calls[1][1]).toBe(0.2); // peaks at the requested volume
      expect(gain.gain.calls[2][1]).toBeGreaterThan(0); // never ramps to zero
    }
    for (const osc of ctx.oscillators) {
      expect(osc.started).toBeGreaterThanOrEqual(12); // scheduled off the context clock
      expect(osc.stopped).toBeGreaterThan(osc.started);
    }
  });

  it('closes the context once the sound has finished', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    playChime({ createContext: () => ctx });
    expect(ctx.closed).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(ctx.closed).toBe(true);
  });

  it('stays silent instead of throwing where there is no audio', () => {
    expect(playChime({ createContext: () => null })).toBeNull();
    expect(
      playChime({
        createContext: () => {
          throw new Error('blocked');
        },
      }),
    ).toBeNull();
  });

  it('survives a context that refuses to build nodes', () => {
    const broken = {
      currentTime: 0,
      destination: {},
      createOscillator: () => {
        throw new Error('not allowed');
      },
      createGain: () => ({}),
    };
    expect(playChime({ createContext: () => broken })).toBeNull();
  });
});
