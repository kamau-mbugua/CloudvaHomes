import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Page titles in the browser tab. The shell titles every page from the menu ("Tenants");
 * a detail page names the thing shown ("Achieng Otieno") with `useDocumentTitle`. Titles are
 * a stack, so a drawer opened over a list names itself and the list's title comes back when
 * it closes. The shell reads the stack, so parent and child effects never race.
 */

export function composeTitle(override: string | null, shell: string): string {
  return `${override ?? shell} · KodiHub`;
}

export function createTitleStack() {
  let entries: { id: number; title: string }[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    current: (): string | null => entries.at(-1)?.title ?? null,
    push(title: string): number {
      const id = nextId++;
      entries = [...entries, { id, title }];
      emit();
      return id;
    },
    update(id: number, title: string) {
      entries = entries.map((e) => (e.id === id ? { ...e, title } : e));
      emit();
    },
    remove(id: number) {
      entries = entries.filter((e) => e.id !== id);
      emit();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const titles = createTitleStack();

/** Names the page in the tab while mounted; undefined (still loading) leaves the menu title. */
export function useDocumentTitle(title: string | undefined): void {
  const id = useRef<number | null>(null);
  useEffect(() => {
    if (!title) return undefined;
    if (id.current === null) id.current = titles.push(title);
    else titles.update(id.current, title);
    return undefined;
  }, [title]);
  useEffect(() => () => {
    if (id.current !== null) titles.remove(id.current);
    id.current = null;
  }, []);
}

/** For the shells: the newest page title, or null for "use the menu title". */
export function usePageTitleOverride(): string | null {
  return useSyncExternalStore(titles.subscribe, titles.current, titles.current);
}
