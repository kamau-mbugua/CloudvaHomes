class Payment {
  final String tenantEmail;
  final String paidBy;
  final String houseType;
  final String estate;
  final String tenantPhone;
  final String monthName;
  final bool overdueEstate;
  final String paymentRrn;
  final String paidOn;
  final String phoneNo;
  final String houseName;
  final String tenantName;
  final String invoiceRrn;
  final String property;
  final double rentOwed;
  final int id;
  final String category;
  final double rentPaid;
  final String? status;

  Payment({
    required this.tenantEmail,
    required this.paidBy,
    required this.houseType,
    required this.estate,
    required this.tenantPhone,
    required this.monthName,
    required this.overdueEstate,
    required this.paymentRrn,
    required this.paidOn,
    required this.phoneNo,
    required this.houseName,
    required this.tenantName,
    required this.invoiceRrn,
    required this.property,
    required this.rentOwed,
    required this.id,
    required this.category,
    required this.rentPaid,
    this.status,
  });

  factory Payment.fromJson(Map<String, dynamic> json) {
    return Payment(
      tenantEmail: json['tenantEmail'],
      paidBy: json['paidBy'],
      houseType: json['houseType'],
      estate: json['estate'],
      tenantPhone: json['tenantPhone'],
      monthName: json['monthName'],
      overdueEstate: json['overdueEstate'],
      paymentRrn: json['paymentRrn'],
      paidOn: json['paidOn'],
      phoneNo: json['phoneNo'],
      houseName: json['houseName'],
      tenantName: json['tenantName'],
      invoiceRrn: json['invoiceRrn'],
      property: json['property'],
      rentOwed: json['rentOwed'].toDouble(),
      id: json['id'],
      category: json['category'],
      rentPaid: json['rentPaid'].toDouble(),
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'tenantEmail': tenantEmail,
      'paidBy': paidBy,
      'houseType': houseType,
      'estate': estate,
      'tenantPhone': tenantPhone,
      'monthName': monthName,
      'overdueEstate': overdueEstate,
      'paymentRrn': paymentRrn,
      'paidOn': paidOn,
      'phoneNo': phoneNo,
      'houseName': houseName,
      'tenantName': tenantName,
      'invoiceRrn': invoiceRrn,
      'property': property,
      'rentOwed': rentOwed,
      'id': id,
      'category': category,
      'rentPaid': rentPaid,
      'status': status,
    };
  }
}

class PaymentResponse {
  final int number;
  final int numberOfElements;
  final int size;
  final List<Payment> content;
  final int totalElements;

  PaymentResponse({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory PaymentResponse.fromJson(Map<String, dynamic> json) {
    var list = json['content'] as List;
    List<Payment> contentList = list.map((i) => Payment.fromJson(i)).toList();

    return PaymentResponse(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: contentList,
      totalElements: json['totalElements'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'number': number,
      'numberOfElements': numberOfElements,
      'size': size,
      'content': content.map((e) => e.toJson()).toList(),
      'totalElements': totalElements,
    };
  }
}