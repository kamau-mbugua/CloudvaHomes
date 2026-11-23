import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/auth/token_store.dart';
import '../../core/widgets/common.dart';
import 'auth_scaffold.dart';
import 'saved_logins.dart';
import 'sign_in_method.dart';
import '../../core/widgets/phone_field.dart';

/// Sign-in with a password, by email or by phone (picked on the sign-in page).
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key, this.method, this.initialIdentifier});

  /// Email + password or phone + password; null takes either.
  final SignInMethod? method;

  /// Filled in already (a saved login picked on the sign-in page).
  final String? initialIdentifier;
  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen>
    with SavedLoginsState<SignInScreen> {
  final _id = TextEditingController();
  final _password = TextEditingController();
  final _passwordFocus = FocusNode();
  final _twoFactorCode = TextEditingController();
  TwoFactorChallenge? _challenge;
  bool _busy = false;
  bool _resending = false;
  bool _hide = true;
  String? _error;
  String? _notice;

  @override
  SignInMethod? get loginMethod => widget.method;
  @override
  TextEditingController get loginField => _id;
  @override
  bool get mayPromptSaved => _challenge == null && _id.text.isEmpty;
  @override
  void setRestoring(bool busy) => setState(() => _busy = busy);
  @override
  void onSavedLoginFilled(SavedCredential login) {
    setState(() {
      _error = null;
      _notice =
          'Enter your password to continue as ${login.displayName ?? login.identifier}.';
    });
    _passwordFocus.requestFocus();
  }

  @override
  void initState() {
    super.initState();
    final initial = widget.initialIdentifier;
    if (initial != null && initial.isNotEmpty) _id.text = initial;
    loadSavedLogins(autoOpen: true);
  }

  @override
  void dispose() {
    _id.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    _twoFactorCode.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final identifier = _id.text.trim();
    final password = _password.text;
    final idProblem = widget.method?.problem(identifier);
    if (idProblem != null) {
      setState(() => _error = idProblem);
      return;
    }
    if (identifier.isEmpty || password.isEmpty) {
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
          .signInWithPassword(identifier, password);
      if (challenge != null) {
        if (mounted) {
          setState(() {
            _challenge = challenge;
            _twoFactorCode.clear();
          });
        }
      } else {
        await rememberLogin(identifier);
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
    final identifier = _id.text.trim();
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await ref
          .read(sessionProvider.notifier)
          .verifyTwoFactor(_challenge!.challengeToken, _twoFactorCode.text);
      await rememberLogin(identifier);
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
            NoticeBox(_notice!),
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
            child: KodiHubButtonChild(
              loading: _busy,
              label: 'Verify & sign in',
              loadingLabel: 'Verifying…',
              tone: SpinnerTone.navy,
            ),
          ),
        ],
      );
    }

    final appConfig = ref.watch(appConfigProvider).valueOrNull;
    final method = widget.method;
    return AuthScaffold(
      back: true,
      onBack: () => context.canPop() ? context.pop() : context.go('/sign-in'),
      kicker: method == null ? 'Sign in' : 'Sign in · ${method.label}',
      title: 'Welcome back',
      subtitle: method == null
          ? 'Use the email or phone your organisation or landlord has for you.'
          : 'Use the ${method.fieldLabel.toLowerCase()} and password of your KodiHQ account.',
      children: [
        if (appConfig?.maintenanceMode == true) ...[
          const ErrorBox(
            'KodiHQ is currently in maintenance mode. Only platform administrators can sign in right now.',
          ),
          const SizedBox(height: 12),
        ],
        if (appConfig?.forceUpdateRequired == true) ...[
          ErrorBox(
            'Please update the KodiHQ app${appConfig?.minimumMobileVersion != null ? ' to v${appConfig!.minimumMobileVersion} or newer' : ''} for the latest features.',
          ),
          const SizedBox(height: 12),
        ],
        savedLoginsBar(),
        if (method != null && !method.byEmail)
          PhoneField(
            controller: _id,
            fieldKey: const Key('sign-in-identifier'),
            textInputAction: TextInputAction.next,
          )
        else
          TextField(
            key: const Key('sign-in-identifier'),
            controller: _id,
            keyboardType: method?.keyboard ?? TextInputType.emailAddress,
            autofillHints:
                method?.autofill ??
                const [
                  AutofillHints.username,
                  AutofillHints.email,
                  AutofillHints.telephoneNumber,
                ],
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: method?.fieldLabel ?? 'Email or phone',
              hintText: method?.fieldHint,
            ),
          ),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          focusNode: _passwordFocus,
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
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: Align(
                alignment: Alignment.centerLeft,
                child: rememberMeBox(),
              ),
            ),
            TextButton(
              onPressed: () => context.push('/forgot'),
              child: const Text('Forgot password?'),
            ),
          ],
        ),
        if (_notice != null) ...[
          NoticeBox(_notice!),
          const SizedBox(height: 12),
        ],
        if (_error != null) ...[ErrorBox(_error!), const SizedBox(height: 12)],
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: KodiHubButtonChild(
            loading: _busy,
            label: 'Sign in',
            loadingLabel: 'Signing in…',
            tone: SpinnerTone.navy,
          ),
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
          onPressed: () => context.push(
            (method?.byEmail ?? true)
                ? SignInMethod.emailCode.route
                : SignInMethod.phoneCode.route,
          ),
        ),
      ],
    );
  }
}

/// A green note (a code was sent again, enter your password…).
class NoticeBox extends StatelessWidget {
  const NoticeBox(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: const Color(0xFFEEF6DB),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFF84BD00)),
    ),
    child: Text(text, style: const TextStyle(color: Color(0xFF3D5509))),
  );
}
