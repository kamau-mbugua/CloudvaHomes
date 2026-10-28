import 'package:flutter/material.dart';
import 'package:hodi_app/main.dart';
import 'package:hodi_app/networking/base/api_response.dart';
import 'package:hodi_app/networking/base/error_response.dart';
import 'package:hodi_app/route/routes.dart';
import 'package:hodi_app/widgets/base/custom_snackbar.dart';
import 'package:provider/provider.dart';

import '../../flavorizr/templates/main.dart';
import '../../providers/splash_provider.dart';

class ApiChecker {
  static void checkApi(ApiResponse apiResponse) {
    ErrorResponse error = getError(apiResponse);
//config-missing
    if( error.errors![0].code == '401' || error.errors![0].code == 'auth-001'
        && ModalRoute.of(Get.context!)?.settings.name != AppRoutes.getLoginPageRoute()) {
      Provider.of<SplashProvider>(Get.context!, listen: false).removeSharedData();

      if( ModalRoute.of(Get.context!)!.settings.name != AppRoutes.getLoginPageRoute()) {
        Navigator.pushNamedAndRemoveUntil(Get.context!, AppRoutes.getLoginPageRoute(), (route) => false);
      }
    }else {
      showCustomSnackBar(error.errors![0].message);
    }
  }

  static ErrorResponse getError(ApiResponse apiResponse){
    ErrorResponse error;

    try{
      error = ErrorResponse.fromJson(apiResponse);
    }catch(e){
      if(apiResponse.error is String){
        error = ErrorResponse(errors: [Errors(code: '', message: apiResponse.error.toString())]);

      }else{
        error = ErrorResponse.fromJson(apiResponse.error);
      }
    }
    return error;
  }
}