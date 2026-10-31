/// The signed-in session as the API returns it (`POST /auth/login`, `/auth/refresh`, `GET /me`).
class Session {
  Session({
    required this.accessToken,
    required this.user,
    required this.organizations,
    required this.activeOrganization,
    this.activePropertyId,
    this.properties = const [],
    this.activeTenantId,
    this.activeLandlordId,
    required this.permissions,
    required this.tenantOf,
    required this.ownerOf,
  });

  final String accessToken;
  final SessionUser user;
  final List<OrgMembership> organizations;
  final ActiveOrg? activeOrganization;
  final String? activePropertyId;
  final List<SessionProperty> properties;
  final String? activeTenantId;
  final String? activeLandlordId;
  final Set<String> permissions;
  final List<TenantAccountRef> tenantOf;
  final List<({String landlordId, String name, String orgName})> ownerOf;

  bool can(String permission) => permissions.contains(permission);
  bool get isStaff => activeOrganization != null;
  bool get isTenant => tenantOf.isNotEmpty;
  bool get isOwner => ownerOf.isNotEmpty;
  bool get isPlatformAdmin => user.isPlatformAdmin;

  Session copyWith({
    String? accessToken,
    Object? activePropertyId = _keep,
    Object? activeTenantId = _keep,
    Object? activeLandlordId = _keep,
    List<SessionProperty>? properties,
  }) => Session(
    accessToken: accessToken ?? this.accessToken,
    user: user,
    organizations: organizations,
    activeOrganization: activeOrganization,
    activePropertyId: identical(activePropertyId, _keep)
        ? this.activePropertyId
        : activePropertyId as String?,
    properties: properties ?? this.properties,
    activeTenantId: identical(activeTenantId, _keep)
        ? this.activeTenantId
        : activeTenantId as String?,
    activeLandlordId: identical(activeLandlordId, _keep)
        ? this.activeLandlordId
        : activeLandlordId as String?,
    permissions: permissions,
    tenantOf: tenantOf,
    ownerOf: ownerOf,
  );

  factory Session.fromJson(Map<String, dynamic> j) {
    final active = j['activeOrganization'];
    return Session(
      accessToken: j['accessToken'] as String,
      user: SessionUser.fromJson(j['user'] as Map<String, dynamic>),
      organizations: [
        for (final o in (j['organizations'] as List? ?? const []))
          OrgMembership.fromJson(o as Map<String, dynamic>),
      ],
      activeOrganization: active is Map<String, dynamic>
          ? ActiveOrg.fromJson(active)
          : null,
      activePropertyId: j['activePropertyId'] as String?,
      properties: [
        for (final p in (j['properties'] as List? ?? const []))
          if (p is Map<String, dynamic>) SessionProperty.fromJson(p),
      ],
      activeTenantId: j['activeTenantId'] as String?,
      activeLandlordId: j['activeLandlordId'] as String?,
      permissions: {
        for (final p in (j['permissions'] as List? ?? const [])) p as String,
      },
      tenantOf: [
        for (final t in (j['tenantOf'] as List? ?? const []))
          TenantAccountRef.fromJson(t as Map<String, dynamic>),
      ],
      ownerOf: [
        for (final o in (j['ownerOf'] as List? ?? const []))
          (
            landlordId: (o as Map)['landlordId'] as String,
            name: o['name'] as String,
            orgName: (o['organization'] as Map)['name'] as String,
          ),
      ],
    );
  }
}

const Object _keep = Object();

class SessionProperty {
  SessionProperty({
    required this.id,
    required this.code,
    required this.name,
    this.unitCount = 0,
    this.occupiedCount = 0,
  });
  final String id;
  final String code;
  final String name;
  final int unitCount;
  final int occupiedCount;

  factory SessionProperty.fromJson(Map<String, dynamic> j) => SessionProperty(
    id: j['id'] as String,
    code: j['code'] as String? ?? '',
    name: j['name'] as String? ?? '',
    unitCount: (j['unitCount'] as num?)?.toInt() ?? 0,
    occupiedCount: (j['occupiedCount'] as num?)?.toInt() ?? 0,
  );
}

class SessionUser {
  SessionUser({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.email,
    this.phone,
    this.isPlatformAdmin = false,
    this.platformRole,
  });
  final String id;
  final String firstName;
  final String lastName;
  final String? email;
  final String? phone;
  final bool isPlatformAdmin;
  final String? platformRole;

  String get fullName => '$firstName $lastName';
  String get initials =>
      '${firstName.isEmpty ? '' : firstName[0]}${lastName.isEmpty ? '' : lastName[0]}'
          .toUpperCase();

  factory SessionUser.fromJson(Map<String, dynamic> j) => SessionUser(
    id: j['id'] as String,
    firstName: j['firstName'] as String? ?? '',
    lastName: j['lastName'] as String? ?? '',
    email: j['email'] as String?,
    phone: j['phone'] as String?,
    isPlatformAdmin: j['isPlatformAdmin'] == true,
    platformRole: j['platformRole'] as String?,
  );
}

class OrgMembership {
  OrgMembership({required this.id, required this.name, required this.roleName});
  final String id;
  final String name;
  final String roleName;
  factory OrgMembership.fromJson(Map<String, dynamic> j) => OrgMembership(
    id: j['id'] as String,
    name: j['name'] as String,
    roleName: j['roleName'] as String? ?? '',
  );
}

/// `status` drives the Hodi bill banner: TRIAL, ACTIVE, GRACE, SUSPENDED, CLOSED.
class ActiveOrg {
  ActiveOrg({
    required this.id,
    required this.name,
    required this.kind,
    required this.status,
  });
  final String id;
  final String name;
  final String kind;
  final String status;
  factory ActiveOrg.fromJson(Map<String, dynamic> j) => ActiveOrg(
    id: j['id'] as String,
    name: j['name'] as String,
    kind: j['kind'] as String? ?? 'LANDLORD',
    status: j['status'] as String? ?? 'ACTIVE',
  );
}

class TenantAccountRef {
  TenantAccountRef({
    required this.tenantId,
    required this.name,
    required this.orgName,
  });
  final String tenantId;
  final String name;
  final String orgName;
  factory TenantAccountRef.fromJson(Map<String, dynamic> j) => TenantAccountRef(
    tenantId: j['tenantId'] as String,
    name: j['name'] as String,
    orgName: (j['organization'] as Map)['name'] as String,
  );
}
