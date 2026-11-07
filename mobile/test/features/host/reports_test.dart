import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/features/host/host_reports_screen.dart';

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
  permissions: const {'reports:view'},
  tenantOf: const [],
  ownerOf: const [],
);

void main() {
  testWidgets(
    'reports screen shows profit per unit and has no overflow at 2x text scale',
    (tester) async {
      phoneSize(tester);

      final adapter = FakeAdapter({
        'GET /host/reports/summary': (_) => {
          'data': {
            'rows': [
              {
                'unitId': 'u1',
                'listingId': 'l1',
                'unitNumber': 'A1',
                'title': 'Sea Breeze Studio',
                'property': {'id': 'p1', 'code': 'P001', 'name': 'Ocean View'},
                'received': '750000',
                'refunded': '0',
                'bookedValue': '750000',
                'unitExpenses': '100000',
                'sharedExpenses': '50000',
                'expenses': '150000',
                'profit': '600000',
                'nights': 3,
                'occupancy': 0.5,
                'adr': '250000',
              },
            ],
            'totals': {
              'received': '750000',
              'refunded': '0',
              'bookedValue': '750000',
              'unitExpenses': '100000',
              'sharedExpenses': '50000',
              'expenses': '150000',
              'profit': '600000',
              'nights': 3,
              'occupancy': 0.5,
              'adr': '250000',
            },
            'sharedByProperty': [
              {
                'property': {'id': 'p1', 'code': 'P001', 'name': 'Ocean View'},
                'sharedExpenses': '50000',
              },
            ],
            'monthly': [
              {
                'period': '2026-12',
                'received': '750000',
                'refunded': '0',
                'expenses': '150000',
                'profit': '600000',
                'bookedValue': '750000',
              },
            ],
          },
        },
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(fakeApi(adapter)),
            sessionProvider.overrideWith(() => FakeSession(_session())),
          ],
          child: const MaterialApp(
            home: MediaQuery(
              data: MediaQueryData(
                size: Size(390, 844),
                textScaler: TextScaler.linear(2.0),
              ),
              child: HostReportsScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      await tester.drag(find.byType(ListView), const Offset(0, -300));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Sea Breeze Studio'), findsOneWidget);
      expect(find.textContaining('6,000.00'), findsWidgets);
    },
  );
}
