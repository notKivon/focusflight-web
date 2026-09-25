// The logbook screen: every finished flight, newest first, with what the
// session was worth. All wording comes from `lib/logbook.js`; this module
// only places it and owns the two-click delete.

import { buildLogbook } from '../lib/logbook.js';

/** How long "Delete?" stays armed before it goes back to being safe. */
const CONFIRM_MS = 5000;

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Flight labels are free text the user typed; they never reach the DOM raw. */
const escape = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ENTITIES[c]);

const STATS = [
  ['focus', 'Focus time'],
  ['distance', 'Distance flown'],
  ['flights', 'Flights landed'],
];

export class LogbookScreen {
  #root;
  #entries;
  #onDelete;
  #onBack;
  #armed = null;
  #confirmTimer = null;

  /**
   * @param {HTMLElement} root
   * @param {{entries?: object[], onDelete?: (id: string) => object[],
   *          onBack?: Function}} config `onDelete` returns the remaining
   *   entries, so the screen never reaches into storage itself.
   */
  constructor(root, { entries = [], onDelete = () => [], onBack = () => {} } = {}) {
    this.#root = root;
    this.#entries = entries;
    this.#onDelete = onDelete;
    this.#onBack = onBack;
    root.innerHTML = `<section class="pass logbook"></section>`;
    this.#paint();
  }

  /** Repaints the whole screen from the current entries. The only DOM writer. */
  #paint() {
    const model = buildLogbook(this.#entries, Date.now());
    const stats = STATS.map(
      ([key, title]) =>
        `<div class="pass-stat"><dt>${title}</dt><dd data-stat="${key}">—</dd></div>`,
    ).join('');

    this.#root.querySelector('.logbook').innerHTML = `
      <header class="pass-header">
        <span class="pass-brand">Logbook</span>
        <span class="pass-kind">${escape(model.countLabel)}</span>
      </header>
      <dl class="pass-stats">${stats}</dl>
      ${model.empty ? this.#emptyTemplate(model) : this.#listTemplate(model)}
      <button type="button" class="btn btn--primary btn--lg" data-back>New flight</button>
    `;

    const values = {
      focus: model.stats.focusedLabel,
      distance: model.stats.distanceLabel,
      flights: model.stats.arrivedLabel,
    };
    for (const [key] of STATS) {
      this.#root.querySelector(`[data-stat="${key}"]`).textContent = values[key];
    }
    this.#wire();
  }

  #emptyTemplate(model) {
    return `
      <div class="log-empty">
        <p class="log-empty-headline">${escape(model.emptyHeadline)}</p>
        <p class="log-empty-message">${escape(model.emptyMessage)}</p>
      </div>
    `;
  }

  #listTemplate(model) {
    const rows = model.entries.map((row) => this.#rowTemplate(row)).join('');
    return `<ul class="log-list">${rows}</ul>`;
  }

  #rowTemplate(row) {
    const meta = [row.whenLabel, row.speedLabel, row.statusLabel]
      .map((part) => `<span>${escape(part)}</span>`)
      .join('<span class="log-dot" aria-hidden="true">·</span>');
    return `
      <li class="log-row" data-row="${escape(row.id)}" data-status="${escape(row.status)}">
        <div class="log-main">
          <p class="log-route">${escape(row.route)}</p>
          <p class="log-meta">${meta}</p>
          ${row.label ? `<p class="log-label">${escape(row.label)}</p>` : ''}
        </div>
        <dl class="log-figures">
          <div><dt>Focused</dt><dd class="log-focus">${escape(row.focusedLabel)}</dd></div>
          <div><dt>Distance</dt><dd>${escape(row.distanceLabel)}</dd></div>
        </dl>
        <button type="button" class="btn btn--sm btn--danger" data-delete="${escape(row.id)}"
                aria-label="${escape(row.deleteLabel)}">Delete</button>
      </li>
    `;
  }

  #wire() {
    this.#root.querySelector('[data-back]').addEventListener('click', () => this.#onBack());
    for (const button of this.#root.querySelectorAll('[data-delete]')) {
      button.addEventListener('click', () => this.#delete(button.dataset.delete));
    }
  }

  /** Deleting needs two clicks; the first one only arms that row's button. */
  #delete(id) {
    if (this.#armed !== id) {
      this.#disarm();
      this.#armed = id;
      this.#paintArmed();
      this.#confirmTimer = setTimeout(() => {
        this.#armed = null;
        this.#paintArmed();
      }, CONFIRM_MS);
      return;
    }
    this.#disarm();
    this.#entries = this.#onDelete(id) ?? [];
    this.#paint();
  }

  #paintArmed() {
    for (const button of this.#root.querySelectorAll('[data-delete]')) {
      const armed = button.dataset.delete === this.#armed;
      button.classList.toggle('btn--armed', armed);
      button.textContent = armed ? 'Delete?' : 'Delete';
    }
  }

  #disarm() {
    clearTimeout(this.#confirmTimer);
    this.#confirmTimer = null;
    this.#armed = null;
  }

  destroy() {
    this.#disarm();
    this.#root.innerHTML = '';
  }
}
