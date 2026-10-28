import 'package:flutter/material.dart';
import 'package:hodi_app/logger.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../models/data/metred_bills/metred_bills.dart';
import '../../../models/data/properties/properties.dart';
import '../../../providers/authenticated_app_providers.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';
import '../../../widgets/base/custom_snackbar.dart';
import '../../../widgets/base/custom_text_field.dart';

class AddUtilityBillPage extends StatefulWidget {
  final Function(bool) isUtilityBillAdded;
  const AddUtilityBillPage({Key? key, required this.isUtilityBillAdded})
      : super(key: key);

  @override
  _AddUtilityBillPageState createState() => _AddUtilityBillPageState();
}

class _AddUtilityBillPageState extends State<AddUtilityBillPage> {
  int currStep = 0;
  List<Property> properties = [];
  List<Property> filteredProperties = [];

  List<MetredBillsUtility> metredBills = [];

  String selectedPropertyId = "";
  String selectedEstateId = "";
  String selectedPropertyNames = "";
  String selectedFrequencyId = "";
  String selectedFrequencyName = "";

  String selectedMetredBillId = "";
  String selectedMetredBillName = "";

  TextEditingController? _nameController;
  TextEditingController? _descriptionController;
  TextEditingController? _amountController;
  final FocusNode _nameFocus = FocusNode();
  final FocusNode _descriptionFocus = FocusNode();
  final FocusNode _amountFocus = FocusNode();
  final List<Map<String, dynamic>> frequencies = [
    {'id': 0, 'name': 'Fixed Amount'},
    {'id': 1, 'name': 'Variable Amount'},
    {'id': 2, 'name': 'Metred Bill'}
  ];

  void fetchProperties([String query = ""]) async {
    debugPrint(">>>>>>>>>fetchProperties<<<<<<<<<< and query is $query");
    List<Property> fetchedProperties =
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getBusinessProperties("");

    setState(() {
      properties = fetchedProperties;
      filteredProperties = fetchedProperties;
    });
  }

  void getMetredBils() async {
    debugPrint(">>>>>>>>>getMetredBils<<<<<<<<<<");
    List<MetredBillsUtility> metredBillsUtility =
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getMetredBils();

    setState(() {
      metredBills = metredBillsUtility;
    });
  }

  @override
  void initState() {
    Future.microtask(() => {
          fetchProperties(), // fetchHouses()
          getMetredBils()
        });
    _nameController = TextEditingController();
    _descriptionController = TextEditingController();
    _amountController = TextEditingController();
    frequencies.sort((a, b) => a['id'].compareTo(b['id']));
    super.initState();
  }

