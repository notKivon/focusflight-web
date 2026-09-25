// Mouse, trackpad and touch gestures for the map canvas: drag to pan, wheel
// or pinch to zoom, double-click to zoom in (Shift: reset). It only reports
// new transforms; the maths is `lib/zoom.js` and the drawing is `ui/map.js`.
// An optional `drag(dx, dy)` hook may claim one-finger drags (returning true),
// which is how the camera views turn a drag into a tilt instead of a pan.

import { zoomAt, panBy, wheelFactor, IDENTITY } from '../lib/zoom.js';

/** Double-click / double-tap zooms in by this much. */
const STEP = 2;

export class MapGestures {
  #el;
  #get;
  #set;
  #drag;
  #pointers = new Map();
  #listeners = [];

  /**
   * @param {HTMLElement} element  the canvas
   * @param {{get: () => object, set: (t: object) => void,
   *          size: () => {width: number, height: number},
   *          drag?: (dx: number, dy: number) => boolean}} hooks
   */
  constructor(element, { get, set, size, drag = () => false }) {
    this.#el = element;
    this.#get = get;
    this.#set = set;
    this.#drag = drag;
    this.size = size;

    this.#on('wheel', (event) => this.#onWheel(event), { passive: false });
    this.#on('pointerdown', (event) => this.#onDown(event));
    this.#on('pointermove', (event) => this.#onMove(event));
    this.#on('pointerup', (event) => this.#onUp(event));
    this.#on('pointercancel', (event) => this.#onUp(event));
    this.#on('dblclick', (event) => this.#onDoubleClick(event));
  }

  #on(type, handler, options) {
    this.#el.addEventListener(type, handler, options);
    this.#listeners.push([type, handler, options]);
  }

  #point(event) {
    const rect = this.#el.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  #onWheel(event) {
    event.preventDefault(); // or the page zooms / scrolls instead
    const { width, height } = this.size();
    this.#set(zoomAt(this.#get(), wheelFactor(event.deltaY, event.deltaMode), this.#point(event), width, height));
  }

  #onDown(event) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    this.#el.setPointerCapture?.(event.pointerId);
    this.#pointers.set(event.pointerId, this.#point(event));
    this.#el.dataset.dragging = 'true';
  }

  #onMove(event) {
    const previous = this.#pointers.get(event.pointerId);
    if (!previous) return;
    const now = this.#point(event);
    const { width, height } = this.size();

    if (this.#pointers.size >= 2) {
      // Pinch: zoom by the change in finger spread, about their midpoint.
      const [other] = [...this.#pointers].filter(([id]) => id !== event.pointerId).map(([, p]) => p);
      const before = Math.hypot(previous[0] - other[0], previous[1] - other[1]);
      const after = Math.hypot(now[0] - other[0], now[1] - other[1]);
      const mid = [(now[0] + other[0]) / 2, (now[1] + other[1]) / 2];
      let t = this.#get();
      if (before > 0) t = zoomAt(t, after / before, mid, width, height);
      t = panBy(t, (now[0] - previous[0]) / 2, (now[1] - previous[1]) / 2, width, height);
      this.#set(t);
    } else if (!this.#drag(now[0] - previous[0], now[1] - previous[1])) {
      this.#set(panBy(this.#get(), now[0] - previous[0], now[1] - previous[1], width, height));
    }
    this.#pointers.set(event.pointerId, now);
  }

  #onUp(event) {
    this.#pointers.delete(event.pointerId);
    if (!this.#pointers.size) delete this.#el.dataset.dragging;
  }

  /** Double-click zooms in on the spot; with Shift it goes back to the fit. */
  #onDoubleClick(event) {
    const { width, height } = this.size();
    if (event.shiftKey) this.#set(IDENTITY);
    else this.#set(zoomAt(this.#get(), STEP, this.#point(event), width, height));
  }

  destroy() {
    for (const [type, handler, options] of this.#listeners) {
      this.#el.removeEventListener(type, handler, options);
    }
    this.#listeners = [];
  }
}
