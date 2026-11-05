import 'package:go_router/go_router.dart';

import '../../core/navigation.dart';
import 'tenant_dashboard_screen.dart';
import 'tenant_invoices_screen.dart';
import 'tenant_more_pages.dart';
import 'tenant_more_screen.dart';
import 'tenant_requests_screen.dart';
import 'tenant_shell.dart';

/// Tenant mode (`/tenant/...`, tenant portal redesign): 5 bottom tabs — Home, Bills,
/// Payments, Repairs, More. Bills and Payments open the ledger on its invoices / payments
/// tab; `/tenant/statement` opens its statement tab (reached from More).
RouteBase tenantRoutes() => StatefulShellRoute.indexedStack(
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
        GoRoute(
          path: '/tenant/documents',
          parentNavigatorKey: rootNavigatorKey,
          builder: (_, _) => const TenantDocumentsScreen(),
        ),
        GoRoute(
          path: '/tenant/notices',
          parentNavigatorKey: rootNavigatorKey,
          builder: (_, _) => const TenantNoticesScreen(),
        ),
        GoRoute(
          path: '/tenant/profile',
          parentNavigatorKey: rootNavigatorKey,
          builder: (_, _) => const TenantProfileScreen(),
        ),
      ],
    ),
  ],
);