  @override
  void dispose() {
    _nameController!.dispose();
    _descriptionController!.dispose();
    _amountController!.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthenticatedAppProviders>(
      builder: (context, provider, child) {
        List<Step> steps = [
          Step(
            title: Text(
              "Basic Details",
              style: poppinsSemiBold.copyWith(
                color: Theme.of(context).primaryColor,
                fontSize: Dimensions.fontSizeDefault,
              ),
            ),
            content: provider.isLoading
                ? const Center(child: CircularProgressIndicator())
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Select Bill Type",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),
                      DropdownButton<String>(
                        value: selectedFrequencyName == ""
                            ? null
                            : selectedFrequencyName,
                        items:
                            frequencies.map((Map<String, dynamic> frequency) {
                          return DropdownMenuItem<String>(
                            value: frequency['name'],
                            child: Text(frequency['name']),
                          );
                        }).toList(),
                        onChanged: (String? newValue) {
                          setState(() {
                            logger.d("selectedFrequencyName $newValue");
                            selectedFrequencyName = newValue!;
                            selectedFrequencyId = frequencies
                                .firstWhere((element) =>
                                    element['name'] ==
                                    selectedFrequencyName)['id']
                                .toString();

                            logger.d("selectedFrequencyName $selectedFrequencyName and selectedFrequencyId $selectedFrequencyId");
                          });
                        },
                        hint: const Text("Select Bill Type"),
                        isExpanded: true,
                      ).paddingBottom(16),
                      Text(
                        "Select Property",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ),
                      DropdownButton<String>(
                        value: selectedPropertyId == ""
                            ? null
                            : selectedPropertyId,
                        items: properties.map((Property property) {
                          return DropdownMenuItem<String>(
                            value: property.id.toString(),
                            child: Text(property.name),
                          );
                        }).toList(),
                        onChanged: (String? newValue) {
                          setState(() {
                            selectedPropertyId = newValue!;
                            selectedEstateId = properties
                                .firstWhere((element) =>
                                    element.id.toString() == selectedPropertyId)
                                .estateId
                                .toString();
                          });
                        },
                        hint: const Text("Select Property"),
                        isExpanded: true,
                      ).paddingBottom(16),
                    ],
                  ),
            isActive: currStep == 0,
          ),
          Step(
            title: Text(
              "Secondary Details",
              style: poppinsSemiBold.copyWith(
                color: Theme.of(context).primaryColor,
                fontSize: Dimensions.fontSizeDefault,
              ),
            ),
            content: provider.isLoading
                ? const Center(child: CircularProgressIndicator())
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      selectedFrequencyId != "2"
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  "Utility Bill Name",
                                  style: poppinsSemiBold.copyWith(
                                    color: Theme.of(context).primaryColor,
                                    fontSize: Dimensions.fontSizeDefault,
                                  ),
                                ).paddingBottom(5),
                                CustomTextField(
                                  hintText: "Enter Utility Bill Name",
                                  isShowBorder: true,
                                  focusNode: _nameFocus,
                                  controller: _nameController,
                                  inputType: TextInputType.text,
                                ).paddingBottom(16),
                              ],
                            )
                          : Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  "Metred Bill",
                                  style: poppinsSemiBold.copyWith(
                                    color: Theme.of(context).primaryColor,
                                    fontSize: Dimensions.fontSizeDefault,
                                  ),
                                ).paddingBottom(5),
                                DropdownButton<String>(
                                  value: selectedMetredBillId == ""
                                      ? null
                                      : selectedMetredBillId,
                                  items: metredBills
                                      .map((MetredBillsUtility metredBill) {
                                    return DropdownMenuItem<String>(
                                      value: metredBill.id.toString(),
                                      child: Text(metredBill.name),
                                    );
                                  }).toList(),
                                  onChanged: (String? newValue) {
                                    setState(() {
                                      selectedMetredBillId = newValue!;
                                    });
                                  },
                                  hint: const Text("Select Expense Frequency"),
                                  isExpanded: true,
                                ).paddingBottom(16),
                              ],
                            ),
                      Text(
                        "Utility Bill Amount",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),
                      CustomTextField(
                        hintText: "Enter Utility Bill Amount",
                        isShowBorder: true,
                        focusNode: _amountFocus,
                        controller: _amountController,
                        inputType: TextInputType.number,
                      ).paddingBottom(16),
                    ],
                  ),
            isActive: currStep == 1,
          ),
        ];

        return Consumer<AuthenticatedAppProviders>(
            builder: (context, provider, child) {
          return Scaffold(
            backgroundColor: Colors.white,
            appBar: AppBar(
              title: Text(
                'Add Utility Bill',
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
                : Stepper(
                    steps: steps,
                    physics: BouncingScrollPhysics(),
                    type: StepperType.vertical,
                    currentStep: currStep,
                    controlsBuilder: (BuildContext context, cd) {
                      return Row(
                        mainAxisSize: MainAxisSize.max,
                        mainAxisAlignment: MainAxisAlignment.start,
                        children: <Widget>[
                          TextButton(
                            onPressed: () {
                              cd.onStepContinue!();
                            },
                            style: TextButton.styleFrom(
                              backgroundColor: Theme.of(context).primaryColor,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: Text(
                              'CONTINUE',
                              style: poppinsBold.copyWith(
                                color: Theme.of(context).primaryColorLight,
                                fontSize: Dimensions.fontSizeDefault,
                              ),
                            ),
                          ),
                          SizedBox(width: 10),
                          TextButton(
                            onPressed: cd.onStepCancel,
                            style: TextButton.styleFrom(
                              backgroundColor: Colors.transparent,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                                side: BorderSide(color: Colors.red, width: 2),
                              ),
                            ),
                            child: Text(
                              'CANCEL',
                              style: poppinsBold.copyWith(
                                color: Colors.red,
                                fontSize: Dimensions.fontSizeDefault,
                              ),
                            ),
                          ),
                        ],
                      ).paddingOnly(top: 20);
                    },
                    onStepContinue: () async {
                      if (currStep == 0) {
                        if (selectedPropertyId.isEmptyOrNull) {
                          showCustomSnackBar("Please select property");
                          return;
                        }
                        if (selectedFrequencyId.isEmptyOrNull) {
                          showCustomSnackBar("Please Bill Type");
                          return;
                        }

                        setState(() {
                          currStep = currStep + 1;
                        });
                      } else if (currStep == 1) {
                        if (selectedFrequencyId != "2") {
                          if (_nameController!.text.isEmpty) {
                            showCustomSnackBar("Please enter name");
                            return;
                          }
                        }

                        if (_amountController!.text.isEmpty) {
                          showCustomSnackBar("Please enter amount");
                          return;
                        }

                        int type = selectedFrequencyId.trim().toInt();

                        String name = selectedFrequencyId == "2"
                            ? selectedFrequencyName
                            : _nameController!.text.trim();
                        String amount = _amountController!.text.trim();
                        int propertyId = selectedPropertyId.trim().toInt();
                        int estateId = selectedEstateId.trim().toInt();
                        String? metredBillId =
                            !selectedMetredBillId.trim().isEmptyOrNull
                                ? selectedMetredBillId.trim()
                                : null;

                        if(name.isEmptyOrNull){
                          logger.d("name is empty and selectedMetredBillName is $selectedMetredBillName and name controller is ${_nameController!.text}");
                          showCustomSnackBar("Please enter name");
                          return;
                        }

                        var result = await provider.addUtilityBill(
                            name,
                            amount,
                            type,
                            propertyId,
                            estateId,
                            metredBillId);

                        if (result.isSuccess) {
                          showCustomSnackBar('Expenditure added successfully',
                              isError: false);
                          Navigator.pop(context);
                          widget.isUtilityBillAdded(true);
                        } else {
                          // showCustomSnackBar(result.message!);
                        }
                      }
                    },
                    onStepCancel: () {
                      finish(context);
                      setState(() {
                        if (currStep > 0) {
                          currStep = currStep - 1;
                        } else {
                          currStep = 0;
                        }
                      });
                    },
                    onStepTapped: (step) {
                      setState(() {
                        currStep = step;
                      });
                    },
                  ),
          );
        });
      },
    );
  }
}
