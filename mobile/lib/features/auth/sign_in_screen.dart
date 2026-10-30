import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
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
  bool _hide = true;
  String? _error;

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

  Future<void> _verifyTwoFactor() async {
    if (_twoFactorCode.text.trim().length != 6) {
      setState(() => _error = 'Enter the 6-digit verification code.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
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
        title: 'Two-step verification',
        subtitle:
            'Enter the 6-digit code sent by $channelWord to ${challenge.destinationMasked}.',
        children: [
          TextField(
            controller: _twoFactorCode,
            autofocus: true,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            style: const TextStyle(fontSize: 22, letterSpacing: 6),
            decoration: const InputDecoration(labelText: 'Verification code'),
            onSubmitted: (_) => _verifyTwoFactor(),
          ),
          const SizedBox(height: 16),
          if (_error != null) ...[
            ErrorBox(_error!),
            const SizedBox(height: 12),
          ],
          FilledButton(
            onPressed: _busy ? null : _verifyTwoFactor,
            child: Text(_busy ? 'Verifying…' : 'Verify & sign in'),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _busy
                ? null
                : () => setState(() {
                    _challenge = null;
                    _error = null;
                    _twoFactorCode.clear();
                  }),
            child: const Text('Use a different account'),
          ),
        ],
      );
    }

    return AuthScaffold(
      title: 'Sign in',
      subtitle: 'Rent, invoices and payments in one place.',
      children: [
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
        const SizedBox(height: 8),
        Text(
          'Tenants: receive a 6-digit code by SMS or email using the contact your landlord or agent has on file.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            fontSize: 13,
          ),
        ),
      ],
    );
  }
}
