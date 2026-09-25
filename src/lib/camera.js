// Camera views that ride with the plane. Pure d3-geo maths, no DOM.
//
// Route and World (lib/mapgeo.js) are flat, north-up maps of the whole route.
// Follow and Chase put the camera on the plane instead:
//
// - Follow: an orthographic globe centred on the plane and turned heading-up,
//   so the direction of travel always points up the screen.
// - Chase: a tilted perspective camera behind and above the plane, looking
//   forward along the heading. The plane sits on the view axis, pinned near
//   the lower middle of the screen, with the horizon ahead once tilted.
//
// Each factory returns a d3 projection plus `projection.visible([lon, lat])`,
// because d3 only clips *geometry* — a bare `projection(point)` happily
// projects the far side of a globe onto the near side.

import { geoOrthographic, geoRotation } from 'd3-geo';
import { EARTH_RADIUS_KM, headingAt, initialBearing, interpolate } from './geo.js';
import { geoSatellite, toVector, viewDepth, NEAR } from './satellite.js';

export const VIEWS = ['route', 'world', 'follow', 'chase'];

/** Unknown or missing stored values fall back to Route. */
export const resolveView = (view) => (VIEWS.includes(view) ? view : 'route');

export const isCameraView = (view) => view === 'follow' || view === 'chase';

/** Chase camera pitch, in degrees from looking straight down. */
export const TILT_MIN = 0;
export const TILT_MAX = 60;
export const TILT_DEFAULT = 40;

export function clampTilt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return TILT_DEFAULT;
  return Math.min(TILT_MAX, Math.max(TILT_MIN, Math.round(n)));
}

/** Zoom limits for the camera views (altitude / globe size), relative to default. */
export const CAMERA_MIN_ZOOM = 0.25;
export const CAMERA_MAX_ZOOM = 8;

/** Camera views only zoom: they stay locked on the plane, so no pan offset. */
export function constrainCamera(t) {
  const k = Math.min(CAMERA_MAX_ZOOM, Math.max(CAMERA_MIN_ZOOM, t?.k ?? 1));
  return { k, x: 0, y: 0 };
}

/** Follow: the distance across the shorter screen side at default zoom. */
export const FOLLOW_SPAN_KM = 6000;

/**
 * Chase: an orbit camera `CHASE_DISTANCE_KM` from the plane at default zoom,
 * with a lens of `CHASE_FOCAL` × the screen height. At the default 40° tilt
 * that shows about 2,500 km across at the plane and puts the horizon near the
 * top sixth of the screen. The plane sits a little below the middle so the
 * docked HUD does not cover it on a desktop screen.
 */
export const CHASE_DISTANCE_KM = 1600;
export const CHASE_FOCAL = 1.05;
/** Where the plane sits on screen in Chase, as fractions of width and height. */
export const CHASE_ANCHOR = [0.5, 0.62];

const RAD = Math.PI / 180;

/**
 * The point `angle` radians from `p` along initial bearing `bearing` (degrees).
 * Needed because `geo.interpolate` stops at the route's ends, and the Chase
 * camera can sit behind the departure airport.
 */
export function destination(p, bearing, angle) {
  const lat = p.lat * RAD;
  const b = bearing * RAD;
  const lat2 = Math.asin(Math.sin(lat) * Math.cos(angle) + Math.cos(lat) * Math.sin(angle) * Math.cos(b));
  const lon2 =
    p.lon * RAD +
    Math.atan2(Math.sin(b) * Math.sin(angle) * Math.cos(lat), Math.cos(angle) - Math.sin(lat) * Math.sin(lat2));
  const lon = ((((lon2 / RAD) + 540) % 360) + 360) % 360 - 180;
  return { lat: lat2 / RAD, lon };
}

/**
 * d3 rotation that centres `p` and turns bearing `heading` to point up the
 * screen. d3's third angle γ rolls the view; γ = heading puts that bearing up.
 */
export function headingUpRotation(p, heading) {
  return [-p.lon, -p.lat, heading];
}

