// Airport combobox: type a code, city, airport name or country, pick from a
// listbox. Owns its markup and keyboard handling; the ranking lives in
// `lib/airports.js`, so this file only decides what the list looks like.

import { searchAirports, airportLabel, noMatchMessage } from '../lib/airports.js';

const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class AirportField {
  #input;
  #list;
  #empty;
  #options = [];
  #active = -1;
  #value = null;
  #onChange;
  #exclude;

  /**
   * @param {HTMLElement} root  container to render into
   * @param {{id: string, label: string, placeholder?: string,
   *          onChange?: (airport: object|null) => void,
   *          exclude?: () => string|null}} config
   */
  constructor(root, { id, label, placeholder = '', onChange = () => {}, exclude = () => null }) {
    this.#onChange = onChange;
    this.#exclude = exclude;
    root.innerHTML = `
      <label class="field-label" for="${id}">${escapeHtml(label)}</label>
      <div class="field-control">
        <input id="${id}" class="field-input" type="text" role="combobox"
               aria-expanded="false" aria-controls="${id}-list" aria-autocomplete="list"
               autocomplete="off" autocapitalize="characters" spellcheck="false"
               placeholder="${escapeHtml(placeholder)}" />
        <ul id="${id}-list" class="field-list" role="listbox" aria-label="${escapeHtml(label)} suggestions" hidden></ul>
        <p class="field-empty" role="status" aria-live="polite"></p>
      </div>
    `;
    this.#input = root.querySelector('.field-input');
    this.#list = root.querySelector('.field-list');
    this.#empty = root.querySelector('.field-empty');

    this.#input.addEventListener('input', () => this.#search(this.#input.value));
    this.#input.addEventListener('focus', () => this.#input.select());
    this.#input.addEventListener('keydown', (event) => this.#onKeyDown(event));
    this.#input.addEventListener('blur', () => this.#close(true));
    // mousedown, not click: the input blurs before a click ever lands.
    this.#list.addEventListener('mousedown', (event) => {
      const option = event.target.closest('[data-index]');
      if (!option) return;
      event.preventDefault();
      this.#choose(Number(option.dataset.index));
    });
  }

  /** The chosen airport, or null while the field is empty or unresolved. */
  get value() {
    return this.#value;
  }

  set value(airport) {
    this.#value = airport ?? null;
    this.#input.value = airportLabel(this.#value);
    this.#close(false);
  }

  focus() {
    this.#input.focus();
  }

  #search(query) {
    const exclude = this.#exclude();
    this.#options = searchAirports(query, { exclude });
    this.#active = this.#options.length ? 0 : -1;
    this.#render();
    // After render: an empty result closes the list, which clears the message.
    if (!this.#options.length) this.#empty.textContent = noMatchMessage(query, { exclude });
  }

  #render() {
    if (!this.#options.length) {
      this.#close(false);
      return;
    }
    this.#list.innerHTML = this.#options
      .map((airport, i) => {
        const place = [airport.city, airport.country].filter(Boolean).join(', ');
        return `
          <li class="field-option" role="option" id="${this.#input.id}-opt-${i}"
              data-index="${i}" aria-selected="${i === this.#active}">
            <span class="field-option-code">${escapeHtml(airport.iata)}</span>
            <span class="field-option-place">
              <span class="field-option-city">${escapeHtml(place)}</span>
              <span class="field-option-name">${escapeHtml(airport.name)}</span>
            </span>
          </li>`;
      })
      .join('');
    this.#list.hidden = false;
    this.#input.setAttribute('aria-expanded', 'true');
    this.#markActive();
  }

  #markActive() {
    const options = [...this.#list.children];
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === this.#active)));
    const current = options[this.#active];
    this.#input.setAttribute('aria-activedescendant', current ? current.id : '');
    current?.scrollIntoView({ block: 'nearest' });
  }

  #move(step) {
    if (!this.#options.length) return;
    const count = this.#options.length;
    this.#active = (this.#active + step + count) % count;
    this.#markActive();
  }

  #choose(index) {
    const airport = this.#options[index];
    if (!airport) return;
    this.#value = airport;
    this.#input.value = airportLabel(airport);
    this.#close(false);
    this.#onChange(airport);
  }

  /** Closes the list. `restore` puts back the chosen airport's text. */
  #close(restore) {
    this.#list.hidden = true;
    this.#list.innerHTML = '';
    this.#options = [];
    this.#active = -1;
    this.#input.setAttribute('aria-expanded', 'false');
    this.#input.setAttribute('aria-activedescendant', '');
    this.#empty.textContent = '';
    if (!restore) return;
    const expected = airportLabel(this.#value);
    if (this.#input.value !== expected) {
      // Half-typed text is not a choice: snap back to what is actually selected.
      this.#input.value = expected;
      if (!this.#value) this.#onChange(null);
    }
  }

  #onKeyDown(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (this.#options.length) this.#move(1);
        else this.#search(this.#input.value);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.#move(-1);
        break;
      case 'Enter':
        if (this.#options.length) {
          event.preventDefault();
          this.#choose(this.#active);
        }
        break;
      case 'Escape':
        if (!this.#list.hidden) {
          event.stopPropagation();
          this.#close(true);
        }
        break;
      default:
        break;
    }
  }
}
