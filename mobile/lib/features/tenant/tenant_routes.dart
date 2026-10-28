import 'package:go_router/go_router.dart';

import '../../core/navigation.dart';
import 'tenant_home_screen.dart';
import 'tenant_invoices_screen.dart';
import 'tenant_payments_screen.dart';
import 'tenant_shell.dart';
import 'tenant_statement_screen.dart';

/// Tenant mode (`/tenant/...`).
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
          builder: (_, _) => const TenantInvoicesScreen(),
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
      ],
    ),
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/tenant/payments',
          builder: (_, _) => const TenantPaymentsScreen(),
        ),
      ],
    ),
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/tenant/statement',
          builder: (_, _) => const TenantStatementScreen(),
        ),
      ],
    ),
  ],
);
