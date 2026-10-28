import 'dart:convert';

import 'package:hodi_app/logger.dart';

import '../networking/base/api_response.dart';

class MyHelpers {
  String convertObjectToJson(Object object) {
    if (object is ApiResponse) {
      return jsonEncode(object.toJson());
    }
    return jsonEncode(object);
  }

  Map<String, String> getCurrentMonthDates() {
    final now = DateTime.now();
    final firstDay = DateTime(now.year, now.month, 1);
    final lastDay = DateTime(now.year, now.month + 1, 0);

    final firstDate = "${firstDay.year}-${firstDay.month.toString().padLeft(2, '0')}-${firstDay.day.toString().padLeft(2, '0')}";
    final lastDate = "${lastDay.year}-${lastDay.month.toString().padLeft(2, '0')}-${lastDay.day.toString().padLeft(2, '0')}";

    return {
      'firstDate': firstDate,
      'lastDate': lastDate,
    };
  }

  // get first date 3 months ago
  Map<String, String> getThreeMonthsAgoDates() {
    final now = DateTime.now();
    final threeMonthsAgo = DateTime(now.year, now.month - 2, 1);
    final firstDate = "${threeMonthsAgo.year}-${threeMonthsAgo.month.toString().padLeft(2, '0')}-${threeMonthsAgo.day.toString().padLeft(2, '0')}";
    final lastDate = "${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}";

    logger.e("getThreeMonthsAgoDates First Date: $firstDate, Last Date: $lastDate");

    return {
      'firstDate': firstDate,
      'lastDate': lastDate,
    };
  }

}