import '../../core/money.dart';
import '../staff/staff_widgets.dart' show channelKindLabel;
import 'host_models.dart';

/// Wording and grouping for the booking details screen (KodiHQ "Booking details · mobile").
/// Pure functions so they can be tested without widgets.

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

DateTime _date(String iso) {
  final p = iso.substring(0, 10).split('-').map(int.parse).toList();
  return DateTime(p[0], p[1], p[2]);
}

/// "2026-11-14" → "Sat 14 Nov".
String dayLabel(String isoDate) {
  final d = _date(isoDate);
  return '${_days[d.weekday - 1]} ${d.day} ${_months[d.month - 1]}';
}

/// An ISO timestamp in the phone's time → "14:05".
String clockLabel(String isoTimestamp) {
  final t = DateTime.parse(isoTimestamp).toLocal();
  return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
}

/// An ISO timestamp → "Sat 14 Nov, 09:12" in the phone's time.
String whenLabel(String isoTimestamp) {
  final t = DateTime.parse(isoTimestamp).toLocal();
  return '${_days[t.weekday - 1]} ${t.day} ${_months[t.month - 1]}, ${clockLabel(isoTimestamp)}';
}

/// Whole shillings without the currency ("26,000"); the card says "All amounts in KES".
String shillings(int cents) => formatKes(
  cents,
).replaceFirst('KES ', '').replaceFirst(RegExp(r'\.00$'), '');

String bookingStatusLabel(String status) => switch (status) {
  'HELD' => 'Held for payment',
  'REQUESTED' => 'Request',
  'CONFIRMED' => 'Confirmed',
  'CHECKED_IN' => 'Checked in',
  'COMPLETED' => 'Checked out',
  'CANCELLED' => 'Cancelled',
  'NO_SHOW' => 'No-show',
  'EXPIRED' => 'Expired',
  'DECLINED' => 'Declined',
  _ => status,
};

/// "Booked on your site, 12 Nov" / "Added by you, 12 Nov".
String sourceLabel(HostBooking b) {
  final how = b.source == 'SITE' ? 'Booked on your site' : 'Added by you';
  final at = b.createdAt;
  if (at == null || at.length < 10) return how;
  final t = DateTime.parse(at).toLocal();
  return '$how, ${t.day} ${_months[t.month - 1]}';
}

/// "First stay", "2nd stay", "3rd stay", "11th stay"…
String? stayOrdinal(int? n) {
  if (n == null || n < 1) return null;
  if (n == 1) return 'First stay';
  final teen = n % 100 >= 11 && n % 100 <= 13;
  final suffix = teen
      ? 'th'
      : switch (n % 10) {
          1 => 'st',
          2 => 'nd',
          3 => 'rd',
          _ => 'th',
        };
  return '$n$suffix stay';
}

/// "Kelvin Mbugua" → "KM".
String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
  return parts.take(2).map((p) => p[0].toUpperCase()).join();
}

/// The Money card. tone: ok | due | warn | plain.
class MoneySummary {
  const MoneySummary({
    required this.paid,
    required this.refunded,
    required this.kept,
    required this.owed,
    required this.pill,
    required this.tone,
    required this.text,
  });

  final int paid;
  final int refunded;

  /// What the host keeps: paid less refunded.
  final int kept;
  final int owed;
  final String pill;
  final String tone;
  final String text;
}

