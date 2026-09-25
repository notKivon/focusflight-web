// The departures board beside the boarding pass. When a departure airport is
// chosen it fetches that airport's route file and lists where you can fly,
// with the session each route would take at the current speed. Picking a row
// sets the destination. Wording and arithmetic come from `lib/departures.js`.
// With the user's own AirLabs key it also shows live departures
// (`ui/board-live.js`), and the route list stays one click away.

import { buildBoard } from '../lib/departures.js';
import { findAirport, placeName } from '../lib/airports.js';
import { normalizeKey } from '../lib/airlabs.js';
import { fetchLive, liveBody } from './board-live.js';
import { loadDepartures, routesBody } from './board-routes.js';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ENTITIES[c]);

export class DeparturesBoard {
  #root;
  #onPick;
  #from = null;
  #data = null;
  #state = 'idle'; // idle | loading | ready | error
  #filter = 'all';
  #multiplier = 1;
  #selected = null;
  #abort = null;
  #html = '';
  #liveKey = null;
  #mode = 'routes'; // live | routes; live only with a key
  #live = { state: 'idle' }; // idle | loading | ready | error, plus flights, fetchedAt, message
  #liveAbort = null;

  /**
   * @param {HTMLElement} root  an empty element to render into
   * @param {{onPick?: (airport: object) => void, liveKey?: string|null}} config
   */
  constructor(root, { onPick = () => {}, liveKey = null } = {}) {
    this.#root = root;
    this.#onPick = onPick;
    this.#liveKey = normalizeKey(liveKey);
    this.#mode = this.#liveKey ? 'live' : 'routes';
    root.classList.add('board');
    root.setAttribute('aria-label', 'Departures');
    root.addEventListener('click', (event) => {
      const mode = event.target.closest('[data-mode]');
      if (mode) {
        this.#mode = mode.dataset.mode;
        this.#render();
        return;
      }
      if (event.target.closest('[data-refresh]')) {
        this.#loadLive(true);
        return;
      }
      const chip = event.target.closest('[data-filter]');
      if (chip) {
        this.#filter = chip.dataset.filter;
        this.#render();
        return;
      }
      const row = event.target.closest('[data-pick]');
      if (row) this.#pick(row.dataset.pick);
    });
    this.#render();
  }

  /** Called whenever the pass changes. Only a new departure airport refetches. */
  update({ from, to, multiplier }) {
    this.#multiplier = multiplier;
    this.#selected = to?.iata ?? null;
    if ((from?.iata ?? null) !== (this.#from?.iata ?? null)) this.#load(from);
    else this.#render();
  }

  /** A key saved or removed in Settings. Saving one switches to live mode. */
  setLiveKey(key) {
    const next = normalizeKey(key);
    if (next === this.#liveKey) return;
    this.#liveKey = next;
    this.#mode = next ? 'live' : 'routes';
    this.#loadLive();
  }

  async #loadLive(force = false) {
    this.#liveAbort?.abort();
    const from = this.#from;
    if (!from || !this.#liveKey) {
      this.#live = { state: 'idle' };
      this.#render();
      return;
    }
    const abort = new AbortController();
    this.#liveAbort = abort;
    if (this.#live.state !== 'ready' || this.#live.from !== from.iata) {
      this.#live = { state: 'loading' };
      this.#render();
    }
    try {
      const entry = await fetchLive(from.iata, this.#liveKey, { signal: abort.signal, force });
      if (abort.signal.aborted) return;
      this.#live = { state: 'ready', from: from.iata, flights: entry.flights, fetchedAt: entry.fetchedAt };
    } catch (error) {
      if (abort.signal.aborted) return;
      this.#live = { state: 'error', message: error.message };
    }
    this.#render();
  }

  async #load(from) {
    this.#abort?.abort();
    this.#from = from ?? null;
    this.#loadLive();
    this.#data = null;
    this.#filter = 'all';
    if (!from) {
      this.#state = 'idle';
      this.#render();
      return;
    }
    this.#state = 'loading';
    this.#render();
    const abort = new AbortController();
    this.#abort = abort;
    try {
      const data = await loadDepartures(from.iata, abort.signal);
      if (abort.signal.aborted) return;
      this.#data = data;
      this.#state = 'ready';
    } catch {
      if (abort.signal.aborted) return;
      this.#state = 'error';
    }
    this.#render();
  }

  /** Rows of either kind only list airports the dataset has. */
  #pick(iata) {
    const to = findAirport(iata);
    if (to) this.#onPick(to);
  }

  #board() {
    if (this.#state !== 'ready') return null;
    return buildBoard(this.#data, { multiplier: this.#multiplier, filter: this.#filter });
  }

  #render() {
    const from = this.#from;
    const heading = from
      ? `<span class="board-code">${escape(from.iata)}</span> ${escape(placeName(from))}`
      : 'Pick a departure airport';
    const html = `
      <header class="board-header">
        <span class="board-kind">Departures</span>
        <h2 class="board-title">${heading}</h2>
        ${this.#modeSwitch()}
      </header>
      ${this.#body()}
    `;
    if (html === this.#html) return; // the pass refreshes often; most refreshes change nothing
    this.#html = html;

    // Keep the reader's place: scroll offset and the focused row or chip.
    const scroll = this.#root.querySelector('.board-list')?.scrollTop ?? 0;
    const focused = document.activeElement;
    const refocus = this.#root.contains(focused)
      ? (focused.dataset.key && `[data-key="${CSS.escape(focused.dataset.key)}"]`) ||
        (focused.dataset.mode && `[data-mode="${focused.dataset.mode}"]`) ||
        (focused.dataset.pick && `[data-pick="${focused.dataset.pick}"]`) ||
        (focused.dataset.filter && `[data-filter="${focused.dataset.filter}"]`)
      : null;
    this.#root.innerHTML = html;
    const list = this.#root.querySelector('.board-list');
    if (list) list.scrollTop = scroll;
    if (refocus) this.#root.querySelector(refocus)?.focus();
  }

  #modeSwitch() {
    if (!this.#liveKey) return '';
    const chip = (id, label) =>
      `<button type="button" class="chip chip--sm" data-mode="${id}" aria-pressed="${this.#mode === id}">${label}</button>`;
    return `<div class="chips board-modes" role="group" aria-label="Board">${chip('live', 'Live')}${chip('routes', 'Routes')}</div>`;
  }

  #body() {
    if (this.#state === 'idle') {
      return '<p class="board-note">Choose where you are flying from to see its routes.</p>';
    }
    if (this.#mode === 'live' && this.#liveKey) {
      return liveBody(this.#live, {
        from: this.#from,
        filter: this.#filter,
        multiplier: this.#multiplier,
        selected: this.#selected,
      });
    }
    if (this.#state === 'loading') return '<p class="board-note" role="status">Loading departures…</p>';
    if (this.#state === 'error') {
      return '<p class="board-note" role="status">Departures could not be loaded. Type a destination instead.</p>';
    }
    return routesBody(this.#board(), { selected: this.#selected, hasKey: Boolean(this.#liveKey) });
  }

  destroy() {
    this.#abort?.abort();
    this.#liveAbort?.abort();
    this.#root.innerHTML = '';
  }
}
