import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/widgets/common.dart';
import 'auth_scaffold.dart';

/// Phone → 6-digit code by SMS → signed in. How tenants sign in.
class CodeSignInScreen extends ConsumerStatefulWidget {
  const CodeSignInScreen({super.key});
  @override
  ConsumerState<CodeSignInScreen> createState() => _CodeSignInScreenState();
}

class _CodeSignInScreenState extends ConsumerState<CodeSignInScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  bool _sent = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on ApiError catch (e) {
      if (mounted) {
        setState(
          () => _error =
              e.fieldErrors['phone'] ?? e.fieldErrors['code'] ?? e.message,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _send() => _run(() async {
    if (_phone.text.trim().isEmpty) {
      throw ApiError(
        status: 0,
        code: 'LOCAL',
        message: 'Enter your phone number.',
      );
    }
    await ref.read(sessionProvider.notifier).requestCode(_phone.text);
    if (mounted) setState(() => _sent = true);
  });

  Future<void> _verify() => _run(() async {
    if (_code.text.trim().length != 6) {
      throw ApiError(
        status: 0,
        code: 'LOCAL',
        message: 'Enter the 6-digit code.',
      );
    }
    await ref
        .read(sessionProvider.notifier)
        .signInWithCode(_phone.text, _code.text);
  });

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      back: true,
      title: _sent ? 'Enter the code' : 'Sign in with a code',
      subtitle: _sent
          ? 'If ${_phone.text.trim()} has a Hodi account, a 6-digit code is on its way by SMS.'
          : 'We’ll text a 6-digit code to your phone.',
      children: [
        TextField(
          controller: _phone,
          enabled: !_sent,
          keyboardType: TextInputType.phone,
          autofillHints: const [AutofillHints.telephoneNumber],
          decoration: const InputDecoration(
            labelText: 'Phone number',
            hintText: '0712 345 678',
          ),
        ),
        if (_sent) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _code,
            autofocus: true,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            style: const TextStyle(fontSize: 22, letterSpacing: 6),
            decoration: const InputDecoration(labelText: 'Code'),
            onSubmitted: (_) => _verify(),
          ),
        ],
        const SizedBox(height: 16),
        if (_error != null) ...[ErrorBox(_error!), const SizedBox(height: 12)],
        FilledButton(
          onPressed: _busy ? null : (_sent ? _verify : _send),
          child: Text(
            _busy ? 'Please wait…' : (_sent ? 'Sign in' : 'Send code'),
          ),
        ),
        if (_sent)
          TextButton(
            onPressed: _busy
                ? null
                : () => setState(() {
                    _sent = false;
                    _code.clear();
                  }),
            child: const Text('Use another number or send again'),
          ),
      ],
    );
  }
}
