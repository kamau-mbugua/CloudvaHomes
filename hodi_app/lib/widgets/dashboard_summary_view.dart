import 'package:flutter/material.dart';
import 'package:hodi_app/widgets/summary_card.dart';
import 'package:intl/intl.dart';
import 'package:nb_utils/nb_utils.dart';

import '../models/data/table_data/dashboard_data.dart';
import '../route/routes.dart';
import '../utils/color_resources.dart';
import '../utils/images.dart';

class DashboardSummaryView extends StatefulWidget {
  DashboardData? dashboardData;
  final ValueNotifier<String>? propertyIdNotifier;
  DashboardSummaryView(
      {this.dashboardData, this.propertyIdNotifier});

  @override
  State<DashboardSummaryView> createState() => _DashboardSummaryViewState();
}

class _DashboardSummaryViewState extends State<DashboardSummaryView> {
  @override
  Widget build(BuildContext context) {
    return Container(
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Padding(
                  padding: EdgeInsets.all(4.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      SummaryCard(
                              title: 'Total Invoice',
                              value:
                                  '${formatToMoney(widget.dashboardData?.totalRent ?? 0.0)}',
                              color: ColorResources.card1,
                              icon: Images.totalInvoicesIcon,
                              textColor: ColorResources.colorNero)
                          .onTap(() {
                        // Open the invoices page
                        var isSelf = false;
                        Navigator.pushNamed(
                          context,
                          AppRoutes.getTenantInvoicesPageRoute(),
                          arguments: {
                            'propertyIdNotifier': widget.propertyIdNotifier,
                            'isSelf': isSelf
                          },
                        );
                      }),
                      SummaryCard(
                              title: 'Total Payment',
                              value:
                                  '${formatToMoney(widget.dashboardData?.totalPayment ?? 0.0)}',
                              color: ColorResources.card2,
                              icon: Images.totalPaymentIcon,
                              textColor: ColorResources.textGreen)
                          .onTap(() {
                        Navigator.pushNamed(
                          context,
                          AppRoutes.getPaymentStatementPageRoute(),
                          arguments: {
                            'propertyIdNotifier': widget.propertyIdNotifier,
                            'isFilterByDate': false,
                          },
                        );
                      }),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.all(4.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      SummaryCard(
                              title: 'Total Expenditure',
                              value:
                                  '${formatToMoney(widget.dashboardData?.totalExpense ?? 0.0)}',
                              color: ColorResources.card3,
                              icon: Images.totalExpenditure,
                              textColor: ColorResources.textRed)
                          .onTap(() {
                        Navigator.pushNamed(
                          context,
                          AppRoutes.getExpenditureExpensePageRoute(),
                          arguments: {
                            'propertyIdNotifier': widget.propertyIdNotifier,
                          },
                        );
                      }),
                      SummaryCard(
                              title: 'Total Arrears',
                              value:
                                  '${formatToMoney(widget.dashboardData?.totalArrears ?? 0.0)}',
                              color: ColorResources.card4,
                              icon: Images.totalArrearsIcon,
                              textColor: ColorResources.textRed)
                          .onTap(() {
                        var isSelf = false;
                        Navigator.pushNamed(
                          context,
                          AppRoutes.getTenantUnpaidInvoicesPageRoute(),
                          arguments: {
                            'propertyIdNotifier': widget.propertyIdNotifier,
                            'isSelf': isSelf
                          },
                        );
                      }),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

String formatToMoney(double amount) {
  final NumberFormat formatter =
      NumberFormat.currency(symbol: 'KES ', decimalDigits: 2);
  return formatter.format(amount);
}
