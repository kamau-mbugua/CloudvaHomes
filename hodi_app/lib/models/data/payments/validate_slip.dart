class ValidateSlipResponse {
  String status;
  String message;
  ValidateSlipData data;

  ValidateSlipResponse({
    required this.status,
    required this.message,
    required this.data,
  });

  factory ValidateSlipResponse.fromJson(Map<String, dynamic> json) {
    return ValidateSlipResponse(
      status: json['status'],
      message: json['message'],
      data: ValidateSlipData.fromJson(json['data']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'status': status ?? "",
      'message': message ?? "",
      'data': data.toJson(),
    };
  }
}

class ValidateSlipData {
  String refNo;
  String message;
  String amount;

  ValidateSlipData({
    required this.refNo,
    required this.message,
    required this.amount,
  });

  factory ValidateSlipData.fromJson(Map<String, dynamic> json) {
    return ValidateSlipData(
      refNo: json['refNo'] ?? "",
      message: json['message'] ?? "",
      amount: json['amount'] ?? "",
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'refNo': refNo,
      'message': message,
      'amount': amount,
    };
  }
}