import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../features/owner/owner_screens.dart';
import '../../features/tenant/tenant_api.dart';
import '../api/api_error.dart';
import '../auth/session_controller.dart';
import '../config.dart';
import '../theme.dart';
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
      if (session.user.email != null && session.user.email!.isNotEmpty)
        session.user.email!,
      if (session.user.phone != null && session.user.phone!.isNotEmpty)
        session.user.phone!,
    ];

    return ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      children: [
        Kicker(
          'Signed in as ${contactParts.isNotEmpty ? contactParts.first : session.user.fullName}',
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: Text(
                'Where do you want to go?',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.5,
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white
                      : HodiColors.navy,
                ),
              ),
            ),
            StatusChip(switch (mode) {
              AppMode.tenant => 'Tenant',
              AppMode.owner => 'Owner',
              _ => 'Staff',
            }, tone: Tone.good),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'You can switch between these any time from the top corner.',
          style: TextStyle(fontSize: 13.5, color: muted),
        ),
        if (session.organizations.isNotEmpty) ...[
          const SizedBox(height: 16),
          _Heading('Work · Organisations', muted),
          for (final o in session.organizations)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _AccountDestCard(
                badge: InitialsBadge(
                  name: _initialsOf(o.name),
                  size: 44,
                  radius: 12,
                  fontSize: 14,
                  lime: false,
                ),
                title: o.name,
                subtitle: o.roleName,
                pill: StatusChip(o.roleName, tone: Tone.good),
                selected:
                    mode == AppMode.staff &&
                    session.activeOrganization?.id == o.id,
                onTap: () => switchOrg(o.id),
              ),
            ),
        ],
        if (session.isTenant) ...[
          const SizedBox(height: 12),
          _Heading('Home · Where I rent', muted),
          if (session.tenantOf.length == 1)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _AccountDestCard(
                badge: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: HodiColors.paper2,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.home_outlined,
                    color: HodiColors.navy,
                  ),
                ),
                title: 'My rent',
                subtitle: session.tenantOf.first.orgName,
                selected: mode == AppMode.tenant,
                onTap: () {
                  ref.read(chosenTenantProvider.notifier).state =
                      session.tenantOf.first.tenantId;
                  ref.read(appModeProvider.notifier).state = AppMode.tenant;
                  Navigator.of(context).pop();
                },
              ),
            )
          else
            for (final t in session.tenantOf)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _AccountDestCard(
                  badge: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: HodiColors.paper2,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.home_outlined,
                      color: HodiColors.navy,
                    ),
                  ),
                  title: t.orgName,
                  subtitle: t.name,
                  selected:
                      mode == AppMode.tenant && activeTenantId == t.tenantId,
                  onTap: () {
                    ref.read(chosenTenantProvider.notifier).state = t.tenantId;
                    ref.read(appModeProvider.notifier).state = AppMode.tenant;
                    Navigator.of(context).pop();
                  },
                ),
              ),
        ],
        if (session.isOwner) ...[
          const SizedBox(height: 12),
          _Heading('Where I own property', muted),
          for (final o in session.ownerOf)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _AccountDestCard(
                badge: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: HodiColors.paper2,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.domain_outlined,
                    color: HodiColors.navy,
                  ),
                ),
                title: o.name,
                subtitle: o.orgName,
                selected:
                    mode == AppMode.owner &&
                    ref.watch(currentOwnerIdProvider) == o.landlordId,
                onTap: () {
                  ref.read(chosenOwnerProvider.notifier).state = o.landlordId;
                  ref.read(appModeProvider.notifier).state = AppMode.owner;
                  Navigator.of(context).pop();
                },
              ),
            ),
        ],
        const SizedBox(height: 12),
        _Heading('Account & preferences', muted),
        Card(
          child: Column(
            children: [
              ListTile(
                leading: Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: HodiColors.paper2,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.manage_accounts_outlined,
                    size: 19,
                    color: HodiColors.navy,
                  ),
                ),
                title: Text(
                  session.user.fullName,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: const Text('Profile & password'),
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () {
                  Navigator.of(context).pop();
                  _ProfileAndPasswordSheet.show(context);
                },
              ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Appearance',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: muted,
                      ),
                    ),
                    const SizedBox(height: 8),
                    SegmentedButton<ThemeMode>(
                      segments: const [
                        ButtonSegment(
                          value: ThemeMode.system,
                          label: Text('Auto'),
                        ),
                        ButtonSegment(
                          value: ThemeMode.light,
                          label: Text('Light'),
                        ),
                        ButtonSegment(
                          value: ThemeMode.dark,
                          label: Text('Dark'),
                        ),
                      ],
                      selected: {themeMode},
                      onSelectionChanged: (s) =>
                          ref.read(themeModeProvider.notifier).state = s.first,
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              ListTile(
                leading: Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: HodiColors.dangerSoft,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.logout,
                    size: 19,
                    color: HodiColors.danger,
                  ),
                ),
                title: const Text(
                  'Sign out',
                  style: TextStyle(
                    color: HodiColors.danger,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                onTap: () async {
                  Navigator.of(context).pop();
                  await ref.read(sessionProvider.notifier).signOut();
                },
              ),
            ],
          ),
        ),
        FutureBuilder(
          future: PackageInfo.fromPlatform(),
          builder: (_, snap) => Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              'kodihub ${snap.data?.version ?? '1.0.0'}${AppConfig.isProd ? '' : ' · ${AppConfig.flavor}'}',
              textAlign: TextAlign.center,
              style: TextStyle(color: muted, fontSize: 11.5),
            ),
          ),
        ),
      ],
    );
  }
}

