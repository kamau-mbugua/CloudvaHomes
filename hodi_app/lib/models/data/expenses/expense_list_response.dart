class ExpenseListData {
  final double amount;
  final String updatedBy;
  final int estateId;
  final String estate;
  final String description;
  final String updatedOn;
  final String recurrentName;
  final String name;
  final String property;
  final int id;
  final int propertyId;
  final bool recurrent;
  final int status;

  ExpenseListData({
    required this.amount,
    required this.updatedBy,
    required this.estateId,
    required this.estate,
    required this.description,
    required this.updatedOn,
    required this.recurrentName,
    required this.name,
    required this.property,
    required this.id,
    required this.propertyId,
    required this.recurrent,
    required this.status,
  });

  factory ExpenseListData.fromJson(Map<String, dynamic> json) {
    return ExpenseListData(
      amount: json['amount'],
      updatedBy: json['updatedBy'],
      estateId: json['estateId'],
      estate: json['estate'],
      description: json['description'],
      updatedOn: json['updatedOn'],
      recurrentName: json['recurrentName'],
      name: json['name'],
      property: json['property'],
      id: json['id'],
      propertyId: json['propertyId'],
      recurrent: json['recurrent'],
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'amount': amount,
      'updatedBy': updatedBy,
      'estateId': estateId,
      'estate': estate,
      'description': description,
      'updatedOn': updatedOn,
      'recurrentName': recurrentName,
      'name': name,
      'property': property,
      'id': id,
      'propertyId': propertyId,
      'recurrent': recurrent,
      'status': status,
    };
  }
}

class ExpenseListResponse {
  final int number;
  final int numberOfElements;
  final int size;
  final List<ExpenseListData> content;
  final int totalElements;

  ExpenseListResponse({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory ExpenseListResponse.fromJson(Map<String, dynamic> json) {
    return ExpenseListResponse(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: List<ExpenseListData>.from(json['content'].map((x) => ExpenseListData.fromJson(x))),
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