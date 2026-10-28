import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchDestinations } from './navigation';
import type { Destination } from './navigation';
import { DialogBehaviour } from '../components/DialogBehaviour';

/**
 * "Jump to a page" — ⌘K / Ctrl+K. Ported from pos-react's CommandPalette.
 *
 * Phase 0 searches screens only, matched locally from the navigation model. Record search
 * (tenants, units, invoices) arrives once those exist; pos-react's debounced server query
 * is the pattern to follow then.
 */

export function CommandPalette({
  pages,
  onClose,
}: {
  /** Every page this person may open (already permission-filtered). */
  pages: Destination[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  // Keyed by the result set, so the highlight returns to the top whenever rows change.
  const [selection, setSelection] = useState({ forKey: '', index: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => searchDestinations(pages, term), [pages, term]);

  const rowsKey = rows.map((row) => row.to).join('|');
  const cursor = selection.forKey === rowsKey ? selection.index : 0;
  const setCursor = (index: number) => {
    setSelection({ forKey: rowsKey, index });
    listRef.current
      ?.querySelectorAll<HTMLElement>('.cp__row')[index]
      ?.scrollIntoView({ block: 'nearest' });
  };

  const open = (row: Destination | undefined) => {
    if (!row) return;
    onClose();
    navigate(row.to);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor(Math.min(cursor + 1, rows.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor(Math.max(cursor - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      open(rows[cursor]);
    }
  };

  return (
    <div className="cp" role="dialog" aria-modal="true" aria-label="Jump to a page">
      {/* Escape, focus-in/return and the tab trap; also closes on a backdrop press. */}
      <DialogBehaviour onClose={onClose} />
      <div className="cp__panel">
        <div className="cp__search">
          <input
            className="cp__input"
            placeholder="Jump to a page…"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search pages"
            aria-controls="cp-results"
            aria-activedescendant={rows[cursor] ? `cp-row-${cursor}` : undefined}
          />
          <span className="cp__kbd num">esc</span>
        </div>

        <div className="cp__results" id="cp-results" role="listbox" ref={listRef}>
          {rows.length === 0 ? <p className="cp__empty">Nothing matches “{term}”.</p> : null}

          {rows.map((row, index) => {
            // A heading whenever the group changes, compared with the previous row so the
            // list stays flat and `cursor` stays a valid index.
            const heading = rows[index - 1]?.groupLabel === row.groupLabel ? null : row.groupLabel;

            return (
              <div key={row.to}>
                {heading ? <div className="cp__group">{heading}</div> : null}
                <button
                  type="button"
                  id={`cp-row-${index}`}
                  role="option"
                  aria-selected={index === cursor}
                  tabIndex={-1}
                  className={`cp__row ${index === cursor ? 'is-on' : ''}`}
                  onMouseEnter={() => setSelection({ forKey: rowsKey, index })}
                  onClick={() => open(row)}
                >
                  <span className="cp__label">{row.label}</span>
                  <span className="cp__hint">{row.hint}</span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="cp__foot">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span className="cp__note">⌘K or Ctrl+K from anywhere</span>
        </div>
      </div>
    </div>
  );
}
