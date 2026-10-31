import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import 'auth_scaffold.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});
  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _id = TextEditingController();
  final _password = TextEditingController();
  final _twoFactorCode = TextEditingController();
  TwoFactorChallenge? _challenge;
  bool _busy = false;
  bool _resending = false;
  bool _hide = true;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    _id.dispose();
    _password.dispose();
    _twoFactorCode.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_id.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter your email or phone and your password.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final challenge = await ref
          .read(sessionProvider.notifier)
          .signInWithPassword(_id.text, _password.text);
      if (challenge != null && mounted) {
        setState(() {
          _challenge = challenge;
          _twoFactorCode.clear();
        });
      }
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resendTwoFactor() async {
    setState(() {
      _resending = true;
      _error = null;
      _notice = null;
    });
    try {
      final challenge = await ref
          .read(sessionProvider.notifier)
          .signInWithPassword(_id.text, _password.text);
      if (challenge != null && mounted) {
        setState(() {
          _challenge = challenge;
          _twoFactorCode.clear();
          _notice = 'A new 6-digit code has been sent.';
        });
      }
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  Future<void> _verifyTwoFactor() async {
    if (_twoFactorCode.text.trim().length != 6) {
      setState(() => _error = 'Enter the 6-digit verification code.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await ref
          .read(sessionProvider.notifier)
          .verifyTwoFactor(_challenge!.challengeToken, _twoFactorCode.text);
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
    final challenge = _challenge;
    if (challenge != null) {
      final channelWord = challenge.channel == 'SMS' ? 'SMS' : 'email';
      return AuthScaffold(
        kicker: 'Step 2 of 2 · Verify',
        title: 'Two-step verification',
        subtitle:
            'Enter the 6-digit code sent by $channelWord to ${challenge.destinationMasked}.',
        onBack: () => setState(() {
          _challenge = null;
          _error = null;
          _notice = null;
          _twoFactorCode.clear();
        }),
        children: [
          SixDigitCodeField(
            controller: _twoFactorCode,
            labelText: 'Verification code',
            onSubmitted: (_) => _verifyTwoFactor(),
          ),
          const SizedBox(height: 16),
          if (_notice != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFEEF6DB),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF84BD00)),
              ),
              child: Text(
                _notice!,
                style: const TextStyle(color: Color(0xFF3D5509)),
              ),
            ),
            const SizedBox(height: 12),
          ],
          if (_error != null) ...[
            ErrorBox(_error!),
            const SizedBox(height: 12),
          ],
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              TextButton(
                onPressed: (_busy || _resending) ? null : _resendTwoFactor,
                child: Text(_resending ? 'Sending…' : 'Resend code'),
              ),
              TextButton(
                onPressed: (_busy || _resending)
                    ? null
                    : () => setState(() {
                        _challenge = null;
                        _error = null;
                        _notice = null;
                        _twoFactorCode.clear();
                      }),
                child: const Text('Use a different account'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: (_busy || _resending) ? null : _verifyTwoFactor,
            child: Text(_busy ? 'Verifying…' : 'Verify & sign in'),
          ),
        ],
      );
    }

    final appConfig = ref.watch(appConfigProvider).valueOrNull;
    return AuthScaffold(
      kicker: 'Sign in',
      title: 'Welcome back',
      subtitle:
          'Use the email or phone your organisation or landlord has for you.',
      children: [
        if (appConfig?.maintenanceMode == true) ...[
          const ErrorBox(
            'Hodi is currently in maintenance mode. Only platform administrators can sign in right now.',
          ),
          const SizedBox(height: 12),
        ],
        if (appConfig?.forceUpdateRequired == true) ...[
          ErrorBox(
            'Please update the Hodi app${appConfig?.minimumMobileVersion != null ? ' to v${appConfig!.minimumMobileVersion} or newer' : ''} for the latest features.',
          ),
          const SizedBox(height: 12),
        ],
        TextField(
          controller: _id,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [
            AutofillHints.username,
            AutofillHints.email,
            AutofillHints.telephoneNumber,
          ],
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(labelText: 'Email or phone'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          obscureText: _hide,
          autofillHints: const [AutofillHints.password],
          onSubmitted: (_) => _submit(),
          decoration: InputDecoration(
            labelText: 'Password',
            suffixIcon: IconButton(
              tooltip: _hide ? 'Show password' : 'Hide password',
              icon: Icon(
                _hide
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
              ),
              onPressed: () => setState(() => _hide = !_hide),
            ),
          ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () => context.push('/forgot'),
            child: const Text('Forgot password?'),
          ),
        ),
        if (_error != null) ...[ErrorBox(_error!), const SizedBox(height: 12)],
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: Text(_busy ? 'Signing in…' : 'Sign in'),
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            const Expanded(child: Divider()),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                'or',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            const Expanded(child: Divider()),
          ],
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          icon: const Icon(Icons.key_outlined),
          label: const Text('Sign in with a one-time code'),
          onPressed: () => context.push('/sign-in/code'),
        ),
        const SizedBox(height: 18),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(18),
                onTap: () => context.push('/sign-in/code'),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainerLowest,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                      color: Theme.of(context).colorScheme.outlineVariant,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'I’m a tenant',
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Your landlord adds your phone or email. Sign in with a 6-digit code.',
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.4,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (appConfig?.allowPublicSignup != false) ...[
              const SizedBox(width: 10),
              Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: () => context.push('/register'),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: HodiColors.limeSoft,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: HodiColors.limeText.withValues(alpha: 0.25),
                      ),
                    ),
                    child: const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'I manage property',
                          style: TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                            color: HodiColors.limeHover,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Landlord or letting agency? Start a free trial in a minute.',
                          style: TextStyle(
                            fontSize: 12,
                            height: 1.4,
                            color: HodiColors.limeHover,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
        if (appConfig?.allowPublicSignup != false) ...[
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => context.push('/register'),
            child: const Text('Landlord or agency? Create an organisation'),
          ),
        ],
      ],
    );
  }
}
