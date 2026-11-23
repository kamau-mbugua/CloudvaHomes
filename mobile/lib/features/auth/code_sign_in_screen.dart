import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/widgets/common.dart';
import 'auth_scaffold.dart';
import '../../core/auth/token_store.dart';
import 'saved_logins.dart';
import 'sign_in_method.dart';
import '../../core/widgets/phone_field.dart';

/// Phone or email → 6-digit code by SMS or email → signed in. How tenants sign in.
/// Sign-in without a password: a 6-digit code by SMS or email (picked on the sign-in page).
class CodeSignInScreen extends ConsumerStatefulWidget {
  const CodeSignInScreen({super.key, this.method, this.initialIdentifier});

  /// Phone + code or email + code; null takes either.
  final SignInMethod? method;

  /// Filled in already (a saved login picked on the sign-in page).
  final String? initialIdentifier;

  @override
  ConsumerState<CodeSignInScreen> createState() => _CodeSignInScreenState();
}

class _CodeSignInScreenState extends ConsumerState<CodeSignInScreen>
    with SavedLoginsState<CodeSignInScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  bool _sent = false;
  bool _busy = false;
  String? _error;

  @override
  SignInMethod? get loginMethod => widget.method;
  @override
  TextEditingController get loginField => _phone;
  @override
  bool get mayPromptSaved => !_sent && _phone.text.isEmpty;
  @override
  void setRestoring(bool busy) => setState(() => _busy = busy);
  @override
  void onSavedLoginFilled(SavedCredential login) =>
      setState(() => _error = null);

  @override
  void initState() {
    super.initState();
    final initial = widget.initialIdentifier;
    if (initial != null && initial.isNotEmpty) _phone.text = initial;
    loadSavedLogins(autoOpen: true);
  }

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
    final problem = widget.method?.problem(_phone.text);
    if (problem != null) {
      throw ApiError(status: 0, code: 'LOCAL', message: problem);
    }
    if (_phone.text.trim().isEmpty) {
      throw ApiError(
        status: 0,
        code: 'LOCAL',
        message: 'Enter your phone number or email address.',
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
    await rememberLogin(_phone.text);
  });

  @override
  Widget build(BuildContext context) {
    final target = _phone.text.trim();
    final channelWord = target.contains('@') ? 'email' : 'SMS';
    return AuthScaffold(
      back: true,
      kicker: _sent ? 'Step 2 of 2 · Verify' : 'Step 1 of 2 · One-time code',
      title: _sent ? 'Enter the 6-digit code' : 'Sign in with a code',
      subtitle: _sent
          ? 'If $target has a KodiHQ account, a 6-digit code is on its way by $channelWord.'
          : switch (widget.method?.byEmail) {
              true => 'No password needed: we’ll email you a 6-digit code.',
              false => 'No password needed: we’ll text you a 6-digit code.',
              null => 'We’ll send a 6-digit code to your phone or email.',
            },
      children: [
        if (!_sent) savedLoginsBar(),
        if (widget.method != null && !widget.method!.byEmail)
          PhoneField(
            controller: _phone,
            fieldKey: const Key('sign-in-identifier'),
            enabled: !_sent,
            onSubmitted: (_) {
              if (!_sent) _send();
            },
          )
        else
          TextField(
            key: const Key('sign-in-identifier'),
            controller: _phone,
            enabled: !_sent,
            keyboardType: widget.method?.keyboard ?? TextInputType.emailAddress,
            autofillHints:
                widget.method?.autofill ??
                const [AutofillHints.telephoneNumber, AutofillHints.email],
            decoration: InputDecoration(
              labelText: widget.method?.fieldLabel ?? 'Phone number or email',
              hintText:
                  widget.method?.fieldHint ??
                  '0712 345 678 or tenant@example.com',
            ),
            onSubmitted: (_) {
              if (!_sent) _send();
            },
          ),
        if (_sent) ...[
          const SizedBox(height: 16),
          SixDigitCodeField(
            controller: _code,
            labelText: 'Code',
            onSubmitted: (_) => _verify(),
          ),
        ],
        if (!_sent) ...[
          const SizedBox(height: 6),
          Align(alignment: Alignment.centerLeft, child: rememberMeBox()),
        ],
        const SizedBox(height: 16),
        if (_error != null) ...[ErrorBox(_error!), const SizedBox(height: 12)],
        FilledButton(
          onPressed: _busy ? null : (_sent ? _verify : _send),
          child: KodiHubButtonChild(
            loading: _busy,
            label: _sent ? 'Sign in' : 'Send code',
            loadingLabel: _sent ? 'Signing in…' : 'Sending code…',
            tone: SpinnerTone.navy,
          ),
        ),
        if (_sent) ...[
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              TextButton(
                onPressed: _busy ? null : _send,
                child: const Text('Send code again'),
              ),
              TextButton(
                onPressed: _busy
                    ? null
                    : () => setState(() {
                        _sent = false;
                        _code.clear();
                      }),
                child: const Text('Use another contact'),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
