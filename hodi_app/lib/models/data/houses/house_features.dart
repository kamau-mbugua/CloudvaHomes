class HouseFeaturesResponse {
  final List<FeatureData> features;
  final List<dynamic> featureIds;

  HouseFeaturesResponse({
    required this.features,
    required this.featureIds,
  });

  factory HouseFeaturesResponse.fromJson(Map<String, dynamic> json) {
    return HouseFeaturesResponse(
      features: List<FeatureData>.from(json['features'].map((x) => FeatureData.fromJson(x))),
      featureIds: List<dynamic>.from(json['featureIds']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'features': List<dynamic>.from(features.map((x) => x.toJson())),
      'featureIds': List<dynamic>.from(featureIds),
    };
  }
}

class FeatureData {
  final String name;
  final int id;
  final bool houseSpecific;

  FeatureData({
    required this.name,
    required this.id,
    required this.houseSpecific,
  });

  factory FeatureData.fromJson(Map<String, dynamic> json) {
    return FeatureData(
      name: json['name'],
      id: json['id'],
      houseSpecific: json['houseSpecific'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'id': id,
      'houseSpecific': houseSpecific,
    };
  }
}