class InvoiceDetailResponse {
  final String status;
  final String message;
  final InvoiceDataResponse data;

  InvoiceDetailResponse({
    required this.status,
    required this.message,
    required this.data,
  });

  factory InvoiceDetailResponse.fromJson(Map<String, dynamic> json) {
    return InvoiceDetailResponse(
      status: json['status'],
      message: json['message'],
      data: InvoiceDataResponse.fromJson(json['data']),
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

class InvoiceDataResponse {
  final String rrn;
  final String month;
  final String estateName;
  final String houseNumber;
  final String date;
  final String location;
  final String propertyName;
  final String invoiceAmount;
  final String rentOwed;
  final String paidAmount;
  final String contactNo;
  final String contactEmail;
  final String status;
  final int flag;
  final String tenantName;
  final String tenantPhone;
  final String tenantEmail;
  final String message;
  final List<Bill> bills;
  final bool self;
  final int propertyId;
  final int estateId;
  final int id;
  final String currency;

  InvoiceDataResponse({
    required this.rrn,
    required this.month,
    required this.estateName,
    required this.houseNumber,
    required this.date,
    required this.location,
    required this.propertyName,
    required this.invoiceAmount,
    required this.rentOwed,
    required this.paidAmount,
    required this.contactNo,
    required this.contactEmail,
    required this.status,
    required this.flag,
    required this.tenantName,
    required this.tenantPhone,
    required this.tenantEmail,
    required this.message,
    required this.bills,
    required this.self,
    required this.propertyId,
    required this.estateId,
    required this.id,
    required this.currency,
  });

  factory InvoiceDataResponse.fromJson(Map<String, dynamic> json) {
    var billsList = json['bills'] as List? ?? [];
    List<Bill> bills = billsList.map((i) => Bill.fromJson(i)).toList();

    return InvoiceDataResponse(
      rrn: json['rrn'] ?? '',
      month: json['month'] ?? '',
      estateName: json['estateName'] ?? '',
      houseNumber: json['houseNumber'] ?? '',
      date: json['date'] ?? '',
      location: json['location'] ?? '',
      propertyName: json['propertyName'] ?? '',
      invoiceAmount: json['invoiceAmount'] ?? '',
      rentOwed: json['rentOwed'] ?? '',
      paidAmount: json['paidAmount'] ?? '',
      contactNo: json['contactNo'] ?? '',
      contactEmail: json['contactEmail'] ?? '',
      status: json['status']  ?? '',
      flag: json['flag'] ?? 0,
      tenantName: json['tenantName'] ?? '',
      tenantPhone: json['tenantPhone'] ?? '',
      tenantEmail: json['tenantEmail'] ?? '',
      message: json['message'] ?? '',
      bills: bills ?? [],
      self: json['self'] ?? false,
      propertyId: json['propertyId'] ?? 0,
      estateId: json['estateId'] ?? 0,
      id: json['id'] ?? 0,
      currency: json['currency'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'rrn': rrn,
      'month': month,
      'estateName': estateName,
      'houseNumber': houseNumber,
      'date': date,
      'location': location,
      'propertyName': propertyName,
      'invoiceAmount': invoiceAmount,
      'rentOwed': rentOwed,
      'paidAmount': paidAmount,
      'contactNo': contactNo,
      'contactEmail': contactEmail,
      'status': status,
      'flag': flag,
      'tenantName': tenantName,
      'tenantPhone': tenantPhone,
      'tenantEmail': tenantEmail,
      'message': message,
      'bills': bills.map((i) => i.toJson()).toList(),
      'self': self,
      'propertyId': propertyId,
      'estateId': estateId,
      'id': id,
      'currency': currency,
    };
  }
}

class Bill {
  final String narration;
  final String value;

  Bill({
    required this.narration,
    required this.value,
  });

  factory Bill.fromJson(Map<String, dynamic> json) {
    return Bill(
      narration: json['narration'],
      value: json['value'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'narration': narration,
      'value': value,
    };
  }
}