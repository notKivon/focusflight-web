// The pre-flight screen: a boarding pass. Picks the route, sets the speed,
// shows what the session will cost in real time, and launches the flight.
// All arithmetic and wording comes from `lib/preflight.js`.

import { PRESET_MULTIPLIERS, MIN_MULTIPLIER, MAX_MULTIPLIER, MULTIPLIER_STEP, MAX_LABEL_LENGTH, clampMultiplier } from '../lib/engine.js';
import { buildPlan, formatMultiplier, trimLabel } from '../lib/preflight.js';
import { findAirport } from '../lib/airports.js';
import { AirportField } from './airport-field.js';

/** Arrival time drifts as the user deliberates, so the pass reprints itself. */
const REFRESH_MS = 15000;

const STATS = [
  ['distance', 'Distance'],
  ['base', 'Flight time'],
  ['session', 'Your session'],
  ['speed', 'Ground speed'],
  ['arrival', 'Lands at'],
];

export class PreflightScreen {
  #root;
  #from;
  #to;
  #multiplier;
  #label;
  #onChange;
  #onTakeOff;
  #onRouteChange;
  #slider;
  #timer;

  /**
   * @param {HTMLElement} root
   * @param {{settings?: object, onRouteChange?: (route: object|null) => void,
   *          onChange?: (state: object) => void,
   *          onTakeOff?: (state: object) => void}} config
   */
  constructor(root, { settings = {}, onRouteChange = () => {}, onChange = () => {}, onTakeOff = () => {} } = {}) {
    this.#root = root;
    this.#onChange = onChange;
    this.#onTakeOff = onTakeOff;
    this.#onRouteChange = onRouteChange;
    this.#multiplier = clampMultiplier(settings.multiplier ?? 1);
    this.#label = '';
    root.innerHTML = this.#template();

    this.#from = new AirportField(root.querySelector('[data-field="from"]'), {
      id: 'field-from',
      label: 'From',
      placeholder: 'Code, city or airport',
      exclude: () => this.#to?.value?.iata ?? null,
      onChange: () => this.#refresh(),
    });
    this.#to = new AirportField(root.querySelector('[data-field="to"]'), {
      id: 'field-to',
      label: 'To',
      placeholder: 'Code, city or airport',
      exclude: () => this.#from?.value?.iata ?? null,
      onChange: () => this.#refresh(),
    });
    this.#from.value = findAirport(settings.lastFrom);
    this.#to.value = findAirport(settings.lastTo);

    this.#bind();
    this.#refresh();
    this.#timer = setInterval(() => this.#refresh(), REFRESH_MS);
  }

  #template() {
    const chips = PRESET_MULTIPLIERS.map(
      (m) => `<button type="button" class="chip" data-preset="${m}">${formatMultiplier(m)}</button>`,
    ).join('');
    const stats = STATS.map(
      ([key, name]) =>
        `<div class="pass-stat"><dt>${name}</dt><dd data-stat="${key}">—</dd></div>`,
    ).join('');
    return `
      <form class="pass" novalidate>
        <header class="pass-header">
          <span class="pass-brand">FocusFlight</span>
          <span class="pass-kind">Boarding pass</span>
        </header>

        <div class="pass-route">
          <div class="pass-field" data-field="from"></div>
          <button type="button" class="pass-swap" data-swap aria-label="Swap departure and arrival">⇄</button>
          <div class="pass-field" data-field="to"></div>
        </div>

        <section class="pass-speed">
          <div class="pass-speed-head">
            <label class="field-label" for="speed">Speed</label>
            <output class="pass-speed-value" data-speed-value for="speed"></output>
          </div>
          <div class="chips">${chips}</div>
          <input id="speed" class="slider" type="range" data-slider
                 min="${MIN_MULTIPLIER}" max="${MAX_MULTIPLIER}" step="${MULTIPLIER_STEP}" />
        </section>

        <dl class="pass-stats">${stats}</dl>

        <div class="pass-field">
          <label class="field-label" for="label">Label <span class="field-hint">optional</span></label>
          <input id="label" class="field-input" type="text" data-label
                 maxlength="${MAX_LABEL_LENGTH}" placeholder="What is this flight for?" />
        </div>

        <p class="pass-message" data-message role="status" aria-live="polite"></p>
        <button type="submit" class="takeoff" data-takeoff>Take off</button>
      </form>
    `;
  }

  #bind() {
    const root = this.#root;
    this.#slider = root.querySelector('[data-slider]');
    this.#slider.addEventListener('input', () => this.#setMultiplier(this.#slider.value));
    for (const chip of root.querySelectorAll('[data-preset]')) {
      chip.addEventListener('click', () => this.#setMultiplier(chip.dataset.preset));
    }
    root.querySelector('[data-swap]').addEventListener('click', () => this.#swap());
    root.querySelector('[data-label]').addEventListener('input', (event) => {
      this.#label = trimLabel(event.target.value);
      this.#onChange(this.state);
    });
    root.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.#takeOff();
    });
  }

  /** Everything the caller needs to persist or to build a `Flight`. */
  get state() {
    return {
      from: this.#from?.value ?? null,
      to: this.#to?.value ?? null,
      multiplier: this.#multiplier,
      label: this.#label,
    };
  }

  #setMultiplier(value) {
    this.#multiplier = clampMultiplier(value);
    this.#refresh();
  }

  #swap() {
    const { from, to } = this.state;
    this.#from.value = to;
    this.#to.value = from;
    this.#refresh();
  }

  /** Repaints the pass from a freshly built plan. The only writer of the DOM. */
  #refresh() {
    const state = this.state;
    const plan = buildPlan({ ...state, now: Date.now() });
    const root = this.#root;
    const text = (key, value) => {
      root.querySelector(`[data-stat="${key}"]`).textContent = value;
    };
    text('distance', plan.distanceLabel);
    text('base', plan.baseLabel);
    text('session', plan.sessionLabel);
    text('speed', plan.groundSpeedLabel);
    text('arrival', plan.arrivalLabel);

    this.#slider.value = String(plan.multiplier);
    root.querySelector('[data-speed-value]').textContent = plan.multiplierLabel;
    for (const chip of root.querySelectorAll('[data-preset]')) {
      chip.setAttribute('aria-pressed', String(Number(chip.dataset.preset) === plan.multiplier));
    }

    const takeoff = root.querySelector('[data-takeoff]');
    takeoff.disabled = !plan.ok;
    const message = root.querySelector('[data-message]');
    message.textContent = plan.ok ? '' : plan.message;
    message.classList.toggle('is-error', !plan.ok && !!state.from && !!state.to);

    this.#onRouteChange(plan.ok ? { from: state.from, to: state.to } : null);
    this.#onChange(state);
    return plan;
  }

  #takeOff() {
    const plan = this.#refresh();
    if (!plan.ok) return;
    this.#onTakeOff({ ...this.state, plan });
  }

  destroy() {
    clearInterval(this.#timer);
    this.#root.innerHTML = '';
  }
}
