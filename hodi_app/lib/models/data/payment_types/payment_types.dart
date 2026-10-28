class PaymentTypeList {
  final int id;
  final String name;

  PaymentTypeList({required this.id, required this.name});

  factory PaymentTypeList.fromJson(Map<String, dynamic> json) {
    return PaymentTypeList(
      id: json['id'],
      name: json['name'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
    };
  }
}