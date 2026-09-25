// Canvas map: ocean, land, graticule, the route arc, the airports, the plane.
// Owns a <canvas> and a projection; knows nothing about timers or flight state.
// Callers set a route, a view and a progress fraction, then ask it to draw.
// The user can pan and zoom on top of the fitted view; `resetView` undoes it.

import { geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { arcBetween, createProjection, screenHeading, GRATICULE } from '../lib/mapgeo.js';
import { interpolate } from '../lib/geo.js';
import { IDENTITY, isIdentity, applyTransform, constrain } from '../lib/zoom.js';
import { MapGestures } from './map-gestures.js';

const LAND = feature(world, world.objects.land);
const NULL_ISLAND = { lat: 0, lon: 0 };
const LABEL_FONT = '500 12px "JetBrains Mono", ui-monospace, monospace';

/** Canvas can't read CSS custom properties, so resolve them once per draw. */
function palette(element) {
  const style = getComputedStyle(element);
  const token = (name) => style.getPropertyValue(name).trim();
  return {
    ocean: token('--ocean'),
    land: token('--land'),
    graticule: token('--surface-2'),
    accent: token('--accent'),
    muted: token('--muted'),
    text: token('--text'),
  };
}

export class FlightMap {
  #canvas;
  #ctx;
  #observer;
  #frame = 0;
  #width = 0;
  #height = 0;
  #route = null;
  #view = 'route';
  #progress = 0;
  #transform = IDENTITY;
  #gestures;
  #onTransform;

  /**
   * Mounts a canvas into `container` and starts tracking its size.
   * `onTransform(transformed)` hears whether the user has moved the view.
   */
  constructor(container, { onTransform = () => {} } = {}) {
    this.#onTransform = onTransform;
    this.#canvas = document.createElement('canvas');
    this.#canvas.className = 'flight-map';
    this.#canvas.setAttribute('role', 'img');
    container.append(this.#canvas);
    this.#ctx = this.#canvas.getContext('2d');
    this.#observer = new ResizeObserver(() => this.resize());
    this.#observer.observe(container);
    this.#gestures = new MapGestures(this.#canvas, {
      get: () => this.#transform,
      set: (t) => this.#setTransform(t),
      size: () => ({ width: this.#width, height: this.#height }),
    });
    this.resize();
  }

  get canvas() {
    return this.#canvas;
  }

  /** `{ from, to }` as airport records, or null to show the globe alone. */
  setRoute(route) {
    // The pass re-sends the same route as the user edits other fields; only a
    // genuinely new route throws away where the user has panned to.
    const key = (r) => (r ? `${r.from.iata}-${r.to.iata}` : '');
    if (key(route) !== key(this.#route)) this.resetView();
    this.#route = route;
    this.#describe();
    this.#schedule();
  }

  /** `'route'` (fitted to the arc) or `'world'` (whole globe). */
  setView(view) {
    const next = view === 'world' ? 'world' : 'route';
    if (next !== this.#view) this.resetView();
    this.#view = next;
    this.#schedule();
  }

  /** True while the user has panned or zoomed away from the fitted view. */
  get transformed() {
    return !isIdentity(this.#transform);
  }

  /** Back to the view's default framing. */
  resetView() {
    this.#setTransform(IDENTITY);
  }

  /** Repaint with fresh colours, e.g. after the theme changes. */
  refresh() {
    this.#schedule();
  }

  #setTransform(t) {
    const was = this.transformed;
    this.#transform = isIdentity(t) ? IDENTITY : constrain(t, this.#width, this.#height);
    if (was !== this.transformed) this.#onTransform(this.transformed);
    this.#schedule();
  }

  /** Where the plane sits, as a fraction of the route in [0, 1]. */
  setProgress(progress) {
    this.#progress = Math.min(1, Math.max(0, progress));
    this.#schedule();
  }

  /** Matches the backing store to the element's CSS size and pixel ratio. */
  resize() {
    const ratio = globalThis.devicePixelRatio || 1;
    const { width, height } = this.#canvas.getBoundingClientRect();
    if (!width || !height) return;
    this.#width = width;
    this.#height = height;
    this.#canvas.width = Math.round(width * ratio);
    this.#canvas.height = Math.round(height * ratio);
    this.#ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.#schedule();
  }

  /** Coalesces bursts of set* calls into one paint per frame. */
  #schedule() {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.draw();
    });
  }

  #describe() {
    this.#canvas.setAttribute(
      'aria-label',
      this.#route
        ? `Map of the route from ${this.#route.from.iata} to ${this.#route.to.iata}`
        : 'World map',
    );
  }

  draw() {
    const { width, height } = this;
    if (!width || !height) return;
    const ctx = this.#ctx;
    const colours = palette(this.#canvas);
    // With no route yet there is nothing to frame, so show the plain globe.
    const route = this.#route ?? { from: NULL_ISLAND, to: NULL_ISLAND };
    const projection = createProjection({
      from: route.from,
      to: route.to,
      view: this.#route ? this.#view : 'world',
      width,
      height,
    });
    applyTransform(projection, this.#transform);
    const path = geoPath(projection, ctx);

    ctx.clearRect(0, 0, width, height);
    this.#fill(path, { type: 'Sphere' }, colours.ocean);
    this.#fill(path, LAND, colours.land);
    this.#stroke(path, GRATICULE, colours.graticule, 1);

    if (this.#route) {
      this.#drawRoute(ctx, path, projection, colours);
    }
  }

  get width() {
    return this.#width;
  }

  get height() {
    return this.#height;
  }

  #fill(path, object, colour) {
    const ctx = this.#ctx;
    ctx.beginPath();
    path(object);
    ctx.fillStyle = colour;
    ctx.fill();
  }

  #stroke(path, object, colour, lineWidth, dash = []) {
    const ctx = this.#ctx;
    ctx.beginPath();
    path(object);
    ctx.setLineDash(dash);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = colour;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  #drawRoute(ctx, path, projection, colours) {
    const { from, to } = this.#route;
    const t = this.#progress;

    if (t < 1) {
      this.#stroke(path, arcBetween(from, to, t, 1), colours.muted, 1.5, [5, 6]);
    }
    if (t > 0) {
      this.#stroke(path, arcBetween(from, to, 0, t), colours.accent, 2.5);
    }

    for (const airport of [from, to]) {
      this.#drawAirport(ctx, projection, airport, colours);
    }
    this.#drawPlane(ctx, projection, colours);
  }

  #drawAirport(ctx, projection, airport, colours) {
    const point = projection([airport.lon, airport.lat]);
    if (!point) return;
    const [x, y] = point;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = colours.ocean;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colours.accent;
    ctx.stroke();

    if (!airport.iata) return;
    ctx.font = LABEL_FONT;
    ctx.fillStyle = colours.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(airport.iata, x, y - 9);
  }

  #drawPlane(ctx, projection, colours) {
    const { from, to } = this.#route;
    const here = interpolate(from, to, this.#progress);
    const point = projection([here.lon, here.lat]);
    if (!point) return;

    ctx.save();
    ctx.translate(point[0], point[1]);
    ctx.rotate(screenHeading(projection, from, to, this.#progress));
    ctx.beginPath();
    ctx.moveTo(0, -10); // nose
    ctx.lineTo(9, 7); // starboard wingtip
    ctx.lineTo(0, 3); // tail notch
    ctx.lineTo(-9, 7); // port wingtip
    ctx.closePath();
    ctx.fillStyle = colours.accent;
    ctx.fill();
    ctx.restore();
  }

  /** Stops observing and removes the canvas. */
  destroy() {
    if (this.#frame) cancelAnimationFrame(this.#frame);
    this.#gestures.destroy();
    this.#observer.disconnect();
    this.#canvas.remove();
  }
}
