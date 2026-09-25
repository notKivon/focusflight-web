// The keyboard rules: F is full screen, Space pauses, and neither of them
// steals a key that belongs to a field, a focused button or the browser.

import { describe, it, expect } from 'vitest';
import {
  resolveShortcut,
  isTextEntry,
  activatesOnSpace,
  releasesPointerFocus,
  SHORTCUTS,
} from '../src/lib/shortcuts.js';

/** A key event as the DOM would hand it over, with a plain-object target. */
const key = (over = {}) => ({ key: 'f', target: { tagName: 'BODY' }, ...over });

const el = (tagName, attrs = {}) => ({
  tagName,
  isContentEditable: false,
  getAttribute: (name) => attrs[name] ?? null,
  ...attrs,
});

describe('resolveShortcut', () => {
  it('maps F and Space to their actions, either case', () => {
    expect(resolveShortcut(key({ key: 'f' }))).toBe('fullscreen');
    expect(resolveShortcut(key({ key: 'F' }))).toBe('fullscreen');
    expect(resolveShortcut(key({ key: ' ' }))).toBe('pause');
    expect(resolveShortcut(key({ key: 'Spacebar' }))).toBe('pause');
    expect(resolveShortcut(key({ key: 'Unidentified', code: 'Space' }))).toBe('pause');
  });

  it('ignores every other key', () => {
    for (const k of ['g', 'Enter', 'Escape', 'ArrowLeft', 'p']) {
      expect(resolveShortcut(key({ key: k }))).toBe(null);
    }
  });

  it('leaves modified keys to the browser', () => {
    expect(resolveShortcut(key({ ctrlKey: true }))).toBe(null);
    expect(resolveShortcut(key({ metaKey: true }))).toBe(null); // ⌘F is Find
    expect(resolveShortcut(key({ altKey: true }))).toBe(null);
  });

  it('does not repeat while a key is held down', () => {
    expect(resolveShortcut(key({ key: ' ', repeat: true }))).toBe(null);
    expect(resolveShortcut(key({ key: 'f', repeat: true }))).toBe(null);
  });

  it('keeps out of text entry — typing "f" into an airport field is a letter', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(resolveShortcut(key({ target: el(tag) }))).toBe(null);
      expect(resolveShortcut(key({ key: ' ', target: el(tag) }))).toBe(null);
    }
    expect(resolveShortcut(key({ target: el('DIV', { isContentEditable: true }) }))).toBe(null);
  });

  it('lets a focused control keep Space, but not F', () => {
    const button = el('BUTTON');
    expect(resolveShortcut(key({ key: ' ', target: button }))).toBe(null);
    expect(resolveShortcut(key({ key: 'f', target: button }))).toBe('fullscreen');

    const chip = el('SPAN', { role: 'button' });
    expect(resolveShortcut(key({ key: ' ', target: chip }))).toBe(null);
  });

  it('survives a missing event or target', () => {
    expect(resolveShortcut(null)).toBe(null);
    expect(resolveShortcut({ key: 'f' })).toBe('fullscreen');
  });
});

describe('target predicates', () => {
  it('reads tag names case-insensitively', () => {
    expect(isTextEntry({ tagName: 'input' })).toBe(true);
    expect(activatesOnSpace({ tagName: 'button' })).toBe(true);
    expect(isTextEntry({ tagName: 'div' })).toBe(false);
    expect(activatesOnSpace(null)).toBe(false);
  });
});

describe('releasesPointerFocus', () => {
  it('releases a button focused by a click', () => {
    expect(releasesPointerFocus({ tagName: 'BUTTON' })).toBe(true);
    expect(releasesPointerFocus({ tagName: 'DIV', getAttribute: () => 'button' })).toBe(true);
  });

  it('releases the speed slider after a drag', () => {
    expect(releasesPointerFocus({ tagName: 'INPUT', type: 'range' })).toBe(true);
  });

  it('keeps keyboard focus, so tabbing still works and still holds the HUD', () => {
    expect(releasesPointerFocus({ tagName: 'BUTTON' }, { focusVisible: true })).toBe(false);
  });

  it('keeps focus in text fields, where focus is the point of the click', () => {
    expect(releasesPointerFocus({ tagName: 'INPUT', type: 'text' })).toBe(false);
    expect(releasesPointerFocus({ tagName: 'TEXTAREA' })).toBe(false);
  });

  it('ignores nothing-in-particular', () => {
    expect(releasesPointerFocus(null)).toBe(false);
    expect(releasesPointerFocus({ tagName: 'BODY' })).toBe(false);
  });

  it('covers exactly the controls that would swallow Space', () => {
    // A released control is one resolveShortcut would otherwise defer to.
    const button = { tagName: 'BUTTON' };
    expect(resolveShortcut(key({ key: ' ', target: button }))).toBeNull();
    expect(releasesPointerFocus(button)).toBe(true);
  });
});

describe('SHORTCUTS', () => {
  it('describes exactly what resolveShortcut does', () => {
    expect(SHORTCUTS.map((s) => s.action)).toEqual(['pause', 'fullscreen']);
    for (const { key: label, action } of SHORTCUTS) {
      const event = key({ key: label === 'Space' ? ' ' : label });
      expect(resolveShortcut(event)).toBe(action);
    }
  });
});
