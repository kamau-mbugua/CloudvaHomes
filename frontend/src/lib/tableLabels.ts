/**
 * Phone layout for data tables. Under 640px (styles/admin.css) every `.ad__table` row turns
 * into a card and each cell shows its column name from `data-label`. The labels are copied
 * from the table's header here, once for every table in the document — including tables in
 * sheets and drawers — so pages keep writing plain `<table className="ad__table">`.
 *
 * React leaves attributes it didn't set alone, so stamping `data-label` is safe.
 */

const span = (n: number) => (Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1);

/** One label per column, header colSpans expanded. */
export function cellLabels(headers: { text: string; colSpan: number }[]): string[] {
  return headers.flatMap((h) => Array.from({ length: span(h.colSpan) }, () => h.text.trim()));
}

/**
 * Labels for the cells of one row, given the column labels and each cell's colSpan. A cell
 * spanning several columns (an empty-state row, a "Total" label) gets none.
 */
export function rowLabels(columns: string[], cellSpans: number[]): string[] {
  let col = 0;
  return cellSpans.map((n) => {
    const width = span(n);
    const label = width === 1 ? (columns[col] ?? '') : '';
    col += width;
    return label;
  });
}

function headerText(th: HTMLTableCellElement): string {
  if (th.classList.contains('ad__rowactions')) return '';
  return th.dataset.label ?? th.textContent ?? '';
}

function stampTable(table: HTMLTableElement): void {
  const head = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!head) return;
  const columns = cellLabels(
    Array.from(head.cells).map((th) => ({ text: headerText(th as HTMLTableCellElement), colSpan: th.colSpan })),
  );
  const rows = [...Array.from(table.tBodies).flatMap((b) => Array.from(b.rows)), ...Array.from(table.tFoot?.rows ?? [])];
  for (const row of rows) {
    const cells = Array.from(row.cells);
    const labels = rowLabels(columns, cells.map((c) => c.colSpan));
    cells.forEach((cell, i) => {
      const label = labels[i] ?? '';
      if (label) {
        if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
      } else if (cell.hasAttribute('data-label')) {
        cell.removeAttribute('data-label');
      }
    });
  }
}

/**
 * Keeps `data-label` on every `.ad__table` cell under `root` up to date as React renders.
 * Batched to one pass per animation frame. Returns a function that stops watching.
 */
export function installTableLabels(root: HTMLElement): () => void {
  let queued = false;
  const run = () => {
    queued = false;
    root.querySelectorAll<HTMLTableElement>('table.ad__table').forEach(stampTable);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  // Only structure changes matter; our own attribute writes don't retrigger it.
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  schedule();
  return () => observer.disconnect();
}
