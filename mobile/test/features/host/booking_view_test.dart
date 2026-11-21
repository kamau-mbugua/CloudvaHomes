import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/host/booking_view.dart';
import 'package:hodi/features/host/host_models.dart';

HostBooking booking({
  String status = 'COMPLETED',
  int total = 2600000,
  int paid = 2600000,
  int refunded = 2400000,
  int owed = 0,
  List<HostPayment> payments = const [],
  List<HostBookingLine> lines = const [],
  List<({String action, String at, String? by})> activity = const [],
  String? checkedInAt,
  String? checkedOutAt,
  String? cancelReason,
  String phone = '+254700000000',
}) => HostBooking(
  id: 'b1',
  code: 'B00008',
  status: status,
  source: 'SITE',
  checkIn: '2026-11-14',
  checkOut: '2026-11-19',
  nights: 5,
  guests: 2,
  cleaningDone: false,
  listingId: 'l1',
  listingTitle: 'Spacious 1BR Executive',
  unitId: 'u1',
  unitNumber: '102',
  propertyId: 'p1',
  propertyCode: 'MC',
  propertyName: 'Makini Court',
  guestId: 'g1',
  guestName: 'Kelvin Mbugua',
  guestPhone: phone,
  totalCents: total,
  amountPaidCents: paid,
  amountRefundedCents: refunded,
  owedCents: owed,
  payments: payments,
  lines: lines,
  activity: activity,
  createdAt: DateTime(2026, 11, 12, 18, 40).toUtc().toIso8601String(),
  checkedInAt: checkedInAt,
  checkedOutAt: checkedOutAt,
  cancelReason: cancelReason,
);

HostPayment pay(String id, String kind, int cents, DateTime at) => HostPayment(
  id: id,
  number: kind == 'PAYMENT' ? 'SRC-$id' : '',
  kind: kind,
  method: 'MPESA_PAYBILL',
  amountCents: cents,
  paidAt: at.toUtc().toIso8601String(),
);

HostBookingLine night(String date, int cents) => HostBookingLine(
  id: date,
  kind: 'NIGHT',
  date: date,
  label: 'Night of $date',
  amountCents: cents,
);

void main() {
  test('labels', () {
    expect(dayLabel('2026-11-14'), 'Sat 14 Nov');
    expect(shillings(2600000), '26,000');
    expect(bookingStatusLabel('COMPLETED'), 'Checked out');
    expect([1, 2, 3, 4, 11, 12, 21, 22].map(stayOrdinal), [
      'First stay',
      '2nd stay',
      '3rd stay',
      '4th stay',
      '11th stay',
      '12th stay',
      '21st stay',
      '22nd stay',
    ]);
    expect(initials('Kelvin Kamau Mbugua'), 'KK');
    expect(sourceLabel(booking()), 'Booked on your site, 12 Nov');
  });

  test(
    'money: what was paid, refunded and kept, and how the refund went back',
    () {
      final m = moneySummary(
        booking(
          payments: [
            pay('7', 'PAYMENT', 2600000, DateTime(2026, 11, 14, 9, 12)),
            pay('r', 'REFUND', 2400000, DateTime(2026, 11, 20, 11, 2)),
          ],
        ),
      );
      expect(
        (m.paid, m.refunded, m.kept, m.owed),
        (2600000, 2400000, 200000, 0),
      );
      expect(m.pill, 'Settled, nothing owed');
      expect(
        m.text,
        'All amounts in KES. KES 24,000 went back to the guest by M-Pesa paybill on Fri 20 Nov.',
      );

      final due = moneySummary(
        booking(
          status: 'CHECKED_IN',
          paid: 1000000,
          refunded: 0,
          owed: 1600000,
        ),
      );
      expect((due.pill, due.tone), ('KES 16,000 owed', 'due'));
      expect(due.text, contains('KES 16,000 still due.'));
    },
  );

  test('price: nights at the same rate are one row', () {
    final rows = priceRows([
      night('2026-11-14', 550000),
      night('2026-11-15', 500000),
      night('2026-11-16', 500000),
      night('2026-11-17', 500000),
      night('2026-11-18', 500000),
      const HostBookingLine(
        id: 'c',
        kind: 'CLEANING',
        label: 'Cleaning fee',
        amountCents: 50000,
      ),
    ]);
    expect(rows, [
      (title: 'Sat 14 Nov', detail: '1 night', cents: 550000),
      (
        title: 'Sun 15 to Wed 18 Nov',
        detail: '4 nights × 5,000',
        cents: 2000000,
      ),
      (title: 'Cleaning fee', detail: null, cents: 50000),
    ]);
  });

  test('timeline: in time order, with who did what and the receipts', () {
    final events = timeline(
      booking(
        payments: [
          pay('7', 'PAYMENT', 1300000, DateTime(2026, 11, 14, 9, 12)),
          pay('r', 'REFUND', 2400000, DateTime(2026, 11, 20, 11, 2)),
        ],
        checkedInAt: DateTime(2026, 11, 14, 14, 5).toUtc().toIso8601String(),
        checkedOutAt: DateTime(2026, 11, 19, 10, 30).toUtc().toIso8601String(),
        activity: [
          (
            action: 'checked_in',
            at: DateTime(2026, 11, 14, 14, 5).toUtc().toIso8601String(),
            by: 'Kelvin M',
          ),
        ],
      ),
    );
    expect(events.map((e) => e.title), [
      'Booked on your site',
      'Paid KES 13,000',
      'Checked in',
      'Checked out',
      'Refunded KES 24,000',
    ]);
    expect(events[1].meta, 'Sat 14 Nov, 09:12 · M-Pesa paybill · SRC-7');
    expect(events[1].receipt?.id, '7');
    expect(events[2].meta, 'Sat 14 Nov, 14:05 · by Kelvin M');
    expect(events[3].meta, endsWith('unit sent to cleaning'));
    expect(events[4].receipt, isNull);
  });

  group('actions', () {
    bool owner(String _) => true;
    test('a finished stay: message the guest and send the receipt', () {
      final b = booking(
        payments: [pay('7', 'PAYMENT', 2600000, DateTime(2026, 11, 14))],
      );
      final split = splitActs(bookingActs(b, owner, '2026-11-21'));
      expect(split.bar, [BookingAct.message, BookingAct.sendReceipt]);
      expect(split.menu, [BookingAct.refund]);
    });

    test('a request: decline or accept', () {
      final b = booking(
        status: 'REQUESTED',
        paid: 0,
        refunded: 0,
        owed: 2600000,
      );
      final split = splitActs(bookingActs(b, owner, '2026-11-10'));
      expect(split.bar, [BookingAct.decline, BookingAct.accept]);
      expect(split.menu, contains(BookingAct.cancel));
    });

    test('an in-house guest who owes: collect first, no check-out', () {
      final b = booking(
        status: 'CHECKED_IN',
        paid: 1000000,
        refunded: 0,
        owed: 1600000,
      );
      final acts = bookingActs(b, owner, '2026-11-16');
      expect(acts, isNot(contains(BookingAct.checkOut)));
      expect(splitActs(acts).bar, [BookingAct.message, BookingAct.mpesa]);
      expect(acts, contains(BookingAct.writeOff));
    });

    test('a caretaker only checks in', () {
      final b = booking(
        status: 'CONFIRMED',
        paid: 0,
        refunded: 0,
        owed: 2600000,
      );
      final acts = bookingActs(b, (p) => p == 'bookings:update', '2026-11-14');
      expect(acts, [BookingAct.checkIn, BookingAct.message, BookingAct.noShow]);
    });
  });
}
