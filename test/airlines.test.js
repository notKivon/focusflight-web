// Airline names for the departures board, and the invented flight numbers.

import { describe, it, expect } from 'vitest';
import { AIRLINE_NAMES, ICAO_CARRIERS, resolveAirline, shortAirlineName } from '../src/lib/airlines.js';
import { assignFlightNumbers, flightNumber, formatFlight } from '../src/lib/flightnumbers.js';

describe('AIRLINE_NAMES', () => {
  it('uses the short brand names real boards print', () => {
    expect(AIRLINE_NAMES).toMatchObject({
      LX: 'Swiss', LH: 'Lufthansa', BA: 'British Airways', CX: 'Cathay Pacific', EK: 'Emirates',
      KL: 'KLM', SK: 'SAS', AF: 'Air France', DL: 'Delta', UA: 'United', AA: 'American',
      U2: 'easyJet', FR: 'Ryanair', SQ: 'Singapore Airlines', VY: 'Vueling',
    });
  });

  it('covers the busiest carriers, with no long registered names', () => {
    expect(Object.keys(AIRLINE_NAMES).length).toBeGreaterThanOrEqual(150);
    for (const [code, name] of Object.entries(AIRLINE_NAMES)) {
      expect(code, name).toMatch(/^[A-Z0-9]{2}$/);
      expect(name.length, code).toBeLessThanOrEqual(22);
      expect(name, code).not.toMatch(/\(|International Air Lines|Royal Dutch|Limited/);
    }
  });
});

describe('shortAirlineName', () => {
  it('drops parentheticals, legal suffixes and a trailing country', () => {
    expect(shortAirlineName('Interjet (ABC Aerolineas)')).toBe('Interjet');
    expect(shortAirlineName('Air North Charter - Canada')).toBe('Air North Charter');
    expect(shortAirlineName('Foo Air Ltd')).toBe('Foo Air');
  });

  it('cuts "Airlines" or "International" only when an airline name remains', () => {
    expect(shortAirlineName('Shaheen Air International')).toBe('Shaheen Air');
    expect(shortAirlineName('Kunming Airlines')).toBe('Kunming Airlines');
    expect(shortAirlineName('Libyan Arab Airlines')).toBe('Libyan Arab Airlines');
  });

  it('never touches "Airways"', () => {
    expect(shortAirlineName('British Airways')).toBe('British Airways');
    expect(shortAirlineName('Qatar Airways')).toBe('Qatar Airways');
  });

  it('copes with nothing', () => {
    expect(shortAirlineName(undefined)).toBe('');
  });
});

describe('resolveAirline', () => {
  it('prefers the table over whatever airlines.dat offers', () => {
    expect(resolveAirline('VY', ['Formosa Airlines'])).toEqual({ code: 'VY', name: 'Vueling' });
    expect(resolveAirline('lx')).toEqual({ code: 'LX', name: 'Swiss' });
  });

  it('maps ICAO-coded charter carriers to their IATA code', () => {
    expect(resolveAirline('TOM')).toEqual({ code: ICAO_CARRIERS.TOM[0], name: 'Thomson' });
  });

  it('falls back to the best candidate, shortened, then to the bare code', () => {
    expect(resolveAirline('Q9', ['Example Air International'])).toEqual({ code: 'Q9', name: 'Example Air' });
    expect(resolveAirline('Q9', [])).toEqual({ code: 'Q9', name: 'Q9' });
  });
});

describe('flightNumber', () => {
  it('is deterministic and independent of case', () => {
    expect(flightNumber('ZRH', 'BCN', 'LX')).toBe(flightNumber('zrh', 'bcn', 'lx'));
  });

  it('is a 2–4 digit number', () => {
    for (const to of ['BCN', 'LHR', 'JFK', 'NRT', 'SIN', 'GVA', 'MUC', 'CDG']) {
      const n = flightNumber('ZRH', to, 'LX');
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(9999);
    }
  });

  it('differs by route, by airline and by attempt', () => {
    expect(flightNumber('ZRH', 'BCN', 'LX')).not.toBe(flightNumber('ZRH', 'LHR', 'LX'));
    expect(flightNumber('ZRH', 'BCN', 'LX')).not.toBe(flightNumber('ZRH', 'BCN', 'VY'));
    expect(flightNumber('ZRH', 'BCN', 'LX')).not.toBe(flightNumber('ZRH', 'BCN', 'LX', 1));
  });

  it('spreads over two, three and four digits', () => {
    const lengths = new Set();
    for (let i = 0; i < 200; i++) lengths.add(String(flightNumber('AAA', `D${i}`, 'XX')).length);
    expect([...lengths].sort()).toEqual([2, 3, 4]);
  });
});

describe('assignFlightNumbers', () => {
  it('gives one airline distinct numbers from one airport', () => {
    const flights = Array.from({ length: 400 }, (_, i) => ({ to: `D${i}`, code: 'LX' }));
    const numbers = assignFlightNumbers('ZRH', flights);
    expect(numbers.size).toBe(400);
    expect(new Set(numbers.values()).size).toBe(400);
  });

  it('keeps the plain hash when there is no clash, and ignores repeats', () => {
    const numbers = assignFlightNumbers('ZRH', [
      { to: 'BCN', code: 'LX' },
      { to: 'BCN', code: 'LX' },
      { to: 'BCN', code: 'VY' },
    ]);
    expect(numbers.size).toBe(2);
    expect(numbers.get('BCN-LX')).toBe(flightNumber('ZRH', 'BCN', 'LX'));
  });
});

describe('formatFlight', () => {
  it('prints code and number like a board', () => {
    expect(formatFlight('LX', 1234)).toBe('LX 1234');
  });
});
