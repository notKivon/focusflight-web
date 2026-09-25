// The logbook view model: the rows, the stats header, and the flights that
// step 9 actually logs coming back out the way they went in.

import { describe, it, expect } from 'vitest';
import airports from '../src/data/airports.json';
import { Flight } from '../src/lib/engine.js';
import { appendFlight, loadLogbook, deleteFlight } from '../src/lib/storage.js';
import {
  buildLogbook,
  buildEntry,
  formatWhen,
  formatSpeeds,
  port,
} from '../src/lib/logbook.js';

const byIata = new Map(airports.map((a) => [a.iata, a]));
const ap = (iata) => byIata.get(iata);

const NOW = Date.parse('2026-09-25T18:00:00.000Z');
const HOUR = 3600000;

/** Minimal localStorage stand-in, as in the storage tests. */
function mockStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function entry(overrides = {}) {
  return {
    id: 'a',
    from: 'HKG',
    to: 'LHR',
    distance_km: 9630,
    base_minutes: 722,
    speed_changes: [{ at_progress: 0, multiplier: 2 }],
    focused_seconds: 21660,
    started_at: '2026-09-25T06:00:00.000Z',
    ended_at: '2026-09-25T12:01:00.000Z',
    status: 'arrived',
    label: '',
    ...overrides,
  };
}

describe('port', () => {
  it('resolves a stored IATA code back to its airport', () => {
    expect(port('HKG').city).toBe(ap('HKG').city);
  });

  it('still prints the code when the dataset no longer has it', () => {
    const unknown = port('ZZZ');
    expect(unknown.iata).toBe('ZZZ');
    expect(unknown.name).toBe('Unknown airport');
  });
});

describe('formatWhen', () => {
  it('names today and yesterday instead of dating them', () => {
    expect(formatWhen(NOW - HOUR, NOW)).toMatch(/^Today, /);
    expect(formatWhen(NOW - 24 * HOUR, NOW)).toMatch(/^Yesterday, /);
  });

  it('dates anything older, and adds the year in a past one', () => {
    const older = formatWhen(Date.parse('2026-09-01T09:00:00.000Z'), NOW);
    expect(older).not.toMatch(/Today|Yesterday/);
    expect(older).not.toMatch(/2026/);
    expect(formatWhen(Date.parse('2025-09-01T09:00:00.000Z'), NOW)).toMatch(/2025/);
  });
});

describe('formatSpeeds', () => {
  it('prints the one speed a steady flight was flown at', () => {
    expect(formatSpeeds([{ at_progress: 0, multiplier: 2 }])).toBe('2×');
  });

  it('traces a speed change through the flight', () => {
    expect(
      formatSpeeds([
        { at_progress: 0, multiplier: 1 },
        { at_progress: 0.5, multiplier: 4 },
      ]),
    ).toBe('1× → 4×');
  });

  it('elides a long list rather than wrapping the row', () => {
    const changes = [1, 2, 4, 10, 0.5].map((multiplier, i) => ({
      at_progress: i / 5,
      multiplier,
    }));
    expect(formatSpeeds(changes)).toBe('1× → … → 0.5×');
  });

  it('falls back to 1× on a missing or empty list', () => {
    expect(formatSpeeds([])).toBe('1×');
    expect(formatSpeeds(undefined)).toBe('1×');
  });
});

describe('buildEntry', () => {
  it('prints the route, the figures and the status of an arrival', () => {
    const row = buildEntry(entry(), NOW);
    expect(row.route).toBe('HKG → LHR');
    expect(row.from.city).toBe(ap('HKG').city);
    expect(row.distanceLabel).toBe('9,630 km');
    expect(row.focusedLabel).toBe('6h 1m');
    expect(row.baseLabel).toBe('12h 2m');
    expect(row.speedLabel).toBe('2×');
    expect(row.statusLabel).toBe('Landed');
    expect(row.arrived).toBe(true);
    expect(row.deleteLabel).toBe('Delete the HKG → LHR flight');
  });

  it('marks an aborted flight without hiding the focus it earned', () => {
    const row = buildEntry(entry({ status: 'aborted', focused_seconds: 900 }), NOW);
    expect(row.arrived).toBe(false);
    expect(row.statusLabel).toBe('Aborted');
    expect(row.focusedLabel).toBe('15m');
  });

  it('carries the label through and survives a junk timestamp', () => {
    const row = buildEntry(entry({ label: 'Deep work', ended_at: 'nonsense' }), NOW);
    expect(row.label).toBe('Deep work');
    expect(row.whenLabel).toBe('—');
  });
});

