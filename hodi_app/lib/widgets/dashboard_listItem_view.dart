import 'package:flutter/material.dart';
import 'package:hodi_app/utils/color_resources.dart';
import 'package:hodi_app/utils/dimensions.dart';
import 'package:hodi_app/utils/styles.dart';

import '../models/data/dashboard_data_class.dart';
import '../models/data/payments/payments.dart';

class DashboardListItemView extends StatelessWidget {
  final Payment? item;
  final bool isHeader;

  DashboardListItemView({this.item, this.isHeader = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 0, 0, 10),
      child: Container(
        color: isHeader ? ColorResources.graphLightBlue : null,
        padding: const EdgeInsets.fromLTRB(0, 10, 0, 10),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    isHeader ? 'Txn Ref' : item!.paymentRrn,
                textAlign: TextAlign.start,
                    style: poppinsRegular.copyWith(
                      fontSize: Dimensions.fontSizeSmall,
                      color: isHeader ? ColorResources.textBlue : Colors.black,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    isHeader ? 'Rent' : "KES ${item!.rentOwed.toString()}",
                    textAlign: TextAlign.start,
                    style: poppinsRegular.copyWith(
                      fontSize: Dimensions.fontSizeSmall,
                      color: Colors.black,
                      fontWeight: isHeader ? FontWeight.bold : FontWeight.normal,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Text(
                    isHeader ? 'House No' : item!.houseName,
                textAlign: TextAlign.center,
                    style: poppinsRegular.copyWith(
                      fontSize: Dimensions.fontSizeSmall,
                      color: isHeader ? ColorResources.textBlue : Colors.black,
                      fontWeight: isHeader ? FontWeight.bold : FontWeight.normal,
                    ),
                  ),
                  Text(
                    isHeader ? 'Rent Paid' : "KES ${item!.rentPaid.toString()}",
                    textAlign: TextAlign.center,
                    style: poppinsRegular.copyWith(
                      fontSize: Dimensions.fontSizeSmall,
                      color: Colors.black,
                      fontWeight: isHeader ? FontWeight.bold : FontWeight.normal,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    isHeader ? 'Tenant' : item!.paidBy,
                textAlign: TextAlign.end,
                    style: poppinsRegular.copyWith(
                      fontSize: Dimensions.fontSizeSmall,
                      color: isHeader ? ColorResources.textBlue : Colors.black,
                      fontWeight: isHeader ? FontWeight.bold : FontWeight.bold,
                    ),
                  ),
                  Text(isHeader ? 'Date' : item!.paidOn.toString(),
                    textAlign: TextAlign.end,
                      style: poppinsRegular.copyWith(
                        fontSize: Dimensions.fontSizeSmall,
                        color: Colors.black,
                        fontWeight: isHeader ? FontWeight.bold : FontWeight.normal,
                      )),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
