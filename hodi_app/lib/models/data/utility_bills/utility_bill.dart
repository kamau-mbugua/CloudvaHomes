class UtilityBill {
  final int amount;
  final String name;
  final String id;

  UtilityBill({
    required this.amount,
    required this.name,
    required this.id,
  });

  factory UtilityBill.fromJson(Map<String, dynamic> json) {
    return UtilityBill(
      amount: json['amount'],
      name: json['name'],
      id: json['id'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'amount': amount,
      'name': name,
      'id': id,
    };
  }
}