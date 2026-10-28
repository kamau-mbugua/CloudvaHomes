import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/api/api_client.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/providers.dart';

/// A canned answer: status + JSON body.
class Reply {
  Reply(this.status, this.body);
  final int status;
  final Object? body;
}

/// Throw this from a handler to simulate a dropped connection (no response).
class DropConnection implements Exception {}

typedef Handler = Object? Function(RequestOptions request);

/// Answers requests by "METHOD /path" (path without `/api/v1`) and records every request.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handlers);
  final Map<String, Handler> handlers;
  final requests = <RequestOptions>[];

  List<RequestOptions> sent(String method, String path) => [
    for (final r in requests)
      if (r.method == method && _path(r) == path) r,
  ];

  static String _path(RequestOptions r) =>
      r.uri.path.replaceFirst('/api/v1', '');

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final key = '${options.method} ${_path(options)}';
    final handler = handlers[key];
    Object? result;
    if (handler == null) {
      result = Reply(404, {
        'error': {'code': 'NOT_FOUND', 'message': 'No fake for $key'},
      });
    } else {
      result = handler(options);
    }
    if (result is DropConnection) throw result;
    final reply = result is Reply ? result : Reply(200, result);
    return ResponseBody.fromString(
      jsonEncode(reply.body),
      reply.status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

ApiClient fakeApi(FakeAdapter adapter) => ApiClient(
  baseUrl: 'http://hodi.invalid/api/v1',
  dio: Dio(BaseOptions(baseUrl: 'http://hodi.invalid/api/v1'))
    ..httpClientAdapter = adapter,
);

Session staffSession(Set<String> permissions) => Session(
  accessToken: 'token',
  user: SessionUser(
    id: 'u1',
    firstName: 'Staff',
    lastName: 'User',
    email: 'staff@example.invalid',
    phone: '+254700000001',
  ),
  organizations: [
    OrgMembership(id: 'o1', name: 'Test Org', roleName: 'Manager'),
  ],
  activeOrganization: ActiveOrg(
    id: 'o1',
    name: 'Test Org',
    kind: 'LANDLORD',
    status: 'ACTIVE',
  ),
  permissions: permissions,
  tenantOf: const [],
  ownerOf: const [],
);

class FakeSession extends SessionController {
  FakeSession(this.session);
  final Session session;
  @override
  Future<Session?> build() async => session;
}

List<Override> overridesFor(FakeAdapter adapter, Set<String> permissions) => [
  apiClientProvider.overrideWithValue(fakeApi(adapter)),
  sessionProvider.overrideWith(() => FakeSession(staffSession(permissions))),
];

/// A phone-sized screen (360 × 800 logical pixels).
void phoneSize(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

Future<void> pumpScreen(
  WidgetTester tester,
  Widget child, {
  required FakeAdapter adapter,
  required Set<String> permissions,
}) async {
  phoneSize(tester);
  await tester.pumpWidget(
    ProviderScope(
      overrides: overridesFor(adapter, permissions),
      child: MaterialApp(home: child),
    ),
  );
  await tester.pumpAndSettle();
}

Map<String, Object?> page(
  List<Object?> rows, {
  int page = 1,
  int pages = 1,
}) => {
  'data': rows,
  'meta': {'page': page, 'pageSize': 20, 'total': rows.length, 'pages': pages},
};

Map<String, Object?> tenantRefJson([String id = 't1']) => {
  'id': id,
  'code': 'T0001',
  'firstName': 'Amina',
  'lastName': 'Test',
  'phone': '+254700000010',
};

Map<String, Object?> tenantJson([String id = 't1', int balance = 1500000]) => {
  ...tenantRefJson(id),
  'email': 'amina@example.invalid',
  'emergencyContactName': null,
  'emergencyContactPhone': null,
  'status': 'CURRENT',
  'currentUnits': [
    {
      'tenancyId': 'ty1',
      'unitId': 'un1',
      'unitNumber': 'A1',
      'propertyName': 'Test Court',
    },
  ],
  'balance': balance,
  'creditBalance': 0,
  'remindersOff': false,
};

Map<String, Object?> paymentJson({String id = 'p1', int amount = 1000000}) => {
  'id': id,
  'number': 'RCT-2026-000012',
  'method': 'CASH',
  'amount': amount,
  'unallocated': 0,
  'reference': null,
  'paidBy': null,
  'note': null,
  'receivedAt': '2026-10-28',
  'tenant': tenantRefJson(),
  'channel': {'id': 'c1', 'name': 'Office cash', 'kind': 'CASH'},
  'reversesId': null,
  'reversedBy': null,
  'reversalReason': null,
  'recordedBy': {'id': 'u1', 'name': 'Staff User'},
  'allocations': [
    {
      'invoice': {
        'id': 'i1',
        'number': 'INV-2026-000001',
        'period': '2026-10',
        'kind': 'MONTHLY',
      },
      'amount': amount,
    },
  ],
  'receiptSent': true,
};
