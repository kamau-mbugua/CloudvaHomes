import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { formatDay } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { unwrap } from '../payments/rules';

interface VerifiedCertificate {
  code: string;
  issuedAt: string;
  tenantName: string;
  tenantCode: string;
  orgName: string;
  homes: string[];
  from: string;
  to: string;
  invoices: number;
  billed: string;
  paid: string;
  onTime: number;
  late: number;
  unpaid: number;
}

/**
 * Public: check a payment history certificate by its code (`/verify/:code`, phase 23). Shows
 * exactly what the certificate says, so a landlord or lender can tell a copy wasn't altered.
 */
export function VerifyCertificatePage() {
  const { code = '' } = useParams();
  const cert = useQuery({
    queryKey: ['public-certificate', code],
    queryFn: () => api.get<unknown>(`/public/certificates/${encodeURIComponent(code)}`).then((b) => unwrap<VerifiedCertificate>(b)),
    retry: false,
  });
  return (
    <main className="pg" style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>
      <h1 className="adm__h1">Payment history certificate</h1>
      {cert.isPending ? <p className="ad__muted">Checking {code}…</p> : null}
      {cert.isError ? (
        <p className="ad__error" role="alert">
          No certificate has the code {code}. Check it was typed exactly as printed.
        </p>
      ) : null}
      {cert.data ? (
        <>
          <p className="ad__badge ad__badge--ok" style={{ display: 'inline-block' }}>Genuine · issued {formatDay(cert.data.issuedAt.slice(0, 10))}</p>
          <p>
            {cert.data.orgName} certifies the rent payment record of <strong>{cert.data.tenantName}</strong>
            {cert.data.homes.length ? `, tenant of ${cert.data.homes.join('; ')},` : ''} for invoices due between{' '}
            {formatDay(cert.data.from)} and {formatDay(cert.data.to)}.
          </p>
          <dl className="pf__facts">
            <div><dt>Invoices</dt><dd className="num">{cert.data.invoices}</dd></div>
            <div><dt>Billed</dt><dd className="num">{formatKES(Number(cert.data.billed))}</dd></div>
            <div><dt>Paid</dt><dd className="num">{formatKES(Number(cert.data.paid))}</dd></div>
            <div><dt>Paid in full by the due date</dt><dd className="num">{cert.data.onTime}</dd></div>
            <div><dt>Paid in full, after the due date</dt><dd className="num">{cert.data.late}</dd></div>
            <div><dt>Not yet paid in full</dt><dd className="num">{cert.data.unpaid}</dd></div>
          </dl>
          <p className="ad__muted">Code {cert.data.code}. It covers rent and charges invoiced through KodiHQ only, and is not a credit report.</p>
        </>
      ) : null}
    </main>
  );
}
