import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';
import 'package:hodi_app/logger.dart';

import '../models/data/payment_types/payment_type_list_response.dart';
import '../utils/color_resources.dart';
import '../utils/dimensions.dart';
import '../utils/styles.dart';

class PaymentListTypeRow extends StatelessWidget {
  final PaymentTypeListData paymentTypeData;

  const PaymentListTypeRow({Key? key, required this.paymentTypeData}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final bytes = base64Decode(paymentTypeData.icon);


    logger.d("bytes: $bytes");
    logger.d("PaymentListTypeRow: ${paymentTypeData.icon}");

    return Padding(
      padding: const EdgeInsets.all(8.0),
      child: Row(
        children: [
          SvgPicture.memory(bytes, width: 40, height: 40,   color: Colors.blue, // Set the desired color here
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                paymentTypeData.name,
                style: poppinsBold.copyWith(
                  fontSize: Dimensions.fontSizeDefault,
                  color: ColorResources.colorNero,
                ),
              ),
              Text(
                paymentTypeData.bankName,
                style: poppinsRegular.copyWith(
                  fontSize: Dimensions.fontSizeSmall,
                  color: ColorResources.colorNero,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}