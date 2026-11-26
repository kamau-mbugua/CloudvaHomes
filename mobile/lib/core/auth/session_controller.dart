import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/api_error.dart';
import '../notifications/push_service.dart';
import '../offline/offline_cache.dart';
import '../providers.dart';
import 'session.dart';
import 'token_store.dart';

/// Which side of the app is showing. Someone who is staff, a short-stay host, a tenant, a landlord owner, or a platform admin can switch.
enum AppMode { staff, host, tenant, owner, platform }

/// Returned when password sign-in requires a second-factor verification code.
class TwoFactorChallenge {
  const TwoFactorChallenge({
    required this.challengeToken,
    required this.channel,
    required this.destinationMasked,
    this.expiresAt,
  });

  final String challengeToken;
  final String channel;
  final String destinationMasked;
  final String? expiresAt;

  factory TwoFactorChallenge.fromJson(Map<String, dynamic> j) =>
      TwoFactorChallenge(
        challengeToken: j['challengeToken'] as String,
        channel: (j['channel'] as String?) ?? 'EMAIL',
        destinationMasked:
            (j['destinationMasked'] as String?) ?? 'your account',
        expiresAt: j['expiresAt'] as String?,
      );
}

/// The session: restored from the stored refresh token at launch, null when signed out.
class SessionController extends AsyncNotifier<Session?> {
  static const snapshotMaxAge = Duration(days: 30);
  static const offlineActionMessage =
      "You're offline. Try again when you have signal.";

  Timer? _reconnectTimer;
  AppLifecycleListener? _lifecycle;
  bool _inForeground = true;

  ApiClient get _api => ref.read(apiClientProvider);
  TokenStore get _store => ref.read(tokenStoreProvider);

  static bool _isAuthRejection(ApiError e) =>
      e.status == 401 || e.status == 403;

  @override
  Future<Session?> build() async {
    ref.onDispose(_stopReconnectWatchers);
    _stopReconnectWatchers();
    _api
      ..onRefresh = _refresh
      ..onAuthLost = _lost
      ..onSuspended = () => reload();
    final token = await _store.read();
    if (token == null) {
      _api.offlineSession = false;
      _api.accessToken = null;
      return null;
    }
    try {
      return await _refreshWith(token);
    } on ApiError catch (e) {
      // Only a 401/403 from /auth/refresh means the session is gone; network errors,
      // timeouts, 429 and 5xx keep the token and open offline mode when eligible.
      if (_isAuthRejection(e)) {
        await _clearAllLocalAuth();
        return null;
      }
      final offline = await _tryRestoreOfflineSnapshot();
      if (offline != null) return offline;
      rethrow;
    }
  }

  Future<Session?> _tryRestoreOfflineSnapshot() async {
    final snapshot = await _store.readSessionSnapshot();
    if (snapshot == null) return null;
    final age = DateTime.now().toUtc().difference(snapshot.savedAt.toUtc());
    if (age >= snapshotMaxAge) return null;
    final Session session;
    try {
      session = Session.fromJson(snapshot.data, offline: true);
    } on Object {
      return null;
    }
    if (effectiveMode(session, null) != AppMode.staff) return null;
    _api.accessToken = null;
    _api.offlineSession = true;
    _startReconnectWatchers();
    return session;
  }

