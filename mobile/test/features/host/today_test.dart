import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/features/host/host_dashboard.dart';
import 'package:hodi/features/host/today_screen.dart';

import '../../staff/helpers.dart';

Session _session({required Set<String> permissions}) => Session(
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
  permissions: permissions,
  tenantOf: const [],
  ownerOf: const [],
);

Map<String, Object?> _row({
  required String id,
  required String code,
  required String stage,
  required String status,
  required String guest,
  required String checkIn,
  required String checkOut,
  bool? unitReady,
  bool money = true,
  String owed = '0',
}) => {
  'id': id,
  'code': code,
  'status': status,
  'stage': stage,
  'guestName': guest,
  'guests': 2,
  'unit': {
    'id': 'u-$id',
    'number': 'A1',
    'title': 'Sea Breeze Studio',
    'propertyName': 'Ocean View',
  },
  'checkIn': checkIn,
  'checkOut': checkOut,
  'nights': 2,
  'unitReady': unitReady,
  'requestExpiresAt': null,
  if (money) ...{'total': '2000000', 'paid': '1000000', 'owed': owed},
};

Map<String, Object?> _dashboard({required bool money}) {
  final arriving = _row(
    id: 'b1',
    code: 'BK26120001',
    stage: 'ARRIVES_TODAY',
    status: 'CONFIRMED',
    guest: 'Jane Guest',
    checkIn: '2026-11-21',
    checkOut: '2026-11-23',
    unitReady: false,
    money: money,
    owed: '1000000',
  );
  final request = _row(
    id: 'b2',
    code: 'BK26120002',
    stage: 'REQUESTED',
    status: 'REQUESTED',
    guest: 'Peter Caller',
    checkIn: '2026-11-28',
    checkOut: '2026-12-02',
    money: money,
  );
  return {
    'today': '2026-11-21',
    'summary': {
      'units': 3,
      'properties': [
        {'id': 'p1', 'code': 'P001', 'name': 'Ocean View'},
      ],
      'occupiedTonight': 1,
      'occupancyTonight': 1 / 3,
      'occupancyMonth': 0.31,
      'toClean': money ? 1 : null,
      'toCleanBeforeArrival': money ? 1 : null,
      'money': money
          ? {
              'collectedThisMonth': '6890000',
              'collectedLastMonth': '5420000',
              'dailyThisMonth': ['0'],
              'owed': '1000000',
              'owedBookings': 1,
              'owedOldestSince': '2026-11-21',
            }
          : null,
    },
    'stays': {
      'arriving': [arriving],
      'leaving': <Object?>[],
      'staying': <Object?>[],
    },
    'needs': [
      if (money) {'kind': 'UNIT_NOT_READY', 'booking': arriving},
      {'kind': 'REQUEST', 'booking': request},
    ],
    'nights': [
      for (var i = 0; i < 14; i++)
        {
          'date': '2026-11-${21 + i <= 30 ? 21 + i : 21 + i - 30}',
          'booked': i == 6 ? 3 : 1,
        },
    ],
    'units': {
      'counts': {
        'OCCUPIED': 0,
        'LATE': 0,
        'ARRIVING': 0,
        'TO_CLEAN': 1,
        'READY': 2,
        'BLOCKED': 0,
      },
      'groups': <Object?>[],
    },
    'balances': money ? [arriving] : <Object?>[],
  };
}

Future<void> _pump(
  WidgetTester tester,
  Set<String> permissions, {
  required bool money,
}) async {
  phoneSize(tester);
  final adapter = FakeAdapter({
    'GET /host/dashboard': (_) => {'data': _dashboard(money: money)},
  });
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(fakeApi(adapter)),
        sessionProvider.overrideWith(
          () => FakeSession(_session(permissions: permissions)),
        ),
      ],
      child: const MaterialApp(home: TodayScreen()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('wording', () {
    test('writes the date out and words the chips and pills', () {
      expect(longDate('2026-11-21'), 'Saturday, 21 November');
      expect(stayRange('2026-11-28', '2026-12-02'), '28 Nov → 2 Dec');
      final d = HostDashboard.fromJson(_dashboard(money: true));
      final r = d.arriving.single;
      expect(rowChip(r), (top: 'Today', bottom: 'check-in', tone: 'arrive'));
      expect(payPill(r), (label: 'KES 10,000.00 due', tone: 'due'));
      expect(readyPill(r), (label: 'Not cleaned', tone: 'warn'));
      expect(needView(d.needs.first).title, 'Clean A1 before arrival');
      expect(
        nightsSummary(d.nights.take(7).toList(), 3),
        'Units booked of 3. Fri is your busiest night.',
      );
    });

    test('reads a caretaker’s dashboard without money', () {
      final d = HostDashboard.fromJson(_dashboard(money: false));
      expect(d.money, isNull);
      expect(d.arriving.single.owedCents, isNull);
      expect(payPill(d.arriving.single), isNull);
    });
  });

  testWidgets(
    'shows the owner the summary, what needs them and today’s arrivals',
    (tester) async {
      await _pump(tester, const {
        'bookings:view',
        'bookings:update',
        'bookings:create',
        'stay-payments:view',
        'stay-payments:create',
        'cleaning:view',
      }, money: true);

      expect(find.textContaining('Wanjiku'), findsOneWidget);
      expect(find.text('Saturday, 21 November'), findsOneWidget);
      expect(find.text('1/3'), findsOneWidget);
      expect(find.text('KES 68,900.00'), findsOneWidget);
      expect(find.text('Clean A1 before arrival'), findsOneWidget);
      expect(find.text('New booking request'), findsOneWidget);
      expect(find.text('Record payment'), findsOneWidget);
      expect(find.text('Arriving 1'), findsOneWidget);
      expect(find.text('Jane Guest'), findsOneWidget);

      await tester.ensureVisible(find.text('Leaving 0'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Leaving 0'));
      await tester.pumpAndSettle();
      expect(find.text('No one leaves today.'), findsOneWidget);
    },
  );

  testWidgets('hides money from a caretaker', (tester) async {
    await _pump(tester, const {'bookings:view'}, money: false);

    expect(find.text('Jane Guest'), findsOneWidget);
    expect(find.textContaining('KES'), findsNothing);
    expect(find.text('Record payment'), findsNothing);
    expect(find.text('New booking'), findsNothing);
  });
}
