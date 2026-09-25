// The in-flight HUD and the arrival screen, as data. Pure: it turns a flight
// snapshot into every string those screens print, so the UI layer does no
// arithmetic and no formatting of its own.

import { formatClock, formatTitleClock, formatDuration } from './geo.js';
import { groupDigits, formatMultiplier, formatLocalTime } from './preflight.js';

const MS_PER_SECOND = 1000;

/** "HKG → LHR", for headings. */
export function routeLabel(from, to) {
  return `${from.iata} → ${to.iata}`;
}

/** `document.title` while in flight: "07:12:03 · HKG→LHR". */
export function flightTitle(snapshot) {
  const clock = formatTitleClock(snapshot.remainingSeconds);
  return `${clock} · ${snapshot.from.iata}→${snapshot.to.iata}`;
}

/** Focus time reads in seconds under a minute, so a quick flight isn't "0m". */
export function formatFocused(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return s < 60 ? `${s}s` : formatDuration(s / 60);
}

/**
 * Everything the HUD shows for one tick. `now` only decides the landing time,
 * which is a wall-clock reading rather than a duration.
 */
export function buildHud(snapshot, now = Date.now()) {
  const paused = snapshot.status === 'paused';
  const percent = Math.round(snapshot.progress * 100);
  const remainingKm = Math.max(0, snapshot.distanceKm - snapshot.distanceFlownKm);
  return {
    status: snapshot.status,
    paused,
    from: snapshot.from,
    to: snapshot.to,
    route: routeLabel(snapshot.from, snapshot.to),
    label: snapshot.label ?? '',
    clock: formatClock(snapshot.remainingSeconds),
    title: flightTitle(snapshot),
    progress: snapshot.progress,
    percent,
    percentLabel: `${percent}%`,
    phase: paused ? 'Paused' : snapshot.phase,
    multiplier: snapshot.multiplier,
    multiplierLabel: formatMultiplier(snapshot.multiplier),
    groundSpeedLabel: `${groupDigits(snapshot.groundSpeedKmh)} km/h`,
    flownLabel: `${groupDigits(snapshot.distanceFlownKm)} km`,
    remainingLabel: `${groupDigits(remainingKm)} km`,
    distanceLabel: `${groupDigits(snapshot.distanceKm)} km`,
    focusedLabel: formatFocused(snapshot.focusedSeconds),
    // A paused flight has no landing time: it is not going anywhere.
    etaLabel: paused ? '—' : formatLocalTime(now + snapshot.remainingSeconds * MS_PER_SECOND),
    pauseLabel: paused ? 'Resume' : 'Pause',
  };
}

/**
 * The arrival screen. An aborted flight reports the distance actually flown;
 * an arrived one reports the whole route.
 */
export function buildArrival(snapshot) {
  const arrived = snapshot.status === 'arrived';
  const distanceKm = arrived ? snapshot.distanceKm : snapshot.distanceFlownKm;
  const focusedLabel = formatFocused(snapshot.focusedSeconds);
  const route = routeLabel(snapshot.from, snapshot.to);
  return {
    arrived,
    status: snapshot.status,
    heading: arrived ? 'Arrived' : 'Flight ended',
    kind: arrived ? 'Landed' : 'Aborted',
    from: snapshot.from,
    to: snapshot.to,
    route,
    label: snapshot.label ?? '',
    percentLabel: `${Math.round(snapshot.progress * 100)}%`,
    focusedSeconds: snapshot.focusedSeconds,
    focusedLabel,
    focusedClock: formatClock(snapshot.focusedSeconds),
    distanceKm,
    distanceLabel: `${groupDigits(distanceKm)} km`,
    // The route reads better than the city here: OurAirports' municipality for
    // KUL is "Sepang", which nobody would recognise as the destination.
    message: arrived
      ? `You focused for ${focusedLabel} flying ${route}.`
      : `You focused for ${focusedLabel} before ending this flight.`,
  };
}
