class OnboardingFeesResponse {
  final int number;
  final int numberOfElements;
  final int size;
  final List<OnboardingFeesData> content;
  final int totalElements;

  OnboardingFeesResponse({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory OnboardingFeesResponse.fromJson(Map<String, dynamic> json) {
    return OnboardingFeesResponse(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: List<OnboardingFeesData>.from(json['content'].map((x) => OnboardingFeesData.fromJson(x))),
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

class OnboardingFeesData {
  final int amount;
  final int months;
  final int estateId;
  final String name;
  final String estate;
  final String property;
  final bool refundable;
  final String updatedOn;
  final int id;
  final int type;
  final int propertyId;
  final int status;

  OnboardingFeesData({
    required this.amount,
    required this.months,
    required this.estateId,
    required this.name,
    required this.estate,
    required this.property,
    required this.refundable,
    required this.updatedOn,
    required this.id,
    required this.type,
    required this.propertyId,
    required this.status,
  });

  factory OnboardingFeesData.fromJson(Map<String, dynamic> json) {
    return OnboardingFeesData(
      amount: json['amount'],
      months: json['months'],
      estateId: json['estateId'],
      name: json['name'],
      estate: json['estate'],
      property: json['property'],
      refundable: json['refundable'],
      updatedOn: json['updatedOn'],
      id: json['id'],
      type: json['type'],
      propertyId: json['propertyId'],
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'amount': amount,
      'months': months,
      'estateId': estateId,
      'name': name,
      'estate': estate,
      'property': property,
      'refundable': refundable,
      'updatedOn': updatedOn,
      'id': id,
      'type': type,
      'propertyId': propertyId,
      'status': status,
    };
  }
}