// The in-flight HUD: countdown, progress, phase, live speed control,
// pause/resume, abort-with-confirm and the map view toggle.
//
// It owns the flight's clock (one interval) and reports every tick upwards;
// the map, persistence and screen changes stay with the caller.

import { PRESET_MULTIPLIERS, MIN_MULTIPLIER, MAX_MULTIPLIER, MULTIPLIER_STEP } from '../lib/engine.js';
import { buildHud } from '../lib/hud.js';
import { formatMultiplier } from '../lib/preflight.js';

/** Twice a second: the countdown reads in whole seconds, the plane moves smoothly. */
const TICK_MS = 500;

/** How long "Confirm end?" stays armed before it goes back to being safe. */
const CONFIRM_MS = 5000;

const STATS = [
  ['phase', 'Phase'],
  ['speed', 'Ground speed'],
  ['flown', 'Flown'],
  ['eta', 'Lands at'],
];

export class FlightHud {
  #root;
  #flight;
  #timer = null;
  #confirmTimer = null;
  #armed = false;
  #view;
  #last = {};
  #callbacks;

  /**
   * @param {HTMLElement} root
   * @param {{flight: object, view?: string, onTick?: Function, onSpeedChange?: Function,
   *          onViewChange?: Function, onPauseChange?: Function, onEnd?: Function,
   *          onArrive?: Function}} config
   */
  constructor(root, { flight, view = 'route', ...callbacks } = {}) {
    this.#root = root;
    this.#flight = flight;
    this.#view = view === 'world' ? 'world' : 'route';
    this.#callbacks = callbacks;
    root.innerHTML = this.#template();
    this.#wire();
    this.#timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  #template() {
    const chips = PRESET_MULTIPLIERS.map(
      (m) => `<button type="button" class="chip" data-preset="${m}">${formatMultiplier(m)}</button>`,
    ).join('');
    const stats = STATS.map(
      ([key, title]) => `<div class="hud-stat"><dt>${title}</dt><dd data-${key}>—</dd></div>`,
    ).join('');

    return `
      <div class="hud">
        <section class="hud-panel hud-flight">
          <header class="hud-ports">
            <div class="hud-port">
              <span class="hud-iata" data-from-iata></span>
              <span class="hud-place" data-from-place></span>
            </div>
            <span class="hud-track" aria-hidden="true"><i class="hud-plane">✈</i></span>
            <div class="hud-port hud-port--to">
              <span class="hud-iata" data-to-iata></span>
              <span class="hud-place" data-to-place></span>
            </div>
          </header>
          <p class="hud-label" data-label hidden></p>
          <p class="hud-clock" data-clock>—</p>
          <div class="hud-bar" role="progressbar" aria-label="Flight progress"
               aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-bar>
            <span class="hud-bar-fill" data-fill></span>
          </div>
          <dl class="hud-stats">${stats}</dl>
        </section>

        <section class="hud-panel hud-controls">
          <div class="hud-row">
            <span class="hud-legend" id="hud-speed-legend">Speed</span>
            <span class="hud-speed-value" data-multiplier>—</span>
          </div>
          <div class="chips" role="group" aria-labelledby="hud-speed-legend">${chips}</div>
          <input class="slider" type="range" data-slider aria-label="Speed multiplier"
                 min="${MIN_MULTIPLIER}" max="${MAX_MULTIPLIER}" step="${MULTIPLIER_STEP}" value="1">
          <div class="hud-row">
            <span class="hud-legend" id="hud-view-legend">Map</span>
            <div class="chips" role="group" aria-labelledby="hud-view-legend">
              <button type="button" class="chip" data-view="route">Route</button>
              <button type="button" class="chip" data-view="world">World</button>
            </div>
          </div>
          <div class="hud-actions">
            <button type="button" class="btn" data-pause>Pause</button>
            <button type="button" class="btn btn--danger" data-end>End flight</button>
          </div>
        </section>
      </div>
    `;
  }

  #wire() {
    const root = this.#root;
    root.querySelector('[data-slider]').addEventListener('input', (event) => {
      this.setMultiplier(event.target.value);
    });
    for (const chip of root.querySelectorAll('[data-preset]')) {
      chip.addEventListener('click', () => this.setMultiplier(chip.dataset.preset));
    }
    for (const chip of root.querySelectorAll('[data-view]')) {
      chip.addEventListener('click', () => this.setView(chip.dataset.view));
    }
    root.querySelector('[data-pause]').addEventListener('click', () => this.togglePause());
    root.querySelector('[data-end]').addEventListener('click', () => this.#end());
  }

