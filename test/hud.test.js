import { describe, it, expect } from 'vitest';
import airports from '../src/data/airports.json';
import { Flight } from '../src/lib/engine.js';
import { buildHud, buildArrival, flightTitle, routeLabel, formatFocused } from '../src/lib/hud.js';

const byIata = new Map(airports.map((a) => [a.iata, a]));
const ap = (iata) => byIata.get(iata);

const T0 = Date.parse('2026-09-25T09:00:00.000Z');
const min = (n) => n * 60000;

/** HKG→LHR: 9,630 km, 722 base minutes. */
function inFlight({ multiplier = 1, label = '' } = {}) {
  return Flight.create({ from: ap('HKG'), to: ap('LHR'), multiplier, label, now: T0 }).takeOff(T0);
}

describe('routeLabel / flightTitle', () => {
  it('prints the route with a spaced arrow', () => {
    expect(routeLabel(ap('HKG'), ap('LHR'))).toBe('HKG → LHR');
  });

  it('builds the document title as HH:MM:SS · FROM→TO', () => {
    const flight = inFlight();
    expect(flightTitle(flight.snapshot(T0))).toBe('12:02:00 · HKG→LHR');
  });

  it('pads the title clock below ten hours', () => {
    const flight = inFlight({ multiplier: 2 });
    expect(flightTitle(flight.snapshot(T0))).toBe('06:01:00 · HKG→LHR');
  });
});

describe('formatFocused', () => {
  it('reads in seconds under a minute and in hours above', () => {
    expect(formatFocused(0)).toBe('0s');
    expect(formatFocused(42)).toBe('42s');
    expect(formatFocused(90)).toBe('2m'); // 1.5 min rounds to the nearest minute
    expect(formatFocused(3600)).toBe('1h');
    expect(formatFocused(4335)).toBe('1h 12m');
  });
});

describe('buildHud', () => {
  it('describes a flight just after take-off', () => {
    const model = buildHud(inFlight().snapshot(T0), T0);
    expect(model.status).toBe('inflight');
    expect(model.paused).toBe(false);
    expect(model.route).toBe('HKG → LHR');
    expect(model.clock).toBe('12:02:00');
    expect(model.percentLabel).toBe('0%');
    expect(model.phase).toBe('Climbing');
    expect(model.multiplierLabel).toBe('1×');
    expect(model.groundSpeedLabel).toBe('800 km/h');
    expect(model.distanceLabel).toBe('9,630 km');
    expect(model.flownLabel).toBe('0 km');
    expect(model.remainingLabel).toBe('9,630 km');
    expect(model.pauseLabel).toBe('Pause');
  });

  it('tracks progress, phase and distance flown at the half-way point', () => {
    const flight = inFlight();
    const model = buildHud(flight.snapshot(T0 + min(361)), T0 + min(361));
    expect(model.percentLabel).toBe('50%');
    expect(model.phase).toBe('Cruising');
    expect(model.flownLabel).toBe('4,815 km');
    expect(model.remainingLabel).toBe('4,815 km');
    expect(model.clock).toBe('6:01:00');
  });

  it('scales the countdown and the ground speed with the multiplier', () => {
    const model = buildHud(inFlight({ multiplier: 4 }).snapshot(T0), T0);
    expect(model.clock).toBe('3:00:30');
    expect(model.multiplierLabel).toBe('4×');
    expect(model.groundSpeedLabel).toBe('3,200 km/h');
  });

  it('shows the landing time as a wall clock, and drops it when paused', () => {
    const flight = inFlight({ multiplier: 10 });
    const running = buildHud(flight.snapshot(T0), T0);
    expect(running.etaLabel).toMatch(/\d{2}:\d{2}/);

    flight.pause(T0 + min(10));
    const paused = buildHud(flight.snapshot(T0 + min(20)), T0 + min(20));
    expect(paused.paused).toBe(true);
    expect(paused.phase).toBe('Paused');
    expect(paused.pauseLabel).toBe('Resume');
    expect(paused.etaLabel).toBe('—');
  });

  it('carries the flight label through', () => {
    expect(buildHud(inFlight({ label: 'Thesis chapter 3' }).snapshot(T0), T0).label)
      .toBe('Thesis chapter 3');
  });
});

describe('buildArrival', () => {
  it('reports the whole route once the flight has arrived', () => {
    const flight = inFlight({ multiplier: 10 });
    flight.update(T0 + min(200)); // 722 base minutes at 10× lands after 72.2
    expect(flight.status).toBe('arrived');

    const model = buildArrival(flight.snapshot(T0 + min(200)));
    expect(model.arrived).toBe(true);
    expect(model.heading).toBe('Arrived');
    expect(model.kind).toBe('Landed');
    expect(model.route).toBe('HKG → LHR');
    expect(model.distanceLabel).toBe('9,630 km');
    expect(model.percentLabel).toBe('100%');
    expect(model.focusedLabel).toBe('1h 12m');
    expect(model.focusedClock).toBe('1:12:12');
    expect(model.message).toBe('You focused for 1h 12m flying HKG → LHR.');
  });

  it('reports only the distance flown when the flight was aborted', () => {
    const flight = inFlight({ multiplier: 10 });
    flight.abort(T0 + min(36.1)); // half way
    const model = buildArrival(flight.snapshot(T0 + min(40)));
    expect(model.arrived).toBe(false);
    expect(model.heading).toBe('Flight ended');
    expect(model.kind).toBe('Aborted');
    expect(model.percentLabel).toBe('50%');
    expect(model.distanceLabel).toBe('4,815 km');
    expect(model.message).toContain('before ending this flight');
  });
});
