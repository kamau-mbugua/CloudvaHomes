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
import '../../../models/data/houses/un_occupied_houses.dart';
import '../../../models/data/tenants/search_tenant.dart';
import '../../../utils/color_resources.dart';

class AddTenantPage extends StatefulWidget {
  final Function(bool) isTenantAdded;
  const AddTenantPage({Key? key, required this.isTenantAdded})
      : super(key: key);

  @override
  _AddTenantPageState createState() => _AddTenantPageState();
}

class _AddTenantPageState extends State<AddTenantPage> {
  int currStep = 0;
  List<Property> properties = [];
  List<UnOccupiedHouses> unOccupiedHouses = [];
  List<String> _daysOfTheMonth = [];
  TenantSearchUserDetails? tenantSearchUserDetails;
  bool isTenantFound = false;
  bool isExistingTenant = false;


  TextEditingController? _idNoController;
  TextEditingController? _idNoNewController;
  TextEditingController? _firstNameController;
  TextEditingController? _lastNameController;
  TextEditingController? _emailController;
  TextEditingController? _phoneNumberController;
  final FocusNode _idNoFocus = FocusNode();
  final FocusNode _idNoFocusNew = FocusNode();
  final FocusNode _firstNameFocus = FocusNode();
  final FocusNode _lastNameFocus = FocusNode();
  final FocusNode _emailFocus = FocusNode();
  final FocusNode _phoneNumberFocus = FocusNode();


  String selectedPropertyId = "";
  String selectedEstateId = "";
  String selectedDayOfTheMonth = "";
  String selectedHouseNoId = "";


  void fetchProperties([String query = ""]) async {
    debugPrint(">>>>>>>>>fetchProperties<<<<<<<<<< and query is $query");
    List<Property> fetchedProperties =
    await Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .getBusinessProperties("");

    setState(() {
      properties = fetchedProperties;
    });
  }


  Future<void> fetchUnOccupiedHouses() async {
    List<UnOccupiedHouses> fetchedUnOccupiedHouses =
    await Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .getUnOccupiedHouses(selectedPropertyId);

    setState(() {
      unOccupiedHouses = fetchedUnOccupiedHouses;
    });
  }


  @override
  void initState() {
    super.initState();
    _daysOfTheMonth = List.generate(31, (index) => (index + 1).toString());
    Future.microtask(() => {
      fetchProperties(), // fetchHouses()
    });
    _idNoController = TextEditingController();
    _idNoNewController = TextEditingController();
    _firstNameController = TextEditingController();
    _lastNameController = TextEditingController();
    _emailController = TextEditingController();
    _phoneNumberController = TextEditingController();
  }

