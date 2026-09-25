// The map's individual layers, as painting functions over a 2D context.
// `ui/map.js` decides what to draw and in which order; these only draw.
// Colours always arrive as resolved tokens (see `palette`).

import cities from '../data/cities.json';
import { placeCityLabels, box } from '../lib/cities.js';

export const LABEL_FONT = '500 12px "JetBrains Mono", ui-monospace, monospace';
const CITY_FONT = '500 11px "Inter", system-ui, sans-serif';

/** Canvas can't read CSS custom properties, so resolve them once per draw. */
export function palette(element) {
  const style = getComputedStyle(element);
  const token = (name) => style.getPropertyValue(name).trim();
  return {
    bg: token('--bg'),
    ocean: token('--ocean'),
    land: token('--land'),
    graticule: token('--surface-2'),
    accent: token('--accent'),
    accent2: token('--accent-2'),
    muted: token('--muted'),
    text: token('--text'),
  };
}

export function fill(ctx, path, object, colour) {
  ctx.beginPath();
  path(object);
  ctx.fillStyle = colour;
  ctx.fill();
}

export function stroke(ctx, path, object, colour, lineWidth, dash = []) {
  ctx.beginPath();
  path(object);
  ctx.setLineDash(dash);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = colour;
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Space behind the globe in the camera views: the page background, fading to
 * the raised surface tone towards the horizon in Chase, and a thin rim of
 * atmosphere around the globe's edge.
 */
export function drawSky(ctx, path, { width, height, horizonY, colours }) {
  if (horizonY !== undefined && ctx.createLinearGradient) {
    const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizonY));
    sky.addColorStop(0, colours.bg);
    sky.addColorStop(1, colours.graticule);
    ctx.fillStyle = sky;
  } else {
    ctx.fillStyle = colours.bg;
  }
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 0.55;
  stroke(ctx, path, { type: 'Sphere' }, colours.graticule, 8);
  ctx.globalAlpha = 0.5;
  stroke(ctx, path, { type: 'Sphere' }, colours.accent2, 1);
  ctx.restore();
}

/** An airport ring with its IATA code above. Returns the space it took. */
export function drawAirport(ctx, [x, y], iata, colours) {
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = colours.ocean;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = colours.accent;
  ctx.stroke();
  if (!iata) return;
  ctx.font = LABEL_FONT;
  ctx.fillStyle = colours.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(iata, x, y - 9);
}

/** The screen space an airport marker and its code occupy. */
export function airportBox([x, y]) {
  return box(x - 18, y - 24, x + 18, y + 7, 2);
}

/** The plane, nose along `angle` (radians clockwise from up), `size`× scale. */
export function drawPlane(ctx, [x, y], angle, colour, size = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -10 * size); // nose
  ctx.lineTo(9 * size, 7 * size); // starboard wingtip
  ctx.lineTo(0, 3 * size); // tail notch
  ctx.lineTo(-9 * size, 7 * size); // port wingtip
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.restore();
}

export function planeBox([x, y], size = 1) {
  const r = 12 * size;
  return box(x - r, y - r, x + r, y + r, 2);
}

/**
 * Major cities: a small dot and a name, thinned by zoom and never touching
 * each other or anything in `blockers`. Text gets a halo in the ocean tone so
 * it reads over land, sea and graticule on every theme.
 */
export function drawCities(ctx, { project, width, height, blockers, lines, colours }) {
  ctx.font = CITY_FONT;
  const measure = (text) => ctx.measureText?.(text).width ?? text.length * 6.5;
  const labels = placeCityLabels({ cities, project, measure, width, height, blockers, lines });
  if (!labels.length) return labels;

  ctx.fillStyle = colours.muted;
  for (const { x, y } of labels) {
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = colours.ocean;
  for (const { name, y, tx, align } of labels) {
    ctx.textAlign = align;
    ctx.strokeText?.(name, tx, y);
    ctx.fillText(name, tx, y);
  }
  return labels;
}
