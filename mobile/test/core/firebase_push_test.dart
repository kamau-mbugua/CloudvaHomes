import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/notifications/firebase_push.dart';

class FakeMessaging implements PushMessaging {
  FakeMessaging({
    this.granted = true,
    this.token = 'fcm-token-123456',
    this.initial,
    this.initialError,
  });
  final bool granted;
  final String? token;
  final Map<String, dynamic>? initial;
  final Object? initialError;
  final foreground = StreamController<Map<String, dynamic>>.broadcast();
  final opened = StreamController<Map<String, dynamic>>.broadcast();
  int permissionAsks = 0;

  @override
  Future<bool> requestPermission() async {
    permissionAsks++;
    return granted;
  }

  @override
  Future<String?> getToken() async => token;

  @override
  Stream<Map<String, dynamic>> get onMessage => foreground.stream;

  @override
  Stream<Map<String, dynamic>> get onMessageOpenedApp => opened.stream;

  @override
  Future<Map<String, dynamic>?> getInitialMessage() async {
    if (initialError != null) throw initialError!;
    return initial;
  }
}

void main() {
  test('no token when the person declines notifications', () async {
    final source = FirebasePushTokenSource(FakeMessaging(granted: false));
    expect(await source.currentToken(), isNull);
  });

  test('the token and platform once allowed', () async {
    final m = FakeMessaging();
    final info = await FirebasePushTokenSource(m).currentToken();
    expect(info?.token, 'fcm-token-123456');
    expect(info?.platform, isIn(['android', 'ios']));
    expect(m.permissionAsks, 1);
  });

  test('ignores a missing or junk token', () async {
    expect(
      await FirebasePushTokenSource(FakeMessaging(token: ' ')).currentToken(),
      isNull,
    );
  });

  test(
    'foreground messages refresh, taps open the right screen, including a cold start',
    () async {
      final m = FakeMessaging(initial: {'actionUrl': '/tenant/invoices'});
      var refreshed = 0;
      final opened = <String?>[];
      final sub = wirePushHandlers(
        m,
        onForeground: () => refreshed++,
        onOpen: opened.add,
      );
      await Future<void>.delayed(Duration.zero);
      m.foreground.add({'title': 'Rent due'});
      m.opened.add({'actionUrl': '/tenant/maintenance'});
      await Future<void>.delayed(Duration.zero);
      expect(refreshed, 1);
      expect(opened, ['/tenant/invoices', '/tenant/maintenance']);
      await sub.cancel();
    },
  );

  test(
    'handlers are live straight away and survive a failing cold-start lookup',
    () async {
      final m = FakeMessaging(initialError: StateError('no Firebase'));
      var refreshed = 0;
      final opened = <String?>[];
      // Returned synchronously, so a screen disposed early can still cancel it.
      final PushHandlers handlers = wirePushHandlers(
        m,
        onForeground: () => refreshed++,
        onOpen: opened.add,
      );
      await Future<void>.delayed(Duration.zero);
      m.foreground.add({'title': 'Rent due'});
      m.foreground.addError(Exception('bad message'));
      m.opened.add({'actionUrl': '/tenant/maintenance'});
      await Future<void>.delayed(Duration.zero);
      expect(refreshed, 1);
      expect(opened, ['/tenant/maintenance']);
      await handlers.cancel();
    },
  );
}
