import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/widgets/common.dart';
import 'auth_scaffold.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _id = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _sent = false;
  bool _busy = false;
  bool _hide = true;
  String? _error;

  @override
  void dispose() {
    _id.dispose();
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _resend() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(sessionProvider.notifier).forgotPassword(_id.text);
      if (mounted) showMessage(context, 'A fresh 6-digit code is on its way.');
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _go() async {
    if (_id.text.trim().isEmpty) {
      setState(() => _error = 'Enter your email address or phone number.');
      return;
    }
    if (_sent && _code.text.trim().length != 6) {
      setState(() => _error = 'Enter the 6-digit reset code.');
      return;
    }
    if (_sent && _password.text.length < 10) {
      setState(() => _error = 'New password must be at least 10 characters.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final auth = ref.read(sessionProvider.notifier);
    try {
      if (!_sent) {
        await auth.forgotPassword(_id.text);
        if (mounted) setState(() => _sent = true);
      } else {
        await auth.resetPassword(_id.text, _code.text, _password.text);
        if (!mounted) return;
        showMessage(
          context,
          'Password changed. Sign in with your new password.',
        );
        context.go('/sign-in');
      }
    } on ApiError catch (e) {
      if (mounted) {
        setState(
          () => _error =
              e.fieldErrors['newPassword'] ??
              e.fieldErrors['code'] ??
              e.message,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final target = _id.text.trim();
    final channelWord = target.contains('@') ? 'email' : 'SMS';
    return AuthScaffold(
      back: true,
      kicker: _sent ? 'Step 2 of 2 · New password' : 'Password reset',
      title: 'Reset your password',
      subtitle: _sent
          ? 'If $target has an account, a 6-digit reset code is on its way by $channelWord.'
          : 'We’ll send a 6-digit reset code to your phone or email.',
      children: [
        TextField(
          controller: _id,
          enabled: !_sent,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(labelText: 'Email or phone'),
        ),
        if (_sent) ...[
          const SizedBox(height: 16),
          SixDigitCodeField(controller: _code, labelText: 'Code'),
          const SizedBox(height: 16),
          TextField(
            controller: _password,
            obscureText: _hide,
            autofillHints: const [AutofillHints.newPassword],
            decoration: InputDecoration(
              labelText: 'New password',
              helperText: 'At least 10 characters.',
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
            onSubmitted: (_) => _go(),
          ),
        ],
        const SizedBox(height: 16),
        if (_error != null) ...[ErrorBox(_error!), const SizedBox(height: 12)],
        FilledButton(
          onPressed: _busy ? null : _go,
          child: Text(
            _busy ? 'Please wait…' : (_sent ? 'Set new password' : 'Send code'),
          ),
        ),
        if (_sent) ...[
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              TextButton(
                onPressed: _busy ? null : _resend,
                child: const Text('Send code again'),
              ),
              const Text('·'),
              TextButton(
                onPressed: _busy
                    ? null
                    : () => setState(() {
                        _sent = false;
                        _code.clear();
                        _password.clear();
                      }),
                child: const Text('Change email or phone'),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
