// Airport lookup and search ranking. Pure data work — no DOM, no app state.
//
// The dataset is small enough (1,171 rows) to scan on every keystroke, so the
// index is just a normalised copy of each row built once on first use.

import airports from '../data/airports.json';

export const AIRPORTS = airports;

export const DEFAULT_SEARCH_LIMIT = 8;

/** Lowercase, unaccented, trimmed — so "zurich" finds "Zürich". */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

let index = null;

function getIndex() {
  if (index) return index;
  index = AIRPORTS.map((airport) => ({
    airport,
    iata: normalize(airport.iata),
    name: normalize(airport.name),
    city: normalize(airport.city),
    country: normalize(airport.country),
  }));
  return index;
}

let byIata = null;

/** The airport with this IATA code, or null. Case-insensitive. */
export function findAirport(iata) {
  if (!byIata) byIata = new Map(AIRPORTS.map((a) => [a.iata, a]));
  return byIata.get(String(iata ?? '').toUpperCase().trim()) ?? null;
}

/**
 * Rank of a row against a normalised query; lower is better, -1 is no match.
 * The order is what makes "LHR" put Heathrow first and "lon" put London's
 * airports above Long Beach.
 */
function rank(row, query) {
  if (row.iata === query) return 0;
  if (row.iata.startsWith(query)) return 1;
  if (row.city.startsWith(query)) return 2;
  if (row.name.startsWith(query)) return 3;
  if (row.country.startsWith(query)) return 4;
  if (row.city.includes(query)) return 5;
  if (row.name.includes(query)) return 6;
  if (row.country.includes(query)) return 7;
  return -1;
}

/**
 * Airports matching `query` by IATA code, city, name or country, best first.
 * An empty query matches nothing — the field shows a hint instead of a list.
 * `exclude` drops one IATA code (the airport already chosen in the other field).
 */
export function searchAirports(query, { limit = DEFAULT_SEARCH_LIMIT, exclude = null } = {}) {
  const q = normalize(query);
  if (!q) return [];
  const skip = String(exclude ?? '').toUpperCase();
  const hits = [];
  for (const row of getIndex()) {
    if (row.airport.iata === skip) continue;
    const score = rank(row, q);
    if (score !== -1) hits.push({ score, row });
  }
  hits.sort((a, b) => a.score - b.score || a.row.iata.localeCompare(b.row.iata));
  return hits.slice(0, Math.max(0, limit)).map((hit) => hit.row.airport);
}

/** "HKG · Hong Kong" — what a chosen airport reads as in a field. */
export function airportLabel(airport) {
  if (!airport) return '';
  return `${airport.iata} · ${airport.city || airport.name}`;
}

/** Longest slice of a query the no-match message repeats back. */
const ECHO_LIMIT = 24;

/**
 * What the field says when a search finds nothing, or '' for a blank query
 * (an empty field is not a failed search). Typing the airport already picked
 * at the other end gets its own explanation: that code does exist, it has
 * only been set aside.
 */
export function noMatchMessage(query, { exclude = null } = {}) {
  const text = String(query ?? '').trim();
  const q = normalize(text);
  if (!q) return '';
  if (exclude && q === normalize(exclude)) {
    return `${String(exclude).toUpperCase()} is already the other end of this route.`;
  }
  const echo = text.length > ECHO_LIMIT ? `${text.slice(0, ECHO_LIMIT - 1)}…` : text;
  return `No airport matches “${echo}”. Try a code, city or country.`;
}
