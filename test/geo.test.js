import { describe, it, expect } from 'vitest';
import airports from '../src/data/airports.json';
import {
  haversineKm,
  interpolate,
  initialBearing,
  headingAt,
  baseMinutes,
  sessionMinutes,
  groundSpeedKmh,
  validateRoute,
  formatClock,
  formatTitleClock,
  formatDuration,
  phaseLabel,
  TOO_SHORT_MESSAGE,
} from '../src/lib/geo.js';

const byIata = new Map(airports.map((a) => [a.iata, a]));
const ap = (iata) => byIata.get(iata);

describe('haversineKm', () => {
  it('matches the published HKG→LHR great-circle distance within 1%', () => {
    const d = haversineKm(ap('HKG'), ap('LHR'));
    expect(Math.abs(d - 9630) / 9630).toBeLessThan(0.01);
  });

  it('is symmetric', () => {
    expect(haversineKm(ap('JFK'), ap('LAX'))).toBe(haversineKm(ap('LAX'), ap('JFK')));
  });

  it('is zero for an airport to itself', () => {
    expect(haversineKm(ap('SIN'), ap('SIN'))).toBe(0);
  });

  it('returns whole kilometres', () => {
    expect(Number.isInteger(haversineKm(ap('NRT'), ap('SIN')))).toBe(true);
  });
});

describe('interpolate', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    const a = ap('HKG');
    const b = ap('LHR');
    const start = interpolate(a, b, 0);
    const end = interpolate(a, b, 1);
    expect(start.lat).toBeCloseTo(a.lat, 4);
    expect(start.lon).toBeCloseTo(a.lon, 4);
    expect(end.lat).toBeCloseTo(b.lat, 4);
    expect(end.lon).toBeCloseTo(b.lon, 4);
  });

  it('puts the HKG→LAX midpoint over the North Pacific', () => {
    const mid = interpolate(ap('HKG'), ap('LAX'), 0.5);
    // North of both endpoints (the great circle arcs towards the Aleutians)
    expect(mid.lat).toBeGreaterThan(40);
    // Longitude past the antimeridian, on the east-Asian/American Pacific side
    expect(Math.abs(mid.lon)).toBeGreaterThan(150);
  });

  it('halves the distance at the midpoint', () => {
    const a = ap('HKG');
    const b = ap('LHR');
    const mid = interpolate(a, b, 0.5);
    const total = haversineKm(a, b);
    expect(haversineKm(a, mid)).toBeCloseTo(total / 2, -1);
    expect(haversineKm(mid, b)).toBeCloseTo(total / 2, -1);
  });

  it('clamps t outside [0,1]', () => {
    const a = ap('JFK');
    const b = ap('LHR');
    expect(interpolate(a, b, -1)).toEqual(interpolate(a, b, 0));
    expect(interpolate(a, b, 2)).toEqual(interpolate(a, b, 1));
  });
});

describe('bearings', () => {
  it('reads due east along the equator', () => {
    expect(initialBearing({ lat: 0, lon: 0 }, { lat: 0, lon: 10 })).toBeCloseTo(90, 5);
  });

  it('reads due north along a meridian', () => {
    expect(initialBearing({ lat: 0, lon: 0 }, { lat: 10, lon: 0 })).toBeCloseTo(0, 5);
  });

  it('starts HKG→LHR heading north-west', () => {
    const b = initialBearing(ap('HKG'), ap('LHR'));
    expect(b).toBeGreaterThan(280);
    expect(b).toBeLessThan(340);
  });

  it('matches the initial bearing at the start of the route', () => {
    const a = ap('HKG');
    const b = ap('LHR');
    expect(headingAt(a, b, 0)).toBeCloseTo(initialBearing(a, b), 1);
  });
});

describe('durations', () => {
  it('uses 800 km/h for the base duration', () => {
    expect(baseMinutes(800)).toBe(60);
    expect(baseMinutes(9600)).toBe(720);
  });

  it('rounds to whole minutes', () => {
    expect(baseMinutes(801)).toBe(60);
    expect(baseMinutes(810)).toBe(61);
  });

  it('scales the session by the multiplier', () => {
    expect(sessionMinutes(9600, 1)).toBe(720);
    expect(sessionMinutes(9600, 2)).toBe(360);
    expect(sessionMinutes(9600, 0.5)).toBe(1440);
    expect(sessionMinutes(9600, 10)).toBe(72);
  });

  it('scales the displayed ground speed', () => {
    expect(groundSpeedKmh(1)).toBe(800);
    expect(groundSpeedKmh(2.5)).toBe(2000);
  });
});

describe('validateRoute', () => {
  it('accepts a long route and reports distance and base time', () => {
    const r = validateRoute(ap('HKG'), ap('LHR'));
    expect(r.ok).toBe(true);
    expect(r.distanceKm).toBeGreaterThan(9000);
    expect(r.baseMinutes).toBe(baseMinutes(r.distanceKm));
  });

  it('rejects identical airports', () => {
    expect(validateRoute(ap('LHR'), ap('LHR'))).toEqual({
      ok: false,
      message: 'Departure and arrival must differ.',
    });
  });

  it('rejects routes under 150 km with the exact message', () => {
    const from = { iata: 'AAA', lat: 0, lon: 0 };
    const to = { iata: 'BBB', lat: 0, lon: 1 }; // ~111 km
    expect(validateRoute(from, to)).toEqual({ ok: false, message: TOO_SHORT_MESSAGE });
  });

  it('accepts a route just over the 150 km threshold', () => {
    const from = { iata: 'AAA', lat: 0, lon: 0 };
    const to = { iata: 'BBB', lat: 0, lon: 1.4 }; // ~156 km
    expect(validateRoute(from, to).ok).toBe(true);
  });

  it('rejects a missing airport', () => {
    expect(validateRoute(null, ap('LHR')).ok).toBe(false);
  });
});

describe('formatting', () => {
  it('formats countdowns', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59)).toBe('0:59');
    expect(formatClock(605)).toBe('10:05');
    expect(formatClock(3661)).toBe('1:01:01');
    expect(formatClock(-5)).toBe('0:00');
  });

  it('pads the document title clock', () => {
    expect(formatTitleClock(0)).toBe('00:00:00');
    expect(formatTitleClock(3661)).toBe('01:01:01');
    expect(formatTitleClock(43200)).toBe('12:00:00');
  });

  it('formats planning durations', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(432)).toBe('7h 12m');
  });
});

describe('phaseLabel', () => {
  it.each([
    [0, 'Climbing'],
    [0.049, 'Climbing'],
    [0.05, 'Cruising'],
    [0.5, 'Cruising'],
    [0.949, 'Cruising'],
    [0.95, 'Descending'],
    [1, 'Descending'],
  ])('labels progress %s as %s', (p, label) => {
    expect(phaseLabel(p)).toBe(label);
  });
});
