import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/auth_scaffold.dart';
import '../api/api_error.dart';
import '../auth/session_controller.dart';
import 'common.dart';

/// One focused job per sheet (your name; your password), opened from a profile page.

Future<void> _sheet(BuildContext context, Widget child) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => child,
    );

class _SheetBody extends StatelessWidget {
  const _SheetBody({
    required this.title,
    this.subtitle,
    required this.children,
  });

  final String title;
  final String? subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      0,
      20,
      MediaQuery.viewInsetsOf(context).bottom + 24,
    ),
    child: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle!,
              style: TextStyle(
                fontSize: 13,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    ),
  );
}

/// Your first and last name.
class EditNameSheet extends ConsumerStatefulWidget {
  const EditNameSheet({super.key});

  static Future<void> show(BuildContext context) =>
      _sheet(context, const EditNameSheet());

  @override
  ConsumerState<EditNameSheet> createState() => _EditNameSheetState();
}

class _EditNameSheetState extends ConsumerState<EditNameSheet> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final u = ref.read(sessionProvider).valueOrNull?.user;
    _first.text = u?.firstName ?? '';
    _last.text = u?.lastName ?? '';
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_first.text.trim().isEmpty || _last.text.trim().isEmpty) {
      setState(() => _error = 'Enter your first and last name.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(sessionProvider.notifier)
          .updateProfile(firstName: _first.text, lastName: _last.text);
      if (!mounted) return;
      showMessage(context, 'Name saved.');
      Navigator.of(context).pop();
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _SheetBody(
    title: 'Your name',
    subtitle: 'How your landlord, agency or host sees you.',
    children: [
      TextField(
        key: const Key('name-first'),
        controller: _first,
        textCapitalization: TextCapitalization.words,
        textInputAction: TextInputAction.next,
        autofillHints: const [AutofillHints.givenName],
        decoration: const InputDecoration(labelText: 'First name'),
      ),
      const SizedBox(height: 12),
      TextField(
        key: const Key('name-last'),
        controller: _last,
        textCapitalization: TextCapitalization.words,
        autofillHints: const [AutofillHints.familyName],
        onSubmitted: (_) => _save(),
        decoration: const InputDecoration(labelText: 'Last name'),
      ),
      const SizedBox(height: 16),
      if (_error != null) ...[ErrorBox(_error!), const SizedBox(height: 12)],
      FilledButton(
        onPressed: _busy ? null : _save,
        child: Text(_busy ? 'Saving…' : 'Save name'),
      ),
    ],
  );
}

/// Change your password, or set a first one if you've only signed in with codes (that one is
/// confirmed with a code sent to your phone or email).
class PasswordSheet extends ConsumerStatefulWidget {
  const PasswordSheet({super.key});

  static Future<void> show(BuildContext context) =>
      _sheet(context, const PasswordSheet());

  @override
  ConsumerState<PasswordSheet> createState() => _PasswordSheetState();
}

class _PasswordSheetState extends ConsumerState<PasswordSheet> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _again = TextEditingController();
  final _code = TextEditingController();
  bool _hide = true;
  bool _busy = false;
  bool _codeSent = false;
  String? _error;

  bool get _hasPassword =>
      ref.read(sessionProvider).valueOrNull?.user.hasPassword ?? true;

  @override
  void dispose() {
    for (final c in [_current, _next, _again, _code]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _problem() {
    if (_hasPassword && _current.text.isEmpty) {
      return 'Enter your current password.';
    }
    if (_next.text.length < 10) {
      return 'Use at least 10 characters for the new password.';
    }
    if (_next.text != _again.text) return 'The two new passwords don’t match.';
    return null;
  }

  Future<void> _go() async {
    final problem = _problem();
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    final session = ref.read(sessionProvider.notifier);
    // Read before saving: the session reloads afterwards with a password either way.
    final had = _hasPassword;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (had) {
        await session.changePassword(
          currentPassword: _current.text,
          newPassword: _next.text,
        );
      } else if (!_codeSent) {
        await session.requestStepUp();
        if (mounted) setState(() => _codeSent = true);
        return;
      } else {
        if (_code.text.trim().length != 6) {
          setState(() => _error = 'Enter the 6-digit code.');
          return;
        }
        final grant = await session.verifyStepUp(_code.text);
        await session.changePassword(
          newPassword: _next.text,
          stepUpToken: grant,
        );
      }
      if (!mounted) return;
      showMessage(context, had ? 'Password changed.' : 'Password set.');
      Navigator.of(context).pop();
    } on ApiError catch (e) {
      if (mounted) {
        setState(
          () => _error =
              e.fieldErrors['currentPassword'] ??
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
    final has = _hasPassword;
    final user = ref.watch(sessionProvider).valueOrNull?.user;
    final sendTo = (user?.phone?.isNotEmpty ?? false)
        ? user!.phone!
        : (user?.email ?? 'your phone or email');
    InputDecoration pw(String label) => InputDecoration(
      labelText: label,
      suffixIcon: IconButton(
        tooltip: _hide ? 'Show passwords' : 'Hide passwords',
        icon: Icon(
          _hide ? Icons.visibility_outlined : Icons.visibility_off_outlined,
        ),
        onPressed: () => setState(() => _hide = !_hide),
      ),
    );
    return _SheetBody(
      title: has ? 'Change password' : 'Set a password',
      subtitle: has
          ? 'You’ll stay signed in here; other phones and computers are signed out.'
          : 'Then you can also sign in with your phone or email and this password, without waiting for a code.',
      children: [
        if (has) ...[
          TextField(
            key: const Key('pw-current'),
            controller: _current,
            obscureText: _hide,
            autofillHints: const [AutofillHints.password],
            decoration: pw('Current password'),
          ),
          const SizedBox(height: 12),
        ],
        TextField(
          key: const Key('pw-new'),
          controller: _next,
          obscureText: _hide,
          enabled: !_codeSent,
          autofillHints: const [AutofillHints.newPassword],
          decoration: pw(
            'New password',
          ).copyWith(helperText: 'At least 10 characters'),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('pw-again'),
          controller: _again,
          obscureText: _hide,
          enabled: !_codeSent,
          autofillHints: const [AutofillHints.newPassword],
          decoration: pw('New password again'),
        ),
        if (_codeSent) ...[
          const SizedBox(height: 16),
          Text(
            'We sent a 6-digit code to $sendTo.',
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 10),
          SixDigitCodeField(
            controller: _code,
            labelText: 'Code',
            onSubmitted: (_) => _go(),
          ),
        ],
        const SizedBox(height: 16),
        if (_error != null) ...[ErrorBox(_error!), const SizedBox(height: 12)],
        FilledButton(
          key: const Key('pw-go'),
          onPressed: _busy ? null : _go,
          child: Text(
            _busy
                ? 'Please wait…'
                : has
                ? 'Change password'
                : _codeSent
                ? 'Set password'
                : 'Send me a code to confirm',
          ),
        ),
      ],
    );
  }
}
