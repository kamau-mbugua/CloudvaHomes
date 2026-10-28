class RecurrentExpenseResponse {
  final int number;
  final int numberOfElements;
  final int size;
  final List<ReccurentExpenseData> content;
  final int totalElements;

  RecurrentExpenseResponse({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory RecurrentExpenseResponse.fromJson(Map<String, dynamic> json) {
    return RecurrentExpenseResponse(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: (json['content'] as List)
          .map((item) => ReccurentExpenseData.fromJson(item))
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

class ReccurentExpenseData {
  final double amount;
  final int estateId;
  final String? incurredMonth;
  final String name;
  final String estate;
  final String property;
  final String description;
  final String frequencyName;
  final int id;
  final int propertyId;
  final int frequency;
  final int status;

  ReccurentExpenseData({
    required this.amount,
    required this.estateId,
    this.incurredMonth,
    required this.name,
    required this.estate,
    required this.property,
    required this.description,
    required this.frequencyName,
    required this.id,
    required this.propertyId,
    required this.frequency,
    required this.status,
  });

  factory ReccurentExpenseData.fromJson(Map<String, dynamic> json) {
    return ReccurentExpenseData(
      amount: json['amount'] ?? 0.0,
      estateId: json['estateId'] ?? 0,
      incurredMonth: json['incurredMonth'] ?? '',
      name: json['name'] ?? '',
      estate: json['estate'] ?? '',
      property: json['property'] ?? '',
      description: json['description'] ?? '',
      frequencyName: json['frequencyName'] ?? '',
      id: json['id'] ?? 0,
      propertyId: json['propertyId'] ?? 0,
      frequency: json['frequency'] ?? 0,
      status: json['status'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'amount': amount,
      'estateId': estateId,
      'incurredMonth': incurredMonth,
      'name': name,
      'estate': estate,
      'property': property,
      'description': description,
      'frequencyName': frequencyName,
      'id': id,
      'propertyId': propertyId,
      'frequency': frequency,
      'status': status,
    };
  }
}