class EstatePaymentResponse {
  final int number;
  final int numberOfElements;
  final int size;
  final List<EstatePaymentData> content;
  final int totalElements;

  EstatePaymentResponse({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory EstatePaymentResponse.fromJson(Map<String, dynamic> json) {
    return EstatePaymentResponse(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: (json['content'] as List)
          .map((item) => EstatePaymentData.fromJson(item))
          .toList(),
      totalElements: json['totalElements'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'number': number,
      'numberOfElements': numberOfElements,
      'size': size,
      'content': content.map((item) => item.toJson()).toList(),
      'totalElements': totalElements,
    };
  }

}

class EstatePaymentData {
  final String? refNo;
  final int estateId;
  final String paidBy;
  final String estate;
  final int invoiceCount;
  final String paymentRrn;
  final String createdOn;
  final String phoneNo;
  final String paymentType;
  final String adminName;
  final String adminPhone;
  final String invoiceRrn;
  final String createdBy;
  final int id;
  final int paidAmount;
  final String adminEmail;

  EstatePaymentData({
    this.refNo,
    required this.estateId,
    required this.paidBy,
    required this.estate,
    required this.invoiceCount,
    required this.paymentRrn,
    required this.createdOn,
    required this.phoneNo,
    required this.paymentType,
    required this.adminName,
    required this.adminPhone,
    required this.invoiceRrn,
    required this.createdBy,
    required this.id,
    required this.paidAmount,
    required this.adminEmail,
  });

  factory EstatePaymentData.fromJson(Map<String, dynamic> json) {
    return EstatePaymentData(
      refNo: json['refNo'],
      estateId: json['estateId'],
      paidBy: json['paidBy'],
      estate: json['estate'],
      invoiceCount: json['invoiceCount'],
      paymentRrn: json['paymentRrn'],
      createdOn: json['createdOn'],
      phoneNo: json['phoneNo'],
      paymentType: json['paymentType'],
      adminName: json['adminName'],
      adminPhone: json['adminPhone'],
      invoiceRrn: json['invoiceRrn'],
      createdBy: json['createdBy'],
      id: json['id'],
      paidAmount: json['paidAmount'],
      adminEmail: json['adminEmail'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'refNo': refNo,
      'estateId': estateId,
      'paidBy': paidBy,
      'estate': estate,
      'invoiceCount': invoiceCount,
      'paymentRrn': paymentRrn,
      'createdOn': createdOn,
      'phoneNo': phoneNo,
      'paymentType': paymentType,
      'adminName': adminName,
      'adminPhone': adminPhone,
      'invoiceRrn': invoiceRrn,
      'createdBy': createdBy,
      'id': id,
      'paidAmount': paidAmount,
      'adminEmail': adminEmail,
    };
  }
}