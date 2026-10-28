import 'dart:ffi';

import 'package:flutter/material.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../../models/data/properties/properties.dart';
import '../../../../providers/authenticated_app_providers.dart';
import '../../../../utils/dimensions.dart';
import '../../../../utils/styles.dart';
import '../../../../widgets/base/custom_snackbar.dart';
import '../../../../widgets/base/custom_text_field.dart';
import '../../../logger.dart';
import '../../../models/data/houses/house_features.dart';
import '../../../models/data/houses/house_specs_response.dart';
import '../../../utils/color_resources.dart';

class AddHousePage extends StatefulWidget {
  final Function(bool) isHouseAdded;
  const AddHousePage({Key? key, required this.isHouseAdded})
      : super(key: key);

  @override
  _AddHousePageState createState() => _AddHousePageState();
}

class _AddHousePageState extends State<AddHousePage> {
  int currStep = 0;
  List<Property> properties = [];
  List<Property> filteredProperties = [];
  List<int> selectedHouseFeaturesIds = [];

  HouseSpecsResponse? houseSpecsResponse;
  HouseFeaturesResponse? houseFeaturesResponse;

  String selectedPropertyId = "";
  String selectedEstateId = "";
  String selectedPropertyNames = "";

  int? selectedFloorNo = null;
  int? categoryId = null;
  int? houseTypeId = null;

  TextEditingController? _houseNoController;
  TextEditingController? _rentAmountController;
  TextEditingController? _houseSizeController;
  final FocusNode _houseNoFocus = FocusNode();
  final FocusNode _rentAmountFocus = FocusNode();
  final FocusNode _houseSizeFocus = FocusNode();


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

  void fetchHouseSpecs() async {
    HouseSpecsResponse? houseSpecsResponse =
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getHouseSpecs(selectedPropertyId);

    setState(() {
      this.houseSpecsResponse = houseSpecsResponse;
    });
  }

  void fetchHouseFeatures() async {
    HouseFeaturesResponse? houseFeaturesResponse =
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getHouseFeatures(selectedPropertyId, selectedFloorNo.toString());

    setState(() {
      this.houseFeaturesResponse = houseFeaturesResponse;

      // Initialize selectedHouseFeaturesIds with non-house-specific features
      selectedHouseFeaturesIds.clear();
      if (houseFeaturesResponse != null) {
        for (var feature in houseFeaturesResponse.features) {
          if (!feature.houseSpecific) {
            selectedHouseFeaturesIds.add(feature.id);
          }
        }
      }
    });
  }

  @override
  void initState() {
    super.initState();
    Future.microtask(() => {
          fetchProperties(), // fetchHouses()
        });
    _houseNoController = TextEditingController();
    _rentAmountController = TextEditingController();
    _houseSizeController = TextEditingController();



  }

