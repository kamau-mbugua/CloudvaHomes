import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/host/calendar_rules.dart';
import 'package:hodi/features/host/calendar_screen.dart';
import 'package:hodi/features/host/unit_month_screen.dart';
import 'package:hodi/features/host/unit_picker_screen.dart';

import '../../staff/helpers.dart';

final today = DateTime.now().toIso8601String().substring(0, 10);

Map<String, Object?> _unit(String id, String no, String title, String prop) => {
  'unitId': id,
  'listingId': 'l-$id',
  'unitNumber': no,
  'title': title,
  'property': {
    'id': prop,
    'code': prop.toUpperCase(),
    'name': prop == 'p1' ? 'Kileleshwa Suites' : 'Makini Court',
  },
  'nightlyPrice': '1000000',
};

/// u1 has a guest arriving today who owes money; u2 has a guest in the house; u3 is empty.
Map<String, Object?> _calendar() => {
  'data': {
    'units': [
      _unit('u1', '401', 'Quiet 1BR retreat', 'p1'),
      _unit('u2', '402', 'Serene 1BR Garden', 'p1'),
      _unit('u3', '101', 'Cozy 1BR balcony', 'p2'),
    ],
    'items': [
      {
        'id': 'b1',
        'unitId': 'u1',
        'listingId': 'l-u1',
        'kind': 'STAY',
        'status': 'CONFIRMED',
        'checkIn': today,
        'checkOut': addDays(today, 2),
        'guestName': 'David Kimani',
        'code': 'B00012',
        'total': '2000000',
        'paid': '1000000',
        'owed': '1000000',
      },
      {
        'id': 'b2',
        'unitId': 'u2',
        'listingId': 'l-u2',
        'kind': 'STAY',
        'status': 'CHECKED_IN',
        'checkIn': addDays(today, -1),
        'checkOut': addDays(today, 3),
        'guestName': 'Faith Muthoni',
        'code': 'B00010',
        'total': '4000000',
        'paid': '4000000',
        'owed': '0',
      },
    ],
  },
};

const _owner = {
  'bookings:view',
  'bookings:create',
  'bookings:update',
  'stay-payments:view',
  'stay-payments:create',
};

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
  expect(finder, findsOneWidget);
}

void main() {
  testWidgets(
    'the week view shows every unit and filters to free and arriving units',
    (tester) async {
      final adapter = FakeAdapter({
        'GET /host/bookings/calendar': (_) => _calendar(),
      });
      await pumpScreen(
        tester,
        const CalendarScreen(),
        adapter: adapter,
        permissions: _owner,
        orgKind: 'HOST',
      );

      expect(find.text(weekTitle(today)), findsOneWidget);
      expect(find.text('KILELESHWA SUITES'), findsOneWidget);
      expect(find.text('Quiet 1BR retreat'), findsOneWidget);
      expect(find.text('All units 3'), findsOneWidget);
      // u1's guest arrives today and u2's is in the house: only u3 is free tonight.
      expect(find.text('Free tonight 1'), findsOneWidget);
      expect(find.text('David K.'), findsOneWidget);

      await tester.ensureVisible(find.text('Arriving today 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Arriving today 1'));
      await tester.pumpAndSettle();
      expect(find.text('Quiet 1BR retreat'), findsOneWidget);
      expect(find.text('Serene 1BR Garden'), findsNothing);
      // Picking a chip doesn't fetch again.
      expect(adapter.sent('GET', '/host/bookings/calendar'), hasLength(1));
    },
  );

  testWidgets('choose a unit: status lines, search and no match', (
    tester,
  ) async {
    final adapter = FakeAdapter({
      'GET /host/bookings/calendar': (_) => _calendar(),
    });
    await pumpScreen(
      tester,
      const UnitPickerScreen(),
      adapter: adapter,
      permissions: _owner,
      orgKind: 'HOST',
    );

    expect(find.text('David Kimani arrives today'), findsOneWidget);
    expect(find.textContaining('Faith Muthoni until'), findsOneWidget);
    expect(find.text('Free tonight · nothing booked'), findsOneWidget);
    expect(find.text('All units, week view'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'faith');
    await tester.pumpAndSettle();
    expect(find.text('Serene 1BR Garden'), findsOneWidget);
    expect(find.text('Quiet 1BR retreat'), findsNothing);

    await tester.enterText(find.byType(TextField), 'zzz');
    await tester.pumpAndSettle();
    expect(find.textContaining('No unit matches “zzz”'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '');
    await tester.tap(find.text('Occupied'));
    await tester.pumpAndSettle();
    expect(find.text('Cozy 1BR balcony'), findsNothing);
  });

  testWidgets('one unit, month: today’s arrival, then block a free night', (
    tester,
  ) async {
    final adapter = FakeAdapter({
      'GET /host/bookings/calendar': (_) => _calendar(),
      'POST /host/blocks': (_) => {'data': <String, Object?>{}},
    });
    await pumpScreen(
      tester,
      const UnitMonthScreen(unitId: 'u1'),
      adapter: adapter,
      permissions: _owner,
      orgKind: 'HOST',
    );

    expect(find.text('Quiet 1BR retreat'), findsOneWidget);
    expect(find.textContaining('Kileleshwa Suites · Unit 401'), findsOneWidget);
    await _scrollTo(tester, find.textContaining('David Kimani arrives today'));
    expect(find.text('Check in'), findsOneWidget);
    expect(find.text('Send M-Pesa prompt'), findsOneWidget);

    // A free night later in the stay's month (or the first of the month if today is near its end).
    final month = today.substring(0, 7);
    final free = addDays(today, 3).startsWith(month)
        ? addDays(today, 3)
        : '$month-01';
    await tester.ensureVisible(find.byKey(ValueKey('day-$free')));
    await tester.tap(find.byKey(ValueKey('day-$free')));
    await tester.pumpAndSettle();
    await _scrollTo(tester, find.textContaining('booked for this night'));

    if (free.compareTo(today) > 0) {
      await tester.ensureVisible(find.text('Block this date'));
      await tester.tap(find.text('Block this date'));
      await tester.pumpAndSettle();
      final sent = adapter.sent('POST', '/host/blocks').single;
      final body = sent.data is String
          ? jsonDecode(sent.data as String)
          : sent.data;
      expect(body['unitId'], 'u1');
      expect(body['fromDate'], free);
      expect(body['toDate'], addDays(free, 1));
    }
  });

  testWidgets('a caretaker sees no money and no booking actions', (
    tester,
  ) async {
    final adapter = FakeAdapter({
      'GET /host/bookings/calendar': (_) => _calendar(),
    });
    await pumpScreen(
      tester,
      const UnitMonthScreen(unitId: 'u1'),
      adapter: adapter,
      permissions: const {'bookings:view'},
      orgKind: 'HOST',
    );

    await _scrollTo(tester, find.text('Open booking'));
    expect(find.text('Check in'), findsNothing);
    expect(find.text('Send M-Pesa prompt'), findsNothing);
  });
}
