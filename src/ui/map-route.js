// The route layer: where the airports and the plane land on screen (and the
// space they, and the arc, take up — the city labels keep clear of it), and
// the painting of arc, airports and plane on top of everything else.

import { arcBetween, screenHeading } from '../lib/mapgeo.js';
import { interpolate } from '../lib/geo.js';
import { projectVisible } from '../lib/camera.js';
import { stroke, drawAirport, airportBox, drawPlane, planeBox } from './map-layers.js';

/** Points along the route that city names are kept off. */
const ARC_SAMPLES = 96;

/** The route as screen polylines, split wherever it goes out of sight. */
function arcLines(projection, { from, to }) {
  const lines = [[]];
  for (const lonLat of arcBetween(from, to, 0, 1, ARC_SAMPLES).coordinates) {
    const point = projectVisible(projection, lonLat);
    if (point) lines.at(-1).push(point);
    else if (lines.at(-1).length) lines.push([]);
  }
  return lines.filter((line) => line.length > 1);
}

/**
 * Screen positions of the airports and the plane (null when hidden), plus the
 * boxes and lines other layers must keep clear of.
 */
export function routeMarks(projection, route, progress, planeSize = 1) {
  const { from, to } = route;
  const here = interpolate(from, to, progress);
  const airports = [from, to].map((a) => ({
    iata: a.iata,
    point: projectVisible(projection, [a.lon, a.lat]),
  }));
  const plane = projectVisible(projection, [here.lon, here.lat]);
  const blockers = airports.filter((a) => a.point).map((a) => airportBox(a.point));
  if (plane) blockers.push(planeBox(plane, planeSize));
  return { airports, plane, planeSize, blockers, lines: arcLines(projection, route) };
}

/** Remaining arc (dashed, muted), flown arc (solid amber), airports, plane. */
export function drawRoute(ctx, path, projection, { route, progress, marks, colours }) {
  const { from, to } = route;
  const t = progress;

  if (t < 1) stroke(ctx, path, arcBetween(from, to, t, 1), colours.muted, 1.5, [5, 6]);
  if (t > 0) stroke(ctx, path, arcBetween(from, to, 0, t), colours.accent, 2.5);

  for (const { iata, point } of marks.airports) {
    if (point) drawAirport(ctx, point, iata, colours);
  }
  if (marks.plane) {
    const angle = screenHeading(projection, from, to, t);
    drawPlane(ctx, marks.plane, angle, colours.accent, marks.planeSize);
  }
}
