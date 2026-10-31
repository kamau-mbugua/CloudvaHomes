import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/owner/owner_screens.dart';
import '../../features/tenant/tenant_api.dart';
import '../auth/session_controller.dart';
import '../theme.dart';
import 'account_sheet.dart';
import 'brand_mark.dart';

/// C2.1 Dark-blue (`#002B4D`) side navigation drawer with `#84BD00` lime active accent.
/// Adapts its navigation links to the active portal mode (`Staff`, `Tenant`, `Owner`, `Platform`).
class KodiHubSideDrawer extends ConsumerWidget {
  const KodiHubSideDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final mode = ref.watch(modeProvider);
    final location = GoRouterState.of(context).matchedLocation;

    String workspaceTitle = 'KodiHub';
    String workspaceSubtitle = session?.user.fullName ?? '';
    String modeBadge = 'Staff';

    switch (mode) {
      case AppMode.staff:
        final org = session?.activeOrganization;
        final membership = session?.organizations
            .where((o) => o.id == org?.id)
            .firstOrNull;
        workspaceTitle = org?.name ?? 'KodiHub';
        workspaceSubtitle =
            membership?.roleName ?? session?.user.fullName ?? 'Staff';
        modeBadge = 'Staff';
      case AppMode.tenant:
        final accounts = session?.tenantOf ?? const [];
        final currentId = ref.watch(currentTenantIdProvider);
        final current = accounts
            .where((a) => a.tenantId == currentId)
            .firstOrNull;
        workspaceTitle = current?.orgName ?? 'Tenant Portal';
        workspaceSubtitle = current?.name ?? session?.user.fullName ?? 'Tenant';
        modeBadge = 'Tenant';
      case AppMode.owner:
        final owners = session?.ownerOf ?? const [];
        final currentId = ref.watch(currentOwnerIdProvider);
        final current = owners
            .where((o) => o.landlordId == currentId)
            .firstOrNull;
        workspaceTitle = current?.orgName ?? 'Owner Portal';
        workspaceSubtitle = current?.name ?? session?.user.fullName ?? 'Owner';
        modeBadge = 'Owner';
      case AppMode.platform:
        workspaceTitle = 'KodiHub Platform';
        workspaceSubtitle = session?.user.platformRole ?? 'Platform Operator';
        modeBadge = 'Platform';
      case null:
        break;
    }

    bool can(String perm) => session?.can(perm) ?? false;

