import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  String? _error;

  @override
  void dispose() {
    _id.dispose();
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _go() async {
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
    return AuthScaffold(
      back: true,
      title: 'Reset your password',
      subtitle: _sent
          ? 'If that account exists, a 6-digit code is on its way.'
          : 'We’ll send a code to your phone or email.',
      children: [
        TextField(
          controller: _id,
          enabled: !_sent,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(labelText: 'Email or phone'),
        ),
        if (_sent) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            decoration: const InputDecoration(labelText: 'Code'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _password,
            obscureText: true,
            autofillHints: const [AutofillHints.newPassword],
            decoration: const InputDecoration(
              labelText: 'New password',
              helperText: 'At least 10 characters.',
            ),
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
      ],
    );
  }
}
