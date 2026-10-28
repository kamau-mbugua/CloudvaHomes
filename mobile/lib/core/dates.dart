import 'package:intl/intl.dart';

/// The API's dates are `YYYY-MM-DD` (Nairobi calendar days) and timestamps are ISO-8601.
DateTime? parseDay(String? s) => s == null ? null : DateTime.tryParse(s);

/// "2026-10-28" → "28 Oct 2026".
String formatDay(String? day) {
  final d = parseDay(day);
  return d == null ? '—' : DateFormat('d MMM yyyy').format(d);
}

/// ISO timestamp → "28 Oct 2026, 14:05" in the device's time zone.
String formatTimestamp(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso)?.toLocal();
  return d == null ? '—' : DateFormat('d MMM yyyy, HH:mm').format(d);
}

/// "2026-10" → "Oct 2026".
String formatPeriod(String? period) {
  final d = period == null ? null : DateTime.tryParse('$period-01');
  return d == null ? '—' : DateFormat('MMM yyyy').format(d);
}

/// DateTime → "2026-10-28".
String toDay(DateTime d) => DateFormat('yyyy-MM-dd').format(d);
