class EstateInvoiceDetailResponse {
  final String status;
  final String message;
  final EstateInvoiceDataResponse data;

  EstateInvoiceDetailResponse({
    required this.status,
    required this.message,
    required this.data,
  });

  factory EstateInvoiceDetailResponse.fromJson(Map<String, dynamic> json) {
    return EstateInvoiceDetailResponse(
      status: json['status'],
      message: json['message'],
      data: EstateInvoiceDataResponse.fromJson(json['data']),
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

class EstateInvoiceDataResponse {
  final String rrn;
  final String month;
  final String estateName;
  final String date;
  final String location;
  final String invoiceAmount;
  final String rentOwed;
  final String paidAmount;
  final String contactNo;
  final String contactEmail;
  final String office;
  final String appName;
  final String status;
  final String tenantName;
  final String tenantPhone;
  final String tenantEmail;
  final List<Bill> bills;
  final int id;

  EstateInvoiceDataResponse({
    required this.rrn,
    required this.month,
    required this.estateName,
    required this.date,
    required this.location,
    required this.invoiceAmount,
    required this.rentOwed,
    required this.paidAmount,
    required this.contactNo,
    required this.contactEmail,
    required this.office,
    required this.appName,
    required this.status,
    required this.tenantName,
    required this.tenantPhone,
    required this.tenantEmail,
    required this.bills,
    required this.id,
  });

  factory EstateInvoiceDataResponse.fromJson(Map<String, dynamic> json) {
    var billsList = json['bills'] as List;
    List<Bill> bills = billsList.map((i) => Bill.fromJson(i)).toList();

    return EstateInvoiceDataResponse(
      rrn: json['rrn'],
      month: json['month'],
      estateName: json['estateName'],
      date: json['date'],
      location: json['location'],
      invoiceAmount: json['invoiceAmount'],
      rentOwed: json['rentOwed'],
      paidAmount: json['paidAmount'],
      contactNo: json['contactNo'],
      contactEmail: json['contactEmail'],
      office: json['office'],
      appName: json['appName'],
      status: json['status'],
      tenantName: json['tenantName'],
      tenantPhone: json['tenantPhone'],
      tenantEmail: json['tenantEmail'],
      bills: bills,
      id: json['id'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'rrn': rrn,
      'month': month,
      'estateName': estateName,
      'date': date,
      'location': location,
      'invoiceAmount': invoiceAmount,
      'rentOwed': rentOwed,
      'paidAmount': paidAmount,
      'contactNo': contactNo,
      'contactEmail': contactEmail,
      'office': office,
      'appName': appName,
      'status': status,
      'tenantName': tenantName,
      'tenantPhone': tenantPhone,
      'tenantEmail': tenantEmail,
      'bills': bills.map((i) => i.toJson()).toList(),
      'id': id,
    };
  }
}

class Bill {
  final String narration;
  final String value;
  final String units;
  final String occupiedUnits;
  final String totalRent;
  final String commission;

  Bill({
    required this.narration,
    required this.value,
    required this.units,
    required this.occupiedUnits,
    required this.totalRent,
    required this.commission,
  });

  factory Bill.fromJson(Map<String, dynamic> json) {
    return Bill(
      narration: json['narration'] ?? '',
      value: json['value'] ?? '',
      units: json['units'] ?? '',
      occupiedUnits: json['occupiedUnits'] ?? '',
      totalRent: json['totalRent'] ?? '',
      commission: json['commission'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'narration': narration,
      'value': value,
      'units': units,
      'occupiedUnits': occupiedUnits,
      'totalRent': totalRent,
      'commission': commission,
    };
  }
}