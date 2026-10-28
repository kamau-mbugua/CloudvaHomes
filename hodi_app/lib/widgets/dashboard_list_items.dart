import 'package:flutter/material.dart';
import 'package:hodi_app/models/data/payments/payments.dart';
import 'package:nb_utils/nb_utils.dart';

import '../route/routes.dart';
import 'dashboard_listItem_view.dart';

class DashboardListItems extends StatefulWidget {
  final List<Payment> content;

  DashboardListItems({required this.content});

  @override
  State<DashboardListItems> createState() => _DashboardListItemsState();
}

class _DashboardListItemsState extends State<DashboardListItems> {
  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        DashboardListItemView(isHeader: true),
        Flexible(
          fit: FlexFit.loose,
          child: ListView.builder(
            itemCount: widget.content.length,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemBuilder: (context, index) {
              return DashboardListItemView(item: widget.content[index]).onTap((){
                setState(() {
                  Navigator.pushNamed(
                    context,
                    AppRoutes.getPaymentDetailPageRoute(),
                    arguments: {
                      'paymentRef': widget.content[index].paymentRrn.toString(),
                    },
                  );
                });
              });
            },
          ),
        ),
      ],
    );
  }
}
