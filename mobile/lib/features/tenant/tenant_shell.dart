import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/account_sheet.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/notifications_sheet.dart';
import '../../core/widgets/side_drawer.dart';
import 'tenant_api.dart';

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
        title: accounts.length > 1
            ? PopupMenuButton<String>(
                tooltip: 'Switch account',
                onSelected: (id) =>
                    ref.read(chosenTenantProvider.notifier).state = id,
                itemBuilder: (_) => [
                  for (final a in accounts)
                    PopupMenuItem(
                      value: a.tenantId,
                      child: Text('${a.orgName} · ${a.name}'),
                    ),
                ],
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Flexible(
                      child: Text(
                        current?.orgName ?? 'KodiHub',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const Icon(Icons.arrow_drop_down),
                  ],
                ),
              )
            : Text(current?.orgName ?? 'KodiHub'),
        actions: const [NotificationButton(), AccountButton()],
      ),
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
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'Statements',
          ),
          NavigationDestination(
            icon: Icon(Icons.handyman_outlined),
            selectedIcon: Icon(Icons.handyman),
            label: 'Repairs',
          ),
        ],
      ),
    );
  }
}
