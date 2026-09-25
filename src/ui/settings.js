// Settings: a corner button that opens a small panel. Today it holds the colour
// theme; each swatch renders in its own theme, so it previews itself.
// Owns its markup only — the caller stores the choice and repaints the map.

import { THEMES, resolveTheme } from '../lib/themes.js';

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
  #onOutside;

  /**
   * @param {{theme?: string, onTheme?: (id: string) => void}} config
   */
  constructor({ theme, onTheme = () => {} } = {}) {
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
              aria-label="Settings" title="Settings">⚙</button>
      <section class="settings-panel" id="settings-panel" hidden aria-label="Settings">
        <h2 class="settings-title" id="settings-theme-label">Colour theme</h2>
        <div class="theme-grid" role="radiogroup" aria-labelledby="settings-theme-label">${swatches}</div>
      </section>
    `;
    this.#button = this.#root.querySelector('[data-settings]');
    this.#panel = this.#root.querySelector('.settings-panel');

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
