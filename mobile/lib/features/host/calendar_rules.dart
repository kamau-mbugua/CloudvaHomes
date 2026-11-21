import '../../core/money.dart';
import 'host_dashboard.dart' show longDate, plural, shortDay;

/// A unit on the host calendar (`GET /host/bookings/calendar` → `units`).
class CalUnit {
  const CalUnit({
    required this.id,
    required this.number,
    required this.title,
    required this.listingId,
    required this.propertyId,
    required this.propertyName,
    this.nightlyPriceCents,
  });

  final String id;
  final String number;
  final String title;
  final String? listingId;
  final String propertyId;
  final String propertyName;

  /// Only sent to callers who can see money.
  final int? nightlyPriceCents;

  factory CalUnit.fromJson(Map<String, dynamic> j) {
    final property = j['property'] as Map<String, dynamic>? ?? const {};
    final number = (j['unitNumber'] as String?) ?? '';
    final price = j['nightlyPrice'];
    return CalUnit(
      id: (j['unitId'] as String?) ?? '',
      number: number,
      title: (j['title'] as String?) ?? number,
      listingId: j['listingId'] as String?,
      propertyId: (property['id'] as String?) ?? '',
      propertyName: (property['name'] as String?) ?? '',
      nightlyPriceCents: price is String ? int.tryParse(price) : null,
    );
  }
}

class CalItem {
  const CalItem({
    required this.kind,
    required this.id,
    required this.unitId,
    required this.from,
    required this.to,
    this.status,
    this.guestName,
    this.code,
    this.reason,
    this.listingId,
    this.totalCents,
    this.paidCents,
    this.owedCents,
  });

  final String kind; // BOOKING | BLOCK
  final String id;
  final String unitId;

  /// Check-in day; the first night.
  final String from;

  /// Check-out day; the night before it is the last one.
  final String to;
  final String? status;
  final String? guestName;
  final String? code;
  final String? reason;
  final String? listingId;

  /// Money is only sent to callers who can see it.
  final int? totalCents;
  final int? paidCents;
  final int? owedCents;

  /// Parses an item from `GET /host/bookings/calendar`. The API sends `kind` as
  /// `STAY | BLOCK`, dates as `checkIn`/`checkOut` and the block note as `hostNote`.
  factory CalItem.fromJson(Map<String, dynamic> j) {
    int? cents(Object? v) => v is String ? int.tryParse(v) : null;
    return CalItem(
      kind: j['kind'] == 'BLOCK' ? 'BLOCK' : 'BOOKING',
      id: (j['id'] as String?) ?? '',
      unitId: (j['unitId'] as String?) ?? '',
      from: (j['checkIn'] as String?) ?? '',
      to: (j['checkOut'] as String?) ?? '',
      status: j['status'] as String?,
      guestName: j['guestName'] as String?,
      code: j['code'] as String?,
      reason: j['hostNote'] as String?,
      listingId: j['listingId'] as String?,
      totalCents: cents(j['total']),
      paidCents: cents(j['paid']),
      owedCents: cents(j['owed']),
    );
  }
}

/// The whole calendar response.
class CalData {
  const CalData({required this.units, required this.items});

  final List<CalUnit> units;
  final List<CalItem> items;

  List<CalItem> itemsFor(String unitId) => [
    for (final it in items)
      if (it.unitId == unitId && !_inactive.contains(it.status)) it,
  ];

  /// Units grouped by property, in the order the API sent them.
  List<({String name, List<CalUnit> units})> groups([
    bool Function(CalUnit u)? keep,
  ]) {
    final out = <String, ({String name, List<CalUnit> units})>{};
    for (final u in units) {
      if (keep != null && !keep(u)) continue;
      out
          .putIfAbsent(
            u.propertyId,
            () => (name: u.propertyName, units: <CalUnit>[]),
          )
          .units
          .add(u);
    }
    return out.values.toList();
  }
}

const _inactive = {'CANCELLED', 'EXPIRED', 'NO_SHOW', 'DECLINED'};

