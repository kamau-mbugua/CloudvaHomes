class InvoiceDetailResponse {
  final String status;
  final String message;
  final PaymentDetailData data;

  InvoiceDetailResponse({
    required this.status,
    required this.message,
    required this.data,
  });

  factory InvoiceDetailResponse.fromJson(Map<String, dynamic> json) {
    return InvoiceDetailResponse(
      status: json['status'],
      message: json['message'],
      data: PaymentDetailData.fromJson(json['data']),
    );
  }
}

class PaymentDetailData {
  final String rrn;
  final String month;
  final String estateName;
  final String houseNumber;
  final String date;
  final String location;
  final String propertyName;
  final String invoiceAmount;
  final String paidAmount;
  final String rentOwed;
  final String contactNo;
  final String contactEmail;
  final String status;
  final String tenantName;
  final String tenantPhone;
  final String tenantEmail;
  final String paidBy;
  final String paymentType;
  final List<Bill> bills;
  final String currency;

  PaymentDetailData({
    required this.rrn,
    required this.month,
    required this.estateName,
    required this.houseNumber,
    required this.date,
    required this.location,
    required this.propertyName,
    required this.invoiceAmount,
    required this.paidAmount,
    required this.rentOwed,
    required this.contactNo,
    required this.contactEmail,
    required this.status,
    required this.tenantName,
    required this.tenantPhone,
    required this.tenantEmail,
    required this.paidBy,
    required this.paymentType,
    required this.bills,
    required this.currency,
  });

  factory PaymentDetailData.fromJson(Map<String, dynamic> json) {
    var billsFromJson = json['bills'] as List;
    List<Bill> billList = billsFromJson.map((bill) => Bill.fromJson(bill)).toList();

    return PaymentDetailData(
      rrn: json['rrn'],
      month: json['month'],
      estateName: json['estateName'],
      houseNumber: json['houseNumber'],
      date: json['date'],
      location: json['location'],
      propertyName: json['propertyName'],
      invoiceAmount: json['invoiceAmount'],
      paidAmount: json['paidAmount'],
      rentOwed: json['rentOwed'],
      contactNo: json['contactNo'],
      contactEmail: json['contactEmail'],
      status: json['status'],
      tenantName: json['tenantName'],
      tenantPhone: json['tenantPhone'],
      tenantEmail: json['tenantEmail'],
      paidBy: json['paidBy'],
      paymentType: json['paymentType'],
      bills: billList,
      currency: json['currency'],
    );
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
}