/** Rotated-frame visibility, shared by both camera factories. */
function visibility(projection, test) {
  const rotate = geoRotation(projection.rotate());
  return ([lon, lat]) => {
    const [l, p] = rotate([lon, lat]);
    return test(toVector(l * RAD, p * RAD));
  };
}

/** Follow: orthographic, heading-up, the plane in the centre. */
export function followProjection({ at, heading, width, height, zoom = 1 }) {
  const radians = FOLLOW_SPAN_KM / EARTH_RADIUS_KM;
  const projection = geoOrthographic()
    .rotate(headingUpRotation(at, heading))
    .translate([width / 2, height / 2])
    .scale((Math.min(width, height) / radians) * zoom)
    .clipAngle(90)
    .precision(0.5);
  projection.visible = visibility(projection, ([, , Z]) => Z > 1e-3);
  return projection;
}

/**
 * The Chase camera, for a plane on the ground and a camera `distanceKm` away
 * from it, pitched `tilt` degrees back from straight overhead (0 = looking
 * straight down on the plane). Returns how far behind the plane the point
 * under the camera lies (`behind`, radians of arc), the camera's distance from
 * the Earth's centre (`P`, in radii) and its pitch measured from its *own*
 * vertical (`omega`, radians) — the satellite projection's parameters.
 */
export function chaseCamera(distanceKm, tilt) {
  const d = distanceKm / EARTH_RADIUS_KM;
  const pitch = clampTilt(tilt) * RAD;
  const back = d * Math.sin(pitch);
  const up = 1 + d * Math.cos(pitch);
  const behind = Math.atan2(back, up);
  return { behind, P: Math.hypot(back, up), omega: pitch - behind };
}

/**
 * Chase: the camera hangs behind and above the plane, looking at it along the
 * heading, so the plane sits on the view axis at `CHASE_ANCHOR` with the route
 * ahead running straight up to the horizon. Zoom moves the camera nearer or
 * further; tilt swings it from overhead (0°) towards the horizon.
 */
export function chaseProjection({ at, heading, width, height, tilt = TILT_DEFAULT, zoom = 1 }) {
  const { behind, P, omega } = chaseCamera(CHASE_DISTANCE_KM / zoom, tilt);
  const camera = destination(at, heading + 180, behind);
  const forward = behind > 1e-9 ? initialBearing(camera, at) : heading;
  const focal = CHASE_FOCAL * height;
  const [ax, ay] = CHASE_ANCHOR;
  const margin = Math.max(width, height);

  const projection = geoSatellite()
    .distance(P)
    .tilt(omega / RAD)
    .rotate(headingUpRotation(camera, forward))
    // A pinhole camera of focal length `focal` px, shifted so the plane (on
    // the view axis) lands on the anchor.
    .scale(focal / ((P - 1) * Math.cos(omega)))
    .translate([width * ax, height * ay + focal * Math.tan(omega)])
    .clipExtent([
      [-margin, -margin],
      [width + margin, height + margin],
    ])
    .precision(0.5);
  projection.visible = visibility(
    projection,
    (v) => v[2] > 1 / P && viewDepth(v, P, omega) > NEAR,
  );
  // The horizon straight ahead: its ray sits asin(1/P) from the camera's nadir.
  projection.horizonY = height * ay - focal * Math.tan(Math.asin(1 / P) - omega);
  return projection;
}

/** The camera projection for `view` with the plane at fraction `progress`. */
export function cameraProjection({ from, to, progress, view, width, height, zoom = 1, tilt }) {
  const at = interpolate(from, to, progress);
  const heading = headingAt(from, to, progress);
  const options = { at, heading, width, height, zoom, tilt };
  return view === 'chase' ? chaseProjection(options) : followProjection(options);
}

/** `projection(point)` if the point is on the visible side, else null. */
export function projectVisible(projection, [lon, lat]) {
  if (projection.visible && !projection.visible([lon, lat])) return null;
  return projection([lon, lat]);
}
