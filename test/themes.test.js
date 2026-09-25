// Colour themes: the list, and that every theme defines the full palette.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { THEMES, DEFAULT_THEME, resolveTheme } from '../src/lib/themes.js';
import { DEFAULT_SETTINGS } from '../src/lib/storage.js';

const CSS = readFileSync(resolve(__dirname, '../src/styles/tokens.css'), 'utf8');
const TOKENS = ['--bg', '--surface', '--surface-2', '--land', '--ocean', '--accent', '--accent-2',
  '--accent-hover', '--on-accent', '--text', '--muted', '--danger', '--on-danger'];

/** The declarations inside the block whose selector mentions this theme. */
function block(id) {
  const match = CSS.match(new RegExp(`\\[data-theme="${id}"\\][^{]*\\{([^}]*)\\}`));
  return match ? match[1] : '';
}

describe('themes', () => {
  it('ember is the default, in settings too', () => {
    expect(DEFAULT_THEME).toBe('ember');
    expect(DEFAULT_SETTINGS.theme).toBe('ember');
  });

  it('offers blue and grey options', () => {
    expect(THEMES.map((t) => t.id)).toEqual(expect.arrayContaining(['harbor', 'steel', 'slate']));
  });

  it('unknown ids fall back to the default', () => {
    expect(resolveTheme('harbor')).toBe('harbor');
    expect(resolveTheme('neon')).toBe('ember');
    expect(resolveTheme(undefined)).toBe('ember');
  });

  it('every theme defines every colour token', () => {
    for (const theme of THEMES) {
      const body = block(theme.id);
      for (const token of TOKENS) expect(body, `${theme.id} ${token}`).toMatch(new RegExp(`${token}:\\s*#`));
    }
  });

  it('ember keeps the spec palette', () => {
    const body = block('ember');
    expect(body).toMatch(/--bg: #14100d/);
    expect(body).toMatch(/--accent: #f0a24a/);
  });
});
