import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { formatKES } from '../../lib/money';
import type { LandlordToPay } from './dashboard';
import { HowToPayCard } from './HowToPay';
import type { ConsolidatedOverview } from './types';

/**
 * "Pay now" across all homes (tenant portal redesign): each landlord has its own paybill,
 * so the tenant picks who to pay. Each line opens the usual M-Pesa prompt for that
 * landlord; "Other ways to pay" shows the paybill / bank details.
 */
export function PayChooser({ rows, overview, onPay, onClose }: {
  rows: LandlordToPay[];
  overview: ConsolidatedOverview;
  onPay: (tenantId: string) => void;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<string | null>(null);
  const owing = rows.filter((r) => r.owed > 0);
  const list = owing.length > 0 ? owing : rows;
  return (
    <Sheet title="Who do you want to pay?" onClose={onClose}>
      <p className="ad__muted">Each landlord or agency is paid separately.</p>
      <ul className="tp__rows">
        {list.map((r) => {
          const account = overview.accounts.find((a) => a.tenant.id === r.tenantId);
          return (
            <li key={r.tenantId} className="tdp__row">
              <div className="tdp__line">
                <span className="tp__rowmain">
                  <strong>{r.orgName}</strong>
                  <span className="ad__sub">{r.owed > 0 ? `${formatKES(r.owed)} to pay` : 'Nothing to pay'}</span>
                </span>
                {r.canPayInApp ? (
                  <button type="button" className="nx-btn nx-btn--money nx-btn--sm" onClick={() => onPay(r.tenantId)}>
                    {r.owed > 0 ? 'Pay' : 'Pay in advance'}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="tdp__more"
                aria-expanded={details === r.tenantId}
                onClick={() => setDetails(details === r.tenantId ? null : r.tenantId)}
              >
                {details === r.tenantId ? 'Hide other ways to pay' : 'Other ways to pay'}
              </button>
              {details === r.tenantId && account ? <HowToPayCard ways={account.howToPay} orgName={r.orgName} /> : null}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