const _months = [
  'January', 'February', 'March', 'April', 'May', 'June', //
  'July', 'August', 'September', 'October', 'November', 'December',
];

DateTime _d(String iso) {
  final p = iso.split('-').map(int.parse).toList();
  return DateTime.utc(p[0], p[1], p[2]);
}

String _iso(DateTime d) => d.toIso8601String().substring(0, 10);

/// 2026-11-21 + 3 → 2026-11-24.
String addDays(String iso, int days) => _iso(_d(iso).add(Duration(days: days)));

String _dayMonth(String iso) {
  final d = _d(iso);
  return '${d.day} ${_months[d.month - 1].substring(0, 3)}';
}

/// A checked-in guest still in the unit after their check-out day.
bool isOverdue(CalItem it, String today) =>
    it.kind == 'BOOKING' &&
    it.status == 'CHECKED_IN' &&
    it.to.compareTo(today) < 0;

/// The last night an item takes: the night before check-out, or tonight for an overdue guest.
String lastNight(CalItem it, String today) =>
    isOverdue(it, today) ? today : addDays(it.to, -1);

/// Whether the item takes the night of [date].
bool takesNight(CalItem it, String date, String today) =>
    it.from.compareTo(date) <= 0 && date.compareTo(lastNight(it, today)) <= 0;

/// How a bar is drawn: checked in (navy), confirmed (lime), request (dashed), blocked (grey),
/// overdue (red), past (completed stays, slate).
enum SpanKind { checkedIn, confirmed, request, blocked, overdue, past }

SpanKind spanKind(CalItem it, String today) {
  if (it.kind == 'BLOCK') return SpanKind.blocked;
  if (isOverdue(it, today)) return SpanKind.overdue;
  return switch (it.status) {
    'CHECKED_IN' => SpanKind.checkedIn,
    'COMPLETED' => SpanKind.past,
    'REQUESTED' || 'HELD' => SpanKind.request,
    _ => SpanKind.confirmed,
  };
}

/// "David Kimani" → "David K.".
String shortName(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.length < 2) return name.trim();
  return '${parts.first} ${parts.last[0]}.';
}

class CalSpan {
  const CalSpan({
    required this.start,
    required this.end,
    required this.kind,
    required this.label,
    required this.due,
    required this.openLeft,
    required this.openRight,
    required this.item,
  });

  /// Columns in the row, 0-based and inclusive.
  final int start;
  final int end;
  final SpanKind kind;
  final String label;

  /// The guest still owes money on this stay.
  final bool due;

  /// The stay carries on before / after the visible row.
  final bool openLeft;
  final bool openRight;
  final CalItem item;
}

/// The bars for one unit across a row of consecutive [days] (a week).
List<CalSpan> rowSpans(List<String> days, List<CalItem> items, String today) {
  if (days.isEmpty) return const [];
  final first = days.first;
  final last = days.last;
  final out = <CalSpan>[];
  for (final it in items) {
    if (_inactive.contains(it.status)) continue;
    final end = lastNight(it, today);
    if (end.compareTo(first) < 0 || it.from.compareTo(last) > 0) continue;
    final s = it.from.compareTo(first) < 0 ? first : it.from;
    final e = end.compareTo(last) > 0 ? last : end;
    final startCol = days.indexOf(s);
    final endCol = days.indexOf(e);
    if (startCol < 0 || endCol < startCol) continue;
    final kind = spanKind(it, today);
    final guest = it.guestName ?? 'Guest';
    final label = switch (kind) {
      SpanKind.blocked =>
        (it.reason?.trim().isNotEmpty ?? false) ? it.reason!.trim() : 'Blocked',
      SpanKind.overdue => 'Late',
      SpanKind.request when it.status == 'REQUESTED' => 'Request',
      _ => endCol - startCol < 2 ? shortName(guest) : guest,
    };
    out.add(
      CalSpan(
        start: startCol,
        end: endCol,
        kind: kind,
        label: label,
        due: (it.owedCents ?? 0) > 0 && kind != SpanKind.request,
        openLeft: it.from.compareTo(first) < 0,
        openRight: end.compareTo(last) > 0,
        item: it,
      ),
    );
  }
  out.sort((a, b) => a.start.compareTo(b.start));
  return out;
}

