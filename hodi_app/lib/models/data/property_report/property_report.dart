class PropertyReport {
  final int number;
  final int numberOfElements;
  final int size;
  final List<PropertyReportData> content;
  final int totalElements;

  PropertyReport({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory PropertyReport.fromJson(Map<String, dynamic> json) {
    return PropertyReport(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: List<PropertyReportData>.from(json['content'].map((x) => PropertyReportData.fromJson(x))),
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

class PropertyReportData {
  final int expenseCount;
  final int estateId;
  final int year;
  final String estate;
  final int invoiceCount;
  final String monthName;
  final double invoiceAmount;
  final double paymentAmount;
  final int totalUnits;
  final double rentArrears;
  final double expenseAmount;
  final int month;
  final double rentAmount;
  final String property;
  final double netIncome;
  final int occupiedUnits;
  final int id;
  final int propertyId;
  final int paymentCount;

  PropertyReportData({
    required this.expenseCount,
    required this.estateId,
    required this.year,
    required this.estate,
    required this.invoiceCount,
    required this.monthName,
    required this.invoiceAmount,
    required this.paymentAmount,
    required this.totalUnits,
    required this.rentArrears,
    required this.expenseAmount,
    required this.month,
    required this.rentAmount,
    required this.property,
    required this.netIncome,
    required this.occupiedUnits,
    required this.id,
    required this.propertyId,
    required this.paymentCount,
  });

  factory PropertyReportData.fromJson(Map<String, dynamic> json) {
    return PropertyReportData(
      expenseCount: json['expenseCount'],
      estateId: json['estateId'],
      year: json['year'],
      estate: json['estate'],
      invoiceCount: json['invoiceCount'],
      monthName: json['monthName'],
      invoiceAmount: json['invoiceAmount'],
      paymentAmount: json['paymentAmount'],
      totalUnits: json['totalUnits'],
      rentArrears: json['rentArrears'],
      expenseAmount: json['expenseAmount'],
      month: json['month'],
      rentAmount: json['rentAmount'],
      property: json['property'],
      netIncome: json['netIncome'],
      occupiedUnits: json['occupiedUnits'],
      id: json['id'],
      propertyId: json['propertyId'],
      paymentCount: json['paymentCount'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'expenseCount': expenseCount,
      'estateId': estateId,
      'year': year,
      'estate': estate,
      'invoiceCount': invoiceCount,
      'monthName': monthName,
      'invoiceAmount': invoiceAmount,
      'paymentAmount': paymentAmount,
      'totalUnits': totalUnits,
      'rentArrears': rentArrears,
      'expenseAmount': expenseAmount,
      'month': month,
      'rentAmount': rentAmount,
      'property': property,
      'netIncome': netIncome,
      'occupiedUnits': occupiedUnits,
      'id': id,
      'propertyId': propertyId,
      'paymentCount': paymentCount,
    };
  }
}