  @override
  void dispose() {
    _idNoController!.dispose();
    _idNoNewController!.dispose();
    _firstNameController!.dispose();
    _lastNameController!.dispose();
    _emailController!.dispose();
    _phoneNumberController!.dispose();
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
                    setState(() async{
                      selectedPropertyId = newValue!;
                      selectedEstateId = properties
                          .firstWhere((element) =>
                      element.id.toString() == selectedPropertyId)
                          .estateId
                          .toString();
                      await fetchUnOccupiedHouses();

                    });
                  },
                  hint: const Text("Select Property"),
                  isExpanded: true,
                ).paddingBottom(16),

                Text(
                  "Houses",
                  style: poppinsSemiBold.copyWith(
                    color: Theme.of(context).primaryColor,
                    fontSize: Dimensions.fontSizeDefault,
                  ),
                ).paddingBottom(5),
                DropdownButton<String>(
                  value: selectedHouseNoId.isEmptyOrNull
                      ? null
                      : selectedHouseNoId,
                  items: unOccupiedHouses.map((house) {
                    return DropdownMenuItem<String>(
                      value: house.id.toString(),
                      child: Text(house.houseNumber),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    setState(() {
                      selectedHouseNoId = newValue!.toString();
                    });
                  },
                  hint: const Text("Select House"),
                  isExpanded: true,
                ).paddingBottom(16),
                Text(
                  "Pay Date(Day of the month)",
                  style: poppinsSemiBold.copyWith(
                    color: Theme.of(context).primaryColor,
                    fontSize: Dimensions.fontSizeDefault,
                  ),
                ).paddingBottom(5),
                DropdownButton<String>(
                  value: selectedDayOfTheMonth.isEmptyOrNull
                      ? null
                      : selectedDayOfTheMonth,
                  items: _daysOfTheMonth.map((day) {
                    return DropdownMenuItem<String>(
                      value: day,
                      child: Text(day),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    setState(() {
                      selectedDayOfTheMonth = newValue!.toString();
                    });
                  },
                  hint: const Text("Select Pay Date"),
                  isExpanded: true,
                ).paddingBottom(16),
              ],
            ),
            isActive: currStep == 0,
          ),
          Step(
            title: Text(
              "Search Tenant",
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
                  "Enter National ID/Passport Number to search for tenant",
                  style: poppinsSemiBold.copyWith(
                    color: Theme.of(context).primaryColor,
                    fontSize: Dimensions.fontSizeDefault,
                  ),
                ).paddingBottom(5),
                CustomTextField(
                  hintText: "Enter ID No/Passport No",
                  isShowBorder: true,
                  focusNode: _idNoFocus,
                  controller: _idNoController,
                  inputType: TextInputType.number,
                ).paddingBottom(16),

              ],
            ),
            isActive: currStep == 1,
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
                  "Enter ID/Passport Number",
                  style: poppinsSemiBold.copyWith(
                    color: Theme.of(context).primaryColor,
                    fontSize: Dimensions.fontSizeDefault,
                  ),
                ).paddingBottom(5),
                CustomTextField(
                  hintText: "Enter ID No/Passport No",
                  isShowBorder: true,
                  focusNode: _idNoFocusNew,
                  nextFocus: _firstNameFocus,
                  controller: _idNoNewController?..text = tenantSearchUserDetails?.idNo ?? "",
                  inputType: TextInputType.number,
                  isEnabled: false,
                ).paddingBottom(16),

                Text(
                  "Enter First Name",
                  style: poppinsSemiBold.copyWith(
                    color: Theme.of(context).primaryColor,
                    fontSize: Dimensions.fontSizeDefault,
                  ),
                ).paddingBottom(5),
                CustomTextField(
                  hintText: "Enter First Name",
                  isShowBorder: true,
                  focusNode: _firstNameFocus,
                  nextFocus: _lastNameFocus,
                  controller: _firstNameController?..text = tenantSearchUserDetails?.firstName ?? "",
                  inputType: TextInputType.name,
                  isEnabled: !isTenantFound,
                ).paddingBottom(16),

                Text(
                  "Enter Last Name",
                  style: poppinsSemiBold.copyWith(
                    color: Theme.of(context).primaryColor,
                    fontSize: Dimensions.fontSizeDefault,
                  ),
                ).paddingBottom(5),
                CustomTextField(
                  hintText: "Enter Last Name",
                  isShowBorder: true,
                  focusNode: _lastNameFocus,
                  nextFocus: _emailFocus,
                  controller: _lastNameController?..text = tenantSearchUserDetails?.lastName ?? "",
                  inputType: TextInputType.name,
                  isEnabled: !isTenantFound,
                ).paddingBottom(16),

                Text(
                  "Enter Email Address",
                  style: poppinsSemiBold.copyWith(
                    color: Theme.of(context).primaryColor,
                    fontSize: Dimensions.fontSizeDefault,
                  ),
                ).paddingBottom(5),
                CustomTextField(
                  hintText: "Enter Email",
                  isShowBorder: true,
                  focusNode: _emailFocus,
                  nextFocus: _phoneNumberFocus,
                  controller: _emailController?..text = tenantSearchUserDetails?.email ?? "",
                  inputType: TextInputType.emailAddress,
                  isEnabled: !isTenantFound,
                ).paddingBottom(16),

                Text(
                  "Enter Phone Number",
                  style: poppinsSemiBold.copyWith(
                    color: Theme.of(context).primaryColor,
                    fontSize: Dimensions.fontSizeDefault,
                  ),
                ).paddingBottom(5),
                CustomTextField(
                  hintText: "Enter Phone Number",
                  isShowBorder: true,
                  focusNode: _phoneNumberFocus,
                  controller: _phoneNumberController?..text = tenantSearchUserDetails?.phone ?? "",
                  inputType: TextInputType.number,
                  isEnabled: !isTenantFound,
                ).paddingBottom(16),

                Row(
                  children: [
                    Text(
                      "Tenant Exists",
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ).paddingRight(5),
                    Switch(
                      value: isExistingTenant,
                      onChanged: (value) {
                        setState(() {
                          isExistingTenant = value;
                        });
                      },
                      activeTrackColor: Colors.lightGreenAccent,
                      activeColor: Colors.green,
                    ),
                  ],
                ).paddingBottom(16),
              ],
            ),
            isActive: currStep == 2,
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

                      if (selectedPropertyId.isEmptyOrNull || selectedEstateId.isEmptyOrNull) {
                       return showCustomSnackBar("Please select property");
                      }

                      if (selectedHouseNoId.isEmptyOrNull) {
                        return showCustomSnackBar("Please select house");
                      }

                      if (selectedDayOfTheMonth.isEmptyOrNull) {
                        return showCustomSnackBar("Please select pay date");
                      }

                      setState(() {
                        currStep = currStep + 1;
                      });
                    } else if (currStep == 1) {
                      if (_idNoController!.text.isEmpty) {
                        showCustomSnackBar("Please enter ID/Passport number");
                        return;
                      }

                      var result = await provider.searchTenant(_idNoController!.text);
                      if (result.status == "00") {
                        showCustomSnackBar('Tenant found', isError: false);
                        setState(() {
                          tenantSearchUserDetails = result.data;
                          isTenantFound = true;
                          currStep = currStep + 1;
                        });
                      } else {
                        showCustomSnackBar(result.message);
                        setState(() {
                          isTenantFound = false;
                          _idNoNewController?.clear();
                          _firstNameController?.clear();
                          _lastNameController?.clear();
                          _emailController?.clear();
                          _phoneNumberController?.clear();
                          currStep = currStep + 1;
                        });
                      }

                    }  else if (currStep == 2) {

                      if (_idNoNewController!.text.isEmpty) {
                        showCustomSnackBar("Please enter ID/Passport number");
                        return;
                      }

                      if (_firstNameController!.text.isEmpty) {
                        showCustomSnackBar("Please enter first name");
                        return;
                      }

                      if (_lastNameController!.text.isEmpty) {
                        showCustomSnackBar("Please enter last name");
                        return;
                      }

                      if (_emailController!.text.isEmpty) {
                        showCustomSnackBar("Please enter email");
                        return;
                      }

                      if (_phoneNumberController!.text.isEmpty) {
                        showCustomSnackBar("Please enter phone number");
                        return;
                      }

                      String houseId = selectedHouseNoId;
                      String userId = tenantSearchUserDetails!.id.toString() ?? "";
                      String payDate = selectedDayOfTheMonth;
                      bool withArrears = false;
                      String currency = "";
                      bool generateInvoice = false;
                      int refundableAmount = 0;
                      Object? tenant = {
                        "id": userId ?? "",
                        "firstName": _firstNameController!.text,
                        "lastName": _lastNameController!.text,
                        "email": _emailController!.text,
                        "phone": _phoneNumberController!.text,
                        "idNo": _idNoNewController!.text,
                      };

                      Object? invoice = {
                      "utilityBills": [],
                        "month": 12,
                        "nextMonth": false,
                        "newTenant": isExistingTenant,
                      };


                      var result = await provider.addTenantNew(
                          houseId,
                          userId,
                          payDate,
                          withArrears,
                          currency,
                          generateInvoice,
                          refundableAmount,
                          tenant,
                          invoice
                      );

                      if (result.isSuccess) {
                        showCustomSnackBar('House added successfully',
                            isError: false);
                        Navigator.pop(context);
                        widget.isTenantAdded(true);
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
