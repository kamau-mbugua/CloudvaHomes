import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/notifications/firebase_push.dart';
import 'core/config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initFirebaseIfConfigured();
  AppConfig.configure(flavor: 'dev');
  runApp(const ProviderScope(child: HodiApp()));
}
