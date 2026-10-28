import 'package:flutter/material.dart';
import 'package:hodi_app/widgets/summary_card.dart';
import 'package:intl/intl.dart';
import 'package:nb_utils/nb_utils.dart';

import '../models/data/table_data/dashboard_data.dart';
import '../route/routes.dart';
import '../utils/color_resources.dart';
import '../utils/images.dart';

class CustomerDashboardSummaryView extends StatefulWidget {
  DashboardData? dashboardData;
  final ValueNotifier<String>? propertyIdNotifier;
  CustomerDashboardSummaryView(
      {this.dashboardData, this.propertyIdNotifier});

  @override
  State<CustomerDashboardSummaryView> createState() => _CustomerDashboardSummaryViewState();
}

class _CustomerDashboardSummaryViewState extends State<CustomerDashboardSummaryView> {
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
                        Navigator.pushNamed(
                          context,
                          AppRoutes.getTenantInvoicesPageRoute(
                          ),
                          arguments: {
                            'propertyIdNotifier': widget.propertyIdNotifier,
                            'isSelf': true
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
                          AppRoutes.getPaymentPageRoute(),
                          arguments: {
                            'propertyId': widget.propertyIdNotifier?.value,
                            'self': true
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
                              title: 'Units Occupied',
                              value:
                                  '${(widget.dashboardData?.occupiedUnits.toString() ?? 0)}',
                              color: ColorResources.card3,
                              icon: Images.totalExpenditure,
                              textColor: ColorResources.textRed)
                          .onTap(() {
                        var isAppBar = true;
                        var self = true;
                        var isMyHouses = true;
                        Navigator.pushNamed(
                          context,
                          AppRoutes.getTenantsPageRoute(),
                          arguments: {
                            'propertyIdNotifier': widget.propertyIdNotifier,
                            'isAppBar': isAppBar,
                            'self': self,
                            'isMyHouses': isMyHouses
                          },
                        );
                      }),
                      SummaryCard(
                              title: 'Total Arrears',
                              value:
                                  '${formatToMoney(widget.dashboardData?.totalArrears  ?? 0.0)}',
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
                            'isSelf': true
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
