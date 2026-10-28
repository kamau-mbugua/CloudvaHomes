import 'package:flutter/material.dart';

// lib/services/invoice_status_handler.dart

import 'package:flutter/material.dart';
import 'package:hodi_app/logger.dart';
import 'package:hodi_app/screens/invoices/estate/pay_estate_invoice_page.dart';
import 'package:hodi_app/widgets/base/custom_snackbar.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';
import '../models/data/estate_invoices/check_status.dart';
import '../providers/auth_provider.dart';
import '../providers/authenticated_app_providers.dart';
import '../route/routes.dart';
import '../screens/invoices/estate/pay_estate_invoices/estate_invoice_select_invoices_pages.dart';
import '../widgets/custom_confirmation_dialog.dart';

class InvoiceStatusHandler {
  final BuildContext context;

  InvoiceStatusHandler(this.context);

  Future<void> fetchCheckInvoiceStatus() async {
    final loginResponse = await Provider.of<AuthProvider>(context, listen: false).getLoginResponse();
    final estateId = loginResponse?.data.userDetails.estateId;

    if (estateId.isEmptyOrNull || estateId == "N/A") {
      logger.e('Estate ID or token is empty');
      return;
    }

    await Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .checkInvoiceStatus(estateId!).then((value) async {
      if (context.mounted) {
        await _setUpInvoiceStatus(value);
      }
    });
  }

  Future<void> _setUpInvoiceStatus(CheckStatusResponse? value) async {
    if (value == null) {
      logger.i('UserInvoiceStatus User invoice status: null');
      return;
    }
    switch (value.status) {
      case "00":
        logger.i('UserInvoiceStatus User invoice status: Paid');
        break;
      case "001":
        logger.i('UserInvoiceStatus User invoice status: Unpaid');
        await showCustomDialog(value.message);
        break;
      case "002":
        logger.i('UserInvoiceStatus User invoice status: Blocked');
        await showCustomLockedDialog(value.message);
        break;
      default:
        logger.i('UserInvoiceStatus User invoice status: Unknown');
        break;
    }
  }

  Future<void> showCustomDialog(String message) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext myContext) {
        return WillPopScope(
          onWillPop: () async => false,
          child: CustomConfirmationDialog(
            title: "Invoice Status",
            content: message,
            confirmText: "Pay Now",
            cancelText: "Cancel",
            isSingleAction: false,
            onConfirm: () {
              // showCustomSnackBar("Coming soon", isError: false);
              Navigator.pop(myContext);

              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                builder: (BuildContext context) {
                  return Container(
                    height: MediaQuery.of(context).size.height / 2,
                    child: EstateInvoiceSelectInvoicesPages(),
                  );
                },
              );

            },
            onCancel: () async {

              Navigator.pop(myContext);
            },
          ),
        );
      },
    );
  }

  Future<void> showCustomLockedDialog(String message) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext myContext) {
        return WillPopScope(
          onWillPop: () async => false,
          child: CustomConfirmationDialog(
            title: "Invoice Status",
            content: message,
            confirmText: "Pay Now",
            cancelText: "Logout",
            isNoAction: false,
            onConfirm: () {
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                builder: (BuildContext context) {
                  return Container(
                    height: MediaQuery.of(context).size.height / 2,
                    child: EstateInvoiceSelectInvoicesPages(),
                  );
                },
              );
            },
            onCancel: () {
              Provider.of<AuthProvider>(context, listen: false).clearSharedData(context).then((condition) {
                Navigator.pushNamedAndRemoveUntil(context, AppRoutes.getSplashPageRoute(), (route) => false);
              });
            },
          ),
        );
      },
    );
  }

  Future<void> dismissDialog() async{
    if (Navigator.canPop(context)) {
      Navigator.pop(context);
    }
  }
}