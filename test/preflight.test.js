// The boarding pass as data: what the screen prints, and what it refuses.

import { describe, it, expect } from 'vitest';
import { findAirport } from '../src/lib/airports.js';
import { TOO_SHORT_MESSAGE, MIN_ROUTE_KM } from '../src/lib/geo.js';
import { MAX_LABEL_LENGTH } from '../src/lib/engine.js';
import {
  buildPlan,
  groupDigits,
  formatMultiplier,
  formatLocalTime,
  trimLabel,
} from '../src/lib/preflight.js';

const HKG = findAirport('HKG');
const LHR = findAirport('LHR');
const SIN = findAirport('SIN');
const KUL = findAirport('KUL');
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

describe('formatting helpers', () => {
  it('groups thousands', () => {
    expect(groupDigits(9630)).toBe('9,630');
    expect(groupDigits(800)).toBe('800');
    expect(groupDigits(1234567)).toBe('1,234,567');
    expect(groupDigits(0)).toBe('0');
  });

  it('writes multipliers without trailing zeros', () => {
    expect(formatMultiplier(1)).toBe('1×');
    expect(formatMultiplier(0.5)).toBe('0.5×');
    expect(formatMultiplier(2.25)).toBe('2.25×');
    expect(formatMultiplier(10)).toBe('10×');
  });

  it('clamps a multiplier before printing it', () => {
    expect(formatMultiplier(99)).toBe('10×');
    expect(formatMultiplier(0.01)).toBe('0.25×');
  });

  it('prints arrival as a local wall-clock time', () => {
    expect(formatLocalTime(NOW)).toMatch(/\d{1,2}[:.]\d{2}/);
  });

  it('trims a label to the stored maximum', () => {
    expect(trimLabel('x'.repeat(100))).toHaveLength(MAX_LABEL_LENGTH);
    expect(trimLabel(null)).toBe('');
    expect(trimLabel(' deep work ')).toBe(' deep work ');
  });
});

describe('buildPlan — valid routes', () => {
  it('prints distance, base time and session length for HKG→LHR at 1×', () => {
    const plan = buildPlan({ from: HKG, to: LHR, multiplier: 1, now: NOW });
    expect(plan.ok).toBe(true);
    expect(plan.distanceKm).toBe(9630);
    expect(plan.distanceLabel).toBe('9,630 km');
    expect(plan.baseMinutes).toBe(722);
    expect(plan.sessionMinutes).toBe(722);
    expect(plan.baseLabel).toBe('12h 2m');
    expect(plan.sessionLabel).toBe('12h 2m');
    expect(plan.groundSpeedLabel).toBe('800 km/h');
  });

  it('halves the session at 2× and doubles it at 0.5×, leaving base time alone', () => {
    const fast = buildPlan({ from: HKG, to: LHR, multiplier: 2, now: NOW });
    const slow = buildPlan({ from: HKG, to: LHR, multiplier: 0.5, now: NOW });
    expect(fast.baseMinutes).toBe(722);
    expect(fast.sessionMinutes).toBe(361);
    expect(slow.sessionMinutes).toBe(1444);
    expect(fast.groundSpeedLabel).toBe('1,600 km/h');
    expect(slow.groundSpeedLabel).toBe('400 km/h');
  });

  it('dates arrival at now plus the session length', () => {
    const plan = buildPlan({ from: HKG, to: LHR, multiplier: 10, now: NOW });
    expect(plan.sessionMinutes).toBe(72);
    expect(plan.arrivalAt).toBe(NOW + 72 * 60000);
    expect(plan.arrivalLabel).toBe(formatLocalTime(NOW + 72 * 60000));
  });

  it('accepts a short-but-legal hop', () => {
    const plan = buildPlan({ from: SIN, to: KUL, multiplier: 1, now: NOW });
    expect(plan.ok).toBe(true);
    expect(plan.distanceKm).toBeGreaterThanOrEqual(MIN_ROUTE_KM);
    expect(plan.message).toBeUndefined();
  });

  it('snaps an off-step multiplier onto the 0.25 grid', () => {
    const plan = buildPlan({ from: HKG, to: LHR, multiplier: 1.1, now: NOW });
    expect(plan.multiplier).toBe(1);
    expect(plan.multiplierLabel).toBe('1×');
  });
});

describe('buildPlan — blocked routes', () => {
  it('rejects a route under 150 km with the exact message', () => {
    const near = { iata: 'NEA', name: 'Near', city: 'Near', country: 'X', lat: HKG.lat + 0.5, lon: HKG.lon };
    const plan = buildPlan({ from: HKG, to: near, multiplier: 1, now: NOW });
    expect(plan.ok).toBe(false);
    expect(plan.message).toBe(TOO_SHORT_MESSAGE);
    expect(plan.message).toBe('Too short to fly — pick a further destination.');
  });

  it('rejects the same airport twice', () => {
    const plan = buildPlan({ from: HKG, to: HKG, multiplier: 1, now: NOW });
    expect(plan.ok).toBe(false);
    expect(plan.message).toBe('Departure and arrival must differ.');
  });

  it('asks for both airports when one is missing', () => {
    for (const args of [{ from: HKG, to: null }, { from: null, to: LHR }, {}]) {
      const plan = buildPlan({ ...args, now: NOW });
      expect(plan.ok).toBe(false);
      expect(plan.message).toBe('Pick a departure and an arrival airport.');
    }
  });

  it('still reports the speed it would have flown at', () => {
    const plan = buildPlan({ from: HKG, to: HKG, multiplier: 4, now: NOW });
    expect(plan.multiplierLabel).toBe('4×');
    expect(plan.groundSpeedLabel).toBe('3,200 km/h');
    expect(plan.distanceLabel).toBe('—');
    expect(plan.sessionLabel).toBe('—');
    expect(plan.arrivalAt).toBeNull();
  });
});
