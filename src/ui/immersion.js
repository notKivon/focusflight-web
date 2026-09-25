// Full screen, keyboard shortcuts and the HUD's three-second fade: everything
// that lets the app disappear into the map while a flight runs.
//
// It owns the corner controls and the window-level listeners; what `Space`
// actually does is handed in by the caller, one flight at a time.

import { resolveShortcut, SHORTCUTS } from '../lib/shortcuts.js';
import { IdleWatch } from '../lib/idle.js';

/** How often the idle clock is read. Finer than the fade is worth. */
const CHECK_MS = 500;

/** Panels the pointer can rest on without the HUD counting it as idle. */
const PANELS = '.hud-panel, .pass, .immersion';

const ENTER_ICON = '⤢';
const EXIT_ICON = '⤡';

export function fullscreenElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
}

export function isFullscreen() {
  return Boolean(fullscreenElement());
}

/**
 * Enter or leave full screen. A browser may refuse (no user gesture, or the
 * API disabled); that is not an error worth surfacing, so it resolves either
 * way with whatever state we ended up in.
 */
export async function toggleFullscreen(element = document.documentElement) {
  try {
    if (isFullscreen()) {
      await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
    } else {
      await (element.requestFullscreen?.() ?? element.webkitRequestFullscreen?.());
    }
  } catch {
    // Refused. The button keeps whatever state the document reports.
  }
  return isFullscreen();
}

export class Immersion {
  #root;
  #bar;
  #button;
  #hint;
  #watch;
  #timer = null;
  #onPause = null;
  #listeners = [];

  /**
   * @param {HTMLElement} root the app element; it carries `data-idle`.
   */
  constructor(root) {
    this.#root = root;
    this.#watch = new IdleWatch({ onChange: (hidden) => this.#paintIdle(hidden) });

    const hint = SHORTCUTS.map(({ key, description }) => `${key} ${description.toLowerCase()}`)
      .join(' · ');
    this.#bar = document.createElement('div');
    this.#bar.className = 'immersion';
    this.#bar.innerHTML = `
      <p class="immersion-hint" hidden>${hint}</p>
      <button type="button" class="icon-btn" data-fullscreen></button>
    `;
    root.append(this.#bar);
    this.#button = this.#bar.querySelector('[data-fullscreen]');
    this.#hint = this.#bar.querySelector('.immersion-hint');
    this.#paintButton();

    this.#on(this.#button, 'click', () => this.toggleFullscreen());
    this.#on(document, 'fullscreenchange', () => this.#paintButton());
    this.#on(document, 'webkitfullscreenchange', () => this.#paintButton());
    this.#on(window, 'keydown', (event) => this.#onKeydown(event));
    this.#on(window, 'pointermove', (event) => this.#onPointer(event));
    this.#on(window, 'pointerdown', (event) => this.#onPointer(event));
    this.#on(root, 'focusin', () => this.#watch.hold('focus', true));
    this.#on(root, 'focusout', () => this.#watch.hold('focus', false));
    this.#timer = setInterval(() => this.#watch.check(), CHECK_MS);
  }

  #on(target, type, handler) {
    target.addEventListener(type, handler);
    this.#listeners.push([target, type, handler]);
  }

  // ------------------------------------------------------------------ screens

  /**
   * A flight is on screen: arm the fade and give `Space` something to do.
   * @param {() => void} onPause
   */
  enterFlight(onPause) {
    this.#onPause = onPause;
    this.#hint.hidden = false;
    this.#watch.enable();
  }

  /** Back to a screen that stays put. */
  leaveFlight() {
    this.#onPause = null;
    this.#hint.hidden = true;
    this.#watch.disable();
  }

  toggleFullscreen() {
    this.#watch.wake();
    return toggleFullscreen(document.documentElement);
  }

  // ------------------------------------------------------------------- events

  #onKeydown(event) {
    this.#watch.wake();
    const action = resolveShortcut(event);
    if (!action) return;
    if (action === 'pause' && !this.#onPause) return;
    event.preventDefault(); // Space would otherwise scroll the page
    if (action === 'fullscreen') this.toggleFullscreen();
    else this.#onPause();
  }

  /** Movement is life; resting the pointer on a panel keeps the HUD up. */
  #onPointer(event) {
    this.#watch.wake();
    this.#watch.hold('pointer', Boolean(event.target?.closest?.(PANELS)));
  }

  // ------------------------------------------------------------------- render

  #paintIdle(hidden) {
    this.#root.dataset.idle = String(hidden);
  }

  #paintButton() {
    const full = isFullscreen();
    this.#button.textContent = full ? EXIT_ICON : ENTER_ICON;
    this.#button.setAttribute('aria-label', full ? 'Exit full screen' : 'Enter full screen');
    this.#button.title = full ? 'Exit full screen (F)' : 'Full screen (F)';
    this.#button.setAttribute('aria-pressed', String(full));
  }

  destroy() {
    clearInterval(this.#timer);
    this.#timer = null;
    for (const [target, type, handler] of this.#listeners) {
      target.removeEventListener(type, handler);
    }
    this.#listeners = [];
    this.#bar.remove();
    delete this.#root.dataset.idle;
  }
}
