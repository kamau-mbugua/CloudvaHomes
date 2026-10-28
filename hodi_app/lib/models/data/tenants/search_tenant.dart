class TenantSearchUserDataResponse {
  final String status;
  final String message;
  final TenantSearchUserDetails data;

  TenantSearchUserDataResponse({
    required this.status,
    required this.message,
    required this.data,
  });

  factory TenantSearchUserDataResponse.fromJson(Map<String, dynamic> json) {
    return TenantSearchUserDataResponse(
      status: json['status'] ?? "",
      message: json['message'] ?? "",
      data: TenantSearchUserDetails.fromJson(json['data'] ?? {}),
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

class TenantSearchUserDetails {
  final String email;
  final String lastName;
  final String idNo;
  final String firstName;
  final String phone;
  final int id;

  TenantSearchUserDetails({
    required this.email,
    required this.lastName,
    required this.idNo,
    required this.firstName,
    required this.phone,
    required this.id,
  });

  factory TenantSearchUserDetails.fromJson(Map<String, dynamic> json) {
    return TenantSearchUserDetails(
      email: json['email'] ?? "",
      lastName: json['lastName'] ?? "",
      idNo: json['idNo'] ?? "",
      firstName: json['firstName'] ?? "",
      phone: json['phone'] ?? "",
      id: json['id'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'email': email,
      'lastName': lastName,
      'idNo': idNo,
      'firstName': firstName,
      'phone': phone,
      'id': id,
    };
  }
}