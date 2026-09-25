// Keyboard shortcuts as a pure decision: which action, if any, a key event asks
// for. No DOM — the event is read as a plain object — so the rules are
// unit-testable and the UI layer only has to dispatch what it is handed.

/** Text entry swallows every bare keypress: typing "f" into a field is a letter. */
const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Controls the browser already activates with Space; we must not act twice. */
const SPACE_TAGS = new Set(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A', 'SUMMARY']);

/** What the shortcut hint prints. `Esc` is the browser's, not ours. */
export const SHORTCUTS = [
  { key: 'Space', action: 'pause', description: 'Pause / resume' },
  { key: 'F', action: 'fullscreen', description: 'Full screen' },
];

const tagOf = (target) => String(target?.tagName ?? '').toUpperCase();

/** True for anything the user could be typing into. */
export function isTextEntry(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return TEXT_TAGS.has(tagOf(target));
}

/** True for a focused control that responds to Space by itself. */
export function activatesOnSpace(target) {
  if (!target) return false;
  if (SPACE_TAGS.has(tagOf(target))) return true;
  const role = String(target.getAttribute?.('role') ?? '').toLowerCase();
  return role === 'button' || role === 'checkbox' || role === 'option';
}

/**
 * Whether a control that just took focus from a pointer press should give it
 * back. Browsers focus a clicked button, and a focused button both claims
 * `Space` (so it would re-press the button instead of pausing) and holds the
 * HUD open. Keyboard focus (`focusVisible`) is left alone, and so is text
 * entry, where focus is the point of the click.
 *
 * @param {object|null} target the focused element
 * @param {{focusVisible?: boolean}} state
 */
export function releasesPointerFocus(target, { focusVisible = false } = {}) {
  if (!target || focusVisible) return false;
  const slider = String(target.type ?? '').toLowerCase() === 'range';
  if (isTextEntry(target) && !slider) return false;
  return activatesOnSpace(target);
}

/**
 * The action a key event asks for, or `null` for "not a shortcut".
 *
 * Modified keys belong to the browser, held keys would repeat the toggle, and
 * a key aimed at a field or a focused button belongs to that control.
 *
 * @param {{key?: string, code?: string, target?: object, repeat?: boolean,
 *          ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean}} event
 * @returns {'fullscreen'|'pause'|null}
 */
export function resolveShortcut(event) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return null;

  const target = event.target ?? null;
  if (isTextEntry(target)) return null;

  const key = event.key ?? '';
  if (key === 'f' || key === 'F') return 'fullscreen';
  if (key === ' ' || key === 'Spacebar' || event.code === 'Space') {
    return activatesOnSpace(target) ? null : 'pause';
  }
  return null;
}
