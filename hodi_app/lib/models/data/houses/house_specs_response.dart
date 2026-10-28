class HouseSpecsResponse {
  final List<FloorData> floors;
  final List<HouseTypeData> houseTypes;
  final List<HouseSpecsCategoryData> houseCategories;
  final List<String> houseNumbers;

  HouseSpecsResponse({
    required this.floors,
    required this.houseTypes,
    required this.houseCategories,
    required this.houseNumbers,
  });

  factory HouseSpecsResponse.fromJson(Map<String, dynamic> json) {
    return HouseSpecsResponse(
      floors: List<FloorData>.from(json['floors'].map((x) => FloorData.fromJson(x))),
      houseTypes: List<HouseTypeData>.from(json['houseTypes'].map((x) => HouseTypeData.fromJson(x))),
      houseCategories: List<HouseSpecsCategoryData>.from(json['houseCategories'].map((x) => HouseSpecsCategoryData.fromJson(x))),
      houseNumbers: List<String>.from(json['houseNumbers']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'floors': List<dynamic>.from(floors.map((x) => x.toJson())),
      'houseTypes': List<dynamic>.from(houseTypes.map((x) => x.toJson())),
      'houseCategories': List<dynamic>.from(houseCategories.map((x) => x.toJson())),
      'houseNumbers': List<dynamic>.from(houseNumbers.map((x) => x)),
    };
  }
}

class FloorData {
  final String name;
  final int id;

  FloorData({required this.name, required this.id});

  factory FloorData.fromJson(Map<String, dynamic> json) {
    return FloorData(
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

class HouseTypeData {
  final int id;
  final String name;
  final String description;
  final int units;

  HouseTypeData({
    required this.id,
    required this.name,
    required this.description,
    required this.units,
  });

  factory HouseTypeData.fromJson(Map<String, dynamic> json) {
    return HouseTypeData(
      id: json['id'],
      name: json['name'],
      description: json['description'],
      units: json['units'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'units': units,
    };
  }
}

class HouseSpecsCategoryData {
  final String name;
  final int id;

  HouseSpecsCategoryData({required this.name, required this.id});

  factory HouseSpecsCategoryData.fromJson(Map<String, dynamic> json) {
    return HouseSpecsCategoryData(
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