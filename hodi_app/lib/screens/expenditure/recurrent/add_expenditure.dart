import 'package:flutter/material.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../models/data/properties/properties.dart';
import '../../../providers/authenticated_app_providers.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';
import '../../../widgets/base/custom_snackbar.dart';
import '../../../widgets/base/custom_text_field.dart';

class AddExpenditur extends StatefulWidget {
  final Function(bool) isExpenditureAdded;
  const AddExpenditur({Key? key, required this.isExpenditureAdded}) : super(key: key);

  @override
  _AddExpenditurState createState() => _AddExpenditurState();
}

class _AddExpenditurState extends State<AddExpenditur> {
  int currStep = 0;
  List<Property> properties = [];
  List<Property> filteredProperties = [];

  String selectedPropertyId = "";
  String selectedEstateId = "";
  String selectedPropertyNames = "";
  String selectedFrequencyId = "";
  String selectedFrequencyName = "";

  TextEditingController? _nameController;
  TextEditingController? _descriptionController;
  TextEditingController? _amountController;
  final FocusNode _nameFocus = FocusNode();
  final FocusNode _descriptionFocus = FocusNode();
  final FocusNode _amountFocus = FocusNode();
  final List<Map<String, dynamic>> frequencies = [
    {'id': 1, 'name': 'Monthly'},
    {'id': 2, 'name': 'Once in two months'},
    {'id': 3, 'name': 'Quarterly'}
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
          fetchProperties(), // fetchHouses()
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
                      Text(
                        "Expenditure Name",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),
                      CustomTextField(
                        hintText: "Enter Expenditure Name",
                        isShowBorder: true,
                        focusNode: _nameFocus,
                        nextFocus: _descriptionFocus,
                        controller: _nameController,
                        inputType: TextInputType.name,
                      ).paddingBottom(16),
                      Text(
                        "Expenditure Description",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),
                      CustomTextField(
                        hintText: "Enter Expenditure Description",
                        isShowBorder: true,
                        focusNode: _descriptionFocus,
                        controller: _descriptionController,
                      ).paddingBottom(16),
                    ],
                  ),
            isActive: currStep == 0,
          ),
          Step(
            title: Text(
              "Config",
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
                        "Select Expense Frequency",
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
                        hint: const Text("Select Expense Frequency"),
                        isExpanded: true,
                      ).paddingBottom(16),
                      Text(
                        "Expense Amount",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),
                      CustomTextField(
                        hintText: "Enter Expense Amount",
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
                'Add Expenditure',
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

                    if (_nameController!.text.isEmpty) {
                      showCustomSnackBar("Please enter expenditure name");
                      return;
                    }
                    if (_descriptionController!.text.isEmpty) {
                      showCustomSnackBar("Please enter expenditure description");
                      return;
                    }

                    setState(() {
                      currStep = currStep + 1;
                    });
                  } else if (currStep == 1) {
                    if (selectedFrequencyId.isEmptyOrNull) {
                      showCustomSnackBar("Please select frequency");
                      return;
                    }

                    if (selectedFrequencyName.isEmptyOrNull) {
                      showCustomSnackBar("Please select frequency");
                      return;
                    }
                    if (_amountController!.text.isEmpty) {
                      showCustomSnackBar("Please enter amount");
                      return;
                    }

                    String name = _nameController!.text;
                    String description = _descriptionController!.text;
                    int amount = _amountController!.text.trim().toInt();
                    int frequency = selectedFrequencyId.trim().toInt();
                    String frequencyName = selectedFrequencyName;
                    int propertyId = selectedPropertyId.trim().toInt();
                    int estateId = selectedEstateId.trim().toInt();

                    var result = await provider.addExpenditure(
                      name,
                      description,
                      amount,
                      frequency,
                      frequencyName,
                      propertyId,
                      estateId,
                    );

                    if (result.isSuccess) {
                      showCustomSnackBar('Expenditure added successfully', isError: false);
                      Navigator.pop(context);
                      widget.isExpenditureAdded(true);
                    } else {
                      showCustomSnackBar(result.message!);
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
