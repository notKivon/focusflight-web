import { describe, it, expect } from 'vitest';
import airports from '../src/data/airports.json';
import { Flight, clampMultiplier, PRESET_MULTIPLIERS } from '../src/lib/engine.js';
import { TOO_SHORT_MESSAGE } from '../src/lib/geo.js';

const byIata = new Map(airports.map((a) => [a.iata, a]));
const ap = (iata) => byIata.get(iata);

// Fake clock: every engine call takes an explicit `now`, so no timers are needed.
const T0 = Date.parse('2026-09-25T09:00:00.000Z');
const min = (n) => n * 60000;

/** A flight already in the air at T0. */
function inFlight({ from = 'HKG', to = 'LHR', multiplier = 1 } = {}) {
  return Flight.create({ from: ap(from), to: ap(to), multiplier, now: T0 }).takeOff(T0);
}

describe('clampMultiplier', () => {
  it('snaps to the 0.25 step and the 0.25–10 range', () => {
    expect(clampMultiplier(1.3)).toBe(1.25);
    expect(clampMultiplier(0.01)).toBe(0.25);
    expect(clampMultiplier(99)).toBe(10);
    expect(clampMultiplier('2')).toBe(2);
    expect(clampMultiplier(undefined)).toBe(1);
  });

  it('leaves every preset untouched', () => {
    for (const m of PRESET_MULTIPLIERS) expect(clampMultiplier(m)).toBe(m);
  });
});

describe('create', () => {
  it('carries the route figures and starts in preflight', () => {
    const f = Flight.create({ from: ap('HKG'), to: ap('LHR'), now: T0 });
    expect(f.status).toBe('preflight');
    expect(f.distanceKm).toBe(9630);
    expect(f.baseMinutes).toBe(722);
    expect(f.speedChanges).toEqual([]);
  });

  it('rejects a route under 150 km', () => {
    expect(() => Flight.create({ from: ap('HKG'), to: ap('SZX'), now: T0 })).toThrow(
      TOO_SHORT_MESSAGE,
    );
  });

  it('truncates a label to 60 characters', () => {
    const f = Flight.create({ from: ap('HKG'), to: ap('LHR'), label: 'x'.repeat(80), now: T0 });
    expect(f.label).toHaveLength(60);
  });
});

describe('session length', () => {
  it('runs for the base duration at 1×', () => {
    const f = inFlight();
    expect(f.snapshot(T0).remainingSeconds).toBeCloseTo(722 * 60, 6);
    expect(f.update(T0 + min(722))).toBe('arrived');
  });

  it('halves the session at 2× and doubles it at 0.5×', () => {
    const fast = inFlight({ multiplier: 2 });
    expect(fast.snapshot(T0).remainingSeconds).toBeCloseTo(361 * 60, 6);
    expect(fast.update(T0 + min(360))).toBe('inflight');
    expect(fast.update(T0 + min(361))).toBe('arrived');

    const slow = inFlight({ multiplier: 0.5 });
    expect(slow.snapshot(T0).remainingSeconds).toBeCloseTo(1444 * 60, 6);
    expect(slow.update(T0 + min(1443))).toBe('inflight');
  });

  it('reports ground speed as 800 × multiplier', () => {
    expect(inFlight({ multiplier: 4 }).snapshot(T0).groundSpeedKmh).toBe(3200);
  });
});

describe('mid-flight speed changes', () => {
  it('keeps the plane in place and quarters the remaining time from 1× to 4×', () => {
    const f = inFlight();
    const half = T0 + min(361); // halfway through a 722-minute base duration
    const before = f.snapshot(half);
    expect(before.progress).toBeCloseTo(0.5, 6);

    f.setMultiplier(4, half);
    const after = f.snapshot(half);
    expect(after.progress).toBeCloseTo(before.progress, 12);
    expect(after.position).toEqual(before.position);
    expect(after.remainingSeconds).toBeCloseTo(before.remainingSeconds / 4, 6);
  });

  it('arrives after the recomputed remaining time', () => {
    const f = inFlight();
    const half = T0 + min(361);
    f.setMultiplier(4, half);
    expect(f.update(half + min(90))).toBe('inflight'); // 361 / 4 ≈ 90.25 min
    expect(f.update(half + min(91))).toBe('arrived');
  });

  it('records every change, plus the take-off multiplier at progress 0', () => {
    const f = inFlight({ multiplier: 2 });
    f.setMultiplier(4, T0 + min(180.5)); // 50 %
    f.setMultiplier(1, T0 + min(180.5));
    expect(f.speedChanges).toEqual([
      { at_progress: 0, multiplier: 2 },
      { at_progress: expect.closeTo(0.5, 6), multiplier: 4 },
      { at_progress: expect.closeTo(0.5, 6), multiplier: 1 },
    ]);
  });

  it('ignores a no-op change and clamps out-of-range values', () => {
    const f = inFlight();
    f.setMultiplier(1, T0 + min(10));
    expect(f.speedChanges).toHaveLength(1);
    f.setMultiplier(50, T0 + min(10));
    expect(f.multiplier).toBe(10);
  });

  it('before take-off only re-plans, without logging a change', () => {
    const f = Flight.create({ from: ap('HKG'), to: ap('LHR'), now: T0 });
    f.setMultiplier(2, T0);
    expect(f.multiplier).toBe(2);
    expect(f.speedChanges).toEqual([]);
  });
});

