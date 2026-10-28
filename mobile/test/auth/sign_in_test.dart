import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/token_store.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/features/auth/code_sign_in_screen.dart';
import 'package:hodi/features/auth/sign_in_screen.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';

Future<MemoryTokenStore> _pump(
  WidgetTester tester,
  Widget screen,
  FakeAdapter adapter,
) async {
  _adapter = adapter;
  final store = MemoryTokenStore();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(fakeClient(adapter)),
        tokenStoreProvider.overrideWithValue(store),
      ],
      child: MaterialApp(home: screen),
    ),
  );
  await settle(tester);
  return store;
}

/// Waits until the tap's request has been answered (a new call recorded).
late FakeAdapter _adapter;

Future<void> _tapReal(WidgetTester tester, Finder f) {
  final before = _adapter.calls.length;
  return tapAndWait(tester, f, () => _adapter.calls.length > before);
}

void main() {
  testWidgets(
    'password sign-in asks for the mobile client and stores the refresh token',
    (tester) async {
      final adapter = FakeAdapter(
        (c) => c.path == '/auth/login'
            ? (200, {'data': sessionJson(refreshToken: 'r-login')})
            : (401, errorBody('SESSION_REVOKED', 'x')),
      );
      final store = await _pump(tester, const SignInScreen(), adapter);
      await tester.enterText(
        find.widgetWithText(TextField, 'Email or phone'),
        ' owner@example.invalid ',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Password'),
        'secret-password',
      );
      await _tapReal(tester, find.widgetWithText(FilledButton, 'Sign in'));
      final login = adapter.calls.firstWhere((c) => c.path == '/auth/login');
      expect(login.body, {
        'identifier': 'owner@example.invalid',
        'password': 'secret-password',
        'client': 'mobile',
      });
      expect(store.token, 'r-login');
    },
  );

  testWidgets('wrong password shows the server message', (tester) async {
    final adapter = FakeAdapter(
      (_) => (
        401,
        errorBody('INVALID_CREDENTIALS', 'Wrong email/phone or password'),
      ),
    );
    await _pump(tester, const SignInScreen(), adapter);
    await tester.enterText(
      find.widgetWithText(TextField, 'Email or phone'),
      'x@example.invalid',
    );
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'nope');
    await _tapReal(tester, find.widgetWithText(FilledButton, 'Sign in'));
    expect(find.text('Wrong email/phone or password'), findsOneWidget);
  });

  testWidgets('code sign-in: phone → code → signed in', (tester) async {
    final adapter = FakeAdapter(
      (c) => switch (c.path) {
        '/auth/otp/request' => (
          202,
          {
            'data': {'sent': true},
          },
        ),
        '/auth/otp/verify' => (
          200,
          {
            'data': sessionJson(
              staff: false,
              tenant: true,
              refreshToken: 'r-otp',
            ),
          },
        ),
        _ => (401, errorBody('SESSION_REVOKED', 'x')),
      },
    );
    final store = await _pump(tester, const CodeSignInScreen(), adapter);
    await tester.enterText(
      find.widgetWithText(TextField, 'Phone number'),
      '0700000002',
    );
    await _tapReal(tester, find.widgetWithText(FilledButton, 'Send code'));
    expect(find.textContaining('a 6-digit code is on its way'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Code'), '123456');
    await _tapReal(tester, find.widgetWithText(FilledButton, 'Sign in'));
    expect(adapter.calls.last.body, {
      'phone': '0700000002',
      'code': '123456',
      'client': 'mobile',
    });
    expect(store.token, 'r-otp');
  });
}
