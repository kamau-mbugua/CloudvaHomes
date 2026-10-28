class PaymentTypeResponse {
  final String status;
  final String message;
  final PaymentTypeData data;

  PaymentTypeResponse({
    required this.status,
    required this.message,
    required this.data,
  });

  factory PaymentTypeResponse.fromJson(Map<String, dynamic> json) {
    return PaymentTypeResponse(
      status: json['status'],
      message: json['message'],
      data: PaymentTypeData.fromJson(json['data']),
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

class PaymentTypeData {
  final List<int> bankIds;
  final List<int> typeIds;

  PaymentTypeData({
    required this.bankIds,
    required this.typeIds,
  });

  factory PaymentTypeData.fromJson(Map<String, dynamic> json) {
    return PaymentTypeData(
      bankIds: List<int>.from(json['bankIds']),
      typeIds: List<int>.from(json['typeIds']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'bankIds': bankIds,
      'typeIds': typeIds,
    };
  }
}