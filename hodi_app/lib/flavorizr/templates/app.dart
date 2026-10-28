import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:hodi_app/route/router_helper.dart';
import 'package:hodi_app/route/routes.dart';

import '../../flavors.dart';
import '../../services/authority_service.dart';


class App extends StatefulWidget {
  GlobalKey<NavigatorState>? navigatorKey;

   App({super.key, required this.navigatorKey});

  @override
  State<App> createState() => _AppState();
}

class _AppState extends State<App> {

  @override
  void initState() {
    RouterHelper.setupRouter();
    AuthorityService().loadAuthorities(context);
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: F.title,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.white),
        useMaterial3: true,
        scaffoldBackgroundColor: Colors.white, // Set scaffold background color to white
      ),
      initialRoute: AppRoutes.splash,
      debugShowCheckedModeBanner: false,
      onGenerateRoute: RouterHelper.router.generator,
      scrollBehavior: const MaterialScrollBehavior().copyWith(dragDevices: {
        PointerDeviceKind.mouse,
        PointerDeviceKind.touch,
        PointerDeviceKind.stylus,
        PointerDeviceKind.unknown
      }),
      navigatorKey: widget.navigatorKey,
    );
  }
}
