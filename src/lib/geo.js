// Pure great-circle maths and route rules. No DOM, no app state.

export const EARTH_RADIUS_KM = 6371;
export const BLOCK_SPEED_KMH = 800;
export const MIN_ROUTE_KM = 150;
export const TOO_SHORT_MESSAGE = 'Too short to fly — pick a further destination.';

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

/** Great-circle distance in km, rounded to the nearest km. */
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Angular separation in radians, used by the interpolation. */
function centralAngle(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Point at fraction `t` ∈ [0,1] along the great circle from `a` to `b` (slerp).
 * Longitudes come back in (-180, 180]; callers that draw arcs unwrap them.
 */
export function interpolate(a, b, t) {
  const d = centralAngle(a, b);
  if (d === 0) return { lat: a.lat, lon: a.lon };
  const f = Math.min(1, Math.max(0, t));
  const sinD = Math.sin(d);
  const A = Math.sin((1 - f) * d) / sinD;
  const B = Math.sin(f * d) / sinD;
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(b.lon);
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  return {
    lat: toDeg(Math.atan2(z, Math.hypot(x, y))),
    lon: toDeg(Math.atan2(y, x)),
  };
}

/** Initial bearing from `a` to `b`, in degrees clockwise from north [0, 360). */
export function initialBearing(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Heading of the plane at fraction `t`, from the tangent of the great circle. */
export function headingAt(a, b, t) {
  const step = 1e-4;
  const here = interpolate(a, b, Math.min(1 - step, t));
  const next = interpolate(a, b, Math.min(1, Math.max(step, t) + step));
  return initialBearing(here, next);
}

/** Base session length in whole minutes at 1×: distance / 800 km/h. */
export function baseMinutes(distanceKm) {
  return Math.round((distanceKm / BLOCK_SPEED_KMH) * 60);
}

/** Session length in whole minutes once the speed multiplier is applied. */
export function sessionMinutes(distanceKm, multiplier) {
  return Math.round(baseMinutes(distanceKm) / multiplier);
}

/** Displayed ground speed in km/h. */
export function groundSpeedKmh(multiplier) {
  return BLOCK_SPEED_KMH * multiplier;
}

/**
 * Validates a route. Returns `{ ok: true, distanceKm, baseMinutes }`
 * or `{ ok: false, message }`.
 */
export function validateRoute(from, to) {
  if (!from || !to) return { ok: false, message: 'Pick a departure and an arrival airport.' };
  if (from.iata === to.iata) return { ok: false, message: 'Departure and arrival must differ.' };
  const distanceKm = haversineKm(from, to);
  if (distanceKm < MIN_ROUTE_KM) return { ok: false, message: TOO_SHORT_MESSAGE };
  return { ok: true, distanceKm, baseMinutes: baseMinutes(distanceKm) };
}

/** `H:MM:SS` (or `M:SS` under an hour) for a countdown. */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** `HH:MM:SS`, always padded — used in `document.title`. */
export function formatTitleClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

/** Human duration for planning text, e.g. "7h 12m" or "45m". */
export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Cosmetic phase label by progress. */
export function phaseLabel(progress) {
  if (progress < 0.05) return 'Climbing';
  if (progress < 0.95) return 'Cruising';
  return 'Descending';
}
