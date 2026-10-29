import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCan, useSession } from '../../lib/auth/useAuth';
import { useBillingSummary } from './api';
import { PayHodiSheet } from './PayHodiSheet';
import { bannerFor, suggestedPayment } from './rules';

/**
 * The staff app's Hodi billing banner, above every page while the organisation is
 * overdue (GRACE), read-only (SUSPENDED) or closed. Its status comes from the session
 * (`activeOrganization.status`); the amount and due date from `GET /billing` for those who
 * may see it (`settings:view`). It sits in the page flow above the content — never over
 * it — so everything stays readable.
 *
 * "Pay now" opens the M-Pesa prompt (`settings:update`, when Hodi can take it in the app);
 * otherwise it leads to Plan & billing, which shows the paybill.
 */
export function BillingBanner() {
  const session = useSession();
  const status = session.activeOrganization?.status;
  const canView = useCan('settings:view');
  const canPay = useCan('settings:update');
  const flagged = status === 'GRACE' || status === 'SUSPENDED' || status === 'CLOSED';
  const summary = useBillingSummary(flagged && canView);
  const [paying, setPaying] = useState(false);

  const banner = bannerFor(status, summary.data);
  if (!banner) return null;

  const inApp = canPay && summary.data?.canPayInApp;

  return (
    <div className={`hb__banner hb__banner--${banner.tone}`} role="region" aria-label="KodiHub bill">
      <p className="hb__bannertext">
        <strong>{banner.message}</strong>
        {banner.payable && !canView ? ' Ask your organisation’s owner to pay it.' : null}
      </p>
      {banner.payable && canView ? (
        <div className="hb__banneractions">
          {inApp ? (
            <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setPaying(true)}>Pay now</button>
          ) : (
            <Link className="nx-btn nx-btn--sm nx-btn--primary" to="/app/settings/plan">{canPay ? 'Pay now' : 'See the bill'}</Link>
          )}
          {inApp ? <Link className="hb__bannerlink" to="/app/settings/plan">Plan & billing</Link> : null}
        </div>
      ) : null}
      {paying && summary.data ? (
        <PayHodiSheet owed={suggestedPayment(summary.data)} ownPhone={session.user.phone} onClose={() => setPaying(false)} />
      ) : null}
    </div>
  );
}
