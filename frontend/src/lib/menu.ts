/** Pure parts of the "More" menu (components/MoreMenu): keyboard movement and placement. */

/**
 * The item focus moves to with an arrow key: the next enabled one in `step`'s direction,
 * wrapping at the ends. From -1 (nothing focused) it starts at the first or last item.
 * Returns -1 when nothing is enabled.
 */
export function nextEnabled(disabled: readonly boolean[], current: number, step: 1 | -1): number {
  const n = disabled.length;
  if (n === 0) return -1;
  let i = current < 0 ? (step === 1 ? -1 : n) : current;
  for (let tries = 0; tries < n; tries += 1) {
    i = (i + step + n) % n;
    if (!disabled[i]) return i;
  }
  return -1;
}

const GAP = 4;
const EDGE = 8;

/**
 * Where to put the menu (fixed position): under the button with right edges aligned, above
 * it when it wouldn't fit below, and never closer than 8px to the screen edge.
 */
export function menuPosition(
  trigger: { top: number; bottom: number; left: number; right: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const below = trigger.bottom + GAP;
  const fitsBelow = below + menu.height <= viewport.height - EDGE;
  const top = fitsBelow ? below : Math.max(EDGE, trigger.top - GAP - menu.height);
  const left = Math.min(
    Math.max(EDGE, trigger.right - menu.width),
    Math.max(EDGE, viewport.width - EDGE - menu.width),
  );
  return { top, left };
}

/**
 * Whether a key event's target is inside an open menu. Dialogs (which listen in the capture
 * phase) leave Escape and Tab to the menu then, so Escape closes the menu, not the drawer
 * it was opened from.
 */
export function inOpenMenu(target: unknown): boolean {
  const closest = (target as { closest?: unknown } | null)?.closest;
  if (typeof closest !== 'function') return false;
  return Boolean((closest as (selector: string) => unknown).call(target, '[role="menu"]'));
}
