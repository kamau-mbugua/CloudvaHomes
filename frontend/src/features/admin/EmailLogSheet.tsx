import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { formatDateTime } from '../../lib/dates';
import { Sheet } from '../../components/Sheet';
import { CardSkeleton } from '../../components/Loading';
import { unwrap } from '../payments/rules';
import { Fact } from '../portfolio/ui';
import { keys, platformErrorMessage } from '../platform/api';
import type { PlatformEmailLog, PlatformEmailLogDetail } from '../platform/types';
import { RevealSecret } from './RevealSecret';

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

        {email?.secret ? (
          <RevealSecret
            path={`/platform/email/logs/${encodeURIComponent(log.id)}/reveal`}
            label={email.secret.label}
            what="email"
          />
        ) : null}
      </div>
    </Sheet>
  );
}
