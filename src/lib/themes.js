// Colour themes. Pure data: the palettes themselves live in `styles/tokens.css`
// under `[data-theme]`; this is the list the settings panel offers and the
// rule for reading a stored choice back.

export const THEMES = [
  { id: 'ember', name: 'Ember', description: 'Warm amber on dark brown' },
  { id: 'harbor', name: 'Harbor', description: 'Sky blue on deep navy' },
  { id: 'steel', name: 'Steel', description: 'Periwinkle on blue-grey' },
  { id: 'slate', name: 'Slate', description: 'Silver on charcoal grey' },
  { id: 'fjord', name: 'Fjord', description: 'Sea green on blue-grey' },
];

export const DEFAULT_THEME = 'ember';

/** A known theme id, or the default for anything else (old or corrupt settings). */
export function resolveTheme(id) {
  return THEMES.some((theme) => theme.id === id) ? id : DEFAULT_THEME;
}
