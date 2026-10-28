import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../route/routes.dart';
import '../../services/authority_service.dart';
import '../../utils/color_resources.dart';
import '../../utils/dimensions.dart';
import '../../utils/images.dart';
import '../../utils/styles.dart';
import '../../widgets/base/custom_button.dart';
import '../../widgets/base/custom_snackbar.dart';
import '../../widgets/base/custom_text_field.dart';

class LoginScreen extends StatefulWidget {
  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final FocusNode _emailNumberFocus = FocusNode();
  final FocusNode _passwordFocus = FocusNode();
  TextEditingController? _emailController;
  TextEditingController? _passwordController;
  GlobalKey<FormState>? _formKeyLogin;
  String? countryCode;

  @override
  void initState() {
    _formKeyLogin = GlobalKey<FormState>();
    _emailController = TextEditingController();
    _passwordController = TextEditingController();

    super.initState();
  }

  @override
  void dispose() {
    _emailController!.dispose();
    _passwordController!.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.of(context).size.width;
    return Scaffold(
      body: SafeArea(
        child: Stack(
          fit: StackFit.expand,
            children: [
          Positioned.fill(
            child: Container(
              height: double.infinity,
              width: double.infinity,
              constraints: BoxConstraints.expand(height: MediaQuery.of(context).size.height),
              child: Image.asset(
                Images.backgroundPng,
                fit: BoxFit.fill, // Adjusts to fill the height while preserving aspect ratio
              ),
            ),

          ),
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
                                      "Login to your account",
                                      style: poppinsRegular.copyWith(
                                          fontSize:
                                              Dimensions.fontSizeOverLarge,
                                          color:
                                              ColorResources.getGreyBunkerColor(
                                                  context)),
                                    ),
                                    const SizedBox(height: 20),
                                    Text(
                                      "A convenient way to streamline your property management efforts.",
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
                                "User name",
                                style: poppinsRegular.copyWith(
                                    fontSize: Dimensions.fontSizeDefault,
                                    color:
                                        ColorResources.getHintColor(context)),
                              ),
                              const SizedBox(
                                  height: Dimensions.paddingSizeSmall),
                              CustomTextField(
                                hintText: "Enter your username",
                                isShowBorder: true,
                                focusNode: _emailNumberFocus,
                                nextFocus: _passwordFocus,
                                controller: _emailController,
                                inputType: TextInputType.emailAddress,
                              ),
                              const SizedBox(
                                  height: Dimensions.paddingSizeLarge),
                              Text(
                                "Password",
                                style: poppinsRegular.copyWith(
                                    fontSize: Dimensions.fontSizeDefault,
                                    color:
                                        ColorResources.getHintColor(context)),
                              ),
                              const SizedBox(
                                  height: Dimensions.paddingSizeSmall),
                              CustomTextField(
                                hintText: "Enter your password",
                                isShowBorder: true,
                                isPassword: true,
                                isShowSuffixIcon: true,
                                focusNode: _passwordFocus,
                                controller: _passwordController,
                                inputAction: TextInputAction.done,
                              ),
                              const SizedBox(height: 22),

                              // for remember me section
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  InkWell(
                                    onTap: () {
                                      Navigator.pushNamed(
                                          context,
                                          AppRoutes
                                              .getForgetPasswordPageRoute());
                                    },
                                    child: Padding(
                                      padding: const EdgeInsets.all(8.0),
                                      child: Text(
                                        "Forgot Password?",
                                        style: poppinsRegular.copyWith(
                                            fontSize: Dimensions.fontSizeSmall,
                                            color: ColorResources.getHintColor(
                                                context)),
                                      ),
                                    ),
                                  )
                                ],
                              ),

                              const SizedBox(height: 22),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  authProvider.loginErrorMessage!.isNotEmpty
                                      ? CircleAvatar(
                                          backgroundColor:
                                              Theme.of(context).primaryColor,
                                          radius: 5)
                                      : const SizedBox.shrink(),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      authProvider.loginErrorMessage ?? "",
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
                                      btnTxt: "Login",
                                      backgroundColor:
                                          Theme.of(context).primaryColorDark,
                                      onTap: () async {
                                        String email =
                                            _emailController!.text.trim();

                                        String password =
                                            _passwordController!.text.trim();
                                        if (_emailController!.text.isEmpty) {
                                          showCustomSnackBar(
                                              "Enter your username");
                                        } else if (password.isEmpty) {
                                          showCustomSnackBar(
                                              "Enter your password");
                                        } else if (password.length < 6) {
                                          showCustomSnackBar(
                                              "Password must be 6 characters");
                                        } else {
                                          authProvider.login(username:email, password:password).then((status) async {
                                            if (status.isSuccess) {
                                              await AuthorityService().loadAuthorities(context);
                                              Navigator.pushNamedAndRemoveUntil(context, AppRoutes.getHomePageRoute(), (route) => false);
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