  void _startPeriodicReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    final every = ref.read(offlineReconnectIntervalProvider);
    if (every == null) return;
    _reconnectTimer = Timer.periodic(every, (_) {
      if (_inForeground && state.valueOrNull?.offline == true) {
        unawaited(reconnect());
      }
    });
  }

  void _onBackgrounded() {
    _inForeground = false;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
  }

  void _startReconnectWatchers() {
    _stopReconnectWatchers();
    _inForeground = true;
    _startPeriodicReconnect();
    try {
      WidgetsBinding.instance;
      _lifecycle = AppLifecycleListener(
        onResume: () {
          _inForeground = true;
          if (state.valueOrNull?.offline == true) {
            _startPeriodicReconnect();
            unawaited(reconnect());
          }
        },
        onInactive: _onBackgrounded,
        onHide: _onBackgrounded,
        onPause: _onBackgrounded,
        onDetach: _onBackgrounded,
      );
    } on Object {
      // Pure Dart ProviderContainer unit tests run without a WidgetsBinding.
    }
  }

  void _stopReconnectWatchers() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _lifecycle?.dispose();
    _lifecycle = null;
  }

  /// Tries to promote an offline session back to a live session via `/auth/refresh`.
  Future<bool> reconnect() async {
    if (state.valueOrNull?.offline != true) return true;
    try {
      final ok = await _api.refreshOnce();
      return ok && state.valueOrNull?.offline == false;
    } on Object {
      return false;
    }
  }

  void _requireOnline() {
    if (state.valueOrNull?.offline == true) {
      throw const ApiError(
        status: 0,
        code: 'OFFLINE_SESSION',
        message: offlineActionMessage,
      );
    }
  }

  Future<Session> _refreshWith(String token) async {
    final res = await _api.post(
      '/auth/refresh',
      body: {'refreshToken': token, 'client': 'mobile'},
      skipAuthRefresh: true,
    );
    return _accept(res['data'] as Map<String, dynamic>);
  }

  Future<bool> _refresh() async {
    final token = await _store.read();
    if (token == null) {
      await _clearAllLocalAuth();
      state = const AsyncData(null);
      return false;
    }
    try {
      state = AsyncData(await _refreshWith(token));
      return true;
    } on ApiError catch (e) {
      if (_isAuthRejection(e)) {
        await _clearAllLocalAuth();
        state = const AsyncData(null);
        return false;
      }
      rethrow;
    }
  }

  void _lost() {
    _stopReconnectWatchers();
    unawaited(_store.clear());
    unawaited(_store.clearSessionSnapshot());
    unawaited(_clearOfflineCache());
    _api.offlineSession = false;
    _api.accessToken = null;
    ref.read(appModeProvider.notifier).state = null;
    state = const AsyncData(null);
  }

  Future<void> _clearAllLocalAuth() async {
    _stopReconnectWatchers();
    await _store.clear();
    await _store.clearSessionSnapshot();
    await _clearOfflineCache();
    _api.offlineSession = false;
    _api.accessToken = null;
    ref.read(appModeProvider.notifier).state = null;
  }

  Future<Session> _accept(Map<String, dynamic> data) async {
    _stopReconnectWatchers();
    final refresh = data['refreshToken'];
    if (refresh is String) await _store.write(refresh);
    await _store.writeSessionSnapshot(data);
    final session = Session.fromJson(data);
    _api.offlineSession = false;
    _api.accessToken = session.accessToken;
    await ref.read(pushNotificationsServiceProvider).registerCurrentDevice();
    return session;
  }

  Future<TwoFactorChallenge?> signInWithPassword(
    String identifier,
    String password,
  ) async {
    final res = await _api.post(
      '/auth/login',
      body: {
        'identifier': identifier.trim(),
        'password': password,
        'client': 'mobile',
      },
    );
    final data = res['data'] as Map<String, dynamic>;
    if (data['requiresTwoFactor'] == true) {
      return TwoFactorChallenge.fromJson(data);
    }
    state = AsyncData(await _accept(data));
    return null;
  }

  Future<void> verifyTwoFactor(String challengeToken, String code) async {
    final res = await _api.post(
      '/auth/login/2fa',
      body: {
        'challengeToken': challengeToken.trim(),
        'code': code.trim(),
        'client': 'mobile',
      },
    );
    state = AsyncData(await _accept(res['data'] as Map<String, dynamic>));
  }

  /// Restores a remembered account from its stored refresh token without storing a password.
  Future<bool> signInWithSavedToken(String refreshToken) async {
    try {
      state = AsyncData(await _refreshWith(refreshToken));
      return true;
    } on ApiError {
      return false;
    }
  }

  /// Sends a sign-in code by SMS or email. The server answers the same whether or not the
  /// phone/email has an account, so this never says who uses Hodi.
  Future<void> requestCode(String phoneOrEmail) =>
      _api.post('/auth/otp/request', body: {'phone': phoneOrEmail.trim()});

  Future<void> signInWithCode(String phoneOrEmail, String code) async {
    final res = await _api.post(
      '/auth/otp/verify',
      body: {
        'phone': phoneOrEmail.trim(),
        'code': code.trim(),
        'client': 'mobile',
      },
    );
    state = AsyncData(await _accept(res['data'] as Map<String, dynamic>));
  }

  Future<void> forgotPassword(String identifier) => _api.post(
    '/auth/password/forgot',
    body: {'identifier': identifier.trim()},
  );

  Future<void> resetPassword(
    String identifier,
    String code,
    String newPassword,
  ) => _api.post(
    '/auth/password/reset',
    body: {
      'identifier': identifier.trim(),
      'code': code.trim(),
      'newPassword': newPassword,
    },
  );

  Future<void> switchOrganization(
    String organizationId, {
    String? propertyId,
  }) async {
    _requireOnline();
    await switchContext(
      organizationId: organizationId,
      propertyId: propertyId,
      place: 'STAFF',
      setAsDefault: true,
    );
  }

  /// Saves the chosen kind of place (`STAFF`, `TENANT`, `OWNER`, `PLATFORM`) on the server.
  Future<void> setPlace(String place) async {
    _requireOnline();
    final prev = ref.read(appModeProvider);
    ref.read(appModeProvider.notifier).state = switch (place) {
      'PLATFORM' => AppMode.platform,
      'TENANT' => AppMode.tenant,
      'OWNER' => AppMode.owner,
      'STAFF' =>
        state.valueOrNull?.activeOrganization?.kind == 'HOST'
            ? AppMode.host
            : AppMode.staff,
      _ => prev,
    };
    try {
      await switchContext(place: place);
    } on Object {
      ref.read(appModeProvider.notifier).state = prev;
      rethrow;
    }
  }

  /// Accepts a pending membership invitation belonging to the signed-in user and switches into it.
  Future<Session> acceptInvitation(String membershipId) async {
    _requireOnline();
    final res = await _api.post('/auth/memberships/$membershipId/accept');
    final next = await _accept(res['data'] as Map<String, dynamic>);
    state = AsyncData(next);
    ref.read(appModeProvider.notifier).state =
        next.activeOrganization?.kind == 'HOST' ? AppMode.host : AppMode.staff;
    return next;
  }

  /// Switches the active organisation, property, tenant account, home, or landlord account
  /// (`null` = consolidated view across all properties/units), rotates the JWT access token,
  /// and saves the choice as the user's default on the server.
  Future<void> switchContext({
    String? organizationId,
    Object? propertyId = _omit,
    Object? tenantId = _omit,
    Object? homeId = _omit,
    Object? landlordId = _omit,
    String? place,
    bool setAsDefault = true,
  }) async {
    _requireOnline();
    final body = <String, dynamic>{
      'organizationId': ?organizationId,
      if (!identical(propertyId, _omit)) 'propertyId': propertyId,
      if (!identical(tenantId, _omit)) 'tenantId': tenantId,
      if (!identical(homeId, _omit)) 'homeId': homeId,
      if (!identical(landlordId, _omit)) 'landlordId': landlordId,
      'place': ?place,
      'setAsDefault': setAsDefault,
    };
    try {
      final res = await _api.post('/auth/switch-context', body: body);
      state = AsyncData(await _accept(res['data'] as Map<String, dynamic>));
    } on ApiError catch (e) {
      // Graceful fallback if the server hasn't deployed /auth/switch-context yet.
      if (e.status == 404) {
        if (organizationId != null) {
          final res = await _api.post(
            '/auth/switch-org',
            body: {'organizationId': organizationId},
          );
          final next = await _accept(res['data'] as Map<String, dynamic>);
          state = AsyncData(
            next.copyWith(
              activePropertyId: identical(propertyId, _omit)
                  ? next.activePropertyId
                  : propertyId as String?,
              activeTenantId: identical(tenantId, _omit)
                  ? next.activeTenantId
                  : tenantId as String?,
              activeLandlordId: identical(landlordId, _omit)
                  ? next.activeLandlordId
                  : landlordId as String?,
            ),
          );
        } else {
          final current = state.valueOrNull;
          if (current != null) {
            state = AsyncData(
              current.copyWith(
                activePropertyId: identical(propertyId, _omit)
                    ? current.activePropertyId
                    : propertyId as String?,
                activeTenantId: identical(tenantId, _omit)
                    ? current.activeTenantId
                    : tenantId as String?,
                activeLandlordId: identical(landlordId, _omit)
                    ? current.activeLandlordId
                    : landlordId as String?,
              ),
            );
          }
        }
        return;
      }
      rethrow;
    }
  }

  Future<void> registerOrganization(Map<String, dynamic> body) async {
    final res = await _api.post(
      '/auth/register',
      body: {...body, 'client': 'mobile'},
    );
    state = AsyncData(await _accept(res['data'] as Map<String, dynamic>));
  }

  Future<void> updateProfile({
    required String firstName,
    required String lastName,
  }) async {
    _requireOnline();
    await _api.patch(
      '/me',
      body: {'firstName': firstName.trim(), 'lastName': lastName.trim()},
    );
    await reload();
  }

  /// Changes the password; with no [currentPassword], sets a first one for someone who signs
  /// in with codes, which needs a [stepUpToken] (see [requestStepUp]).
  Future<void> changePassword({
    String? currentPassword,
    required String newPassword,
    String? stepUpToken,
  }) async {
    _requireOnline();
    await _api.post(
      '/me/password',
      body: {'currentPassword': ?currentPassword, 'newPassword': newPassword},
      headers: stepUpToken == null ? null : {'X-Step-Up': stepUpToken},
    );
    await reload();
  }

  /// Re-reads the session (permissions, organisation status).
  Future<void> reload() async {
    final current = state.valueOrNull;
    if (current == null || current.offline) return;
    try {
      final res = await _api.get('/me');
      final data = res['data'] as Map<String, dynamic>;
      state = AsyncData(
        await _accept({
          if (!data.containsKey('accessToken') && _api.accessToken != null)
            'accessToken': _api.accessToken,
          ...data,
        }),
      );
    } on ApiError {
      // Keep what we have; the next request will surface any real problem.
    }
  }

  /// Sends a one-time code to the person's own phone (or email) to confirm a sensitive change.
  Future<void> requestStepUp() async {
    _requireOnline();
    await _api.post('/auth/step-up/request');
  }

  /// The code from [requestStepUp] → a short-lived grant for the `X-Step-Up` header.
  Future<String> verifyStepUp(String code) async {
    _requireOnline();
    final res = await _api.post(
      '/auth/step-up/verify',
      body: {'code': code.trim()},
    );
    return (res['data'] as Map<String, dynamic>)['stepUpToken'] as String;
  }

  /// Deletes the signed-in person's account, then forgets it on this phone: the session, the
  /// push token (the server dropped it) and any saved login for its email or phone.
  Future<void> deleteAccount({
    required String stepUpToken,
    String? reason,
  }) async {
    _requireOnline();
    final user = state.valueOrNull?.user;
    await _api.post(
      '/me/delete',
      body: {
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
      headers: {'X-Step-Up': stepUpToken},
    );
    for (final id in [user?.email, user?.phone]) {
      if (id != null && id.isNotEmpty) await _store.removeSavedCredential(id);
    }
    // The server already ended every session: no logout call, just forget it here.
    await _clearAllLocalAuth();
    state = const AsyncData(null);
  }

  Future<void> signOut() async {
    // Opened offline, this phone never registered for pushes in this run, and device tokens
    // belong to the person (not the session): without a reconnect the phone would keep getting
    // their notifications after sign-out. One reconnect lets the normal path below unregister
    // the device and end the server session. With no signal it fails at once, otherwise it is
    // bounded by the client's timeouts like any online sign-out. Not cut short on purpose: a
    // refresh landing after the local sign-out would sign the person back in.
    if (state.valueOrNull?.offline == true) await reconnect();
    final wasOffline = state.valueOrNull?.offline == true;
    _stopReconnectWatchers();
    if (!wasOffline) {
      await ref
          .read(pushNotificationsServiceProvider)
          .unregisterCurrentDevice();
    }
    final token = await _store.read();
    try {
      if (token != null && !wasOffline) {
        await _api.post(
          '/auth/logout',
          body: {'refreshToken': token},
          skipAuthRefresh: true,
        );
      }
    } on ApiError {
      // Signed out locally regardless; the server session expires on its own.
    }
    await _clearAllLocalAuth();
    state = const AsyncData(null);
  }

  Future<void> _clearOfflineCache() async {
    try {
      final cache = await ref.read(offlineCacheProvider.future);
      await cache.clear();
    } on Object {
      // Never block sign-out or account deletion if disk cleanup fails.
    }
  }
}

