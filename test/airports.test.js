import { describe, it, expect } from 'vitest';
import airports from '../src/data/airports.json';

const byIata = new Map(airports.map((a) => [a.iata, a]));

describe('airports dataset', () => {
  it('has a plausible number of large airports', () => {
    expect(airports.length).toBeGreaterThan(800);
    expect(airports.length).toBeLessThan(1600);
  });

  it('has unique IATA codes', () => {
    expect(byIata.size).toBe(airports.length);
  });

  it('gives every airport the expected shape', () => {
    for (const a of airports) {
      expect(a.iata).toMatch(/^[A-Z]{3}$/);
      expect(a.name.length).toBeGreaterThan(0);
      expect(typeof a.country).toBe('string');
      expect(a.lat).toBeGreaterThanOrEqual(-90);
      expect(a.lat).toBeLessThanOrEqual(90);
      expect(a.lon).toBeGreaterThanOrEqual(-180);
      expect(a.lon).toBeLessThanOrEqual(180);
    }
  });

  it.each([
    ['HKG', 22.3119, 113.9149],
    ['LHR', 51.4708, -0.4599],
    ['JFK', 40.6394, -73.7793],
    ['LAX', 33.9425, -118.408],
    ['SIN', 1.3502, 103.994],
    ['NRT', 35.7686, 140.3887],
  ])('places %s at the right coordinates', (iata, lat, lon) => {
    const a = byIata.get(iata);
    expect(a).toBeDefined();
    expect(a.lat).toBeCloseTo(lat, 2);
    expect(a.lon).toBeCloseTo(lon, 2);
  });

  it('is sorted by IATA code', () => {
    const sorted = [...airports].sort((a, b) => a.iata.localeCompare(b.iata));
    expect(airports.map((a) => a.iata)).toEqual(sorted.map((a) => a.iata));
  });
});
