import 'package:country_code_picker/country_code_picker.dart';
import 'package:email_validator/email_validator.dart';
import 'package:flutter/material.dart';
import 'package:hodi_app/logger.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../models/data/user_group/all_user_group.dart';
import '../../../providers/authenticated_app_providers.dart';
import '../../../utils/color_resources.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';
import '../../../widgets/base/code_picker_widget.dart';
import '../../../widgets/base/custom_button.dart';
import '../../../widgets/base/custom_snackbar.dart';
import '../../../widgets/base/custom_text_field.dart';

class AddUsers extends StatefulWidget {
  final Function(bool) isUserAdded;
  const AddUsers({super.key, required this.isUserAdded});

  @override
  _AddUsersState createState() => _AddUsersState();
}

class _AddUsersState extends State<AddUsers> {
  final FocusNode _firstNameFocus = FocusNode();
  final FocusNode _lastnameFocus = FocusNode();
  final FocusNode _usernameFocus = FocusNode();
  final FocusNode _idNumberFocus = FocusNode();
  final FocusNode _emailFocus = FocusNode();
  final FocusNode _phoneNumberFocus = FocusNode();
  String? countryCode;

  TextEditingController? _firstNameController;
  TextEditingController? _lastNameController;
  TextEditingController? _userNameController;
  TextEditingController? _idNumberController;
  TextEditingController? _emailController;
  TextEditingController? _phoneNumberController;
  GlobalKey<FormState>? _formKeyAddMeter;

  int? selectedUserGroupId;
  int? selectedEstateId;
  List<AllUserGroup> utilityBill = [];

  void getAllUserGroups() async {
    List<AllUserGroup> fetchedUtilityBill =
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getAllUserGroups();

    final uniqueUtilityBill = fetchedUtilityBill.toSet().toList();

    setState(() {
      utilityBill = uniqueUtilityBill;
    });
  }

  @override
  void initState() {
    _firstNameController = TextEditingController();
    _lastNameController = TextEditingController();
    _userNameController = TextEditingController();
    _idNumberController = TextEditingController();
    _emailController = TextEditingController();
    _phoneNumberController = TextEditingController();
    Future.microtask(() => getAllUserGroups());
    super.initState();
  }

