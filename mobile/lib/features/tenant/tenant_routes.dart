import 'package:go_router/go_router.dart';

import '../../core/navigation.dart';
import 'tenant_dashboard_screen.dart';
import 'tenant_invoices_screen.dart';
import 'tenant_more_pages.dart';
import 'tenant_more_screen.dart';
import 'tenant_requests_screen.dart';
import 'tenant_shell.dart';

/// Tenant mode (`/tenant/...`, tenant portal redesign): 5 bottom tabs, plus Documents,
/// Notices and My profile as full-screen pages — Home, Bills,
/// Payments, Repairs, More. Bills and Payments open the ledger on its invoices / payments
/// tab; `/tenant/statement` opens its statement tab (reached from More).
List<RouteBase> tenantRoutes() => [
  StatefulShellRoute.indexedStack(
    builder: (_, _, shell) => TenantShell(shell: shell),
    branches: [
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/tenant',
            builder: (_, _) => const TenantDashboardScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/tenant/invoices',
            builder: (_, _) => const TenantLedgerScreen(initialTab: 0),
            routes: [
              GoRoute(
                path: ':invoiceId',
                parentNavigatorKey: rootNavigatorKey,
                builder: (_, state) => TenantInvoiceScreen(
                  invoiceId: state.pathParameters['invoiceId']!,
                ),
              ),
            ],
          ),
          GoRoute(
            path: '/tenant/statement',
            builder: (_, _) => const TenantLedgerScreen(initialTab: 2),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/tenant/payments',
            builder: (_, _) => const TenantLedgerScreen(initialTab: 1),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/tenant/requests',
            builder: (_, _) => const TenantRequestsScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/tenant/more',
            builder: (_, _) => const TenantMoreScreen(),
          ),
        ],
      ),
    ],
  ),
  // Full-screen pages opened from More: above the tabs, so outside the tab shell.
  GoRoute(
    path: '/tenant/documents',
    builder: (_, _) => const TenantDocumentsScreen(),
  ),
  GoRoute(
    path: '/tenant/notices',
    builder: (_, _) => const TenantNoticesScreen(),
  ),
  GoRoute(
    path: '/tenant/profile',
    builder: (_, _) => const TenantProfileScreen(),
  ),
];
