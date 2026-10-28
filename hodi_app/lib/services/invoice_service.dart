// import 'dart:async';
// import 'package:flutter/material.dart';
// import 'package:hodi_app/logger.dart';
// import 'package:hodi_app/providers/authenticated_app_providers.dart';
// import 'package:nb_utils/nb_utils.dart';
// import 'package:provider/provider.dart';
// import '../flavors.dart';
// import '../providers/auth_provider.dart';
// import '../models/data/authentication/login_response.dart';
// import '../widgets/custom_confirmation_dialog.dart';
//
// enum UserInvoiceStatus {
//   paid,
//   unpaid,
//   blocked,
//   unknown,
// }
//
// class InvoiceService {
//   static final InvoiceService _instance = InvoiceService._internal();
//   factory InvoiceService() {
//     return _instance;
//   }
//   InvoiceService._internal();
//   BuildContext? context;
//   bool _isDialogShowing = false;
//
//   Future<UserInvoiceStatus?> checkInvoiceStatus(BuildContext context, Future<void> Function() navigateToHomePage, ) async {
//     final loginResponse = await Provider.of<AuthProvider>(context, listen: false).getLoginResponse();
//     final token = loginResponse?.data.tokenDetails.accessToken;
//     final estateId = loginResponse?.data.userDetails.estateId;
//     this.context = context;
//     if (estateId.isEmptyOrNull || estateId == "N/A") {
//       logger.e('Estate ID or token is empty');
//       return null;
//     }
//
//     final provider = Provider.of<AuthenticatedAppProviders>(context, listen: false);
//     provider.checkInvoiceStatus(estateId!).then((value) async {
//       if (value == null) {
//         logger.i('UserInvoiceStatus User invoice status: null');
//         return null;
//       }
//
//       if (!_isDialogShowing) {
//         _isDialogShowing = true;
//         switch (value.status) {
//           case "00":
//             logger.i('UserInvoiceStatus User invoice status: Paid');
//             return UserInvoiceStatus.paid;
//           case "001":
//             logger.i('UserInvoiceStatus User invoice status: Unpaid');
//             await showCustomDialog(value.message, navigateToHomePage);
//             return UserInvoiceStatus.unpaid;
//           case "002":
//             logger.i('UserInvoiceStatus User invoice status: Blocked');
//             await showCustomLockedDialog(value.message);
//             return UserInvoiceStatus.blocked;
//           default:
//             logger.i('UserInvoiceStatus User invoice status: Unknown');
//             return UserInvoiceStatus.paid;
//         }
//       }
//     });
//     return null;
//   }
//
//   Future<void> showCustomDialog(String message, Future<void> Function() navigateToHomePage) async{
//     showDialog(
//       context: context!,
//       barrierDismissible: false,
//       builder: (BuildContext context) {
//         return WillPopScope(
//           onWillPop: () async => false,
//           child: CustomConfirmationDialog(
//             title: "Invoice Status",
//             content: message,
//             confirmText: "Pay Now",
//             cancelText: "Cancel",
//             isSingleAction: false,
//             onConfirm: () {
//               _isDialogShowing = false;
//               Navigator.pop(context);
//             },
//             onCancel: () async{
//               _isDialogShowing = false;
//               await navigateToHomePage();
//               logger.d('User cancelled payment');
//               Navigator.pop(context);
//             },
//           ),
//         );
//       },
//     );
//   }
//
//   Future<void> showCustomLockedDialog(String message) async{
//     showDialog(
//       context: context!,
//       barrierDismissible: false,
//       builder: (BuildContext context) {
//         return CustomConfirmationDialog(
//           title: "Invoice Status",
//           content: message,
//           confirmText: "Pay Now",
//           cancelText: "NO",
//           isNoAction: true,
//           onConfirm: () {
//             _isDialogShowing = false;
//             Navigator.pop(context);
//           },
//           onCancel: () {
//             _isDialogShowing = false;
//             Navigator.pop(context);
//           },
//         );
//       },
//     );
//   }
//
//   void startPeriodicCheck(BuildContext context) {
//     // Timer.periodic(Duration(minutes: 30), (timer) {
//     //   checkInvoiceStatus(context);
//     // });
//   }
// }