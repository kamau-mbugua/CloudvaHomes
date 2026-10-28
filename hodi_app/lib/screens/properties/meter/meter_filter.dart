import 'package:flutter/material.dart';
import 'package:hodi_app/logger.dart';
import 'package:hodi_app/widgets/base/custom_divider.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../models/data/metred_bills/metred_bills.dart';
import '../../../models/data/utility_bills/utility_bill.dart';
import '../../../providers/authenticated_app_providers.dart';
import '../../../utils/color_resources.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';
import '../../../widgets/base/custom_button.dart';
enum MeterReadingStatus { all, read, unread }
class MeterFiltersPage extends StatefulWidget {
  final Function(String selectedUtilityBillIndex, bool? isMeterRead) onFilter;
  String propertyId = "";
  MeterFiltersPage({Key? key, required this.propertyId, required this.onFilter}) : super(key: key);
  @override
  _MeterFiltersState createState() => _MeterFiltersState();
}

class _MeterFiltersState extends State<MeterFiltersPage> {
  List<MetredBillsUtility> utilityBill = [];
  int? selectedUtilityBillIndex;
  MeterReadingStatus? meterReadingStatus = MeterReadingStatus.all;




  void getUtilityBill() async {
    loggerNoStack.i(">>>>>>>>>fetchHouses<<<<<<<<<<");
    if (widget.propertyId != 0) {

      List<MetredBillsUtility> metredBillsUtility =
      await Provider.of<AuthenticatedAppProviders>(context, listen: false)
          .getMetredBils();

      final uniqueUtilityBill = metredBillsUtility.toSet().toList();

      setState(() {
        utilityBill = uniqueUtilityBill;
      });
    }
  }

  @override
  void initState() {
    Future.microtask(() => getUtilityBill());

    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      child: Consumer<AuthenticatedAppProviders>(
          builder: (context, provider, child) {
            return provider.isLoading
                ? const SizedBox(
                  height: 100,
                  child: Center(
                      child: CircularProgressIndicator(),
                    ),
                )
                :
              Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.start,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Center(
                          child: Text(
                            'Filter Meter Reading',
                            style: poppinsBold.copyWith(
                              fontSize: Dimensions.fontSizeLarge,
                              color: ColorResources.colorNero,
                            ),
                          ),
                        ),
                      ),
                      IconButton(
                        icon: Icon(Icons.close),
                        onPressed: () {
                          Navigator.pop(context);
                        },
                      ),
                    ],
                  ),
                  const CustomDivider().paddingOnly(top: 16, bottom: 16),
                  Text(
                    'Select Meter Type',
                    style: poppinsBold.copyWith(
                      fontSize: Dimensions.fontSizeLarge,
                      color: ColorResources.colorNero,
                    ),
                  ),
                  utilityBill.isEmpty ?
                  Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Center(
                      child: Text(
                        'No Meter Type Available',
                        style: poppinsRegular.copyWith(
                          fontSize: Dimensions.fontSizeLarge,
                          color: ColorResources.colorNero,
                        ),
                      ),
                    ),
                  ) :
                  Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Wrap(
                      spacing: 8.0,
                      children: [
                        ChoiceChip(
                          label: Text('All Bills'),
                          selected: selectedUtilityBillIndex == null,
                          onSelected: (bool selected) {
                            setState(() {
                              selectedUtilityBillIndex = selected ? null : selectedUtilityBillIndex;
                            });
                          },
                        ),
                        ...List<Widget>.generate(utilityBill.length, (int index) {
                          return ChoiceChip(
                            label: Text(utilityBill[index].name),
                            selected: selectedUtilityBillIndex == index,
                            onSelected: (bool selected) {
                              setState(() {
                                selectedUtilityBillIndex = selected ? index : null;
                              });
                            },
                          );
                        }),
                      ],
                    ),
                  ),

                  Text(
                    'Meter Reading Status',
                    style: poppinsBold.copyWith(
                      fontSize: Dimensions.fontSizeLarge,
                      color: ColorResources.colorNero,
                    ),
                  ),

                  //add meter reading status here with radio buttons
                  RadioListTile<MeterReadingStatus>(
                    title: Text('Read'),
                    value: MeterReadingStatus.read,
                    groupValue: meterReadingStatus,
                    onChanged: (MeterReadingStatus? value) {
                      setState(() {
                        meterReadingStatus = value!;
                      });
                    },
                  ),

                  RadioListTile<MeterReadingStatus>(
                    title: Text('Unread'),
                    value: MeterReadingStatus.unread,
                    groupValue: meterReadingStatus,
                    onChanged: (MeterReadingStatus? value) {
                      setState(() {
                        meterReadingStatus = value!;
                      });
                    },
                  ),
                  //add all the radio buttons here

                  RadioListTile<MeterReadingStatus>(
                    title: Text('All'),
                    value: MeterReadingStatus.all,
                    groupValue: meterReadingStatus,
                    onChanged: (MeterReadingStatus? value) {
                      setState(() {
                        meterReadingStatus = value!;
                      });
                    },
                  ),
                  CustomButton(
                    btnTxt: "Filter",
                    backgroundColor: Theme.of(context).primaryColorDark,
                    onTap: () async {
                      //update meter reading here

                      var billId = selectedUtilityBillIndex != null ? utilityBill[selectedUtilityBillIndex!].id.toString() : "";
                      widget.onFilter(
                        billId,
                          meterReadingStatus == MeterReadingStatus.read ? true : meterReadingStatus == MeterReadingStatus.unread ? false : null
                      );
                      finish(context);
                    },
                  )
                ],
              ),
            );
          },
        ),
    );
  }
}
