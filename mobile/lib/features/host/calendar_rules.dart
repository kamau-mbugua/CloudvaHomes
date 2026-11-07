enum DayStatus { free, booked, blocked, checkIn, checkOut, turnover }

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
  });

  final String kind; // BOOKING | BLOCK
  final String id;
  final String unitId;
  final String from;
  final String to;
  final String? status;
  final String? guestName;
  final String? code;
  final String? reason;

  factory CalItem.fromJson(Map<String, dynamic> j) => CalItem(
    kind: (j['kind'] as String?) ?? 'BOOKING',
    id: (j['id'] as String?) ?? '',
    unitId: (j['unitId'] as String?) ?? '',
    from: (j['from'] as String?) ?? '',
    to: (j['to'] as String?) ?? '',
    status: j['status'] as String?,
    guestName: j['guestName'] as String?,
    code: j['code'] as String?,
    reason: j['reason'] as String?,
  );
}

class DayState {
  const DayState({required this.date, required this.status, this.item});

  final String date;
  final DayStatus status;
  final CalItem? item;
}

const _inactiveStatuses = {'CANCELLED', 'EXPIRED', 'NO_SHOW'};

/// Computes the day-by-day status for a given `YYYY-MM` month and unit's calendar items.
List<DayState> monthDays(String month, List<CalItem> items) {
  final parts = month.split('-');
  final year = int.parse(parts[0]);
  final m = int.parse(parts[1]);
  final daysInMonth = DateTime.utc(year, m + 1, 0).day;

  final bookings = [
    for (final it in items)
      if (it.kind == 'BOOKING' && !_inactiveStatuses.contains(it.status)) it,
  ];
  final blocks = [
    for (final it in items)
      if (it.kind == 'BLOCK') it,
  ];

  final out = <DayState>[];
  for (var day = 1; day <= daysInMonth; day++) {
    final date =
        '${year.toString().padLeft(4, '0')}-${m.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';

    CalItem? blockItem;
    for (final bl in blocks) {
      if (bl.from.compareTo(date) <= 0 && date.compareTo(bl.to) < 0) {
        blockItem = bl;
        break;
      }
    }
    if (blockItem != null) {
      out.add(DayState(date: date, status: DayStatus.blocked, item: blockItem));
      continue;
    }

    CalItem? checkInItem;
    CalItem? checkOutItem;
    CalItem? interiorItem;
    for (final b in bookings) {
      if (b.from == date) checkInItem = b;
      if (b.to == date) checkOutItem = b;
      if (b.from.compareTo(date) < 0 && date.compareTo(b.to) < 0) {
        interiorItem = b;
      }
    }

    if (checkInItem != null && checkOutItem != null) {
      out.add(
        DayState(date: date, status: DayStatus.turnover, item: checkInItem),
      );
    } else if (interiorItem != null) {
      out.add(
        DayState(date: date, status: DayStatus.booked, item: interiorItem),
      );
    } else if (checkInItem != null) {
      out.add(
        DayState(date: date, status: DayStatus.checkIn, item: checkInItem),
      );
    } else if (checkOutItem != null) {
      out.add(
        DayState(date: date, status: DayStatus.checkOut, item: checkOutItem),
      );
    } else {
      out.add(DayState(date: date, status: DayStatus.free));
    }
  }
  return out;
}
