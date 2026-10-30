import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/api_error.dart';
import '../providers.dart';
import 'session.dart';
import 'token_store.dart';

/// Which side of the app is showing. Someone who is both staff and a tenant can switch.
enum AppMode { staff, tenant }

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
  late ApiClient _api;
  late TokenStore _store;

  @override
  Future<Session?> build() async {
    _api = ref.read(apiClientProvider);
    _store = ref.read(tokenStoreProvider);
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
      '/auth/login/verify-2fa',
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

  Future<void> switchOrganization(String organizationId) async {
    final res = await _api.post(
      '/auth/switch-org',
      body: {'organizationId': organizationId},
    );
    state = AsyncData(await _accept(res['data'] as Map<String, dynamic>));
  }

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

final sessionProvider = AsyncNotifierProvider<SessionController, Session?>(
  SessionController.new,
);

/// The mode the person chose; null = the default for their session.
final appModeProvider = StateProvider<AppMode?>((ref) => null);

/// The mode to show: staff when they belong to an organisation, else tenant.
AppMode? effectiveMode(Session? s, AppMode? chosen) {
  if (s == null) return null;
  if (chosen == AppMode.staff && s.isStaff) return AppMode.staff;
  if (chosen == AppMode.tenant && s.isTenant) return AppMode.tenant;
  if (s.isStaff) return AppMode.staff;
  if (s.isTenant) return AppMode.tenant;
  return null;
}

final modeProvider = Provider<AppMode?>(
  (ref) => effectiveMode(
    ref.watch(sessionProvider).valueOrNull,
    ref.watch(appModeProvider),
  ),
);
