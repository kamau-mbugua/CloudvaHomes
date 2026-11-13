import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { formatDateTime } from '../../lib/dates';
import { Sheet } from '../../components/Sheet';
import { CardSkeleton } from '../../components/Loading';
import { unwrap } from '../payments/rules';
import { Fact } from '../portfolio/ui';
import { keys, platformErrorMessage } from '../platform/api';
import { PROVIDER_LABEL } from '../sms/rules';
import { RevealSecret } from './RevealSecret';
import { ROUTE_LABEL, smsStatus, smsTypeLabel, type SmsLogDetail } from './smsLog';

/**
 * One SMS as KodiHub sent it: who to, through which provider, the result and the text. A code,
 * invitation link or temporary password in it stays hidden until a superadmin gives a reason.
 */
export function SmsLogSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useQuery({
    queryKey: [...keys.platform, 'sms-logs', 'detail', id],
    queryFn: async () =>
      unwrap<SmsLogDetail>(await api.get<unknown>(`/platform/sms/logs/${encodeURIComponent(id)}`)),
  });
  const sms = detail.data;
  const status = sms ? smsStatus(sms.status) : null;

  return (
    <Sheet
      title={sms ? smsTypeLabel(sms.type) : 'SMS'}
      wide
      onClose={onClose}
      footer={<button type="button" className="nx-btn nx-btn--primary" onClick={onClose}>Done</button>}
    >
      <div className="sheet-form">
        {detail.isPending ? <CardSkeleton /> : null}
        {detail.isError ? <p className="ad__error" role="alert">{platformErrorMessage(detail.error)}</p> : null}
        {sms && status ? (
          <>
            <dl className="pf__facts">
              <Fact label="To"><span className="num">{sms.to}</span></Fact>
              <Fact label="When">{formatDateTime(sms.at)}</Fact>
              <Fact label="From">{sms.organization ? sms.organization.name : 'KodiHub'}</Fact>
              <Fact label="Status">
                <span className={`ad__badge ad__badge--${status.tone}`}>{status.label}</span>
                {sms.reason ? <span className="ad__sub ad__owed">{sms.reason}</span> : null}
              </Fact>
              <Fact label="Sent through">
                {sms.provider ? PROVIDER_LABEL[sms.provider] : '—'}
                {sms.route ? <span className="ad__sub">{ROUTE_LABEL[sms.route]}</span> : null}
              </Fact>
              <Fact label="Units">{sms.units}</Fact>
              {sms.providerMessageId ? (
                <Fact label="Provider’s message ID"><span className="num">{sms.providerMessageId}</span></Fact>
              ) : null}
            </dl>
            {sms.text === null ? (
              <p className="ad__sub">
                This SMS was sent before KodiHub kept what messages said, so only the details above were recorded.
              </p>
            ) : (
              <pre className="ad__emailbody" aria-label="SMS text">{sms.text}</pre>
            )}
            <p className="ad__sub">
              “Sent” means the provider accepted the message. Whether it reached the phone is shown in the provider’s own
              delivery reports.
            </p>
            {sms.secret ? (
              <RevealSecret
                path={`/platform/sms/logs/${encodeURIComponent(sms.id)}/reveal`}
                label={sms.secret.label}
                what="SMS"
              />
            ) : null}
          </>
        ) : null}
      </div>
    </Sheet>
  );
}
