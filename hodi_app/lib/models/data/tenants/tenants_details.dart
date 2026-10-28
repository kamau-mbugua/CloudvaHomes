class TenantsDetailsResponse {
  final String status;
  final String message;
  final TenantsDetailsData data;

  TenantsDetailsResponse({
    required this.status,
    required this.message,
    required this.data,
  });

  factory TenantsDetailsResponse.fromJson(Map<String, dynamic> json) {
    return TenantsDetailsResponse(
      status: json['status'],
      message: json['message'],
      data: TenantsDetailsData.fromJson(json['data']),
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

class TenantsDetailsData {
  final String phone;
  final String name;
  final bool self;
  final String userId;
  final TenantsDetailsDataContent content;
  final String email;

  TenantsDetailsData({
    required this.phone,
    required this.name,
    required this.self,
    required this.userId,
    required this.content,
    required this.email,
  });

  factory TenantsDetailsData.fromJson(Map<String, dynamic> json) {
    return TenantsDetailsData(
      phone: json['phone'],
      name: json['name'],
      self: json['self'],
      userId: json['userId'],
      content: TenantsDetailsDataContent.fromJson(json['content']),
      email: json['email'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'phone': phone,
      'name': name,
      'self': self,
      'userId': userId,
      'content': content.toJson(),
      'email': email,
    };
  }
}

class TenantsDetailsDataContent {
  final double totalPayment;
  final double totalArrears;
  final int occupiedUnits;
  final double totalRent;

  TenantsDetailsDataContent({
    required this.totalPayment,
    required this.totalArrears,
    required this.occupiedUnits,
    required this.totalRent,
  });

  factory TenantsDetailsDataContent.fromJson(Map<String, dynamic> json) {
    return TenantsDetailsDataContent(
      totalPayment: json['totalPayment'],
      totalArrears: json['totalArrears'],
      occupiedUnits: json['occupiedUnits'],
      totalRent: json['totalRent'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'totalPayment': totalPayment,
      'totalArrears': totalArrears,
      'occupiedUnits': occupiedUnits,
      'totalRent': totalRent,
    };
  }
}