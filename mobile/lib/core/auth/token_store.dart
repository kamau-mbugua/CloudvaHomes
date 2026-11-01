import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// A login saved on the device when "Remember me" is enabled.
class SavedCredential {
  const SavedCredential({
    required this.identifier,
    required this.password,
    this.displayName,
    this.roleHint,
    this.savedAt,
  });

  final String identifier;
  final String password;
  final String? displayName;
  final String? roleHint;
  final String? savedAt;

  String get initials {
    final source = (displayName != null && displayName!.trim().isNotEmpty)
        ? displayName!.trim()
        : identifier.trim();
    if (source.isEmpty) return '?';
    final parts = source
        .split(RegExp(r'[\s._@-]+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return source.substring(0, source.length >= 2 ? 2 : 1).toUpperCase();
  }

  Map<String, dynamic> toJson() => {
    'identifier': identifier,
    'password': password,
    if (displayName != null) 'displayName': displayName,
    if (roleHint != null) 'roleHint': roleHint,
    if (savedAt != null) 'savedAt': savedAt,
  };

  factory SavedCredential.fromJson(Map<String, dynamic> j) => SavedCredential(
    identifier: (j['identifier'] as String?) ?? '',
    password: (j['password'] as String?) ?? '',
    displayName: j['displayName'] as String?,
    roleHint: j['roleHint'] as String?,
    savedAt: j['savedAt'] as String?,
  );
}

/// Where the refresh token and saved logins live between launches:
/// Keychain (iOS) / Keystore-backed (Android).
abstract class TokenStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();

  Future<List<SavedCredential>> readSavedCredentials() async => const [];
  Future<void> saveCredential(SavedCredential credential) async {}
  Future<void> removeSavedCredential(String identifier) async {}
}

class SecureTokenStore extends TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock_this_device,
            ),
          );

  static const _key = 'hodi.refreshToken';
  static const _savedCredentialsKey = 'hodi.savedCredentials';
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: _key);
  @override
  Future<void> write(String token) => _storage.write(key: _key, value: token);
  @override
  Future<void> clear() => _storage.delete(key: _key);

  @override
  Future<List<SavedCredential>> readSavedCredentials() async {
    try {
      final raw = await _storage.read(key: _savedCredentialsKey);
      if (raw == null || raw.isEmpty) return const [];
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return [
        for (final item in decoded)
          if (item is Map<String, dynamic>)
            SavedCredential.fromJson(item)
          else if (item is Map)
            SavedCredential.fromJson(Map<String, dynamic>.from(item)),
      ].where((c) => c.identifier.isNotEmpty && c.password.isNotEmpty).toList();
    } on Object {
      return const [];
    }
  }

  @override
  Future<void> saveCredential(SavedCredential credential) async {
    final norm = credential.identifier.trim().toLowerCase();
    if (norm.isEmpty || credential.password.isEmpty) return;
    final current = await readSavedCredentials();
    final updated = <SavedCredential>[
      credential,
      for (final c in current)
        if (c.identifier.trim().toLowerCase() != norm) c,
    ];
    await _storage.write(
      key: _savedCredentialsKey,
      value: jsonEncode([for (final c in updated) c.toJson()]),
    );
  }

  @override
  Future<void> removeSavedCredential(String identifier) async {
    final norm = identifier.trim().toLowerCase();
    final current = await readSavedCredentials();
    final updated = [
      for (final c in current)
        if (c.identifier.trim().toLowerCase() != norm) c,
    ];
    if (updated.isEmpty) {
      await _storage.delete(key: _savedCredentialsKey);
    } else {
      await _storage.write(
        key: _savedCredentialsKey,
        value: jsonEncode([for (final c in updated) c.toJson()]),
      );
    }
  }
}

/// For tests.
class MemoryTokenStore extends TokenStore {
  String? token;
  final List<SavedCredential> savedCredentials = [];

  @override
  Future<String?> read() async => token;
  @override
  Future<void> write(String t) async => token = t;
  @override
  Future<void> clear() async => token = null;

  @override
  Future<List<SavedCredential>> readSavedCredentials() async =>
      List.unmodifiable(savedCredentials);

  @override
  Future<void> saveCredential(SavedCredential credential) async {
    final norm = credential.identifier.trim().toLowerCase();
    if (norm.isEmpty || credential.password.isEmpty) return;
    savedCredentials.removeWhere(
      (c) => c.identifier.trim().toLowerCase() == norm,
    );
    savedCredentials.insert(0, credential);
  }

  @override
  Future<void> removeSavedCredential(String identifier) async {
    final norm = identifier.trim().toLowerCase();
    savedCredentials.removeWhere(
      (c) => c.identifier.trim().toLowerCase() == norm,
    );
  }
}
