// The HUD's map section: the view selector (Route · World · Follow · Chase),
// the city-labels toggle, and the Chase tilt slider, shown only in Chase.
// Owns this markup only; choices are reported upwards.

import { VIEWS, resolveView, clampTilt, TILT_MIN, TILT_MAX } from '../lib/camera.js';

const NAMES = { route: 'Route', world: 'World', follow: 'Follow', chase: 'Chase' };
const HINTS = {
  route: 'The whole route, north up',
  world: 'The whole globe, north up',
  follow: 'A globe centred on the plane, direction of travel up',
  chase: 'Behind the plane, looking ahead — drag up or down to tilt',
};

/** Markup for the section; `mapSection.wire(root)` takes over from there. */
export function mapSectionTemplate() {
  const chips = VIEWS.map(
    (v) => `<button type="button" class="chip" data-view="${v}" title="${HINTS[v]}">${NAMES[v]}</button>`,
  ).join('');
  return `
    <div class="hud-map">
      <div class="hud-row">
        <span class="hud-legend" id="hud-view-legend">Map</span>
        <button type="button" class="chip chip--toggle" data-cities aria-pressed="false"
                title="Show major city names on the map">Cities</button>
      </div>
      <div class="chips hud-views" role="group" aria-labelledby="hud-view-legend">${chips}</div>
      <label class="hud-tilt" data-tilt-row hidden>
        <span class="hud-legend">Tilt</span>
        <input class="slider" type="range" data-tilt min="${TILT_MIN}" max="${TILT_MAX}" step="1"
               aria-label="Camera tilt">
        <span class="hud-tilt-value" data-tilt-value></span>
      </label>
    </div>
  `;
}

export class MapSection {
  #root;
  #view;
  #cities;
  #tilt;
  #on;

  /**
   * @param {HTMLElement} root  an element containing `mapSectionTemplate()`
   * @param {{view?: string, cities?: boolean, tilt?: number,
   *          onView?: Function, onCities?: Function, onTilt?: Function}} config
   */
  constructor(root, { view, cities = false, tilt, ...callbacks } = {}) {
    this.#root = root;
    this.#view = resolveView(view);
    this.#cities = Boolean(cities);
    this.#tilt = clampTilt(tilt);
    this.#on = callbacks;
    for (const chip of root.querySelectorAll('[data-view]')) {
      chip.addEventListener('click', () => {
        this.setView(chip.dataset.view);
        this.#on.onView?.(this.#view);
      });
    }
    root.querySelector('[data-cities]').addEventListener('click', () => {
      this.setCities(!this.#cities);
      this.#on.onCities?.(this.#cities);
    });
    root.querySelector('[data-tilt]').addEventListener('input', (event) => {
      this.setTilt(event.target.value);
      this.#on.onTilt?.(this.#tilt);
    });
    this.#paint();
  }

  get view() {
    return this.#view;
  }

  setView(view) {
    this.#view = resolveView(view);
    this.#paint();
  }

  setCities(on) {
    this.#cities = Boolean(on);
    this.#paint();
  }

  setTilt(degrees) {
    this.#tilt = clampTilt(degrees);
    this.#paint();
  }

  #paint() {
    const root = this.#root;
    for (const chip of root.querySelectorAll('[data-view]')) {
      chip.setAttribute('aria-pressed', String(chip.dataset.view === this.#view));
    }
    root.querySelector('[data-cities]').setAttribute('aria-pressed', String(this.#cities));
    root.querySelector('[data-tilt-row]').hidden = this.#view !== 'chase';
    const slider = root.querySelector('[data-tilt]');
    if (Number(slider.value) !== this.#tilt) slider.value = String(this.#tilt);
    root.querySelector('[data-tilt-value]').textContent = `${this.#tilt}°`;
  }
}