  @override
  void dispose() {
    _houseNoController!.dispose();
    _rentAmountController!.dispose();
    _houseSizeController!.dispose();
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
                            fetchHouseSpecs();

                          });
                        },
                        hint: const Text("Select Property"),
                        isExpanded: true,
                      ).paddingBottom(16),

                      Text(
                        "Floor",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),
                      DropdownButton<String>(
                        value: selectedFloorNo?.toString(),
                        items: houseSpecsResponse?.floors.map((floor) {
                          return DropdownMenuItem<String>(
                            value: floor.id.toString(),
                            child: Text(floor.name.toString()),
                          );
                        }).toList(),
                        onChanged: (String? newValue) {
                          setState(() {
                            selectedFloorNo = newValue!.toInt();
                            fetchHouseFeatures();
                          });
                        },
                        hint: const Text("Select Floor"),
                        isExpanded: true,
                      ).paddingBottom(16),
                      Text(
                        "House Category",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),
                      DropdownButton<String>(
                        value: categoryId?.toString(),
                        items: houseSpecsResponse?.houseCategories.map((category) {
                          return DropdownMenuItem<String>(
                            value: category.id.toString(),
                            child: Text(category.name),
                          );
                        }).toList(),
                        onChanged: (String? newValue) {
                          setState(() {
                            categoryId = newValue!.toInt();
                          });
                        },
                        hint: const Text("Select House Category"),
                        isExpanded: true,
                      ).paddingBottom(16),
                      Text(
                        "House Type",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),
                      DropdownButton<String>(
                        value: houseTypeId?.toString(),
                        items: houseSpecsResponse?.houseTypes.map((type) {
                          return DropdownMenuItem<String>(
                            value: type.id.toString(),
                            child: Text(type.name),
                          );
                        }).toList(),
                        onChanged: (String? newValue) {
                          setState(() {
                            houseTypeId = newValue!.toInt();
                          });
                        },
                        hint: const Text("Select House Type"),
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
                      Text(
                        "House Number",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),
                      CustomTextField(
                        hintText: "Enter House No",
                        isShowBorder: true,
                        focusNode: _houseNoFocus,
                        nextFocus: _houseSizeFocus,
                        controller: _houseNoController,
                        inputType: TextInputType.name,
                      ).paddingBottom(16),
                      Text(
                        "House Size(sqft)",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),
                      CustomTextField(
                        hintText: "Enter House Size (optional)",
                        isShowBorder: true,
                        focusNode: _houseSizeFocus,
                        nextFocus: _rentAmountFocus,
                        controller: _houseSizeController,
                        inputType: TextInputType.number,
                      ).paddingBottom(16),

                      Text(
                        "Rent Amount(Ksh)",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),
                      CustomTextField(
                        hintText: "Enter Rent Amount",
                        isShowBorder: true,
                        focusNode: _rentAmountFocus,
                        controller: _rentAmountController,
                        inputType: TextInputType.number,
                      ).paddingBottom(16),

                      Text(
                        "House Features",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(5),

                      houseFeaturesResponse==null || houseFeaturesResponse!.features.isEmpty
                          ? Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Center(
                          child: Text(
                            'You have not added any house features',
                            style: poppinsRegular.copyWith(
                              fontSize: Dimensions.fontSizeLarge,
                              color: ColorResources.colorNero,
                            ),
                          ),
                        ),
                      )
                          : Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Wrap(
                          spacing: 8.0,
                          children: List<Widget>.generate(
                              houseFeaturesResponse!.features.length, (int index) {
                            return ChoiceChip(
                              label: Text(houseFeaturesResponse!.features[index].name),
                              selected: selectedHouseFeaturesIds.contains(houseFeaturesResponse!.features[index].id),
                              onSelected: (bool selected) {
                                setState(() {
                                  if (selected) {
                                    selectedHouseFeaturesIds.add(houseFeaturesResponse!.features[index].id);
                                  } else if (houseFeaturesResponse!.features[index].houseSpecific) {
                                    selectedHouseFeaturesIds.remove(houseFeaturesResponse!.features[index].id);
                                  }
                                  logger.d('selected ${houseFeaturesResponse!.features[index].toJson()}');
                                });
                              },
                            );
                          }
                          ).toList(),
                        ),
                      )
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
                'Add a new House',
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

                        if (selectedFloorNo == null) {
                          showCustomSnackBar("Please select floor");
                          return;
                        }

                        if (categoryId == null) {
                          showCustomSnackBar("Please select house category");
                          return;
                        }

                        if (houseTypeId == null) {
                          showCustomSnackBar("Please select house type");
                          return;
                        }


                        setState(() {
                          currStep = currStep + 1;
                        });
                      } else if (currStep == 1) {

                        if (_houseNoController!.text.isEmpty) {
                          showCustomSnackBar("Please enter house number");
                          return;
                        }

                        var isNameExist = houseSpecsResponse?.houseNumbers
                            .map((e) => e.toLowerCase())
                            .contains(_houseNoController!.text.toLowerCase());
                        if (isNameExist == true) {
                          showCustomSnackBar("House number already exists");
                          return;
                        }

                        // if (_houseSizeController!.text.isEmpty) {
                        //   showCustomSnackBar("Please enter house size");
                        //   return;
                        // }

                        if (_rentAmountController!.text.isEmpty) {
                          showCustomSnackBar("Please enter rent amount");
                          return;
                        }

                        if (selectedHouseFeaturesIds.isEmpty) {
                          showCustomSnackBar("Please select house features");
                          return;
                        }

                        String houseNumber = _houseNoController!.text;
                        int floor = selectedFloorNo!;
                        int houseTypeId = this.houseTypeId!;
                        String squareFt = _houseSizeController!.text.trim().toString() ?? "";
                        String description = "";
                        String rent = _rentAmountController!.text.trim().toString();
                        int categoryId = this.categoryId!;
                        int propertyId = selectedPropertyId.trim().toInt();
                        int estateId = selectedEstateId.trim().toInt();
                        List<int> featureIds = selectedHouseFeaturesIds;


                        var result = await provider.addHouse(
                          houseNumber,
                          floor,
                          houseTypeId,
                          squareFt,
                          description,
                          rent,
                          categoryId,
                          propertyId,
                          estateId,
                          featureIds,
                        );

                        if (result.isSuccess) {
                          showCustomSnackBar('House added successfully',
                              isError: false);
                          Navigator.pop(context);
                          widget.isHouseAdded(true);
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
