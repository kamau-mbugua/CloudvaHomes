import { nextSort, parseSort } from '../lib/sort';

/** A list's sort state as the table needs it: the URL value and how to change it. */
export interface TableSort {
  /** The current `?sort=` value, e.g. `-balance`. */
  value: string;
  /** Fields this list can sort by (the API's allowed fields). */
  fields: readonly string[];
  /** Used when `value` is empty or unknown, e.g. `-issueDate`. */
  fallback: string;
  onChange: (next: string) => void;
}

/**
 * A column header that sorts the list. Clicking flips the direction of the current column,
 * or switches to this column (money columns start largest-first). `aria-sort` tells screen
 * readers which column is sorted and how.
 */
export function SortHeader({
  field,
  label,
  sort,
  className,
}: {
  field: string;
  label: string;
  sort: TableSort;
  className?: string;
}) {
  const current = parseSort(sort.value, sort.fields, sort.fallback);
  const active = current.field === field;
  const ariaSort = active ? (current.desc ? 'descending' : 'ascending') : 'none';
  const currentValue = `${current.desc ? '-' : ''}${current.field}`;
  return (
    <th className={className} aria-sort={ariaSort} data-label={label}>
      <button
        type="button"
        className={`sorth${active ? ' is-on' : ''}`}
        onClick={() => sort.onChange(nextSort(currentValue, field))}
      >
        {label}
        <span className="sorth__arrow" aria-hidden="true">{active ? (current.desc ? '↓' : '↑') : '↕'}</span>
      </button>
    </th>
  );
}
