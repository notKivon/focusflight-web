// A tilted perspective ("satellite") projection: the view from a camera at
// `distance` Earth radii from the centre of the globe, pitched forward by
// `tilt`. Pure d3-geo, no DOM.
//
// The raw maths is Snyder's tilted perspective, the same as d3-geo-projection's
// geoSatellite; it is a dozen lines, so it lives here rather than pulling in
// another package. What d3-geo-projection leaves to the caller is clipping:
// a tilted camera can see, above its horizon, points that are *behind* its
// image plane, which would project mirrored. `satellitePreclip` removes those.

import { geoClipCircle, geoProjectionMutator, geoRotation } from 'd3-geo';

const DEG = 180 / Math.PI;

/** Untilted vertical perspective from `P` radii out. */
function verticalRaw(P) {
  return (x, y) => {
    const cosy = Math.cos(y);
    const k = (P - 1) / (P - cosy * Math.cos(x));
    return [k * cosy * Math.sin(x), k * Math.sin(y)];
  };
}

/**
 * Snyder's tilted perspective. Up to a uniform scale of cos(ω) and a shift,
 * this is a pinhole camera image, so straight lines stay straight.
 */
export function satelliteRaw(P, omega) {
  const vertical = verticalRaw(P);
  const cosOmega = Math.cos(omega);
  const sinOmega = Math.sin(omega);
  return (x, y) => {
    const [vx, vy] = vertical(x, y);
    const A = (vy * sinOmega) / (P - 1) + cosOmega;
    return [(vx * cosOmega) / A, vy / A];
  };
}

/**
 * Depth of a unit vector (X right, Y forward/up, Z towards the camera) along
 * the tilted view axis, from a camera at (0, 0, P).
 */
export function viewDepth([X, Y, Z], P, omega) {
  return Y * Math.sin(omega) + (P - Z) * Math.cos(omega);
}

/** Rotated-frame [λ, φ] in radians → unit vector, matching `viewDepth`. */
export function toVector(lambda, phi) {
  const c = Math.cos(phi);
  return [c * Math.sin(lambda), Math.sin(phi), c * Math.cos(lambda)];
}

/** Points nearer the camera plane than this (in radii) are dropped. */
export const NEAR = 0.002;

/** A stream that rotates every point (radians in, radians out). */
function rotateStream(rotate, sink) {
  return {
    point(x, y) {
      const [a, b] = rotate([x * DEG, y * DEG]);
      sink.point(a / DEG, b / DEG);
    },
    lineStart: () => sink.lineStart(),
    lineEnd: () => sink.lineEnd(),
    polygonStart: () => sink.polygonStart(),
    polygonEnd: () => sink.polygonEnd(),
    sphere: () => sink.sphere(),
  };
}

/**
 * Preclip for the tilted camera: the horizon (a small circle around the
 * sub-camera point) followed by the near plane. The near plane cuts the sphere
 * in another small circle — centred on the far side of the globe, tilted by ω —
 * so it is a `geoClipCircle` wrapped in a rotation there and back.
 */
export function satellitePreclip(P, omega) {
  const horizon = geoClipCircle(Math.acos(1 / P) - 1e-6);
  // n·p ≥ c with n = (0, sin ω, −cos ω), c = NEAR − P cos ω.
  const c = NEAR - P * Math.cos(omega);
  if (c <= -1) return horizon; // the camera plane misses the globe entirely
  const near = geoClipCircle(Math.acos(Math.min(1, c)));
  const toCentre = geoRotation([0, -omega * DEG]);
  const toFarSide = geoRotation([180, 0]);
  const there = (p) => toCentre(toFarSide(p));
  const back = (p) => toFarSide.invert(toCentre.invert(p));
  return (sink) => horizon(rotateStream(there, near(rotateStream(back, sink))));
}

/** A d3 projection with `.distance(P)` and `.tilt(degrees)` setters. */
export function geoSatellite() {
  let distance = 2;
  let omega = 0;
  const mutate = geoProjectionMutator(satelliteRaw);
  const projection = mutate(distance, omega);
  const update = () => mutate(distance, omega).preclip(satellitePreclip(distance, omega));
  projection.distance = (value) => {
    distance = value;
    return update();
  };
  projection.tilt = (degrees) => {
    omega = degrees / DEG;
    return update();
  };
  update();
  return projection;
}
