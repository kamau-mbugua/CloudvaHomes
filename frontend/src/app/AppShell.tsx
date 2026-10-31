import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { AccountMenu } from './AccountMenu';
import { CommandPalette } from './CommandPalette';
import { NotificationBell } from './NotificationBell';
import { TopRouteProgress } from '../components/Loading';
import { MenuIcon, MoonIcon, SunIcon } from './icons';
import { ACCOUNT_ENTRY, ORG_NAV, bestEntry, destinations, filterNav, matchScore } from './navigation';
import { readStored, writeStored } from '../lib/storage';
import { useTheme } from '../lib/theme';
import { ApiError, ORG_SUSPENDED, errorMessage } from '../lib/api/client';
import { displayName } from '../lib/auth/permissions';
import { isPlatformOperator } from '../lib/auth/portals';
import { logout, reloadSessionDetails, switchOrganization } from '../lib/auth/session';
import { useSession } from '../lib/auth/useAuth';
import { useToast } from '../lib/useToast';
import { useUnmatchedCount } from '../features/mpesa/api';
import { BillingBanner } from '../features/platform/BillingBanner';
import { keys as hodiBillingKeys } from '../features/platform/api';

/**
 * The org app frame (`/app/*`) — ported from pos-react's MerchantShell.
 *
 * Collapsed state is remembered per device: a laptop at the office wants labels, a small
 * tablet wants the width, and neither wants to re-choose every morning.
 *
 * ⌘K / Ctrl+K is bound here rather than on any one screen, so the palette works
 * everywhere. Dropped from the source: branch switcher, cash-register control, "New
 * sale" and the "/" list-search shortcut (no lists yet).
 *
 * Rendered only inside RequireAuth, so there is always a session with an active
 * organisation. The sidebar and palette show only what the session's permissions allow.
 */

const COLLAPSED_KEY = 'hodi.sidebar.collapsed';

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const session = useSession();
  const toast = useToast();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const groups = useMemo(() => filterNav(ORG_NAV, session.permissions, session.activeOrganization?.kind), [session.permissions, session.activeOrganization?.kind]);
  const pages = useMemo(() => destinations(groups), [groups]);
  // M-Pesa money waiting for someone to say whose it is — only for those who can see it.
  const unmatched = useUnmatchedCount(session.permissions.includes('reconciliation:view'));
  const counts = useMemo(() => ({ unmatchedInbound: unmatched.data ?? 0 }), [unmatched.data]);

  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_KEY) === '1');
  // Closed by default; on a phone the sidebar is an overlay rather than a column.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // The full model, not the filtered one: a page you may not open is still titled, and
  // shows "no access" rather than "not found".
  const here = bestEntry(ORG_NAV, location.pathname);
  const onAccount = matchScore(ACCOUNT_ENTRY, location.pathname) >= 0;
  const title = here?.entry.label ?? (onAccount ? ACCOUNT_ENTRY.label : 'Page not found');
  const subtitle = here
    ? (here.group.children.length > 0 ? `${here.group.label} · ${here.entry.hint}` : here.entry.hint)
    : onAccount ? ACCOUNT_ENTRY.hint : 'There is nothing at this address.';

  useEffect(() => {
    document.title = `${title} · KodiHub`;
  }, [title]);

  // A change refused as `ORG_SUSPENDED` means the session's status is out of date (the
  // daily job suspended the organisation since it was read): re-read it so the banner
  // appears. The message itself is set by the API client.
  const queryClient = useQueryClient();
  useEffect(() => queryClient.getMutationCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'error') return;
    const { error } = event.action;
    if (error instanceof ApiError && error.code === ORG_SUSPENDED) {
      void reloadSessionDetails();
      void queryClient.invalidateQueries({ queryKey: hodiBillingKeys.billing });
    }
  }), [queryClient]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        // Chrome binds ⌘K to the address bar, so it has to be claimed explicitly.
        event.preventDefault();
        setDrawerOpen(false);
        setPaletteOpen(true);
        return;
      }
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

  const org = session.activeOrganization;
  const membership = session.organizations.find((m) => m.id === org?.id);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <div className={`ms ${drawerOpen ? 'is-drawer-open' : ''}`}>
      <Sidebar
        groups={groups}
        orgName={org?.name ?? 'KodiHub'}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        // Following a link on a phone must close the overlay, or the page loads behind it.
        onNavigate={() => setDrawerOpen(false)}
        counts={counts}
      />

      {/* Only rendered when open, so it never swallows clicks on a desktop. */}
      {drawerOpen ? (
        <button
          type="button"
          className="ms__scrim"
          aria-label="Close the menu"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <div className="ms__main">
        <header className="ms__top">
          <button
            type="button"
            className="ms__burger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open the menu"
            aria-expanded={drawerOpen}
          >
            <MenuIcon />
          </button>

          <div className="ms__title">
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>

          <button type="button" className="ms__search" onClick={() => setPaletteOpen(true)}>
            <span>Search</span>
            <span className="ms__kbd num">⌘K</span>
          </button>

          <div className="ms__right">
            <NotificationBell />
            <button
              type="button"
              className="sh__icon"
              onClick={() => setTheme(nextTheme)}
              aria-label={`Switch to ${nextTheme} theme`}
              title={`Switch to ${nextTheme} theme`}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>

            <AccountMenu
              name={displayName(session.user)}
              contact={session.user.email ?? session.user.phone}
              role={membership?.roleName ?? null}
              organizations={session.organizations}
              activeOrganizationId={org?.id ?? null}
              switchingTo={switchingTo}
              onSwitch={switchTo}
              onSignOut={signOut}
              ownerPortal={session.ownerOf.length > 0}
              tenantPortal={session.tenantOf.length > 0}
              platformAdmin={isPlatformOperator(session.user)}
            />
          </div>
          <TopRouteProgress />
        </header>

        <BillingBanner />

        <main className="ms__page">
          <Outlet />
        </main>
      </div>

      {paletteOpen ? <CommandPalette pages={pages} onClose={() => setPaletteOpen(false)} /> : null}
    </div>
  );
}
