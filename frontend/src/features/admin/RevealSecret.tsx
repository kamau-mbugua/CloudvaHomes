import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useToast } from '../../lib/useToast';
import { unwrap } from '../payments/rules';
import { Field } from '../portfolio/ui';
import { platformErrorMessage } from '../platform/api';
import type { PlatformEmailSecret } from '../platform/types';
import { revealReasonError } from './emailLog';

/**
 * The form that reveals a code, link or password hidden in a logged email or SMS. The reason
 * is required and goes to the audit log; the value lives only in this component.
 */
export function RevealSecret({ path, label, what }: { path: string; label: string; what: 'email' | 'SMS' }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [general, setGeneral] = useState<string | null>(null);

  const reveal = useMutation({
    mutationFn: async (body: { reason: string }) =>
      unwrap<PlatformEmailSecret>(
        await api.post<unknown>(path, body),
      ),
    onError: (e) => setGeneral(platformErrorMessage(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const problem = revealReasonError(reason);
    setError(problem);
    if (!problem) reveal.mutate({ reason: reason.trim() });
  };

  const copy = async () => {
    if (!reveal.data) return;
    try {
      await navigator.clipboard.writeText(reveal.data.secret);
      toast.saved(`${reveal.data.label} copied.`);
    } catch {
      toast.failed('Couldn’t copy. Select it and copy it by hand.');
    }
  };

  if (reveal.data) {
    return (
      <section className="ad__secret" aria-label={reveal.data.label}>
        <span className="ad__sub">{reveal.data.label}</span>
        <div className="ad__secretrow">
          <code className="ad__secretvalue">{reveal.data.secret}</code>
          <button type="button" className="nx-btn nx-btn--sm" onClick={copy}>Copy</button>
        </div>
        <p className="ad__sub">
          Your reason was recorded in the audit log. Share it only with the person it was sent to, after checking it is them.
        </p>
      </section>
    );
  }

  return (
    <form className="ad__secret" onSubmit={submit} noValidate>
      <p>
        The {label.toLowerCase()} in this {what} is hidden. To see it, say why — your name and reason are
        recorded in the audit log.
      </p>
      <Field id="el-reason" label="Reason" error={error ?? undefined}>
        <textarea
          id="el-reason"
          rows={2}
          maxLength={500}
          value={reason}
          aria-invalid={Boolean(error)}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      <div>
        <button type="submit" className="nx-btn" disabled={reveal.isPending}>
          {reveal.isPending ? 'Revealing…' : `Reveal ${label.toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}
