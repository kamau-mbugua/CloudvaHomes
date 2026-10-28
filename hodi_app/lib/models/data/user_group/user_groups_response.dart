class UserGroup {
  final String userType;
  final int userTypeId;
  final String createdBy;
  final String name;
  final DateTime modifiedAt;
  final String description;
  final String flag;
  final String estate;
  final int estateId;
  final int id;
  final int status;

  UserGroup({
    required this.userType,
    required this.userTypeId,
    required this.createdBy,
    required this.name,
    required this.modifiedAt,
    required this.description,
    required this.flag,
    required this.estate,
    required this.estateId,
    required this.id,
    required this.status,
  });

  factory UserGroup.fromJson(Map<String, dynamic> json) {
    return UserGroup(
      userType: json['userType'],
      userTypeId: json['userTypeId'],
      createdBy: json['createdBy'],
      name: json['name'],
      modifiedAt: DateTime.parse(json['modified_at']),
      description: json['description'],
      flag: json['flag'],
      estate: json['estate'],
      estateId: json['estateId'],
      id: json['id'],
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'userType': userType,
      'userTypeId': userTypeId,
      'createdBy': createdBy,
      'name': name,
      'modified_at': modifiedAt.toIso8601String(),
      'description': description,
      'flag': flag,
      'estate': estate,
      'estateId': estateId,
      'id': id,
      'status': status,
    };
  }
}

class Pageable {
  final Sort sort;
  final int offset;
  final int pageNumber;
  final int pageSize;
  final bool unpaged;
  final bool paged;

  Pageable({
    required this.sort,
    required this.offset,
    required this.pageNumber,
    required this.pageSize,
    required this.unpaged,
    required this.paged,
  });

  factory Pageable.fromJson(Map<String, dynamic> json) {
    return Pageable(
      sort: Sort.fromJson(json['sort']),
      offset: json['offset'],
      pageNumber: json['pageNumber'],
      pageSize: json['pageSize'],
      unpaged: json['unpaged'],
      paged: json['paged'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'sort': sort.toJson(),
      'offset': offset,
      'pageNumber': pageNumber,
      'pageSize': pageSize,
      'unpaged': unpaged,
      'paged': paged,
    };
  }
}

class Sort {
  final bool empty;
  final bool sorted;
  final bool unsorted;

  Sort({
    required this.empty,
    required this.sorted,
    required this.unsorted,
  });

  factory Sort.fromJson(Map<String, dynamic> json) {
    return Sort(
      empty: json['empty'],
      sorted: json['sorted'],
      unsorted: json['unsorted'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'empty': empty,
      'sorted': sorted,
      'unsorted': unsorted,
    };
  }
}

class UserGroupResponse {
  final List<UserGroup> content;
  final Pageable pageable;
  final bool last;
  final int totalPages;
  final int totalElements;
  final int size;
  final int number;
  final Sort sort;
  final bool first;
  final int numberOfElements;
  final bool empty;

  UserGroupResponse({
    required this.content,
    required this.pageable,
    required this.last,
    required this.totalPages,
    required this.totalElements,
    required this.size,
    required this.number,
    required this.sort,
    required this.first,
    required this.numberOfElements,
    required this.empty,
  });

  factory UserGroupResponse.fromJson(Map<String, dynamic> json) {
    return UserGroupResponse(
      content: (json['content'] as List)
          .map((i) => UserGroup.fromJson(i))
          .toList(),
      pageable: Pageable.fromJson(json['pageable']),
      last: json['last'],
      totalPages: json['totalPages'],
      totalElements: json['totalElements'],
      size: json['size'],
      number: json['number'],
      sort: Sort.fromJson(json['sort']),
      first: json['first'],
      numberOfElements: json['numberOfElements'],
      empty: json['empty'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'content': content.map((i) => i.toJson()).toList(),
      'pageable': pageable.toJson(),
      'last': last,
      'totalPages': totalPages,
      'totalElements': totalElements,
      'size': size,
      'number': number,
      'sort': sort.toJson(),
      'first': first,
      'numberOfElements': numberOfElements,
      'empty': empty,
    };
  }
}