    final sections = switch (mode) {
      AppMode.tenant => [
        _DrawerSection(
          title: 'MY TENANCY',
          items: const [
            _DrawerItem(
              icon: Icons.home_outlined,
              label: 'Home',
              route: '/tenant',
              exactMatch: true,
            ),
            _DrawerItem(
              icon: Icons.receipt_long_outlined,
              label: 'Invoices',
              route: '/tenant/invoices',
            ),
            _DrawerItem(
              icon: Icons.payments_outlined,
              label: 'Payments & Receipts',
              route: '/tenant/payments',
            ),
            _DrawerItem(
              icon: Icons.description_outlined,
              label: 'Statement',
              route: '/tenant/statement',
            ),
            _DrawerItem(
              icon: Icons.handyman_outlined,
              label: 'Repairs',
              route: '/tenant/requests',
            ),
          ],
        ),
      ],
      AppMode.owner => [
        _DrawerSection(
          title: 'OWNER PORTAL',
          items: const [
            _DrawerItem(
              icon: Icons.dashboard_outlined,
              label: 'Overview',
              route: '/owner',
              exactMatch: true,
            ),
            _DrawerItem(
              icon: Icons.description_outlined,
              label: 'Statements',
              route: '/owner/statements',
            ),
            _DrawerItem(
              icon: Icons.account_balance_wallet_outlined,
              label: 'Payouts',
              route: '/owner/payouts',
            ),
          ],
        ),
      ],
      AppMode.platform => [
        _DrawerSection(
          title: 'PLATFORM ADMIN',
          items: const [
            _DrawerItem(
              icon: Icons.dashboard_outlined,
              label: 'Overview',
              route: '/platform',
              exactMatch: true,
            ),
            _DrawerItem(
              icon: Icons.domain_outlined,
              label: 'Organisations',
              route: '/platform/orgs',
            ),
            _DrawerItem(
              icon: Icons.admin_panel_settings_outlined,
              label: 'Plans, Billing & Operators',
              route: '/platform/manage',
            ),
          ],
        ),
      ],
      _ => [
        _DrawerSection(
          title: 'OPERATIONS',
          items: [
            const _DrawerItem(
              icon: Icons.today_outlined,
              label: 'Today',
              route: '/staff',
              exactMatch: true,
            ),
            if (can('tenants:view'))
              const _DrawerItem(
                icon: Icons.people_outline,
                label: 'Tenants',
                route: '/staff/tenants',
              ),
            if (can('units:view'))
              const _DrawerItem(
                icon: Icons.apartment_outlined,
                label: 'Units',
                route: '/staff/units',
              ),
            if (can('payments:view') || can('invoices:view'))
              const _DrawerItem(
                icon: Icons.payments_outlined,
                label: 'Money',
                route: '/staff/money',
              ),
          ],
        ),
        _DrawerSection(
          title: 'PORTFOLIO & TOOLS',
          items: [
            if (can('properties:view'))
              const _DrawerItem(
                icon: Icons.domain_outlined,
                label: 'Properties',
                route: '/staff/more/properties',
              ),
            if (can('meters:view') || can('meters:record'))
              const _DrawerItem(
                icon: Icons.speed_outlined,
                label: 'Meter readings',
                route: '/staff/more/meters',
              ),
            if (can('expenses:view'))
              const _DrawerItem(
                icon: Icons.receipt_outlined,
                label: 'Expenses',
                route: '/staff/more/expenses',
              ),
            if (can('reports:view'))
              const _DrawerItem(
                icon: Icons.insights_outlined,
                label: 'Reports (P&L, Arrears)',
                route: '/staff/more/reports',
              ),
            if (can('maintenance:view'))
              const _DrawerItem(
                icon: Icons.handyman_outlined,
                label: 'Maintenance',
                route: '/staff/more/maintenance',
              ),
            if (can('messages:view'))
              const _DrawerItem(
                icon: Icons.campaign_outlined,
                label: 'Communication',
                route: '/staff/more/messages',
              ),
          ],
        ),
        _DrawerSection(
          title: 'ORGANISATION',
          items: [
            if (can('charges:view'))
              const _DrawerItem(
                icon: Icons.tune_outlined,
                label: 'Charges',
                route: '/staff/more/charges',
              ),
            if (can('landlords:view') ||
                can('statements:view') ||
                can('payouts:view'))
              const _DrawerItem(
                icon: Icons.handshake_outlined,
                label: 'Agency & Landlords',
                route: '/staff/more/agency',
              ),
            if (can('users:view'))
              const _DrawerItem(
                icon: Icons.badge_outlined,
                label: 'Team & Roles',
                route: '/staff/more/users',
              ),
            if (can('org:view') || can('billing:view') || can('mpesa:view'))
              const _DrawerItem(
                icon: Icons.settings_outlined,
                label: 'Settings & Billing',
                route: '/staff/more/settings',
              ),
            const _DrawerItem(
              icon: Icons.grid_view_outlined,
              label: 'All tools (More)',
              route: '/staff/more',
              exactMatch: true,
            ),
          ],
        ),
      ],
    };

