import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/session_controller.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/account_sheet.dart';
import '../../../core/widgets/common.dart';
import '../staff_widgets.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final activeOrg = session?.activeOrganization;
    final activeMembership = session?.organizations
        .where((o) => o.id == activeOrg?.id)
        .firstOrNull;
    final user = session?.user;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final scheme = Theme.of(context).colorScheme;

    final dayToDay = <_MoreItem>[
      if (can(ref, 'maintenance:view'))
        _MoreItem(
          icon: Icons.handyman_outlined,
          title: 'Maintenance & repairs',
          subtitle: 'Track tenant repair requests and convert to expenses',
          onTap: () => context.push('/staff/more/maintenance'),
          limeIcon: true,
        ),
      if (can(ref, 'meters:view'))
        _MoreItem(
          icon: Icons.speed_outlined,
          title: 'Meter readings',
          subtitle: 'Read water and power meters, with a photo',
          onTap: () => context.push('/staff/more/meters'),
          limeIcon: true,
        ),
      if (can(ref, 'expenses:view'))
        _MoreItem(
          icon: Icons.receipt_outlined,
          title: 'Expenses',
          subtitle: 'See and add expenses, with receipt photos',
          onTap: () => context.push('/staff/more/expenses'),
          limeIcon: true,
        ),
      if (can(ref, 'reports:view'))
        _MoreItem(
          icon: Icons.bar_chart_outlined,
          title: 'Reports',
          subtitle: 'Property P&L, arrears and occupancy',
          onTap: () => context.push('/staff/more/reports'),
          limeIcon: true,
        ),
    ];

    final setup = <_MoreItem>[
      if (can(ref, 'properties:view'))
        _MoreItem(
          icon: Icons.apartment_outlined,
          title: 'Properties',
          subtitle: 'Buildings and estates in your portfolio',
          onTap: () => context.push('/staff/more/properties'),
        ),
      if (can(ref, 'channels:view'))
        _MoreItem(
          icon: Icons.account_balance_outlined,
          title: 'Payment channels',
          subtitle: 'M-Pesa paybills, tills, bank and cash',
          onTap: () => context.push('/staff/more/channels'),
        ),
      if (can(ref, 'charges:view'))
        _MoreItem(
          icon: Icons.bolt_outlined,
          title: 'Charges catalogue',
          subtitle: 'Water, garbage, service charge and rates',
          onTap: () => context.push('/staff/more/charges'),
        ),
      if (activeOrg?.kind == 'AGENCY' && can(ref, 'landlords:view'))
        _MoreItem(
          icon: Icons.domain_outlined,
          title: 'Landlords & payouts',
          subtitle: 'Agency landlords and monthly remittances',
          onTap: () => context.push('/staff/more/agency'),
        ),
      if (can(ref, 'users:view'))
        _MoreItem(
          icon: Icons.badge_outlined,
          title: 'Team & roles',
          subtitle: 'Staff members and permissions',
          onTap: () => context.push('/staff/more/users'),
        ),
      if (can(ref, 'settings:view'))
        _MoreItem(
          icon: Icons.workspace_premium_outlined,
          title: 'Plan & billing',
          subtitle: 'Your Hodi plan and bill',
          onTap: () => context.push('/staff/billing'),
        ),
    ];

    return StaffTabScaffold(
      title: 'More',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          if (user != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    InitialsBadge(
                      name: user.fullName,
                      size: 48,
                      radius: 16,
                      backgroundColor: HodiColors.lime,
                      foregroundColor: HodiColors.navy,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user.fullName,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: dark ? Colors.white : HodiColors.navy,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            [
                              if (activeMembership != null &&
                                  activeMembership.roleName.isNotEmpty)
                                activeMembership.roleName,
                              if (activeOrg?.name != null) activeOrg!.name,
                            ].join(' · '),
                            style: TextStyle(
                              fontSize: 12,
                              color: scheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: () => AccountSheet.show(context),
                      style: TextButton.styleFrom(
                        backgroundColor: dark
                            ? HodiColors.surfaceDark
                            : HodiColors.stone,
                        foregroundColor: dark ? Colors.white : HodiColors.navy,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: const Text(
                        'Switch',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
          if (dayToDay.isNotEmpty) ...[
            const Padding(
              padding: EdgeInsets.only(left: 4, bottom: 8),
              child: Kicker('Day to day'),
            ),
            _MoreGroup(items: dayToDay),
            const SizedBox(height: 16),
          ],
          if (setup.isNotEmpty) ...[
            const Padding(
              padding: EdgeInsets.only(left: 4, bottom: 8),
              child: Kicker('Setup'),
            ),
            _MoreGroup(items: setup),
            const SizedBox(height: 16),
          ],
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 8),
            child: Kicker('Account'),
          ),
          _MoreGroup(
            items: [
              _MoreItem(
                icon: Icons.manage_accounts_outlined,
                title: 'Account & preferences',
                subtitle: 'Password, 2FA, theme and workspace switcher',
                onTap: () => AccountSheet.show(context),
              ),
              _MoreItem(
                icon: Icons.logout,
                title: 'Sign out',
                subtitle: 'End session on this device',
                danger: true,
                onTap: () => ref.read(sessionProvider.notifier).signOut(),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MoreItem {
  const _MoreItem({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.limeIcon = false,
    this.danger = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool limeIcon;
  final bool danger;
}

class _MoreGroup extends StatelessWidget {
  const _MoreGroup({required this.items});
  final List<_MoreItem> items;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Card(
      child: Column(
        children: [
          for (final (idx, item) in items.indexed) ...[
            if (idx > 0) const Divider(height: 1),
            ListTile(
              leading: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: item.danger
                      ? const Color(0xFFFDECEC)
                      : item.limeIcon
                      ? (dark ? HodiColors.limeSoftDark : HodiColors.limeSoft)
                      : (dark ? HodiColors.surfaceDark : HodiColors.stone),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  item.icon,
                  size: 18,
                  color: item.danger
                      ? HodiColors.danger
                      : item.limeIcon
                      ? (dark ? HodiColors.lime : HodiColors.limeText)
                      : (dark ? Colors.white : HodiColors.navy),
                ),
              ),
              title: Text(
                item.title,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13.5,
                  color: item.danger
                      ? HodiColors.danger
                      : (dark ? Colors.white : HodiColors.navy),
                ),
              ),
              subtitle: Text(
                item.subtitle,
                style: const TextStyle(fontSize: 11.5),
              ),
              trailing: item.danger
                  ? null
                  : const Icon(Icons.chevron_right, size: 20),
              onTap: item.onTap,
            ),
          ],
        ],
      ),
    );
  }
}
