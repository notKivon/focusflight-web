// Metro areas: IATA city codes that group a city's airports.

import { describe, it, expect } from 'vitest';
import { METROS, metroFor, placeName } from '../src/lib/metros.js';
import { findAirport, searchAirports, airportLabel } from '../src/lib/airports.js';

const codes = (list) => list.map((a) => a.iata);

describe('metro table', () => {
  it('has unique metro codes and no airport in two metros', () => {
    expect(new Set(METROS.map((m) => m.code)).size).toBe(METROS.length);
    const all = METROS.flatMap((m) => m.airports);
    expect(new Set(all).size).toBe(all.length);
  });

  it('every metro has at least one airport in the dataset', () => {
    for (const metro of METROS) {
      expect(metro.airports.some((code) => findAirport(code)), metro.code).toBe(true);
    }
  });
});

describe('metroFor / placeName', () => {
  it('puts Narita in Tokyo', () => {
    expect(metroFor('NRT')?.code).toBe('TYO');
    expect(metroFor('nrt')?.name).toBe('Tokyo');
    expect(placeName(findAirport('NRT'))).toBe('Tokyo');
    expect(airportLabel(findAirport('NRT'))).toBe('NRT · Tokyo');
  });

  it('puts London City in London', () => {
    expect(findAirport('LCY')).toMatchObject({ name: 'London City Airport', country: 'United Kingdom' });
    expect(metroFor('LCY')?.code).toBe('LON');
  });

  it('falls back to the city for airports outside any metro', () => {
    expect(metroFor('SIN')).toBeNull();
    expect(placeName(findAirport('SIN'))).toBe(findAirport('SIN').city);
    expect(placeName(null)).toBe('');
  });
});

describe('metro search', () => {
  it('finds both Tokyo airports by name and by metro code', () => {
    expect(codes(searchAirports('tokyo'))).toEqual(expect.arrayContaining(['HND', 'NRT']));
    expect(codes(searchAirports('TYO')).slice(0, 2).sort()).toEqual(['HND', 'NRT']);
  });

  it('lists every London airport for LON, LCY included', () => {
    const london = codes(searchAirports('LON', { limit: 10 }));
    for (const code of ['LHR', 'LGW', 'STN', 'LTN', 'LCY']) expect(london).toContain(code);
  });

  it('an exact airport code still beats a metro code of the same letters', () => {
    expect(codes(searchAirports('SHA'))[0]).toBe('SHA');
    expect(codes(searchAirports('SHA'))).toContain('PVG');
  });
});
