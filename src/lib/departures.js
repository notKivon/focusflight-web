// The departures board, as data. Pure: turns an airport's route file
// (public/departures/<IATA>.json, built by scripts/build-departures.mjs) into
// the rows the board prints, at the current speed multiplier.

import { validateRoute, sessionMinutes, formatDuration } from './geo.js';
import { findAirport, placeName } from './airports.js';
import { formatLocalTime } from './preflight.js';
import { assignFlightNumbers, formatFlight } from './flightnumbers.js';

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

/** A route file is usable if it has the right shape; anything else is empty. */
export function parseDepartures(data, iata) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.departures)) return null;
  if (iata && data.from !== String(iata).toUpperCase()) return null;
  return data;
}

/**
 * Board rows for one departure airport: one per flight, meaning one per
 * (destination, operating airline), shortest session first, then by
 * destination code and airline name. Routes to airports missing from the
 * dataset, or too short to fly, are dropped rather than shown as rows that
 * could not be picked. A route with no named carrier still gets one row.
 *
 * @returns {{from: object, rows: object[], counts: Record<string, number>, source: string}}
 */
export function buildBoard(data, { multiplier = 1, filter = 'all', now = Date.now() } = {}) {
  const from = findAirport(data?.from);
  const departures = data?.departures ?? [];
  const numbers = assignFlightNumbers(
    from?.iata ?? '',
    departures.flatMap((d) => (d.airlines ?? []).filter((a) => a?.code).map((a) => ({ to: d.to, code: a.code }))),
  );
  const all = [];
  for (const departure of departures) {
    const to = findAirport(departure.to);
    if (!from || !to) continue;
    const route = validateRoute(from, to);
    if (!route.ok) continue;
    const session = sessionMinutes(route.distanceKm, multiplier);
    const shared = {
      to,
      iata: to.iata,
      place: placeName(to),
      distanceKm: route.distanceKm,
      sessionMinutes: session,
      sessionLabel: formatDuration(session),
      landsLabel: formatLocalTime(now + session * MS_PER_MINUTE),
    };
    const carriers = (departure.airlines ?? []).filter((a) => a?.code);
    for (const airline of carriers.length ? carriers : [null]) {
      const code = airline?.code ?? '';
      const flight = code ? formatFlight(code, numbers.get(`${to.iata}-${code}`)) : '';
      const name = airline ? airline.name || code : '';
      all.push({
        ...shared,
        key: code ? `${to.iata}-${code}` : to.iata,
        airline: name,
        code,
        flight,
        title: [[name, flight].filter(Boolean).join(' '), `${from.name} → ${to.name}`]
          .filter(Boolean)
          .join(' · '),
      });
    }
  }
  all.sort(
    (a, b) =>
      a.sessionMinutes - b.sessionMinutes || a.iata.localeCompare(b.iata) || a.airline.localeCompare(b.airline),
  );

  const inFilter = (row, f) => row.sessionMinutes >= f.min && row.sessionMinutes < f.max;
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, all.filter((row) => inFilter(row, f)).length]));
  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  return {
    from,
    filter: active.id,
    rows: all.filter((row) => inFilter(row, active)),
    counts,
    source: data?.source ?? '',
  };
}
