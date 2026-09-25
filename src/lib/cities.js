// Which city labels fit on the map, and where. Pure: the caller hands in a
// projection function and a text measurer, and gets back boxes to paint.
//
// Density follows the map's own scale, measured at each city: a city of
// Natural Earth `rank` r is a candidate only once the map shows at least
// RANK_SCALE[r] pixels per kilometre there. Zooming in therefore brings in
// smaller places, and in a perspective view the near ground carries more names
// than the far. Candidates are then placed most important first, and a label
// that would touch anything already placed (or a blocker such as the route's
// airports and the plane) is dropped rather than overlapped. Names also keep
// off the drawn route line (a city's dot may sit on it; its name moves to the
// other side, or is dropped).

/** Minimum map scale (px per km) at which each Natural Earth rank shows. */
export const RANK_SCALE = [0, 0.07, 0.14, 0.3];

/** At most one label per this many square pixels of map. */
export const AREA_PER_LABEL = 22000;

export const LABEL_HEIGHT = 13;
const GAP = 6; // dot to text
const PAD = 3; // clear space kept around every box
const DOT = 3; // dot half-size for collision
const KM_PER_DEGREE = 111.195;

export function minScaleForRank(rank) {
  const r = Number.isFinite(rank) ? Math.max(0, Math.floor(rank)) : RANK_SCALE.length - 1;
  return RANK_SCALE[Math.min(r, RANK_SCALE.length - 1)];
}

/**
 * Local map scale in px/km at `city`: how far a step of 0.5° of latitude
 * moves on screen. Null if either end is not visible.
 */
export function localScale(project, city) {
  const here = project([city.lon, city.lat]);
  const lat = city.lat > 89 ? city.lat - 0.5 : city.lat + 0.5;
  const there = project([city.lon, lat]);
  if (!here || !there) return null;
  return Math.hypot(there[0] - here[0], there[1] - here[1]) / (KM_PER_DEGREE * 0.5);
}

export function overlaps(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** True if segment a→b crosses or touches the box (Liang–Barsky clipping). */
export function segmentHitsBox([ax, ay], [bx, by], b) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const edges = [
    [-dx, ax - b.x0],
    [dx, b.x1 - ax],
    [-dy, ay - b.y0],
    [dy, b.y1 - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** True if any segment of any polyline crosses the box. */
export function linesHitBox(lines, b) {
  return lines.some((line) => line.some((p, i) => i > 0 && segmentHitsBox(line[i - 1], p, b)));
}

/** A rectangle grown by `pad` on every side. */
export function box(x0, y0, x1, y1, pad = 0) {
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

/**
 * Chooses the labels to draw.
 *
 * @param {object} options
 * @param {Array<{name: string, lat: number, lon: number, rank: number}>} options.cities
 *   most important first
 * @param {(lonLat: number[]) => number[] | null} options.project
 *   screen point, or null when the point is hidden (far side, behind camera)
 * @param {(text: string) => number} options.measure  label width in px
 * @param {number} options.width
 * @param {number} options.height
 * @param {Array<{x0,y0,x1,y1}>} [options.blockers]  space already taken
 * @param {number[][][]} [options.lines]  screen polylines names must not cross
 * @returns {Array<{name: string, x: number, y: number, tx: number, align: 'left'|'right'}>}
 */
export function placeCityLabels({ cities, project, measure, width, height, blockers = [], lines = [] }) {
  const limit = Math.max(1, Math.floor((width * height) / AREA_PER_LABEL));
  const taken = [...blockers];
  const placed = [];

  for (const city of cities) {
    if (placed.length >= limit) break;
    const point = project([city.lon, city.lat]);
    if (!point) continue;
    const [x, y] = point;
    if (x < 0 || y < 0 || x > width || y > height) continue;
    const scale = localScale(project, city);
    if (scale === null || scale < minScaleForRank(city.rank)) continue;

    const dot = box(x - DOT, y - DOT, x + DOT, y + DOT, PAD);
    if (taken.some((b) => overlaps(dot, b))) continue;

    const w = measure(city.name);
    const half = LABEL_HEIGHT / 2;
    const options = [
      { align: 'left', tx: x + GAP, text: box(x + GAP, y - half, x + GAP + w, y + half, PAD) },
      { align: 'right', tx: x - GAP, text: box(x - GAP - w, y - half, x - GAP, y + half, PAD) },
    ];
    const fit = options.find(
      ({ text }) =>
        text.x0 >= 0 && text.x1 <= width && text.y0 >= 0 && text.y1 <= height &&
        !taken.some((b) => overlaps(text, b)) &&
        !linesHitBox(lines, text),
    );
    if (!fit) continue;

    taken.push(dot, fit.text);
    placed.push({ name: city.name, x, y, tx: fit.tx, align: fit.align });
  }
  return placed;
}
