import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { queryClient } from './lib/api/queryClient';
import { ToastProvider } from './components/Toast';
import { RouteDrawer, WithRouteDrawer } from './components/RouteDrawer';
import { AppShell } from './app/AppShell';
import { UpdatePrompt } from './app/UpdatePrompt';
import { RequireAdmin, RequireAuth, RequireOwner, RequirePermission, RequireSuperAdmin, RequireTenant } from './app/guards';
import { NotFoundPage, PlaceholderPage } from './app/PlaceholderPage';
import { ORG_NAV, destinations } from './app/navigation';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { AcceptInvitationPage } from './features/auth/AcceptInvitationPage';
import { StepUpProvider } from './features/auth/StepUpProvider';
import { DashboardPage } from './features/reports/DashboardPage';

const MessagesPage = lazy(() => import('./features/messages/MessagesPage').then((m) => ({ default: m.MessagesPage })));
const AccountPage = lazy(() => import('./features/account/AccountPage').then((m) => ({ default: m.AccountPage })));
const OrganizationPage = lazy(() => import('./features/settings/OrganizationPage').then((m) => ({ default: m.OrganizationPage })));
const UsersPage = lazy(() => import('./features/settings/UsersPage').then((m) => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import('./features/settings/RolesPage').then((m) => ({ default: m.RolesPage })));
const RoleEditorPage = lazy(() => import('./features/settings/RoleEditorPage').then((m) => ({ default: m.RoleEditorPage })));
const AuditLogPage = lazy(() => import('./features/settings/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const PropertiesPage = lazy(() => import('./features/portfolio/PropertiesPage').then((m) => ({ default: m.PropertiesPage })));
const PropertyDetailPage = lazy(() => import('./features/portfolio/PropertyDetailPage').then((m) => ({ default: m.PropertyDetailPage })));
const UnitsPage = lazy(() => import('./features/portfolio/UnitsPage').then((m) => ({ default: m.UnitsPage })));
const UnitDetailPage = lazy(() => import('./features/portfolio/UnitDetailPage').then((m) => ({ default: m.UnitDetailPage })));
const UnitSetupPage = lazy(() => import('./features/portfolio/UnitSetupPage').then((m) => ({ default: m.UnitSetupPage })));
const TenantsPage = lazy(() => import('./features/tenants/TenantsPage').then((m) => ({ default: m.TenantsPage })));
const TenantDetailPage = lazy(() => import('./features/tenants/TenantDetailPage').then((m) => ({ default: m.TenantDetailPage })));
const TenanciesPage = lazy(() => import('./features/tenants/TenanciesPage').then((m) => ({ default: m.TenanciesPage })));
const LandlordsPage = lazy(() => import('./features/landlords/LandlordsPage').then((m) => ({ default: m.LandlordsPage })));
const LandlordDetailPage = lazy(() => import('./features/landlords/LandlordDetailPage').then((m) => ({ default: m.LandlordDetailPage })));
const InvoicesPage = lazy(() => import('./features/billing/InvoicesPage').then((m) => ({ default: m.InvoicesPage })));
const InvoiceDetailPage = lazy(() => import('./features/billing/InvoiceDetailPage').then((m) => ({ default: m.InvoiceDetailPage })));
const InvoiceRunPage = lazy(() => import('./features/billing/InvoiceRunPage').then((m) => ({ default: m.InvoiceRunPage })));
const MeterReadingsPage = lazy(() => import('./features/billing/MeterReadingsPage').then((m) => ({ default: m.MeterReadingsPage })));
const ChargesPage = lazy(() => import('./features/billing/ChargesPage').then((m) => ({ default: m.ChargesPage })));
const PaymentsPage = lazy(() => import('./features/payments/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const PaymentDetailPage = lazy(() => import('./features/payments/PaymentDetailPage').then((m) => ({ default: m.PaymentDetailPage })));
const PaymentChannelsPage = lazy(() => import('./features/payments/PaymentChannelsPage').then((m) => ({ default: m.PaymentChannelsPage })));
const ReconciliationPage = lazy(() => import('./features/mpesa/ReconciliationPage').then((m) => ({ default: m.ReconciliationPage })));
const InboundDetailPage = lazy(() => import('./features/mpesa/InboundDetailPage').then((m) => ({ default: m.InboundDetailPage })));
const ExpensesPage = lazy(() => import('./features/expenses/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const MaintenancePage = lazy(() => import('./features/maintenance/MaintenancePage').then((m) => ({ default: m.MaintenancePage })));

const ReportsPage = lazy(() => import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const AgreementsPage = lazy(() => import('./features/agency/AgreementsPage').then((m) => ({ default: m.AgreementsPage })));
const OwnerStatementsPage = lazy(() => import('./features/agency/OwnerStatementsPage').then((m) => ({ default: m.OwnerStatementsPage })));
const RemittancesPage = lazy(() => import('./features/agency/RemittancesPage').then((m) => ({ default: m.RemittancesPage })));
const RemittanceDetailPage = lazy(() => import('./features/agency/RemittanceDetailPage').then((m) => ({ default: m.RemittanceDetailPage })));
const PlanBillingPage = lazy(() => import('./features/platform/PlanBillingPage').then((m) => ({ default: m.PlanBillingPage })));
const PayoutsPage = lazy(() => import('./features/banks/PayoutsPage').then((m) => ({ default: m.PayoutsPage })));

const AdminShell = lazy(() => import('./features/admin/AdminShell').then((m) => ({ default: m.AdminShell })));
const AdminOverviewPage = lazy(() => import('./features/admin/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const AdminOrganizationsPage = lazy(() => import('./features/admin/OrganizationsPage').then((m) => ({ default: m.OrganizationsPage })));
const CreateOrganizationPage = lazy(() => import('./features/admin/CreateOrganizationPage').then((m) => ({ default: m.CreateOrganizationPage })));
const AdminOrganizationDetailPage = lazy(() => import('./features/admin/OrganizationDetailPage').then((m) => ({ default: m.OrganizationDetailPage })));
const AdminPlansPage = lazy(() => import('./features/admin/PlansPage').then((m) => ({ default: m.PlansPage })));
const AdminInvoicesPage = lazy(() => import('./features/admin/AdminInvoicesPage').then((m) => ({ default: m.AdminInvoicesPage })));
const AdminPaymentsPage = lazy(() => import('./features/admin/AdminPaymentsPage').then((m) => ({ default: m.AdminPaymentsPage })));
const AdminOperatorsPage = lazy(() => import('./features/admin/AdminOperatorsPage').then((m) => ({ default: m.AdminOperatorsPage })));
const AdminEmailPage = lazy(() => import('./features/admin/AdminEmailPage').then((m) => ({ default: m.AdminEmailPage })));
const AdminReportsPage = lazy(() => import('./features/admin/AdminReportsPage').then((m) => ({ default: m.AdminReportsPage })));
const AdminSettingsPage = lazy(() => import('./features/admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })));

const OwnerShell = lazy(() => import('./features/owner/OwnerPortal').then((m) => ({ default: m.OwnerShell })));
const OwnerOverviewPage = lazy(() => import('./features/owner/OwnerPortal').then((m) => ({ default: m.OwnerOverviewPage })));
const OwnerPortalStatementsPage = lazy(() => import('./features/owner/OwnerPortal').then((m) => ({ default: m.OwnerStatementsPage })));
const OwnerPayoutsPage = lazy(() => import('./features/owner/OwnerPortal').then((m) => ({ default: m.OwnerPayoutsPage })));

const TenantShell = lazy(() => import('./features/tenant/TenantShell').then((m) => ({ default: m.TenantShell })));
const TenantDocumentsPage = lazy(() => import('./features/tenant/TenantMorePages').then((m) => ({ default: m.TenantDocumentsPage })));
const TenantNoticesPage = lazy(() => import('./features/tenant/TenantMorePages').then((m) => ({ default: m.TenantNoticesPage })));
const TenantProfilePage = lazy(() => import('./features/tenant/TenantMorePages').then((m) => ({ default: m.TenantProfilePage })));
const TenantDashboard = lazy(() => import('./features/tenant/TenantDashboard').then((m) => ({ default: m.TenantDashboard })));
const TenantInvoicesPage = lazy(() => import('./features/tenant/TenantPortal').then((m) => ({ default: m.TenantInvoicesPage })));
const TenantInvoicePage = lazy(() => import('./features/tenant/TenantPortal').then((m) => ({ default: m.TenantInvoicePage })));
const TenantStatementPage = lazy(() => import('./features/tenant/TenantPortal').then((m) => ({ default: m.TenantStatementPage })));
const TenantPaymentsPage = lazy(() => import('./features/tenant/TenantPortal').then((m) => ({ default: m.TenantPaymentsPage })));
const TenantRequestsPage = lazy(() => import('./features/tenant/TenantPortal').then((m) => ({ default: m.TenantRequestsPage })));

/**
 * Routes come from the navigation model, so a menu entry and its page cannot drift apart:
 * every entry is guarded by its own `permission`. Screens that are built replace the
 * placeholder through BUILT; the rest match their sub-paths (`/*`) so a deep link lands
 * on the right placeholder.
 *
 * `/app` is behind RequireAuth (signed in, with an organisation). `/` goes to the app,
 * which sends signed-out visitors to sign in, landlords without an organisation to the
 * owner portal (`/owner`, behind RequireOwner) and tenants to the tenant portal
 * (`/tenant`, behind RequireTenant).
 */
const PAGES = destinations(ORG_NAV);

/** Path (relative to /app) → the screen that replaces its placeholder. */
const BUILT: Record<string, { element: ReactNode; children?: { path: string; title: string; element: ReactNode }[] }> = {
  'settings/organization': { element: <OrganizationPage /> },
  'settings/users': { element: <UsersPage /> },
  'settings/roles': {
    element: <RolesPage />,
    children: [
      { path: 'new', title: 'New role', element: <RoleEditorPage /> },
      { path: ':roleId', title: 'Role details', element: <RoleEditorPage /> },
    ],
  },
  'settings/audit': { element: <AuditLogPage /> },
  'settings/plan': { element: <PlanBillingPage /> },
  'settings/payouts': { element: <PayoutsPage /> },
  landlords: { element: <LandlordsPage />, children: [{ path: ':landlordId', title: 'Landlord details', element: <LandlordDetailPage /> }] },
  properties: { element: <PropertiesPage />, children: [{ path: ':propertyId', title: 'Property details', element: <PropertyDetailPage /> }] },
  units: { element: <UnitsPage />, children: [{ path: ':unitId', title: 'Unit details', element: <UnitDetailPage /> }] },
  'unit-categories': { element: <UnitSetupPage /> },
  maintenance: { element: <MaintenancePage /> },
  tenants: { element: <TenantsPage />, children: [{ path: ':tenantId', title: 'Tenant details', element: <TenantDetailPage /> }] },
  tenancies: { element: <TenanciesPage /> },
  messages: { element: <MessagesPage /> },
  // `invoices/run` is its own nav entry and route. React Router ranks the static `run`
  // above the dynamic `:invoiceId`, so the detail route never swallows it (tested in
  // routes.test.ts).
  invoices: { element: <InvoicesPage />, children: [{ path: ':invoiceId', title: 'Invoice details', element: <InvoiceDetailPage /> }] },
  'invoices/run': { element: <InvoiceRunPage /> },
  'meter-readings': { element: <MeterReadingsPage /> },
  charges: { element: <ChargesPage /> },
  payments: { element: <PaymentsPage />, children: [{ path: ':paymentId', title: 'Payment details', element: <PaymentDetailPage /> }] },
  'payment-channels': { element: <PaymentChannelsPage /> },
  reconciliation: { element: <ReconciliationPage />, children: [{ path: ':inboundId', title: 'Transaction details', element: <InboundDetailPage /> }] },
  expenses: { element: <ExpensesPage /> },
  reports: { element: <ReportsPage /> },
  agreements: { element: <AgreementsPage /> },
  'owner-statements': { element: <OwnerStatementsPage /> },
  remittances: { element: <RemittancesPage />, children: [{ path: ':remittanceId', title: 'Remittance details', element: <RemittanceDetailPage /> }] },
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <UpdatePrompt />
        <BrowserRouter>
          <StepUpProvider>
            <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>
            <Routes>
              <Route path="/" element={<Navigate to="/app" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/invite/:token" element={<AcceptInvitationPage />} />

              <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
                <Route index element={<DashboardPage />} />
                <Route path="account" element={<AccountPage />} />
                {PAGES.filter((page) => page.to !== '/app').map((page) => {
                  const path = page.to.slice('/app/'.length);
                  const built = BUILT[path];
                  const guard = (element: ReactNode) => (
                    <RequirePermission permission={page.permission} orgKinds={page.orgKinds}>{element}</RequirePermission>
                  );

                  if (!built) {
                    return <Route key={page.to} path={`${path}/*`} element={guard(<PlaceholderPage />)} />;
                  }
                  if (built.children && built.children.length > 0) {
                    return (
                      <Route key={page.to} path={path} element={guard(<WithRouteDrawer>{built.element}</WithRouteDrawer>)}>
                        {built.children.map((child) => (
                          <Route
                            key={`${page.to}/${child.path}`}
                            path={child.path}
                            element={(
                              <RouteDrawer title={child.title} backTo={page.to}>
                                {child.element}
                              </RouteDrawer>
                            )}
                          />
                        ))}
                      </Route>
                    );
                  }
                  return <Route key={page.to} path={path} element={guard(built.element)} />;
                })}
                {/* Phase 0 spelled it the British way; keep old links working. */}
                <Route path="settings/organisation" element={<Navigate to="/app/settings/organization" replace />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>

              {/* The platform admin area: KodiHub's own staff, its own shell (phase 8 & phase 11). */}
              <Route path="/admin" element={<RequireAdmin><AdminShell /></RequireAdmin>}>
                <Route index element={<AdminOverviewPage />} />
                <Route path="organizations" element={<WithRouteDrawer><AdminOrganizationsPage /></WithRouteDrawer>}>
                  <Route
                    path="new"
                    element={(
                      <RouteDrawer title="New organisation" backTo="/admin/organizations">
                        <CreateOrganizationPage />
                      </RouteDrawer>
                    )}
                  />
                  <Route
                    path=":organizationId"
                    element={(
                      <RouteDrawer title="Organisation details" backTo="/admin/organizations">
                        <AdminOrganizationDetailPage />
                      </RouteDrawer>
                    )}
                  />
                </Route>
                <Route path="plans" element={<RequireSuperAdmin><AdminPlansPage /></RequireSuperAdmin>} />
                <Route path="invoices" element={<AdminInvoicesPage />} />
                <Route path="payments" element={<AdminPaymentsPage />} />
                <Route path="reports" element={<Navigate to="/admin/reports/collections" replace />} />
                <Route path="reports/:report" element={<RequireSuperAdmin><AdminReportsPage /></RequireSuperAdmin>} />
                <Route path="admins" element={<RequireSuperAdmin><AdminOperatorsPage /></RequireSuperAdmin>} />
                <Route path="email" element={<RequireSuperAdmin><AdminEmailPage /></RequireSuperAdmin>} />
                <Route path="settings" element={<RequireSuperAdmin><AdminSettingsPage /></RequireSuperAdmin>} />
                <Route path="account" element={<AccountPage />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Route>

              {/* The owner portal: landlords of an agency, read only, its own shell. */}
              <Route path="/owner" element={<RequireOwner><OwnerShell /></RequireOwner>}>
                <Route index element={<OwnerOverviewPage />} />
                <Route path="statements" element={<OwnerPortalStatementsPage />} />
                <Route path="payouts" element={<OwnerPayoutsPage />} />
                <Route path="*" element={<Navigate to="/owner" replace />} />
              </Route>

              {/* The tenant portal: a tenant's own account and paying by M-Pesa, its own shell. */}
              <Route path="/tenant" element={<RequireTenant><TenantShell /></RequireTenant>}>
                <Route index element={<TenantDashboard />} />
                <Route path="invoices" element={<WithRouteDrawer><TenantInvoicesPage /></WithRouteDrawer>}>
                  <Route
                    path=":invoiceId"
                    element={(
                      <RouteDrawer title="Invoice details" backTo="/tenant/invoices">
                        <TenantInvoicePage />
                      </RouteDrawer>
                    )}
                  />
                </Route>
                <Route path="statement" element={<TenantStatementPage />} />
                <Route path="payments" element={<TenantPaymentsPage />} />
                <Route path="requests" element={<TenantRequestsPage />} />
                <Route path="documents" element={<TenantDocumentsPage />} />
                <Route path="notices" element={<TenantNoticesPage />} />
                <Route path="profile" element={<TenantProfilePage />} />
                <Route path="*" element={<Navigate to="/tenant" replace />} />
              </Route>

              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
            </Suspense>
          </StepUpProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
