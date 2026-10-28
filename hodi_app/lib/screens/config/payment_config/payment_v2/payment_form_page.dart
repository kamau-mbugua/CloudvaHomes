import 'dart:convert';

import 'package:country_code_picker/country_code_picker.dart';
import 'package:flutter/material.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../../logger.dart';
import '../../../../models/data/authentication/login_response.dart';
import '../../../../providers/auth_provider.dart';
import '../../../../providers/authenticated_app_providers.dart';
import '../../../../utils/color_resources.dart';
import '../../../../utils/dimensions.dart';
import '../../../../utils/styles.dart';
import '../../../../viewmodel/payment_view_model.dart';
import '../../../../widgets/base/code_picker_widget.dart';
import '../../../../widgets/base/custom_snackbar.dart';
import '../../../../widgets/base/custom_text_field.dart';
import 'PaymentTimerScreen.dart';

class PaymentFormPage extends StatefulWidget {
  final Map<String, dynamic>? paymentPayload;
  const PaymentFormPage({Key? key, required this.paymentPayload})
      : super(key: key);

  @override
  State<PaymentFormPage> createState() => _PaymentFormPageState();
}

class _PaymentFormPageState extends State<PaymentFormPage> {
  bool _isSlipValidated = false;
  bool _isBankDepositValidated = false;
  bool _isShowValidateOption = true;
  String? countryCode;
  String? typeId;
  String? bankId;
  String? amount;
  List<String> invoiceIds = [];
  String? phoneNo;
  String? paidBy;
  String? propertyId;
  String? paymentName;
  String? originInvoice;
  TabController? _tabController;
  LoginResponse? loginResponse = null;

  TextEditingController? _cashAmountController;
  TextEditingController? _cashPaidByController;
  TextEditingController? _cashDescriptionController;

  TextEditingController? _stkcashAmountController;
  TextEditingController? _stkcashPaidByController;
  TextEditingController? _stkcashDescriptionController;
  TextEditingController? _phoneNumberController;

  TextEditingController? _slipRefController;
  TextEditingController? _slipAmountController;
  TextEditingController? _slipPaidByController;
  TextEditingController? _slipDescriptionController;

  TextEditingController? _chequeNoController;
  TextEditingController? _chequeAmountController;
  TextEditingController? _chequeNameController;
  TextEditingController? _chequeBankNameController;
  TextEditingController? _chequePaidByController;
  TextEditingController? _chequeDescriptionController;

  final FocusNode _amountFocus = FocusNode();
  final FocusNode _paidByFocus = FocusNode();
  final FocusNode _descriptionByFocus = FocusNode();

  final FocusNode _stkamountFocus = FocusNode();
  final FocusNode _stkpaidByFocus = FocusNode();
  final FocusNode _stkdescriptionByFocus = FocusNode();
  final FocusNode _stkphoneNumberFocus = FocusNode();

  final FocusNode _slipRefFocus = FocusNode();
  final FocusNode _slipAmountFocus = FocusNode();
  final FocusNode _slipPaidByFocus = FocusNode();
  final FocusNode _slipDescriptionFocus = FocusNode();

  final FocusNode _chequeNoFocus = FocusNode();
  final FocusNode _chequeAmountFocus = FocusNode();
  final FocusNode _chequeNameFocus = FocusNode();
  final FocusNode _chequeBankNameFocus = FocusNode();
  final FocusNode _chequePaidByFocus = FocusNode();
  final FocusNode _chequeDescriptionFocus = FocusNode();

  String removeCountryCode(String phoneNumber) {
    if (phoneNumber.startsWith('254')) {
      phoneNumber = phoneNumber.substring(3);
    } else if (phoneNumber.startsWith('+254')) {
      phoneNumber = phoneNumber.substring(4);
    }
    //CHECK IF THE PHONE NUMBER STARTS WITH 0
    if (phoneNumber.startsWith('0')) {
      phoneNumber = phoneNumber.substring(1);
    }
    return phoneNumber;
  }

