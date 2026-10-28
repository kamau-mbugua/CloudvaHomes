import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:hodi/core/api/api_client.dart';

/// A recorded request.
class Call {
  Call(this.method, this.path, this.query, this.headers, this.body);
  final String method;
  final String path;
  final Map<String, dynamic> query;
  final Map<String, dynamic> headers;
  final Object? body;
}

typedef Responder = (int, Object?) Function(Call call);

/// Answers requests from a handler and records them; no network.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.respond);
  Responder respond;
  final calls = <Call>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions o,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    Object? body = o.data;
    final call = Call(o.method, o.path, o.queryParameters, o.headers, body);
    calls.add(call);
    final (status, json) = respond(call);
    return ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// An ApiClient whose HTTP goes to [adapter].
ApiClient fakeClient(FakeAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://api.test/api/v1'))
    ..httpClientAdapter = adapter;
  return ApiClient(baseUrl: 'http://api.test/api/v1', dio: dio);
}

Map<String, Object?> errorBody(
  String code,
  String message, [
  List<Map<String, String>>? details,
]) => {
  'error': {'code': code, 'message': message, 'details': ?details},
  'requestId': 'req-1',
};

/// A session payload as the API returns it.
Map<String, Object?> sessionJson({
  String token = 'access-1',
  String? refreshToken = 'refresh-1',
  List<String> permissions = const [],
  bool staff = true,
  bool tenant = false,
  String status = 'ACTIVE',
}) => {
  'accessToken': token,
  'accessTokenExpiresAt': '2026-10-28T12:00:00.000Z',
  'refreshToken': ?refreshToken,
  'user': {
    'id': 'u1',
    'firstName': 'Olive',
    'lastName': 'Owner',
    'email': 'owner@example.invalid',
    'phone': '+254700000001',
    'isPlatformAdmin': false,
  },
  'organizations': staff
      ? [
          {
            'id': 'o1',
            'name': 'Test Org',
            'kind': 'LANDLORD',
            'roleName': 'Owner',
            'isOwner': true,
          },
        ]
      : [],
  'activeOrganization': staff
      ? {'id': 'o1', 'name': 'Test Org', 'kind': 'LANDLORD', 'status': status}
      : null,
  'permissions': permissions,
  'ownerOf': [],
  'tenantOf': tenant
      ? [
          {
            'tenantId': 't1',
            'name': 'Tom Tenant',
            'organization': {'id': 'o1', 'name': 'Test Org'},
          },
        ]
      : [],
};
