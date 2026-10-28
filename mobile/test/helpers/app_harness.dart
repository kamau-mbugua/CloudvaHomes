import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/core/theme.dart';

import 'fake_http.dart';

/// A session that is simply there (no refresh call).
class FixedSession extends SessionController {
  FixedSession(this.session);
  final Session? session;
  int reloads = 0;
  @override
  Future<Session?> build() async => session;
  @override
  Future<void> reload() async => reloads++;
}

/// Pumps [child] inside a themed app with the fake API and a fixed session.
Future<void> pumpWithApi(
  dynamic tester,
  Widget child, {
  required FakeAdapter adapter,
  Map<String, Object?>? session,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(fakeClient(adapter)),
        stkPollIntervalProvider.overrideWithValue(
          const Duration(milliseconds: 10),
        ),
        sessionProvider.overrideWith(
          () =>
              FixedSession(session == null ? null : Session.fromJson(session)),
        ),
      ],
      child: MaterialApp(
        theme: hodiTheme(Brightness.light),
        home: Scaffold(body: child),
      ),
    ),
  );
  await settle(tester);
}

/// Lets real async work (Dio's request pipeline) finish, then settles the frames.
/// Pass `andSettle: false` while a spinner or a timer is running (pumpAndSettle would
/// spin through fake time).
Future<void> settle(
  dynamic tester, {
  int rounds = 6,
  bool andSettle = true,
}) async {
  for (var i = 0; i < rounds; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 20)),
    );
    await tester.pump();
  }
  if (andSettle) await tester.pumpAndSettle();
}

/// Taps [finder] in real time (so Dio's request runs), then waits until [until] holds
/// (up to 3 s) and settles the frames.
Future<void> tapAndWait(
  dynamic tester,
  dynamic finder,
  bool Function() until,
) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.runAsync(() async {
    await tester.tap(finder);
    final end = DateTime.now().add(const Duration(seconds: 3));
    while (!until() && DateTime.now().isBefore(end)) {
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    await Future<void>.delayed(const Duration(milliseconds: 30));
  });
  await tester.pump();
  await tester.pump();
}
