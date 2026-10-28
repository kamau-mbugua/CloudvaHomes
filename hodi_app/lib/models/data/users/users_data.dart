class UserData {
  final String lastName;
  final int estateId;
  final String estate;
  final String fullName;
  final String idNo;
  final int userGroupId;
  final String firstName;
  final String groupName;
  final String phone;
  final int id;
  final String email;
  final String username;
  final int status;

  UserData({
    required this.lastName,
    required this.estateId,
    required this.estate,
    required this.fullName,
    required this.idNo,
    required this.userGroupId,
    required this.firstName,
    required this.groupName,
    required this.phone,
    required this.id,
    required this.email,
    required this.username,
    required this.status,
  });

  factory UserData.fromJson(Map<String, dynamic> json) {
    return UserData(
      lastName: json['lastName'],
      estateId: json['estateId'],
      estate: json['estate'],
      fullName: json['fullName'],
      idNo: json['idNo'],
      userGroupId: json['userGroupId'],
      firstName: json['firstName'],
      groupName: json['groupName'],
      phone: json['phone'],
      id: json['id'],
      email: json['email'],
      username: json['username'],
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'lastName': lastName,
      'estateId': estateId,
      'estate': estate,
      'fullName': fullName,
      'idNo': idNo,
      'userGroupId': userGroupId,
      'firstName': firstName,
      'groupName': groupName,
      'phone': phone,
      'id': id,
      'email': email,
      'username': username,
      'status': status,
    };
  }
}