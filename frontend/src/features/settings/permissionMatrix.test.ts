import { describe, expect, it } from 'vitest';
import { groupState, samePermissions, toggleGroup, toggleOne } from './permissionMatrix';

const users = ['users:view', 'users:create', 'users:update'];

describe('groupState', () => {
  it('is none, some or all', () => {
    expect(groupState(new Set(), users)).toBe('none');
    expect(groupState(new Set(['users:view']), users)).toBe('some');
    expect(groupState(new Set(users), users)).toBe('all');
  });
});

describe('toggleGroup', () => {
  it('selects the whole group from none or some, leaving other groups alone', () => {
    const next = toggleGroup(new Set(['users:view', 'roles:view']), users);
    expect([...next].sort()).toEqual(['roles:view', 'users:create', 'users:update', 'users:view']);
  });

  it('clears the group when all were selected', () => {
    expect([...toggleGroup(new Set([...users, 'roles:view']), users)]).toEqual(['roles:view']);
  });

  it('does not mutate its input', () => {
    const before = new Set(['users:view']);
    toggleGroup(before, users);
    expect([...before]).toEqual(['users:view']);
  });
});

describe('toggleOne / samePermissions', () => {
  it('flips one key', () => {
    expect(toggleOne(new Set(['a']), 'a').size).toBe(0);
    expect(toggleOne(new Set(), 'a').has('a')).toBe(true);
  });

  it('compares as sets', () => {
    expect(samePermissions(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(samePermissions(['a'], ['a', 'b'])).toBe(false);
    expect(samePermissions(['a', 'c'], ['a', 'b'])).toBe(false);
  });
});
