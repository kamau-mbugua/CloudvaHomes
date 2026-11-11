import { useEffect, useMemo, useState } from 'react';
import { useRememberPlace } from '../../lib/auth/lastPlace';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { PageBoundary } from '../../components/ErrorBoundary';
import { CardSkeleton, TopRouteProgress } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';
import { NotificationBell } from '../../app/NotificationBell';
import { MenuIcon, MoonIcon, SunIcon } from '../../app/icons';
import { SessionAccountMenu } from '../../app/SessionAccountMenu';
import { portalsOf } from '../../lib/auth/portals';
import { useSession } from '../../lib/auth/useAuth';
import { readStored, writeStored } from '../../lib/storage';
import { useTheme } from '../../lib/theme';
import { tenantErrorMessage, useConsolidatedOverview } from './api';
import { homeText } from './rules';
import { ALL_HOMES, homeOptions } from './scope';
import { TenantSidebar } from './TenantSidebar';
import { TENANT_MENU } from './tenantMenu';
import type { TenantContext } from './tenantContext';
import { useHomeScope } from './useHomeScope';

const COLLAPSED_KEY = 'kodihub:tenant-menu-collapsed';

/**
 * The tenant portal shell (tenant portal redesign): side menu with the home switcher, a top
 * bar with the page title, bell, theme and sign out, and — while one home is selected — a
 * strip naming it on every page. Pages read `useTenantContext()`.
 */
export function TenantShell() {
  const session = useSession();
  useRememberPlace(session.user.id, 'tenant');
  const { pathname } = useLocation();
  const [theme, setTheme] = useTheme();
  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_KEY) === '1');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const overview = useConsolidatedOverview();
  const [scope, setScope] = useHomeScope(session.user.id, overview.data);
  const options = useMemo(() => (overview.data ? homeOptions(overview.data) : []), [overview.data]);
  const places = portalsOf(session);
  const page = TENANT_MENU.find((m) => (m.end ? pathname === m.to : pathname.startsWith(m.to)))?.label ?? 'Dashboard';

  useEffect(() => {
    document.title = `${page} · KodiHub`;
  }, [page]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const accounts = session.tenantOf;
  const account = (scope.kind === 'home' ? accounts.find((a) => a.tenantId === scope.tenantId) : undefined) ?? accounts[0];
  const selected = scope.kind === 'home' ? overview.data?.tenancies.find((t) => t.id === scope.tenancyId) : undefined;
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <div className={`ms tsh ${drawerOpen ? 'is-drawer-open' : ''}`}>
      <TenantSidebar
        options={options}
        scope={scope}
        onScope={setScope}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((was) => { writeStored(COLLAPSED_KEY, was ? '0' : '1'); return !was; })}
        onNavigate={() => setDrawerOpen(false)}
      />
      {drawerOpen ? <button type="button" className="ms__scrim" aria-label="Close the menu" onClick={() => setDrawerOpen(false)} /> : null}

      <div className="ms__main">
        <header className="ms__top">
          <button type="button" className="ms__burger" onClick={() => setDrawerOpen(true)} aria-label="Open the menu" aria-expanded={drawerOpen}>
            <MenuIcon />
          </button>
          <div className="ms__title">
            <strong>{page}</strong>
            <span>Hello, {session.user.firstName}</span>
          </div>
          <div className="ms__right">
            <NotificationBell />
            <button type="button" className="sh__icon" onClick={() => setTheme(nextTheme)} aria-label={`Switch to ${nextTheme} theme`} title={`Switch to ${nextTheme} theme`}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <SessionAccountMenu here="tenant" role="Tenant" accountPath="/tenant/profile" />
          </div>
          <TopRouteProgress />
        </header>

        {selected ? (
          <div className="hb__banner hb__banner--scope" role="region" aria-label="Home filter">
            <p className="hb__bannertext">
              Showing only <strong>{homeText(selected)}</strong> · {selected.orgName}
            </p>
            <div className="hb__banneractions">
              <button type="button" className="nx-btn nx-btn--sm" onClick={() => setScope(ALL_HOMES)}>Show all my homes</button>
            </div>
          </div>
        ) : null}

        <main className="ms__page tsh__page">
          {overview.isPending ? <CardSkeleton count={3} /> : null}
          {overview.isError ? (
            <EmptyState title="Not available" detail={tenantErrorMessage(overview.error, 'your landlord')} />
          ) : null}
          {overview.data && account ? (
            <PageBoundary homePath="/tenant">
              <Outlet
                context={{
                  overview: overview.data,
                  scope,
                  setScope,
                  accounts,
                  account,
                  search: '',
                  count: accounts.length,
                } satisfies TenantContext}
              />
            </PageBoundary>
          ) : null}
          <footer className="tsh__foot">
            {places.staff ? <Link to="/app">Staff app</Link> : null}
            {places.owner ? <Link to="/owner">Owner portal</Link> : null}
          </footer>
        </main>
      </div>
    </div>
  );
}
