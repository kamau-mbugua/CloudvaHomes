import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'push_service.dart';

/// The bits of Firebase Cloud Messaging the app uses, behind an interface so tests don't
/// need Firebase (phase 13). Messages are reduced to their `data` map.
abstract class PushMessaging {
  Future<bool> requestPermission();
  Future<String?> getToken();
  Stream<Map<String, dynamic>> get onMessage;
  Stream<Map<String, dynamic>> get onMessageOpenedApp;
  Future<Map<String, dynamic>?> getInitialMessage();
}

class FirebasePushMessaging implements PushMessaging {
  FirebasePushMessaging(this._m);
  final FirebaseMessaging _m;

  @override
  Future<bool> requestPermission() async {
    final s = await _m.requestPermission();
    return s.authorizationStatus == AuthorizationStatus.authorized ||
        s.authorizationStatus == AuthorizationStatus.provisional;
  }

  @override
  Future<String?> getToken() => _m.getToken();

  @override
  Stream<Map<String, dynamic>> get onMessage =>
      FirebaseMessaging.onMessage.map((m) => m.data);

  @override
  Stream<Map<String, dynamic>> get onMessageOpenedApp =>
      FirebaseMessaging.onMessageOpenedApp.map((m) => m.data);

  @override
  Future<Map<String, dynamic>?> getInitialMessage() async =>
      (await _m.getInitialMessage())?.data;
}

/// The device token through Firebase: asks for notification permission once, then returns
/// the token (null if declined or unavailable).
class FirebasePushTokenSource implements PushTokenSource {
  FirebasePushTokenSource(this._m);
  final PushMessaging _m;

  @override
  Future<({String token, String platform})?> currentToken() async {
    try {
      if (!await _m.requestPermission()) return null;
      final token = (await _m.getToken())?.trim();
      if (token == null || token.length < 8) return null;
      final platform = switch (defaultTargetPlatform) {
        TargetPlatform.iOS || TargetPlatform.macOS => 'ios',
        _ => 'android',
      };
      return (token: token, platform: platform);
    } catch (_) {
      return null;
    }
  }
}

/// Foreground pushes refresh the notifications list; tapping one (or opening the app from
/// one) goes to the screen in its `actionUrl`. The handlers are live as soon as this returns
/// (cancel the handle to stop); the cold-start message is looked up in the background, and
/// a failure there or a bad message is logged rather than thrown.
PushHandlers wirePushHandlers(
  PushMessaging m, {
  required void Function() onForeground,
  required void Function(String? actionUrl) onOpen,
}) {
  void logError(Object e) => debugPrint('Push message error: $e');
  final handlers = PushHandlers([
    m.onMessage.listen((_) => onForeground(), onError: logError),
    m.onMessageOpenedApp.listen(
      (d) => onOpen(d['actionUrl'] as String?),
      onError: logError,
    ),
  ]);
  unawaited(
    m
        .getInitialMessage()
        .then<void>((initial) {
          if (initial != null && !handlers.cancelled) {
            onOpen(initial['actionUrl'] as String?);
          }
        })
        .catchError(logError),
  );
  return handlers;
}

class PushHandlers {
  PushHandlers(this._subs);
  final List<StreamSubscription<Map<String, dynamic>>> _subs;
  bool cancelled = false;
  Future<void> cancel() async {
    cancelled = true;
    for (final s in _subs) {
      await s.cancel();
    }
  }
}

/// Starts Firebase if this build has its config files (google-services.json /
/// GoogleService-Info.plist, added by `flutterfire configure`). Without them the app works
/// as before, with no push. Returns whether Firebase is ready.
Future<bool> initFirebaseIfConfigured() async {
  try {
    if (Firebase.apps.isEmpty) await Firebase.initializeApp();
    return true;
  } catch (e) {
    debugPrint('Firebase not configured for this build: $e');
    return false;
  }
}
