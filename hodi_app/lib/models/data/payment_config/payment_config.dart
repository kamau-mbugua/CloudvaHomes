class PaymentMethodResponse {
  final int number;
  final int numberOfElements;
  final int size;
  final List<PaymentMethodData> content;
  final int totalElements;

  PaymentMethodResponse({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory PaymentMethodResponse.fromJson(Map<String, dynamic> json) {
    return PaymentMethodResponse(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: List<PaymentMethodData>.from(json['content'].map((x) => PaymentMethodData.fromJson(x))),
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

class PaymentMethodData {
  final int estateId;
  final String? accountName;
  final String estate;
  final String? bankName;
  final String updatedOn;
  final String? accountNo;
  final String name;
  final String property;
  final int typeId;
  final int id;
  final int propertyId;
  final String? payBillNo;
  final int status;

  PaymentMethodData({
    required this.estateId,
    this.accountName,
    required this.estate,
    this.bankName,
    required this.updatedOn,
    this.accountNo,
    required this.name,
    required this.property,
    required this.typeId,
    required this.id,
    required this.propertyId,
    this.payBillNo,
    required this.status,
  });

  factory PaymentMethodData.fromJson(Map<String, dynamic> json) {
    return PaymentMethodData(
      estateId: json['estateId'],
      accountName: json['accountName'],
      estate: json['estate'],
      bankName: json['bankName'],
      updatedOn: json['updatedOn'],
      accountNo: json['accountNo'],
      name: json['name'],
      property: json['property'],
      typeId: json['typeId'],
      id: json['id'],
      propertyId: json['propertyId'],
      payBillNo: json['payBillNo'],
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'estateId': estateId,
      'accountName': accountName,
      'estate': estate,
      'bankName': bankName,
      'updatedOn': updatedOn,
      'accountNo': accountNo,
      'name': name,
      'property': property,
      'typeId': typeId,
      'id': id,
      'propertyId': propertyId,
      'payBillNo': payBillNo,
      'status': status,
    };
  }
}