    return Drawer(
      backgroundColor: HodiColors.navy,
      surfaceTintColor: Colors.transparent,
      width: 304,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Brand header + workspace switcher
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 16, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const KodiHubMark(size: 32, tone: BrandTone.navy),
                      const SizedBox(width: 10),
                      const Expanded(
                        child: KodiHubWordmark(
                          fontSize: 21,
                          tone: BrandTone.navy,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: HodiColors.lime.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: HodiColors.lime.withValues(alpha: 0.45),
                          ),
                        ),
                        child: Text(
                          modeBadge.toUpperCase(),
                          style: const TextStyle(
                            fontFamily: 'JetBrainsMono',
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.1,
                            color: HodiColors.lime,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () {
                      Navigator.of(context).pop();
                      AccountSheet.show(context);
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.12),
                        ),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  workspaceTitle,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  workspaceSubtitle,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Color(0xFFB5C4D8),
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.10),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.swap_horiz_rounded,
                                  size: 14,
                                  color: Colors.white,
                                ),
                                SizedBox(width: 4),
                                Text(
                                  'Switch',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (session != null &&
                      [
                            session.isStaff,
                            session.isTenant,
                            session.isOwner,
                            session.isPlatformAdmin,
                          ].where((x) => x).length >
                          1) ...[
                    const SizedBox(height: 10),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          if (session.isStaff)
                            _DrawerModePill(
                              icon: Icons.work_outline,
                              label: 'Work (Staff)',
                              selected: mode == AppMode.staff,
                              onTap: () {
                                Navigator.of(context).pop();
                                ref.read(appModeProvider.notifier).state =
                                    AppMode.staff;
                              },
                            ),
                          if (session.isTenant)
                            _DrawerModePill(
                              icon: Icons.home_outlined,
                              label: 'My rent (Tenant)',
                              selected: mode == AppMode.tenant,
                              onTap: () {
                                Navigator.of(context).pop();
                                ref.read(appModeProvider.notifier).state =
                                    AppMode.tenant;
                              },
                            ),
                          if (session.isOwner)
                            _DrawerModePill(
                              icon: Icons.real_estate_agent_outlined,
                              label: 'Owner',
                              selected: mode == AppMode.owner,
                              onTap: () {
                                Navigator.of(context).pop();
                                ref.read(appModeProvider.notifier).state =
                                    AppMode.owner;
                              },
                            ),
                          if (session.isPlatformAdmin)
                            _DrawerModePill(
                              icon: Icons.admin_panel_settings_outlined,
                              label: 'Platform',
                              selected: mode == AppMode.platform,
                              onTap: () {
                                Navigator.of(context).pop();
                                ref.read(appModeProvider.notifier).state =
                                    AppMode.platform;
                              },
                            ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            // 3dp Lime Rule under header
            Container(height: 2, color: HodiColors.lime),
            // Navigation sections
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 12,
                ),
                children: [
                  for (final section in sections)
                    if (section.items.isNotEmpty) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
                        child: Text(
                          section.title,
                          style: const TextStyle(
                            fontFamily: 'JetBrainsMono',
                            fontSize: 10.5,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.4,
                            color: Color(0xFF9EAEC4),
                          ),
                        ),
                      ),
                      for (final item in section.items)
                        _DrawerNavTile(
                          item: item,
                          selected: item.exactMatch
                              ? location == item.route
                              : (location == item.route ||
                                    location.startsWith('${item.route}/')),
                          onTap: () {
                            Navigator.of(context).pop();
                            if (location != item.route) {
                              context.go(item.route);
                            }
                          },
                        ),
                      const SizedBox(height: 6),
                    ],
                ],
              ),
            ),
            // Footer
            Container(
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: Colors.white.withValues(alpha: 0.10)),
                ),
              ),
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              child: Row(
                children: [
                  Expanded(
                    child: TextButton.icon(
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.white,
                        alignment: Alignment.centerLeft,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                      ),
                      icon: const Icon(
                        Icons.manage_accounts_outlined,
                        size: 18,
                        color: Color(0xFFD7E0EC),
                      ),
                      label: Text(
                        session?.user.fullName ?? 'Account & theme',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFFD7E0EC),
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      onPressed: () {
                        Navigator.of(context).pop();
                        AccountSheet.show(context);
                      },
                    ),
                  ),
                  IconButton(
                    tooltip: 'Sign out',
                    icon: const Icon(
                      Icons.logout_rounded,
                      size: 19,
                      color: Color(0xFFD7E0EC),
                    ),
                    onPressed: () {
                      Navigator.of(context).pop();
                      ref.read(sessionProvider.notifier).signOut();
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DrawerSection {
  const _DrawerSection({required this.title, required this.items});
  final String title;
  final List<_DrawerItem> items;
}

class _DrawerItem {
  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.route,
    this.exactMatch = false,
  });
  final IconData icon;
  final String label;
  final String route;
  final bool exactMatch;
}

class _DrawerNavTile extends StatelessWidget {
  const _DrawerNavTile({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final _DrawerItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fg = selected ? Colors.white : const Color(0xFFD7E0EC);
    final iconColor = selected ? HodiColors.lime : const Color(0xFFB5C4D8);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Material(
        color: selected
            ? HodiColors.lime.withValues(alpha: 0.14)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border(
                left: BorderSide(
                  color: selected ? HodiColors.lime : Colors.transparent,
                  width: 3,
                ),
              ),
            ),
            child: Row(
              children: [
                Icon(item.icon, size: 20, color: iconColor),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    item.label,
                    style: TextStyle(
                      color: fg,
                      fontSize: 14,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                ),
                if (selected)
                  Container(
                    width: 6,
                    height: 6,
                    decoration: const BoxDecoration(
                      color: HodiColors.lime,
                      shape: BoxShape.circle,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DrawerModePill extends StatelessWidget {
  const _DrawerModePill({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: Material(
        color: selected
            ? HodiColors.lime
            : Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  icon,
                  size: 13.5,
                  color: selected ? HodiColors.navy : Colors.white,
                ),
                const SizedBox(width: 5),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: selected ? HodiColors.navy : Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