MoneySummary moneySummary(HostBooking b) {
  final paid = b.amountPaidCents ?? 0;
  final refunded = b.amountRefundedCents ?? 0;
  final kept = paid - refunded;
  final owed = isClosed(b.status) ? 0 : (b.owedCents ?? 0);
  final written = b.writtenOffCents ?? 0;
  final total = b.totalCents ?? 0;

  final sentences = <String>[];
  final refunds = [
    for (final p in b.payments)
      if (p.kind == 'REFUND' && p.voidedAt == null) p,
  ];
  if (refunds.isNotEmpty) {
    final last = refunds.last;
    final how = channelKindLabel[last.method] ?? last.method;
    sentences.add(
      refunds.length == 1
          ? 'KES ${shillings(last.amountCents)} went back to the guest by $how on ${dayLabel(last.paidAt)}.'
          : 'KES ${shillings(refunded)} went back to the guest in ${refunds.length} refunds, the last by $how on ${dayLabel(last.paidAt)}.',
    );
  }
  if (b.status == 'CANCELLED' && (b.cancelReason?.trim().isNotEmpty ?? false)) {
    sentences.add('Reason: ${b.cancelReason!.trim()}.');
  }
  if (written > 0) {
    sentences.add(
      'KES ${shillings(written)} written off'
      '${(b.writeOffReason?.trim().isNotEmpty ?? false) ? ': ${b.writeOffReason!.trim()}' : ''}.',
    );
  }
  if (owed > 0) {
    final due = b.balanceDueOn;
    sentences.add(
      'KES ${shillings(owed)} still due${due != null ? ', by ${dayLabel(due)}' : ''}.',
    );
  } else if (b.status == 'NO_SHOW' && (b.owedCents ?? 0) > 0) {
    sentences.add('KES ${shillings(b.owedCents!)} was never collected.');
  }

  final (pill, tone) = owed > 0
      ? ('KES ${shillings(owed)} owed', 'due')
      : written > 0
      ? ('Written off', 'warn')
      : kept > 0 || total == 0
      ? ('Settled, nothing owed', 'ok')
      : ('Nothing paid', 'plain');

  return MoneySummary(
    paid: paid,
    refunded: refunded,
    kept: kept,
    owed: owed,
    pill: pill,
    tone: tone,
    text: ['All amounts in KES.', ...sentences].join(' '),
  );
}

bool isClosed(String status) =>
    const {'NO_SHOW', 'CANCELLED', 'EXPIRED', 'DECLINED'}.contains(status);

/// A row of the Price card: consecutive nights at the same rate are one row.
typedef PriceRow = ({String title, String? detail, int cents});

List<PriceRow> priceRows(List<HostBookingLine> lines) {
  final out = <PriceRow>[];
  var i = 0;
  while (i < lines.length) {
    final l = lines[i];
    if (l.kind == 'NIGHT' && l.date != null) {
      var j = i;
      while (j + 1 < lines.length &&
          lines[j + 1].kind == 'NIGHT' &&
          lines[j + 1].date != null &&
          lines[j + 1].amountCents == l.amountCents) {
        j++;
      }
      final n = j - i + 1;
      final first = lines[i].date!;
      final last = lines[j].date!;
      out.add((
        title: n == 1
            ? dayLabel(first)
            : '${_rangeStart(first, last)} to ${dayLabel(last)}',
        detail: n == 1 ? '1 night' : '$n nights × ${shillings(l.amountCents)}',
        cents: l.amountCents * n,
      ));
      i = j + 1;
      continue;
    }
    out.add((title: l.label, detail: null, cents: l.amountCents));
    i++;
  }
  return out;
}

/// "Sun 15" when the range ends in the same month, else "Sun 15 Nov".
String _rangeStart(String first, String last) {
  final a = _date(first);
  final b = _date(last);
  return a.month == b.month
      ? '${_days[a.weekday - 1]} ${a.day}'
      : dayLabel(first);
}

/// One step on the "What happened" timeline. kind: neutral | pay | stay | refund | bad.
class TimelineEvent {
  const TimelineEvent({
    required this.at,
    required this.kind,
    required this.title,
    required this.meta,
    this.receipt,
  });

  final String at;
  final String kind;
  final String title;
  final String meta;

  /// A payment with a receipt to open.
  final HostPayment? receipt;
}

