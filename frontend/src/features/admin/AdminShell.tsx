import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from '../../app/Sidebar';
import { AccountMenu } from '../../app/AccountMenu';
import { BrandLockup } from '../../components/BrandMark';
import { TopRouteProgress } from '../../components/Loading';
import { MenuIcon, MoonIcon, SunIcon } from '../../app/icons';
import { ADMIN_ACCOUNT_ENTRY, ADMIN_NAV, bestEntry, filterAdminNav, matchScore } from '../../app/navigation';
import { errorMessage } from '../../lib/api/client';
import { displayName } from '../../lib/auth/permissions';
import { isSuperAdmin, portalsOf } from '../../lib/auth/portals';
import { logout, switchOrganization } from '../../lib/auth/session';
import { useSession } from '../../lib/auth/useAuth';
import { readStored, writeStored } from '../../lib/storage';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../lib/useToast';

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
  const toast = useToast();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_KEY) === '1');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const places = portalsOf(session);
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

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // Choosing an organisation from here opens it in the staff app.
  const switchTo = async (organizationId: string) => {
    setSwitchingTo(organizationId);
    try {
      const next = await switchOrganization(organizationId);
      navigate('/app', { replace: true });
      toast.saved(`Switched to ${next.activeOrganization?.name ?? 'the organisation'}.`);
    } catch (caught) {
      toast.failed(errorMessage(caught));
    } finally {
      setSwitchingTo(null);
    }
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

          <div className="ms__brand">
            <BrandLockup tone="navy" size="sm" />
            <span className="ms__org-pill">{roleLabel}</span>
          </div>

          <div className="ms__title">
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>

          <div className="ms__right">
            <button type="button" className="sh__icon" onClick={() => setTheme(nextTheme)}
              aria-label={`Switch to ${nextTheme} theme`} title={`Switch to ${nextTheme} theme`}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>

            <AccountMenu
              name={displayName(session.user)}
              contact={session.user.email ?? session.user.phone}
              role={roleLabel}
              organizations={session.organizations}
              activeOrganizationId={session.activeOrganization?.id ?? null}
              switchingTo={switchingTo}
              onSwitch={switchTo}
              onSignOut={signOut}
              staffApp={places.staff}
              ownerPortal={places.owner}
              tenantPortal={places.tenant}
              accountPath={ADMIN_ACCOUNT_ENTRY.to}
            />
          </div>
          <TopRouteProgress />
        </header>

        <main className="ms__page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
