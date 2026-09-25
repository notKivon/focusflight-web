// The live half of the departures board: fetches an airport's departures from
// AirLabs with the user's own key, and renders them. Rows and wording come
// from `lib/airlabs.js`; the board (`ui/departures.js`) decides when to call.

import { applyFilter } from '../lib/departures.js';
import {
  ERROR_TEXT,
  MIN_REFRESH_MS,
  buildLiveRows,
  isFresh,
  parseSchedules,
  schedulesUrl,
} from '../lib/airlabs.js';
import { formatLocalTime } from '../lib/preflight.js';
import { filterChips } from './board-routes.js';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ENTITIES[c]);

/** One entry per airport: `{key, fetchedAt, flights}`. Free keys have a small quota. */
const cache = new Map();

export class LiveError extends Error {
  constructor(reason, message = ERROR_TEXT[reason]) {
    super(message);
    this.reason = reason;
  }
}

/**
 * Departures for one airport, from the cache while it is fresh. `force`
 * refetches, but never more than once a minute.
 * @returns {Promise<{fetchedAt: number, flights: object[]}>}
 */
export async function fetchLive(iata, key, { signal, force = false, now = Date.now() } = {}) {
  const hit = cache.get(iata);
  if (hit?.key === key && isFresh(hit.fetchedAt, now, force ? MIN_REFRESH_MS : undefined)) return hit;

  let data;
  try {
    const res = await fetch(schedulesUrl(iata, key), { signal, referrerPolicy: 'no-referrer' });
    data = await res.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new LiveError('network');
  }
  const parsed = parseSchedules(data);
  if (!parsed.ok) throw new LiveError(parsed.reason, parsed.message);
  const entry = { key, fetchedAt: now, flights: parsed.flights };
  cache.set(iata, entry);
  return entry;
}

/** The board body for live mode. `live` is the board's live state. */
export function liveBody(live, { from, filter, multiplier, selected }) {
  if (live.state === 'loading') return '<p class="board-note" role="status">Loading live departures…</p>';
  if (live.state === 'error') {
    return `<p class="board-note" role="status">${escape(live.message)} Switch to Routes to pick from the route list.</p>`;
  }
  if (live.state !== 'ready') return '';

  const all = buildLiveRows(live.flights, from.iata, { multiplier });
  const footer = `
    <p class="board-source">
      Live from AirLabs · updated ${escape(formatLocalTime(live.fetchedAt))}
      <button type="button" class="board-refresh" data-refresh>Refresh</button>
    </p>`;
  if (!all.length) {
    return `<p class="board-note">No upcoming departures from here in the next few hours.</p>${footer}`;
  }
  const board = applyFilter(all, filter);
  const rows = board.rows
    .map((row) => {
      const title = [row.to.name, row.flight, row.gate, row.expectedLabel && `Expected ${row.expectedLabel}`]
        .filter(Boolean)
        .join(' · ');
      return `
        <li>
          <button type="button" class="board-row board-row--live" data-pick="${escape(row.iata)}"
                  data-key="${escape(row.id)}" aria-pressed="${row.iata === selected}" title="${escape(title)}">
            <span class="board-when">${escape(row.timeLabel)}</span>
            <span class="board-flight">${escape(row.flight)}</span>
            <span class="board-dest"><b>${escape(row.iata)}</b> <span>${escape(row.place)}</span></span>
            <span class="board-time">${escape(row.sessionLabel)}</span>
            <span class="board-status" data-status="${row.status}">${escape(row.statusLabel)}</span>
          </button>
        </li>`;
    })
    .join('');
  return `
    ${filterChips(board)}
    <div class="board-cols board-cols--live" aria-hidden="true">
      <span>Time</span><span>Flight</span><span>Destination</span><span>Session</span><span>Status</span>
    </div>
    <ul class="board-list">${rows || '<li class="board-note">Nothing in this range.</li>'}</ul>
    ${footer}
  `;
}