  @override
  void initState() {
    loginResponse =
        Provider.of<AuthProvider>(context, listen: false).getLoginResponse();

    phoneNo = widget.paymentPayload!['phoneNo'];
    paidBy = widget.paymentPayload!['paidBy'];
    originInvoice = widget.paymentPayload!['originInvoice'];
    paymentName = widget.paymentPayload!['paymentName'];

    var phoneNumber = removeCountryCode(phoneNo!);

    typeId = widget.paymentPayload!['typeId'];
    amount = widget.paymentPayload!['amount'].toInt().toString();
    bankId = widget.paymentPayload!['bankId'];
    invoiceIds = widget.paymentPayload!['invoiceIds'];
    propertyId = widget.paymentPayload!['propertyId'];

    // Set default country code to Kenya's dial code if not already set
    countryCode ??= '+254';

    _cashAmountController = TextEditingController(
      text: amount,
    );
    _cashPaidByController = TextEditingController(text: paidBy);
    _cashDescriptionController = TextEditingController();

    _stkcashAmountController = TextEditingController(text: amount);
    _stkcashPaidByController = TextEditingController(text: paidBy);
    _stkcashDescriptionController = TextEditingController();
    _phoneNumberController = TextEditingController(text: phoneNumber);

    _slipRefController = TextEditingController();
    _slipAmountController = TextEditingController(text: amount);
    _slipPaidByController = TextEditingController(text: paidBy);
    _slipDescriptionController = TextEditingController(text: "");

    _chequeNoController = TextEditingController();
    _chequeAmountController = TextEditingController(text: amount);
    _chequeNameController = TextEditingController();
    _chequeBankNameController = TextEditingController();
    _chequePaidByController = TextEditingController(text: paidBy);
    _chequeDescriptionController = TextEditingController();
    super.initState();
  }

