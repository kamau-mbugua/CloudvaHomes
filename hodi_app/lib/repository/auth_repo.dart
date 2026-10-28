
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:hodi_app/utils/helpers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/data/authentication/login_response.dart';
import '../networking/base/api_response.dart';
import '../networking/datasource/remote/dio/dio_client.dart';
import '../networking/datasource/remote/exception/api_error_handler.dart';
import '../utils/app_constants.dart';

class AuthRepo {
  final DioClient? dioClient;
  final SharedPreferences? sharedPreferences;

  AuthRepo({required this.dioClient, required this.sharedPreferences});

  MyHelpers helpers = MyHelpers();

  //login

  Future<ApiResponse> login({String? username, String? password}) async {
    try {
      Response response = await dioClient!.post(
        AppConstants.loginUri,
        data: {"username": username, "password": password},
      );
      //log response
      print("loginResponse: $response");

      return ApiResponse.withSuccess(response);
    } catch (e) {
      print("loginResponseAuthRepo: ${e.toString()}");
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }


  Future<ApiResponse> forgetPassword({String? username}) async {
    try {
      Response response = await dioClient!.post(
        AppConstants.forgetPasswordUrlUri,
        data: {"email": username},
      );
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  // for  user token
  Future<void> saveUserToken(String token) async {
    dioClient!.updateHeader(getToken: token);

    try {
      await sharedPreferences!.setString(AppConstants.token, token);
    } catch (e) {
      rethrow;
    }
  }

  Future<void> saveLoginResponse(LoginResponse loginResponse) async {
    String loginResponseJson = jsonEncode(loginResponse.toJson());
    await sharedPreferences!.setString(AppConstants.loginResponse, loginResponseJson);
  }

  LoginResponse? getLoginResponse() {
    String? loginResponseJson = sharedPreferences!.getString(AppConstants.loginResponse);
    if (loginResponseJson != null) {
      Map<String, dynamic> loginResponseMap = jsonDecode(loginResponseJson);
      return LoginResponse.fromJson(loginResponseMap);
    }
    return null;
  }

  String getUserToken() {
    return sharedPreferences!.getString(AppConstants.token) ?? "";
  }

  bool isLoggedIn() {
    return sharedPreferences!.containsKey(AppConstants.token);
    // return true;
  }


  Future<bool> clearSharedData() async {
    await sharedPreferences!.remove(AppConstants.token);
    await sharedPreferences!.remove(AppConstants.loginResponse);
    // After removing the token, update the header to clear out the token value.
    dioClient!.updateHeader(getToken: '');
    return true;
  }
}