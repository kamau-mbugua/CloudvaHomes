class HouseHistory {
  final int number;
  final int numberOfElements;
  final int size;
  final List<HouseHistoryData> content;
  final int totalElements;

  HouseHistory({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory HouseHistory.fromJson(Map<String, dynamic> json) {
    return HouseHistory(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: List<HouseHistoryData>.from(json['content'].map((x) => HouseHistoryData.fromJson(x))),
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

class HouseHistoryData {
  final String tenantEmail;
  final String? reason;
  final int estateId;
  final String houseType;
  final String estate;
  final String tenantPhone;
  final double? rent;
  final String occupiedOn;
  final String houseName;
  final String tenantName;
  final String? vacatorName;
  final String? vacatedOn;
  final String property;
  final double? rentOwed;
  final int id;
  final String category;

  HouseHistoryData({
    required this.tenantEmail,
    this.reason,
    required this.estateId,
    required this.houseType,
    required this.estate,
    required this.tenantPhone,
    this.rent,
    required this.occupiedOn,
    required this.houseName,
    required this.tenantName,
    this.vacatorName,
    this.vacatedOn,
    required this.property,
    this.rentOwed,
    required this.id,
    required this.category,
  });

  factory HouseHistoryData.fromJson(Map<String, dynamic> json) {
    return HouseHistoryData(
      tenantEmail: json['tenantEmail'] ?? '',
      reason: json['reason'] ?? '',
      estateId: json['estateId'] ?? 0,
      houseType: json['houseType'] ?? '',
      estate: json['estate'] ?? '',
      tenantPhone: json['tenantPhone'] ?? '',
      rent: json['rent'] != null ? json['rent'].toDouble() : 0.0,
      occupiedOn: json['occupiedOn'],
      houseName: json['houseName'],
      tenantName: json['tenantName'],
      vacatorName: json['vacatorName'],
      vacatedOn: json['vacatedOn'],
      property: json['property'],
      rentOwed: json['rentOwed'] != null ? json['rentOwed'].toDouble() : 0.0,
      id: json['id'],
      category: json['category'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'tenantEmail': tenantEmail,
      'reason': reason,
      'estateId': estateId,
      'houseType': houseType,
      'estate': estate,
      'tenantPhone': tenantPhone,
      'rent': rent,
      'occupiedOn': occupiedOn,
      'houseName': houseName,
      'tenantName': tenantName,
      'vacatorName': vacatorName,
      'vacatedOn': vacatedOn,
      'property': property,
      'rentOwed': rentOwed,
      'id': id,
      'category': category,
    };
  }
}