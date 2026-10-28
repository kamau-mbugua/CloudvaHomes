import type { PageMeta } from '../lib/api/types';

/** Previous / "Page 2 of 7" / Next, under a list. Hidden when everything fits on one page. */
export function Pager({ meta, onPage }: { meta: PageMeta | undefined; onPage: (page: number) => void }) {
  if (!meta || meta.pages <= 1) return null;

  return (
    <nav className="ad__pager" aria-label="Pages">
      <button type="button" className="nx-btn nx-btn--sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        Previous
      </button>
      <span className="ad__muted">
        Page <span className="num">{meta.page}</span> of <span className="num">{meta.pages}</span>
        {' · '}
        <span className="num">{meta.total}</span> in all
      </span>
      <button type="button" className="nx-btn nx-btn--sm" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>
        Next
      </button>
    </nav>
  );
}
