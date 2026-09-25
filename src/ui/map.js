// Canvas map: ocean, land, graticule, city labels, the route arc, the airports,
// the plane. Owns a <canvas> and a projection; knows nothing about timers or
// flight state. Callers set a route, a view and a progress fraction, then ask
// it to draw. The layers themselves are painted by `map-layers.js` and
// `map-route.js`.
//
// Views: Route and World are flat north-up maps (`lib/mapgeo.js`) that the
// user can pan and zoom; Follow and Chase are cameras locked on the plane
// (`lib/camera.js`) that only zoom — in Chase, a vertical drag tilts instead.

import { geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { createProjection, GRATICULE } from '../lib/mapgeo.js';
import { IDENTITY, isIdentity, applyTransform, constrain } from '../lib/zoom.js';
import {
  resolveView, isCameraView, constrainCamera, cameraProjection, projectVisible,
  clampTilt, TILT_DEFAULT,
} from '../lib/camera.js';
import { MapGestures } from './map-gestures.js';
import { palette, fill, stroke, drawSky, drawCities } from './map-layers.js';
import { routeMarks, drawRoute } from './map-route.js';

// Built once: the land never changes, only the projection it is drawn through.
const LAND = feature(world, world.objects.land);
const SPHERE = { type: 'Sphere' };
const NULL_ISLAND = { lat: 0, lon: 0 };
/** The plane is drawn larger when the camera rides with it. */
const PLANE_SIZE = { follow: 1.3, chase: 1.8 };
/** Degrees of tilt per pixel of vertical drag in Chase. */
const TILT_PER_PX = 0.2;

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
  #tilt = TILT_DEFAULT;
  #cities = false;
  #gestures;
  #onTransform;
  #onTilt;

  /**
   * Mounts a canvas into `container` and starts tracking its size.
   * `onTransform(transformed)` hears whether the user has moved the view;
   * `onTilt(degrees)` hears a Chase tilt made by dragging.
   */
  constructor(container, { onTransform = () => {}, onTilt = () => {} } = {}) {
    this.#onTransform = onTransform;
    this.#onTilt = onTilt;
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
      drag: (dx, dy) => this.#drag(dy),
    });
    this.#canvas.dataset.mode = this.#view;
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

  /** `'route'`, `'world'`, `'follow'` or `'chase'`; anything else is Route. */
  setView(view) {
    const next = resolveView(view);
    if (next === this.#view) return;
    this.#view = next;
    this.#canvas.dataset.mode = next;
    this.resetView();
    this.#schedule();
  }

  get view() {
    return this.#view;
  }

  /** Chase camera pitch in degrees (0 looks straight down). */
  setTilt(degrees) {
    this.#tilt = clampTilt(degrees);
    this.#schedule();
  }

  /** Major city labels on or off. */
  setCityLabels(on) {
    this.#cities = Boolean(on);
    this.#schedule();
  }

  /** True while the user has panned or zoomed away from the default framing. */
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

  get #camera() {
    return Boolean(this.#route) && isCameraView(this.#view);
  }

  #setTransform(t) {
    const was = this.transformed;
    if (isIdentity(t)) this.#transform = IDENTITY;
    else if (this.#camera) this.#transform = constrainCamera(t);
    else this.#transform = constrain(t, this.#width, this.#height);
    if (isIdentity(this.#transform)) this.#transform = IDENTITY;
    if (was !== this.transformed) this.#onTransform(this.transformed);
    this.#schedule();
  }

  /** A one-finger drag: false lets it pan the flat maps; Chase tilts; Follow ignores it. */
  #drag(dy) {
    if (!this.#camera) return false;
    if (this.#view === 'chase') {
      const next = clampTilt(this.#tilt - dy * TILT_PER_PX);
      if (next !== this.#tilt) {
        this.#tilt = next;
        this.#onTilt(next);
        this.#schedule();
      }
    }
    return true;
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

  #projection() {
    const { width, height } = this;
    if (this.#camera) {
      return cameraProjection({
        ...this.#route, progress: this.#progress, view: this.#view,
        width, height, zoom: this.#transform.k, tilt: this.#tilt,
      });
    }
    // With no route yet there is nothing to frame, so show the plain globe.
    const route = this.#route ?? { from: NULL_ISLAND, to: NULL_ISLAND };
    const projection = createProjection({
      from: route.from, to: route.to, view: this.#route ? this.#view : 'world', width, height,
    });
    return applyTransform(projection, this.#transform);
  }

  draw() {
    const { width, height } = this;
    if (!width || !height) return;
    const ctx = this.#ctx;
    const colours = palette(this.#canvas);
    const projection = this.#projection();
    const path = geoPath(projection, ctx);

    ctx.clearRect(0, 0, width, height);
    if (this.#camera) {
      drawSky(ctx, path, { width, height, horizonY: projection.horizonY, colours });
    }
    fill(ctx, path, SPHERE, colours.ocean);
    fill(ctx, path, LAND, colours.land);
    stroke(ctx, path, GRATICULE, colours.graticule, 1);

    const size = (this.#camera && PLANE_SIZE[this.#view]) || 1;
    const marks = this.#route ? routeMarks(projection, this.#route, this.#progress, size) : null;
    if (this.#cities) {
      drawCities(ctx, {
        project: (p) => projectVisible(projection, p),
        width, height, colours,
        blockers: marks ? marks.blockers : [],
        lines: marks ? marks.lines : [],
      });
    }
    if (marks) {
      drawRoute(ctx, path, projection, { route: this.#route, progress: this.#progress, marks, colours });
    }
  }

  get width() {
    return this.#width;
  }

  get height() {
    return this.#height;
  }

  /** Stops observing and removes the canvas. */
  destroy() {
    if (this.#frame) cancelAnimationFrame(this.#frame);
    this.#gestures.destroy();
    this.#observer.disconnect();
    this.#canvas.remove();
  }
}
