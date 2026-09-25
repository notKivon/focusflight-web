// Map geometry: route arcs and the projection the canvas draws through.
// Pure d3-geo maths — no DOM, no canvas, so the framing rules stay testable.

import { geoNaturalEarth1, geoCircle, geoGraticule10 } from 'd3-geo';
import { interpolate, haversineKm, EARTH_RADIUS_KM } from './geo.js';

/** Points along the drawn arc. Dense enough that segments stay sub-pixel. */
export const ARC_STEPS = 256;

/** Route view framing: 12 % padding, and never zoomed in tighter than this. */
export const FIT_PADDING = 0.12;
export const MIN_SPAN_KM = 2000;

export const GRATICULE = geoGraticule10();

const degreesForKm = (km) => (km / EARTH_RADIUS_KM) * (180 / Math.PI);

/**
 * A slice of the great circle from `a` to `b` as a GeoJSON LineString,
 * sampled at `steps` points between fractions `t0` and `t1`.
 *
 * Longitudes stay in (-180, 180]; d3 cuts the line at the antimeridian itself,
 * which is what keeps an arc like HKG→LAX continuous instead of wrapping flat
 * across the map.
 */
export function arcBetween(a, b, t0 = 0, t1 = 1, steps = ARC_STEPS) {
  const coordinates = [];
  const span = t1 - t0;
  const n = Math.max(1, Math.round(steps * Math.abs(span)));
  for (let i = 0; i <= n; i += 1) {
    const { lat, lon } = interpolate(a, b, t0 + (span * i) / n);
    coordinates.push([lon, lat]);
  }
  return { type: 'LineString', coordinates };
}

/** The whole route arc, for framing and for the remaining-distance layer. */
export function routeArc(a, b, steps = ARC_STEPS) {
  return arcBetween(a, b, 0, 1, steps);
}

/** Midpoint of the great circle — what both views are rotated around. */
export function routeMidpoint(a, b) {
  return interpolate(a, b, 0.5);
}

/**
 * What the Route view is fitted to: the arc, plus a circle around the midpoint
 * that enforces the 2,000 km minimum span so a short hop is not magnified into
 * a meaningless close-up.
 */
export function fitGeometry(a, b) {
  const mid = routeMidpoint(a, b);
  const geometries = [routeArc(a, b)];
  if (haversineKm(a, b) < MIN_SPAN_KM) {
    geometries.push(
      geoCircle()
        .center([mid.lon, mid.lat])
        .radius(degreesForKm(MIN_SPAN_KM / 2))(),
    );
  }
  return { type: 'GeometryCollection', geometries };
}

/**
 * The projection for a view.
 *
 * Both views rotate the globe so the route's midpoint longitude is centred.
 * In `route` that frames the route; in `world` it also moves d3's antimeridian
 * cut to the far side of the globe, so a Pacific crossing draws as one arc.
 * `route` then fits the arc to the viewport with 12 % padding; `world` fits the
 * whole sphere instead.
 */
export function createProjection({ from, to, view = 'route', width, height }) {
  const mid = routeMidpoint(from, to);
  const projection = geoNaturalEarth1().rotate([-mid.lon, 0]);
  const extent = [
    [width * FIT_PADDING, height * FIT_PADDING],
    [width * (1 - FIT_PADDING), height * (1 - FIT_PADDING)],
  ];
  if (view === 'world') {
    return projection.fitExtent(extent, { type: 'Sphere' });
  }
  return projection.fitExtent(extent, fitGeometry(from, to));
}

/**
 * Heading of the plane in *screen* space at fraction `t`, in radians clockwise
 * from "up". Taken from the projected tangent rather than the geographic
 * bearing, so the plane stays aligned with the drawn arc wherever the
 * projection bends it.
 */
export function screenHeading(projection, a, b, t) {
  const step = 1e-3;
  const t0 = Math.min(1 - step, Math.max(0, t));
  const here = interpolate(a, b, t0);
  const next = interpolate(a, b, t0 + step);
  const p = projection([here.lon, here.lat]);
  const q = projection([next.lon, next.lat]);
  if (!p || !q) return 0;
  return Math.atan2(q[0] - p[0], -(q[1] - p[1]));
}
