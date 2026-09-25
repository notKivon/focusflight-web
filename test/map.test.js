// Renderer tests. Rather than a real browser, the map draws into a recording
// 2D context, so draw order, HiDPI scaling and — the thing that actually goes
// wrong on a world map — arc continuity across the antimeridian are all
// checked by inspecting the commands the canvas received.

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import airports from '../src/data/airports.json';
import { createProjection, screenHeading } from '../src/lib/mapgeo.js';
import { CHASE_ANCHOR } from '../src/lib/camera.js';
import { interpolate } from '../src/lib/geo.js';

const byIata = new Map(airports.map((a) => [a.iata, a]));
const HKG = byIata.get('HKG');
const LHR = byIata.get('LHR');
const LAX = byIata.get('LAX');

const WIDTH = 1600;
const HEIGHT = 900;
const RATIO = 2;

const tokensCss = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const tokenValue = (name) => tokensCss.match(new RegExp(`${name}:\\s*([^;]+);`))[1].trim();
const OCEAN = tokenValue('--ocean');
const LAND = tokenValue('--land');
const GRATICULE = tokenValue('--surface-2');
const ACCENT = tokenValue('--accent');
const MUTED = tokenValue('--muted');

/** A 2D context that records paths and paint calls instead of rasterising. */
function recordingContext() {
  const ops = [];
  let path = [];
  let dash = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    beginPath: () => {
      path = [];
    },
    moveTo: (x, y) => path.push({ op: 'moveTo', x, y }),
    lineTo: (x, y) => path.push({ op: 'lineTo', x, y }),
    arc: (x, y, r) => path.push({ op: 'arc', x, y, r }),
    closePath: () => path.push({ op: 'closePath' }),
    setLineDash: (d) => {
      dash = d;
    },
    fill: () => ops.push({ op: 'fill', style: ctx.fillStyle, path }),
    stroke: () =>
      ops.push({ op: 'stroke', style: ctx.strokeStyle, lineWidth: ctx.lineWidth, dash, path }),
    fillText: (text, x, y) => ops.push({ op: 'fillText', text, x, y, style: ctx.fillStyle }),
    strokeText: (text, x, y) => ops.push({ op: 'strokeText', text, x, y, style: ctx.strokeStyle }),
    measureText: (text) => ({ width: text.length * 6.5 }),
    fillRect: (x, y, w, h) => ops.push({ op: 'fillRect', x, y, w, h, style: ctx.fillStyle }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    clearRect: () => ops.push({ op: 'clearRect' }),
    save: () => ops.push({ op: 'save' }),
    restore: () => ops.push({ op: 'restore' }),
    translate: (x, y) => ops.push({ op: 'translate', x, y }),
    rotate: (angle) => ops.push({ op: 'rotate', angle }),
    setTransform: (...args) => ops.push({ op: 'setTransform', args }),
  };
  return { ctx, ops };
}

let ops;
let canvas;
let FlightMap;

function installDom() {
  const recorder = recordingContext();
  ops = recorder.ops;
  canvas = {
    width: 0,
    height: 0,
    attributes: {},
    className: '',
    getContext: () => recorder.ctx,
    getBoundingClientRect: () => ({ width: WIDTH, height: HEIGHT }),
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    remove: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dataset: {},
  };
  globalThis.document = { createElement: () => canvas };
  globalThis.devicePixelRatio = RATIO;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  // Draws are triggered explicitly in the tests, so frames never fire here.
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.getComputedStyle = () => ({
    getPropertyValue: (name) => tokenValue(name),
  });
}

beforeEach(async () => {
  installDom();
  ({ FlightMap } = await import('../src/ui/map.js'));
});

afterEach(() => {
  delete globalThis.document;
  delete globalThis.ResizeObserver;
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
  delete globalThis.getComputedStyle;
  delete globalThis.devicePixelRatio;
});