describe('pause and resume', () => {
  it('excludes paused time from progress and focus time', () => {
    const f = inFlight();
    f.pause(T0 + min(60));
    const paused = f.snapshot(T0 + min(600)); // nine hours sitting paused
    expect(paused.status).toBe('paused');
    expect(paused.progress).toBeCloseTo(60 / 722, 9);
    expect(paused.focusedSeconds).toBeCloseTo(3600, 6);

    f.resume(T0 + min(600));
    const later = f.snapshot(T0 + min(660));
    expect(later.progress).toBeCloseTo(120 / 722, 9);
    expect(later.focusedSeconds).toBeCloseTo(7200, 6);
  });

  it('cannot arrive while paused', () => {
    const f = inFlight({ multiplier: 10 });
    f.pause(T0 + min(1));
    expect(f.update(T0 + min(5000))).toBe('paused');
  });

  it('ignores resume when not paused and pause when not in flight', () => {
    const f = inFlight();
    f.resume(T0 + min(1));
    expect(f.status).toBe('inflight');
    f.abort(T0 + min(2));
    f.pause(T0 + min(3));
    expect(f.status).toBe('aborted');
  });
});

describe('arrival and abort', () => {
  it('stops the clock at the arrival moment, not at the next update', () => {
    const f = inFlight({ multiplier: 10 });
    const sessionMs = min(72.2); // 722 base minutes at 10×
    f.update(T0 + min(600)); // the tab was closed long past arrival
    expect(f.status).toBe('arrived');
    expect(f.endedAt).toBe(T0 + sessionMs);
    expect(f.snapshot(T0 + min(900)).focusedSeconds).toBeCloseTo(sessionMs / 1000, 6);
    expect(f.snapshot(T0 + min(900)).progress).toBe(1);
  });

  it('logs an aborted flight with the focus time actually earned', () => {
    const f = inFlight();
    f.abort(T0 + min(30));
    const entry = f.toLogEntry();
    expect(entry).toMatchObject({
      from: 'HKG',
      to: 'LHR',
      distance_km: 9630,
      base_minutes: 722,
      focused_seconds: 1800,
      status: 'aborted',
      started_at: '2026-09-25T09:00:00.000Z',
      ended_at: '2026-09-25T09:30:00.000Z',
    });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses to log a flight that is still active', () => {
    expect(() => inFlight().toLogEntry()).toThrow(/inflight/);
  });
});

describe('serialise and restore', () => {
  it('resumes at the right position after a simulated reload', () => {
    const f = inFlight({ multiplier: 2 });
    const saved = JSON.parse(JSON.stringify(f.toJSON())); // through localStorage
    expect(saved.started_at).toBe('2026-09-25T09:00:00.000Z');

    // Tab closed at T0 + 60 min, reopened at T0 + 180 min: all of it counts.
    const restored = Flight.restore(saved, T0 + min(180));
    expect(restored.status).toBe('inflight');
    expect(restored.snapshot(T0 + min(180)).progress).toBeCloseTo((180 * 2) / 722, 9);
    expect(restored.snapshot(T0 + min(180)).focusedSeconds).toBeCloseTo(min(180) / 1000, 6);
  });

  it('does not accrue time across a reload while paused', () => {
    const f = inFlight();
    f.pause(T0 + min(45));
    const restored = Flight.restore(JSON.parse(JSON.stringify(f.toJSON())), T0 + min(400));
    expect(restored.status).toBe('paused');
    expect(restored.snapshot(T0 + min(400)).progress).toBeCloseTo(45 / 722, 9);
    restored.resume(T0 + min(400));
    expect(restored.snapshot(T0 + min(405)).progress).toBeCloseTo(50 / 722, 9);
  });

  it('lands a flight whose time ran out while the tab was closed', () => {
    const f = inFlight({ multiplier: 10 });
    const restored = Flight.restore(JSON.parse(JSON.stringify(f.toJSON())), T0 + min(200));
    expect(restored.status).toBe('arrived');
    expect(restored.toLogEntry().focused_seconds).toBe(Math.round(min(72.2) / 1000));
  });

  it('keeps speed changes and identity across the round trip', () => {
    const f = inFlight();
    f.setMultiplier(4, T0 + min(100));
    const restored = Flight.restore(JSON.parse(JSON.stringify(f.toJSON())), T0 + min(100));
    expect(restored.id).toBe(f.id);
    expect(restored.multiplier).toBe(4);
    expect(restored.speedChanges).toEqual(f.speedChanges);
    expect(restored.from.iata).toBe('HKG');
  });

  it('returns null for missing or unusable saved data', () => {
    expect(Flight.restore(null, T0)).toBe(null);
    expect(Flight.restore({ status: 'inflight' }, T0)).toBe(null);
  });
});

describe('snapshot', () => {
  it('tracks phase, flown distance and heading along the route', () => {
    const f = inFlight({ multiplier: 10 });
    expect(f.snapshot(T0).phase).toBe('Climbing');
    const mid = f.snapshot(T0 + min(36.1));
    expect(mid.phase).toBe('Cruising');
    expect(mid.distanceFlownKm).toBeCloseTo(9630 / 2, 0);
    expect(mid.heading).toBeGreaterThanOrEqual(0);
    expect(mid.heading).toBeLessThan(360);
    expect(f.snapshot(T0 + min(70)).phase).toBe('Descending');
  });

  it('flies the antimeridian route without leaving the sphere', () => {
    const f = inFlight({ from: 'HKG', to: 'LAX', multiplier: 10 });
    const mid = f.snapshot(T0 + min(f.baseMinutes / 10 / 2));
    expect(mid.progress).toBeCloseTo(0.5, 3);
    expect(mid.position.lat).toBeGreaterThan(45); // over the North Pacific
    expect(Math.abs(mid.position.lon)).toBeGreaterThan(150);
  });
});
