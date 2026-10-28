import 'package:flutter/material.dart';
import 'package:hodi_app/providers/authenticated_app_providers.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../../logger.dart';
import '../../../../models/data/authentication/login_response.dart';
import '../../../../models/data/payment_types/payment_type_list_response.dart';
import '../../../../providers/auth_provider.dart';
import '../../../../route/routes.dart';
import '../../../../utils/dimensions.dart';
import '../../../../utils/styles.dart';
import '../../../../viewmodel/payment_view_model.dart';
import '../../../../widgets/payment_list_type_row.dart';

class PaymentTypesListPage extends StatefulWidget {
  final String? propertyId;
  final String? originInvoice;
  final Map<String, dynamic>? paymentPayload;
  const PaymentTypesListPage({
    Key? key,
    this.propertyId = null,
    this.originInvoice = null,
    this.paymentPayload = null,
  }) : super(key: key);

  @override
  _PaymentTypesListPageState createState() => _PaymentTypesListPageState();
}

class _PaymentTypesListPageState extends State<PaymentTypesListPage> {
  List<PaymentTypeListData> paymentTypeListData = [];
  LoginResponse? loginResponse = null;

  Future<void> fetchPaymentTypesList() async {
    var roleType;

    if (widget.originInvoice?.toLowerCase() == "hodi") {
      if (loginResponse?.data.userDetails.usertype.toLowerCase() == "admins") {
        roleType = "1";
      } else if (loginResponse?.data.userDetails.usertype.toLowerCase() ==
          "tenant") {
        roleType = "0";
      } else {
        roleType = "0";
      }
    } else {
      if (loginResponse?.data.userDetails.usertype.toLowerCase() == "admins") {
        roleType = "0";
      } else if (loginResponse?.data.userDetails.usertype.toLowerCase() ==
          "tenant") {
        roleType = "1";
      } else {
        roleType = "0";
      }
    }

    await Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .getPaymentTypesList(widget.originInvoice, roleType, widget.propertyId)
        .then((value) {
      if (value != null) {
        setState(() {
          paymentTypeListData = value;
        });
      }
    });
  }

  @override
  void initState() {
    loginResponse =
        Provider.of<AuthProvider>(context, listen: false).getLoginResponse();
    Future.microtask(() => {
          fetchPaymentTypesList(),
        });
    super.initState();
  }

  @override
  void dispose() {
    paymentTypeListData.clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer2<AuthenticatedAppProviders, PaymentViewModel>(
      builder: (context, provider,paymentViewModel, child) {
        if (paymentViewModel.paymentSuccessful) {
          Navigator.pop(context);
        }
        return Scaffold(
          appBar: AppBar(
            title: Text(
              'Select Payment Type',
              style: poppinsBold.copyWith(
                color: Theme.of(context).primaryColor,
                fontSize: Dimensions.fontSizeDefault,
              ),
            ),
            centerTitle: true,
            backgroundColor: Colors.white,
            leading: BackButton(
              color: Colors.black,
              onPressed: () {
                Navigator.pop(context);
              },
            ),
          ),
          body: provider.isLoading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: () async {
                    await fetchPaymentTypesList();
                  },
                  child: ListView.builder(
                    itemCount: paymentTypeListData.length,
                    itemBuilder: (context, index) {
                      return InkWell(
                          onTap: () {

                            //add to widget paymentPayload
                            var paymentPayload = widget.paymentPayload;
                            paymentPayload!["typeId"] = paymentTypeListData[index].typeId;
                            paymentPayload["bankId"] = paymentTypeListData[index].bankId;
                            paymentPayload["propertyId"] = widget.propertyId;
                            paymentPayload["originInvoice"] = widget.originInvoice;
                            paymentPayload["paymentName"] = paymentTypeListData[index].typeId == "1" ? "${paymentTypeListData[index].name}" : "${paymentTypeListData[index].name}(${paymentTypeListData[index].bankName})";

                            logger.d("Payment Payload: $paymentPayload");

                            Navigator.pushNamed(context, AppRoutes.getPaymentProcessingRoute(), arguments:{
                              "paymentPayload":paymentPayload
                            });
                          },
                          child: PaymentListTypeRow(
                              paymentTypeData: paymentTypeListData[index]));
                    },
                  ).paddingAll(16),
                ),
        );
      },
    );
  }
}
