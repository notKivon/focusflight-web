// Pan and zoom for the map, as plain maths. No DOM.
//
// A view transform `{k, x, y}` sits on top of the fitted projection: a screen
// point p from the fitted map lands at k·p + (x, y). Applying it to a d3
// projection only rescales and shifts it, so every layer (land, arc, plane)
// moves together and line widths stay crisp.

export const IDENTITY = Object.freeze({ k: 1, x: 0, y: 0 });

/** Zoom limits relative to the fitted view. Below 1 shows more context. */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 16;

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

export function isIdentity(t) {
  return !t || (Math.abs(t.k - 1) < 1e-6 && Math.abs(t.x) < 0.5 && Math.abs(t.y) < 0.5);
}

/**
 * Keeps the map findable: the transformed map must still cover the centre of
 * the viewport, so it can never be flung off-screen and lost.
 */
export function constrain(t, width, height) {
  const k = clamp(t.k, MIN_ZOOM, MAX_ZOOM);
  const x = clamp(t.x, width / 2 - k * width, width / 2);
  const y = clamp(t.y, height / 2 - k * height, height / 2);
  return { k, x, y };
}

/**
 * Zooms by `factor` about the screen point `[px, py]`, so the spot under the
 * pointer stays under the pointer.
 */
export function zoomAt(t, factor, [px, py], width, height) {
  const k = clamp(t.k * factor, MIN_ZOOM, MAX_ZOOM);
  const ratio = k / t.k;
  return constrain({ k, x: px - (px - t.x) * ratio, y: py - (py - t.y) * ratio }, width, height);
}

/** Moves the map by a screen-space drag of `(dx, dy)`. */
export function panBy(t, dx, dy, width, height) {
  return constrain({ k: t.k, x: t.x + dx, y: t.y + dy }, width, height);
}

/**
 * Wheel delta → zoom factor. Lines and pages are normalised to pixels; the
 * exponential keeps trackpads (many small deltas) and wheels (few big ones)
 * feeling alike.
 */
export function wheelFactor(deltaY, deltaMode = 0) {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1);
  return Math.exp(-clamp(pixels, -200, 200) * 0.002);
}

/** Applies a view transform to a fitted d3 projection, in place. */
export function applyTransform(projection, t) {
  if (isIdentity(t)) return projection;
  const [tx, ty] = projection.translate();
  return projection.scale(projection.scale() * t.k).translate([tx * t.k + t.x, ty * t.k + t.y]);
}
