import 'dart:async';

import 'package:flutter/material.dart';
import 'package:hodi_app/logger.dart';
import 'package:hodi_app/models/response/response_model.dart';
import 'package:provider/provider.dart';

import '../main.dart';
import '../models/data/authentication/login_response.dart';
import '../models/data/estate_invoices/check_status.dart';
import '../networking/base/api_checker.dart';
import '../networking/base/api_response.dart';
import '../repository/auth_repo.dart';
import '../services/invoice_service.dart';
import '../utils/helpers.dart';

class AuthProvider with ChangeNotifier {
  final AuthRepo? authRepo;

  AuthProvider({required this.authRepo});

  // for registration section
  bool _isLoading = false;

  bool get isLoading => _isLoading;
  String? _registrationErrorMessage = '';

  String? get registrationErrorMessage => _registrationErrorMessage;

  Timer? _timer;
  int? currentTime;

  updateRegistrationErrorMessage(String message) {
    _registrationErrorMessage = message;
    notifyListeners();
  }

  bool isLoggedIn() {
    return authRepo!.isLoggedIn();
  }

  String getUserToken() {
    return authRepo!.getUserToken();
  }

  LoginResponse? getLoginResponse() {
    return authRepo!.getLoginResponse();
  }

  Future<bool> clearSharedData(BuildContext context) async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    _isLoading = true;
    notifyListeners();
    bool isSuccess = await authRepo!.clearSharedData();
    _isLoading = false;
    notifyListeners();
    return isSuccess;
  }

  //do registration

// for login section
  String? _loginErrorMessage = '';

  String? get loginErrorMessage => _loginErrorMessage;

  String? _forgetPassordErrorMessage = '';

  String? get forgetPassordErrorMessage => _forgetPassordErrorMessage;
  MyHelpers helpers = MyHelpers();

  // for login section
// for login section
  Future<ResponseModel> login({required String username, required String password}) async {
    _isLoading = true;
    _loginErrorMessage = '';
    notifyListeners();
    ApiResponse apiResponse = await authRepo!.login(username: username, password: password);
    ResponseModel responseModel;
    if (apiResponse.response != null && apiResponse.response!.statusCode == 200) {
      Map map = apiResponse.response!.data;
      if (map["status"] == "00") {
        String accessToken = map["data"]["tokenDetails"]["accessToken"];
        LoginResponse loginResponse = LoginResponse.fromJson(castMap(map));
        await authRepo!.saveUserToken(accessToken);
        await authRepo!.saveLoginResponse(loginResponse);
        responseModel = ResponseModel(true, 'successful');
      } else {
        _loginErrorMessage = map["message"];
        responseModel = ResponseModel(false, _loginErrorMessage);
      }
    } else {
      _loginErrorMessage = ApiChecker.getError(apiResponse).errors![0].message;
      responseModel = ResponseModel(false, _loginErrorMessage);
    }
    _isLoading = false;
    notifyListeners();
    return responseModel;
  }



  Future<ResponseModel> forgetPassword({required String username}) async {
    _isLoading = true;
    _forgetPassordErrorMessage = '';
    notifyListeners();
    ApiResponse apiResponse = await authRepo!.forgetPassword(username: username);
    ResponseModel responseModel;
    if (apiResponse.response != null && apiResponse.response!.statusCode == 200) {
      Map map = apiResponse.response!.data;
      if (map["status"] == "00") {
        responseModel = ResponseModel(true, 'successful');
      } else {
        _forgetPassordErrorMessage = map["message"];
        responseModel = ResponseModel(false, _loginErrorMessage);
      }
    } else {
      _forgetPassordErrorMessage = ApiChecker.getError(apiResponse).errors![0].message;
      responseModel = ResponseModel(false, _loginErrorMessage);
    }
    _isLoading = false;
    notifyListeners();
    return responseModel;
  }

// for forgot password
  bool _isForgotPasswordLoading = false;

  bool get isForgotPasswordLoading => _isForgotPasswordLoading;

//do forgot password

  Map<String, dynamic> castMap(Map<dynamic, dynamic> map) {
    return map.map((key, value) => MapEntry(key as String, value));
  }
}