  @override
  void dispose() {
    _cashAmountController!.dispose();
    _cashPaidByController!.dispose();
    _cashDescriptionController!.dispose();

    _stkcashAmountController!.dispose();
    _stkcashPaidByController!.dispose();
    _stkcashDescriptionController!.dispose();
    _phoneNumberController!.dispose();

    _slipRefController!.dispose();
    _slipAmountController!.dispose();
    _slipPaidByController!.dispose();
    _slipDescriptionController!.dispose();

    _chequeNoController!.dispose();
    _chequeAmountController!.dispose();
    _chequeNameController!.dispose();
    _chequeBankNameController!.dispose();
    _chequePaidByController!.dispose();
    _chequeDescriptionController!.dispose();

    _tabController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthenticatedAppProviders>(
        builder: (context, provider, child) {
      return Scaffold(
        appBar: AppBar(
          title: Text(
            'Complete Payment - ${paymentName}',
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
            ? typeId != "12"
                ? const Center(child: CircularProgressIndicator())
                : Center(
                    child: PaymentTimerScreen(message: "Processing your payment. STK Push sent. Please check your ${phoneNo} for the prompt."),
                  )
            : SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.start,
                  children: [
                    typeId == "1"
                        ? _cashPaymentForm(context)
                        : typeId == "2"
                            ? _chequePaymentForm(context)
                            : typeId == "11"
                                ? _bankPaymentForm(context)
                                : _bankDepositForm(context),
                    Center(
                      child: ElevatedButton.icon(
                        onPressed: () async {
                          _isSlipValidated && typeId == "11"
                              ? await _validateSlip(context)
                              : await _makePayment(context);
                        },
                        icon: const Icon(Icons.money),
                        label: Text(_isSlipValidated
                            ? 'Validate Slip'
                            : 'Make Payment'),
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 30, vertical: 10),
                        ),
                      ),
                    )
                  ],
                ).paddingAll(16),
              ),
      );
    });
  }

  Widget _cashPaymentForm(BuildContext context) {
    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.all(8.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Amount * (Payable: KES ${amount})',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingOnly(top: 16, bottom: 0),
            CustomTextField(
              hintText: "Enter Amount",
              isShowBorder: true,
              focusNode: _amountFocus,
              nextFocus: _paidByFocus,
              controller: _cashAmountController,
              inputType: TextInputType.number,
              isShowSuffixIcon: false,
              isIcon: false,
              fillColor: Theme.of(context).hoverColor,
            ).paddingBottom(10),
            Text(
              'Paid By',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingOnly(top: 16, bottom: 0),
            CustomTextField(
              hintText: "Paid By",
              isShowBorder: true,
              focusNode: _paidByFocus,
              nextFocus: _descriptionByFocus,
              controller: _cashPaidByController,
              inputType: TextInputType.name,
              isShowSuffixIcon: false,
              isIcon: false,
              fillColor: Theme.of(context).hoverColor,
            ).paddingBottom(10),
            Text(
              'Description',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingOnly(top: 16, bottom: 0),
            CustomTextField(
              hintText: "Enter Description",
              isShowBorder: true,
              focusNode: _descriptionByFocus,
              controller: _cashDescriptionController,
              inputType: TextInputType.name,
              isShowSuffixIcon: false,
              isIcon: false,
              maxLines: 2,
              fillColor: Theme.of(context).hoverColor,
            ).paddingBottom(10),
          ],
        ),
      ),
    );
  }

  Widget _chequePaymentForm(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.vertical,
      child: Padding(
        padding: const EdgeInsets.all(8.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Cheque No',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingOnly(top: 16, bottom: 0),
            CustomTextField(
              hintText: "Cheque No",
              isShowBorder: true,
              focusNode: _chequeNoFocus,
              nextFocus: _chequeAmountFocus,
              controller: _chequeNoController,
              inputType: TextInputType.text,
              isShowSuffixIcon: false,
              isIcon: false,
              fillColor: Theme.of(context).hoverColor,
            ).paddingBottom(10),
            Text(
              'Amount * (Payable: KES ${amount})',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingOnly(top: 16, bottom: 0),
            CustomTextField(
              hintText: "Enter Amount",
              isShowBorder: true,
              inputType: TextInputType.number,
              focusNode: _chequeAmountFocus,
              nextFocus: _chequeNameFocus,
              controller: _chequeAmountController,
              isShowSuffixIcon: false,
              isIcon: false,
              fillColor: Theme.of(context).hoverColor,
            ).paddingBottom(10),
            Text(
              'Cheque Name',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingOnly(top: 16, bottom: 5),
            CustomTextField(
              hintText: "Enter Cheque Name",
              isShowBorder: true,
              inputType: TextInputType.name,
              focusNode: _chequeNameFocus,
              nextFocus: _chequeBankNameFocus,
              controller: _chequeNameController,
              isShowSuffixIcon: false,
              isIcon: false,
              fillColor: Theme.of(context).hoverColor,
            ).paddingBottom(10),
            Text(
              'Bank Name',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingOnly(top: 16, bottom: 0),
            CustomTextField(
              hintText: "Enter Bank Name",
              isShowBorder: true,
              inputType: TextInputType.name,
              focusNode: _chequeBankNameFocus,
              nextFocus: _chequePaidByFocus,
              controller: _chequeBankNameController,
              isShowSuffixIcon: false,
              isIcon: false,
              fillColor: Theme.of(context).hoverColor,
            ).paddingBottom(10),
            Text(
              'Paid By *',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingOnly(top: 16, bottom: 0),
            CustomTextField(
              hintText: "Enter Paid By",
              isShowBorder: true,
              inputType: TextInputType.text,
              focusNode: _chequePaidByFocus,
              controller: _chequePaidByController,
              nextFocus: _chequeDescriptionFocus,
              isShowSuffixIcon: false,
              isIcon: false,
              fillColor: Theme.of(context).hoverColor,
            ).paddingBottom(10),
            Text(
              'Description',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingOnly(top: 16, bottom: 0),
            CustomTextField(
              hintText: "Enter Description",
              isShowBorder: true,
              inputType: TextInputType.text,
              focusNode: _chequeDescriptionFocus,
              controller: _chequeDescriptionController,
              isShowSuffixIcon: false,
              isIcon: false,
              fillColor: Theme.of(context).hoverColor,
              maxLines: 2,
            ).paddingBottom(10),
          ],
        ),
      ),
    );
  }

  Widget _bankPaymentForm(BuildContext context) {
    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.all(8.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Slip REF No',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingOnly(top: 16, bottom: 0),
            CustomTextField(
              hintText: "Enter Slip REF No",
              isShowBorder: true,
              focusNode: _slipRefFocus,
              nextFocus: _slipAmountFocus,
              controller: _slipRefController,
              inputType: TextInputType.text,
              isShowSuffixIcon: false,
              isIcon: false,
              fillColor: Theme.of(context).hoverColor,
            ).paddingBottom(10),
            if (_isShowValidateOption) ...[
              Row(
                children: [
                  Checkbox(
                    value: _isSlipValidated,
                    onChanged: (bool? value) {
                      setState(() {
                        _isSlipValidated = value!;
                      });
                    },
                  ),
                  Text(
                    'Validate Slip',
                    style: poppinsRegular.copyWith(
                      fontSize: Dimensions.fontSizeDefault,
                      color: ColorResources.colorNero,
                    ),
                  ),
                ],
              ).paddingBottom(10),
            ],
            if (!_isSlipValidated) ...[
              Text(
                'Amount * (Payable: KES ${amount})',
                style: poppinsBold.copyWith(
                  fontSize: Dimensions.fontSizeLarge,
                  color: ColorResources.colorNero,
                ),
              ).paddingOnly(top: 16, bottom: 0),
              CustomTextField(
                hintText: "Enter Amount",
                isShowBorder: true,
                inputType: TextInputType.number,
                focusNode: _slipAmountFocus,
                nextFocus: _slipPaidByFocus,
                controller: _slipAmountController,
                isShowSuffixIcon: false,
                isIcon: false,
                fillColor: Theme.of(context).hoverColor,
              ).paddingBottom(10),
              Text(
                'Paid By *',
                style: poppinsBold.copyWith(
                  fontSize: Dimensions.fontSizeLarge,
                  color: ColorResources.colorNero,
                ),
              ).paddingOnly(top: 16, bottom: 0),
              CustomTextField(
                hintText: "Enter Paid By",
                isShowBorder: true,
                inputType: TextInputType.text,
                focusNode: _slipPaidByFocus,
                controller: _slipPaidByController,
                nextFocus: _slipDescriptionFocus,
                isShowSuffixIcon: false,
                isIcon: false,
                fillColor: Theme.of(context).hoverColor,
              ).paddingBottom(10),
              Text(
                'Description',
                style: poppinsBold.copyWith(
                  fontSize: Dimensions.fontSizeLarge,
                  color: ColorResources.colorNero,
                ),
              ).paddingOnly(top: 16, bottom: 0),
              CustomTextField(
                hintText: "Enter Description",
                isShowBorder: true,
                inputType: TextInputType.text,
                focusNode: _slipDescriptionFocus,
                controller: _slipDescriptionController,
                isShowSuffixIcon: false,
                isIcon: false,
                fillColor: Theme.of(context).hoverColor,
                maxLines: 2,
              ).paddingBottom(10),
            ]
          ],
        ),
      ),
    );
  }

  Widget _bankDepositForm(BuildContext context) {
    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.all(8.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Amount * (Payable: KES ${amount})',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingOnly(top: 16, bottom: 0),
            CustomTextField(
              hintText: "Enter Amount",
              isShowBorder: true,
              focusNode: _stkamountFocus,
              nextFocus: _stkphoneNumberFocus,
              controller: _stkcashAmountController,
              inputType: TextInputType.name,
              isShowSuffixIcon: false,
              isIcon: false,
              fillColor: Theme.of(context).hoverColor,
            ).paddingBottom(10),
            Text(
              'Phone Number',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingBottom(10),
            Row(children: [
              CodePickerWidget(
                onChanged: (CountryCode value) {
                  countryCode = value.dialCode;
                },
                initialSelection: countryCode,
                favorite: [countryCode ?? ''],
                showDropDownButton: true,
                padding: EdgeInsets.zero,
                showFlagMain: true,
                countryFilter: const ['KE', 'UG', 'TZ', 'RW', 'SS', 'KE'],
                textStyle: TextStyle(
                    color: Theme.of(context).textTheme.displayLarge!.color),
              ),
              Expanded(
                  child: CustomTextField(
                hintText: "7xxxxxxxx",
                isShowBorder: true,
                focusNode: _stkphoneNumberFocus,
                nextFocus: _stkpaidByFocus,
                controller: _phoneNumberController,
                inputType: TextInputType.phone,
                isShowSuffixIcon: false,
                isIcon: false,
                fillColor: Theme.of(context).hoverColor,
              )),
            ]).paddingBottom(10),
            Text(
              'Paid By',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingOnly(top: 16, bottom: 0),
            CustomTextField(
              hintText: "Paid By",
              isShowBorder: true,
              focusNode: _stkpaidByFocus,
              nextFocus: _descriptionByFocus,
              controller: _stkcashPaidByController,
              inputType: TextInputType.name,
              isShowSuffixIcon: false,
              isIcon: false,
              fillColor: Theme.of(context).hoverColor,
            ).paddingBottom(10),
            Text(
              'Description',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeLarge,
                color: ColorResources.colorNero,
              ),
            ).paddingOnly(top: 16, bottom: 0),
            CustomTextField(
              hintText: "Enter Description",
              isShowBorder: true,
              focusNode: _stkdescriptionByFocus,
              controller: _stkcashDescriptionController,
              inputType: TextInputType.name,
              isShowSuffixIcon: false,
              isIcon: false,
              maxLines: 2,
              fillColor: Theme.of(context).hoverColor,
            ).paddingBottom(10),
          ],
        ),
      ),
    );
  }

  Future<void> _makePayment(BuildContext context) async {
    var payloadObject = {};
    int currentTypeId = typeId.toInt();
    if (currentTypeId == 1) {
      if (_cashAmountController!.text.isEmptyOrNull) {
        showCustomSnackBar('Amount is required');
        return;
      }

      if (_cashPaidByController!.text.isEmptyOrNull) {
        showCustomSnackBar('Paid By is required');
        return;
      }

      payloadObject = {
        'amount': _cashAmountController!.text,
        'paidBy': _cashPaidByController!.text,
        'description': _cashDescriptionController!.text,
        'paymentTypeId': currentTypeId,
        'propertyId': propertyId,
        'invoiceIds': invoiceIds,
        'bankId': null,
        'phoneNo': phoneNo,
      };
    } else if (currentTypeId == 11) {
      if (_slipRefController!.text.isEmptyOrNull) {
        showCustomSnackBar('Slip REF No is required');
        return;
      }

      if (!_isSlipValidated) {
        if (_slipAmountController!.text.isEmptyOrNull) {
          showCustomSnackBar('Amount is required');
          return;
        }

        if (_slipPaidByController!.text.isEmptyOrNull) {
          showCustomSnackBar('Paid By is required');
          return;
        }
      }

      payloadObject = {
        'amount': _slipAmountController!.text,
        'paidBy': _slipPaidByController!.text,
        'description': _slipDescriptionController!.text,
        'refNo': _slipRefController!.text,
        'paymentTypeId': currentTypeId,
        'propertyId': propertyId,
        'phoneNo': phoneNo,
        'bankId': bankId,
        'validateSlip': _isBankDepositValidated,
        'invoiceIds': invoiceIds,
      };
    } else if (currentTypeId == 2) {
      if (_chequeNoController!.text.isEmptyOrNull) {
        showCustomSnackBar('Cheque No is required');
        return;
      }

      if (_chequeAmountController!.text.isEmptyOrNull) {
        showCustomSnackBar('Amount is required');
        return;
      }

      if (_chequeNameController!.text.isEmptyOrNull) {
        showCustomSnackBar('Cheque Name is required');
        return;
      }

      if (_chequeBankNameController!.text.isEmptyOrNull) {
        showCustomSnackBar('Bank Name is required');
        return;
      }

      if (_chequePaidByController!.text.isEmptyOrNull) {
        showCustomSnackBar('Paid By is required');
        return;
      }

      payloadObject = {
        'amount': _chequeAmountController!.text,
        'paidBy': _chequePaidByController!.text,
        'description': _chequeDescriptionController!.text,
        'refNo': _chequeNoController!.text,
        'paymentTypeId': currentTypeId,
        'propertyId': propertyId,
        'phoneNo': phoneNo,
        'bankId': null,
        'invoiceIds': invoiceIds,
        'bankName':
            "${_chequeNameController!.text}(${_chequeBankNameController!.text})",
      };
    } else if (currentTypeId == 12) {
      if (_stkcashAmountController!.text.isEmptyOrNull) {
        showCustomSnackBar('Amount is required');
        return;
      }

      if (_stkcashPaidByController!.text.isEmptyOrNull) {
        showCustomSnackBar('Paid By is required');
        return;
      }

      if (_phoneNumberController!.text.isEmptyOrNull) {
        showCustomSnackBar('Phone Number is required');
        return;
      }

      payloadObject = {
        'amount': _stkcashAmountController!.text,
        'paidBy': _stkcashPaidByController!.text,
        'description': _stkcashDescriptionController!.text,
        'paymentTypeId': currentTypeId,
        'propertyId': propertyId,
        'invoiceIds': invoiceIds,
        'bankId': bankId,
        'phoneNo': countryCode! + _phoneNumberController!.text,
      };
    }
    logger.d("_makePayment ${jsonEncode(payloadObject)}");

    if (originInvoice?.toLowerCase() == "hodi") {
      await Provider.of<AuthenticatedAppProviders>(context, listen: false)
          .makePaymentEstateInvoice(payloadObject)
          .then((value) {
        if (value != null) {
          if (value.isSuccess) {
            Provider.of<PaymentViewModel>(context, listen: false).onPaymentSuccessful();
            showCustomSnackBar(value.message, isError: false, isToast: true);
            Navigator.pop(context);
          } else {
            showCustomSnackBar(value.message);
          }
        } else {
          showCustomSnackBar("An error occurred");
        }
      });
    } else {
      await Provider.of<AuthenticatedAppProviders>(context, listen: false)
          .makePayment(payloadObject)
          .then((value) {
        if (value != null) {
          if (value.isSuccess) {
            Provider.of<PaymentViewModel>(context, listen: false).onPaymentSuccessful();
            showCustomSnackBar(value.message, isError: false, isToast: true);
            Navigator.pop(context);
          } else {
            showCustomSnackBar(value.message);
          }
        } else {
          showCustomSnackBar("An error occurred");
        }
      });
    }
  }

  Future<void> _validateSlip(BuildContext context) async {
    if (_slipRefController!.text.isEmptyOrNull) {
      showCustomSnackBar('Slip REF No is required');
      return;
    }

    String slipRef = _slipRefController!.text;

    await Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .validateSlip(slipRef)
        .then((value) {
      if (value != null) {
        if (value.status == "00") {
          setState(() {
            _isBankDepositValidated = true;
            _isSlipValidated = false;
            _isShowValidateOption = false;
          });
          showCustomSnackBar(value.message, isError: false, isToast: true);
        } else {
          setState(() {
            _isBankDepositValidated = false;
            _isSlipValidated = false;
            _isShowValidateOption = true;
          });
          showCustomSnackBar(value.message);
        }
      } else {
        setState(() {
          _isBankDepositValidated = false;
          _isSlipValidated = false;
          _isShowValidateOption = true;
        });
        showCustomSnackBar("An error occurred");
      }
    });
  }
}
