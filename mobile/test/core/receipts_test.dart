import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/receipts.dart';
import 'package:hodi/features/host/host_models.dart';

void main() {
  test('receipts point at the right PDF and send paths', () {
    final stay = ReceiptRef.stay(
      bookingId: 'b1',
      paymentId: 'p1',
      number: 'SRC-2026-000006',
      guestName: 'Achieng Otieno',
    );
    expect(stay.pdfPath, '/host/bookings/b1/payments/p1/receipt');
    expect(stay.sendPath, '/host/bookings/b1/payments/p1/receipt/send');
    final rent = ReceiptRef.rent(
      paymentId: 'r1',
      number: 'RCT-2026-000012',
      tenantName: 'Pat Mwangi',
      phone: '+254711000301',
    );
    expect(rent.pdfPath, '/payments/r1/receipt');
    expect(rent.sendPath, '/payments/r1/receipt/send');
    expect(rent.hasPhone, isTrue);
  });

  test('says what Send will do, and what went out', () {
    expect(
      receiptSendPlan(
        const ReceiptRef(
          number: 'SRC-1',
          pdfPath: '',
          sendPath: '',
          recipientName: 'A',
          phone: '+254722000333',
          email: 'a@example.invalid',
        ),
      ),
      [
        'SMS to +254722000333 with a link to the receipt.',
        'Email to a@example.invalid with the receipt PDF attached.',
      ],
    );
    expect(
      receiptSendPlan(
        const ReceiptRef(
          number: 'SRC-1',
          pdfPath: '',
          sendPath: '',
          recipientName: 'A',
          hasPhone: false,
          hasEmail: false,
        ),
      ),
      ['No phone number on file, so no SMS.', 'No email on file, so no email.'],
    );
    expect(
      receiptSentMessage('SRC-1', sms: true, email: true).text,
      'Receipt SRC-1 sent by SMS and email.',
    );
    expect(receiptSentMessage('SRC-1', sms: false, email: false).ok, isFalse);
  });

  test('stay payments read the receipt number, date and voided state', () {
    final p = HostPayment.fromJson({
      'id': 'p1',
      'number': 'SRC-2026-000006',
      'kind': 'PAYMENT',
      'method': 'CASH',
      'amount': '1400000',
      'receivedAt': '2026-11-13T09:00:00.000Z',
      'voidedAt': null,
    });
    expect(p.number, 'SRC-2026-000006');
    expect(p.paidAt, '2026-11-13T09:00:00.000Z');
    expect(p.hasReceipt, isTrue);
    final r = HostStayReceipt.fromJson({
      'id': 'p2',
      'number': 'SRC-2026-000007',
      'kind': 'REFUND',
      'method': 'CASH',
      'amount': '50000',
      'receivedAt': '2026-11-13T10:00:00.000Z',
      'voidedAt': null,
      'booking': {'id': 'b1', 'code': 'B00007', 'listingTitle': 'Cozy 1BR'},
      'guest': {
        'name': 'Achieng',
        'phone': null,
        'email': null,
        'hasPhone': true,
        'hasEmail': false,
      },
    });
    expect(r.payment.hasReceipt, isFalse);
    expect(r.bookingCode, 'B00007');
    expect(r.guestHasPhone, isTrue);
    expect(r.guestHasEmail, isFalse);
  });
}
