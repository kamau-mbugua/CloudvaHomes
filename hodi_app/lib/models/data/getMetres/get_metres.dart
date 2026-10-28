class MeterPaymentResponse {
  final int number;
  final int numberOfElements;
  final int size;
  final List<MetrePaymentContent> content;
  final int totalElements;

  MeterPaymentResponse({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory MeterPaymentResponse.fromJson(Map<String, dynamic> json) {
    return MeterPaymentResponse(
      number: json['number'] ?? 0,
      numberOfElements: json['numberOfElements'] ?? 0,
      size: json['size'] ?? 0,
      content: (json['content'] as List)
          .map((item) => MetrePaymentContent.fromJson(item))
          .toList(),
      totalElements: json['totalElements'] ?? 0,
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

class MetrePaymentContent {
  final double amount;
  final double charge;
  final String metreNo;
  final String estate;
  final String monthName;
  final String updatedOn;
  final dynamic? imageStatus;
  final double consumedUnits;
  final double currentReading;
  final String billName;
  final String houseName;
  final double previousReading;
  final int month;
  final String property;
  final bool updatable;
  final String id;
  final int status;

  MetrePaymentContent({
    required this.amount,
    required this.charge,
    required this.metreNo,
    required this.estate,
    required this.monthName,
    required this.updatedOn,
    this.imageStatus,
    required this.consumedUnits,
    required this.currentReading,
    required this.billName,
    required this.houseName,
    required this.previousReading,
    required this.month,
    required this.property,
    required this.updatable,
    required this.id,
    required this.status,
  });

  factory MetrePaymentContent.fromJson(Map<String, dynamic> json) {
    return MetrePaymentContent(
      amount: json['amount'] ?? 0.0,
      charge: json['charge'] ?? 0.0,
      metreNo: json['metreNo'] ?? '',
      estate: json['estate'] ?? '',
      monthName: json['monthName'] ?? '',
      updatedOn: json['updatedOn'] ?? '',
      imageStatus: json['imageStatus'] == null ? '' : json['imageStatus'],
      consumedUnits: json['consumedUnits']  ?? 0.0,
      currentReading: json['currentReading'] ?? 0.0,
      billName: json['billName'] ?? '',
      houseName: json['houseName'] ?? '',
      previousReading: json['previousReading'] ?? 0.0,
      month: json['month'] ?? 0,
      property: json['property'] ?? '',
      updatable: json['updatable'] ?? false,
      id: json['id'] ?? '',
      status: json['status'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'amount': amount,
      'charge': charge,
      'metreNo': metreNo,
      'estate': estate,
      'monthName': monthName,
      'updatedOn': updatedOn,
      'imageStatus': imageStatus,
      'consumedUnits': consumedUnits,
      'currentReading': currentReading,
      'billName': billName,
      'houseName': houseName,
      'previousReading': previousReading,
      'month': month,
      'property': property,
      'updatable': updatable,
      'id': id,
      'status': status,
    };
  }
}