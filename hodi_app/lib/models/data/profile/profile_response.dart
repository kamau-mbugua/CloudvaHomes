class UserProfileResponse {
  final String lastName;
  final String firstName;
  final String? photoUrl;
  final String passwordExpiry;
  final String phone;
  final String estate;
  final String usertype;
  final String fullNames;
  final int id;
  final String userGroup;
  final String email;

  UserProfileResponse({
    required this.lastName,
    required this.firstName,
    this.photoUrl,
    required this.passwordExpiry,
    required this.phone,
    required this.estate,
    required this.usertype,
    required this.fullNames,
    required this.id,
    required this.userGroup,
    required this.email,
  });

  factory UserProfileResponse.fromJson(Map<String, dynamic> json) {
    return UserProfileResponse(
      lastName: json['lastName'],
      firstName: json['firstName'],
      photoUrl: json['photoUrl'],
      passwordExpiry: json['passwordExpiry'],
      phone: json['phone'],
      estate: json['estate'],
      usertype: json['usertype'],
      fullNames: json['fullNames'],
      id: json['id'],
      userGroup: json['userGroup'],
      email: json['email'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'lastName': lastName,
      'firstName': firstName,
      'photoUrl': photoUrl,
      'passwordExpiry': passwordExpiry,
      'phone': phone,
      'estate': estate,
      'usertype': usertype,
      'fullNames': fullNames,
      'id': id,
      'userGroup': userGroup,
      'email': email,
    };
  }
}