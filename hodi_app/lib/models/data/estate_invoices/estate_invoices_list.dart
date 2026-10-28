class UserEstateInvoiceResponse {
  final int number;
  final int numberOfElements;
  final int size;
  final List<UserEstateInvoiceData> content;
  final int totalElements;

  UserEstateInvoiceResponse({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory UserEstateInvoiceResponse.fromJson(Map<String, dynamic> json) {
    return UserEstateInvoiceResponse(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: List<UserEstateInvoiceData>.from(json['content'].map((item) => UserEstateInvoiceData.fromJson(item))),
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

class UserEstateInvoiceData {
  final int estateId;
  final String dueDate;
  final String estate;
  final String monthName;
  final int invoiceAmount;
  final String? paymentRrn;
  final String paidOn;
  final String rrn;
  final int totalUnits;
  final String adminName;
  final String adminPhone;
  final double rentAmount;
  final int occupiedUnits;
  final int id;
  final int paidAmount;
  final String adminEmail;
  final int status;

  UserEstateInvoiceData({
    required this.estateId,
    required this.dueDate,
    required this.estate,
    required this.monthName,
    required this.invoiceAmount,
    this.paymentRrn,
    required this.paidOn,
    required this.rrn,
    required this.totalUnits,
    required this.adminName,
    required this.adminPhone,
    required this.rentAmount,
    required this.occupiedUnits,
    required this.id,
    required this.paidAmount,
    required this.adminEmail,
    required this.status,
  });

  factory UserEstateInvoiceData.fromJson(Map<String, dynamic> json) {
    return UserEstateInvoiceData(
      estateId: json['estateId'],
      dueDate: json['dueDate'],
      estate: json['estate'],
      monthName: json['monthName'],
      invoiceAmount: json['invoiceAmount'],
      paymentRrn: json['paymentRrn'],
      paidOn: json['paidOn'],
      rrn: json['rrn'],
      totalUnits: json['totalUnits'],
      adminName: json['adminName'],
      adminPhone: json['adminPhone'],
      rentAmount: json['rentAmount'],
      occupiedUnits: json['occupiedUnits'],
      id: json['id'],
      paidAmount: json['paidAmount'],
      adminEmail: json['adminEmail'],
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'estateId': estateId,
      'dueDate': dueDate,
      'estate': estate,
      'monthName': monthName,
      'invoiceAmount': invoiceAmount,
      'paymentRrn': paymentRrn,
      'paidOn': paidOn,
      'rrn': rrn,
      'totalUnits': totalUnits,
      'adminName': adminName,
      'adminPhone': adminPhone,
      'rentAmount': rentAmount,
      'occupiedUnits': occupiedUnits,
      'id': id,
      'paidAmount': paidAmount,
      'adminEmail': adminEmail,
      'status': status,
    };
  }
}