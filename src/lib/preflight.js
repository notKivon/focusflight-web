// Pre-flight planning: turns a chosen route and multiplier into everything the
// boarding pass prints. Pure — the UI layer does no arithmetic and no formatting.

import {
  validateRoute,
  sessionMinutes,
  groundSpeedKmh,
  formatDuration,
} from './geo.js';
import { clampMultiplier, MAX_LABEL_LENGTH } from './engine.js';

const MS_PER_MINUTE = 60000;

/** 9630 → "9,630". Own grouping so output does not shift with the locale. */
export function groupDigits(value) {
  const rounded = Math.round(Number(value) || 0);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 1 → "1×", 0.5 → "0.5×", 2.25 → "2.25×". */
export function formatMultiplier(multiplier) {
  const n = clampMultiplier(multiplier);
  return `${Number(n.toFixed(2))}×`;
}

/** Arrival wall-clock time in the browser's own timezone, e.g. "21:42". */
export function formatLocalTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Trims a free-text label to the stored maximum. */
export function trimLabel(label) {
  return String(label ?? '').slice(0, MAX_LABEL_LENGTH);
}

/**
 * The boarding pass, as data. Always returns the speed figures — they are real
 * even before a route is picked — and adds the route figures once it is valid.
 * `ok: false` carries the exact message the screen must show.
 *
 * @returns {{ok: boolean, message?: string, multiplier: number, ...}}
 */
export function buildPlan({ from = null, to = null, multiplier = 1, now = Date.now() } = {}) {
  const speed = clampMultiplier(multiplier);
  const base = {
    ok: false,
    from,
    to,
    multiplier: speed,
    multiplierLabel: formatMultiplier(speed),
    groundSpeedKmh: groundSpeedKmh(speed),
    groundSpeedLabel: `${groupDigits(groundSpeedKmh(speed))} km/h`,
    distanceKm: 0,
    baseMinutes: 0,
    sessionMinutes: 0,
    distanceLabel: '—',
    baseLabel: '—',
    sessionLabel: '—',
    arrivalAt: null,
    arrivalLabel: '—',
  };

  const route = validateRoute(from, to);
  if (!route.ok) return { ...base, message: route.message };

  const session = sessionMinutes(route.distanceKm, speed);
  const arrivalAt = now + session * MS_PER_MINUTE;
  return {
    ...base,
    ok: true,
    distanceKm: route.distanceKm,
    baseMinutes: route.baseMinutes,
    sessionMinutes: session,
    distanceLabel: `${groupDigits(route.distanceKm)} km`,
    baseLabel: formatDuration(route.baseMinutes),
    sessionLabel: formatDuration(session),
    arrivalAt,
    arrivalLabel: formatLocalTime(arrivalAt),
  };
}