  @override
  void dispose() {
    _firstNameController!.dispose();
    _lastNameController!.dispose();
    _userNameController!.dispose();
    _idNumberController!.dispose();
    _emailController!.dispose();
    _phoneNumberController!.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.of(context).size.width;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Add User',
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
      body: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Center(
          child: Container(
            width: width > 700 ? 700 : width,
            padding: width > 700
                ? const EdgeInsets.all(Dimensions.paddingSizeDefault)
                : null,
            decoration: width > 700
                ? BoxDecoration(
                    color: Theme.of(context).canvasColor,
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: [
                      BoxShadow(
                          color: Theme.of(context).shadowColor,
                          blurRadius: 5,
                          spreadRadius: 1)
                    ],
                  )
                : null,
            child: Consumer<AuthenticatedAppProviders>(
              builder: (context, authProvider, child) => Form(
                key: _formKeyAddMeter,
                child: authProvider.isLoading
                    ? const Center(
                        child: CircularProgressIndicator(),
                      )
                    : Column(
                        mainAxisSize: MainAxisSize.min,
                        mainAxisAlignment: MainAxisAlignment.start,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Select User Group',
                            style: poppinsBold.copyWith(
                              fontSize: Dimensions.fontSizeLarge,
                              color: ColorResources.colorNero,
                            ),
                          ),
                          utilityBill.isEmpty
                              ? Padding(
                                  padding: const EdgeInsets.all(16.0),
                                  child: Center(
                                    child: Text(
                                      'You have no user group , please create one',
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
                                        utilityBill.length, (int index) {
                                      return ChoiceChip(
                                        label: Text(utilityBill[index].name),
                                        selected: selectedUserGroupId == index,
                                        onSelected: (bool selected) {
                                          setState(() {
                                            logger.d('selected ${utilityBill[index].toJson()}');

                                            selectedUserGroupId = utilityBill[index].id;
                                            selectedEstateId =
                                                utilityBill[index].estateId;
                                          });
                                        },
                                      );
                                    }).toList(),
                                  ),
                                ),
                          Text(
                            'First Name',
                            style: poppinsBold.copyWith(
                              fontSize: Dimensions.fontSizeLarge,
                              color: ColorResources.colorNero,
                            ),
                          ).paddingOnly(top: 16, bottom: 5),
                          CustomTextField(
                            hintText: "First Name",
                            isShowBorder: true,
                            focusNode: _firstNameFocus,
                            nextFocus: _lastnameFocus,
                            controller: _firstNameController,
                            inputType: TextInputType.name,
                            isShowSuffixIcon: false,
                            isIcon: false,
                            fillColor: Theme.of(context).hoverColor,
                          ).paddingBottom(16),
                          Text(
                            'Last Name',
                            style: poppinsBold.copyWith(
                              fontSize: Dimensions.fontSizeLarge,
                              color: ColorResources.colorNero,
                            ),
                          ).paddingBottom(5),
                          CustomTextField(
                            hintText: "Last Name",
                            isShowBorder: true,
                            focusNode: _lastnameFocus,
                            nextFocus: _usernameFocus,
                            controller: _lastNameController,
                            inputType: TextInputType.name,
                            isShowSuffixIcon: false,
                            isIcon: false,
                            fillColor: Theme.of(context).hoverColor,
                          ).paddingBottom(16),
                          Text(
                            'User Name',
                            style: poppinsBold.copyWith(
                              fontSize: Dimensions.fontSizeLarge,
                              color: ColorResources.colorNero,
                            ),
                          ).paddingBottom(5),
                          CustomTextField(
                            hintText: "User Name",
                            isShowBorder: true,
                            focusNode: _usernameFocus,
                            nextFocus: _idNumberFocus,
                            controller: _userNameController,
                            inputType: TextInputType.name,
                            isShowSuffixIcon: false,
                            isIcon: false,
                            fillColor: Theme.of(context).hoverColor,
                          ).paddingBottom(16),
                          Text(
                            'Id Number',
                            style: poppinsBold.copyWith(
                              fontSize: Dimensions.fontSizeLarge,
                              color: ColorResources.colorNero,
                            ),
                          ).paddingBottom(5),
                          CustomTextField(
                            hintText: "Id Number",
                            isShowBorder: true,
                            focusNode: _idNumberFocus,
                            nextFocus: _emailFocus,
                            controller: _idNumberController,
                            inputType: TextInputType.number,
                            isShowSuffixIcon: false,
                            isIcon: false,
                            fillColor: Theme.of(context).hoverColor,
                          ).paddingBottom(16),
                          Text(
                            'Email',
                            style: poppinsBold.copyWith(
                              fontSize: Dimensions.fontSizeLarge,
                              color: ColorResources.colorNero,
                            ),
                          ).paddingBottom(5),
                          CustomTextField(
                            hintText: "Email",
                            isShowBorder: true,
                            focusNode: _emailFocus,
                            nextFocus: _phoneNumberFocus,
                            controller: _emailController,
                            inputType: TextInputType.emailAddress,
                            isShowSuffixIcon: false,
                            isIcon: false,
                            fillColor: Theme.of(context).hoverColor,
                          ).paddingBottom(16),
                          Text(
                            'Phone Number',
                            style: poppinsBold.copyWith(
                              fontSize: Dimensions.fontSizeLarge,
                              color: ColorResources.colorNero,
                            ),
                          ).paddingBottom(5),
                          Row(children: [
                            CodePickerWidget(
                              onChanged: (CountryCode value) {
                                countryCode = value.code;
                              },
                              initialSelection: countryCode,
                              favorite: [countryCode ?? ''],
                              showDropDownButton: true,
                              padding: EdgeInsets.zero,
                              showFlagMain: true,
                              countryFilter: const [
                                'KE',
                                'UG',
                                'TZ',
                                'RW',
                                'SS',
                                'KE'
                              ],
                              textStyle: TextStyle(
                                  color: Theme.of(context)
                                      .textTheme
                                      .displayLarge!
                                      .color),
                            ),
                            Expanded(
                                child:CustomTextField(
                                  hintText: "7xxxxxxxx",
                                  isShowBorder: true,
                                  focusNode: _phoneNumberFocus,
                                  controller: _phoneNumberController,
                                  inputType: TextInputType.phone,
                                  isShowSuffixIcon: false,
                                  isIcon: false,
                                  fillColor: Theme.of(context).hoverColor,
                                )),
                          ]).paddingBottom(16),
                          CustomButton(
                            btnTxt: "Add User",
                            backgroundColor: Theme.of(context).primaryColorDark,
                            onTap: () async {
                              var firstName = _firstNameController?.text ?? '';
                              var lastName = _lastNameController?.text ?? '';
                              var userName = _userNameController?.text ?? '';
                              var idNumber = _idNumberController?.text ?? '';
                              var email = _emailController?.text ?? '';
                              var phoneNumber = _phoneNumberController?.text ?? '';

                              if (selectedUserGroupId == null) {
                                showCustomSnackBar(
                                    'Please select a user group');
                              } else if (firstName.isEmpty) {
                                showCustomSnackBar('First Name is required');
                              } else if (lastName.isEmpty) {
                                showCustomSnackBar('Last Name is required');
                              } else if (userName.isEmpty) {
                                showCustomSnackBar('User Name is required');
                              } else if (idNumber.isEmpty) {
                                showCustomSnackBar('Id Number is required');
                              } else if (email.isEmpty) {
                                showCustomSnackBar('Email is required');
                              } else if (!EmailValidator.validate(email)) {
                                showCustomSnackBar(
                                    'Please enter a valid email address');
                              } else if (phoneNumber.isEmpty) {
                                showCustomSnackBar('Phone Number is required');
                              } else if (!RegExp(r'^\d{9,10}$')
                                  .hasMatch(phoneNumber)) {
                                showCustomSnackBar(
                                    'Please enter a valid phone number');
                              } else {
                                var newPhoneNumber =
                                    '+254${phoneNumber.replaceFirst(RegExp(r'^0'), '')}';

                                await authProvider
                                    .addUser(
                                        firstName: firstName,
                                        lastName: lastName,
                                        username: userName,
                                        idNo: idNumber,
                                        email: email,
                                        phone: newPhoneNumber,
                                        estateId: selectedEstateId!,
                                        userGroupId: selectedUserGroupId!)
                                    .then((value) {
                                  if (value.isSuccess) {
                                    showCustomSnackBar(
                                        'User added successfully',
                                        isError: false);
                                    Navigator.pop(context);
                                    widget.isUserAdded(true);
                                  } else {
                                    showCustomSnackBar(value.message!);
                                  }
                                });
                              }
                            },
                          )
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