List<TimelineEvent> timeline(HostBooking b) {
  String? by(String action) {
    for (final a in b.activity) {
      if (a.action == action && a.by != null) return a.by;
    }
    return null;
  }

  String meta(String at, List<String?> parts) => [
    whenLabel(at),
    ...parts.whereType<String>().where((p) => p.isNotEmpty),
  ].join(' · ');

  final out = <TimelineEvent>[];
  final created = b.createdAt;
  if (created != null) {
    final who = by('create');
    out.add(
      TimelineEvent(
        at: created,
        kind: 'neutral',
        title: b.source == 'SITE' ? 'Booked on your site' : 'Booking added',
        meta: meta(created, [
          if (who != null) 'by $who',
          if (b.totalCents != null) 'total KES ${shillings(b.totalCents!)}',
        ]),
      ),
    );
  }
  for (final p in b.payments) {
    final how = channelKindLabel[p.method] ?? p.method;
    final refund = p.kind == 'REFUND';
    final voided = p.voidedAt != null;
    out.add(
      TimelineEvent(
        at: p.paidAt,
        kind: voided
            ? 'bad'
            : refund
            ? 'refund'
            : 'pay',
        title:
            '${refund ? 'Refunded' : 'Paid'} KES ${shillings(p.amountCents)}${voided ? ' (voided)' : ''}',
        meta: meta(p.paidAt, [
          how,
          p.number.isNotEmpty ? p.number : p.reference,
          if (voided && (p.voidReason?.isNotEmpty ?? false))
            'voided: ${p.voidReason}',
        ]),
        receipt: p.hasReceipt ? p : null,
      ),
    );
  }
  void step(
    String? at,
    String kind,
    String title,
    String action, [
    String? extra,
  ]) {
    if (at == null) return;
    final who = by(action);
    out.add(
      TimelineEvent(
        at: at,
        kind: kind,
        title: title,
        meta: meta(at, [if (who != null) 'by $who', extra]),
      ),
    );
  }

  step(b.checkedInAt, 'stay', 'Checked in', 'checked_in');
  step(
    b.checkedOutAt,
    'stay',
    'Checked out',
    'completed',
    b.cleaningDone ? 'unit cleaned' : 'unit sent to cleaning',
  );
  step(
    b.writtenOffAt,
    'bad',
    'Balance written off',
    'balance_written_off',
    b.writeOffReason,
  );
  step(b.cancelledAt, 'bad', 'Cancelled', 'cancelled', b.cancelReason);
  for (final a in b.activity) {
    final title = switch (a.action) {
      'no_show' => 'Marked as no-show',
      'declined' => 'Request declined',
      // A payment confirming a held booking has no staff actor; a host accepting a request does.
      'confirmed' when a.by != null => 'Request accepted',
      _ => null,
    };
    if (title != null) {
      out.add(
        TimelineEvent(
          at: a.at,
          kind: a.action == 'confirmed' ? 'neutral' : 'bad',
          title: title,
          meta: meta(a.at, [if (a.by != null) 'by ${a.by}']),
        ),
      );
    }
  }
  out.sort((x, y) => DateTime.parse(x.at).compareTo(DateTime.parse(y.at)));
  return out;
}

enum BookingAct {
  accept,
  decline,
  checkIn,
  checkOut,
  noShow,
  mpesa,
  recordPayment,
  refund,
  writeOff,
  cancel,
  message,
  sendReceipt,
}

String bookingActLabel(BookingAct a, HostBooking b) => switch (a) {
  BookingAct.accept => 'Accept',
  BookingAct.decline => 'Decline',
  BookingAct.checkIn => 'Check in',
  BookingAct.checkOut => 'Check out',
  BookingAct.noShow => 'Mark no-show',
  BookingAct.mpesa => 'M-Pesa prompt',
  BookingAct.recordPayment => 'Record payment',
  BookingAct.refund => 'Refund',
  BookingAct.writeOff => 'Write off balance',
  BookingAct.cancel => 'Cancel booking',
  BookingAct.message => 'Message guest',
  BookingAct.sendReceipt => 'Send receipt',
};

