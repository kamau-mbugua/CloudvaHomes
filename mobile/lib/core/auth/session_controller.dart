import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/api_error.dart';
import '../providers.dart';
import 'session.dart';
import 'token_store.dart';

/// Which side of the app is showing. Someone who is staff, a tenant, a landlord owner, or a platform admin can switch.
enum AppMode { staff, tenant, owner, platform }

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
  ApiClient get _api => ref.read(apiClientProvider);
  TokenStore get _store => ref.read(tokenStoreProvider);

  @override
  Future<Session?> build() async {
    _api
      ..onRefresh = _refresh
      ..onAuthLost = _lost
      ..onSuspended = () => reload();
    final token = await _store.read();
    if (token == null) return null;
    try {
      return await _refreshWith(token);
    } on ApiError catch (e) {
      // Offline at launch: keep the token and show sign-in; a 401 means it is gone for good.
      if (!e.isNetworkError) await _store.clear();
      if (e.isNetworkError) rethrow;
      return null;
    }
  }

  Future<Session> _refreshWith(String token) async {
    final res = await _api.post(
      '/auth/refresh',
      body: {'refreshToken': token, 'client': 'mobile'},
    );
    return _accept(res['data'] as Map<String, dynamic>);
  }

  Future<bool> _refresh() async {
    final token = await _store.read();
    if (token == null) return false;
    try {
      state = AsyncData(await _refreshWith(token));
      return true;
    } on ApiError catch (e) {
      if (!e.isNetworkError) await _store.clear();
      return false;
    }
  }

  void _lost() {
    _store.clear();
    _api.accessToken = null;
    state = const AsyncData(null);
  }

  Future<Session> _accept(Map<String, dynamic> data) async {
    final refresh = data['refreshToken'];
    if (refresh is String) await _store.write(refresh);
    final session = Session.fromJson(data);
    _api.accessToken = session.accessToken;
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
    await switchContext(
      organizationId: organizationId,
      propertyId: propertyId,
      setAsDefault: true,
    );
  }

  /// Switches the active organisation, property, tenant account, or landlord account
  /// (`null` = consolidated view across all properties/units), rotates the JWT access token,
  /// and saves the choice as the user's default on the server.
  Future<void> switchContext({
    String? organizationId,
    Object? propertyId = _omit,
    Object? tenantId = _omit,
    Object? landlordId = _omit,
    bool setAsDefault = true,
  }) async {
    final body = <String, dynamic>{
      'organizationId': ?organizationId,
      if (!identical(propertyId, _omit)) 'propertyId': propertyId,
      if (!identical(tenantId, _omit)) 'tenantId': tenantId,
      if (!identical(landlordId, _omit)) 'landlordId': landlordId,
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
    await _api.patch(
      '/me',
      body: {'firstName': firstName.trim(), 'lastName': lastName.trim()},
    );
    await reload();
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) => _api.post(
    '/me/password',
    body: {'currentPassword': currentPassword, 'newPassword': newPassword},
  );

  /// Re-reads the session (permissions, organisation status).
  Future<void> reload() async {
    if (state.valueOrNull == null) return;
    try {
      final res = await _api.get('/me');
      state = AsyncData(await _accept(res['data'] as Map<String, dynamic>));
    } on ApiError {
      // Keep what we have; the next request will surface any real problem.
    }
  }

  Future<void> signOut() async {
    final token = await _store.read();
    try {
      if (token != null) {
        await _api.post('/auth/logout', body: {'refreshToken': token});
      }
    } on ApiError {
      // Signed out locally regardless; the server session expires on its own.
    }
    await _store.clear();
    _api.accessToken = null;
    ref.read(appModeProvider.notifier).state = null;
    state = const AsyncData(null);
  }
}

const Object _omit = Object();

final sessionProvider = AsyncNotifierProvider<SessionController, Session?>(
  SessionController.new,
);

/// The mode the person chose; null = the default for their session.
final appModeProvider = StateProvider<AppMode?>((ref) => null);

/// The mode to show: staff when they belong to an organisation, else tenant, else owner, else platform admin.
AppMode? effectiveMode(Session? s, AppMode? chosen) {
  if (s == null) return null;
  if (chosen == AppMode.platform && s.isPlatformAdmin) return AppMode.platform;
  if (chosen == AppMode.staff && s.isStaff) return AppMode.staff;
  if (chosen == AppMode.tenant && s.isTenant) return AppMode.tenant;
  if (chosen == AppMode.owner && s.isOwner) return AppMode.owner;
  if (s.isStaff) return AppMode.staff;
  if (s.isTenant) return AppMode.tenant;
  if (s.isOwner) return AppMode.owner;
  if (s.isPlatformAdmin) return AppMode.platform;
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
