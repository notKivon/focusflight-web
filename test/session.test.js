// The flight session end to end: the engine, storage and the HUD model doing
// together what `main.js` wires them to do — take off, tick, persist, reload,
// arrive, log. Pure modules only, on a fake clock; no DOM and no timers.

import { describe, it, expect } from 'vitest';
import airports from '../src/data/airports.json';
import { Flight } from '../src/lib/engine.js';
import { buildHud, buildArrival } from '../src/lib/hud.js';
import {
  saveActiveFlight,
  loadActiveFlight,
  clearActiveFlight,
  appendFlight,
  loadLogbook,
  logbookStats,
} from '../src/lib/storage.js';

const byIata = new Map(airports.map((a) => [a.iata, a]));
const ap = (iata) => byIata.get(iata);

const T0 = Date.parse('2026-09-25T09:00:00.000Z');
const sec = (n) => n * 1000;
const min = (n) => n * 60000;

function mockStore() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

/** Closing and reopening the tab: whatever is in storage is all that survives. */
function reload(store, now) {
  const saved = loadActiveFlight(store);
  return saved ? Flight.restore(saved, now) : null;
}

/** SIN→KUL is a short hop: 297 km, 22 base minutes — a 132 s session at 10×. */
const shortHop = (over = {}) =>
  Flight.create({ from: ap('SIN'), to: ap('KUL'), multiplier: 10, now: T0, ...over });

describe('a full short flight at 10×', () => {
  it('counts down, arrives on time and lands in the logbook', () => {
    const store = mockStore();
    const flight = shortHop({ label: 'Inbox zero' }).takeOff(T0);
    saveActiveFlight(flight, store);

    expect(flight.baseMinutes).toBe(22);
    const sessionSeconds = (flight.baseMinutes * 60) / 10; // 132 s at 10×
    expect(buildHud(flight.snapshot(T0), T0).clock).toBe('2:12');

    // Half way through the session.
    const half = T0 + sec(sessionSeconds / 2);
    const mid = buildHud(flight.snapshot(half), half);
    expect(mid.percentLabel).toBe('50%');
    expect(mid.clock).toBe('1:06');
    expect(mid.title).toBe('00:01:06 · SIN→KUL');
    expect(mid.groundSpeedLabel).toBe('8,000 km/h');
    expect(flight.status).toBe('inflight');

    // One tick past the end: the flight lands.
    const after = T0 + sec(sessionSeconds) + 500;
    expect(flight.snapshot(after).status).toBe('arrived');
    expect(buildHud(flight.snapshot(after), after).clock).toBe('0:00');

    // Arrival is dated when it happened, not when it was noticed.
    expect(flight.endedAt).toBe(T0 + sec(sessionSeconds));
    expect(flight.focusedMsAtMark).toBe(sec(sessionSeconds));

    const arrival = buildArrival(flight.snapshot(after));
    expect(arrival.arrived).toBe(true);
    expect(arrival.distanceLabel).toBe('297 km');
    expect(arrival.focusedLabel).toBe('2m');

    // What `main.js` does on arrival.
    appendFlight(flight, store);
    clearActiveFlight(store);

    const logbook = loadLogbook(store);
    expect(logbook).toHaveLength(1);
    expect(logbook[0]).toMatchObject({
      from: 'SIN',
      to: 'KUL',
      status: 'arrived',
      distance_km: 297,
      base_minutes: 22,
      focused_seconds: 132,
      label: 'Inbox zero',
      speed_changes: [{ at_progress: 0, multiplier: 10 }],
    });
    expect(logbook[0].started_at).toBe(new Date(T0).toISOString());
    expect(logbook[0].ended_at).toBe(new Date(T0 + sec(sessionSeconds)).toISOString());
    expect(loadActiveFlight(store)).toBeNull();
    expect(logbookStats(logbook)).toMatchObject({ arrivedCount: 1, distanceKm: 297 });
  });

  it('logs an abort with the distance actually flown', () => {
    const store = mockStore();
    const flight = shortHop().takeOff(T0);
    saveActiveFlight(flight, store);

    flight.abort(T0 + sec(33)); // a quarter of the 132 s session
    appendFlight(flight, store);
    clearActiveFlight(store);

    const [entry] = loadLogbook(store);
    expect(entry.status).toBe('aborted');
    expect(entry.focused_seconds).toBe(33);
    expect(buildArrival(flight.snapshot(T0 + sec(40))).percentLabel).toBe('25%');
    expect(logbookStats([entry])).toMatchObject({ arrivedCount: 0, distanceKm: 0, totalCount: 1 });
  });
});

describe('reloading the page mid-flight', () => {
  it('resumes at the right position, counting the time the tab was closed', () => {
    const store = mockStore();
    const flight = shortHop({ multiplier: 1 }).takeOff(T0); // 22 minutes of flying
    saveActiveFlight(flight, store);

    // Saved at the 5 s autosave mark, then the tab is closed for 11 minutes.
    flight.update(T0 + sec(5));
    saveActiveFlight(flight, store);

    const resumed = reload(store, T0 + min(11));
    expect(resumed.status).toBe('inflight');
    expect(resumed.id).toBe(flight.id);
    expect(resumed.progressAtMark).toBeCloseTo(0.5, 3);
    const model = buildHud(resumed.snapshot(T0 + min(11)), T0 + min(11));
    expect(model.percentLabel).toBe('50%');
    expect(model.clock).toBe('11:00');
  });

  it('does not count the closed time when the flight was paused', () => {
    const store = mockStore();
    const flight = shortHop({ multiplier: 1 }).takeOff(T0);
    flight.pause(T0 + min(5));
    saveActiveFlight(flight, store);

    const resumed = reload(store, T0 + min(90));
    expect(resumed.status).toBe('paused');
    expect(resumed.progressAtMark).toBeCloseTo(5 / 22, 3);
    expect(buildHud(resumed.snapshot(T0 + min(90)), T0 + min(90)).etaLabel).toBe('—');

    resumed.resume(T0 + min(90));
    expect(resumed.snapshot(T0 + min(95)).progress).toBeCloseTo(10 / 22, 3);
  });

  it('keeps a mid-flight speed change across the reload', () => {
    const store = mockStore();
    const flight = shortHop({ multiplier: 1 }).takeOff(T0);
    flight.setMultiplier(4, T0 + min(11)); // half way
    saveActiveFlight(flight, store);

    const resumed = reload(store, T0 + min(11));
    expect(resumed.multiplier).toBe(4);
    expect(resumed.speedChanges).toEqual([
      { at_progress: 0, multiplier: 1 },
      { at_progress: 0.5, multiplier: 4 },
    ]);
    // Position held; the remaining 11 base minutes now take 2m 45s.
    const model = buildHud(resumed.snapshot(T0 + min(11)), T0 + min(11));
    expect(model.percentLabel).toBe('50%');
    expect(model.clock).toBe('2:45');
  });

  it('logs a flight that landed while the tab was closed', () => {
    const store = mockStore();
    const flight = shortHop().takeOff(T0); // 132 s session
    saveActiveFlight(flight, store);

    const reopened = reload(store, T0 + min(60));
    expect(reopened.status).toBe('arrived');
    expect(reopened.endedAt).toBe(T0 + sec(132));

    appendFlight(reopened, store);
    clearActiveFlight(store);
    expect(loadLogbook(store)[0]).toMatchObject({ status: 'arrived', focused_seconds: 132 });
  });
});
