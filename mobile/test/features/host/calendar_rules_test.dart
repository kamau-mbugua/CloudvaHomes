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
}
