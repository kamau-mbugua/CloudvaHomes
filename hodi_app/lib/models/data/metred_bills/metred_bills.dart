class MetredBillsUtility {
  final String name;
  final String id;

  MetredBillsUtility({
    required this.name,
    required this.id,
  });

  factory MetredBillsUtility.fromJson(Map<String, dynamic> json) {
    return MetredBillsUtility(
      name: json['name'],
      id: json['id'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'id': id,
    };
  }
}

class UtilityList {
  final List<MetredBillsUtility> utilities;

  UtilityList({
    required this.utilities,
  });

  factory UtilityList.fromJson(List<dynamic> json) {
    return UtilityList(
      utilities: json.map((e) => MetredBillsUtility.fromJson(e)).toList(),
    );
  }

  List<Map<String, dynamic>> toJson() {
    return utilities.map((e) => e.toJson()).toList();
  }
}