import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { Splash } from '../components/Splash';
import { NoOrganizationPage } from '../features/auth/NoOrganizationPage';
import { PortalChooserPage } from '../features/auth/PortalChooserPage';
import { loginPath } from '../lib/auth/next';
import { isPlatformOperator, isSuperAdmin, landingFor } from '../lib/auth/portals';
import { hasPermission } from '../lib/auth/permissions';
import type { OrgKind } from '../lib/auth/types';
import { useAuthState } from '../lib/auth/useAuth';
import { availableTo } from './navigation';

/**
 * Signed in, with an organisation — or not rendered at all.
 *
 * Signed out (including a session that failed to refresh mid-visit) goes to sign-in with
 * `next`, so the person lands back where they were. Signed in without an organisation
 * gets an explanation rather than an empty shell — unless they are a landlord of an
 * agency (owner portal) or a tenant (tenant portal), or both (asked which).
 */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status, session } = useAuthState();
  const location = useLocation();

  if (status === 'loading') return <Splash />;
  if (status === 'signedOut' || !session) {
    return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />;
  }
  if (!session.activeOrganization) {
    const landing = landingFor(session);
    if (landing === 'choose') return <PortalChooserPage session={session} />;
    if (landing) return <Navigate to={landing} replace />;
    return <NoOrganizationPage session={session} />;
  }

  return children ? <>{children}</> : <Outlet />;
}

/**
 * Signed in with at least one landlord profile (`ownerOf`) — the owner portal. Staff who
 * are not landlords anywhere are sent back to the org app.
 */
export function RequireOwner({ children }: { children?: ReactNode }) {
  const { status, session } = useAuthState();
  const location = useLocation();

  if (status === 'loading') return <Splash />;
  if (status === 'signedOut' || !session) {
    return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />;
  }
  if (session.ownerOf.length === 0) return <Navigate to="/app" replace />;

  return children ? <>{children}</> : <Outlet />;
}

/**
 * Signed in and linked to at least one tenant record (`tenantOf`) — the tenant portal.
 * Anyone else is sent back to the org app (which sends them on to wherever they belong).
 */
export function RequireTenant({ children }: { children?: ReactNode }) {
  const { status, session } = useAuthState();
  const location = useLocation();

  if (status === 'loading') return <Splash />;
  if (status === 'signedOut' || !session) {
    return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />;
  }
  if (session.tenantOf.length === 0) return <Navigate to="/app" replace />;

  return children ? <>{children}</> : <Outlet />;
}

/**
 * Signed in as a platform admin (`user.isPlatformAdmin`) — the admin area (`/admin`),
 * with or without an organisation. Anyone else is sent to the org app, which sends them
 * on to wherever they belong. Hiding is a courtesy; the API refuses `/platform/*` to
 * everyone else.
 */
export function RequireAdmin({ children }: { children?: ReactNode }) {
  const { status, session } = useAuthState();
  const location = useLocation();

  if (status === 'loading') return <Splash />;
  if (status === 'signedOut' || !session) {
    return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />;
  }
  if (!isPlatformOperator(session.user)) return <Navigate to="/app" replace />;

  return children ? <>{children}</> : <Outlet />;
}

export function RequireSuperAdmin({ children }: { children?: ReactNode }) {
  const { session } = useAuthState();
  if (!isSuperAdmin(session?.user)) {
    return (
      <div className="ph">
        <EmptyState
          title="Superadmin access required"
          detail="This area is only available to KodiHub superadministrators."
        />
      </div>
    );
  }
  return children ? <>{children}</> : <Outlet />;
}

/**
 * The page, or a plain "no access" note — never a blank screen or a 403 toast.
 *
 * `orgKinds` limits the page to some kinds of organisation (landlords: agencies only), so a
 * deep link from an agency to a landlord organisation explains itself instead of failing
 * with `403 AGENCY_ONLY`.
 */
export function RequirePermission({
  permission,
  orgKinds,
  children,
}: {
  permission: string | undefined;
  orgKinds?: OrgKind[];
  children: ReactNode;
}) {
  const { session } = useAuthState();

  if (!availableTo({ orgKinds }, session?.activeOrganization?.kind)) {
    return (
      <div className="ph">
        <EmptyState
          title="Not used in this organisation"
          detail="Landlords and their agreements are kept by agencies. In a landlord’s own organisation, the properties are simply yours."
        />
      </div>
    );
  }

  if (!hasPermission(session, permission)) {
    return (
      <div className="ph">
        <EmptyState
          title="You don’t have access to this page"
          detail="Your role in this organisation does not include it. If you need it, ask your organisation’s owner to change your role."
        />
      </div>
    );
  }

  return <>{children}</>;
}
