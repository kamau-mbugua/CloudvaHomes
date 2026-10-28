class LoginResponse {
  final String status;
  final String message;
  final LoginData data;

  LoginResponse({
    required this.status,
    required this.message,
    required this.data,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    return LoginResponse(
      status: json['status'],
      message: json['message'],
      data: LoginData.fromJson(json['data']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'status': status,
      'message': message,
      'data': data.toJson(),
    };
  }
}

class LoginData {
  final TokenDetails tokenDetails;
  final UserDetails userDetails;

  LoginData({
    required this.tokenDetails,
    required this.userDetails,
  });

  factory LoginData.fromJson(Map<String, dynamic> json) {
    return LoginData(
      tokenDetails: TokenDetails.fromJson(json['tokenDetails']),
      userDetails: UserDetails.fromJson(json['userDetails']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'tokenDetails': tokenDetails.toJson(),
      'userDetails': userDetails.toJson(),
    };
  }
}

class TokenDetails {
  final String expiry;
  final String accessToken;

  TokenDetails({
    required this.expiry,
    required this.accessToken,
  });

  factory TokenDetails.fromJson(Map<String, dynamic> json) {
    return TokenDetails(
      expiry: json['expiry'],
      accessToken: json['accessToken'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'expiry': expiry,
      'accessToken': accessToken,
    };
  }
}

class UserDetails {
  final String name;
  final String estate;
  final String estateId;
  final String usertype;
  final String id;
  final List<AuthorityData> authorities;
  final String username;

  UserDetails({
    required this.name,
    required this.estate,
    required this.estateId,
    required this.usertype,
    required this.id,
    required this.authorities,
    required this.username,
  });

  factory UserDetails.fromJson(Map<String, dynamic> json) {
    var authoritiesFromJson = json['authorities'] as List;
    List<AuthorityData> authoritiesList = authoritiesFromJson.map((i) => AuthorityData.fromJson(i)).toList();

    return UserDetails(
      name: json['name'],
      estate: json['estate'],
      estateId: json['estateId'] ?? '',
      usertype: json['usertype'],
      id: json['id'],
      authorities: authoritiesList,
      username: json['username'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'estate': estate,
      'estateId': estateId,
      'usertype': usertype,
      'id': id,
      'authorities': authorities.map((e) => e.toJson()).toList(),
      'username': username,
    };
  }
}

class AuthorityData {
  final String authority;

  AuthorityData({
    required this.authority,
  });

  factory AuthorityData.fromJson(Map<String, dynamic> json) {
    return AuthorityData(
      authority: json['authority'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'authority': authority,
    };
  }
}