/// Everything the caller may do on this booking now, most useful first.
List<BookingAct> bookingActs(
  HostBooking b,
  bool Function(String permission) can,
  String today,
) {
  final owed = isClosed(b.status) ? 0 : (b.owedCents ?? 0);
  final netPaid = (b.amountPaidCents ?? 0) - (b.amountRefundedCents ?? 0);
  final update = can('bookings:update');
  final checkInOk =
      b.status == 'CONFIRMED' &&
      b.checkIn.compareTo(today) <= 0 &&
      today.compareTo(b.checkOut) < 0;
  return [
    if (update && b.status == 'REQUESTED') ...[
      BookingAct.accept,
      BookingAct.decline,
    ],
    if (update && checkInOk) BookingAct.checkIn,
    // Check-out waits until the stay is paid in full (or the rest is written off).
    if (update && b.status == 'CHECKED_IN' && owed == 0) BookingAct.checkOut,
    if (b.hasMoney && owed > 0 && can('stay-payments:create')) ...[
      BookingAct.mpesa,
      BookingAct.recordPayment,
    ],
    if (b.guestPhone.isNotEmpty) BookingAct.message,
    if (can('stay-payments:create') && b.payments.any((p) => p.hasReceipt))
      BookingAct.sendReceipt,
    if (update && b.status == 'CONFIRMED' && b.checkIn.compareTo(today) <= 0)
      BookingAct.noShow,
    if (b.hasMoney &&
        can('stay-payments:refund') &&
        b.status == 'CHECKED_IN' &&
        owed > 0)
      BookingAct.writeOff,
    if (b.hasMoney && can('stay-payments:refund') && netPaid > 0)
      BookingAct.refund,
    if (can('bookings:cancel') &&
        const {
          'REQUESTED',
          'HELD',
          'CONFIRMED',
          'CHECKED_IN',
        }.contains(b.status))
      BookingAct.cancel,
  ];
}

/// The sticky bar: up to two actions (the second is the primary, on the right), the rest go in
/// the ⋮ menu.
({List<BookingAct> bar, List<BookingAct> menu}) splitActs(
  List<BookingAct> acts,
) {
  BookingAct? pick(List<BookingAct> order, [BookingAct? not]) {
    for (final a in order) {
      if (a != not && acts.contains(a)) return a;
    }
    return null;
  }

  final primary = pick(const [
    BookingAct.accept,
    BookingAct.checkIn,
    BookingAct.checkOut,
    BookingAct.mpesa,
    BookingAct.sendReceipt,
    BookingAct.message,
  ]);
  final secondary = pick(const [
    BookingAct.decline,
    BookingAct.message,
    BookingAct.recordPayment,
  ], primary);
  final bar = [?secondary, ?primary];
  return (
    bar: bar,
    menu: [
      for (final a in acts)
        if (!bar.contains(a)) a,
    ],
  );
}

/// Pill colour for a booking status (see detail_ui's tones).
String bookingStatusTone(String status) => switch (status) {
  'CONFIRMED' => 'ok',
  'CHECKED_IN' => 'plain',
  'REQUESTED' || 'HELD' => 'info',
  'NO_SHOW' || 'CANCELLED' || 'DECLINED' || 'EXPIRED' => 'bad',
  _ => 'plain',
};

/// "14 → 19 Nov", or "28 Nov → 2 Dec" across months.
String dayRange(String checkIn, String checkOut) {
  final a = _date(checkIn);
  final b = _date(checkOut);
  return a.month == b.month && a.year == b.year
      ? '${a.day} → ${b.day} ${_months[b.month - 1]}'
      : '${a.day} ${_months[a.month - 1]} → ${b.day} ${_months[b.month - 1]}';
}

/// The money pill on a booking row: what's owed, or that it's paid. Null without money.
({String label, String tone})? bookingMoneyPill(HostBooking b) {
  if (!b.hasMoney || isClosed(b.status)) return null;
  final owed = b.owedCents ?? 0;
  if (owed > 0) return (label: 'KES ${shillings(owed)} due', tone: 'due');
  if ((b.totalCents ?? 0) > 0) return (label: 'Paid', tone: 'ok');
  return null;
}
