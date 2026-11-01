import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../../core/auth/token_store.dart';
import '../../core/providers.dart';
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
  List<SavedCredential> _savedCredentials = const [];
  bool _didAutoPromptSaved = false;
  bool _rememberMe = true;
  bool _busy = false;
  bool _resending = false;
  bool _hide = true;
  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();
    _loadSavedCredentials(autoOpenSheet: true);
  }

  Future<void> _loadSavedCredentials({bool autoOpenSheet = false}) async {
    final store = ref.read(tokenStoreProvider);
    final creds = await store.readSavedCredentials();
    if (!mounted) return;
    setState(() => _savedCredentials = creds);
    if (autoOpenSheet &&
        !_didAutoPromptSaved &&
        creds.isNotEmpty &&
        _challenge == null) {
      _didAutoPromptSaved = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _challenge == null && _savedCredentials.isNotEmpty) {
          _showSavedCredentialsSheet();
        }
      });
    }
  }

  static String? _roleHintFor(Session? s) {
    if (s == null) return null;
    if (s.activeOrganization != null) return s.activeOrganization!.name;
    if (s.isPlatformAdmin) return s.user.platformRole ?? 'Platform Admin';
    if (s.tenantOf.isNotEmpty) return s.tenantOf.first.orgName;
    if (s.ownerOf.isNotEmpty) return s.ownerOf.first.orgName;
    return null;
  }

  Future<void> _persistCredentialIfRemembered(
    String identifier,
    String password,
  ) async {
    final store = ref.read(tokenStoreProvider);
    final trimmedId = identifier.trim();
    if (_rememberMe) {
      final session = ref.read(sessionProvider).valueOrNull;
      final fullName = session?.user.fullName.trim();
      await store.saveCredential(
        SavedCredential(
          identifier: trimmedId,
          password: password,
          displayName: (fullName != null && fullName.isNotEmpty)
              ? fullName
              : null,
          roleHint: _roleHintFor(session),
          savedAt: DateTime.now().toUtc().toIso8601String(),
        ),
      );
    } else {
      await store.removeSavedCredential(trimmedId);
    }
  }

  Future<void> _showSavedCredentialsSheet() async {
    if (_savedCredentials.isEmpty) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _SavedCredentialsSheet(
        initialCredentials: _savedCredentials,
        onSelect: (selected) {
          if (!mounted) return;
          setState(() {
            _id.text = selected.identifier;
            _password.text = selected.password;
            _rememberMe = true;
            _error = null;
          });
          _submit();
        },
        onRemove: (identifier) async {
          await ref.read(tokenStoreProvider).removeSavedCredential(identifier);
          final updated = await ref
              .read(tokenStoreProvider)
              .readSavedCredentials();
          if (mounted) {
            setState(() => _savedCredentials = updated);
          }
          return updated;
        },
      ),
    );
  }

  @override
  void dispose() {
    _id.dispose();
    _password.dispose();
    _twoFactorCode.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final identifier = _id.text.trim();
    final password = _password.text;
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
        await _persistCredentialIfRemembered(identifier, password);
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
    final password = _password.text;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await ref
          .read(sessionProvider.notifier)
          .verifyTwoFactor(_challenge!.challengeToken, _twoFactorCode.text);
      await _persistCredentialIfRemembered(identifier, password);
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
        if (_savedCredentials.isNotEmpty) ...[
          Material(
            color: HodiColors.limeSoft,
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: _showSavedCredentialsSheet,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: HodiColors.limeText.withValues(alpha: 0.28),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: HodiColors.navy,
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: const Icon(
                        Icons.key_rounded,
                        size: 16,
                        color: HodiColors.lime,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _savedCredentials.length == 1
                                ? '1 saved login on this device'
                                : '${_savedCredentials.length} saved logins on this device',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: HodiColors.navy,
                            ),
                          ),
                          Text(
                            'Tap to choose a saved account',
                            style: TextStyle(
                              fontSize: 11.5,
                              color: HodiColors.navy.withValues(alpha: 0.72),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.keyboard_arrow_up_rounded,
                      size: 20,
                      color: HodiColors.navy,
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
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
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => setState(() => _rememberMe = !_rememberMe),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: 22,
                        height: 22,
                        child: Checkbox(
                          value: _rememberMe,
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
                          onChanged: (v) =>
                              setState(() => _rememberMe = v ?? false),
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Flexible(
                        child: Text(
                          'Remember me',
                          style: TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            TextButton(
              onPressed: () => context.push('/forgot'),
              child: const Text('Forgot password?'),
            ),
          ],
        ),
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

class _SavedCredentialsSheet extends StatefulWidget {
  const _SavedCredentialsSheet({
    required this.initialCredentials,
    required this.onSelect,
    required this.onRemove,
  });

  final List<SavedCredential> initialCredentials;
  final void Function(SavedCredential credential) onSelect;
  final Future<List<SavedCredential>> Function(String identifier) onRemove;

  @override
  State<_SavedCredentialsSheet> createState() => _SavedCredentialsSheetState();
}

class _SavedCredentialsSheetState extends State<_SavedCredentialsSheet> {
  late List<SavedCredential> _credentials = widget.initialCredentials;

  Future<void> _handleRemove(SavedCredential cred) async {
    final updated = await widget.onRemove(cred.identifier);
    if (!mounted) return;
    if (updated.isEmpty) {
      Navigator.of(context).pop();
      return;
    }
    setState(() => _credentials = updated);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Kicker('SAVED CREDENTIALS'),
            const SizedBox(height: 4),
            Text(
              'Choose a saved account',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.3,
                color: dark ? Colors.white : HodiColors.navy,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              'Tap an account to sign in immediately, or remove it from this device.',
              style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 14),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.45,
              ),
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: _credentials.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final cred = _credentials[index];
                  final hasName =
                      cred.displayName != null &&
                      cred.displayName!.trim().isNotEmpty;
                  final title = hasName
                      ? cred.displayName!.trim()
                      : cred.identifier;
                  final subtitleParts = <String>[
                    if (hasName) cred.identifier,
                    if (cred.roleHint != null && cred.roleHint!.isNotEmpty)
                      cred.roleHint!,
                    '••••••••',
                  ];
                  return Material(
                    color: scheme.surfaceContainerLowest,
                    borderRadius: BorderRadius.circular(14),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: () {
                        Navigator.of(context).pop();
                        widget.onSelect(cred);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 11,
                        ),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: scheme.outlineVariant),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 40,
                              height: 40,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: HodiColors.navy,
                                borderRadius: BorderRadius.circular(11),
                              ),
                              child: Text(
                                cred.initials,
                                style: const TextStyle(
                                  fontFamily: 'JetBrainsMono',
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                  color: HodiColors.lime,
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 14.5,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    subtitleParts.join(' · '),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: scheme.onSurfaceVariant,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            IconButton(
                              tooltip: 'Remove saved account',
                              visualDensity: VisualDensity.compact,
                              icon: Icon(
                                Icons.delete_outline_rounded,
                                size: 19,
                                color: scheme.onSurfaceVariant,
                              ),
                              onPressed: () => _handleRemove(cred),
                            ),
                            Icon(
                              Icons.arrow_forward_ios_rounded,
                              size: 14,
                              color: scheme.onSurfaceVariant,
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.person_outline_rounded, size: 18),
              label: const Text('Use another account'),
            ),
          ],
        ),
      ),
    );
  }
}
