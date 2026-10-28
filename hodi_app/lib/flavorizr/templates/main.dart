import 'dart:io';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:hodi_app/providers/auth_provider.dart';
import 'package:hodi_app/providers/authenticated_app_providers.dart';
import 'package:hodi_app/providers/splash_provider.dart';
import 'package:hodi_app/providers/theme_provider.dart';
import 'package:hodi_app/route/router_helper.dart';
import 'package:hodi_app/viewmodel/meter_added_view_model.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import '../../flavors.dart';
import '../../logger.dart';
import '../../services/permission_service.dart';
import '../../viewmodel/payment_view_model.dart';
import 'app.dart';
import '../../di_container.dart' as di;
import 'package:webview_flutter/webview_flutter.dart';


final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {// Set the default flavor
  logger.i('Application started');
  // Enable hybrid composition for Android.
  // if (Platform.isAndroid) {
  //   WebView.platform = SurfaceAndroidWebView();
  // }
  HttpOverrides.global = MyHttpOverrides();
  WidgetsFlutterBinding.ensureInitialized();

  await PermissionService().requestPermissions();


  await di.init();
  runApp(MultiProvider(
    providers: [
      ChangeNotifierProvider(create: (context) => di.sl<SplashProvider>()),
      ChangeNotifierProvider(create: (context) => di.sl<AuthProvider>()),
      ChangeNotifierProvider(create: (context) => di.sl<AuthenticatedAppProviders>()),
      ChangeNotifierProvider(create: (context) => di.sl<ThemeProvider>()),
      ChangeNotifierProvider(create: (context) => di.sl<PaymentViewModel>()),
      ChangeNotifierProvider(create: (context) => di.sl<MeterAddedViewModel>()),
    ],
    child: App(navigatorKey: navigatorKey),
  ));
}

class MyHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)..badCertificateCallback = (X509Certificate cert, String host, int port) => true;
  }
}

class Get {
  static BuildContext? get context => navigatorKey.currentContext;
  static NavigatorState? get navigator => navigatorKey.currentState;
}