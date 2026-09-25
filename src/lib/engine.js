// Flight state machine. Wall-clock only (no tick counting), no DOM, no storage.
//
// Progress is a fraction of the *base* duration (distance / 800 km/h), so the
// multiplier only ever scales how fast that fraction accrues. Changing speed
// mid-flight therefore leaves the plane exactly where it is.

import {
  validateRoute,
  interpolate,
  headingAt,
  phaseLabel,
  groundSpeedKmh,
} from './geo.js';

export const MIN_MULTIPLIER = 0.25;
export const MAX_MULTIPLIER = 10;
export const MULTIPLIER_STEP = 0.25;
export const PRESET_MULTIPLIERS = [0.5, 1, 2, 4, 10];
export const MAX_LABEL_LENGTH = 60;

const MS_PER_MINUTE = 60000;

/** Snaps a multiplier to the allowed range and 0.25 step. */
export function clampMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  const stepped = Math.round(n / MULTIPLIER_STEP) * MULTIPLIER_STEP;
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, stepped));
}

const iso = (ms) => new Date(ms).toISOString();
const newId = () => globalThis.crypto.randomUUID();

export class Flight {
  /** Use `Flight.create` / `Flight.restore`; this takes already-settled fields. */
  constructor(fields) {
    Object.assign(this, fields);
  }

  /**
   * Builds a `preflight` flight. Throws if the route is invalid, so callers
   * validate with `validateRoute` before offering take-off.
   */
  static create({ from, to, multiplier = 1, label = '', id, now = Date.now() }) {
    const route = validateRoute(from, to);
    if (!route.ok) throw new Error(route.message);
    return new Flight({
      id: id ?? newId(),
      from,
      to,
      distanceKm: route.distanceKm,
      baseMinutes: route.baseMinutes,
      multiplier: clampMultiplier(multiplier),
      label: String(label).slice(0, MAX_LABEL_LENGTH),
      status: 'preflight',
      speedChanges: [],
      progressAtMark: 0,
      focusedMsAtMark: 0,
      markAt: now,
      startedAt: null,
      endedAt: null,
    });
  }

  get baseDurationMs() {
    return Math.max(1, this.baseMinutes * MS_PER_MINUTE);
  }

  get isActive() {
    return this.status === 'inflight' || this.status === 'paused';
  }