  // ------------------------------------------------------------------ actions

  /** Mid-flight speed change: the plane holds position, the clock rescales. */
  setMultiplier(value) {
    this.#flight.setMultiplier(value);
    this.#callbacks.onSpeedChange?.(this.#flight.multiplier);
    this.tick();
  }

  setView(view) {
    this.#view = view === 'world' ? 'world' : 'route';
    this.#callbacks.onViewChange?.(this.#view);
    this.#paintView();
  }

  /** Exposed so step 10 can bind it to the `Space` key. */
  togglePause() {
    const flight = this.#flight;
    if (flight.status === 'paused') flight.resume();
    else if (flight.status === 'inflight') flight.pause();
    else return;
    this.#callbacks.onPauseChange?.(flight.status === 'paused');
    this.tick();
  }

  /** Abort needs two clicks; the first one only arms the button. */
  #end() {
    if (!this.#armed) {
      this.#armed = true;
      this.#paintEnd();
      this.#confirmTimer = setTimeout(() => {
        this.#armed = false;
        this.#paintEnd();
      }, CONFIRM_MS);
      return;
    }
    this.#disarm();
    this.#stop();
    this.#flight.abort();
    this.#callbacks.onEnd?.(this.#flight);
  }

  #disarm() {
    clearTimeout(this.#confirmTimer);
    this.#confirmTimer = null;
    this.#armed = false;
  }

  #stop() {
    clearInterval(this.#timer);
    this.#timer = null;
  }

  // ------------------------------------------------------------------ render

  /** One frame: advance the flight, repaint, and hand the snapshot upwards. */
  tick() {
    const snapshot = this.#flight.snapshot();
    const model = buildHud(snapshot);
    this.#paint(model);
    this.#callbacks.onTick?.(snapshot, model);
    if (snapshot.status === 'arrived') {
      this.#stop();
      this.#disarm();
      this.#callbacks.onArrive?.(this.#flight);
    }
  }

  /** Writes only what changed, so the DOM stays quiet between seconds. */
  #set(key, value) {
    if (this.#last[key] === value) return;
    this.#last[key] = value;
    const node = this.#root.querySelector(`[data-${key}]`);
    if (node) node.textContent = value;
  }

  #paint(model) {
    this.#set('from-iata', model.from.iata);
    this.#set('from-place', model.from.city);
    this.#set('to-iata', model.to.iata);
    this.#set('to-place', model.to.city);
    this.#set('clock', model.clock);
    this.#set('phase', model.phase);
    this.#set('speed', model.groundSpeedLabel);
    this.#set('flown', model.flownLabel);
    this.#set('eta', model.etaLabel);
    this.#set('multiplier', model.multiplierLabel);

    const label = this.#root.querySelector('[data-label]');
    label.hidden = !model.label;
    if (model.label) this.#set('label', model.label);

    const fill = this.#root.querySelector('[data-fill]');
    fill.style.width = `${model.progress * 100}%`;
    this.#root.querySelector('[data-bar]').setAttribute('aria-valuenow', String(model.percent));
    this.#root.querySelector('.hud').dataset.paused = String(model.paused);
    this.#root.querySelector('[data-pause]').textContent = model.pauseLabel;

    const slider = this.#root.querySelector('[data-slider]');
    if (Number(slider.value) !== model.multiplier) slider.value = String(model.multiplier);
    for (const chip of this.#root.querySelectorAll('[data-preset]')) {
      chip.setAttribute('aria-pressed', String(Number(chip.dataset.preset) === model.multiplier));
    }
    this.#paintView();
  }

  #paintView() {
    for (const chip of this.#root.querySelectorAll('[data-view]')) {
      chip.setAttribute('aria-pressed', String(chip.dataset.view === this.#view));
    }
  }

  #paintEnd() {
    const button = this.#root.querySelector('[data-end]');
    button.textContent = this.#armed ? 'Confirm end?' : 'End flight';
    button.classList.toggle('btn--armed', this.#armed);
  }

  destroy() {
    this.#stop();
    this.#disarm();
  }
}
