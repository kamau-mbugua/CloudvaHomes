/**
 * The role editor's checkbox logic, kept pure so it is tested without a DOM.
 */

export type GroupState = 'all' | 'some' | 'none';

/** Whether a group's checkbox is ticked, empty, or in between. */
export function groupState(selected: ReadonlySet<string>, keys: readonly string[]): GroupState {
  const on = keys.filter((key) => selected.has(key)).length;
  if (on === 0) return 'none';
  return on === keys.length ? 'all' : 'some';
}

/**
 * "Select all in group": ticks every key unless all are already ticked, in which case it
 * clears them. Returns a new set; keys outside the group are untouched.
 */
export function toggleGroup(selected: ReadonlySet<string>, keys: readonly string[]): Set<string> {
  const next = new Set(selected);
  const clear = groupState(selected, keys) === 'all';
  for (const key of keys) {
    if (clear) next.delete(key);
    else next.add(key);
  }
  return next;
}

export function toggleOne(selected: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** Same members, regardless of order — decides whether a save changes permissions (step-up). */
export function samePermissions(a: Iterable<string>, b: Iterable<string>): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) return false;
  for (const key of left) if (!right.has(key)) return false;
  return true;
}
