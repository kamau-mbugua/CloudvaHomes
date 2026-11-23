import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../../core/auth/token_store.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/phone_field.dart';
import 'sign_in_method.dart';

/// The saved logins that fit a sign-in screen: phones on a phone screen, emails on an email
/// screen, all of them when the screen takes either.
List<SavedCredential> savedLoginsFor(
  List<SavedCredential> all,
  SignInMethod? method,
) => method == null
    ? all
    : [
        for (final c in all)
          if (c.byEmail == method.byEmail) c,
      ];

/// Phone logins are kept as full numbers (+254…), so "0712…" and "+254712…" are one login.
String normaliseLoginId(String identifier) {
  final id = identifier.trim();
  if (id.contains('@') || id.startsWith('+')) return id;
  final whole = composePhone(kenya, id);
  return whole.isEmpty ? id : whole;
}

String? _roleHintFor(Session? s) {
  if (s == null) return null;
  if (s.activeOrganization != null) return s.activeOrganization!.name;
  if (s.isPlatformOperator) return platformRoleLabel(s.user) ?? 'KodiHQ';
  if (s.tenantOf.isNotEmpty) return s.tenantOf.first.orgName;
  if (s.ownerOf.isNotEmpty) return s.ownerOf.first.orgName;
  return null;
}

/// "Remember me", the saved-login list and picking from it, for the password and the code
/// sign-in screens. Saves only the email or phone, the name and a refresh token; never a
/// password.
mixin SavedLoginsState<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  List<SavedCredential> _allSaved = const [];
  bool rememberMe = true;
  bool _prompted = false;

  /// The screen's way in; decides which saved logins show.
  SignInMethod? get loginMethod;

  /// Where a picked login's email or phone goes.
  TextEditingController get loginField;

  /// False while the screen is somewhere the list shouldn't pop up (a code already sent…).
  bool get mayPromptSaved => true;

  /// A picked login couldn't be signed back in from its saved session: it's in the field now,
  /// and the person carries on with their password or a code.
  void onSavedLoginFilled(SavedCredential login);

  /// Busy while a saved session is being restored.
  void setRestoring(bool busy);

  List<SavedCredential> get savedLogins =>
      savedLoginsFor(_allSaved, loginMethod);

  /// Reads the saved logins; with [autoOpen], shows the list once when there are any.
  Future<void> loadSavedLogins({bool autoOpen = false}) async {
    final store = ref.read(tokenStoreProvider);
    final all = await store.readSavedCredentials();
    if (!mounted) return;
    setState(() => _allSaved = all);
    if (autoOpen && !_prompted && savedLogins.isNotEmpty) {
      _prompted = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && mayPromptSaved && savedLogins.isNotEmpty) {
          openSavedLogins();
        }
      });
    }
  }

  Future<void> openSavedLogins() async {
    final logins = savedLogins;
    if (logins.isEmpty) return;
    final store = ref.read(tokenStoreProvider);
    final picked = await showSavedLoginsSheet(
      context,
      logins: logins,
      method: loginMethod,
      onRemove: (id) async {
        await store.removeSavedCredential(id);
        final all = await store.readSavedCredentials();
        if (mounted) setState(() => _allSaved = all);
        return savedLoginsFor(all, loginMethod);
      },
    );
    if (picked != null && mounted) await pickSavedLogin(picked);
  }

  Future<void> pickSavedLogin(SavedCredential login) async {
    loginField.text = login.identifier;
    setState(() => rememberMe = true);
    final token = login.refreshToken;
    if (token != null && token.isNotEmpty) {
      final notifier = ref.read(sessionProvider.notifier);
      setRestoring(true);
      try {
        if (await notifier.signInWithSavedToken(token)) {
          await rememberLogin(login.identifier);
          return;
        }
      } finally {
        if (mounted) setRestoring(false);
      }
    }
    if (mounted) onSavedLoginFilled(login);
  }

  /// After signing in: saves this login when "Remember me" is on, forgets it when off. Reads
  /// everything from [ref] before waiting, since signing in can close the screen.
  Future<void> rememberLogin(String identifier) async {
    final store = ref.read(tokenStoreProvider);
    final session = ref.read(sessionProvider).valueOrNull;
    final id = normaliseLoginId(identifier);
    if (id.isEmpty) return;
    if (!rememberMe) {
      await store.removeSavedCredential(id);
      if (id != identifier.trim()) {
        await store.removeSavedCredential(identifier.trim());
      }
      return;
    }
    final fullName = session?.user.fullName.trim();
    final refreshToken = await store.read();
    await store.saveCredential(
      SavedCredential(
        identifier: id,
        refreshToken: refreshToken,
        displayName: (fullName != null && fullName.isNotEmpty)
            ? fullName
            : null,
        roleHint: _roleHintFor(session),
        savedAt: DateTime.now().toUtc().toIso8601String(),
        method: loginMethod?.name,
      ),
    );
  }

  /// The "Remember me" box.
  Widget rememberMeBox() => RememberMeBox(
    value: rememberMe,
    onChanged: (v) => setState(() => rememberMe = v),
  );

  /// The "N saved phones on this device" bar; nothing when there are none.
  Widget savedLoginsBar() {
    final logins = savedLogins;
    if (logins.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: SavedLoginsBar(
        count: logins.length,
        method: loginMethod,
        onTap: openSavedLogins,
      ),
    );
  }
}

