class PaymentTypeListResponse {
  final String status;
  final String message;
  final List<PaymentTypeListData> data;

  PaymentTypeListResponse({
    required this.status,
    required this.message,
    required this.data,
  });

  factory PaymentTypeListResponse.fromJson(Map<String, dynamic> json) {
    return PaymentTypeListResponse(
      status: json['status'],
      message: json['message'],
      data: List<PaymentTypeListData>.from(
        json['data'].map((item) => PaymentTypeListData.fromJson(item)),
      ),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'status': status,
      'message': message,
      'data': data.map((item) => item.toJson()).toList(),
    };
  }
}

class PaymentTypeListData {
  final String bankId;
  final String name;
  final String icon;
  final String bankName;
  final String typeId;

  PaymentTypeListData({
    required this.bankId,
    required this.name,
    required this.icon,
    required this.bankName,
    required this.typeId,
  });

  factory PaymentTypeListData.fromJson(Map<String, dynamic> json) {
    return PaymentTypeListData(
      bankId: json['bankId'] ?? '',
      name: json['name'] ?? '',
      icon: json['icon'] ?? '',
      bankName: json['bankName'] ?? '',
      typeId: json['typeId'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'bankId': bankId,
      'name': name,
      'icon': icon,
      'bankName': bankName,
      'typeId': typeId,
    };
  }
}