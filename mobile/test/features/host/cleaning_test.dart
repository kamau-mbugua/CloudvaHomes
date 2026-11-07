import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/features/host/cleaning_screen.dart';

import '../../staff/helpers.dart';

Session _session() => Session(
  accessToken: 'token',
  user: SessionUser(
    id: 'u1',
    firstName: 'Wanjiku',
    lastName: 'Host',
    email: 'host@example.invalid',
    phone: '+254700000001',
  ),
  organizations: [
    OrgMembership(
      id: 'o1',
      name: 'Cozy Stays',
      roleName: 'Owner',
      kind: 'HOST',
    ),
  ],
  activeOrganization: ActiveOrg(
    id: 'o1',
    name: 'Cozy Stays',
    kind: 'HOST',
    status: 'ACTIVE',
  ),
  properties: [SessionProperty(id: 'p1', code: 'P001', name: 'Ocean View')],
  permissions: const {'cleaning:view', 'cleaning:update'},
  tenantOf: const [],
  ownerOf: const [],
);

void main() {
  testWidgets('cleaning list Mark done calls POST /host/cleaning/:id/done', (
    tester,
  ) async {
    phoneSize(tester);
    var markedDoneId = '';

    final adapter = FakeAdapter({
      'GET /host/cleaning': (_) => {
        'data': [
          {
            'id': 'ct-1',
            'status': 'OPEN',
            'unit': {'id': 'u1', 'number': 'A1', 'title': 'Sea Breeze Studio'},
            'property': {'id': 'p1', 'code': 'P001', 'name': 'Ocean View'},
            'since': '2026-12-10T09:00:00.000Z',
            'nextCheckIn': '2026-12-12',
            'note': 'Check towels',
          },
        ],
      },
      'POST /host/cleaning/ct-1/done': (_) {
        markedDoneId = 'ct-1';
        return {
          'data': {'id': 'ct-1', 'status': 'DONE'},
        };
      },
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(fakeApi(adapter)),
          sessionProvider.overrideWith(() => FakeSession(_session())),
        ],
        child: const MaterialApp(home: CleaningScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sea Breeze Studio'), findsOneWidget);
    expect(find.text('Mark done'), findsOneWidget);

    await tester.tap(find.text('Mark done'));
    await tester.pumpAndSettle();

    expect(markedDoneId, 'ct-1');
  });
}
