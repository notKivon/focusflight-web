// The departures board beside the boarding pass. When a departure airport is
// chosen it fetches that airport's route file and lists where you can fly,
// with the session each route would take at the current speed. Picking a row
// sets the destination. Wording and arithmetic come from `lib/departures.js`.

import { FILTERS, buildBoard, departuresUrl, parseDepartures } from '../lib/departures.js';
import { placeName } from '../lib/airports.js';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ENTITIES[c]);

/** Route files never change within a visit, so each is fetched at most once. */
const cache = new Map();

async function loadDepartures(iata, signal) {
  if (cache.has(iata)) return cache.get(iata);
  const res = await fetch(departuresUrl(iata), { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = parseDepartures(await res.json(), iata);
  if (!data) throw new Error('Unreadable departures file');
  cache.set(iata, data);
  return data;
}

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

  /**
   * @param {HTMLElement} root  an empty element to render into
   * @param {{onPick?: (airport: object) => void}} config
   */
  constructor(root, { onPick = () => {} } = {}) {
    this.#root = root;
    this.#onPick = onPick;
    root.classList.add('board');
    root.setAttribute('aria-label', 'Departures');
    root.addEventListener('click', (event) => {
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

  async #load(from) {
    this.#abort?.abort();
    this.#from = from ?? null;
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

  #pick(iata) {
    const row = this.#board()?.rows.find((r) => r.iata === iata);
    if (row) this.#onPick(row.to);
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
      </header>
      ${this.#body()}
    `;
    if (html === this.#html) return; // the pass refreshes often; most refreshes change nothing
    this.#html = html;

    // Keep the reader's place: scroll offset and the focused row or chip.
    const scroll = this.#root.querySelector('.board-list')?.scrollTop ?? 0;
    const focused = document.activeElement;
    const refocus = this.#root.contains(focused)
      ? (focused.dataset.pick && `[data-pick="${focused.dataset.pick}"]`) ||
        (focused.dataset.filter && `[data-filter="${focused.dataset.filter}"]`)
      : null;
    this.#root.innerHTML = html;
    const list = this.#root.querySelector('.board-list');
    if (list) list.scrollTop = scroll;
    if (refocus) this.#root.querySelector(refocus)?.focus();
  }

  #body() {
    if (this.#state === 'idle') {
      return '<p class="board-note">Choose where you are flying from to see its routes.</p>';
    }
    if (this.#state === 'loading') return '<p class="board-note" role="status">Loading departures…</p>';
    if (this.#state === 'error') {
      return '<p class="board-note" role="status">Departures could not be loaded. Type a destination instead.</p>';
    }
    const board = this.#board();
    if (!board.counts.all) {
      return '<p class="board-note">No listed routes from here. Type a destination instead.</p>';
    }
    const chips = FILTERS.map(
      (f) => `<button type="button" class="chip chip--sm" data-filter="${f.id}"
                aria-pressed="${f.id === board.filter}" ${board.counts[f.id] ? '' : 'disabled'}>${f.label}</button>`,
    ).join('');
    const rows = board.rows
      .map(
        (row) => `
        <li>
          <button type="button" class="board-row" data-pick="${escape(row.iata)}"
                  aria-pressed="${row.iata === this.#selected}"
                  title="${escape(row.to.name)} · ${escape(row.airlineNames)}">
            <span class="board-dest"><b>${escape(row.iata)}</b> <span>${escape(row.place)}</span></span>
            <span class="board-airline">${escape(row.airlineLabel)}</span>
            <span class="board-time">${escape(row.sessionLabel)}</span>
            <span class="board-lands">${escape(row.landsLabel)}</span>
          </button>
        </li>`,
      )
      .join('');
    return `
      <div class="chips board-filters" role="group" aria-label="Filter by session length">${chips}</div>
      <div class="board-cols" aria-hidden="true">
        <span>Destination</span><span>Airline</span><span>Session</span><span>Lands</span>
      </div>
      <ul class="board-list">${rows || '<li class="board-note">Nothing in this range.</li>'}</ul>
      <p class="board-source">Routes: ${escape(board.source)}. Not a live schedule.</p>
    `;
  }

  destroy() {
    this.#abort?.abort();
    this.#root.innerHTML = '';
  }
}
