import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../staff_api.dart';
import '../staff_widgets.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return StaffTabScaffold(
      title: 'More',
      body: ListView(
        children: [
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
          if (can(ref, 'settings:view'))
            ListTile(
              leading: const Icon(Icons.workspace_premium_outlined),
              title: const Text('Plan & billing'),
              subtitle: const Text('Your Hodi plan and bill'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/staff/billing'),
            ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.open_in_new),
            title: const Text('Open the web app for setup'),
            subtitle: Text(
              'Properties, units, charges, payment channels, users and reports are set up on the web.',
              style: TextStyle(color: muted),
            ),
            onTap: () => launchOrSay(context, Uri.parse(webOrigin())),
          ),
        ],
      ),
    );
  }
}
