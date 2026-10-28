class UtilityBillListData {
  final dynamic amount;
  final int estateId;
  final String name;
  final String estate;
  final String property;
  final String typeName;
  final String updatedOn;
  final int id;
  final int type;
  final int propertyId;
  final bool isMetred;
  final int status;

  UtilityBillListData({
    required this.amount,
    required this.estateId,
    required this.name,
    required this.estate,
    required this.property,
    required this.typeName,
    required this.updatedOn,
    required this.id,
    required this.type,
    required this.propertyId,
    required this.isMetred,
    required this.status,
  });

  factory UtilityBillListData.fromJson(Map<String, dynamic> json) {
    return UtilityBillListData(
      amount: json['amount'],
      estateId: json['estateId'],
      name: json['name'],
      estate: json['estate'],
      property: json['property'],
      typeName: json['typeName'],
      updatedOn: json['updatedOn'],
      id: json['id'],
      type: json['type'],
      propertyId: json['propertyId'],
      isMetred: json['isMetred'],
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'amount': amount,
      'estateId': estateId,
      'name': name,
      'estate': estate,
      'property': property,
      'typeName': typeName,
      'updatedOn': updatedOn,
      'id': id,
      'type': type,
      'propertyId': propertyId,
      'isMetred': isMetred,
      'status': status,
    };
  }
}

class UtilityBillListResponse {
  final int number;
  final int numberOfElements;
  final int size;
  final List<UtilityBillListData> content;
  final int totalElements;

  UtilityBillListResponse({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory UtilityBillListResponse.fromJson(Map<String, dynamic> json) {
    return UtilityBillListResponse(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: List<UtilityBillListData>.from(json['content'].map((x) => UtilityBillListData.fromJson(x))),
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