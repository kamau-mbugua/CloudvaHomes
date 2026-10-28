import 'package:flutter/material.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../route/routes.dart';
import '../../utils/color_resources.dart';
import '../../utils/dimensions.dart';
import '../../utils/images.dart';
import '../../utils/styles.dart';
import '../../widgets/base/custom_button.dart';
import '../../widgets/base/custom_snackbar.dart';
import '../../widgets/base/custom_text_field.dart';

class ForgetPasswordScreen extends StatefulWidget {
  @override
  _ForgetPasswordScreenState createState() => _ForgetPasswordScreenState();
}

class _ForgetPasswordScreenState extends State<ForgetPasswordScreen> {
  final FocusNode _emailNumberFocus = FocusNode();
  TextEditingController? _emailController;
  GlobalKey<FormState>? _formKeyLogin;

  @override
  void initState() {
    _formKeyLogin = GlobalKey<FormState>();
    _emailController = TextEditingController();

    super.initState();
  }

  @override
  void dispose() {
    _emailController!.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.of(context).size.width;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Forget Password',
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
      body: SafeArea(
        child: Stack(
            fit: StackFit.expand,
            children: [
              // Content
              SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(Dimensions.paddingSizeLarge),
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
                          child: Consumer<AuthProvider>(
                            builder: (context, authProvider, child) => Form(
                              key: _formKeyLogin,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Padding(
                                    padding: const EdgeInsets.all(15.0),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Image.asset(
                                          Images.logo,
                                          height: 75,
                                          fit: BoxFit.scaleDown,
                                          matchTextDirection: true,
                                        ),
                                        const SizedBox(height: 20),
                                        Text(
                                          "Forgot Password?",
                                          style: poppinsRegular.copyWith(
                                              fontSize:
                                              Dimensions.fontSizeOverLarge,
                                              color:
                                              ColorResources.getGreyBunkerColor(
                                                  context)),
                                        ),
                                        const SizedBox(height: 20),
                                        Text(
                                          "Enter your email address to reset your password",
                                          style: poppinsRegular.copyWith(
                                              fontSize: Dimensions.fontSizeDefault,
                                              color:
                                              ColorResources.getGreyBunkerColor(
                                                  context)),
                                        )
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 35),
                                  Text(
                                    "Email",
                                    style: poppinsRegular.copyWith(
                                        fontSize: Dimensions.fontSizeDefault,
                                        color:
                                        ColorResources.getHintColor(context)),
                                  ),
                                  const SizedBox(
                                      height: Dimensions.paddingSizeSmall),
                                  CustomTextField(
                                    hintText: "Enter your email",
                                    isShowBorder: true,
                                    focusNode: _emailNumberFocus,
                                    controller: _emailController,
                                    inputType: TextInputType.emailAddress,
                                  ),
                                  const SizedBox(
                                      height: Dimensions.paddingSizeLarge),
                                  Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      authProvider.forgetPassordErrorMessage!.isNotEmpty
                                          ? CircleAvatar(
                                          backgroundColor:
                                          Theme.of(context).primaryColor,
                                          radius: 5)
                                          : const SizedBox.shrink(),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          authProvider.forgetPassordErrorMessage ?? "",
                                          style: Theme.of(context)
                                              .textTheme
                                              .displayMedium!
                                              .copyWith(
                                            fontSize: Dimensions.fontSizeSmall,
                                            color:
                                            Theme.of(context).primaryColor,
                                          ),
                                        ),
                                      )
                                    ],
                                  ),

                                  // for login button
                                  const SizedBox(height: 10),
                                  !authProvider.isLoading
                                      ? CustomButton(
                                    btnTxt: "Forget Password",
                                    backgroundColor:
                                    Theme.of(context).primaryColorDark,
                                    onTap: () async {
                                      String email =
                                      _emailController!.text.trim();

                                      if (_emailController!.text.isEmpty) {
                                        showCustomSnackBar(
                                            "Enter your Email Address");
                                      }else {
                                        authProvider.forgetPassword(username:email).then((status) async {
                                          if (status.isSuccess) {
                                            showCustomSnackBar(status.message, isError: false);
                                            finish(context);
                                          }else{
                                            // showCustomSnackBar(status.message);
                                          }
                                        });
                                      }
                                    },
                                  )
                                      : Center(
                                      child: CircularProgressIndicator(
                                        valueColor: AlwaysStoppedAnimation<Color>(
                                            Theme.of(context).primaryColor),
                                      )),

                                  // for create an account
                                  const SizedBox(height: 20),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ]),
      ),
    );
  }
}
