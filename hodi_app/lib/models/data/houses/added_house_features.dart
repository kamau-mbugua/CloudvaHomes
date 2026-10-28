class AddedHouseFeaturesList {
  final String name;

  AddedHouseFeaturesList({required this.name});

  factory AddedHouseFeaturesList.fromJson(Map<String, dynamic> json) {
    return AddedHouseFeaturesList(
      name: json['name'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
    };
  }
}