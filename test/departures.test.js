// Departures board model, and the generated route files it reads.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FILTERS,
  buildBoard,
  departuresUrl,
  parseDepartures,
  airlineCodes,
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

describe('airlineCodes', () => {
  it('lists up to three codes, then a count', () => {
    const a = (code) => ({ code, name: code });
    expect(airlineCodes([a('CX'), a('BA')])).toBe('CX BA');
    expect(airlineCodes(['AA', 'BA', 'CX', 'DL', 'EK'].map(a))).toBe('AA BA CX +2');
    expect(airlineCodes(undefined)).toBe('');
  });
});

describe('buildBoard', () => {
  it('drops unknown and too-short routes, shortest session first', () => {
    const board = buildBoard(SAMPLE, { now: 0 });
    expect(board.rows.map((r) => r.iata)).toEqual(['TPE', 'SIN', 'LHR']);
    expect(board.counts.all).toBe(3);
    expect(board.rows[2].airlineLabel).toBe('CX BA');
  });

  it('scales sessions with the multiplier, like the boarding pass', () => {
    const at1 = buildBoard(SAMPLE, { multiplier: 1 }).rows.find((r) => r.iata === 'LHR');
    const at2 = buildBoard(SAMPLE, { multiplier: 2 }).rows.find((r) => r.iata === 'LHR');
    expect(at1.sessionMinutes).toBe(722);
    expect(at2.sessionMinutes).toBe(361);
  });

  it('filters by session length and counts each bucket', () => {
    const board = buildBoard(SAMPLE, { filter: 'ultra' });
    expect(board.rows.map((r) => r.iata)).toEqual(['LHR']);
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

  it('HKG, LCY and NRT have plausible, readable boards', () => {
    for (const [iata, dest] of [['HKG', 'LHR'], ['LCY', 'AMS'], ['NRT', 'LAX']]) {
      const data = parseDepartures(load(iata), iata);
      expect(data, iata).not.toBeNull();
      const board = buildBoard(data);
      expect(board.rows.map((r) => r.iata)).toContain(dest);
    }
  });
});