const Object _omit = Object();

/// Foreground reconnect cadence while [Session.offline] is true.
final offlineReconnectIntervalProvider = Provider<Duration?>(
  (_) => const Duration(seconds: 60),
);

final sessionProvider = AsyncNotifierProvider<SessionController, Session?>(
  SessionController.new,
);

/// The mode the person chose; null = the default for their session.
final appModeProvider = StateProvider<AppMode?>((ref) => null);

/// The mode to show: an in-session override (`chosen`), else the server's `defaultPlace` if
/// still allowed, else the fallback order (staff/host → tenant → owner → platform).
AppMode? effectiveMode(Session? s, AppMode? chosen) {
  if (s == null) return null;
  final orgMode = s.activeOrganization?.kind == 'HOST'
      ? AppMode.host
      : AppMode.staff;
  if (chosen == AppMode.platform && s.isPlatformOperator) {
    return AppMode.platform;
  }
  if ((chosen == AppMode.staff || chosen == AppMode.host) && s.isStaff) {
    return orgMode;
  }
  if (chosen == AppMode.tenant && s.isTenant) return AppMode.tenant;
  if (chosen == AppMode.owner && s.isOwner) return AppMode.owner;
  if (chosen == null) {
    switch (s.user.defaultPlace) {
      case 'PLATFORM':
        if (s.isPlatformOperator) return AppMode.platform;
      case 'TENANT':
        if (s.isTenant) return AppMode.tenant;
      case 'OWNER':
        if (s.isOwner) return AppMode.owner;
      case 'STAFF':
        if (s.isStaff) return orgMode;
    }
  }
  if (s.isStaff) return orgMode;
  if (s.isTenant) return AppMode.tenant;
  if (s.isOwner) return AppMode.owner;
  if (s.isPlatformOperator) return AppMode.platform;
  return null;
}

final modeProvider = Provider<AppMode?>(
  (ref) => effectiveMode(
    ref.watch(sessionProvider).valueOrNull,
    ref.watch(appModeProvider),
  ),
);

class MobileAppConfig {
  const MobileAppConfig({
    required this.maintenanceMode,
    required this.allowPublicSignup,
    required this.minimumMobileVersion,
    required this.forceUpdateRequired,
  });
  final bool maintenanceMode;
  final bool allowPublicSignup;
  final String? minimumMobileVersion;
  final bool forceUpdateRequired;

  factory MobileAppConfig.fromJson(Map<String, dynamic> j) => MobileAppConfig(
    maintenanceMode: j['maintenanceMode'] == true,
    allowPublicSignup: j['allowPublicSignup'] != false,
    minimumMobileVersion: j['minimumMobileVersion'] as String?,
    forceUpdateRequired: j['forceUpdateRequired'] == true,
  );
}

final appConfigProvider = FutureProvider.autoDispose<MobileAppConfig?>((
  ref,
) async {
  try {
    final res = await ref.watch(apiClientProvider).get('/auth/app-config');
    final data = res['data'];
    return data is Map<String, dynamic> ? MobileAppConfig.fromJson(data) : null;
  } on Object {
    return null;
  }
});
