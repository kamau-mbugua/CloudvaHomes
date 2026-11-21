import '../../core/money.dart';

/// `GET /host/dashboard`: everything on the host's Today tab. Money comes as minor-unit strings
/// and is only present when the caller holds `stay-payments:view`.
class DashRow {
  const DashRow({
    required this.id,
    required this.code,
    required this.status,
    required this.stage,
    required this.guestName,
    required this.guests,
    required this.unitNumber,
    required this.unitTitle,
    required this.propertyName,
    required this.checkIn,
    required this.checkOut,
    required this.nights,
    this.unitReady,
    this.totalCents,
    this.paidCents,
    this.owedCents,
  });

  final String id;
  final String code;
  final String status;

  /// UPCOMING | ARRIVES_TODAY | NEVER_ARRIVED | IN_HOUSE | LEAVES_TODAY | OVERDUE | CHECKED_OUT | REQUESTED
  final String stage;
  final String? guestName;
  final int guests;
  final String unitNumber;
  final String unitTitle;
  final String propertyName;
  final String checkIn;
  final String checkOut;
  final int nights;
  final bool? unitReady;
  final int? totalCents;
  final int? paidCents;
  final int? owedCents;

  factory DashRow.fromJson(Map<String, dynamic> j) {
    final unit = j['unit'] as Map<String, dynamic>? ?? const {};
    int? cents(Object? v) => v is String ? int.tryParse(v) : null;
    return DashRow(
      id: j['id'] as String? ?? '',
      code: j['code'] as String? ?? '',
      status: j['status'] as String? ?? '',
      stage: j['stage'] as String? ?? 'UPCOMING',
      guestName: j['guestName'] as String?,
      guests: (j['guests'] as num?)?.toInt() ?? 1,
      unitNumber: unit['number'] as String? ?? '',
      unitTitle: unit['title'] as String? ?? '',
      propertyName: unit['propertyName'] as String? ?? '',
      checkIn: j['checkIn'] as String? ?? '',
      checkOut: j['checkOut'] as String? ?? '',
      nights: (j['nights'] as num?)?.toInt() ?? 0,
      unitReady: j['unitReady'] as bool?,
      totalCents: cents(j['total']),
      paidCents: cents(j['paid']),
      owedCents: cents(j['owed']),
    );
  }
}

class DashNeed {
  const DashNeed({required this.kind, required this.booking});

  /// OVERDUE_CHECKOUT | UNIT_NOT_READY | REQUEST | NEVER_ARRIVED
  final String kind;
  final DashRow booking;
}

class DashMoney {
  const DashMoney({
    required this.collectedThisMonthCents,
    required this.collectedLastMonthCents,
    required this.owedCents,
    required this.owedBookings,
  });

  final int collectedThisMonthCents;
  final int collectedLastMonthCents;
  final int owedCents;
  final int owedBookings;
}

class HostDashboard {
  const HostDashboard({
    required this.today,
    required this.units,
    required this.occupiedTonight,
    required this.occupancyMonth,
    required this.toClean,
    required this.money,
    required this.arriving,
    required this.leaving,
    required this.staying,
    required this.needs,
    required this.nights,
    required this.unitCounts,
    required this.balances,
  });

  final String today;
  final int units;
  final int occupiedTonight;

  /// 0..1
  final double occupancyMonth;
  final int? toClean;
  final DashMoney? money;
  final List<DashRow> arriving;
  final List<DashRow> leaving;
  final List<DashRow> staying;
  final List<DashNeed> needs;
  final List<({String date, int booked})> nights;

  /// OCCUPIED, LATE, ARRIVING, TO_CLEAN, READY, BLOCKED → count.
  final Map<String, int> unitCounts;
  final List<DashRow> balances;

  int count(String status) => unitCounts[status] ?? 0;

  factory HostDashboard.fromJson(Map<String, dynamic> j) {
    final summary = j['summary'] as Map<String, dynamic>? ?? const {};
    final m = summary['money'] as Map<String, dynamic>?;
    final stays = j['stays'] as Map<String, dynamic>? ?? const {};
    List<DashRow> rows(Object? v) => [
      for (final r in (v as List?) ?? const [])
        if (r is Map<String, dynamic>) DashRow.fromJson(r),
    ];
    int cents(Object? v) => v is String ? int.tryParse(v) ?? 0 : 0;
    final counts =
        (j['units'] as Map<String, dynamic>?)?['counts']
            as Map<String, dynamic>? ??
        const {};
    return HostDashboard(
      today: j['today'] as String? ?? '',
      units: (summary['units'] as num?)?.toInt() ?? 0,
      occupiedTonight: (summary['occupiedTonight'] as num?)?.toInt() ?? 0,
      occupancyMonth: (summary['occupancyMonth'] as num?)?.toDouble() ?? 0,
      toClean: (summary['toClean'] as num?)?.toInt(),
      money: m == null
          ? null
          : DashMoney(
              collectedThisMonthCents: cents(m['collectedThisMonth']),
              collectedLastMonthCents: cents(m['collectedLastMonth']),
              owedCents: cents(m['owed']),
              owedBookings: (m['owedBookings'] as num?)?.toInt() ?? 0,
            ),
      arriving: rows(stays['arriving']),
      leaving: rows(stays['leaving']),
      staying: rows(stays['staying']),
      needs: [
        for (final n in (j['needs'] as List?) ?? const [])
          if (n is Map<String, dynamic> && n['booking'] is Map<String, dynamic>)
            DashNeed(
              kind: n['kind'] as String? ?? '',
              booking: DashRow.fromJson(n['booking'] as Map<String, dynamic>),
            ),
      ],
      nights: [
        for (final n in (j['nights'] as List?) ?? const [])
          if (n is Map<String, dynamic>)
            (
              date: n['date'] as String? ?? '',
              booked: (n['booked'] as num?)?.toInt() ?? 0,
            ),
      ],
      unitCounts: {
        for (final e in counts.entries)
          if (e.value is num) e.key: (e.value as num).toInt(),
      },
      balances: rows(j['balances']),
    );
  }
}

