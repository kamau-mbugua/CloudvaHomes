import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hodi/core/auth/token_store.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/core/theme.dart';
import 'package:hodi/features/auth/code_sign_in_screen.dart';
import 'package:hodi/features/auth/saved_logins.dart';
import 'package:hodi/features/auth/sign_in_chooser_screen.dart';
import 'package:hodi/features/auth/sign_in_method.dart';
import 'package:hodi/features/auth/sign_in_screen.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';

const _phone = SavedCredential(
  identifier: '+254712345678',
  displayName: 'Phone Person',
  method: 'phoneCode',
);
const _email = SavedCredential(
  identifier: 'mail@example.invalid',
  displayName: 'Mail Person',
  method: 'emailPassword',
);

late FakeAdapter _adapter;

Future<MemoryTokenStore> _pump(
  WidgetTester tester,
  Widget screen, {
  FakeAdapter? adapter,
  List<SavedCredential> saved = const [_phone, _email],
}) async {
  _adapter =
      adapter ?? FakeAdapter((_) => (401, errorBody('SESSION_REVOKED', 'x')));
  final store = MemoryTokenStore()..savedCredentials.addAll(saved);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(fakeClient(_adapter)),
        tokenStoreProvider.overrideWithValue(store),
      ],
      child: MaterialApp(theme: hodiTheme(Brightness.light), home: screen),
    ),
  );
  await settle(tester);
  return store;
}

Future<void> _tapReal(WidgetTester tester, Finder f) {
  final before = _adapter.calls.length;
  return tapAndWait(tester, f, () => _adapter.calls.length > before);
}

void main() {
  test('phone logins are kept as full numbers', () {
    expect(normaliseLoginId('0712 345 678'), '+254712345678');
    expect(normaliseLoginId('+256701234567'), '+256701234567');
    expect(normaliseLoginId(' Mail@Example.invalid '), 'Mail@Example.invalid');
  });

  test('a screen lists only its kind of login', () {
    const all = [_phone, _email];
    expect(savedLoginsFor(all, SignInMethod.phonePassword), [_phone]);
    expect(savedLoginsFor(all, SignInMethod.phoneCode), [_phone]);
    expect(savedLoginsFor(all, SignInMethod.emailCode), [_email]);
    expect(savedLoginsFor(all, null), all);
  });

  testWidgets('phone + password: the list shows saved phones only; picking '
      'one fills it in and asks for the password', (tester) async {
    await _pump(tester, const SignInScreen(method: SignInMethod.phonePassword));
    expect(find.text('Choose a saved phone number'), findsOneWidget);
    expect(find.text('Phone Person'), findsOneWidget);
    expect(find.text('Mail Person'), findsNothing);

    await tester.tap(find.text('Phone Person'));
    await settle(tester);
    expect(find.text('712345678'), findsOneWidget);
    expect(find.text('+254'), findsOneWidget);
    expect(
      find.textContaining('Enter your password to continue as Phone Person'),
      findsOneWidget,
    );
    expect(find.text('1 saved phone number on this device'), findsOneWidget);
  });

  testWidgets('email + code: the list shows saved emails only', (tester) async {
    await _pump(tester, const CodeSignInScreen(method: SignInMethod.emailCode));
    expect(find.text('Choose a saved email'), findsOneWidget);
    expect(find.text('Mail Person'), findsOneWidget);
    expect(find.text('Phone Person'), findsNothing);
    await tester.tap(find.text('Mail Person'));
    await settle(tester);
    expect(find.text('mail@example.invalid'), findsOneWidget);
  });

  testWidgets('no list pops up when nothing of that kind is saved', (
    tester,
  ) async {
    await _pump(
      tester,
      const CodeSignInScreen(method: SignInMethod.phoneCode),
      saved: const [_email],
    );
    expect(find.text('Choose a saved phone number'), findsNothing);
    expect(find.byKey(const Key('saved-logins')), findsNothing);
  });

  FakeAdapter codeServer() => FakeAdapter(
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

  testWidgets('passwordless sign-in remembers the phone with its method', (
    tester,
  ) async {
    final store = await _pump(
      tester,
      const CodeSignInScreen(method: SignInMethod.phoneCode),
      adapter: codeServer(),
      saved: const [],
    );
    await tester.enterText(
      find.byKey(const Key('sign-in-identifier')),
      '0700 000 002',
    );
    await _tapReal(tester, find.widgetWithText(FilledButton, 'Send code'));
    await tester.enterText(find.widgetWithText(TextField, 'Code'), '123456');
    await _tapReal(tester, find.widgetWithText(FilledButton, 'Sign in'));
    await settle(tester);
    final saved = store.savedCredentials.single;
    expect(saved.identifier, '+254700000002');
    expect(saved.method, 'phoneCode');
    expect(saved.refreshToken, 'r-otp');
  });

  testWidgets('with "Remember me" off, the login is forgotten', (tester) async {
    final store = await _pump(
      tester,
      const CodeSignInScreen(method: SignInMethod.phoneCode),
      adapter: codeServer(),
      saved: const [
        SavedCredential(identifier: '+254700000002', displayName: 'Old'),
      ],
    );
    // Close the list that opened, and type the number by hand.
    await tester.tap(find.text('Use another phone number'));
    await settle(tester);
    await tester.enterText(
      find.byKey(const Key('sign-in-identifier')),
      '0700000002',
    );
    await tester.tap(find.byKey(const Key('remember-me')));
    await _tapReal(tester, find.widgetWithText(FilledButton, 'Send code'));
    await tester.enterText(find.widgetWithText(TextField, 'Code'), '123456');
    await _tapReal(tester, find.widgetWithText(FilledButton, 'Sign in'));
    await settle(tester);
    expect(store.savedCredentials, isEmpty);
  });

  testWidgets('sign-in page: a saved login without a live session opens its '
      'own way in, filled in', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final router = GoRouter(
      initialLocation: '/sign-in',
      routes: [
        GoRoute(
          path: '/sign-in',
          builder: (_, _) => const SignInChooserScreen(),
        ),
        GoRoute(
          path: '/sign-in/password',
          builder: (_, s) => SignInScreen(
            method: SignInMethod.from(s.uri.queryParameters['with']),
            initialIdentifier: s.extra as String?,
          ),
        ),
        GoRoute(
          path: '/sign-in/code',
          builder: (_, s) => CodeSignInScreen(
            method: SignInMethod.from(s.uri.queryParameters['with']),
            initialIdentifier: s.extra as String?,
          ),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(
            fakeClient(FakeAdapter((_) => (404, <String, Object?>{}))),
          ),
          tokenStoreProvider.overrideWithValue(
            MemoryTokenStore()..savedCredentials.addAll(const [_phone, _email]),
          ),
        ],
        child: MaterialApp.router(
          theme: hodiTheme(Brightness.light),
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('2 saved logins on this device'), findsOneWidget);
    await tester.tap(find.byKey(const Key('saved-logins')));
    await tester.pumpAndSettle();
    expect(find.text('Phone Person'), findsOneWidget);
    expect(find.text('Mail Person'), findsOneWidget);
    await tester.tap(find.text('Phone Person'));
    await tester.pumpAndSettle();
    // It last signed in with a code, so that screen opens with the number in.
    expect(find.byType(CodeSignInScreen), findsOneWidget);
    expect(find.text('712345678'), findsOneWidget);
    expect(find.text('Choose a saved phone number'), findsNothing);
  });
}
