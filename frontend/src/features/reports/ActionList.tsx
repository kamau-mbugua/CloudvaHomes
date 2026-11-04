import { Link } from 'react-router-dom';
import { useAuthState } from '../../lib/auth/useAuth';
import { hasPermission } from '../../lib/auth/permissions';
import { formatKES } from '../../lib/money';
import { actionLink } from './rules';
import type { ActionItem } from './types';

/**
 * The dashboard's "Needs attention" list: each line is a count of something waiting and a
 * link to the page that deals with it. Lines the person can't act on are left out.
 */
export function ActionList({ items }: { items: ActionItem[] }) {
  const { session } = useAuthState();
  const visible = items.filter((item) => hasPermission(session, actionLink(item.kind).permission));

  return (
    <section className="rp__actions" aria-labelledby="rp-actions-title">
      <h2 id="rp-actions-title" className="rp__actions-title">Needs attention</h2>
      {visible.length === 0 ? (
        <p className="rp__actions-clear">You’re all caught up.</p>
      ) : (
        <ul className="rp__actions-list">
          {visible.map((item) => {
            const link = actionLink(item.kind);
            return (
              <li key={item.kind}>
                <Link className={`rp__action rp__action--${item.kind.toLowerCase()}`} to={link.to}>
                  <span className="rp__action-text">{link.label(item.count)}</span>
                  {typeof item.amount === 'number' && item.amount > 0 ? (
                    <span className="rp__action-amount num">{formatKES(item.amount)}</span>
                  ) : null}
                  <span className="rp__action-go" aria-hidden="true">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
