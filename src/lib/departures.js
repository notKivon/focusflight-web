// The departures board, as data. Pure: turns an airport's route file
// (public/departures/<IATA>.json, built by scripts/build-departures.mjs) into
// the rows the board prints, at the current speed multiplier.

import { validateRoute, sessionMinutes, formatDuration } from './geo.js';
import { findAirport, placeName } from './airports.js';
import { formatLocalTime } from './preflight.js';

const MS_PER_MINUTE = 60000;

/** Where an airport's route file is served from. */
export function departuresUrl(iata) {
  return `/departures/${encodeURIComponent(String(iata ?? '').toUpperCase())}.json`;
}

/**
 * Session-length filters. Bounds are in session minutes at the current speed,
 * because the question at the gate is "how long will I focus?".
 */
export const FILTERS = [
  { id: 'all', label: 'All', min: 0, max: Infinity },
  { id: 'short', label: '< 1h', min: 0, max: 60 },
  { id: 'medium', label: '1–3h', min: 60, max: 180 },
  { id: 'long', label: '3–6h', min: 180, max: 360 },
  { id: 'ultra', label: '6h+', min: 360, max: Infinity },
];

/** Max airline codes a row lists before eliding to "+N". */
const AIRLINE_CODES = 3;

/** A route file is usable if it has the right shape; anything else is empty. */
export function parseDepartures(data, iata) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.departures)) return null;
  if (iata && data.from !== String(iata).toUpperCase()) return null;
  return data;
}

/** "CX BA VS +2" — short enough for one board row. */
export function airlineCodes(airlines) {
  const codes = (airlines ?? []).map((a) => a.code).filter(Boolean);
  const shown = codes.slice(0, AIRLINE_CODES).join(' ');
  return codes.length > AIRLINE_CODES ? `${shown} +${codes.length - AIRLINE_CODES}` : shown;
}

/**
 * Board rows for one departure airport, shortest session first.
 * Routes to airports missing from the dataset, or too short to fly, are
 * dropped rather than shown as rows that could not be picked.
 *
 * @returns {{from: object, rows: object[], counts: Record<string, number>, source: string}}
 */
export function buildBoard(data, { multiplier = 1, filter = 'all', now = Date.now() } = {}) {
  const from = findAirport(data?.from);
  const all = [];
  for (const departure of data?.departures ?? []) {
    const to = findAirport(departure.to);
    if (!from || !to) continue;
    const route = validateRoute(from, to);
    if (!route.ok) continue;
    const session = sessionMinutes(route.distanceKm, multiplier);
    all.push({
      to,
      iata: to.iata,
      place: placeName(to),
      airlines: departure.airlines ?? [],
      airlineLabel: airlineCodes(departure.airlines),
      airlineNames: (departure.airlines ?? []).map((a) => a.name).join(', '),
      distanceKm: route.distanceKm,
      sessionMinutes: session,
      sessionLabel: formatDuration(session),
      landsLabel: formatLocalTime(now + session * MS_PER_MINUTE),
    });
  }
  all.sort((a, b) => a.sessionMinutes - b.sessionMinutes || a.iata.localeCompare(b.iata));
  return { from, ...applyFilter(all, filter), source: data?.source ?? '' };
}

/**
 * Narrows rows (anything with `sessionMinutes`) to one session-length filter,
 * keeping their order, and counts every filter so empty ones can be disabled.
 */
export function applyFilter(all, filter = 'all') {
  const inFilter = (row, f) => row.sessionMinutes >= f.min && row.sessionMinutes < f.max;
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, all.filter((row) => inFilter(row, f)).length]));
  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  return { filter: active.id, rows: all.filter((row) => inFilter(row, active)), counts };
}