  /** Whole base duration still to fly, in ms, as of the last mark. */
  #remainingBaseMsAtMark() {
    return (1 - this.progressAtMark) * this.baseDurationMs;
  }

  /**
   * Folds the time since the last mark into `progressAtMark` / `focusedMsAtMark`
   * and moves the mark to `now`. Time past the arrival moment is dropped, so a
   * flight that landed while the tab was closed logs the right focused time.
   * Returns the arrival timestamp when this settle crossed the finish line.
   */
  #settle(now) {
    if (this.status !== 'inflight') {
      this.markAt = now;
      return null;
    }
    const elapsed = Math.max(0, now - this.markAt);
    const msToArrival = this.#remainingBaseMsAtMark() / this.multiplier;
    const used = Math.min(elapsed, msToArrival);
    this.progressAtMark = Math.min(1, this.progressAtMark + (used * this.multiplier) / this.baseDurationMs);
    this.focusedMsAtMark += used;
    this.markAt = now;
    return elapsed >= msToArrival ? now - (elapsed - msToArrival) : null;
  }

  /** preflight → inflight. Records the take-off multiplier at progress 0. */
  takeOff(now = Date.now()) {
    if (this.status !== 'preflight') throw new Error(`Cannot take off from ${this.status}`);
    this.status = 'inflight';
    this.startedAt = now;
    this.markAt = now;
    this.speedChanges = [{ at_progress: 0, multiplier: this.multiplier }];
    return this;
  }

  /**
   * Changes speed. Before take-off this just re-plans the session; in flight it
   * settles progress first, so the plane holds its position and the remaining
   * time is recomputed against the new multiplier.
   */
  setMultiplier(value, now = Date.now()) {
    if (!this.isActive && this.status !== 'preflight') return this;
    const next = clampMultiplier(value);
    if (next === this.multiplier) return this;
    if (this.status === 'preflight') {
      this.multiplier = next;
      return this;
    }
    this.update(now);
    if (!this.isActive) return this;
    this.multiplier = next;
    this.speedChanges.push({ at_progress: this.progressAtMark, multiplier: next });
    return this;
  }

  pause(now = Date.now()) {
    this.update(now); // settles progress up to now, so the pause loses nothing
    if (this.status !== 'inflight') return this;
    this.status = 'paused';
    return this;
  }

  resume(now = Date.now()) {
    if (this.status !== 'paused') return this;
    this.status = 'inflight';
    this.markAt = now;
    return this;
  }

  abort(now = Date.now()) {
    this.update(now);
    if (!this.isActive) return this;
    this.status = 'aborted';
    this.endedAt = now;
    return this;
  }

  /**
   * Brings the flight up to `now`, landing it if its time is up.
   * Safe to call as often as the UI likes; it is the only mutator of progress.
   */
  update(now = Date.now()) {
    if (this.status !== 'inflight') return this.status;
    const arrivedAt = this.#settle(now);
    if (arrivedAt !== null) {
      this.status = 'arrived';
      this.endedAt = arrivedAt;
    }
    return this.status;
  }

  /** Everything the UI draws, as of `now`. Advances the flight first. */
  snapshot(now = Date.now()) {
    this.update(now);
    const progress = this.progressAtMark;
    const remainingSeconds = (this.#remainingBaseMsAtMark() / this.multiplier) / 1000;
    return {
      id: this.id,
      status: this.status,
      from: this.from,
      to: this.to,
      label: this.label,
      distanceKm: this.distanceKm,
      baseMinutes: this.baseMinutes,
      multiplier: this.multiplier,
      progress,
      remainingSeconds,
      focusedSeconds: this.focusedMsAtMark / 1000,
      distanceFlownKm: this.distanceKm * progress,
      groundSpeedKmh: groundSpeedKmh(this.multiplier),
      phase: phaseLabel(progress),
      position: interpolate(this.from, this.to, progress),
      heading: headingAt(this.from, this.to, progress),
    };
  }

  /** Plain object for `ffw.activeFlight`. Times are ISO 8601 UTC. */
  toJSON() {
    return {
      id: this.id,
      from: this.from,
      to: this.to,
      distance_km: this.distanceKm,
      base_minutes: this.baseMinutes,
      multiplier: this.multiplier,
      label: this.label,
      status: this.status,
      speed_changes: this.speedChanges,
      progress: this.progressAtMark,
      focused_seconds: this.focusedMsAtMark / 1000,
      mark_at: iso(this.markAt),
      started_at: this.startedAt === null ? null : iso(this.startedAt),
      ended_at: this.endedAt === null ? null : iso(this.endedAt),
    };
  }

  /**
   * Rebuilds a flight from `toJSON`. Time that passed while the tab was closed
   * counts as flown (unless it was paused), so the plane resumes in the right place.
   */
  static restore(data, now = Date.now()) {
    if (!data || !data.from || !data.to) return null;
    const flight = new Flight({
      id: data.id ?? newId(),
      from: data.from,
      to: data.to,
      distanceKm: data.distance_km,
      baseMinutes: data.base_minutes,
      multiplier: clampMultiplier(data.multiplier),
      label: data.label ?? '',
      status: data.status,
      speedChanges: data.speed_changes ?? [],
      progressAtMark: data.progress ?? 0,
      focusedMsAtMark: (data.focused_seconds ?? 0) * 1000,
      markAt: Date.parse(data.mark_at),
      startedAt: data.started_at ? Date.parse(data.started_at) : null,
      endedAt: data.ended_at ? Date.parse(data.ended_at) : null,
    });
    flight.update(now);
    return flight;
  }

  /** Logbook entry for a finished flight (arrived or aborted). */
  toLogEntry() {
    if (this.status !== 'arrived' && this.status !== 'aborted') {
      throw new Error(`Flight is still ${this.status}`);
    }
    return {
      id: this.id,
      from: this.from.iata,
      to: this.to.iata,
      distance_km: this.distanceKm,
      base_minutes: this.baseMinutes,
      speed_changes: this.speedChanges,
      focused_seconds: Math.round(this.focusedMsAtMark / 1000),
      started_at: iso(this.startedAt),
      ended_at: iso(this.endedAt),
      status: this.status,
      label: this.label,
    };
  }
}
