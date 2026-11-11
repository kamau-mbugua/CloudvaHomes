import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { PageBoundary } from '../components/ErrorBoundary';
import { NotificationBell } from './NotificationBell';
import { BrandLockup } from '../components/BrandMark';
import { TopRouteProgress } from '../components/Loading';
import { MoonIcon, SunIcon } from './icons';
import { SessionAccountMenu } from './SessionAccountMenu';
import { portalsOf } from '../lib/auth/portals';
import { useSession } from '../lib/auth/useAuth';
import { useTheme } from '../lib/theme';
import { scrollEdges } from '../lib/scrollEdges';

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
  const [theme, setTheme] = useTheme();
  const places = portalsOf(session);

  useEffect(() => {
    document.title = `${accountName || label} · KodiHub`;
  }, [accountName, label]);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <div className={`ow ow--${portal}`}>
      <header className="ow__top">
        <div className="ow__who">
          {portal === 'owner' ? <BrandLockup tone="navy" size="sm" /> : null}
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
          <SessionAccountMenu here={portal} role={portal === 'owner' ? 'Landlord' : 'Tenant'} accountPath={null} />
        </div>
        <TopRouteProgress />
      </header>

      <PortalTabs label={label}>
        {tabs.map((t) => (
          <NavLink key={t.to} to={`${t.to}${search}`} end={t.end} className={({ isActive }) => `ow__tab ${isActive ? 'is-on' : ''}`}>{t.label}</NavLink>
        ))}
      </PortalTabs>

      <main className="ow__page">
        <PageBoundary homePath={`/${portal}`}><Outlet context={context} /></PageBoundary>
      </main>

      <footer className="ow__foot">
        <span className="ow__foot-brand">
          <span>{footer}</span>
          <span className="ow__powered">
            Powered by <BrandLockup tone="light" size="xs" />
          </span>
        </span>
        <span className="ow__places">
          {places.staff ? <Link to="/app">Staff app</Link> : null}
          {places.owner && portal !== 'owner' ? <Link to="/owner">Owner portal</Link> : null}
          {places.tenant && portal !== 'tenant' ? <Link to="/tenant">Tenant portal</Link> : null}
        </span>
      </footer>
    </div>
  );
}

/**
 * The portal's tab row. On a phone the tabs scroll sideways: the active tab is scrolled into
 * view on every navigation, and a fade marks each edge that hides more tabs.
 */
function PortalTabs({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const next = scrollEdges(el);
      setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.ow__tab.is-on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);

  const fade = `${edges.start ? ' has-more-start' : ''}${edges.end ? ' has-more-end' : ''}`;
  return (
    <nav ref={ref} className={`ow__tabs${fade}`} aria-label={label}>
      {children}
    </nav>
  );
}
