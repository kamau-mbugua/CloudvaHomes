import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/legal.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_scaffold.dart';

/// Deleting your own account (Google Play requires it in the app). Says plainly what goes and
/// what the organisations keep, then confirms with a one-time code to the person's own phone
/// or email, whichever way they sign in.
class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  static Future<void> open(BuildContext context) => Navigator.of(
    context,
    rootNavigator: true,
  ).push(MaterialPageRoute<void>(builder: (_) => const DeleteAccountScreen()));

  @override
  ConsumerState<DeleteAccountScreen> createState() =>
      _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  final _reason = TextEditingController();
  final _code = TextEditingController();
  bool _understood = false;
  bool _sent = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(sessionProvider.notifier).requestStepUp();
      if (mounted) setState(() => _sent = true);
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    if (_code.text.trim().length != 6) {
      setState(() => _error = 'Enter the 6-digit code.');
      return;
    }
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    final session = ref.read(sessionProvider.notifier);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final grant = await session.verifyStepUp(_code.text);
      await session.deleteAccount(stepUpToken: grant, reason: _reason.text);
      messenger.showSnackBar(
        const SnackBar(content: Text('Your KodiHQ account has been deleted.')),
      );
      if (nav.canPop()) nav.pop();
    } on ApiError catch (e) {
      if (mounted) {
        setState(() => _error = e.fieldErrors['code'] ?? e.message);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).valueOrNull?.user;
    final scheme = Theme.of(context).colorScheme;
    final sendTo = (user?.phone?.isNotEmpty ?? false)
        ? 'your phone ${user!.phone}'
        : 'your email ${user?.email ?? ''}';
    return Scaffold(
      appBar: AppBar(title: const Text('Delete account')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Delete your KodiHQ account?',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w600,
                  color: scheme.onSurface,
                ),
              ),
              const SizedBox(height: 6),
              if (user != null)
                Text(
                  [
                    user.fullName,
                    if (user.email != null) user.email!,
                    if (user.phone != null) user.phone!,
                  ].join(' · '),
                  style: TextStyle(color: scheme.onSurfaceVariant),
                ),
              const SizedBox(height: 16),
              const _Point(
                icon: Icons.logout,
                text:
                    'You’re signed out on every phone and computer, and can’t sign in to this account again.',
              ),
              const _Point(
                icon: Icons.person_off_outlined,
                text:
                    'Your email, phone number and password are removed from the account, so they’re free to use for a new one later.',
              ),
              const _Point(
                icon: Icons.receipt_long_outlined,
                text:
                    'Landlords, agencies and hosts you deal with keep their own records about you, like invoices, receipts, payments and bookings, as the law requires.',
              ),
              const _Point(
                icon: Icons.admin_panel_settings_outlined,
                text:
                    'If you’re the only owner of an organisation, make someone else an owner first.',
              ),
              const SizedBox(height: 4),
              Text.rich(
                TextSpan(
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.45,
                    color: scheme.onSurfaceVariant,
                  ),
                  children: [
                    const TextSpan(
                      text:
                          'Our privacy policy explains how long the rest is kept. To ask for a copy of your data, or for it to be erased, email ',
                    ),
                    TextSpan(
                      text: privacyEmail,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const TextSpan(text: '.'),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _reason,
                enabled: !_sent,
                maxLength: 500,
                maxLines: 3,
                minLines: 1,
                decoration: const InputDecoration(
                  labelText: 'Why are you leaving? (optional)',
                ),
              ),
              CheckboxListTile(
                key: const Key('delete-understood'),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _understood,
                onChanged: _sent
                    ? null
                    : (v) => setState(() => _understood = v ?? false),
                title: const Text(
                  'I understand this can’t be undone from the app.',
                  style: TextStyle(fontSize: 14),
                ),
              ),
              if (_sent) ...[
                const SizedBox(height: 8),
                Text(
                  'We sent a 6-digit code to $sendTo.',
                  style: TextStyle(color: scheme.onSurfaceVariant),
                ),
                const SizedBox(height: 10),
                SixDigitCodeField(
                  controller: _code,
                  labelText: 'Code',
                  onSubmitted: (_) => _delete(),
                ),
              ],
              const SizedBox(height: 16),
              if (_error != null) ...[
                ErrorBox(_error!),
                const SizedBox(height: 12),
              ],
              FilledButton(
                key: const Key('delete-account-go'),
                style: FilledButton.styleFrom(
                  backgroundColor: HodiColors.danger,
                  foregroundColor: Colors.white,
                ),
                onPressed: _busy || !_understood
                    ? null
                    : (_sent ? _delete : _sendCode),
                child: KodiHubButtonChild(
                  loading: _busy,
                  label: _sent
                      ? 'Delete my account'
                      : 'Send me a code to confirm',
                  loadingLabel: _sent ? 'Deleting…' : 'Sending code…',
                  tone: SpinnerTone.light,
                ),
              ),
              if (_sent)
                TextButton(
                  onPressed: _busy ? null : _sendCode,
                  child: const Text('Send the code again'),
                ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _busy ? null : () => Navigator.of(context).pop(),
                child: const Text('Keep my account'),
              ),
              const SizedBox(height: 12),
              const LegalLinks(),
            ],
          ),
        ),
      ),
    );
  }
}

class _Point extends StatelessWidget {
  const _Point({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: scheme.onSurfaceVariant),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 14, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}
