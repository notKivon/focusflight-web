// City labels: the committed dataset and the pure placement rules (density by
// map scale, rank order, collision avoidance, blockers, the route line).

import { describe, it, expect } from 'vitest';
import cities from '../src/data/cities.json';
import { createProjection } from '../src/lib/mapgeo.js';
import { applyTransform } from '../src/lib/zoom.js';
import { cameraProjection, projectVisible } from '../src/lib/camera.js';
import airports from '../src/data/airports.json';
import {
  placeCityLabels, minScaleForRank, localScale, overlaps, box, segmentHitsBox, linesHitBox,
  RANK_SCALE, AREA_PER_LABEL, LABEL_HEIGHT,
} from '../src/lib/cities.js';

const byIata = new Map(airports.map((a) => [a.iata, a]));
const HKG = byIata.get('HKG');
const LHR = byIata.get('LHR');
const W = 1440;
const H = 900;
const measure = (text) => text.length * 6.5;

/** The screen box a placed label occupies, as the painter draws it. */
const textBox = (l) => {
  const w = measure(l.name);
  const x0 = l.align === 'left' ? l.tx : l.tx - w;
  return box(x0, l.y - LABEL_HEIGHT / 2, x0 + w, l.y + LABEL_HEIGHT / 2);
};

function flat(view = 'route', k = 1) {
  const p = createProjection({ from: HKG, to: LHR, view, width: W, height: H });
  return applyTransform(p, { k, x: (W / 2) * (1 - k), y: (H / 2) * (1 - k) });
}

