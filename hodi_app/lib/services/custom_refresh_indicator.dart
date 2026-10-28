import 'package:flutter/material.dart';
import 'package:hodi_app/services/invoice_service.dart';

import '../logger.dart';
import 'invoice_status_handler.dart';

class CustomRefreshIndicator extends StatelessWidget {
  final Future<void> Function() onRefresh;
  final Widget child;
  final BuildContext myContext;

  const CustomRefreshIndicator({
    Key? key,
    required this.onRefresh,
    required this.child,
    required this.myContext,
  }) : super(key: key);

  Future<void> _handleRefresh() async {
    await onRefresh();
    await InvoiceStatusHandler(myContext).fetchCheckInvoiceStatus();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () => _handleRefresh(),
      child: child,
    );
  }
}