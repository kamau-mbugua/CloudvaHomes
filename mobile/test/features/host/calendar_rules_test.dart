import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/host/calendar_rules.dart';

const today = '2026-11-21'; // a Saturday

CalItem stay(
  String id,
  String from,
  String to, {
  String status = 'CONFIRMED',
  String unitId = 'u1',
  String guest = 'David Kimani',
  int? owed,
  int? total,
  int? paid,
}) => CalItem(
  kind: 'BOOKING',
  id: id,
  unitId: unitId,
  from: from,
  to: to,
  status: status,
  guestName: guest,
  code: 'B-$id',
  owedCents: owed,
  totalCents: total,
  paidCents: paid,
);

CalItem block(String id, String from, String to, {String? reason}) => CalItem(
  kind: 'BLOCK',
  id: id,
  unitId: 'u1',
  from: from,
  to: to,
  status: 'CONFIRMED',
  reason: reason,
);

const unit = CalUnit(
  id: 'u1',
  number: '401',
  title: 'Quiet 1BR retreat',
  listingId: 'l1',
  propertyId: 'p1',
  propertyName: 'Kileleshwa Suites',
  nightlyPriceCents: 1000000,
);

final week = [for (var i = 0; i < 7; i++) addDays(today, i)];

void main() {
  test('parses the calendar API shape, money included', () {
    final it = CalItem.fromJson({
      'id': 'b1',
      'unitId': 'u1',
      'listingId': 'l1',
      'kind': 'STAY',
      'status': 'CONFIRMED',
      'checkIn': '2026-12-01',
      'checkOut': '2026-12-05',
      'guestName': 'Guest One',
      'hostNote': null,
      'code': 'BK-1',
      'total': '2000000',
      'paid': '1000000',
      'owed': '1000000',
    });
    expect(it.kind, 'BOOKING');
    expect((it.from, it.to), ('2026-12-01', '2026-12-05'));
    expect(it.owedCents, 1000000);

    final b = CalItem.fromJson({
      'kind': 'BLOCK',
      'checkIn': '2026-12-10',
      'checkOut': '2026-12-12',
      'hostNote': 'Repairs',
    });
    expect((b.kind, b.reason, b.owedCents), ('BLOCK', 'Repairs', null));

    final u = CalUnit.fromJson({
      'unitId': 'u1',
      'listingId': 'l1',
      'unitNumber': '401',
      'title': 'Quiet 1BR retreat',
      'property': {'id': 'p1', 'code': 'KS', 'name': 'Kileleshwa Suites'},
      'nightlyPrice': '1000000',
    });
    expect(
      (u.id, u.number, u.propertyName, u.nightlyPriceCents),
      ('u1', '401', 'Kileleshwa Suites', 1000000),
    );
  });

  group('week bars', () {
    test(
      'places stays by night, marks ones carrying past the week, and flags money due',
      () {
        final spans = rowSpans(week, [
          stay('a', today, '2026-11-23', owed: 1000000),
          stay('b', '2026-11-26', '2026-12-02', guest: 'Lucy Akinyi'),
          stay('c', '2026-11-25', '2026-11-26', status: 'REQUESTED'),
        ], today);
        expect(
          spans.map(
            (s) => (s.start, s.end, s.kind, s.label, s.due, s.openRight),
          ),
          [
            (0, 1, SpanKind.confirmed, 'David K.', true, false),
            (4, 4, SpanKind.request, 'Request', false, false),
            (5, 6, SpanKind.confirmed, 'Lucy A.', false, true),
          ],
        );
      },
    );

    test(
      'shows an overdue guest in red up to tonight, and blocks by their note',
      () {
        final spans = rowSpans(week, [
          stay('late', '2026-11-15', '2026-11-19', status: 'CHECKED_IN'),
          block('k', '2026-11-25', '2026-12-01', reason: 'Owner use'),
        ], today);
        expect(
          spans.map((s) => (s.start, s.end, s.kind, s.label, s.openLeft)),
          [
            (0, 0, SpanKind.overdue, 'Late', true),
            (4, 6, SpanKind.blocked, 'Owner use', false),
          ],
        );
      },
    );

    test('leaves out cancelled stays', () {
      expect(
        rowSpans(week, [
          stay('x', today, '2026-11-23', status: 'CANCELLED'),
        ], today),
        isEmpty,
      );
    });
  });

  group('unit status', () {
    test('free tonight and arriving today', () {
      expect(
        freeTonight([stay('a', '2026-11-22', '2026-11-24')], today),
        isTrue,
      );
      expect(
        freeTonight([
          stay('a', '2026-11-20', '2026-11-22', status: 'CHECKED_IN'),
        ], today),
        isFalse,
      );
      // A guest leaving today frees the night.
      expect(
        freeTonight([
          stay('a', '2026-11-19', today, status: 'CHECKED_IN'),
        ], today),
        isTrue,
      );
      expect(
        freeTonight([
          stay('late', '2026-11-15', '2026-11-19', status: 'CHECKED_IN'),
        ], today),
        isFalse,
      );
      expect(arrivingToday([stay('a', today, '2026-11-23')], today), isTrue);
      expect(
        arrivingToday([
          stay('a', today, '2026-11-23', status: 'CHECKED_IN'),
        ], today),
        isFalse,
      );
    });

    test('says who is there, or what comes next', () {
      String line(List<CalItem> items) => unitLine(items, today).text;
      expect(
        line([stay('l', '2026-11-15', '2026-11-19', status: 'CHECKED_IN')]),
        'Check-out overdue since 19 Nov',
      );
      expect(
        line([stay('a', today, '2026-11-23')]),
        'David Kimani arrives today',
      );
      expect(
        line([
          stay(
            'f',
            '2026-11-20',
            '2026-11-23',
            status: 'CHECKED_IN',
            guest: 'Faith Muthoni',
          ),
        ]),
        'Faith Muthoni until 23 Nov',
      );
      expect(
        line([stay('n', '2026-12-03', '2026-12-05')]),
        'Free tonight · next booking 3 Dec',
      );
      expect(
        line([block('k', '2026-11-25', '2026-11-28')]),
        'Free tonight · blocked from 25 Nov',
      );
      expect(
        line([stay('r', '2026-11-26', '2026-11-28', status: 'REQUESTED')]),
        'Free tonight · request for 26 Nov',
      );
      expect(line([]), 'Free tonight · nothing booked');
    });
  });

  group('month', () {
    test('titles, paging and Monday-first weeks', () {
      expect(weekTitle(today), '21 to 27 November');
      expect(weekTitle('2026-11-28'), '28 November to 4 December');
      expect(monthTitle('2026-11'), 'November 2026');
      expect(shiftMonth('2026-12', 1), '2027-01');
      final weeks = monthWeeks('2026-11');
      // 1 November 2026 is a Sunday: the first row starts Monday 26 October.
      expect(weeks.first.first, '2026-10-26');
      expect(weeks.last.last, '2026-12-06');
      expect(weeks, hasLength(6));
    });

    test(
      'counts booked nights, leaving blocked nights out of what is available',
      () {
        final s = monthStats('2026-11', [
          stay('a', '2026-11-03', '2026-11-06', status: 'COMPLETED'),
          stay('b', today, '2026-11-23'),
          stay('r', '2026-11-25', '2026-11-27', status: 'REQUESTED'),
          block('k', '2026-11-28', '2026-12-01'),
        ], today);
        expect((s.booked, s.days), (5, 30));
        expect(s.occupancy, closeTo(5 / 27, 0.0001));
      },
    );
  });

  group('day card', () {
    test('a free night offers a booking or a block, with the nightly rate', () {
      final info = dayInfo('2026-11-24', [], unit, today);
      expect(info.title, 'Tuesday, 24 November');
      expect(info.pill, 'Free night');
      expect(
        info.text,
        'Nothing is booked for this night. Nightly rate KES 10,000.00.',
      );
      expect(info.actions, [DayAction.newBooking, DayAction.block]);
      expect(dayInfo('2026-11-10', [], unit, today).actions, isEmpty);
    });

    test(
      'an arrival today offers check-in and an M-Pesa prompt for what is owed',
      () {
        final info = dayInfo(
          today,
          [
            stay(
              'a',
              today,
              '2026-11-23',
              owed: 1000000,
              total: 2000000,
              paid: 1000000,
            ),
          ],
          unit,
          today,
        );
        expect(info.pill, 'B-a · confirmed');
        expect(
          info.text,
          'David Kimani arrives today for 2 nights, leaving Mon 23. KES 10,000.00 of KES 20,000.00 still due.',
        );
        expect(info.actions, [
          DayAction.checkIn,
          DayAction.mpesa,
          DayAction.openBooking,
        ]);
      },
    );

    test('a past stay, a block and an overdue guest', () {
      final past = dayInfo(
        '2026-11-04',
        [
          stay(
            'p',
            '2026-11-03',
            '2026-11-06',
            status: 'COMPLETED',
            guest: 'Ann Kariuki',
            paid: 3000000,
            owed: 0,
            total: 3000000,
          ),
        ],
        unit,
        today,
      );
      expect(
        past.text,
        'Ann Kariuki stayed 3 nights, 3 Nov to 6 Nov. Paid KES 30,000.00.',
      );
      expect(past.actions, [DayAction.openBooking]);

      final blocked = dayInfo(
        '2026-11-29',
        [block('k', '2026-11-28', '2026-12-01', reason: 'Painting')],
        unit,
        today,
      );
      expect(
        blocked.text,
        'Blocked by you: Painting, 28 Nov to 1 Dec. Guests cannot book these nights.',
      );
      expect(blocked.actions, [DayAction.unblock]);

      final late = dayInfo(
        today,
        [
          stay(
            'l',
            '2026-11-15',
            '2026-11-19',
            status: 'CHECKED_IN',
            owed: 0,
            total: 100,
          ),
        ],
        unit,
        today,
      );
      expect(late.tone, 'bad');
      expect(late.actions.first, DayAction.checkOut);
    });

    test('leaves money out when the caller cannot see it', () {
      final info = dayInfo(
        today,
        [stay('a', today, '2026-11-23')],
        const CalUnit(
          id: 'u1',
          number: '401',
          title: 'Quiet 1BR retreat',
          listingId: 'l1',
          propertyId: 'p1',
          propertyName: 'Kileleshwa Suites',
        ),
        today,
      );
      expect(info.text, isNot(contains('KES')));
      expect(info.actions, isNot(contains(DayAction.mpesa)));
      expect(
        dayInfo(
          '2026-11-24',
          [],
          const CalUnit(
            id: 'u1',
            number: '401',
            title: 'T',
            listingId: 'l1',
            propertyId: 'p1',
            propertyName: 'P',
          ),
          today,
        ).text,
        'Nothing is booked for this night.',
      );
    });
  });

  group('check-in rules', () {
    test('only on a night of the stay', () {
      expect(canCheckIn('CONFIRMED', today, '2026-11-23', today), isTrue);
      expect(
        canCheckIn('CONFIRMED', '2026-11-22', '2026-11-23', today),
        isFalse,
      );
    });
  });
}