// ── Wording ───────────────────────────────────────────────────────────────────

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const _monthsLong = [
  'January', 'February', 'March', 'April', 'May', 'June', //
  'July', 'August', 'September', 'October', 'November', 'December',
];
const _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _daysLong = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday', //
];

DateTime _date(String iso) {
  final p = iso.split('-').map(int.parse).toList();
  return DateTime.utc(p[0], p[1], p[2]);
}

String greeting(int hour) => hour < 12
    ? 'Good morning'
    : hour < 17
    ? 'Good afternoon'
    : 'Good evening';

/// 2026-11-21 → "Saturday, 21 November".
String longDate(String iso) {
  final d = _date(iso);
  return '${_daysLong[d.weekday - 1]}, ${d.day} ${_monthsLong[d.month - 1]}';
}

/// 2026-11-21 → "Sat".
String weekday(String iso) => _days[_date(iso).weekday - 1];

/// 2026-11-21 → "Sat 21".
String shortDay(String iso) => '${weekday(iso)} ${_date(iso).day}';

String monthShort(String iso) => _months[_date(iso).month - 1];

/// "21 → 23 Nov", or "28 Nov → 2 Dec" across months.
String stayRange(String checkIn, String checkOut) {
  final a = _date(checkIn);
  final b = _date(checkOut);
  return a.month == b.month && a.year == b.year
      ? '${a.day} → ${b.day} ${_months[b.month - 1]}'
      : '${a.day} ${_months[a.month - 1]} → ${b.day} ${_months[b.month - 1]}';
}

String plural(int n, String one, [String? many]) =>
    '$n ${n == 1 ? one : (many ?? '${one}s')}';

/// The date tile beside a row: (big text, small text, tone: arrive | late | plain).
({String top, String bottom, String tone}) rowChip(DashRow r) =>
    switch (r.stage) {
      'ARRIVES_TODAY' => (top: 'Today', bottom: 'check-in', tone: 'arrive'),
      'LEAVES_TODAY' => (top: 'Today', bottom: 'check-out', tone: 'plain'),
      'OVERDUE' => (
        top: '${_date(r.checkOut).day}',
        bottom: '${monthShort(r.checkOut)}, late',
        tone: 'late',
      ),
      _ => (
        top: '${_date(r.checkOut).day}',
        bottom: monthShort(r.checkOut),
        tone: 'plain',
      ),
    };

/// (label, tone: ok | due | warn | bad), or null when there's nothing to say.
({String label, String tone})? payPill(DashRow r) {
  final owed = r.owedCents;
  if (owed == null) return null;
  if (owed > 0) return (label: '${formatKes(owed)} due', tone: 'due');
  return (
    label: r.stage == 'ARRIVES_TODAY' || r.stage == 'UPCOMING'
        ? 'Paid'
        : 'Settled',
    tone: 'ok',
  );
}

({String label, String tone})? readyPill(DashRow r) {
  if (r.stage == 'OVERDUE') return (label: 'Overdue', tone: 'bad');
  if (r.unitReady == true) return (label: 'Ready', tone: 'ok');
  if (r.unitReady == false) return (label: 'Not cleaned', tone: 'warn');
  return null;
}

/// What a "Needs you" card says and offers.
/// action: check-out | no-show | open-booking | open-cleaning
({String tone, String title, String detail, String action, String label})
needView(DashNeed n) {
  final r = n.booking;
  final guest = r.guestName ?? 'The guest';
  switch (n.kind) {
    case 'OVERDUE_CHECKOUT':
      return (
        tone: 'red',
        title: 'Check-out overdue',
        detail:
            'Unit ${r.unitNumber} was due out ${shortDay(r.checkOut)} ${monthShort(r.checkOut)}. '
            '$guest is still checked in.',
        action: 'check-out',
        label: 'Check out',
      );
    case 'UNIT_NOT_READY':
      return (
        tone: 'amber',
        title: 'Clean ${r.unitNumber} before arrival',
        detail: '$guest arrives today and the unit is not ready.',
        action: 'open-cleaning',
        label: 'Open cleaning',
      );
    case 'REQUEST':
      final money = r.totalCents != null ? ', ${formatKes(r.totalCents!)}' : '';
      return (
        tone: 'blue',
        title: 'New booking request',
        detail:
            '$guest, ${stayRange(r.checkIn, r.checkOut)}, ${r.unitTitle}$money.',
        action: 'open-booking',
        label: 'Review',
      );
    default:
      return (
        tone: 'amber',
        title: 'Guest never arrived',
        detail:
            '${r.code}, ${r.unitTitle}, ${stayRange(r.checkIn, r.checkOut)}. Still marked confirmed.',
        action: 'no-show',
        label: 'Mark no-show',
      );
  }
}

/// The line under the 7-night chart.
String nightsSummary(List<({String date, int booked})> nights, int units) {
  var max = 0;
  for (final n in nights) {
    if (n.booked > max) max = n.booked;
  }
  if (max == 0) {
    return 'No units booked in the next ${plural(nights.length, 'night')}.';
  }
  final busiest = [
    for (final n in nights)
      if (n.booked == max) weekday(n.date),
  ];
  final days = busiest.length <= 2
      ? busiest.join(' and ')
      : '${busiest.take(2).join(', ')} and ${busiest.length - 2} more';
  return busiest.length == 1
      ? 'Units booked of $units. $days is your busiest night.'
      : 'Units booked of $units. $days are your busiest nights.';
}
