// The immersion clock: how long since the last sign of life, and whether the
// HUD should be out of the way. Pure — every method takes an explicit `now`,
// the same way the flight engine does, so it tests on a fake clock.

/** The HUD fades after this long without pointer movement or a keypress. */
export const IDLE_MS = 3000;

export class IdleWatch {
  #timeoutMs;
  #onChange;
  #enabled = false;
  #hidden = false;
  #lastActivity = 0;
  #holds = new Set();

  /**
   * @param {{timeoutMs?: number, onChange?: (hidden: boolean) => void}} config
   */
  constructor({ timeoutMs = IDLE_MS, onChange = () => {} } = {}) {
    this.#timeoutMs = timeoutMs;
    this.#onChange = onChange;
  }

  /** True while the HUD is meant to be out of sight. */
  get hidden() {
    return this.#hidden;
  }

  get enabled() {
    return this.#enabled;
  }

  /** The reasons currently keeping the HUD visible, for tests and debugging. */
  get holds() {
    return [...this.#holds];
  }

  /**
   * Arm the fade — the flight screen is up. Starts visible with a full window
   * and no holds: whatever the previous screen was hovering is gone with it.
   */
  enable(now = Date.now()) {
    this.#enabled = true;
    this.#holds.clear();
    this.#lastActivity = now;
    this.#show();
  }

  /** Disarm: off the flight screen nothing hides, whatever the pointer does. */
  disable() {
    this.#enabled = false;
    this.#holds.clear();
    this.#show();
  }

  /** A sign of life: pointer movement, a click or a keypress. */
  wake(now = Date.now()) {
    this.#lastActivity = now;
    this.#show();
  }

  /**
   * Keep the HUD up for a named reason — the pointer resting on a panel, or
   * focus sitting in one. Releasing a hold starts the idle window again, so
   * the HUD never vanishes the instant the pointer leaves it.
   */
  hold(reason, active) {
    if (active) this.#holds.add(reason);
    else this.#holds.delete(reason);
    if (active) this.#show();
  }

  /** The heartbeat. Hides once the window has passed and nothing holds it. */
  check(now = Date.now()) {
    if (!this.#enabled) return this.#hidden;
    if (this.#holds.size > 0) {
      this.#lastActivity = now; // held time is not idle time
      this.#show();
      return this.#hidden;
    }
    if (now - this.#lastActivity >= this.#timeoutMs) this.#set(true);
    return this.#hidden;
  }

  #show() {
    this.#set(false);
  }

  #set(hidden) {
    if (this.#hidden === hidden) return;
    this.#hidden = hidden;
    this.#onChange(hidden);
  }
}
