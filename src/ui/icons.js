// Inline SVG icons for the icon buttons. One stroke weight and one 24-unit
// grid, so every glyph sits dead centre and reads at the same weight — text
// glyphs (⤢ ⚙ ⌖) vary by font and never centre reliably. Colour follows the
// button's `color`; size comes from `.icon` in controls.css.

const PATHS = {
  // ⇄ swap departure and arrival
  swap: '<path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/>',
  // enter full screen: four corners pointing out
  expand: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  // exit full screen: four corners pointing in
  collapse: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
  // settings: three sliders
  sliders:
    '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/>' +
    '<circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  // reset the map view: a crosshair
  recenter:
    '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>' +
    '<circle cx="12" cy="12" r="1.25" fill="currentColor"/>',
};

/** The SVG markup for `name`, decorative (the button carries the label). */
export function icon(name) {
  const body = PATHS[name];
  if (!body) throw new Error(`Unknown icon: ${name}`);
  return (
    `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" ` +
    `stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  );
}

export const ICON_NAMES = Object.keys(PATHS);
