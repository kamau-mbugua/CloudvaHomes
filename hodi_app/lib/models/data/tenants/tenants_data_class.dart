class TenantData {
  final int number;
  final int numberOfElements;
  final int size;
  final List<Tenant> content;
  final int totalElements;

  TenantData({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory TenantData.fromJson(Map<String, dynamic> json) {
    return TenantData(
      number: json['number'] ?? 0,
      numberOfElements: json['numberOfElements'] ?? 0,
      size: json['size'] ?? 0,
      content: List<Tenant>.from(json['content'].map((x) => Tenant.fromJson(x))),
      totalElements: json['totalElements'] ?? 0,
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

class Tenant {
  final String tenantEmail;
  final int estateId;
  final String houseType;
  final String dueDate;
  final String estate;
  final String tenantPhone;
  final String monthName;
  final bool overdueEstate;
  final double rent;
  final String userId;
  final String occupiedOn;
  final String houseName;
  final String tenantName;
  final String invoiceRrn;
  final String property;
  final double rentOwed;
  final bool self;
  final int id;
  final String category;

  Tenant({
    required this.tenantEmail,
    required this.estateId,
    required this.houseType,
    required this.dueDate,
    required this.estate,
    required this.tenantPhone,
    required this.monthName,
    required this.overdueEstate,
    required this.rent,
    required this.userId,
    required this.occupiedOn,
    required this.houseName,
    required this.tenantName,
    required this.invoiceRrn ,
    required this.property,
    required this.rentOwed,
    required this.self,
    required this.id,
    required this.category,
  });

  factory Tenant.fromJson(Map<String, dynamic> json) {
    return Tenant(
      tenantEmail: json['tenantEmail'] ?? "",
      estateId: json['estateId'] ?? 0,
      houseType: json['houseType'] ?? "",
      dueDate: json['dueDate'] ?? "",
      estate: json['estate'] ?? "",
      tenantPhone: json['tenantPhone'] ?? "",
      monthName: json['monthName'] ?? "",
      overdueEstate: json['overdueEstate'] ?? false,
      rent: json['rent'] ?? 0.0,
      userId: json['userId']  ?? "",
      occupiedOn: json['occupiedOn']  ?? "",
      houseName: json['houseName'] ?? "",
      tenantName: json['tenantName'] ?? "",
      invoiceRrn: json['invoiceRrn'] ?? "",
      property: json['property'] ?? "",
      rentOwed: json['rentOwed'] ?? 0.0,
      self: json['self'] ?? false,
      id: json['id'] ?? 0,
      category: json['category'] ?? "",
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'tenantEmail': tenantEmail,
      'estateId': estateId,
      'houseType': houseType,
      'dueDate': dueDate,
      'estate': estate,
      'tenantPhone': tenantPhone,
      'monthName': monthName,
      'overdueEstate': overdueEstate,
      'rent': rent,
      'userId': userId,
      'occupiedOn': occupiedOn,
      'houseName': houseName,
      'tenantName': tenantName,
      'invoiceRrn': invoiceRrn,
      'property': property,
      'rentOwed': rentOwed,
      'self': self,
      'id': id,
      'category': category,
    };
  }
}