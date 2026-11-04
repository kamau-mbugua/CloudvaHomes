import { describe, expect, it } from 'vitest';
import { inOpenMenu, menuPosition, nextEnabled } from './menu';

describe('nextEnabled', () => {
  const disabled = [false, true, false, false];

  it('moves down and up, skipping disabled items', () => {
    expect(nextEnabled(disabled, 0, 1)).toBe(2);
    expect(nextEnabled(disabled, 2, -1)).toBe(0);
  });

  it('wraps around the ends', () => {
    expect(nextEnabled(disabled, 3, 1)).toBe(0);
    expect(nextEnabled(disabled, 0, -1)).toBe(3);
  });

  it('starts from the first or last item when nothing is focused', () => {
    expect(nextEnabled(disabled, -1, 1)).toBe(0);
    expect(nextEnabled(disabled, -1, -1)).toBe(3);
  });

  it('returns -1 when every item is disabled', () => {
    expect(nextEnabled([true, true], 0, 1)).toBe(-1);
  });
});

describe('menuPosition', () => {
  const viewport = { width: 390, height: 844 };
  const menu = { width: 220, height: 200 };

  it('opens below the button, right edges aligned', () => {
    expect(menuPosition({ top: 100, bottom: 136, left: 300, right: 370 }, menu, viewport))
      .toEqual({ top: 140, left: 150 });
  });

  it('opens above when there is no room below', () => {
    expect(menuPosition({ top: 700, bottom: 736, left: 300, right: 370 }, menu, viewport))
      .toEqual({ top: 496, left: 150 });
  });

  it('stays 8px inside the left edge', () => {
    expect(menuPosition({ top: 100, bottom: 136, left: 10, right: 80 }, menu, viewport).left).toBe(8);
  });
});

describe('inOpenMenu', () => {
  const el = (insideMenu: boolean) => ({ closest: (sel: string) => (sel === '[role="menu"]' && insideMenu ? {} : null) });

  it('is true for a key pressed on a menu item, so dialogs around it leave Escape and Tab alone', () => {
    expect(inOpenMenu(el(true))).toBe(true);
  });

  it('is false elsewhere, and for targets that are not elements', () => {
    expect(inOpenMenu(el(false))).toBe(false);
    expect(inOpenMenu(null)).toBe(false);
    expect(inOpenMenu({})).toBe(false);
  });
});
