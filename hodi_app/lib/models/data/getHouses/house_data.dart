class HouseData {
  int number;
  int numberOfElements;
  int size;
  List<House> content;
  int totalElements;

  HouseData({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory HouseData.fromJson(Map<String, dynamic> json) {
    return HouseData(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: List<House>.from(json['content'].map((x) => House.fromJson(x))),
      totalElements: json['totalElements'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'number': number,
      'numberOfElements': numberOfElements,
      'size': size,
      'content': List<dynamic>.from(content.map((x) => x.toJson())),
      'totalElements': totalElements,
    };
  }
}

class House {
  String lastOccupied;
  int estateId;
  String houseType;
  String houseNumber;
  String estate;
  bool overdueEstate;
  String description;
  double rent;
  int houseTypeId;
  String createdOn;
  String houseName;
  double squareFt;
  int features;
  String property;
  String location;
  int id;
  int floor;
  String category;
  int propertyId;
  int categoryId;
  bool occupied;
  int status;

  House({
    required this.lastOccupied,
    required this.estateId,
    required this.houseType,
    required this.houseNumber,
    required this.estate,
    required this.overdueEstate,
    required this.description,
    required this.rent,
    required this.houseTypeId,
    required this.createdOn,
    required this.houseName,
    required this.squareFt,
    required this.features,
    required this.property,
    required this.location,
    required this.id,
    required this.floor,
    required this.category,
    required this.propertyId,
    required this.categoryId,
    required this.occupied,
    required this.status,
  });

  factory House.fromJson(Map<String, dynamic> json) {
    return House(
      lastOccupied: json['lastOccupied'] ?? '',
      estateId: json['estateId'] ?? 0,
      houseType: json['houseType'] ?? '',
      houseNumber: json['houseNumber'] ?? '',
      estate: json['estate'] ?? '',
      overdueEstate: json['overdueEstate'] ?? false,
      description: json['description'] ?? '',
      rent: (json['rent'] ?? 0.0).toDouble(),
      houseTypeId: json['houseTypeId'] ?? 0,
      createdOn: json['createdOn'] ?? '',
      houseName: json['houseName'] ?? '',
      squareFt: (json['squareFt'] ?? 0.0).toDouble(),
      features: json['features'] ?? 0,
      property: json['property'] ?? '',
      location: json['location'] ?? '',
      id: json['id'] ?? 0,
      floor: json['floor'] ?? 0,
      category: json['category'] ?? '',
      propertyId: json['propertyId'] ?? 0,
      categoryId: json['categoryId'] ?? 0,
      occupied: json['occupied'] ?? false,
      status: json['status'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'lastOccupied': lastOccupied,
      'estateId': estateId,
      'houseType': houseType,
      'houseNumber': houseNumber,
      'estate': estate,
      'overdueEstate': overdueEstate,
      'description': description,
      'rent': rent,
      'houseTypeId': houseTypeId,
      'createdOn': createdOn,
      'houseName': houseName,
      'squareFt': squareFt,
      'features': features,
      'property': property,
      'location': location,
      'id': id,
      'floor': floor,
      'category': category,
      'propertyId': propertyId,
      'categoryId': categoryId,
      'occupied': occupied,
      'status': status,
    };
  }
}