class Property {
  final String email;
  final String location;
  final int estateId;
  final int id;
  final String name;

  Property({
    required this.email,
    required this.location,
    required this.estateId,
    required this.id,
    required this.name,
  });

  factory Property.fromJson(Map<String, dynamic> json) {
    return Property(
      email: json['email'],
      location: json['location'],
      estateId: json['estateId'],
      id: json['id'],
      name: json['name'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'email': email,
      'location': location,
      'estateId': estateId,
      'id': id,
      'name': name,
    };
  }
}