import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Markdown } from '../lib/markdown';
import { type PublicLegalPage, publicSiteApi } from './api';

/** /terms, /terms-of-use, /privacy on a host's booking site. Host text is Markdown, rendered as safe elements (no raw HTML). */
export function LegalPage({ slug, docKey }: { slug: string; docKey: string }) {
  const [page, setPage] = useState<PublicLegalPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Each legal route renders its own LegalPage, so state starts fresh per page.
    let cancelled = false;
    publicSiteApi
      .legal(slug, docKey)
      .then((p) => {
        if (!cancelled) setPage(p);
      })
      .catch(() => {
        if (!cancelled) setError('This page is not available.');
      });
    return () => {
      cancelled = true;
    };
  }, [slug, docKey]);

  if (error) {
    return (
      <div className="site-empty">
        <p>{error}</p>
        <Link to="/" className="site-btn site-btn--ghost">
          ← Back to all stays
        </Link>
      </div>
    );
  }
  if (!page) {
    return (
      <div className="site-loading" role="status">
        <span className="site-spinner" aria-hidden="true" />
        Loading…
      </div>
    );
  }
  return (
    <article className="site-legal">
      <Link to="/" className="site-back-link">
        ← All stays
      </Link>
      <h1>{page.title}</h1>
      {page.updatedAt ? (
        <p className="site-muted">Last updated {new Date(page.updatedAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      ) : null}
      <Markdown text={page.text} className="site-legal__text md" />
    </article>
  );
}
