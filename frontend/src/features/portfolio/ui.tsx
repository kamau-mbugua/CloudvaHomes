import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { labelFor } from './labels';
import type { Label } from './labels';
import { portfolioErrorMessage } from './api';

/**
 * Small components every portfolio screen shares: a labelled field, a status badge,
 * breadcrumbs, record facts, checkbox lists and the masked-ID reveal. Hooks are in
 * hooks.ts and form value helpers in forms.ts.
 */

// ---------------------------------------------------------------- forms

/** A labelled control with its error (or hint) below. Pass the control as `children`. */
export function Field({
  id,
  label,
  error,
  hint,
  wide = false,
  optional = false,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  wide?: boolean;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`fld ${wide ? 'fm__wide' : ''} ${error ? 'is-bad' : ''}`}>
      <label htmlFor={id}>
        {label}
        {optional ? <span className="nx-muted"> (optional)</span> : null}
      </label>
      {children}
      {error ? <span className="fld__err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------- display

export function Badge({ table, value }: { table: Record<string, Label>; value: string }) {
  const { label, tone } = labelFor(table, value);
  return <span className={`ad__badge ${tone}`}>{label}</span>;
}

export function Breadcrumbs({ trail }: { trail: { label: string; to?: string }[] }) {
  return (
    <nav className="bc" aria-label="Breadcrumb">
      <ol>
        {trail.map((crumb, i) => (
          <li key={`${crumb.label}-${i}`} aria-current={crumb.to ? undefined : 'page'}>
            {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A labelled fact on a record page; empty values show a dash. */
export function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={wide ? 'pf__wide' : undefined}>
      <dt>{label}</dt>
      <dd>{empty ? <span className="nx-muted">—</span> : children}</dd>
    </div>
  );
}

/** Ticks for a set of ids — unit features, properties a member is limited to. */
export function CheckList({
  name,
  options,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  options: { id: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const on = new Set(value);
  return (
    <div className="pf__checks" role="group" aria-label={name}>
      {options.map((option) => (
        <label key={option.id} className="fld__check">
          <input
            type="checkbox"
            checked={on.has(option.id)}
            disabled={disabled}
            onChange={() => onChange(on.has(option.id) ? value.filter((id) => id !== option.id) : [...value, option.id])}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/**
 * A masked ID number with a "Show" button. The full number is fetched only on request
 * (the server audits each reveal), kept in this component's state only — never in the
 * query cache — and dropped on "Hide" or when the page is left.
 */
export function RevealId({ masked, load }: { masked: string | null; load: () => Promise<string> }) {
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!masked) return <span className="nx-muted">Not on file</span>;

  const reveal = async () => {
    setBusy(true);
    setError(null);
    try {
      setShown(await load());
    } catch (caught) {
      setError(portfolioErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="pf__reveal">
      <span className="num">{shown ?? masked}</span>
      {shown ? (
        <button type="button" className="nx-btn" onClick={() => setShown(null)}>Hide</button>
      ) : (
        <button type="button" className="nx-btn" onClick={reveal} disabled={busy} title="Viewing the full number is recorded in the audit log">
          {busy ? 'Loading…' : 'Show'}
        </button>
      )}
      {error ? <span className="fld__err" role="alert">{error}</span> : null}
    </span>
  );
}