String _initialsOf(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.isEmpty) return 'KH';
  if (parts.length == 1) {
    return parts.first
        .substring(0, parts.first.length.clamp(1, 2))
        .toUpperCase();
  }
  return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
}

class _AccountDestCard extends StatelessWidget {
  const _AccountDestCard({
    required this.badge,
    required this.title,
    required this.subtitle,
    this.pill,
    required this.selected,
    required this.onTap,
  });
  final Widget badge;
  final String title;
  final String subtitle;
  final Widget? pill;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerLowest,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(
          color: selected ? HodiColors.limeText : scheme.outlineVariant,
          width: selected ? 1.5 : 1.0,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              badge,
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 12.5,
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              if (pill != null) ...[pill!, const SizedBox(width: 6)],
              Icon(
                selected ? Icons.check_circle : Icons.chevron_right,
                size: 20,
                color: selected ? HodiColors.limeText : scheme.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text, this.color);
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
    child: Text(
      text.toUpperCase(),
      style: TextStyle(
        fontFamily: 'JetBrainsMono',
        color: color,
        fontSize: 10.5,
        fontWeight: FontWeight.w600,
        letterSpacing: 1.4,
      ),
    ),
  );
}

/// The avatar button for app bars (`#84BD00` circle with `#002B4D` bold initials).
class AccountButton extends ConsumerWidget {
  const AccountButton({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionProvider).valueOrNull?.user;
    return IconButton(
      tooltip: 'Account',
      onPressed: () => AccountSheet.show(context),
      icon: CircleAvatar(
        radius: 16,
        backgroundColor: HodiColors.lime,
        foregroundColor: HodiColors.navy,
        child: Text(
          user?.initials ?? '',
          style: const TextStyle(
            fontFamily: 'Lufga',
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _ProfileAndPasswordSheet extends ConsumerStatefulWidget {
  const _ProfileAndPasswordSheet();

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => const _ProfileAndPasswordSheet(),
  );

  @override
  ConsumerState<_ProfileAndPasswordSheet> createState() =>
      _ProfileAndPasswordSheetState();
}

class _ProfileAndPasswordSheetState
    extends ConsumerState<_ProfileAndPasswordSheet> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _currentPw = TextEditingController();
  final _newPw = TextEditingController();
  bool _savingProfile = false;
  bool _savingPw = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final u = ref.read(sessionProvider).valueOrNull?.user;
    if (u != null) {
      _first.text = u.firstName;
      _last.text = u.lastName;
    }
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _currentPw.dispose();
    _newPw.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    if (_first.text.trim().isEmpty || _last.text.trim().isEmpty) {
      setState(() => _error = 'Enter your first and last name.');
      return;
    }
    setState(() {
      _savingProfile = true;
      _error = null;
    });
    try {
      await ref
          .read(sessionProvider.notifier)
          .updateProfile(firstName: _first.text, lastName: _last.text);
      if (mounted) showMessage(context, 'Profile updated.');
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _savingProfile = false);
    }
  }

  Future<void> _savePassword() async {
    if (_currentPw.text.isEmpty || _newPw.text.length < 10) {
      setState(
        () => _error =
            'Enter your current password and a new password of 10+ characters.',
      );
      return;
    }
    setState(() {
      _savingPw = true;
      _error = null;
    });
    try {
      await ref
          .read(sessionProvider.notifier)
          .changePassword(
            currentPassword: _currentPw.text,
            newPassword: _newPw.text,
          );
      _currentPw.clear();
      _newPw.clear();
      if (mounted) showMessage(context, 'Password changed.');
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _savingPw = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        4,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Profile & password',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _first,
                    decoration: const InputDecoration(labelText: 'First name'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _last,
                    decoration: const InputDecoration(labelText: 'Last name'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _savingProfile ? null : _saveProfile,
              child: Text(_savingProfile ? 'Saving…' : 'Save name'),
            ),
            const Divider(height: 32),
            Text(
              'Change password',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _currentPw,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Current password'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _newPw,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'New password (10+ characters)',
              ),
            ),
            const SizedBox(height: 12),
            if (_error != null) ...[
              ErrorBox(_error!),
              const SizedBox(height: 12),
            ],
            OutlinedButton(
              onPressed: _savingPw ? null : _savePassword,
              child: Text(_savingPw ? 'Updating…' : 'Update password'),
            ),
          ],
        ),
      ),
    );
  }
}
