import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { queryClient } from './lib/api/queryClient';
import { ToastProvider } from './components/Toast';
import { AppShell } from './app/AppShell';
import { RequireAdmin, RequireAuth, RequireOwner, RequirePermission, RequireTenant } from './app/guards';
import { NotFoundPage, PlaceholderPage } from './app/PlaceholderPage';
import { ORG_NAV, destinations } from './app/navigation';
import { LoginPage } from './features/auth/LoginPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { AcceptInvitationPage } from './features/auth/AcceptInvitationPage';
import { StepUpProvider } from './features/auth/StepUpProvider';
import { AccountPage } from './features/account/AccountPage';
import { OrganizationPage } from './features/settings/OrganizationPage';
import { UsersPage } from './features/settings/UsersPage';
import { RolesPage } from './features/settings/RolesPage';
import { RoleEditorPage } from './features/settings/RoleEditorPage';
import { AuditLogPage } from './features/settings/AuditLogPage';
import { PropertiesPage } from './features/portfolio/PropertiesPage';
import { PropertyDetailPage } from './features/portfolio/PropertyDetailPage';
import { UnitsPage } from './features/portfolio/UnitsPage';
import { UnitDetailPage } from './features/portfolio/UnitDetailPage';
import { UnitSetupPage } from './features/portfolio/UnitSetupPage';
import { TenantsPage } from './features/tenants/TenantsPage';
import { TenantDetailPage } from './features/tenants/TenantDetailPage';
import { TenanciesPage } from './features/tenants/TenanciesPage';
import { LandlordsPage } from './features/landlords/LandlordsPage';
import { LandlordDetailPage } from './features/landlords/LandlordDetailPage';
import { InvoicesPage } from './features/billing/InvoicesPage';
import { InvoiceDetailPage } from './features/billing/InvoiceDetailPage';
import { InvoiceRunPage } from './features/billing/InvoiceRunPage';
import { MeterReadingsPage } from './features/billing/MeterReadingsPage';
import { ChargesPage } from './features/billing/ChargesPage';
import { PaymentsPage } from './features/payments/PaymentsPage';
import { PaymentDetailPage } from './features/payments/PaymentDetailPage';
import { PaymentChannelsPage } from './features/payments/PaymentChannelsPage';
import { ReconciliationPage } from './features/mpesa/ReconciliationPage';
import { InboundDetailPage } from './features/mpesa/InboundDetailPage';
import { ExpensesPage } from './features/expenses/ExpensesPage';
import { DashboardPage } from './features/reports/DashboardPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { AgreementsPage } from './features/agency/AgreementsPage';
import { OwnerStatementsPage } from './features/agency/OwnerStatementsPage';
import { RemittancesPage } from './features/agency/RemittancesPage';
import { RemittanceDetailPage } from './features/agency/RemittanceDetailPage';
import { PlanBillingPage } from './features/platform/PlanBillingPage';
import { AdminShell } from './features/admin/AdminShell';
import { OverviewPage as AdminOverviewPage } from './features/admin/OverviewPage';
import { OrganizationsPage as AdminOrganizationsPage } from './features/admin/OrganizationsPage';
import { OrganizationDetailPage as AdminOrganizationDetailPage } from './features/admin/OrganizationDetailPage';
import { PlansPage as AdminPlansPage } from './features/admin/PlansPage';
import { AdminInvoicesPage } from './features/admin/AdminInvoicesPage';
import { AdminSettingsPage } from './features/admin/AdminSettingsPage';
import {
  OwnerOverviewPage, OwnerPayoutsPage, OwnerShell, OwnerStatementsPage as OwnerPortalStatementsPage,
} from './features/owner/OwnerPortal';
import {
  TenantHomePage, TenantInvoicePage, TenantInvoicesPage, TenantPaymentsPage, TenantShell, TenantStatementPage,
} from './features/tenant/TenantPortal';

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
const BUILT: Record<string, { element: ReactNode; children?: { path: string; element: ReactNode }[] }> = {
  'settings/organization': { element: <OrganizationPage /> },
  'settings/users': { element: <UsersPage /> },
  'settings/roles': {
    element: <RolesPage />,
    children: [
      { path: 'new', element: <RoleEditorPage /> },
      { path: ':roleId', element: <RoleEditorPage /> },
    ],
  },
  'settings/audit': { element: <AuditLogPage /> },
  'settings/plan': { element: <PlanBillingPage /> },
  landlords: { element: <LandlordsPage />, children: [{ path: ':landlordId', element: <LandlordDetailPage /> }] },
  properties: { element: <PropertiesPage />, children: [{ path: ':propertyId', element: <PropertyDetailPage /> }] },
  units: { element: <UnitsPage />, children: [{ path: ':unitId', element: <UnitDetailPage /> }] },
  'unit-categories': { element: <UnitSetupPage /> },
  tenants: { element: <TenantsPage />, children: [{ path: ':tenantId', element: <TenantDetailPage /> }] },
  tenancies: { element: <TenanciesPage /> },
  // `invoices/run` is its own nav entry and route. React Router ranks the static `run`
  // above the dynamic `:invoiceId`, so the detail route never swallows it (tested in
  // routes.test.ts).
  invoices: { element: <InvoicesPage />, children: [{ path: ':invoiceId', element: <InvoiceDetailPage /> }] },
  'invoices/run': { element: <InvoiceRunPage /> },
  'meter-readings': { element: <MeterReadingsPage /> },
  charges: { element: <ChargesPage /> },
  payments: { element: <PaymentsPage />, children: [{ path: ':paymentId', element: <PaymentDetailPage /> }] },
  'payment-channels': { element: <PaymentChannelsPage /> },
  reconciliation: { element: <ReconciliationPage />, children: [{ path: ':inboundId', element: <InboundDetailPage /> }] },
  expenses: { element: <ExpensesPage /> },
  reports: { element: <ReportsPage /> },
  agreements: { element: <AgreementsPage /> },
  'owner-statements': { element: <OwnerStatementsPage /> },
  remittances: { element: <RemittancesPage />, children: [{ path: ':remittanceId', element: <RemittanceDetailPage /> }] },
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <StepUpProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/app" replace />} />
              <Route path="/login" element={<LoginPage />} />
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
                  return [
                    <Route key={page.to} path={path} element={guard(built.element)} />,
                    ...(built.children ?? []).map((child) => (
                      <Route key={`${page.to}/${child.path}`} path={`${path}/${child.path}`} element={guard(child.element)} />
                    )),
                  ];
                })}
                {/* Phase 0 spelled it the British way; keep old links working. */}
                <Route path="settings/organisation" element={<Navigate to="/app/settings/organization" replace />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>

              {/* The platform admin area: Hodi's own staff, its own shell (phase 8). */}
              <Route path="/admin" element={<RequireAdmin><AdminShell /></RequireAdmin>}>
                <Route index element={<AdminOverviewPage />} />
                <Route path="organizations" element={<AdminOrganizationsPage />} />
                <Route path="organizations/:organizationId" element={<AdminOrganizationDetailPage />} />
                <Route path="plans" element={<AdminPlansPage />} />
                <Route path="invoices" element={<AdminInvoicesPage />} />
                <Route path="settings" element={<AdminSettingsPage />} />
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
                <Route index element={<TenantHomePage />} />
                <Route path="invoices" element={<TenantInvoicesPage />} />
                <Route path="invoices/:invoiceId" element={<TenantInvoicePage />} />
                <Route path="statement" element={<TenantStatementPage />} />
                <Route path="payments" element={<TenantPaymentsPage />} />
                <Route path="*" element={<Navigate to="/tenant" replace />} />
              </Route>

              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </StepUpProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
