import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/widgets/account_sheet.dart';
import 'tenant_api.dart';

/// Tenant mode: bottom tabs, the organisation's name on top, account switch when they rent
/// from more than one place.
class TenantShell extends ConsumerWidget {
  const TenantShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accounts =
        ref.watch(sessionProvider).valueOrNull?.tenantOf ?? const [];
    final currentId = ref.watch(currentTenantIdProvider);
    final current = accounts.where((a) => a.tenantId == currentId).firstOrNull;
    return Scaffold(
      appBar: AppBar(
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
                        current?.orgName ?? 'Hodi',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const Icon(Icons.arrow_drop_down),
                  ],
                ),
              )
            : Text(current?.orgName ?? 'Hodi'),
        actions: const [AccountButton()],
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
            label: 'Invoices',
          ),
          NavigationDestination(
            icon: Icon(Icons.payments_outlined),
            selectedIcon: Icon(Icons.payments),
            label: 'Payments',
          ),
          NavigationDestination(
            icon: Icon(Icons.list_alt_outlined),
            selectedIcon: Icon(Icons.list_alt),
            label: 'Statement',
          ),
        ],
      ),
    );
  }
}
