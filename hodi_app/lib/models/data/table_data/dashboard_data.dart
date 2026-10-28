class DashboardData {
  final int expenseCount;
  final double totalInvoice;
  final double totalPayment;
  final int invoiceCount;
  final double totalArrears;
  final double totalRent;
  final int paymentCount;
  final double totalExpense;
  final int? occupiedUnits;

  DashboardData({
    required this.expenseCount,
    required this.totalInvoice,
    required this.totalPayment,
    required this.invoiceCount,
    required this.totalArrears,
    required this.totalRent,
    required this.paymentCount,
    required this.totalExpense,
    this.occupiedUnits,
  });

  factory DashboardData.fromJson(Map<String, dynamic> json) {
    return DashboardData(
      expenseCount: json['expenseCount'] ?? 0,
      totalInvoice: (json['totalInvoice'] as num?)?.toDouble() ?? 0.0,
      totalPayment: (json['totalPayment'] as num?)?.toDouble() ?? 0.0,
      invoiceCount: json['invoiceCount'] ?? 0,
      totalArrears: (json['totalArrears'] as num?)?.toDouble() ?? 0.0,
      totalRent: (json['totalRent'] as num?)?.toDouble() ?? 0.0,
      paymentCount: json['paymentCount'] ?? 0,
      totalExpense: (json['totalExpense'] as num?)?.toDouble() ?? 0.0,
      occupiedUnits: json['occupiedUnits'] != null ? (json['occupiedUnits'] as num).toInt() : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'expenseCount': expenseCount,
      'totalInvoice': totalInvoice,
      'totalPayment': totalPayment,
      'invoiceCount': invoiceCount,
      'totalArrears': totalArrears,
      'totalRent': totalRent,
      'paymentCount': paymentCount,
      'totalExpense': totalExpense,
      'occupiedUnits': occupiedUnits,
    };
  }
}