describe('buildLogbook', () => {
  const rows = [
    entry({ id: 'a', focused_seconds: 3600 }),
    entry({ id: 'b', from: 'SIN', to: 'KUL', distance_km: 297, focused_seconds: 1800 }),
    entry({ id: 'c', from: 'JFK', to: 'LAX', distance_km: 3974, status: 'aborted', focused_seconds: 1200 }),
  ];

  it('counts focus across every flight, aborted ones included', () => {
    const model = buildLogbook(rows, NOW);
    expect(model.stats.focusedLabel).toBe('1h 50m'); // 3600 + 1800 + 1200 s
    expect(model.stats.focusedHours).toBeCloseTo(6600 / 3600, 6);
  });

  it('credits distance and the flight count to arrivals only', () => {
    const model = buildLogbook(rows, NOW);
    expect(model.stats.distanceLabel).toBe('9,927 km'); // 9630 + 297, no JFK→LAX
    expect(model.stats.arrivedCount).toBe(2);
    expect(model.stats.arrivedLabel).toBe('2');
  });

  it('keeps the order it is given and counts the rows', () => {
    const model = buildLogbook(rows, NOW);
    expect(model.entries.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(model.count).toBe(3);
    expect(model.countLabel).toBe('3 flights');
    expect(buildLogbook([rows[0]], NOW).countLabel).toBe('1 flight');
  });

  it('reports an empty logbook with something to say', () => {
    const model = buildLogbook([], NOW);
    expect(model.empty).toBe(true);
    expect(model.entries).toEqual([]);
    expect(model.stats.focusedLabel).toBe('0s');
    expect(model.stats.distanceLabel).toBe('0 km');
    expect(model.emptyHeadline).toBe('No flights yet');
    expect(model.emptyMessage.length).toBeGreaterThan(0);
  });

  it('survives junk in place of a list', () => {
    expect(buildLogbook(null, NOW).empty).toBe(true);
    expect(buildLogbook(undefined, NOW).count).toBe(0);
  });
});

describe('flights logged by a real session', () => {
  /** Flies SIN→KUL at 10× to arrival, exactly as the HUD does in step 9. */
  function flown(store, { at, multiplier = 10, label = '' } = {}) {
    const flight = Flight.create({
      from: ap('SIN'),
      to: ap('KUL'),
      multiplier,
      label,
      now: at,
    }).takeOff(at);
    const session = (flight.baseMinutes / multiplier) * 60000;
    flight.update(at + session);
    appendFlight(flight, store);
    return flight;
  }

  it('displays the entries step 9 writes, newest first', () => {
    const store = mockStore();
    flown(store, { at: NOW - 6 * HOUR, label: 'Morning block' });
    const second = flown(store, { at: NOW - HOUR, multiplier: 2 });

    const model = buildLogbook(loadLogbook(store), NOW);
    expect(model.count).toBe(2);
    expect(model.entries[0].id).toBe(second.id); // newest first
    expect(model.entries[0].route).toBe('SIN → KUL');
    expect(model.entries[0].speedLabel).toBe('2×');
    expect(model.entries[0].distanceLabel).toBe('297 km');
    expect(model.entries[0].statusLabel).toBe('Landed');
    expect(model.entries[0].whenLabel).toMatch(/^Today, /);
    expect(model.entries[1].label).toBe('Morning block');
    expect(model.stats.arrivedCount).toBe(2);
    expect(model.stats.distanceLabel).toBe('594 km');
  });

  it('shows a mid-flight speed change in the row it belongs to', () => {
    const store = mockStore();
    const flight = Flight.create({ from: ap('HKG'), to: ap('LHR'), multiplier: 1, now: NOW })
      .takeOff(NOW);
    flight.setMultiplier(4, NOW + 6 * HOUR); // halfway down the base duration
    flight.abort(NOW + 7 * HOUR);
    appendFlight(flight, store);

    const [row] = buildLogbook(loadLogbook(store), NOW + 7 * HOUR).entries;
    expect(row.speedLabel).toBe('1× → 4×');
    expect(row.statusLabel).toBe('Aborted');
    expect(row.focusedLabel).toBe('7h');
  });

  it('drops a deleted flight from the rows and from the stats', () => {
    const store = mockStore();
    const first = flown(store, { at: NOW - 6 * HOUR });
    flown(store, { at: NOW - HOUR });

    const model = buildLogbook(deleteFlight(first.id, store), NOW);
    expect(model.count).toBe(1);
    expect(model.entries.map((r) => r.id)).not.toContain(first.id);
    expect(model.stats.distanceLabel).toBe('297 km');
    expect(model.stats.arrivedCount).toBe(1);
  });
});
