// Camera views (Follow, Chase) and the tilted perspective projection behind
// Chase. Everything is checked through projected screen points, which is what
// the painter relies on.

import { describe, it, expect } from 'vitest';
import { geoPath } from 'd3-geo';
import airports from '../src/data/airports.json';
import { haversineKm, interpolate, initialBearing } from '../src/lib/geo.js';
import {
  VIEWS, resolveView, isCameraView, clampTilt, constrainCamera, destination, headingUpRotation,
  followProjection, chaseProjection, chaseCamera, cameraProjection, projectVisible,
  TILT_DEFAULT, TILT_MIN, TILT_MAX, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM, CHASE_ANCHOR,
} from '../src/lib/camera.js';
import { geoSatellite, satelliteRaw } from '../src/lib/satellite.js';
import { arcBetween, screenHeading } from '../src/lib/mapgeo.js';

const byIata = new Map(airports.map((a) => [a.iata, a]));
const HKG = byIata.get('HKG');
const LHR = byIata.get('LHR');
const LAX = byIata.get('LAX');
const W = 1440;
const H = 900;

/** Builds a path string recorder so arcs can be inspected as commands. */
function pathCommands(projection, object) {
  const cmds = [];
  const ctx = {
    moveTo: (x, y) => cmds.push(['M', x, y]),
    lineTo: (x, y) => cmds.push(['L', x, y]),
    closePath: () => cmds.push(['Z']),
    arc: () => {},
  };
  geoPath(projection, ctx)(object);
  return cmds;
}

describe('view names', () => {
  it('lists four views and falls back to Route for anything unknown', () => {
    expect(VIEWS).toEqual(['route', 'world', 'follow', 'chase']);
    for (const v of VIEWS) expect(resolveView(v)).toBe(v);
    expect(resolveView('sideways')).toBe('route');
    expect(resolveView(undefined)).toBe('route');
    expect(resolveView(null)).toBe('route');
  });

  it('knows which views ride with the plane', () => {
    expect(VIEWS.filter(isCameraView)).toEqual(['follow', 'chase']);
  });
});

describe('tilt and zoom limits', () => {
  it('clamps tilt to 0–60° in whole degrees, defaulting to 40°', () => {
    expect(TILT_DEFAULT).toBe(40);
    expect(clampTilt(-5)).toBe(TILT_MIN);
    expect(clampTilt(99)).toBe(TILT_MAX);
    expect(clampTilt('22.6')).toBe(23);
    expect(clampTilt('nope')).toBe(TILT_DEFAULT);
  });

  it('camera views only zoom: no pan offset survives', () => {
    expect(constrainCamera({ k: 2, x: 50, y: -20 })).toEqual({ k: 2, x: 0, y: 0 });
    expect(constrainCamera({ k: 100, x: 0, y: 0 }).k).toBe(CAMERA_MAX_ZOOM);
    expect(constrainCamera({ k: 0.01, x: 0, y: 0 }).k).toBe(CAMERA_MIN_ZOOM);
  });
});

describe('destination', () => {
  it('walks the given distance along the given bearing', () => {
    const p = destination(HKG, 300, 1000 / 6371);
    expect(haversineKm(HKG, p)).toBeCloseTo(1000, -1);
    expect(initialBearing(HKG, p)).toBeCloseTo(300, 0);
  });

  it('wraps longitude across the antimeridian', () => {
    const p = destination({ lat: 0, lon: 179 }, 90, (3 * Math.PI) / 180);
    expect(p.lon).toBeCloseTo(-178, 6);
  });
});

describe('Follow', () => {
  const at = interpolate(HKG, LHR, 0.4);
  const heading = 300;
  const projection = followProjection({ at, heading, width: W, height: H });

  it('uses the heading as the roll so that bearing points up', () => {
    expect(headingUpRotation(at, heading)).toEqual([-at.lon, -at.lat, heading]);
  });

  it('centres the plane and points its heading straight up the screen', () => {
    const [x, y] = projection([at.lon, at.lat]);
    expect(x).toBeCloseTo(W / 2, 6);
    expect(y).toBeCloseTo(H / 2, 6);
    const ahead = destination(at, heading, 0.05);
    const [ax, ay] = projection([ahead.lon, ahead.lat]);
    expect(ax).toBeCloseTo(W / 2, 3);
    expect(ay).toBeLessThan(H / 2 - 30);
  });

  it('shows a few thousand km: 3,000 km ahead is on screen, the far side is hidden', () => {
    const near = destination(at, heading, 1500 / 6371);
    expect(projectVisible(projection, [near.lon, near.lat])[1]).toBeGreaterThan(0);
    const antipode = [at.lon > 0 ? at.lon - 180 : at.lon + 180, -at.lat];
    expect(projection.visible(antipode)).toBe(false);
    expect(projectVisible(projection, antipode)).toBeNull();
  });

  it('zooming in scales the globe about the plane', () => {
    const zoomed = followProjection({ at, heading, width: W, height: H, zoom: 2 });
    expect(zoomed.scale()).toBeCloseTo(projection.scale() * 2, 6);
    expect(zoomed([at.lon, at.lat])[0]).toBeCloseTo(W / 2, 6);
  });
});

