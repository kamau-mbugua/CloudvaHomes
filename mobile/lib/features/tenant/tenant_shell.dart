import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/account_sheet.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/notifications_sheet.dart';
import '../../core/widgets/side_drawer.dart';
import 'home_scope_widgets.dart';
import 'tenant_api.dart';

/// The tenant tabs (tenant portal redesign), in the design's order.
const tenantTabs =
    <({String label, String path, IconData icon, IconData selected})>[
      (
        label: 'Home',
        path: '/tenant',
        icon: Icons.home_outlined,
        selected: Icons.home,
      ),
      (
        label: 'Bills',
        path: '/tenant/invoices',
        icon: Icons.receipt_long_outlined,
        selected: Icons.receipt_long,
      ),
      (
        label: 'Payments',
        path: '/tenant/payments',
        icon: Icons.payments_outlined,
        selected: Icons.payments,
      ),
      (
        label: 'Repairs',
        path: '/tenant/requests',
        icon: Icons.handyman_outlined,
        selected: Icons.handyman,
      ),
      (
        label: 'More',
        path: '/tenant/more',
        icon: Icons.menu,
        selected: Icons.menu_open,
      ),
    ];

/// Tenant mode: bottom tabs, the organisation's name on top, account switch when they rent
/// from more than one place.
class TenantShell extends ConsumerWidget {
  const TenantShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final accounts = session.valueOrNull?.tenantOf ?? const [];
    final currentId = ref.watch(currentTenantIdProvider);
    final current = accounts.where((a) => a.tenantId == currentId).firstOrNull;
    return Scaffold(
      drawer: const KodiHubSideDrawer(),
      appBar: KodiHubAppBar(
        loading: session.isLoading,
        subtitle: current?.name,
        title: const _ShellTitle(),
        actions: const [NotificationButton(), AccountButton()],
      ),
      body: Column(
        children: [
          const HomeScopeStrip(),
          Expanded(child: shell),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) =>
            shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: [
          for (final t in tenantTabs)
            NavigationDestination(
              icon: Icon(t.icon),
              selectedIcon: Icon(t.selected),
              label: t.label,
            ),
        ],
      ),
    );
  }
}

/// The landlord's name with one home, the home switcher with several.
class _ShellTitle extends ConsumerWidget {
  const _ShellTitle();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final homes = ref.watch(allHomesProvider).valueOrNull?.homes ?? const [];
    final lived = homes
        .where((h) => h.status == 'ACTIVE' || h.status == 'NOTICE')
        .length;
    if (lived > 1) {
      return const Align(
        alignment: Alignment.centerLeft,
        child: HomeSwitcherChip(),
      );
    }
    final session = ref.watch(sessionProvider);
    final accounts = session.valueOrNull?.tenantOf ?? const [];
    final currentId = ref.watch(currentTenantIdProvider);
    final current = accounts.where((a) => a.tenantId == currentId).firstOrNull;
    return Text(current?.orgName ?? 'KodiHub');
  }
}
