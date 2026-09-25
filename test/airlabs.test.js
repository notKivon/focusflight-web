// Live departures from AirLabs: key handling, request URL, response parsing
// and board rows. No network — responses are shaped like AirLabs v9.

import { describe, it, expect } from 'vitest';
import {
  normalizeKey,
  maskKey,
  schedulesUrl,
  isFresh,
  parseSchedules,
  statusOf,
  buildLiveRows,
  LIVE_TTL_MS,
  MIN_REFRESH_MS,
  ERROR_TEXT,
} from '../src/lib/airlabs.js';
import { applyFilter } from '../src/lib/departures.js';

const KEY = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789';
const NOW = Date.UTC(2026, 8, 26, 12, 0); // 12:00 UTC
const ts = (h, m) => Date.UTC(2026, 8, 26, h, m) / 1000;

const flight = (over) => ({
  flight_iata: 'CX251',
  airline_iata: 'CX',
  dep_iata: 'HKG',
  arr_iata: 'LHR',
  dep_time_ts: ts(13, 0),
  status: 'scheduled',
  ...over,
});

describe('normalizeKey / maskKey', () => {
  it('trims a plausible key and rejects junk', () => {
    expect(normalizeKey(`  ${KEY}\n`)).toBe(KEY);
    expect(normalizeKey('')).toBeNull();
    expect(normalizeKey('short')).toBeNull();
    expect(normalizeKey('has spaces in it')).toBeNull();
    expect(normalizeKey('key"><script>')).toBeNull();
    expect(normalizeKey(null)).toBeNull();
  });

  it('shows only the ends of a key', () => {
    expect(maskKey(KEY)).toBe('a1b2…6789');
    expect(maskKey(KEY)).not.toContain('e5f6');
    expect(maskKey('')).toBe('');
  });
});

describe('schedulesUrl', () => {
  it('asks AirLabs for departures from the airport, with the key', () => {
    const url = new URL(schedulesUrl('hkg', KEY));
    expect(url.origin + url.pathname).toBe('https://airlabs.co/api/v9/schedules');
    expect(url.searchParams.get('dep_iata')).toBe('HKG');
    expect(url.searchParams.get('api_key')).toBe(KEY);
    expect(url.searchParams.get('_fields')).toContain('arr_iata');
  });
});

describe('isFresh', () => {
  it('holds a fetch for the TTL, and a refresh for a minute', () => {
    expect(isFresh(NOW, NOW + LIVE_TTL_MS - 1)).toBe(true);
    expect(isFresh(NOW, NOW + LIVE_TTL_MS)).toBe(false);
    expect(isFresh(NOW, NOW + MIN_REFRESH_MS - 1, MIN_REFRESH_MS)).toBe(true);
    expect(isFresh(NOW, NOW + MIN_REFRESH_MS, MIN_REFRESH_MS)).toBe(false);
    expect(isFresh(undefined, NOW)).toBe(false);
  });
});

describe('parseSchedules', () => {
  it('returns the flights of a good response', () => {
    const data = { request: {}, response: [flight()] };
    expect(parseSchedules(data)).toEqual({ ok: true, flights: [flight()] });
  });

  it('names a bad key, a spent quota and anything else', () => {
    const err = (code, message = 'x') => parseSchedules({ error: { code, message } });
    expect(err('unknown_api_key')).toMatchObject({ ok: false, reason: 'key', message: ERROR_TEXT.key });
    expect(err('wrong_api_key')).toMatchObject({ reason: 'key' });
    expect(err('month_limit_exceeded')).toMatchObject({ reason: 'quota', message: ERROR_TEXT.quota });
    expect(err('not_found', 'Nothing here')).toMatchObject({ reason: 'other', message: 'AirLabs: Nothing here' });
    expect(parseSchedules(null)).toMatchObject({ ok: false, reason: 'other' });
    expect(parseSchedules({ response: 'nope' })).toMatchObject({ ok: false });
  });
});

