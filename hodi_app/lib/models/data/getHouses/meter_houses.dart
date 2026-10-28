class MeterHousesResponse {
  final List<MeterHousesData> houses;
  final List<String> metreNos;

  MeterHousesResponse({
    required this.houses,
    required this.metreNos,
  });

  factory MeterHousesResponse.fromJson(Map<String, dynamic> json) {
    return MeterHousesResponse(
      houses: (json['houses'] as List).map((i) => MeterHousesData.fromJson(i)).toList(),
      metreNos: List<String>.from(json['metreNos']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'houses': houses.map((house) => house.toJson()).toList(),
      'metreNos': metreNos,
    };
  }
}


class MeterHousesData {
  final String name;
  final String id;

  MeterHousesData({
    required this.name,
    required this.id,
  });

  factory MeterHousesData.fromJson(Map<String, dynamic> json) {
    return MeterHousesData(
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