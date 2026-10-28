import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Hooks the portfolio screens share: list filters in the address, debounced search, form state. */

/**
 * Filters live in the address so a filtered list survives a reload and the back button
 * (as on Settings → Users). Typing in the search box applies after a pause; changing any
 * filter goes back to page 1.
 */
export function useListFilters() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(q);

  const setFilter = (changes: Record<string, string>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!('page' in changes)) next.delete('page');
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    if (search.trim() === q) return undefined;
    const timer = setTimeout(() => setFilter({ q: search.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return {
    params,
    q,
    page,
    search,
    setSearch,
    get: (name: string) => params.get(name) ?? '',
    setFilter,
    /** Clears every filter, keeping only the names in `keep` (e.g. the active tab). */
    clear: (keep: string[] = []) => {
      setSearch('');
      setParams((current) => {
        const next = new URLSearchParams();
        for (const name of keep) {
          const value = current.get(name);
          if (value) next.set(name, value);
        }
        return next;
      }, { replace: true });
    },
  };
}

/** `value`, but only once it has stopped changing for `delay` ms — for search-as-you-type. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/** String values and per-field errors for a sheet's form. */
export function useForm<F extends string>(initial: Record<F, string>) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<F, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);

  return {
    values,
    setValues,
    errors,
    setErrors,
    general,
    setGeneral,
    set: (name: F, value: string) => setValues((v) => ({ ...v, [name]: value })),
  };
}

