// Settings: a corner button that opens a small panel. It holds the colour
// theme (each swatch renders in its own theme, so it previews itself) and the
// user's own AirLabs key for live departures.
// Owns its markup only — the caller stores the choices and applies them.

import { THEMES, resolveTheme } from '../lib/themes.js';
import { AIRLABS_SIGNUP_URL, maskKey, normalizeKey } from '../lib/airlabs.js';

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
  #liveKey;
  #onLiveKey;
  #onOutside;

  /**
   * @param {{theme?: string, onTheme?: (id: string) => void,
   *          liveKey?: string|null, onLiveKey?: (key: string|null) => void}} config
   */
  constructor({ theme, onTheme = () => {}, liveKey = null, onLiveKey = () => {} } = {}) {
    this.#theme = resolveTheme(theme);
    this.#onTheme = onTheme;
    this.#liveKey = normalizeKey(liveKey);
    this.#onLiveKey = onLiveKey;
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
              aria-label="Settings" title="Settings">⚙</button>
      <section class="settings-panel" id="settings-panel" hidden aria-label="Settings">
        <h2 class="settings-title" id="settings-theme-label">Colour theme</h2>
        <div class="theme-grid" role="radiogroup" aria-labelledby="settings-theme-label">${swatches}</div>
        <h2 class="settings-title" id="settings-live-label">Live departures</h2>
        <form class="live-key" data-live-form aria-labelledby="settings-live-label">
          <p class="settings-note">
            Optional: paste your own <a href="${AIRLABS_SIGNUP_URL}" target="_blank" rel="noopener noreferrer">AirLabs</a>
            API key (the free plan works) to show real departures. It is stored only in this browser and sent only to AirLabs.
          </p>
          <div class="live-key-row">
            <input class="field-input" type="password" data-live-input autocomplete="off" spellcheck="false"
                   placeholder="API key" aria-label="AirLabs API key" />
            <button type="submit" class="chip chip--sm">Save</button>
          </div>
          <p class="settings-note" data-live-status role="status"></p>
          <button type="button" class="chip chip--sm" data-live-remove>Remove key</button>
        </form>
      </section>
    `;
    this.#button = this.#root.querySelector('[data-settings]');
    this.#panel = this.#root.querySelector('.settings-panel');

    this.#button.addEventListener('click', () => this.toggle());
    for (const swatch of this.#root.querySelectorAll('[data-choice]')) {
      swatch.addEventListener('click', () => this.#choose(swatch.dataset.choice));
    }
    this.#root.querySelector('[data-live-form]').addEventListener('submit', (event) => {
      event.preventDefault();
      this.#saveKey();
    });
    this.#root.querySelector('[data-live-remove]').addEventListener('click', () => {
      this.#setKey(null, 'Key removed. The board shows routes only.');
    });
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
    this.#paintKey();
  }

  get element() {
    return this.#root;
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

  #saveKey() {
    const input = this.#root.querySelector('[data-live-input]');
    const key = normalizeKey(input.value);
    if (!key) {
      this.#paintKey('That does not look like an API key.');
      return;
    }
    input.value = '';
    this.#setKey(key, `Saved ${maskKey(key)}. Pick a departure airport to see live flights.`);
  }

  #setKey(key, message) {
    this.#liveKey = key;
    this.#paintKey(message);
    this.#onLiveKey(key);
  }

  #paintKey(message) {
    const status = this.#root.querySelector('[data-live-status]');
    status.textContent = message ?? (this.#liveKey ? `Using key ${maskKey(this.#liveKey)}.` : 'No key saved.');
    this.#root.querySelector('[data-live-remove]').hidden = !this.#liveKey;
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
