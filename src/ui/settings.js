// Settings: a corner button that opens a small panel holding the colour theme
// (each swatch renders in its own theme, so it previews itself) and the map's
// city-labels switch. Owns its markup only — the caller stores the choices and
// repaints the map.

import { THEMES, resolveTheme } from '../lib/themes.js';
import { icon } from './icons.js';

/** Puts a theme on the document and keeps the browser chrome colour in step. */
export function applyTheme(id) {
  const theme = resolveTheme(id);
  const root = document.documentElement;
  root.dataset.theme = theme;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  return theme;
}

export class SettingsMenu {
  #root;
  #button;
  #panel;
  #theme;
  #onTheme;
  #cities;
  #onOutside;

  /**
   * @param {{theme?: string, onTheme?: (id: string) => void,
   *          cityLabels?: boolean, onCityLabels?: (on: boolean) => void}} config
   */
  constructor({ theme, onTheme = () => {}, cityLabels = false, onCityLabels = () => {} } = {}) {
    this.#theme = resolveTheme(theme);
    this.#onTheme = onTheme;
    this.#root = document.createElement('div');
    this.#root.className = 'settings';
    const swatches = THEMES.map(
      (t) => `
        <button type="button" class="theme-swatch" role="radio" data-theme="${t.id}"
                data-choice="${t.id}" title="${t.description}">
          <span class="theme-swatch-chip" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="theme-swatch-name">${t.name}</span>
        </button>`,
    ).join('');
    this.#root.innerHTML = `
      <button type="button" class="icon-btn" data-settings aria-haspopup="true"
              aria-expanded="false" aria-controls="settings-panel"
              aria-label="Settings" title="Settings">${icon('sliders')}</button>
      <section class="settings-panel" id="settings-panel" hidden aria-label="Settings">
        <h2 class="settings-title" id="settings-theme-label">Colour theme</h2>
        <div class="theme-grid" role="radiogroup" aria-labelledby="settings-theme-label">${swatches}</div>
        <h2 class="settings-title">Map</h2>
        <label class="settings-switch">
          <input type="checkbox" role="switch" data-city-labels>
          <span>City labels</span>
          <small>Major cities, more as you zoom in</small>
        </label>
      </section>
    `;
    this.#button = this.#root.querySelector('[data-settings]');
    this.#panel = this.#root.querySelector('.settings-panel');
    this.#cities = this.#root.querySelector('[data-city-labels]');
    this.#cities.checked = Boolean(cityLabels);
    this.#cities.addEventListener('change', () => onCityLabels(this.#cities.checked));

    this.#button.addEventListener('click', () => this.toggle());
    for (const swatch of this.#root.querySelectorAll('[data-choice]')) {
      swatch.addEventListener('click', () => this.#choose(swatch.dataset.choice));
    }
    this.#root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.#panel.hidden) {
        event.stopPropagation();
        this.close();
        this.#button.focus();
      }
    });
    this.#onOutside = (event) => {
      if (!this.#panel.hidden && !this.#root.contains(event.target)) this.close();
    };
    document.addEventListener('pointerdown', this.#onOutside);
    this.#paint();
  }

  get element() {
    return this.#root;
  }

  /** Reflects a change made elsewhere (the in-flight HUD). */
  setCityLabels(on) {
    this.#cities.checked = Boolean(on);
  }

  toggle() {
    if (this.#panel.hidden) this.open();
    else this.close();
  }

  open() {
    this.#panel.hidden = false;
    this.#button.setAttribute('aria-expanded', 'true');
  }

  close() {
    this.#panel.hidden = true;
    this.#button.setAttribute('aria-expanded', 'false');
  }

  #choose(id) {
    this.#theme = resolveTheme(id);
    this.#paint();
    this.#onTheme(this.#theme);
  }

  #paint() {
    for (const swatch of this.#root.querySelectorAll('[data-choice]')) {
      swatch.setAttribute('aria-checked', String(swatch.dataset.choice === this.#theme));
    }
  }

  destroy() {
    document.removeEventListener('pointerdown', this.#onOutside);
    this.#root.remove();
  }
}
