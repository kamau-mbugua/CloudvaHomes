class EstatePropertyCategory {
  final int id;
  final String name;

  EstatePropertyCategory({required this.id, required this.name});

  factory EstatePropertyCategory.fromJson(Map<String, dynamic> json) {
    return EstatePropertyCategory(
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