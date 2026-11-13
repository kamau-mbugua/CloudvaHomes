import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/theme.dart';
import '../../core/widgets/account_sheet.dart';
import '../../core/widgets/common.dart';
import '../staff/staff_widgets.dart';
import 'host_shell.dart';

class HostMoreScreen extends ConsumerWidget {
  const HostMoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final activeOrg = session?.activeOrganization;
    final user = session?.user;

    final operations =
        <({IconData icon, String title, String subtitle, VoidCallback onTap})>[
          if (can(ref, 'cleaning:view'))
            (
              icon: Icons.cleaning_services_outlined,
              title: 'Cleaning',
              subtitle: 'Turnover cleaning tasks after guest check-out',
              onTap: () => context.push('/host/cleaning'),
            ),
          if (can(ref, 'guests:view'))
            (
              icon: Icons.people_outline,
              title: 'Guests',
              subtitle: 'Guest directory, stay history and notes',
              onTap: () => context.push('/host/guests'),
            ),
          if (can(ref, 'stay-payments:view'))
            (
              icon: Icons.receipt_long_outlined,
              title: 'Receipts',
              subtitle: 'Every guest receipt: preview, send again, download',
              onTap: () => context.push('/host/receipts'),
            ),
          if (can(ref, 'expenses:view'))
            (
              icon: Icons.receipt_outlined,
              title: 'Expenses',
              subtitle: 'Record property and per-unit expenses',
              onTap: () => context.push('/host/expenses'),
            ),
          if (can(ref, 'reports:view'))
            (
              icon: Icons.bar_chart_outlined,
              title: 'Reports',
              subtitle: 'Occupancy, ADR, RevPAR and net profit per unit',
              onTap: () => context.push('/host/reports'),
            ),
          if (can(ref, 'maintenance:view'))
            (
              icon: Icons.handyman_outlined,
              title: 'Maintenance & repairs',
              subtitle: 'Track unit repairs and issues',
              onTap: () => context.push('/host/maintenance'),
            ),
        ];

    final setup =
        <({IconData icon, String title, String subtitle, VoidCallback onTap})>[
          if (can(ref, 'site:view'))
            (
              icon: Icons.language_outlined,
              title: 'Booking site',
              subtitle: 'Web address, booking rules and contact details',
              onTap: () => context.push('/host/site'),
            ),
          if (can(ref, 'settings:view'))
            (
              icon: Icons.workspace_premium_outlined,
              title: 'Plan & billing',
              subtitle: 'Your KodiHub plan and monthly bill',
              onTap: () => context.push('/host/billing'),
            ),
          if (can(ref, 'sms:view'))
            (
              icon: Icons.sms_outlined,
              title: 'SMS',
              subtitle: 'SMS units, usage and how your messages are sent',
              onTap: () => context.push('/host/sms'),
            ),
        ];

    return HostTabScaffold(
      title: 'More',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          if (user != null) ...[
            Card(
              child: ListTile(
                leading: InitialsBadge(
                  name: user.fullName,
                  size: 44,
                  radius: 14,
                  backgroundColor: HodiColors.lime,
                  foregroundColor: HodiColors.navy,
                ),
                title: Text(
                  user.fullName,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(activeOrg?.name ?? 'Short-stay host'),
                trailing: TextButton(
                  onPressed: () => AccountSheet.show(context),
                  child: const Text('Switch'),
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
          if (operations.isNotEmpty) ...[
            const Padding(
              padding: EdgeInsets.only(left: 4, bottom: 8),
              child: Kicker('Operations'),
            ),
            Card(
              child: Column(
                children: [
                  for (var i = 0; i < operations.length; i++) ...[
                    if (i > 0) const Divider(height: 1),
                    ListTile(
                      leading: Icon(operations[i].icon),
                      title: Text(operations[i].title),
                      subtitle: Text(operations[i].subtitle),
                      trailing: const Icon(Icons.chevron_right, size: 20),
                      onTap: operations[i].onTap,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
          if (setup.isNotEmpty) ...[
            const Padding(
              padding: EdgeInsets.only(left: 4, bottom: 8),
              child: Kicker('Setup'),
            ),
            Card(
              child: Column(
                children: [
                  for (var i = 0; i < setup.length; i++) ...[
                    if (i > 0) const Divider(height: 1),
                    ListTile(
                      leading: Icon(setup[i].icon),
                      title: Text(setup[i].title),
                      subtitle: Text(setup[i].subtitle),
                      trailing: const Icon(Icons.chevron_right, size: 20),
                      onTap: setup[i].onTap,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
