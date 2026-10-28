class HouseDetails {
  final String houseType;
  final String houseNumber;
  final String estate;
  final DateTime? lastOccupiedDate;
  final double rent;
  final bool isOccupied;
  final double squareFt;
  final bool showHistory;
  final String property;
  final String location;
  final String floor;
  final String category;
  final TenantsDitails tenant;
  final int status;

  HouseDetails({
    required this.houseType,
    required this.houseNumber,
    required this.estate,
    this.lastOccupiedDate,
    required this.rent,
    required this.isOccupied,
    required this.squareFt,
    required this.showHistory,
    required this.property,
    required this.location,
    required this.floor,
    required this.category,
    required this.tenant,
    required this.status,
  });

  factory HouseDetails.fromJson(Map<String, dynamic> json) {
    return HouseDetails(
      houseType: json['houseType'] ?? '',
      houseNumber: json['houseNumber'] ?? '',
      estate: json['estate'] ?? '',
      lastOccupiedDate: json['lastOccupiedDate'] != null ? DateTime.parse(json['lastOccupiedDate']) : null,
      rent: json['rent'].toDouble(),
      isOccupied: json['isOccupied'] ?? false,
      squareFt: json['squareFt'] != null ? json['squareFt'].toDouble() : 0.0,
      showHistory: json['showHistory'] ?? false,
      property: json['property'] ?? '',
      location: json['location'] ?? '',
      floor: json['floor'] ?? '',
      category: json['category'] ?? '',
      tenant: TenantsDitails.fromJson(json['tenant'] ?? {}),
      status: json['status'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'houseType': houseType,
      'houseNumber': houseNumber,
      'estate': estate,
      'lastOccupiedDate': lastOccupiedDate?.toIso8601String(),
      'rent': rent,
      'isOccupied': isOccupied,
      'squareFt': squareFt,
      'showHistory': showHistory,
      'property': property,
      'location': location,
      'floor': floor,
      'category': category,
      'tenant': tenant.toJson(),
      'status': status,
    };
  }
}

class TenantsDitails {
  final double refundableAmount;
  final String invoiceRrn;
  final String invoiceMonth;
  final String phone;
  final DateTime dueDate;
  final double rentOwed;
  final String name;
  final DateTime occupiedOn;

  TenantsDitails({
    required this.refundableAmount,
    required this.invoiceRrn,
    required this.invoiceMonth,
    required this.phone,
    required this.dueDate,
    required this.rentOwed,
    required this.name,
    required this.occupiedOn,
  });

  factory TenantsDitails.fromJson(Map<String, dynamic> json) {
    return TenantsDitails(
      refundableAmount: json['refundableAmount'] != null ? json['refundableAmount'].toDouble() : 0.0,
      invoiceRrn: json['invoiceRrn'] ?? '',
      invoiceMonth: json['invoiceMonth'] ?? '',
      phone: json['phone'] ?? '',
      dueDate: DateTime.parse(json['dueDate'] ?? DateTime.now().toIso8601String()),
      rentOwed: json['rentOwed'] != null ? json['rentOwed'].toDouble() : 0.0,
      name: json['name'] ?? '',
      occupiedOn: DateTime.parse(json['occupiedOn']?? DateTime.now().toIso8601String()) ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'refundableAmount': refundableAmount,
      'invoiceRrn': invoiceRrn,
      'invoiceMonth': invoiceMonth,
      'phone': phone,
      'dueDate': dueDate.toIso8601String(),
      'rentOwed': rentOwed,
      'name': name,
      'occupiedOn': occupiedOn.toIso8601String(),
    };
  }
}