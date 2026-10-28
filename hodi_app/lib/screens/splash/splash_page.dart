import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:hodi_app/logger.dart';
import 'package:provider/provider.dart';

import '../../flavors.dart';
import '../../providers/auth_provider.dart';
import '../../providers/splash_provider.dart';
import '../../route/routes.dart';
import '../../services/invoice_service.dart';
import '../../utils/app_constants.dart';
import '../../utils/images.dart';
import '../../utils/styles.dart';

class SplashScreen extends StatefulWidget {
  @override
  _SplashScreenState createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  final GlobalKey<ScaffoldMessengerState> _globalKey = GlobalKey();
  late StreamSubscription<ConnectivityResult> _onConnectivityChanged;

  @override
  void initState() {
    super.initState();

    // Correct listener for single ConnectivityResult
    _onConnectivityChanged = Connectivity()
        .onConnectivityChanged
        .listen((ConnectivityResult result) {
      bool isNotConnected = result != ConnectivityResult.wifi &&
          result != ConnectivityResult.mobile;
      // Hide the snackbar if connected, otherwise show it
      if (!isNotConnected) {
        _globalKey.currentState?.hideCurrentSnackBar();
      }
      _globalKey.currentState?.showSnackBar(SnackBar(
        backgroundColor: isNotConnected ? Colors.red : Colors.green,
        duration: Duration(seconds: isNotConnected ? 6000 : 3),
        content: Text(
          isNotConnected ? 'No internet connection' : 'Connected',
          textAlign: TextAlign.center,
        ),
      ));

      // Navigate if connected
      if (!isNotConnected) {
        _route();
      }
    });

    // Initialize splash data (shared data, etc.)
    Provider.of<SplashProvider>(context, listen: false).initSharedData();

    _route();
  }

  @override
  void dispose() {
    super.dispose();

    // Cancel the connectivity listener when the screen is disposed
    _onConnectivityChanged.cancel();
  }

  void _route() {
    Timer(
      const Duration(seconds: 3),
      () async{
        if (mounted) {
          // Check if user is logged in and navigate accordingly
          if (Provider.of<AuthProvider>(context, listen: false).isLoggedIn()) {

            // final status = await _checkInvoiceStatus();
            // logger.d('SplashStatus $status');
            // if (status == UserInvoiceStatus.paid || status == UserInvoiceStatus.unknown) {
            //   Navigator.pushNamedAndRemoveUntil(
            //       context, AppRoutes.getHomePageRoute(), (route) => false);
            // }

            Navigator.pushNamedAndRemoveUntil(
                context, AppRoutes.getHomePageRoute(), (route) => false);


          } else {
            Navigator.pushNamedAndRemoveUntil(
                context, AppRoutes.getLoginPageRoute(), (route) => false);
          }
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _globalKey,
      backgroundColor: Colors.white,
      body: Center(
        child: Consumer<SplashProvider>(builder: (context, splash, child) {
          return Stack(
            fit: StackFit.expand,
            children: [
              Positioned.fill(
                child: Container(
                  height: double.infinity,
                  width: double.infinity,
                  constraints: BoxConstraints.expand(height: MediaQuery.of(context).size.height),
                  child: Image.asset(
                    Images.backgroundPng,
                    fit: BoxFit.fill, // Adjusts to fill the height while preserving aspect ratio
                  ),
                ),

              ),
            Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Spacer(), // Add a spacer to push the logo to the center
                Image.asset(Images.logo, height: 150),
                Spacer(), // Add a spacer to push the text to the bottom
                Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      F.title,
                      style: rubikBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: 24,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Version ${AppConstants.appVersion}',
                      style: rubikRegular.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 30), // Add some space at the bottom
              ],
            ),
            ],
          );
        }),
      ),
    );
  }
}
