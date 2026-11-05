import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme_mode.dart';
import 'tenant_api.dart';

/// The More tab (tenant portal redesign): Statement, Documents, Notices, My profile,
/// theme and sign out.
class TenantMoreScreen extends ConsumerWidget {
  const TenantMoreScreen({super.key});

  static const pages = <({String label, String path, IconData icon})>[
    (
      label: 'Statement',
      path: '/tenant/statement',
      icon: Icons.receipt_outlined,
    ),
    (
      label: 'Documents',
      path: '/tenant/documents',
      icon: Icons.folder_outlined,
    ),
    (label: 'Notices', path: '/tenant/notices', icon: Icons.notifications_none),
    (label: 'My profile', path: '/tenant/profile', icon: Icons.person_outline),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    return ListView(
      children: [
        for (final p in pages)
          ListTile(
            leading: Icon(p.icon),
            title: Text(p.label),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(p.path),
          ),
        const Divider(),
        SwitchListTile(
          secondary: const Icon(Icons.dark_mode_outlined),
          title: const Text('Dark theme'),
          value: dark,
          onChanged: (on) => ref.read(themeModeProvider.notifier).state = on
              ? ThemeMode.dark
              : ThemeMode.light,
        ),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Sign out'),
          onTap: () => ref.read(sessionProvider.notifier).signOut(),
        ),
      ],
    );
  }
}
