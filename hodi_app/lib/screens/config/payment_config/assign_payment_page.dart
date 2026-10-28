import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_otp_text_field/flutter_otp_text_field.dart';
import 'package:hodi_app/logger.dart';
import 'package:hodi_app/utils/color_resources.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../models/data/metred_bills/metred_bills.dart';
import '../../../models/data/payments/add_type/payment_types.dart';
import '../../../models/data/properties/properties.dart';
import '../../../providers/authenticated_app_providers.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';
import '../../../widgets/base/custom_snackbar.dart';
import '../../../widgets/base/custom_text_field.dart';

class AssignPaymentPage extends StatefulWidget {
  final Function(bool) isPaymentTypeAdded;
  const AssignPaymentPage({Key? key, required this.isPaymentTypeAdded}) : super(key: key);

  @override
  _AssignPaymentPageState createState() => _AssignPaymentPageState();
}

class _AssignPaymentPageState extends State<AssignPaymentPage> {
  int currStep = 0;
  List<Property> properties = [];
  AssignPaymentResponse? assignPaymentResponse;

  String selectedPropertyId = "";
  String selectedEstateId = "";
  String selectedTypeId = "";
  String selectedBankId = "";
  String otpCode = "";

  TextEditingController? _accountNoController;
  TextEditingController? _accountNameController;
  TextEditingController? _payBillNoController;
  TextEditingController? _otpController;

  FocusNode? _accountNoFocusNode = FocusNode();
  FocusNode? _accountNameFocusNode = FocusNode();
  List<TextEditingController?>? _otpControls;

  bool isRequestOtpTimeOut = false;

  Timer? _timer;
  int _start = 60;

  void startTimer() {
    const oneSec = Duration(seconds: 1);
    _timer = Timer.periodic(
      oneSec,
          (Timer timer) {
        if (_start == 0) {
          setState(() {
            timer.cancel();
            isRequestOtpTimeOut = true;
            // _requestForOTP();
          });
        } else {
          setState(() {
            _start--;
          });
        }
      },
    );
  }

  void fetchProperties([String query = ""]) async {
    List<Property> fetchedProperties = await Provider.of<AuthenticatedAppProviders>(context, listen: false).getBusinessProperties("");
    setState(() {
      properties = fetchedProperties;
    });
  }

  void fetchAssignPaymentTypes() async {
    AssignPaymentResponse fetchedAssignPaymentResponse = await Provider.of<AuthenticatedAppProviders>(context, listen: false).getAssignPaymentTypes(selectedPropertyId, selectedEstateId);
    setState(() {
      assignPaymentResponse = fetchedAssignPaymentResponse;
    });
  }

