import 'package:flutter/material.dart';

/// The ways to sign in. Everyone signs in the same way, whatever they use KodiHQ for; the
/// account decides what they see. Social logins will join this list later.
enum SignInMethod {
  emailPassword(
    label: 'Email and password',
    icon: Icons.alternate_email,
    fieldLabel: 'Email',
    fieldHint: 'you@example.com',
    withPassword: true,
    byEmail: true,
  ),
  phonePassword(
    label: 'Phone and password',
    icon: Icons.phone_iphone,
    fieldLabel: 'Phone number',
    fieldHint: '0712 345 678',
    withPassword: true,
    byEmail: false,
  ),
  phoneCode(
    label: 'Phone, with a code by SMS',
    icon: Icons.sms_outlined,
    fieldLabel: 'Phone number',
    fieldHint: '0712 345 678',
    withPassword: false,
    byEmail: false,
  ),
  emailCode(
    label: 'Email, with a code',
    icon: Icons.mark_email_read_outlined,
    fieldLabel: 'Email',
    fieldHint: 'you@example.com',
    withPassword: false,
    byEmail: true,
  );

  const SignInMethod({
    required this.label,
    required this.icon,
    required this.fieldLabel,
    required this.fieldHint,
    required this.withPassword,
    required this.byEmail,
  });

  final String label;
  final IconData icon;
  final String fieldLabel;
  final String fieldHint;

  /// A password, or a one-time code sent to the phone or email.
  final bool withPassword;
  final bool byEmail;

  TextInputType get keyboard =>
      byEmail ? TextInputType.emailAddress : TextInputType.phone;

  List<String> get autofill => byEmail
      ? const [AutofillHints.email, AutofillHints.username]
      : const [AutofillHints.telephoneNumber, AutofillHints.username];

  /// Where it opens.
  String get route => withPassword
      ? '/sign-in/password?with=$name'
      : '/sign-in/code?with=$name';

  /// A message when [value] isn't an email (or a phone number), else null. The server checks
  /// properly; this just catches the obvious slip of typing the other kind.
  String? problem(String value) {
    final v = value.trim();
    if (v.isEmpty) return 'Enter your ${fieldLabel.toLowerCase()}.';
    if (byEmail) {
      return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v)
          ? null
          : 'Enter an email address, like you@example.com.';
    }
    final digits = v.replaceAll(RegExp(r'[\s\-()]'), '');
    return RegExp(r'^\+?\d{9,15}$').hasMatch(digits)
        ? null
        : 'Enter a phone number, like 0712 345 678.';
  }

  /// From the `?with=` query parameter; null when missing or unknown.
  static SignInMethod? from(String? value) {
    for (final m in values) {
      if (m.name == value) return m;
    }
    return null;
  }
}
