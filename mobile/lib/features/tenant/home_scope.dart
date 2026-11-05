import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'tenant_api.dart';

/// The tenant home switcher (tenant portal redesign): all my homes, or one home (a
/// tenancy) and the landlord account it belongs to. Kept on this phone only. Mirrors
/// frontend/src/features/tenant/scope.ts.
sealed class HomeScope {
  const HomeScope();
}

class AllHomes extends HomeScope {
  const AllHomes();
  @override
  bool operator ==(Object other) => other is AllHomes;
  @override
  int get hashCode => 0;
}

class OneHome extends HomeScope {
  const OneHome(this.tenantId, this.tenancyId);
  final String tenantId;
  final String tenancyId;
  @override
  bool operator ==(Object other) =>
      other is OneHome &&
      other.tenantId == tenantId &&
      other.tenancyId == tenancyId;
  @override
  int get hashCode => Object.hash(tenantId, tenancyId);
}

class HomeOption {
  const HomeOption(this.tenantId, this.tenancyId, this.label, this.home);
  final String tenantId;
  final String tenancyId;
  final String label;
  final Home home;
}

bool _lived(Home h) => h.status == 'ACTIVE' || h.status == 'NOTICE';

String homeLabel(Home h) =>
    [h.unit, h.property].where((s) => s.isNotEmpty).join(', ');

/// Homes still lived in: "G1, Acacia Heights · Ivory Breeze".
List<HomeOption> homeOptions(List<Home> homes) => [
  for (final h in homes.where(_lived))
    HomeOption(h.tenantId, h.id, '${homeLabel(h)} · ${h.orgName}', h),
];

String homeScopeKey(String userId) => 'tenant.home.$userId';

String serializeScope(HomeScope s) => switch (s) {
  AllHomes() => jsonEncode({'kind': 'all'}),
  OneHome(:final tenantId, :final tenancyId) => jsonEncode({
    'kind': 'home',
    'tenantId': tenantId,
    'tenancyId': tenancyId,
  }),
};

/// A saved choice, if it still names one of the options; otherwise all homes.
HomeScope resolveScope(String? stored, List<HomeOption> options) {
  if (stored == null) return const AllHomes();
  try {
    final j = jsonDecode(stored);
    if (j is! Map || j['kind'] != 'home') return const AllHomes();
    final match = options
        .where((o) => o.tenancyId == j['tenancyId'])
        .firstOrNull;
    return match == null
        ? const AllHomes()
        : OneHome(match.tenantId, match.tenancyId);
  } catch (_) {
    return const AllHomes();
  }
}

/// With one home selected: the other homes its landlord account also covers.
List<String> otherHomesOnAccount(List<Home> homes, HomeScope s) => switch (s) {
  AllHomes() => const [],
  OneHome(:final tenantId, :final tenancyId) => [
    for (final h in homes.where(_lived))
      if (h.tenantId == tenantId && h.id != tenancyId) homeLabel(h),
  ],
};

/// Where the choice is kept. Secure storage on the phone; tests override it.
abstract class HomeScopeStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class SecureHomeScopeStore implements HomeScopeStore {
  const SecureHomeScopeStore([this._storage = const FlutterSecureStorage()]);
  final FlutterSecureStorage _storage;
  @override
  Future<String?> read(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String key, String value) async {
    try {
      await _storage.write(key: key, value: value);
    } catch (_) {
      // The choice applies for this run only.
    }
  }
}

final homeScopeStoreProvider = Provider<HomeScopeStore>(
  (_) => const SecureHomeScopeStore(),
);

/// The raw saved value for the signed-in person (null until loaded or when none).
class HomeScopeNotifier extends Notifier<String?> {
  @override
  String? build() {
    final userId = ref.watch(sessionProvider).valueOrNull?.user.id;
    if (userId != null) {
      ref.read(homeScopeStoreProvider).read(homeScopeKey(userId)).then((v) {
        if (v != null) state = v;
      });
    }
    return null;
  }

  void set(HomeScope s) {
    final value = serializeScope(s);
    state = value;
    final userId = ref.read(sessionProvider).valueOrNull?.user.id;
    if (userId != null) {
      ref.read(homeScopeStoreProvider).write(homeScopeKey(userId), value);
    }
  }
}

final homeScopeRawProvider = NotifierProvider<HomeScopeNotifier, String?>(
  HomeScopeNotifier.new,
);
