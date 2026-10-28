class AllUserGroup {
  final int userTypeId;
  final String name;
  final String estate;
  final int estateId;
  final int id;

  AllUserGroup({
    required this.userTypeId,
    required this.name,
    required this.estate,
    required this.estateId,
    required this.id,
  });

  factory AllUserGroup.fromJson(Map<String, dynamic> json) {
    return AllUserGroup(
      userTypeId: json['userTypeId'],
      name: json['name'],
      estate: json['estate'],
      estateId: json['estateId'],
      id: json['id'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'userTypeId': userTypeId,
      'name': name,
      'estate': estate,
      'estateId': estateId,
      'id': id,
    };
  }
}