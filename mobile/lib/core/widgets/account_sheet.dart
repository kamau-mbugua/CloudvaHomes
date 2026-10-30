import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../features/tenant/tenant_api.dart';
import '../api/api_error.dart';
import '../auth/session_controller.dart';
import '../config.dart';
import '../theme_mode.dart';
import 'common.dart';

/// The account sheet, opened from the avatar in either mode: organisation and mode switch,
/// theme, sign out, app version.
class AccountSheet extends ConsumerWidget {
  const AccountSheet({super.key});

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => const AccountSheet(),
  );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final mode = ref.watch(modeProvider);
    if (session == null) return const SizedBox.shrink();
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final themeMode = ref.watch(themeModeProvider);

    Future<void> switchOrg(String id) async {
      final nav = Navigator.of(context);
      try {
        await ref.read(sessionProvider.notifier).switchOrganization(id);
        ref.read(appModeProvider.notifier).state = AppMode.staff;
        nav.pop();
      } on ApiError catch (e) {
        if (context.mounted) showMessage(context, e.message);
      }
    }

    final activeTenantId = ref.watch(currentTenantIdProvider);
    final contactParts = [
      if (session.user.phone != null && session.user.phone!.isNotEmpty)
        session.user.phone!,
      if (session.user.email != null && session.user.email!.isNotEmpty)
        session.user.email!,
    ];

    return ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        ListTile(
          leading: CircleAvatar(
            child: Text(
              session.user.initials,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          title: Text(
            session.user.fullName,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          subtitle: Text(contactParts.join(' · ')),
          trailing: StatusChip(
            mode == AppMode.tenant ? 'Tenant' : 'Staff',
            tone: Tone.good,
          ),
        ),
        if (session.organizations.isNotEmpty) ...[
          const Divider(),
          _Heading('Organisations', muted),
          for (final o in session.organizations)
            ListTile(
              leading: const Icon(Icons.apartment_outlined),
              title: Text(o.name),
              subtitle: Text(o.roleName),
              trailing:
                  mode == AppMode.staff &&
                      session.activeOrganization?.id == o.id
                  ? const Icon(Icons.check)
                  : null,
              onTap: () => switchOrg(o.id),
            ),
        ],
        if (session.isTenant) ...[
          const Divider(),
          _Heading('Where I rent', muted),
          if (session.tenantOf.length == 1)
            ListTile(
              leading: const Icon(Icons.home_outlined),
              title: const Text('My rent'),
              subtitle: Text(session.tenantOf.first.orgName),
              trailing: mode == AppMode.tenant ? const Icon(Icons.check) : null,
              onTap: () {
                ref.read(chosenTenantProvider.notifier).state =
                    session.tenantOf.first.tenantId;
                ref.read(appModeProvider.notifier).state = AppMode.tenant;
                Navigator.of(context).pop();
              },
            )
          else
            for (final t in session.tenantOf)
              ListTile(
                leading: const Icon(Icons.home_outlined),
                title: Text(t.orgName),
                subtitle: Text(t.name),
                trailing: mode == AppMode.tenant && activeTenantId == t.tenantId
                    ? const Icon(Icons.check)
                    : null,
                onTap: () {
                  ref.read(chosenTenantProvider.notifier).state = t.tenantId;
                  ref.read(appModeProvider.notifier).state = AppMode.tenant;
                  Navigator.of(context).pop();
                },
              ),
        ],
        const Divider(),
        _Heading('Appearance', muted),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: SegmentedButton<ThemeMode>(
            segments: const [
              ButtonSegment(value: ThemeMode.system, label: Text('Auto')),
              ButtonSegment(value: ThemeMode.light, label: Text('Light')),
              ButtonSegment(value: ThemeMode.dark, label: Text('Dark')),
            ],
            selected: {themeMode},
            onSelectionChanged: (s) =>
                ref.read(themeModeProvider.notifier).state = s.first,
          ),
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Sign out'),
          onTap: () async {
            Navigator.of(context).pop();
            await ref.read(sessionProvider.notifier).signOut();
          },
        ),
        FutureBuilder(
          future: PackageInfo.fromPlatform(),
          builder: (_, snap) => Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Hodi ${snap.data?.version ?? ''}${AppConfig.isProd ? '' : ' · ${AppConfig.flavor}'}',
              textAlign: TextAlign.center,
              style: TextStyle(color: muted, fontSize: 12),
            ),
          ),
        ),
      ],
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text, this.color);
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
    child: Text(
      text.toUpperCase(),
      style: TextStyle(
        color: color,
        fontSize: 12,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.6,
      ),
    ),
  );
}

/// The avatar button for app bars.
class AccountButton extends ConsumerWidget {
  const AccountButton({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionProvider).valueOrNull?.user;
    return IconButton(
      tooltip: 'Account',
      onPressed: () => AccountSheet.show(context),
      icon: CircleAvatar(
        radius: 15,
        child: Text(user?.initials ?? '', style: const TextStyle(fontSize: 12)),
      ),
    );
  }
}
