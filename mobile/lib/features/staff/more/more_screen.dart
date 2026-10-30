import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/session_controller.dart';
import '../staff_widgets.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeOrg = ref
        .watch(sessionProvider)
        .valueOrNull
        ?.activeOrganization;
    return StaffTabScaffold(
      title: 'More',
      body: ListView(
        children: [
          if (can(ref, 'maintenance:view'))
            ListTile(
              leading: const Icon(Icons.handyman_outlined),
              title: const Text('Maintenance & repairs'),
              subtitle: const Text(
                'Track tenant repair requests and convert to expenses',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/staff/more/maintenance'),
            ),
          if (can(ref, 'meters:view'))
            ListTile(
              leading: const Icon(Icons.speed_outlined),
              title: const Text('Meter readings'),
              subtitle: const Text('Read water and power meters, with a photo'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/staff/more/meters'),
            ),
          if (can(ref, 'expenses:view'))
            ListTile(
              leading: const Icon(Icons.receipt_outlined),
              title: const Text('Expenses'),
              subtitle: const Text('See and add expenses, with receipt photos'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/staff/more/expenses'),
            ),
          if (can(ref, 'reports:view'))
            ListTile(
              leading: const Icon(Icons.bar_chart_outlined),
              title: const Text('Reports'),
              subtitle: const Text('Property P&L, arrears and occupancy'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/staff/more/reports'),
            ),
          const Divider(),
          if (can(ref, 'properties:view'))
            ListTile(
              leading: const Icon(Icons.apartment_outlined),
              title: const Text('Properties'),
              subtitle: const Text('Buildings and estates in your portfolio'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/staff/more/properties'),
            ),
          if (can(ref, 'channels:view'))
            ListTile(
              leading: const Icon(Icons.account_balance_outlined),
              title: const Text('Payment channels'),
              subtitle: const Text('M-Pesa paybills, tills, bank and cash'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/staff/more/channels'),
            ),
          if (can(ref, 'charges:view'))
            ListTile(
              leading: const Icon(Icons.bolt_outlined),
              title: const Text('Charges catalogue'),
              subtitle: const Text('Water, garbage, service charge and rates'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/staff/more/charges'),
            ),
          if (activeOrg?.kind == 'AGENCY' && can(ref, 'landlords:view'))
            ListTile(
              leading: const Icon(Icons.domain_outlined),
              title: const Text('Landlords & payouts'),
              subtitle: const Text('Agency landlords and monthly remittances'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/staff/more/agency'),
            ),
          if (can(ref, 'users:view'))
            ListTile(
              leading: const Icon(Icons.badge_outlined),
              title: const Text('Team & roles'),
              subtitle: const Text('Staff members and permissions'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/staff/more/users'),
            ),
          if (can(ref, 'settings:view'))
            ListTile(
              leading: const Icon(Icons.workspace_premium_outlined),
              title: const Text('Plan & billing'),
              subtitle: const Text('Your Hodi plan and bill'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/staff/billing'),
            ),
        ],
      ),
    );
  }
}
