import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/widgets/account_sheet.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/notifications_sheet.dart';
import '../../core/widgets/side_drawer.dart';
import '../billing/billing_banner.dart';
import '../sms/sms_banner.dart';

class HostTabSpec {
  const HostTabSpec({
    required this.branchIndex,
    required this.label,
    required this.path,
    required this.icon,
    required this.selectedIcon,
  });

  final int branchIndex;
  final String label;
  final String path;
  final IconData icon;
  final IconData selectedIcon;
}

const allHostTabs = <HostTabSpec>[
  HostTabSpec(
    branchIndex: 0,
    label: 'Today',
    path: '/host',
    icon: Icons.today_outlined,
    selectedIcon: Icons.today,
  ),
  HostTabSpec(
    branchIndex: 1,
    label: 'Calendar',
    path: '/host/calendar',
    icon: Icons.calendar_month_outlined,
    selectedIcon: Icons.calendar_month,
  ),
  HostTabSpec(
    branchIndex: 2,
    label: 'Bookings',
    path: '/host/bookings',
    icon: Icons.book_online_outlined,
    selectedIcon: Icons.book_online,
  ),
  HostTabSpec(
    branchIndex: 3,
    label: 'Listings',
    path: '/host/listings',
    icon: Icons.bed_outlined,
    selectedIcon: Icons.bed,
  ),
  HostTabSpec(
    branchIndex: 4,
    label: 'More',
    path: '/host/more',
    icon: Icons.more_horiz,
    selectedIcon: Icons.more_horiz,
  ),
];

/// Filters the 5 host tabs by the session's permissions.
/// Caretakers see Today, Calendar and More.
List<HostTabSpec> visibleHostTabs(Set<String> permissions) {
  bool can(String p) => permissions.contains(p);
  final isCaretakerOnly =
      can('cleaning:update') &&
      !can('listings:update') &&
      !can('stay-payments:view');

  return [
    allHostTabs[0], // Today
    if (can('bookings:view')) allHostTabs[1], // Calendar
    if (can('bookings:create') || can('stay-payments:view'))
      allHostTabs[2], // Bookings
    if (can('listings:view') && !isCaretakerOnly) allHostTabs[3], // Listings
    allHostTabs[4], // More
  ];
}

class HostShell extends ConsumerWidget {
  const HostShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final perms = session?.permissions ?? const <String>{};
    final tabs = visibleHostTabs(perms);

    var selectedVisibleIndex = tabs.indexWhere(
      (t) => t.branchIndex == shell.currentIndex,
    );
    if (selectedVisibleIndex < 0) selectedVisibleIndex = 0;

    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedVisibleIndex,
        onDestinationSelected: (visibleIdx) {
          final targetBranch = tabs[visibleIdx].branchIndex;
          shell.goBranch(
            targetBranch,
            initialLocation: targetBranch == shell.currentIndex,
          );
        },
        destinations: [
          for (final t in tabs)
            NavigationDestination(
              icon: Icon(t.icon),
              selectedIcon: Icon(t.selectedIcon),
              label: t.label,
            ),
        ],
      ),
    );
  }
}

/// Standard tab scaffold for host mode screens.
class HostTabScaffold extends ConsumerWidget {
  const HostTabScaffold({
    super.key,
    required this.title,
    required this.body,
    this.actions = const [],
    this.floatingActionButton,
  });

  final String title;
  final Widget body;
  final List<Widget> actions;
  final Widget? floatingActionButton;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orgName = ref
        .watch(sessionProvider)
        .valueOrNull
        ?.activeOrganization
        ?.name;
    return Scaffold(
      drawer: const KodiHubSideDrawer(),
      appBar: KodiHubAppBar(
        title: Text(title),
        subtitle: orgName,
        actions: [
          ...actions,
          const NotificationButton(),
          const AccountButton(),
        ],
      ),
      floatingActionButton: floatingActionButton,
      body: Column(
        children: [
          const BillingBanner(),
          const SmsBanner(),
          Expanded(child: body),
        ],
      ),
    );
  }
}
