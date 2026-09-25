// The logbook, as data. Pure: it turns stored log entries into every string
// the logbook screen prints, so the UI layer does no arithmetic, no date maths
// and no formatting of its own.
//
// Entries arrive in the order storage hands them over (`loadLogbook` sorts
// newest first); this module never reorders them, so there is one sort rule in
// the app and it lives in `storage.js`.

import { formatDuration } from './geo.js';
import { groupDigits, formatMultiplier, formatLocalTime } from './preflight.js';
import { formatFocused } from './hud.js';
import { findAirport } from './airports.js';
import { logbookStats } from './storage.js';

const MS_PER_DAY = 86400000;

/** Shown when a stored IATA code is not in the dataset any more. */
const UNKNOWN_PORT = { iata: '???', name: 'Unknown airport', city: '', country: '' };

/** A stored IATA code back to an airport record. */
export function port(iata) {
  return findAirport(iata) ?? { ...UNKNOWN_PORT, iata: String(iata ?? UNKNOWN_PORT.iata) };
}

/**
 * When a flight ended, in the browser's own timezone: "Today, 21:42",
 * "Yesterday, 08:05", "25 Sep, 21:42", or "25 Sep 2025, 21:42" in a past year.
 */
export function formatWhen(ms, now = Date.now()) {
  const when = new Date(ms);
  const time = formatLocalTime(ms);
  const day = when.toDateString(); // locale-independent, so it compares safely
  if (day === new Date(now).toDateString()) return `Today, ${time}`;
  if (day === new Date(now - MS_PER_DAY).toDateString()) return `Yesterday, ${time}`;
  const sameYear = when.getFullYear() === new Date(now).getFullYear();
  const date = when.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return `${date}, ${time}`;
}

/**
 * The speeds a flight was flown at: "2×", or "1× → 4×" when it changed in the
 * air. A long list is elided rather than allowed to wrap the row.
 */
export function formatSpeeds(changes) {
  const list = Array.isArray(changes) ? changes : [];
  const labels = list
    .map((change) => formatMultiplier(change?.multiplier ?? 1))
    .filter((label, i, all) => label !== all[i - 1]); // a repeat says nothing
  if (labels.length === 0) return formatMultiplier(1);
  if (labels.length <= 3) return labels.join(' → ');
  return `${labels[0]} → … → ${labels[labels.length - 1]}`;
}

/** One row of the logbook. */
export function buildEntry(entry, now = Date.now()) {
  const from = port(entry.from);
  const to = port(entry.to);
  const arrived = entry.status === 'arrived';
  const focusedSeconds = Math.max(0, Number(entry.focused_seconds) || 0);
  const distanceKm = Math.max(0, Number(entry.distance_km) || 0);
  const endedMs = Date.parse(entry.ended_at);
  const route = `${from.iata} → ${to.iata}`;
  return {
    id: entry.id,
    status: arrived ? 'arrived' : 'aborted',
    arrived,
    from,
    to,
    route,
    label: entry.label ?? '',
    focusedSeconds,
    focusedLabel: formatFocused(focusedSeconds),
    distanceKm,
    distanceLabel: `${groupDigits(distanceKm)} km`,
    baseLabel: formatDuration(Math.max(0, Number(entry.base_minutes) || 0)),
    speedLabel: formatSpeeds(entry.speed_changes),
    statusLabel: arrived ? 'Landed' : 'Aborted',
    endedAt: entry.ended_at,
    whenLabel: Number.isNaN(endedMs) ? '—' : formatWhen(endedMs, now),
    // Screen readers need to know which flight a bare ✕ would remove.
    deleteLabel: `Delete the ${route} flight`,
  };
}

/**
 * The whole screen. Focus time counts aborted flights too — that time was
 * still focused — while distance and the flight count only credit arrivals.
 */
export function buildLogbook(entries, now = Date.now()) {
  const list = Array.isArray(entries) ? entries : [];
  const totals = logbookStats(list);
  const rows = list.map((entry) => buildEntry(entry, now));
  return {
    empty: rows.length === 0,
    count: rows.length,
    countLabel: rows.length === 1 ? '1 flight' : `${rows.length} flights`,
    stats: {
      focusedSeconds: totals.focusedSeconds,
      focusedHours: totals.focusedHours,
      focusedLabel: formatFocused(totals.focusedSeconds),
      distanceKm: totals.distanceKm,
      distanceLabel: `${groupDigits(totals.distanceKm)} km`,
      arrivedCount: totals.arrivedCount,
      arrivedLabel: String(totals.arrivedCount),
    },
    entries: rows,
    emptyHeadline: 'No flights yet',
    emptyMessage: 'Finished flights land here, with the time you focused for.',
  };
}
