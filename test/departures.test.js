// Departures board model, and the generated route files it reads.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FILTERS,
  buildBoard,
  departuresUrl,
  parseDepartures,
} from '../src/lib/departures.js';
import { AIRPORTS } from '../src/lib/airports.js';

const DIR = resolve(__dirname, '../public/departures');
const load = (iata) => JSON.parse(readFileSync(resolve(DIR, `${iata}.json`), 'utf8'));

const SAMPLE = {
  schemaVersion: 1,
  from: 'HKG',
  source: 'test',
  departures: [
    { to: 'LHR', airlines: [{ code: 'CX', name: 'Cathay Pacific' }, { code: 'BA', name: 'British Airways' }] },
    { to: 'TPE', airlines: [{ code: 'CI', name: 'China Airlines' }] },
    { to: 'SIN', airlines: [] },
    { to: 'ZZZ', airlines: [] }, // not in the dataset
    { to: 'MFM', airlines: [] }, // 64 km: too short to fly
  ],
};

describe('departuresUrl / parseDepartures', () => {
  it('points at the static file for the airport', () => {
    expect(departuresUrl('hkg')).toBe('/departures/HKG.json');
  });

  it('rejects the wrong shape or the wrong airport', () => {
    expect(parseDepartures(SAMPLE, 'HKG')).toBe(SAMPLE);
    expect(parseDepartures(SAMPLE, 'LHR')).toBeNull();
    expect(parseDepartures({ departures: [] }, 'HKG')).toBeNull();
    expect(parseDepartures(null)).toBeNull();
  });
});

describe('buildBoard', () => {
  it('drops unknown and too-short routes, shortest session first', () => {
    const board = buildBoard(SAMPLE, { now: 0 });
    expect(board.rows.map((r) => r.iata)).toEqual(['TPE', 'SIN', 'LHR', 'LHR']);
    expect(board.counts.all).toBe(4);
  });

  it('has one row per operating airline, ties broken by airline name', () => {
    const lhr = buildBoard(SAMPLE).rows.filter((r) => r.iata === 'LHR');
    expect(lhr.map((r) => r.airline)).toEqual(['British Airways', 'Cathay Pacific']);
    expect(lhr.map((r) => r.key)).toEqual(['LHR-BA', 'LHR-CX']);
    expect(lhr[0].sessionMinutes).toBe(lhr[1].sessionMinutes);
  });

  it('prints a flight number with the airline code, and a tooltip naming both airports', () => {
    const row = buildBoard(SAMPLE).rows.find((r) => r.key === 'LHR-CX');
    expect(row.flight).toMatch(/^CX \d{2,4}$/);
    expect(row.title).toBe(`Cathay Pacific ${row.flight} · Hong Kong International Airport → London Heathrow Airport`);
    expect(buildBoard(SAMPLE).rows.find((r) => r.key === 'LHR-CX').flight).toBe(row.flight);
  });

  it('keeps a route with no named carrier as one row without a flight', () => {
    const sin = buildBoard(SAMPLE).rows.filter((r) => r.iata === 'SIN');
    expect(sin).toHaveLength(1);
    expect(sin[0]).toMatchObject({ key: 'SIN', airline: '', flight: '' });
  });

  it('scales sessions with the multiplier, like the boarding pass', () => {
    const at1 = buildBoard(SAMPLE, { multiplier: 1 }).rows.find((r) => r.iata === 'LHR');
    const at2 = buildBoard(SAMPLE, { multiplier: 2 }).rows.find((r) => r.iata === 'LHR');
    expect(at1.sessionMinutes).toBe(722);
    expect(at2.sessionMinutes).toBe(361);
  });

  it('filters by session length and counts rows in each bucket', () => {
    const board = buildBoard(SAMPLE, { filter: 'ultra' });
    expect(board.rows.map((r) => r.iata)).toEqual(['LHR', 'LHR']);
    expect(board.counts.ultra).toBe(2);
    expect(board.counts.short).toBe(0);
    expect(buildBoard(SAMPLE, { filter: 'nonsense' }).filter).toBe('all');
    expect(FILTERS[0].id).toBe('all');
  });

  it('copes with no data at all', () => {
    expect(buildBoard(null).rows).toEqual([]);
  });
});

describe('generated route files', () => {
  it('there is one per airport in the dataset', () => {
    const files = new Set(readdirSync(DIR));
    for (const airport of AIRPORTS) expect(files.has(`${airport.iata}.json`), airport.iata).toBe(true);
  });

  it('names airlines the way boards do, operating carriers only', () => {
    const zrh = buildBoard(parseDepartures(load('ZRH'), 'ZRH'));
    const bcn = zrh.rows.filter((r) => r.iata === 'BCN').map((r) => r.airline);
    expect(bcn).toEqual(['Swiss', 'Vueling']); // VY was once filed as Formosa Airlines
    const names = new Set(zrh.rows.map((r) => r.airline));
    for (const name of ['Swiss', 'Lufthansa', 'British Airways', 'KLM', 'Emirates']) expect(names).toContain(name);
    for (const row of zrh.rows) expect(row.airline, row.key).not.toMatch(/International Air Lines|Royal Dutch/);
    const keys = zrh.rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never gives one airline the same flight number twice from an airport', () => {
    for (const iata of ['ZRH', 'LHR', 'ATL', 'PEK']) {
      const rows = buildBoard(parseDepartures(load(iata), iata)).rows;
      const flights = rows.map((r) => r.flight).filter(Boolean);
      expect(new Set(flights).size, iata).toBe(flights.length);
    }
  });

  it('HKG, LCY and NRT have plausible, readable boards', () => {
    for (const [iata, dest] of [['HKG', 'LHR'], ['LCY', 'AMS'], ['NRT', 'LAX']]) {
      const data = parseDepartures(load(iata), iata);
      expect(data, iata).not.toBeNull();
      const board = buildBoard(data);
      expect(board.rows.map((r) => r.iata)).toContain(dest);
    }
  });
});
