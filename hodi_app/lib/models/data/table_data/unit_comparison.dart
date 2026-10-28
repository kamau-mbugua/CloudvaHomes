class UnitComparisonDashboardContent {
  final double totalInvoice;
  final double totalPayment;
  final double totalArrears;
  final int occupiedUnits;
  final double totalRent;
  final double totalExpense;
  final int totalUnits;

  UnitComparisonDashboardContent({
    required this.totalInvoice,
    required this.totalPayment,
    required this.totalArrears,
    required this.occupiedUnits,
    required this.totalRent,
    required this.totalExpense,
    required this.totalUnits,
  });

  factory UnitComparisonDashboardContent.fromJson(Map<String, dynamic> json) {
    return UnitComparisonDashboardContent(
      totalInvoice: (json['totalInvoice'] ?? 0.0).toDouble(),
      totalPayment: (json['totalPayment'] ?? 0.0).toDouble(),
      totalArrears: (json['totalArrears'] ?? 0.0).toDouble(),
      occupiedUnits: json['occupiedUnits'] ?? 0,
      totalRent: (json['totalRent'] ?? 0.0).toDouble(),
      totalExpense: (json['totalExpense'] ?? 0.0).toDouble(),
      totalUnits: json['totalUnits'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'totalInvoice': totalInvoice,
      'totalPayment': totalPayment,
      'totalArrears': totalArrears,
      'occupiedUnits': occupiedUnits,
      'totalRent': totalRent,
      'totalExpense': totalExpense,
      'totalUnits': totalUnits,
    };
  }
}