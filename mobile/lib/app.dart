import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/auth/session_controller.dart';
import 'core/notifications/firebase_push.dart';
import 'core/notifications/push_service.dart';
import 'core/router.dart';
import 'core/theme.dart';
import 'core/theme_mode.dart';
import 'core/widgets/notifications_sheet.dart';

class HodiApp extends ConsumerStatefulWidget {
  const HodiApp({super.key});

  @override
  ConsumerState<HodiApp> createState() => _HodiAppState();
}

class _HodiAppState extends ConsumerState<HodiApp> {
  PushHandlers? _push;

  @override
  void initState() {
    super.initState();
    // Push (phase 13): only when this build has Firebase configured.
    if (Firebase.apps.isNotEmpty) {
      _push = wirePushHandlers(
        FirebasePushMessaging(FirebaseMessaging.instance),
        onForeground: () => ref.invalidate(notificationsProvider),
        onOpen: (actionUrl) {
          final target = mobileRouteForActionUrl(actionUrl);
          if (target == null) return;
          if (target.mode != null) {
            ref.read(appModeProvider.notifier).state = target.mode;
          }
          ref.read(routerProvider).go(target.route);
        },
      );
    }
  }

  @override
  void dispose() {
    _push?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'KodiHub',
      debugShowCheckedModeBanner: false,
      theme: hodiTheme(Brightness.light),
      darkTheme: hodiTheme(Brightness.dark),
      themeMode: ref.watch(themeModeProvider),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
