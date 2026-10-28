import type { ReactNode } from 'react';

/** A label, the control, and its hint or error underneath — for the auth screens. */
export function AuthField({
  id, label, error, hint, children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={`au__field ${error ? 'is-bad' : ''}`}>
      <div className="au__labelrow"><label htmlFor={id}>{label}</label></div>
      {children}
      {error ? <p className="au__fielderr">{error}</p> : hint ? <p className="au__hint">{hint}</p> : null}
    </div>
  );
}
