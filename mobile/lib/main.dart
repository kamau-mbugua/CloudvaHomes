import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/intro.dart';
import 'core/notifications/firebase_push.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Poppins is under the SIL Open Font License, which must ship with it.
  LicenseRegistry.addLicense(() async* {
    yield LicenseEntryWithLineBreaks(const [
      'Poppins',
    ], await rootBundle.loadString('assets/fonts/Poppins-OFL.txt'));
  });
  await initFirebaseIfConfigured();
  final introSeen = await const IntroStore().read();
  runApp(
    ProviderScope(
      overrides: [introSeenProvider.overrideWith((ref) => introSeen)],
      child: const HodiApp(),
    ),
  );
}
