class TenantsInvoices {
  final int number;
  final int numberOfElements;
  final int size;
  final List<TenantInvoiceData> content;
  final int totalElements;

  TenantsInvoices({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory TenantsInvoices.fromJson(Map<String, dynamic> json) {
    return TenantsInvoices(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: (json['content'] as List)
          .map((item) => TenantInvoiceData.fromJson(item))
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

class TenantInvoiceData {
  final String tenantEmail;
  final String paidBy;
  final String houseType;
  final String dueDate;
  final String estate;
  final String tenantPhone;
  final String monthName;
  final bool overdueEstate;
  final String paidOn;
  final String rrn;
  final String houseName;
  final String tenantName;
  final String property;
  final double rentOwed;
  final bool self;
  final int id;
  final String category;
  final double rentPaid;
  final int propertyId;
  final int status;

  TenantInvoiceData({
    required this.tenantEmail,
    required this.paidBy,
    required this.houseType,
    required this.dueDate,
    required this.estate,
    required this.tenantPhone,
    required this.monthName,
    required this.overdueEstate,
    required this.paidOn,
    required this.rrn,
    required this.houseName,
    required this.tenantName,
    required this.property,
    required this.rentOwed,
    required this.self,
    required this.id,
    required this.category,
    required this.rentPaid,
    required this.propertyId,
    required this.status,
  });

  factory TenantInvoiceData.fromJson(Map<String, dynamic> json) {
    return TenantInvoiceData(
      tenantEmail: json['tenantEmail'] ?? '',
      paidBy: json['paidBy'] ?? '',
      houseType: json['houseType'] ?? '',
      dueDate: json['dueDate'] ?? '',
      estate: json['estate'] ?? '',
      tenantPhone: json['tenantPhone'] ?? '',
      monthName: json['monthName'] ?? '',
      overdueEstate: json['overdueEstate'] ?? false,
      paidOn: json['paidOn'] ?? '',
      rrn: json['rrn'] ?? '',
      houseName: json['houseName'] ?? '',
      tenantName: json['tenantName'] ?? '',
      property: json['property'] ?? '',
      rentOwed: json['rentOwed'] ?? 0.0,
      self: json['self'] ?? false,
      id: json['id'] ?? 0,
      category: json['category'] ?? '',
      rentPaid: json['rentPaid'] ?? 0.0,
      propertyId: json['propertyId'] ?? 0,
      status: json['status'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'tenantEmail': tenantEmail,
      'paidBy': paidBy,
      'houseType': houseType,
      'dueDate': dueDate,
      'estate': estate,
      'tenantPhone': tenantPhone,
      'monthName': monthName,
      'overdueEstate': overdueEstate,
      'paidOn': paidOn,
      'rrn': rrn,
      'houseName': houseName,
      'tenantName': tenantName,
      'property': property,
      'rentOwed': rentOwed,
      'self': self,
      'id': id,
      'category': category,
      'rentPaid': rentPaid,
      'propertyId': propertyId,
      'status': status,
    };
  }
}