describe('satellite projection', () => {
  it('matches the untilted vertical perspective at zero tilt', () => {
    const raw = satelliteRaw(1.5, 0);
    const [x, y] = raw(0.2, 0.1);
    const k = 0.5 / (1.5 - Math.cos(0.1) * Math.cos(0.2));
    expect(x).toBeCloseTo(k * Math.cos(0.1) * Math.sin(0.2), 12);
    expect(y).toBeCloseTo(k * Math.sin(0.1), 12);
  });

  it('draws the visible globe as bounded geometry at every tilt', () => {
    for (const tilt of [0, 20, 40, 60]) {
      const p = geoSatellite().distance(1.2).tilt(tilt).scale(400).translate([W / 2, H / 2])
        .clipExtent([[-W, -H], [2 * W, 2 * H]]);
      const cmds = pathCommands(p, { type: 'Sphere' });
      expect(cmds.length).toBeGreaterThan(10);
      for (const [op, x, y] of cmds) {
        if (op === 'Z') continue;
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(Math.abs(x)).toBeLessThanOrEqual(2 * W + 1);
      }
    }
  });
});

describe('Chase', () => {
  const at = interpolate(HKG, LHR, 0.4);
  const heading = 300;
  const project = (tilt, zoom = 1) => chaseProjection({ at, heading, width: W, height: H, tilt, zoom });

  it('puts the camera straight overhead at 0° and behind the plane when tilted', () => {
    expect(chaseCamera(1600, 0).behind).toBe(0);
    expect(chaseCamera(1600, 0).omega).toBe(0);
    const tilted = chaseCamera(1600, 40);
    expect(tilted.behind).toBeGreaterThan(0);
    expect(tilted.omega).toBeLessThan((40 * Math.PI) / 180); // pitch from its own vertical
  });

  for (const tilt of [0, 20, 40, 60]) {
    it(`pins the plane to the lower middle, nose up, at ${tilt}°`, () => {
      const p = project(tilt);
      const [x, y] = p([at.lon, at.lat]);
      expect(x).toBeCloseTo(W * CHASE_ANCHOR[0], 4);
      expect(y).toBeCloseTo(H * CHASE_ANCHOR[1], 4);
      const ahead = destination(at, heading, 300 / 6371);
      const [ax, ay] = p([ahead.lon, ahead.lat]);
      expect(ax).toBeCloseTo(x, 3);
      expect(ay).toBeLessThan(y);
    });
  }

  it('brings the horizon down the screen as the camera tilts', () => {
    const ys = [0, 20, 40, 60].map((t) => project(t).horizonY);
    expect(ys[0]).toBeLessThan(0); // looking straight down: no horizon in view
    expect(ys[2]).toBeGreaterThan(0); // the default tilt shows it
    expect(ys[2]).toBeLessThan(H * 0.35);
    for (let i = 1; i < ys.length; i += 1) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
  });

  it('hides what is behind the camera or beyond the horizon', () => {
    const p = project(60);
    const behind = destination(at, heading + 180, 2500 / 6371);
    const far = destination(at, heading, 6000 / 6371);
    expect(p.visible([behind.lon, behind.lat])).toBe(false);
    expect(p.visible([far.lon, far.lat])).toBe(false);
    expect(p.visible([at.lon, at.lat])).toBe(true);
  });

  it('zooming in moves the camera closer, so the ground spreads out', () => {
    const ahead = destination(at, heading, 100 / 6371);
    const gap = (zoom) => {
      const p = project(40, zoom);
      return p([at.lon, at.lat])[1] - p([ahead.lon, ahead.lat])[1];
    };
    expect(gap(2)).toBeGreaterThan(gap(1) * 1.5);
    expect(gap(0.5)).toBeLessThan(gap(1));
  });

  it('keeps the plane heading up in screen space', () => {
    const p = cameraProjection({ from: HKG, to: LHR, progress: 0.4, view: 'chase', width: W, height: H, tilt: 40 });
    expect(screenHeading(p, HKG, LHR, 0.4)).toBeCloseTo(0, 2);
  });
});

describe('camera views across the Pacific', () => {
  for (const view of ['follow', 'chase']) {
    it(`draws HKG→LAX as one continuous arc in ${view}`, () => {
      const p = cameraProjection({ from: HKG, to: LAX, progress: 0.5, view, width: W, height: H, tilt: 40 });
      for (const [t0, t1] of [[0, 0.5], [0.5, 1]]) {
        const cmds = pathCommands(p, arcBetween(HKG, LAX, t0, t1));
        const moves = cmds.filter(([op]) => op === 'M');
        expect(moves.length).toBe(1);
      }
    });
  }
});