describe('statusOf', () => {
  it('reads cancelled, departed, delayed and on time', () => {
    expect(statusOf(flight({ status: 'cancelled' }), NOW).label).toBe('Cancelled');
    expect(statusOf(flight({ status: 'active' }), NOW).kind).toBe('departed');
    expect(statusOf(flight({ dep_actual_ts: ts(11, 50) }), NOW).kind).toBe('departed');
    expect(statusOf(flight({ dep_delayed: 25 }), NOW)).toEqual({ kind: 'delayed', label: '+25m' });
    expect(statusOf(flight({ dep_delayed: 90 }), NOW).label).toBe('+1h 30m');
    expect(statusOf(flight({ dep_delayed: 3 }), NOW)).toEqual({ kind: 'ontime', label: 'On time' });
    expect(statusOf(flight(), NOW).kind).toBe('ontime');
  });
});

describe('buildLiveRows', () => {
  const flights = [
    flight({ flight_iata: 'CX251', arr_iata: 'LHR', dep_time_ts: ts(14, 0), dep_gate: '32', dep_terminal: '1' }),
    flight({ flight_iata: 'BA7001', arr_iata: 'LHR', dep_time_ts: ts(14, 0), cs_flight_iata: 'CX251' }), // codeshare
    flight({ flight_iata: 'CX400', arr_iata: 'TPE', dep_time_ts: ts(12, 30), dep_estimated_ts: ts(12, 55), dep_delayed: 25 }),
    flight({ flight_iata: 'CX900', arr_iata: 'MFM', dep_time_ts: ts(12, 10) }), // 64 km: too short
    flight({ flight_iata: 'ZZ1', arr_iata: 'ZZZ' }), // not in the dataset
    flight({ flight_iata: 'CX100', arr_iata: 'SIN', dep_time_ts: ts(11, 0), dep_actual_ts: ts(11, 5), status: 'active' }), // long gone
    flight({ flight_iata: 'CX710', arr_iata: 'SIN', dep_time_ts: ts(11, 45), status: 'active' }), // just left
    { flight_iata: 'CX1', arr_iata: 'NRT', dep_time_utc: '2026-09-26 15:30', status: 'scheduled' }, // no *_ts
    flight({ flight_iata: 'CX251', arr_iata: 'LHR', dep_time_ts: ts(14, 0) }), // duplicate
  ];

  it('keeps flyable, current, operating flights, earliest first', () => {
    const rows = buildLiveRows(flights, 'HKG', { now: NOW });
    expect(rows.map((r) => r.flight)).toEqual(['CX710', 'CX400', 'CX251', 'CX1']);
  });

  it('carries gate, status, expected time and the session at the current speed', () => {
    const rows = buildLiveRows(flights, 'HKG', { now: NOW, multiplier: 2 });
    const lhr = rows.find((r) => r.flight === 'CX251');
    expect(lhr.gate).toBe('Terminal 1 · Gate 32');
    expect(lhr.statusLabel).toBe('On time');
    expect(lhr.expectedLabel).toBe('');
    expect(lhr.to.iata).toBe('LHR');
    expect(lhr.sessionMinutes).toBeCloseTo(buildLiveRows(flights, 'HKG', { now: NOW })[2].sessionMinutes / 2, 0);

    const tpe = rows.find((r) => r.flight === 'CX400');
    expect(tpe.status).toBe('delayed');
    expect(tpe.expectedAt).toBe(ts(12, 55) * 1000);
    expect(tpe.expectedLabel).not.toBe('');

    expect(rows.find((r) => r.flight === 'CX1').scheduledAt).toBe(Date.UTC(2026, 8, 26, 15, 30));
    expect(rows.find((r) => r.flight === 'CX710').statusLabel).toBe('Departed');
  });

  it('gives nothing for an unknown airport or no flights', () => {
    expect(buildLiveRows(flights, 'ZZZ', { now: NOW })).toEqual([]);
    expect(buildLiveRows(undefined, 'HKG', { now: NOW })).toEqual([]);
  });

  it('works with the shared session-length filters, keeping time order', () => {
    const rows = buildLiveRows(flights, 'HKG', { now: NOW });
    const board = applyFilter(rows, 'short');
    expect(board.filter).toBe('short');
    expect(board.counts.all).toBe(4);
    expect(board.rows.every((r) => r.sessionMinutes < 60)).toBe(true);
    expect(applyFilter(rows, 'bogus').filter).toBe('all');
    expect(applyFilter(rows, 'all').rows.map((r) => r.flight)).toEqual(rows.map((r) => r.flight));
  });
});