String _kindWord(SignInMethod? method, int count) {
  final one = switch (method?.byEmail) {
    true => 'email',
    false => 'phone number',
    null => 'login',
  };
  return count == 1 ? one : '${one}s';
}

class RememberMeBox extends StatelessWidget {
  const RememberMeBox({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => InkWell(
    key: const Key('remember-me'),
    borderRadius: BorderRadius.circular(8),
    onTap: () => onChanged(!value),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 22,
            height: 22,
            child: Checkbox(
              value: value,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              visualDensity: VisualDensity.compact,
              onChanged: (v) => onChanged(v ?? false),
            ),
          ),
          const SizedBox(width: 8),
          const Flexible(
            child: Text(
              'Remember me',
              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    ),
  );
}

class SavedLoginsBar extends StatelessWidget {
  const SavedLoginsBar({
    super.key,
    required this.count,
    required this.onTap,
    this.method,
  });

  final int count;
  final SignInMethod? method;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: HodiColors.limeSoft,
    borderRadius: BorderRadius.circular(14),
    child: InkWell(
      key: const Key('saved-logins'),
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
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
              child: Icon(
                method == null
                    ? Icons.key_rounded
                    : (method!.byEmail
                          ? Icons.alternate_email
                          : Icons.phone_iphone),
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
                    '$count saved ${_kindWord(method, count)} on this device',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: HodiColors.navy,
                    ),
                  ),
                  Text(
                    'Tap to choose one',
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
  );
}

/// The list of saved logins to pick from. Returns the one picked, or null.
Future<SavedCredential?> showSavedLoginsSheet(
  BuildContext context, {
  required List<SavedCredential> logins,
  required Future<List<SavedCredential>> Function(String identifier) onRemove,
  SignInMethod? method,
}) => showModalBottomSheet<SavedCredential>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  showDragHandle: true,
  builder: (_) =>
      _SavedLoginsSheet(initial: logins, method: method, onRemove: onRemove),
);

class _SavedLoginsSheet extends StatefulWidget {
  const _SavedLoginsSheet({
    required this.initial,
    required this.onRemove,
    this.method,
  });

  final List<SavedCredential> initial;
  final SignInMethod? method;
  final Future<List<SavedCredential>> Function(String identifier) onRemove;

  @override
  State<_SavedLoginsSheet> createState() => _SavedLoginsSheetState();
}

class _SavedLoginsSheetState extends State<_SavedLoginsSheet> {
  late List<SavedCredential> _logins = widget.initial;

  Future<void> _remove(SavedCredential login) async {
    final updated = await widget.onRemove(login.identifier);
    if (!mounted) return;
    if (updated.isEmpty) {
      Navigator.of(context).pop();
      return;
    }
    setState(() => _logins = updated);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final method = widget.method;
    final title = switch (method?.byEmail) {
      true => 'Choose a saved email',
      false => 'Choose a saved phone number',
      null => 'Choose a saved account',
    };
    final next = switch (method?.withPassword) {
      true => 'then your password if asked',
      false => 'then we send you a code if asked',
      null => 'to carry on signing in',
    };

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Kicker('Saved on this device'),
            const SizedBox(height: 4),
            Text(
              title,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.3,
                color: dark ? Colors.white : HodiColors.navy,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              'Tap one to sign in, $next. Remove the ones you no longer use.',
              style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 14),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * 0.45,
              ),
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: _logins.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, i) => _LoginTile(
                  login: _logins[i],
                  onTap: () => Navigator.of(context).pop(_logins[i]),
                  onRemove: () => _remove(_logins[i]),
                ),
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.person_outline_rounded, size: 18),
              label: Text(switch (method?.byEmail) {
                true => 'Use another email',
                false => 'Use another phone number',
                null => 'Use another account',
              }),
            ),
          ],
        ),
      ),
    );
  }
}

class _LoginTile extends StatelessWidget {
  const _LoginTile({
    required this.login,
    required this.onTap,
    required this.onRemove,
  });

  final SavedCredential login;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final name = login.displayName?.trim() ?? '';
    final title = name.isNotEmpty ? name : login.identifier;
    final sub = [
      if (name.isNotEmpty) login.identifier,
      if (login.roleHint != null && login.roleHint!.isNotEmpty) login.roleHint!,
    ].join(' · ');
    return Material(
      color: scheme.surfaceContainerLowest,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
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
                  login.initials,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
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
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (sub.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        sub,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Remove from this device',
                visualDensity: VisualDensity.compact,
                icon: Icon(
                  Icons.delete_outline_rounded,
                  size: 19,
                  color: scheme.onSurfaceVariant,
                ),
                onPressed: onRemove,
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
  }
}
