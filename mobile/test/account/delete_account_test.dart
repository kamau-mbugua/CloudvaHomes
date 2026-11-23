import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/auth/token_store.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/core/theme.dart';
import 'package:hodi/features/account/delete_account_screen.dart';

import '../helpers/app_harness.dart';
import '../helpers/fake_http.dart';

late FakeAdapter _adapter;

Future<(MemoryTokenStore, ProviderContainer)> _pump(
  WidgetTester tester,
  (int, Object?) Function(Call c) onDelete,
) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  _adapter = FakeAdapter(
    (c) => switch (c.path) {
      '/auth/refresh' => (200, {'data': sessionJson(refreshToken: 'r-live')}),
      '/auth/step-up/request' => (
        202,
        {
          'data': {'sent': true},
        },
      ),
      '/auth/step-up/verify' => (
        200,
        {
          'data': {
            'stepUpToken': 'su-1',
            'expiresAt': '2026-11-23T12:00:00.000Z',
          },
        },
      ),
      '/me/delete' => onDelete(c),
      _ => (404, errorBody('NOT_FOUND', 'x')),
    },
  );
  final store = MemoryTokenStore()
    ..token = 'r-start'
    ..savedCredentials.addAll(const [
      SavedCredential(identifier: 'owner@example.invalid'),
      SavedCredential(identifier: '+254700000001'),
      SavedCredential(identifier: 'someone.else@example.invalid'),
    ]);
  final container = ProviderContainer(
    overrides: [
      apiClientProvider.overrideWithValue(fakeClient(_adapter)),
      tokenStoreProvider.overrideWithValue(store),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        theme: hodiTheme(Brightness.light),
        home: const DeleteAccountScreen(),
      ),
    ),
  );
  await settle(tester);
  return (store, container);
}

Future<void> _tapReal(WidgetTester tester, Finder f) {
  final before = _adapter.calls.length;
  return tapAndWait(tester, f, () => _adapter.calls.length > before);
}

Future<void> _confirmWithCode(WidgetTester tester) async {
  final go = find.byKey(const Key('delete-account-go'));
  expect(tester.widget<FilledButton>(go).onPressed, isNull);
  await tester.enterText(
    find.widgetWithText(TextField, 'Why are you leaving? (optional)'),
    'Moved out',
  );
  await tester.ensureVisible(find.byKey(const Key('delete-understood')));
  await tester.tap(find.byKey(const Key('delete-understood')));
  await tester.pump();
  await _tapReal(tester, go);
  expect(find.textContaining('We sent a 6-digit code to your phone'), findsOne);
  await tester.enterText(find.widgetWithText(TextField, 'Code'), '123456');
}

void main() {
  testWidgets('confirms with a code, deletes, and forgets the account here', (
    tester,
  ) async {
    final (store, container) = await _pump(tester, (_) => (204, null));
    expect(find.text('Delete your KodiHQ account?'), findsOneWidget);

    await _confirmWithCode(tester);
    final go = find.byKey(const Key('delete-account-go'));
    final before = _adapter.calls.length;
    await tapAndWait(tester, go, () => _adapter.calls.length > before + 1);
    await settle(tester);

    final del = _adapter.calls.firstWhere((c) => c.path == '/me/delete');
    expect(del.method, 'POST');
    expect(del.headers['X-Step-Up'], 'su-1');
    expect(del.body, {'reason': 'Moved out'});
    expect(container.read(sessionProvider).valueOrNull, isNull);
    expect(store.token, isNull);
    expect(store.savedCredentials.map((c) => c.identifier), [
      'someone.else@example.invalid',
    ]);
    // No logout call: the server already ended every session.
    expect(_adapter.calls.where((c) => c.path == '/auth/logout'), isEmpty);
  });

  testWidgets('an only owner is told what to do and stays signed in', (
    tester,
  ) async {
    final (store, container) = await _pump(
      tester,
      (_) => (
        409,
        errorBody(
          'SOLE_OWNER',
          "You're the only owner of Test Org. Make someone else an owner first.",
        ),
      ),
    );
    await _confirmWithCode(tester);
    final go = find.byKey(const Key('delete-account-go'));
    final before = _adapter.calls.length;
    await tapAndWait(tester, go, () => _adapter.calls.length > before + 1);
    await settle(tester);
    expect(find.textContaining("You're the only owner of Test Org"), findsOne);
    expect(container.read(sessionProvider).valueOrNull, isNotNull);
    expect(store.savedCredentials, hasLength(3));
  });
}
