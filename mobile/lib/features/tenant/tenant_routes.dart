import 'package:go_router/go_router.dart';

import '../../core/navigation.dart';
import 'tenant_home_screen.dart';
import 'tenant_invoices_screen.dart';
import 'tenant_requests_screen.dart';
import 'tenant_shell.dart';

/// Tenant mode (`/tenant/...`): 3 bottom nav branches (`Home`, `Statements`, `Repairs`).
/// Deep links `/tenant/invoices`, `/tenant/payments`, and `/tenant/statement` all open
/// the unified [TenantLedgerScreen] on the corresponding segmented tab.
RouteBase tenantRoutes() => StatefulShellRoute.indexedStack(
  builder: (_, _, shell) => TenantShell(shell: shell),
  branches: [
    StatefulShellBranch(
      routes: [
        GoRoute(path: '/tenant', builder: (_, _) => const TenantHomeScreen()),
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
          path: '/tenant/payments',
          builder: (_, _) => const TenantLedgerScreen(initialTab: 1),
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
          path: '/tenant/requests',
          builder: (_, _) => const TenantRequestsScreen(),
        ),
      ],
    ),
  ],
);
