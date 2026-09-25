// Map pan and zoom maths.

import { describe, it, expect } from 'vitest';
import { geoNaturalEarth1 } from 'd3-geo';
import {
  IDENTITY,
  MIN_ZOOM,
  MAX_ZOOM,
  isIdentity,
  constrain,
  zoomAt,
  panBy,
  wheelFactor,
  applyTransform,
} from '../src/lib/zoom.js';

const W = 1000;
const H = 600;

describe('zoomAt', () => {
  it('keeps the point under the pointer fixed', () => {
    const t = zoomAt(IDENTITY, 2, [300, 200], W, H);
    expect(t.k).toBe(2);
    // The fitted-map point that was at (300, 200) is still there.
    expect(300 * t.k + t.x).toBeCloseTo(300);
    expect(200 * t.k + t.y).toBeCloseTo(200);
  });

  it('clamps to the zoom limits', () => {
    expect(zoomAt(IDENTITY, 1000, [0, 0], W, H).k).toBe(MAX_ZOOM);
    expect(zoomAt(IDENTITY, 0.001, [0, 0], W, H).k).toBe(MIN_ZOOM);
  });

  it('zooming back out by the same factor returns to identity', () => {
    const t = zoomAt(zoomAt(IDENTITY, 3, [420, 310], W, H), 1 / 3, [420, 310], W, H);
    expect(isIdentity(t)).toBe(true);
  });
});

describe('panBy / constrain', () => {
  it('moves by the drag', () => {
    expect(panBy(IDENTITY, 40, -25, W, H)).toEqual({ k: 1, x: 40, y: -25 });
  });

  it('never lets the map leave the centre of the viewport', () => {
    const far = panBy(IDENTITY, 5000, 5000, W, H);
    expect(far.x).toBe(W / 2);
    expect(far.y).toBe(H / 2);
    const back = panBy(IDENTITY, -5000, -5000, W, H);
    expect(back.x + W * back.k).toBe(W / 2);
    expect(back.y + H * back.k).toBe(H / 2);
  });

  it('constrain clamps the zoom too', () => {
    expect(constrain({ k: 99, x: 0, y: 0 }, W, H).k).toBe(MAX_ZOOM);
  });
});

describe('wheelFactor', () => {
  it('scrolling up zooms in, down zooms out', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(0)).toBe(1);
  });

  it('normalises line-mode deltas', () => {
    expect(wheelFactor(3, 1)).toBeCloseTo(wheelFactor(48, 0));
  });
});

describe('applyTransform', () => {
  it('maps every projected point p to k·p + (x, y)', () => {
    const base = geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' });
    const t = { k: 2.5, x: -300, y: 40 };
    const zoomed = applyTransform(geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' }), t);
    for (const lonLat of [[0, 0], [114.2, 22.3], [-0.46, 51.47], [-118.4, 33.9]]) {
      const [px, py] = base(lonLat);
      const [qx, qy] = zoomed(lonLat);
      expect(qx).toBeCloseTo(px * t.k + t.x, 6);
      expect(qy).toBeCloseTo(py * t.k + t.y, 6);
    }
  });

  it('leaves the projection alone at identity', () => {
    const p = geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' });
    const scale = p.scale();
    applyTransform(p, IDENTITY);
    expect(p.scale()).toBe(scale);
  });
});
