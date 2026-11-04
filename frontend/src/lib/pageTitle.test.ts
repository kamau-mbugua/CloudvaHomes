import { describe, expect, it } from 'vitest';
import { composeTitle, createTitleStack } from './pageTitle';

describe('composeTitle', () => {
  it('prefers the page’s own title over the menu title', () => {
    expect(composeTitle('Achieng Otieno', 'Tenants')).toBe('Achieng Otieno · KodiHub');
    expect(composeTitle(null, 'Tenants')).toBe('Tenants · KodiHub');
  });
});

describe('createTitleStack', () => {
  it('shows the newest title and falls back when it is removed', () => {
    const stack = createTitleStack();
    expect(stack.current()).toBeNull();
    const a = stack.push('Kilimani Court');
    const b = stack.push('Achieng Otieno');
    expect(stack.current()).toBe('Achieng Otieno');
    stack.remove(b);
    expect(stack.current()).toBe('Kilimani Court');
    stack.remove(a);
    expect(stack.current()).toBeNull();
  });

  it('updates an entry in place and tells subscribers', () => {
    const stack = createTitleStack();
    let calls = 0;
    const off = stack.subscribe(() => { calls += 1; });
    const id = stack.push('Loading');
    stack.update(id, 'INV-2026-000004');
    expect(stack.current()).toBe('INV-2026-000004');
    expect(calls).toBe(2);
    off();
    stack.remove(id);
    expect(calls).toBe(2);
  });
});
