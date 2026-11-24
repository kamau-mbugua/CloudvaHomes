import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/dates.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';

/// A device where this account is signed in (phase 26).
class DeviceSession {
  DeviceSession({
    required this.id,
    required this.device,
    this.ip,
    required this.signedInAt,
    required this.lastActiveAt,
    required this.current,
  });
  final String id;
  final String device;
  final String? ip;
  final String signedInAt;
  final String lastActiveAt;
  final bool current;

  factory DeviceSession.fromJson(Map<String, dynamic> j) => DeviceSession(
    id: j['id'] as String,
    device: j['device'] as String? ?? 'Unknown device',
    ip: j['ip'] as String?,
    signedInAt: j['signedInAt'] as String,
    lastActiveAt: j['lastActiveAt'] as String,
    current: j['current'] == true,
  );
}

final deviceSessionsProvider = FutureProvider.autoDispose<List<DeviceSession>>((
  ref,
) async {
  final res = await ref.watch(apiClientProvider).get('/me/sessions');
  return [
    for (final e in res['data'] as List)
      DeviceSession.fromJson(e as Map<String, dynamic>),
  ];
});

/// "Your devices": where this account is signed in, with a sign-out for each.
class DevicesScreen extends ConsumerWidget {
  const DevicesScreen({super.key});

  static Future<void> open(BuildContext context) => Navigator.of(
    context,
    rootNavigator: true,
  ).push(MaterialPageRoute<void>(builder: (_) => const DevicesScreen()));

  Future<void> _signOut(
    BuildContext context,
    WidgetRef ref,
    DeviceSession s,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(
          s.current ? 'Sign out of this phone?' : 'Sign out ${s.device}?',
        ),
        content: Text(
          s.current
              ? 'You’ll need to sign in again here.'
              : 'That device will need to sign in again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      if (s.current) {
        await ref.read(sessionProvider.notifier).signOut();
        if (context.mounted) Navigator.of(context).pop();
        return;
      }
      await ref
          .read(apiClientProvider)
          .delete('/me/sessions/${Uri.encodeComponent(s.id)}');
      ref.invalidate(deviceSessionsProvider);
      if (context.mounted) showMessage(context, '${s.device} was signed out.');
    } on ApiError catch (e) {
      if (context.mounted) showMessage(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = ref.watch(deviceSessionsProvider);
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(title: const Text('Your devices')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(deviceSessionsProvider.future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            Text(
              'Where your account is signed in. Sign out anything you don’t recognise, then change your password.',
              style: TextStyle(color: muted),
            ),
            const SizedBox(height: 12),
            AsyncBody(
              value: sessions,
              onRetry: () => ref.invalidate(deviceSessionsProvider),
              data: (list) => Column(
                children: [
                  for (final s in list)
                    Card(
                      child: ListTile(
                        key: Key('device-${s.id}'),
                        leading: Icon(
                          s.device == 'KodiHQ app'
                              ? Icons.phone_android
                              : Icons.computer_outlined,
                        ),
                        title: Text(
                          s.current ? '${s.device} · this device' : s.device,
                        ),
                        subtitle: Text(
                          'Last active ${formatTimestamp(s.lastActiveAt)}${s.ip != null ? ' · ${s.ip}' : ''}',
                        ),
                        trailing: TextButton(
                          key: Key('device-signout-${s.id}'),
                          onPressed: () => _signOut(context, ref, s),
                          child: const Text('Sign out'),
                        ),
                      ),
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
