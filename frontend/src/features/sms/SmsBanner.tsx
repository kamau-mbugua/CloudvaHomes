import { Link } from 'react-router-dom';
import { useCan } from '../../lib/auth/useAuth';
import { useSmsAccount } from './api';
import { bannerFor } from './rules';

/**
 * Above every page while the organisation's SMS needs attention: out of or low on KodiHub
 * units, or its own SMS account failing (spec §6). Only for people who may see SMS.
 */
export function SmsBanner() {
  const canView = useCan('sms:view');
  const canBuy = useCan('sms:manage');
  const account = useSmsAccount(canView);
  const banner = account.data ? bannerFor(account.data) : null;
  if (!banner) return null;
  return (
    <div className={`hb__banner hb__banner--${banner.tone === 'danger' ? 'alert' : 'warn'}`} role="region" aria-label="SMS">
      <p className="hb__bannertext">
        <strong>{banner.text}</strong>
        {!canBuy ? ' Ask your organisation’s owner.' : null}
      </p>
      {canBuy ? (
        <div className="hb__banneractions">
          <Link className="nx-btn nx-btn--sm nx-btn--primary" to={banner.action === 'buy' ? '/app/settings/sms?buy=1' : '/app/settings/sms'}>
            {banner.action === 'buy' ? 'Buy SMS' : 'See SMS settings'}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
