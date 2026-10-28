class PaymentStatementData {
  final String refNo;
  final int amount;
  final String estate;
  final String paymentRrn;
  final String bankName;
  final bool used;
  final int id;
  final String paidOn;
  final String createdOn;
  final String paymentType;

  PaymentStatementData({
    required this.refNo,
    required this.amount,
    required this.estate,
    required this.paymentRrn,
    required this.bankName,
    required this.used,
    required this.id,
    required this.paidOn,
    required this.createdOn,
    required this.paymentType,
  });

  factory PaymentStatementData.fromJson(Map<String, dynamic> json) {
    return PaymentStatementData(
      refNo: json['refNo'] ?? '',
      amount: json['amount'] ?? 0,
      estate: json['estate'] ?? '',
      paymentRrn: json['paymentRrn'] ?? '',
      bankName: json['bankName'] ?? '',
      used: json['used'] ?? false,
      id: json['id'] ?? 0,
      paidOn: json['paidOn'] ?? '',
      createdOn: json['createdOn'] ?? '',
      paymentType: json['paymentType'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'refNo': refNo,
      'amount': amount,
      'estate': estate,
      'paymentRrn': paymentRrn,
      'bankName': bankName,
      'used': used,
      'id': id,
      'paidOn': paidOn,
      'createdOn': createdOn,
      'paymentType': paymentType,
    };
  }
}

class PaymentListResponse {
  final int number;
  final int numberOfElements;
  final int size;
  final List<PaymentStatementData> content;
  final int totalElements;

  PaymentListResponse({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory PaymentListResponse.fromJson(Map<String, dynamic> json) {
    return PaymentListResponse(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: List<PaymentStatementData>.from(json['content'].map((x) => PaymentStatementData.fromJson(x))),
      totalElements: json['totalElements'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'number': number,
      'numberOfElements': numberOfElements,
      'size': size,
      'content': List<dynamic>.from(content.map((x) => x.toJson())),
      'totalElements': totalElements,
    };
  }
}