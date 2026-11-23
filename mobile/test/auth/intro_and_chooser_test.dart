import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/token_store.dart';
import 'package:hodi/core/intro.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/core/router.dart';
import 'package:hodi/core/theme.dart';
import 'package:hodi/features/auth/code_sign_in_screen.dart';
import 'package:hodi/features/auth/intro_screen.dart';
import 'package:hodi/features/auth/sign_in_method.dart';
import 'package:hodi/features/auth/sign_in_chooser_screen.dart';
import 'package:hodi/features/auth/sign_in_screen.dart';

import '../helpers/fake_http.dart';

class _FakeIntroStore extends IntroStore {
  _FakeIntroStore();
  bool marked = false;
  @override
  Future<bool> read() async => marked;
  @override
  Future<void> markSeen() async => marked = true;
}

Future<GoRouter> _pumpRouter(
  WidgetTester tester, {
  required String at,
  _FakeIntroStore? intro,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: at,
    routes: [
      GoRoute(path: '/welcome', builder: (_, _) => const IntroScreen()),
      GoRoute(path: '/sign-in', builder: (_, _) => const SignInChooserScreen()),
      GoRoute(
        path: '/sign-in/password',
        builder: (_, s) => SignInScreen(
          method: SignInMethod.from(s.uri.queryParameters['with']),
        ),
      ),
      GoRoute(
        path: '/sign-in/code',
        builder: (_, s) => CodeSignInScreen(
          method: SignInMethod.from(s.uri.queryParameters['with']),
        ),
      ),
      GoRoute(path: '/register', builder: (_, _) => const Scaffold()),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(
          fakeClient(FakeAdapter((_) => (404, <String, Object?>{}))),
        ),
        tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
        introSeenProvider.overrideWith((ref) => false),
        introStoreProvider.overrideWithValue(intro ?? _FakeIntroStore()),
      ],
      child: MaterialApp.router(
        theme: hodiTheme(Brightness.light),
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

String _path(GoRouter r) =>
    r.routerDelegate.currentConfiguration.uri.toString();

void main() {
  group('where a signed-out person lands', () {
    String? go(String at, {required bool introSeen}) => redirectFor(
      session: const AsyncData<Session?>(null),
      mode: null,
      location: at,
      introSeen: introSeen,
    );

    test('first launch shows the intro, later launches the sign-in list', () {
      expect(go('/', introSeen: false), '/welcome');
      expect(go('/', introSeen: true), '/sign-in');
      expect(go('/tenant', introSeen: false), '/welcome');
    });

    test('the intro and every sign-in page are open without an account', () {
      for (final p in [
        '/welcome',
        '/sign-in',
        '/sign-in/password',
        '/sign-in/code',
        '/register',
        '/forgot',
      ]) {
        expect(go(p, introSeen: false), isNull, reason: p);
      }
    });
  });

  test('each sign-in method opens its own screen', () {
    expect(
      SignInMethod.emailPassword.route,
      '/sign-in/password?with=emailPassword',
    );
    expect(
      SignInMethod.phonePassword.route,
      '/sign-in/password?with=phonePassword',
    );
    expect(SignInMethod.phoneCode.route, '/sign-in/code?with=phoneCode');
    expect(SignInMethod.emailCode.route, '/sign-in/code?with=emailCode');
    expect(SignInMethod.from('phoneCode'), SignInMethod.phoneCode);
    expect(SignInMethod.from('nope'), isNull);
  });

  test('each method checks you typed the right kind of contact', () {
    expect(SignInMethod.emailPassword.problem('you@example.com'), isNull);
    expect(
      SignInMethod.emailPassword.problem('0712345678'),
      contains('email address'),
    );
    expect(SignInMethod.phoneCode.problem('0712 345 678'), isNull);
    expect(SignInMethod.phoneCode.problem('+254712345678'), isNull);
    expect(
      SignInMethod.phoneCode.problem('you@example.com'),
      contains('phone number'),
    );
    expect(SignInMethod.phonePassword.problem(' '), 'Enter your phone number.');
  });

  testWidgets('the intro pages lead to the sign-in list and are remembered', (
    tester,
  ) async {
    final intro = _FakeIntroStore();
    final router = await _pumpRouter(tester, at: '/welcome', intro: intro);

    expect(find.text(introSlides[0].title), findsOneWidget);
    await tester.tap(find.byKey(const Key('intro-next')));
    await tester.pumpAndSettle();
    expect(find.text(introSlides[1].title), findsOneWidget);
    await tester.tap(find.byKey(const Key('intro-next')));
    await tester.pumpAndSettle();
    expect(find.text('Get started'), findsOneWidget);
    expect(find.text('Skip'), findsNothing);

    await tester.tap(find.text('Get started'));
    await tester.pumpAndSettle();
    expect(intro.marked, isTrue);
    expect(_path(router), '/sign-in');
    expect(find.text('Sign in to KodiHQ'), findsOneWidget);
  });

  testWidgets('Skip goes straight to the sign-in list', (tester) async {
    final intro = _FakeIntroStore();
    final router = await _pumpRouter(tester, at: '/welcome', intro: intro);
    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();
    expect(intro.marked, isTrue);
    expect(_path(router), '/sign-in');
  });

  testWidgets('the sign-in page lists the four ways to sign in under photos', (
    tester,
  ) async {
    await _pumpRouter(tester, at: '/sign-in');
    expect(find.text('Sign in to KodiHQ'), findsOneWidget);
    expect(find.byKey(const Key('sign-in-photo-caption')), findsOneWidget);
    for (final m in SignInMethod.values) {
      expect(find.byKey(Key('sign-in-with-${m.name}')), findsOneWidget);
      expect(find.text(m.label), findsOneWidget);
    }

    // Email and password: an email field, and a phone number is caught before sending.
    await tester.ensureVisible(
      find.byKey(const Key('sign-in-with-emailPassword')),
    );
    await tester.tap(find.byKey(const Key('sign-in-with-emailPassword')));
    await tester.pumpAndSettle();
    expect(find.byType(SignInScreen), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    await tester.enterText(
      find.byKey(const Key('sign-in-identifier')),
      '0712345678',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'Password'),
      'secret123',
    );
    await tester.ensureVisible(find.text('Sign in').last);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Enter an email address'), findsOneWidget);

    // Phone with a code: a phone field, no password.
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('sign-in-with-phoneCode')));
    await tester.tap(find.byKey(const Key('sign-in-with-phoneCode')));
    await tester.pumpAndSettle();
    expect(find.byType(CodeSignInScreen), findsOneWidget);
    expect(find.text('Phone number'), findsOneWidget);
    expect(
      find.textContaining('we’ll text you a 6-digit code'),
      findsOneWidget,
    );
    expect(find.text('Password'), findsNothing);
  });
}
