class HouseCategoryResponse {
  int number;
  int numberOfElements;
  int size;
  List<HouseCategoryData> content;
  int totalElements;

  HouseCategoryResponse({
    required this.number,
    required this.numberOfElements,
    required this.size,
    required this.content,
    required this.totalElements,
  });

  factory HouseCategoryResponse.fromJson(Map<String, dynamic> json) {
    return HouseCategoryResponse(
      number: json['number'],
      numberOfElements: json['numberOfElements'],
      size: json['size'],
      content: List<HouseCategoryData>.from(json['content'].map((x) => HouseCategoryData.fromJson(x))),
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

class HouseCategoryData {
  int images;
  String name;
  String estate;
  String property;
  String description;
  int units;
  int id;
  String createdOn;
  int categoryId;
  int status;

  HouseCategoryData({
    required this.images,
    required this.name,
    required this.estate,
    required this.property,
    required this.description,
    required this.units,
    required this.id,
    required this.createdOn,
    required this.categoryId,
    required this.status,
  });

  factory HouseCategoryData.fromJson(Map<String, dynamic> json) {
    return HouseCategoryData(
      images: json['images'],
      name: json['name'],
      estate: json['estate'],
      property: json['property'],
      description: json['description'],
      units: json['units'],
      id: json['id'],
      createdOn: json['createdOn'],
      categoryId: json['categoryId'],
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'images': images,
      'name': name,
      'estate': estate,
      'property': property,
      'description': description,
      'units': units,
      'id': id,
      'createdOn': createdOn,
      'categoryId': categoryId,
      'status': status,
    };
  }
}