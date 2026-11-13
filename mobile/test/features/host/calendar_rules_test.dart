import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/host/calendar_rules.dart';

void main() {
  test(
    'monthDays marks 2026-12-05 turnover for stays 12-01->12-05 and 12-05->12-07',
    () {
      final days = monthDays('2026-12', const [
        CalItem(
          kind: 'BOOKING',
          id: 'b1',
          unitId: 'u1',
          from: '2026-12-01',
          to: '2026-12-05',
          status: 'CONFIRMED',
        ),
        CalItem(
          kind: 'BOOKING',
          id: 'b2',
          unitId: 'u1',
          from: '2026-12-05',
          to: '2026-12-07',
          status: 'CONFIRMED',
        ),
        CalItem(
          kind: 'BLOCK',
          id: 'bl1',
          unitId: 'u1',
          from: '2026-12-10',
          to: '2026-12-12',
        ),
      ]);

      expect(days.length, 31);
      DayState day(String d) => days.firstWhere((x) => x.date == d);

      expect(day('2026-12-01').status, DayStatus.checkIn);
      expect(day('2026-12-02').status, DayStatus.booked);
      expect(day('2026-12-04').status, DayStatus.booked);
      expect(day('2026-12-05').status, DayStatus.turnover);
      expect(day('2026-12-06').status, DayStatus.booked);
      expect(day('2026-12-07').status, DayStatus.checkOut);
      expect(day('2026-12-08').status, DayStatus.free);
      expect(day('2026-12-10').status, DayStatus.blocked);
      expect(day('2026-12-11').status, DayStatus.blocked);
      expect(day('2026-12-12').status, DayStatus.free);
    },
  );

  test('a guest can be checked in only on a night of the stay', () {
    const s = 'CONFIRMED';
    expect(canCheckIn(s, '2026-11-12', '2026-11-14', '2026-11-11'), isFalse);
    expect(canCheckIn(s, '2026-11-12', '2026-11-14', '2026-11-12'), isTrue);
    expect(canCheckIn(s, '2026-11-12', '2026-11-14', '2026-11-13'), isTrue);
    expect(canCheckIn(s, '2026-11-12', '2026-11-14', '2026-11-14'), isFalse);
    expect(
      canCheckIn('CHECKED_IN', '2026-11-12', '2026-11-14', '2026-11-12'),
      isFalse,
    );
  });

  test('a no-show can be marked only from the check-in day', () {
    expect(canMarkNoShow('CONFIRMED', '2026-11-12', '2026-11-11'), isFalse);
    expect(canMarkNoShow('CONFIRMED', '2026-11-12', '2026-11-12'), isTrue);
    expect(canMarkNoShow('CONFIRMED', '2026-11-12', '2026-11-14'), isTrue);
    expect(canMarkNoShow('CHECKED_IN', '2026-11-12', '2026-11-12'), isFalse);
  });

  test(
    'closed bookings owe nothing; an unpaid no-show shows as not collected',
    () {
      expect(balanceRow('CONFIRMED', 1700000), (
        label: 'Balance owed',
        cents: 1700000,
      ));
      expect(balanceRow('NO_SHOW', 1700000), (
        label: 'Not collected',
        cents: 1700000,
      ));
      expect(balanceRow('NO_SHOW', 0), (label: 'Balance owed', cents: 0));
      for (final s in ['CANCELLED', 'EXPIRED', 'DECLINED']) {
        expect(balanceRow(s, 1700000), (label: 'Balance owed', cents: 0));
      }
      expect(isClosedBooking('NO_SHOW'), isTrue);
      expect(isClosedBooking('COMPLETED'), isFalse);
    },
  );
}
