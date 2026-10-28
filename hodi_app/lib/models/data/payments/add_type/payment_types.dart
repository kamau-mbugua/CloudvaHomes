class AssignPaymentResponse {
  List<AssignPaymentTypeData> types;
  List<AssignPaymentBankData> banks;

  AssignPaymentResponse({required this.types, required this.banks});

  factory AssignPaymentResponse.fromJson(Map<String, dynamic> json) {
    return AssignPaymentResponse(
      types: List<AssignPaymentTypeData>.from(json['types'].map((x) => AssignPaymentTypeData.fromJson(x))),
      banks: List<AssignPaymentBankData>.from(json['banks'].map((x) => AssignPaymentBankData.fromJson(x))),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'types': List<dynamic>.from(types.map((x) => x.toJson())),
      'banks': List<dynamic>.from(banks.map((x) => x.toJson())),
    };
  }
}

class AssignPaymentTypeData {
  String name;
  String description;
  int id;

  AssignPaymentTypeData({required this.name, required this.description, required this.id});

  factory AssignPaymentTypeData.fromJson(Map<String, dynamic> json) {
    return AssignPaymentTypeData(
      name: json['name']  ?? '',
      description: json['description'] ?? '',
      id: json['id'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'description': description,
      'id': id,
    };
  }
}

class AssignPaymentBankData {
  int id;
  String name;
  String code;
  String payBillNo;
  int status;

  AssignPaymentBankData({required this.id, required this.name, required this.code, required this.payBillNo, required this.status});

  factory AssignPaymentBankData.fromJson(Map<String, dynamic> json) {
    return AssignPaymentBankData(
      id: json['id'] ?? 0,
      name: json['name'] ?? '',
      code: json['code'] ?? '',
      payBillNo: json['payBillNo'] ?? '',
      status: json['status'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'code': code,
      'payBillNo': payBillNo,
      'status': status,
    };
  }
}