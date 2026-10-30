import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/navigation.dart';
import '../billing/plan_billing_screen.dart';
import 'home/home_screen.dart';
import 'money/money_screens.dart';
import 'more/expenses_screens.dart';
import 'more/meters_screen.dart';
import 'more/more_screen.dart';
import 'more/parity_screens.dart';
import 'tenants/tenants_screens.dart';
import 'units/units_screens.dart';

/// Staff mode (`/staff/...`): five tabs. Detail and form screens are routes under their
/// tab but open on the root navigator, so they cover the shell (one app bar, no tabs).
/// `/staff/billing` (Plan & billing) sits under Home, so the bill banner's "Pay now" works
/// from any tab.
RouteBase staffRoutes() => StatefulShellRoute.indexedStack(
  builder: (context, state, shell) => StaffShell(shell: shell),
  branches: [
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/staff',
          builder: (_, _) => const StaffHomeScreen(),
          routes: [
            GoRoute(
              path: 'billing',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, _) => const PlanBillingScreen(),
            ),
          ],
        ),
      ],
    ),
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/staff/units',
          builder: (_, _) => const UnitsScreen(),
          routes: [
            GoRoute(
              path: ':unitId',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, s) =>
                  UnitDetailScreen(unitId: s.pathParameters['unitId']!),
            ),
          ],
        ),
      ],
    ),
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/staff/tenants',
          builder: (_, _) => const TenantsScreen(),
          routes: [
            GoRoute(
              path: ':tenantId',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, s) =>
                  TenantDetailScreen(tenantId: s.pathParameters['tenantId']!),
            ),
          ],
        ),
      ],
    ),
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/staff/money',
          builder: (_, s) =>
              MoneyScreen(initialTab: s.uri.queryParameters['tab']),
          routes: [
            GoRoute(
              path: 'payments/:paymentId',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, s) => PaymentDetailScreen(
                paymentId: s.pathParameters['paymentId']!,
              ),
            ),
            GoRoute(
              path: 'invoices/:invoiceId',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, s) => InvoiceDetailScreen(
                invoiceId: s.pathParameters['invoiceId']!,
              ),
            ),
            GoRoute(
              path: 'mpesa/:inboundId',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, s) => InboundDetailScreen(
                inboundId: s.pathParameters['inboundId']!,
              ),
            ),
          ],
        ),
      ],
    ),
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/staff/more',
          builder: (_, _) => const MoreScreen(),
          routes: [
            GoRoute(
              path: 'maintenance',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, _) => const StaffMaintenanceScreen(),
            ),
            GoRoute(
              path: 'meters',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, _) => const MetersScreen(),
            ),
            GoRoute(
              path: 'expenses',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, _) => const ExpensesScreen(),
              routes: [
                GoRoute(
                  path: 'new',
                  parentNavigatorKey: rootNavigatorKey,
                  builder: (_, _) => const ExpenseFormScreen(),
                ),
              ],
            ),
            GoRoute(
              path: 'reports',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, _) => const StaffReportsScreen(),
            ),
            GoRoute(
              path: 'properties',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, _) => const StaffPropertiesScreen(),
            ),
            GoRoute(
              path: 'channels',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, _) => const StaffChannelsScreen(),
            ),
            GoRoute(
              path: 'charges',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, _) => const StaffChargesScreen(),
            ),
            GoRoute(
              path: 'agency',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, _) => const StaffAgencyScreen(),
            ),
            GoRoute(
              path: 'users',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, _) => const StaffUsersScreen(),
            ),
          ],
        ),
      ],
    ),
  ],
);

/// The bottom navigation around the five tabs.
class StaffShell extends StatelessWidget {
  const StaffShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: shell,
    bottomNavigationBar: NavigationBar(
      selectedIndex: shell.currentIndex,
      onDestinationSelected: (i) =>
          shell.goBranch(i, initialLocation: i == shell.currentIndex),
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home),
          label: 'Home',
        ),
        NavigationDestination(
          icon: Icon(Icons.door_front_door_outlined),
          selectedIcon: Icon(Icons.door_front_door),
          label: 'Units',
        ),
        NavigationDestination(
          icon: Icon(Icons.people_outline),
          selectedIcon: Icon(Icons.people),
          label: 'Tenants',
        ),
        NavigationDestination(
          icon: Icon(Icons.payments_outlined),
          selectedIcon: Icon(Icons.payments),
          label: 'Money',
        ),
        NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
      ],
    ),
  );
}
