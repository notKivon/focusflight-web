import { describe, it, expect } from 'vitest';
import airports from '../src/data/airports.json';
import {
  arcBetween,
  routeArc,
  routeMidpoint,
  createProjection,
  screenHeading,
  FIT_PADDING,
  MIN_SPAN_KM,
} from '../src/lib/mapgeo.js';
import { haversineKm } from '../src/lib/geo.js';

const byIata = new Map(airports.map((a) => [a.iata, a]));
const HKG = byIata.get('HKG');
const LHR = byIata.get('LHR');
const LAX = byIata.get('LAX');
const SIN = byIata.get('SIN');
const KUL = byIata.get('KUL');

const WIDTH = 1600;
const HEIGHT = 900;

/** Projected points of a route arc, for the framing checks. */
function project(projection, from, to) {
  return routeArc(from, to).coordinates.map(([lon, lat]) => projection([lon, lat]));
}

const maxStep = (points) =>
  points.slice(1).reduce((max, p, i) => Math.max(max, Math.abs(p[0] - points[i][0])), 0);

describe('route arcs', () => {
  it('starts and ends at the airports', () => {
    const { coordinates } = routeArc(HKG, LHR);
    expect(coordinates[0][0]).toBeCloseTo(HKG.lon, 6);
    expect(coordinates[0][1]).toBeCloseTo(HKG.lat, 6);
    expect(coordinates.at(-1)[0]).toBeCloseTo(LHR.lon, 6);
    expect(coordinates.at(-1)[1]).toBeCloseTo(LHR.lat, 6);
  });

  it('samples a partial arc between two fractions', () => {
    const flown = arcBetween(HKG, LHR, 0, 0.25, 256);
    const mid = routeMidpoint(HKG, LHR);
    expect(flown.coordinates.length).toBe(65);
    expect(flown.coordinates.at(-1)[0]).not.toBeCloseTo(mid.lon, 3);
    const whole = routeArc(HKG, LHR).coordinates;
    expect(flown.coordinates.at(-1)[0]).toBeCloseTo(whole[64][0], 6);
  });

  it('takes HKG→LAX across the North Pacific and over the antimeridian', () => {
    const lats = routeArc(HKG, LAX).coordinates.map(([, lat]) => lat);
    const lons = routeArc(HKG, LAX).coordinates.map(([lon]) => lon);
    expect(Math.max(...lats)).toBeGreaterThan(45);
    expect(lons.some((lon) => lon > 170)).toBe(true);
    expect(lons.some((lon) => lon < -170)).toBe(true);
    expect(Math.min(...lons)).toBeGreaterThanOrEqual(-180);
    expect(Math.max(...lons)).toBeLessThanOrEqual(180);
  });
});

describe('route view', () => {
  it('rotates the globe onto the route midpoint longitude', () => {
    for (const [from, to] of [
      [HKG, LHR],
      [HKG, LAX],
    ]) {
      const projection = createProjection({ from, to, view: 'route', width: WIDTH, height: HEIGHT });
      const mid = routeMidpoint(from, to);
      expect(projection.rotate()[0]).toBeCloseTo(-mid.lon, 6);
      // The midpoint longitude is the projection's centre meridian, so it maps
      // to the vertical axis the arc is then fitted around.
      expect(projection([mid.lon, 0])[0]).toBeCloseTo(projection([mid.lon, 45])[0], 6);
    }
  });

  it('centres the fitted route in the viewport', () => {
    for (const [from, to] of [
      [HKG, LHR],
      [HKG, LAX],
    ]) {
      const projection = createProjection({ from, to, view: 'route', width: WIDTH, height: HEIGHT });
      const xs = project(projection, from, to).map(([x]) => x);
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(WIDTH / 2, 6);
    }
  });

  it('fits the whole arc inside the 12 % padding', () => {
    for (const [from, to] of [
      [HKG, LHR],
      [HKG, LAX],
      [SIN, KUL],
    ]) {
      const projection = createProjection({ from, to, view: 'route', width: WIDTH, height: HEIGHT });
      const points = project(projection, from, to);
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(WIDTH * FIT_PADDING - 1);
        expect(x).toBeLessThanOrEqual(WIDTH * (1 - FIT_PADDING) + 1);
        expect(y).toBeGreaterThanOrEqual(HEIGHT * FIT_PADDING - 1);
        expect(y).toBeLessThanOrEqual(HEIGHT * (1 - FIT_PADDING) + 1);
      }
    }
  });

  it('draws a Pacific crossing as one continuous arc', () => {
    const projection = createProjection({
      from: HKG,
      to: LAX,
      view: 'route',
      width: WIDTH,
      height: HEIGHT,
    });
    expect(maxStep(project(projection, HKG, LAX))).toBeLessThan(WIDTH / 20);
  });

  it('never zooms in tighter than a 2,000 km span', () => {
    expect(haversineKm(SIN, KUL)).toBeLessThan(MIN_SPAN_KM);
    const projection = createProjection({
      from: SIN,
      to: KUL,
      view: 'route',
      width: WIDTH,
      height: HEIGHT,
    });
    const y = HEIGHT / 2;
    const left = projection.invert([WIDTH * FIT_PADDING, y]);
    const right = projection.invert([WIDTH * (1 - FIT_PADDING), y]);
    const spanKm = haversineKm(
      { lat: left[1], lon: left[0] },
      { lat: right[1], lon: right[0] },
    );
    expect(spanKm).toBeGreaterThanOrEqual(MIN_SPAN_KM);
  });
});

describe('world view', () => {
  it('fits the whole globe and keeps the Pacific arc continuous', () => {
    const projection = createProjection({
      from: HKG,
      to: LAX,
      view: 'world',
      width: WIDTH,
      height: HEIGHT,
    });
    for (const corner of [
      [-180, 0],
      [180, 0],
      [0, 90],
      [0, -90],
    ]) {
      const [x, y] = projection(corner);
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(WIDTH + 1);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(HEIGHT + 1);
    }
    expect(maxStep(project(projection, HKG, LAX))).toBeLessThan(WIDTH / 20);
  });
});

describe('screen heading', () => {
  it('points the plane along the drawn arc', () => {
    const projection = createProjection({
      from: HKG,
      to: LAX,
      view: 'route',
      width: WIDTH,
      height: HEIGHT,
    });
    const points = project(projection, HKG, LAX);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const i = Math.min(points.length - 2, Math.round(t * (points.length - 1)));
      const drawn = Math.atan2(
        points[i + 1][0] - points[i][0],
        -(points[i + 1][1] - points[i][1]),
      );
      expect(screenHeading(projection, HKG, LAX, t)).toBeCloseTo(drawn, 1);
    }
  });

  it('heads east out of HKG on the way to LAX', () => {
    const projection = createProjection({
      from: HKG,
      to: LAX,
      view: 'route',
      width: WIDTH,
      height: HEIGHT,
    });
    const heading = screenHeading(projection, HKG, LAX, 0);
    expect(heading).toBeGreaterThan(0);
    expect(heading).toBeLessThan(Math.PI / 2);
  });
});
