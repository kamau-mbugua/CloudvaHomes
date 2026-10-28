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

class AddNewOnboardingFeePage extends StatefulWidget {
  final Function(bool) isNewLetFeesAdded;
  const AddNewOnboardingFeePage({Key? key, required this.isNewLetFeesAdded})
      : super(key: key);

  @override
  _AddNewOnboardingFeePageState createState() => _AddNewOnboardingFeePageState();
}

class _AddNewOnboardingFeePageState extends State<AddNewOnboardingFeePage> {
  int currStep = 0;
  List<Property> properties = [];
  List<Property> filteredProperties = [];
  String selectedPropertyId = "";
  String selectedPropertyMonthNo = "";
  String selectedPropertyMonthName = "";
  bool selectedRefundable = false;
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
    {'id': 0, 'name': 'Rent Deposit'},
    {'id': 1, 'name': 'Other Fees'},
  ];

  final List<Map<String, dynamic>> months = [
    {'id': 0, 'name': 'January'},
    {'id': 1, 'name': 'February'},
    {'id': 2, 'name': 'March'},
    {'id': 3, 'name': 'April'},
    {'id': 4, 'name': 'May'},
    {'id': 5, 'name': 'June'},
    {'id': 6, 'name': 'July'},
    {'id': 7, 'name': 'August'},
    {'id': 8, 'name': 'September'},
    {'id': 9, 'name': 'October'},
    {'id': 10, 'name': 'November'},
    {'id': 11, 'name': 'December'},
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

  @override
  void initState() {
    Future.microtask(() => {
          fetchProperties(),
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
                        "Fee Type",
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
                            selectedFrequencyName = newValue!;
                            selectedFrequencyId = frequencies
                                .firstWhere((element) =>
                                    element['name'] ==
                                    selectedFrequencyName)['id']
                                .toString();
                          });
                        },
                        hint: const Text("Select Fee Type"),
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
                      //add a checkbox with text "Check if fee is refundable on vacating"
                      Text(
                        "Refundable",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ),
                      Row(
                        children: [
                          Checkbox(
                            value: selectedRefundable,
                            activeColor: Theme.of(context).primaryColor,
                            onChanged: (bool? value) {
                              setState(() {
                                selectedRefundable = value!;
                              });
                            },
                          ),
                          Text(
                            "Check if fee is refundable on vacating",
                            style: poppinsRegular.copyWith(
                              color: Theme.of(context).primaryColor,
                              fontSize: Dimensions.fontSizeDefault,
                            ),
                          ),
                          ],
                      ),
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
                      Text(
                        "Month",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),
                      DropdownButton<String>(
                        value: selectedPropertyMonthName == ""
                            ? null
                            : selectedPropertyMonthName,
                        items: months.map((Map<String, dynamic> month) {
                          return DropdownMenuItem<String>(
                            value: month['id'].toString(),
                            child: Text(month['name']),
                          );
                        }).toList(),
                        onChanged: (String? newValue) {
                          setState(() {
                            selectedPropertyMonthName = newValue!;
                            selectedPropertyMonthNo = months
                                .firstWhere((element) =>
                            element['id'].toString() ==
                                selectedPropertyMonthName)['id']
                                .toString();
                          });
                        },
                        hint: const Text("Select Property"),
                        isExpanded: true,
                      ).paddingBottom(16),
                      selectedFrequencyId != "0"
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  "Fee Name",
                                  style: poppinsSemiBold.copyWith(
                                    color: Theme.of(context).primaryColor,
                                    fontSize: Dimensions.fontSizeDefault,
                                  ),
                                ).paddingBottom(5),
                                CustomTextField(
                                  hintText: "Enter Fee Name",
                                  isShowBorder: true,
                                  focusNode: _nameFocus,
                                  nextFocus: _amountFocus,
                                  controller: _nameController,
                                  inputType: TextInputType.text,
                                ).paddingBottom(16),
                              ],
                            )
                          : const SizedBox(
                              height: 3,
                      ),
                      Text(
                        "Fee Amount",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),
                      CustomTextField(
                        hintText: "Enter Fee Name",
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
                'Add Onboarding Fee',
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
                        if (selectedFrequencyId != "0") {
                          if (_nameController!.text.isEmpty) {
                            showCustomSnackBar("Please enter name");
                            return;
                          }
                        }

                        if (_amountController!.text.isEmpty) {
                          showCustomSnackBar("Please enter amount");
                          return;
                        }

                        if (selectedPropertyMonthNo.isEmptyOrNull) {
                          showCustomSnackBar("Please select month");
                          return;
                        }

                        int type = selectedFrequencyId.trim().toInt();
                        String months = selectedPropertyMonthName;
                        bool refundable = selectedRefundable;
                        String name = selectedFrequencyId == "0"
                            ? selectedFrequencyName
                            : _nameController!.text.trim();
                        String amount = _amountController!.text.trim();
                        int propertyId = selectedPropertyId.trim().toInt();
                        int estateId = selectedEstateId.trim().toInt();

                        if(name.isEmptyOrNull){
                          logger.d("name is empty and selectedMetredBillName is $selectedMetredBillName and name controller is ${_nameController!.text}");
                          showCustomSnackBar("Please enter name");
                          return;
                        }

                        var result = await provider.addNewOnboardingFee(
                            name,
                            amount,
                            type,
                            propertyId,
                            estateId,
                            months,
                            refundable);

                        if (result.isSuccess) {
                          showCustomSnackBar('Expenditure added successfully',
                              isError: false);
                          Navigator.pop(context);
                          widget.isNewLetFeesAdded(true);
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