describe('cities.json', () => {
  it('holds a few hundred named places, most important first', () => {
    expect(cities.length).toBeGreaterThanOrEqual(300);
    expect(cities.length).toBeLessThanOrEqual(600);
    for (const c of cities) {
      expect(typeof c.name).toBe('string');
      expect(Math.abs(c.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(c.lon)).toBeLessThanOrEqual(180);
    }
    const ranks = cities.map((c) => c.rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    const names = cities.map((c) => c.name);
    for (const name of ['Tokyo', 'London', 'New York', 'Hong Kong', 'Los Angeles']) {
      expect(names).toContain(name);
    }
  });
});

describe('geometry helpers', () => {
  it('detects overlapping and separate boxes', () => {
    expect(overlaps(box(0, 0, 10, 10), box(5, 5, 15, 15))).toBe(true);
    expect(overlaps(box(0, 0, 10, 10), box(11, 0, 20, 10))).toBe(false);
    expect(overlaps(box(0, 0, 10, 10), box(11, 0, 20, 10), 0)).toBe(false);
    expect(overlaps(box(0, 0, 10, 10, 2), box(11, 0, 20, 10))).toBe(true);
  });

  it('knows when a line segment crosses a box', () => {
    const b = box(10, 10, 20, 20);
    expect(segmentHitsBox([0, 15], [30, 15], b)).toBe(true); // straight through
    expect(segmentHitsBox([0, 0], [30, 5], b)).toBe(false); // passes above
    expect(segmentHitsBox([15, 0], [15, 12], b)).toBe(true); // ends inside
    expect(segmentHitsBox([0, 30], [30, 0], b)).toBe(true); // diagonal
    expect(linesHitBox([[[0, 0], [5, 5]], [[0, 15], [30, 15]]], b)).toBe(true);
  });

  it('shows more ranks at larger map scales', () => {
    expect(minScaleForRank(0)).toBe(0);
    expect(minScaleForRank(3)).toBe(RANK_SCALE[3]);
    expect(minScaleForRank(9)).toBe(RANK_SCALE.at(-1));
    for (let r = 1; r < RANK_SCALE.length; r += 1) {
      expect(RANK_SCALE[r]).toBeGreaterThan(RANK_SCALE[r - 1]);
    }
  });

  it('measures the local map scale in px per km', () => {
    const scale = (lat) => localScale((p) => [p[0] * 2, -p[1] * 2], { lat, lon: 0 });
    expect(scale(10)).toBeCloseTo(2 / 111.195, 6);
    expect(localScale(() => null, { lat: 0, lon: 0 })).toBeNull();
  });
});

describe('placeCityLabels', () => {
  const place = (projection, extra = {}) =>
    placeCityLabels({
      cities,
      project: (p) => projectVisible(projection, p),
      measure,
      width: W,
      height: H,
      ...extra,
    });

  it('never lets two labels (dot or name) touch', () => {
    for (const projection of [flat('route'), flat('world'), flat('route', 4)]) {
      const labels = place(projection);
      const boxes = labels.flatMap((l) => [box(l.x - 3, l.y - 3, l.x + 3, l.y + 3), textBox(l)]);
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          if (Math.floor(i / 2) === Math.floor(j / 2)) continue; // a label's own dot and name
          expect(overlaps(boxes[i], boxes[j])).toBe(false);
        }
      }
    }
  });

  it('keeps every label inside the canvas', () => {
    for (const l of place(flat('route', 2))) {
      const b = textBox(l);
      expect(b.x0).toBeGreaterThanOrEqual(0);
      expect(b.x1).toBeLessThanOrEqual(W);
      expect(b.y0).toBeGreaterThanOrEqual(0);
      expect(b.y1).toBeLessThanOrEqual(H);
    }
  });

  it('shows more, and smaller, cities as the map zooms in, up to the area budget', () => {
    const rankOf = new Map(cities.map((c) => [c.name, c.rank]));
    const maxRank = (labels) => Math.max(...labels.map((l) => rankOf.get(l.name)));
    const world = place(flat('world'));
    const route = place(flat('route'));
    const zoomed = place(flat('route', 4));
    expect(world.length).toBeGreaterThan(5);
    expect(route.length).toBeGreaterThan(world.length);
    expect(maxRank(world)).toBeLessThan(maxRank(route));
    expect(maxRank(route)).toBeLessThan(maxRank(zoomed));
    expect(route.length).toBeLessThanOrEqual(Math.floor((W * H) / AREA_PER_LABEL));
    const tiny = placeCityLabels({
      cities, project: (p) => flat('route', 4)(p), measure, width: 300, height: 200,
    });
    expect(tiny.length).toBeLessThanOrEqual(Math.max(1, Math.floor((300 * 200) / AREA_PER_LABEL)));
  });

  it('only labels world cities on the whole-globe view', () => {
    const labels = place(flat('world'));
    const rankOf = new Map(cities.map((c) => [c.name, c.rank]));
    expect(labels.every((l) => rankOf.get(l.name) <= 1)).toBe(true);
    expect(labels.map((l) => l.name)).toContain('Tokyo');
  });

  it('places in rank order, so the most important city wins a clash', () => {
    const two = [
      { name: 'Major', lat: 0, lon: 0, rank: 0 },
      { name: 'Minor', lat: 0, lon: 0.01, rank: 0 },
    ];
    const labels = placeCityLabels({
      cities: two, project: ([lon, lat]) => [500 + lon * 10, 400 - lat * 10], measure, width: W, height: H,
    });
    expect(labels.map((l) => l.name)).toEqual(['Major']);
  });

  it('keeps clear of blockers and moves a name off the route line', () => {
    const one = [{ name: 'Midtown', lat: 0, lon: 0, rank: 0 }];
    const project = () => [500, 400];
    const base = { cities: one, project, measure, width: W, height: H };
    expect(placeCityLabels(base)[0].align).toBe('left'); // name to the right of the dot
    expect(placeCityLabels({ ...base, blockers: [box(495, 395, 505, 405)] })).toEqual([]);
    const line = [[[520, 300], [520, 500]]]; // crosses where the name would go
    const moved = placeCityLabels({ ...base, lines: line });
    expect(moved[0].align).toBe('right');
    const boxed = [[[520, 300], [520, 500]], [[470, 300], [470, 500]]];
    expect(placeCityLabels({ ...base, lines: boxed })).toEqual([]);
  });

  it('skips cities that are hidden or off screen', () => {
    const one = [{ name: 'Far', lat: 0, lon: 0, rank: 0 }];
    expect(placeCityLabels({ cities: one, project: () => null, measure, width: W, height: H })).toEqual([]);
    expect(placeCityLabels({ cities: one, project: () => [-5, 10], measure, width: W, height: H })).toEqual([]);
  });

  it('labels only the visible side of the globe in the camera views', () => {
    for (const view of ['follow', 'chase']) {
      const projection = cameraProjection({ from: HKG, to: LHR, progress: 0.4, view, width: W, height: H, tilt: 40 });
      const labels = place(projection);
      expect(labels.length).toBeGreaterThan(3);
      const names = labels.map((l) => l.name);
      expect(names).not.toContain('New York');
      expect(names).not.toContain('Sydney');
    }
  });
});
