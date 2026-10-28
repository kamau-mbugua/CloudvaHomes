class EstateInvoices {
  final int number;
  final int numberOfElements;
  final int size;
  final List<EstateInvoiceData> content;
  final int totalElements;

  EstateInvoices({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory EstateInvoices.fromJson(Map<String, dynamic> json) {
    return EstateInvoices(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: (json['content'] as List)
          .map((item) => EstateInvoiceData.fromJson(item))
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

class EstateInvoiceData {
  final int estateId;
  final String dueDate;
  final String estate;
  final String monthName;
  final int invoiceAmount;
  final String paymentRrn;
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

  EstateInvoiceData({
    required this.estateId,
    required this.dueDate,
    required this.estate,
    required this.monthName,
    required this.invoiceAmount,
    required this.paymentRrn,
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

  factory EstateInvoiceData.fromJson(Map<String, dynamic> json) {
    return EstateInvoiceData(
      estateId: json['estateId'] ?? 0,
      dueDate: json['dueDate'] ?? '',
      estate: json['estate'] ?? '',
      monthName: json['monthName'] ?? '',
      invoiceAmount: json['invoiceAmount'] ?? 0,
      paymentRrn: json['paymentRrn'] ?? '',
      paidOn: json['paidOn'] ?? '',
      rrn: json['rrn'] ?? '',
      totalUnits: json['totalUnits'] ?? 0,
      adminName: json['adminName'] ?? '',
      adminPhone: json['adminPhone'] ?? '',
      rentAmount: json['rentAmount'] ?? 0,
      occupiedUnits: json['occupiedUnits'] ?? 0,
      id: json['id'] ?? 0,
      paidAmount: json['paidAmount'] ?? 0,
      adminEmail: json['adminEmail'] ?? '',
      status: json['status'] ?? 0,
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