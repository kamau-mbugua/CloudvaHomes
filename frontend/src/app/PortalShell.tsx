import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { MoonIcon, SignOutIcon, SunIcon } from './icons';
import { portalsOf } from '../lib/auth/portals';
import { logout } from '../lib/auth/session';
import { useSession } from '../lib/auth/useAuth';
import { useTheme } from '../lib/theme';

/**
 * The minimal, phone-first shell the outside portals share — the owner portal (`/owner`)
 * and the tenant portal (`/tenant`): no staff sidebar, the organisation and the account in
 * the header (a switcher when there are several), a row of tabs, theme and sign out, and
 * links to the person's other places in the footer.
 */
export interface PortalAccount {
  id: string;
  label: string;
}

export function PortalShell({
  portal,
  label,
  orgName,
  accountName,
  accounts,
  currentId,
  onSwitch,
  switchLabel = 'Account',
  tabs,
  search,
  footer,
  context,
}: {
  portal: 'owner' | 'tenant';
  /** Names the tab row, e.g. "Owner portal". */
  label: string;
  orgName: string;
  accountName: string;
  /** Every account the person can switch between; a switcher shows when there are several. */
  accounts: PortalAccount[];
  currentId: string;
  onSwitch: (id: string) => void;
  /** Names the switcher for screen readers, e.g. "Landlord". */
  switchLabel?: string;
  tabs: { to: string; label: string; end: boolean }[];
  /** Kept on every tab link (the chosen account). */
  search: string;
  footer: ReactNode;
  /** Handed to the pages through `useOutletContext`. */
  context: unknown;
}) {
  const session = useSession();
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const places = portalsOf(session);

  useEffect(() => {
    document.title = `${accountName || label} · KodiHub`;
  }, [accountName, label]);

  const signOut = async () => {
    setSigningOut(true);
    await logout();
    navigate('/login', { replace: true });
  };

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <div className={`ow ow--${portal}`}>
      <header className="ow__top">
        <div className="ow__who">
          <span className="ow__org">{orgName}</span>
          {accounts.length > 1 ? (
            <select className="ow__switch" aria-label={switchLabel} value={currentId} onChange={(e) => onSwitch(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          ) : <strong className="ow__name">{accountName}</strong>}
        </div>
        <div className="ow__actions">
          <NotificationBell />
          <button type="button" className="sh__icon" onClick={() => setTheme(nextTheme)} aria-label={`Switch to ${nextTheme} theme`} title={`Switch to ${nextTheme} theme`}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button type="button" className="ow__signout" onClick={signOut} disabled={signingOut} aria-label="Sign out">
            <SignOutIcon /> <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      </header>

      <nav className="ow__tabs" aria-label={label}>
        {tabs.map((t) => (
          <NavLink key={t.to} to={`${t.to}${search}`} end={t.end} className={({ isActive }) => `ow__tab ${isActive ? 'is-on' : ''}`}>{t.label}</NavLink>
        ))}
      </nav>

      <main className="ow__page">
        <Outlet context={context} />
      </main>

      <footer className="ow__foot">
        <span>{footer}</span>
        <span className="ow__places">
          {places.staff ? <Link to="/app">Staff app</Link> : null}
          {places.owner && portal !== 'owner' ? <Link to="/owner">Owner portal</Link> : null}
          {places.tenant && portal !== 'tenant' ? <Link to="/tenant">Tenant portal</Link> : null}
        </span>
      </footer>
    </div>
  );
}
