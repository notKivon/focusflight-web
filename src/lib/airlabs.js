// Live departures from AirLabs (https://airlabs.co), with a key the user
// brings. Pure: builds the request URL, reads the response and turns it into
// board rows. The key lives only in this browser's settings and is sent only to
// AirLabs; the site itself holds no key (see CLAUDE.md, Secrets policy).

import { validateRoute, sessionMinutes, formatDuration } from './geo.js';
import { findAirport, placeName } from './airports.js';
import { formatLocalTime } from './preflight.js';

export const AIRLABS_SIGNUP_URL = 'https://airlabs.co/signup';

const SCHEDULES_URL = 'https://airlabs.co/api/v9/schedules';

/** Only what the board prints, to keep responses small. */
const FIELDS = [
  'flight_iata', 'flight_icao', 'airline_iata', 'cs_flight_iata',
  'dep_iata', 'dep_terminal', 'dep_gate',
  'dep_time_ts', 'dep_estimated_ts', 'dep_actual_ts', 'dep_time_utc',
  'arr_iata', 'status', 'dep_delayed',
].join(',');

/** A fetched board is reused this long, because free keys have a small monthly quota. */
export const LIVE_TTL_MS = 10 * 60 * 1000;
/** A manual refresh is ignored until the data is at least this old. */
export const MIN_REFRESH_MS = 60 * 1000;
/** Flights that left longer ago than this are off the board. */
const GONE_AFTER_MS = 30 * 60 * 1000;
/** Delays shorter than this read as on time, as on airport boards. */
const DELAY_THRESHOLD_MIN = 5;

/** A usable key, trimmed, or null. AirLabs keys are opaque tokens. */
export function normalizeKey(key) {
  const trimmed = String(key ?? '').trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(trimmed) ? trimmed : null;
}

/** "abcd…wxyz", so Settings can show which key is saved without showing it. */
export function maskKey(key) {
  const k = normalizeKey(key);
  if (!k) return '';
  return k.length <= 8 ? '••••' : `${k.slice(0, 4)}…${k.slice(-4)}`;
}

export function schedulesUrl(iata, key) {
  const params = new URLSearchParams({
    dep_iata: String(iata ?? '').toUpperCase(),
    api_key: key,
    _fields: FIELDS,
  });
  return `${SCHEDULES_URL}?${params}`;
}

export function isFresh(fetchedAt, now = Date.now(), ttl = LIVE_TTL_MS) {
  return Number.isFinite(fetchedAt) && now - fetchedAt < ttl;
}

/** Why a request failed, in words the board can show. */
export const ERROR_TEXT = {
  key: 'AirLabs did not accept your key. Check it in Settings ⚙.',
  quota: 'Your AirLabs request quota is used up.',
  network: 'AirLabs could not be reached.',
  other: 'AirLabs returned an error.',
};

/**
 * Reads a schedules response.
 * @returns {{ok: true, flights: object[]} | {ok: false, reason: string, message: string}}
 */
export function parseSchedules(data) {
  if (data?.error) {
    const code = String(data.error.code ?? '');
    const reason = /key/.test(code) ? 'key' : /limit|quota|exceed/.test(code) ? 'quota' : 'other';
    const detail = String(data.error.message ?? '').slice(0, 120);
    return { ok: false, reason, message: reason === 'other' && detail ? `AirLabs: ${detail}` : ERROR_TEXT[reason] };
  }
  if (!Array.isArray(data?.response)) return { ok: false, reason: 'other', message: ERROR_TEXT.other };
  return { ok: true, flights: data.response };
}

/** Seconds (AirLabs `*_ts`) or "YYYY-MM-DD HH:MM" UTC, to epoch ms. */
function toMs(ts, utc) {
  if (Number.isFinite(ts)) return ts * 1000;
  const ms = Date.parse(`${String(utc ?? '').replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? ms : null;
}

/** The status column: cancelled, departed, delayed or on time. */
export function statusOf(flight, now = Date.now()) {
  const delay = Math.max(0, Math.round(Number(flight.dep_delayed) || 0));
  if (flight.status === 'cancelled') return { kind: 'cancelled', label: 'Cancelled' };
  const actual = toMs(flight.dep_actual_ts, null);
  if (flight.status === 'active' || flight.status === 'landed' || (actual && actual <= now)) {
    return { kind: 'departed', label: 'Departed' };
  }
  if (delay >= DELAY_THRESHOLD_MIN) return { kind: 'delayed', label: `+${formatDuration(delay)}` };
  return { kind: 'ontime', label: 'On time' };
}

/**
 * Board rows for one departure airport, earliest departure first.
 * Codeshare duplicates, flights long gone, and destinations that cannot be
 * flown in the app (unknown or under 150 km) are dropped.
 */
export function buildLiveRows(flights, fromIata, { multiplier = 1, now = Date.now() } = {}) {
  const from = findAirport(fromIata);
  if (!from) return [];
  const rows = [];
  const seen = new Set();
  for (const flight of flights ?? []) {
    if (flight?.cs_flight_iata) continue; // a marketing number for another row
    const to = findAirport(flight?.arr_iata);
    if (!to) continue;
    const route = validateRoute(from, to);
    if (!route.ok) continue;
    const scheduled = toMs(flight.dep_time_ts, flight.dep_time_utc);
    if (scheduled == null) continue;
    const expected = toMs(flight.dep_actual_ts, null) ?? toMs(flight.dep_estimated_ts, null) ?? scheduled;
    if (expected < now - GONE_AFTER_MS) continue;
    const number = flight.flight_iata || flight.flight_icao || '';
    const id = `${number}|${scheduled}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const session = sessionMinutes(route.distanceKm, multiplier);
    const status = statusOf(flight, now);
    const gate = [flight.dep_terminal && `Terminal ${flight.dep_terminal}`, flight.dep_gate && `Gate ${flight.dep_gate}`]
      .filter(Boolean)
      .join(' · ');
    rows.push({
      id,
      to,
      iata: to.iata,
      place: placeName(to),
      flight: number,
      scheduledAt: scheduled,
      expectedAt: expected,
      timeLabel: formatLocalTime(scheduled),
      expectedLabel: expected !== scheduled ? formatLocalTime(expected) : '',
      gate,
      status: status.kind,
      statusLabel: status.label,
      distanceKm: route.distanceKm,
      sessionMinutes: session,
      sessionLabel: formatDuration(session),
    });
  }
  return rows.sort((a, b) => a.scheduledAt - b.scheduledAt || a.flight.localeCompare(b.flight));
}