/** Mounts a map, draws one frame, and hands back what the canvas received. */
function drawOnce({ from, to, view = 'route', progress = 0.35, cities = false, tilt }) {
  const map = new FlightMap({ append: () => {} });
  map.setRoute({ from, to });
  map.setView(view);
  map.setProgress(progress);
  map.setCityLabels(cities);
  if (tilt !== undefined) map.setTilt(tilt);
  ops.length = 0;
  map.draw();
  return map;
}

// Arcs are stroked as lines; airport markers are stroked circles in the same
// amber, so the two are told apart by the shape of the recorded path.
const isLine = (stroke) => stroke.path.some((p) => p.op === 'moveTo');
const strokesOf = (style) =>
  ops.filter((o) => o.op === 'stroke' && o.style === style && isLine(o));
const markers = () => ops.filter((o) => o.op === 'stroke' && o.path.some((p) => p.op === 'arc'));
const indexOf = (predicate) => ops.findIndex(predicate);

describe('map renderer', () => {
  it('scales the backing store for the device pixel ratio', () => {
    drawOnce({ from: HKG, to: LHR });
    expect(canvas.width).toBe(WIDTH * RATIO);
    expect(canvas.height).toBe(HEIGHT * RATIO);
    const transform = ops.find((o) => o.op === 'setTransform');
    expect(transform?.args ?? [RATIO, 0, 0, RATIO, 0, 0]).toEqual([RATIO, 0, 0, RATIO, 0, 0]);
  });

  it('draws ocean, land, graticule, arcs, airports, then the plane', () => {
    drawOnce({ from: HKG, to: LHR });
    const ocean = indexOf((o) => o.op === 'fill' && o.style === OCEAN);
    const land = indexOf((o) => o.op === 'fill' && o.style === LAND);
    const graticule = indexOf((o) => o.op === 'stroke' && o.style === GRATICULE);
    const remaining = indexOf((o) => o.op === 'stroke' && o.style === MUTED && isLine(o));
    const flown = indexOf((o) => o.op === 'stroke' && o.style === ACCENT && isLine(o));
    const airports = indexOf((o) => o.op === 'stroke' && o.path.some((p) => p.op === 'arc'));
    const plane = indexOf((o) => o.op === 'rotate');

    expect(ocean).toBeGreaterThanOrEqual(0);
    expect(land).toBeGreaterThan(ocean);
    expect(graticule).toBeGreaterThan(land);
    expect(remaining).toBeGreaterThan(graticule);
    expect(flown).toBeGreaterThan(graticule);
    expect(airports).toBeGreaterThan(flown);
    expect(plane).toBeGreaterThan(airports);
    expect(markers()).toHaveLength(2);
  });

  it('dashes the remaining arc and draws the flown one solid', () => {
    drawOnce({ from: HKG, to: LHR });
    const remaining = strokesOf(MUTED).at(-1);
    const flown = strokesOf(ACCENT).at(-1);
    expect(remaining.dash.length).toBeGreaterThan(0);
    expect(flown.dash).toEqual([]);
  });

  it('splits the arc at the plane', () => {
    const progress = 0.35;
    drawOnce({ from: HKG, to: LHR, progress });
    const projection = createProjection({
      from: HKG,
      to: LHR,
      view: 'route',
      width: WIDTH,
      height: HEIGHT,
    });
    const here = interpolate(HKG, LHR, progress);
    const [x, y] = projection([here.lon, here.lat]);

    const flownEnd = strokesOf(ACCENT).at(-1).path.at(-1);
    const remainingStart = strokesOf(MUTED).at(-1).path[0];
    expect(flownEnd.x).toBeCloseTo(x, 3);
    expect(flownEnd.y).toBeCloseTo(y, 3);
    expect(remainingStart.x).toBeCloseTo(x, 3);
    expect(remainingStart.y).toBeCloseTo(y, 3);
  });

  it('omits the flown arc before take-off and the remaining arc on arrival', () => {
    drawOnce({ from: HKG, to: LHR, progress: 0 });
    expect(strokesOf(ACCENT)).toHaveLength(0);
    drawOnce({ from: HKG, to: LHR, progress: 1 });
    expect(strokesOf(MUTED)).toHaveLength(0);
  });

  for (const view of ['route', 'world']) {
    it(`draws HKG→LAX as one continuous arc in the ${view} view`, () => {
      drawOnce({ from: HKG, to: LAX, view, progress: 0.5 });
      for (const stroke of [...strokesOf(ACCENT), ...strokesOf(MUTED)]) {
        const starts = stroke.path.filter((p) => p.op === 'moveTo');
        expect(starts).toHaveLength(1); // not cut in two at the antimeridian
        const jumps = stroke.path
          .filter((p) => p.op !== 'closePath')
          .map((p, i, all) => (i === 0 ? 0 : Math.abs(p.x - all[i - 1].x)));
        expect(Math.max(...jumps)).toBeLessThan(WIDTH / 20);
      }
    });
  }

  it('puts the plane on the arc, rotated to its heading', () => {
    const progress = 0.6;
    drawOnce({ from: HKG, to: LAX, progress });
    const projection = createProjection({
      from: HKG,
      to: LAX,
      view: 'route',
      width: WIDTH,
      height: HEIGHT,
    });
    const here = interpolate(HKG, LAX, progress);
    const [x, y] = projection([here.lon, here.lat]);

    const translate = ops.findLast((o) => o.op === 'translate');
    const rotate = ops.findLast((o) => o.op === 'rotate');
    expect(translate.x).toBeCloseTo(x, 3);
    expect(translate.y).toBeCloseTo(y, 3);
    expect(rotate.angle).toBeCloseTo(screenHeading(projection, HKG, LAX, progress), 6);
  });

  it('labels both airports and describes the route for screen readers', () => {
    drawOnce({ from: HKG, to: LHR });
    const labels = ops.filter((o) => o.op === 'fillText').map((o) => o.text);
    expect(labels).toEqual(['HKG', 'LHR']);
    expect(canvas.attributes['aria-label']).toBe('Map of the route from HKG to LHR');
  });

  it('frames the two views differently', () => {
    drawOnce({ from: HKG, to: LHR });
    const routeArc = strokesOf(ACCENT).at(-1).path.at(-1);
    drawOnce({ from: HKG, to: LHR, view: 'world' });
    const worldArc = strokesOf(ACCENT).at(-1).path.at(-1);
    expect(Math.hypot(routeArc.x - worldArc.x, routeArc.y - worldArc.y)).toBeGreaterThan(10);
  });

  it('draws no city names until they are switched on', () => {
    drawOnce({ from: HKG, to: LHR, view: 'world' });
    expect(ops.filter((o) => o.op === 'strokeText')).toHaveLength(0);
  });

  it('draws city labels after the graticule and beneath the route', () => {
    drawOnce({ from: HKG, to: LHR, cities: true });
    const names = ops.filter((o) => o.op === 'fillText' && o.text.length > 3);
    expect(names.length).toBeGreaterThan(5);
    expect(names.every((o) => o.style === MUTED)).toBe(true);
    const graticule = indexOf((o) => o.op === 'stroke' && o.style === GRATICULE);
    const firstCity = ops.indexOf(names[0]);
    const lastCity = ops.indexOf(names.at(-1));
    const remaining = indexOf((o) => o.op === 'stroke' && o.style === MUTED && isLine(o));
    const airports = indexOf((o) => o.op === 'stroke' && o.path.some((p) => p.op === 'arc'));
    expect(firstCity).toBeGreaterThan(graticule);
    expect(lastCity).toBeLessThan(remaining);
    expect(remaining).toBeLessThan(airports);
    // Each name has an ocean-toned halo drawn first.
    const halos = ops.filter((o) => o.op === 'strokeText');
    expect(halos).toHaveLength(names.length);
    expect(halos.every((o) => o.style === OCEAN)).toBe(true);
  });

  it('keeps city names off the airport codes and the plane', () => {
    drawOnce({ from: HKG, to: LHR, cities: true, progress: 0.5 });
    const codes = ops.filter((o) => o.op === 'fillText' && ['HKG', 'LHR'].includes(o.text));
    const plane = ops.findLast((o) => o.op === 'translate');
    const names = ops.filter((o) => o.op === 'fillText' && o.style === MUTED);
    for (const n of names) {
      for (const c of codes) expect(Math.hypot(n.x - c.x, n.y - c.y)).toBeGreaterThan(10);
      expect(Math.hypot(n.x - plane.x, n.y - plane.y)).toBeGreaterThan(10);
    }
  });

  it('treats an unknown view as Route', () => {
    drawOnce({ from: HKG, to: LHR });
    const route = strokesOf(ACCENT).at(-1).path.at(-1);
    drawOnce({ from: HKG, to: LHR, view: 'sideways' });
    const other = strokesOf(ACCENT).at(-1).path.at(-1);
    expect(other).toEqual(route);
  });

  it('paints space behind the globe in the camera views only', () => {
    drawOnce({ from: HKG, to: LHR });
    expect(ops.filter((o) => o.op === 'fillRect')).toHaveLength(0);
    for (const view of ['follow', 'chase']) {
      drawOnce({ from: HKG, to: LHR, view });
      const sky = indexOf((o) => o.op === 'fillRect');
      const ocean = indexOf((o) => o.op === 'fill' && o.style === OCEAN);
      expect(sky).toBeGreaterThanOrEqual(0);
      expect(sky).toBeLessThan(ocean);
    }
  });

  it('centres the plane nose-up in Follow', () => {
    drawOnce({ from: HKG, to: LHR, view: 'follow', progress: 0.4 });
    const translate = ops.findLast((o) => o.op === 'translate');
    const rotate = ops.findLast((o) => o.op === 'rotate');
    expect(translate.x).toBeCloseTo(WIDTH / 2, 3);
    expect(translate.y).toBeCloseTo(HEIGHT / 2, 3);
    expect(rotate.angle).toBeCloseTo(0, 2);
  });

  for (const tilt of [15, 55]) {
    it(`pins the plane nose-up near the lower middle in Chase at ${tilt}°`, () => {
      drawOnce({ from: HKG, to: LHR, view: 'chase', progress: 0.4, tilt });
      const translate = ops.findLast((o) => o.op === 'translate');
      const rotate = ops.findLast((o) => o.op === 'rotate');
      expect(translate.x).toBeCloseTo(WIDTH * CHASE_ANCHOR[0], 3);
      expect(translate.y).toBeCloseTo(HEIGHT * CHASE_ANCHOR[1], 3);
      expect(rotate.angle).toBeCloseTo(0, 2);
    });
  }

  it('tilting the Chase camera changes the picture, not the plane', () => {
    const landAt = (tilt) => {
      drawOnce({ from: HKG, to: LHR, view: 'chase', tilt });
      return ops.find((o) => o.op === 'fill' && o.style === LAND).path.length;
    };
    expect(landAt(10)).not.toBe(landAt(55));
  });

  for (const view of ['follow', 'chase']) {
    it(`draws HKG→LAX as one continuous arc in ${view}`, () => {
      drawOnce({ from: HKG, to: LAX, view, progress: 0.5 });
      const arcs = [...strokesOf(ACCENT), ...strokesOf(MUTED)];
      expect(arcs.length).toBeGreaterThanOrEqual(2);
      for (const stroke of arcs) {
        expect(stroke.path.filter((p) => p.op === 'moveTo')).toHaveLength(1);
      }
    });
  }

  it('hides airports that are out of sight in Chase', () => {
    drawOnce({ from: HKG, to: LHR, view: 'chase', progress: 0.5, tilt: 40 });
    expect(markers().length).toBeLessThan(2);
  });
});