  @override
  void initState() {
    Future.microtask(() => fetchProperties());
    _accountNoController = TextEditingController();
    _accountNameController = TextEditingController();
    _payBillNoController = TextEditingController();
    _otpController = TextEditingController();
    _otpControls = List.generate(6, (index) => TextEditingController());

    // startTimer();

    super.initState();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _accountNoController!.dispose();
    _accountNameController!.dispose();
    _payBillNoController!.dispose();
    _otpController!.dispose();
    _otpControls!.forEach((element) {
      element!.dispose();
    });
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
                  value: selectedPropertyId == "" ? null : selectedPropertyId,
                  items: properties.map((Property property) {
                    return DropdownMenuItem<String>(
                      value: property.id.toString(),
                      child: Text(property.name),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    setState(() {
                      selectedPropertyId = newValue!;
                      selectedEstateId = properties.firstWhere((element) => element.id.toString() == selectedPropertyId).estateId.toString();
                      fetchAssignPaymentTypes();
                    });
                  },
                  hint: const Text("Select Property"),
                  isExpanded: true,
                ).paddingBottom(16),
                Text(
                  "Payment Type",
                  style: poppinsSemiBold.copyWith(
                    color: Theme.of(context).primaryColor,
                    fontSize: Dimensions.fontSizeDefault,
                  ),
                ),
                DropdownButton<String>(
                  value: selectedTypeId == "" ? null : selectedTypeId,
                  items: assignPaymentResponse?.types.map((AssignPaymentTypeData type) {
                    return DropdownMenuItem<String>(
                      value: type.id.toString(),
                      child: Text(type.name),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    setState(() {
                      selectedTypeId = newValue!;
                    });
                  },
                  hint: const Text("Select Payment Type"),
                  isExpanded: true,
                ).paddingBottom(16),
              ],
            ),
            isActive: currStep == 0,
            state: currStep == 0 ? StepState.editing : StepState.complete,
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
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "Bank",
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ).paddingBottom(5),
                    DropdownButton<String>(
                      value: selectedBankId == "" ? null : selectedBankId,
                      items: assignPaymentResponse?.banks.map((AssignPaymentBankData bank) {
                        return DropdownMenuItem<String>(
                          value: bank.id.toString(),
                          child: Text(bank.name),
                        );
                      }).toList(),
                      onChanged: (String? newValue) {
                        setState(() {
                          selectedBankId = newValue!;
                        });
                      },
                      hint: const Text("Select Bank"),
                      isExpanded: true,
                    ).paddingBottom(16),
                    Text(
                      "Account Number",
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ).paddingBottom(5),
                    CustomTextField(
                      hintText: "Enter Account Number",
                      isShowBorder: true,
                      focusNode: _accountNoFocusNode,
                      nextFocus: _accountNameFocusNode,
                      controller: _accountNoController,
                      inputType: TextInputType.number,
                    ).paddingBottom(16),
                    Text(
                      "Account Name",
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ).paddingBottom(5),
                    CustomTextField(
                      hintText: "Enter Account Number",
                      isShowBorder: true,
                      focusNode: _accountNameFocusNode,
                      controller: _accountNameController,
                      inputType: TextInputType.number,
                    ).paddingBottom(16),
                  ],
                ),
              ],
            ),
            isActive: currStep == 1,
            state: currStep == 1 ? StepState.editing : StepState.complete,
          ),
          Step(
            title: Text(
              "OTP Verification",
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
                OtpTextField(
                  numberOfFields: 6,
                  borderColor: ColorResources.graphGrey,
                  focusedBorderColor: ColorResources.graphLightBlue,
                  clearText: true,
                  showFieldAsBox: true,
                  textStyle: poppinsRegular.copyWith(
                    color: Theme.of(context).primaryColor,
                    fontSize: Dimensions.fontSizeDefault,
                  ),
                  onSubmit: (String verificationCode) {
                    logger.d("VerificationCode: $verificationCode");
                    setState(() {
                      _otpController!.text = verificationCode;
                      otpCode = verificationCode;
                    });
                  },
                ),

                Center(
                  child: Text( isRequestOtpTimeOut ? "Resend OTP" :
                    "Time remaining: $_start seconds",
                    style: const TextStyle(color: Colors.black),
                  ).onTap(() {
                    if (isRequestOtpTimeOut) {
                      setState(() {
                        isRequestOtpTimeOut = false;
                        _start = 60;
                        startTimer();
                      });
                    }
                  }),
                ).paddingAll(16),
              ],
              //add a counter of 3 minutes


            ),
            isActive: currStep == 2,
            state: currStep == 2 ? StepState.editing : StepState.complete,
          ),
        ];

        return Scaffold(
          appBar: AppBar(
            title: Text(
              'Assign Payment',
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
                  showCustomSnackBar("Please select property");
                  return;
                }

                if (selectedTypeId.isEmptyOrNull) {
                  showCustomSnackBar("Please select payment type");
                  return;
                }

                setState(() async{
                  if (selectedTypeId == "1" || selectedTypeId == "2") {
                    await _requestForOTP().then((value) {
                      setState(() {
                        currStep = currStep + 2;
                      });
                    });
                    return;
                  }
                  currStep = currStep + 1;
                });
              } else if (currStep == 1) {
                if (selectedTypeId != "1" && selectedTypeId != "2") {
                  if (selectedBankId.isEmptyOrNull) {
                    showCustomSnackBar("Please select bank");
                    return;
                  }

                  if (_accountNoController!.text.isEmptyOrNull) {
                    showCustomSnackBar("Please enter account number");
                    return;
                  }

                  if (_accountNameController!.text.isEmptyOrNull) {
                    showCustomSnackBar("Please enter account name");
                    return;
                  }
                }

                setState(() async{
                  await _requestForOTP().then((value) {
                    setState(() {
                      currStep = currStep + 1;
                    });
                  });
                });
              } else if (currStep == 2) {
                if (_otpController!.text.isEmptyOrNull || otpCode.isEmptyOrNull || otpCode.length < 6) {
                  showCustomSnackBar("Please enter OTP");
                  return;
                }

                String typeId = selectedTypeId;
                String bankId = selectedBankId;
                String estateId = selectedEstateId;
                String propertyId = selectedPropertyId;
                String accountNo = _accountNoController!.text;
                String accountName = _accountNameController!.text;
                String payBillNo = "";
                String otp = otpCode;

                await _assignPayment(
                  typeId,
                  bankId,
                  estateId,
                  propertyId,
                  accountNo,
                  accountName,
                  payBillNo,
                  otp,
                );
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
      },
    );
  }

  Future<void> _requestForOTP() async {
    try {
      var result = await Provider.of<AuthenticatedAppProviders>(context, listen: false).requestOTP(selectedEstateId);
      if (result.isSuccess) {
        startTimer();
        showCustomSnackBar('OTP sent successfully', isError: false);
      } else {
        showCustomSnackBar(result.message!);
      }
    } catch (e) {
      showCustomSnackBar(e.toString());
    }
  }

  Future<void> _assignPayment(
      String typeId,
      String bankId,
      String estateId,
      String propertyId,
      String accountNo,
      String accountName,
      String payBillNo,
      String otp) async {
    try {
      var result = await Provider.of<AuthenticatedAppProviders>(context, listen: false).assignPayment(
          typeId,
          bankId,
          estateId,
          propertyId,
          accountNo,
          accountName,
          payBillNo,
          otp);

      if (result.isSuccess) {
        showCustomSnackBar('Expenditure added successfully', isError: false);
        Navigator.pop(context);
        widget.isPaymentTypeAdded(true);
      } else {
        // showCustomSnackBar(result.message!);
      }
    } catch (e) {
      showCustomSnackBar(e.toString());
    }
  }
}