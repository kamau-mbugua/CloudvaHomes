class DashboardListItem {
  final String transactionRef;
  final String houseNo;
  final String tenant;
  final double rent;
  final double rentPaid;
  final DateTime date;

  DashboardListItem({
    required this.transactionRef,
    required this.houseNo,
    required this.tenant,
    required this.rent,
    required this.rentPaid,
    required this.date,
  });
}