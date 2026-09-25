// The three-second fade, on a fake clock: no timers, no DOM.

import { describe, it, expect } from 'vitest';
import { IdleWatch, IDLE_MS } from '../src/lib/idle.js';

/** Records every visibility change so the tests can count them. */
function watch(over = {}) {
  const changes = [];
  const w = new IdleWatch({ onChange: (hidden) => changes.push(hidden), ...over });
  return { w, changes };
}

describe('IdleWatch', () => {
  it('does nothing until it is enabled — the pre-flight screen stays put', () => {
    const { w, changes } = watch();
    expect(w.check(IDLE_MS * 10)).toBe(false);
    expect(w.hidden).toBe(false);
    expect(changes).toEqual([]);
  });

  it('hides after the timeout and not a moment before', () => {
    const { w, changes } = watch();
    w.enable(0);
    expect(w.check(IDLE_MS - 1)).toBe(false);
    expect(w.check(IDLE_MS)).toBe(true);
    expect(changes).toEqual([true]);
  });

  it('comes back on any sign of life and starts the window again', () => {
    const { w } = watch();
    w.enable(0);
    w.check(IDLE_MS);
    expect(w.hidden).toBe(true);

    w.wake(IDLE_MS);
    expect(w.hidden).toBe(false);
    expect(w.check(IDLE_MS * 2 - 1)).toBe(false);
    expect(w.check(IDLE_MS * 2)).toBe(true);
  });

  it('reports each change once, however often it is checked', () => {
    const { w, changes } = watch();
    w.enable(0);
    for (let t = 0; t <= IDLE_MS * 2; t += 500) w.check(t);
    w.wake(IDLE_MS * 2);
    for (let t = IDLE_MS * 2; t <= IDLE_MS * 4; t += 500) w.check(t);
    expect(changes).toEqual([true, false, true]);
  });

  it('stays up while something holds it, and waits a full window after', () => {
    const { w } = watch();
    w.enable(0);
    w.hold('pointer', true);
    expect(w.check(IDLE_MS * 5)).toBe(false);
    expect(w.holds).toEqual(['pointer']);

    w.hold('pointer', false);
    expect(w.check(IDLE_MS * 5 + 1)).toBe(false); // the window restarts on release
    expect(w.check(IDLE_MS * 6)).toBe(true);
  });

  it('needs every hold released before it will hide', () => {
    const { w } = watch();
    w.enable(0);
    w.hold('pointer', true);
    w.hold('focus', true);
    w.check(IDLE_MS);
    w.hold('pointer', false);
    expect(w.check(IDLE_MS * 2)).toBe(false);
    w.hold('focus', false);
    expect(w.check(IDLE_MS * 4)).toBe(true);
  });

  it('shows again the moment a hold is taken while hidden', () => {
    const { w } = watch();
    w.enable(0);
    w.check(IDLE_MS);
    expect(w.hidden).toBe(true);
    w.hold('focus', true);
    expect(w.hidden).toBe(false);
  });

  it('disabling reveals the HUD and drops the holds — the flight is over', () => {
    const { w, changes } = watch();
    w.enable(0);
    w.hold('pointer', true);
    w.check(IDLE_MS);
    w.hold('pointer', false);
    w.check(IDLE_MS * 2);
    expect(w.hidden).toBe(true);

    w.disable();
    expect(w.hidden).toBe(false);
    expect(w.enabled).toBe(false);
    expect(w.holds).toEqual([]);
    expect(changes.at(-1)).toBe(false);
  });

  it('re-enabling starts clean: visible, unheld, with a full window', () => {
    const { w } = watch();
    w.enable(0);
    w.hold('pointer', true); // the pass was under the pointer at take-off
    w.disable();

    w.enable(1000);
    expect(w.holds).toEqual([]);
    expect(w.check(1000 + IDLE_MS - 1)).toBe(false);
    expect(w.check(1000 + IDLE_MS)).toBe(true);
  });

  it('honours a custom timeout', () => {
    const { w } = watch({ timeoutMs: 800 });
    w.enable(0);
    expect(w.check(799)).toBe(false);
    expect(w.check(800)).toBe(true);
  });
});