/// Nobody is in the unit tonight and it isn't blocked.
bool freeTonight(List<CalItem> items, String today) => !items.any(
  (it) => !_inactive.contains(it.status) && takesNight(it, today, today),
);

/// A confirmed (or held) guest is due to arrive today.
bool arrivingToday(List<CalItem> items, String today) => items.any(
  (it) =>
      it.kind == 'BOOKING' &&
      (it.status == 'CONFIRMED' || it.status == 'HELD') &&
      it.from == today,
);

/// The line under a unit in "Choose a unit". tone: free | busy | late | block.
({String text, String tone}) unitLine(List<CalItem> items, String today) {
  final live = [
    for (final it in items)
      if (!_inactive.contains(it.status) && it.status != 'COMPLETED') it,
  ]..sort((a, b) => a.from.compareTo(b.from));
  for (final it in live) {
    if (isOverdue(it, today)) {
      return (
        text: 'Check-out overdue since ${_dayMonth(it.to)}',
        tone: 'late',
      );
    }
  }
  for (final it in live) {
    if (it.kind == 'BOOKING' &&
        it.from == today &&
        (it.status == 'CONFIRMED' || it.status == 'HELD')) {
      return (text: '${it.guestName ?? 'A guest'} arrives today', tone: 'busy');
    }
  }
  for (final it in live) {
    if (!takesNight(it, today, today)) continue;
    if (it.kind == 'BLOCK') {
      return (text: 'Blocked until ${_dayMonth(it.to)}', tone: 'block');
    }
    if (it.status == 'REQUESTED') continue;
    return (
      text: '${it.guestName ?? 'A guest'} until ${_dayMonth(it.to)}',
      tone: 'busy',
    );
  }
  final next = [
    for (final it in live)
      if (it.from.compareTo(today) > 0) it,
  ];
  if (next.isEmpty) {
    return (text: 'Free tonight · nothing booked', tone: 'free');
  }
  final n = next.first;
  final what = n.kind == 'BLOCK'
      ? 'blocked from'
      : n.status == 'REQUESTED'
      ? 'request for'
      : 'next booking';
  return (text: 'Free tonight · $what ${_dayMonth(n.from)}', tone: 'free');
}

/// "21 to 27 November", or "28 November to 4 December" across months.
String weekTitle(String start) {
  final a = _d(start);
  final b = _d(addDays(start, 6));
  if (a.month == b.month) return '${a.day} to ${b.day} ${_months[b.month - 1]}';
  final yearB = a.year == b.year ? '' : ' ${b.year}';
  return '${a.day} ${_months[a.month - 1]} to ${b.day} ${_months[b.month - 1]}$yearB';
}

/// "2026-11" → "November 2026".
String monthTitle(String month) {
  final d = _d('$month-01');
  return '${_months[d.month - 1]} ${d.year}';
}

/// "2026-11" + 1 → "2026-12".
String shiftMonth(String month, int delta) {
  final d = _d('$month-01');
  final m = DateTime.utc(d.year, d.month + delta, 1);
  return _iso(m).substring(0, 7);
}

/// The weeks shown for a month, Monday first, each 7 ISO dates (days outside the month included).
List<List<String>> monthWeeks(String month) {
  final first = _d('$month-01');
  final start = first.subtract(Duration(days: first.weekday - 1));
  final next = DateTime.utc(first.year, first.month + 1, 1);
  final weeks = <List<String>>[];
  var day = start;
  while (day.isBefore(next)) {
    weeks.add([for (var i = 0; i < 7; i++) _iso(day.add(Duration(days: i)))]);
    day = day.add(const Duration(days: 7));
  }
  return weeks;
}

