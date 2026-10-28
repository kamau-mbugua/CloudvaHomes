class UnOccupiedHouses {
  final String houseName;
  final String houseNumber;
  final int id;
  final int floor;
  final double rent;
  final bool occupied;

  UnOccupiedHouses({
    required this.houseName,
    required this.houseNumber,
    required this.id,
    required this.floor,
    required this.rent,
    required this.occupied,
  });

  factory UnOccupiedHouses.fromJson(Map<String, dynamic> json) {
    return UnOccupiedHouses(
      houseName: json['houseName'],
      houseNumber: json['houseNumber'],
      id: json['id'],
      floor: json['floor'],
      rent: json['rent'],
      occupied: json['occupied'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'houseName': houseName,
      'houseNumber': houseNumber,
      'id': id,
      'floor': floor,
      'rent': rent,
      'occupied': occupied,
    };
  }
}