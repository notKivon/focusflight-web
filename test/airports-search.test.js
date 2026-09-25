// Autocomplete ranking: the field is only as good as the order it offers.

import { describe, it, expect } from 'vitest';
import {
  AIRPORTS,
  DEFAULT_SEARCH_LIMIT,
  normalize,
  findAirport,
  searchAirports,
  airportLabel,
} from '../src/lib/airports.js';

const codes = (list) => list.map((a) => a.iata);

describe('normalize', () => {
  it('folds case, accents and surrounding space', () => {
    expect(normalize('  Zürich ')).toBe('zurich');
    expect(normalize('SÃO PAULO')).toBe('sao paulo');
  });

  it('survives nothing at all', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
  });
});

describe('findAirport', () => {
  it('looks up by IATA code, whatever the case', () => {
    expect(findAirport('hkg').name).toMatch(/Hong Kong/);
    expect(findAirport(' LHR ').iata).toBe('LHR');
  });

  it('returns null for an unknown or empty code', () => {
    expect(findAirport('ZZZ')).toBeNull();
    expect(findAirport('')).toBeNull();
  });
});

describe('searchAirports', () => {
  it('puts an exact IATA match first', () => {
    expect(searchAirports('LHR')[0].iata).toBe('LHR');
    expect(searchAirports('hkg')[0].iata).toBe('HKG');
  });

  it('finds airports by city', () => {
    expect(codes(searchAirports('hong kong'))).toContain('HKG');
    expect(codes(searchAirports('tokyo'))).toContain('HND');
    expect(codes(searchAirports('narita'))).toContain('NRT');
  });

  it('finds airports by name and by country', () => {
    expect(codes(searchAirports('heathrow'))).toContain('LHR');
    expect(codes(searchAirports('singapore'))).toContain('SIN');
    // KUL's municipality is Sepang, so this one can only come from the name.
    expect(codes(searchAirports('kuala lumpur'))).toContain('KUL');
  });

  it('matches without the accents the traveller will not type', () => {
    const zurich = codes(searchAirports('zurich'));
    expect(zurich).toContain('ZRH');
  });

  it('ranks prefix matches above mid-word ones', () => {
    const results = searchAirports('lon', { limit: 30 });
    expect(codes(results)).toEqual(expect.arrayContaining(['LHR', 'LGW']));
    const lastPrefix = results.map((a) => normalize(a.city).startsWith('lon')).lastIndexOf(true);
    const firstMidWord = results.findIndex(
      (a) => !normalize(a.city).startsWith('lon') && !normalize(a.iata).startsWith('lon'),
    );
    expect(lastPrefix).toBeGreaterThanOrEqual(0);
    if (firstMidWord !== -1) expect(lastPrefix).toBeLessThan(firstMidWord);
  });

  it('returns nothing for an empty query', () => {
    expect(searchAirports('')).toEqual([]);
    expect(searchAirports('   ')).toEqual([]);
  });

  it('returns nothing for a query that matches no airport', () => {
    expect(searchAirports('qqqqzzz')).toEqual([]);
  });

  it('caps the list at the limit', () => {
    expect(searchAirports('a').length).toBe(DEFAULT_SEARCH_LIMIT);
    expect(searchAirports('a', { limit: 3 }).length).toBe(3);
  });

  it('excludes the airport already chosen in the other field', () => {
    expect(codes(searchAirports('HKG', { exclude: 'HKG' }))).not.toContain('HKG');
    expect(codes(searchAirports('LHR', { exclude: 'hkg' }))).toContain('LHR');
  });

  it('only ever returns real airport records', () => {
    for (const airport of searchAirports('new york', { limit: 5 })) {
      expect(AIRPORTS).toContain(airport);
    }
  });
});

describe('airportLabel', () => {
  it('reads as code then city', () => {
    expect(airportLabel(findAirport('HKG'))).toBe('HKG · Hong Kong');
  });

  it('falls back to the airport name when there is no city', () => {
    expect(airportLabel({ iata: 'XXX', name: 'Somewhere Field', city: '' })).toBe(
      'XXX · Somewhere Field',
    );
  });

  it('is empty when nothing is chosen', () => {
    expect(airportLabel(null)).toBe('');
  });
});
