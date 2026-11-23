import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/dates.dart';
import 'package:hodi/features/host/booking_view.dart';
import 'package:hodi/features/host/bookings_screen.dart';
import 'package:hodi/features/host/cleaning_screen.dart';
import 'package:hodi/features/host/guests_screen.dart';
import 'package:hodi/features/host/host_models.dart';
import 'package:hodi/features/host/host_reports_screen.dart';
import 'package:hodi/features/host/report_view.dart';

import '../../staff/helpers.dart';

Map<String, Object?> _booking(String id, String status, {String owed = '0'}) =>
    {
      'id': id,
      'code': 'B0000$id',
      'status': status,
      'source': 'SITE',
      'checkIn': '2026-11-14',
      'checkOut': '2026-11-19',
      'nights': 5,
      'guests': 2,
      'listing': {'id': 'l1', 'title': 'Spacious 1BR Executive'},
      'unit': {'id': 'u1', 'number': '102'},
      'property': {'id': 'p1', 'code': 'MC', 'name': 'Makini Court'},
      'guest': {'id': 'g1', 'name': 'Kelvin Mbugua', 'phone': '+254700000000'},
      'total': '2600000',
      'amountPaid': '2600000',
      'amountRefunded': '0',
      'owed': owed,
    };

void main() {
  group('wording', () {
    test('report periods and ranges', () {
      final p = reportPeriods('2026-11-21');
      expect(p.map((x) => (x.key, x.from, x.to)), [
        ('month', '2026-11-01', '2026-11-21'),
        ('last', '2026-10-01', '2026-10-31'),
        ('3m', '2026-09-01', '2026-11-21'),
        ('year', '2026-01-01', '2026-11-21'),
      ]);
      // January: last month is December of the year before.
      expect(reportPeriods('2027-01-05')[1], (
        key: 'last',
        label: 'Last month',
        from: '2026-12-01',
        to: '2026-12-31',
      ));
      expect(periodRange('2026-11-01', '2026-11-21'), '1 – 21 Nov 2026');
      expect(periodRange('2026-09-01', '2026-11-21'), '1 Sep – 21 Nov 2026');
      expect(
        periodRange('2026-12-01', '2027-01-05'),
        '1 Dec 2026 – 5 Jan 2027',
      );
      expect(percent(0.019), '1.9%');
      expect(percent(0.5), '50%');
      expect(percent(0), '0%');
    });

    test('cleaning urgency comes from the next arrival', () {
      const today = '2026-11-21';
      expect(cleaningUrgency(today, today), (
        label: 'Guest arrives today',
        tone: 'bad',
      ));
      expect(cleaningUrgency('2026-11-22', today).tone, 'warn');
      expect(cleaningUrgency('2026-11-27', today), (
        label: 'Next guest Fri 27 Nov',
        tone: 'ok',
      ));
      expect(cleaningUrgency(null, today).label, 'No arrival booked');
    });

    test('booking status and money pills', () {
      expect(bookingStatusLabel('NO_SHOW'), 'No-show');
      expect(bookingStatusTone('NO_SHOW'), 'bad');
      expect(dayRange('2026-11-28', '2026-12-02'), '28 Nov → 2 Dec');
      final due = HostBooking.fromJson(
        _booking('1', 'CONFIRMED', owed: '1000000'),
      );
      expect(bookingMoneyPill(due), (label: 'KES 10,000 due', tone: 'due'));
      expect(
        bookingMoneyPill(
          HostBooking.fromJson(_booking('2', 'COMPLETED')),
        )?.label,
        'Paid',
      );
      // Closed bookings don't nag about money.
      expect(
        bookingMoneyPill(
          HostBooking.fromJson(_booking('3', 'NO_SHOW', owed: '500')),
        ),
        isNull,
      );
    });
  });

  testWidgets('bookings: friendly statuses and search by guest', (
    tester,
  ) async {
    final queries = <String?>[];
    final adapter = FakeAdapter({
      'GET /host/bookings': (r) {
        queries.add(r.queryParameters['q']?.toString());
        return page([_booking('8', 'COMPLETED'), _booking('7', 'NO_SHOW')]);
      },
    });
    await pumpScreen(
      tester,
      const BookingsScreen(),
      adapter: adapter,
      permissions: const {
        'bookings:view',
        'bookings:create',
        'stay-payments:view',
      },
      orgKind: 'HOST',
    );
    expect(find.text('Checked out'), findsWidgets);
    expect(find.text('No-show'), findsWidgets);
    expect(find.text('COMPLETED'), findsNothing);
    expect(find.text('14 → 19 Nov · 5 nights · 2 guests'), findsNWidgets(2));
    expect(find.text('+ Booking'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'kelvin');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(queries.last, 'kelvin');
  });

  testWidgets('guests: stays, money and review flag as pills', (tester) async {
    final adapter = FakeAdapter({
      'GET /host/guests': (_) => page([
        {
          'id': 'g1',
          'name': 'Kelvin Mbugua',
          'phone': '+254727589261',
          'stays': 2,
          'totalPaid': '750000',
          'lastStay': '2026-11-14',
          'doNotAccept': true,
        },
        {
          'id': 'g2',
          'name': 'Phee Phee',
          'phone': '+254721412483',
          'stays': 0,
          'totalPaid': '0',
        },
      ]),
    });
    await pumpScreen(
      tester,
      const GuestsScreen(),
      adapter: adapter,
      permissions: const {'guests:view', 'stay-payments:view'},
      orgKind: 'HOST',
    );
    expect(find.text('2 stays'), findsOneWidget);
    expect(find.text('KES 7,500 paid'), findsOneWidget);
    expect(find.text('Last Sat 14 Nov'), findsOneWidget);
    expect(find.text('Review before booking'), findsOneWidget);
    expect(find.text('No stays yet'), findsOneWidget);
    expect(find.text('PP'), findsOneWidget); // initials
  });

  testWidgets('cleaning: urgency, whose stay it was, and who cleaned', (
    tester,
  ) async {
    final today = todayIso();
    Map<String, Object?> task(String status) => {
      'id': 't-$status',
      'status': status,
      'unit': {'id': 'u1', 'number': '401', 'title': 'Quiet 1BR retreat'},
      'property': {'id': 'p1', 'name': 'Kileleshwa Suites'},
      'booking': {
        'id': 'b8',
        'code': 'B00008',
        'checkOut': today,
        'guestName': 'Grace Njeri',
      },
      'since': DateTime.now().toUtc().toIso8601String(),
      'nextCheckIn': status == 'OPEN' ? today : null,
      'note': status == 'DONE' ? 'Fresh linens' : null,
      'doneAt': status == 'DONE'
          ? DateTime.now().toUtc().toIso8601String()
          : null,
      'doneBy': status == 'DONE' ? 'Sam Caretaker' : null,
    };
    final adapter = FakeAdapter({
      'GET /host/cleaning': (r) =>
          page([task(r.queryParameters['status'] as String)]),
    });
    await pumpScreen(
      tester,
      const CleaningScreen(),
      adapter: adapter,
      permissions: const {'cleaning:view', 'cleaning:update'},
      orgKind: 'HOST',
    );
    expect(find.text('Guest arrives today'), findsOneWidget);
    expect(find.textContaining('Left by Grace Njeri · B00008'), findsOneWidget);
    expect(find.text('Mark clean'), findsOneWidget);

    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.textContaining('by Sam Caretaker'), findsOneWidget);
    expect(find.text('Fresh linens'), findsOneWidget);
    expect(find.text('Mark clean'), findsNothing);
  });

  testWidgets('reports: periods change the range, and months show as bars', (
    tester,
  ) async {
    final ranges = <String>[];
    final adapter = FakeAdapter({
      'GET /host/reports/summary': (r) {
        ranges.add('${r.queryParameters['from']}..${r.queryParameters['to']}');
        return {
          'data': {
            'rows': [
              {
                'unitId': 'u1',
                'unitNumber': '401',
                'title': 'Quiet 1BR retreat',
                'property': {'id': 'p1', 'name': 'Kileleshwa Suites'},
                'received': '2650000',
                'refunded': '0',
                'expenses': '0',
                'profit': '2650000',
                'nights': 0,
                'occupancy': 0,
                'adr': '0',
              },
            ],
            'totals': {
              'received': '9290000',
              'refunded': '2400000',
              'writtenOff': '2400000',
              'bookedValue': '3150000',
              'expenses': '0',
              'profit': '6890000',
              'nights': 6,
              'occupancy': 0.019,
              'adr': '508300',
            },
            'monthly': [
              {
                'period': '2026-10',
                'received': '0',
                'refunded': '0',
                'expenses': '0',
                'profit': '0',
              },
              {
                'period': '2026-11',
                'received': '9290000',
                'refunded': '2400000',
                'expenses': '0',
                'profit': '6890000',
              },
            ],
          },
        };
      },
    });
    await pumpScreen(
      tester,
      const HostReportsScreen(),
      adapter: adapter,
      permissions: const {'reports:view'},
      orgKind: 'HOST',
    );
    expect(find.text('KES 68,900'), findsOneWidget);
    expect(find.text('1.9%'), findsWidgets);
    expect(find.textContaining('24,000 was written off'), findsOneWidget);
    expect(find.text('Month by month'), findsOneWidget);

    await tester.tap(find.text('Last month'));
    await tester.pumpAndSettle();
    expect(ranges, hasLength(2));
    final last = reportPeriods(todayIso())[1];
    expect(ranges.last, '${last.from}..${last.to}');
  });
}
