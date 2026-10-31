import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/widgets/common.dart';
import 'auth_scaffold.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});
  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _orgName = TextEditingController();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  String _kind = 'LANDLORD';
  bool _hide = true;
  bool _busy = false;
  Map<String, String> _fieldErrors = {};
  String? _error;

  @override
  void dispose() {
    _orgName.dispose();
    _firstName.dispose();
    _lastName.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final found = <String, String>{
      if (_orgName.text.trim().isEmpty)
        'organizationName': 'Enter your organisation or property name.',
      if (_firstName.text.trim().isEmpty) 'firstName': 'Enter your first name.',
      if (_lastName.text.trim().isEmpty) 'lastName': 'Enter your last name.',
      if (_email.text.trim().isEmpty) 'email': 'Enter your email address.',
      if (_phone.text.trim().isEmpty) 'phone': 'Enter your phone number.',
      if (_password.text.length < 10)
        'password': 'Use at least 10 characters for your password.',
    };
    setState(() {
      _fieldErrors = found;
      _error = null;
    });
    if (found.isNotEmpty) return;

    setState(() => _busy = true);
    try {
      await ref.read(sessionProvider.notifier).registerOrganization({
        'organizationName': _orgName.text.trim(),
        'kind': _kind,
        'firstName': _firstName.text.trim(),
        'lastName': _lastName.text.trim(),
        'email': _email.text.trim(),
        'phone': _phone.text.trim(),
        'password': _password.text,
      });
    } on ApiError catch (e) {
      if (mounted) {
        setState(() {
          _fieldErrors = e.fieldErrors;
          _error = e.fieldErrors.isEmpty ? e.message : null;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      kicker: 'Get started',
      title: 'Create organisation',
      subtitle: 'Start managing properties, units, invoices and M-Pesa.',
      back: true,
      children: [
        TextField(
          controller: _orgName,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(
            labelText: 'Organisation or portfolio name',
            hintText: 'e.g. Ivory Breeze Homes',
            errorText: _fieldErrors['organizationName'],
          ),
        ),
        const SizedBox(height: 12),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'LANDLORD', label: Text('Landlord')),
            ButtonSegment(value: 'AGENCY', label: Text('Managing agency')),
          ],
          selected: {_kind},
          onSelectionChanged: (s) => setState(() => _kind = s.first),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _firstName,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  labelText: 'First name',
                  errorText: _fieldErrors['firstName'],
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextField(
                controller: _lastName,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  labelText: 'Last name',
                  errorText: _fieldErrors['lastName'],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(
            labelText: 'Email address',
            errorText: _fieldErrors['email'],
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(
            labelText: 'Phone number',
            hintText: '0712 345 678',
            errorText: _fieldErrors['phone'],
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          obscureText: _hide,
          onSubmitted: (_) => _submit(),
          decoration: InputDecoration(
            labelText: 'Password (10+ characters)',
            errorText: _fieldErrors['password'],
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
        const SizedBox(height: 16),
        if (_error != null) ...[ErrorBox(_error!), const SizedBox(height: 12)],
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: Text(_busy ? 'Creating account…' : 'Create organisation'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: _busy ? null : () => context.go('/sign-in'),
          child: const Text('Already have an account? Sign in'),
        ),
      ],
    );
  }
}
