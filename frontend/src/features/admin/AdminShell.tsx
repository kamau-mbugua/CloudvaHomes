import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PageBoundary } from '../../components/ErrorBoundary';
import { Sidebar } from '../../app/Sidebar';
import { SessionAccountMenu } from '../../app/SessionAccountMenu';
import { NotificationBell } from '../../app/NotificationBell';
import { TopRouteProgress } from '../../components/Loading';
import { MenuIcon, MoonIcon, SunIcon } from '../../app/icons';
import { ADMIN_ACCOUNT_ENTRY, ADMIN_NAV, bestEntry, filterAdminNav, matchScore } from '../../app/navigation';
import { isSuperAdmin } from '../../lib/auth/portals';
import { useSession } from '../../lib/auth/useAuth';
import { readStored, writeStored } from '../../lib/storage';
import { useTheme } from '../../lib/theme';

/**
 * The platform admin area's frame (`/admin/*`, phase 8): the staff app's sidebar and top
 * bar with the admin menu (Overview, Organisations, Plans, Invoices, Settings). Desktop
 * first; below 860px the sidebar is a drawer, like the staff app.
 *
 * Rendered only inside RequireAdmin. The admin may have no organisation at all; the
 * account menu offers the staff app (and any portal) when they have one.
 */

const COLLAPSED_KEY = 'hodi.sidebar.collapsed';

export function AdminShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const session = useSession();
  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_KEY) === '1');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const superAdmin = isSuperAdmin(session.user);
  const navGroups = useMemo(() => filterAdminNav(ADMIN_NAV, superAdmin), [superAdmin]);
  const roleLabel = superAdmin ? 'Platform admin' : 'Salesperson';

  const fullPath = `${location.pathname}${location.search}`;
  const here = bestEntry(ADMIN_NAV, fullPath);
  const onAccount = matchScore(ADMIN_ACCOUNT_ENTRY, location.pathname) >= 0;
  const title = onAccount ? ADMIN_ACCOUNT_ENTRY.label : here?.entry.label ?? 'Page not found';
  const subtitle = onAccount
    ? ADMIN_ACCOUNT_ENTRY.hint
    : here
      ? (here.group.children.length > 0 ? `${here.group.label} · ${here.entry.hint}` : here.entry.hint)
      : 'There is nothing at this address.';

  useEffect(() => {
    document.title = `${title} · KodiHub admin`;
  }, [title]);

  useEffect(() => {
    if (session.user.mustChangePassword && (!onAccount || location.search !== '?tab=password')) {
      navigate(`${ADMIN_ACCOUNT_ENTRY.to}?tab=password`, { replace: true });
    }
  }, [session.user.mustChangePassword, onAccount, location.search, navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((was) => {
      writeStored(COLLAPSED_KEY, was ? '0' : '1');
      return !was;
    });
  };



  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <div className={`ms adm ${drawerOpen ? 'is-drawer-open' : ''}`}>
      <Sidebar
        groups={navGroups}
        orgName="KodiHub admin"
        label="Platform admin"
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onNavigate={() => setDrawerOpen(false)}
      />

      {drawerOpen ? (
        <button type="button" className="ms__scrim" aria-label="Close the menu" onClick={() => setDrawerOpen(false)} />
      ) : null}

      <div className="ms__main">
        <header className="ms__top">
          <button type="button" className="ms__burger" onClick={() => setDrawerOpen(true)} aria-label="Open the menu" aria-expanded={drawerOpen}>
            <MenuIcon />
          </button>

          <div className="ms__title">
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>

          <div className="ms__right">
            <span className="ad__badge ad__badge--info adm__tag">{roleLabel}</span>
            <NotificationBell />
            <button type="button" className="sh__icon" onClick={() => setTheme(nextTheme)}
              aria-label={`Switch to ${nextTheme} theme`} title={`Switch to ${nextTheme} theme`}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>

            <SessionAccountMenu here="admin" role={roleLabel} accountPath={ADMIN_ACCOUNT_ENTRY.to} />
          </div>
          <TopRouteProgress />
        </header>

        <main className="ms__page">
          <PageBoundary homePath="/admin"><Outlet /></PageBoundary>
        </main>
      </div>
    </div>
  );
}
