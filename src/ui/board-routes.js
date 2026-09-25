// The route-list half of the departures board: every route the static
// OpenFlights snapshot lists from an airport, as board markup. Also the
// session-length filter chips, which the live list shares.

import { FILTERS, departuresUrl, parseDepartures } from '../lib/departures.js';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ENTITIES[c]);

/** Route files never change within a visit, so each is fetched at most once. */
const cache = new Map();

export async function loadDepartures(iata, signal) {
  if (cache.has(iata)) return cache.get(iata);
  const res = await fetch(departuresUrl(iata), { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = parseDepartures(await res.json(), iata);
  if (!data) throw new Error('Unreadable departures file');
  cache.set(iata, data);
  return data;
}

/** Filter chips for a board from `applyFilter`; empty filters are disabled. */
export function filterChips(board) {
  const chips = FILTERS.map(
    (f) => `<button type="button" class="chip chip--sm" data-filter="${f.id}"
              aria-pressed="${f.id === board.filter}" ${board.counts[f.id] ? '' : 'disabled'}>${f.label}</button>`,
  ).join('');
  return `<div class="chips board-filters" role="group" aria-label="Filter by session length">${chips}</div>`;
}

/** The board body for route mode, from `buildBoard`. */
export function routesBody(board, { selected, hasKey }) {
  if (!board.counts.all) {
    return '<p class="board-note">No listed routes from here. Type a destination instead.</p>';
  }
  const rows = board.rows
    .map(
      (row) => `
      <li>
        <button type="button" class="board-row" data-pick="${escape(row.iata)}"
                aria-pressed="${row.iata === selected}"
                title="${escape(row.to.name)} · ${escape(row.airlineNames)}">
          <span class="board-dest"><b>${escape(row.iata)}</b> <span>${escape(row.place)}</span></span>
          <span class="board-airline">${escape(row.airlineLabel)}</span>
          <span class="board-time">${escape(row.sessionLabel)}</span>
          <span class="board-lands">${escape(row.landsLabel)}</span>
        </button>
      </li>`,
    )
    .join('');
  const hint = hasKey ? '' : ' Add an AirLabs key in Settings ⚙ for live departures.';
  return `
    ${filterChips(board)}
    <div class="board-cols" aria-hidden="true">
      <span>Destination</span><span>Airline</span><span>Session</span><span>Lands</span>
    </div>
    <ul class="board-list">${rows || '<li class="board-note">Nothing in this range.</li>'}</ul>
    <p class="board-source">Routes: ${escape(board.source)}. Not a live schedule.${hint}</p>
  `;
}
