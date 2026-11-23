import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Whether this device has seen the intro screens. Read once in `main()` and kept here, so the
/// router can decide synchronously; tests leave it `true` (no intro).
final introSeenProvider = StateProvider<bool>((ref) => true);

/// Where the "intro seen" flag lives on the device.
final introStoreProvider = Provider<IntroStore>((ref) => const IntroStore());

class IntroStore {
  const IntroStore([this._storage = const FlutterSecureStorage()]);

  final FlutterSecureStorage _storage;
  static const _key = 'kodihq.intro_seen.v1';

  Future<bool> read() async {
    try {
      return await _storage.read(key: _key) == '1';
    } catch (_) {
      // Storage unavailable: don't keep showing the intro.
      return true;
    }
  }

  Future<void> markSeen() async {
    try {
      await _storage.write(key: _key, value: '1');
    } catch (_) {}
  }
}

/// Marks the intro as seen on the device and for the router.
Future<void> finishIntro(WidgetRef ref) async {
  ref.read(introSeenProvider.notifier).state = true;
  await ref.read(introStoreProvider).markSeen();
}