/// Booked and blocked nights of one unit in a month, and its occupancy (0..1) — the same rule as
/// Reports: confirmed, checked-in and completed stays count; blocked nights aren't available.
({int booked, int days, double occupancy}) monthStats(
  String month,
  List<CalItem> items,
  String today,
) {
  final first = _d('$month-01');
  final days = DateTime.utc(first.year, first.month + 1, 0).day;
  var booked = 0;
  var blocked = 0;
  for (var i = 0; i < days; i++) {
    final night = _iso(first.add(Duration(days: i)));
    for (final it in items) {
      if (_inactive.contains(it.status)) continue;
      if (!(it.from.compareTo(night) <= 0 && night.compareTo(it.to) < 0)) {
        continue;
      }
      if (it.kind == 'BLOCK') {
        blocked++;
        break;
      }
      if (const {'CONFIRMED', 'CHECKED_IN', 'COMPLETED'}.contains(it.status)) {
        booked++;
        break;
      }
    }
  }
  final available = days - blocked;
  return (
    booked: booked,
    days: days,
    occupancy: available <= 0 ? 0 : booked / available,
  );
}

enum DayAction {
  newBooking,
  block,
  unblock,
  openBooking,
  checkIn,
  checkOut,
  mpesa,
}

class DayInfo {
  const DayInfo({
    required this.title,
    required this.pill,
    required this.tone,
    required this.text,
    required this.actions,
    this.item,
  });

  final String title;
  final String pill;

  /// ok | plain | grey | bad | info
  final String tone;
  final String text;
  final List<DayAction> actions;
  final CalItem? item;
}

/// What the card under the month says about [date] for one unit, and what it offers.
DayInfo dayInfo(String date, List<CalItem> items, CalUnit unit, String today) {
  final title = longDate(date);
  final past = date.compareTo(today) < 0;
  CalItem? hit;
  for (final it in items) {
    if (!_inactive.contains(it.status) && takesNight(it, date, today)) {
      hit = it;
      break;
    }
  }

  if (hit == null) {
    final rate = unit.nightlyPriceCents;
    return DayInfo(
      title: title,
      pill: 'Free night',
      tone: 'ok',
      text: past
          ? 'Nothing was booked for this night.'
          : 'Nothing is booked for this night.'
                '${rate != null && rate > 0 ? ' Nightly rate ${formatKes(rate)}.' : ''}',
      actions: past ? const [] : const [DayAction.newBooking, DayAction.block],
    );
  }

  final it = hit;
  if (it.kind == 'BLOCK') {
    final why = it.reason?.trim();
    return DayInfo(
      title: title,
      pill: 'Blocked',
      tone: 'grey',
      text:
          'Blocked by you${why != null && why.isNotEmpty ? ': $why' : ''}, '
          '${_dayMonth(it.from)} to ${_dayMonth(it.to)}. Guests cannot book these nights.',
      actions: const [DayAction.unblock],
      item: it,
    );
  }

  final guest = it.guestName ?? 'The guest';
  final nights = _d(it.to).difference(_d(it.from)).inDays;
  final owed = it.owedCents;
  final total = it.totalCents;
  String money() {
    if (owed == null || total == null) return '';
    if (owed > 0) {
      return ' ${formatKes(owed)} of ${formatKes(total)} still due.';
    }
    return total > 0 ? ' Paid in full.' : '';
  }

  final canPrompt = (owed ?? 0) > 0;
  final code = it.code ?? '';
  switch (spanKind(it, today)) {
    case SpanKind.past:
      final paid = it.paidCents;
      return DayInfo(
        title: title,
        pill: '$code · completed',
        tone: 'plain',
        text:
            '$guest stayed ${plural(nights, 'night')}, ${_dayMonth(it.from)} to ${_dayMonth(it.to)}.'
            '${paid != null && paid > 0 ? ' Paid ${formatKes(paid)}.' : ''}'
            '${(owed ?? 0) > 0 ? ' ${formatKes(owed!)} never paid.' : ''}',
        actions: const [DayAction.openBooking],
        item: it,
      );
    case SpanKind.overdue:
      return DayInfo(
        title: title,
        pill: '$code · overdue',
        tone: 'bad',
        text:
            '$guest was due out ${shortDay(it.to)} and is still checked in.${money()}',
        actions: [
          DayAction.checkOut,
          if (canPrompt) DayAction.mpesa,
          DayAction.openBooking,
        ],
        item: it,
      );
    case SpanKind.checkedIn:
      return DayInfo(
        title: title,
        pill: '$code · checked in',
        tone: 'plain',
        text: it.to == today
            ? '$guest checks out today after ${plural(nights, 'night')}.${money()}'
            : '$guest is staying ${plural(nights, 'night')}, leaving ${shortDay(it.to)}.${money()}',
        actions: [
          if (it.to == today) DayAction.checkOut,
          if (canPrompt) DayAction.mpesa,
          DayAction.openBooking,
        ],
        item: it,
      );
    case SpanKind.request:
      return DayInfo(
        title: title,
        pill: it.status == 'HELD' ? '$code · held' : '$code · request',
        tone: 'info',
        text: it.status == 'HELD'
            ? '$guest is holding ${plural(nights, 'night')}, ${_dayMonth(it.from)} to ${_dayMonth(it.to)}, until they pay.'
            : 'Booking request from $guest for ${plural(nights, 'night')}, ${_dayMonth(it.from)} to ${_dayMonth(it.to)}.',
        actions: const [DayAction.openBooking],
        item: it,
      );
    case SpanKind.confirmed:
    case SpanKind.blocked:
      final arrival = it.from == today
          ? '$guest arrives today for ${plural(nights, 'night')}, leaving ${shortDay(it.to)}.'
          : it.from.compareTo(today) < 0
          ? '$guest was due to arrive ${shortDay(it.from)} and has not checked in.'
          : '$guest arrives ${shortDay(it.from)} for ${plural(nights, 'night')}, leaving ${shortDay(it.to)}.';
      return DayInfo(
        title: title,
        pill: '$code · confirmed',
        tone: 'ok',
        text: '$arrival${money()}',
        actions: [
          if (canCheckIn('CONFIRMED', it.from, it.to, today)) DayAction.checkIn,
          if (canPrompt) DayAction.mpesa,
          DayAction.openBooking,
        ],
        item: it,
      );
  }
}

