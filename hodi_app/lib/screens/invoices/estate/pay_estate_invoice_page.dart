import 'package:flutter/material.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../logger.dart';
import '../../../models/data/estate_invoices/estate_invoices_list.dart';
import '../../../providers/auth_provider.dart';
import '../../../providers/authenticated_app_providers.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';

class PayEstateInvoicePage extends StatefulWidget {
  const PayEstateInvoicePage({Key? key}) : super(key: key);

  @override
  _PayEstateInvoicePageState createState() => _PayEstateInvoicePageState();
}

class _PayEstateInvoicePageState extends State<PayEstateInvoicePage> {
  List<UserEstateInvoiceData> userEstateInvoiceData = [];
  List<String> selectedInvoices = [];
  @override
  void initState() {
    Future.microtask(() => {
      fetchEstateInvoices(), // fetchHouses()
    });
    super.initState();
  }


  void fetchEstateInvoices() async {
    final loginResponse = await Provider.of<AuthProvider>(context, listen: false).getLoginResponse();
    final estateId = loginResponse?.data.userDetails.estateId;

    if (estateId.isEmptyOrNull || estateId == "N/A") {
      logger.e('Estate ID or token is empty');
      return;
    }

    List<UserEstateInvoiceData> _userEstateInvoiceData =
    await Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .getUserEstateInvoices(estateId!);

    setState(() {
      userEstateInvoiceData = _userEstateInvoiceData;
    });
  }


  @override
  Widget build(BuildContext context) {
    return Consumer<AuthenticatedAppProviders>(
        builder: (context, provider, child) {
          List<Step> steps = [
            Step(title: Text(
              "Select Invoices",
              style: poppinsSemiBold.copyWith(
                color: Theme.of(context).primaryColor,
                fontSize: Dimensions.fontSizeDefault,
              ),
            ), content:  provider.isLoading
                ? const Center(child: CircularProgressIndicator())
                : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 10),
                Text(
                  'Select the invoices you want to pay',
                  style: poppinsRegular.copyWith(
                    fontSize: Dimensions.fontSizeSmall,
                    color: Theme.of(context).primaryColor,
                  ),
                ),
                const SizedBox(height: 10),
                ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: userEstateInvoiceData.length,
                  itemBuilder: (context, index) {
                    return CheckboxListTile(
                      title: Text(
                        userEstateInvoiceData[index].rrn,
                        style: poppinsRegular.copyWith(
                          fontSize: Dimensions.fontSizeSmall,
                          color: Theme.of(context).primaryColor,
                        ),
                      ),
                      value: userEstateInvoiceData![index].rrn!.isNotEmpty && selectedInvoices.contains(userEstateInvoiceData![index].rrn),
                      onChanged: (bool? value) {
                        setState(() {

                          if (value == false) {
                            selectedInvoices.remove(userEstateInvoiceData![index].rrn!);
                            return;
                          }
                          selectedInvoices.add(userEstateInvoiceData![index].rrn!);
                        });
                      },
                    );
                  },
                ),
                const SizedBox(height: 10),
              ],
            )
            )
          ];
          return Container();
        }
    );
  }
}
