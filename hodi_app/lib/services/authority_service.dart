import 'package:flutter/material.dart';
import 'package:hodi_app/logger.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../models/data/authentication/login_response.dart';

class AuthorityService {
  static final AuthorityService _instance = AuthorityService._internal();
  List<AuthorityData>? _authorities = [];
  bool _isUserLogedIn = false;

  factory AuthorityService() {
    return _instance;
  }

  AuthorityService._internal();

  Future<void> loadAuthorities(BuildContext context) async {
    final loginResponse = await Provider.of<AuthProvider>(context, listen: false).getLoginResponse();
    final authorities = loginResponse?.data.userDetails.authorities;
    final isUserLogedIn = Provider.of<AuthProvider>(context, listen: false).isLoggedIn();
    _authorities = authorities;
    _isUserLogedIn = isUserLogedIn;

    logger.i('AuthorityService Authorities: ${_authorities} and isUserLogedIn: $_isUserLogedIn');
  }

  bool hasAuthority(String authority) {


    if (!_isUserLogedIn) {
      logger.i('AuthorityService User not logged in');
      return false;
    }
    logger.i('AuthorityService CheckingAuthority: $authority');

    var isRole = _authorities?.any((element) => element.authority == authority) ?? false;
    logger.i('AuthorityService HasAuthority: $isRole for $authority');
    return isRole;
  }
}