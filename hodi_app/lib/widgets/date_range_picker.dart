import 'package:flutter/material.dart';
import 'package:hodi_app/widgets/base/CustomSDRP.dart';
import 'package:intl/intl.dart';

class CustomDateRangePicker {
  static Future<Map<String, String>> show(BuildContext context,
      {bool showEndDate = true}) async {
    late DateTime initialStartDate = DateTime(DateTime.now().year - 1);
    late DateTime initialEndDate = DateTime(DateTime.now().year);
    late String fromDate = "";
    late String toDate = "";

    return await showDialog(
      context: context,
      builder: (context) {
        return CustomSDRP(
          initialStartDate: initialStartDate,
          initialEndDate: initialEndDate,
          initialEndYear: 2050,
          initialStartYear: 2010,
          primaryColor: Colors.blue,
          showEndDate: showEndDate,
        );
      },
    ).then((value) {
      if (value != null) {
        var arr = value.split("-");
        fromDate = arr[0];
        toDate = arr[1];
        initialStartDate = DateFormat("dd/MM/yyyy").parse(fromDate);
        initialEndDate = DateFormat("dd/MM/yyyy").parse(toDate);
        return {
          "fromDate": "${returnDate(initialStartDate)}",
          "toDate": "${returnDate(initialEndDate)}",
        };
      }
      return {};
    });
  }

  static returnDate(DateTime initialStartDate) {
    return DateFormat('yyyy-MM-dd').format(initialStartDate);
  }
}
