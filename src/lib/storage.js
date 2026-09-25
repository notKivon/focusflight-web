// localStorage persistence. No DOM, no flight maths — this module only knows
// how to put plain records in and get plain records back out.
//
// Every value is wrapped in an envelope carrying `schemaVersion`, so a future
// format change can be detected instead of crashing on stale data. Anything
// unreadable (missing, corrupt, wrong version) reads back as "nothing stored".

export const SCHEMA_VERSION = 1;

export const KEYS = {
  activeFlight: 'ffw.activeFlight',
  logbook: 'ffw.logbook',
  settings: 'ffw.settings',
};

export const DEFAULT_SETTINGS = {
  multiplier: 1,
  mapView: 'route',
  sound: true,
  lastFrom: null, // IATA code, to pre-fill the boarding pass
  lastTo: null,
};

/** A no-op store, so the app still runs where localStorage is blocked. */
const NULL_STORE = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/**
 * The default backend. Resolved per call (not at import time) because reading
 * `localStorage` can throw outright in a sandboxed or privacy-locked context.
 */
export function defaultStore() {
  try {
    return globalThis.localStorage ?? NULL_STORE;
  } catch {
    return NULL_STORE;
  }
}

/** Reads one envelope. Returns the payload, or null if it is unusable. */
function read(store, key) {
  let raw;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const envelope = JSON.parse(raw);
    if (!envelope || envelope.schemaVersion !== SCHEMA_VERSION) return null;
    return envelope.data ?? null;
  } catch {
    return null;
  }
}

/** Writes one envelope. Returns false if the write failed (quota, blocked). */
function write(store, key, data) {
  try {
    store.setItem(key, JSON.stringify({ schemaVersion: SCHEMA_VERSION, data }));
    return true;
  } catch {
    return false;
  }
}

function remove(store, key) {
  try {
    store.removeItem(key);
  } catch {
    /* nothing to undo */
  }
}

// ---------------------------------------------------------------- active flight

/**
 * Saves the in-progress flight. Takes a `Flight` (serialised via `toJSON`) or
 * an already-plain record. Called every 5 s and on `visibilitychange`.
 */
export function saveActiveFlight(flight, store = defaultStore()) {
  if (!flight) return false;
  const data = typeof flight.toJSON === 'function' ? flight.toJSON() : flight;
  return write(store, KEYS.activeFlight, data);
}

/**
 * Reads the saved flight record, or null. Deliberately returns plain data:
 * bringing it back to life is `Flight.restore`'s job, not storage's.
 */
export function loadActiveFlight(store = defaultStore()) {
  const data = read(store, KEYS.activeFlight);
  if (!data || !data.from || !data.to) return null;
  return data;
}

export function clearActiveFlight(store = defaultStore()) {
  remove(store, KEYS.activeFlight);
}

// --------------------------------------------------------------------- logbook

const isEntry = (e) =>
  !!e && typeof e.id === 'string' && !!e.from && !!e.to && !!e.ended_at;

const endedAtMs = (e) => {
  const t = Date.parse(e.ended_at);
  return Number.isNaN(t) ? 0 : t;
};

/** Newest first by `ended_at`. */
function sortEntries(entries) {
  return [...entries].sort((a, b) => endedAtMs(b) - endedAtMs(a));
}

/** Every logged flight, newest first. Junk entries are dropped, not thrown on. */
export function loadLogbook(store = defaultStore()) {
  const data = read(store, KEYS.logbook);
  if (!Array.isArray(data)) return [];
  return sortEntries(data.filter(isEntry));
}

export function saveLogbook(entries, store = defaultStore()) {
  return write(store, KEYS.logbook, sortEntries(entries.filter(isEntry)));
}

/**
 * Adds a finished flight. Takes a `Flight` (via `toLogEntry`) or a plain entry.
 * Re-saving the same `id` replaces it, so a double save cannot duplicate a
 * flight. Returns the new logbook, newest first.
 */
export function appendFlight(flight, store = defaultStore()) {
  const entry = typeof flight?.toLogEntry === 'function' ? flight.toLogEntry() : flight;
  if (!isEntry(entry)) return loadLogbook(store);
  const kept = loadLogbook(store).filter((e) => e.id !== entry.id);
  const next = sortEntries([entry, ...kept]);
  saveLogbook(next, store);
  return next;
}

/** Removes one entry by id. Returns the new logbook. */
export function deleteFlight(id, store = defaultStore()) {
  const next = loadLogbook(store).filter((e) => e.id !== id);
  saveLogbook(next, store);
  return next;
}

/**
 * Logbook totals. Focus time counts every flight (an aborted flight still had
 * focus in it); distance and the flight count only credit arrivals.
 */
export function logbookStats(entries) {
  const list = Array.isArray(entries) ? entries.filter(isEntry) : [];
  const arrived = list.filter((e) => e.status === 'arrived');
  const focusedSeconds = list.reduce((sum, e) => sum + (Number(e.focused_seconds) || 0), 0);
  return {
    focusedSeconds,
    focusedHours: focusedSeconds / 3600,
    distanceKm: arrived.reduce((sum, e) => sum + (Number(e.distance_km) || 0), 0),
    arrivedCount: arrived.length,
    totalCount: list.length,
  };
}

// -------------------------------------------------------------------- settings

/** Stored settings merged over the defaults, so a partial record is fine. */
export function loadSettings(store = defaultStore()) {
  const data = read(store, KEYS.settings);
  if (!data || typeof data !== 'object') return { ...DEFAULT_SETTINGS };
  const merged = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (data[key] !== undefined) merged[key] = data[key];
  }
  return merged;
}

/** Merges a patch into the stored settings. Returns the settings now in force. */
export function saveSettings(patch, store = defaultStore()) {
  const next = { ...loadSettings(store), ...patch };
  write(store, KEYS.settings, next);
  return next;
}