/// Closed bookings: nothing more happens on them except refunds, and no reminders go out.
bool isClosedBooking(String status) =>
    const {'NO_SHOW', 'CANCELLED', 'EXPIRED', 'DECLINED'}.contains(status);

/// A guest can be checked in only on a night of their stay: from the check-in day until the
/// day before check-out (dates are "YYYY-MM-DD").
bool canCheckIn(String status, String checkIn, String checkOut, String today) =>
    status == 'CONFIRMED' &&
    checkIn.compareTo(today) <= 0 &&
    today.compareTo(checkOut) < 0;

/// A guest can only fail to arrive once their stay has started (dates are "YYYY-MM-DD").
bool canMarkNoShow(String status, String checkIn, String today) =>
    status == 'CONFIRMED' && checkIn.compareTo(today) <= 0;

/// The last money row on a booking: an unpaid no-show shows what was never collected;
/// other closed bookings owe nothing.
({String label, int cents}) balanceRow(String status, int owedCents) {
  if (status == 'NO_SHOW' && owedCents > 0) {
    return (label: 'Not collected', cents: owedCents);
  }
  if (isClosedBooking(status)) return (label: 'Balance owed', cents: 0);
  return (label: 'Balance owed', cents: owedCents);
}

/// How many of the [days] nights from [from] a unit is booked (confirmed, checked in or
/// finished stays; requests, holds and blocks don't count).
int bookedNights(List<CalItem> items, String from, int days, String today) {
  var n = 0;
  for (var i = 0; i < days; i++) {
    final night = addDays(from, i);
    if (items.any(
      (it) =>
          it.kind == 'BOOKING' &&
          const {'CONFIRMED', 'CHECKED_IN', 'COMPLETED'}.contains(it.status) &&
          takesNight(it, night, today),
    )) {
      n++;
    }
  }
  return n;
}
