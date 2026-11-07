import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../auth/session_controller.dart';
import '../providers.dart';
import 'firebase_push.dart';

/// Resolves the device's FCM / APNs token and platform name (`android`, `ios`, `web`).
/// Uses the `co.ke.kodihub.push` platform channel when available, and degrades gracefully
/// when running on a simulator, test harness, or build without Google Play Services.
abstract class PushTokenSource {
  Future<({String token, String platform})?> currentToken();
}

class MethodChannelPushTokenSource implements PushTokenSource {
  static const _channel = MethodChannel('co.ke.kodihub.push');

  @override
  Future<({String token, String platform})?> currentToken() async {
    try {
      final raw = await _channel.invokeMethod<String>('getToken');
      if (raw == null || raw.trim().length < 8) return null;
      final platform = kIsWeb
          ? 'web'
          : switch (defaultTargetPlatform) {
              TargetPlatform.iOS || TargetPlatform.macOS => 'ios',
              _ => 'android',
            };
      return (token: raw.trim(), platform: platform);
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    } catch (_) {
      return null;
    }
  }
}

/// Firebase when this build is configured for it (phase 13), else the native bridge.
final pushTokenSourceProvider = Provider<PushTokenSource>(
  (_) => Firebase.apps.isNotEmpty
      ? FirebasePushTokenSource(
          FirebasePushMessaging(FirebaseMessaging.instance),
        )
      : MethodChannelPushTokenSource(),
);

/// Maps a backend notification `actionUrl` to the corresponding mobile route and [AppMode].
({String route, AppMode? mode})? mobileRouteForActionUrl(String? actionUrl) {
  if (actionUrl == null || actionUrl.trim().isEmpty) return null;
  final raw = actionUrl.trim();
  if (raw.startsWith('/tenant/invoices')) {
    return (route: '/tenant/invoices', mode: AppMode.tenant);
  }
  if (raw.startsWith('/tenant/payments')) {
    return (route: '/tenant/payments', mode: AppMode.tenant);
  }
  if (raw.startsWith('/tenant/maintenance') ||
      raw.startsWith('/tenant/requests')) {
    return (route: '/tenant/requests', mode: AppMode.tenant);
  }
  for (final page in const ['notices', 'documents', 'statement', 'profile']) {
    if (raw.startsWith('/tenant/$page')) {
      return (route: '/tenant/$page', mode: AppMode.tenant);
    }
  }
  if (raw.startsWith('/tenant')) {
    return (route: '/tenant', mode: AppMode.tenant);
  }
  if (raw.startsWith('/owner')) {
    return (route: '/owner', mode: AppMode.owner);
  }
  if (raw.startsWith('/app/bookings/')) {
    final id = raw.substring('/app/bookings/'.length);
    return (
      route: id.isEmpty ? '/host/bookings' : '/host/bookings/$id',
      mode: AppMode.host,
    );
  }
  if (raw == '/app/bookings' || raw.startsWith('/host/bookings')) {
    final suffix = raw.startsWith('/host') ? raw : '/host/bookings';
    return (route: suffix, mode: AppMode.host);
  }
  if (raw == '/app/cleaning' || raw.startsWith('/host/cleaning')) {
    return (route: '/host/cleaning', mode: AppMode.host);
  }
  if (raw == '/app/guests' || raw.startsWith('/host/guests')) {
    return (route: '/host/guests', mode: AppMode.host);
  }
  if (raw == '/maintenance' || raw.startsWith('/app/maintenance')) {
    return (route: '/staff/more/maintenance', mode: AppMode.staff);
  }
  if (raw.startsWith('/app/payments') || raw.startsWith('/payments')) {
    return (route: '/staff/money', mode: AppMode.staff);
  }
  if (raw.startsWith('/app/invoices') || raw.startsWith('/invoices')) {
    return (route: '/staff/money', mode: AppMode.staff);
  }
  if (raw.startsWith('/settings/billing') ||
      raw.startsWith('/app/settings/billing')) {
    return (route: '/staff/more/billing', mode: AppMode.staff);
  }
  if (raw.startsWith('/app')) {
    return (route: '/staff', mode: AppMode.staff);
  }
  if (raw.startsWith('/admin') || raw.startsWith('/platform')) {
    return (route: '/platform', mode: AppMode.platform);
  }
  return null;
}

class PushNotificationsService {
  PushNotificationsService(this._api, this._source);

  final ApiClient _api;
  final PushTokenSource _source;
  String? _registeredToken;

  String? get registeredToken => _registeredToken;

  /// Registers the current device's FCM token with `POST /notifications/devices`.
  /// Best-effort: never throws so sign-in or session refresh is never blocked.
  Future<bool> registerCurrentDevice() async {
    try {
      final info = await _source.currentToken();
      if (info == null) return false;
      if (_registeredToken == info.token) return true;
      await _api.post(
        '/notifications/devices',
        body: {'token': info.token, 'platform': info.platform},
      );
      _registeredToken = info.token;
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Registers an explicit FCM token (e.g. from a token-refresh callback).
  Future<bool> registerToken(String token, {required String platform}) async {
    final trimmed = token.trim();
    if (trimmed.length < 8) return false;
    try {
      await _api.post(
        '/notifications/devices',
        body: {'token': trimmed, 'platform': platform},
      );
      _registeredToken = trimmed;
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Unregisters the active device token before signing out.
  Future<void> unregisterCurrentDevice() async {
    final token = _registeredToken;
    _registeredToken = null;
    if (token == null) return;
    try {
      await _api.delete('/notifications/devices', body: {'token': token});
    } catch (_) {
      // Best-effort on sign-out.
    }
  }
}

final pushNotificationsServiceProvider = Provider<PushNotificationsService>(
  (ref) => PushNotificationsService(
    ref.watch(apiClientProvider),
    ref.watch(pushTokenSourceProvider),
  ),
);
