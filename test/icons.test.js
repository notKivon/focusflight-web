import { describe, expect, it } from 'vitest';
import { icon, ICON_NAMES } from '../src/ui/icons.js';

describe('icons', () => {
  it.each(ICON_NAMES)('%s is a decorative 24-unit stroke icon', (name) => {
    const svg = icon(name);
    expect(svg).toMatch(/^<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"/);
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('stroke-width="1.75"');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('covers every icon button', () => {
    expect(ICON_NAMES).toEqual(expect.arrayContaining(['swap', 'expand', 'collapse', 'sliders', 'recenter']));
  });

  it('throws on an unknown name rather than rendering an empty button', () => {
    expect(() => icon('nope')).toThrow(/Unknown icon/);
  });
});
