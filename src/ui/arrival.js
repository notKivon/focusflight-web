// The arrival screen: what the flight was worth, and the way back to the gate.
// Shown for an arrival and for an aborted flight; the wording comes from
// `lib/hud.js`, so this module only places it.

import { buildArrival } from '../lib/hud.js';
import { placeName } from '../lib/metros.js';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** The flight label is free text the user typed; it never reaches the DOM raw. */
const escape = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ENTITIES[c]);

const STATS = [
  ['focused', 'Focused'],
  ['distance', 'Distance'],
  ['progress', 'Route flown'],
];

export class ArrivalScreen {
  #root;

  /**
   * @param {HTMLElement} root
   * @param {{snapshot: object, onAgain?: Function, onLogbook?: Function}} config
   */
  constructor(root, { snapshot, onAgain = () => {}, onLogbook = () => {} } = {}) {
    this.#root = root;
    const model = buildArrival(snapshot);
    const values = {
      focused: model.focusedLabel,
      distance: model.distanceLabel,
      progress: model.percentLabel,
    };
    const stats = STATS.map(
      ([key, title]) =>
        `<div class="pass-stat"><dt>${title}</dt><dd>${escape(values[key])}</dd></div>`,
    ).join('');

    root.innerHTML = `
      <div class="pass arrival" data-status="${escape(model.status)}">
        <header class="pass-header">
          <span class="pass-brand">${escape(model.heading)}</span>
          <span class="pass-kind">${escape(model.kind)}</span>
        </header>
        <div class="arrival-route">
          <div class="hud-port">
            <span class="hud-iata">${escape(model.from.iata)}</span>
            <span class="hud-place">${escape(placeName(model.from))}</span>
          </div>
          <span class="hud-track" aria-hidden="true"><i class="hud-plane">✈</i></span>
          <div class="hud-port hud-port--to">
            <span class="hud-iata">${escape(model.to.iata)}</span>
            <span class="hud-place">${escape(placeName(model.to))}</span>
          </div>
        </div>
        ${model.label ? `<p class="hud-label">${escape(model.label)}</p>` : ''}
        <p class="pass-message">${escape(model.message)}</p>
        <dl class="pass-stats">${stats}</dl>
        <div class="pass-actions">
          <button type="button" class="btn btn--primary btn--lg" data-again>New flight</button>
          <button type="button" class="btn btn--lg" data-logbook>Logbook</button>
        </div>
      </div>
    `;

    root.querySelector('[data-again]').addEventListener('click', () => onAgain());
    root.querySelector('[data-logbook]').addEventListener('click', () => onLogbook());
    root.querySelector('[data-again]').focus();
  }

  destroy() {
    this.#root.innerHTML = '';
  }
}
