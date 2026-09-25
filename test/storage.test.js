import { describe, it, expect, beforeEach } from 'vitest';
import airports from '../src/data/airports.json';
import { Flight } from '../src/lib/engine.js';
import {
  KEYS,
  SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  saveActiveFlight,
  loadActiveFlight,
  clearActiveFlight,
  loadLogbook,
  saveLogbook,
  appendFlight,
  deleteFlight,
  logbookStats,
  loadSettings,
  saveSettings,
} from '../src/lib/storage.js';

/** Minimal localStorage stand-in; `fail` makes every write throw (quota). */
function mockStore({ fail = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (fail) throw new Error('QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
  };
}

const byIata = new Map(airports.map((a) => [a.iata, a]));
const ap = (iata) => byIata.get(iata);
const T0 = Date.parse('2026-09-25T09:00:00.000Z');

const entry = (over = {}) => ({
  id: 'id-1',
  from: 'HKG',
  to: 'LHR',
  distance_km: 9630,
  base_minutes: 722,
  speed_changes: [{ at_progress: 0, multiplier: 1 }],
  focused_seconds: 3600,
  started_at: '2026-09-25T09:00:00.000Z',
  ended_at: '2026-09-25T10:00:00.000Z',
  status: 'arrived',
  label: '',
  ...over,
});

let store;
beforeEach(() => {
  store = mockStore();
});

describe('envelopes', () => {
  it('writes the ffw.* keys with schemaVersion 1', () => {
    saveSettings({ multiplier: 2 }, store);
    saveLogbook([entry()], store);
    saveActiveFlight(entry(), store);
    for (const key of [KEYS.settings, KEYS.logbook, KEYS.activeFlight]) {
      expect(JSON.parse(store.getItem(key)).schemaVersion).toBe(SCHEMA_VERSION);
    }
    expect(KEYS).toEqual({
      activeFlight: 'ffw.activeFlight',
      logbook: 'ffw.logbook',
      settings: 'ffw.settings',
    });
  });

  it('treats corrupt JSON as nothing stored', () => {
    store.map.set(KEYS.logbook, '{not json');
    store.map.set(KEYS.activeFlight, 'nonsense');
    expect(loadLogbook(store)).toEqual([]);
    expect(loadActiveFlight(store)).toBeNull();
  });

  it('ignores values written under a different schemaVersion', () => {
    store.map.set(KEYS.logbook, JSON.stringify({ schemaVersion: 99, data: [entry()] }));
    expect(loadLogbook(store)).toEqual([]);
  });

  it('survives a store that refuses to write', () => {
    const blocked = mockStore({ fail: true });
    expect(saveActiveFlight(entry(), blocked)).toBe(false);
    expect(loadActiveFlight(blocked)).toBeNull();
  });
});

describe('active flight', () => {
  it('round-trips a Flight through save → load → restore', () => {
    const flight = Flight.create({ from: ap('HKG'), to: ap('LHR'), multiplier: 2, now: T0 });
    flight.takeOff(T0);
    flight.update(T0 + 60 * 60000); // one hour in the air at 2×

    saveActiveFlight(flight, store);
    const restored = Flight.restore(loadActiveFlight(store), T0 + 60 * 60000);

    expect(restored.status).toBe('inflight');
    expect(restored.multiplier).toBe(2);
    expect(restored.progressAtMark).toBeCloseTo(flight.progressAtMark, 10);
    expect(restored.focusedMsAtMark).toBeCloseTo(flight.focusedMsAtMark, 6);
  });

  it('counts time that passed while the tab was closed', () => {
    const flight = Flight.create({ from: ap('HKG'), to: ap('LHR'), now: T0 }).takeOff(T0);
    saveActiveFlight(flight, store);
    const restored = Flight.restore(loadActiveFlight(store), T0 + 361 * 60000); // half of 722 min
    expect(restored.progressAtMark).toBeCloseTo(0.5, 3);
  });

  it('clears, and rejects a record with no route', () => {
    saveActiveFlight(entry(), store);
    clearActiveFlight(store);
    expect(loadActiveFlight(store)).toBeNull();
    saveActiveFlight({ id: 'x' }, store);
    expect(loadActiveFlight(store)).toBeNull();
  });
});

describe('logbook', () => {
  it('sorts newest first by ended_at', () => {
    saveLogbook(
      [
        entry({ id: 'old', ended_at: '2026-09-20T10:00:00.000Z' }),
        entry({ id: 'new', ended_at: '2026-09-25T10:00:00.000Z' }),
        entry({ id: 'mid', ended_at: '2026-09-22T10:00:00.000Z' }),
      ],
      store,
    );
    expect(loadLogbook(store).map((e) => e.id)).toEqual(['new', 'mid', 'old']);
  });

  it('appends a finished Flight and keeps the order', () => {
    appendFlight(entry({ id: 'first', ended_at: '2026-09-24T10:00:00.000Z' }), store);

    const flight = Flight.create({ from: ap('HKG'), to: ap('LHR'), multiplier: 10, now: T0 });
    flight.takeOff(T0);
    flight.update(T0 + 100 * 60000); // 722 base min at 10× = 72.2 min, so it landed

    expect(flight.status).toBe('arrived');
    const log = appendFlight(flight, store);
    expect(log).toHaveLength(2);
    expect(log[0].from).toBe('HKG');
    expect(log[0].to).toBe('LHR');
    expect(log[0].status).toBe('arrived');
    expect(log[0].focused_seconds).toBe(Math.round(722 * 60 / 10));
  });

  it('replaces rather than duplicates an entry with the same id', () => {
    appendFlight(entry({ focused_seconds: 100 }), store);
    const log = appendFlight(entry({ focused_seconds: 200 }), store);
    expect(log).toHaveLength(1);
    expect(log[0].focused_seconds).toBe(200);
  });

  it('drops malformed entries instead of throwing', () => {
    store.map.set(
      KEYS.logbook,
      JSON.stringify({ schemaVersion: 1, data: [entry(), null, { id: 'x' }, 'junk'] }),
    );
    expect(loadLogbook(store)).toHaveLength(1);
  });

  it('deletes one entry by id', () => {
    appendFlight(entry({ id: 'a', ended_at: '2026-09-24T10:00:00.000Z' }), store);
    appendFlight(entry({ id: 'b' }), store);
    expect(deleteFlight('a', store).map((e) => e.id)).toEqual(['b']);
    expect(loadLogbook(store)).toHaveLength(1);
  });
});

describe('logbookStats', () => {
  it('counts focus time for every flight but distance only for arrivals', () => {
    const stats = logbookStats([
      entry({ id: 'a', focused_seconds: 3600, distance_km: 9630, status: 'arrived' }),
      entry({ id: 'b', focused_seconds: 1800, distance_km: 5500, status: 'arrived' }),
      entry({ id: 'c', focused_seconds: 900, distance_km: 1000, status: 'aborted' }),
    ]);
    expect(stats.focusedSeconds).toBe(6300);
    expect(stats.focusedHours).toBeCloseTo(1.75, 10);
    expect(stats.distanceKm).toBe(15130);
    expect(stats.arrivedCount).toBe(2);
    expect(stats.totalCount).toBe(3);
  });

  it('gives zeroes for an empty or invalid logbook', () => {
    expect(logbookStats([])).toMatchObject({ focusedSeconds: 0, distanceKm: 0, arrivedCount: 0 });
    expect(logbookStats(undefined).totalCount).toBe(0);
  });
});

describe('settings', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a patch over what is already there', () => {
    saveSettings({ multiplier: 4 }, store);
    saveSettings({ mapView: 'world', lastFrom: 'HKG' }, store);
    expect(loadSettings(store)).toEqual({
      ...DEFAULT_SETTINGS,
      multiplier: 4,
      mapView: 'world',
      lastFrom: 'HKG',
    });
  });

  it('fills in defaults for keys a partial record is missing and ignores unknown keys', () => {
    store.map.set(
      KEYS.settings,
      JSON.stringify({ schemaVersion: 1, data: { multiplier: 2, bogus: true } }),
    );
    const settings = loadSettings(store);
    expect(settings.multiplier).toBe(2);
    expect(settings.mapView).toBe(DEFAULT_SETTINGS.mapView);
    expect(settings.bogus).toBeUndefined();
  });

  it('keeps the AirLabs key until it is removed', () => {
    expect(loadSettings(store).airlabsKey).toBeNull();
    saveSettings({ airlabsKey: 'a1b2c3d4e5f6' }, store);
    saveSettings({ theme: 'fjord' }, store);
    expect(loadSettings(store).airlabsKey).toBe('a1b2c3d4e5f6');
    saveSettings({ airlabsKey: null }, store);
    expect(loadSettings(store).airlabsKey).toBeNull();
  });
});

describe('default backend', () => {
  it('degrades to a no-op store when localStorage is unavailable', () => {
    // Node has no localStorage, which is the same situation as a browser that
    // blocks it: reads come back empty and writes are quietly dropped.
    expect(() => saveActiveFlight(entry())).not.toThrow();
    expect(loadActiveFlight()).toBeNull();
    expect(loadLogbook()).toEqual([]);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
