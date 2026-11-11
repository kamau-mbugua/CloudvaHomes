import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { CardSkeleton } from '../../components/Loading';
import { unwrap } from '../payments/rules';
import { Fact, Field } from '../portfolio/ui';
import { keys, platformErrorMessage } from '../platform/api';
import type { PlatformEmailLog, PlatformEmailLogDetail, PlatformEmailSecret } from '../platform/types';
import { revealReasonError } from './emailLog';

/**
 * One logged email, as it was sent. A code, invitation link or temporary password in it stays
 * hidden until a superadmin says why they need it; the reason goes to the audit log. The
 * revealed value lives only in this sheet: closing it forgets it.
 */
export function EmailLogSheet({ log, onClose }: { log: PlatformEmailLog; onClose: () => void }) {
  const detail = useQuery({
    queryKey: [...keys.emailLogs, 'detail', log.id],
    queryFn: async () =>
      unwrap<PlatformEmailLogDetail>(await api.get<unknown>(`/platform/email/logs/${encodeURIComponent(log.id)}`)),
  });
  const email = detail.data;

  return (
    <Sheet
      title={log.subject}
      wide
      onClose={onClose}
      footer={<button type="button" className="nx-btn nx-btn--primary" onClick={onClose}>Done</button>}
    >
      <div className="sheet-form">
        <dl className="pf__facts">
          <Fact label="To">{log.to ?? log.recipient}</Fact>
          <Fact label="Sent">{formatDateTime(log.createdAt)}</Fact>
          <Fact label="Template"><span className="num">{log.kind ?? log.template ?? '—'}</span></Fact>
          <Fact label="Status">
            <span className={`ad__badge ${log.status === 'SENT' ? 'ad__badge--ok' : 'ad__badge--warn'}`}>
              {log.status === 'SENT' ? 'Sent' : 'Failed'}
            </span>
            {log.error ? <span className="ad__sub ad__owed">{log.error}</span> : null}
          </Fact>
        </dl>

        {detail.isPending ? <CardSkeleton /> : null}
        {detail.isError ? <p className="ad__error" role="alert">{platformErrorMessage(detail.error)}</p> : null}

        {email ? (
          email.text === null ? (
            <p className="ad__sub">
              This email was sent before KodiHub kept what emails said, so only the details above were recorded.
            </p>
          ) : (
            <pre className="ad__emailbody" aria-label="Email text">{email.text}</pre>
          )
        ) : null}

        {email?.secret ? <RevealSecret logId={log.id} secret={email.secret} /> : null}
      </div>
    </Sheet>
  );
}

function RevealSecret({ logId, secret }: { logId: string; secret: { label: string } }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [general, setGeneral] = useState<string | null>(null);

  const reveal = useMutation({
    mutationFn: async (body: { reason: string }) =>
      unwrap<PlatformEmailSecret>(
        await api.post<unknown>(`/platform/email/logs/${encodeURIComponent(logId)}/reveal`, body),
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
        The {secret.label.toLowerCase()} in this email is hidden. To see it, say why — your name and reason are
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
          {reveal.isPending ? 'Revealing…' : `Reveal ${secret.label.toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}
